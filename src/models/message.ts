export class DiscordMessage {
  public constructor(
    public readonly id: string,
    public readonly channelId: string,
    public readonly author: string,
    public readonly content: string,
  ) {}
}
