// server.mjs writes window.__VAULT__ from the container environment.
// Vite env is the fallback for `npm run dev`, where that script is absent.
export const HOME_DOCUMENT_ID = '123e4567-e89b-12d3-a456-426614174000'
const DEFAULT_POSTHOG_HOST = 'https://us.i.posthog.com'

function runtimeValue(key) {
  if (typeof window === 'undefined') return ''
  const bag = window.__VAULT__
  if (!bag || typeof bag !== 'object') return ''
  return String(bag[key] ?? '').trim()
}

function pick(key, envValue) {
  return runtimeValue(key) || String(envValue ?? '').trim()
}

export function posthogToken() {
  return pick('posthogToken', import.meta.env.VITE_POSTHOG_PROJECT_TOKEN)
}

export function posthogHost() {
  return pick('posthogHost', import.meta.env.VITE_POSTHOG_HOST) || DEFAULT_POSTHOG_HOST
}

export function homeDocumentID() {
  return pick('homeDocumentId', import.meta.env.VITE_HOME_DOCUMENT_ID) || HOME_DOCUMENT_ID
}
