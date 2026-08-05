import { waitForEvenAppBridge } from '@evenrealities/even_hub_sdk'
import { App } from './app'
import { DummyDiscordRepository } from './services/discord'
import { showConnectionFailure, showDiscordLogin } from './phone-ui'

const statusElement = document.querySelector<HTMLElement>('#app')

function showStatus(message: string): void {
  if (statusElement) statusElement.textContent = message
}

function safeErrorSummary(error: unknown): string {
  if (error instanceof Error) {
    const startupResult = error.message.match(/^createStartUpPageContainer failed with result (\d+)$/)
    return startupResult ? startupResult[0] : error.name
  }
  return 'Unknown error'
}

async function main(): Promise<void> {
  console.info('WebView location', { origin: window.location.origin, pathname: window.location.pathname })
  let bridge
  try {
    bridge = await waitForEvenAppBridge()
    console.log('waitForEvenAppBridge complete')
  } catch (error) {
    throw new Error(`waitForEvenAppBridge failed: ${safeErrorSummary(error)}`)
  }

  try {
    const app = import.meta.env.VITE_FAKE_DISCORD === 'true'
      ? new App(bridge, new DummyDiscordRepository())
      : new App(bridge)
    const renderPhoneStatus = (): void => {
      if (!statusElement) return
      const loginUrl = app.loginUrl()
      if (app.needsDiscordLogin() && loginUrl) { showDiscordLogin(statusElement, loginUrl); return }
      if (app.hasConnectionFailure() && loginUrl) {
        showConnectionFailure(statusElement, loginUrl, () => { void app.retryChannels() }); return
      }
      showStatus('G2 display initialized successfully.')
    }
    app.onStatusChange(renderPhoneStatus)
    await app.start()
    renderPhoneStatus()
    const authResult = new URL(window.location.href).searchParams.get('auth')
    if (authResult === 'error') showStatus('Discord login failed')
    if (authResult === 'success' || authResult === 'error') window.history.replaceState(null, '', window.location.pathname)
    if (app.needsDiscordLogin() || app.hasConnectionFailure()) return
  } catch (error) {
    throw new Error(`app.start failed: ${safeErrorSummary(error)}`)
  }

  showStatus('G2 display initialized successfully.')
}

void main().catch(error => {
  const summary = safeErrorSummary(error)
  console.error('Glass Assistant startup failed:', summary)
  showStatus(`G2 startup failed: ${summary}`)
})
