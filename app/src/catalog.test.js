import { describe, expect, it } from 'vitest'
import { articlePath, buildTree, HOME_DOCUMENT_ID, indexDocuments, isDirectoryRoute, legacyHashPath, nameFromPath, parsePath, rootDocumentID, rootForwardPath } from './catalog.js'

describe('catalog', () => {
  it('derives names from the final extension only', () => {
    expect(nameFromPath('a/b/post.md')).toBe('post')
    expect(nameFromPath('Notes/obsidian-link-syntax.md')).toBe('obsidian-link-syntax')
    expect(nameFromPath('archive.tar.gz')).toBe('archive.tar')
    expect(nameFromPath('README')).toBe('README')
  })

  it('lets the greatest path win the name and uuid indexes', () => {
    const catalog = indexDocuments({
      documents: [
        { title: 'First', uuid: 'same', path: 'a/other-note.md' },
        { title: 'Home', uuid: 'home', path: 'index.md' },
        { title: 'Later', uuid: 'same', path: 'z/other-note.md' },
      ],
    })
    expect(catalog.byName.get('other-note')).toBe('same')
    expect(catalog.byUUID.get('same').path).toBe('z/other-note.md')
    expect(catalog.byName.get('Other-Note')).toBeUndefined()
    expect(rootDocumentID(catalog)).toBe('home')
    expect(catalog.documents).toHaveLength(3)
  })

  it('parses /uuid/ and a heading fragment', () => {
    expect(parsePath('/', '')).toEqual({ id: null, section: '' })
    expect(parsePath('/abc/', '#Setup')).toEqual({ id: 'abc', section: 'Setup' })
    expect(parsePath('/abc', '')).toEqual({ id: 'abc', section: '' })
    expect(articlePath('abc', 'Setup')).toBe('/abc/#Setup')
  })

  it('treats /directory/ as the catalog page', () => {
    expect(isDirectoryRoute(parsePath('/directory', ''))).toBe(true)
    expect(isDirectoryRoute(parsePath('/directory/', ''))).toBe(true)
    expect(isDirectoryRoute(parsePath('/abc/', ''))).toBe(false)
    expect(isDirectoryRoute(parsePath('/', ''))).toBe(false)
  })

  it('rewrites a legacy hash route onto a path', () => {
    expect(legacyHashPath('#/abc/')).toBe('/abc/')
    expect(legacyHashPath('#/abc/#Setup')).toBe('/abc/#Setup')
    expect(legacyHashPath('#/directory/')).toBe('/directory/')
    expect(legacyHashPath('#setup')).toBe('')
  })

  it('forwards / to the hardcoded note and leaves other routes alone', () => {
    expect(rootForwardPath('/', '')).toBe(`/${HOME_DOCUMENT_ID}/`)
    expect(rootForwardPath('/', '#Setup')).toBe(`/${HOME_DOCUMENT_ID}/#Setup`)
    expect(rootForwardPath('/', '#/abc/')).toBe('/abc/')
    expect(rootForwardPath('/directory/', '')).toBe('')
    expect(rootForwardPath(`/${HOME_DOCUMENT_ID}/`, '')).toBe('')
  })

  it('forwards / to the note injected by the server', () => {
    const id = '99999999-9999-4999-8999-999999999999'
    window.__VAULT__ = { homeDocumentId: id }
    expect(rootForwardPath('/', '')).toBe(`/${id}/`)
    window.__VAULT__ = { homeDocumentId: '   ' }
    expect(rootForwardPath('/', '')).toBe(`/${HOME_DOCUMENT_ID}/`)
    delete window.__VAULT__
  })

  it('groups documents into folders without dropping root files', () => {
    const tree = buildTree([
      { title: 'A', uuid: 'a', path: 'Acronyms/A.md' },
      { title: 'Home', uuid: 'h', path: 'index.md' },
    ])
    expect(tree.docs.map((d) => d.uuid)).toEqual(['h'])
    expect([...tree.dirs.keys()]).toEqual(['Acronyms'])
    expect(tree.dirs.get('Acronyms').docs.map((d) => d.title)).toEqual(['A'])
  })
})
