import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react'
import { useApp } from '@renderer/store/app-store'

export function Toasts() {
  const toasts = useApp((s) => s.toasts)
  const dismiss = useApp((s) => s.dismissToast)
  return (
    <div className="pointer-events-none fixed right-5 bottom-5 z-[60] flex w-[360px] flex-col gap-2">
      {toasts.map((t) => {
        const Icon = t.kind === 'success' ? CheckCircle2 : t.kind === 'error' ? AlertCircle : Info
        const color = t.kind === 'success' ? 'text-success' : t.kind === 'error' ? 'text-danger' : 'text-accent'
        return (
          <div key={t.id} role="status" className="animate-fade-in pointer-events-auto flex gap-3 rounded-xl border border-line bg-surface p-3 shadow-pop">
            <Icon className={`mt-0.5 size-4 shrink-0 ${color}`} />
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-semibold">{t.title}</div>
              {t.message && <div className="mt-0.5 text-[12.5px] break-words text-ink-2">{t.message}</div>}
            </div>
            <button aria-label="Dismiss" onClick={() => dismiss(t.id)} className="text-ink-3 hover:text-ink">
              <X className="size-4" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
