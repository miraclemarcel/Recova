import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AppWindow, ArrowLeft, Camera, Circle, Monitor, RefreshCw, RectangleHorizontal, Square, Volume2 } from 'lucide-react'
import type { AudioMode, CameraShape, CameraSize, CaptureSource, Corner, FrameRate, RecordingQuality } from '@shared/types'
import { QUALITY_DIMENSIONS } from '@shared/constants'
import { Button, Card, IconButton, Notice, Segmented, Select, Spinner, Toggle } from '@renderer/components/ui'
import { useApp } from '@renderer/store/app-store'
import { cn, errorMessage } from '@renderer/lib/format'
import { MicrophonePanel } from '../audio/MicrophonePanel'
import { useCameraStream } from '../camera/useCameraStream'
import { useDevices } from './devices'
import { startSession } from './session'

export function SetupView() {
  const { settings, platform, navigate, toast, refreshLibrary, updateSettings } = useApp()
  const s = settings!
  const [sources, setSources] = useState<CaptureSource[]>([])
  const [loadingSources, setLoadingSources] = useState(true)
  const [sourceError, setSourceError] = useState<string | null>(null)
  const [tab, setTab] = useState<'screen' | 'window'>('screen')
  const [sourceId, setSourceId] = useState<string | null>(null)

  const systemAudioSupported = platform?.systemAudioSupported ?? false
  const initialAudio: AudioMode = !systemAudioSupported && (s.recording.audioMode === 'system' || s.recording.audioMode === 'both') ? 'mic' : s.recording.audioMode
  const [audioMode, setAudioMode] = useState<AudioMode>(initialAudio)
  const [micId, setMicId] = useState(s.recording.microphoneId ?? '')
  const [micGain, setMicGain] = useState(s.recording.micVolume)
  const [cameraOn, setCameraOn] = useState(s.camera.enabledByDefault)
  const [cameraId, setCameraId] = useState(s.camera.cameraId ?? '')
  const [quality, setQuality] = useState<RecordingQuality>(s.recording.quality)
  const [fps, setFps] = useState<FrameRate>(s.recording.fps)
  const [starting, setStarting] = useState(false)

  const micEnabled = audioMode === 'mic' || audioMode === 'both'
  const systemEnabled = audioMode === 'system' || audioMode === 'both'
  const mics = useDevices('audioinput')
  const cams = useDevices('videoinput')
  const camera = useCameraStream(cameraOn, cameraId)

  const loadSources = useCallback(async () => {
    setLoadingSources(true)
    setSourceError(null)
    try {
      const list = await window.recova.capture.listSources()
      setSources(list)
      setSourceId((cur) => (cur && list.some((x) => x.id === cur) ? cur : (list.find((x) => x.kind === 'screen' && x.display?.primary) ?? list[0])?.id ?? null))
    } catch (err) {
      setSourceError(errorMessage(err))
    } finally {
      setLoadingSources(false)
    }
  }, [])

  useEffect(() => {
    void loadSources()
  }, [loadSources])

  // Refresh device labels once the user enables an input (permission prompts happen here, not before).
  const { permission: micPermission, requestAccess: requestMic } = mics
  const { permission: camPermission, requestAccess: requestCam } = cams
  useEffect(() => {
    if (micEnabled && micPermission === 'unknown') void requestMic()
  }, [micEnabled, micPermission, requestMic])
  useEffect(() => {
    if (cameraOn && camPermission === 'unknown') void requestCam()
  }, [cameraOn, camPermission, requestCam])

  const source = sources.find((x) => x.id === sourceId) ?? null
  const shown = sources.filter((x) => x.kind === tab)

  const qualityWarning = useMemo(() => {
    const want = QUALITY_DIMENSIONS[quality]
    if (source?.kind === 'screen' && source.display && (source.display.width < want.width || source.display.height < want.height)) {
      return `This display is ${source.display.width}×${source.display.height}, so it will be recorded at its native size rather than ${quality}.`
    }
    if (source?.kind === 'window') return `Windows are captured at their on-screen size, up to ${want.width}×${want.height}.`
    return null
  }, [quality, source])

  const start = async () => {
    if (!source) return
    setStarting(true)
    try {
      await startSession(
        {
          sourceId: source.id,
          sourceName: source.name,
          systemAudio: systemEnabled && systemAudioSupported,
          micDeviceId: micEnabled ? micId : null,
          micGain,
          cameraDeviceId: cameraOn ? cameraId : null,
          quality,
          fps,
          countdown: s.recording.countdownSeconds
        },
        (meta, error) => {
          if (error) {
            toast({ kind: 'error', title: 'Recording could not be saved', message: error })
            navigate({ name: 'setup' })
          } else if (meta) {
            void refreshLibrary()
            toast({ kind: 'success', title: 'Recording saved', message: `${meta.name} · ${meta.width}×${meta.height}` })
            navigate({ name: 'player', recordingId: meta.id })
          } else navigate({ name: 'setup' })
        }
      )
      void updateSettings({ recording: { microphoneId: micId || null, micVolume: micGain }, camera: { cameraId: cameraId || null } })
      navigate({ name: 'recording' })
    } catch (err) {
      toast({ kind: 'error', title: 'Could not start recording', message: errorMessage(err) })
    } finally {
      setStarting(false)
    }
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-line bg-surface px-6 py-3">
        <IconButton icon={ArrowLeft} label="Back" onClick={() => navigate({ name: 'dashboard' })} />
        <div className="flex-1">
          <h1 className="text-[15px] font-semibold">New recording</h1>
          <p className="text-[12px] text-ink-3">Choose what to capture, then press Start.</p>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <section className="flex min-w-0 flex-1 flex-col overflow-y-auto p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <Segmented
              value={tab}
              onChange={setTab}
              options={[
                { value: 'screen', label: <span className="inline-flex items-center gap-1.5"><Monitor className="size-3.5" />Screens</span> },
                { value: 'window', label: <span className="inline-flex items-center gap-1.5"><AppWindow className="size-3.5" />Windows</span> }
              ]}
            />
            <Button size="sm" variant="ghost" icon={RefreshCw} onClick={() => void loadSources()} disabled={loadingSources}>
              Refresh
            </Button>
          </div>
          {sourceError && <Notice kind="error" className="mb-4">Could not list screens and windows: {sourceError}</Notice>}
          {loadingSources && sources.length === 0 ? (
            <div className="flex flex-1 items-center justify-center">
              <Spinner />
            </div>
          ) : shown.length === 0 ? (
            <p className="py-16 text-center text-[13px] text-ink-3">{tab === 'screen' ? 'No screens available.' : 'No capturable windows are open. Open the app you want to record and press Refresh.'}</p>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
              {shown.map((src, i) => (
                <button
                  key={src.id}
                  onClick={() => setSourceId(src.id)}
                  className={cn(
                    'group overflow-hidden rounded-xl border bg-surface text-left shadow-card transition',
                    src.id === sourceId ? 'border-accent ring-2 ring-accent/30' : 'border-line hover:border-line-strong'
                  )}
                >
                  <div className="aspect-video bg-surface-2 p-2">
                    <img src={src.thumbnail} alt="" className="size-full rounded-md object-contain" />
                  </div>
                  <div className="flex items-center gap-2 px-3 py-2.5">
                    {src.appIcon ? <img src={src.appIcon} alt="" className="size-4" /> : src.kind === 'screen' ? <Monitor className="size-4 text-ink-3" /> : <AppWindow className="size-4 text-ink-3" />}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-medium">{src.kind === 'screen' ? (sources.filter((x) => x.kind === 'screen').length > 1 ? `Display ${i + 1}` : 'Entire screen') : src.name}</div>
                      {src.display && (
                        <div className="text-[11.5px] text-ink-3">
                          {src.display.width}×{src.display.height}
                          {src.display.primary ? ' · Primary' : ''}
                        </div>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>

        <aside className="w-[360px] shrink-0 space-y-4 overflow-y-auto border-l border-line bg-canvas p-5">
          <Card className="p-4">
            <h3 className="mb-3 text-[13.5px] font-semibold">Audio</h3>
            <Segmented
              className="w-full"
              size="sm"
              value={audioMode}
              onChange={setAudioMode}
              options={[
                { value: 'none', label: 'None' },
                { value: 'mic', label: 'Mic' },
                { value: 'system', label: 'System', disabled: !systemAudioSupported, title: systemAudioSupported ? undefined : platform?.systemAudioNote },
                { value: 'both', label: 'Both', disabled: !systemAudioSupported, title: systemAudioSupported ? undefined : platform?.systemAudioNote }
              ]}
            />
            {micEnabled && (
              <div className="mt-4">
                {mics.permission === 'denied' ? (
                  <Notice kind="error">Microphone access was denied. Allow it in your system privacy settings, then reopen this screen.</Notice>
                ) : mics.permission === 'unavailable' ? (
                  <Notice kind="warn">No microphone was found. Connect one or choose another audio option.</Notice>
                ) : (
                  <MicrophonePanel devices={mics.devices} deviceId={micId} onDevice={setMicId} gain={micGain} onGain={setMicGain} />
                )}
              </div>
            )}
            {systemEnabled && (
              <div className="mt-3 flex gap-2 text-[12px] text-ink-3">
                <Volume2 className="mt-0.5 size-3.5 shrink-0" />
                {platform?.systemAudioNote}
              </div>
            )}
            {!systemAudioSupported && <p className="mt-3 text-[12px] text-ink-3">{platform?.systemAudioNote}</p>}
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-[13.5px] font-semibold">
                <Camera className="size-4 text-ink-3" /> Include Facecam
              </h3>
              <Toggle checked={cameraOn} onChange={setCameraOn} label="Include Facecam" />
            </div>
            {!cameraOn && <p className="mt-2 text-[12px] text-ink-3">Camera stays off and is never accessed unless you turn this on.</p>}
            {cameraOn && (
              <div className="mt-4 space-y-3">
                {cams.permission === 'denied' ? (
                  <Notice kind="error">Camera access was denied. Allow it in your system privacy settings.</Notice>
                ) : cams.permission === 'unavailable' ? (
                  <Notice kind="warn">No camera was found.</Notice>
                ) : (
                  <>
                    <Select value={cameraId} onChange={setCameraId} options={[{ value: '', label: 'Default camera' }, ...cams.devices.map((d) => ({ value: d.deviceId, label: d.label }))]} />
                    <CameraPreview stream={camera.stream} shape={s.camera.shape} />
                    {camera.error && <Notice kind="error">{camera.error}</Notice>}
                    <CameraDefaults />
                  </>
                )}
              </div>
            )}
          </Card>

          <Card className="p-4">
            <h3 className="mb-3 text-[13.5px] font-semibold">Quality</h3>
            <div className="space-y-3">
              <Segmented className="w-full" size="sm" value={quality} onChange={setQuality} options={(['720p', '1080p', '1440p'] as const).map((q) => ({ value: q, label: q }))} />
              <Segmented className="w-full" size="sm" value={fps} onChange={setFps} options={[{ value: 30 as FrameRate, label: '30 FPS' }, { value: 60 as FrameRate, label: '60 FPS' }]} />
              {qualityWarning && <Notice kind="info">{qualityWarning}</Notice>}
              {fps === 60 && <p className="text-[12px] text-ink-3">60 FPS needs a capable GPU/CPU. The achieved frame rate is saved with the recording.</p>}
            </div>
          </Card>

          <div className="sticky bottom-0 -mx-5 -mb-5 border-t border-line bg-canvas/95 p-5 backdrop-blur">
            <Button variant="record" size="lg" className="w-full" disabled={!source || starting} loading={starting} onClick={() => void start()}>
              <span className="size-2.5 rounded-full bg-white" /> Start Recording
            </Button>
            <p className="mt-2 text-center text-[12px] text-ink-3">
              {source ? `Recording “${source.kind === 'screen' ? 'Entire screen' : source.name}”` : 'Select a screen or window'}
              {s.recording.countdownSeconds > 0 ? ` · ${s.recording.countdownSeconds}s countdown` : ''}
            </p>
          </div>
        </aside>
      </div>
    </div>
  )
}

function CameraPreview({ stream, shape }: { stream: MediaStream | null; shape: CameraShape }) {
  const ref = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream
  }, [stream])
  return (
    <div className="flex justify-center rounded-xl bg-surface-2 p-3">
      <div className={cn('relative aspect-square w-40 overflow-hidden bg-black shadow-card', shape === 'circle' ? 'rounded-full' : shape === 'rounded' ? 'aspect-[4/3] w-48 rounded-2xl' : 'rounded-none')}>
        {stream ? <video ref={ref} autoPlay muted playsInline className="size-full -scale-x-100 object-cover" /> : <div className="flex size-full items-center justify-center"><Spinner className="text-white/60" /></div>}
      </div>
    </div>
  )
}

function CameraDefaults() {
  const { settings, updateSettings } = useApp()
  const c = settings!.camera
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[72px_1fr] items-center gap-2 text-[12.5px]">
        <span className="text-ink-2">Shape</span>
        <Segmented
          size="sm"
          value={c.shape}
          onChange={(shape: CameraShape) => void updateSettings({ camera: { shape } })}
          options={[
            { value: 'circle', label: <Circle className="mx-auto size-3.5" />, title: 'Circle' },
            { value: 'rounded', label: <RectangleHorizontal className="mx-auto size-3.5" />, title: 'Rounded rectangle' },
            { value: 'square', label: <Square className="mx-auto size-3.5" />, title: 'Square' }
          ]}
        />
        <span className="text-ink-2">Size</span>
        <Segmented size="sm" value={c.size} onChange={(size: CameraSize) => void updateSettings({ camera: { size } })} options={[{ value: 'small', label: 'S' }, { value: 'medium', label: 'M' }, { value: 'large', label: 'L' }]} />
        <span className="text-ink-2">Position</span>
        <Segmented
          size="sm"
          value={c.position}
          onChange={(position: Corner) => void updateSettings({ camera: { position } })}
          options={[
            { value: 'top-left', label: '↖' },
            { value: 'top-right', label: '↗' },
            { value: 'bottom-left', label: '↙' },
            { value: 'bottom-right', label: '↘' }
          ]}
        />
      </div>
      <p className="text-[12px] text-ink-3">The facecam is recorded as its own track, so you can restyle and move it later in Video Studio.</p>
    </div>
  )
}
