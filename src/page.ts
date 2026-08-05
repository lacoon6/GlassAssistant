import { TextContainerProperty, TextContainerUpgrade } from '@evenrealities/even_hub_sdk'

export type PageId = 'configuration-error' | 'home' | 'settings' | 'servers' | 'channels' | 'messages' | 'detail'

export type PageAction =
  | { type: 'none' }
  | { type: 'render' }
  | { type: 'navigate'; page: PageId }

export abstract class Page {
  protected selectedIndex = 0
  protected viewportStart = 0

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

  public createTextUpgrade(): TextContainerUpgrade {
    return new TextContainerUpgrade({
      containerID: 1,
      containerName: 'main',
      contentOffset: 0,
      contentLength: 0,
      content: this.render(),
    })
  }

  public moveSelection(_direction: -1 | 1): PageAction {
    return { type: 'none' }
  }

  public select(): PageAction {
    return { type: 'none' }
  }

  public getSelectedIndex(): number { return this.selectedIndex }
  public getViewportStart(): number { return this.viewportStart }
  public restoreSelection(index: number, itemCount: number): void {
    this.selectedIndex = itemCount > 0 ? Math.max(0, Math.min(Math.trunc(index), itemCount - 1)) : 0
    this.keepSelectionVisible(itemCount, 6)
  }

  protected renderMenu(title: string, items: readonly string[]): string {
    const rows = items.map((item, index) => `${index === this.selectedIndex ? '▶' : ' '} ${item}`)
    return `${title}\n\n${rows.join('\n')}`
  }

  protected moveWithin(itemCount: number, direction: -1 | 1): PageAction {
    if (itemCount < 2) return { type: 'none' }
    this.selectedIndex = (this.selectedIndex + direction + itemCount) % itemCount
    this.keepSelectionVisible(itemCount, 6)
    return { type: 'render' }
  }

  protected keepSelectionVisible(itemCount: number, visibleRows: number): void {
    if (itemCount <= 0) { this.selectedIndex = 0; this.viewportStart = 0; return }
    this.selectedIndex = Math.max(0, Math.min(this.selectedIndex, itemCount - 1))
    if (this.selectedIndex < this.viewportStart) this.viewportStart = this.selectedIndex
    if (this.selectedIndex >= this.viewportStart + visibleRows) this.viewportStart = this.selectedIndex - visibleRows + 1
    this.viewportStart = Math.max(0, Math.min(this.viewportStart, Math.max(0, itemCount - visibleRows)))
  }
}
