/**
 * Constantes de estilo compartidas entre `FilterSidebar` y sus subcomponentes
 * (TASK-054: `CollapsibleSection`, `PipRow`, `FacetTile`, `GameFacetSection`).
 * Módulo puro (sin JSX) para que todos puedan importarlo sin ciclos —
 * `FilterSidebar` también lo usa, pero nunca lo define localmente para que
 * nadie tenga que importar DESDE `FilterSidebar` (evita ciclos de módulos).
 */

/** Título de sección: mono, minúscula-caps, tenue — igual en todo el sidebar. */
export const SECTION_LABEL = 'font-mono text-[9px] uppercase tracking-[0.14em] text-faint'

/**
 * Feedback de hover/press compartido por los controles de filtro: usa los
 * tokens de movimiento (`duration-fast`/`ease-standard`, ver globals.css) y
 * un scale-down en `:active` para que tocar un filtro se sienta táctil, sin
 * bloquear el foco de teclado.
 */
export const CONTROL_BASE =
  'transition duration-fast ease-standard active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70'

/**
 * Clase para tiles/botones deshabilitados por conteo cero (TASK-053/054):
 * opacity baja, sin hover, no clickeable — el `disabled` nativo ya lo saca
 * del tab order y bloquea el click; `pointer-events-none` evita cualquier
 * :hover residual en navegadores que lo siguen disparando en botones disabled.
 */
export const DISABLED_TILE =
  'cursor-not-allowed pointer-events-none border-line-soft bg-input/40 text-faint-2 opacity-40'
