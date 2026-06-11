# Mundial 2026 en Paraguay 🇵🇾

Todos los partidos del Mundial 2026 con **los canales que los transmiten en
Paraguay** (GEN, Trece, Unicanal, Popu TV, VS Sports) y un **reproductor en la
misma página**: elegís el partido, tocás el canal, mirás. Sin saltar de sitio.

Marcadores, minuto, goleadores y tabla de grupos en vivo (API pública de la
FIFA). Hora de Paraguay. Hecho para hinchas, no para vender cable.

## Funciona así

- **Agenda por fecha** con resultado y minuto en vivo, y filtros (en vivo, hoy,
  Albirroja, fechas).
- **Visor por partido**: solo los canales que dan ese partido. GEN y VS abren el
  video del partido en YouTube cuando existe; el resto, su señal en vivo.
- **Tabla de grupos** que se actualiza con cada partido.
- **Avisos de gol** (no molestan en pantalla completa).

Más detalle y lo que viene: ver [ROADMAP.md](ROADMAP.md).

## Correr local

Requiere [Node.js](https://nodejs.org) 18+.

```sh
npm install
npm run build
npm start          # → http://localhost:8642
```

En Mac también podés hacer doble clic en **`Ver Mundial.command`**.

> Para desarrollo con recarga en caliente del front: `npm run dev` (Vite) en una
> terminal y `npm start` en otra; Vite proxea `/api` al server.

## Actualizar la agenda

Editá **`matches.json`** y listo — la página se actualiza sola en ~30 s, sin
rebuild. Formato de cada partido y cómo agregar octavos: documentado en el mismo
README más abajo y en [ROADMAP.md](ROADMAP.md).

```json
{
 "d": "2026-06-29", "t": "18:00",
 "a": "Paraguay", "fa": "🇵🇾", "b": "Brasil", "fb": "🇧🇷",
 "ch": ["gen", "trece"],
 "f": 4,
 "py": 1
}
```

`ch`: `gen` · `trece` · `uni` · `popu` · `vs`. `py: 1` solo si juega Paraguay.

## Arquitectura

- **Front** (`src/`, Vite): agenda, visor, tabla, avisos. Estático tras `build`.
- **Server** (`server.mjs`, Node sin dependencias): sirve `dist/` y expone
  `/api/data`, que fusiona tres fuentes y cachea:
  - **FIFA** (`api.fifa.com`) → marcadores, minuto, goleadores, tabla.
  - **GEN** → playlist de videos por partido (scrapeada de su portada).
  - **VS Sports** → un stream de YouTube por partido (scrapeado de su canal).

El server es necesario porque el navegador no puede llamar a esas fuentes
directo (CORS). Todo degrada con gracia: si una fuente falla, el resto sigue.

## Deploy

Necesita un host que corra Node (por el server). **Railway** anda con sólo
conectar el repo: detecta Node, corre `npm run build` y `node server.mjs`, y
toma el puerto de `$PORT` (ya configurado en `railway.json`).

```sh
# o por CLI:
railway up
```

Render, Fly.io o cualquier host Node funcionan igual con `npm run build && npm start`.

> GitHub Pages **no** sirve: es estático y no puede correr el server, así que
> perdería marcadores, tabla, goleadores y los videos por partido.

## Contribuir

Issues y PRs bienvenidos. Ideas con más impacto en [ROADMAP.md](ROADMAP.md).
La agenda vive en `matches.json` — corregir un canal o un horario es editar JSON.

## Créditos y licencia

- Grilla original: infografías de [@puntaje_ideal](https://www.instagram.com/puntaje_ideal/)
  y [@futbolenlatv](https://www.instagram.com/futbolenlatv/).
- Datos en vivo: API pública de la FIFA (no oficial; puede cambiar sin aviso).
- Esta página solo enlaza a las transmisiones oficiales de cada canal.

[MIT](LICENSE) · © 2026 Fernando Mendoza
