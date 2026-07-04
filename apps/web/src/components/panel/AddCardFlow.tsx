'use client'

import type { CardSnapshot, Condition, Finish, InventoryItem } from '@thepubmarket/shared'
import { CONDITIONS } from '@thepubmarket/shared'
import { useLocale, useTranslations } from 'next-intl'
import { useEffect, useRef, useState } from 'react'
import { CardArt } from '@/components/catalog/CardArt'
import { angularButtonClasses } from '@/components/ui/AngularButton'
import { ConditionBadge } from '@/components/ui/ConditionBadge'
import { FoilTag } from '@/components/ui/FoilTag'
import { LangTag } from '@/components/ui/LangTag'
import { Link } from '@/i18n/navigation'
import { artTintForId, CONDITION_HEX, conditionKey, formatMoneyCents } from '@/lib/catalog/display'
import { createListing, searchPrintings } from '@/lib/client-api'
import { usePanel } from './PanelProvider'

type Step = 'search' | 'detail' | 'success'

const OFFER_LANGS = ['es', 'en', 'ja'] as const

const segCls = (active: boolean) =>
  `border px-3.5 py-2 font-display text-[13px] font-semibold tracking-[0.04em] transition ${
    active
      ? 'border-primary bg-primary/14 text-[#cfe0ff]'
      : 'border-line bg-input text-muted hover:border-line-strong'
  }`

/** Flujo de alta: buscar impresión → definir oferta → publicada. */
export function AddCardFlow() {
  const t = useTranslations('panel')
  const locale = useLocale()
  const { token, me, addItem } = usePanel()

  const [step, setStep] = useState<Step>('search')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<CardSnapshot[]>([])
  const [searching, setSearching] = useState(false)
  const [sel, setSel] = useState<CardSnapshot | null>(null)

  const [cond, setCond] = useState<Condition>('NM')
  const [finish, setFinish] = useState<Finish>('nonfoil')
  const [lang, setLang] = useState<string>('es')
  const [priceInput, setPriceInput] = useState('')
  const [qty, setQty] = useState(1)
  const [publishing, setPublishing] = useState(false)
  const [publishErr, setPublishErr] = useState(false)
  const [published, setPublished] = useState<InventoryItem | null>(null)

  // Búsqueda con debounce contra /seller/scryfall/search.
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const q = query.trim()
    if (q.length < 3) {
      setResults([])
      setSearching(false)
      return
    }
    setSearching(true)
    debounceRef.current = setTimeout(() => {
      searchPrintings(token, q)
        .then(setResults)
        .finally(() => setSearching(false))
    }, 350)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query, token])

  function selectPrinting(card: CardSnapshot) {
    setSel(card)
    setCond('NM')
    setFinish(card.finishes.includes('nonfoil') || card.finishes.length === 0 ? 'nonfoil' : 'foil')
    setLang('es')
    setPriceInput('')
    setQty(1)
    setPublishErr(false)
    setStep('detail')
  }

  const pricePesos = Number.parseInt(priceInput, 10) || 0
  const canPublish = pricePesos > 0 && !publishing
  const netCents = Math.round(pricePesos * 100 * (1 - me.feeBps / 10000))

  async function publish() {
    if (!sel || !canPublish) return
    setPublishing(true)
    setPublishErr(false)
    const result = await createListing(token, {
      scryfallId: sel.scryfallId,
      condition: cond,
      finish,
      language: lang,
      priceCents: pricePesos * 100,
      quantity: qty,
    })
    setPublishing(false)
    if (!result.ok) {
      setPublishErr(true)
      return
    }
    addItem(result.item)
    setPublished(result.item)
    setStep('success')
  }

  const stepIndex = step === 'search' ? 0 : step === 'detail' ? 1 : 2
  const steps = [t('step1'), t('step2'), t('step3')]

  return (
    <div className="flex flex-col gap-6">
      {/* Stepper */}
      <div className="flex flex-wrap items-center gap-3">
        {steps.map((label, i) => {
          const done = i < stepIndex
          const current = i === stepIndex
          return (
            <div key={label} className="flex items-center gap-3">
              <span
                className={`flex h-6 w-6 items-center justify-center font-mono text-[12px] font-semibold [clip-path:polygon(5px_0,100%_0,100%_calc(100%-5px),calc(100%-5px)_100%,0_100%,0_5px)] ${
                  current
                    ? 'bg-primary text-[#06121f]'
                    : done
                      ? 'bg-cyan text-[#06121f]'
                      : 'border border-line-strong text-faint'
                }`}
              >
                {done ? '✓' : i + 1}
              </span>
              <span
                className={`font-display text-[13.5px] font-semibold ${current ? 'text-white' : done ? 'text-muted' : 'text-faint-2'}`}
              >
                {label}
              </span>
              {i < 2 && <span className="h-px w-8 bg-line" />}
            </div>
          )
        })}
      </div>

      {step === 'search' && (
        <div className="flex flex-col gap-4">
          <div className="border border-line-soft bg-panel-2 p-4">
            <div className="mb-2 font-mono text-[9px] uppercase tracking-[0.2em] text-cyan">
              {t('scryfallLabel')}
            </div>
            <div className="flex items-center gap-2 border border-line bg-input px-3.5 py-3">
              <span className="h-3.5 w-3.5 shrink-0 rounded-full border-[1.5px] border-faint-2" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('addSearchPlaceholder')}
                aria-label={t('addSearchPlaceholder')}
                className="min-w-0 flex-1 bg-transparent text-[14px] text-ink outline-none"
              />
            </div>
            <div className="mt-2 font-mono text-[10px] tracking-[0.04em] text-faint">
              {searching
                ? t('printingsSearching')
                : query.trim().length >= 3
                  ? t('printingsFound', { count: results.length })
                  : t('printingsHint')}
            </div>
          </div>

          {query.trim().length >= 3 && !searching && results.length === 0 && (
            <div className="border border-dashed border-line bg-panel-2 px-6 py-10 text-center text-[13px] text-muted-2">
              {t('printingsNoMatch', { q: query.trim() })}
            </div>
          )}

          <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(160px,1fr))]">
            {results.map((card) => (
              <button
                key={card.scryfallId}
                type="button"
                onClick={() => selectPrinting(card)}
                className="clip-card group flex flex-col border border-line bg-panel text-left transition hover:-translate-y-0.5 hover:border-primary"
              >
                <CardArt
                  name={card.name}
                  tint={artTintForId(card.scryfallId)}
                  imageUrl={card.imageUrl}
                />
                <div className="flex flex-col gap-1 px-3 pb-3 pt-2">
                  <span className="truncate font-display text-[13.5px] font-semibold text-ink">
                    {card.name}
                  </span>
                  <span className="truncate text-[11px] text-muted-2">{card.setName}</span>
                  <span className="font-mono text-[9.5px] tracking-[0.05em] text-faint">
                    {card.setCode.toUpperCase()} · #{card.collectorNumber} · {card.rarity}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {step === 'detail' && sel && (
        <div className="flex flex-col gap-4">
          <button
            type="button"
            onClick={() => setStep('search')}
            className="self-start font-mono text-[11px] text-primary-hover hover:text-cyan"
          >
            {t('backToResults')}
          </button>

          <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
            {/* Formulario de oferta */}
            <div className="flex flex-col gap-5 border border-line-soft bg-panel-2 p-5">
              <div>
                <h2 className="font-display text-2xl font-bold tracking-[0.01em] text-white">
                  {sel.name}
                </h2>
                <div className="mt-1 font-mono text-[10.5px] tracking-[0.04em] text-faint">
                  {sel.setName} · {sel.setCode.toUpperCase()} #{sel.collectorNumber} · {sel.rarity}
                </div>
              </div>

              {/* Condición */}
              <div>
                <div className="mb-2 font-mono text-[9px] uppercase tracking-[0.16em] text-faint">
                  {t('offerCondition')}
                </div>
                <div className="flex flex-wrap gap-2">
                  {CONDITIONS.map((code) => {
                    const active = cond === code
                    const color = CONDITION_HEX[code]
                    return (
                      <button
                        key={code}
                        type="button"
                        onClick={() => setCond(code)}
                        className="flex min-w-[62px] flex-col items-center border px-2.5 py-2 transition"
                        style={{
                          borderColor: active ? color : '#1e2a44',
                          background: active ? 'rgba(59,123,255,.06)' : '#0a1120',
                          color: active ? color : '#7a88a8',
                          boxShadow: active ? `0 0 14px ${color}33` : 'none',
                        }}
                      >
                        <span className="font-mono text-[12px] font-semibold">{code}</span>
                        <span className="mt-0.5 text-[9.5px]">
                          <CondName code={code} />
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="flex flex-wrap gap-6">
                {/* Acabado */}
                <div>
                  <div className="mb-2 font-mono text-[9px] uppercase tracking-[0.16em] text-faint">
                    {t('offerFinish')}
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setFinish('nonfoil')}
                      className={segCls(finish === 'nonfoil')}
                    >
                      {t('finishNormal')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setFinish('foil')}
                      className={segCls(finish === 'foil')}
                    >
                      {t('finishFoil')}
                    </button>
                  </div>
                </div>
                {/* Idioma */}
                <div>
                  <div className="mb-2 font-mono text-[9px] uppercase tracking-[0.16em] text-faint">
                    {t('offerLang')}
                  </div>
                  <div className="flex gap-2">
                    {OFFER_LANGS.map((code) => (
                      <button
                        key={code}
                        type="button"
                        onClick={() => setLang(code)}
                        className={segCls(lang === code)}
                      >
                        {code === 'ja' ? 'JP' : code.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-end gap-6">
                {/* Precio */}
                <div>
                  <div className="mb-2 font-mono text-[9px] uppercase tracking-[0.16em] text-faint">
                    {t('offerPrice')}
                  </div>
                  <div className="flex items-center gap-2 border border-line bg-input px-3 py-2.5">
                    <span className="font-mono text-[14px] text-faint">$</span>
                    <input
                      value={priceInput}
                      inputMode="numeric"
                      onChange={(e) => setPriceInput(e.target.value.replace(/[^0-9]/g, ''))}
                      placeholder="0"
                      aria-label={t('offerPrice')}
                      className="w-28 bg-transparent font-mono text-[18px] font-semibold text-white outline-none"
                    />
                    <span className="font-mono text-[10px] text-faint">MXN</span>
                  </div>
                  {pricePesos > 0 && (
                    <div className="mt-1.5 text-[11px] text-muted-2">
                      {t('receiveNote', {
                        net: formatMoneyCents(netCents, locale),
                        pct: (me.feeBps / 100).toLocaleString(locale),
                      })}
                    </div>
                  )}
                </div>
                {/* Cantidad */}
                <div>
                  <div className="mb-2 font-mono text-[9px] uppercase tracking-[0.16em] text-faint">
                    {t('offerQty')}
                  </div>
                  <div className="inline-flex items-center border border-line bg-input">
                    <button
                      type="button"
                      onClick={() => setQty((n) => Math.max(1, n - 1))}
                      className="px-3 py-2 text-[15px] text-muted-2 hover:text-ink"
                      aria-label="−1"
                    >
                      −
                    </button>
                    <span className="min-w-[36px] text-center font-mono text-[15px] font-semibold text-white">
                      {qty}
                    </span>
                    <button
                      type="button"
                      onClick={() => setQty((n) => n + 1)}
                      className="px-3 py-2 text-[15px] text-muted-2 hover:text-ink"
                      aria-label="+1"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3.5 border-t border-line-soft pt-4">
                <button
                  type="button"
                  onClick={publish}
                  disabled={!canPublish}
                  className={
                    canPublish
                      ? angularButtonClasses('primary')
                      : 'clip-btn cursor-not-allowed border border-line bg-[#101a30] px-4 py-2.5 font-display text-[13px] font-bold uppercase tracking-[0.1em] text-faint-2'
                  }
                >
                  {publishing ? t('publishing') : t('publish')}
                </button>
                <span className="text-[11.5px] text-muted-2">
                  {publishErr
                    ? t('publishError')
                    : pricePesos > 0
                      ? t('publishHintOk')
                      : t('publishHintNoPrice')}
                </span>
              </div>
            </div>

            {/* Preview del catálogo público */}
            <div className="flex flex-col gap-3">
              <div className="font-mono text-[9px] uppercase tracking-[0.2em] text-faint">
                {t('previewTitle')}
              </div>
              <div className="clip-card max-w-[240px] border border-line bg-panel">
                <div className="relative">
                  <CardArt
                    name={sel.name}
                    tint={artTintForId(sel.scryfallId)}
                    imageUrl={sel.imageUrl}
                  />
                  <ConditionBadge
                    condition={cond}
                    className="absolute left-2 top-2 bg-[#060911]/82 backdrop-blur-sm"
                  />
                  {finish === 'foil' && (
                    <span className="absolute right-2 top-2">
                      <FoilTag />
                    </span>
                  )}
                </div>
                <div className="flex flex-col gap-1.5 px-3 pb-3 pt-2.5">
                  <div className="truncate font-display text-[15.5px] font-semibold text-ink">
                    {sel.name}
                  </div>
                  <div className="truncate font-mono text-[10px] tracking-[0.04em] text-faint">
                    {sel.setCode.toUpperCase()} · #{sel.collectorNumber}
                  </div>
                  <div className="mt-px flex items-end justify-between gap-2">
                    <div className="flex items-baseline gap-1">
                      <span className="text-base font-bold text-white">
                        {pricePesos > 0 ? formatMoneyCents(pricePesos * 100, locale) : '$—'}
                      </span>
                      <span className="text-[9px] font-medium text-faint">MXN</span>
                    </div>
                    <LangTag lang={lang} />
                  </div>
                </div>
              </div>
              <div className="max-w-[240px] border border-line-soft bg-panel-2 p-3">
                <div className="mb-2 font-mono text-[8.5px] uppercase tracking-[0.16em] text-faint-2">
                  {t('previewSummary')}
                </div>
                <dl className="flex flex-col gap-1 text-[11.5px]">
                  <div className="flex justify-between">
                    <dt className="text-faint">{t('offerCondition')}</dt>
                    <dd className="font-mono text-ink-2">{cond}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-faint">{t('offerFinish')}</dt>
                    <dd className="font-mono text-ink-2">
                      {finish === 'foil' ? t('finishFoil') : t('finishNormal')}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-faint">{t('offerQty')}</dt>
                    <dd className="font-mono text-ink-2">{qty}</dd>
                  </div>
                </dl>
              </div>
            </div>
          </div>
        </div>
      )}

      {step === 'success' && published && (
        <div className="border border-line-soft bg-panel-2 px-6 py-16 text-center">
          <span className="mx-auto mb-5 flex h-12 w-12 items-center justify-center border border-cond-nm/50 font-display text-xl font-bold text-cond-nm [clip-path:polygon(8px_0,100%_0,100%_calc(100%-8px),calc(100%-8px)_100%,0_100%,0_8px)]">
            ✓
          </span>
          <h2 className="mb-2 font-display text-2xl font-bold tracking-[0.02em] text-white">
            {t('successTitle')}
          </h2>
          <p className="mx-auto mb-7 max-w-[440px] font-mono text-[12px] text-muted">
            {published.card.name} · {published.condition}
            {published.finish === 'foil' ? ` · ${t('finishFoil')}` : ''} ·{' '}
            {formatMoneyCents(published.priceCents, locale)} MXN ·{' '}
            {t('successUnits', { count: published.quantity })}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => {
                setStep('search')
                setSel(null)
                setPublished(null)
                setQuery('')
                setResults([])
              }}
              className={angularButtonClasses('primary')}
            >
              {t('addAnother')}
            </button>
            <Link href="/panel/inventario" className={angularButtonClasses('outline')}>
              {t('viewInventory')}
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}

/** Nombre largo localizado de la condición (namespace `condition`). */
function CondName({ code }: { code: Condition }) {
  const t = useTranslations('condition')
  return <>{t(conditionKey(code))}</>
}
