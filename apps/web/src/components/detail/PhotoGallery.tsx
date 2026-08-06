'use client'

import type { InventoryItem } from '@thepubmarket/shared'
import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'
import { ConditionBadge } from '@/components/ui/ConditionBadge'
import { FoilTag } from '@/components/ui/FoilTag'

interface GalleryImage {
  url: string
  kind: 'reference' | 'seller'
  /** 1-based position among seller photos only; unused for the reference image. */
  photoNumber: number
}

/**
 * `<img>` with an error fallback that keeps the exact same box (same
 * className, so same aspect ratio / dimensions) instead of collapsing —
 * a broken seller-supplied URL must not shift the layout around it.
 */
function ImageWithFallback({
  url,
  alt,
  className,
}: {
  url: string
  alt: string
  className: string
}) {
  const t = useTranslations('detail')
  const [broken, setBroken] = useState(false)

  if (broken) {
    return (
      <div className={`${className} flex items-center justify-center bg-[#0e1626]`}>
        <span className="px-2 text-center font-mono text-[9px] tracking-[0.1em] text-faint-2">
          {t('galleryImageError')}
        </span>
      </div>
    )
  }

  return (
    // biome-ignore lint/performance/noImgElement: fotos del vendedor y referencia de Scryfall, no assets de next/image
    <img src={url} alt={alt} loading="lazy" onError={() => setBroken(true)} className={className} />
  )
}

/**
 * Real photo gallery for the item detail page (TASK-026 shipped the upload
 * side; this is the payoff). Only mounted when `item.photos.length > 0` —
 * with zero seller photos `CardDetailView` renders its original markup
 * unchanged instead of this component.
 *
 * The Scryfall reference image and the seller's real photos live in one
 * swappable array so the thumbnail strip / lightbox logic doesn't special-case
 * either — but the active image always carries a visible tag saying which one
 * it is, so a buyer can never mistake the canonical art for the actual card.
 */
export function PhotoGallery({ item }: { item: InventoryItem }) {
  const t = useTranslations('detail')

  const images: GalleryImage[] = [
    ...(item.card.imageUrl
      ? [{ url: item.card.imageUrl, kind: 'reference' as const, photoNumber: 0 }]
      : []),
    ...item.photos.map((photo, i) => ({
      url: photo.url,
      kind: 'seller' as const,
      photoNumber: i + 1,
    })),
  ]

  const [activeIndex, setActiveIndex] = useState(0)
  const [zoomOpen, setZoomOpen] = useState(false)
  const active = images[activeIndex] ?? images[0]

  // Escape closes the lightbox; only listens while it's actually open.
  useEffect(() => {
    if (!zoomOpen) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setZoomOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [zoomOpen])

  if (!active) return null

  return (
    <div>
      <div className="relative mx-auto w-full max-w-[400px] border border-line">
        <button
          type="button"
          onClick={() => setZoomOpen(true)}
          aria-label={t('galleryZoomAria')}
          className="block w-full cursor-zoom-in"
        >
          <ImageWithFallback
            url={active.url}
            alt={item.card.name}
            className="aspect-[5/7] w-full object-cover"
          />
        </button>
        <ConditionBadge
          condition={item.condition}
          size="md"
          className="absolute left-3 top-3 bg-[#060911]/85"
        />
        {item.finish === 'foil' && (
          <span className="absolute right-3 top-3">
            <FoilTag size="md" />
          </span>
        )}
        <span
          className={`absolute bottom-3 left-3 border px-2 py-1 font-mono text-[9px] uppercase tracking-[0.1em] ${
            active.kind === 'seller'
              ? 'border-cond-nm/50 bg-[#060911]/85 text-cond-nm'
              : 'border-line-strong bg-[#060911]/85 text-faint'
          }`}
        >
          {active.kind === 'seller' ? t('gallerySellerPhotoLabel') : t('galleryReferenceLabel')}
        </span>
      </div>

      <div className="mt-3.5 flex justify-center gap-2">
        {images.map((img, i) => (
          <button
            key={img.url}
            type="button"
            onClick={() => setActiveIndex(i)}
            aria-current={i === activeIndex}
            aria-label={
              img.kind === 'reference'
                ? t('galleryThumbReferenceAria')
                : t('galleryThumbPhotoAria', { n: img.photoNumber })
            }
            className={`aspect-[5/7] w-[50px] overflow-hidden border ${
              i === activeIndex ? 'border-primary' : 'border-line'
            }`}
          >
            <ImageWithFallback url={img.url} alt="" className="h-full w-full object-cover" />
          </button>
        ))}
      </div>

      {item.quantity > 1 && (
        <p className="mt-3 text-center text-[11.5px] text-muted-2">{t('galleryQuantityHint')}</p>
      )}

      {zoomOpen && (
        // biome-ignore lint/a11y/noStaticElementInteractions: backdrop click-to-close; the ✕ button below is the keyboard/screen-reader path, Escape is handled globally
        // biome-ignore lint/a11y/useKeyWithClickEvents: same — closing has a real button and a global Escape listener, this is a pointer-only convenience
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
          onClick={() => setZoomOpen(false)}
        >
          <button
            type="button"
            onClick={() => setZoomOpen(false)}
            aria-label={t('galleryCloseAria')}
            className="absolute right-5 top-5 text-2xl text-white/70 hover:text-white"
          >
            ✕
          </button>
          {/* biome-ignore lint/a11y/noStaticElementInteractions: onClick here only stops propagation to the backdrop, it performs no action of its own */}
          {/* biome-ignore lint/a11y/useKeyWithClickEvents: same */}
          <div className="max-h-[90vh] max-w-[90vw]" onClick={(e) => e.stopPropagation()}>
            <ImageWithFallback
              url={active.url}
              alt={item.card.name}
              className="max-h-[90vh] max-w-[90vw] object-contain"
            />
          </div>
        </div>
      )}
    </div>
  )
}
