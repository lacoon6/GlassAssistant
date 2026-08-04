import { Page, type PageAction } from '../page'
import type { BackendErrorCode } from '../services/backend'
import type { GetMessagesUseCase } from '../usecases/get-messages'

const visibleRows = 5
const errors: Partial<Record<BackendErrorCode, string>> = {
  BOT_NOT_IN_GUILD: 'Bot is not installed', BOT_CHANNEL_ACCESS_DENIED: 'Bot cannot view channel',
  MESSAGE_HISTORY_ACCESS_DENIED: 'No history permission', USER_NOT_IN_GUILD: 'Not a server member',
  DISCORD_TARGET_GUILD_REQUIRED: 'Discord server not configured',
}
export class MessageListPage extends Page {
  public readonly id = 'messages' as const
  public constructor(private readonly getMessages: GetMessagesUseCase) { super() }
  public async Load(): Promise<void> { await this.getMessages.Load(); this.restoreSelection(this.selectedIndex, this.getMessages.Execute().length) }
  public ShowsLoadingState(): boolean { return true }
  protected render(): string {
    const messages = this.getMessages.Execute(); const status = this.getMessages.GetStatus()
    if (status === 'loading') return 'Discord\n\nLoading messages...'
    if (status === 'login-required') return 'Discord login required\nOpen the phone app'
    if (status === 'error') return `Discord\n\n${errors[this.getMessages.GetErrorCode() ?? 'UNKNOWN'] ?? 'Failed to load messages'}`
    if (messages.length === 0) return 'Discord\n\nNo messages\nCheck Bot history permission'
    this.keepSelectionVisible(messages.length, visibleRows)
    const rows = messages.slice(this.viewportStart, this.viewportStart + visibleRows).map((message, offset) => {
      const content = message.content.trim() || (message.attachmentCount > 0 ? '[Attachment]' : message.embedCount > 0 ? '[Embed]' : '[No text content]')
      const time = Number.isNaN(Date.parse(message.timestamp)) ? '--:--' : new Date(message.timestamp).toISOString().slice(11, 16)
      return `${this.viewportStart + offset === this.selectedIndex ? '>' : ' '} ${message.author.slice(0, 14)} ${time} ${content.replace(/\s+/g, ' ').slice(0, 34)}`
    })
    return `Discord messages\n${rows.join('\n')}\n${this.selectedIndex + 1}/${messages.length}`
  }
  public moveSelection(direction: -1 | 1): PageAction { return this.moveWithin(this.getMessages.Execute().length, direction) }
  public select(): PageAction { return { type: 'none' } }
}
