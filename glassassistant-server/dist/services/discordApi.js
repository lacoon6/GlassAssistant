const apiBaseUrl = 'https://discord.com/api/v10';
export class DiscordApiService {
    async getServers(accessToken) {
        const guilds = await this.get('/users/@me/guilds', accessToken);
        return guilds.map(guild => ({ id: guild.id, name: guild.name, unreadCount: 0 }));
    }
    async getChannels(accessToken, guildId) {
        const channels = await this.get(`/guilds/${encodeURIComponent(guildId)}/channels`, accessToken);
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
        const messages = await this.get(`/channels/${encodeURIComponent(channelId)}/messages?limit=50`, accessToken);
        return messages.map(message => ({
            id: message.id,
            channelId: message.channel_id,
            author: message.author.global_name ?? message.author.username,
            content: message.content,
        }));
    }
    async get(path, accessToken) {
        const response = await fetch(`${apiBaseUrl}${path}`, {
            headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!response.ok)
            throw new DiscordApiError(response.status);
        return (await response.json());
    }
}
export class DiscordApiError extends Error {
    status;
    constructor(status) {
        super(`Discord API request failed with status ${status}`);
        this.status = status;
    }
}
