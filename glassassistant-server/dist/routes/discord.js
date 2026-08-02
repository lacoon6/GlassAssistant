import { Router } from 'express';
import { requireDiscordAuth } from '../middleware/auth.js';
import { DiscordApiService } from '../services/discordApi.js';
export const discordRouter = Router();
const discord = new DiscordApiService();
discordRouter.use(requireDiscordAuth);
discordRouter.get('/servers', async (_request, response, next) => {
    try {
        response.json(await discord.getServers(response.locals.discordAccessToken));
    }
    catch (error) {
        next(error);
    }
});
discordRouter.get('/channels', async (request, response, next) => {
    const guildId = typeof request.query.guildId === 'string' ? request.query.guildId : null;
    if (!guildId) {
        response.status(400).json({ error: 'guildId is required' });
        return;
    }
    try {
        response.json(await discord.getChannels(response.locals.discordAccessToken, guildId));
    }
    catch (error) {
        next(error);
    }
});
discordRouter.get('/messages', async (request, response, next) => {
    const channelId = typeof request.query.channelId === 'string' ? request.query.channelId : null;
    if (!channelId) {
        response.status(400).json({ error: 'channelId is required' });
        return;
    }
    try {
        response.json(await discord.getMessages(response.locals.discordAccessToken, channelId));
    }
    catch (error) {
        next(error);
    }
});
