import type { ExportRequest, QualityPreset, RecordingMeta } from '@shared/types'

const QUALITY: Record<QualityPreset, { crf: number; preset: string; audio: string }> = {
  standard: { crf: 23, preset: 'veryfast', audio: '160k' },
  high: { crf: 19, preset: 'fast', audio: '192k' },
  maximum: { crf: 16, preset: 'medium', audio: '256k' }
}

export const even = (n: number) => Math.max(2, Math.round(n / 2) * 2)
const int = (n: number) => Math.round(n)

export interface LayerFiles {
  background: string
  middle: string
  foreground: string
  screenMask: string
  cameraMask: string | null
}

/**
 * Builds the FFmpeg command that composites the recording onto the pre-rendered layers.
 * Layer order mirrors the live preview: background → screen (masked) → middle → camera (masked) → foreground.
 */
export function buildExportArgs(req: Omit<ExportRequest, 'layers' | 'screen' | 'camera'> & {
  screen: { rect: ExportRequest['screen']['rect']; fit: 'fit' | 'fill' }
  camera: { rect: ExportRequest['screen']['rect']; mirror: boolean } | null
}, rec: Pick<RecordingMeta, 'screenPath' | 'cameraPath' | 'durationSec' | 'camera'>, layers: LayerFiles, outputPath: string): string[] {
  const fps = req.fps
  const dur = Math.max(0.1, rec.durationSec).toFixed(3)
  const still = (file: string) => ['-loop', '1', '-framerate', String(fps), '-t', dur, '-i', file]
  const args = ['-y', '-i', rec.screenPath, ...still(layers.background), ...still(layers.screenMask), ...still(layers.middle), ...still(layers.foreground)]

  const s = req.screen.rect
  const sw = even(s.w)
  const sh = even(s.h)
  const scaleScreen =
    req.screen.fit === 'fill'
      ? `scale=${sw}:${sh}:force_original_aspect_ratio=increase:flags=lanczos,crop=${sw}:${sh}`
      : `scale=${sw}:${sh}:flags=lanczos`
  const filters = [
    `[0:v]setpts=PTS-STARTPTS,fps=${fps},${scaleScreen},setsar=1,format=rgba[sv]`,
    `[2:v]format=gray,scale=${sw}:${sh}[sm]`,
    `[sv][sm]alphamerge[sa]`,
    `[1:v]format=rgba[bg]`,
    `[bg][sa]overlay=${int(s.x)}:${int(s.y)}:eof_action=repeat[c1]`,
    `[c1][3:v]overlay=0:0[c2]`
  ]
  let last = 'c2'

  if (req.camera && rec.cameraPath && layers.cameraMask) {
    args.push('-i', rec.cameraPath, ...still(layers.cameraMask))
    const c = req.camera.rect
    const cw = even(c.w)
    const ch = even(c.h)
    const offset = (rec.camera?.offsetMs ?? 0) / 1000
    const timing = offset >= 0 ? `setpts=PTS-STARTPTS+${offset.toFixed(3)}/TB` : `trim=start=${(-offset).toFixed(3)},setpts=PTS-STARTPTS`
    filters.push(
      `[5:v]${timing},fps=${fps},scale=${cw}:${ch}:force_original_aspect_ratio=increase,crop=${cw}:${ch}${req.camera.mirror ? ',hflip' : ''},setsar=1,format=rgba[cv]`,
      `[6:v]format=gray,scale=${cw}:${ch}[cm]`,
      `[cv][cm]alphamerge[ca]`,
      `[c2][ca]overlay=${int(c.x)}:${int(c.y)}:eof_action=pass[c3]`
    )
    last = 'c3'
  }
  filters.push(`[${last}][4:v]overlay=0:0,format=yuv420p[out]`)

  const q = QUALITY[req.quality]
  args.push(
    '-filter_complex', filters.join(';'),
    '-map', '[out]',
    '-map', '0:a?',
    '-c:v', 'libx264', '-preset', q.preset, '-crf', String(q.crf), '-pix_fmt', 'yuv420p', '-r', String(fps),
    '-c:a', 'aac', '-b:a', q.audio, '-ar', '48000',
    '-t', dur,
    '-movflags', '+faststart',
    '-progress', 'pipe:1', '-nostats',
    outputPath
  )
  return args
}

