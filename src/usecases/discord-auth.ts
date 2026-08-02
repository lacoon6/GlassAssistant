import type { DiscordRepository } from '../services/discord'

export class DiscordAuthUseCase {
  public constructor(private readonly repository: DiscordRepository) {}

  public Login(): Promise<void> {
    return this.repository.login()
  }

  public Logout(): Promise<void> {
    return this.repository.logout()
  }

  public IsLoggedIn(): boolean {
    return this.repository.isLoggedIn()
  }

  public IsConfigured(): boolean {
    return this.repository.isBackendConfigured()
  }
}
