import { DiscordOAuthService } from '../services/discordOAuth.js';
const oauth = new DiscordOAuthService();
export async function requireDiscordAuth(request, response, next) {
    const accessToken = await oauth.getValidAccessToken(request);
    if (!accessToken) {
        response.status(401).json({ error: 'Discord Login Required' });
        return;
    }
    response.locals.discordAccessToken = accessToken;
    next();
}
