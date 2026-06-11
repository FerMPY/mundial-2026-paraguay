#!/bin/zsh
# Compila (si hace falta) y sirve la app en http://localhost:8642
cd "$(dirname "$0")"
command -v npm >/dev/null 2>&1 || { echo "Necesitás Node.js instalado (nodejs.org)"; read -r; exit 1; }
[ -d node_modules ] || npm install
npm run build
( sleep 1 && open "http://localhost:8642" ) &
node server.mjs
