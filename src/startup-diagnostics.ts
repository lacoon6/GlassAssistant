import { StartUpPageCreateResult } from '@evenrealities/even_hub_sdk'

export type StartupPhase = 'bridge' | 'startup-container' | 'event-subscription' |
  'storage-restore' | 'discord-load' | 'text-update'

export function describeError(error: unknown): string {
  if (error instanceof Error) {
    const message = error.message?.trim() || '(empty message)'
    return `${error.name}: ${message}`
  }
  if (typeof error === 'string') return error
  try { return String(error) } catch { return 'Unknown error' }
}

export function startupResultName(result: number): string {
  if (result === StartUpPageCreateResult.success) return 'success'
  if (result === StartUpPageCreateResult.invalid) return 'invalid'
  if (result === StartUpPageCreateResult.oversize) return 'oversize'
  if (result === StartUpPageCreateResult.outOfMemory) return 'outOfMemory'
  return 'unknown'
}

export class StartupContainerResultError extends Error {
  public constructor(public readonly result: number) {
    super(`createStartUpPageContainer failed with result ${result} (${startupResultName(result)})`)
    this.name = 'StartupContainerResultError'
  }
}

export function bridgePresence(windowRef: Window): { flutterInAppWebView: boolean; callHandlerFunction: boolean } {
  const flutter = (windowRef as unknown as { flutter_inappwebview?: { callHandler?: unknown } }).flutter_inappwebview
  return { flutterInAppWebView: Boolean(flutter), callHandlerFunction: typeof flutter?.callHandler === 'function' }
}

export function startupFailureText(phase: StartupPhase, error: unknown): string {
  return `G2 startup failed\nPhase: ${phase}\nError: ${describeError(error)}`
}
