import { waitForEvenAppBridge } from '@evenrealities/even_hub_sdk'
import { App } from './app'

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
  let bridge
  try {
    bridge = await waitForEvenAppBridge()
    console.log('waitForEvenAppBridge complete')
  } catch (error) {
    throw new Error(`waitForEvenAppBridge failed: ${safeErrorSummary(error)}`)
  }

  try {
    const app = new App(bridge)
    await app.start()
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
