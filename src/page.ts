import { RebuildPageContainer, TextContainerProperty } from '@evenrealities/even_hub_sdk'

export type PageId = 'configuration-error' | 'home' | 'settings' | 'servers' | 'channels' | 'messages' | 'detail'

export type PageAction =
  | { type: 'none' }
  | { type: 'render' }
  | { type: 'navigate'; page: PageId }

export abstract class Page {
  protected selectedIndex = 0

  public abstract readonly id: PageId
  protected abstract render(): string

  public Load(): Promise<void> {
    return Promise.resolve()
  }

  public ShowsLoadingState(): boolean {
    return false
  }

  public createContainer(): TextContainerProperty {
    return new TextContainerProperty({
      xPosition: 0,
      yPosition: 0,
      width: 576,
      height: 288,
      borderWidth: 0,
      borderColor: 5,
      paddingLength: 4,
      containerID: 1,
      containerName: 'main',
      content: this.render(),
      isEventCapture: 1,
    })
  }

  public createRebuildContainer(): RebuildPageContainer {
    return new RebuildPageContainer({
      containerTotalNum: 1,
      textObject: [this.createContainer()],
    })
  }

  public moveSelection(_direction: -1 | 1): PageAction {
    return { type: 'none' }
  }

  public select(): PageAction {
    return { type: 'none' }
  }

  protected renderMenu(title: string, items: readonly string[]): string {
    const rows = items.map((item, index) => `${index === this.selectedIndex ? '▶' : ' '} ${item}`)
    return `${title}\n\n${rows.join('\n')}`
  }

  protected moveWithin(itemCount: number, direction: -1 | 1): PageAction {
    if (itemCount < 2) return { type: 'none' }
    this.selectedIndex = (this.selectedIndex + direction + itemCount) % itemCount
    return { type: 'render' }
  }
}
