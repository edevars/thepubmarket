# Fotos de inventario

Fotos reales del ejemplar físico que sube el vendedor, complementarias a la
imagen canónica de Scryfall. En singles la condición manda sobre el precio,
así que esto es confianza, no decoración: el comprador juzga rayones,
whitening, centrado y curvatura del foil antes de pagar.

Epic `inventory-photos`. **TASK-023** puso la base de datos y el contrato
compartido. **TASK-024** agregó los endpoints de escritura del panel del
vendedor (§2-3). **TASK-025** expone las fotos en el catálogo público y monta
la ruta que sirve los binarios (§4-7): con ella `InventoryPhoto.url` ya
resuelve en cualquier ambiente.

No toca ningún flujo de fondos: es metadata y objetos en R2, nada de pagos,
payouts ni Stripe.

---

## 1. Modelo de datos

Tabla propia `inventory_photos` (no una columna JSON en `inventory`):
integridad referencial vía `ON DELETE CASCADE`, reordenar/borrar sin
read-modify-write, y es puro `CREATE TABLE` (D1-friendly). Ver el
doc-comment en `packages/db/src/schema.ts`.

- `seller_id` está desnormalizado: la verificación de dueño en el panel es un
  `WHERE` directo, sin join contra `inventory`.
- `r2_key` es único — dos filas nunca apuntan al mismo binario.
- El tope de **6 fotos por listing** (`MAX_PHOTOS_PER_ITEM` en
  `packages/shared`) se aplica en la app, no en el esquema.
- Fotos permitidas sin importar la cantidad en stock, y nunca obligatorias —
  no hay requisito por condición (HP/DMG) en v1.

## 2. Subida: proxiada por el Worker

El binario entra por `POST /seller/inventory/:id/photos` y el Worker lo sube a
R2 él mismo — no hay URLs presigned directo-a-R2.

**Por qué proxiar y no presignar:** presigned URLs necesitarían credenciales
S3 de la cuenta, una dependencia más, y reconciliación post-subida para
validar tipo/tamaño/tope después de que el objeto ya existe. Proxiar mantiene
auth, dueño, tope y validación en un solo código, y el límite de body de
Workers está muy por arriba del tope de 5 MB por archivo. Menos piezas móviles
para un equipo de una persona.

### El servidor nunca confía en lo que declara el cliente

- **Content-Type declarado:** ignorado. El tipo real se decide inspeccionando
  los *magic bytes* del body (`detectImageKind` en
  `apps/api/src/lib/photos.ts`): JPEG (`FF D8 FF`), PNG (firma de 8 bytes) o
  WebP (contenedor `RIFF` + fourcc `WEBP`). Un `.txt` renombrado a `.jpg` o un
  archivo truncado no pasa la detección sin importar la cabecera HTTP.
- **Nombre de archivo:** nunca llega a la llave de R2. La llave la genera el
  servidor con UUIDs.

### Llaves de R2

```
inventory-photos/{sellerId}/{inventoryId}/{photoId}.{ext}
```

No adivinables, generadas por el servidor, bajo un prefijo fijo. Las llaves
son **inmutables** — una foto nunca se sobrescribe — que es lo que hace segura
la caché de larga duración que pone encima `GET /photos/:id` (§5).

### Límites

| Regla | Código de error | Status |
|---|---|---|
| Body no es JPEG/PNG/WebP por magic bytes | `invalid_image` | 400 |
| Body vacío | `empty_body` | 400 |
| Body mayor a 5 MB (`MAX_PHOTO_BYTES`) | `photo_too_large` | 400 |
| Listing ya tiene 6 fotos | `photo_limit_reached` | 409 |

El tope se revisa dos veces: antes de insertar (evita el trabajo obvio) y
**después** de insertar, releyendo el conteo. D1/Drizzle no da una transacción
real entre el `SELECT` del conteo y el `INSERT` aquí, así que dos subidas
concurrentes pueden leer el mismo conteo por debajo del tope y las dos
insertar. La relectura post-insert cierra esa carrera: la subida que empuja el
total por encima de 6 se revierte (borra su fila y su objeto de R2), la otra
queda.

## 3. Endpoints

Todos bajo `sellerAuth` (sesión + fila activa en `sellers`), mismo patrón de
dueño que el resto del panel: cada query filtra por `sellerId` de la sesión,
nunca se acepta un `sellerId` del cliente. Un listing ajeno responde **404
opaco** — indistinguible de "no existe".

| Método | Ruta | Qué hace |
|---|---|---|
| `POST` | `/seller/inventory/:id/photos` | Sube una foto (body = bytes crudos de la imagen) |
| `DELETE` | `/seller/inventory/:id/photos/:photoId` | Borra una foto propia |
| `POST` | `/seller/inventory/:id/photos/reorder` | Persiste un orden completo: `{ order: string[] }` |
| `DELETE` | `/admin/inventory/photos/:photoId` | Borrado forzoso de CUALQUIER foto (moderación) |

### Reorder: todo o nada

El `order` enviado debe coincidir **exacto** con el conjunto de ids actuales
del listing (mismo tamaño, mismos ids) o se rechaza con `photo_set_mismatch` /
400 — un set parcial o con ids ajenos nunca se aplica a medias. Cada `UPDATE`
va filtrado por `inventoryId` de forma independiente, así que aunque no hay
una transacción multi-fila, un id no puede reasignarse al orden de otro
listing.

### Borrado: DB primero, R2 best-effort

```
DELETE FROM inventory_photos WHERE ...   -- fuente de verdad
R2.delete(r2Key)                          -- best-effort, error solo se loguea
```

Un objeto suelto en R2 es inalcanzable (servir se resuelve por la fila de la
DB, nunca por listar el bucket) y cuesta centavos; el orden inverso mostraría
imágenes rotas al comprador. Sin cron de reconciliación en v1 — el costo de un
huérfano ocasional es menor que el de construir y mantener un reconciliador.

### Moderación

Palanca de v1 es el borrado forzoso de admin, no un flujo de reporte de
compradores: los sellers son vetted por invitación, así que el operador
quitando una foto directamente es proporcional. `DELETE
/admin/inventory/photos/:photoId` no filtra por dueño — a diferencia del
panel, el admin puede tocar la foto de cualquier seller — y usa el mismo
mecanismo de auth que el resto de `/admin/*` (`x-admin-key`).

## 4. El campo `url` del DTO

`InventoryPhoto.url` (contrato en `packages/shared`) se construye como:

```
{origin}/photos/{photoId}
```

usando `new URL(c.req.url).origin` — sin variable de entorno nueva, correcto
en cualquier ambiente (wrangler dev local, prod, y cualquier dominio futuro sin
tocar código). Está keyed por **id de la foto**, no por la llave cruda de R2:
`GET /photos/:id` (§5) resuelve la llave desde la fila de la DB, nunca la
acepta del cliente.

## 5. Servido: `GET /photos/:id` (TASK-025)

Ruta pública, sin auth — misma exposición que las URLs de Scryfall que ya
vienen embebidas en cada listing. Vive en `apps/api/src/routes/photos.ts`,
montada en `/photos`.

```
id de foto → SELECT r2_key FROM inventory_photos WHERE id = ? → R2.get(r2_key) → stream
```

**Por qué una ruta de Worker y no el bucket público con dominio propio:**
`thepubmarket-assets` es compartido y el roadmap ya lo reserva para más usos
(migrar las imágenes de Scryfall en Fase 5); hacerlo público es todo-o-nada y
requiere pasos manuales de dashboard/DNS. Una ruta en código no cuesta nada
extra, queda acotada a este prefijo, y no compromete el resto del bucket si
algún día se agrega contenido que NO deba ser público.

**Nunca acepta una llave de R2 del cliente** (AC#6): la URL solo lleva un id
de foto. Incluso si algún escritor futuro se saltara `buildPhotoKey` y
guardara una fila con una llave fuera de `inventory-photos/`, la ruta la
rechaza igual — verifica el prefijo antes de pedirle el objeto a R2, defensa
en profundidad sobre el hecho de que hoy `buildPhotoKey` es el único que
escribe esa columna.

Un id desconocido, o el de una foto ya borrada, responde `404 not_found` — sin
distinguir un caso del otro (la fila ya no existe en ninguno de los dos).

### Caché: `Cache-Control` + Cache API de Workers

Las llaves de R2 son inmutables (una foto nunca se sobrescribe), así que un
hit es seguro de cachear para siempre — no hay historia de invalidación que
diseñar; una foto nueva siempre tiene un id nuevo.

- **Navegador/CDN aguas abajo:** `Cache-Control: public, max-age=31536000, immutable`.
- **Borde de Cloudflare:** una respuesta generada por un Worker NO se cachea
  sola en el edge solo por llevar ese header — hay que escribirla
  explícitamente con la [Cache API](https://developers.cloudflare.com/workers/runtime-apis/cache/)
  (`caches.default`). La ruta hace `cache.match()` al entrar y, en un miss,
  `cache.put()` de la respuesta clonada vía `waitUntil` (no bloquea la
  respuesta al cliente). Solo se cachean los 200 — un 404 nunca se guarda, así
  que una foto recién subida no queda bloqueada por un miss cacheado.

Verificado localmente (`wrangler dev` también emula la Cache API): tras un
primer `GET` exitoso, se borró la fila de la foto y su objeto en R2 (hard
delete de admin) y un segundo `GET` a la misma URL siguió respondiendo 200 con
los bytes originales — prueba de que la respuesta vino del caché del borde, no
de una relectura.

## 6. Fotos en el catálogo y el panel: carga en lote

`loadPhotosByInventoryId(db, inventoryIds, origin)` en `lib/photos.ts` hace
**una sola query** `WHERE inventory_id IN (...)` para todos los ids de la
página y agrupa el resultado en un `Map`, mismo patrón que ya usaban `sellers`
en `catalog.ts` y `orders.ts` — nunca una query por item.

La usan cinco lugares, todos donde `rowToInventoryItem` ya se llamaba sobre
una fila EXISTENTE (a diferencia de un alta, que nunca tiene fotos todavía):

| Endpoint | Por qué |
|---|---|
| `GET /catalog` | La grilla pública necesita el indicador de "fotos reales" |
| `GET /catalog/:id` | Detalle del listing |
| `GET /seller/inventory` | Vista del panel |
| `PATCH /seller/inventory/:id` | Sin esto, editar precio devolvería `photos: []` aunque el listing SÍ tenga fotos — una respuesta que miente |
| `PATCH /admin/inventory/:id` | Mismo motivo, ruta de admin |

`POST /seller/inventory` y `POST /admin/inventory` (alta) siguen sin pasar
fotos: un listing recién creado genuinamente no tiene ninguna todavía, así que
`photos: []` ahí es correcto, no una omisión.

El arreglo va **ordenado por `sort_order`** en todas partes porque la query
tiene `ORDER BY sort_order` — el orden que persiste `POST
.../photos/reorder` (§3) es el mismo que ve el comprador.

## 7. Módulo puro y tests

`apps/api/src/lib/photos.ts` — sin I/O, testeable sin runtime de Workers
(misma convención que `lib/delivery.ts`, `lib/stripe.ts`):

- `detectImageKind(bytes)` — JPEG/PNG/WebP por magic bytes, `null` si no.
- `contentTypeFor(kind)`, `buildPhotoKey(...)`, `rowToInventoryPhoto(row, origin)`.

Cobertura en `photos.test.ts`: cabecera JPEG/PNG/WebP válida, archivo
truncado, body vacío, texto plano renombrado, contenedor RIFF que no es WebP,
formato de la llave.

`loadPhotosByInventoryId` (§6) sí toca D1, así que queda fuera de esta
cobertura por la misma razón que los handlers de ruta: se valida con el pase
manual/E2E de abajo, no con vitest.

Los handlers de ruta **no** llevan tests unitarios — misma convención que el
resto de `apps/api` (vitest solo cubre módulos puros bajo `src/lib/`); se
validan con un pase manual/E2E documentado abajo.

## 8. Verificación manual

### TASK-024 — escritura

Contra `wrangler dev` (emula R2 localmente) con curl, usando una sesión de
seller real y un listing propio:

| Caso | Resultado esperado |
|---|---|
| Subir un JPEG real | 201 + DTO `{ id, url, sortOrder }` |
| Subir un `.txt` renombrado a `.jpg` | 400 `invalid_image` |
| Subir un archivo > 5 MB | 400 `photo_too_large` |
| Subir una 7ª foto al mismo listing | 409 `photo_limit_reached` |
| Subir/borrar/reordenar en un listing de otro seller | 404 opaco |
| Borrar una foto propia | 200 `{ ok: true }`, fila y objeto desaparecen |
| Reordenar con un set parcial o con un id ajeno | 400 `photo_set_mismatch` |
| Reordenar con el set exacto | 200, `sortOrder` persistido en el orden enviado |

### TASK-025 — lectura y servido

Misma configuración: subí 2 fotos reales a un listing existente, luego:

| Caso | Resultado esperado |
|---|---|
| `GET /catalog` (lista) | `photos` del listing poblado, en orden |
| `GET /catalog/:id` (detalle) | Mismo arreglo que en la lista |
| `GET /seller/inventory` | Mismo arreglo |
| `PATCH /seller/inventory/:id` (editar precio) | La respuesta sigue trayendo las fotos reales, no `[]` |
| `GET /photos/:id` | 200, `Content-Type: image/jpeg`, `Cache-Control: public, max-age=31536000, immutable`, `ETag`, bytes idénticos a los subidos |
| `GET /photos/:id` de un id inexistente | 404 |
| Borrar la fila + el objeto de R2 (hard delete de admin) y repetir el `GET` a la misma URL | Sigue en 200 con los bytes originales — sirvió del caché del borde, no de una relectura |

Datos de prueba limpiados al terminar (fotos, usuario, invitación, vínculo de
seller, precio restaurado a su valor original) — el D1 local queda igual que
antes de correr la verificación.
