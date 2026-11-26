import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App.jsx'

const { track } = vi.hoisted(() => ({ track: vi.fn() }))

vi.mock('posthog-js', () => ({
  default: { init: vi.fn(), capture: vi.fn() },
}))

vi.mock('./analytics.js', async () => {
  const actual = await vi.importActual('./analytics.js')
  return { ...actual, track }
})

const home = '11111111-1111-4111-8111-111111111111'
const other = '22222222-2222-4222-8222-222222222222'

const files = {
  'directory.json': {
    documents: [
      { title: 'Home', uuid: home, path: 'index.md' },
      { title: 'Other', uuid: other, path: 'notes/other-note.md' },
    ],
  },
  [`articles/${home}.json`]: {
    uuid: home,
    relativePath: 'index.md',
    name: 'index',
    frontmatter_cid: 'cid-home',
    raw_markdown: 'Start with [[other-note]].\n',
  },
  [`articles/${other}.json`]: {
    uuid: other,
    relativePath: 'notes/other-note.md',
    name: 'other-note',
    frontmatter_cid: 'cid-other',
    raw_markdown: 'Second note.\n',
  },
  'frontmatter/cid-home.json': { share: true, title: 'Home', uuid: home },
  'frontmatter/cid-other.json': { share: true, title: 'Other', uuid: other },
}

beforeEach(() => {
  track.mockClear()
  window.matchMedia = () => ({
    matches: false,
    media: '(max-width: 700px)',
    addEventListener() {},
    removeEventListener() {},
  })
  window.history.replaceState(null, '', `/${home}/`)
  globalThis.fetch = async (url) => {
    const pathname = String(url).replace(/^https?:\/\/[^/]+/, '').replace(/^\//, '')
    const body = files[pathname]
    if (!body) return { ok: false, status: 404, json: async () => ({}) }
    return { ok: true, status: 200, json: async () => body }
  }
})

afterEach(() => {
  cleanup()
  window.history.replaceState(null, '', '/')
})

describe('App analytics', () => {
  it('records the opened note and the filter length without note text', async () => {
    render(<App />)
    fireEvent.click(await screen.findByRole('link', { name: 'other-note' }))
    await waitFor(() => {
      const view = track.mock.calls.find((call) => call[0] === '$pageview' && call[1]?.document_id === other)
      expect(view?.[1]).toEqual({
        route: 'document',
        document_id: other,
        has_section: false,
      })
    })

    fireEvent.change(screen.getByRole('searchbox', { name: 'Filter documents' }), {
      target: { value: 'secret-query' },
    })
    fireEvent.change(screen.getByRole('searchbox', { name: 'Filter documents' }), {
      target: { value: 'secret-query-more' },
    })
    const filters = track.mock.calls.filter((call) => call[0] === 'filter_used')
    expect(filters).toEqual([
      ['filter_used', { query_length: 'secret-query'.length, surface: 'sidebar' }],
    ])
  })
})
