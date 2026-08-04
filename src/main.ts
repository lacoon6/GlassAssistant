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
    await app.start()
    if (app.needsDiscordLogin()) { if (statusElement) showDiscordLogin(statusElement, () => { void app.login() }); return }
    if (app.hasConnectionFailure()) { if (statusElement) showConnectionFailure(statusElement, () => { void app.login() }); return }
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
