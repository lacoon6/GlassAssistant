export type DiscordChannelKind = 'category' | 'text' | 'announcement' | 'thread'

export class DiscordChannel {
  public constructor(
    public readonly id: string,
    public readonly serverId: string,
    public readonly name: string,
    public readonly unreadCount = 0,
    public readonly kind: DiscordChannelKind = 'text',
    public readonly parentId: string | null = null,
    public readonly position = 0,
    public readonly readOnly = false,
  ) {}
}
