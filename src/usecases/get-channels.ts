import type { DiscordChannel } from '../models/channel'
import type { DiscordRepository } from '../services/discord'

export class GetChannelsUseCase {
  private channels: readonly DiscordChannel[] = []
  private status: 'loading' | 'fresh' | 'offline' | 'error' | 'login-required' | 'network-error' = 'loading'

  public constructor(private readonly repository: DiscordRepository) {}

  public SelectGuild(_guildId: string): void { this.channels = []; this.status = 'loading' }
  public BeginLoad(): void { this.status = 'loading' }

  public async Load(): Promise<void> {
    this.status = 'loading'
    try {
      const result = await this.repository.getChannels()
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

  public GetStatus(): 'loading' | 'fresh' | 'offline' | 'error' | 'login-required' | 'network-error' {
    return this.status
  }
}
