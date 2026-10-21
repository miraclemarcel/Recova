import { useEffect } from 'react'
import { CheckCircle2, FolderOpen, Loader2, Play, X, XCircle } from 'lucide-react'
import { IconButton } from '@renderer/components/ui'
import { useApp } from '@renderer/store/app-store'
import { errorMessage, formatDuration } from '@renderer/lib/format'
import { useExports } from './export-store'

/** Background export progress, visible on every screen so rendering never blocks the UI. */
export function ExportTray() {
  const { jobs, apply, dismiss } = useExports()
  const { toast, library } = useApp()

  useEffect(
    () =>
      window.recova.export.onProgress((p) => {
        apply(p)
        if (p.status === 'done') toast({ kind: 'success', title: 'Export finished', message: p.outputPath })
        if (p.status === 'error') toast({ kind: 'error', title: 'Export failed', message: p.error })
      }),
    [apply, toast]
  )

  const list = Object.values(jobs)
  if (list.length === 0) return null

  const exportIdFor = (recordingId: string, path: string) => library.find((r) => r.id === recordingId)?.exports.find((e) => e.path === path)?.id
  const fail = (title: string) => (err: unknown) => toast({ kind: 'error', title, message: errorMessage(err) })

  return (
    <div className="fixed bottom-5 left-[96px] z-40 w-[340px] space-y-2">
      {list.map((j) => {
        const exportId = exportIdFor(j.recordingId, j.outputPath)
        return (
          <div key={j.jobId} className="animate-fade-in rounded-xl border border-line bg-surface p-3 shadow-pop">
            <div className="flex items-center gap-2">
              {j.status === 'running' && <Loader2 className="size-4 shrink-0 animate-spin text-accent" />}
              {j.status === 'done' && <CheckCircle2 className="size-4 shrink-0 text-success" />}
              {(j.status === 'error' || j.status === 'cancelled') && <XCircle className="size-4 shrink-0 text-ink-3" />}
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-semibold">{j.name}</div>
                <div className="text-[11.5px] text-ink-3 tabular-nums">
                  {j.status === 'running' && `${Math.round(j.progress * 100)}% · ${formatDuration(j.elapsedSec)} elapsed${j.etaSec !== null ? ` · ~${formatDuration(j.etaSec)} left` : ''}`}
                  {j.status === 'done' && `Finished in ${formatDuration(j.elapsedSec)}`}
                  {j.status === 'cancelled' && 'Cancelled'}
                  {j.status === 'error' && <span className="text-danger">{j.error ?? 'Failed'}</span>}
                </div>
              </div>
              {j.status === 'done' && exportId && (
                <>
                  <IconButton icon={Play} label="Play" onClick={() => window.recova.library.openExport(j.recordingId, exportId).catch(fail('Could not open video'))} />
                  <IconButton icon={FolderOpen} label="Show in folder" onClick={() => window.recova.library.revealExport(j.recordingId, exportId).catch(fail('Could not show file'))} />
                </>
              )}
              {j.status === 'running' ? (
                <IconButton icon={X} label="Cancel export" onClick={() => void window.recova.export.cancel(j.jobId)} />
              ) : (
                <IconButton icon={X} label="Dismiss" onClick={() => dismiss(j.jobId)} />
              )}
            </div>
            {j.status === 'running' && (
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-3">
                <div className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${Math.max(2, j.progress * 100)}%` }} />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
