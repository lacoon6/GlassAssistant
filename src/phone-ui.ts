type LoginLinkOptions = {
  readonly documentRef?: Document
  readonly logger?: Pick<Console, 'info'>
}

function styleContainer(container: HTMLElement): void {
  Object.assign(container.style, {
    display: 'flex', flexDirection: 'column', gap: '16px', width: '100%', minHeight: '100%',
    pointerEvents: 'auto', touchAction: 'manipulation', position: 'relative', zIndex: '1', boxSizing: 'border-box',
  })
}

function createLoginLink(container: HTMLElement, loginUrl: string, options: LoginLinkOptions): HTMLAnchorElement {
  const documentRef = options.documentRef ?? document
  const logger = options.logger ?? console
  const link = documentRef.createElement('a')
  link.href = loginUrl
  link.target = '_self'
  link.rel = 'nofollow'
  link.textContent = 'Discord Login'
  Object.assign(link.style, {
    display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '48px', padding: '12px 20px',
    pointerEvents: 'auto', touchAction: 'manipulation', position: 'relative', zIndex: '2', userSelect: 'none',
    WebkitUserSelect: 'none', boxSizing: 'border-box',
  })
  let navigationRequested = false
  link.addEventListener('pointerdown', () => logger.info('login-link pointerdown'))
  link.addEventListener('touchend', () => logger.info('login-link touchend'))
  link.addEventListener('click', () => {
    logger.info('login-link click')
    if (navigationRequested) return
    navigationRequested = true
    logger.info('login navigation requested')
    const location = typeof window === 'undefined' ? { origin: '', pathname: '' } : window.location
    logger.info('current origin', location.origin)
    logger.info('current pathname', location.pathname)
    setTimeout(() => {
      const opening = documentRef.createElement('div')
      opening.textContent = 'Opening Discord...'
      container.replaceChildren(opening)
    }, 0)
  })
  return link
}

export function showDiscordLogin(container: HTMLElement, loginUrl: string, options: LoginLinkOptions = {}): void {
  const documentRef = options.documentRef ?? document
  styleContainer(container)
  const message = documentRef.createElement('div')
  message.textContent = 'Discord login required'
  container.replaceChildren(message, createLoginLink(container, loginUrl, options))
}

export function showConnectionFailure(container: HTMLElement, loginUrl: string, retry: () => void, options: LoginLinkOptions = {}): void {
  const documentRef = options.documentRef ?? document
  styleContainer(container)
  const message = documentRef.createElement('div')
  message.textContent = 'Connection failed'
  const retryButton = documentRef.createElement('button')
  retryButton.type = 'button'
  retryButton.textContent = 'Retry'
  Object.assign(retryButton.style, { minHeight: '48px', padding: '12px 20px', pointerEvents: 'auto', touchAction: 'manipulation' })
  retryButton.addEventListener('click', retry)
  container.replaceChildren(message, retryButton, createLoginLink(container, loginUrl, options))
}
