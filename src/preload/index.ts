import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { RecovaApi } from '@shared/types'

function subscribe<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_e: IpcRendererEvent, payload: T) => cb(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const invoke = ipcRenderer.invoke.bind(ipcRenderer)

const api: RecovaApi = {
  platform: { info: () => invoke('platform:info') },
  settings: {
    get: () => invoke('settings:get'),
    update: (patch) => invoke('settings:update', patch),
    reset: () => invoke('settings:reset'),
    chooseDirectory: (title, defaultPath) => invoke('settings:chooseDirectory', title, defaultPath),
    storageInfo: () => invoke('settings:storageInfo')
  },
  capture: {
    listSources: () => invoke('capture:listSources'),
    prepare: (sourceId, withSystemAudio) => invoke('capture:prepare', sourceId, withSystemAudio)
  },
  recording: {
    begin: (opts) => invoke('recording:begin', opts),
    writeChunk: (sessionId, track, data) => invoke('recording:writeChunk', sessionId, track, data),
    finish: (sessionId, info) => invoke('recording:finish', sessionId, info),
    discard: (sessionId) => invoke('recording:discard', sessionId),
    showToolbar: (countdown) => invoke('recording:showToolbar', countdown),
    hideToolbar: () => invoke('recording:hideToolbar'),
    pushState: (state) => ipcRenderer.send('recording:state', state),
    onCommand: (cb) => subscribe('recording:command', cb)
  },
  toolbar: {
    command: (cmd) => ipcRenderer.send('toolbar:command', cmd),
    onState: (cb) => subscribe('toolbar:state', cb),
    onCountdown: (cb) => subscribe('toolbar:countdown', cb)
  },
  library: {
    list: () => invoke('library:list'),
    rename: (id, name) => invoke('library:rename', id, name),
    remove: (id) => invoke('library:remove', id),
    reveal: (id) => invoke('library:reveal', id),
    revealExport: (id, exportId) => invoke('library:revealExport', id, exportId),
    openExport: (id, exportId) => invoke('library:openExport', id, exportId),
    removeExport: (id, exportId) => invoke('library:removeExport', id, exportId),
    openRecordingsFolder: () => invoke('library:openRecordingsFolder'),
    onChanged: (cb) => subscribe('library:changed', () => cb())
  },
  studio: { importBackground: () => invoke('studio:importBackground') },
  export: {
    start: (req) => invoke('export:start', req),
    cancel: (jobId) => invoke('export:cancel', jobId),
    onProgress: (cb) => subscribe('export:progress', cb)
  },
  app: { setLaunchAtLogin: (enabled) => invoke('app:setLaunchAtLogin', enabled) }
}

contextBridge.exposeInMainWorld('recova', api)
