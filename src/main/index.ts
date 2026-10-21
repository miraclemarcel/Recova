import { app, BrowserWindow, dialog, ipcMain, shell, systemPreferences, type IpcMainInvokeEvent } from 'electron'
import { randomUUID } from 'node:crypto'
import { existsSync, promises as fs } from 'node:fs'
import { extname, join } from 'node:path'
import type { AppSettings, DeepPartial, ExportRequest, FinishRecordingInfo, RecorderState, ToolbarCommand, TrackKind } from '@shared/types'
import { mediaUrl } from '@shared/constants'
import { getSettings, resetSettings, updateSettings } from './settings'
import { getRecording, listRecordings, removeRecording, updateRecording } from './library'
import { beginRecording, discardRecording, finishRecording, flushActiveSessions, recoverInterrupted, writeChunk } from './recorder'
import { cancelAllExports, cancelExport, isImage, startExport } from './exporter'
import { backgroundsDir, handleMediaProtocol, registerMediaScheme } from './media-protocol'
import { installDisplayMediaHandler, installPermissionHandlers, listSources, prepareCapture, systemAudioSupport } from './capture'
import { compactToolbar, createMainWindow, getMainWindow, getToolbarWindow, hideToolbar, showToolbar } from './windows'
import { ffmpegAvailable } from './ffmpeg'

registerMediaScheme()

if (!app.requestSingleInstanceLock()) app.quit()

/** Only accept IPC from Recova's own windows. */
function trusted(event: IpcMainInvokeEvent | Electron.IpcMainEvent): boolean {
  const own = [getMainWindow(), getToolbarWindow()].filter((w): w is BrowserWindow => w !== null)
  return own.some((w) => w.webContents.id === event.sender.id)
}

function handle<A extends unknown[], R>(channel: string, fn: (...args: A) => Promise<R> | R): void {
  ipcMain.handle(channel, (event, ...args) => {
    if (!trusted(event)) throw new Error('Untrusted sender')
    return fn(...(args as A))
  })
}

const str = (v: unknown, name: string): string => {
  if (typeof v !== 'string' || v.length === 0 || v.length > 4096) throw new Error(`Invalid ${name}`)
  return v
}

async function dirSize(dir: string): Promise<number> {
  if (!existsSync(dir)) return 0
  let total = 0
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    total += e.isDirectory() ? await dirSize(p) : (await fs.stat(p)).size
  }
  return total
}

function registerIpc(): void {
  handle('platform:info', () => ({
    platform: process.platform,
    ...systemAudioSupport(),
    appVersion: app.getVersion(),
    electronVersion: process.versions.electron,
    chromeVersion: process.versions.chrome,
    userDataDir: app.getPath('userData'),
    ffmpegAvailable: ffmpegAvailable()
  }))

  handle('settings:get', () => getSettings())
  handle('settings:update', (patch: DeepPartial<AppSettings>) => updateSettings(patch))
  handle('settings:reset', () => resetSettings())
  handle('settings:chooseDirectory', async (title: string, defaultPath?: string) => {
    const win = getMainWindow()
    const opts: Electron.OpenDialogOptions = { title, defaultPath, properties: ['openDirectory', 'createDirectory'] }
    const r = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
    return r.canceled || r.filePaths.length === 0 ? null : r.filePaths[0]
  })
  handle('settings:storageInfo', async () => {
    const s = await getSettings()
    const list = await listRecordings()
    return {
      recordingsDir: s.recording.recordingsDir,
      userDataDir: app.getPath('userData'),
      recordingsBytes: list.reduce((n, r) => n + r.sizeBytes, 0) || (await dirSize(s.recording.recordingsDir)),
      recordingCount: list.length
    }
  })

  handle('capture:listSources', () => {
    const own = [getMainWindow(), getToolbarWindow()].filter((w): w is BrowserWindow => w !== null).map((w) => w.getMediaSourceId())
    return listSources(own)
  })
  handle('capture:prepare', (sourceId: string, withSystemAudio: boolean) => prepareCapture(str(sourceId, 'source'), withSystemAudio === true))

  handle('recording:begin', (opts: { hasCamera: boolean }) => beginRecording({ hasCamera: opts?.hasCamera === true }))
  handle('recording:writeChunk', (sessionId: string, track: TrackKind, data: ArrayBuffer) => {
    if (track !== 'screen' && track !== 'camera') throw new Error('Invalid track')
    if (!(data instanceof ArrayBuffer)) throw new Error('Invalid chunk')
    return writeChunk(str(sessionId, 'session'), track, data)
  })
  handle('recording:finish', (sessionId: string, info: FinishRecordingInfo) => finishRecording(str(sessionId, 'session'), info))
  handle('recording:discard', (sessionId: string) => discardRecording(str(sessionId, 'session')))
  handle('recording:showToolbar', (countdown: number) => showToolbar(Math.max(0, Math.min(10, Number(countdown) || 0))))
  handle('recording:hideToolbar', () => hideToolbar())

  ipcMain.on('recording:state', (event, state: RecorderState) => {
    if (!trusted(event)) return
    getToolbarWindow()?.webContents.send('toolbar:state', state)
  })
  ipcMain.on('toolbar:command', (event, cmd: ToolbarCommand) => {
    if (!trusted(event)) return
    if (!['countdown-done', 'pause', 'resume', 'stop', 'cancel'].includes(cmd)) return
    if (cmd === 'countdown-done') compactToolbar()
    getMainWindow()?.webContents.send('recording:command', cmd)
  })

  handle('library:list', () => listRecordings())
  handle('library:rename', (id: string, name: string) => {
    const clean = str(name, 'name').trim().slice(0, 120)
    if (!clean) throw new Error('Name cannot be empty.')
    return updateRecording(str(id, 'id'), (m) => ({ ...m, name: clean }))
  })
  handle('library:remove', (id: string) => removeRecording(str(id, 'id')))
  handle('library:reveal', async (id: string) => {
    const rec = await getRecording(str(id, 'id'))
    if (existsSync(rec.screenPath)) shell.showItemInFolder(rec.screenPath)
    else if (existsSync(rec.dir)) await shell.openPath(rec.dir)
    else throw new Error('The recording folder no longer exists.')
  })
  const findExport = async (id: string, exportId: string) => {
    const rec = await getRecording(str(id, 'id'))
    const exp = rec.exports.find((e) => e.id === exportId)
    if (!exp) throw new Error('Export not found.')
    return exp
  }
  handle('library:revealExport', async (id: string, exportId: string) => {
    const exp = await findExport(id, exportId)
    if (!existsSync(exp.path)) throw new Error('The exported file was moved or deleted.')
    shell.showItemInFolder(exp.path)
  })
  handle('library:openExport', async (id: string, exportId: string) => {
    const exp = await findExport(id, exportId)
    if (!existsSync(exp.path)) throw new Error('The exported file was moved or deleted.')
    const err = await shell.openPath(exp.path)
    if (err) throw new Error(err)
  })
  handle('library:removeExport', async (id: string, exportId: string) => {
    await updateRecording(str(id, 'id'), (m) => ({ ...m, exports: m.exports.filter((e) => e.id !== exportId) }))
  })
  handle('library:openRecordingsFolder', async () => {
    const dir = (await getSettings()).recording.recordingsDir
    await fs.mkdir(dir, { recursive: true })
    await shell.openPath(dir)
  })

  handle('studio:importBackground', async () => {
    const win = getMainWindow()
    const opts: Electron.OpenDialogOptions = {
      title: 'Choose a background image',
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }]
    }
    const r = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
    if (r.canceled || !r.filePaths[0] || !isImage(r.filePaths[0])) return null
    const id = `${randomUUID()}${extname(r.filePaths[0]).toLowerCase()}`
    await fs.mkdir(backgroundsDir(), { recursive: true })
    await fs.copyFile(r.filePaths[0], join(backgroundsDir(), id))
    return { id, url: mediaUrl.background(id) }
  })

  handle('export:start', (req: ExportRequest) => startExport(req))
  handle('export:cancel', (jobId: string) => cancelExport(str(jobId, 'job')))

  handle('app:setLaunchAtLogin', async (enabled: boolean) => {
    if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: enabled === true })
    await updateSettings({ app: { launchAtLogin: enabled === true } })
  })
}

app.on('second-instance', () => {
  const win = getMainWindow()
  if (win) {
    if (win.isMinimized()) win.restore()
    win.focus()
  }
})

app.whenReady().then(async () => {
  app.setAppUserModelId('app.recova.desktop')
  if (process.platform === 'darwin') {
    // macOS asks lazily; requesting here is harmless and only shows a prompt once.
    void systemPreferences.getMediaAccessStatus('screen')
  }
  installPermissionHandlers()
  installDisplayMediaHandler()
  handleMediaProtocol()
  registerIpc()
  createMainWindow()
  void recoverInterrupted().catch(() => undefined)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
})

app.on('before-quit', () => {
  cancelAllExports()
  void flushActiveSessions()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
