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

export function parseHash(hash) {
  const h = String(hash || '').replace(/^#\/?/, '')
  if (!h) return { id: null, section: '' }
  const parts = h.split('#')
  const id = decodeURIComponent(parts[0].replace(/\/$/, ''))
  const section = parts[1] ? decodeURIComponent(parts[1]) : ''
  return { id: id || null, section }
}

// #/directory is the catalog page. Document ids are UUIDs, so this name is free.
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
