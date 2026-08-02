import { Page, PageAction } from '../page'

export class HomePage extends Page {
  public readonly id = 'home' as const

  protected render(): string {
    return this.renderMenu('Glass Assistant', ['Discord', 'Settings'])
  }

  public moveSelection(direction: -1 | 1): PageAction {
    return this.moveWithin(2, direction)
  }

  public select(): PageAction {
    return {
      type: 'navigate',
      page: this.selectedIndex === 0 ? 'servers' : 'settings',
    }
  }
}
