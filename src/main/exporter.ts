import { app, BrowserWindow } from 'electron'
import type { ChildProcess } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync, promises as fs } from 'node:fs'
import { extname, join } from 'node:path'
import type { ExportProgress, ExportRequest } from '@shared/types'
import { buildExportArgs, even, type LayerFiles } from './export-args'
import { getRecording, updateRecording } from './library'
import { lastLines, runFfmpeg } from './ffmpeg'

interface Job {
  id: string
  proc: ChildProcess | null
  cancelled: boolean
}

const jobs = new Map<string, Job>()

function broadcast(p: ExportProgress): void {
  for (const w of BrowserWindow.getAllWindows()) w.webContents.send('export:progress', p)
}

function sanitizeFileName(name: string): string {
  const base = name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '').trim().replace(/\.mp4$/i, '') || 'Recova export'
  return base.slice(0, 120)
}

function uniquePath(dir: string, base: string): string {
  let candidate = join(dir, `${base}.mp4`)
  for (let i = 2; existsSync(candidate); i++) candidate = join(dir, `${base} (${i}).mp4`)
  return candidate
}

export async function startExport(req: ExportRequest): Promise<{ jobId: string }> {
  const rec = await getRecording(req.recordingId)
  if (!existsSync(rec.screenPath)) throw new Error('The original recording file is missing. It may have been moved or deleted.')
  const width = even(req.width)
  const height = even(req.height)
  await fs.mkdir(req.outputDir, { recursive: true })
  const outputPath = uniquePath(req.outputDir, sanitizeFileName(req.fileName))
  const job: Job = { id: randomUUID(), proc: null, cancelled: false }
  jobs.set(job.id, job)

  const tmp = join(app.getPath('temp'), `recova-export-${job.id}`)
  await fs.mkdir(tmp, { recursive: true })
  const write = async (name: string, data: ArrayBuffer) => {
    const p = join(tmp, name)
    await fs.writeFile(p, Buffer.from(data))
    return p
  }
  const layers: LayerFiles = {
    background: await write('background.png', req.layers.background),
    middle: await write('middle.png', req.layers.middle),
    foreground: await write('foreground.png', req.layers.foreground),
    screenMask: await write('screen-mask.png', req.screen.mask),
    cameraMask: req.camera ? await write('camera-mask.png', req.camera.mask) : null
  }
  const useCamera = req.camera !== null && rec.cameraPath !== null && existsSync(rec.cameraPath)
  const args = buildExportArgs(
    { ...req, width, height, screen: req.screen, camera: useCamera ? req.camera : null },
    rec,
    layers,
    outputPath
  )

  const started = Date.now()
  const base = { jobId: job.id, recordingId: rec.id, outputPath }
  const elapsed = () => (Date.now() - started) / 1000
  broadcast({ ...base, status: 'running', progress: 0, elapsedSec: 0, etaSec: null })

  let buffer = ''
  const onStdout = (chunk: string) => {
    buffer += chunk
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      const m = /^out_time_us=(\d+)/.exec(line.trim())
      if (!m || rec.durationSec <= 0) continue
      const progress = Math.min(0.999, Number(m[1]) / 1e6 / rec.durationSec)
      const e = elapsed()
      broadcast({ ...base, status: 'running', progress, elapsedSec: e, etaSec: progress > 0.02 ? (e / progress) * (1 - progress) : null })
    }
  }

  // Runs in the background; the IPC call returns immediately with the job id.
  void runFfmpeg(args, onStdout, (proc) => (job.proc = proc))
    .then(async ({ code, stderr }) => {
      if (job.cancelled) {
        await fs.rm(outputPath, { force: true })
        broadcast({ ...base, status: 'cancelled', progress: 0, elapsedSec: elapsed(), etaSec: null })
        return
      }
      if (code !== 0 || !existsSync(outputPath)) {
        await fs.rm(outputPath, { force: true })
        throw new Error(`FFmpeg failed: ${lastLines(stderr)}`)
      }
      await updateRecording(rec.id, (m) => ({
        ...m,
        exports: [
          ...m.exports,
          { id: randomUUID(), path: outputPath, createdAt: new Date().toISOString(), width, height, label: req.label }
        ]
      }))
      broadcast({ ...base, status: 'done', progress: 1, elapsedSec: elapsed(), etaSec: 0 })
    })
    .catch((err: unknown) => {
      broadcast({ ...base, status: 'error', progress: 0, elapsedSec: elapsed(), etaSec: null, error: err instanceof Error ? err.message : String(err) })
    })
    .finally(() => {
      jobs.delete(job.id)
      void fs.rm(tmp, { recursive: true, force: true })
    })

  return { jobId: job.id }
}

export async function cancelExport(jobId: string): Promise<void> {
  const job = jobs.get(jobId)
  if (!job) return
  job.cancelled = true
  job.proc?.kill()
}

export function cancelAllExports(): void {
  for (const job of jobs.values()) {
    job.cancelled = true
    job.proc?.kill()
  }
}

export const imageExtensions = new Set(['.png', '.jpg', '.jpeg', '.webp'])
export const isImage = (p: string) => imageExtensions.has(extname(p).toLowerCase())
