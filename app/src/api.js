// Runtime fetches. Articles and backlinks can change between publishes.
// Front matter filenames are content addresses, so those responses are cached.
const base = () => String(import.meta.env.VITE_DATA_BASE || '').replace(/\/$/, '')

export function dataURL(path) {
  const p = String(path).replace(/^\//, '')
  const b = base()
  return b ? `${b}/${p}` : `/${p}`
}

export function loadJSON(path, cache) {
  const url = dataURL(path)
  return fetch(url, { cache: cache || 'no-cache' }).then((res) => {
    if (!res.ok) throw new Error(`${url} -> ${res.status}`)
    return res.json()
  })
}

export function createStore() {
  const articles = new Map()
  const frontmatter = new Map()
  const backlinks = new Map()
  return {
    getArticle(id) {
      const key = String(id)
      if (!articles.has(key)) articles.set(key, loadJSON(`articles/${encodeURIComponent(key)}.json`))
      return articles.get(key)
    },
    getFrontmatter(cid) {
      const key = String(cid)
      if (!frontmatter.has(key)) {
        frontmatter.set(key, loadJSON(`frontmatter/${encodeURIComponent(key)}.json`, 'force-cache'))
      }
      return frontmatter.get(key)
    },
    getBacklinks(id) {
      const key = String(id)
      if (!backlinks.has(key)) {
        backlinks.set(key, loadJSON(`backlinks/${encodeURIComponent(key)}.json`).catch(() => null))
      }
      return backlinks.get(key)
    },
  }
}
