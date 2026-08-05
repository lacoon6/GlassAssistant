import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { DiscordApiError, DiscordApiService } from '../src/services/discordApi.js'
import { frontendAuthResultUrl } from '../src/config/frontendUrl.js'

const originalFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = originalFetch })

test('OAuth result returns to the same app WebView without secret query values', () => {
  assert.equal(frontendAuthResultUrl('https://api.nobutv.org/app/', 'success'), 'https://api.nobutv.org/app/?auth=success')
  assert.equal(frontendAuthResultUrl('https://api.nobutv.org/app/?old=value#fragment', 'error'), 'https://api.nobutv.org/app/?auth=error')
})

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

test('default channels selects the only guild shared by user and bot and filters non-text types', async () => {
  globalThis.fetch = async (input, init) => {
    const url = String(input)
    const authorization = new Headers(init?.headers).get('authorization')
    if (url.endsWith('/users/@me/guilds') && authorization === 'Bearer user-token') {
      return jsonResponse([{ id: 'shared', name: 'hidden' }, { id: 'user-only', name: 'hidden' }])
    }
    if (url.endsWith('/users/@me/guilds') && authorization === 'Bot bot-token') {
      return jsonResponse([{ id: 'shared', name: 'hidden' }])
    }
    return jsonResponse([
      { id: 'text', guild_id: 'shared', name: 'text', type: 0 },
      { id: 'announcement', guild_id: 'shared', name: 'announcement', type: 5 },
      { id: 'category', guild_id: 'shared', name: 'category', type: 4 },
      { id: 'voice', guild_id: 'shared', name: 'voice', type: 2 },
    ])
  }
  const channels = await new DiscordApiService('bot-token').getDefaultChannels('user-token') as Array<{ type: number }>
  assert.deepEqual(channels.map(channel => channel.type), [0, 5])
})

test('multiple shared guilds require explicit target configuration', async () => {
  globalThis.fetch = async () => jsonResponse([{ id: 'one', name: 'hidden' }, { id: 'two', name: 'hidden' }])
  await assert.rejects(
    new DiscordApiService('bot-token').getDefaultChannels('user-token'),
    (error: unknown) => error instanceof DiscordApiError && error.code === 'DISCORD_TARGET_GUILD_REQUIRED',
  )
})

test('resolved server listing automatically returns the only shared guild', async () => {
  globalThis.fetch = async (input, init) => {
    const authorization = new Headers(init?.headers).get('authorization')
    return authorization === 'Bearer user-token'
      ? jsonResponse([{ id: 'shared', name: 'Shared' }, { id: 'user-only', name: 'User only' }])
      : jsonResponse([{ id: 'shared', name: 'Bot shared' }])
  }
  assert.deepEqual(await new DiscordApiService('bot-token').getResolvedServers('user-token'), [
    { id: 'shared', name: 'Shared', unreadCount: 0 },
  ])
})

test('configured guild is preferred by resolved server listing', async () => {
  globalThis.fetch = async (_input, init) => {
    const authorization = new Headers(init?.headers).get('authorization')
    return authorization === 'Bearer user-token'
      ? jsonResponse([{ id: 'other', name: 'Other' }, { id: 'target', name: 'Target' }])
      : jsonResponse([{ id: 'other', name: 'Other' }, { id: 'target', name: 'Target' }])
  }
  assert.deepEqual(await new DiscordApiService('bot-token').getResolvedServers('user-token', 'target'), [
    { id: 'target', name: 'Target', unreadCount: 0 },
  ])
})

test('resolved server listing rejects multiple shared guilds without configuration', async () => {
  globalThis.fetch = async () => jsonResponse([{ id: 'one', name: 'One' }, { id: 'two', name: 'Two' }])
  await assert.rejects(
    new DiscordApiService('bot-token').getResolvedServers('user-token'),
    (error: unknown) => error instanceof DiscordApiError && error.code === 'DISCORD_TARGET_GUILD_REQUIRED',
  )
})

test('configured target requires both user and bot membership', async () => {
  let call = 0
  globalThis.fetch = async () => { call += 1; return jsonResponse(call === 1 ? [{ id: 'target', name: 'hidden' }] : []) }
  await assert.rejects(
    new DiscordApiService('bot-token').getDefaultChannels('user-token', 'target'),
    (error: unknown) => error instanceof DiscordApiError && error.code === 'BOT_NOT_IN_GUILD',
  )
})

test('messages expose timestamp and content-presence counts without changing auth order', async () => {
  let call = 0
  globalThis.fetch = async () => {
    call += 1
    if (call === 1) return jsonResponse({ id: 'channel', guild_id: 'guild', type: 0 })
    if (call === 2) return jsonResponse([{ id: 'guild', name: 'hidden' }])
    return jsonResponse([{ id: 'message', channel_id: 'channel', content: '', timestamp: '2026-08-05T00:00:00Z', attachments: [{}], embeds: [], author: { username: 'hidden' } }])
  }
  const messages = await new DiscordApiService('bot-token').getMessages('user-token', 'channel') as Array<{ attachmentCount: number; embedCount: number; timestamp: string }>
  assert.deepEqual(messages.map(({ attachmentCount, embedCount, timestamp }) => ({ attachmentCount, embedCount, timestamp })), [
    { attachmentCount: 1, embedCount: 0, timestamp: '2026-08-05T00:00:00Z' },
  ])
})
