export interface FrontendLocation {
  readonly frontendUrl: string
  readonly frontendOrigin: string
}

export function parseFrontendUrl(value: string): FrontendLocation {
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    throw new Error('FRONTEND_URL must be a valid absolute URL')
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('FRONTEND_URL must use http or https')
  }
  return { frontendUrl: value, frontendOrigin: parsed.origin }
}
