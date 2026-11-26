import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import App from './App.jsx'

const home = '11111111-1111-4111-8111-111111111111'
const other = '22222222-2222-4222-8222-222222222222'
const png = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.png'

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
    modifiedUnix: 1,
    frontmatter_cid: 'cid-home',
    raw_markdown: `Start with [[other-note]].\n\n![[other-note#Setup]]\n\n![](assets/${png})\n\n[[missing]]\n`,
    raw_markdown_hash: 'ab',
  },
  [`articles/${other}.json`]: {
    uuid: other,
    relativePath: 'notes/other-note.md',
    name: 'other-note',
    modifiedUnix: 1,
    frontmatter_cid: 'cid-other',
    raw_markdown: '## Setup\n\nRun the installer.\n\n## Next\n\nLater.\n',
    raw_markdown_hash: 'cd',
  },
  'frontmatter/cid-home.json': { share: true, title: 'Home', uuid: home, tags: ['go'] },
  'frontmatter/cid-other.json': { share: true, title: 'Other', uuid: other },
  [`backlinks/${home}.json`]: {
    document_id: home,
    backlinks: [{
      from_document_id: other,
      from_name: 'Other',
      from_relative_path: 'notes/other-note.md',
      title: 'the home',
      label: 'INTERNAL',
    }],
  },
  [`backlinks/${other}.json`]: { document_id: other, backlinks: [] },
}

function matchMedia(matches) {
  window.matchMedia = () => ({
    matches,
    media: '(max-width: 700px)',
    addEventListener() {},
    removeEventListener() {},
  })
}

beforeEach(() => {
  matchMedia(false)
  window.location.hash = `#/${home}/`
  globalThis.fetch = async (url) => {
    const pathname = String(url).replace(/^https?:\/\/[^/]+/, '').replace(/^\//, '')
    const body = files[pathname]
    if (!body) return { ok: false, status: 404, json: async () => ({}) }
    return { ok: true, status: 200, json: async () => body }
  }
})

afterEach(() => {
  cleanup()
  window.location.hash = ''
})

describe('App', () => {
  it('renders a published article from directory, article, front matter, and backlinks', async () => {
    render(<App />)
    expect(await screen.findByRole('link', { name: 'other-note' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'other-note' }).getAttribute('href')).toBe(`#/${other}/`)
    expect(await screen.findByText(/Run the installer/)).toBeTruthy()
    expect(screen.queryByText(/Later/)).toBeNull()
    expect(document.querySelector('img')?.getAttribute('src')).toBe(`assets/${png}`)
    expect(screen.getByText('missing')).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'missing' })).toBeNull()
    expect(screen.getByText('go')).toBeTruthy()
    const backlink = [...document.querySelectorAll('.backlinks a')].find((a) => a.textContent === 'Other')
    expect(backlink?.getAttribute('href')).toBe(`#/${other}/`)
    expect(screen.getByText('the home')).toBeTruthy()
    expect(screen.getByText('notes/')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Open navigation' })).toBeNull()
  })

  it('opens the catalog as a drawer on a narrow viewport and closes it when a note is chosen', async () => {
    matchMedia(true)
    render(<App />)
    expect(await screen.findByText(/Start with/)).toBeTruthy()
    const sidebar = () => document.querySelector('.sidebar')
    expect(document.documentElement.classList.contains('drawer-open')).toBe(false)
    expect(document.documentElement.classList.contains('nav-collapsed')).toBe(false)
    expect(sidebar().hasAttribute('inert')).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }))
    expect(document.documentElement.classList.contains('drawer-open')).toBe(true)
    expect(sidebar().hasAttribute('inert')).toBe(false)
    expect(screen.getByText('notes/')).toBeTruthy()
    fireEvent.click(screen.getByRole('link', { name: 'Home' }))
    expect(document.documentElement.classList.contains('drawer-open')).toBe(false)
    expect(sidebar().hasAttribute('inert')).toBe(true)
    expect(document.documentElement.classList.contains('nav-collapsed')).toBe(false)
  })

  it('renders directory.json as the sidebar tree, with its own search, at #/directory', async () => {
    window.location.hash = '#/directory/'
    render(<App />)
    const main = () => within(document.querySelector('main'))
    const sidebar = () => within(document.querySelector('.sidebar'))
    expect(await main().findByRole('heading', { name: 'Directory' })).toBeTruthy()
    expect(document.title).toBe('Directory · Vault')
    expect(main().queryByRole('heading', { name: 'Not found' })).toBeNull()
    expect(main().queryByText(/Start with/)).toBeNull()
    expect(main().getByText('notes/')).toBeTruthy()
    expect(main().getByRole('link', { name: 'Home' }).getAttribute('href')).toBe(`#/${home}/`)
    const sideLink = sidebar().getByRole('link', { name: 'Directory' })
    expect(sideLink.getAttribute('href')).toBe('#/directory')
    expect(sideLink.classList.contains('active')).toBe(true)

    fireEvent.change(main().getByRole('searchbox', { name: 'Filter documents' }), { target: { value: 'other-note' } })
    expect(main().getByRole('link', { name: 'Other' }).getAttribute('href')).toBe(`#/${other}/`)
    expect(main().getByRole('link', { name: 'Other' }).getAttribute('title')).toBe('notes/other-note.md')
    expect(main().queryByRole('link', { name: 'Home' })).toBeNull()
    expect(main().queryByText('notes/')).toBeNull()
    expect(sidebar().getByRole('link', { name: 'Home' })).toBeTruthy()
    expect(sidebar().getByRole('searchbox', { name: 'Filter documents' })).toBeTruthy()
  })
})
