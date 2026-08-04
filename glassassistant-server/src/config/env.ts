import 'dotenv/config'
import { parseFrontendUrl } from './frontendUrl.js'
import { buildCorsAllowlist } from './corsPolicy.js'

export interface Environment {
  readonly nodeEnv: 'development' | 'production' | 'test'
  readonly port: number
  readonly trustProxy: boolean
  readonly frontendUrl: string
  readonly frontendOrigin: string
  readonly discordClientId: string
  readonly discordClientSecret: string
  readonly discordBotToken: string
  readonly discordTargetGuildId?: string
  readonly discordRedirectUri: string
  readonly sessionSecret: string
  readonly redisUrl?: string
  readonly corsAllowedOrigins: readonly string[]
  readonly corsDiagnostics: boolean
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
const discordRedirectUri = required('DISCORD_REDIRECT_URI')
const backendOrigin = new URL(discordRedirectUri).origin

export const env: Environment = {
  nodeEnv: getNodeEnv(),
  port,
  trustProxy: process.env.TRUST_PROXY === 'true',
  ...frontend,
  discordClientId: required('DISCORD_CLIENT_ID'),
  discordClientSecret: required('DISCORD_CLIENT_SECRET'),
  discordBotToken: required('DISCORD_BOT_TOKEN'),
  discordTargetGuildId: process.env.DISCORD_TARGET_GUILD_ID?.trim() || undefined,
  discordRedirectUri,
  sessionSecret: required('SESSION_SECRET'),
  redisUrl: process.env.REDIS_URL?.trim() || undefined,
  corsAllowedOrigins: buildCorsAllowlist(frontend.frontendOrigin, backendOrigin, process.env.CORS_ALLOWED_ORIGINS),
  corsDiagnostics: process.env.CORS_DIAGNOSTICS === 'true',
}

if (env.nodeEnv === 'production' && !env.redisUrl) {
  throw new Error('REDIS_URL is required in production')
}
