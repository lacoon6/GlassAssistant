import { DiscordChannel } from '../models/channel'
import { DiscordMessage } from '../models/message'
import { DiscordServer } from '../models/server'
import { BackendClient, BackendUnauthorizedError } from './backend'

export interface DiscordRepository {
  getServers(): Promise<ServerRepositoryResult>
  getChannels(guildId: string): Promise<ChannelRepositoryResult>
  getMessages(channelId: string): Promise<readonly DiscordMessage[]>
  login(): Promise<void>
  logout(): Promise<void>
  isBackendConfigured(): boolean
  isLoggedIn(): boolean
}

export type ServerRepositoryResult =
  | { readonly status: 'fresh'; readonly servers: readonly DiscordServer[] }
  | { readonly status: 'cached'; readonly servers: readonly DiscordServer[] }
  | { readonly status: 'offline'; readonly servers: readonly DiscordServer[] }
  | { readonly status: 'error'; readonly servers: readonly DiscordServer[] }

export type ChannelRepositoryResult =
  | { readonly status: 'fresh'; readonly channels: readonly DiscordChannel[] }
  | { readonly status: 'cached'; readonly channels: readonly DiscordChannel[] }
  | { readonly status: 'offline'; readonly channels: readonly DiscordChannel[] }
  | { readonly status: 'error'; readonly channels: readonly DiscordChannel[] }

export class DummyDiscordRepository implements DiscordRepository {
  private loggedIn = true

  public getServers(): Promise<ServerRepositoryResult> {
    return Promise.resolve({
      status: 'fresh',
      servers: [
        new DiscordServer('yuna', 'Yuna', 2),
        new DiscordServer('even', 'Even', 1),
        new DiscordServer('openai', 'OpenAI', 0),
      ],
    })
  }

  public getChannels(guildId: string): Promise<ChannelRepositoryResult> {
    return Promise.resolve({
      status: 'fresh',
      channels: [
        new DiscordChannel('general', guildId, 'general', 3),
        new DiscordChannel('glasses', guildId, 'glasses', 1),
        new DiscordChannel('api', guildId, 'api', 0),
      ],
    })
  }

  public getMessages(channelId: string): Promise<readonly DiscordMessage[]> {
    return Promise.resolve([
      new DiscordMessage('welcome', channelId, 'Glass Assistant', 'Discord is ready for a future connection.'),
    ])
  }

  public login(): Promise<void> {
    this.loggedIn = true
    return Promise.resolve()
  }

  public logout(): Promise<void> {
    this.loggedIn = false
    return Promise.resolve()
  }

  public isLoggedIn(): boolean {
    return this.loggedIn
  }

  public isBackendConfigured(): boolean {
    return true
  }
}

export class BackendDiscordRepository implements DiscordRepository {
  private static readonly serverCacheKey = 'glass-assistant.discord-servers'
  private static readonly channelCachePrefix = 'glass-assistant.discord-channels.'
  private loggedIn = false

  public constructor(
    private readonly backend = new BackendClient(import.meta.env.VITE_API_URL ?? ''),
  ) {}

  public async getServers(): Promise<ServerRepositoryResult> {
    try {
      const guilds = await this.backend.Servers()
      const servers = guilds.map(guild => new DiscordServer(guild.id, guild.name, guild.unreadCount ?? 0))
      this.loggedIn = true
      window.localStorage.setItem(BackendDiscordRepository.serverCacheKey, JSON.stringify(servers))
      return { status: 'fresh', servers }
    } catch (error) {
      if (error instanceof BackendUnauthorizedError) {
        this.loggedIn = false
        return { status: 'error', servers: [] }
      }
      return this.cachedOr(navigator.onLine ? 'error' : 'offline')
    }
  }

  public async getChannels(guildId: string): Promise<ChannelRepositoryResult> {
    try {
      const values = await this.backend.Channels(guildId)
      const channels = this.sortChannels(
        values.flatMap(value => {
          const kind = this.getChannelKind(value.type)
          if (!kind || !value.name) return []
          return [
            new DiscordChannel(
              value.id,
              guildId,
              value.name,
              value.unreadCount ?? 0,
              kind,
              value.parentId ?? null,
              value.position ?? 0,
              kind === 'thread',
            ),
          ]
        }),
      )
      this.loggedIn = true
      window.localStorage.setItem(this.channelCacheKey(guildId), JSON.stringify(channels))
      return { status: 'fresh', channels }
    } catch (error) {
      if (error instanceof BackendUnauthorizedError) {
        this.loggedIn = false
        return { status: 'error', channels: [] }
      }
      return this.cachedChannelsOr(guildId, navigator.onLine ? 'error' : 'offline')
    }
  }

  public async getMessages(channelId: string): Promise<readonly DiscordMessage[]> {
    const messages = await this.backend.Messages(channelId)
    this.loggedIn = true
    return messages.map(message => new DiscordMessage(message.id, message.channelId, message.author, message.content))
  }

  public login(): Promise<void> {
    this.backend.Login()
    return Promise.resolve()
  }

  public async logout(): Promise<void> {
    await this.backend.Logout()
    this.loggedIn = false
  }

  public isLoggedIn(): boolean {
    return this.loggedIn
  }

  public isBackendConfigured(): boolean {
    return this.backend.IsConfigured()
  }

  private cachedOr(status: 'offline' | 'error'): ServerRepositoryResult {
    const cached = window.localStorage.getItem(BackendDiscordRepository.serverCacheKey)
    if (!cached) return { status, servers: [] }

    try {
      const values = JSON.parse(cached) as Array<{ id?: unknown; name?: unknown; unreadCount?: unknown }>
      const servers = values
        .filter(value => typeof value.id === 'string' && typeof value.name === 'string')
        .map(value => new DiscordServer(value.id as string, value.name as string, Number(value.unreadCount) || 0))
      return servers.length > 0 ? { status: 'cached', servers } : { status, servers: [] }
    } catch {
      return { status, servers: [] }
    }
  }

  private cachedChannelsOr(guildId: string, status: 'offline' | 'error'): ChannelRepositoryResult {
    const cached = window.localStorage.getItem(this.channelCacheKey(guildId))
    if (!cached) return { status, channels: [] }

    try {
      const values = JSON.parse(cached) as DiscordChannel[]
      const channels = values.map(
        value =>
          new DiscordChannel(
            value.id,
            guildId,
            value.name,
            value.unreadCount,
            value.kind,
            value.parentId,
            value.position,
            value.readOnly,
          ),
      )
      return channels.length > 0 ? { status: 'cached', channels } : { status, channels: [] }
    } catch {
      return { status, channels: [] }
    }
  }

  private getChannelKind(type: number): DiscordChannel['kind'] | null {
    if (type === 4) return 'category'
    if (type === 0) return 'text'
    if (type === 5) return 'announcement'
    if (type === 10 || type === 11 || type === 12) return 'thread'
    return null
  }

  private sortChannels(channels: readonly DiscordChannel[]): readonly DiscordChannel[] {
    const categories = channels.filter(channel => channel.kind === 'category').sort(this.compareChannels)
    const threads = channels.filter(channel => channel.kind === 'thread')
    const textChannels = channels.filter(channel => channel.kind === 'text' || channel.kind === 'announcement')
    const withThreads = (items: readonly DiscordChannel[]): DiscordChannel[] =>
      items.flatMap(channel => [
        channel,
        ...threads.filter(thread => thread.parentId === channel.id).sort(this.compareChannels),
      ])
    const grouped = categories.flatMap(category => [
      category,
      ...withThreads(textChannels.filter(channel => channel.parentId === category.id).sort(this.compareChannels)),
    ])
    const uncategorized = textChannels
      .filter(channel => !categories.some(category => category.id === channel.parentId))
      .sort(this.compareChannels)
    const knownIds = new Set([...categories, ...textChannels].map(channel => channel.id))
    const orphanedThreads = threads.filter(thread => !knownIds.has(thread.parentId ?? ''))
    return [...grouped, ...withThreads(uncategorized), ...orphanedThreads.sort(this.compareChannels)]
  }

  private readonly compareChannels = (left: DiscordChannel, right: DiscordChannel): number => {
    if (left.position !== right.position) return left.position - right.position
    return BigInt(left.id) < BigInt(right.id) ? -1 : BigInt(left.id) > BigInt(right.id) ? 1 : 0
  }

  private channelCacheKey(guildId: string): string {
    return `${BackendDiscordRepository.channelCachePrefix}${guildId}`
  }
}
