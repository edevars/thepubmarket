# Catálogo multi-juego

Cómo el market resuelve los datos canónicos de una carta cuando hay más de un
TCG. Epic `riftbound` (**TASK-029** a **TASK-035**), que llevó la plataforma de
"MTG vía Scryfall" a "un catálogo por juego detrás de una misma interfaz".

No toca ningún flujo de fondos: es resolución de datos de carta y snapshots en
D1. Nada de pagos, payouts ni Stripe.

---

## 1. La idea en una frase

**No mantenemos catálogo propio.** Cada juego tiene un proveedor externo que
sabe de sus cartas; al publicar un single guardamos un *snapshot* de esos datos
en la fila de `inventory`, y el catálogo público se renderiza desde el snapshot
sin volver a llamar a nadie.

Las impresiones son inmutables, así que el snapshot no se degrada.

---

## 2. Proveedores

| Juego | Proveedor | Base | Auth |
|---|---|---|---|
| `mtg` | Scryfall | `https://api.scryfall.com` | no |
| `riftbound` | RiftCodex | `https://api.riftcodex.com` | no |

Los demás valores de `Tcg` (`pokemon`, `yugioh`, `onepiece`, `lorcana`) existen
en el type system y en la UI, pero **no tienen catálogo integrado**: publicar en
ellos responde `400 tcg_not_supported`.

### Registro

`apps/api/src/lib/catalog-providers.ts` es la única lista de juegos publicables:

```ts
const PROVIDERS: Partial<Record<Tcg, CatalogProvider>> = {
  mtg: scryfall,
  riftbound: riftcodex,
}
```

Un `CatalogProvider` expone exactamente dos cosas:

- `getCardById(catalogId, kv)` — resuelve una impresión. Lanza `CatalogError`.
- `searchCards(query, kv)` — busca por nombre. Sin coincidencias = lista vacía.

De ese registro salen, sin duplicar la lista en ningún lado:

- el alta de inventario (`lib/inventory.ts`),
- la búsqueda del panel y del admin (`/seller|admin/catalog/search?game=`),
- el selector de juego del panel, vía `SellerPanelMe.catalogGames` en
  `GET /seller/me`.

### Piezas compartidas

`apps/api/src/lib/catalog.ts` guarda lo que todos los proveedores comparten:
`CatalogError`, los TTL de cache (30 días para cartas, 10 minutos para
búsquedas) y el timeout por request (8 s). Vive aparte del registro porque los
clientes concretos lo importan: juntarlos haría un ciclo de imports.

---

## 3. Contrato del snapshot

`CardSnapshot` (`packages/shared/src/index.ts`) es game-agnostic:

```ts
interface CardSnapshot {
  tcg: Tcg
  catalogId: string          // id de la impresión en SU catálogo
  oracleId: string | null    // exclusivo de Scryfall (la carta lógica de MTG)
  name, setCode, setName, collectorNumber, lang, rarity, artist
  finishes: string[]         // vacío = el catálogo no informa acabados
  imageUrl: string | null
  gameAttributes: CardGameAttributes | null
}
```

Dos decisiones que conviene no re-litigar:

- **`catalogId`, no `scryfallId`.** Un solo campo de identidad, con significado
  por juego. Las columnas `scryfall_id` / `oracle_id` siguen existiendo en D1 y
  se escriben solo para MTG; las filas anteriores a `catalog_id` se leen con
  fallback (`catalogId ?? scryfallId`), sin backfill.
- **`finishes` vacío significa "no sé", no "ninguno".** El alta solo valida el
  acabado contra la lista cuando el proveedor la informa. Scryfall la informa;
  RiftCodex no, así que en Riftbound el vendedor elige libremente.

### Atributos propios del juego

`gameAttributes` es una **unión discriminada por `tcg`**. Hoy solo Riftbound
aporta datos (`type`, `supertype`, `domains[]`, `energy`, `might`, `power`);
Scryfall devuelve `null`.

Se persisten como blob JSON en la columna aditiva `inventory.card_attributes`
(migración `0012`). Se descartaron a propósito:

- **una columna por atributo y por juego** — la mega-tabla de nulos contra la
  que advierte `.claude/agents/d1-schema-guardian.md`, que se ensancharía con
  cada TCG;
- **una tabla hija 1:1** — un join en cada render para datos que se escriben
  una vez y nunca se consultan por esos campos.

Son datos de **presentación**: nada filtra ni ordena por ellos. Si algún día
hace falta filtrar por uno, se promueve ese campo a columna real.

La lectura es defensiva: un blob corrupto, `null`, un string suelto o un objeto
sin el discriminante `tcg` degradan a "sin atributos" en vez de tumbar el render
de una publicación válida.

---

## 4. Filtro por juego en la tienda

`GET /catalog?tcg=` filtra en SQL. Antes el filtrado era en cliente sobre las
primeras 200 filas, lo que escondía juegos con poco inventario.

`GET /catalog/games` devuelve el conteo por juego sobre **todo** el inventario
disponible. Existe por una razón concreta: con el filtro en el servidor, la
barra lateral solo vería el juego activo y el comprador no podría cambiarse de
juego. Va registrada **antes** de `/catalog/:id`, o Hono resolvería `games` como
el id de un item.

Asimetría deliberada en la validación: la API rechaza un `tcg` desconocido con
`400 invalid_tcg` (un filtro mal escrito no debe parecer "este juego no tiene
cartas"), mientras que la web ignora un `?game=` desconocido y cae al catálogo
completo (un enlace viejo no debe romperse).

---

## 5. Rarezas de RiftCodex

Es un proyecto **fan no oficial**, sin relación con Riot, y su API está marcada
como work in progress. Dos comportamientos observados en vivo explican
decisiones del cliente (`apps/api/src/lib/riftcodex.ts`):

1. **`/cards/search?query=` devuelve 0 resultados para cualquier término.** El
   índice full-text no funciona. La búsqueda usa `/cards/name?fuzzy=`, que sí
   responde y trae todas las impresiones.
2. **Un id inexistente responde 500, no 404.** El proveedor no sabe decir "no
   existe", así que un `catalogId` inválido sale como `catalog_error` / 502.
   Solo Scryfall puede señalar not-found.

Además: las variantes (Signature, Alternate Art, Overnumbered) son **entradas de
catálogo distintas**, ya diferenciadas en el nombre. No son acabados, así que el
CHECK de `finish` en D1 (`nonfoil` | `foil`) se quedó intacto.

Si el full-text de RiftCodex empieza a funcionar, conviene reconsiderar el
endpoint de búsqueda.

---

## 6. Agregar el siguiente TCG

1. **Escribir el cliente** en `apps/api/src/lib/<proveedor>.ts` con la forma de
   `CatalogProvider`: `normalizeCard` → `CardSnapshot` (con `tcg`, `catalogId`,
   `oracleId: null`), `getCardById` y `searchCards`, ambos cacheados en KV con
   los TTL de `lib/catalog.ts` y usando `CatalogError` para cualquier falla.
2. **Registrarlo** en `catalog-providers.ts`. Eso solo enciende: el alta, la
   búsqueda del panel y del admin, y el selector de juego del panel.
3. **Si el juego aporta atributos propios**, agregar su variante a
   `CardGameAttributes` en `packages/shared` y llenarla en `normalizeCard`. El
   detalle los muestra solo si vienen (`components/detail/game-attributes.ts`).
   No hace falta tocar D1: el blob ya existe.
4. **Verificar que el código del juego esté en `Tcg`/`TCGS`** y que tenga
   entrada en `TCG_META` (`apps/web/src/lib/catalog/display.ts`) para su nombre
   visible. Los seis TCG del proyecto ya están.
5. **Sembrar inventario** agregando entradas con `"game": "<código>"` en
   `scripts/inventory-seed.json` y corriendo `pnpm inventory:load:local`.

No hay que tocar: el filtro de la tienda, las facetas, la ficha de detalle, el
pipeline de fotos ni la columna `inventory.tcg` (acepta cualquier valor; la
validación es a nivel app porque D1 no reconstruye tablas).

---

## 7. Verificado end-to-end (TASK-035)

Contra el stack local, con RiftCodex real:

- el seed carga MTG y Riftbound en la misma corrida (`4 creados, 0 fallidos`);
- `GET /catalog?tcg=riftbound` devuelve solo Riftbound y `/catalog/games`
  reporta ambos juegos;
- el detalle trae los `gameAttributes` (tipo, dominios, costes) y la ficha los
  renderiza como filas extra, omitiendo las ausentes;
- `POST /checkout` sobre un single Riftbound crea una sesión de Stripe en modo
  test (`cs_test_…`).

**La plataforma sigue fuera del flujo de fondos:** este epic no tocó el modelo
de direct charges + application fee. Ver [`pagos.md`](./pagos.md).
