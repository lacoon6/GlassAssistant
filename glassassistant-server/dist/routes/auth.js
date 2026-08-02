import { Router } from 'express';
import { env } from '../config/env.js';
import { DiscordOAuthService } from '../services/discordOAuth.js';
export const authRouter = Router();
const oauth = new DiscordOAuthService();
authRouter.get('/login', (request, response) => {
    response.redirect(oauth.createAuthorizationUrl(request));
});
authRouter.get('/callback', async (request, response, next) => {
    const code = typeof request.query.code === 'string' ? request.query.code : null;
    const state = typeof request.query.state === 'string' ? request.query.state : null;
    if (!code || !state) {
        response.status(400).json({ error: 'Invalid Discord OAuth callback' });
        return;
    }
    try {
        await oauth.completeAuthorization(request, code, state);
        response.redirect(env.frontendUrl);
    }
    catch (error) {
        next(error);
    }
});
authRouter.get('/logout', (request, response, next) => {
    request.session.destroy(error => {
        if (error) {
            next(error);
            return;
        }
        response.clearCookie('glassassistant.sid');
        response.status(204).end();
    });
});
