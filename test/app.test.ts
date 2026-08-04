import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import {
  EventSourceType, OsEventTypeList, StartUpPageCreateResult,
  type CreateStartUpPageContainer, type EvenHubEvent, type RebuildPageContainer,
} from '@evenrealities/even_hub_sdk'
import { App, type AppBridge } from '../src/app.js'
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
  public getServers() { return Promise.resolve({ status: 'fresh' as const, servers: [] }) }
  public getChannels() { return Promise.resolve(this.channels) }
  public getMessages() { return Promise.resolve(this.messages) }
  public login() { return Promise.resolve() }
  public logout() { return Promise.resolve() }
  public isLoggedIn() { return true }
  public isBackendConfigured() { return true }
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
const sysEvent = (eventType: OsEventTypeList, eventSource?: EventSourceType) => ({ sysEvent: { eventType, eventSource } }) as EvenHubEvent

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
