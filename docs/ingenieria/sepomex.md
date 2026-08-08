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
> exponerlo en un endpoint público (TASK-061.02) se acerca más a
> redistribución. Pendiente de resolver antes de esa task. **Esto no es asesoría
> legal.**

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
| ¿Un CP cruza dos ciudades? | **Sí, 324 CPs** |

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

## 4. Cómo se refresca

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

## 5. Verificar una carga

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

## 6. Cuando se rompa

| Síntoma | Causa probable |
|---|---|
| `no se encontró la cabecera` / `la cabecera no coincide` | Correos cambió el formato del export. **No parchees el parser a ciegas**: el formato es posicional, un campo movido mete el municipio en la columna del estado. Compara contra `SEPOMEX_HEADER_FIELDS`. |
| `No se encontró el campo oculto __VIEWSTATE` | rediseñaron la página de descarga; hay que rehacer el POST |
| `Se esperaba un ZIP y llegó otra cosa` | la página respondió HTML (mantenimiento o bloqueo). Reintenta; si persiste, baja el archivo a mano y usa `--file=`. |
| `llave (CP, id_asenta_cpcons) repetidas` | SEPOMEX publicó un duplicado. El esquema asume esa llave única; revisa el caso antes de relajar nada. |
| Acentos como `Ã¡` o `�` | alguien decodificó el archivo como UTF-8. Es ISO-8859-1. |

---

*Vintage cargado al crear este doc: **2026-08-06** (159,006 asentamientos).*
