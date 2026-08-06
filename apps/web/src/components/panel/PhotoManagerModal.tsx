'use client'

import type { InventoryItem, InventoryPhoto } from '@thepubmarket/shared'
import { MAX_PHOTOS_PER_ITEM } from '@thepubmarket/shared'
import { useTranslations } from 'next-intl'
import { useRef, useState } from 'react'
import { angularButtonClasses } from '@/components/ui/AngularButton'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Spinner } from '@/components/ui/Spinner'
import { deletePhoto, reorderPhotos, uploadPhoto } from '@/lib/client-api'
import { resizeImageForUpload } from '@/lib/image-resize'

interface UploadTask {
  id: string
  file: File
  status: 'resizing' | 'uploading' | 'error'
  /** i18n key under `panel`, set only when status === 'error'. */
  error?: string
}

interface PhotoManagerModalProps {
  item: InventoryItem
  token: string
  onClose: () => void
  onPhotosChange: (photos: InventoryPhoto[]) => void
}

/**
 * Maps API error codes (from `uploadPhoto`'s error union) and this module's
 * own local failure modes (resize/network) to `panel.*` i18n keys.
 */
function errorKey(code: string): string {
  switch (code) {
    case 'photo_too_large':
      return 'photoErrorTooLarge'
    case 'invalid_image':
    case 'empty_body':
      return 'photoErrorInvalid'
    case 'photo_limit_reached':
      return 'photoErrorLimit'
    case 'not_found':
      return 'photoErrorNotFound'
    case 'network_error':
      return 'photoErrorNetwork'
    default:
      return 'photoErrorGeneric'
  }
}

/**
 * Modal for managing a listing's real photos: upload (with client-side
 * resize/re-encode), reorder, delete. Reachable from the inventory view for
 * any existing listing, and from the post-publish success step.
 *
 * Owns its own `photos`/`uploads` state, seeded once from `item.photos`.
 * Every mutation only updates local state after the server confirms it —
 * never optimistic — and reports the result up via `onPhotosChange` so
 * `PanelProvider`'s shared inventory stays in sync.
 */
export function PhotoManagerModal({
  item,
  token,
  onClose,
  onPhotosChange,
}: PhotoManagerModalProps) {
  const t = useTranslations('panel')
  const [photos, setPhotos] = useState<InventoryPhoto[]>(item.photos)
  const [uploads, setUploads] = useState<UploadTask[]>([])
  const [selectionNotice, setSelectionNotice] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<InventoryPhoto | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [reorderingId, setReorderingId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const activeCount = photos.length + uploads.length
  const atCap = activeCount >= MAX_PHOTOS_PER_ITEM
  const remaining = Math.max(0, MAX_PHOTOS_PER_ITEM - activeCount)

  function commitPhotos(next: InventoryPhoto[]) {
    setPhotos(next)
    onPhotosChange(next)
  }

  /** Resize + upload one file, updating its own task entry throughout. Retryable. */
  async function runTask(taskId: string, file: File) {
    setUploads((prev) =>
      prev.map((u) => (u.id === taskId ? { ...u, status: 'resizing', error: undefined } : u)),
    )
    let blob: Blob
    try {
      blob = await resizeImageForUpload(file)
    } catch {
      setUploads((prev) =>
        prev.map((u) =>
          u.id === taskId ? { ...u, status: 'error', error: 'photoErrorInvalid' } : u,
        ),
      )
      return
    }
    setUploads((prev) => prev.map((u) => (u.id === taskId ? { ...u, status: 'uploading' } : u)))
    const result = await uploadPhoto(token, item.id, blob)
    if (result.ok) {
      setUploads((prev) => prev.filter((u) => u.id !== taskId))
      setPhotos((prev) => {
        const next = [...prev, result.photo].sort((a, b) => a.sortOrder - b.sortOrder)
        onPhotosChange(next)
        return next
      })
    } else {
      setUploads((prev) =>
        prev.map((u) =>
          u.id === taskId ? { ...u, status: 'error', error: errorKey(result.error) } : u,
        ),
      )
    }
  }

  // Files are processed serially (not in parallel) to avoid two races: the
  // server's photo-cap check, and stale closures overwriting `photos` if two
  // uploads resolved out of order.
  async function handleFilesSelected(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return
    const all = Array.from(fileList)
    const files = all.slice(0, remaining)
    setSelectionNotice(all.length > files.length ? 'photoErrorLimit' : null)
    for (const file of files) {
      const taskId = crypto.randomUUID()
      setUploads((prev) => [...prev, { id: taskId, file, status: 'resizing' }])
      await runTask(taskId, file)
    }
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function retryUpload(taskId: string) {
    const task = uploads.find((u) => u.id === taskId)
    if (task) runTask(taskId, task.file)
  }

  function cancelUpload(taskId: string) {
    setUploads((prev) => prev.filter((u) => u.id !== taskId))
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    const ok = await deletePhoto(token, item.id, deleteTarget.id)
    setDeleting(false)
    if (ok) {
      commitPhotos(photos.filter((p) => p.id !== deleteTarget.id))
      setDeleteError(null)
    } else {
      setDeleteError('photoErrorGeneric')
    }
    setDeleteTarget(null)
  }

  async function move(photoId: string, direction: -1 | 1) {
    const idx = photos.findIndex((p) => p.id === photoId)
    const swapIdx = idx + direction
    if (idx === -1 || swapIdx < 0 || swapIdx >= photos.length) return
    const next = [...photos]
    ;[next[idx], next[swapIdx]] = [next[swapIdx] as InventoryPhoto, next[idx] as InventoryPhoto]
    setReorderingId(photoId)
    const result = await reorderPhotos(
      token,
      item.id,
      next.map((p) => p.id),
    )
    setReorderingId(null)
    if (result) commitPhotos(result)
  }

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: backdrop click-to-close; the ✕ button below is the keyboard/screen-reader path
    // biome-ignore lint/a11y/useKeyWithClickEvents: same — closing has a real button, this is a pointer-only convenience
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      {/* biome-ignore lint/a11y/noStaticElementInteractions: onClick here only stops propagation to the backdrop, it performs no action of its own */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: same */}
      <div
        className="tpm-scroll flex max-h-[90vh] w-full max-w-[560px] flex-col overflow-y-auto border border-line-soft bg-panel-2"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line-soft px-5 py-4">
          <div className="min-w-0">
            <h2 className="font-display text-lg font-bold text-white">{t('photoManagerTitle')}</h2>
            <div className="mt-0.5 truncate font-mono text-[11px] text-faint">{item.card.name}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('photoClose')}
            className="shrink-0 text-lg text-muted-2 hover:text-ink"
          >
            ✕
          </button>
        </div>

        <div className="flex flex-col gap-4 px-5 py-4">
          {item.quantity > 1 && (
            <p className="border border-line-soft bg-input px-3 py-2 text-[12px] text-muted-2">
              {t('photoQuantityHint')}
            </p>
          )}

          <div className="flex items-center justify-between gap-3">
            <span className="font-mono text-[11px] text-muted">
              {t('photoCount', { count: photos.length, max: MAX_PHOTOS_PER_ITEM })}
            </span>
            <label
              className={
                atCap
                  ? 'clip-btn cursor-not-allowed border border-line bg-[#101a30] px-4 py-2.5 font-display text-[13px] font-bold uppercase tracking-[0.1em] text-faint-2'
                  : `${angularButtonClasses('outline')} cursor-pointer`
              }
            >
              {t('photoAddCta')}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                disabled={atCap}
                onChange={(e) => handleFilesSelected(e.target.files)}
                className="hidden"
              />
            </label>
          </div>
          {selectionNotice && <p className="text-[12px] text-cond-mp">{t(selectionNotice)}</p>}

          {photos.length === 0 && uploads.length === 0 ? (
            <div className="border border-dashed border-line px-4 py-8 text-center">
              <p className="text-[13px] text-muted-2">{t('photoEmptyBody')}</p>
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {photos.map((photo, i) => (
                <li
                  key={photo.id}
                  className="flex items-center gap-3 border border-line bg-input p-2"
                >
                  {/* biome-ignore lint/performance/noImgElement: foto propia servida desde /photos */}
                  <img
                    src={photo.url}
                    alt=""
                    className="h-16 w-12 shrink-0 border border-line-soft object-cover"
                  />
                  <span className="flex-1 font-mono text-[11px] text-faint">#{i + 1}</span>
                  {reorderingId === photo.id && <Spinner />}
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => move(photo.id, -1)}
                      disabled={i === 0 || reorderingId !== null}
                      aria-label={t('photoMoveUp')}
                      className="inline-flex h-7 w-7 items-center justify-center border border-line bg-panel-2 text-[11px] text-muted-2 hover:text-ink disabled:opacity-30"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => move(photo.id, 1)}
                      disabled={i === photos.length - 1 || reorderingId !== null}
                      aria-label={t('photoMoveDown')}
                      className="inline-flex h-7 w-7 items-center justify-center border border-line bg-panel-2 text-[11px] text-muted-2 hover:text-ink disabled:opacity-30"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(photo)}
                      disabled={reorderingId !== null}
                      aria-label={t('photoDeleteConfirmCta')}
                      className="inline-flex h-7 w-7 items-center justify-center border border-line bg-panel-2 text-[11px] text-cond-dmg hover:bg-cond-dmg/14 disabled:opacity-30"
                    >
                      ✕
                    </button>
                  </div>
                </li>
              ))}
              {uploads.map((task) => (
                <li
                  key={task.id}
                  className="flex items-center gap-3 border border-line bg-input p-2"
                >
                  <div className="flex h-16 w-12 shrink-0 items-center justify-center border border-line-soft bg-[#0e1626]">
                    <Spinner />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-mono text-[11px] text-muted-2">
                      {task.file.name}
                    </div>
                    <div
                      className={`font-mono text-[10px] ${task.status === 'error' ? 'text-cond-dmg' : 'text-faint'}`}
                    >
                      {task.status === 'resizing' && t('photoResizing')}
                      {task.status === 'uploading' && t('photoUploading')}
                      {task.status === 'error' && t(task.error ?? 'photoErrorGeneric')}
                    </div>
                  </div>
                  {task.status === 'error' && (
                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        type="button"
                        onClick={() => retryUpload(task.id)}
                        className="font-mono text-[11px] text-primary-hover hover:text-cyan"
                      >
                        {t('photoRetry')}
                      </button>
                      <button
                        type="button"
                        onClick={() => cancelUpload(task.id)}
                        className="font-mono text-[11px] text-faint hover:text-ink"
                      >
                        {t('photoRemoveUpload')}
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
          {deleteError && <p className="text-[12px] text-cond-dmg">{t(deleteError)}</p>}
        </div>
      </div>

      <ConfirmDialog
        open={deleteTarget !== null}
        title={t('photoDeleteConfirmTitle')}
        body={t('photoDeleteConfirmBody')}
        confirmLabel={t('photoDeleteConfirmCta')}
        cancelLabel={t('photoDeleteCancel')}
        danger
        busy={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}
