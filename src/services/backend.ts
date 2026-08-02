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
}

export class BackendUnauthorizedError extends Error {}

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

  public Messages(channelId: string): Promise<readonly BackendMessage[]> {
    return this.request(`/api/discord/messages?channelId=${encodeURIComponent(channelId)}`)
  }

  private async request<T>(path: string): Promise<T> {
    const response = await fetch(this.url(path), {
      method: 'GET',
      credentials: 'include',
      headers: { Accept: 'application/json' },
    })
    if (response.status === 401 || response.status === 403) throw new BackendUnauthorizedError()
    if (!response.ok) throw new Error(`Backend request failed with status ${response.status}`)
    return (await response.json()) as T
  }

  private url(path: string): string {
    return `${this.baseUrl}${path}`
  }
}
