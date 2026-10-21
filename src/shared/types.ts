export type RecordingQuality = '720p' | '1080p' | '1440p'
export type FrameRate = 30 | 60
export type AudioMode = 'none' | 'mic' | 'system' | 'both'
export type CameraShape = 'circle' | 'rounded' | 'square'
export type CameraSize = 'small' | 'medium' | 'large'
export type Corner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
export type QualityPreset = 'standard' | 'high' | 'maximum'
export type ExportResolution = 720 | 1080 | 1440 | 2160
export type ThemePreference = 'light' | 'dark' | 'system'

export interface AppSettings {
  recording: {
    quality: RecordingQuality
    fps: FrameRate
    audioMode: AudioMode
    microphoneId: string | null
    micVolume: number
    recordingsDir: string
    countdownSeconds: 0 | 3 | 5
  }
  camera: {
    enabledByDefault: boolean
    cameraId: string | null
    shape: CameraShape
    size: CameraSize
    position: Corner
  }
  export: {
    format: 'mp4'
    resolution: ExportResolution
    quality: QualityPreset
    fps: FrameRate
    exportDir: string
  }
  app: {
    theme: ThemePreference
    launchAtLogin: boolean
    startupView: 'dashboard' | 'new-recording'
  }
}

export type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] }

export interface ExportEntry {
  id: string
  path: string
  createdAt: string
  width: number
  height: number
  label: string
}

export interface RecordingMeta {
  id: string
  name: string
  createdAt: string
  durationSec: number
  width: number
  height: number
  fps: number
  audio: { microphone: boolean; systemAudio: boolean }
  hasCamera: boolean
  camera: { width: number; height: number; offsetMs: number } | null
  dir: string
  screenPath: string
  cameraPath: string | null
  thumbnailPath: string | null
  sizeBytes: number
  exports: ExportEntry[]
  recovered?: boolean
}

export interface LibraryItem extends RecordingMeta {
  missing: boolean
  cameraMissing: boolean
}

export interface CaptureSource {
  id: string
  name: string
  kind: 'screen' | 'window'
  thumbnail: string
  appIcon: string | null
  display: { width: number; height: number; scaleFactor: number; primary: boolean } | null
}

export interface PlatformInfo {
  platform: NodeJS.Platform | string
  systemAudioSupported: boolean
  systemAudioNote: string
  toolbarExcludedFromCapture: boolean
  appVersion: string
  electronVersion: string
  chromeVersion: string
  userDataDir: string
  ffmpegAvailable: boolean
}

export type TrackKind = 'screen' | 'camera'

export interface BeginRecordingOptions {
  hasCamera: boolean
}

export interface FinishRecordingInfo {
  width: number
  height: number
  fps: number
  audio: { microphone: boolean; systemAudio: boolean }
  camera: { width: number; height: number; offsetMs: number } | null
}

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface ExportRequest {
  recordingId: string
  outputDir: string
  fileName: string
  width: number
  height: number
  fps: FrameRate
  quality: QualityPreset
  label: string
  /** PNG layers rendered by the shared composition engine. */
  layers: { background: ArrayBuffer; middle: ArrayBuffer; foreground: ArrayBuffer }
  screen: { rect: Rect; mask: ArrayBuffer; fit: 'fit' | 'fill' }
  camera: { rect: Rect; mask: ArrayBuffer; mirror: boolean } | null
}

export type ExportStatus = 'running' | 'done' | 'error' | 'cancelled'

export interface ExportProgress {
  jobId: string
  recordingId: string
  status: ExportStatus
  progress: number
  elapsedSec: number
  etaSec: number | null
  outputPath: string
  error?: string
}

export type ToolbarCommand = 'countdown-done' | 'pause' | 'resume' | 'stop' | 'cancel'

export interface RecorderState {
  phase: 'countdown' | 'recording' | 'paused' | 'saving'
  elapsedMs: number
  countdown: number
  micActive: boolean
  cameraActive: boolean
  warning: string | null
}

export interface RecovaApi {
  platform: { info(): Promise<PlatformInfo> }
  settings: {
    get(): Promise<AppSettings>
    update(patch: DeepPartial<AppSettings>): Promise<AppSettings>
    reset(): Promise<AppSettings>
    chooseDirectory(title: string, defaultPath?: string): Promise<string | null>
    storageInfo(): Promise<{ recordingsDir: string; userDataDir: string; recordingsBytes: number; recordingCount: number }>
  }
  capture: {
    listSources(): Promise<CaptureSource[]>
    /** Selects the source that the next getDisplayMedia() call will receive. */
    prepare(sourceId: string, withSystemAudio: boolean): Promise<void>
  }
  recording: {
    begin(opts: BeginRecordingOptions): Promise<{ sessionId: string }>
    writeChunk(sessionId: string, track: TrackKind, data: ArrayBuffer): Promise<void>
    finish(sessionId: string, info: FinishRecordingInfo): Promise<RecordingMeta>
    discard(sessionId: string): Promise<void>
    showToolbar(countdown: number): Promise<void>
    hideToolbar(): Promise<void>
    pushState(state: RecorderState): void
    onCommand(cb: (cmd: ToolbarCommand) => void): () => void
  }
  toolbar: {
    command(cmd: ToolbarCommand): void
    onState(cb: (state: RecorderState) => void): () => void
    onCountdown(cb: (seconds: number) => void): () => void
  }
  library: {
    list(): Promise<LibraryItem[]>
    rename(id: string, name: string): Promise<LibraryItem>
    remove(id: string): Promise<void>
    reveal(id: string): Promise<void>
    revealExport(id: string, exportId: string): Promise<void>
    openExport(id: string, exportId: string): Promise<void>
    removeExport(id: string, exportId: string): Promise<void>
    openRecordingsFolder(): Promise<void>
    onChanged(cb: () => void): () => void
  }
  studio: {
    importBackground(): Promise<{ id: string; url: string } | null>
  }
  export: {
    start(req: ExportRequest): Promise<{ jobId: string }>
    cancel(jobId: string): Promise<void>
    onProgress(cb: (p: ExportProgress) => void): () => void
  }
  app: {
    setLaunchAtLogin(enabled: boolean): Promise<void>
  }
}
