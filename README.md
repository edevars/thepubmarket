# The Pub Market

Marketplace curado de Trading Card Games enfocado en México, vinculado a **The Pub Game Store** (CDMX). Stack **Cloudflare-first**, mantenible por una sola persona.

> **Restricción crítica — no custodia de fondos.** La plataforma **nunca** toca, retiene ni redirige dinero. Los pagos (fases posteriores) serán **Stripe Connect con destination/direct charges + application fee**: el dinero va directo comprador → seller y la plataforma solo cobra su comisión. El esquema de datos ya está diseñado para esto (ver `apps/api/migrations/0001_init.sql`). No es asesoría legal formal.

Esta es la **Fase 0 (Fundaciones)**: infraestructura, esquema base y CI/CD funcionando de extremo a extremo. **Sin** catálogo, pagos, sellers UI, ni IA todavía.

---

## Arquitectura

| Pieza | Tecnología | Carpeta |
|---|---|---|
| API / backend | Cloudflare Workers + Hono | `apps/api` |
| Frontend | Next.js (App Router) → Cloudflare Workers vía OpenNext | `apps/web` |
| Tipos compartidos | Paquete TS | `packages/shared` |
| Base transaccional | Cloudflare D1 (binding `DB`) | — |
| Sesiones / cache / flags | Cloudflare KV (binding `SESSIONS`) | — |
| Imágenes / assets | Cloudflare R2 (binding `ASSETS`) | — |

**Monorepo:** pnpm workspaces + Turborepo. **Lint/format:** Biome. **TS estricto** compartido (`tsconfig.base.json`).

> **Nota sobre el frontend:** el `CLAUDE.md` menciona "Cloudflare Pages". En 2026 Cloudflare recomienda **OpenNext sobre Workers** (`@opennextjs/cloudflare`) y dejó `next-on-pages` en mantenimiento. Por eso `apps/web` despliega como **Worker** (sigue 100% dentro de Cloudflare, con SSR completo y previews por rama).

```
thepubmarket/
├─ apps/
│  ├─ api/        # Worker + Hono, /health, migraciones D1
│  └─ web/        # Next.js + next-intl (ES/EN) → OpenNext/Workers
├─ packages/
│  └─ shared/     # tipos compartidos (HealthResponse)
├─ biome.json · turbo.json · tsconfig.base.json · pnpm-workspace.yaml
└─ .github/workflows/   # ci.yml (checks) · deploy.yml (deploy opcional)
```

---

## Requisitos

- Node.js ≥ 22 y **pnpm 10** (`corepack enable` o `npm i -g pnpm`).
- Cuenta de Cloudflare. Login una vez: `pnpm exec wrangler login`.

## Instalación

```bash
pnpm install
```

---

## 1. Crear los recursos de Cloudflare

Estos comandos requieren **tus credenciales** (haz `wrangler login` antes). Ejecuta cada uno y **copia el ID que devuelven** a `apps/api/wrangler.jsonc`.

```bash
# D1 — base transaccional principal
pnpm exec wrangler d1 create thepubmarket-db
#   → copia "database_id" a apps/api/wrangler.jsonc → d1_databases[0].database_id

# KV — sesiones / cache / feature flags
pnpm exec wrangler kv namespace create SESSIONS
#   → copia "id" a apps/api/wrangler.jsonc → kv_namespaces[0].id

# R2 — imágenes y assets
pnpm exec wrangler r2 bucket create thepubmarket-assets
#   (no genera ID; se referencia por bucket_name, ya configurado)
```

Dónde pegar los IDs — `apps/api/wrangler.jsonc`:

```jsonc
"d1_databases": [{ "binding": "DB", "database_name": "thepubmarket-db",
                   "database_id": "PEGA_AQUÍ_EL_DATABASE_ID", "migrations_dir": "migrations" }],
"kv_namespaces": [{ "binding": "SESSIONS", "id": "PEGA_AQUÍ_EL_KV_ID" }],
"r2_buckets":    [{ "binding": "ASSETS", "bucket_name": "thepubmarket-assets" }]
```

Tras editar `wrangler.jsonc`, regenera los tipos:

```bash
pnpm --filter @thepubmarket/api cf-typegen
```

## 2. Aplicar el esquema (migraciones D1)

El esquema se gestiona **solo** con migraciones versionadas (nunca a mano). La migración inicial vive en `apps/api/migrations/0001_init.sql`.

```bash
# Local (base D1 en .wrangler, para desarrollo)
pnpm --filter @thepubmarket/api db:migrate:local

# Remoto (la base D1 real en Cloudflare)
pnpm --filter @thepubmarket/api db:migrate:remote
```

Crear una nueva migración en el futuro:

```bash
pnpm --filter @thepubmarket/api db:migrate:create nombre_descriptivo
```

---

## 3. Desarrollo local

En dos terminales:

```bash
# Terminal 1 — API (http://localhost:8787)
pnpm --filter @thepubmarket/api dev

# Terminal 2 — Web (http://localhost:3000)
pnpm --filter @thepubmarket/web dev
```

Para que la web local apunte al Worker local, crea `apps/web/.env` a partir de `apps/web/.env.example`:

```
NEXT_PUBLIC_API_URL=http://localhost:8787
```

Abre <http://localhost:3000>: debe mostrar el health del Worker en **verde** (servicio + D1) consumiendo `/health`. Verificación directa del endpoint:

```bash
curl http://localhost:8787/health
# {"status":"ok","db":"ok","timestamp":...}
```

---

## 4. Deploy y previews por rama

### Ruta recomendada — Workers Builds (Cloudflare nativo)

Lo más simple y de menor mantenimiento para una persona. En el dashboard de Cloudflare, conecta el repo Git a **dos** Workers (uno por app):

1. **Workers & Pages → Create → Workers → Connect to Git.**
2. Crea un proyecto para la **API**:
   - Root directory: `apps/api`
   - Deploy command: `pnpm exec wrangler deploy`
3. Crea otro para la **Web**:
   - Root directory: `apps/web`
   - Build command: `pnpm exec opennextjs-cloudflare build`
   - Deploy command: `pnpm exec opennextjs-cloudflare deploy`
   - Build env var: `NEXT_PUBLIC_API_URL` = URL pública del Worker de API.

Workers Builds despliega **producción** al hacer push a `main` y genera **URLs de preview por rama / PR** automáticamente, sin guardar secrets en GitHub.

### Alternativa — GitHub Actions

`.github/workflows/deploy.yml` deja listo el deploy de ambas apps. Por defecto es **manual** (`workflow_dispatch`) para no chocar con Workers Builds. Si prefieres deploy desde GitHub, descomenta el trigger `push: branches: [main]` en ese archivo y **no** uses Workers Builds para los mismos Workers.

---

## Variables y secrets

| Nombre | Dónde se configura | Para qué |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | **Build time**: `apps/web/.env` (local) · env var del build en Workers Builds/CI | URL del Worker de API que consume el cliente. Se inlina en el bundle al build; **no** es un `var` de runtime. |
| `CLOUDFLARE_API_TOKEN` | GitHub → Settings → Secrets and variables → Actions | Deploy vía GitHub Actions (`deploy.yml`). No hace falta con Workers Builds. |
| `CLOUDFLARE_ACCOUNT_ID` | GitHub → Secrets (Actions) | Idem. |

El **CI** (`.github/workflows/ci.yml`) corre en cada push/PR: install → Biome → typecheck → build. No necesita secrets.

---

## Scripts útiles (raíz)

```bash
pnpm lint          # Biome check
pnpm lint:fix      # Biome con autofix
pnpm typecheck     # tsc --noEmit en todos los paquetes
pnpm build         # build de todas las apps (turbo)
pnpm dev           # dev de todas las apps (turbo)
```

---

## Fuera de alcance (fases posteriores)

Catálogo / Scryfall, pagos / Stripe Connect, Durable Objects (reserva de inventario), Cloudflare Access, Turnstile, Workers AI, Vectorize, búsqueda externa.
