// Canales que transmiten el Mundial 2026 en Paraguay, con su señal en vivo oficial.
export const CHANNELS = {
  gen:  { name: 'GEN',      kind: 'TV abierta + web',    url: 'https://www.gen.com.py/',              color: '#e8e8e8' },
  trece:{ name: 'Trece',    kind: 'TV abierta + web',    url: 'https://trece.com.py/en-vivo/',        color: '#7b2ff7' },
  uni:  { name: 'Unicanal', kind: 'TV abierta + web',    url: 'https://unicanal.com.py/en-vivo/',     color: '#2f80ed' },
  popu: { name: 'Popu TV',  kind: 'En vivo por YouTube', url: 'https://www.youtube.com/@somospopupy/live', color: '#ff4d4d' },
  vs:   { name: 'VS Sports', kind: 'Web + YouTube',      url: 'https://www.vssports.com.py/',         color: '#c92a2a' },
}

/* La agenda vive en matches.json (raíz del proyecto) para poder actualizarla sin
   tocar código — octavos, cambios de grilla, etc. Cada partido:
   { d: 'YYYY-MM-DD' (fecha PY), t: 'HH:MM' (hora PY), a/b: equipos,
     fa/fb: banderas emoji, ch: canales que lo dan, f: fecha del torneo, py: 1 si juega Paraguay }
   Este import es la copia compilada; si el server está corriendo, /api/data
   manda la versión fresca del archivo y la página se actualiza sola. */
import matches from '../matches.json'
export const M = matches
