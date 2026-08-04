const apiBaseUrl = 'https://discord.com/api/v10'

interface DiscordGuild {
  readonly id: string
  readonly name: string
}

interface DiscordChannel {
  readonly id: string
  readonly guild_id?: string
  readonly name?: string | null
  readonly type: number
  readonly parent_id?: string | null
  readonly position?: number
}

interface DiscordMessage {
  readonly id: string
  readonly channel_id: string
  readonly content: string
  readonly author: {
    readonly global_name?: string | null
    readonly username: string
  }
}

export class DiscordApiService {
  public constructor(private readonly botToken: string) {}

  public async getServers(accessToken: string): Promise<unknown> {
    const guilds = await this.getUserGuilds(accessToken)
    return guilds.map(guild => ({ id: guild.id, name: guild.name, unreadCount: 0 }))
  }

  public async getChannels(accessToken: string, guildId: string): Promise<unknown> {
    await this.requireGuildMembership(accessToken, guildId)
    const channels = await this.getWithBot<DiscordChannel[]>(
      `/guilds/${encodeURIComponent(guildId)}/channels`,
      'guildChannels',
    )
    return channels.map(channel => ({
      id: channel.id,
      guildId: channel.guild_id ?? guildId,
      name: channel.name ?? '',
      type: channel.type,
      parentId: channel.parent_id ?? null,
      position: channel.position ?? 0,
      unreadCount: 0,
    }))
  }

  public async getMessages(accessToken: string, channelId: string): Promise<unknown> {
    const channel = await this.getWithBot<DiscordChannel>(
      `/channels/${encodeURIComponent(channelId)}`,
      'channel',
    )
    if (!channel.guild_id) throw new DiscordApiError(403, 'GUILD_CHANNEL_REQUIRED')
    await this.requireGuildMembership(accessToken, channel.guild_id)
    const messages = await this.getWithBot<DiscordMessage[]>(
      `/channels/${encodeURIComponent(channelId)}/messages?limit=50`,
      'messages',
    )
    return messages.map(message => ({
      id: message.id,
      channelId: message.channel_id,
      author: message.author.global_name ?? message.author.username,
      content: message.content,
    }))
  }

  private async getUserGuilds(accessToken: string): Promise<DiscordGuild[]> {
    return this.get<DiscordGuild[]>('/users/@me/guilds', `Bearer ${accessToken}`, 'userGuilds')
  }

  private async requireGuildMembership(accessToken: string, guildId: string): Promise<void> {
    const guilds = await this.getUserGuilds(accessToken)
    if (!guilds.some(guild => guild.id === guildId)) throw new DiscordApiError(403, 'USER_NOT_IN_GUILD')
  }

  private async getWithBot<T>(path: string, operation: DiscordOperation): Promise<T> {
    return this.get<T>(path, `Bot ${this.botToken}`, operation)
  }

  private async get<T>(path: string, authorization: string, operation: DiscordOperation): Promise<T> {
    const response = await fetch(`${apiBaseUrl}${path}`, {
      headers: { Authorization: authorization },
    })
    if (!response.ok) throw mapDiscordError(response.status, operation)
    return (await response.json()) as T
  }
}

type DiscordOperation = 'userGuilds' | 'guildChannels' | 'channel' | 'messages'

export type DiscordErrorCode = 'BOT_NOT_IN_GUILD' | 'BOT_CHANNEL_ACCESS_DENIED' |
  'MESSAGE_HISTORY_ACCESS_DENIED' | 'BOT_TOKEN_INVALID' | 'USER_TOKEN_INVALID' |
  'USER_NOT_IN_GUILD' | 'GUILD_CHANNEL_REQUIRED' | 'DISCORD_API_UNAVAILABLE'

export class DiscordApiError extends Error {
  public constructor(public readonly status: number, public readonly code: DiscordErrorCode) {
    super(code)
  }
}

function mapDiscordError(status: number, operation: DiscordOperation): DiscordApiError {
  if (operation === 'userGuilds') {
    return status === 401 ? new DiscordApiError(401, 'USER_TOKEN_INVALID') :
      new DiscordApiError(502, 'DISCORD_API_UNAVAILABLE')
  }
  if (status === 401) return new DiscordApiError(502, 'BOT_TOKEN_INVALID')
  if (operation === 'guildChannels' && status === 404) return new DiscordApiError(403, 'BOT_NOT_IN_GUILD')
  if (operation === 'messages' && status === 403) return new DiscordApiError(403, 'MESSAGE_HISTORY_ACCESS_DENIED')
  if ((operation === 'guildChannels' || operation === 'channel') && (status === 403 || status === 404)) {
    return new DiscordApiError(403, 'BOT_CHANNEL_ACCESS_DENIED')
  }
  return new DiscordApiError(502, 'DISCORD_API_UNAVAILABLE')
}
