import { Page, PageAction } from '../page'
import type { GetChannelsUseCase } from '../usecases/get-channels'
import type { GetMessagesUseCase } from '../usecases/get-messages'

export class ChannelPage extends Page {
  public readonly id = 'channels' as const

  public constructor(
    private readonly getChannels: GetChannelsUseCase,
    private readonly getMessages: GetMessagesUseCase,
  ) {
    super()
  }

  public async Load(): Promise<void> {
    await this.getChannels.Load()
  }

  public ShowsLoadingState(): boolean {
    return true
  }

  protected render(): string {
    const channels = this.getChannels.Execute()
    const status = this.getChannels.GetStatus()
    if (status === 'loading') return 'Loading...'
    if (status === 'offline') return 'Offline'
    if (status === 'error') return 'Error'
    if (channels.length === 0) return 'Empty'
    const content = this.renderMenu(
      'Channels',
      channels.map(channel => `# ${channel.name} (${channel.unreadCount})`),
    )
    return status === 'cached' ? `${content}\n\nCached` : content
  }

  public moveSelection(direction: -1 | 1): PageAction {
    return this.moveWithin(this.getChannels.Execute().length, direction)
  }

  public select(): PageAction {
    const channel = this.getChannels.Execute()[this.selectedIndex]
    if (!channel || channel.kind === 'category') return { type: 'none' }
    this.getMessages.SelectChannel(channel.id)
    return { type: 'navigate', page: 'messages' }
  }
}
