// One process: the built React app, plus the published JSON beside it.
// DATA_ROOT is a markdown-tools-cli -site-dir folder.
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'dist')
const dataRoot = process.env.DATA_ROOT
const port = Number(process.env.PORT || 4173)
// 127.0.0.1 keeps `npm run serve` on the machine. The image sets HOST=0.0.0.0.
const host = process.env.HOST || '127.0.0.1'

function envPick(env, keys) {
  for (const key of keys) {
    const value = String(env[key] ?? '').trim()
    if (value) return value
  }
  return ''
}

// Docker Compose sets the unprefixed names. VITE_* matches app/.env.local.
export function vaultConfigFromEnv(env = process.env) {
  return {
    posthogToken: envPick(env, ['POSTHOG_PROJECT_TOKEN', 'VITE_POSTHOG_PROJECT_TOKEN']),
    posthogHost: envPick(env, ['POSTHOG_HOST', 'VITE_POSTHOG_HOST']),
    homeDocumentId: envPick(env, ['HOME_DOCUMENT_ID', 'VITE_HOME_DOCUMENT_ID']),
  }
}

export function injectVaultConfig(html, env = process.env) {
  const json = JSON.stringify(vaultConfigFromEnv(env)).replace(/</g, '\\u003c')
  const tag = `<script>window.__VAULT__=${json}</script>`
  if (html.includes('window.__VAULT__')) return html
  if (html.includes('</head>')) return html.replace('</head>', `${tag}</head>`)
  return tag + html
}

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
}

function isData(urlPath) {
  return urlPath === '/directory.json'
    || urlPath.startsWith('/articles/')
    || urlPath.startsWith('/frontmatter/')
    || urlPath.startsWith('/backlinks/')
    || urlPath.startsWith('/assets/')
}

function safeJoin(root, urlPath) {
  const rel = decodeURIComponent(urlPath).replace(/^\/+/, '')
  const full = path.resolve(root, rel)
  const base = path.resolve(root)
  if (full !== base && !full.startsWith(base + path.sep)) return null
  return full
}

function send(res, status, body, type) {
  res.writeHead(status, {
    'content-type': type || 'text/plain; charset=utf-8',
    'cache-control': 'no-cache',
  })
  res.end(body)
}

const server = http.createServer((req, res) => {
  const urlPath = new URL(req.url, 'http://127.0.0.1').pathname
  const root = isData(urlPath) ? dataRoot : appRoot
  const file = safeJoin(root, urlPath === '/' ? '/index.html' : urlPath)
  if (!file) return send(res, 400, 'bad path')

  fs.stat(file, (statErr, stat) => {
    const missing = statErr || stat.isDirectory()
    if (missing && !isData(urlPath)) {
      fs.readFile(path.join(appRoot, 'index.html'), (err, buf) => {
        if (err) return send(res, 404, 'not found')
        send(res, 200, injectVaultConfig(buf.toString('utf8')), types['.html'])
      })
      return
    }
    if (missing) return send(res, 404, 'not found')
    fs.readFile(file, (err, buf) => {
      if (err) return send(res, 404, 'not found')
      const ext = path.extname(file)
      const body = !isData(urlPath) && ext === '.html'
        ? injectVaultConfig(buf.toString('utf8'))
        : buf
      send(res, 200, body, types[ext] || 'application/octet-stream')
    })
  })
})

const entry = process.argv[1]
const direct = !!entry && path.resolve(entry) === fileURLToPath(import.meta.url)
if (direct) {
  if (!dataRoot) {
    console.error('DATA_ROOT is required (the publisher output directory)')
    process.exit(1)
  }
  server.listen(port, host, () => {
    console.log(`http://${host}:${port}/`)
  })
}
