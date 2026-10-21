import { desktopCapturer, screen, session, type DesktopCapturerSource } from 'electron'
import type { CaptureSource, PlatformInfo } from '@shared/types'

let pending: { sourceId: string; withSystemAudio: boolean } | null = null

/**
 * System audio uses Chromium's loopback capture, which Electron supports on Windows.
 * macOS and Linux need OS-level virtual audio devices, so we report it as unavailable there.
 */
export function systemAudioSupport(): Pick<PlatformInfo, 'systemAudioSupported' | 'systemAudioNote' | 'toolbarExcludedFromCapture'> {
  if (process.platform === 'win32') {
    return {
      systemAudioSupported: true,
      systemAudioNote: 'Captures everything your computer plays (Windows loopback), including when recording a single window.',
      toolbarExcludedFromCapture: true
    }
  }
  if (process.platform === 'darwin') {
    return {
      systemAudioSupported: false,
      systemAudioNote: 'macOS does not expose system audio to apps directly. Install a virtual audio device (e.g. BlackHole) and pick it as your microphone.',
      toolbarExcludedFromCapture: true
    }
  }
  return {
    systemAudioSupported: false,
    systemAudioNote: 'System audio capture is not available on Linux in this version. Use a PulseAudio/PipeWire monitor device as the microphone instead.',
    toolbarExcludedFromCapture: false
  }
}

/** `excludeSourceIds` are Recova's own windows (from BrowserWindow.getMediaSourceId()). */
export async function listSources(excludeSourceIds: string[]): Promise<CaptureSource[]> {
  const sources = await desktopCapturer.getSources({
    types: ['screen', 'window'],
    thumbnailSize: { width: 480, height: 270 },
    fetchWindowIcons: true
  })
  const displays = screen.getAllDisplays()
  const primaryId = screen.getPrimaryDisplay().id
  const excluded = new Set(excludeSourceIds)
  return sources
    .filter((s) => !excluded.has(s.id))
    .filter((s) => s.id.startsWith('screen:') || !s.thumbnail.isEmpty())
    .map((s: DesktopCapturerSource) => {
      const display = s.display_id ? displays.find((d) => String(d.id) === s.display_id) : undefined
      return {
        id: s.id,
        name: s.name,
        kind: s.id.startsWith('screen:') ? 'screen' : 'window',
        thumbnail: s.thumbnail.toDataURL(),
        appIcon: s.appIcon && !s.appIcon.isEmpty() ? s.appIcon.toDataURL() : null,
        display: display
          ? {
              width: Math.round(display.size.width * display.scaleFactor),
              height: Math.round(display.size.height * display.scaleFactor),
              scaleFactor: display.scaleFactor,
              primary: display.id === primaryId
            }
          : null
      }
    })
}

export function prepareCapture(sourceId: string, withSystemAudio: boolean): void {
  pending = { sourceId, withSystemAudio: withSystemAudio && systemAudioSupport().systemAudioSupported }
}

/** Answers the renderer's getDisplayMedia() with the source the user chose in our own picker. */
export function installDisplayMediaHandler(): void {
  session.defaultSession.setDisplayMediaRequestHandler(async (_request, callback) => {
    const choice = pending
    pending = null
    if (!choice) {
      callback({})
      return
    }
    const sources = await desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 0, height: 0 } })
    const source = sources.find((s) => s.id === choice.sourceId)
    if (!source) {
      callback({})
      return
    }
    callback(choice.withSystemAudio ? { video: source, audio: 'loopback' } : { video: source })
  })
}

export function installPermissionHandlers(): void {
  const allowed = new Set(['media', 'display-capture', 'clipboard-sanitized-write', 'fullscreen'])
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => callback(allowed.has(permission)))
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => allowed.has(permission))
}
