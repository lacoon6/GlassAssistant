import {
  CreateStartUpPageContainer,
  type EvenAppBridge,
  type EvenHubEvent,
  OsEventTypeList,
} from '@evenrealities/even_hub_sdk'
import { Page, PageAction, PageId } from './page'
import { ChannelPage } from './pages/channel'
import { ConfigurationErrorPage } from './pages/configuration-error'
import { MessageDetailPage } from './pages/detail'
import { HomePage } from './pages/home'
import { MessageListPage } from './pages/messages'
import { ServerPage } from './pages/server'
import { SettingsPage } from './pages/settings'
import { BackendDiscordRepository, type DiscordRepository } from './services/discord'
import { DiscordAuthUseCase } from './usecases/discord-auth'
import { GetChannelsUseCase } from './usecases/get-channels'
import { GetMessagesUseCase } from './usecases/get-messages'
import { GetServersUseCase } from './usecases/get-servers'

export class App {
  private readonly pages: Map<PageId, Page>
  private currentPage: Page
  private readonly pageHistory: Page[] = []
  private unsubscribe?: () => void

  public constructor(
    private readonly bridge: EvenAppBridge,
    discord: DiscordRepository = new BackendDiscordRepository(),
  ) {
    const auth = new DiscordAuthUseCase(discord)
    const getServers = new GetServersUseCase(discord)
    const getChannels = new GetChannelsUseCase(discord)
    const getMessages = new GetMessagesUseCase(discord)
    const home = new HomePage()
    const configurationError = new ConfigurationErrorPage()
    const settings = new SettingsPage(auth)
    const server = new ServerPage(getServers, getChannels)
    const channel = new ChannelPage(getChannels, getMessages)
    const messages = new MessageListPage(getMessages)
    const detail = new MessageDetailPage(getMessages)

    this.pages = new Map<PageId, Page>([
      [configurationError.id, configurationError],
      [home.id, home],
      [settings.id, settings],
      [server.id, server],
      [channel.id, channel],
      [messages.id, messages],
      [detail.id, detail],
    ])
    this.currentPage = auth.IsConfigured() ? home : configurationError
  }

  public async start(): Promise<void> {
    const result = await this.bridge.createStartUpPageContainer(
      new CreateStartUpPageContainer({
        containerTotalNum: 1,
        textObject: [this.currentPage.createContainer()],
      }),
    )

    console.log('Page created:', result === 0 ? 'success' : `failed (${result})`)
    this.unsubscribe = this.bridge.onEvenHubEvent(event => void this.handleEvent(event))
  }

  private async handleEvent(event: EvenHubEvent): Promise<void> {
    // CLICK_EVENT is protobuf value zero and may be omitted from an existing
    // event envelope, so the envelope's presence is significant.
    const sysType = event.sysEvent ? (event.sysEvent.eventType ?? OsEventTypeList.CLICK_EVENT) : null
    const textType = event.textEvent ? (event.textEvent.eventType ?? OsEventTypeList.CLICK_EVENT) : null

    if (sysType === OsEventTypeList.DOUBLE_CLICK_EVENT || textType === OsEventTypeList.DOUBLE_CLICK_EVENT) {
      await this.goBack()
      return
    }

    if (sysType === OsEventTypeList.SYSTEM_EXIT_EVENT || sysType === OsEventTypeList.ABNORMAL_EXIT_EVENT) {
      this.unsubscribe?.()
      this.unsubscribe = undefined
      return
    }

    const eventType = textType ?? sysType
    let action: PageAction = { type: 'none' }

    if (eventType === OsEventTypeList.SCROLL_TOP_EVENT) {
      action = this.currentPage.moveSelection(-1)
    } else if (eventType === OsEventTypeList.SCROLL_BOTTOM_EVENT) {
      action = this.currentPage.moveSelection(1)
    } else if (eventType === OsEventTypeList.CLICK_EVENT) {
      action = this.currentPage.select()
    }

    if (action.type === 'navigate') {
      const destination = this.pages.get(action.page)
      if (destination) {
        this.pageHistory.push(this.currentPage)
        this.currentPage = destination
        if (this.currentPage.ShowsLoadingState()) {
          await this.bridge.rebuildPageContainer(this.currentPage.createRebuildContainer())
        }
        await this.currentPage.Load()
      }
    }

    if (action.type !== 'none') {
      await this.bridge.rebuildPageContainer(this.currentPage.createRebuildContainer())
    }
  }

  private async goBack(): Promise<void> {
    const previousPage = this.pageHistory.pop()
    if (!previousPage) {
      await this.bridge.shutDownPageContainer(1)
      return
    }

    this.currentPage = previousPage
    await this.bridge.rebuildPageContainer(this.currentPage.createRebuildContainer())
  }
}
