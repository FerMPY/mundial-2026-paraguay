// Sirve la app (dist/) y expone /api/data: videos por partido + resultados en vivo.
//
//  - GEN  → transmite cada partido como video de YouTube en una playlist de su
//           portada (gen.com.py). Lo extraemos del HTML (CORS lo bloquea en el navegador).
//  - VS   → publica un stream de YouTube por partido en su canal. Scrapeamos la
//           pestaña /streams y sacamos el videoId + los equipos del título.
//  - FIFA → su API pública da marcador, estado y minuto de cada partido.
//
// Local:  npm run build && npm start  →  http://localhost:8642
// Deploy: mismo comando; el puerto sale de $PORT.
import http from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'

const PORT = process.env.PORT || 8642
const DIST = join(fileURLToPath(new URL('.', import.meta.url)), 'dist')
const UA = 'Mozilla/5.0 (Macintosh) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36'
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' }

// "México vs. Sudáfrica" / "Estados Unidos Vs. Paraguay - FIFA..." → ['méxico','sudáfrica']
function teamsFromTitle(t) {
  const core = t.split(' - ')[0].replace(/^#\S+\s*\|?\s*/, '')
  const m = core.split(/\s+vs\.?\s+/i)
  return m.length === 2 ? [m[0].trim(), m[1].trim()] : null
}

let gc = { t: 0, v: null }
async function genVideos() {
  if (Date.now() - gc.t < 60_000 && gc.v) return gc.v
  const out = []
  try {
    const html = await (await fetch('https://www.gen.com.py/', { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15_000) })).text()
    const i = html.indexOf('"versus-playlist"')
    const j = html.indexOf('"data":[', i)
    const k = html.indexOf('],"expires"', j)
    if (i !== -1 && j !== -1 && k !== -1) {
      for (const it of JSON.parse(html.slice(j + 7, k + 1))) {
        const url = (it.sources || []).find(s => s.url)?.url
        const teams = teamsFromTitle(it.title || '')
        if (url && teams) out.push({ teams, url, title: it.title })
      }
    }
  } catch { /* GEN caído → sin videos, no rompe */ }
  gc = { t: Date.now(), v: out }
  return out
}

let vc = { t: 0, v: null }
async function vsVideos() {
  if (Date.now() - vc.t < 120_000 && vc.v) return vc.v
  const out = []
  try {
    const html = await (await fetch('https://www.youtube.com/channel/UCj0RBdETcbD-mChW-ylt-sw/streams', { headers: { 'User-Agent': UA, 'Accept-Language': 'es' }, signal: AbortSignal.timeout(15_000) })).text()
    const m = html.match(/var ytInitialData = (\{.*?\});<\/script>/)
    if (m) {
      const seen = new Set()
      const walk = o => {
        if (Array.isArray(o)) return o.forEach(walk)
        if (o && typeof o === 'object') {
          const lv = o.lockupViewModel
          if (lv?.contentId && !seen.has(lv.contentId)) {
            const title = lv.metadata?.lockupMetadataViewModel?.title?.content || ''
            const teams = teamsFromTitle(title)
            if (teams && /world cup|fifa|mundial/i.test(title)) {
              seen.add(lv.contentId)
              out.push({ teams, url: `https://www.youtube.com/embed/${lv.contentId}`, title })
            }
          }
          Object.values(o).forEach(walk)
        }
      }
      walk(JSON.parse(m[1]))
    }
  } catch { /* YT cambió formato o bloqueó → sin videos */ }
  vc = { t: Date.now(), v: out }
  return out
}

const FIFA = 'https://api.fifa.com/api/v3'
const COMP = '17', SEAS = '285023'
const fifaGet = u => fetch(u, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15_000) }).then(r => r.json())
const teamNames = new Map() // IdTeam → nombre (para resolver la tabla de posiciones)

let fc = { t: 0, v: null }
async function fifaScores() {
  if (Date.now() - fc.t < 30_000 && fc.v) return fc.v
  const out = []
  try {
    const d = await fifaGet(`${FIFA}/calendar/matches?idCompetition=${COMP}&idSeason=${SEAS}&count=104&language=es`)
    for (const r of d.Results || []) {
      const home = (r.Home?.TeamName || [{}])[0].Description
      const away = (r.Away?.TeamName || [{}])[0].Description
      if (!home || !away) continue
      if (r.Home?.IdTeam) teamNames.set(r.Home.IdTeam, home)
      if (r.Away?.IdTeam) teamNames.set(r.Away.IdTeam, away)
      out.push({
        teams: [home, away],
        hs: r.HomeTeamScore, as: r.AwayTeamScore,
        status: r.MatchStatus,         // 1 = por jugarse, 3 = en vivo, otros = jugado
        min: r.MatchTime || null,
        idMatch: r.IdMatch, idStage: r.IdStage,
      })
    }
  } catch { /* FIFA caído → sin marcadores */ }
  fc = { t: Date.now(), v: out }
  return out
}

// Tabla de posiciones (12 grupos). El nombre de equipo se resuelve por IdTeam.
let sc = { t: 0, v: null }
async function standings() {
  if (Date.now() - sc.t < 60_000 && sc.v) return sc.v
  const groups = {}
  try {
    const d = await fifaGet(`${FIFA}/calendar/${COMP}/${SEAS}/289273/standing?language=es`)
    for (const r of d.Results || []) {
      const g = (r.Group || [{}])[0].Description || '—'
      ;(groups[g] ??= []).push({
        team: teamNames.get(r.IdTeam) || (r.TeamName || [{}])[0]?.Description || '',
        pos: r.Position, pts: r.Points, pj: r.Played,
        w: r.Won, d: r.Drawn, l: r.Lost,
        gf: r.For, ga: r.Against, gd: r.GoalsDiference,
        q: r.QualificationStatus || null, // estado de clasificación (clasificado/eliminado)
      })
    }
  } catch { /* sin tabla */ }
  const v = Object.entries(groups).map(([group, rows]) => ({ group, rows: rows.sort((a, b) => a.pos - b.pos) }))
  sc = { t: Date.now(), v }
  return v
}

// Goleadores por partido: solo se piden los EN VIVO cada ciclo; los terminados
// se piden una vez y quedan cacheados para siempre (no cambian).
const goalCache = new Map() // idMatch → { teams, events, final }
async function fetchGoals(s) {
  try {
    const m = await fifaGet(`${FIFA}/live/football/${COMP}/${SEAS}/${s.idStage}/${s.idMatch}?language=es`)
    const events = []
    for (const side of ['HomeTeam', 'AwayTeam']) {
      const t = m[side] || {}
      const names = new Map((t.Players || []).map(p => [p.IdPlayer, ((p.ShortName || p.PlayerName || [{}])[0] || {}).Description]))
      for (const g of t.Goals || []) {
        events.push({ side: side === 'HomeTeam' ? 'h' : 'a', name: names.get(g.IdPlayer) || '', min: g.Minute, og: g.Type === 3, pen: g.Type === 4 })
      }
    }
    events.sort((a, b) => parseInt(a.min) - parseInt(b.min))
    goalCache.set(s.idMatch, { teams: s.teams, events, final: s.status !== 1 && s.status !== 3 })
  } catch { /* este partido no devolvió detalle ahora */ }
}
async function goals(scores) {
  const live = scores.filter(s => s.status === 3)
  const finishedNew = scores.filter(s => s.status !== 1 && s.status !== 3 && !goalCache.get(s.idMatch)?.final).slice(0, 6)
  await Promise.all([...live, ...finishedNew].map(fetchGoals)) // vivos siempre, terminados de a 6 por ciclo
  return [...goalCache.values()].filter(g => g.events.length).map(g => ({ teams: g.teams, events: g.events }))
}

// la agenda se lee fresca del disco: editás matches.json y la página se
// actualiza sola en el próximo poll, sin rebuild ni reinicio
let mc = { t: 0, v: null }
async function matchesJson() {
  if (Date.now() - mc.t < 5_000 && mc.v) return mc.v
  try {
    mc = { t: Date.now(), v: JSON.parse(await readFile(join(fileURLToPath(new URL('.', import.meta.url)), 'matches.json'), 'utf8')) }
  } catch { mc = { t: Date.now(), v: null } }
  return mc.v
}

async function apiData() {
  const [gen, vs, scores, matches] = await Promise.all([genVideos(), vsVideos(), fifaScores(), matchesJson()])
  const [table, gls] = await Promise.all([standings(), goals(scores)]) // standings/goals dependen de scores
  return { videos: { gen, vs }, scores, matches, standings: table, goals: gls, fetched: Math.floor(Date.now() / 1000) }
}

http.createServer(async (req, res) => {
  const path = new URL(req.url, 'http://x').pathname
  if (path.replace(/\/$/, '') === '/api/data') {
    try {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
      res.end(JSON.stringify(await apiData()))
    } catch (e) {
      res.writeHead(502, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: String(e) }))
    }
    return
  }
  let file = normalize(path).replace(/^(\.\.[/\\])+/, '')
  if (file === '/' || file === '\\') file = '/index.html'
  try {
    const data = await readFile(join(DIST, file))
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' }); res.end(data)
  } catch {
    try {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(await readFile(join(DIST, 'index.html')))
    } catch { res.writeHead(404); res.end('Falta dist/ — corré: npm run build') }
  }
}).listen(PORT, () => console.log(`Mundial 2026 PY → http://localhost:${PORT}  (Ctrl+C para cerrar)`))
