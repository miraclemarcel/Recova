import { randomUUID } from 'node:crypto'
import { createWriteStream, existsSync, promises as fs, type WriteStream } from 'node:fs'
import { join } from 'node:path'
import type { BeginRecordingOptions, FinishRecordingInfo, RecordingMeta, TrackKind } from '@shared/types'
import { addRecording, knownIds } from './library'
import { getSettings } from './settings'
import { makeThumbnail, measureDuration, probe, remuxWebm } from './ffmpeg'

interface Session {
  id: string
  dir: string
  streams: Partial<Record<TrackKind, WriteStream>>
  pending: Promise<void>
}

const sessions = new Map<string, Session>()
const SESSION_MARKER = 'session.json'
const rawName = (t: TrackKind) => `${t}.raw.webm`

function defaultName(date: Date): string {
  const day = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  const time = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  return `Recording ${day}, ${time}`
}

/** Starts a session. Chunks are streamed straight to disk so long recordings never sit in memory. */
export async function beginRecording(opts: BeginRecordingOptions): Promise<{ sessionId: string }> {
  const settings = await getSettings()
  const id = randomUUID()
  const dir = join(settings.recording.recordingsDir, id)
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(join(dir, SESSION_MARKER), JSON.stringify({ id, startedAt: new Date().toISOString(), hasCamera: opts.hasCamera }))
  const streams: Session['streams'] = { screen: createWriteStream(join(dir, rawName('screen'))) }
  if (opts.hasCamera) streams.camera = createWriteStream(join(dir, rawName('camera')))
  sessions.set(id, { id, dir, streams, pending: Promise.resolve() })
  return { sessionId: id }
}

function writeTo(stream: WriteStream, data: Buffer): Promise<void> {
  return new Promise((resolve, reject) => stream.write(data, (err) => (err ? reject(err) : resolve())))
}

export function writeChunk(sessionId: string, track: TrackKind, data: ArrayBuffer): Promise<void> {
  const s = sessions.get(sessionId)
  const stream = s?.streams[track]
  if (!s || !stream) return Promise.reject(new Error('Recording session is not active.'))
  s.pending = s.pending.then(() => writeTo(stream, Buffer.from(data)))
  return s.pending
}

async function closeStreams(s: Session): Promise<void> {
  await s.pending.catch(() => undefined)
  await Promise.all(
    Object.values(s.streams).map((st) => new Promise<void>((resolve) => (st.closed ? resolve() : st.end(() => resolve()))))
  )
}

async function nonEmpty(path: string): Promise<boolean> {
  return existsSync(path) && (await fs.stat(path)).size > 0
}

async function finalizeDir(id: string, dir: string, info: FinishRecordingInfo | null, name: string): Promise<RecordingMeta> {
  const screenRaw = join(dir, rawName('screen'))
  const screenPath = join(dir, 'screen.webm')
  if (!(await nonEmpty(screenRaw))) throw new Error('No video data was captured.')
  await remuxWebm(screenRaw, screenPath)

  let cameraPath: string | null = null
  const cameraRaw = join(dir, rawName('camera'))
  if (await nonEmpty(cameraRaw)) {
    cameraPath = join(dir, 'camera.webm')
    try {
      await remuxWebm(cameraRaw, cameraPath)
    } catch {
      cameraPath = null
    }
  }

  const p = await probe(screenPath)
  const durationSec = p.durationSec > 0 ? p.durationSec : await measureDuration(screenPath)
  const thumb = join(dir, 'thumbnail.jpg')
  const hasThumb = await makeThumbnail(screenPath, thumb, Math.min(1, durationSec / 2))

  let camera = cameraPath ? (info?.camera ?? null) : null
  if (cameraPath && !camera) {
    const cp = await probe(cameraPath)
    camera = { width: cp.width, height: cp.height, offsetMs: 0 }
  }

  await fs.rm(screenRaw, { force: true })
  await fs.rm(cameraRaw, { force: true })
  const camSize = cameraPath ? (await fs.stat(cameraPath)).size : 0
  const meta: RecordingMeta = {
    id,
    name,
    createdAt: new Date().toISOString(),
    durationSec,
    width: p.width || info?.width || 0,
    height: p.height || info?.height || 0,
    fps: info?.fps || Math.round(p.fps) || 30,
    audio: info?.audio ?? { microphone: p.hasAudio, systemAudio: false },
    hasCamera: cameraPath !== null,
    camera,
    dir,
    screenPath,
    cameraPath,
    thumbnailPath: hasThumb ? thumb : null,
    sizeBytes: (await fs.stat(screenPath)).size + camSize,
    exports: []
  }
  await fs.writeFile(join(dir, 'recording.json'), JSON.stringify(meta, null, 2))
  await fs.rm(join(dir, SESSION_MARKER), { force: true })
  return meta
}

export async function finishRecording(sessionId: string, info: FinishRecordingInfo): Promise<RecordingMeta> {
  const s = sessions.get(sessionId)
  if (!s) throw new Error('Recording session is not active.')
  sessions.delete(sessionId)
  await closeStreams(s)
  const meta = await finalizeDir(s.id, s.dir, info, defaultName(new Date()))
  await addRecording(meta)
  return meta
}

export async function discardRecording(sessionId: string): Promise<void> {
  const s = sessions.get(sessionId)
  if (!s) return
  sessions.delete(sessionId)
  await closeStreams(s)
  await fs.rm(s.dir, { recursive: true, force: true })
}

/** Finalises recordings that were interrupted (crash, power loss) during a previous run. */
export async function recoverInterrupted(): Promise<number> {
  const root = (await getSettings()).recording.recordingsDir
  if (!existsSync(root)) return 0
  const known = await knownIds()
  let recovered = 0
  for (const entry of await fs.readdir(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || known.has(entry.name) || sessions.has(entry.name)) continue
    const dir = join(root, entry.name)
    if (!existsSync(join(dir, SESSION_MARKER))) continue
    try {
      const meta = await finalizeDir(entry.name, dir, null, `Recovered recording (${new Date().toLocaleDateString()})`)
      await addRecording({ ...meta, recovered: true })
      recovered++
    } catch {
      // Nothing usable was written before the interruption.
      await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined)
    }
  }
  return recovered
}

/** Flushes any open sessions to disk on quit so they can be recovered next launch. */
export async function flushActiveSessions(): Promise<void> {
  await Promise.all([...sessions.values()].map((s) => closeStreams(s)))
}
