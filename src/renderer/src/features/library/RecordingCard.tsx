import { useState } from 'react'
import { Camera, FileWarning, FolderOpen, MoreHorizontal, Pencil, Play, Sparkles, Trash2 } from 'lucide-react'
import type { LibraryItem } from '@shared/types'
import { mediaUrl } from '@shared/constants'
import { IconButton } from '@renderer/components/ui'
import { formatBytes, formatDate, formatDuration } from '@renderer/lib/format'

export interface CardActions {
  onPreview: (r: LibraryItem) => void
  onStudio: (r: LibraryItem) => void
  onRename: (r: LibraryItem) => void
  onReveal: (r: LibraryItem) => void
  onDelete: (r: LibraryItem) => void
}

export function RecordingCard({ rec, actions }: { rec: LibraryItem; actions: CardActions }) {
  const [imgFailed, setImgFailed] = useState(false)
  const thumb = rec.thumbnailPath && !imgFailed && !rec.missing ? mediaUrl.thumbnail(rec.id, rec.createdAt) : null
  return (
    <div className="group overflow-hidden rounded-2xl border border-line bg-surface shadow-card transition hover:shadow-pop">
      <button
        className="relative block aspect-video w-full overflow-hidden bg-surface-2"
        onClick={() => actions.onPreview(rec)}
        disabled={rec.missing}
        aria-label={`Preview ${rec.name}`}
      >
        {thumb ? (
          <img src={thumb} alt="" className="size-full object-cover transition duration-300 group-hover:scale-[1.02]" onError={() => setImgFailed(true)} />
        ) : (
          <div className="flex size-full flex-col items-center justify-center gap-1.5 text-ink-3">
            {rec.missing ? <FileWarning className="size-6" /> : <Play className="size-6" />}
            {rec.missing && <span className="text-[12px]">File missing</span>}
          </div>
        )}
        {!rec.missing && (
          <span className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition group-hover:bg-black/15 group-hover:opacity-100">
            <span className="flex size-11 items-center justify-center rounded-full bg-white/95 text-ink shadow-pop">
              <Play className="ml-0.5 size-5" fill="currentColor" />
            </span>
          </span>
        )}
        <span className="absolute right-2 bottom-2 rounded-md bg-black/70 px-1.5 py-0.5 text-[11.5px] font-medium text-white tabular-nums">{formatDuration(rec.durationSec)}</span>
        {rec.hasCamera && (
          <span className="absolute top-2 left-2 flex items-center gap-1 rounded-md bg-black/60 px-1.5 py-0.5 text-[11px] font-medium text-white">
            <Camera className="size-3" /> Facecam
          </span>
        )}
      </button>
      <div className="p-3.5">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13.5px] font-semibold" title={rec.name}>
              {rec.name}
            </div>
            <div className="mt-0.5 truncate text-[12px] text-ink-3">
              {formatDate(rec.createdAt)} · {rec.width}×{rec.height} · {formatBytes(rec.sizeBytes)}
            </div>
          </div>
          <CardMenu rec={rec} actions={actions} />
        </div>
        <div className="mt-3 flex items-center gap-1.5">
          <button
            disabled={rec.missing}
            onClick={() => actions.onStudio(rec)}
            className="inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg bg-accent-soft text-[12.5px] font-semibold text-accent transition hover:brightness-95 disabled:opacity-40"
          >
            <Sparkles className="size-3.5" /> Design &amp; export
          </button>
          <IconButton icon={FolderOpen} label="Show in folder" onClick={() => actions.onReveal(rec)} />
          {rec.exports.length > 0 && <span className="rounded-md bg-surface-2 px-1.5 py-1 text-[11px] font-medium text-ink-2">{rec.exports.length} export{rec.exports.length > 1 ? 's' : ''}</span>}
        </div>
      </div>
    </div>
  )
}

function CardMenu({ rec, actions }: { rec: LibraryItem; actions: CardActions }) {
  const [open, setOpen] = useState(false)
  const item = (icon: typeof Pencil, label: string, fn: () => void, danger = false, disabled = false) => {
    const Icon = icon
    return (
      <button
        disabled={disabled}
        onClick={() => {
          setOpen(false)
          fn()
        }}
        className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] hover:bg-surface-2 disabled:opacity-40 ${danger ? 'text-danger' : 'text-ink'}`}
      >
        <Icon className="size-3.5" /> {label}
      </button>
    )
  }
  return (
    <div className="relative">
      <IconButton icon={MoreHorizontal} label="More actions" onClick={() => setOpen((v) => !v)} />
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="animate-fade-in absolute top-9 right-0 z-40 w-48 rounded-xl border border-line bg-surface p-1 shadow-pop">
            {item(Play, 'Preview', () => actions.onPreview(rec), false, rec.missing)}
            {item(Sparkles, 'Open in Video Studio', () => actions.onStudio(rec), false, rec.missing)}
            {item(Pencil, 'Rename', () => actions.onRename(rec))}
            {item(FolderOpen, 'Show in folder', () => actions.onReveal(rec))}
            <div className="my-1 h-px bg-line" />
            {item(Trash2, 'Delete…', () => actions.onDelete(rec), true)}
          </div>
        </>
      )}
    </div>
  )
}
