import { create } from 'zustand'
import type { FrameRate, RecorderState, RecordingMeta, RecordingQuality, ToolbarCommand, TrackKind } from '@shared/types'
import { QUALITY_DIMENSIONS } from '@shared/constants'
import { createAudioMix, stopStream, type AudioMix } from '../audio/mixer'
import { mediaErrorMessage } from './devices'

export interface SessionConfig {
  sourceId: string
  sourceName: string
  systemAudio: boolean
  micDeviceId: string | null
  micGain: number
  cameraDeviceId: string | null
  quality: RecordingQuality
  fps: FrameRate
  countdown: number
}

type Status = 'idle' | 'preparing' | 'countdown' | 'recording' | 'paused' | 'saving'

interface RecorderStore {
  status: Status
  elapsedMs: number
  warnings: string[]
  captured: { width: number; height: number; fps: number } | null
  config: SessionConfig | null
}

export const useRecorder = create<RecorderStore>(() => ({ status: 'idle', elapsedMs: 0, warnings: [], captured: null, config: null }))

const set = useRecorder.setState
const get = useRecorder.getState

const SCREEN_MIME = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
const CAMERA_MIME = ['video/webm;codecs=vp8', 'video/webm;codecs=vp9', 'video/webm']

function pickMime(candidates: string[], heavy: boolean): string {
  // VP8 is much cheaper to encode, so prefer it for 1440p or 60 fps captures.
  const ordered = heavy ? [candidates[1], candidates[0], ...candidates.slice(2)] : candidates
  return ordered.find((m) => MediaRecorder.isTypeSupported(m)) ?? ''
}

function bitrate(width: number, height: number, fps: number): number {
  const pixels = width * height * fps
  return Math.round(Math.min(40e6, Math.max(4e6, pixels * 0.12)))
}

class TrackWriter {
  private queue: Promise<void> = Promise.resolve()
  failed: Error | null = null
  constructor(
    private sessionId: string,
    private track: TrackKind,
    private onError: (e: Error) => void
  ) {}
  push(blob: Blob): void {
    if (blob.size === 0 || this.failed) return
    this.queue = this.queue
      .then(async () => {
        if (this.failed) return
        await window.recova.recording.writeChunk(this.sessionId, this.track, await blob.arrayBuffer())
      })
      .catch((err: unknown) => {
        this.failed = err instanceof Error ? err : new Error(String(err))
        this.onError(this.failed)
      })
  }
  flush(): Promise<void> {
    return this.queue
  }
}

interface Live {
  sessionId: string
  display: MediaStream
  mic: MediaStream | null
  camera: MediaStream | null
  mix: AudioMix
  screenRec: MediaRecorder
  cameraRec: MediaRecorder | null
  writers: TrackWriter[]
  screenStartedAt: number
  cameraStartedAt: number
  activeSince: number
  accumulated: number
  ticker: number
  unsubscribe: () => void
  stopping: boolean
  onFinished: (meta: RecordingMeta | null, error: string | null) => void
}

let live: Live | null = null

function elapsed(): number {
  if (!live) return 0
  return live.accumulated + (get().status === 'recording' ? performance.now() - live.activeSince : 0)
}

function pushState(countdown = 0): void {
  const s = get()
  const phase: RecorderState['phase'] = s.status === 'countdown' ? 'countdown' : s.status === 'paused' ? 'paused' : s.status === 'saving' ? 'saving' : 'recording'
  window.recova.recording.pushState({
    phase,
    elapsedMs: elapsed(),
    countdown,
    micActive: !!live?.mic?.getAudioTracks().some((t) => t.readyState === 'live'),
    cameraActive: !!live?.camera?.getVideoTracks().some((t) => t.readyState === 'live'),
    warning: s.warnings[s.warnings.length - 1] ?? null
  })
}

function warn(message: string): void {
  if (!get().warnings.includes(message)) set({ warnings: [...get().warnings, message] })
  pushState()
}

function releaseMedia(l: Live): void {
  window.clearInterval(l.ticker)
  l.unsubscribe()
  stopStream(l.display)
  stopStream(l.mic)
  stopStream(l.camera)
  l.mix.dispose()
}

function stopRecorder(rec: MediaRecorder | null): Promise<void> {
  if (!rec || rec.state === 'inactive') return Promise.resolve()
  return new Promise((resolve) => {
    rec.addEventListener('stop', () => resolve(), { once: true })
    rec.stop()
  })
}

/**
 * Acquires all streams, opens a disk-backed session in the main process, shows the
 * floating toolbar countdown and then starts recording. Resolves once the recording
 * is saved (meta) or discarded (null).
 */
export async function startSession(config: SessionConfig, onFinished: Live['onFinished']): Promise<void> {
  if (live || get().status !== 'idle') throw new Error('A recording is already in progress.')
  set({ status: 'preparing', warnings: [], elapsedMs: 0, captured: null, config })
  const dims = QUALITY_DIMENSIONS[config.quality]
  let display: MediaStream | null = null
  let mic: MediaStream | null = null
  let camera: MediaStream | null = null
  try {
    await window.recova.capture.prepare(config.sourceId, config.systemAudio)
    try {
      display = await navigator.mediaDevices.getDisplayMedia({
        video: { width: { max: dims.width }, height: { max: dims.height }, frameRate: { ideal: config.fps, max: config.fps } },
        audio: config.systemAudio
      })
    } catch (err) {
      throw new Error(mediaErrorMessage(err, 'screen'))
    }
    const vt = display.getVideoTracks()[0]
    if (!vt) throw new Error('The selected source did not provide any video.')
    const settings = vt.getSettings()
    const captured = { width: settings.width ?? dims.width, height: settings.height ?? dims.height, fps: Math.round(settings.frameRate ?? config.fps) }
    set({ captured })
    if (config.systemAudio && display.getAudioTracks().length === 0) warn('System audio is not available for this source, so it will not be recorded.')

    if (config.micDeviceId !== null) {
      try {
        mic = await navigator.mediaDevices.getUserMedia({
          audio: { deviceId: config.micDeviceId ? { exact: config.micDeviceId } : undefined, echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 }
        })
      } catch (err) {
        warn(`${mediaErrorMessage(err, 'microphone')} Recording continues without the microphone.`)
      }
    }
    if (config.cameraDeviceId !== null) {
      try {
        camera = await navigator.mediaDevices.getUserMedia({
          video: { deviceId: config.cameraDeviceId ? { exact: config.cameraDeviceId } : undefined, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } }
        })
      } catch (err) {
        warn(`${mediaErrorMessage(err, 'camera')} Recording continues without the facecam.`)
      }
    }

    const mix = createAudioMix(mic, config.systemAudio ? display : null, config.micGain)
    const recordStream = new MediaStream([vt, ...(mix.track ? [mix.track] : [])])
    const heavy = captured.width * captured.height * captured.fps > 1920 * 1080 * 30
    const screenRec = new MediaRecorder(recordStream, {
      mimeType: pickMime(SCREEN_MIME, heavy) || undefined,
      videoBitsPerSecond: bitrate(captured.width, captured.height, captured.fps),
      audioBitsPerSecond: 160_000
    })
    const cameraRec = camera ? new MediaRecorder(camera, { mimeType: pickMime(CAMERA_MIME, false) || undefined, videoBitsPerSecond: 3_000_000 }) : null

    const { sessionId } = await window.recova.recording.begin({ hasCamera: cameraRec !== null })
    const onWriteError = (e: Error) => {
      warn(`Could not write to disk: ${e.message}`)
      void stopSession()
    }
    const screenWriter = new TrackWriter(sessionId, 'screen', onWriteError)
    const cameraWriter = new TrackWriter(sessionId, 'camera', onWriteError)
    screenRec.ondataavailable = (e) => screenWriter.push(e.data)
    if (cameraRec) cameraRec.ondataavailable = (e) => cameraWriter.push(e.data)
    screenRec.onerror = () => {
      warn('The screen recorder stopped unexpectedly. Saving what was captured.')
      void stopSession()
    }

    live = {
      sessionId,
      display,
      mic,
      camera,
      mix,
      screenRec,
      cameraRec,
      writers: cameraRec ? [screenWriter, cameraWriter] : [screenWriter],
      screenStartedAt: 0,
      cameraStartedAt: 0,
      activeSince: 0,
      accumulated: 0,
      ticker: 0,
      unsubscribe: () => undefined,
      stopping: false,
      onFinished
    }
    const l = live

    // Device / source loss handling.
    vt.addEventListener('ended', () => {
      if (get().status === 'countdown') void cancelSession()
      else {
        warn('Screen sharing ended. The recording was saved.')
        void stopSession()
      }
    })
    mic?.getAudioTracks()[0]?.addEventListener('ended', () => warn('The microphone was disconnected. Recording continues without it.'))
    camera?.getVideoTracks()[0]?.addEventListener('ended', () => {
      warn('The camera was disconnected. Facecam recording stopped.')
      if (l.cameraRec?.state !== 'inactive') l.cameraRec?.stop()
    })

    l.unsubscribe = window.recova.recording.onCommand((cmd: ToolbarCommand) => {
      if (cmd === 'countdown-done') begin()
      else if (cmd === 'pause') pauseSession()
      else if (cmd === 'resume') resumeSession()
      else if (cmd === 'stop') void stopSession()
      else if (cmd === 'cancel') void cancelSession()
    })
    set({ status: 'countdown' })
    await window.recova.recording.showToolbar(config.countdown)
  } catch (err) {
    stopStream(display)
    stopStream(mic)
    stopStream(camera)
    live = null
    set({ status: 'idle' })
    throw err
  }
}

function begin(): void {
  const l = live
  if (!l || get().status !== 'countdown') return
  l.screenRec.addEventListener('start', () => (l.screenStartedAt = performance.now()), { once: true })
  l.cameraRec?.addEventListener('start', () => (l.cameraStartedAt = performance.now()), { once: true })
  l.screenRec.start(1000)
  l.cameraRec?.start(1000)
  l.activeSince = performance.now()
  set({ status: 'recording' })
  l.ticker = window.setInterval(() => {
    set({ elapsedMs: elapsed() })
    pushState()
  }, 250)
  pushState()
}

export function pauseSession(): void {
  const l = live
  if (!l || get().status !== 'recording') return
  l.screenRec.pause()
  if (l.cameraRec?.state === 'recording') l.cameraRec.pause()
  l.accumulated += performance.now() - l.activeSince
  set({ status: 'paused' })
  pushState()
}

export function resumeSession(): void {
  const l = live
  if (!l || get().status !== 'paused') return
  l.screenRec.resume()
  if (l.cameraRec?.state === 'paused') l.cameraRec.resume()
  l.activeSince = performance.now()
  set({ status: 'recording' })
  pushState()
}

export async function stopSession(): Promise<void> {
  const l = live
  if (!l || l.stopping) return
  if (get().status === 'countdown') return cancelSession()
  l.stopping = true
  const status = get().status
  if (status === 'recording') l.accumulated += performance.now() - l.activeSince
  set({ status: 'saving', elapsedMs: l.accumulated })
  pushState()
  let meta: RecordingMeta | null = null
  let error: string | null = null
  try {
    await Promise.all([stopRecorder(l.screenRec), stopRecorder(l.cameraRec)])
    await Promise.all(l.writers.map((w) => w.flush()))
    const failed = l.writers.find((w) => w.failed)
    if (failed?.failed && l.writers[0].failed) throw l.writers[0].failed
    const s = get().captured
    meta = await window.recova.recording.finish(l.sessionId, {
      width: s?.width ?? 0,
      height: s?.height ?? 0,
      fps: s?.fps ?? 30,
      audio: { microphone: !!l.mic, systemAudio: (get().config?.systemAudio ?? false) && l.display.getAudioTracks().length > 0 },
      camera: l.camera && l.cameraStartedAt
        ? {
            width: l.camera.getVideoTracks()[0]?.getSettings().width ?? 0,
            height: l.camera.getVideoTracks()[0]?.getSettings().height ?? 0,
            offsetMs: Math.round(l.cameraStartedAt - l.screenStartedAt)
          }
        : null
    })
  } catch (err) {
    error = err instanceof Error ? err.message.replace(/^Error invoking remote method '[^']+': (?:\w*Error: )?/, '') : String(err)
  } finally {
    releaseMedia(l)
    live = null
    set({ status: 'idle', elapsedMs: 0 })
    await window.recova.recording.hideToolbar()
    l.onFinished(meta, error)
  }
}

export async function cancelSession(): Promise<void> {
  const l = live
  if (!l || l.stopping) return
  l.stopping = true
  l.screenRec.ondataavailable = null
  if (l.cameraRec) l.cameraRec.ondataavailable = null
  await Promise.all([stopRecorder(l.screenRec), stopRecorder(l.cameraRec)])
  await Promise.all(l.writers.map((w) => w.flush()))
  releaseMedia(l)
  live = null
  set({ status: 'idle', elapsedMs: 0 })
  await window.recova.recording.discard(l.sessionId).catch(() => undefined)
  await window.recova.recording.hideToolbar()
  l.onFinished(null, null)
}

export function setLiveMicGain(gain: number): void {
  live?.mix.setMicGain(gain)
}
