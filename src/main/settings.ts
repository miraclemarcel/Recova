import { app } from 'electron'
import { join } from 'node:path'
import type { AppSettings, DeepPartial } from '@shared/types'
import { createQueue, readJson, writeJson } from './json-store'

const file = () => join(app.getPath('userData'), 'settings.json')
const queue = createQueue()
let cache: AppSettings | null = null

export function defaultSettings(): AppSettings {
  const videos = app.getPath('videos')
  return {
    recording: {
      quality: '1080p',
      fps: 30,
      audioMode: 'mic',
      microphoneId: null,
      micVolume: 1,
      recordingsDir: join(videos, 'Recova', 'Recordings'),
      countdownSeconds: 3
    },
    camera: { enabledByDefault: false, cameraId: null, shape: 'circle', size: 'medium', position: 'bottom-right' },
    export: { format: 'mp4', resolution: 1080, quality: 'high', fps: 30, exportDir: join(videos, 'Recova', 'Exports') },
    app: { theme: 'light', launchAtLogin: false, startupView: 'dashboard' }
  }
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** Merges `patch` into `base`, only accepting keys that exist in base with a matching type. */
function merge<T>(base: T, patch: unknown): T {
  if (!isPlainObject(base) || !isPlainObject(patch)) return base
  const out: Record<string, unknown> = { ...base }
  for (const [key, value] of Object.entries(patch)) {
    if (!(key in out)) continue
    const current = out[key]
    if (isPlainObject(current)) out[key] = merge(current, value)
    else if (current === null || value === null || typeof current === typeof value) out[key] = value
  }
  return out as T
}

export async function getSettings(): Promise<AppSettings> {
  if (!cache) cache = merge(defaultSettings(), await readJson<unknown>(file(), {}))
  return cache
}

export function updateSettings(patch: DeepPartial<AppSettings>): Promise<AppSettings> {
  return queue(async () => {
    const next = merge(await getSettings(), patch)
    await writeJson(file(), next)
    cache = next
    return next
  })
}

export function resetSettings(): Promise<AppSettings> {
  return queue(async () => {
    cache = defaultSettings()
    await writeJson(file(), cache)
    return cache
  })
}
