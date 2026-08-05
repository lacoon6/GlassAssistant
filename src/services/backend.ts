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
  | 'NETWORK_OR_CORS_ERROR'

export class BackendApiError extends Error {
  public constructor(public readonly code: BackendErrorCode, public readonly status?: number) { super(code) }
}

export class BackendClient {
  private readonly baseUrl: string

  public constructor(
    apiUrl: string,
    private readonly fetcher: typeof fetch = fetch,
    private readonly navigate: (url: string) => void = url => window.location.assign(url),
    private readonly requestTimeoutMs = 8000,
  ) {
    this.baseUrl = apiUrl.trim().replace(/\/$/, '')
  }

  public IsConfigured(): boolean {
    return this.baseUrl.length > 0
  }

  public LoginUrl(): string | null {
    try {
      const configured = new URL(this.baseUrl)
      if (configured.protocol !== 'https:' || configured.username || configured.password ||
        (configured.pathname !== '' && configured.pathname !== '/') || configured.search || configured.hash) return null
      const login = new URL('/api/auth/login', configured.origin)
      if (login.protocol !== 'https:' || login.origin !== configured.origin || login.pathname !== '/api/auth/login') return null
      return login.href
    } catch { return null }
  }

  public Login(): void {
    const loginUrl = this.LoginUrl()
    if (loginUrl) this.navigate(loginUrl)
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
    const controller = new AbortController()
    let timeout: ReturnType<typeof setTimeout> | undefined
    try {
      return await Promise.race([
        this.performRequest<T>(path, controller.signal),
        new Promise<never>((_resolve, reject) => {
          timeout = setTimeout(() => { controller.abort(); reject(new BackendApiError('NETWORK_OR_CORS_ERROR')) }, this.requestTimeoutMs)
        }),
      ])
    } catch (error) {
      if (error instanceof BackendApiError) { this.logDiagnostic(error.code, error.status); throw error }
      this.logDiagnostic('NETWORK_OR_CORS_ERROR')
      throw new BackendApiError('NETWORK_OR_CORS_ERROR')
    } finally {
      if (timeout) clearTimeout(timeout)
    }
  }

  private async performRequest<T>(path: string, signal: AbortSignal): Promise<T> {
    const response = await this.fetcher(this.url(path), {
      method: 'GET', credentials: 'include', headers: { Accept: 'application/json' }, signal,
    })
    if (!response.ok) {
      if (response.status === 401) throw new BackendApiError('DISCORD_LOGIN_REQUIRED', 401)
      let code: BackendErrorCode = 'UNKNOWN'
      try {
        const body = await response.json() as { error?: unknown }
        const safeCodes: readonly string[] = ['BOT_NOT_IN_GUILD', 'BOT_CHANNEL_ACCESS_DENIED', 'MESSAGE_HISTORY_ACCESS_DENIED', 'USER_NOT_IN_GUILD', 'DISCORD_TARGET_GUILD_REQUIRED']
        if (typeof body.error === 'string' && safeCodes.includes(body.error)) code = body.error as BackendErrorCode
      } catch { /* Never expose response details. */ }
      throw new BackendApiError(code, response.status)
    }
    return (await response.json()) as T
  }

  private url(path: string): string {
    return `${this.baseUrl}${path}`
  }

  private logDiagnostic(errorType: BackendErrorCode, httpStatus?: number): void {
    const location = typeof window === 'undefined' ? { origin: '', pathname: '' } : window.location
    console.info('Backend request diagnostic', { origin: location.origin, pathname: location.pathname, errorType, httpStatus })
  }
}
