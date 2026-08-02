export class DiscordServer {
  public constructor(
    public readonly id: string,
    public readonly name: string,
    public readonly unreadCount = 0,
  ) {}
}
