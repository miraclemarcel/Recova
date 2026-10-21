import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Camera, ExternalLink, FileWarning, FolderOpen, Mic, Pencil, Sparkles, Trash2, Volume2, X } from 'lucide-react'
import { mediaUrl } from '@shared/constants'
import { Button, Card, EmptyState, IconButton, Notice } from '@renderer/components/ui'
import { useApp } from '@renderer/store/app-store'
import { errorMessage, formatBytes, formatDate, formatDuration } from '@renderer/lib/format'
import { DeleteDialog, RenameDialog } from './dialogs'
import type { LibraryItem } from '@shared/types'

export function PlayerView({ recordingId }: { recordingId: string }) {
  const { library, navigate, toast } = useApp()
  const rec = library.find((r) => r.id === recordingId)
  const [renaming, setRenaming] = useState<LibraryItem | null>(null)
  const [deleting, setDeleting] = useState<LibraryItem | null>(null)
  const [videoError, setVideoError] = useState<string | null>(null)
  const screenRef = useRef<HTMLVideoElement>(null)
  const camRef = useRef<HTMLVideoElement>(null)

  // Keep the facecam track in sync with the main video.
  useEffect(() => {
    const v = screenRef.current
    const c = camRef.current
    if (!v || !c) return
    const offset = (rec?.camera?.offsetMs ?? 0) / 1000
    const sync = () => {
      const target = v.currentTime - offset
      if (target < 0) {
        c.pause()
        c.currentTime = 0
        return
      }
      if (Math.abs(c.currentTime - target) > 0.25) c.currentTime = target
      if (v.paused !== c.paused) void (v.paused ? c.pause() : c.play().catch(() => undefined))
    }
    const events = ['play', 'pause', 'seeked', 'timeupdate', 'ratechange']
    events.forEach((e) => v.addEventListener(e, sync))
    return () => events.forEach((e) => v.removeEventListener(e, sync))
  }, [rec?.camera?.offsetMs, rec?.hasCamera])

  if (!rec) {
    return (
      <div className="flex h-full items-center justify-center">
        <EmptyState icon={FileWarning} title="Recording not found" description="It may have been deleted." action={<Button onClick={() => navigate({ name: 'dashboard' })}>Back to recordings</Button>} />
      </div>
    )
  }

  const fail = (title: string) => (err: unknown) => toast({ kind: 'error', title, message: errorMessage(err) })

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-line bg-surface px-6 py-3">
        <IconButton icon={ArrowLeft} label="Back" onClick={() => navigate({ name: 'dashboard' })} />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[15px] font-semibold">{rec.name}</h1>
          <p className="text-[12px] text-ink-3">{formatDate(rec.createdAt)}</p>
        </div>
        <Button size="sm" icon={Pencil} variant="ghost" onClick={() => setRenaming(rec)}>
          Rename
        </Button>
        <Button size="sm" icon={FolderOpen} variant="ghost" onClick={() => window.recova.library.reveal(rec.id).catch(fail('Could not open file location'))}>
          Show in folder
        </Button>
        <Button size="sm" icon={Trash2} variant="ghost" className="text-danger" onClick={() => setDeleting(rec)}>
          Delete
        </Button>
        <Button icon={Sparkles} variant="primary" disabled={rec.missing} onClick={() => navigate({ name: 'studio', recordingId: rec.id })}>
          Open in Video Studio
        </Button>
      </header>
      <div className="flex min-h-0 flex-1 gap-6 overflow-y-auto p-6">
        <div className="min-w-0 flex-1">
          {rec.missing ? (
            <Card className="flex aspect-video items-center justify-center">
              <EmptyState icon={FileWarning} title="Original file is missing" description={`Recova could not find ${rec.screenPath}. It may have been moved or deleted outside Recova.`} />
            </Card>
          ) : (
            <div className="relative overflow-hidden rounded-2xl bg-black shadow-pop">
              <video
                ref={screenRef}
                src={mediaUrl.screen(rec.id)}
                controls
                autoPlay
                className="aspect-video max-h-[70vh] w-full bg-black object-contain"
                onError={() => setVideoError('This video could not be played. The file may be damaged.')}
              />
              {rec.hasCamera && !rec.cameraMissing && (
                <video ref={camRef} src={mediaUrl.camera(rec.id)} muted playsInline className="pointer-events-none absolute right-4 bottom-16 w-[18%] rounded-xl border-2 border-white/80 shadow-pop" />
              )}
            </div>
          )}
          {videoError && <Notice kind="error" className="mt-3">{videoError}</Notice>}
          {rec.cameraMissing && <Notice kind="warn" className="mt-3">The facecam file for this recording is missing.</Notice>}
          {rec.hasCamera && !rec.cameraMissing && <p className="mt-3 text-[12px] text-ink-3">Facecam is stored as a separate track — position and style it in Video Studio.</p>}
        </div>
        <aside className="w-[300px] shrink-0 space-y-4">
          <Card className="p-4">
            <h3 className="mb-3 text-[13px] font-semibold">Details</h3>
            <dl className="space-y-2 text-[12.5px]">
              <Row k="Duration" v={formatDuration(rec.durationSec)} />
              <Row k="Resolution" v={`${rec.width} × ${rec.height}`} />
              <Row k="Frame rate" v={`${rec.fps} fps`} />
              <Row k="Size" v={formatBytes(rec.sizeBytes)} />
              <Row
                k="Audio"
                v={
                  <span className="inline-flex items-center gap-1.5">
                    {rec.audio.microphone && <Mic className="size-3.5" />}
                    {rec.audio.systemAudio && <Volume2 className="size-3.5" />}
                    {rec.audio.microphone && rec.audio.systemAudio ? 'Mic + system' : rec.audio.microphone ? 'Microphone' : rec.audio.systemAudio ? 'System audio' : 'None'}
                  </span>
                }
              />
              <Row k="Facecam" v={rec.hasCamera ? <span className="inline-flex items-center gap-1"><Camera className="size-3.5" /> Included</span> : 'Not recorded'} />
            </dl>
            {rec.recovered && <Notice kind="warn" className="mt-3">Recovered after an interrupted session.</Notice>}
          </Card>
          <Card className="p-4">
            <h3 className="mb-3 text-[13px] font-semibold">Exports</h3>
            {rec.exports.length === 0 ? (
              <p className="text-[12.5px] text-ink-3">No exports yet. Design a composition in Video Studio and export it as MP4.</p>
            ) : (
              <ul className="space-y-2">
                {[...rec.exports].reverse().map((e) => (
                  <li key={e.id} className="rounded-lg border border-line p-2.5">
                    <div className="truncate text-[12.5px] font-medium" title={e.path}>
                      {e.path.split(/[\\/]/).pop()}
                    </div>
                    <div className="text-[11.5px] text-ink-3">
                      {e.label} · {e.width}×{e.height}
                    </div>
                    <div className="mt-1.5 flex gap-1">
                      <IconButton icon={ExternalLink} label="Play" onClick={() => window.recova.library.openExport(rec.id, e.id).catch(fail('Could not open export'))} />
                      <IconButton icon={FolderOpen} label="Show in folder" onClick={() => window.recova.library.revealExport(rec.id, e.id).catch(fail('Could not show export'))} />
                      <IconButton icon={X} label="Remove from list (keeps file)" onClick={() => window.recova.library.removeExport(rec.id, e.id).catch(fail('Could not remove'))} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </aside>
      </div>
      <RenameDialog rec={renaming} onClose={() => setRenaming(null)} />
      <DeleteDialog rec={deleting} onClose={() => setDeleting(null)} onDeleted={() => navigate({ name: 'dashboard' })} />
    </div>
  )
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-ink-3">{k}</dt>
      <dd className="text-right font-medium text-ink">{v}</dd>
    </div>
  )
}
