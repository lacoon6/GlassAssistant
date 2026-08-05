import type { DiscordServer } from '../models/server'
import type { DiscordRepository, LoadStatus } from '../services/discord'

export class GetServersUseCase {
  private servers: readonly DiscordServer[] = []
  private status: LoadStatus = 'loading'

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

  public GetStatus(): LoadStatus {
    return this.status
  }
}
