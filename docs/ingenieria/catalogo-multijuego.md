# Catálogo multi-juego

Cómo el market resuelve los datos canónicos de una carta cuando hay más de un
TCG. Epic `riftbound` (**TASK-029** a **TASK-037**), que llevó la plataforma de
"MTG vía Scryfall" a "un catálogo por juego detrás de una misma interfaz", más
lo que agregó `riftbound-ux` (**TASK-038** en adelante) sobre esa base.

No toca ningún flujo de fondos: es resolución de datos de carta y snapshots en
D1. Nada de pagos, payouts ni Stripe.

---

## 1. La idea en una frase

**Cada juego resuelve sus cartas donde le conviene, y el market solo guarda un
snapshot.** Al publicar un single copiamos los datos canónicos de la impresión
en la fila de `inventory`, y el catálogo público se renderiza desde ese snapshot
sin volver a consultar a nadie.

De dónde salen esos datos canónicos depende del juego:

- **MTG** — proveedor HTTP externo (Scryfall). No mantenemos copia.
- **Riftbound** — catálogo **local en D1** (`catalog_cards`), importado una vez
  y actualizado a mano (ver §3 y §4).

Las impresiones son inmutables, así que el snapshot no se degrada.

---

## 2. Proveedores

| Juego | Proveedor | Origen | Auth |
|---|---|---|---|
| `mtg` | Scryfall (HTTP, cache en KV) | `https://api.scryfall.com` | no |
| `riftbound` | Catálogo local en D1 (`catalog_cards`) | tabla propia, importada de `api.dotgg.gg` | — |

Los demás valores de `Tcg` (`pokemon`, `yugioh`, `onepiece`, `lorcana`) existen
en el type system y en la UI, pero **no tienen catálogo integrado**: publicar en
ellos responde `400 tcg_not_supported`.

### Registro

`apps/api/src/lib/catalog-providers.ts` es la única lista de juegos publicables:

```ts
const PROVIDERS: Partial<Record<Tcg, CatalogProvider>> = {
  mtg: scryfall,
  riftbound: localCatalogProvider('riftbound'),
}
```

Un `CatalogProvider` expone exactamente dos cosas, ambas recibiendo un
`CatalogContext`:

- `getCardById(catalogId, ctx)` — resuelve una impresión. Lanza `CatalogError`.
- `searchCards(query, ctx)` — busca por nombre. Sin coincidencias = lista vacía.

`CatalogContext` es `{ db, kv, origin }` y cada proveedor toma lo que necesita:
Scryfall solo usa `kv` (cache); el proveedor local lee de `db` y arma URLs
absolutas de imagen con `origin`. La firma es un objeto justamente para no
volver a tocar todos los call sites cada vez que un proveedor necesite algo
distinto.

De ese registro salen, sin duplicar la lista en ningún lado:

- el alta de inventario (`lib/inventory.ts`),
- la búsqueda del panel y del admin (`/seller|admin/catalog/search?game=`),
- el selector de juego del panel, vía `SellerPanelMe.catalogGames` en
  `GET /seller/me`.

### Piezas compartidas

`apps/api/src/lib/catalog.ts` guarda lo que todos los proveedores comparten:
`CatalogError`, los TTL de cache (30 días para cartas, 10 minutos para
búsquedas) y el timeout por request (8 s). Vive aparte del registro porque los
clientes concretos lo importan: juntarlos haría un ciclo de imports. Los TTL y
el timeout solo aplican a proveedores HTTP; el local no cachea ni tiene timeout.

---

## 3. El catálogo local en D1 (Riftbound)

`apps/api/src/lib/catalog-db.ts` implementa `localCatalogProvider(tcg)`: la
misma interfaz de arriba, resuelta contra la tabla `catalog_cards`.

- `getCardById` — lookup por la PK `(tcg, catalog_id)`. Si no está, es un
  **404 honesto** (`CatalogError`), no una falla de upstream.
- `searchCards` — `name LIKE '%…%'` sobre el índice `NOCASE`, con `%` y `_` del
  usuario escapados (`ESCAPE '\'`), ordenado por nombre, `LIMIT 60`.
- **Sin cache en KV**: una consulta a D1 sale más barata que el round-trip a KV
  que amortizaba a los proveedores HTTP.

### La tabla `catalog_cards`

Migración `0013`, definida en `packages/db/src/schema.ts`. Es game-agnostic: la
PK compuesta es `(tcg, catalog_id)`, con índices `NOCASE` sobre `name` y sobre
`set_code`.

Columnas por grupo:

- **Identidad e impresión** — `tcg`, `catalog_id` (`"UNL-131"` en Riftbound),
  `oracle_id` (concepto de MTG, null aquí), `name`, `set_code`, `set_name`,
  `collector_number`, `lang`, `rarity` (en minúsculas, convención Scryfall),
  `artist`.
- **Metadatos de impresión** — `finishes` (JSON: los acabados que esa impresión
  realmente ofrece), `rules_text` y `flavor_text` ya limpios de HTML, y
  `game_attributes` (JSON, shape `RiftboundAttributes`).
- **Precios de referencia** — `price_data` (snapshot de TCGplayer USD /
  Cardmarket EUR tal cual lo reporta la fuente) y `price_fetched_at`. Es
  **referencia, nunca precio de venta**: los sellers fijan sus precios en MXN.
- **Imágenes** — `source_image_url` / `source_image_back_url` (procedencia y
  fallback) e `image_r2_key` / `image_back_r2_key`. Un `image_r2_key` en NULL
  significa "todavía no espejada"; el importer re-intenta exactamente esas
  filas.

### Imágenes en R2

Las imágenes se espejan a nuestro bucket bajo `card-images/<tcg>/<id>.webp` y se
sirven en `GET /card-images/:tcg/:file` (`apps/api/src/routes/card-images.ts`),
público y sin lookup en D1: la llave es determinista (la construye siempre
`buildCardImageKey`) y el regex de los params solo acepta alfanuméricos y
guiones, así que la ruta no puede salirse del prefijo. Las llaves son inmutables
→ `Cache-Control: immutable` más un write explícito a la Cache API de Workers.
Los 404 nunca se cachean, para que la ruta se cure sola en cuanto el importer
suba el objeto.

Por eso `CardSnapshot.imageUrl` apunta a `${origin}/${image_r2_key}` cuando la
imagen ya está espejada, y cae a `source_image_url` mientras tanto.

### Nota histórica: RiftCodex

Hasta TASK-037 el catálogo de Riftbound se resolvía contra **RiftCodex**, un API
fan no oficial. **Ya no se usa; `lib/riftcodex.ts` fue eliminado** (queda en el
historial de git). Se fue por dos razones que conviene recordar antes de volver
a apoyarse en un API fan: su búsqueda full-text devolvía 0 resultados para
cualquier término, y un id inexistente respondía 500 en vez de 404, así que el
proveedor no sabía decir "no existe". El catálogo local arregla ambas.

---

## 4. Importar y actualizar el catálogo

`scripts/import-riftbound.mjs` (Node ESM, sin dependencias) es el importer.
Lee el dataset completo de la red dotgg —
`GET https://api.dotgg.gg/cgfw/getcards?game=riftbound&mode=indexed`, el backend
JSON detrás de riftbound.gg, ~1,400 cartas en una sola respuesta columnar — lo
mapea al payload de ingesta y lo manda en batches a
`POST /admin/catalog/cards`. El Worker hace el upsert en `catalog_cards` y
espeja cada imagen desde `static.dotgg.gg` a R2.

```bash
# local (API en :8787, clave de .dev.vars)
node scripts/import-riftbound.mjs --dry-run   # mapea e imprime 3 cartas, no manda nada
node scripts/import-riftbound.mjs

# producción
API_URL=https://<api-prod> ADMIN_KEY=<ADMIN_API_KEY> node scripts/import-riftbound.mjs
```

Variables de entorno:

| Var | Default | Para qué |
|---|---|---|
| `API_URL` | `http://localhost:8787` | A qué API mandar los batches. |
| `ADMIN_KEY` | `dev-admin-key-change-me` | Va en `x-admin-key`; debe coincidir con el secret `ADMIN_API_KEY` del Worker. |
| `BATCH_SIZE` | `10` (tope 25) | Dimensionado por el límite de subrequests del Worker (head+fetch+put por imagen). |

**Es idempotente, y esa es toda la historia de recuperación.** Las filas
convergen por el upsert sobre la PK, las imágenes ya presentes en R2 se detectan
con `head()` y no se re-descargan, y las cartas con `image_r2_key` NULL se
re-intentan. Si la corrida reporta imágenes o batches fallidos, sale con código
1 y basta con volver a correrlo.

Cuándo re-correrlo:

- **set nuevo o errata** — Riftbound saca ~3-4 sets al año, por eso el import es
  manual y no hay cron;
- **refresco de precios de referencia** — `price_data` se reescribe en cada
  corrida y `price_fetched_at` dice qué tan viejo es;
- **imágenes faltantes** — hoy dos tokens de Vendetta (`VEN-T01`, `VEN-T05`) no
  tienen imagen en el CDN de dotgg y se quedan con `image_r2_key` NULL.

Dos defensas del importer que no hay que desactivar: aborta si dotgg renombra o
quita alguno de los campos que lee (el formato columnar no da otra señal de
integridad), y el Worker solo acepta descargar imágenes de un allowlist de hosts
(`static.dotgg.gg`) — sin eso, el endpoint admin sería un proxy SSRF
autenticado.

---

## 5. Contrato del snapshot

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
  rulesText?: string | null  // opcional: Scryfall hoy no los informa
  flavorText?: string | null
}
```

Decisiones que conviene no re-litigar:

- **`catalogId`, no `scryfallId`.** Un solo campo de identidad, con significado
  por juego. Las columnas `scryfall_id` / `oracle_id` siguen existiendo en D1 y
  se escriben solo para MTG; las filas anteriores a `catalog_id` se leen con
  fallback (`catalogId ?? scryfallId`), sin backfill.
- **`finishes` vacío significa "no sé", no "ninguno".** El alta solo valida el
  acabado contra la lista cuando el proveedor la informa. Hoy la informan los
  dos: Scryfall siempre, y el catálogo local de Riftbound desde TASK-037 (sale
  de `hasNormal`/`hasFoil` de dotgg). Consecuencia práctica: publicar `nonfoil`
  sobre una impresión foil-only ahora falla con `finish_not_available` — antes,
  con RiftCodex, el vendedor elegía libremente. Cualquier seed o script que
  asumiera "cualquier acabado sirve en Riftbound" tuvo que corregirse.
- **`rulesText` / `flavorText` son opcionales, no nullable-obligatorios**
  (TASK-038). Un proveedor que no los informa simplemente omite las claves;
  `undefined` y `null` se tratan igual. Tampoco se guardan en el snapshot de
  `inventory`: `GET /catalog/:id` los enriquece con `getCardText(db, tcg,
  catalogId)`, un lookup por PK en paralelo con las demás queries del detalle.
  Si el juego no tiene catálogo local o la impresión ya no está, el detalle
  muestra menos, nunca falla.

### Atributos propios del juego

`gameAttributes` es una **unión discriminada por `tcg`**: `RiftboundAttributes`
(`type`, `supertype`, `domains[]`, `energy`, `might`, `power` — `power` viene en
null desde dotgg, que no expone el costo de runas; `artist` tampoco lo expone) y,
desde TASK-049, `MtgAttributes` (`colors[]`, `types[]`, `typeLine`, `manaValue`),
que `normalizeCard` (`apps/api/src/lib/scryfall.ts`) deriva de la respuesta cruda
de Scryfall en cada alta/búsqueda:

- `colors`: el campo top-level de Scryfall si viene no vacío; si no, la unión de
  `card_faces[].colors`; si sigue vacío (carta colorless), `['C']` — así el
  filtro de color nunca necesita un caso especial de NULL/array vacío.
- `types`: tokens de la línea de tipo de la cara **frontal** (antes del `—`)
  intersectados con `MTG_CARD_TYPES`, así que una carta con dos tipos a la vez
  (`'Artifact Creature'`) produce `['Artifact', 'Creature']`.
- `manaValue`: `cmc` de Scryfall tal cual, o `null` si no lo reporta.

Publicaciones creadas antes de TASK-049 (o snapshots viejos cacheados en KV)
tienen `gameAttributes: null` para MTG — es un estado legítimo, no un bug; el
cache de Scryfall usa el prefijo `scryfall:card:v2:`/`scryfall:search:v2:`
precisamente para que esos snapshots sin atributos expiren solos en vez de
servirse indefinidamente.

Se persisten como blob JSON en la columna aditiva `inventory.card_attributes`
(migración `0012`). Se descartaron a propósito:

- **una columna por atributo y por juego** — la mega-tabla de nulos contra la
  que advierte `.claude/agents/d1-schema-guardian.md`, que se ensancharía con
  cada TCG;
- **una tabla hija 1:1** — un join en cada render para datos que se escriben
  una vez y nunca se consultan por esos campos.

La lectura es defensiva: un blob corrupto, `null`, un string suelto o un objeto
sin el discriminante `tcg` degradan a "sin atributos" en vez de tumbar el render
de una publicación válida.

---

## 6. Filtro por juego en la tienda

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

Encima de eso, `GET /catalog` acepta filtros específicos del juego
(`apps/api/src/lib/catalog-filters.ts`, TASK-039; MTG desde TASK-049), que se
validan contra un vocabulario cerrado por juego: `RIFTBOUND_*` de
`@thepubmarket/shared` para Riftbound (la lista de valores que realmente
aparecen en el catálogo importado) y `MTG_COLORS` / `MTG_CARD_TYPES` /
`MTG_RARITIES` para MTG (enums estables del reglamento, no un muestreo). Salvo
`rarity`, que ya es columna, se resuelven contra el JSON de
`inventory.card_attributes`. `set` es aparte: un param genérico de nivel
superior (`inventory.set_code` exacto) sin vocabulario cerrado, porque los sets
nuevos entran constantemente vía import.

**Registro por juego (`GAME_FILTERS`) y superposición de nombres.** Cada juego
declara su lista de `FilterSpec` bajo su clave en `GAME_FILTERS: Partial<Record<Tcg,
FilterSpec[]>>`. MTG y Riftbound **comparten los nombres** `type` y `rarity`
(cada uno con su propio path/columna y vocabulario) — MTG necesita `type` como
`jsonArray` (una carta puede tener varios tipos, `'Artifact Creature'`), a
diferencia del `type` `jsonScalar` de Riftbound (un tipo por carta).

Para resolver esta superposición, `ALL_GAME_PARAMS` es un
`Map<string, ParamRegistration>` (`{ firstTcg: Tcg; allTcgs: Tcg[] }`), no
`Map<string, Tcg>`. Con un solo `Tcg` por param, el `flatMap` original dejaba
que el último juego en registrar un nombre (`mtg`, declarado después de
`riftbound`) pisara en silencio el `requiresTcg` de Riftbound en el 400
`filter_requires_tcg` — un bug real detectado antes de shippear TASK-049.

Invariante que garantiza el `Map<string, ParamRegistration>`: **un param
válido para el `tcg` activo nunca 400ea solo porque otro juego también lo
registra.** El spec efectivo para resolver un filtro sale siempre de
`GAME_FILTERS[tcg]` (el juego de la request), nunca de qué otro juego
comparte el nombre — `ALL_GAME_PARAMS` solo se consulta para decidir si un
param *ausente* del juego activo está registrado en absoluto (→
`filter_requires_tcg`) o no existe para ningún juego (→ se ignora).

Cuando un param sin `tcg` (o con un `tcg` que no lo registra) dispara
`filter_requires_tcg`, el campo `requiresTcg` de la respuesta usa
`firstTcg` — el primer juego que lo registró, por orden de declaración en
`GAME_FILTERS` (hoy: `riftbound` antes que `mtg`, así que `type`/`rarity` sin
`tcg` reportan `requiresTcg: 'riftbound'`). Es una ambigüedad **documentada,
no resuelta**: no hay forma de inferir cuál de los dos juegos "quiso decir" el
cliente sin `tcg`, y no vale la pena una heurística frágil para adivinarlo.

### Facetas en cliente: conteo con autoexclusión y el límite de `FETCH_LIMIT`

Desde **TASK-053**, `apps/web/src/app/[locale]/catalog/page.tsx` deja de
mandar los params de faceta de juego (`domain`, `color`, `energy`, …) a
`GET /catalog` — solo `tcg` se sigue filtrando en el servidor. El motivo es
el motor de conteo con autoexclusión de `apps/web/src/lib/catalog/facet-counts.ts`:
para mostrar "cuántos items habría SI activaras este valor" en cada valor de
una faceta (incluidos los que el filtro YA activo de esa misma faceta
excluiría), el cliente necesita ver todos los items del juego activo sin
recortar por faceta primero. Si el servidor filtrara por faceta como antes,
los items de los valores no seleccionados nunca llegarían y ese conteo sería
imposible de calcular sin una ida y vuelta a la API por valor.

Consecuencia: el filtrado real por faceta (`matchesGameFilters`) y sus
conteos (`countGameFacetValues`) se calculan en **cliente**, dentro de
`CatalogView`, sobre el mismo array de items que ya trajo el server
component vía `getCatalog({ tcg })`. Los filtros de faceta del lado API
(`catalog-filters.ts`, §6 arriba) no se tocaron y siguen siendo el contrato
real, probados ahí — la tienda web simplemente deja de ejercitarlos desde
`GET /catalog`.

**Caveat de `FETCH_LIMIT`.** `apps/web/src/lib/catalog/data.ts` trae como
máximo `FETCH_LIMIT = 200` items por `tcg` en una sola página (Fase 1: sin
paginación real todavía). Si un juego supera esa cifra, tanto el filtrado de
facetas en cliente como sus conteos por valor quedan truncados a esos
primeros 200 items — no es un bug, es la misma limitación de "una sola
página" que ya aplicaba antes de TASK-053, solo que ahora también afecta a
las facetas de juego y no solo al listado. Se resuelve cuando llegue
paginación real (Fase 5).

**La búsqueda `q` es la excepción, y por una razón (TASK-059).** Va al
SERVIDOR (`GET /catalog?q=`, `LIKE` sobre el título), no a `applyFilters` en
cliente. Aplicarla en cliente sobre la página ya truncada convertía el
buscador en "busca dentro de los primeros 200 items por título": con 502
singles de Riftbound la ventana buscable iba de *Affectionate Poro* a *Jayce -
Man of Progress*, y buscar "Rengar" no devolvía nada aunque hubiera cinco
publicados y activos. Más de la mitad del inventario era imposible de
encontrar por nombre.

La diferencia con las facetas no es arbitraria: una faceta alimenta conteos
por valor, y esos conteos necesitan ver los items de los valores NO
seleccionados para poder decir "cuántos habría si activaras este otro valor".
`q` no alimenta ningún conteo — acota el universo entero — así que filtrarlo
en la base es correcto y además es lo único que alcanza el catálogo completo.
Los conteos de facetas con una búsqueda activa se calculan sobre los
resultados de esa búsqueda, que es lo que el comprador espera.

Consecuencia de diseño: como el set que llega ya viene acotado por `q`, quitar
la búsqueda tiene que NAVEGAR (`CatalogView`, chip `q`), no solo limpiar
estado local. Si solo limpiara el estado, el comprador se quedaría viendo el
set reducido sin ningún filtro visible que lo explicara.

### La consola de filtros y el modelo declarativo (TASK-057)

Hasta TASK-056 los filtros vivían en una columna fija de 232px
(`FilterSidebar.tsx`, 377 líneas) que con Riftbound llegaba a ~1900px de alto.
TASK-057 la sustituyó por una **consola horizontal sticky** bajo el header, y
metió un modelo declarativo en medio para que los componentes dejaran de
decidir nada.

**`apps/web/src/lib/catalog/filter-model.ts`** es el centro. Es un módulo puro
(sin React, sin `next-intl`, sin `window` — por tanto testeable, ya que vitest
excluye los `.tsx`) que recibe los conteos que `CatalogView` ya calculó y
devuelve un `FilterDescriptor[]`: qué filtros existen, con qué control se
pintan (`pips`/`tiles`/`ints`/`select`/`switch`/`range`), en qué zona van y qué
valores están disponibles. Tres consecuencias:

- La regla de deshabilitado (`count === 0 && !selected`, TASK-054 AC#2) existe
  en **un solo sitio**; antes estaba copiada en cinco componentes.
- La consola horizontal (`FilterConsole`) y la pila vertical del sheet mobile
  (`FilterStack`) consumen los MISMOS descriptores y las mismas primitivas de
  `components/catalog/controls/`. No hay una sola rama duplicada entre ambas.
- El reparto entre lo que cabe inline y lo que cae en el popover "Más filtros"
  es **determinista y sin medición en runtime**: `filter-model.ts` estima
  anchos con una tabla de constantes. Ese ancho NO depende de cuántos valores
  lleve seleccionados el usuario, a propósito — si dependiera, marcar un valor
  podría empujar su propio trigger al overflow y cerrarle el popover en la
  cara.

**Zonas de la consola.** `identity` es la faceta firma del juego: la que el
registro de presentación marca con `layout: 'pips'`. Va inline y a todo color,
y es lo único cromático del riel. `card` son el resto de facetas del juego, y
`offer` los filtros que no son de la carta sino de la oferta (condición,
idioma, precio, foil) — estos existen para los seis TCG, así que la consola
nunca se queda vacía aunque el juego no declare facetas propias.

**El juego salió de los filtros.** Ahora es `GameTabs`, una tira de pestañas
con `<Link>` reales (soporta Cmd+clic y clic central). No es un filtro: cambia
la URL, refiltra en el servidor y remonta la vista. Por eso tampoco suma al
conteo de "filtros activos", y "Limpiar filtros" conserva el juego activo — la
pestaña "Todos" es la forma explícita de salir de él.

**Cambio en el `key` de remount.** `catalog/page.tsx` ya no incluye las facetas
de juego serializadas en su `key`. Desde TASK-053 esas facetas no entran al
fetch del servidor, así que remontar por ellas no traía ni un item nuevo y sí
destruía el foco del teclado, el popover abierto y las animaciones en cada
clic. `CatalogView` re-sincroniza `gameFilters` desde las props con un
`useEffect` para cubrir el único caso que quedaba vivo: navegación del
historial (Back/Forward) entre URLs que solo difieren en facetas.

**Restricciones de layout que hay que respetar** si se toca la consola (están
comentadas en `FilterConsole.tsx` y `ui/Popover.tsx`): el wrapper sticky no
puede llevar `overflow` (rompe el sticky y recorta los popovers, y
`overflow-x: auto` recorta también en vertical); ningún trigger de popover
puede vivir dentro del scroller horizontal de mobile; y el riel necesita
`z-10` explícito, porque las tarjetas del grid son `relative` y si no
pintarían por encima de los paneles abiertos.

---

## 7. Distinguir impresiones en el panel

Riftbound repite la misma carta entre sets (OGN/UNL) y tiene impresiones
foil-only, así que el panel del vendedor muestra la metadata estricta que trae
el catálogo local (TASK-043, sobre el contrato de TASK-038): set, número de
coleccionista, rareza y el bloque Riftbound (tipo/supertipo, dominios,
energía/might) en cada resultado de búsqueda.

`finishAvailable(finishes, f)` en `apps/web/src/components/panel/AddCardFlow.tsx`
es un espejo exacto de la regla del servidor (`finishes.length === 0 ||
finishes.includes(f)`): una impresión foil-only no ofrece la opción Normal. Es
una guarda de UI; **la API sigue siendo la autoridad**.

Las variantes (Signature, Alternate Art, Overnumbered) son **entradas de
catálogo distintas**, ya diferenciadas en el nombre y en el `catalogId`. No son
acabados, así que el CHECK de `finish` en D1 (`nonfoil` | `foil`) se quedó
intacto.

---

## 8. Agregar el siguiente TCG

Hay dos caminos según de dónde salgan los datos.

**Si el juego tiene un API externo usable:**

1. **Escribir el cliente** en `apps/api/src/lib/<proveedor>.ts` con la forma de
   `CatalogProvider`: `normalizeCard` → `CardSnapshot` (con `tcg`, `catalogId`,
   `oracleId: null`), `getCardById` y `searchCards`, ambos cacheados en KV con
   los TTL de `lib/catalog.ts` y usando `CatalogError` para cualquier falla.

**Si conviene un catálogo local** (dataset descargable completo, API de búsqueda
poco confiable, o queremos servir las imágenes nosotros):

1. **Escribir el importer** en `scripts/import-<juego>.mjs` a imagen de
   `import-riftbound.mjs`, mapeando al payload de `POST /admin/catalog/cards`, y
   agregar el código del juego al enum `tcg` de `ingestSchema` en
   `routes/admin.ts` (hoy solo `riftbound`, a propósito: un juego sin importer
   no debe aceptar escrituras). Si las imágenes vienen de otro CDN, sumarlo a
   `ALLOWED_IMAGE_SOURCE_HOSTS`. No hace falta tabla nueva: `catalog_cards` es
   game-agnostic.

En ambos casos, después:

2. **Registrarlo** en `catalog-providers.ts` — el cliente propio, o
   `localCatalogProvider('<código>')`. Eso solo enciende: el alta, la búsqueda
   del panel y del admin, y el selector de juego del panel.
3. **Si el juego aporta atributos propios**, agregar su variante a
   `CardGameAttributes` en `packages/shared` y llenarla en el mapeo. El detalle
   los muestra solo si vienen (`components/detail/game-attributes.ts`). No hace
   falta tocar D1: el blob ya existe. Si además quiere filtros en la tienda,
   registrarlos en `GAME_FILTERS` (`lib/catalog-filters.ts`). Opcionalmente,
   si algún valor de esa faceta merece icono/color propio en la consola (pips
   de maná, runas de dominio), agregar una entrada en
   `apps/web/src/lib/catalog/facet-presentation.ts` (**TASK-052**) — un
   registro `tcg → param → { icon?, hex? }` deliberadamente **separado** del
   registro funcional `GAME_FILTERS`/`game-filters.ts` (que decide parseo y
   matching) y sin ningún import de React, para poder cubrirlo al 100% con
   vitest (que excluye `.tsx`). `presentationFor`/`accentFor` nunca lanzan:
   un juego, param o valor sin entrada simplemente degrada a la tile plana de
   siempre, así que este paso nunca es obligatorio para que el filtro
   funcione, solo para que se vea con identidad propia.

   Si además quieres que el juego tenga **zona de identidad** en la consola de
   filtros (la fila de pips inline y a color, TASK-057), marca ESA faceta con
   `layout: 'pips'` en su entrada de `facet-presentation.ts`. Es lo único que
   hace falta: `filter-model.ts` la detecta ahí y la saca del popover, sin
   tocar un solo componente. Sin `layout: 'pips'` el juego simplemente no
   tiene zona de identidad y sus facetas caen todas en triggers — que es lo
   correcto para un juego cuya identidad no sea un vocabulario corto y con
   iconos.
4. **Verificar que el código del juego esté en `Tcg`/`TCGS`** y que tenga
   entrada en `TCG_META` (`apps/web/src/lib/catalog/display.ts`) para su nombre
   visible. Los seis TCG del proyecto ya están.
5. **Sembrar inventario** agregando entradas con `"game": "<código>"` en
   `scripts/inventory-seed.json` y corriendo `pnpm inventory:load:local`. Usar
   acabados que la impresión realmente ofrezca, o el alta los rechazará.

No hay que tocar: el filtro por juego de la tienda, las facetas, la ficha de
detalle, el pipeline de fotos ni la columna `inventory.tcg` (acepta cualquier
valor; la validación es a nivel app porque D1 no reconstruye tablas).

---

## 9. Verificado end-to-end

**TASK-035** validó el epic contra el stack local (entonces todavía con
RiftCodex):

- el seed carga MTG y Riftbound en la misma corrida (`4 creados, 0 fallidos`);
- `GET /catalog?tcg=riftbound` devuelve solo Riftbound y `/catalog/games`
  reporta ambos juegos;
- el detalle trae los `gameAttributes` (tipo, dominios, costes) y la ficha los
  renderiza como filas extra, omitiendo las ausentes;
- `POST /checkout` sobre un single Riftbound crea una sesión de Stripe en modo
  test (`cs_test_…`).

**TASK-037** lo re-validó ya con el catálogo local, en local y en producción:
búsquedas que RiftCodex nunca pudo resolver ahora devuelven resultados con URLs
de imagen propias, `%` se trata como literal, un `catalogId` inexistente
responde `404 card_not_found` y una publicación Riftbound completa se crea con
set/rareza/atributos/imagen correctos.

**La plataforma sigue fuera del flujo de fondos:** nada de esto tocó el modelo
de direct charges + application fee. Los precios de `catalog_cards` son
referencia de mercado y no participan en ningún cobro. Ver
[`pagos.md`](./pagos.md).
