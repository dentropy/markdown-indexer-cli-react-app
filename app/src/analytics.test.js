import { afterEach, describe, expect, it, vi } from 'vitest'
import { indexDocuments } from './catalog.js'
import { pageviewProperties } from './analytics.js'

const { init, capture } = vi.hoisted(() => ({
  init: vi.fn(),
  capture: vi.fn(),
}))

vi.mock('posthog-js', () => ({
  default: { init, capture },
}))

async function loadAnalytics() {
  vi.resetModules()
  return import('./analytics.js')
}

afterEach(() => {
  vi.unstubAllEnvs()
  init.mockClear()
  capture.mockClear()
})

describe('initAnalytics', () => {
  it('does nothing when the token is missing or blank', async () => {
    vi.stubEnv('VITE_POSTHOG_PROJECT_TOKEN', '   ')
    const { initAnalytics, track } = await loadAnalytics()
    expect(initAnalytics()).toBeNull()
    track('$pageview', { route: 'home', title: 'Secret', path: 'index.md', query: 'hello' })
    expect(init).not.toHaveBeenCalled()
    expect(capture).not.toHaveBeenCalled()
  })

  it('initializes with tracking overrides when a token is set', async () => {
    vi.stubEnv('VITE_POSTHOG_PROJECT_TOKEN', 'phc_test')
    vi.stubEnv('VITE_POSTHOG_HOST', 'https://eu.i.posthog.com')
    const { initAnalytics, track } = await loadAnalytics()
    expect(initAnalytics()).toBeTruthy()
    expect(init).toHaveBeenCalledWith('phc_test', {
      defaults: '2026-08-30',
      api_host: 'https://eu.i.posthog.com',
      capture_pageview: false,
      capture_pageleave: true,
      autocapture: false,
      disable_session_recording: true,
      capture_exceptions: false,
      person_profiles: 'identified_only',
      persistence: 'localStorage',
    })
    track('$pageview', {
      route: 'document',
      document_id: 'abc',
      has_section: false,
      title: 'Secret',
      path: 'notes/secret.md',
      query: 'hello',
      $current_url: 'https://example.test/secret',
    })
    expect(capture).toHaveBeenCalledWith('$pageview', {
      route: 'document',
      document_id: 'abc',
      has_section: false,
    })
  })

  it('uses the US ingestion host when VITE_POSTHOG_HOST is blank', async () => {
    vi.stubEnv('VITE_POSTHOG_PROJECT_TOKEN', 'phc_test')
    vi.stubEnv('VITE_POSTHOG_HOST', '')
    const { initAnalytics } = await loadAnalytics()
    initAnalytics()
    expect(init).toHaveBeenCalledWith('phc_test', expect.objectContaining({
      api_host: 'https://us.i.posthog.com',
    }))
  })
})

describe('pageviewProperties', () => {
  const catalog = indexDocuments({
    documents: [
      { title: 'Home', uuid: 'home-id', path: 'index.md' },
      { title: 'Note', uuid: 'note-id', path: 'notes/note.md' },
    ],
  })

  it('marks a catalog hit as a document and keeps its id', () => {
    expect(pageviewProperties(catalog, '/note-id/', '')).toEqual({
      route: 'document',
      document_id: 'note-id',
      has_section: false,
    })
    expect(pageviewProperties(catalog, '/note-id/', '#Setup')).toEqual({
      route: 'document',
      document_id: 'note-id',
      has_section: true,
    })
  })

  it('drops the id when the path is not in the catalog', () => {
    expect(pageviewProperties(catalog, '/missing/', '')).toEqual({
      route: 'unknown',
      has_section: false,
    })
    expect(pageviewProperties(null, '/note-id/', '')).toEqual({
      route: 'unknown',
      has_section: false,
    })
  })

  it('marks /directory/ without a document id', () => {
    expect(pageviewProperties(catalog, '/directory/', '')).toEqual({
      route: 'directory',
      has_section: false,
    })
  })

  it('marks / as home and includes the note on screen', () => {
    expect(pageviewProperties(catalog, '/', '')).toEqual({
      route: 'home',
      document_id: 'home-id',
      has_section: false,
    })
    expect(pageviewProperties(null, '/', '#Setup')).toEqual({
      route: 'home',
      has_section: true,
    })
  })
})
