# Roadmap

Estado de las funciones y lo que viene. Las ideas nuevas salen de lo que la API
pública de la FIFA expone para este Mundial (verificado, no teórico).

## Hecho

- **Agenda completa** de la fase de grupos en hora de Paraguay, editable en
  `matches.json` sin rebuild.
- **Reproductor en la misma página, por partido**: al abrir un partido se ven
  solo los canales que lo transmiten (GEN, Trece, Unicanal, Popu TV, VS Sports).
- **Videos por partido**: GEN (playlist de su portada) y VS Sports (canal de
  YouTube) publican un video por partido; el server los detecta y los enchufa.
- **Modo cine**: al mirar, se oculta todo lo demás; portales recortados al player.
- **Marcadores y minuto en vivo** (API FIFA), con resultado FINAL.
- **Goleadores** debajo de cada partido (minuto + jugador).
- **Tabla de grupos** (12 grupos), en pestaña propia, con clasificados marcados.
- **Avisos de gol** (toast con "Ver ▶"), silenciados en pantalla completa.
- **Saltar al partido**: barra "en vivo ahora / próximo".
- **Deep-links**: `#tabla`, `#m-<fecha>-<canal>`, `#ch-<canal>`.

## Próximo (alto valor)

- **Octavos y llaves**: agregar partidos a `matches.json` (`f: 4+`); marcadores,
  goleadores y tabla se enganchan solos por nombre de equipo. Falta un chip de
  filtro "Octavos" y dibujar el bracket.
- **Panel de partido**: tocar un partido → alineaciones con formación (la API da
  posición y coordenadas X/Y de cada jugador en cancha), cambios, tarjetas,
  estadio y asistencia.
- **Goleadores del torneo**: ranking acumulado (derivable de los goles por partido).

## Más adelante

- **Relato en vivo**: timeline jugada por jugada (la API lo trae en español).
- **Mapa de cancha**: dibujar la formación real con las coordenadas de cada jugador.
- **PWA instalable** + notificaciones push de gol (más allá del toast en pantalla).
- **i18n**: hoy es solo español; la API también responde en otros idiomas.

## Datos disponibles en la API FIFA pero todavía sin usar

Verificado para `idCompetition=17`, `idSeason=285023`:
formación (ej. 4-1-2-3), alineaciones (26 jugadores con dorsal, posición,
capitán, coordenadas X/Y), cambios con minuto, tarjetas, árbitros, estadio,
asistencia, penales en definición, agregado en eliminatorias. Campos de clima
existen pero suelen venir vacíos.

> La API de FIFA no es oficial/documentada: puede cambiar sin aviso. Todo lo que
> depende de ella degrada con gracia (si falla, la agenda y el reproductor siguen).
