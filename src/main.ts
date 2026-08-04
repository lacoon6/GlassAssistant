import { waitForEvenAppBridge } from '@evenrealities/even_hub_sdk'
import { App } from './app'
import { DummyDiscordRepository } from './services/discord'

const statusElement = document.querySelector<HTMLElement>('#app')

function showStatus(message: string): void {
  if (statusElement) statusElement.textContent = message
}

function showDiscordLogin(): void {
  if (!statusElement) return
  const baseUrl = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')
  statusElement.replaceChildren(document.createTextNode('Discord login required. '))
  const link = document.createElement('a')
  link.href = `${baseUrl}/api/auth/login`
  link.textContent = 'Discord Login'
  statusElement.append(link)
}

function safeErrorSummary(error: unknown): string {
  if (error instanceof Error) {
    const startupResult = error.message.match(/^createStartUpPageContainer failed with result (\d+)$/)
    return startupResult ? startupResult[0] : error.name
  }
  return 'Unknown error'
}

async function main(): Promise<void> {
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
    if (app.needsDiscordLogin()) { showDiscordLogin(); return }
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
