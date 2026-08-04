import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { DiscordApiError, DiscordApiService } from '../src/services/discordApi.js'

const originalFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = originalFetch })

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

test('server listing uses only the user Bearer token', async () => {
  globalThis.fetch = async (_input, init) => {
    assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer user-token')
    return jsonResponse([])
  }
  await new DiscordApiService('bot-token').getServers('user-token')
})

test('channel listing verifies membership before using the bot token', async () => {
  const calls: string[] = []
  globalThis.fetch = async (input, init) => {
    calls.push(`${String(input)}|${new Headers(init?.headers).get('authorization')}`)
    return calls.length === 1 ? jsonResponse([{ id: 'guild-1', name: 'allowed' }]) : jsonResponse([])
  }
  await new DiscordApiService('bot-token').getChannels('user-token', 'guild-1')
  assert.match(calls[0], /\/users\/@me\/guilds\|Bearer user-token$/)
  assert.match(calls[1], /\/guilds\/guild-1\/channels\|Bot bot-token$/)
})

test('non-member guild is rejected without a bot request', async () => {
  let calls = 0
  globalThis.fetch = async () => { calls += 1; return jsonResponse([]) }
  await assert.rejects(
    new DiscordApiService('bot-token').getChannels('user-token', 'guild-1'),
    (error: unknown) => error instanceof DiscordApiError && error.code === 'USER_NOT_IN_GUILD',
  )
  assert.equal(calls, 1)
})

test('message listing resolves the guild, verifies membership, then reads with the bot', async () => {
  const authorizations: Array<string | null> = []
  globalThis.fetch = async (input, init) => {
    authorizations.push(new Headers(init?.headers).get('authorization'))
    const url = String(input)
    if (url.endsWith('/channels/channel-1')) return jsonResponse({ id: 'channel-1', guild_id: 'guild-1', type: 0 })
    if (url.endsWith('/users/@me/guilds')) return jsonResponse([{ id: 'guild-1', name: 'allowed' }])
    return jsonResponse([])
  }
  await new DiscordApiService('bot-token').getMessages('user-token', 'channel-1')
  assert.deepEqual(authorizations, ['Bot bot-token', 'Bearer user-token', 'Bot bot-token'])
})

test('DM channels are rejected before membership or message requests', async () => {
  let calls = 0
  globalThis.fetch = async () => { calls += 1; return jsonResponse({ id: 'dm-1', type: 1 }) }
  await assert.rejects(
    new DiscordApiService('bot-token').getMessages('user-token', 'dm-1'),
    (error: unknown) => error instanceof DiscordApiError && error.code === 'GUILD_CHANNEL_REQUIRED',
  )
  assert.equal(calls, 1)
})

test('Discord permission failures map to safe operation-specific codes', async () => {
  let calls = 0
  globalThis.fetch = async () => {
    calls += 1
    if (calls === 1) return jsonResponse([{ id: 'guild-1', name: 'allowed' }])
    return jsonResponse({}, 403)
  }
  await assert.rejects(
    new DiscordApiService('bot-token').getChannels('user-token', 'guild-1'),
    (error: unknown) => error instanceof DiscordApiError && error.code === 'BOT_CHANNEL_ACCESS_DENIED',
  )
})
