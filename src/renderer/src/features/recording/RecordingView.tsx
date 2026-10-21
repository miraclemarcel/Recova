import { useState } from 'react'
import { Pause, Play, Square, Trash2 } from 'lucide-react'
import { Button, ConfirmDialog, Notice, Spinner } from '@renderer/components/ui'
import { formatDuration } from '@renderer/lib/format'
import { cancelSession, pauseSession, resumeSession, stopSession, useRecorder } from './session'

/** Shown in the main window while a session is live (the floating toolbar is the primary control). */
export function RecordingView() {
  const { status, elapsedMs, warnings, captured, config } = useRecorder()
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const busy = status === 'saving' || status === 'preparing'

  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 p-10">
      {status === 'saving' ? (
        <>
          <Spinner className="size-8" />
          <div className="text-center">
            <div className="text-[16px] font-semibold">Saving your recording…</div>
            <div className="mt-1 text-[13px] text-ink-3">Finalising the video file on disk.</div>
          </div>
        </>
      ) : (
        <>
          <div className="flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-[12.5px] font-medium shadow-card">
            <span className={`size-2.5 rounded-full ${status === 'recording' ? 'animate-pulse-dot bg-[#e5484d]' : 'bg-warn'}`} />
            {status === 'countdown' ? 'Starting…' : status === 'paused' ? 'Paused' : 'Recording'}
          </div>
          <div className="text-[64px] font-semibold tracking-tight tabular-nums">{formatDuration(elapsedMs / 1000)}</div>
          <div className="text-[13px] text-ink-3">
            {config?.sourceName}
            {captured ? ` · ${captured.width}×${captured.height} @ ${captured.fps} fps` : ''}
          </div>
          <div className="flex gap-2">
            {status === 'paused' ? (
              <Button icon={Play} onClick={resumeSession}>
                Resume
              </Button>
            ) : (
              <Button icon={Pause} onClick={pauseSession} disabled={status !== 'recording'}>
                Pause
              </Button>
            )}
            <Button variant="record" icon={Square} onClick={() => void stopSession()} disabled={busy}>
              Stop &amp; save
            </Button>
            <Button variant="ghost" icon={Trash2} onClick={() => setConfirmDiscard(true)} disabled={busy}>
              Discard
            </Button>
          </div>
          <div className="w-full max-w-md space-y-2">
            {warnings.map((w) => (
              <Notice key={w} kind="warn">
                {w}
              </Notice>
            ))}
          </div>
          <p className="max-w-sm text-center text-[12px] text-ink-3">Use the floating toolbar to control the recording. It is hidden from the captured video.</p>
        </>
      )}
      <ConfirmDialog
        open={confirmDiscard}
        title="Discard this recording?"
        message="Everything captured so far will be deleted. This cannot be undone."
        confirmLabel="Discard recording"
        danger
        onCancel={() => setConfirmDiscard(false)}
        onConfirm={() => {
          setConfirmDiscard(false)
          void cancelSession()
        }}
      />
    </div>
  )
}
