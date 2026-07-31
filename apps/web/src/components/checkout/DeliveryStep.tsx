'use client'

/**
 * Delivery step — sits between the cart and Stripe.
 *
 * Nothing reaches payment without passing through here, because an order with
 * no destination is one the store cannot fulfil. `method` starts as `null` on
 * purpose: there is no sensible default between "ship it to me" and "I'll pick
 * it up", and defaulting to either would quietly decide for the buyer.
 *
 * The amounts shown here are a preview. `POST /checkout` recomputes the
 * shipping fee from the chosen method server-side and never reads an amount
 * from this form.
 */

import {
  type DeliverySelection,
  PICKUP_ETA_DAYS,
  type PickupPoint,
  SHIPPING_FLAT_CENTS,
} from '@thepubmarket/shared'
import { useLocale, useTranslations } from 'next-intl'
import { useEffect, useId, useState } from 'react'
import { Spinner } from '@/components/ui/Spinner'
import { formatMoneyCents } from '@/lib/catalog/display'
import { fetchPickupPoints } from '@/lib/client-api'

type Method = 'shipping' | 'pickup'

interface DeliveryStepProps {
  /** Selling store — one order is always one seller. */
  sellerId: string
  subtotalCents: number
  /** Confirmed choice, ready for `POST /checkout`. */
  onConfirm: (selection: DeliverySelection) => void
  onBack: () => void
  busy?: boolean
  /** Rendered above the actions; comes from the checkout attempt. */
  errorMessage?: string | null
}

const EMPTY_ADDRESS = {
  recipient: '',
  phone: '',
  line1: '',
  line2: '',
  neighborhood: '',
  city: '',
  state: '',
  postalCode: '',
}

type AddressForm = typeof EMPTY_ADDRESS

/** Fields the buyer must fill for a courier to find them. */
const REQUIRED_FIELDS = ['recipient', 'phone', 'line1', 'city', 'state', 'postalCode'] as const

export function DeliveryStep({
  sellerId,
  subtotalCents,
  onConfirm,
  onBack,
  busy = false,
  errorMessage = null,
}: DeliveryStepProps) {
  const t = useTranslations('delivery')
  const locale = useLocale()
  const formId = useId()

  const [method, setMethod] = useState<Method | null>(null)
  const [address, setAddress] = useState<AddressForm>(EMPTY_ADDRESS)
  const [pickupPoints, setPickupPoints] = useState<PickupPoint[] | null>(null)
  const [pickupId, setPickupId] = useState<string | null>(null)
  const [showErrors, setShowErrors] = useState(false)

  // Loaded once for the whole step: the buyer toggles between methods freely
  // and re-fetching on every toggle would flash an empty list each time.
  useEffect(() => {
    let cancelled = false
    fetchPickupPoints(sellerId)
      .then((items) => {
        if (cancelled) return
        setPickupPoints(items)
        // Pre-select the selling store: it is the only one with no transfer
        // wait, and it is first in the list the API returns.
        setPickupId(items[0]?.id ?? null)
      })
      .catch(() => {
        // An unreachable lookup must not block the purchase — shipping still
        // works, so degrade to "no pickup available" instead of erroring out.
        if (!cancelled) setPickupPoints([])
      })
    return () => {
      cancelled = true
    }
  }, [sellerId])

  const shippingCents = method === 'shipping' ? SHIPPING_FLAT_CENTS : 0
  const totalCents = subtotalCents + shippingCents
  const missing = REQUIRED_FIELDS.filter((f) => address[f].trim() === '')
  const postalCodeInvalid = address.postalCode.trim() !== '' && !/^\d{5}$/.test(address.postalCode)

  function confirm() {
    if (method === 'shipping') {
      if (missing.length > 0 || postalCodeInvalid) {
        setShowErrors(true)
        return
      }
      onConfirm({
        method: 'shipping',
        address: {
          recipient: address.recipient.trim(),
          phone: address.phone.trim(),
          line1: address.line1.trim(),
          line2: address.line2.trim() || null,
          neighborhood: address.neighborhood.trim() || null,
          city: address.city.trim(),
          state: address.state.trim(),
          postalCode: address.postalCode.trim(),
          country: 'MX',
        },
      })
      return
    }
    if (method === 'pickup' && pickupId) onConfirm({ method: 'pickup', pickupSellerId: pickupId })
  }

  const canConfirm = method === 'shipping' || (method === 'pickup' && !!pickupId)

  return (
    <main className="mx-auto w-full max-w-[1180px] px-7 pb-10 pt-8">
      <div className="mb-[22px]">
        <div className="mb-[7px] font-mono text-[10px] uppercase tracking-[0.2em] text-cyan">
          {t('eyebrow')}
        </div>
        <h1 className="font-display text-3xl font-bold tracking-[0.02em] text-white">
          {t('title')}
        </h1>
        <p className="mt-2 max-w-[560px] text-[13.5px] leading-relaxed text-muted">{t('intro')}</p>
      </div>

      <div className="grid grid-cols-1 gap-[18px] md:grid-cols-[1fr_320px] md:items-start md:gap-6">
        <div className="flex flex-col gap-3">
          <MethodCard
            selected={method === 'shipping'}
            onSelect={() => setMethod('shipping')}
            title={t('shippingTitle')}
            body={t('shippingBody')}
            badge={formatMoneyCents(SHIPPING_FLAT_CENTS, locale)}
            name={`${formId}-method`}
          />

          {method === 'shipping' && (
            <AddressForm
              value={address}
              onChange={setAddress}
              showErrors={showErrors}
              missing={missing}
              postalCodeInvalid={postalCodeInvalid}
              formId={formId}
            />
          )}

          <MethodCard
            selected={method === 'pickup'}
            onSelect={() => setMethod('pickup')}
            title={t('pickupTitle')}
            body={t('pickupBody', { days: PICKUP_ETA_DAYS })}
            badge={t('free')}
            name={`${formId}-method`}
            disabled={pickupPoints?.length === 0}
            disabledNote={pickupPoints?.length === 0 ? t('pickupUnavailable') : undefined}
          />

          {method === 'pickup' && (
            <PickupPicker
              points={pickupPoints}
              selectedId={pickupId}
              onSelect={setPickupId}
              name={`${formId}-pickup`}
            />
          )}
        </div>

        <aside className="sticky top-20 flex flex-col gap-3">
          <div className="clip-tile relative overflow-hidden border border-line bg-panel-2 p-[22px]">
            <div className="mb-4 font-display text-base font-bold uppercase tracking-[0.08em] text-white">
              {t('summary')}
            </div>
            <Row label={t('subtotal')} value={formatMoneyCents(subtotalCents, locale)} />
            <Row
              label={t('shippingLine')}
              value={
                method === null
                  ? '—'
                  : shippingCents === 0
                    ? t('free')
                    : formatMoneyCents(shippingCents, locale)
              }
            />
            <div className="my-3.5 h-px bg-line-soft" />
            <div className="mb-[18px] flex items-baseline justify-between">
              <span className="font-display text-base font-bold uppercase tracking-[0.04em] text-white">
                {t('total')}
              </span>
              <div className="flex items-baseline gap-1.5">
                <span className="text-[26px] font-bold text-white">
                  {formatMoneyCents(totalCents, locale)}
                </span>
                <span className="text-xs font-medium text-muted-2">MXN</span>
              </div>
            </div>

            {errorMessage && (
              <p className="mb-3 border border-red-500/40 bg-red-500/10 px-3 py-2 text-[12.5px] text-red-400">
                {errorMessage}
              </p>
            )}

            <button
              type="button"
              onClick={confirm}
              disabled={busy || !canConfirm}
              className="clip-btn-lg glow-primary flex w-full items-center justify-center gap-2 bg-primary px-4 py-[15px] font-display text-base font-bold uppercase tracking-[0.12em] text-[#06121f] transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy && <Spinner />}
              {busy ? t('redirecting') : t('continueToPay')}
            </button>
            {method === null && (
              <p className="mt-2.5 text-center text-[11.5px] text-muted-2">{t('chooseFirst')}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onBack}
            className="border border-line px-4 py-2.5 text-center font-display text-[13px] font-semibold uppercase tracking-[0.08em] text-muted hover:border-line-strong hover:text-ink"
          >
            {t('back')}
          </button>
        </aside>
      </div>
    </main>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="mb-2.5 flex items-baseline justify-between gap-3">
      <span className="text-[13.5px] text-muted">{label}</span>
      <span className="text-sm text-ink">{value}</span>
    </div>
  )
}

interface MethodCardProps {
  selected: boolean
  onSelect: () => void
  title: string
  body: string
  badge: string
  name: string
  disabled?: boolean
  disabledNote?: string
}

/** One of the two delivery options, as a real radio so keyboard nav works. */
function MethodCard({
  selected,
  onSelect,
  title,
  body,
  badge,
  name,
  disabled = false,
  disabledNote,
}: MethodCardProps) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-3.5 border p-[18px] transition ${
        disabled
          ? 'cursor-not-allowed border-line-soft bg-panel-2/40 opacity-60'
          : selected
            ? 'border-primary bg-panel-2 shadow-[0_0_0_1px_rgba(59,123,255,0.35)]'
            : 'border-line bg-panel-2 hover:border-line-strong'
      }`}
    >
      <input
        type="radio"
        name={name}
        checked={selected}
        onChange={onSelect}
        disabled={disabled}
        className="mt-1 h-4 w-4 shrink-0 accent-primary"
      />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="font-display text-[15px] font-bold uppercase tracking-[0.05em] text-white">
            {title}
          </span>
          <span className="font-mono text-[12px] text-cyan">{badge}</span>
        </span>
        <span className="mt-1.5 block text-[13px] leading-relaxed text-muted">{body}</span>
        {disabledNote && (
          <span className="mt-1.5 block text-[12px] text-muted-2">{disabledNote}</span>
        )}
      </span>
    </label>
  )
}

interface AddressFormProps {
  value: AddressForm
  onChange: (next: AddressForm) => void
  showErrors: boolean
  missing: readonly string[]
  postalCodeInvalid: boolean
  formId: string
}

function AddressForm({
  value,
  onChange,
  showErrors,
  missing,
  postalCodeInvalid,
  formId,
}: AddressFormProps) {
  const t = useTranslations('delivery')

  const field = (key: keyof AddressForm, opts?: { optional?: boolean; wide?: boolean }) => {
    const invalid =
      showErrors &&
      ((missing as readonly string[]).includes(key) || (key === 'postalCode' && postalCodeInvalid))
    return (
      <div className={opts?.wide ? 'sm:col-span-2' : ''}>
        <label
          htmlFor={`${formId}-${key}`}
          className="mb-1.5 block font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted-2"
        >
          {t(`field.${key}`)}
          {opts?.optional && <span className="ml-1.5 normal-case text-faint">{t('optional')}</span>}
        </label>
        <input
          id={`${formId}-${key}`}
          value={value[key]}
          onChange={(e) => onChange({ ...value, [key]: e.target.value })}
          aria-invalid={invalid || undefined}
          autoComplete={AUTOCOMPLETE[key]}
          inputMode={key === 'postalCode' || key === 'phone' ? 'numeric' : undefined}
          className={`w-full border bg-[#080d18] px-3 py-2.5 text-sm text-ink outline-none transition placeholder:text-faint focus:border-primary ${
            invalid ? 'border-red-500/60' : 'border-line'
          }`}
        />
      </div>
    )
  }

  return (
    <div className="border border-line bg-panel-2 p-[18px]">
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
        {field('recipient', { wide: true })}
        {field('phone')}
        {field('postalCode')}
        {field('line1', { wide: true })}
        {field('line2', { optional: true, wide: true })}
        {field('neighborhood', { optional: true })}
        {field('city')}
        {field('state', { wide: true })}
      </div>
      {showErrors && (missing.length > 0 || postalCodeInvalid) && (
        <p className="mt-3.5 text-[12.5px] text-red-400">
          {postalCodeInvalid && missing.length === 0 ? t('errorPostalCode') : t('errorIncomplete')}
        </p>
      )}
    </div>
  )
}

/** Browser autofill hints — a delivery address is exactly what these are for. */
const AUTOCOMPLETE: Record<keyof AddressForm, string> = {
  recipient: 'name',
  phone: 'tel',
  line1: 'address-line1',
  line2: 'address-line2',
  neighborhood: 'address-level3',
  city: 'address-level2',
  state: 'address-level1',
  postalCode: 'postal-code',
}

interface PickupPickerProps {
  /** `null` while loading; empty array means no eligible store. */
  points: PickupPoint[] | null
  selectedId: string | null
  onSelect: (id: string) => void
  name: string
}

function PickupPicker({ points, selectedId, onSelect, name }: PickupPickerProps) {
  const t = useTranslations('delivery')

  if (points === null) {
    return (
      <div className="flex items-center gap-2.5 border border-line bg-panel-2 px-[18px] py-5 text-[13px] text-muted">
        <Spinner />
        {t('loadingStores')}
      </div>
    )
  }

  if (points.length === 0) {
    return (
      <p className="border border-line bg-panel-2 px-[18px] py-5 text-[13px] text-muted">
        {t('pickupUnavailable')}
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-2.5 border border-line bg-panel-2 p-[18px]">
      <div className="mb-1 font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted-2">
        {t('chooseStore')}
      </div>
      {points.map((point) => (
        <label
          key={point.id}
          className={`flex cursor-pointer items-start gap-3 border p-3.5 transition ${
            selectedId === point.id
              ? 'border-primary shadow-[0_0_0_1px_rgba(59,123,255,0.3)]'
              : 'border-line-soft hover:border-line-strong'
          }`}
        >
          <input
            type="radio"
            name={name}
            checked={selectedId === point.id}
            onChange={() => onSelect(point.id)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
          />
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-baseline gap-2">
              <span className="text-sm font-semibold text-white">{point.name}</span>
              {point.isSellingStore && (
                <span className="border border-cond-nm/50 px-1.5 py-px font-mono text-[9.5px] uppercase tracking-[0.12em] text-cond-nm">
                  {t('sellingStore')}
                </span>
              )}
            </span>
            <span className="mt-1 block text-[12.5px] leading-relaxed text-muted">
              {[point.address, point.neighborhood, point.city].filter(Boolean).join(' · ')}
            </span>
            <span className="mt-1 block text-[12px] text-muted-2">
              {point.isSellingStore
                ? t('etaSellingStore')
                : t('etaTransfer', { days: PICKUP_ETA_DAYS })}
            </span>
          </span>
        </label>
      ))}
    </div>
  )
}
