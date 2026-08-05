import { Page, type PageAction } from '../page'
import type { GetChannelsUseCase } from '../usecases/get-channels'
import type { GetMessagesUseCase } from '../usecases/get-messages'

const visibleRows = 6
export class ChannelPage extends Page {
  public readonly id = 'channels' as const
  private restoreChannelId?: string
  public constructor(private readonly getChannels: GetChannelsUseCase, private readonly getMessages: GetMessagesUseCase) { super() }
  public async Load(): Promise<void> {
    await this.getChannels.Load()
    const channels = this.getChannels.Execute()
    const restored = this.restoreChannelId ? channels.findIndex(channel => channel.id === this.restoreChannelId) : -1
    this.restoreSelection(restored >= 0 ? restored : this.selectedIndex, channels.length)
  }
  public ShowsLoadingState(): boolean { return true }
  public BeginLoad(): void { this.getChannels.BeginLoad() }
  public getStatus() { return this.getChannels.GetStatus() }
  public setRestoreChannelId(id?: string): void { this.restoreChannelId = id }
  public restoreChannelSelection(id: string | undefined, fallbackIndex: number): void {
    const channels = this.getChannels.Execute()
    const restored = id ? channels.findIndex(channel => channel.id === id) : -1
    this.restoreSelection(restored >= 0 ? restored : fallbackIndex, channels.length)
  }
  public getSelectedChannelId(): string | undefined { return this.getChannels.Execute()[this.selectedIndex]?.id }
  protected render(): string {
    const channels = this.getChannels.Execute(); const status = this.getChannels.GetStatus()
    if (status === 'loading') return 'Discord\n\nLoading channels...'
    if (status === 'login-required') return 'Discord login required\nPress once or open phone'
    if (status === 'network-error') return 'Connection failed\nCheck the phone app'
    if (status === 'target-not-configured') return 'Target Discord server is not configured'
    if (status === 'offline') return 'Discord\n\nOffline'
    if (status === 'error') return 'Discord\n\nFailed to load Discord'
    if (channels.length === 0) return 'Discord\n\nNo readable channels'
    this.keepSelectionVisible(channels.length, visibleRows)
    const rows = channels.slice(this.viewportStart, this.viewportStart + visibleRows).map((channel, offset) =>
      `${this.viewportStart + offset === this.selectedIndex ? '>' : ' '} # ${channel.name}`,
    )
    return `Discord\n${rows.join('\n')}\n${this.selectedIndex + 1}/${channels.length}`
  }
  public moveSelection(direction: -1 | 1): PageAction { return this.moveWithin(this.getChannels.Execute().length, direction) }
  public select(): PageAction {
    const channel = this.getChannels.Execute()[this.selectedIndex]
    if (!channel) return { type: 'none' }
    this.getMessages.SelectChannel(channel.id)
    return { type: 'navigate', page: 'messages' }
  }
}
