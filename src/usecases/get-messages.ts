import type { DiscordMessage } from '../models/message'
import type { BackendErrorCode } from '../services/backend'
import type { DiscordRepository } from '../services/discord'

export class GetMessagesUseCase {
  private channelId: string | null = null
  private messages: readonly DiscordMessage[] = []
  private status: 'loading' | 'fresh' | 'error' | 'login-required' | 'network-error' = 'loading'
  private errorCode?: BackendErrorCode
  public constructor(private readonly repository: DiscordRepository) {}
  public SelectChannel(channelId: string): void { this.channelId = channelId; this.messages = []; this.status = 'loading'; this.errorCode = undefined }
  public async Load(): Promise<void> {
    if (!this.channelId) { this.status = 'error'; return }
    const result = await this.repository.getMessages(this.channelId)
    this.messages = result.messages; this.status = result.status; this.errorCode = result.errorCode
  }
  public Execute(): readonly DiscordMessage[] { return this.messages }
  public GetStatus(): 'loading' | 'fresh' | 'error' | 'login-required' | 'network-error' { return this.status }
  public GetErrorCode(): BackendErrorCode | undefined { return this.errorCode }
}
