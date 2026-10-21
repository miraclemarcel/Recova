import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import ffmpegStatic from 'ffmpeg-static'

/** Resolves the bundled FFmpeg binary; inside a packaged app it lives in app.asar.unpacked. */
export function ffmpegPath(): string {
  const p = (ffmpegStatic as unknown as string | null) ?? ''
  return p.replace(/app\.asar([\\/])/, 'app.asar.unpacked$1')
}

export function ffmpegAvailable(): boolean {
  const p = ffmpegPath()
  return p.length > 0 && existsSync(p)
}

export interface RunResult {
  code: number | null
  stderr: string
}

export function runFfmpeg(args: string[], onStdout?: (chunk: string) => void, onSpawn?: (proc: ChildProcess) => void): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath(), ['-hide_banner', '-nostdin', ...args], { windowsHide: true })
    onSpawn?.(proc)
    let stderr = ''
    proc.stderr.setEncoding('utf8')
    proc.stderr.on('data', (d: string) => {
      stderr += d
      if (stderr.length > 200_000) stderr = stderr.slice(-100_000)
    })
    proc.stdout.setEncoding('utf8')
    proc.stdout.on('data', (d: string) => onStdout?.(d))
    proc.on('error', reject)
    proc.on('close', (code) => resolve({ code, stderr }))
  })
}

export interface ProbeResult {
  durationSec: number
  width: number
  height: number
  fps: number
  hasAudio: boolean
}

/** Probes a media file by parsing `ffmpeg -i` output (avoids shipping ffprobe). */
export async function probe(file: string): Promise<ProbeResult> {
  const { stderr } = await runFfmpeg(['-i', file])
  const dur = /Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/.exec(stderr)
  const video = /Stream #[^\n]*Video:[^\n]*?(\d{2,5})x(\d{2,5})/.exec(stderr)
  const fps = /Stream #[^\n]*Video:[^\n]*?(\d+(?:\.\d+)?) fps/.exec(stderr)
  return {
    durationSec: dur ? Number(dur[1]) * 3600 + Number(dur[2]) * 60 + Number(dur[3]) : 0,
    width: video ? Number(video[1]) : 0,
    height: video ? Number(video[2]) : 0,
    fps: fps ? Number(fps[1]) : 0,
    hasAudio: /Stream #[^\n]*Audio:/.test(stderr)
  }
}

/** Measures exact duration by decoding (needed for MediaRecorder WebM files without duration headers). */
export async function measureDuration(file: string): Promise<number> {
  const { stderr } = await runFfmpeg(['-i', file, '-map', '0:v:0', '-f', 'null', '-'])
  const all = [...stderr.matchAll(/time=(\d+):(\d+):(\d+(?:\.\d+)?)/g)]
  const last = all[all.length - 1]
  return last ? Number(last[1]) * 3600 + Number(last[2]) * 60 + Number(last[3]) : 0
}

/** Rewrites a MediaRecorder WebM so it has duration metadata and seek cues. */
export async function remuxWebm(input: string, output: string): Promise<void> {
  const r = await runFfmpeg(['-y', '-fflags', '+genpts', '-i', input, '-c', 'copy', output])
  if (r.code !== 0) throw new Error(`Could not finalise recording: ${lastLines(r.stderr)}`)
}

export async function makeThumbnail(input: string, output: string, atSec: number): Promise<boolean> {
  const r = await runFfmpeg(['-y', '-ss', String(Math.max(0, atSec)), '-i', input, '-frames:v', '1', '-vf', 'scale=640:-2', '-q:v', '4', output])
  return r.code === 0 && existsSync(output)
}

export function lastLines(text: string, n = 4): string {
  return text.trim().split(/\r?\n/).slice(-n).join(' ')
}
