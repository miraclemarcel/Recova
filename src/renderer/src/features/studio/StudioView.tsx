import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, Camera, Download, FileWarning, Image, LayoutTemplate, Pause, Play, RotateCcw, Shapes, Type } from 'lucide-react'
import { mediaUrl } from '@shared/constants'
import { Button, EmptyState, IconButton, Segmented } from '@renderer/components/ui'
import { useApp } from '@renderer/store/app-store'
import { cn, errorMessage, formatDuration } from '@renderer/lib/format'
import { outputSize, type BackgroundAssets, type Composition } from './composition'
import { defaultComposition } from './presets'
import { BackgroundPanel, CameraPanel, LayoutPanel, TemplatesPanel, TextPanel } from './panels'
import { PreviewCanvas } from './PreviewCanvas'
import { ExportDialog } from '../export/ExportDialog'

type Tab = 'templates' | 'layout' | 'background' | 'camera' | 'text'
const PREVIEW_RESOLUTION = 1080
const draftKey = (id: string) => `recova:composition:${id}`

function loadDraft(id: string): Composition | null {
  try {
    const raw = localStorage.getItem(draftKey(id))
    return raw ? (JSON.parse(raw) as Composition) : null
  } catch {
    return null
  }
}

function saveDraft(id: string, c: Composition): void {
  try {
    localStorage.setItem(draftKey(id), JSON.stringify(c))
  } catch {
    // Drafts are a convenience only.
  }
}

function useImage(url: string | null): HTMLImageElement | null {
  const [img, setImg] = useState<HTMLImageElement | null>(null)
  useEffect(() => {
    if (!url) return setImg(null)
    const el = new window.Image()
    el.crossOrigin = 'anonymous'
    el.onload = () => setImg(el)
    el.onerror = () => setImg(null)
    el.src = url
  }, [url])
  return img
}

export function StudioView({ recordingId }: { recordingId: string }) {
  const { library, settings, navigate, toast } = useApp()
  const rec = library.find((r) => r.id === recordingId)
  const [comp, setComp] = useState<Composition | null>(() => (rec ? (loadDraft(rec.id) ?? defaultComposition(rec, settings)) : null))
  const [tab, setTab] = useState<Tab>('templates')
  const [exportOpen, setExportOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [screenEl, setScreenEl] = useState<HTMLVideoElement | null>(null)
  const [cameraEl, setCameraEl] = useState<HTMLVideoElement | null>(null)
  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState(rec?.durationSec ?? 0)
  const cameraRef = useRef<HTMLVideoElement | null>(null)

  const hasCamera = !!rec?.hasCamera && !rec.cameraMissing
  const update = useCallback((fn: (c: Composition) => Composition) => setComp((c) => (c ? fn(c) : c)), [])

  useEffect(() => {
    if (rec && comp) saveDraft(rec.id, comp)
  }, [rec, comp])

  const bgUrl = comp?.background.kind === 'image' ? comp.background.url : null
  const bgImage = useImage(bgUrl)
  const assets: BackgroundAssets = useMemo(() => ({ image: bgImage }), [bgImage])
  const out = useMemo(() => (rec && comp ? outputSize(comp.aspect, PREVIEW_RESOLUTION, { w: rec.width, h: rec.height }) : { w: 1920, h: 1080 }), [rec, comp])

  // Keep the camera video in sync with the screen video.
  useEffect(() => {
    const v = screenEl
    const c = cameraEl
    if (!v) return
    const offset = (rec?.camera?.offsetMs ?? 0) / 1000
    const sync = () => {
      setTime(v.currentTime)
      setPlaying(!v.paused)
      if (!c) return
      const target = Math.max(0, v.currentTime - offset)
      if (Math.abs(c.currentTime - target) > 0.2) c.currentTime = target
      if (v.paused && !c.paused) c.pause()
      if (!v.paused && c.paused && v.currentTime >= offset) void c.play().catch(() => undefined)
    }
    const onMeta = () => Number.isFinite(v.duration) && v.duration > 0 && setDuration(v.duration)
    const events = ['play', 'pause', 'seeked', 'timeupdate', 'ended']
    events.forEach((e) => v.addEventListener(e, sync))
    v.addEventListener('loadedmetadata', onMeta)
    return () => {
      events.forEach((e) => v.removeEventListener(e, sync))
      v.removeEventListener('loadedmetadata', onMeta)
    }
  }, [screenEl, cameraEl, rec?.camera?.offsetMs])

  // Release media elements when leaving the studio.
  useEffect(
    () => () => {
      for (const el of [screenEl, cameraRef.current]) {
        if (!el) continue
        el.pause()
        el.removeAttribute('src')
        el.load()
      }
    },
    [screenEl]
  )

  if (!rec || !comp) {
    return (
      <div className="flex h-full items-center justify-center">
        <EmptyState icon={FileWarning} title="Recording not found" description="It may have been deleted." action={<Button onClick={() => navigate({ name: 'dashboard' })}>Back</Button>} />
      </div>
    )
  }
  if (rec.missing) {
    return (
      <div className="flex h-full items-center justify-center">
        <EmptyState icon={FileWarning} title="Original file is missing" description="The recording was moved or deleted outside Recova, so it cannot be edited." action={<Button onClick={() => navigate({ name: 'dashboard' })}>Back</Button>} />
      </div>
    )
  }

  const tabs: { id: Tab; label: string; icon: typeof Shapes; hidden?: boolean }[] = [
    { id: 'templates', label: 'Templates', icon: LayoutTemplate },
    { id: 'layout', label: 'Layout', icon: Shapes },
    { id: 'background', label: 'Background', icon: Image },
    { id: 'camera', label: 'Facecam', icon: Camera, hidden: !hasCamera },
    { id: 'text', label: 'Text', icon: Type }
  ]

  const togglePlay = () => {
    if (!screenEl) return
    if (screenEl.paused) void screenEl.play().catch(() => undefined)
    else screenEl.pause()
  }

  const upload = async () => {
    setUploading(true)
    try {
      const r = await window.recova.studio.importBackground()
      if (r) update((c) => ({ ...c, background: { kind: 'image', id: r.id, url: r.url } }))
    } catch (err) {
      toast({ kind: 'error', title: 'Could not import image', message: errorMessage(err) })
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-line bg-surface px-5 py-2.5">
        <IconButton icon={ArrowLeft} label="Back to recording" onClick={() => navigate({ name: 'player', recordingId: rec.id })} />
        <div className="min-w-0 flex-1">
          <div className="text-[11.5px] font-medium tracking-wide text-ink-3 uppercase">Video Studio</div>
          <h1 className="truncate text-[14.5px] font-semibold">{rec.name}</h1>
        </div>
        <Button
          size="sm"
          variant="ghost"
          icon={RotateCcw}
          onClick={() => setComp(defaultComposition(rec, settings))}
        >
          Reset design
        </Button>
        <Button variant="primary" icon={Download} onClick={() => setExportOpen(true)}>
          Export
        </Button>
      </header>

      <div className="flex min-h-0 flex-1">
        <section className="flex min-w-0 flex-1 flex-col bg-surface-2/60">
          <div className="min-h-0 flex-1 p-8">
            <PreviewCanvas comp={comp} rec={rec} hasCamera={hasCamera} out={out} assets={assets} screenVideo={screenEl} cameraVideo={cameraEl} onChange={update} />
          </div>
          <div className="flex items-center gap-3 border-t border-line bg-surface px-5 py-2.5">
            <IconButton icon={playing ? Pause : Play} label={playing ? 'Pause' : 'Play'} onClick={togglePlay} />
            <span className="w-24 text-[12px] text-ink-2 tabular-nums">
              {formatDuration(time)} / {formatDuration(duration)}
            </span>
            <input
              type="range"
              aria-label="Seek"
              className="flex-1"
              min={0}
              max={Math.max(0.1, duration)}
              step={0.01}
              value={Math.min(time, duration)}
              onChange={(e) => {
                if (screenEl) screenEl.currentTime = Number(e.target.value)
                setTime(Number(e.target.value))
              }}
            />
            <Segmented
              size="sm"
              value={comp.aspect}
              onChange={(aspect) => update((c) => ({ ...c, aspect }))}
              options={[
                { value: 'original', label: 'Original' },
                { value: '16:9', label: '16:9' },
                { value: '9:16', label: '9:16' },
                { value: '1:1', label: '1:1' },
                { value: '4:5', label: '4:5' }
              ]}
            />
          </div>
        </section>

        <aside className="flex w-[360px] shrink-0 flex-col border-l border-line bg-surface">
          <nav className="flex gap-0.5 border-b border-line px-2 pt-2">
            {tabs
              .filter((t) => !t.hidden)
              .map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={cn(
                    'flex flex-1 flex-col items-center gap-1 rounded-t-lg border-b-2 px-1 pt-1.5 pb-2 text-[11.5px] font-medium transition',
                    tab === t.id ? 'border-accent text-ink' : 'border-transparent text-ink-3 hover:text-ink'
                  )}
                >
                  <t.icon className="size-4" />
                  {t.label}
                </button>
              ))}
          </nav>
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {tab === 'templates' && <TemplatesPanel comp={comp} update={update} />}
            {tab === 'layout' && <LayoutPanel comp={comp} update={update} hasCamera={hasCamera} />}
            {tab === 'background' && <BackgroundPanel comp={comp} update={update} onUpload={() => void upload()} uploading={uploading} />}
            {tab === 'camera' && hasCamera && <CameraPanel comp={comp} update={update} out={out} />}
            {tab === 'text' && <TextPanel comp={comp} update={update} />}
          </div>
        </aside>
      </div>

      {/* Hidden sources for the preview compositor. */}
      <video ref={setScreenEl} src={mediaUrl.screen(rec.id)} crossOrigin="anonymous" preload="auto" playsInline className="hidden" />
      {hasCamera && (
        <video
          ref={(el) => {
            cameraRef.current = el
            setCameraEl(el)
          }}
          src={mediaUrl.camera(rec.id)}
          crossOrigin="anonymous"
          preload="auto"
          muted
          playsInline
          className="hidden"
        />
      )}
      <ExportDialog open={exportOpen} onClose={() => setExportOpen(false)} rec={rec} comp={hasCamera ? comp : { ...comp, camera: { ...comp.camera, visible: false } }} assets={assets} />
    </div>
  )
}
