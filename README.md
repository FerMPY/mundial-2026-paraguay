# Mundial 2026 en Paraguay

Agenda del Mundial con los canales paraguayos y reproductor en la misma página.

## Correr

Doble clic en **`Ver Mundial.command`**, o:

```sh
npm install   # solo la primera vez
npm run build
npm start     # → http://localhost:8642
```

## Actualizar la agenda (octavos, cambios de grilla, etc.)

Editá **`matches.json`** — nada más. Si el server está corriendo, la página se
actualiza sola en ~30 segundos (no hace falta rebuild ni reiniciar).

Cada partido:

```json
{
 "d": "2026-06-29",        // fecha (hora de Paraguay)
 "t": "18:00",             // hora PY
 "a": "Paraguay",  "fa": "🇵🇾",   // equipo A + bandera
 "b": "Brasil",    "fb": "🇧🇷",   // equipo B + bandera
 "ch": ["gen", "trece"],   // canales: gen | trece | uni | popu | vs
 "f": 4,                   // fecha/ronda (1-3 = grupos; usá 4+ para octavos etc.)
 "py": 1                   // solo si juega la Albirroja (omitir si no)
}
```

Los filtros "Fecha 1/2/3" están en `index.html` (chips con `data-f`); para
octavos agregar un chip `data-f="f4"` y su caso en `render()` de `src/main.js`.

## De dónde sale cada cosa

- **Marcadores y minuto**: API pública de FIFA (`server.mjs`, cada 30 s).
- **Videos por partido**: GEN los publica en la playlist de su portada; VS Sports
  en su canal de YouTube (pestaña /streams). El server los scrapea y la página
  los enchufa al partido que corresponde por nombres de equipos.
- **Señales en vivo**: GEN y Unicanal van recortados (crop ajustable ▲▼);
  Trece embebe directo; Popu por YouTube.

## Deploy

Cualquier host Node (Railway, Render…): `npm run build && npm start`, puerto en `$PORT`.
