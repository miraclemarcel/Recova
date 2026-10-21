// End-to-end smoke test that drives the real built app through its UI:
// New Recording → Start → (countdown) → record ~4s → Stop → Video Studio → Export MP4.
// Usage: npm run build && npx electron scripts/e2e-main.cjs
const { app, BrowserWindow } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..', 'test-output', 'e2e')
fs.rmSync(root, { recursive: true, force: true })
const userData = path.join(root, 'userData')
fs.mkdirSync(userData, { recursive: true })
fs.writeFileSync(
  path.join(userData, 'settings.json'),
  JSON.stringify({
    recording: { recordingsDir: path.join(root, 'recordings'), countdownSeconds: 3, audioMode: process.platform === 'win32' ? 'system' : 'none' },
    export: { exportDir: path.join(root, 'exports'), resolution: 720, quality: 'standard' }
  })
)
app.setPath('userData', userData)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const logFile = path.join(root, 'e2e.log')
const log = (...a) => {
  const line = `[e2e] ${a.join(' ')}`
  console.log(line)
  fs.appendFileSync(logFile, `${line}\n`)
}
function fail(msg) {
  log('FAIL:', msg)
  app.exit(1)
}

// executeJavaScript can stall while a window is being minimised, so every call is raced against a timeout.
const exec = (wc, code, ms = 4000) => Promise.race([wc.executeJavaScript(code).catch(() => undefined), sleep(ms).then(() => undefined)])

async function waitFor(wc, expr, label, timeout = 30000) {
  const t0 = Date.now()
  while (Date.now() - t0 < timeout) {
    if (await exec(wc, expr)) return
    await sleep(250)
  }
  throw new Error(`Timed out waiting for: ${label}`)
}

async function screenshot(win, name) {
  win.show()
  const img = await Promise.race([win.capturePage(), sleep(5000).then(() => null)])
  if (img) fs.writeFileSync(path.join(root, name), img.toPNG())
  log(img ? `screenshot ${name}` : `screenshot ${name} timed out`)
}

const clickByText = (text) => `(() => {
  const el = [...document.querySelectorAll('button')].find(b => b.textContent.trim().includes(${JSON.stringify(text)}) && !b.disabled)
  if (!el) return false
  el.click(); return true
})()`

require('../out/main/index.js')

app.whenReady().then(async () => {
  try {
    await sleep(1500)
    const main = BrowserWindow.getAllWindows()[0]
    global.mainWindow = main
    const wc = main.webContents
    app.on('web-contents-created', (_e, c) => c.on('console-message', (ev) => log('renderer:', ev.message)))
    wc.on('console-message', (ev) => log('renderer:', ev.message))
    await waitFor(wc, `document.body.innerText.includes('Make your first recording')`, 'empty dashboard')
    log('dashboard empty state shown')
    await exec(wc, clickByText('New Recording'))
    await waitFor(wc, `[...document.querySelectorAll('button')].some(b => b.textContent.includes('Start Recording') && !b.disabled)`, 'source selected')
    log('setup ready')
    await exec(wc, clickByText('Start Recording'))
    log('clicked start')
    // Wait for the toolbar window and its countdown to finish.
    let toolbar
    for (let i = 0; i < 40 && !toolbar; i++) {
      toolbar = BrowserWindow.getAllWindows().find((w) => w !== main)
      await sleep(250)
    }
    if (!toolbar) throw new Error('toolbar window did not open')
    log('toolbar opened; content protected:', toolbar.isContentProtected?.() ?? 'n/a')
    await waitFor(toolbar.webContents, `[...document.querySelectorAll('button')].some(b => b.textContent.includes('Stop') && !b.disabled)`, 'recording started', 15000)
    log('recording…')
    await sleep(2000)
    await exec(toolbar.webContents, `document.querySelector('button[aria-label="Pause"]')?.click()`)
    log('paused')
    await sleep(1000)
    await exec(toolbar.webContents, `document.querySelector('button[aria-label="Resume"]')?.click()`)
    log('resumed')
    await sleep(2500)
    log('toolbar buttons:', await exec(toolbar.webContents, `[...document.querySelectorAll('button')].map(b => (b.getAttribute('aria-label') || b.textContent.trim())).join(' | ')`))
    log('recordings dir:', fs.readdirSync(path.join(root, 'recordings')).join(', '))
    await exec(toolbar.webContents, clickByText('Stop'))
    for (let i = 0; i < 6; i++) {
      await sleep(1500)
      log('main:', String(await exec(wc, 'document.body.innerText')).replace(/\s+/g, ' ').slice(0, 160))
    }
    await waitFor(wc, `document.body.innerText.includes('Open in Video Studio')`, 'player view after save', 60000)
    const lib = JSON.parse(fs.readFileSync(path.join(userData, 'library.json'), 'utf8')).recordings
    const rec = lib[0]
    log('saved recording:', rec.width + 'x' + rec.height, rec.fps + 'fps', rec.durationSec.toFixed(2) + 's', 'audio', JSON.stringify(rec.audio))
    if (!fs.existsSync(rec.screenPath)) throw new Error('screen file missing')
    if (rec.durationSec < 3 || rec.durationSec > 8) throw new Error(`unexpected duration ${rec.durationSec}`)

    await exec(wc, clickByText('Open in Video Studio'))
    await waitFor(wc, `document.body.textContent.includes('Video Studio') && !!document.querySelector('canvas')`, 'studio')
    await sleep(1500)
    await exec(wc, clickByText('Midnight Black'))
    await exec(wc, clickByText('Layout'))
    await sleep(300)
    await exec(wc, clickByText('Browser window'))
    await sleep(500)
    await screenshot(main, 'studio.png')
    await exec(wc, clickByText('Export'))
    await waitFor(wc, `[...document.querySelectorAll('button')].some(b => b.textContent.includes('Export MP4'))`, 'export dialog')
    await exec(wc, clickByText('Export MP4'))
    const t0 = Date.now()
    let exp
    while (Date.now() - t0 < 120000) {
      const r = JSON.parse(fs.readFileSync(path.join(userData, 'library.json'), 'utf8')).recordings[0]
      exp = r.exports[0]
      if (exp) break
      await sleep(500)
    }
    if (!exp || !fs.existsSync(exp.path)) throw new Error('export did not finish')
    log('exported:', exp.path, exp.width + 'x' + exp.height, (fs.statSync(exp.path).size / 1024).toFixed(0) + ' KB', `in ${((Date.now() - t0) / 1000).toFixed(1)}s`)
    await sleep(500)
    await screenshot(main, 'after-export.png')
    log('PASS')
    app.exit(0)
  } catch (err) {
    const w = global.mainWindow
    if (w) await screenshot(w, 'failure.png').catch(() => undefined)
    fail(err.message)
  }
})
