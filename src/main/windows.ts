import { app, BrowserWindow, screen, shell } from 'electron'
import { join } from 'node:path'

let mainWindow: BrowserWindow | null = null
let toolbarWindow: BrowserWindow | null = null
let toolbarReady = false
let pendingCountdown: number | null = null

const TOOLBAR_SIZE = { width: 420, height: 64 }
const COUNTDOWN_SIZE = { width: 220, height: 220 }

function loadRenderer(win: BrowserWindow, hash: string): void {
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (!app.isPackaged && devUrl) void win.loadURL(`${devUrl}#${hash}`)
  else void win.loadFile(join(__dirname, '../renderer/index.html'), { hash })
}

function secureWebPreferences(): Electron.WebPreferences {
  return {
    preload: join(__dirname, '../preload/index.js'),
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    webSecurity: true,
    // Recording continues while the window is minimised.
    backgroundThrottling: false
  }
}

function hardenNavigation(win: BrowserWindow): void {
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, url) => {
    if (url !== win.webContents.getURL()) event.preventDefault()
  })
}

export function createMainWindow(): BrowserWindow {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 880,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    title: 'Recova',
    backgroundColor: '#f7f7f8',
    icon: join(__dirname, '../../build/icon.png'),
    autoHideMenuBar: true,
    webPreferences: secureWebPreferences()
  })
  hardenNavigation(mainWindow)
  mainWindow.once('ready-to-show', () => mainWindow?.show())
  mainWindow.on('closed', () => {
    mainWindow = null
    toolbarWindow?.destroy()
  })
  loadRenderer(mainWindow, 'app')
  return mainWindow
}

export const getMainWindow = () => mainWindow
export const getToolbarWindow = () => toolbarWindow

function placeToolbar(countdown: boolean): void {
  if (!toolbarWindow) return
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  const area = display.workArea
  const size = countdown ? COUNTDOWN_SIZE : TOOLBAR_SIZE
  const x = Math.round(area.x + (area.width - size.width) / 2)
  const y = countdown ? Math.round(area.y + (area.height - size.height) / 2) : area.y + area.height - size.height - 24
  toolbarWindow.setBounds({ x, y, ...size })
}

/**
 * The floating toolbar uses content protection, which on Windows 10 2004+ maps to
 * WDA_EXCLUDEFROMCAPTURE so the toolbar never appears in the recorded video.
 */
export function showToolbar(countdown: number): void {
  if (!toolbarWindow) {
    toolbarWindow = new BrowserWindow({
      ...TOOLBAR_SIZE,
      frame: false,
      transparent: true,
      resizable: false,
      movable: true,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      hasShadow: false,
      show: false,
      focusable: true,
      webPreferences: secureWebPreferences()
    })
    toolbarWindow.setAlwaysOnTop(true, 'screen-saver')
    toolbarWindow.setContentProtection(true)
    toolbarWindow.setVisibleOnAllWorkspaces(true)
    hardenNavigation(toolbarWindow)
    toolbarWindow.on('closed', () => {
      toolbarWindow = null
      toolbarReady = false
    })
    loadRenderer(toolbarWindow, 'toolbar')
  }
  placeToolbar(countdown > 0)
  toolbarWindow.showInactive()
  pendingCountdown = countdown
  flushCountdown()
  mainWindow?.minimize()
}

function flushCountdown(): void {
  if (!toolbarReady || pendingCountdown === null || !toolbarWindow) return
  toolbarWindow.webContents.send('toolbar:countdown', pendingCountdown)
  pendingCountdown = null
}

/** Called once the toolbar UI has subscribed, so the countdown message is never lost. */
export function markToolbarReady(): void {
  toolbarReady = true
  flushCountdown()
}

export function compactToolbar(): void {
  placeToolbar(false)
}

export function hideToolbar(): void {
  toolbarWindow?.hide()
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  }
}
