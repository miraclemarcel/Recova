import { useEffect, useRef, useState } from 'react'
import { Mic, Play, Square } from 'lucide-react'
import { Button, Notice, Select, Slider } from '@renderer/components/ui'
import { createLevelMeter, stopStream } from './mixer'
import { mediaErrorMessage, type DeviceOption } from '../recording/devices'

export function LevelMeter({ level }: { level: number }) {
  const bars = 24
  return (
    <div className="flex h-2.5 gap-[3px]" aria-label="Microphone level">
      {Array.from({ length: bars }, (_, i) => {
        const on = level * bars > i
        const color = i > bars * 0.85 ? 'bg-danger' : i > bars * 0.65 ? 'bg-warn' : 'bg-success'
        return <span key={i} className={`flex-1 rounded-sm transition-colors duration-75 ${on ? color : 'bg-surface-3'}`} />
      })}
    </div>
  )
}

/** Microphone selection, live meter, volume and a record-and-play-back test. */
export function MicrophonePanel({ devices, deviceId, onDevice, gain, onGain }: { devices: DeviceOption[]; deviceId: string; onDevice: (id: string) => void; gain: number; onGain: (g: number) => void }) {
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [level, setLevel] = useState(0)
  const [testing, setTesting] = useState<'idle' | 'recording' | 'playing'>('idle')
  const meterRef = useRef<ReturnType<typeof createLevelMeter> | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    let cancelled = false
    let s: MediaStream | null = null
    navigator.mediaDevices
      .getUserMedia({ audio: { deviceId: deviceId ? { exact: deviceId } : undefined, echoCancellation: true, noiseSuppression: true } })
      .then((st) => {
        if (cancelled) return stopStream(st)
        s = st
        setStream(st)
        setError(null)
      })
      .catch((err) => !cancelled && setError(mediaErrorMessage(err, 'microphone')))
    return () => {
      cancelled = true
      stopStream(s)
      setStream(null)
    }
  }, [deviceId])

  useEffect(() => {
    if (!stream) return
    const meter = createLevelMeter(stream, setLevel, gain)
    meterRef.current = meter
    return () => {
      meter.dispose()
      meterRef.current = null
    }
    // Gain changes are applied by the effect below without rebuilding the meter.
  }, [stream])
  useEffect(() => meterRef.current?.setGain(gain), [gain])

  useEffect(
    () => () => {
      audioRef.current?.pause()
    },
    []
  )

  const runTest = () => {
    if (!stream) return
    const rec = new MediaRecorder(stream)
    const chunks: Blob[] = []
    rec.ondataavailable = (e) => chunks.push(e.data)
    rec.onstop = () => {
      const url = URL.createObjectURL(new Blob(chunks, { type: rec.mimeType }))
      const audio = new Audio(url)
      audio.volume = Math.min(1, gain)
      audioRef.current = audio
      setTesting('playing')
      audio.onended = () => {
        URL.revokeObjectURL(url)
        setTesting('idle')
      }
      void audio.play()
    }
    rec.start()
    setTesting('recording')
    setTimeout(() => rec.state !== 'inactive' && rec.stop(), 4000)
  }

  return (
    <div className="space-y-3">
      <Select value={deviceId} onChange={onDevice} options={[{ value: '', label: 'System default microphone' }, ...devices.filter((d) => d.deviceId !== 'default').map((d) => ({ value: d.deviceId, label: d.label }))]} />
      {error ? (
        <Notice kind="error">{error}</Notice>
      ) : (
        <div className="flex items-center gap-3">
          <Mic className="size-4 shrink-0 text-ink-3" />
          <div className="flex-1">
            <LevelMeter level={level} />
          </div>
        </div>
      )}
      <Slider label="Microphone volume" min={0} max={2} step={0.05} value={gain} onChange={onGain} format={(v) => `${Math.round(v * 100)}%`} />
      <Button size="sm" icon={testing === 'idle' ? Play : Square} disabled={!stream || testing !== 'idle'} onClick={runTest} className="w-full">
        {testing === 'recording' ? 'Speak now… recording 4 seconds' : testing === 'playing' ? 'Playing back…' : 'Test microphone'}
      </Button>
    </div>
  )
}
