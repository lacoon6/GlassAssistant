const apiBaseUrl = 'https://discord.com/api/v10'

interface DiscordGuild {
  readonly id: string
  readonly name: string
}

interface DiscordChannel {
  readonly id: string
  readonly guild_id?: string
  readonly name?: string | null
  readonly type: number
  readonly parent_id?: string | null
  readonly position?: number
}

interface DiscordMessage {
  readonly id: string
  readonly channel_id: string
  readonly content: string
  readonly author: {
    readonly global_name?: string | null
    readonly username: string
  }
}

export class DiscordApiService {
  public async getServers(accessToken: string): Promise<unknown> {
    const guilds = await this.get<DiscordGuild[]>('/users/@me/guilds', accessToken)
    return guilds.map(guild => ({ id: guild.id, name: guild.name, unreadCount: 0 }))
  }

  public async getChannels(accessToken: string, guildId: string): Promise<unknown> {
    const channels = await this.get<DiscordChannel[]>(`/guilds/${encodeURIComponent(guildId)}/channels`, accessToken)
    return channels.map(channel => ({
      id: channel.id,
      guildId: channel.guild_id ?? guildId,
      name: channel.name ?? '',
      type: channel.type,
      parentId: channel.parent_id ?? null,
      position: channel.position ?? 0,
      unreadCount: 0,
    }))
  }

  public async getMessages(accessToken: string, channelId: string): Promise<unknown> {
    const messages = await this.get<DiscordMessage[]>(
      `/channels/${encodeURIComponent(channelId)}/messages?limit=50`,
      accessToken,
    )
    return messages.map(message => ({
      id: message.id,
      channelId: message.channel_id,
      author: message.author.global_name ?? message.author.username,
      content: message.content,
    }))
  }

  private async get<T>(path: string, accessToken: string): Promise<T> {
    const response = await fetch(`${apiBaseUrl}${path}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!response.ok) throw new DiscordApiError(response.status)
    return (await response.json()) as T
  }
}

export class DiscordApiError extends Error {
  public constructor(public readonly status: number) {
    super(`Discord API request failed with status ${status}`)
  }
}
