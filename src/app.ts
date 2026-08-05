import {
  CreateStartUpPageContainer, EventSourceType, type EvenAppBridge, type EvenHubEvent,
  OsEventTypeList, StartUpPageCreateResult, TextContainerProperty, TextContainerUpgrade,
} from '@evenrealities/even_hub_sdk'
import { type Page, type PageAction, type PageId } from './page'
import { ChannelPage } from './pages/channel'
import { MessageListPage } from './pages/messages'
import { BackendDiscordRepository, type DiscordRepository } from './services/discord'
import { GetChannelsUseCase } from './usecases/get-channels'
import { GetMessagesUseCase } from './usecases/get-messages'
import { GetServersUseCase } from './usecases/get-servers'
import { StartupContainerResultError, startupResultName, type StartupPhase } from './startup-diagnostics'

const stateKey = 'glass-assistant.state.v1'
const staleAfterMs = 5 * 60 * 1000
const storageTimeoutMs = 1500
const bridgeTimeoutMs = 3000
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

export function serializeStartupPayload(container: CreateStartUpPageContainer): Record<string, unknown> {
  return CreateStartUpPageContainer.toJson(container)
}

export function startupPayloadFingerprint(payload: Record<string, unknown>): string {
  const comparable = { ...payload }
  delete comparable.widgetId
  const value = JSON.stringify(comparable)
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

export function createMinimalStartupContainer(): CreateStartUpPageContainer {
  const mainText = new TextContainerProperty({
    xPosition: 0,
    yPosition: 0,
    width: 576,
    height: 288,
    borderWidth: 0,
    borderColor: 5,
    paddingLength: 4,
    containerID: 1,
    containerName: 'main',
    content: 'Starting...',
    isEventCapture: 1,
  })

  return new CreateStartUpPageContainer({
    containerTotalNum: 1,
    textObject: [mainText],
  })
}

export class App {
  private readonly channelPage: ChannelPage
  private readonly messagePage: MessageListPage
  private readonly getServers: GetServersUseCase
  private readonly getChannels: GetChannelsUseCase
  private currentPage: Page
  private readonly pageHistory: Page[] = []
  private unsubscribe?: () => void
  private saveTimer?: ReturnType<typeof setTimeout>
  private bridgeQueue: Promise<void> = Promise.resolve()
  private startPromise?: Promise<void>
  private initialLoadPromise?: Promise<void>
  private lastUpdatedAt = 0
  private statusListener?: () => void
  private startupResult: number | 'pending' = 'pending'
  private startupFingerprint = ''

  public constructor(
    private readonly bridge: AppBridge,
    private readonly discord: DiscordRepository = new BackendDiscordRepository(),
    private readonly reportPhase: (phase: StartupPhase, detail?: string) => void = () => undefined,
  ) {
    this.getServers = new GetServersUseCase(discord)
    this.getChannels = new GetChannelsUseCase(discord)
    const getMessages = new GetMessagesUseCase(discord)
    this.channelPage = new ChannelPage(this.getChannels, getMessages)
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
    this.startupFingerprint = startupPayloadFingerprint(serializeStartupPayload(startupContainer))
    const result = await this.enqueueBridge(() => this.bridge.createStartUpPageContainer(startupContainer))
    this.startupResult = result
    this.statusListener?.()
    this.reportPhase('startup-container', `${result} (${startupResultName(result)})`)
    if (result !== StartUpPageCreateResult.success) throw new StartupContainerResultError(result)

    this.reportPhase('event-subscription')
    this.unsubscribe = this.bridge.onEvenHubEvent(event => {
      void this.handleEvent(event).catch(error => console.error('G2 event handling failed', { error: error instanceof Error ? `${error.name}: ${error.message}` : String(error) }))
    })

    this.currentPage = this.channelPage
    this.channelPage.BeginLoad()
    await this.updateText('Build v0.10.11\nLoading channels...')
    this.initialLoadPromise = this.loadInitialChannels()
    void this.initialLoadPromise
  }

  public needsDiscordLogin(): boolean { return this.channelPage.getStatus() === 'login-required' }
  public hasConnectionFailure(): boolean { return this.channelPage.getStatus() === 'network-error' }
  public hasTargetConfigurationFailure(): boolean { return this.channelPage.getStatus() === 'target-not-configured' }
  public getStartupResult(): number | 'pending' { return this.startupResult }
  public getStartupFingerprint(): string { return this.startupFingerprint }
  public login(): Promise<void> { return this.discord.login() }
  public loginUrl(): string | null { return this.discord.loginUrl() }
  public onStatusChange(listener: () => void): void { this.statusListener = listener }
  public whenInitialChannelsLoaded(): Promise<void> { return this.initialLoadPromise ?? Promise.resolve() }
  public async retryChannels(): Promise<void> {
    this.channelPage.BeginLoad(); await this.renderCurrentPage(); await this.resolveAndLoadChannels(); this.lastUpdatedAt = Date.now()
    this.currentPage = this.channelPage; await this.renderCurrentPage(); this.statusListener?.()
  }

  private async loadInitialChannels(): Promise<void> {
    this.reportPhase('storage-restore')
    const snapshotPromise = this.readSnapshotWithTimeout()
    this.reportPhase('discord-load')
    const channelsPromise = this.resolveAndLoadChannels()
    const [snapshotResult] = await Promise.allSettled([snapshotPromise, channelsPromise])
    const snapshot = snapshotResult.status === 'fulfilled' ? snapshotResult.value : null
    this.channelPage.restoreChannelSelection(snapshot?.selectedChannelId, snapshot?.selectedChannelIndex ?? 0)
    this.currentPage = this.channelPage
    this.lastUpdatedAt = Date.now()
    try { await this.renderCurrentPage() } finally { this.statusListener?.() }
  }

  private async resolveAndLoadChannels(): Promise<void> {
    await this.getServers.Execute()
    const status = this.getServers.GetStatus()
    if (status !== 'fresh') {
      this.getChannels.SetFailure(status === 'login-required' ? 'login-required' :
        status === 'target-not-configured' ? 'target-not-configured' : 'network-error')
      return
    }
    const servers = this.getServers.GetServers()
    if (servers.length !== 1) { this.getChannels.SetFailure('target-not-configured'); return }
    this.getChannels.SelectGuild(servers[0]!.id)
    await this.channelPage.Load()
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
  private async updateText(content: string): Promise<boolean> {
    this.reportPhase('text-update')
    const updated = await this.enqueueBridge(() => this.bridge.textContainerUpgrade(new TextContainerUpgrade({
      containerID: 1, containerName: 'main', contentOffset: 0, contentLength: 0, content,
    })))
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
    const stored = await this.enqueueBridgeWithTimeout(() => this.bridge.getLocalStorage(stateKey), 'getLocalStorage')
    try {
      const parsed = JSON.parse(stored) as Partial<AppSnapshot>
      if ((parsed.currentPageId !== 'channels' && parsed.currentPageId !== 'messages') ||
        !Number.isInteger(parsed.selectedChannelIndex) || !Number.isInteger(parsed.selectedMessageIndex) ||
        !Number.isFinite(parsed.updatedAt) || (parsed.selectedChannelId !== undefined && typeof parsed.selectedChannelId !== 'string')) return null
      return parsed as AppSnapshot
    } catch { return null }
  }
  private async readSnapshotWithTimeout(): Promise<AppSnapshot | null> {
    let timeout: ReturnType<typeof setTimeout> | undefined
    try {
      return await Promise.race([
        this.readSnapshot().catch(() => null),
        new Promise<null>(resolve => { timeout = setTimeout(() => resolve(null), storageTimeoutMs) }),
      ])
    } finally { if (timeout) clearTimeout(timeout) }
  }
  private enqueueBridge<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.bridgeQueue.then(operation)
    this.bridgeQueue = result.then(() => undefined, () => undefined)
    return result
  }
  private enqueueBridgeWithTimeout<T>(operation: () => Promise<T>, name: string): Promise<T> {
    const started = this.bridgeQueue.then(operation)
    let timeout: ReturnType<typeof setTimeout> | undefined
    const result = Promise.race([
      started,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error(`${name} timed out after ${bridgeTimeoutMs}ms`)), bridgeTimeoutMs)
      }),
    ]).finally(() => { if (timeout) clearTimeout(timeout) })
    this.bridgeQueue = result.then(() => undefined, () => undefined)
    return result
  }
}
