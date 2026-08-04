import assert from 'node:assert/strict'
import { once } from 'node:events'
import { test } from 'node:test'
import cors from 'cors'
import express from 'express'
import { buildCorsAllowlist, createCorsOptions } from '../src/config/corsPolicy.js'

test('credentialed CORS reflects only exact allowlisted origins and varies by Origin', async () => {
  const allowed = 'https://api.nobutv.org'
  const app = express()
  app.use(cors(createCorsOptions(buildCorsAllowlist(allowed, allowed))))
  app.get('/test', (_request, response) => response.json({ ok: true }))
  app.use((_error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => response.status(403).end())
  const server = app.listen(0)
  await once(server, 'listening')
  try {
    const address = server.address()
    assert.ok(address && typeof address !== 'string')
    const url = `http://127.0.0.1:${address.port}/test`
    const accepted = await fetch(url, { headers: { Origin: allowed } })
    assert.equal(accepted.headers.get('access-control-allow-origin'), allowed)
    assert.equal(accepted.headers.get('access-control-allow-credentials'), 'true')
    assert.match(accepted.headers.get('vary') ?? '', /Origin/i)
    assert.notEqual(accepted.headers.get('access-control-allow-origin'), '*')
    const rejected = await fetch(url, { headers: { Origin: 'https://invalid.example' } })
    assert.equal(rejected.headers.get('access-control-allow-origin'), null)
  } finally { server.close() }
})
