import './style.css'
import { CHANNELS, M } from './data.js'

/* ---------------- cómo se reproduce cada canal ----------------
   - iframe  → el player del canal se incrusta directo (Trece)
   - crop    → portal del canal recortado a la banda del player (Unicanal)
   - yt      → señal en vivo del canal de YouTube (Popu, VS)
   GEN y VS publican un VIDEO POR PARTIDO en YouTube: cuando existe (vía
   /api/data) ese video reemplaza a la señal genérica del canal.
   GEN es simple a propósito: video del partido si lo capturamos; si no,
   tarjeta SIN SEÑAL con opciones (su player 24/7 bloquea iframes anidados
   entre partidos y su canal de YouTube pasa sus programas, no los partidos
   → matchOnly). */
const httpHost = (location.protocol === 'http:' || location.protocol === 'https:') ? location.hostname : null
const EMBEDS = {
  gen:   { type: 'yt', channel: 'UC9FQShRxvepLNn6lLfvBhyA', src: 'https://www.gen.com.py/', matchOnly: true, note: 'GEN — el video del partido aparece acá cerca de la hora.' },
  trece: { type: 'iframe', src: 'https://trece.com.py/en-vivo/',    note: 'Reproductor oficial de Trece. Tocá ▶ dentro del recuadro si no arranca solo.' },
  uni:   { type: 'crop',   src: 'https://unicanal.com.py/en-vivo/', note: 'Señal en vivo oficial de Unicanal. Tocá ▶ dentro del recuadro para arrancar.' },
  popu:  { type: 'yt', channel: 'UCYxENSyddnf_A9dWrYXZN6A',         note: 'Señal de Popu TV en YouTube — se ve acá cuando están transmitiendo en vivo.' },
  vs:    { type: 'yt', channel: 'UCj0RBdETcbD-mChW-ylt-sw',         note: 'VS Sports — su video del partido en YouTube. Si todavía no arrancó, mostrará la cuenta regresiva.' },
}
const CH_ORDER = ['gen', 'trece', 'uni', 'popu', 'vs'] // sin Tigo (app con DRM, no incrustable)

/* recortes de portales: banda vertical del player, en coords de página a 1100px */
const CROPS = {
  uni: { y: -250, ca: '1100/520', key: 'uniCropY' },
}

/* ---------------- datos en vivo (videos + marcadores + tabla + goleadores) ---------------- */
const API = { videos: { gen: [], vs: [] }, scores: [], standings: [], goals: [], prode: [] }
let videoIdx = {}, scoreIdx = {}, goalIdx = {}
function canon(name) {
  let s = name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\./g, '').replace(/\s+/g, ' ').trim()
  return ({
    'ee uu': 'estados unidos', 'eeuu': 'estados unidos',
    'islas de cabo verde': 'cabo verde',
    'ri de iran': 'iran',
    'republica de corea': 'corea del sur',
    'catar': 'qatar',
    'bosnia y herzegovina': 'bosnia',
    'arabia saudi': 'arabia saudita',
  })[s] || s
}
const pk = (a, b) => [canon(a), canon(b)].sort().join('|')
function rebuildIdx() {
  videoIdx = {}
  for (const prov of ['gen', 'vs']) for (const v of API.videos[prov] || []) {
    if (v.teams) (videoIdx[pk(...v.teams)] ??= {})[prov] = v.url
  }
  scoreIdx = {}
  for (const s of API.scores || []) if (s.teams) scoreIdx[pk(s.teams[0], s.teams[1])] = s
  goalIdx = {}
  for (const g of API.goals || []) if (g.teams) goalIdx[pk(g.teams[0], g.teams[1])] = g
}
// nombre lindo (de la grilla) + bandera por equipo, sacados de M
const flagByCanon = {}, nameByCanon = {}
function rebuildTeamMaps() {
  for (const m of M) { flagByCanon[canon(m.a)] = m.fa; flagByCanon[canon(m.b)] = m.fb; nameByCanon[canon(m.a)] = m.a; nameByCanon[canon(m.b)] = m.b }
}
const goalsFor = m => goalIdx[pk(m.a, m.b)]?.events || []
async function fetchData() {
  if (!httpHost) return false
  try {
    const d = await (await fetch('/api/data')).json()
    if (d.videos) API.videos = d.videos
    if (d.scores) API.scores = d.scores
    if (d.standings) API.standings = d.standings
    if (d.prode) API.prode = d.prode
    if (Array.isArray(d.matches) && d.matches.length && JSON.stringify(d.matches) !== JSON.stringify(M)) {
      M.length = 0; M.push(...d.matches) // matches.json editado → agenda fresca sin rebuild
      rebuildByMk(); rebuildTeamMaps()
    }
    const prevGoals = goalIdx
    if (d.goals) API.goals = d.goals
    rebuildIdx()
    notifyGoals(prevGoals)
    render(activeFilter); nowTick(); renderStandings(); renderProde()
    if (document.body.classList.contains('watching') && thMatch) { // refrescar marcador en la barra
      const wn = document.getElementById('watchNow'); const st = matchState(thMatch)
      wn.innerHTML = `${scoreChip(st)} ${teamsHTML(thMatch)} <span class="on-ch">· ${CHANNELS[thCh].name}</span>`
    }
    return true
  } catch { return false /* sin server o sin red → la agenda sigue andando sin marcadores */ }
}
/* polling con cabeza: parado con la pestaña oculta, 30s con partido en vivo,
   90s si no (portado de la versión teletexto — menos pedidos al pedo) */
let pollTimer = null
async function pollTick() {
  if (document.hidden) return
  await fetchData()
  const anyLive = (API.scores || []).some(s => s.status === 3) || M.some(m => matchState(m).live)
  clearTimeout(pollTimer)
  pollTimer = setTimeout(pollTick, anyLive ? 30_000 : 90_000)
}
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) { clearTimeout(pollTimer); pollTick() }
})
const videoUrl = (m, prov) => videoIdx[pk(m.a, m.b)]?.[prov]
// estado de un partido: {live, final, hs, as, min}
function matchState(m) {
  const s = scoreIdx[pk(m.a, m.b)]
  if (!s || s.hs == null) {
    // sin dato de FIFA: caemos al reloj (hora PY) para detectar "en vivo"
    const now = nowPY().key
    const live = mKey(m) <= now && now < addMin(m.d, m.t, LIVE_MIN)
    return { live, final: addMin(m.d, m.t, LIVE_MIN) <= now, hs: null, as: null, min: null }
  }
  const live = s.status === 3
  return { live, final: !live && s.status !== 1, hs: s.hs, as: s.as, min: s.min }
}

/* ---------------- hora paraguaya, sin offset hardcodeado ---------------- */
const pyFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Asuncion', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
function nowPY() {
  const p = Object.fromEntries(pyFmt.formatToParts(new Date()).map(x => [x.type, x.value]))
  return { key: `${p.year}-${p.month}-${p.day}T${p.hour === '24' ? '00' : p.hour}:${p.minute}`, date: `${p.year}-${p.month}-${p.day}` }
}
const mKey = m => `${m.d}T${m.t}`
function addMin(d, t, mins) {
  const [Y, Mo, D] = d.split('-').map(Number), [H, Mi] = t.split(':').map(Number)
  return new Date(Date.UTC(Y, Mo - 1, D, H, Mi + mins)).toISOString().slice(0, 16)
}
const LIVE_MIN = 125

const DOW = ['DOMINGO', 'LUNES', 'MARTES', 'MIÉRCOLES', 'JUEVES', 'VIERNES', 'SÁBADO']
const DOW3 = ['DOM', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB']
const MES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
function dayLabel(d) {
  const [Y, Mo, D] = d.split('-').map(Number)
  return `${DOW[new Date(Date.UTC(Y, Mo - 1, D)).getUTCDay()]} ${D} de ${MES[Mo - 1]}`
}
function dayShort(d) {
  const [Y, Mo, D] = d.split('-').map(Number)
  return `${DOW3[new Date(Date.UTC(Y, Mo - 1, D)).getUTCDay()]} ${D}`
}
const teamsHTML = m => `<span class="m-flag">${m.fa}</span>${m.a} <span class="vs">vs</span> <span class="m-flag">${m.fb}</span>${m.b}`
function scorersHTML(m) {
  const ev = goalsFor(m); if (!ev.length) return ''
  const one = e => `${e.name}${e.pen ? ' (P)' : ''}${e.og ? ' (ec)' : ''} ${e.min}`
  const h = ev.filter(e => e.side === 'h').map(one).join(', ')
  const a = ev.filter(e => e.side === 'a').map(one).join(', ')
  return `<div class="m-scorers"><span class="ball">⚽</span>${[h, a].filter(Boolean).join(' · ')}</div>`
}

/* ---------------- prode (en este navegador: localStorage, sin cuenta) ----------------
   clave por par de equipos (pk) → sobrevive a cambios de grilla.
   Puntos: exacto +3, acertar ganador/empate +1. Se cierra al kickoff. */
const PRODE_KEY = 'prode26'
let prode = {}
try { prode = JSON.parse(localStorage.getItem(PRODE_KEY) || '{}') } catch { prode = {} }
function savePred(k, side, val) {
  const p = prode[k] ?? (prode[k] = {})
  p[side] = val
  localStorage.setItem(PRODE_KEY, JSON.stringify(prode))
}
const clampGoals = v => { const n = Number(v); return Number.isInteger(n) && n >= 0 ? Math.min(n, 20) : null }
function prodePoints(ph, pa, rh, ra) {
  if (ph === rh && pa === ra) return 3
  return Math.sign(ph - pa) === Math.sign(rh - ra) ? 1 : 0
}
const isLocked = m => mKey(m) <= nowPY().key
const slug = s => s.replace(/[^a-z0-9]+/gi, '-')
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

/* identidad para el ranking compartido: token aleatorio (la identidad) +
   nombre elegido (lo que ve el ranking). Sin cuentas: vive en localStorage. */
let ident = null
try { ident = JSON.parse(localStorage.getItem('prodeId') || 'null') } catch { ident = null }
function setIdentName(name) {
  ident = { token: ident?.token || crypto.randomUUID(), name: name.replace(/\s+/g, ' ').trim().slice(0, 20) }
  localStorage.setItem('prodeId', JSON.stringify(ident))
}
/* manda nombre + todos los pronos abiertos al server (debounced). El server
   revalida el cierre por kickoff; esto solo alimenta el ranking. */
let syncT = null, syncState = ''
function syncProde(asap = false) {
  if (!ident?.name || !httpHost) return
  clearTimeout(syncT)
  syncT = setTimeout(async () => {
    const preds = []
    for (const m of M) {
      const k = pk(m.a, m.b); const p = prode[k]
      const h = clampGoals(p?.h), a = clampGoals(p?.a)
      if (h != null && a != null && !isLocked(m)) preds.push({ k, h, a })
    }
    syncState = 'sync'; renderProdeHead()
    try {
      const r = await fetch('/api/prode', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: ident.token, name: ident.name, preds }) })
      syncState = r.ok ? 'ok' : 'err'
    } catch { syncState = 'err' }
    renderProdeHead()
  }, asap ? 50 : 1200)
}

function prodeTotals() {
  let total = 0, exact = 0, scored = 0, played = 0, made = 0
  for (const m of M) {
    const p = prode[pk(m.a, m.b)]
    const ph = clampGoals(p?.h), pa = clampGoals(p?.a)
    const has = ph != null && pa != null
    if (has) made++
    if (!isLocked(m)) continue
    const st = matchState(m)
    if (st.hs == null) continue
    played++
    if (has && st.final) {
      const pts = prodePoints(ph, pa, st.hs, st.as)
      total += pts
      if (pts === 3) exact++
      if (pts > 0) scored++
    }
  }
  return { total, exact, scored, played, made }
}
function renderProdeHead() {
  const t = prodeTotals()
  const id = ident?.name
    ? `<span class="ph-id">Jugás como <b>${esc(ident.name)}</b> <button class="ph-edit" id="prodeRename">cambiar</button>
       <span class="ph-sync">${syncState === 'sync' ? 'subiendo…' : syncState === 'ok' ? '<span class="saved">en el ranking ✓</span>' : syncState === 'err' ? 'sin conexión al ranking' : ''}</span></span>`
    : `<span class="ph-id"><input id="prodeName" class="ph-name" maxlength="20" placeholder="Tu nombre…" aria-label="Tu nombre para el ranking">
       <button class="btn small" id="prodeJoin">Entrar al ranking</button></span>`
  document.getElementById('prodeHead').innerHTML = `
    <span class="ph-pts">${t.total}<small>PTS</small></span>
    <span class="ph-stats"><b>${t.exact}</b> exactos · <b>${t.scored}</b> con puntos de <b>${t.played}</b> jugados · <b>${t.made}</b> pronos cargados</span>
    ${id}`
}
document.getElementById('prodeHead').addEventListener('click', e => {
  if (e.target.closest('#prodeJoin')) {
    const name = document.getElementById('prodeName')?.value || ''
    if (!name.trim()) { document.getElementById('prodeName')?.focus(); return }
    setIdentName(name); syncProde(true); renderProdeHead()
  }
  if (e.target.closest('#prodeRename')) {
    const prev = ident?.name || ''
    ident = { token: ident?.token, name: '' } // mismo token: el ranking conserva tus puntos
    renderProdeHead()
    const inp = document.getElementById('prodeName')
    if (inp) { inp.value = prev; inp.focus(); inp.select() }
  }
})
document.getElementById('prodeHead').addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target.id === 'prodeName') document.getElementById('prodeJoin')?.click()
})

/* ranking compartido (viene en /api/data desde la db del server) */
function boardHTML() {
  const b = API.prode || []
  if (!b.length) return ''
  return `<div class="board">
    <div class="board-h">Ranking</div>
    ${b.slice(0, 30).map((e, i) => `
      <div class="board-row${ident?.name && e.name === ident.name ? ' me' : ''}">
        <span class="b-pos">${i + 1}</span>
        <span class="b-name">${esc(e.name)}</span>
        <span class="b-det">${e.exact} exactos · ${e.played} jugados</span>
        <span class="b-pts">${e.pts} pts</span>
      </div>`).join('')}
  </div>`
}
function renderProde() {
  const list = document.getElementById('prodeList')
  if (document.getElementById('viewProde').hidden) return
  const now = nowPY()
  let html = '', curDay = ''
  for (const m of M) {
    const k = pk(m.a, m.b)
    const p = prode[k]
    const ph = clampGoals(p?.h), pa = clampGoals(p?.a)
    const has = ph != null && pa != null
    const st = matchState(m)
    const locked = isLocked(m)
    if (m.d !== curDay) { curDay = m.d; html += `<div class="day-h"><span class="d">${dayLabel(m.d)}${m.d === now.date ? '</span><span class="today-tag">Hoy</span>' : '</span>'}</div>` }
    const when = `${dayShort(m.d)} · ${m.t}`
    if (!locked) {
      html += `<article class="pred open" id="pred-${slug(k)}">
        <span class="p-when">${when}</span>
        <span class="p-teams">${teamsHTML(m)}</span>
        <span class="p-in">
          <input type="number" min="0" max="20" inputmode="numeric" placeholder="–" data-pk="${k}" data-side="h" value="${ph ?? ''}" aria-label="Goles ${m.a}">
          <span class="dash">–</span>
          <input type="number" min="0" max="20" inputmode="numeric" placeholder="–" data-pk="${k}" data-side="a" value="${pa ?? ''}" aria-label="Goles ${m.b}">
        </span>
        <span class="p-state" data-state="${k}">${has ? '<span class="saved">guardado ✓</span>' : 'tu prono'}</span>
      </article>`
      continue
    }
    // cerrado: resultado vs prono (+ puntos si ya terminó)
    let res = ''
    if (st.hs != null) {
      let ptsTag = ''
      if (has && st.final) {
        const pts = prodePoints(ph, pa, st.hs, st.as)
        ptsTag = `<span class="p-pts p${pts}">${pts > 0 ? '+' : ''}${pts} pts</span>`
      } else if (has && st.live) {
        ptsTag = `<span class="p-pts">en juego</span>`
      }
      res = `<span class="p-res">${st.live ? '<span class="live-dot"></span>' : ''}<b>${st.hs}–${st.as}</b>${has ? ` · tu prono ${ph}–${pa}` : ' · sin prono'}${ptsTag}</span>`
    } else {
      res = `<span class="p-res">${has ? `tu prono <b>${ph}–${pa}</b> · cerrado` : 'sin prono · cerrado'}</span>`
    }
    html += `<article class="pred" id="pred-${slug(k)}">
      <span class="p-when">${when}</span>
      <span class="p-teams">${teamsHTML(m)}</span>
      ${res}
    </article>`
  }
  list.innerHTML = boardHTML() + html + `<p class="prode-cross">Bonus: el prode también existe en versión teletexto en <a href="https://teletexto.lakebed.app/#300" target="_blank" rel="noopener">teletexto.lakebed.app</a>.</p>`
  renderProdeHead()
}
// guardar al tipear (con tope 0–20); el estado "guardado ✓" aparece al lado
document.addEventListener('input', e => {
  const inp = e.target.closest('.p-in input'); if (!inp) return
  const k = inp.dataset.pk
  const m = M.find(x => pk(x.a, x.b) === k)
  if (m && isLocked(m)) { renderProde(); return } // se cerró mientras editabas
  let v = clampGoals(inp.value)
  if (inp.value !== '' && v == null) { inp.value = ''; v = null }
  if (v != null && String(v) !== inp.value) inp.value = String(v)
  savePred(k, inp.dataset.side, v)
  const p = prode[k]
  const stEl = document.querySelector(`[data-state="${CSS.escape(k)}"]`)
  if (stEl) stEl.innerHTML = clampGoals(p?.h) != null && clampGoals(p?.a) != null ? '<span class="saved">guardado ✓</span>' : 'tu prono'
  renderProdeHead()
  syncProde()
})
// saltar desde un chip PRODE de la agenda directo a ESE partido
function prodeJump(k) {
  setView('prode')
  requestAnimationFrame(() => {
    const el = document.getElementById('pred-' + slug(k))
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el.classList.remove('hl'); void el.offsetWidth; el.classList.add('hl')
    el.querySelector('input')?.focus({ preventScroll: true })
  })
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-prode]')
  if (b) prodeJump(b.dataset.prode)
})

/* ---------------- teatro ---------------- */
const theater = document.getElementById('theater')
const thTabs = document.getElementById('thTabs')
const thScreen = document.getElementById('thScreen')
const thSrcs = document.getElementById('thSrcs')
let thCh = null, thMatch = null
let thForce = null // pedido desde la tarjeta SIN SEÑAL: 'site' = sitio embebido, 'yt' = señal YouTube

function scoreChip(st) {
  if (st.live) return `<span class="lv"><span class="live-dot"></span>En vivo</span>${st.hs != null ? `<span class="sc">${st.hs}–${st.as}</span>` : ''}${st.min ? `<span class="mn">${st.min}</span>` : ''}`
  if (st.final && st.hs != null) return `<span class="fin">Final</span><span class="sc">${st.hs}–${st.as}</span>`
  return ''
}
function enterCinema(ch, match) {
  document.body.classList.add('watching')
  const wn = document.getElementById('watchNow')
  if (match) {
    const st = matchState(match)
    wn.innerHTML = `${scoreChip(st)} ${teamsHTML(match)} <span class="on-ch">· ${CHANNELS[ch].name}</span>`
  } else {
    wn.innerHTML = `Mirando <span class="on-ch">· ${CHANNELS[ch].name}</span>`
  }
}
function exitCinema() {
  document.body.classList.remove('watching')
  theater.classList.remove('open')
  thScreen.innerHTML = ''; thSrcs.hidden = true; thCh = thMatch = null; thForce = null
  history.replaceState(null, '', location.pathname)
}
document.getElementById('watchBack').addEventListener('click', exitCinema)
document.addEventListener('keydown', e => { if (e.key === 'Escape' && document.body.classList.contains('watching')) exitCinema() })

/* recortes */
function cropY(ch) { return Number(localStorage.getItem(CROPS[ch].key) ?? CROPS[ch].y) }
function cropFrame(ch, src) {
  thScreen.classList.add('crop')
  thScreen.style.setProperty('--ca', CROPS[ch].ca)
  thScreen.style.setProperty('--gy', cropY(ch))
  thScreen.innerHTML = `<iframe src="${src}" allow="autoplay; fullscreen; encrypted-media; picture-in-picture" allowfullscreen></iframe>`
  fitCrop()
}
function fitCrop() { if (thScreen.classList.contains('crop')) thScreen.style.setProperty('--gs', (thScreen.clientWidth / 1100).toFixed(4)) }
window.addEventListener('resize', fitCrop)
const ytFrame = url => { const s = url.includes('?') ? '&' : '?'; return `<iframe src="${url}${s}autoplay=1" allow="autoplay; fullscreen; encrypted-media; picture-in-picture" allowfullscreen></iframe>` }
const plainFrame = src => `<iframe src="${src}" allow="autoplay; fullscreen; encrypted-media; picture-in-picture" allowfullscreen referrerpolicy="no-referrer-when-downgrade"></iframe>`
const nudgeHtml = () => `<span class="th-nudge"><span>Ajustar recorte</span><button data-nudge="-25" title="Subir">▲</button><button data-nudge="25" title="Bajar">▼</button></span>`

/* tarjeta SIN SEÑAL: antes de la hora (todos los canales de YouTube, su embed
   "live" da un feo unavailable) y para GEN también durante el partido si no
   capturamos su video. Botones: sitio del canal embebido / probar señal YT. */
function noFeedCard(ch, match, st) {
  const c = CHANNELS[ch], e = EMBEDS[ch]
  const live = !!st?.live
  return `<div class="th-msg">
    <span class="nf-badge${live ? '' : ' off'}"><span class="live-dot"${live ? '' : ' style="animation:none;background:var(--mut)"'}></span>${live ? 'Sin señal acá' : 'Todavía sin señal'}</span>
    <span class="big">${c.name}</span>
    <span class="nf-line">${
      live ? `El video del partido no nos llegó — miralo en el sitio de ${c.name}.`
      : match ? `${c.name} prende su transmisión cerca de las ${match.t}. Volvé cuando arranque el partido.`
      : `${c.name} publica el video de cada partido cerca de la hora.`}</span>
    ${live ? `<a class="btn" href="${c.url}" target="_blank" rel="noopener">Abrir ${c.name} en vivo ↗</a>` : ''}
    <span class="nf-row">
      ${e.src ? `<button class="btn ghost" data-force="site">Ver el sitio de ${c.name} acá mismo</button>` : ''}
      ${e.channel ? `<button class="btn ghost" data-force="yt">Probar señal YouTube</button>` : ''}
    </span>
  </div>`
}
thScreen.addEventListener('click', e => {
  const b = e.target.closest('[data-force]')
  if (b) { thForce = b.dataset.force; renderSource(thCh, thMatch) }
})

// dibuja la fuente del canal ch para el partido match (o señal genérica si no hay match)
function renderSource(ch, match) {
  thScreen.classList.remove('crop'); thScreen.style.removeProperty('--gs')
  thSrcs.hidden = true
  // video del partido (GEN / VS) cuando existe — siempre gana
  if (match && (ch === 'gen' || ch === 'vs')) {
    const u = videoUrl(match, ch)
    if (u) { thScreen.innerHTML = ytFrame(u); return }
  }
  const e = EMBEDS[ch]
  // fallbacks pedidos desde la tarjeta
  if (thForce === 'site' && e.src) { thScreen.innerHTML = plainFrame(e.src); return }
  if (thForce === 'yt' && e.channel) { thScreen.innerHTML = ytFrame(`https://www.youtube.com/embed/live_stream?channel=${e.channel}`); return }
  if (e.type === 'yt') {
    const st = match ? matchState(match) : null
    const noFeed = match ? (!st.final && (!st.live || e.matchOnly)) : !!e.matchOnly
    if (noFeed) { thScreen.innerHTML = noFeedCard(ch, match, st); return }
    thScreen.innerHTML = ytFrame(`https://www.youtube.com/embed/live_stream?channel=${e.channel}`)
    return
  }
  if (e.type === 'crop') { cropFrame(ch, e.src); thSrcs.innerHTML = nudgeHtml(); thSrcs.hidden = false; return }
  thScreen.innerHTML = plainFrame(e.src)
}

function openTheater(ch, match = null, scroll = true) {
  thCh = ch; thMatch = match; thForce = null
  history.replaceState(null, '', match ? `#m-${mKey(match)}-${ch}` : `#ch-${ch}`)
  theater.classList.add('open')
  enterCinema(ch, match)
  // pestañas = canales que transmiten ESTE partido (o todos, si es señal suelta)
  const tabs = match ? match.ch.filter(c => CH_ORDER.includes(c)) : CH_ORDER
  thTabs.innerHTML = tabs.map(k => `<button class="th-tab${k === ch ? ' on' : ''}" data-ch="${k}" style="--tc:${CHANNELS[k].color}">${CHANNELS[k].name}</button>`).join('') +
    `<button class="th-close" id="thClose" title="Cerrar">✕</button>`
  document.getElementById('thNote').textContent = EMBEDS[ch].note
  const ext = document.getElementById('thExt'); ext.href = CHANNELS[ch].url; ext.textContent = `Abrir en el sitio de ${CHANNELS[ch].name} ↗`
  renderSource(ch, match)
  if (scroll) window.scrollTo({ top: 0, behavior: 'smooth' })
}
thTabs.addEventListener('click', e => {
  if (e.target.closest('#thClose')) return exitCinema()
  const t = e.target.closest('.th-tab'); if (t) openTheater(t.dataset.ch, thMatch, false)
})
thSrcs.addEventListener('click', e => {
  const n = e.target.closest('[data-nudge]')
  if (n && CROPS[thCh]) {
    localStorage.setItem(CROPS[thCh].key, cropY(thCh) + Number(n.dataset.nudge))
    thScreen.style.setProperty('--gy', cropY(thCh))
  }
})

/* ---------------- canales (tarjetas) ---------------- */
const strip = document.getElementById('strip')
strip.innerHTML = CH_ORDER.map(k => {
  const c = CHANNELS[k]
  return `<a class="ch-card" style="--ch-color:${c.color}" href="${c.url}" data-ch="${k}" target="_blank" rel="noopener">
      <div class="ch-name">${c.name}</div><div class="ch-kind">${c.kind}</div><span class="ch-go">Ver en vivo ▶</span></a>`
}).join('')
strip.addEventListener('click', e => {
  const card = e.target.closest('.ch-card'); if (!card) return
  e.preventDefault(); openTheater(card.dataset.ch)
})

/* ---------------- agenda ---------------- */
const sched = document.getElementById('sched')
function chLinks(m) {
  return m.ch.filter(k => CH_ORDER.includes(k)).map(k => {
    const c = CHANNELS[k]
    return `<button class="ch-link" style="--ch-color:${c.color}" data-ch="${k}" data-mk="${mKey(m)}" title="Ver ${c.name} acá mismo"><i></i>${c.name}<span class="play">▶</span></button>`
  }).join('')
}
const prodeChip = m => isLocked(m) ? '' : `<button class="ch-link prode-link" data-prode="${pk(m.a, m.b)}" title="Pronosticá este partido en el prode">Prode</button>`
const byMk = {}
function rebuildByMk() { for (const k in byMk) delete byMk[k]; for (const m of M) byMk[mKey(m)] = m }
rebuildByMk()
document.addEventListener('click', e => {
  if (e.target.closest('[data-prode]')) return // el prode tiene su propio handler
  const b = e.target.closest('button.ch-link, button[data-ver]')
  if (b) openTheater(b.dataset.ch, byMk[b.dataset.mk] || null)
})

function render(filter) {
  const now = nowPY()
  sched.innerHTML = ''
  let shown = 0, curDay = null, dayBox = null
  for (const m of M) {
    const isToday = m.d === now.date
    const st = matchState(m)
    if (filter === 'today' && !isToday) continue
    if (filter === 'py' && !m.py) continue
    if (filter === 'live' && !st.live) continue
    if (filter === 'f1' && m.f !== 1) continue
    if (filter === 'f2' && m.f !== 2) continue
    if (filter === 'f3' && m.f !== 3) continue
    if (m.d !== curDay) {
      curDay = m.d
      sched.insertAdjacentHTML('beforeend', `<section class="day"><div class="day-h"><span class="d">${dayLabel(m.d)}</span>${isToday ? '<span class="today-tag">Hoy</span>' : ''}</div><div class="day-list"></div></section>`)
      dayBox = sched.lastElementChild.querySelector('.day-list')
    }
    dayBox.insertAdjacentHTML('beforeend',
      `<article class="match${m.py ? ' py' : ''}${st.live ? ' islive' : ''}${st.final && !st.live ? ' past' : ''}">
        <div class="m-time">${st.hs != null ? `<span class="m-score">${st.hs}–${st.as}</span>` : `<span class="m-hh">${m.t}</span>`}<span class="m-tz">${st.live ? (st.min || 'EN VIVO') : st.hs != null ? 'FINAL' : 'PY'}</span></div>
        <div class="m-body">
          <div class="m-top"><span class="m-teams">${teamsHTML(m)}</span>${st.live ? '<span class="live-badge"><span class="live-dot"></span>En vivo</span>' : ''}</div>
          ${scorersHTML(m)}
          <div class="m-chs">${chLinks(m)}${prodeChip(m)}</div>
        </div>
      </article>`)
    shown++
  }
  document.getElementById('empty').style.display = shown ? 'none' : 'block'
}

/* ---------------- filtros ---------------- */
let activeFilter = 'all'
document.getElementById('filters').addEventListener('click', e => {
  const b = e.target.closest('.chip'); if (!b) return
  document.querySelectorAll('.chip').forEach(c => c.classList.toggle('on', c === b))
  activeFilter = b.dataset.f; render(activeFilter)
})

/* ---------------- barra "ahora / próximo" — accionable acá mismo ---------------- */
const nowStrip = document.getElementById('nowStrip')
function nowTick() {
  const now = nowPY()
  const live = M.filter(m => matchState(m).live)
  let html = ''
  if (live.length) {
    html = `<span class="ns-label live">En vivo ahora</span>` + live.map(m => {
      const st = matchState(m)
      return `<div class="ns-card is-live">
        <span class="ns-teams"><span class="live-dot"></span> ${m.fa} ${m.a} <b>${st.hs != null ? `${st.hs}–${st.as}` : 'vs'}</b> ${m.fb} ${m.b}${st.min ? ` <span class="ns-when">${st.min}</span>` : ''}</span>
        <span class="ns-chs">${chLinks(m)}</span>
      </div>`
    }).join('')
  } else {
    const next = M.find(m => mKey(m) > now.key)
    if (next) {
      const t = new Date(`${next.d}T${next.t}:00`), n = new Date(`${now.key}:00`)
      let s = Math.max(0, Math.floor((t - n) / 1000)); const h = Math.floor(s / 3600); const mi = Math.floor((s % 3600) / 60)
      const inTxt = h > 0 ? `en ${h}h ${mi}m` : `en ${mi} min`
      html = `<span class="ns-label">Próximo partido</span>
        <div class="ns-card">
          <span class="ns-teams">${next.fa} ${next.a} <b>vs</b> ${next.fb} ${next.b}</span>
          <span class="ns-when">${next.t} · ${inTxt}</span>
          <span class="ns-chs">${chLinks(next)}${prodeChip(next)}</span>
        </div>`
    }
  }
  nowStrip.innerHTML = html
  nowStrip.style.display = html ? 'flex' : 'none'
}

/* ---------------- conmutador de vista (agenda / tabla / prode) ---------------- */
const viewAgenda = document.getElementById('viewAgenda')
const viewTable = document.getElementById('viewTable')
const viewProde = document.getElementById('viewProde')
function setView(v) {
  document.querySelectorAll('.vt').forEach(x => x.classList.toggle('on', x.dataset.v === v))
  viewAgenda.hidden = v !== 'agenda'
  viewTable.hidden = v !== 'tabla'
  viewProde.hidden = v !== 'prode'
  if (v === 'tabla') { renderStandings(); history.replaceState(null, '', '#tabla') }
  else if (v === 'prode') { renderProde(); history.replaceState(null, '', '#prode') }
  else history.replaceState(null, '', location.pathname)
}
document.getElementById('viewTabs').addEventListener('click', e => {
  const b = e.target.closest('.vt'); if (b) setView(b.dataset.v)
})

/* ---------------- tabla de posiciones ---------------- */
const standingsEl = document.getElementById('standings')
function teamCell(team) {
  const c = canon(team)
  return `${flagByCanon[c] || '🏳️'} ${nameByCanon[c] || team}`
}
function renderStandings() {
  if (!API.standings.length) { standingsEl.innerHTML = ''; return }
  standingsEl.innerHTML = API.standings.map(g => {
    const started = g.rows.some(r => r.pj > 0) // antes del 1er partido no marcamos clasificados
    return `
    <div class="grp">
      <div class="grp-h">${g.group}</div>
      <table><thead><tr><th></th><th class="tl">Equipo</th><th>PJ</th><th>DG</th><th>Pts</th></tr></thead>
      <tbody>${g.rows.map(r => `
        <tr class="${started && r.pos <= 2 ? 'q' : ''}">
          <td class="pos">${r.pos}</td><td class="tl">${teamCell(r.team)}</td>
          <td>${r.pj}</td><td>${r.gd > 0 ? '+' + r.gd : r.gd}</td><td class="pts">${r.pts}</td>
        </tr>`).join('')}</tbody></table>
    </div>`
  }).join('')
}

/* ---------------- avisos de gol (toast); no molestan en pantalla completa ---------------- */
const toastWrap = document.getElementById('toasts')
let goalsSeeded = false
function notifyGoals(prev) {
  if (!goalsSeeded) { goalsSeeded = true; return } // no avisar los goles ya existentes al abrir
  if (document.fullscreenElement) return            // en pantalla completa, sin toasts
  for (const m of M) {
    const st = matchState(m); if (!st.live) continue
    const k = pk(m.a, m.b)
    const before = (prev[k]?.events || []).length
    const now = goalIdx[k]?.events || []
    for (let i = before; i < now.length; i++) {
      const e = now[i]
      const team = e.side === 'h' ? `${m.fa} ${m.a}` : `${m.fb} ${m.b}`
      toast(`⚽ ¡Gol! ${team}`, `${e.name} ${e.min} · ${m.fa}${m.a} ${st.hs}–${st.as} ${m.b}${m.fb}`, m)
    }
  }
}
function toast(title, sub, match) {
  const el = document.createElement('button')
  el.className = 'toast'
  el.innerHTML = `<span class="t-title">${title}</span><span class="t-sub">${sub}</span><span class="t-go">Ver ▶</span>`
  el.onclick = () => { el.remove(); if (match) openTheater(match.ch.filter(c => CH_ORDER.includes(c))[0], match) }
  toastWrap.appendChild(el)
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 400) }, 8000)
}

/* ---------------- hero: próximo/actual de la albirroja ---------------- */
const cdD = document.getElementById('cdD'), cdH = document.getElementById('cdH')
const cdM = document.getElementById('cdM'), cdS = document.getElementById('cdS')
function heroTick() {
  const now = nowPY()
  const hero = document.getElementById('hero')
  const live = M.find(m => m.py && matchState(m).live)
  const next = M.find(m => m.py && mKey(m) > now.key)
  const m = live || next
  if (!m) { hero.hidden = true; return }
  hero.hidden = false
  hero.classList.toggle('is-live', !!live)
  document.getElementById('heroLabel').textContent = live ? 'La Albirroja en cancha' : 'Próximo partido de la Albirroja'
  document.getElementById('heroMatch').innerHTML = `${m.fa} ${m.a} <span class="vs">vs</span> ${m.fb} ${m.b}`
  document.getElementById('heroWhen').textContent = `${dayLabel(m.d).charAt(0) + dayLabel(m.d).slice(1).toLowerCase()} · ${m.t} hora paraguaya`
  document.getElementById('heroChs').innerHTML = chLinks(m) + (live ? '' : prodeChip(m))
  if (!live) {
    const target = new Date(`${m.d}T${m.t}:00`), nowLocalAsPY = new Date(`${now.key}:00`)
    let s = Math.max(0, Math.floor((target - nowLocalAsPY) / 1000))
    const dd = Math.floor(s / 86400); s -= dd * 86400
    const hh = Math.floor(s / 3600); s -= hh * 3600
    const mm = Math.floor(s / 60); s -= mm * 60
    cdD.textContent = dd; cdH.textContent = hh
    cdM.textContent = String(mm).padStart(2, '0'); cdS.textContent = String(s).padStart(2, '0')
  }
}

rebuildTeamMaps()
render(activeFilter)
if (location.hash === '#tabla') setView('tabla')
else if (location.hash === '#prode') setView('prode')
const hashM = location.hash.match(/^#m-(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})-(\w+)/)
const hashCh = location.hash.match(/^#ch-(\w+)/)
if (hashM && byMk[hashM[1]]) openTheater(hashM[2], byMk[hashM[1]], false)
else if (hashCh && EMBEDS[hashCh[1]]) openTheater(hashCh[1], null, false)
heroTick(); nowTick(); pollTick()
syncProde(true) // si ya jugás con nombre, tus pronos entran al ranking al abrir
setInterval(heroTick, 1000)
setInterval(nowTick, 15000)
setInterval(() => render(activeFilter), 60000)
