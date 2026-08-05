import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import {
  EventSourceType, OsEventTypeList, StartUpPageCreateResult,
  type CreateStartUpPageContainer, type EvenHubEvent, type RebuildPageContainer,
} from '@evenrealities/even_hub_sdk'
import { App, type AppBridge } from '../src/app.js'
import { BackendApiError, BackendClient } from '../src/services/backend.js'
import { showConnectionFailure, showDiscordLogin } from '../src/phone-ui.js'
import { DiscordChannel } from '../src/models/channel.js'
import { DiscordMessage } from '../src/models/message.js'
import type { ChannelRepositoryResult, DiscordRepository, MessageRepositoryResult } from '../src/services/discord.js'

class FakeRepository implements DiscordRepository {
  public channels: ChannelRepositoryResult = { status: 'fresh', channels: [
    new DiscordChannel('text-1', 'hidden-guild', 'general', 0, 'text'),
    new DiscordChannel('category-1', 'hidden-guild', 'private-name', 0, 'category'),
    new DiscordChannel('voice-1', 'hidden-guild', 'voice', 0, 'category', null, 0, true),
    ...Array.from({ length: 10 }, (_, index) => new DiscordChannel(`text-${index + 2}`, 'hidden-guild', `room-${index + 2}`, 0, 'text')),
  ] }
  public messages: MessageRepositoryResult = { status: 'fresh', messages: [
    new DiscordMessage('m1', 'text-1', 'Author', 'Message body', '2026-08-05T01:02:00Z'),
  ] }
  public loginCalls = 0
  public channelCalls = 0
  public getServers() { return Promise.resolve({ status: 'fresh' as const, servers: [] }) }
  public getChannels() { this.channelCalls += 1; return Promise.resolve(this.channels) }
  public getMessages() { return Promise.resolve(this.messages) }
  public login() { this.loginCalls += 1; return Promise.resolve() }
  public logout() { return Promise.resolve() }
  public isLoggedIn() { return true }
  public isBackendConfigured() { return true }
  public loginUrl() { return 'https://api.nobutv.org/api/auth/login' }
}

class FakeBridge implements AppBridge {
  public startupCalls = 0
  public rebuilds: string[] = []
  public shutdownCalls = 0
  public saved: string[] = []
  public stored = ''
  private listener?: (event: EvenHubEvent) => void
  public createStartUpPageContainer(container: CreateStartUpPageContainer) {
    this.startupCalls += 1; this.rebuilds.push(container.textObject?.[0]?.content ?? '')
    return Promise.resolve(StartUpPageCreateResult.success)
  }
  public rebuildPageContainer(container: RebuildPageContainer) {
    this.rebuilds.push(container.textObject?.[0]?.content ?? ''); return Promise.resolve(true)
  }
  public shutDownPageContainer() { this.shutdownCalls += 1; return Promise.resolve(true) }
  public onEvenHubEvent(callback: (event: EvenHubEvent) => void) { this.listener = callback; return () => { this.listener = undefined } }
  public setLocalStorage(_key: string, value: string) { this.saved.push(value); this.stored = value; return Promise.resolve(true) }
  public getLocalStorage() { return Promise.resolve(this.stored) }
  public emit(event: EvenHubEvent) { this.listener?.(event) }
}

const pause = () => new Promise(resolve => setTimeout(resolve, 120))
const textEvent = (eventType?: OsEventTypeList) => ({ textEvent: { eventType } }) as EvenHubEvent
const sysEvent = (eventType?: OsEventTypeList, eventSource?: EventSourceType) => ({ sysEvent: { eventType, eventSource } }) as EvenHubEvent

test('startup opens filtered Discord channels and creates startup once', async () => {
  const bridge = new FakeBridge(); await new App(bridge, new FakeRepository()).start()
  assert.equal(bridge.startupCalls, 1)
  assert.match(bridge.rebuilds.at(-1) ?? '', /^Discord\n/)
  assert.doesNotMatch(bridge.rebuilds.join('\n'), /Settings|Servers|private-name|voice|Sensei/)
})

test('selection remains in viewport and click opens messages with loading state', async () => {
  const bridge = new FakeBridge(); await new App(bridge, new FakeRepository()).start()
  for (let index = 0; index < 9; index += 1) bridge.emit(textEvent(OsEventTypeList.SCROLL_BOTTOM_EVENT))
  await pause()
  assert.match(bridge.rebuilds.at(-1) ?? '', /10\/11/)
  bridge.emit(textEvent())
  await pause()
  assert.ok(bridge.rebuilds.some(content => content.includes('Loading messages...')))
  assert.match(bridge.rebuilds.at(-1) ?? '', /Discord messages/)
})

test('message empty and permission errors have distinct safe displays', async () => {
  for (const [result, expected] of [
    [{ status: 'fresh', messages: [] }, 'No messages'],
    [{ status: 'error', messages: [], errorCode: 'MESSAGE_HISTORY_ACCESS_DENIED' }, 'No history permission'],
  ] as const) {
    const repository = new FakeRepository(); repository.messages = result
    const bridge = new FakeBridge(); await new App(bridge, repository).start(); bridge.emit(textEvent()); await pause()
    assert.match(bridge.rebuilds.at(-1) ?? '', new RegExp(expected))
  }
})

test('ring double click returns to channels while temple double click exits at root', async () => {
  const bridge = new FakeBridge(); await new App(bridge, new FakeRepository()).start()
  bridge.emit(textEvent()); await pause()
  bridge.emit(sysEvent(OsEventTypeList.DOUBLE_CLICK_EVENT, EventSourceType.TOUCH_EVENT_FROM_RING)); await pause()
  assert.match(bridge.rebuilds.at(-1) ?? '', /^Discord\n/)
  bridge.emit(sysEvent(OsEventTypeList.DOUBLE_CLICK_EVENT, EventSourceType.TOUCH_EVENT_FROM_GLASSES_R)); await pause()
  assert.equal(bridge.shutdownCalls, 1)
})

test('state saves, restores valid selection, rejects broken JSON, and handles foreground events', async () => {
  const bridge = new FakeBridge(); await new App(bridge, new FakeRepository()).start()
  bridge.emit(textEvent(OsEventTypeList.SCROLL_BOTTOM_EVENT)); await pause()
  assert.equal(JSON.parse(bridge.saved.at(-1) ?? '{}').selectedChannelIndex, 1)
  bridge.emit(sysEvent(OsEventTypeList.FOREGROUND_EXIT_EVENT)); await pause()
  assert.ok(bridge.saved.length >= 2)
  const restored = new FakeBridge(); restored.stored = bridge.stored; await new App(restored, new FakeRepository()).start()
  assert.match(restored.rebuilds.at(-1) ?? '', /2\/11/)
  restored.emit(sysEvent(OsEventTypeList.FOREGROUND_ENTER_EVENT)); await pause()
  assert.equal(restored.startupCalls, 1)
  const broken = new FakeBridge(); broken.stored = '{broken'; await new App(broken, new FakeRepository()).start()
  assert.match(broken.rebuilds.at(-1) ?? '', /1\/11/)
})

test('source does not reference unavailable background APIs or private shims', () => {
  const source = readFileSync(new URL('../src/app.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /setBackgroundState|onBackgroundRestore|__getStateSnapshot/)
})

test('backend distinguishes 401 from fetch network or CORS failure', async () => {
  const unauthorized = new BackendClient('https://api.example', async () => new Response('{}', { status: 401 }), () => undefined)
  await assert.rejects(unauthorized.DefaultChannels(), (error: unknown) =>
    error instanceof BackendApiError && error.code === 'DISCORD_LOGIN_REQUIRED' && error.status === 401)
  const network = new BackendClient('https://api.example', async () => { throw new TypeError('hidden browser detail') }, () => undefined)
  await assert.rejects(network.DefaultChannels(), (error: unknown) =>
    error instanceof BackendApiError && error.code === 'NETWORK_OR_CORS_ERROR' && error.status === undefined)
})

test('phone login UI uses a safe real anchor with touchable unobstructed styles and guarded diagnostics', async () => {
  type Listener = () => void
  class FakeElement {
    public textContent = ''; public href = ''; public target = ''; public rel = ''; public type = ''
    public style: Record<string, string> = {}; public children: FakeElement[] = []
    public listeners = new Map<string, Listener>()
    public addEventListener(name: string, listener: Listener) { this.listeners.set(name, listener) }
    public replaceChildren(...values: FakeElement[]) { this.children = values }
  }
  const documentRef = { createElement: () => new FakeElement() } as unknown as Document
  const container = new FakeElement()
  const logs: unknown[][] = []
  showDiscordLogin(container as unknown as HTMLElement, 'https://api.nobutv.org/api/auth/login', {
    documentRef, logger: { info: (...values: unknown[]) => { logs.push(values) } } as Console,
  })
  const link = container.children[1]
  assert.deepEqual(container.children.map(child => child.textContent), ['Discord login required', 'Discord Login'])
  assert.equal(link.href, 'https://api.nobutv.org/api/auth/login')
  assert.equal(link.target, '_self'); assert.equal(link.rel, 'nofollow')
  assert.equal(link.style.pointerEvents, 'auto'); assert.equal(link.style.minHeight, '48px')
  assert.equal(container.style.pointerEvents, 'auto'); assert.equal(container.style.position, 'relative')
  assert.ok(link.listeners.has('pointerdown')); assert.ok(link.listeners.has('touchend')); assert.ok(link.listeners.has('click'))
  link.listeners.get('pointerdown')?.(); link.listeners.get('touchend')?.(); link.listeners.get('click')?.(); link.listeners.get('click')?.()
  assert.equal(logs.filter(values => values[0] === 'login navigation requested').length, 1)
  await new Promise(resolve => setTimeout(resolve, 0))
  assert.deepEqual(container.children.map(child => child.textContent), ['Opening Discord...'])

  let retryCalls = 0
  showConnectionFailure(container as unknown as HTMLElement, 'https://api.nobutv.org/api/auth/login', () => { retryCalls += 1 }, { documentRef })
  assert.deepEqual(container.children.map(child => child.textContent), ['Connection failed', 'Retry', 'Discord Login'])
  container.children[1].listeners.get('click')?.(); assert.equal(retryCalls, 1)
})

test('BackendClient accepts only the configured absolute HTTPS login origin', () => {
  let destination = ''
  const backend = new BackendClient('https://api.nobutv.org', fetch, url => { destination = url })
  assert.equal(backend.LoginUrl(), 'https://api.nobutv.org/api/auth/login')
  backend.Login(); assert.equal(destination, 'https://api.nobutv.org/api/auth/login')
  for (const unsafe of ['javascript:alert(1)', 'http://api.nobutv.org', 'https://evil.example/path', 'https://api.nobutv.org/other']) {
    destination = ''; const client = new BackendClient(unsafe, fetch, url => { destination = url })
    assert.equal(client.LoginUrl(), null); client.Login(); assert.equal(destination, '')
  }
})

test('login-required G2 state is distinct and startup container is still created once', async () => {
  const repository = new FakeRepository(); repository.channels = { status: 'login-required', channels: [], errorCode: 'DISCORD_LOGIN_REQUIRED' }
  const bridge = new FakeBridge(); const app = new App(bridge, repository); await app.start()
  assert.equal(app.needsDiscordLogin(), true)
  assert.match(bridge.rebuilds.at(-1) ?? '', /Discord login required\nPress once or open phone/)
  assert.equal(bridge.startupCalls, 1)
})

test('network or CORS G2 state has a dedicated connection message', async () => {
  const repository = new FakeRepository(); repository.channels = { status: 'network-error', channels: [], errorCode: 'NETWORK_OR_CORS_ERROR' }
  const bridge = new FakeBridge(); await new App(bridge, repository).start()
  assert.match(bridge.rebuilds.at(-1) ?? '', /Connection failed\nCheck the phone app/)
})

test('G2 undefined CLICK_EVENT and R1 CLICK_EVENT start login once', async () => {
  for (const event of [sysEvent(undefined), sysEvent(OsEventTypeList.CLICK_EVENT, EventSourceType.TOUCH_EVENT_FROM_GLASSES_R)]) {
    const repository = new FakeRepository(); repository.channels = { status: 'login-required', channels: [], errorCode: 'DISCORD_LOGIN_REQUIRED' }
    const bridge = new FakeBridge(); await new App(bridge, repository).start(); bridge.emit(event); await pause()
    assert.equal(repository.loginCalls, 1)
  }
})

test('network Retry reuses the App startup container and changes 401 to login-required', async () => {
  const repository = new FakeRepository(); repository.channels = { status: 'network-error', channels: [], errorCode: 'NETWORK_OR_CORS_ERROR' }
  const bridge = new FakeBridge(); const app = new App(bridge, repository); await app.start()
  repository.channels = { status: 'login-required', channels: [], errorCode: 'DISCORD_LOGIN_REQUIRED' }
  bridge.emit(sysEvent(undefined)); await pause()
  assert.equal(bridge.startupCalls, 1); assert.equal(repository.channelCalls, 2); assert.equal(repository.loginCalls, 0)
  assert.equal(app.needsDiscordLogin(), true)
})

test('diagnostic source never logs Cookie, session, OAuth state, token, Bot Token, or Client Secret', () => {
  const source = readFileSync(new URL('../src/phone-ui.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /console\.(?:info|log)\([^\n]*(?:cookie|session|oauth state|token|client secret)/i)
})

test('OAuth return initializes the same App and fetches channels before consuming auth result', () => {
  const source = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8')
  assert.ok(source.indexOf('await app.start()') < source.indexOf("searchParams.get('auth')"))
  assert.match(source, /history\.replaceState\(null, '', window\.location\.pathname\)/)
})
