import {
  CreateStartUpPageContainer, EventSourceType, type EvenAppBridge, type EvenHubEvent,
  OsEventTypeList, StartUpPageCreateResult,
} from '@evenrealities/even_hub_sdk'
import { type Page, type PageAction, type PageId } from './page'
import { ChannelPage } from './pages/channel'
import { MessageListPage } from './pages/messages'
import { BackendDiscordRepository, type DiscordRepository } from './services/discord'
import { GetChannelsUseCase } from './usecases/get-channels'
import { GetMessagesUseCase } from './usecases/get-messages'

const stateKey = 'glass-assistant.state.v1'
const staleAfterMs = 5 * 60 * 1000
export type AppBridge = Pick<EvenAppBridge, 'createStartUpPageContainer' | 'rebuildPageContainer' |
  'shutDownPageContainer' | 'onEvenHubEvent' | 'setLocalStorage' | 'getLocalStorage'>
interface AppSnapshot {
  currentPageId: 'channels' | 'messages'
  selectedChannelIndex: number
  selectedMessageIndex: number
  selectedChannelId?: string
  viewportStart: number
  updatedAt: number
}

export class App {
  private readonly channelPage: ChannelPage
  private readonly messagePage: MessageListPage
  private currentPage: Page
  private readonly pageHistory: Page[] = []
  private unsubscribe?: () => void
  private saveTimer?: ReturnType<typeof setTimeout>
  private saveQueue: Promise<unknown> = Promise.resolve()
  private lastUpdatedAt = 0

  public constructor(private readonly bridge: AppBridge, discord: DiscordRepository = new BackendDiscordRepository()) {
    const getMessages = new GetMessagesUseCase(discord)
    this.channelPage = new ChannelPage(new GetChannelsUseCase(discord), getMessages)
    this.messagePage = new MessageListPage(getMessages)
    this.currentPage = this.channelPage
  }

  public async start(): Promise<void> {
    const result = await this.bridge.createStartUpPageContainer(new CreateStartUpPageContainer({
      containerTotalNum: 1, textObject: [this.channelPage.createContainer()],
    }))
    if (result !== StartUpPageCreateResult.success) throw new Error(`createStartUpPageContainer failed with result ${result}`)

    const snapshot = await this.readSnapshot()
    this.channelPage.setRestoreChannelId(snapshot?.selectedChannelId)
    if (snapshot) this.channelPage.restoreSelection(snapshot.selectedChannelIndex, Number.MAX_SAFE_INTEGER)
    await this.channelPage.Load()
    this.currentPage = this.channelPage

    if (snapshot?.currentPageId === 'messages' && snapshot.selectedChannelId && this.channelPage.getSelectedChannelId() === snapshot.selectedChannelId) {
      this.channelPage.select()
      this.messagePage.restoreSelection(snapshot.selectedMessageIndex, Number.MAX_SAFE_INTEGER)
      await this.messagePage.Load()
      this.pageHistory.push(this.channelPage)
      this.currentPage = this.messagePage
    }
    this.lastUpdatedAt = Date.now()
    await this.renderCurrentPage()
    this.unsubscribe = this.bridge.onEvenHubEvent(event => { void this.handleEvent(event).catch(() => undefined) })
  }

  public needsDiscordLogin(): boolean { return this.channelPage.getStatus() === 'login-required' }

  private async handleEvent(event: EvenHubEvent): Promise<void> {
    const sysType = event.sysEvent ? (event.sysEvent.eventType ?? OsEventTypeList.CLICK_EVENT) : null
    const textType = event.textEvent ? (event.textEvent.eventType ?? OsEventTypeList.CLICK_EVENT) : null
    if (sysType === OsEventTypeList.FOREGROUND_EXIT_EVENT) { await this.persistNow(); return }
    if (sysType === OsEventTypeList.FOREGROUND_ENTER_EVENT) { await this.restoreOnForeground(); return }
    if (sysType === OsEventTypeList.SYSTEM_EXIT_EVENT || sysType === OsEventTypeList.ABNORMAL_EXIT_EVENT) { this.unsubscribe?.(); this.unsubscribe = undefined; return }
    const isDouble = sysType === OsEventTypeList.DOUBLE_CLICK_EVENT || textType === OsEventTypeList.DOUBLE_CLICK_EVENT
    if (isDouble) {
      if (event.sysEvent?.eventSource === EventSourceType.TOUCH_EVENT_FROM_RING) await this.openChannels(true)
      else await this.goBack()
      return
    }
    const eventType = textType ?? sysType
    let action: PageAction = { type: 'none' }
    if (eventType === OsEventTypeList.SCROLL_TOP_EVENT) action = this.currentPage.moveSelection(-1)
    else if (eventType === OsEventTypeList.SCROLL_BOTTOM_EVENT) action = this.currentPage.moveSelection(1)
    else if (eventType === OsEventTypeList.CLICK_EVENT) action = this.currentPage.select()
    if (action.type === 'navigate') await this.navigate(action.page)
    else if (action.type === 'render') await this.renderCurrentPage()
    if (action.type !== 'none') this.schedulePersist()
  }

  private async navigate(pageId: PageId): Promise<void> {
    if (pageId !== 'messages') return
    this.pageHistory.push(this.currentPage); this.currentPage = this.messagePage
    await this.renderCurrentPage(); await this.messagePage.Load(); this.lastUpdatedAt = Date.now(); await this.renderCurrentPage()
  }

  private async openChannels(refresh: boolean): Promise<void> {
    this.pageHistory.length = 0; this.currentPage = this.channelPage
    if (refresh) { this.channelPage.BeginLoad(); await this.renderCurrentPage(); await this.channelPage.Load(); this.lastUpdatedAt = Date.now() }
    await this.renderCurrentPage(); this.schedulePersist()
  }

  private async goBack(): Promise<void> {
    const previous = this.pageHistory.pop()
    if (!previous) { await this.bridge.shutDownPageContainer(1); return }
    this.currentPage = previous; await this.renderCurrentPage(); this.schedulePersist()
  }

  private async restoreOnForeground(): Promise<void> {
    const snapshot = await this.readSnapshot()
    if (snapshot) {
      if (snapshot.selectedChannelId) this.channelPage.setRestoreChannelId(snapshot.selectedChannelId)
      this.channelPage.restoreSelection(snapshot.selectedChannelIndex, Number.MAX_SAFE_INTEGER)
      this.messagePage.restoreSelection(snapshot.selectedMessageIndex, Number.MAX_SAFE_INTEGER)
    }
    if (Date.now() - (snapshot?.updatedAt ?? this.lastUpdatedAt) > staleAfterMs) {
      await this.channelPage.Load(); this.lastUpdatedAt = Date.now()
      if (this.currentPage.id === 'messages') await this.messagePage.Load()
    }
    await this.renderCurrentPage()
  }

  private renderCurrentPage(): Promise<boolean> { return this.bridge.rebuildPageContainer(this.currentPage.createRebuildContainer()) }
  private schedulePersist(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.saveTimer = setTimeout(() => { this.saveTimer = undefined; void this.persistNow() }, 80)
  }
  private persistNow(): Promise<unknown> {
    if (this.saveTimer) { clearTimeout(this.saveTimer); this.saveTimer = undefined }
    const snapshot: AppSnapshot = {
      currentPageId: this.currentPage.id === 'messages' ? 'messages' : 'channels',
      selectedChannelIndex: this.channelPage.getSelectedIndex(), selectedMessageIndex: this.messagePage.getSelectedIndex(),
      selectedChannelId: this.channelPage.getSelectedChannelId(), viewportStart: this.currentPage.getViewportStart(), updatedAt: Date.now(),
    }
    this.saveQueue = this.saveQueue.then(() => this.bridge.setLocalStorage(stateKey, JSON.stringify(snapshot)))
    return this.saveQueue
  }
  private async readSnapshot(): Promise<AppSnapshot | null> {
    try {
      const parsed = JSON.parse(await this.bridge.getLocalStorage(stateKey)) as Partial<AppSnapshot>
      if ((parsed.currentPageId !== 'channels' && parsed.currentPageId !== 'messages') ||
        !Number.isInteger(parsed.selectedChannelIndex) || !Number.isInteger(parsed.selectedMessageIndex) ||
        !Number.isFinite(parsed.updatedAt) || (parsed.selectedChannelId !== undefined && typeof parsed.selectedChannelId !== 'string')) return null
      return parsed as AppSnapshot
    } catch { return null }
  }
}
