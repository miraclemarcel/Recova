import { useEffect, useRef, useState } from 'react'
import { Camera, GripVertical, Mic, Pause, Play, Square, Trash2 } from 'lucide-react'
import type { RecorderState, ToolbarCommand } from '@shared/types'
import { formatDuration } from '@renderer/lib/format'

/** The floating, capture-excluded recording toolbar (runs in its own small window). */
export function ToolbarApp() {
  const [countdown, setCountdown] = useState<number | null>(null)
  const [state, setState] = useState<RecorderState | null>(null)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const timer = useRef<number>(0)

  const send = (cmd: ToolbarCommand) => window.recova.toolbar.command(cmd)

  useEffect(() => {
    const offState = window.recova.toolbar.onState(setState)
    const offCountdown = window.recova.toolbar.onCountdown((seconds) => {
      window.clearInterval(timer.current)
      setState(null)
      setConfirmDiscard(false)
      if (seconds <= 0) {
        setCountdown(null)
        send('countdown-done')
        return
      }
      let n = seconds
      setCountdown(n)
      timer.current = window.setInterval(() => {
        n -= 1
        if (n <= 0) {
          window.clearInterval(timer.current)
          setCountdown(null)
          send('countdown-done')
        } else setCountdown(n)
      }, 1000)
    })
    return () => {
      offState()
      offCountdown()
      window.clearInterval(timer.current)
    }
  }, [])

  if (countdown !== null) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex size-[200px] flex-col items-center justify-center rounded-full bg-black/75 text-white shadow-2xl backdrop-blur">
          <div key={countdown} className="animate-fade-in text-[88px] leading-none font-semibold tabular-nums">
            {countdown}
          </div>
          <button
            onClick={() => {
              window.clearInterval(timer.current)
              setCountdown(null)
              send('cancel')
            }}
            className="mt-3 rounded-full px-3 py-1 text-[12px] text-white/70 hover:bg-white/10 hover:text-white"
          >
            Cancel
          </button>
        </div>
      </div>
    )
  }

  const paused = state?.phase === 'paused'
  const saving = state?.phase === 'saving'
  return (
    <div className="flex h-full items-center p-1.5">
      <div className="drag-region flex h-full w-full items-center gap-1 rounded-2xl border border-white/10 bg-[#16161d]/95 px-2 text-white shadow-2xl">
        <GripVertical className="size-4 shrink-0 text-white/30" />
        {confirmDiscard ? (
          <div className="no-drag flex flex-1 items-center justify-between gap-2 pl-1">
            <span className="text-[12.5px] text-white/85">Discard recording?</span>
            <div className="flex gap-1">
              <button onClick={() => setConfirmDiscard(false)} className="h-8 rounded-lg px-3 text-[12.5px] hover:bg-white/10">
                Keep
              </button>
              <button onClick={() => send('cancel')} className="h-8 rounded-lg bg-[#e5484d] px-3 text-[12.5px] font-medium hover:bg-[#dc3d43]">
                Discard
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 px-1.5">
              <span className={`size-2.5 rounded-full ${saving ? 'bg-white/50' : paused ? 'bg-amber-400' : 'animate-pulse-dot bg-[#ff5a5f]'}`} />
              <span className="w-[58px] text-[14px] font-semibold tabular-nums">{formatDuration((state?.elapsedMs ?? 0) / 1000)}</span>
            </div>
            <div className="flex items-center gap-1 text-white/50" title={state?.warning ?? undefined}>
              {state?.micActive && <Mic className="size-3.5" />}
              {state?.cameraActive && <Camera className="size-3.5" />}
              {state?.warning && <span className="max-w-[90px] truncate text-[11px] text-amber-300">{state.warning}</span>}
            </div>
            <div className="no-drag ml-auto flex items-center gap-1">
              <ToolButton label={paused ? 'Resume' : 'Pause'} disabled={saving || !state} onClick={() => send(paused ? 'resume' : 'pause')}>
                {paused ? <Play className="size-4" fill="currentColor" /> : <Pause className="size-4" fill="currentColor" />}
              </ToolButton>
              <button
                onClick={() => send('stop')}
                disabled={saving || !state}
                className="flex h-9 items-center gap-1.5 rounded-xl bg-[#e5484d] px-3 text-[13px] font-semibold hover:bg-[#dc3d43] disabled:opacity-50"
              >
                <Square className="size-3.5" fill="currentColor" /> {saving ? 'Saving…' : 'Stop'}
              </button>
              <ToolButton label="Discard" disabled={saving} onClick={() => setConfirmDiscard(true)}>
                <Trash2 className="size-4" />
              </ToolButton>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function ToolButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button aria-label={label} title={label} onClick={onClick} disabled={disabled} className="flex size-9 items-center justify-center rounded-xl text-white/85 hover:bg-white/10 hover:text-white disabled:opacity-40">
      {children}
    </button>
  )
}
