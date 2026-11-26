import posthog from 'posthog-js'
import { isDirectoryRoute, parsePath, rootDocumentID } from './catalog.js'

// Titles, paths, search text, and URL overrides never leave the browser.
const ALLOWED = new Set([
  'route',
  'document_id',
  'has_section',
  'document_count',
  'query_length',
  'surface',
])

let enabled = false

export function initAnalytics() {
  const token = String(import.meta.env.VITE_POSTHOG_PROJECT_TOKEN || '').trim()
  if (!token) return null
  const host = String(import.meta.env.VITE_POSTHOG_HOST || '').trim() || 'https://us.i.posthog.com'
  // followInApp pushes history and then dispatches popstate. PostHog's
  // history_change pageviews would record both, so usePath captures one.
  posthog.init(token, {
    defaults: '2026-08-30',
    api_host: host,
    capture_pageview: false,
    capture_pageleave: true,
    autocapture: false,
    disable_session_recording: true,
    capture_exceptions: false,
    person_profiles: 'identified_only',
    persistence: 'localStorage',
  })
  enabled = true
  return posthog
}

export function track(event, props) {
  if (!enabled) return
  const safe = {}
  if (props && typeof props === 'object') {
    for (const key of Object.keys(props)) {
      if (ALLOWED.has(key)) safe[key] = props[key]
    }
  }
  posthog.capture(event, safe)
}

// home still includes the note on screen. Its id is not in the URL.
export function pageviewProperties(catalog, pathname, hash) {
  const parsed = parsePath(pathname, hash)
  const has_section = Boolean(parsed.section)
  if (isDirectoryRoute(parsed)) return { route: 'directory', has_section }
  if (!parsed.id) {
    const props = { route: 'home', has_section }
    const id = catalog ? rootDocumentID(catalog) : null
    if (id && catalog.byUUID.has(id)) props.document_id = id
    return props
  }
  if (catalog && catalog.byUUID.has(parsed.id)) {
    return { route: 'document', document_id: parsed.id, has_section }
  }
  return { route: 'unknown', has_section }
}
