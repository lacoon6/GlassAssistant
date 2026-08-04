const apiBaseUrl = 'https://discord.com/api/v10';
export class DiscordApiService {
    botToken;
    constructor(botToken) {
        this.botToken = botToken;
    }
    async getServers(accessToken) {
        const guilds = await this.getUserGuilds(accessToken);
        return guilds.map(guild => ({ id: guild.id, name: guild.name, unreadCount: 0 }));
    }
    async getChannels(accessToken, guildId) {
        await this.requireGuildMembership(accessToken, guildId);
        const channels = await this.getWithBot(`/guilds/${encodeURIComponent(guildId)}/channels`, 'guildChannels');
        return channels.map(channel => ({
            id: channel.id,
            guildId: channel.guild_id ?? guildId,
            name: channel.name ?? '',
            type: channel.type,
            parentId: channel.parent_id ?? null,
            position: channel.position ?? 0,
            unreadCount: 0,
        }));
    }
    async getMessages(accessToken, channelId) {
        const channel = await this.getWithBot(`/channels/${encodeURIComponent(channelId)}`, 'channel');
        if (!channel.guild_id)
            throw new DiscordApiError(403, 'GUILD_CHANNEL_REQUIRED');
        await this.requireGuildMembership(accessToken, channel.guild_id);
        const messages = await this.getWithBot(`/channels/${encodeURIComponent(channelId)}/messages?limit=50`, 'messages');
        return messages.map(message => ({
            id: message.id,
            channelId: message.channel_id,
            author: message.author.global_name ?? message.author.username,
            content: message.content,
        }));
    }
    async getUserGuilds(accessToken) {
        return this.get('/users/@me/guilds', `Bearer ${accessToken}`, 'userGuilds');
    }
    async requireGuildMembership(accessToken, guildId) {
        const guilds = await this.getUserGuilds(accessToken);
        if (!guilds.some(guild => guild.id === guildId))
            throw new DiscordApiError(403, 'USER_NOT_IN_GUILD');
    }
    async getWithBot(path, operation) {
        return this.get(path, `Bot ${this.botToken}`, operation);
    }
    async get(path, authorization, operation) {
        const response = await fetch(`${apiBaseUrl}${path}`, {
            headers: { Authorization: authorization },
        });
        if (!response.ok)
            throw mapDiscordError(response.status, operation);
        return (await response.json());
    }
}
export class DiscordApiError extends Error {
    status;
    code;
    constructor(status, code) {
        super(code);
        this.status = status;
        this.code = code;
    }
}
function mapDiscordError(status, operation) {
    if (operation === 'userGuilds') {
        return status === 401 ? new DiscordApiError(401, 'USER_TOKEN_INVALID') :
            new DiscordApiError(502, 'DISCORD_API_UNAVAILABLE');
    }
    if (status === 401)
        return new DiscordApiError(502, 'BOT_TOKEN_INVALID');
    if (operation === 'guildChannels' && status === 404)
        return new DiscordApiError(403, 'BOT_NOT_IN_GUILD');
    if (operation === 'messages' && status === 403)
        return new DiscordApiError(403, 'MESSAGE_HISTORY_ACCESS_DENIED');
    if ((operation === 'guildChannels' || operation === 'channel') && (status === 403 || status === 404)) {
        return new DiscordApiError(403, 'BOT_CHANNEL_ACCESS_DENIED');
    }
    return new DiscordApiError(502, 'DISCORD_API_UNAVAILABLE');
}
