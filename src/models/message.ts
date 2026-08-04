export class DiscordMessage {
  public constructor(
    public readonly id: string,
    public readonly channelId: string,
    public readonly author: string,
    public readonly content: string,
    public readonly timestamp = '',
    public readonly attachmentCount = 0,
    public readonly embedCount = 0,
  ) {}
}
