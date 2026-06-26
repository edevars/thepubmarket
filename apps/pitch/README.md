# @thepubmarket/pitch — Pitch deck

Pitch deck web de The Pub Market. **Uso interno e ilustrativo** — para presentar a socios. Los números son **supuestos ilustrativos**, no proyecciones validadas (ver [`../../docs/negocio/`](../../docs/negocio/)).

Es un **Worker de Cloudflare de solo-assets**: sirve un sitio estático (`public/`) sin código de servidor. HTML/CSS/JS vanilla, cero dependencias de runtime, cero build del contenido. Estética y tokens alineados con `apps/web` (`src/app/globals.css`).

## Estructura

```
apps/pitch/
├─ public/
│  ├─ index.html   # el deck (scroll narrativo, 14 secciones)
│  ├─ styles.css   # estética Mística TCG premium
│  └─ deck.js      # reveal, count-up, navegación, teclado
├─ wrangler.jsonc  # Worker assets-only (directory: ./public)
└─ package.json
```

## Desarrollo

```bash
pnpm --filter @thepubmarket/pitch dev
```

Levanta `wrangler dev` sirviendo `public/`. Abre la URL que imprime (por defecto <http://localhost:8787>).

> Para editar el deck solo necesitas tocar los archivos de `public/`; no hay paso de build del contenido. `wrangler dev` recarga al guardar.

## Deploy

```bash
pnpm --filter @thepubmarket/pitch deploy   # wrangler deploy
```

O vía **Workers Builds** conectando el repo con root directory `apps/pitch` y deploy command `pnpm exec wrangler deploy` (genera previews por rama, igual que el resto del monorepo — ver [`../../README.md`](../../README.md)).

## Contenido

El arco narrativo destila [`../../docs/negocio/`](../../docs/negocio/): problema → hueco → solución → ventaja → modelo → números → foso → competencia → GTM → roadmap → tesis honesta → ask → visión. Para cambiar el mensaje, edita `public/index.html`; para el look, `public/styles.css`.
