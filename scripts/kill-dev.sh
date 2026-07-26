#!/usr/bin/env bash
#
# kill-dev.sh — Mata TODO el entorno de desarrollo local de The Pub Market.
#
# Contraparte de scripts/dev.sh. Libera los puertos que usan los servicios
# locales y, como respaldo, termina cualquier proceso de wrangler/next/turbo
# que haya quedado huérfano dentro de este repo.
#
# Uso:
#   ./scripts/kill-dev.sh

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [ -t 1 ]; then
  BOLD=$'\033[1m'; GREEN=$'\033[32m'; YELLOW=$'\033[33m'; RESET=$'\033[0m'
else
  BOLD=""; GREEN=""; YELLOW=""; RESET=""
fi
ok()   { printf '%b  ✓ %s%b\n' "$GREEN" "$1" "$RESET"; }
warn() { printf '%b  ! %s%b\n' "$YELLOW" "$1" "$RESET"; }

echo "${BOLD}▸ Deteniendo entorno de desarrollo local${RESET}"

# Puertos de los servicios locales:
#   3000  next dev (apps/web)
#   8787  wrangler dev (apps/api)
#   8788  wrangler dev (apps/pitch)
#   9229  inspector de apps/api
#   9230  inspector de apps/pitch
PORTS=(3000 8787 8788 9229 9230)

KILLED=0
for port in "${PORTS[@]}"; do
  pids="$(lsof -ti tcp:"$port" 2>/dev/null || true)"
  if [ -n "$pids" ]; then
    echo "$pids" | xargs kill -9 2>/dev/null || true
    ok "Puerto $port liberado (pid: $(echo "$pids" | tr '\n' ' '))"
    KILLED=1
  fi
done

# Respaldo: procesos de wrangler/next/turbo lanzados desde este repo que no
# quedaron atados a ninguno de los puertos de arriba (p. ej. si cambiaron de
# puerto o el listener aún no había abierto el socket).
for pattern in "wrangler dev" "next dev" "turbo run dev" "workerd"; do
  pids="$(pgrep -f "$REPO_ROOT.*$pattern" 2>/dev/null || true)"
  if [ -n "$pids" ]; then
    echo "$pids" | xargs kill -9 2>/dev/null || true
    ok "Proceso residual terminado: $pattern (pid: $(echo "$pids" | tr '\n' ' '))"
    KILLED=1
  fi
done

if [ "$KILLED" -eq 0 ]; then
  warn "No se encontró ningún proceso de dev corriendo"
else
  ok "Entorno de desarrollo detenido"
fi
