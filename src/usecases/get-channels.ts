import type { DiscordChannel } from '../models/channel'
import type { DiscordRepository, LoadStatus } from '../services/discord'

export class GetChannelsUseCase {
  private channels: readonly DiscordChannel[] = []
  private guildId: string | null = null
  private status: LoadStatus = 'loading'

  public constructor(private readonly repository: DiscordRepository) {}

  public SelectGuild(guildId: string): void { this.guildId = guildId; this.channels = []; this.status = 'loading' }
  public BeginLoad(): void { this.status = 'loading' }
  public SetFailure(status: Exclude<LoadStatus, 'loading' | 'fresh' | 'cached'>): void { this.channels = []; this.status = status }

  public async Load(): Promise<void> {
    this.status = 'loading'
    if (!this.guildId) { this.SetFailure('target-not-configured'); return }
    try {
      const result = await this.repository.getChannels(this.guildId)
      this.channels = result.channels.filter(channel =>
        (channel.kind === 'text' || channel.kind === 'announcement') && !channel.readOnly,
      )
      this.status = result.status
    } catch {
      this.channels = []
      this.status = 'network-error'
    }
  }

  public Execute(): readonly DiscordChannel[] {
    return this.channels
  }

  public GetStatus(): LoadStatus {
    return this.status
  }
}
