import { StartUpPageCreateResult, waitForEvenAppBridge } from '@evenrealities/even_hub_sdk'
import { App } from './app'
import { DummyDiscordRepository } from './services/discord'
import { showConnectionFailure, showDiscordLogin } from './phone-ui'
import { bridgePresence, startupFailureText, type StartupPhase } from './startup-diagnostics'

const statusElement = document.querySelector<HTMLElement>('#app')
let displayedStartupResult: number | 'pending' = 'pending'
let displayedFingerprint = ''

function createPhoneBody(): HTMLElement | null {
  if (!statusElement) return null
  const header = document.createElement('div')
  header.textContent = `Build: v0.10.11\nStartup result: ${displayedStartupResult}`
  const body = document.createElement('div')
  statusElement.replaceChildren(header, body)
  return body
}

function showStatus(message: string): void {
  const body = createPhoneBody()
  if (body) body.textContent = message
}

let startupPromise: Promise<void> | null = null

async function initializeG2(): Promise<void> {
  showStatus('')
  let phase: StartupPhase = 'bridge'
  let renderPhoneStatus: (() => void) | undefined
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
    renderPhoneStatus = (): void => {
      displayedStartupResult = app.getStartupResult()
      displayedFingerprint = app.getStartupFingerprint()
      const body = createPhoneBody()
      if (!body) return
      if (displayedStartupResult !== 'pending' && displayedStartupResult !== StartUpPageCreateResult.success) {
        body.textContent = `Startup payload fingerprint: ${displayedFingerprint}`
        return
      }
      const loginUrl = app.loginUrl()
      if (app.needsDiscordLogin() && loginUrl) { showDiscordLogin(body, loginUrl); return }
      if (app.hasConnectionFailure() && loginUrl) {
        showConnectionFailure(body, loginUrl, () => { void app.retryChannels() }); return
      }
      if (app.hasTargetConfigurationFailure()) { body.textContent = 'Target Discord server is not configured'; return }
      body.textContent = 'G2 display initialized successfully.'
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
    if (displayedStartupResult === 'pending') showStatus(safeText)
    else renderPhoneStatus?.()
  }
}

export function initializeG2Once(): Promise<void> {
  if (startupPromise) return startupPromise
  startupPromise = initializeG2()
  return startupPromise
}

void initializeG2Once()
