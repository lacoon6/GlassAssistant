import type { DiscordChannel } from '../models/channel'
import type { DiscordRepository } from '../services/discord'

export class GetChannelsUseCase {
  private guildId: string | null = null
  private channels: readonly DiscordChannel[] = []
  private status: 'loading' | 'fresh' | 'cached' | 'offline' | 'error' = 'loading'

  public constructor(private readonly repository: DiscordRepository) {}

  public SelectGuild(guildId: string): void {
    this.guildId = guildId
    this.channels = []
    this.status = 'loading'
  }

  public async Load(): Promise<void> {
    if (!this.guildId) {
      this.channels = []
      this.status = 'error'
      return
    }
    const result = await this.repository.getChannels(this.guildId)
    this.channels = result.channels
    this.status = result.status
  }

  public Execute(): readonly DiscordChannel[] {
    return this.channels
  }

  public GetStatus(): 'loading' | 'fresh' | 'cached' | 'offline' | 'error' {
    return this.status
  }
}
