import { DiscordChannel } from '../models/channel'
import { DiscordMessage } from '../models/message'
import type { DiscordServer } from '../models/server'
import { BackendApiError, BackendClient, type BackendErrorCode } from './backend'

export type LoadStatus = 'loading' | 'fresh' | 'offline' | 'error' | 'login-required' | 'network-error'
export interface ChannelRepositoryResult {
  readonly status: LoadStatus
  readonly channels: readonly DiscordChannel[]
  readonly errorCode?: BackendErrorCode
}
export interface MessageRepositoryResult {
  readonly status: Exclude<LoadStatus, 'offline' | 'network-error'> | 'network-error'
  readonly messages: readonly DiscordMessage[]
  readonly errorCode?: BackendErrorCode
}

export interface DiscordRepository {
  getServers(): Promise<{ status: 'fresh' | 'cached' | 'offline' | 'error'; servers: readonly DiscordServer[] }>
  getChannels(): Promise<ChannelRepositoryResult>
  getMessages(channelId: string): Promise<MessageRepositoryResult>
  login(): Promise<void>
  logout(): Promise<void>
  isLoggedIn(): boolean
  isBackendConfigured(): boolean
  loginUrl(): string | null
}

export class DummyDiscordRepository implements DiscordRepository {
  public getServers(): Promise<{ status: 'fresh'; servers: readonly DiscordServer[] }> { return Promise.resolve({ status: 'fresh', servers: [] }) }
  public getChannels(): Promise<ChannelRepositoryResult> {
    return Promise.resolve({ status: 'fresh', channels: Array.from({ length: 12 }, (_, index) =>
      new DiscordChannel(String(index + 1), 'internal', `channel-${index + 1}`, 0, index === 1 ? 'announcement' : 'text', null, index),
    ) })
  }
  public getMessages(channelId: string): Promise<MessageRepositoryResult> {
    return Promise.resolve({ status: 'fresh', messages: [
      new DiscordMessage('1', channelId, 'User', 'Latest Discord message', '2026-08-05T00:00:00.000Z'),
      new DiscordMessage('2', channelId, 'User', '', '2026-08-04T23:59:00.000Z', 1, 0),
    ] })
  }
  public login(): Promise<void> { return Promise.resolve() }
  public logout(): Promise<void> { return Promise.resolve() }
  public isLoggedIn(): boolean { return true }
  public isBackendConfigured(): boolean { return true }
  public loginUrl(): string | null { return 'https://api.nobutv.org/api/auth/login' }
}

export class BackendDiscordRepository implements DiscordRepository {
  private loggedIn = false
  public constructor(private readonly backend = new BackendClient(import.meta.env.VITE_API_URL ?? '')) {}
  public async getServers(): Promise<{ status: 'fresh' | 'error'; servers: readonly DiscordServer[] }> { return { status: 'error', servers: [] } }

  public async getChannels(): Promise<ChannelRepositoryResult> {
    try {
      const values = await this.backend.DefaultChannels()
      const channels = values
        .filter(value => (value.type === 0 || value.type === 5) && value.name.length > 0)
        .sort((left, right) => left.position !== right.position ? (left.position ?? 0) - (right.position ?? 0) : left.id.localeCompare(right.id))
        .map(value => new DiscordChannel(value.id, value.guildId, value.name, 0, value.type === 5 ? 'announcement' : 'text', value.parentId ?? null, value.position ?? 0))
      this.loggedIn = true
      return { status: 'fresh', channels }
    } catch (error) {
      if (error instanceof BackendApiError) return {
        status: error.code === 'DISCORD_LOGIN_REQUIRED' ? 'login-required' :
          error.code === 'NETWORK_OR_CORS_ERROR' || (error.status !== undefined && error.status >= 500) ? 'network-error' : 'error',
        channels: [], errorCode: error.code,
      }
      return { status: navigator.onLine ? 'error' : 'offline', channels: [] }
    }
  }

  public async getMessages(channelId: string): Promise<MessageRepositoryResult> {
    try {
      const values = await this.backend.Messages(channelId)
      const messages = values.map(value => new DiscordMessage(value.id, value.channelId, value.author, value.content, value.timestamp, value.attachmentCount, value.embedCount))
        .sort((left, right) => Date.parse(right.timestamp) - Date.parse(left.timestamp))
      this.loggedIn = true
      return { status: 'fresh', messages }
    } catch (error) {
      if (error instanceof BackendApiError) return {
        status: error.code === 'DISCORD_LOGIN_REQUIRED' ? 'login-required' :
          error.code === 'NETWORK_OR_CORS_ERROR' || (error.status !== undefined && error.status >= 500) ? 'network-error' : 'error',
        messages: [], errorCode: error.code,
      }
      return { status: 'error', messages: [] }
    }
  }

  public login(): Promise<void> { this.backend.Login(); return Promise.resolve() }
  public async logout(): Promise<void> { await this.backend.Logout(); this.loggedIn = false }
  public isLoggedIn(): boolean { return this.loggedIn }
  public isBackendConfigured(): boolean { return this.backend.IsConfigured() }
  public loginUrl(): string | null { return this.backend.LoginUrl() }
}
