import { Page, PageAction } from '../page'
import type { GetServersUseCase } from '../usecases/get-servers'
import type { GetChannelsUseCase } from '../usecases/get-channels'

export class ServerPage extends Page {
  public readonly id = 'servers' as const

  public constructor(
    private readonly getServers: GetServersUseCase,
    private readonly getChannels: GetChannelsUseCase,
  ) {
    super()
  }

  public async Load(): Promise<void> {
    await this.getServers.Execute()
  }

  public ShowsLoadingState(): boolean {
    return true
  }

  protected render(): string {
    if (!this.getServers.IsAvailable()) return 'Discord Login Required'
    const status = this.getServers.GetStatus()
    const servers = this.getServers.GetServers()
    if (status === 'loading') return 'Loading...'
    if (status === 'offline') return 'Offline'
    if (status === 'error') return 'Error'
    if (servers.length === 0) return 'Empty'

    const content = this.renderMenu(
      'Discord',
      servers.map(server => `${server.name} (${server.unreadCount})`),
    )
    return status === 'cached' ? `${content}\n\nCached` : content
  }

  public moveSelection(direction: -1 | 1): PageAction {
    if (!this.getServers.IsAvailable()) return { type: 'none' }
    return this.moveWithin(this.getServers.GetServers().length, direction)
  }

  public select(): PageAction {
    if (!this.getServers.IsAvailable()) return { type: 'none' }
    const server = this.getServers.GetServers()[this.selectedIndex]
    if (!server) return { type: 'none' }
    this.getChannels.SelectGuild(server.id)
    return { type: 'navigate', page: 'channels' }
  }
}
