import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { pageviewProperties, track } from './analytics.js'
import { createStore, dataURL, loadJSON } from './api.js'
import { articlePath, buildTree, indexDocuments, isAppRoute, isDirectoryRoute, parsePath, rootDocumentID, rootForwardPath } from './catalog.js'
import { extractSection, remarkVault, slugify } from './markdown.js'

const MAX_EMBED_DEPTH = 8
const VaultContext = createContext(null)

function plainText(node) {
  if (node == null || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(plainText).join('')
  if (node.props) return plainText(node.props.children)
  return ''
}

function heading(Tag) {
  return function Heading({ children }) {
    return <Tag id={slugify(plainText(children))}>{children}</Tag>
  }
}

function siteURL(href) {
  if (href && href.startsWith('assets/')) return dataURL(href)
  return href
}

function markdownComponents(WikiEmbed) {
  return {
    h1: heading('h1'),
    h2: heading('h2'),
    h3: heading('h3'),
    h4: heading('h4'),
    h5: heading('h5'),
    h6: heading('h6'),
    a({ href, children }) {
      const url = siteURL(href)
      const external = /^[A-Za-z][A-Za-z0-9+.-]{1,31}:/.test(url || '')
      return (
        <a href={url} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
          {children}
        </a>
      )
    },
    img({ src, alt }) {
      return <img src={siteURL(src)} alt={alt || ''} />
    },
    'wiki-embed': WikiEmbed,
  }
}

function useAsync(fn, deps) {
  const [state, setState] = useState({ data: undefined, error: null, loading: true })
  useEffect(() => {
    let cancel = false
    setState((s) => ({ data: s.data, error: null, loading: true }))
    fn().then(
      (data) => { if (!cancel) setState({ data, error: null, loading: false }) },
      (error) => { if (!cancel) setState({ data: undefined, error, loading: false }) },
    )
    return () => { cancel = true }
  }, deps)
  return state
}

function locationKey() {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`
}

function rewriteLocation() {
  const next = rootForwardPath(window.location.pathname, window.location.hash)
  if (!next || next === locationKey()) return false
  window.history.replaceState(null, '', next)
  return true
}

function usePath() {
  const [key, setKey] = useState(() => {
    rewriteLocation()
    return locationKey()
  })
  useEffect(() => {
    const onChange = () => {
      rewriteLocation()
      setKey(locationKey())
    }
    window.addEventListener('popstate', onChange)
    return () => window.removeEventListener('popstate', onChange)
  }, [])
  return key
}

function followInApp(anchor, event) {
  if (event.defaultPrevented || event.button !== 0) return false
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false
  if (anchor.target && anchor.target !== '_self') return false
  if (anchor.hasAttribute('download')) return false
  const href = anchor.getAttribute('href')
  if (!href) return false
  let url
  try { url = new URL(href, window.location.href) } catch { return false }
  if (url.origin !== window.location.origin || !isAppRoute(url.pathname)) return false
  event.preventDefault()
  const next = `${url.pathname}${url.search}${url.hash}`
  if (next !== locationKey()) {
    window.history.pushState(null, '', next)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }
  return true
}

const NARROW_QUERY = '(max-width: 700px)'

function useNarrow() {
  const [narrow, setNarrow] = useState(() => {
    if (typeof window.matchMedia !== 'function') return false
    return window.matchMedia(NARROW_QUERY).matches
  })
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const mq = window.matchMedia(NARROW_QUERY)
    const onChange = () => setNarrow(mq.matches)
    onChange()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return narrow
}

function Markdown({ text }) {
  const vault = useContext(VaultContext)
  const plugin = useMemo(() => remarkVault(vault.catalog), [vault.catalog])
  const components = useMemo(() => markdownComponents(WikiEmbed), [])
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm, plugin]} components={components}>
      {text}
    </ReactMarkdown>
  )
}

function WikiEmbed({ uuid, section, alias, target }) {
  const { catalog, store, stack } = useContext(VaultContext)
  const row = catalog.byUUID.get(uuid)
  const title = (row && row.title) || alias || target
  if (stack.includes(uuid)) {
    return <div className="embed embed-error">cyclic embed of {title} skipped</div>
  }
  if (stack.length >= MAX_EMBED_DEPTH) {
    return <div className="embed embed-error">embed depth limit reached at {title}</div>
  }
  const { data, error, loading } = useAsync(() => store.getArticle(uuid), [uuid, store])
  if (loading && !data) return <div className="embed">Loading…</div>
  if (error) return <div className="embed embed-error">{String(error.message || error)}</div>
  const body = extractSection(data.raw_markdown || '', section)
  const nested = { catalog, store, stack: [...stack, uuid] }
  return (
    <div className="embed">
      <div className="embed-head">
        <a href={articlePath(uuid)}>embedded from {title}</a>
      </div>
      <VaultContext.Provider value={nested}>
        <Markdown text={body} />
      </VaultContext.Provider>
    </div>
  )
}

function displayTitle(row, article, fm) {
  if (fm && typeof fm.title === 'string' && fm.title.trim()) return fm.title.trim()
  if (row && row.title) return row.title
  if (article && article.name) return article.name
  return (row && row.uuid) || ''
}

function Backlinks({ id, store }) {
  const { data } = useAsync(() => store.getBacklinks(id), [id, store])
  const items = data && data.backlinks
  if (!items || !items.length) return null
  return (
    <section className="backlinks">
      <h2>Backlinks</h2>
      <ul>
        {items.map((bl) => (
          <li key={`${bl.from_document_id}:${bl.title}`}>
            <a href={articlePath(bl.from_document_id)}>{bl.from_name}</a>
            {bl.title && bl.title !== bl.from_name
              ? <span className="backlink-title"> {bl.title}</span>
              : null}
          </li>
        ))}
      </ul>
    </section>
  )
}

function DocumentView({ id, section, catalog, store }) {
  const row = catalog.byUUID.get(id)
  const articleState = useAsync(() => store.getArticle(id), [id, store])
  const cid = articleState.data && articleState.data.frontmatter_cid
  const fmState = useAsync(
    () => (cid ? store.getFrontmatter(cid) : Promise.resolve(null)),
    [cid, store],
  )
  const article = articleState.data
  const title = displayTitle(row, article, fmState.data)

  useEffect(() => {
    if (!article) return
    document.title = `${title} · Vault`
    if (section) {
      const el = document.getElementById(section)
      if (el) {
        el.scrollIntoView()
        return
      }
    }
    window.scrollTo(0, 0)
  }, [article, section, title])

  if (!row) return <h1>Not found</h1>
  if (articleState.loading && !article) return <p className="loading">Loading…</p>
  if (articleState.error) {
    return (
      <>
        <h1>Failed to load article</h1>
        <pre className="error">{String(articleState.error.message || articleState.error)}</pre>
      </>
    )
  }

  const tags = fmState.data && Array.isArray(fmState.data.tags)
    ? fmState.data.tags.filter((tag) => typeof tag === 'string' && tag)
    : []
  const raw = article.raw_markdown || ''
  const duplicateHeading = new RegExp(`^#{1,6}\\s+${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'm').test(raw.trimStart().split('\n')[0] || '')

  return (
    <>
      <p className="breadcrumb">{article.relativePath || row.path}</p>
      {duplicateHeading ? null : <h1>{title}</h1>}
      {tags.length ? (
        <ul className="tags">{tags.map((tag) => <li key={tag}>{tag}</li>)}</ul>
      ) : null}
      {fmState.error ? <p className="error">Front matter file is missing.</p> : null}
      <Markdown text={raw} />
      <Backlinks id={id} store={store} />
    </>
  )
}

function Tree({ node, active, openPaths }) {
  const dirs = [...node.dirs.values()]
  return (
    <>
      {dirs.map((dir) => (
        <Dir key={dir.path} node={dir} active={active} openPaths={openPaths} />
      ))}
      {node.docs.map((doc) => (
        <a
          key={`${doc.path}:${doc.uuid}`}
          className={doc.uuid === active ? 'nav-doc active' : 'nav-doc'}
          href={articlePath(doc.uuid)}
          title={doc.path}
        >
          {doc.title || doc.uuid}
        </a>
      ))}
    </>
  )
}

function Dir({ node, active, openPaths }) {
  const [open, setOpen] = useState(() => openPaths.has(node.path))
  useEffect(() => {
    if (openPaths.has(node.path)) setOpen(true)
  }, [node.path, openPaths])
  return (
    <details className="nav-dir" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>{node.name}/</summary>
      {open ? <Tree node={node} active={active} openPaths={openPaths} /> : null}
    </details>
  )
}

function ancestorPaths(path) {
  const parts = String(path || '').split('/').slice(0, -1)
  const acc = []
  let cur = ''
  for (const part of parts) {
    cur = cur ? `${cur}/${part}` : part
    acc.push(cur)
  }
  return acc
}

const EMPTY_PATHS = new Set()

function CatalogList({ documents, tree, active, openPaths, onNavigate, surface }) {
  const [query, setQuery] = useState('')
  const wasEmpty = useRef(true)
  const q = query.trim().toLowerCase()
  useEffect(() => {
    const trimmed = query.trim()
    const empty = trimmed === ''
    if (wasEmpty.current && !empty) {
      track('filter_used', { query_length: trimmed.length, surface })
    }
    wasEmpty.current = empty
  }, [query, surface])
  const matches = useMemo(() => {
    if (!q) return null
    const out = []
    for (const doc of documents) {
      const title = String(doc.title || '').toLowerCase()
      const path = String(doc.path || '').toLowerCase()
      if (title.includes(q) || path.includes(q)) {
        out.push(doc)
        if (out.length === 80) break
      }
    }
    return out
  }, [documents, q])

  return (
    <>
      <input
        className="filter"
        type="search"
        placeholder="Filter titles and paths"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Filter documents"
      />
      <nav onClick={onNavigate}>
        {matches ? matches.map((doc) => (
          <a
            key={`${doc.path}:${doc.uuid}`}
            className={doc.uuid === active ? 'nav-doc active' : 'nav-doc'}
            href={articlePath(doc.uuid)}
            title={doc.path}
          >
            {doc.title || doc.uuid}
          </a>
        )) : null}
        {!matches && tree ? <Tree node={tree} active={active} openPaths={openPaths} /> : null}
      </nav>
    </>
  )
}

function DirectoryPage({ documents, tree }) {
  useEffect(() => {
    document.title = 'Directory · Vault'
  }, [])
  return (
    <div className="directory">
      <h1>Directory</h1>
      <CatalogList documents={documents} tree={tree} active={null} openPaths={EMPTY_PATHS} surface="directory" />
    </div>
  )
}

export default function App() {
  const store = useMemo(() => createStore(), [])
  const path = usePath()
  const narrow = useNarrow()
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem('nav-collapsed') === '1' } catch { return false }
  })
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [boot, setBoot] = useState({ loading: true, error: null, directory: null })
  const catalogTracked = useRef(false)
  const pageKey = useRef('')

  useEffect(() => {
    document.documentElement.classList.toggle('nav-collapsed', !narrow && collapsed)
    document.documentElement.classList.toggle('drawer-open', narrow && drawerOpen)
    if (narrow) return
    try { localStorage.setItem('nav-collapsed', collapsed ? '1' : '0') } catch { /* ignore */ }
  }, [collapsed, narrow, drawerOpen])

  useEffect(() => {
    if (narrow) setDrawerOpen(false)
  }, [path, narrow])

  useEffect(() => {
    if (!narrow || !drawerOpen) return
    const onKey = (event) => {
      if (event.key === 'Escape') setDrawerOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [narrow, drawerOpen])

  useEffect(() => {
    let cancel = false
    loadJSON('directory.json').then((directory) => {
      if (!cancel) setBoot({ loading: false, error: null, directory })
    }).catch((error) => {
      if (!cancel) setBoot({ loading: false, error, directory: null })
    })
    return () => { cancel = true }
  }, [])

  const catalog = useMemo(
    () => (boot.directory ? indexDocuments(boot.directory) : null),
    [boot.directory],
  )
  const tree = useMemo(
    () => (catalog ? buildTree(catalog.documents) : null),
    [catalog],
  )

  useEffect(() => {
    if (boot.loading) return
    if (!catalogTracked.current) {
      catalogTracked.current = true
      if (boot.error) track('catalog_load_failed')
      else track('catalog_loaded', { document_count: catalog ? catalog.documents.length : 0 })
    }
    if (pageKey.current === path) return
    pageKey.current = path
    track('$pageview', pageviewProperties(catalog, window.location.pathname, window.location.hash))
  }, [path, boot.loading, boot.error, catalog])

  const route = parsePath(window.location.pathname, window.location.hash)
  const directoryPage = isDirectoryRoute(route)
  const id = directoryPage ? null : (route.id || (catalog ? rootDocumentID(catalog) : null))
  const active = catalog && id ? catalog.byUUID.get(id) : null
  const openPaths = useMemo(() => new Set(active ? ancestorPaths(active.path) : []), [active])
  const vault = useMemo(() => (catalog ? { catalog, store, stack: [] } : null), [catalog, store])
  const barTitle = directoryPage ? 'Directory' : ((active && active.title) || 'Vault')

  function onNavClick(event) {
    const anchor = event.target.closest && event.target.closest('a')
    if (anchor) followInApp(anchor, event)
    if (narrow && anchor) setDrawerOpen(false)
  }

  return (
    <div className="layout" onClick={onNavClick}>
      {narrow ? (
        <div className="topbar">
          <button
            className="menu-button"
            type="button"
            aria-label="Open navigation"
            aria-expanded={drawerOpen}
            onClick={() => setDrawerOpen(true)}
          >
            &#9776;
          </button>
          <span className="topbar-title">{barTitle}</span>
        </div>
      ) : null}
      {narrow && drawerOpen ? (
        <button className="backdrop" type="button" aria-label="Close navigation" onClick={() => setDrawerOpen(false)} />
      ) : null}
      <aside className="sidebar" inert={narrow && !drawerOpen ? true : undefined}>
        <div className="sidebar-head">
          <a className="brand" href="/">Vault</a>
          <button
            className="nav-toggle"
            type="button"
            aria-label={narrow ? 'Close navigation' : 'Collapse navigation'}
            onClick={() => (narrow ? setDrawerOpen(false) : setCollapsed(true))}
          >
            &laquo;
          </button>
        </div>
        {catalog ? (
          <a
            className={directoryPage ? 'nav-doc active directory-link' : 'nav-doc directory-link'}
            href={articlePath('directory')}
            onClick={onNavClick}
          >
            Directory
          </a>
        ) : null}
        {catalog ? (
          <CatalogList
            documents={catalog.documents}
            tree={tree}
            active={id}
            openPaths={openPaths}
            onNavigate={onNavClick}
            surface="sidebar"
          />
        ) : <nav />}
      </aside>
      <button className="nav-expand" type="button" aria-label="Expand navigation" onClick={() => setCollapsed(false)}>
        &#9776;
      </button>
      <main className="doc">
        {boot.loading ? <p className="loading">Loading…</p> : null}
        {boot.error ? (
          <>
            <h1>Failed to load data</h1>
            <pre className="error">{String(boot.error.message || boot.error)}</pre>
            <p>The app fetches <code>directory.json</code> from this server. Publish <code>examples/vault</code> with <code>markdown-indexer-cli -site-dir</code>, then start <code>APP_PORT=8080 DATA_DIR=... ./dev.sh</code>.</p>
          </>
        ) : null}
        {!boot.loading && !boot.error && catalog && !directoryPage && !id ? <h1>Empty vault</h1> : null}
        {!boot.loading && !boot.error && directoryPage && catalog ? (
          <DirectoryPage documents={catalog.documents} tree={tree} />
        ) : null}
        {!boot.loading && !boot.error && !directoryPage && vault && id ? (
          <VaultContext.Provider value={vault}>
            <DocumentView key={id} id={id} section={route.section} catalog={catalog} store={store} />
          </VaultContext.Provider>
        ) : null}
      </main>
    </div>
  )
}
