import { Page, PageAction } from '../page'
import type { DiscordAuthUseCase } from '../usecases/discord-auth'

export class SettingsPage extends Page {
  public readonly id = 'settings' as const

  public constructor(private readonly auth: DiscordAuthUseCase) {
    super()
  }

  protected render(): string {
    return this.renderMenu('Settings', ['Discord Login'])
  }

  public select(): PageAction {
    void this.auth.Login()
    return { type: 'render' }
  }
}
