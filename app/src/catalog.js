import { HOME_DOCUMENT_ID, homeDocumentID } from './config.js'

export { HOME_DOCUMENT_ID, homeDocumentID }

// directory.json is { documents: [{ title, uuid, path }] }, sorted by path.
// The name index overwrites, so the greatest path wins. That is the article
// the publisher wrote for a duplicated name or UUID.

export function nameFromPath(path) {
  const base = String(path || '').split('/').pop()
  const dot = base.lastIndexOf('.')
  if (dot <= 0) return base
  return base.slice(0, dot)
}

export function indexDocuments(directory) {
  const documents = Array.isArray(directory && directory.documents) ? directory.documents : []
  const byUUID = new Map()
  const byName = new Map()
  const byPath = new Map()
  for (const row of documents) {
    if (!row || !row.uuid) continue
    byUUID.set(row.uuid, row)
    if (row.path) {
      byName.set(nameFromPath(row.path), row.uuid)
      byPath.set(row.path, row.uuid)
    }
  }
  return { documents, byUUID, byName, byPath }
}

// index.md is the landing document when the publisher included one.
export function rootDocumentID(catalog) {
  return catalog.byPath.get('index.md') || (catalog.documents[0] && catalog.documents[0].uuid) || null
}

// /<uuid>/ is an article. /directory/ is the catalog. A heading is /<uuid>/#slug.
export function articlePath(id, section) {
  if (!id) return '/'
  const path = `/${encodeURIComponent(id)}/`
  return section ? `${path}#${section}` : path
}

// Bare / becomes /<home id>/. A legacy #/<id>/ fragment still wins.
// The id is HOME_DOCUMENT_ID unless the server or Vite env sets another.
export function rootForwardPath(pathname, hash) {
  const legacy = legacyHashPath(hash)
  if (legacy) return legacy
  const path = String(pathname || '/').replace(/\/+$/, '') || '/'
  if (path !== '/') return ''
  return articlePath(homeDocumentID(), parsePath(pathname, hash).section)
}

function decodePart(value) {
  try { return decodeURIComponent(value) } catch { return value }
}

export function parsePath(pathname, hash) {
  const path = decodePart(String(pathname || '/')).replace(/\/+$/, '')
  const section = decodePart(String(hash || '').replace(/^#/, ''))
  if (!path) return { id: null, section }
  const id = path.slice(1)
  if (!id || id.includes('/')) return { id: null, section: '' }
  return { id, section }
}

// Old links were #/<uuid>/ and #/<uuid>/#<heading>. The pathname in that
// case is /, and the whole route sits in the fragment.
export function legacyHashPath(hash) {
  const raw = String(hash || '')
  if (!raw.startsWith('#/')) return ''
  const body = raw.slice(2)
  const cut = body.indexOf('#')
  const idPart = (cut === -1 ? body : body.slice(0, cut)).replace(/\/+$/, '')
  const section = cut === -1 ? '' : decodePart(body.slice(cut + 1))
  if (!idPart) return '/'
  return articlePath(decodePart(idPart), section)
}

export function isAppRoute(pathname) {
  const path = String(pathname || '/').replace(/\/+$/, '') || '/'
  if (path === '/') return true
  if (path.startsWith('/articles') || path.startsWith('/frontmatter') || path.startsWith('/backlinks') || path.startsWith('/assets')) return false
  if (path === '/directory.json' || path.includes('.')) return false
  return !path.slice(1).includes('/')
}

// /directory is the catalog page. Document ids are UUIDs, so this name is free.
export function isDirectoryRoute(route) {
  return !!route && route.id === 'directory'
}

// Folders are derived from path so the sidebar can collapse. The file
// itself stays a flat list; this tree is only a view.
export function buildTree(documents) {
  const root = { name: '', path: '', dirs: new Map(), docs: [] }
  for (const doc of documents) {
    const parts = String(doc.path || doc.uuid).split('/')
    let node = root
    let path = ''
    for (const name of parts.slice(0, -1)) {
      path = path ? `${path}/${name}` : name
      if (!node.dirs.has(name)) node.dirs.set(name, { name, path, dirs: new Map(), docs: [] })
      node = node.dirs.get(name)
    }
    node.docs.push(doc)
  }
  return root
}
