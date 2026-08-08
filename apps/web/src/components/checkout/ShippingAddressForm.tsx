'use client'

/**
 * Captura de la dirección de envío, anclada en el código postal (TASK-061.03).
 *
 * El CP manda. El comprador escribe 5 dígitos y el corpus SEPOMEX responde con
 * el municipio, el estado y las colonias que de verdad existen ahí; lo único
 * que queda por teclear es lo que solo él sabe: calle, número, referencias y a
 * quién buscar. Antes eran ocho campos de texto libre donde nada impedía que
 * el CP de Coyoacán conviviera con "Monterrey, Yucatán" — y una dirección mal
 * escrita la paga el vendedor, que es quien cubre la paquetería.
 *
 * REGLA QUE NO SE ROMPE: el corpus guía, nunca atrapa. Las direcciones
 * mexicanas son legítimamente desordenadas (fraccionamientos más nuevos que el
 * catálogo, rancherías, domicilios sin número), así que los tres caminos
 * terminan en una orden pagada: colonia en la lista, colonia escrita a mano, o
 * CP que el catálogo no conoce y formulario completo a mano. Ningún estado de
 * este componente puede impedir el pago.
 */

import type { PostalCodeLookupResponse, PostalCodeSettlement } from '@thepubmarket/shared'
import { useTranslations } from 'next-intl'
import { useEffect, useRef, useState } from 'react'
import { Spinner } from '@/components/ui/Spinner'
import { type AddressFormValue, applyLookup, type ColoniaMode } from '@/lib/checkout/address-form'
import { lookupPostalCode } from '@/lib/client-api'

/**
 * Espera antes de consultar. El disparo ya está condicionado a que el CP tenga
 * 5 dígitos, así que esto solo absorbe al comprador que corrige el último
 * dígito — sin él, cada tecleo de más sería una petición.
 */
const LOOKUP_DEBOUNCE_MS = 400

/** Valor centinela del `<select>` para "mi colonia no está en la lista". */
const OTHER_OPTION = '__other__'

type LookupState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'found'; data: PostalCodeLookupResponse }
  /** CP bien formado que el catálogo no registra. Pasa, y no es un error. */
  | { status: 'empty' }
  /** No se pudo consultar: red caída, 429, corpus sin importar. */
  | { status: 'error' }

interface ShippingAddressFormProps {
  value: AddressFormValue
  onChange: (next: AddressFormValue) => void
  showErrors: boolean
  missing: readonly string[]
  postalCodeInvalid: boolean
  formId: string
}

export function ShippingAddressForm({
  value,
  onChange,
  showErrors,
  missing,
  postalCodeInvalid,
  formId,
}: ShippingAddressFormProps) {
  const t = useTranslations('delivery')

  const [lookup, setLookup] = useState<LookupState>({ status: 'idle' })
  const [coloniaMode, setColoniaMode] = useState<ColoniaMode>('manual')
  const [selectedSettlementId, setSelectedSettlementId] = useState<string | null>(null)
  const coloniaInputRef = useRef<HTMLInputElement>(null)

  // `onChange` y `value` se leen por ref dentro del efecto: el efecto solo debe
  // reaccionar al CP. Si dependiera del objeto de dirección completo, cada
  // tecla en "calle y número" re-dispararía la consulta.
  const latest = useRef({ value, onChange })
  latest.current = { value, onChange }

  const postalCode = value.postalCode.trim()

  useEffect(() => {
    if (!/^\d{5}$/.test(postalCode)) {
      // CP incompleto o inválido: se vuelve al estado neutro sin borrar nada de
      // lo que el comprador ya escribió — está a media edición, no equivocado.
      setLookup({ status: 'idle' })
      return
    }

    const controller = new AbortController()
    setLookup({ status: 'loading' })

    const timer = setTimeout(async () => {
      const result = await lookupPostalCode(postalCode, controller.signal)
      if (controller.signal.aborted) return

      // `null` = no se pudo consultar. Se degrada a captura manual en vez de
      // dejar al comprador mirando un spinner eterno.
      if (!result) {
        setLookup({ status: 'error' })
        setColoniaMode('manual')
        setSelectedSettlementId(null)
        return
      }

      const applied = applyLookup(latest.current.value, result)
      latest.current.onChange(applied.address)
      setColoniaMode(applied.coloniaMode)
      setSelectedSettlementId(applied.selectedSettlementId)
      setLookup(result.found ? { status: 'found', data: result } : { status: 'empty' })
    }, LOOKUP_DEBOUNCE_MS)

    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [postalCode])

  const settlements = lookup.status === 'found' ? lookup.data.settlements : []
  const set = (key: keyof AddressFormValue, next: string) => onChange({ ...value, [key]: next })

  function selectSettlement(optionValue: string) {
    if (optionValue === OTHER_OPTION) {
      setColoniaMode('manual')
      setSelectedSettlementId(null)
      set('neighborhood', '')
      // El foco sigue a la acción: el comprador pidió escribirla, no debería
      // tener que ir a buscar dónde.
      requestAnimationFrame(() => coloniaInputRef.current?.focus())
      return
    }
    const settlement = settlements.find((s) => s.id === optionValue)
    setSelectedSettlementId(settlement?.id ?? null)
    set('neighborhood', settlement?.name ?? '')
  }

  const statusId = `${formId}-cp-status`

  return (
    <div className="clip-tile border border-line bg-panel-2 p-[18px]">
      {/* --- Anclaje: el código postal resuelve el resto de la dirección --- */}
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-[minmax(0,9.5rem)_1fr] sm:items-start">
        <Field
          formId={formId}
          name="postalCode"
          label={t('field.postalCode')}
          value={value.postalCode}
          onChange={(next) => set('postalCode', next)}
          invalid={showErrors && (missing.includes('postalCode') || postalCodeInvalid)}
          autoComplete="postal-code"
          inputMode="numeric"
          maxLength={5}
          spellCheck={false}
          describedBy={statusId}
        />
        <Readout id={statusId} state={lookup} />
      </div>

      <div className="my-4 h-px bg-line-soft" />

      {/* --- Dirección --- */}
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
        <div className="sm:col-span-2">
          {coloniaMode === 'list' && settlements.length > 0 ? (
            <ColoniaSelect
              formId={formId}
              settlements={settlements}
              selectedId={selectedSettlementId}
              onSelect={selectSettlement}
            />
          ) : (
            <Field
              ref={coloniaInputRef}
              formId={formId}
              name="neighborhood"
              label={t('field.neighborhood')}
              value={value.neighborhood}
              onChange={(next) => set('neighborhood', next)}
              autoComplete="address-level3"
              optionalNote={t('optional')}
              action={
                settlements.length > 0
                  ? {
                      label: t('coloniaBackToList'),
                      onClick: () => {
                        setColoniaMode('list')
                        setSelectedSettlementId(null)
                        set('neighborhood', '')
                      },
                    }
                  : undefined
              }
            />
          )}
        </div>

        <div className="sm:col-span-2">
          <Field
            formId={formId}
            name="line1"
            label={t('field.line1')}
            value={value.line1}
            onChange={(next) => set('line1', next)}
            invalid={showErrors && missing.includes('line1')}
            autoComplete="address-line1"
          />
        </div>
        <div className="sm:col-span-2">
          <Field
            formId={formId}
            name="line2"
            label={t('field.line2')}
            value={value.line2}
            onChange={(next) => set('line2', next)}
            autoComplete="address-line2"
            optionalNote={t('optional')}
          />
        </div>

        <Field
          formId={formId}
          name="city"
          label={t('field.city')}
          value={value.city}
          onChange={(next) => set('city', next)}
          invalid={showErrors && missing.includes('city')}
          autoComplete="address-level2"
          filled={lookup.status === 'found'}
          filledNote={t('autofilled')}
        />
        <Field
          formId={formId}
          name="state"
          label={t('field.state')}
          value={value.state}
          onChange={(next) => set('state', next)}
          invalid={showErrors && missing.includes('state')}
          autoComplete="address-level1"
          filled={lookup.status === 'found'}
          filledNote={t('autofilled')}
        />
      </div>

      <div className="my-4 h-px bg-line-soft" />

      {/* --- Contacto: a quién busca el mensajero --- */}
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
        <Field
          formId={formId}
          name="recipient"
          label={t('field.recipient')}
          value={value.recipient}
          onChange={(next) => set('recipient', next)}
          invalid={showErrors && missing.includes('recipient')}
          autoComplete="name"
        />
        <Field
          formId={formId}
          name="phone"
          label={t('field.phone')}
          value={value.phone}
          onChange={(next) => set('phone', next)}
          invalid={showErrors && missing.includes('phone')}
          autoComplete="tel"
          type="tel"
          inputMode="tel"
        />
      </div>

      {showErrors && (missing.length > 0 || postalCodeInvalid) && (
        <p className="mt-3.5 text-[12.5px] text-red-400">
          {postalCodeInvalid && missing.length === 0 ? t('errorPostalCode') : t('errorIncomplete')}
        </p>
      )}
    </div>
  )
}

/**
 * La lectura del CP: la única pieza con carácter propio del bloque.
 *
 * Se comporta como el instrumento de la tienda confirmando el destino —
 * `—— · ——` mientras no hay nada, `BUSCANDO…`, y luego `MUNICIPIO · ESTADO`.
 * El `key` cambia con el texto para que cada resolución vuelva a montar el
 * nodo y dispare `.tpm-tick`; el bloque global de `prefers-reduced-motion` de
 * globals.css la anula para quien pidió menos movimiento.
 *
 * La versión larga va aparte en un vivo `polite`: el lector de pantalla
 * necesita la frase completa ("CP 01000: Álvaro Obregón, Ciudad de México, 1
 * colonia"), no el telegrama visual.
 */
function Readout({ id, state }: { id: string; state: LookupState }) {
  const t = useTranslations('delivery')

  const line =
    state.status === 'found'
      ? [state.data.municipality, state.data.state].filter(Boolean).join(' · ')
      : state.status === 'loading'
        ? t('cpSearching')
        : state.status === 'empty'
          ? t('cpNotFound')
          : state.status === 'error'
            ? t('cpUnavailable')
            : '—— · ——'

  const tone =
    state.status === 'found'
      ? 'text-cyan'
      : state.status === 'empty' || state.status === 'error'
        ? 'text-muted'
        : 'text-faint'

  const announcement =
    state.status === 'found'
      ? t('cpAnnounce', {
          municipality: state.data.municipality ?? '',
          state: state.data.state ?? '',
          count: state.data.settlements.length,
        })
      : state.status === 'empty'
        ? t('cpNotFoundHelp')
        : state.status === 'error'
          ? t('cpUnavailable')
          : ''

  return (
    <div className="sm:pt-[26px]" aria-busy={state.status === 'loading' || undefined}>
      <p
        id={id}
        className={`flex min-h-[42px] items-center gap-2 border border-line-soft bg-[#080d18] px-3 font-mono text-[11px] uppercase tracking-[0.14em] ${tone}`}
      >
        {state.status === 'loading' && <Spinner />}
        <span key={line} className="tpm-tick min-w-0 truncate">
          {line}
        </span>
      </p>
      {(state.status === 'empty' || state.status === 'error') && (
        <p className="tpm-reveal mt-1.5 text-[12px] leading-relaxed text-muted-2">
          {t('cpNotFoundHelp')}
        </p>
      )}
      <span aria-live="polite" className="sr-only">
        {announcement}
      </span>
    </div>
  )
}

/**
 * Selector de colonia. `<select>` nativo a propósito: en móvil abre la rueda
 * del sistema y con teclado ya funciona como se espera — un combobox propio
 * tendría que reimplementar las dos cosas para verse igual.
 *
 * La última opción es la salida: si la colonia no está (fraccionamiento nuevo,
 * cambio de nombre), el comprador la escribe y sigue. Nunca es un callejón.
 */
function ColoniaSelect({
  formId,
  settlements,
  selectedId,
  onSelect,
}: {
  formId: string
  settlements: PostalCodeSettlement[]
  selectedId: string | null
  onSelect: (value: string) => void
}) {
  const t = useTranslations('delivery')
  const id = `${formId}-neighborhood`

  return (
    <div className="tpm-reveal">
      <label
        htmlFor={id}
        className="mb-1.5 block font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted-2"
      >
        {t('field.neighborhood')}
        <span className="ml-1.5 normal-case text-cyan">{t('fromPostalCode')}</span>
      </label>
      <div className="relative">
        <select
          id={id}
          name="neighborhood"
          value={selectedId ?? ''}
          onChange={(e) => onSelect(e.target.value)}
          autoComplete="address-level3"
          className={`w-full appearance-none border border-line bg-[#080d18] py-2.5 pl-3 pr-9 text-sm text-ink transition duration-fast ease-standard ${FOCUS_RING}`}
        >
          <option value="">{t('coloniaPlaceholder')}</option>
          {settlements.map((settlement) => (
            <option key={settlement.id} value={settlement.id}>
              {settlement.type === 'Colonia'
                ? settlement.name
                : `${settlement.name} · ${settlement.type}`}
            </option>
          ))}
          <option value={OTHER_OPTION}>{t('coloniaOther')}</option>
        </select>
        {/* `appearance-none` quita la flecha nativa; sin esta, el campo no se
            lee como desplegable. Decorativa: el `<select>` ya se anuncia solo. */}
        <svg
          aria-hidden="true"
          viewBox="0 0 10 6"
          className="pointer-events-none absolute right-3 top-1/2 h-[6px] w-2.5 -translate-y-1/2 fill-none stroke-muted-2 stroke-[1.5]"
        >
          <path d="M1 1l4 4 4-4" />
        </svg>
      </div>
    </div>
  )
}

/**
 * Anillo de foco del sistema de diseño (mismo que SiteHeader/InventoryView).
 * El cambio de borde solo no basta como indicador visible de foco.
 */
const FOCUS_RING =
  'outline-none focus-visible:ring-2 focus-visible:ring-primary/70 focus-visible:border-primary'

interface FieldProps {
  formId: string
  name: string
  label: string
  value: string
  onChange: (next: string) => void
  invalid?: boolean
  autoComplete: string
  type?: 'text' | 'tel'
  inputMode?: 'numeric' | 'tel'
  maxLength?: number
  spellCheck?: boolean
  optionalNote?: string
  /** Marca el campo como resuelto por el CP. Sigue siendo editable. */
  filled?: boolean
  filledNote?: string
  describedBy?: string
  action?: { label: string; onClick: () => void }
}

/** Campo de texto del formulario. Mismo tratamiento que el resto del checkout. */
function Field({
  ref,
  formId,
  name,
  label,
  value,
  onChange,
  invalid = false,
  autoComplete,
  type = 'text',
  inputMode,
  maxLength,
  spellCheck,
  optionalNote,
  filled = false,
  filledNote,
  describedBy,
  action,
}: FieldProps & { ref?: React.Ref<HTMLInputElement> }) {
  const id = `${formId}-${name}`
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <label
          htmlFor={id}
          className="block font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted-2"
        >
          {label}
          {optionalNote && <span className="ml-1.5 normal-case text-faint">{optionalNote}</span>}
          {filled && filledNote && (
            <span className="ml-1.5 normal-case text-cyan">{filledNote}</span>
          )}
        </label>
        {action && (
          <button
            type="button"
            onClick={action.onClick}
            className={`font-mono text-[10px] uppercase tracking-[0.12em] text-muted-2 underline underline-offset-2 transition duration-fast ease-standard hover:text-cyan ${FOCUS_RING}`}
          >
            {action.label}
          </button>
        )}
      </div>
      <input
        ref={ref}
        id={id}
        name={name}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        autoComplete={autoComplete}
        inputMode={inputMode}
        maxLength={maxLength}
        spellCheck={spellCheck}
        className={`w-full border bg-[#080d18] px-3 py-2.5 text-sm text-ink transition duration-fast ease-standard placeholder:text-faint ${FOCUS_RING} ${
          invalid ? 'border-red-500/60' : 'border-line'
        }`}
      />
    </div>
  )
}
