import {
  type CreateStartUpPageContainer, EventSourceType, type EvenAppBridge, type EvenHubEvent,
  OsEventTypeList, StartUpPageCreateResult, type TextContainerProperty,
} from '@evenrealities/even_hub_sdk'
import { type Page, type PageAction, type PageId } from './page'
import { ChannelPage } from './pages/channel'
import { MessageListPage } from './pages/messages'
import { BackendDiscordRepository, type DiscordRepository } from './services/discord'
import { GetChannelsUseCase } from './usecases/get-channels'
import { GetMessagesUseCase } from './usecases/get-messages'
import { StartupContainerResultError, startupResultName, type StartupPhase } from './startup-diagnostics'

const stateKey = 'glass-assistant.state.v1'
const staleAfterMs = 5 * 60 * 1000
export type AppBridge = Pick<EvenAppBridge, 'createStartUpPageContainer' | 'textContainerUpgrade' |
  'shutDownPageContainer' | 'onEvenHubEvent' | 'setLocalStorage' | 'getLocalStorage'>
interface AppSnapshot {
  currentPageId: 'channels' | 'messages'
  selectedChannelIndex: number
  selectedMessageIndex: number
  selectedChannelId?: string
  viewportStart: number
  updatedAt: number
}

export function createMinimalStartupContainer(): CreateStartUpPageContainer {
  const textContainer = {
    xPosition: 8,
    yPosition: 8,
    width: 560,
    height: 272,
    borderWidth: 0,
    borderColor: 0,
    borderRadius: 0,
    paddingLength: 0,
    containerID: 1,
    containerName: 'main',
    content: 'Starting...',
    isEventCapture: 1,
  } as TextContainerProperty

  return {
    containerTotalNum: 1,
    textObject: [textContainer],
  } as CreateStartUpPageContainer
}

export class App {
  private readonly channelPage: ChannelPage
  private readonly messagePage: MessageListPage
  private currentPage: Page
  private readonly pageHistory: Page[] = []
  private unsubscribe?: () => void
  private saveTimer?: ReturnType<typeof setTimeout>
  private bridgeQueue: Promise<void> = Promise.resolve()
  private startPromise?: Promise<void>
  private lastUpdatedAt = 0
  private statusListener?: () => void

  public constructor(
    private readonly bridge: AppBridge,
    private readonly discord: DiscordRepository = new BackendDiscordRepository(),
    private readonly reportPhase: (phase: StartupPhase, detail?: string) => void = () => undefined,
  ) {
    const getMessages = new GetMessagesUseCase(discord)
    this.channelPage = new ChannelPage(new GetChannelsUseCase(discord), getMessages)
    this.messagePage = new MessageListPage(getMessages)
    this.currentPage = this.channelPage
  }

  public start(): Promise<void> {
    this.startPromise ??= this.startCore()
    return this.startPromise
  }

  private async startCore(): Promise<void> {
    this.reportPhase('startup-container')
    const startupContainer = createMinimalStartupContainer()
    const result = await this.enqueueBridge(() => this.bridge.createStartUpPageContainer(startupContainer))
    this.reportPhase('startup-container', `${result} (${startupResultName(result)})`)
    if (result !== StartUpPageCreateResult.success) throw new StartupContainerResultError(result)

    this.reportPhase('event-subscription')
    this.unsubscribe = this.bridge.onEvenHubEvent(event => {
      void this.handleEvent(event).catch(error => console.error('G2 event handling failed', { error: error instanceof Error ? `${error.name}: ${error.message}` : String(error) }))
    })

    this.reportPhase('storage-restore')
    const snapshot = await this.readSnapshot()
    this.channelPage.setRestoreChannelId(snapshot?.selectedChannelId)
    if (snapshot) this.channelPage.restoreSelection(snapshot.selectedChannelIndex, Number.MAX_SAFE_INTEGER)
    this.reportPhase('discord-load')
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
  }

  public needsDiscordLogin(): boolean { return this.channelPage.getStatus() === 'login-required' }
  public hasConnectionFailure(): boolean { return this.channelPage.getStatus() === 'network-error' }
  public login(): Promise<void> { return this.discord.login() }
  public loginUrl(): string | null { return this.discord.loginUrl() }
  public onStatusChange(listener: () => void): void { this.statusListener = listener }
  public async retryChannels(): Promise<void> {
    this.channelPage.BeginLoad(); await this.renderCurrentPage(); await this.channelPage.Load(); this.lastUpdatedAt = Date.now()
    this.currentPage = this.channelPage; await this.renderCurrentPage(); this.statusListener?.()
  }

  private async handleEvent(event: EvenHubEvent): Promise<void> {
    const sysType = event.sysEvent?.eventType ?? OsEventTypeList.CLICK_EVENT
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
    else if (eventType === OsEventTypeList.CLICK_EVENT) {
      if (this.needsDiscordLogin()) { await this.login(); return }
      if (this.hasConnectionFailure()) { await this.retryChannels(); return }
      action = this.currentPage.select()
    }
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
    if (!previous) { await this.enqueueBridge(() => this.bridge.shutDownPageContainer(1)); return }
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

  private async renderCurrentPage(): Promise<boolean> {
    this.reportPhase('text-update')
    const updated = await this.enqueueBridge(() => this.bridge.textContainerUpgrade(this.currentPage.createTextUpgrade()))
    if (!updated) throw new Error('textContainerUpgrade failed')
    return true
  }
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
    return this.enqueueBridge(() => this.bridge.setLocalStorage(stateKey, JSON.stringify(snapshot)))
  }
  private async readSnapshot(): Promise<AppSnapshot | null> {
    const stored = await this.enqueueBridge(() => this.bridge.getLocalStorage(stateKey))
    try {
      const parsed = JSON.parse(stored) as Partial<AppSnapshot>
      if ((parsed.currentPageId !== 'channels' && parsed.currentPageId !== 'messages') ||
        !Number.isInteger(parsed.selectedChannelIndex) || !Number.isInteger(parsed.selectedMessageIndex) ||
        !Number.isFinite(parsed.updatedAt) || (parsed.selectedChannelId !== undefined && typeof parsed.selectedChannelId !== 'string')) return null
      return parsed as AppSnapshot
    } catch { return null }
  }
  private enqueueBridge<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.bridgeQueue.then(operation)
    this.bridgeQueue = result.then(() => undefined, () => undefined)
    return result
  }
}
