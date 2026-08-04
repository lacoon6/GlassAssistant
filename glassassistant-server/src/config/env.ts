import 'dotenv/config'
import { parseFrontendUrl } from './frontendUrl.js'

export interface Environment {
  readonly nodeEnv: 'development' | 'production' | 'test'
  readonly port: number
  readonly trustProxy: boolean
  readonly frontendUrl: string
  readonly frontendOrigin: string
  readonly discordClientId: string
  readonly discordClientSecret: string
  readonly discordBotToken: string
  readonly discordRedirectUri: string
  readonly sessionSecret: string
  readonly redisUrl?: string
}

function required(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
  return value
}

function getNodeEnv(): Environment['nodeEnv'] {
  const value = process.env.NODE_ENV ?? 'development'
  if (value === 'development' || value === 'production' || value === 'test') return value
  throw new Error('NODE_ENV must be development, production, or test')
}

const port = Number(process.env.PORT ?? 3100)
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be a valid TCP port')
const frontend = parseFrontendUrl(required('FRONTEND_URL'))

export const env: Environment = {
  nodeEnv: getNodeEnv(),
  port,
  trustProxy: process.env.TRUST_PROXY === 'true',
  ...frontend,
  discordClientId: required('DISCORD_CLIENT_ID'),
  discordClientSecret: required('DISCORD_CLIENT_SECRET'),
  discordBotToken: required('DISCORD_BOT_TOKEN'),
  discordRedirectUri: required('DISCORD_REDIRECT_URI'),
  sessionSecret: required('SESSION_SECRET'),
  redisUrl: process.env.REDIS_URL?.trim() || undefined,
}

if (env.nodeEnv === 'production' && !env.redisUrl) {
  throw new Error('REDIS_URL is required in production')
}
