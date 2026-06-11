import './style.css'
import { CHANNELS, M } from './data.js'

/* ---------------- cómo se reproduce cada canal dentro de la página ----------------
   - iframe  → la página en-vivo del canal se incrusta directo (GEN y Trece lo permiten)
   - twitch  → simulcast oficial en Twitch (Telefuturo bloquea incrustar su propio player)
   - yt      → transmisión en vivo del canal de YouTube (solo se ve cuando están al aire ahí)
   - external→ no se puede incrustar (app con DRM): botón para abrir afuera */
const httpHost = (location.protocol === 'http:' || location.protocol === 'https:') ? location.hostname : null
const EMBEDS = {
  gen: { type: 'iframe', src: 'https://www.gen.com.py/',
    note: 'GEN transmite cada partido como video de YouTube en su portada. Si aparecen botones de partidos acá abajo, tocá el tuyo y se ve directo.' },
  trece: { type: 'iframe', src: 'https://trece.com.py/en-vivo/',
    note: 'Reproductor oficial de Trece. Si no arranca solo, tocá ▶ dentro del recuadro.' },
  tf: { type: 'twitch', channel: 'telefuturoparaguay',
    note: 'Telefuturo no permite incrustar su player web; esta es su señal oficial en Twitch.' },
  popu: { type: 'yt', channel: 'UCYxENSyddnf_A9dWrYXZN6A',
    note: 'Señal de Popu TV en YouTube — se ve acá cuando están transmitiendo en vivo.' },
  vs: { type: 'yt', channel: 'UCj0RBdETcbD-mChW-ylt-sw',
    note: 'Señal de VS Sports en YouTube — se ve acá cuando están transmitiendo en vivo.' },
  tigo: { type: 'external',
    note: 'Tigo Sports usa su app con DRM y no se puede incrustar.' },
}

/* ---------------- hora paraguaya, sin offset hardcodeado ---------------- */
const pyFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Asuncion', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
})
function nowPY() {
  const p = Object.fromEntries(pyFmt.formatToParts(new Date()).map(x => [x.type, x.value]))
  return { key: `${p.year}-${p.month}-${p.day}T${p.hour === '24' ? '00' : p.hour}:${p.minute}`, date: `${p.year}-${p.month}-${p.day}` }
}
const mKey = m => `${m.d}T${m.t}`
function addMin(d, t, mins) { // "YYYY-MM-DDTHH:MM" + minutos (con cambio de día)
  const [Y, Mo, D] = d.split('-').map(Number), [H, Mi] = t.split(':').map(Number)
  return new Date(Date.UTC(Y, Mo - 1, D, H, Mi + mins)).toISOString().slice(0, 16)
}
const LIVE_MIN = 125 // partido + entretiempo + descuento

const DOW = ['DOMINGO', 'LUNES', 'MARTES', 'MIÉRCOLES', 'JUEVES', 'VIERNES', 'SÁBADO']
const MES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
function dayLabel(d) {
  const [Y, Mo, D] = d.split('-').map(Number)
  return `${DOW[new Date(Date.UTC(Y, Mo - 1, D)).getUTCDay()]} ${D} de ${MES[Mo - 1]}`
}

/* ---------------- teatro ---------------- */
const theater = document.getElementById('theater')
const thTabs = document.getElementById('thTabs')
const thScreen = document.getElementById('thScreen')
const thSrcs = document.getElementById('thSrcs')
let thCurrent = null

for (const k of ['gen', 'trece', 'tf', 'popu', 'vs', 'tigo']) {
  thTabs.insertAdjacentHTML('beforeend',
    `<button class="th-tab" data-ch="${k}" style="--tc:${CHANNELS[k].color}">${CHANNELS[k].name}</button>`)
}
thTabs.insertAdjacentHTML('beforeend', `<button class="th-close" id="thClose" title="Cerrar reproductor">✕</button>`)

function externalCard(c, extra) {
  return `<div class="th-msg"><span class="big">${c.name}</span><span>${extra}</span>
          <a class="btn" href="${c.url}" target="_blank" rel="noopener">Abrir ${c.name} ↗</a></div>`
}

function liveNowMatch() {
  const now = nowPY().key
  return M.find(m => mKey(m) <= now && now < addMin(m.d, m.t, LIVE_MIN))
}
function enterCinema(k) {
  document.body.classList.add('watching')
  const lm = liveNowMatch()
  const wn = document.getElementById('watchNow')
  wn.innerHTML = lm
    ? `<span class="lv"><span class="live-dot"></span>En vivo</span> ${lm.fa} ${lm.a} <span style="color:var(--ink-faint)">vs</span> ${lm.fb} ${lm.b} <span style="color:var(--ink-faint);font-size:.7em">· ${CHANNELS[k].name}</span>`
    : `Mirando <span style="color:var(--ink-faint)">·</span> ${CHANNELS[k].name}`
}
function exitCinema() {
  document.body.classList.remove('watching')
  theater.classList.remove('open')
  thScreen.innerHTML = ''; thSrcs.hidden = true; thCurrent = null
  history.replaceState(null, '', location.pathname)
}
document.getElementById('watchBack').addEventListener('click', exitCinema)
document.addEventListener('keydown', e => { if (e.key === 'Escape' && document.body.classList.contains('watching')) exitCinema() })

function openTheater(k, scroll = true) {
  const c = CHANNELS[k], e = EMBEDS[k]
  thCurrent = k
  theater.classList.add('open')
  enterCinema(k)
  thTabs.querySelectorAll('.th-tab').forEach(t => t.classList.toggle('on', t.dataset.ch === k))
  document.getElementById('thNote').textContent = e.note
  const ext = document.getElementById('thExt'); ext.href = c.url; ext.textContent = `Abrir en el sitio de ${c.name} ↗`
  thScreen.classList.remove('gencrop'); thScreen.style.removeProperty('--gs')
  if (k === 'gen') {
    genHomeFrame()
    updateGenSrcs(k)
    if (scroll) window.scrollTo({ top: 0, behavior: 'smooth' })
    return
  }
  let inner
  if (e.type === 'iframe') {
    inner = `<iframe src="${e.src}" allow="autoplay; fullscreen; encrypted-media; picture-in-picture" allowfullscreen referrerpolicy="no-referrer-when-downgrade" loading="eager"></iframe>`
  } else if (e.type === 'yt') {
    inner = `<iframe src="https://www.youtube.com/embed/live_stream?channel=${e.channel}&autoplay=1" allow="autoplay; fullscreen; encrypted-media; picture-in-picture" allowfullscreen></iframe>`
  } else if (e.type === 'twitch') {
    inner = httpHost
      ? `<iframe src="https://player.twitch.tv/?channel=${e.channel}&parent=${httpHost}&muted=false" allow="autoplay; fullscreen" allowfullscreen></iframe>`
      : externalCard(c, 'El player de Twitch necesita que la página se sirva por http. Mientras tanto:')
  } else {
    inner = externalCard(c, e.note)
  }
  thScreen.innerHTML = inner
  updateGenSrcs(k)
  if (scroll) window.scrollTo({ top: 0, behavior: 'smooth' })
}
thTabs.addEventListener('click', e => {
  if (e.target.closest('#thClose')) { exitCinema(); return }
  const t = e.target.closest('.th-tab'); if (t) openTheater(t.dataset.ch, false)
})

/* GEN ya no usa /live: cada partido es un video de YouTube en la playlist de su
   portada. server.mjs la expone en /api/gen → un botón por partido. La portada
   completa se muestra recortada a la banda del reproductor; como el alto del
   header de GEN varía según el navegador, el recorte se ajusta con ▲▼. */
const GEN_Y_KEY = 'genCropY'
function genCropY() { return Number(localStorage.getItem(GEN_Y_KEY) ?? -55) }
function genHomeFrame() {
  thScreen.classList.add('gencrop')
  thScreen.style.setProperty('--gy', genCropY())
  thScreen.innerHTML = `<iframe src="${EMBEDS.gen.src}" allow="autoplay; fullscreen; encrypted-media; picture-in-picture" allowfullscreen></iframe>`
  fitGenCrop()
}
function fitGenCrop() {
  if (!thScreen.classList.contains('gencrop')) return
  thScreen.style.setProperty('--gs', (thScreen.clientWidth / 1100).toFixed(4))
}
window.addEventListener('resize', fitGenCrop)

let genItems = null, genAt = 0
async function updateGenSrcs(k) {
  if (k !== 'gen' || !httpHost) { thSrcs.hidden = true; return }
  try {
    if (!genItems || performance.now() - genAt > 300000) {
      const r = await fetch('/api/gen')
      genItems = (await r.json()).items || []
      genAt = performance.now()
    }
  } catch { thSrcs.hidden = true; return }
  if (thCurrent !== 'gen') return
  const withSrc = genItems.filter(it => it.sources && it.sources.length)
  thSrcs.innerHTML = `<span class="lbl">Partidos GEN</span>
    <button class="th-src on" data-src="">Portada GEN</button>` +
    withSrc.map(it => `<button class="th-src" data-src="${it.sources[0].url}">${it.title}</button>`).join('') +
    `<span class="th-nudge"><span>Ajustar recorte</span>
      <button data-nudge="-25" title="Subir el recorte">▲</button>
      <button data-nudge="25" title="Bajar el recorte">▼</button></span>`
  thSrcs.hidden = false
  // si un partido con video está en curso (hora PY), reproducirlo directo
  const now = nowPY().key
  const live = withSrc.find(it => {
    if (!it.date) return false
    const [d, t] = it.date.split(' ')
    return addMin(d, t.slice(0, 5), -15) <= now && now < addMin(d, t.slice(0, 5), LIVE_MIN)
  })
  if (live) playGenSrc(live.sources[0].url)
}
function playGenSrc(url) {
  thSrcs.querySelectorAll('.th-src').forEach(b => b.classList.toggle('on', b.dataset.src === (url || '')))
  if (!url) { genHomeFrame(); return }
  thScreen.classList.remove('gencrop'); thScreen.style.removeProperty('--gs')
  const sep = url.includes('?') ? '&' : '?'
  thScreen.innerHTML = `<iframe src="${url}${sep}autoplay=1" allow="autoplay; fullscreen; encrypted-media; picture-in-picture" allowfullscreen></iframe>`
}
thSrcs.addEventListener('click', e => {
  const n = e.target.closest('[data-nudge]')
  if (n) {
    localStorage.setItem(GEN_Y_KEY, genCropY() + Number(n.dataset.nudge))
    thScreen.style.setProperty('--gy', genCropY())
    return
  }
  const b = e.target.closest('.th-src')
  if (b) playGenSrc(b.dataset.src)
})

/* ---------------- canales (tarjetas) ---------------- */
const strip = document.getElementById('strip')
for (const k of ['gen', 'trece', 'tf', 'popu', 'vs', 'tigo']) {
  const c = CHANNELS[k]
  strip.insertAdjacentHTML('beforeend',
    `<a class="ch-card" style="--ch-color:${c.color}" href="${c.url}" data-ch="${k}" target="_blank" rel="noopener">
      <div class="ch-name">${c.name}</div>
      <div class="ch-kind">${c.kind}</div>
      <span class="ch-go">Ver en vivo</span>
    </a>`)
}
strip.addEventListener('click', e => {
  const card = e.target.closest('.ch-card'); if (!card) return
  e.preventDefault(); openTheater(card.dataset.ch)
})

/* ---------------- agenda ---------------- */
const sched = document.getElementById('sched')
function chLinks(m) {
  return m.ch.map(k => {
    const c = CHANNELS[k]
    return `<button class="ch-link" style="--ch-color:${c.color}" data-ch="${k}" title="Ver ${c.name} acá mismo"><i></i>${c.name}<span class="play">▶</span></button>`
  }).join('')
}
document.addEventListener('click', e => {
  const b = e.target.closest('button.ch-link')
  if (b) openTheater(b.dataset.ch)
})

function render(filter) {
  const now = nowPY()
  sched.innerHTML = ''
  let shown = 0, curDay = null, dayBox = null
  for (const m of M) {
    const isToday = m.d === now.date
    const isLive = mKey(m) <= now.key && now.key < addMin(m.d, m.t, LIVE_MIN)
    const isPast = addMin(m.d, m.t, LIVE_MIN) <= now.key
    if (filter === 'today' && !isToday) continue
    if (filter === 'py' && !m.py) continue
    if (filter === 'f1' && m.f !== 1) continue
    if (filter === 'f2' && m.f !== 2) continue
    if (filter === 'f3' && m.f !== 3) continue
    if (m.d !== curDay) {
      curDay = m.d
      sched.insertAdjacentHTML('beforeend',
        `<section class="day"><div class="day-h"><span class="d">${dayLabel(m.d)}</span>${isToday ? '<span class="today-tag">Hoy</span>' : ''}</div><div class="day-list"></div></section>`)
      dayBox = sched.lastElementChild.querySelector('.day-list')
    }
    dayBox.insertAdjacentHTML('beforeend',
      `<article class="match${m.py ? ' py' : ''}${isPast ? ' past' : ''}">
        <div class="m-time"><span class="m-hh">${m.t}</span><span class="m-tz">PY</span></div>
        <div class="m-body">
          <div class="m-top">
            <span class="m-teams"><span class="m-flag">${m.fa}</span>${m.a} <span style="color:var(--ink-faint)">vs</span> <span class="m-flag">${m.fb}</span>${m.b}</span>
            ${isLive ? '<span class="live-badge"><span class="live-dot"></span>En vivo</span>' : ''}
          </div>
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

/* ---------------- hero: próximo/actual de la albirroja ---------------- */
function heroTick() {
  const now = nowPY()
  const hero = document.getElementById('hero')
  const live = M.find(m => m.py && mKey(m) <= now.key && now.key < addMin(m.d, m.t, LIVE_MIN))
  const next = M.find(m => m.py && mKey(m) > now.key)
  const m = live || next
  if (!m) { hero.hidden = true; return }
  hero.hidden = false
  hero.classList.toggle('is-live', !!live)
  document.getElementById('heroLabel').textContent = live ? 'La Albirroja en cancha' : 'Próximo partido de la Albirroja'
  document.getElementById('heroMatch').innerHTML = `${m.fa} ${m.a} <span style="color:var(--ink-faint)">vs</span> ${m.fb} ${m.b}`
  document.getElementById('heroWhen').textContent = `${dayLabel(m.d).charAt(0) + dayLabel(m.d).slice(1).toLowerCase()} · ${m.t} hora paraguaya`
  document.getElementById('heroChs').innerHTML = chLinks(m)
  if (!live) {
    const target = new Date(`${m.d}T${m.t}:00`)
    const nowLocalAsPY = new Date(`${now.key}:00`)
    let s = Math.max(0, Math.floor((target - nowLocalAsPY) / 1000))
    const dd = Math.floor(s / 86400); s -= dd * 86400
    const hh = Math.floor(s / 3600); s -= hh * 3600
    const mm = Math.floor(s / 60); s -= mm * 60
    cdD.textContent = dd; cdH.textContent = hh
    cdM.textContent = String(mm).padStart(2, '0'); cdS.textContent = String(s).padStart(2, '0')
  }
}

render(activeFilter)
const hashCh = location.hash.match(/^#ch-(\w+)/)
if (hashCh && EMBEDS[hashCh[1]]) openTheater(hashCh[1], false)
heroTick()
setInterval(heroTick, 1000)
setInterval(() => render(activeFilter), 60000) // refresca badges de "en vivo"
