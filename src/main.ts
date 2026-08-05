import { waitForEvenAppBridge } from '@evenrealities/even_hub_sdk'
import { App } from './app'
import { DummyDiscordRepository } from './services/discord'
import { showConnectionFailure, showDiscordLogin } from './phone-ui'
import { bridgePresence, startupFailureText, type StartupPhase } from './startup-diagnostics'

const statusElement = document.querySelector<HTMLElement>('#app')

function showStatus(message: string): void {
  if (statusElement) statusElement.textContent = message
}

let startupPromise: Promise<void> | null = null

async function initializeG2(): Promise<void> {
  let phase: StartupPhase = 'bridge'
  const reportPhase = (nextPhase: StartupPhase, detail?: string): void => {
    phase = nextPhase
    console.info('G2 startup phase', detail ? { phase: nextPhase, detail } : { phase: nextPhase })
  }
  console.info('WebView location', { origin: window.location.origin, pathname: window.location.pathname })
  try {
    reportPhase('bridge')
    const before = bridgePresence(window)
    console.info('Even bridge presence', before)
    const startedAt = performance.now()
    const bridge = await waitForEvenAppBridge()
    const elapsedMs = Math.round(performance.now() - startedAt)
    console.info('Even bridge ready', { resolved: true, elapsedMs })

    const app = import.meta.env.VITE_FAKE_DISCORD === 'true'
      ? new App(bridge, new DummyDiscordRepository(), reportPhase)
      : new App(bridge, undefined, reportPhase)
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
    const safeText = startupFailureText(phase, error)
    console.error('Glass Assistant startup failed', { phase, error: safeText.split('\n').at(-1) })
    showStatus(safeText)
  }
}

export function initializeG2Once(): Promise<void> {
  if (startupPromise) return startupPromise
  startupPromise = initializeG2()
  return startupPromise
}

void initializeG2Once()
