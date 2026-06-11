// Sirve la app (dist/) y expone /api/gen: la playlist de partidos de la portada de GEN.
//
// GEN ya no usa /live — cada partido se transmite como un video de YouTube que
// aparece en una playlist embebida en el HTML de gen.com.py. La extraemos acá
// (server-side, porque el navegador no puede leer gen.com.py por CORS).
//
// Local:  npm run build && npm start  →  http://localhost:8642
// Deploy: mismo comando; el puerto sale de $PORT (Railway/Render/etc.)
import http from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'

const PORT = process.env.PORT || 8642
const DIST = join(fileURLToPath(new URL('.', import.meta.url)), 'dist')
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
}

let cache = { t: 0, data: null }

async function genPlaylist() {
  if (Date.now() - cache.t < 60_000 && cache.data) return cache.data
  const res = await fetch('https://www.gen.com.py/', {
    headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/126' },
    signal: AbortSignal.timeout(15_000),
  })
  const html = await res.text()
  const items = []
  const i = html.indexOf('"versus-playlist"')
  if (i !== -1) {
    const j = html.indexOf('"data":[', i)
    const k = html.indexOf('],"expires"', j)
    if (j !== -1 && k !== -1) {
      for (const it of JSON.parse(html.slice(j + 7, k + 1))) {
        items.push({
          title: it.title,
          date: it.date ?? null,
          sources: (it.sources || []).filter(s => s.url),
        })
      }
    }
  }
  cache = { t: Date.now(), data: { items, fetched: Math.floor(Date.now() / 1000) } }
  return cache.data
}

http.createServer(async (req, res) => {
  const path = new URL(req.url, 'http://x').pathname

  if (path.replace(/\/$/, '') === '/api/gen') {
    try {
      const body = JSON.stringify(await genPlaylist())
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
      res.end(body)
    } catch (e) {
      res.writeHead(502, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: String(e), items: [] }))
    }
    return
  }

  // estáticos de dist/, con fallback a index.html
  let file = normalize(path).replace(/^(\.\.[/\\])+/, '')
  if (file === '/' || file === '\\') file = '/index.html'
  try {
    const data = await readFile(join(DIST, file))
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' })
    res.end(data)
  } catch {
    try {
      const data = await readFile(join(DIST, 'index.html'))
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(data)
    } catch {
      res.writeHead(404)
      res.end('Falta dist/ — corré: npm run build')
    }
  }
}).listen(PORT, () => {
  console.log(`Mundial 2026 PY → http://localhost:${PORT}  (Ctrl+C para cerrar)`)
})
