#!/usr/bin/env bash
#
# dev.sh — Levanta TODO el entorno de desarrollo local de The Pub Market.
#
# Punto de entrada único. Cada vez que se agrega un servicio nuevo, basta con
# volver a correr este script: NO hay que editarlo, porque descubre el trabajo
# automáticamente a partir de los workspaces de pnpm.
#
#   - Dependencias:  `pnpm install` (recoge deps de cualquier app nueva).
#   - Variables:     copia `.env.example` -> `.env` en cada app que lo tenga.
#   - Migraciones:   corre `db:migrate:local` en TODA app que lo defina
#                    (`pnpm -r --if-present`).
#   - Servicios:     `pnpm dev` (turbo) levanta el script `dev` de cada workspace.
#
# Para que un servicio nuevo quede cubierto, solo debe declarar en su package.json
# los scripts estándar: `dev` (obligatorio) y, si usa D1, `db:migrate:local`.
#
# Uso:
#   ./scripts/dev.sh                 # entorno completo
#   ./scripts/dev.sh --no-install    # omite pnpm install
#   ./scripts/dev.sh --no-migrate    # omite migraciones de D1
#   ./scripts/dev.sh --help

set -euo pipefail

# --- Ubicarse en la raíz del repo (este script vive en scripts/) ---
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# --- Salida con color (se desactiva si no es una terminal) ---
if [ -t 1 ]; then
  BOLD=$'\033[1m'; BLUE=$'\033[34m'; GREEN=$'\033[32m'; YELLOW=$'\033[33m'; RED=$'\033[31m'; RESET=$'\033[0m'
else
  BOLD=""; BLUE=""; GREEN=""; YELLOW=""; RED=""; RESET=""
fi
step() { printf '%s\n' "${BOLD}${BLUE}▸ %s${RESET}" >/dev/null; printf '%b▸ %s%b\n' "$BOLD$BLUE" "$1" "$RESET"; }
ok()   { printf '%b  ✓ %s%b\n' "$GREEN" "$1" "$RESET"; }
warn() { printf '%b  ! %s%b\n' "$YELLOW" "$1" "$RESET"; }
die()  { printf '%b✗ %s%b\n' "$RED" "$1" "$RESET" >&2; exit 1; }

# --- Flags ---
DO_INSTALL=1
DO_MIGRATE=1
for arg in "$@"; do
  case "$arg" in
    --no-install) DO_INSTALL=0 ;;
    --no-migrate) DO_MIGRATE=0 ;;
    -h|--help)
      sed -n '2,30p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
      exit 0 ;;
    *) die "Argumento desconocido: $arg (usa --help)" ;;
  esac
done

# --- 1. Prerrequisitos ---
step "Verificando prerrequisitos"
command -v pnpm >/dev/null 2>&1 || die "pnpm no está instalado. Instálalo: https://pnpm.io/installation"
command -v node >/dev/null 2>&1 || die "node no está instalado (se requiere Node >= 22)."
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[ "$NODE_MAJOR" -ge 22 ] || die "Node $(node -v) detectado; se requiere >= 22."
ok "pnpm $(pnpm --version) · node $(node -v)"

# --- 2. Dependencias ---
if [ "$DO_INSTALL" -eq 1 ]; then
  step "Instalando dependencias (pnpm install)"
  pnpm install
  ok "Dependencias al día"
else
  warn "pnpm install omitido (--no-install)"
fi

# --- 3. Variables de entorno: .env.example -> .env por app ---
step "Preparando archivos .env"
ENV_CREATED=0
while IFS= read -r example; do
  target="${example%.example}"
  if [ ! -f "$target" ]; then
    cp "$example" "$target"
    ok "Creado ${target#"$REPO_ROOT"/} (desde .env.example)"
    ENV_CREATED=1
  fi
done < <(find apps packages -maxdepth 2 -name ".env.example" -not -path "*/node_modules/*" 2>/dev/null)
[ "$ENV_CREATED" -eq 0 ] && ok "Todos los .env ya existen"

# --- 4. Migraciones + seed locales de D1 (toda app que defina los scripts) ---
if [ "$DO_MIGRATE" -eq 1 ]; then
  step "Aplicando migraciones D1 locales (Drizzle)"
  # --if-present: no falla si algún workspace no tiene el script.
  # Las migraciones las genera drizzle-kit (db:generate) y las aplica wrangler.
  pnpm -r --if-present db:migrate:local
  ok "Migraciones locales aplicadas"

  step "Sembrando datos base (seed)"
  pnpm -r --if-present db:seed:local
  ok "Seed aplicado"
else
  warn "Migraciones y seed omitidos (--no-migrate)"
fi

# --- 5. Levantar todos los servicios ---
step "Levantando servicios (pnpm dev)"
printf '%b  API   → http://localhost:8787%b\n' "$BLUE" "$RESET"
printf '%b  Web   → http://localhost:3000%b\n' "$BLUE" "$RESET"
printf '%b  (Ctrl+C para detener todo)%b\n\n' "$BLUE" "$RESET"
exec pnpm dev
