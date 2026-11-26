const FENCE = /^\s*(```|~~~)/
const TOKEN = /!\[\[([^\]|#]+)(?:#([^\]|]+))?(?:\|([^\]]+))?\]\]|\[\[([^\]|#]+)(?:#([^\]|]+))?(?:\|([^\]]+))?\]\]/g

export function slugify(text) {
  return String(text)
    .trim()
    .toLowerCase()
    .replace(/[^\w\- ]+/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

// CommonMark autolink scheme: 2–32 chars, letter first, next byte not a space.
export function hasScheme(value) {
  return /^[A-Za-z][A-Za-z0-9+.-]{1,31}:(?! )/.test(String(value))
}

export function extensionOf(target) {
  const base = String(target).split('/').pop()
  const dot = base.lastIndexOf('.')
  if (dot <= 0) return ''
  return base.slice(dot)
}

// Document embed: no extension, or a trailing .md (any case), looked up by
// name. Any other extension is an asset the publisher could not resolve.
export function classifyEmbed(target, catalog) {
  const t = String(target || '').trim()
  if (!t) return { type: 'missing' }
  if (hasScheme(t)) return { type: 'external', url: t }
  const ext = extensionOf(t)
  if (ext && ext.toLowerCase() !== '.md') return { type: 'asset' }
  const name = ext ? t.slice(0, -ext.length) : t
  const uuid = catalog.byName.get(name)
  if (uuid) return { type: 'doc', uuid }
  return { type: 'missing' }
}

export function extractSection(body, heading) {
  if (!heading) return body || ''
  const want = heading.trim()
  const lines = String(body || '').split('\n')
  let start = -1
  let level = 0
  let fence = false
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (FENCE.test(line)) fence = !fence
    if (fence) continue
    const m = /^(#{1,6})\s+(.*?)\s*$/.exec(line)
    if (!m) continue
    if (start < 0) {
      if (m[2].trim() === want) {
        start = i
        level = m[1].length
      }
    } else if (m[1].length <= level) {
      return lines.slice(start, i).join('\n')
    }
  }
  if (start >= 0) return lines.slice(start).join('\n')
  return body || ''
}

function textNode(value) {
  return { type: 'text', value }
}

function linkNode(url, label) {
  return { type: 'link', url, children: [textNode(label)] }
}

function embedNode(target, section, alias, catalog) {
  const kind = classifyEmbed(target, catalog)
  const label = alias || target
  if (kind.type === 'doc') {
    return {
      type: 'wikiEmbed',
      data: {
        hName: 'wiki-embed',
        hProperties: { target, section, alias, uuid: kind.uuid },
      },
      children: [textNode(label)],
    }
  }
  if (kind.type === 'external') return linkNode(kind.url, label)
  return textNode(label)
}

function wikilinkNode(target, section, alias, catalog) {
  const label = alias || target
  if (hasScheme(target)) return linkNode(target, label)
  const uuid = catalog.byName.get(target)
  if (!uuid) return textNode(label)
  const href = section
    ? `#/${encodeURIComponent(uuid)}/#${slugify(section)}`
    : `#/${encodeURIComponent(uuid)}/`
  return linkNode(href, label)
}

// Split one text node. The markdown parser has already kept fenced and
// inline code out of text nodes, so those stays literal.
export function splitVaultText(value, catalog) {
  if (!value) return []
  const out = []
  const re = new RegExp(TOKEN.source, 'g')
  let last = 0
  let m
  while ((m = re.exec(value))) {
    if (m.index > last) out.push(textNode(value.slice(last, m.index)))
    if (m[1] != null) {
      out.push(embedNode(m[1].trim(), m[2] ? m[2].trim() : '', m[3] ? m[3].trim() : '', catalog))
    } else {
      out.push(wikilinkNode(m[4].trim(), m[5] ? m[5].trim() : '', m[6] ? m[6].trim() : '', catalog))
    }
    last = m.index + m[0].length
  }
  if (last < value.length) out.push(textNode(value.slice(last)))
  if (!out.length) out.push(textNode(value))
  return out
}

export function remarkVault(catalog) {
  return function attacher() {
    return function transform(tree) {
      rewrite(tree)
    }
    function rewrite(node) {
      if (!node || !node.children || node.type === 'code' || node.type === 'inlineCode') return
      const next = []
      for (const child of node.children) {
        if (child.type === 'text' && node.type !== 'link') next.push(...splitVaultText(child.value, catalog))
        else {
          rewrite(child)
          next.push(child)
        }
      }
      if (node.type === 'paragraph') {
        const meaningful = next.filter((child) => !(child.type === 'text' && !String(child.value).trim()))
        if (meaningful.length === 1 && meaningful[0].type === 'wikiEmbed') {
          node.type = 'wikiEmbed'
          node.data = meaningful[0].data
          node.children = meaningful[0].children
          return
        }
        // A transclusion inside a sentence cannot hold headings. A link is a
        // correct rendering of a document embed.
        node.children = next.map((child) => {
          if (child.type !== 'wikiEmbed') return child
          const props = child.data.hProperties
          return linkNode(`#/${encodeURIComponent(props.uuid)}/`, props.alias || props.target)
        })
        return
      }
      node.children = next
    }
  }
}
