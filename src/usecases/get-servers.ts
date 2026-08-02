import type { DiscordServer } from '../models/server'
import type { DiscordRepository } from '../services/discord'

export class GetServersUseCase {
  private servers: readonly DiscordServer[] = []
  private status: 'loading' | 'fresh' | 'cached' | 'offline' | 'error' = 'loading'

  public constructor(private readonly repository: DiscordRepository) {}

  public async Execute(): Promise<void> {
    this.status = 'loading'
    const result = await this.repository.getServers()
    this.servers = result.servers
    this.status = result.status
  }

  public GetServers(): readonly DiscordServer[] {
    return this.servers
  }

  public IsAvailable(): boolean {
    return this.repository.isLoggedIn()
  }

  public GetStatus(): 'loading' | 'fresh' | 'cached' | 'offline' | 'error' {
    return this.status
  }
}
