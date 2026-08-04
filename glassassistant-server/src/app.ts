import cors from 'cors'
import express, { type NextFunction, type Request, type Response } from 'express'
import session from 'express-session'
import { RedisStore } from 'connect-redis'
import { createClient } from 'redis'
import { env } from './config/env.js'
import { createCorsOptions } from './config/corsPolicy.js'
import { authRouter } from './routes/auth.js'
import { discordRouter } from './routes/discord.js'
import { DiscordApiError } from './services/discordApi.js'

const app = express()
const redisClient = env.redisUrl ? createClient({ url: env.redisUrl }) : null
if (redisClient) {
  redisClient.on('error', error => console.error('Redis error', error))
  await redisClient.connect()
}
if (env.trustProxy) app.set('trust proxy', 1)

app.disable('x-powered-by')
app.use(cors(createCorsOptions(env.corsAllowedOrigins)))
app.use(express.json({ limit: '32kb' }))
app.use(
  session({
    name: 'glassassistant.sid',
    secret: env.sessionSecret,
    resave: false,
    saveUninitialized: false,
    store: redisClient ? new RedisStore({ client: redisClient, prefix: 'glassassistant:' }) : undefined,
    cookie: {
      httpOnly: true,
      secure: env.nodeEnv === 'production',
      sameSite: env.nodeEnv === 'production' ? 'none' : 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1_000,
    },
  }),
)

if (env.corsDiagnostics) {
  app.use((request, response, next) => {
    response.on('finish', () => console.info('Request diagnostic', {
      origin: request.get('origin') ?? null,
      secFetchSite: request.get('sec-fetch-site') ?? null,
      hasSessionCookie: Boolean(request.headers.cookie),
      hasDiscordOAuthToken: Boolean(request.session.discordTokens?.accessToken),
      route: request.path,
      responseStatus: response.statusCode,
    }))
    next()
  })
}

app.get('/health', (_request, response) => {
  response.status(200).type('application/json').json({ status: 'ok' })
})
app.use('/api/auth', authRouter)
app.use('/api/discord', discordRouter)

app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
  if (error instanceof Error && error.message === 'CORS origin denied') {
    response.status(403).json({ error: 'CORS_ORIGIN_DENIED' })
    return
  }
  if (error instanceof DiscordApiError) {
    response.status(error.status).json({ error: error.code })
    return
  }
  console.error(error)
  response.status(500).json({ error: 'Internal server error' })
})

app.listen(env.port, () => {
  console.log(`Glass Assistant server listening on port ${env.port}`)
})
