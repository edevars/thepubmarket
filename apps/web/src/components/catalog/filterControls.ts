/**
 * Constantes de estilo compartidas por todos los controles de filtro del
 * catálogo: la consola horizontal (`FilterConsole`), la pila vertical del
 * sheet mobile (`FilterStack`) y las primitivas que ambas montan
 * (`CollapsibleSection`, `PipRow`, `FacetTile`, `controls/*`).
 *
 * Módulo puro (sin JSX) para que cualquiera pueda importarlo sin ciclos: las
 * clases viven aquí y no dentro de un componente concreto, así que nadie
 * necesita importar DESDE un componente para reutilizar su look.
 */

/** Título de sección: mono, minúscula-caps, tenue — igual en todo el panel. */
export const SECTION_LABEL = 'font-mono text-[9px] uppercase tracking-[0.14em] text-faint'

/**
 * Feedback de hover/press compartido por los controles de filtro: usa los
 * tokens de movimiento (`duration-fast`/`ease-standard`, ver globals.css) y
 * un scale-down en `:active` para que tocar un filtro se sienta táctil, sin
 * bloquear el foco de teclado.
 *
 * `touch-manipulation` mata el retardo de ~300ms del doble-tap-para-zoom en
 * móviles: filtrar es tocar muchos controles seguidos, y ese retardo hacía
 * que el panel entero se sintiera lento sin que nada estuviera lento.
 */
export const CONTROL_BASE =
  'touch-manipulation transition duration-fast ease-standard active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70'

/**
 * Clase para tiles/botones deshabilitados por conteo cero (TASK-053/054):
 * opacity baja, sin hover, no clickeable — el `disabled` nativo ya lo saca
 * del tab order y bloquea el click; `pointer-events-none` evita cualquier
 * :hover residual en navegadores que lo siguen disparando en botones disabled.
 */
export const DISABLED_TILE =
  'cursor-not-allowed pointer-events-none border-line-soft bg-input/40 text-faint-2 opacity-40'
