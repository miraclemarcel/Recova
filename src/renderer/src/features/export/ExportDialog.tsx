import { useEffect, useState } from 'react'
import { Folder } from 'lucide-react'
import type { ExportResolution, FrameRate, QualityPreset, RecordingMeta } from '@shared/types'
import { Button, Field, Modal, Notice, Segmented, TextInput } from '@renderer/components/ui'
import { useApp } from '@renderer/store/app-store'
import { errorMessage } from '@renderer/lib/format'
import { outputSize, type BackgroundAssets, type Composition } from '../studio/composition'
import { renderExportLayers } from '../studio/render-layers'
import { getTemplate } from '../studio/templates'
import { LAYOUTS } from '../studio/presets'
import { useExports } from './export-store'

export function ExportDialog({ open, onClose, rec, comp, assets }: { open: boolean; onClose: () => void; rec: RecordingMeta; comp: Composition; assets: BackgroundAssets }) {
  const { settings, toast } = useApp()
  const register = useExports((s) => s.register)
  const [fileName, setFileName] = useState('')
  const [dir, setDir] = useState('')
  const [resolution, setResolution] = useState<ExportResolution>(1080)
  const [fps, setFps] = useState<FrameRate>(30)
  const [quality, setQuality] = useState<QualityPreset>('high')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open || !settings) return
    setFileName(`${rec.name} - ${getTemplate(comp.templateId).name}`.replace(/[<>:"/\\|?*]/g, ''))
    setDir(settings.export.exportDir)
    setResolution(settings.export.resolution)
    setFps(rec.fps >= 50 ? settings.export.fps : 30)
    setQuality(settings.export.quality)
    // Reset the form from settings each time the dialog opens.
  }, [open])

  const out = outputSize(comp.aspect, resolution, { w: rec.width, h: rec.height })
  const sourceShort = Math.min(rec.width, rec.height)

  const start = async () => {
    setBusy(true)
    try {
      const layers = await renderExportLayers(comp, { w: rec.width, h: rec.height }, rec.hasCamera, out, assets)
      const layoutName = LAYOUTS.find((l) => l.id === comp.layoutId)?.name ?? 'Custom'
      const label = `${comp.background.kind === 'template' ? getTemplate(comp.templateId).name : 'Custom background'} · ${layoutName}`
      const { jobId } = await window.recova.export.start({
        recordingId: rec.id,
        outputDir: dir,
        fileName,
        width: out.w,
        height: out.h,
        fps,
        quality,
        label,
        layers: { background: layers.background, middle: layers.middle, foreground: layers.foreground },
        screen: { rect: layers.screenRect, mask: layers.screenMask, fit: comp.fit },
        camera: layers.cameraRect && layers.cameraMask ? { rect: layers.cameraRect, mask: layers.cameraMask, mirror: comp.camera.mirror } : null
      })
      register(jobId, `${fileName}.mp4`)
      toast({ kind: 'info', title: 'Export started', message: 'You can keep working while Recova renders your video.' })
      onClose()
    } catch (err) {
      toast({ kind: 'error', title: 'Could not start export', message: errorMessage(err) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Export video"
      width="max-w-lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void start()} loading={busy} disabled={!fileName.trim() || !dir}>
            Export MP4
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="File name">
          <div className="flex items-center gap-2">
            <TextInput value={fileName} onChange={(e) => setFileName(e.target.value)} maxLength={120} />
            <span className="text-[13px] text-ink-3">.mp4</span>
          </div>
        </Field>
        <Field label="Save to">
          <div className="flex gap-2">
            <div className="flex h-9 min-w-0 flex-1 items-center rounded-lg border border-line bg-surface-2 px-3 text-[12.5px] text-ink-2">
              <span className="truncate" title={dir}>
                {dir}
              </span>
            </div>
            <Button
              icon={Folder}
              onClick={async () => {
                const picked = await window.recova.settings.chooseDirectory('Choose export folder', dir)
                if (picked) setDir(picked)
              }}
            >
              Change
            </Button>
          </div>
        </Field>
        <Field label="Resolution" hint={`${out.w} × ${out.h} · H.264 video, AAC audio`}>
          <Segmented<ExportResolution> className="w-full" size="sm" value={resolution} onChange={setResolution} options={([720, 1080, 1440, 2160] as const).map((r) => ({ value: r, label: r === 2160 ? '4K' : `${r}p` }))} />
        </Field>
        {resolution > sourceShort && <Notice kind="info">The recording is {rec.width}×{rec.height}, so the video will be upscaled at this resolution.</Notice>}
        <div className="grid grid-cols-2 gap-4">
          <Field label="Frame rate">
            <Segmented<FrameRate> className="w-full" size="sm" value={fps} onChange={setFps} options={[{ value: 30, label: '30 fps' }, { value: 60, label: '60 fps', disabled: rec.fps < 50, title: rec.fps < 50 ? 'The recording was captured below 60 fps' : undefined }]} />
          </Field>
          <Field label="Quality">
            <Segmented<QualityPreset> className="w-full" size="sm" value={quality} onChange={setQuality} options={[{ value: 'standard', label: 'Standard' }, { value: 'high', label: 'High' }, { value: 'maximum', label: 'Max' }]} />
          </Field>
        </div>
        <p className="text-[12px] text-ink-3">The original recording is never changed. Exports render in the background — you can keep working.</p>
      </div>
    </Modal>
  )
}
