import './style.css'
import { CHANNELS, M } from './data.js'

/* ---------------- cómo se reproduce cada canal ----------------
   - iframe  → el player del canal se incrusta directo (Trece)
   - crop    → portal del canal recortado a la banda del player (GEN, Unicanal)
   - yt      → señal en vivo del canal de YouTube (Popu, VS, si no hay video del partido)
   Además, GEN y VS publican un VIDEO POR PARTIDO en YouTube: cuando existe (vía
   /api/data) ese video reemplaza a la señal genérica del canal. */
const httpHost = (location.protocol === 'http:' || location.protocol === 'https:') ? location.hostname : null
const EMBEDS = {
  gen:   { type: 'crop',   src: 'https://www.gen.com.py/',          note: 'GEN — señal en directo de su portada (recortada). Si hay video del partido, se muestra ese.' },
  trece: { type: 'iframe', src: 'https://trece.com.py/en-vivo/',    note: 'Reproductor oficial de Trece. Tocá ▶ dentro del recuadro si no arranca solo.' },
  uni:   { type: 'crop',   src: 'https://unicanal.com.py/en-vivo/', note: 'Señal en vivo oficial de Unicanal. Tocá ▶ dentro del recuadro para arrancar.' },
  popu:  { type: 'yt', channel: 'UCYxENSyddnf_A9dWrYXZN6A',         note: 'Señal de Popu TV en YouTube — se ve acá cuando están transmitiendo en vivo.' },
  vs:    { type: 'yt', channel: 'UCj0RBdETcbD-mChW-ylt-sw',         note: 'VS Sports — su video del partido en YouTube. Si todavía no arrancó, mostrará la cuenta regresiva.' },
}
const CH_ORDER = ['gen', 'trece', 'uni', 'popu', 'vs'] // sin Tigo (app con DRM, no incrustable)

/* recortes de portales: banda vertical del player, en coords de página a 1100px */
const CROPS = {
  gen: { y: -55, ca: '1100/400', key: 'genCropY' },
  uni: { y: -250, ca: '1100/520', key: 'uniCropY' },
}

/* ---------------- datos en vivo (videos + marcadores + tabla + goleadores) ---------------- */
const API = { videos: { gen: [], vs: [] }, scores: [], standings: [], goals: [] }
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
  for (const s of API.scores || []) if (s.teams) scoreIdx[pk(...s.teams)] = s
  goalIdx = {}
  for (const g of API.goals || []) if (g.teams) goalIdx[pk(...g.teams)] = g
}
// nombre lindo (de la grilla) + bandera por equipo, sacados de M
const flagByCanon = {}, nameByCanon = {}
function rebuildTeamMaps() {
  for (const m of M) { flagByCanon[canon(m.a)] = m.fa; flagByCanon[canon(m.b)] = m.fb; nameByCanon[canon(m.a)] = m.a; nameByCanon[canon(m.b)] = m.b }
}
const goalsFor = m => goalIdx[pk(m.a, m.b)]?.events || []
async function fetchData() {
  if (!httpHost) return
  try {
    const d = await (await fetch('/api/data')).json()
    if (d.videos) API.videos = d.videos
    if (d.scores) API.scores = d.scores
    if (d.standings) API.standings = d.standings
    if (Array.isArray(d.matches) && d.matches.length && JSON.stringify(d.matches) !== JSON.stringify(M)) {
      M.length = 0; M.push(...d.matches) // matches.json editado → agenda fresca sin rebuild
      rebuildByMk(); rebuildTeamMaps()
    }
    const prevGoals = goalIdx
    if (d.goals) API.goals = d.goals
    rebuildIdx()
    notifyGoals(prevGoals)
    render(activeFilter); nowTick(); renderStandings()
    if (document.body.classList.contains('watching') && thMatch) { // refrescar marcador en la barra
      const wn = document.getElementById('watchNow'); const st = matchState(thMatch)
      wn.innerHTML = `${scoreChip(st)} ${teamsHTML(thMatch)} <span class="on-ch">· ${CHANNELS[thCh].name}</span>`
    }
  } catch { /* sin server o sin red → la agenda sigue andando sin marcadores */ }
}
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
const MES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
function dayLabel(d) {
  const [Y, Mo, D] = d.split('-').map(Number)
  return `${DOW[new Date(Date.UTC(Y, Mo - 1, D)).getUTCDay()]} ${D} de ${MES[Mo - 1]}`
}
const teamsHTML = m => `<span class="m-flag">${m.fa}</span>${m.a} <span class="vs">vs</span> <span class="m-flag">${m.fb}</span>${m.b}`
const apnl = (firstName) => firstName // apellido tal cual viene de FIFA
function scorersHTML(m) {
  const ev = goalsFor(m); if (!ev.length) return ''
  const one = e => `${e.name}${e.pen ? ' (P)' : ''}${e.og ? ' (ec)' : ''} ${e.min}`
  const h = ev.filter(e => e.side === 'h').map(one).join(', ')
  const a = ev.filter(e => e.side === 'a').map(one).join(', ')
  return `<div class="m-scorers"><span class="ball">⚽</span>${[h, a].filter(Boolean).join(' · ')}</div>`
}

/* ---------------- teatro ---------------- */
const theater = document.getElementById('theater')
const thTabs = document.getElementById('thTabs')
const thScreen = document.getElementById('thScreen')
const thSrcs = document.getElementById('thSrcs')
let thCh = null, thMatch = null

function externalCard(c, extra) {
  return `<div class="th-msg"><span class="big">${c.name}</span><span>${extra}</span>
          <a class="btn" href="${c.url}" target="_blank" rel="noopener">Abrir ${c.name} ↗</a></div>`
}
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
    wn.innerHTML = `Mirando <span class="vs">·</span> ${CHANNELS[ch].name}`
  }
}
function exitCinema() {
  document.body.classList.remove('watching')
  theater.classList.remove('open')
  thScreen.innerHTML = ''; thSrcs.hidden = true; thCh = thMatch = null
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
const nudgeHtml = () => `<span class="th-nudge"><span>Ajustar recorte</span><button data-nudge="-25" title="Subir">▲</button><button data-nudge="25" title="Bajar">▼</button></span>`

// dibuja la fuente del canal ch para el partido match (o señal genérica si no hay match)
function renderSource(ch, match) {
  thScreen.classList.remove('crop'); thScreen.style.removeProperty('--gs')
  thSrcs.hidden = true
  // video del partido (GEN / VS) cuando existe
  if (match && (ch === 'gen' || ch === 'vs')) {
    const u = videoUrl(match, ch)
    if (u) { thScreen.innerHTML = ytFrame(u); return }
  }
  const e = EMBEDS[ch]
  if (e.type === 'crop') { cropFrame(ch, e.src); thSrcs.innerHTML = nudgeHtml(); thSrcs.hidden = false; return }
  if (e.type === 'iframe') { thScreen.innerHTML = `<iframe src="${e.src}" allow="autoplay; fullscreen; encrypted-media; picture-in-picture" allowfullscreen referrerpolicy="no-referrer-when-downgrade"></iframe>`; return }
  if (e.type === 'yt') { thScreen.innerHTML = ytFrame(`https://www.youtube.com/embed/live_stream?channel=${e.channel}`); return }
  thScreen.innerHTML = externalCard(CHANNELS[ch], e.note)
}

function openTheater(ch, match = null, scroll = true) {
  thCh = ch; thMatch = match
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
      <div class="ch-name">${c.name}</div><div class="ch-kind">${c.kind}</div><span class="ch-go">Ver en vivo</span></a>`
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
const byMk = {}
function rebuildByMk() { for (const k in byMk) delete byMk[k]; for (const m of M) byMk[mKey(m)] = m }
rebuildByMk()
document.addEventListener('click', e => {
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
          <div class="m-chs">${chLinks(m)}</div>
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

/* ---------------- barra "ahora / próximo" (saltar al partido) ---------------- */
const nowStrip = document.getElementById('nowStrip')
function nowTick() {
  const now = nowPY()
  const live = M.filter(m => matchState(m).live)
  let html = ''
  if (live.length) {
    html = `<span class="ns-label live">🔴 En vivo ahora</span>` + live.map(m => {
      const st = matchState(m)
      return `<button class="ns-card" data-ver data-ch="${m.ch.filter(c => CH_ORDER.includes(c))[0]}" data-mk="${mKey(m)}">
        <span class="ns-teams">${m.fa} ${m.a} <b>${st.hs != null ? `${st.hs}–${st.as}` : 'vs'}</b> ${m.fb} ${m.b}</span>
        <span class="ns-go">${st.min || ''} Ver ▶</span></button>`
    }).join('')
  } else {
    const next = M.find(m => mKey(m) > now.key)
    if (next) {
      const t = new Date(`${next.d}T${next.t}:00`), n = new Date(`${now.key}:00`)
      let s = Math.max(0, Math.floor((t - n) / 1000)); const h = Math.floor(s / 3600); const mi = Math.floor((s % 3600) / 60)
      const inTxt = h > 0 ? `en ${h}h ${mi}m` : `en ${mi} min`
      html = `<span class="ns-label">Próximo partido</span>
        <button class="ns-card" data-ver data-ch="${next.ch.filter(c => CH_ORDER.includes(c))[0]}" data-mk="${mKey(next)}">
          <span class="ns-teams">${next.fa} ${next.a} <b>vs</b> ${next.fb} ${next.b}</span>
          <span class="ns-go">${next.t} · ${inTxt} ▶</span></button>`
    }
  }
  nowStrip.innerHTML = html
  nowStrip.style.display = html ? 'flex' : 'none'
}

/* ---------------- conmutador de vista (agenda / tabla) ---------------- */
const viewAgenda = document.getElementById('viewAgenda')
const viewTable = document.getElementById('viewTable')
function setView(v) {
  const tabla = v === 'tabla'
  document.querySelectorAll('.vt').forEach(x => x.classList.toggle('on', x.dataset.v === v))
  viewTable.hidden = !tabla; viewAgenda.hidden = tabla
  if (tabla) { renderStandings(); history.replaceState(null, '', '#tabla') }
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
  document.getElementById('heroChs').innerHTML = chLinks(m)
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
const hashM = location.hash.match(/^#m-(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})-(\w+)/)
const hashCh = location.hash.match(/^#ch-(\w+)/)
if (hashM && byMk[hashM[1]]) openTheater(hashM[2], byMk[hashM[1]], false)
else if (hashCh && EMBEDS[hashCh[1]]) openTheater(hashCh[1], null, false)
heroTick(); nowTick(); fetchData()
setInterval(heroTick, 1000)
setInterval(nowTick, 15000)
setInterval(() => render(activeFilter), 60000)
setInterval(fetchData, 30000) // marcadores + videos al día
