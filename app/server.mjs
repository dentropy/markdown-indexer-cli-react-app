// One process: the built React app, plus the published JSON beside it.
// DATA_ROOT is a markdown-tools-cli -site-dir folder.
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'dist')
const dataRoot = process.env.DATA_ROOT
const port = Number(process.env.PORT || 4173)

if (!dataRoot) {
  console.error('DATA_ROOT is required (the publisher output directory)')
  process.exit(1)
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
        send(res, 200, buf, types['.html'])
      })
      return
    }
    if (missing) return send(res, 404, 'not found')
    fs.readFile(file, (err, buf) => {
      if (err) return send(res, 404, 'not found')
      send(res, 200, buf, types[path.extname(file)] || 'application/octet-stream')
    })
  })
})

server.listen(port, '127.0.0.1', () => {
  console.log(`http://127.0.0.1:${port}/`)
})
