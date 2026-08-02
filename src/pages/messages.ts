import { Page, PageAction } from '../page'
import type { GetMessagesUseCase } from '../usecases/get-messages'

export class MessageListPage extends Page {
  public readonly id = 'messages' as const

  public constructor(private readonly getMessages: GetMessagesUseCase) {
    super()
  }

  public async Load(): Promise<void> {
    await this.getMessages.Load()
  }

  protected render(): string {
    const messages = this.getMessages.Execute()
    if (messages.length === 0) return 'Empty'
    return this.renderMenu(
      'Messages',
      messages.map(message => `${message.author}: ${message.content}`),
    )
  }

  public moveSelection(direction: -1 | 1): PageAction {
    return this.moveWithin(this.getMessages.Execute().length, direction)
  }

  public select(): PageAction {
    return { type: 'navigate', page: 'detail' }
  }
}
