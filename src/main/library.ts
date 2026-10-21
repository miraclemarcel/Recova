import { app, BrowserWindow } from 'electron'
import { existsSync, promises as fs } from 'node:fs'
import { join } from 'node:path'
import type { LibraryItem, RecordingMeta } from '@shared/types'
import { createQueue, readJson, writeJson } from './json-store'

const file = () => join(app.getPath('userData'), 'library.json')
const queue = createQueue()
let cache: RecordingMeta[] | null = null

async function load(): Promise<RecordingMeta[]> {
  if (!cache) {
    const data = await readJson<{ recordings?: RecordingMeta[] }>(file(), {})
    cache = Array.isArray(data.recordings) ? data.recordings : []
  }
  return cache
}

async function save(list: RecordingMeta[]): Promise<void> {
  cache = list
  await writeJson(file(), { version: 1, recordings: list })
  for (const w of BrowserWindow.getAllWindows()) w.webContents.send('library:changed')
}

function toItem(meta: RecordingMeta): LibraryItem {
  return {
    ...meta,
    missing: !existsSync(meta.screenPath),
    cameraMissing: meta.cameraPath !== null && !existsSync(meta.cameraPath)
  }
}

export async function listRecordings(): Promise<LibraryItem[]> {
  const list = await load()
  return [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(toItem)
}

export async function getRecording(id: string): Promise<RecordingMeta> {
  const meta = (await load()).find((r) => r.id === id)
  if (!meta) throw new Error('Recording not found in library.')
  return meta
}

export function addRecording(meta: RecordingMeta): Promise<void> {
  return queue(async () => save([...(await load()).filter((r) => r.id !== meta.id), meta]))
}

export function updateRecording(id: string, update: (m: RecordingMeta) => RecordingMeta): Promise<LibraryItem> {
  return queue(async () => {
    const list = await load()
    const idx = list.findIndex((r) => r.id === id)
    if (idx < 0) throw new Error('Recording not found in library.')
    const next = [...list]
    next[idx] = update(list[idx])
    await save(next)
    return toItem(next[idx])
  })
}

/** Removes the recording and its original files. Exported videos stored elsewhere are kept. */
export function removeRecording(id: string): Promise<void> {
  return queue(async () => {
    const list = await load()
    const meta = list.find((r) => r.id === id)
    if (!meta) return
    if (existsSync(meta.dir)) await fs.rm(meta.dir, { recursive: true, force: true })
    await save(list.filter((r) => r.id !== id))
  })
}

export async function knownIds(): Promise<Set<string>> {
  return new Set((await load()).map((r) => r.id))
}
