export interface BackendServer {
  readonly id: string
  readonly name: string
  readonly unreadCount?: number
}

export interface BackendChannel {
  readonly id: string
  readonly guildId: string
  readonly name: string
  readonly type: number
  readonly parentId?: string | null
  readonly position?: number
  readonly unreadCount?: number
}

export interface BackendMessage {
  readonly id: string
  readonly channelId: string
  readonly author: string
  readonly content: string
  readonly timestamp: string
  readonly attachmentCount: number
  readonly embedCount: number
}

export type BackendErrorCode = 'BOT_NOT_IN_GUILD' | 'BOT_CHANNEL_ACCESS_DENIED' |
  'MESSAGE_HISTORY_ACCESS_DENIED' | 'USER_NOT_IN_GUILD' | 'DISCORD_TARGET_GUILD_REQUIRED' |
  'DISCORD_LOGIN_REQUIRED' | 'UNKNOWN'

export class BackendApiError extends Error {
  public constructor(public readonly code: BackendErrorCode) { super(code) }
}

export class BackendClient {
  private readonly baseUrl: string

  public constructor(apiUrl: string) {
    this.baseUrl = apiUrl.trim().replace(/\/$/, '')
  }

  public IsConfigured(): boolean {
    return this.baseUrl.length > 0
  }

  public Login(): void {
    if (this.IsConfigured()) window.location.assign(this.url('/api/auth/login'))
  }

  public async Logout(): Promise<void> {
    if (!this.IsConfigured()) return
    await this.request('/api/auth/logout')
  }

  public Servers(): Promise<readonly BackendServer[]> {
    return this.request('/api/discord/servers')
  }

  public Channels(guildId: string): Promise<readonly BackendChannel[]> {
    return this.request(`/api/discord/channels?guildId=${encodeURIComponent(guildId)}`)
  }

  public DefaultChannels(): Promise<readonly BackendChannel[]> {
    return this.request('/api/discord/default/channels')
  }

  public Messages(channelId: string): Promise<readonly BackendMessage[]> {
    return this.request(`/api/discord/messages?channelId=${encodeURIComponent(channelId)}`)
  }

  private async request<T>(path: string): Promise<T> {
    const response = await fetch(this.url(path), {
      method: 'GET',
      credentials: 'include',
      headers: { Accept: 'application/json' },
    })
    if (!response.ok) {
      let code: BackendErrorCode = response.status === 401 ? 'DISCORD_LOGIN_REQUIRED' : 'UNKNOWN'
      try {
        const body = await response.json() as { error?: unknown }
        const safeCodes: readonly string[] = ['BOT_NOT_IN_GUILD', 'BOT_CHANNEL_ACCESS_DENIED', 'MESSAGE_HISTORY_ACCESS_DENIED', 'USER_NOT_IN_GUILD', 'DISCORD_TARGET_GUILD_REQUIRED']
        if (typeof body.error === 'string' && safeCodes.includes(body.error)) code = body.error as BackendErrorCode
      } catch { /* Never expose response details. */ }
      throw new BackendApiError(code)
    }
    return (await response.json()) as T
  }

  private url(path: string): string {
    return `${this.baseUrl}${path}`
  }
}
