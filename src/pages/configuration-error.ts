import { Page } from '../page'

export class ConfigurationErrorPage extends Page {
  public readonly id = 'configuration-error' as const

  protected render(): string {
    return 'Configuration Error\n\nBackend is not configured.'
  }
}
