import { Page } from '../page'
import type { GetMessagesUseCase } from '../usecases/get-messages'

export class MessageDetailPage extends Page {
  public readonly id = 'detail' as const

  public constructor(private readonly getMessages: GetMessagesUseCase) {
    super()
  }

  protected render(): string {
    const message = this.getMessages.Execute()[0]
    if (!message) return 'Empty'
    return `${message.author}\n\n${message.content}`
  }
}
