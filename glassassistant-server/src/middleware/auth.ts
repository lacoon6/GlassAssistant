import type { NextFunction, Request, Response } from 'express'
import { DiscordOAuthService } from '../services/discordOAuth.js'

declare global {
  namespace Express {
    interface Locals {
      discordAccessToken: string
    }
  }
}

const oauth = new DiscordOAuthService()

export async function requireDiscordAuth(request: Request, response: Response, next: NextFunction): Promise<void> {
  const accessToken = await oauth.getValidAccessToken(request)
  if (!accessToken) {
    response.status(401).json({ error: 'Discord Login Required' })
    return
  }
  response.locals.discordAccessToken = accessToken
  next()
}
