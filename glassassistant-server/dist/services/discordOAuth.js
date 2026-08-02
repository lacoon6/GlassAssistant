import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { env } from '../config/env.js';
const authorizeEndpoint = 'https://discord.com/oauth2/authorize';
const tokenEndpoint = 'https://discord.com/api/v10/oauth2/token';
const expiryMarginMs = 60_000;
export class DiscordOAuthService {
    createAuthorizationUrl(request) {
        const verifier = this.randomBase64Url(64);
        const state = this.randomBase64Url(32);
        const challenge = createHash('sha256').update(verifier).digest('base64url');
        request.session.pkceVerifier = verifier;
        request.session.oauthState = state;
        return `${authorizeEndpoint}?${new URLSearchParams({
            client_id: env.discordClientId,
            redirect_uri: env.discordRedirectUri,
            response_type: 'code',
            scope: 'identify guilds',
            state,
            code_challenge: challenge,
            code_challenge_method: 'S256',
        })}`;
    }
    async completeAuthorization(request, code, returnedState) {
        const expectedState = request.session.oauthState;
        const verifier = request.session.pkceVerifier;
        delete request.session.oauthState;
        delete request.session.pkceVerifier;
        if (!expectedState || !verifier || !this.statesMatch(expectedState, returnedState)) {
            throw new Error('Invalid OAuth state');
        }
        request.session.discordTokens = await this.requestTokens(new URLSearchParams({
            client_id: env.discordClientId,
            client_secret: env.discordClientSecret,
            grant_type: 'authorization_code',
            code,
            redirect_uri: env.discordRedirectUri,
            code_verifier: verifier,
        }));
    }
    async getValidAccessToken(request) {
        const tokens = request.session.discordTokens;
        if (!tokens)
            return null;
        if (Date.now() < tokens.expiresAt - expiryMarginMs)
            return tokens.accessToken;
        try {
            request.session.discordTokens = await this.requestTokens(new URLSearchParams({
                client_id: env.discordClientId,
                client_secret: env.discordClientSecret,
                grant_type: 'refresh_token',
                refresh_token: tokens.refreshToken,
            }));
            return request.session.discordTokens.accessToken;
        }
        catch {
            delete request.session.discordTokens;
            return null;
        }
    }
    async requestTokens(body) {
        const response = await fetch(tokenEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body,
        });
        if (!response.ok)
            throw new Error(`Discord token request failed with status ${response.status}`);
        const payload = (await response.json());
        if (!payload.access_token || !payload.refresh_token || !Number.isFinite(payload.expires_in)) {
            throw new Error('Discord returned an invalid token response');
        }
        return {
            accessToken: payload.access_token,
            refreshToken: payload.refresh_token,
            expiresAt: Date.now() + payload.expires_in * 1_000,
        };
    }
    randomBase64Url(size) {
        return randomBytes(size).toString('base64url');
    }
    statesMatch(expected, received) {
        const expectedBytes = Buffer.from(expected);
        const receivedBytes = Buffer.from(received);
        return expectedBytes.length === receivedBytes.length && timingSafeEqual(expectedBytes, receivedBytes);
    }
}
