export function showDiscordLogin(container: HTMLElement, login: () => void, documentRef: Document = document): void {
  const message = documentRef.createElement('div')
  message.textContent = 'Discord login required'
  const button = documentRef.createElement('button')
  button.type = 'button'
  button.textContent = 'Discord Login'
  button.addEventListener('click', login)
  container.replaceChildren(message, button)
}

export function showConnectionFailure(container: HTMLElement, login: () => void, documentRef: Document = document): void {
  const message = documentRef.createElement('div')
  message.textContent = 'Connection failed. Check network or WebView access.'
  const button = documentRef.createElement('button')
  button.type = 'button'
  button.textContent = 'Discord Login'
  button.addEventListener('click', login)
  container.replaceChildren(message, button)
}
