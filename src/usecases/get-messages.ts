import type { DiscordMessage } from '../models/message'
import type { DiscordRepository } from '../services/discord'

export class GetMessagesUseCase {
  private channelId: string | null = null
  private messages: readonly DiscordMessage[] = []

  public constructor(private readonly repository: DiscordRepository) {}

  public SelectChannel(channelId: string): void {
    this.channelId = channelId
    this.messages = []
  }

  public async Load(): Promise<void> {
    this.messages = this.channelId ? await this.repository.getMessages(this.channelId) : []
  }

  public Execute(): readonly DiscordMessage[] {
    return this.messages
  }
}
