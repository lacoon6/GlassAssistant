import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import type { Request } from 'express'
import { env } from '../config/env.js'

interface DiscordTokenResponse {
  readonly access_token: string
  readonly refresh_token: string
  readonly expires_in: number
}

export interface SessionTokens {
  readonly accessToken: string
  readonly refreshToken: string
  readonly expiresAt: number
}

declare module 'express-session' {
  interface SessionData {
    discordTokens?: SessionTokens
    oauthState?: string
    pkceVerifier?: string
  }
}

const authorizeEndpoint = 'https://discord.com/oauth2/authorize'
const tokenEndpoint = 'https://discord.com/api/v10/oauth2/token'
const expiryMarginMs = 60_000

export class DiscordOAuthService {
  public createAuthorizationUrl(request: Request): string {
    const verifier = this.randomBase64Url(64)
    const state = this.randomBase64Url(32)
    const challenge = createHash('sha256').update(verifier).digest('base64url')
    request.session.pkceVerifier = verifier
    request.session.oauthState = state

    return `${authorizeEndpoint}?${new URLSearchParams({
      client_id: env.discordClientId,
      redirect_uri: env.discordRedirectUri,
      response_type: 'code',
      scope: 'identify guilds',
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
    })}`
  }

  public async completeAuthorization(request: Request, code: string, returnedState: string): Promise<void> {
    const expectedState = request.session.oauthState
    const verifier = request.session.pkceVerifier
    delete request.session.oauthState
    delete request.session.pkceVerifier

    if (!expectedState || !verifier || !this.statesMatch(expectedState, returnedState)) {
      throw new Error('Invalid OAuth state')
    }

    request.session.discordTokens = await this.requestTokens(
      new URLSearchParams({
        client_id: env.discordClientId,
        client_secret: env.discordClientSecret,
        grant_type: 'authorization_code',
        code,
        redirect_uri: env.discordRedirectUri,
        code_verifier: verifier,
      }),
    )
  }

  public async getValidAccessToken(request: Request): Promise<string | null> {
    const tokens = request.session.discordTokens
    if (!tokens) return null
    if (Date.now() < tokens.expiresAt - expiryMarginMs) return tokens.accessToken

    try {
      request.session.discordTokens = await this.requestTokens(
        new URLSearchParams({
          client_id: env.discordClientId,
          client_secret: env.discordClientSecret,
          grant_type: 'refresh_token',
          refresh_token: tokens.refreshToken,
        }),
      )
      return request.session.discordTokens.accessToken
    } catch {
      delete request.session.discordTokens
      return null
    }
  }

  private async requestTokens(body: URLSearchParams): Promise<SessionTokens> {
    const response = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    })
    if (!response.ok) throw new Error(`Discord token request failed with status ${response.status}`)

    const payload = (await response.json()) as DiscordTokenResponse
    if (!payload.access_token || !payload.refresh_token || !Number.isFinite(payload.expires_in)) {
      throw new Error('Discord returned an invalid token response')
    }
    return {
      accessToken: payload.access_token,
      refreshToken: payload.refresh_token,
      expiresAt: Date.now() + payload.expires_in * 1_000,
    }
  }

  private randomBase64Url(size: number): string {
    return randomBytes(size).toString('base64url')
  }

  private statesMatch(expected: string, received: string): boolean {
    const expectedBytes = Buffer.from(expected)
    const receivedBytes = Buffer.from(received)
    return expectedBytes.length === receivedBytes.length && timingSafeEqual(expectedBytes, receivedBytes)
  }
}
