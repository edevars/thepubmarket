# SEPOMEX — catálogo de códigos postales en D1

> De dónde sale el corpus de CPs, bajo qué términos se usa, qué vintage está
> cargado y cómo se refresca sin romper nada.

**Creado:** 2026-08-07 (TASK-061.01, épica `epic:sepomex-address`).

---

## 1. Para qué está

La dirección de envío del checkout era texto libre: el comprador escribía
estado, ciudad y colonia a mano y nadie verificaba que el CP correspondiera.
Una dirección mal escrita se vuelve una entrega fallida, y **la paga el
vendedor** (el flete viaja dentro de su direct charge). El corpus permite
anclar la dirección en el CP: 5 dígitos y salen estado, municipio, ciudad y la
lista de colonias reales.

El corpus **guía, no bloquea**. Ver [TASK-061](../../backlog/tasks/) para la
decisión de producto completa.

---

## 2. Fuente y términos de uso

**Catálogo Nacional de Códigos Postales**, Correos de México:
<https://www.correosdemexico.gob.mx/SSLServicios/ConsultaCP/CodigoPostal_Exportar.aspx>

No hay URL directa al archivo: la página es un WebForm de ASP.NET y hay que
devolverle sus tokens (`__VIEWSTATE`, `__EVENTVALIDATION`) en un POST. Eso lo
hace el importer. La respuesta es `CPdescargatxt.zip` (~2 MB) con
`CPdescarga.txt` (~16 MB, **ISO-8859-1**, CRLF, separado por `|`).

> ⚠️ **Términos declarados por la fuente**, en la primera línea del archivo: el
> catálogo *"se proporciona en forma gratuita para uso particular, no estando
> permitida su comercialización, total o parcial, ni su distribución a terceros
> bajo ningún concepto"*.
>
> Usarlo internamente para validar nuestras propias direcciones es una cosa;
> exponerlo en un endpoint público se acerca más a redistribución. El endpoint
> de la sección 4 se diseñó para quedar del lado de "consulta": sirve **un CP
> por petición**, no tiene volcado ni búsqueda por nombre de colonia, y el rate
> limit vuelve inviable reconstruir el catálogo. Si se decide cerrarlo más, es
> agregar un middleware de sesión, no rehacerlo. **Esto no es asesoría legal.**

El archivo crudo **no se commitea**: son 16 MB que se regeneran con un comando.
El SQL generado tampoco (28 MB, va a `apps/api/.tmp/`, gitignoreado).

---

## 3. Qué hay en D1

`sepomex_settlements` — una fila por asentamiento (colonia, pueblo,
fraccionamiento…). Llave primaria `(postal_code, settlement_id)`, que es
también el índice de la consulta caliente `WHERE postal_code = ?`.

Hechos medidos del vintage 2026-08-06, útiles para no diseñar sobre supuestos:

| Hecho | Valor |
|---|---|
| Asentamientos | 159,006 |
| Códigos postales distintos | 31,877 |
| Filas sin ciudad (`city IS NULL`) | 104,045 |
| CP con más asentamientos | 85203 → 291 |
| ¿Un CP cruza dos estados o municipios? | **Nunca** |
| ¿Un CP cruza dos ciudades distintas? | **No.** 324 CPs sí mezclan asentamientos con ciudad y sin ella |

Ese último renglón es la razón de que `city` viva en la fila del asentamiento y
no en una tabla por CP.

**Columnas `*_norm`** (`settlement_norm`, `municipality_norm`, `state_norm`,
`city_norm`): la misma cadena sin acentos, en minúsculas y con espacios
colapsados. SQLite no sabe quitar acentos, así que el match insensible a
acentos solo existe si se precalcula. Las produce `normalizeAddressPart()` de
`@thepubmarket/shared`, que es **la misma función** que usa el Worker al
consultar — si cada lado tuviera su copia, el índice y la consulta hablarían
idiomas distintos y el match fallaría en silencio. La ñ se pliega a n a
propósito (recall: el comprador rara vez la teclea); lo que se muestra sale
siempre de la columna sin normalizar.

`sepomex_corpus_meta` — fila única con el vintage cargado: `version`,
`published_label` ("Agosto 6 de 2026"), `row_count`, `file_sha256`, `loaded_at`.
Sin esto, "el corpus está cargado" no dice nada sobre qué tan viejo es.

---

## 4. El endpoint de consulta

`GET /address/postal-codes/:cp` — público, sin auth (TASK-061.02).

```json
{
  "postalCode": "01000", "found": true,
  "state": "Ciudad de México", "stateCode": "09",
  "municipality": "Álvaro Obregón", "municipalityCode": "010",
  "city": "Ciudad de México",
  "settlements": [{ "id": "0001", "name": "San Ángel", "type": "Colonia", "city": "Ciudad de México", "zone": "Urbano" }],
  "corpusVersion": "2026-08-06"
}
```

- **CP inexistente → 200 con `found: false`**, no un error. Es un desenlace normal (fraccionamiento nuevo, errata) y el formulario lo trata como "escríbelo a mano".
- **CP mal formado → 400 `invalid_postal_code`**, sin tocar KV ni D1.
- **Corpus sin importar → `found: false` y `corpusVersion: null`.** Un ambiente recién migrado no revienta: el checkout sigue con captura manual.
- Estado y municipio van a nivel CP (ninguno cruza dos). La **ciudad** se resuelve ignorando los asentamientos que no la traen: 324 CPs mezclan colonias urbanas con rancherías sin ciudad, y contar el vacío como valor dejaría sin autocompletar a quien sí la tiene. Si algún día hubiera dos ciudades distintas en un CP, la ciudad de nivel CP sale `null` y cada asentamiento conserva la suya.
- Las colonias vienen ordenadas alfabéticamente (`localeCompare` con `es`), no por el consecutivo interno de SEPOMEX.

**Cache.** KV, con llave `sepomex:s<contrato>:<vintage>:<cp>`. Las dos versiones están ahí porque cambian por motivos distintos: el vintage al reimportar el catálogo, el número de contrato al cambiar la forma de la respuesta. Un import nuevo invalida solo —cambia el prefijo— y las entradas viejas se recogen por TTL; **si cambias la forma del JSON, sube `RESPONSE_SCHEMA_VERSION` en `lib/postal-codes.ts`** o se seguirá sirviendo el payload anterior por semanas. Un hit no toca D1. Al browser/CDN se le manda `Cache-Control: public, max-age=3600`.

**Rate limit.** 120 consultas por IP y hora (`cp:ip`, sobre `SESSIONS`). Un comprador llenando un formulario ni lo roza; enumerar los 31,877 CPs tomaría casi dos semanas. Es también la contención práctica al punto de licencia: el endpoint sirve un CP a la vez, sin volcado ni búsqueda por nombre.

---

## 5. El cotejo de la dirección en el checkout

`POST /checkout` compara la dirección contra el corpus antes de crear la orden y guarda el resultado en tres columnas: `shipping_address_match` (el veredicto), `shipping_address_original` (JSON con lo que escribió el comprador en los campos cuya ortografía se sustituyó) y `shipping_corpus_version`.

**Es descriptivo, no una compuerta.** Ningún veredicto impide pagar. Validar estricto rechaza direcciones reales y entregables — colonias más nuevas que el catálogo, rancherías, gente que escribe el municipio vecino porque es donde de verdad le llega el correo. Lo que hace es avisarle a la tienda antes de imprimir la guía, que es cuando corregir todavía es gratis.

| Veredicto | Qué pasó | ¿Se le avisa al vendedor? |
|---|---|---|
| `exact` | todo coincide | no |
| `corrected` | mismo lugar, se guardó la ortografía del catálogo | no |
| `unlisted_settlement` | el CP existe, su lista no trae esa colonia | **sí** |
| `municipality_mismatch` | el municipio/ciudad no es el del CP | **sí** |
| `state_mismatch` | el estado contradice al del CP | **sí** |
| `unknown_postal_code` | CP bien formado que el catálogo no registra | **sí** |
| `no_corpus` | el catálogo no está cargado en ese ambiente | no — es falla nuestra, no de la dirección |

**Normalizar sí, reinterpretar no.** Se sustituye por la ortografía del catálogo solo cuando el valor normalizado coincide (mismo lugar, distintos acentos o mayúsculas), y lo que escribió el comprador queda guardado al lado. Cuando difiere de verdad **se conserva lo que él escribió**: si el dedazo estuvo en el CP y no en el estado, "corregirlo" mandaría el paquete al otro lado del país.

La localidad casa contra el municipio **o** contra la ciudad del CP: en zonas metropolitanas mucha gente escribe la ciudad, y las dos son ciertas. El municipio es el que se prefiere, porque es lo que va en la guía.

Encontrar órdenes que alguien debería revisar:

```bash
npx wrangler d1 execute thepubmarket-db --remote --command "SELECT id, shipping_postal_code, shipping_city, shipping_state, shipping_address_match, shipping_address_original FROM orders WHERE shipping_address_match IN ('unlisted_settlement','municipality_mismatch','state_mismatch','unknown_postal_code') ORDER BY created_at DESC LIMIT 50"
```

---

## 6. Cómo se refresca

Correos publica actualizaciones cada pocas semanas. **Es una operación manual y
deliberadamente manual:** el catálogo se mueve lento y un cron no paga su
mantenimiento para un operador solo. Revísalo cuando alguien reporte una
colonia faltante, o un par de veces al año.

```bash
node scripts/import-sepomex.mjs --local
```

```bash
node scripts/import-sepomex.mjs --remote
```

El script descarga, valida la cabecera contra el contrato, parsea, genera el
SQL en `apps/api/.tmp/` y lo aplica con `wrangler d1 execute`. Toma ~15 s en
local. Antes de la primera corrida hay que tener la migración aplicada
(`pnpm --filter @thepubmarket/api db:migrate:local|remote`).

Flags útiles:

| Flag | Para qué |
|---|---|
| `--file=<ruta>` | usar un TXT ya descargado en vez de bajarlo |
| `--sql-only` | generar el `.sql` y no tocar ninguna base |
| `--limit=<n>` | cargar solo n filas (pruebas; **deja el corpus incompleto**) |
| `--version=<v>` | forzar el vintage (default: la fecha que publica la página) |

**Es idempotente.** Cada corrida estampa `corpus_version` en todas las filas,
hace `INSERT OR REPLACE` y al final borra lo que quedó de otras versiones — así
los asentamientos que SEPOMEX eliminó desaparecen de verdad. Correrlo dos veces
deja exactamente lo mismo; una corrida que muera a la mitad deja la tabla
mezclada pero **nunca vacía**, y la siguiente converge.

---

## 7. Verificar una carga

```bash
npx wrangler d1 execute thepubmarket-db --local --command "SELECT (SELECT COUNT(*) FROM sepomex_settlements) AS filas, (SELECT COUNT(DISTINCT postal_code) FROM sepomex_settlements) AS cps, (SELECT COUNT(DISTINCT corpus_version) FROM sepomex_settlements) AS versiones, (SELECT version FROM sepomex_corpus_meta) AS vintage"
```

Debe dar `versiones = 1` (si da 2, el barrido no corrió) y las cifras de la
tabla de arriba. Spot checks que se corrieron al cargar el vintage 2026-08-06 y
que valen para cualquier otro:

| CP | Qué prueba | Esperado |
|---|---|---|
| `01000` | acentos intactos | San Ángel, Álvaro Obregón, Ciudad de México |
| `09630` | CP con varios asentamientos | 15 filas |
| `20174` | ciudad vacía en zona rural | El Rocío con `city IS NULL`, `zone = 'Rural'` |

---

## 8. Cuando se rompa

| Síntoma | Causa probable |
|---|---|
| `no se encontró la cabecera` / `la cabecera no coincide` | Correos cambió el formato del export. **No parchees el parser a ciegas**: el formato es posicional, un campo movido mete el municipio en la columna del estado. Compara contra `SEPOMEX_HEADER_FIELDS`. |
| `No se encontró el campo oculto __VIEWSTATE` | rediseñaron la página de descarga; hay que rehacer el POST |
| `Se esperaba un ZIP y llegó otra cosa` | la página respondió HTML (mantenimiento o bloqueo). Reintenta; si persiste, baja el archivo a mano y usa `--file=`. |
| `llave (CP, id_asenta_cpcons) repetidas` | SEPOMEX publicó un duplicado. El esquema asume esa llave única; revisa el caso antes de relajar nada. |
| Acentos como `Ã¡` o `�` | alguien decodificó el archivo como UTF-8. Es ISO-8859-1. |

---

*Vintage cargado al crear este doc: **2026-08-06** (159,006 asentamientos).*
