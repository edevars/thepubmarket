import { Spinner } from './Spinner'

interface ConfirmDialogProps {
  open: boolean
  title: string
  body?: string
  confirmLabel: string
  cancelLabel: string
  danger?: boolean
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}

/**
 * Reusable confirm/cancel overlay for destructive actions — first modal
 * primitive in this app (no portal, no dialog library elsewhere in the repo).
 * Self-contained: its own backdrop click stops propagation before cancelling,
 * so it can be nested inside another backdrop-click-to-close surface (e.g. the
 * photo manager) without closing both at once.
 */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel,
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: backdrop click-to-cancel; the Cancel button below is the keyboard/screen-reader path
    // biome-ignore lint/a11y/useKeyWithClickEvents: same — cancelling has a real button, this is a pointer-only convenience
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={(e) => {
        e.stopPropagation()
        onCancel()
      }}
    >
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: onClick here only stops propagation to the backdrop, it performs no action of its own */}
      <div
        role="alertdialog"
        aria-modal="true"
        className="w-full max-w-sm border border-line-soft bg-panel-2 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-display text-base font-bold text-white">{title}</h3>
        {body && <p className="mt-2 text-[13px] text-muted-2">{body}</p>}
        <div className="mt-5 flex justify-end gap-4">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="font-mono text-[12px] text-muted-2 hover:text-ink disabled:opacity-40"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`clip-btn inline-flex items-center gap-2 border px-4 py-2 font-display text-[12px] font-bold uppercase tracking-[0.08em] disabled:opacity-60 ${
              danger
                ? 'border-cond-dmg bg-cond-dmg/14 text-[#ffb4b4] hover:bg-cond-dmg/24'
                : 'border-primary bg-primary/14 text-[#cfe0ff] hover:bg-primary/24'
            }`}
          >
            {busy && <Spinner />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
