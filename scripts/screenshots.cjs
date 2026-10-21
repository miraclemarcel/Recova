// Generates the README screenshots from the real app, using demo recordings so no
// personal desktop content is captured.
//
// Usage (after `npm run build`):
//   electron scripts/screenshots.cjs assets   # renders demo pages → demo recordings + library
//   electron scripts/screenshots.cjs shots    # drives the app UI and saves docs/screenshots/*.png
const { app, BrowserWindow, ipcMain, nativeImage } = require('electron')
const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const ffmpeg = require('ffmpeg-static')

const phase = process.argv.find((a) => a === 'assets' || a === 'shots') ?? 'assets'
const work = path.join(os.tmpdir(), 'recova-screenshots')
const userData = path.join(work, 'userData')
const outDir = path.resolve(__dirname, '..', 'docs', 'screenshots')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const log = (...a) => console.log('[shots]', ...a)

if (phase === 'assets') fs.rmSync(work, { recursive: true, force: true })
fs.mkdirSync(userData, { recursive: true })
app.setPath('userData', userData)

// ---------------------------------------------------------------------------
// Demo content

const font = `font-family:'Segoe UI',system-ui,sans-serif;`
const PAGES = {
  editor: `<body style="margin:0;background:#0d1117;color:#c9d1d9;${font}display:flex;height:100vh;overflow:hidden">
  <div style="width:56px;background:#010409;border-right:1px solid #21262d"></div>
  <div style="width:300px;background:#0d1117;border-right:1px solid #21262d;padding:18px 14px;font-size:17px;line-height:2.1;color:#8b949e">
    <div style="color:#e6edf3;font-weight:600;letter-spacing:.06em;font-size:13px">EXPLORER</div>
    <div>▾ recova-api</div><div style="padding-left:18px">▾ src</div><div style="padding-left:36px;color:#e6edf3;background:#1f2937;border-radius:6px">app.ts</div>
    <div style="padding-left:36px">routes.ts</div><div style="padding-left:36px">db.ts</div><div style="padding-left:36px">auth.ts</div><div style="padding-left:18px">▸ tests</div><div style="padding-left:18px">package.json</div><div style="padding-left:18px">README.md</div>
  </div>
  <div style="flex:1;display:flex;flex-direction:column">
    <div style="height:46px;background:#010409;display:flex;align-items:end;border-bottom:1px solid #21262d"><div style="background:#0d1117;padding:12px 22px;border-top:2px solid #f78166;font-size:16px">app.ts</div><div style="padding:12px 22px;font-size:16px;color:#8b949e">routes.ts</div></div>
    <pre style="margin:0;padding:26px 30px;font:22px/1.65 Consolas,'Cascadia Code',monospace;flex:1">
<span style="color:#ff7b72">import</span> express <span style="color:#ff7b72">from</span> <span style="color:#a5d6ff">'express'</span>
<span style="color:#ff7b72">import</span> { router } <span style="color:#ff7b72">from</span> <span style="color:#a5d6ff">'./routes'</span>
<span style="color:#ff7b72">import</span> { connect } <span style="color:#ff7b72">from</span> <span style="color:#a5d6ff">'./db'</span>

<span style="color:#8b949e">// Create the HTTP server</span>
<span style="color:#ff7b72">const</span> app <span style="color:#ff7b72">=</span> <span style="color:#d2a8ff">express</span>()
app.<span style="color:#d2a8ff">use</span>(express.<span style="color:#d2a8ff">json</span>())
app.<span style="color:#d2a8ff">use</span>(<span style="color:#a5d6ff">'/api'</span>, router)

<span style="color:#ff7b72">async function</span> <span style="color:#d2a8ff">start</span>(port <span style="color:#ff7b72">=</span> <span style="color:#79c0ff">3000</span>) {
  <span style="color:#ff7b72">await</span> <span style="color:#d2a8ff">connect</span>(process.env.<span style="color:#79c0ff">DATABASE_URL</span>)
  app.<span style="color:#d2a8ff">listen</span>(port, () <span style="color:#ff7b72">=></span> {
    console.<span style="color:#d2a8ff">log</span>(<span style="color:#a5d6ff">\`🚀 API ready on :\${port}\`</span>)
  })
}

<span style="color:#d2a8ff">start</span>()</pre>
    <div style="height:230px;border-top:1px solid #21262d;background:#010409;padding:16px 26px;font:19px/1.7 Consolas,monospace;color:#8b949e">
      <div style="color:#e6edf3;font:600 13px 'Segoe UI';letter-spacing:.06em;margin-bottom:8px">TERMINAL</div>
      <div><span style="color:#7ee787">➜</span> recova-api <span style="color:#79c0ff">npm run dev</span></div>
      <div>[db] connected in 42ms</div><div style="color:#7ee787">🚀 API ready on :3000</div><div>GET /api/users <span style="color:#7ee787">200</span> 12ms</div>
    </div>
  </div></body>`,

  analytics: `<body style="margin:0;background:#f6f7fb;${font}color:#0f172a;height:100vh;overflow:hidden">
  <div style="height:72px;background:#fff;border-bottom:1px solid #e5e7eb;display:flex;align-items:center;padding:0 40px;gap:40px;font-size:18px">
    <b style="font-size:24px;color:#4f46e5">◆ Acme Analytics</b><span style="color:#0f172a;font-weight:600">Overview</span><span style="color:#64748b">Customers</span><span style="color:#64748b">Revenue</span><span style="color:#64748b">Reports</span>
  </div>
  <div style="padding:36px 40px">
    <div style="font-size:34px;font-weight:700">Good morning, Sam 👋</div><div style="color:#64748b;font-size:18px;margin-top:6px">Here's how your product performed this week.</div>
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:24px;margin-top:30px">
      ${[['Revenue', '$48,290', '+12.4%'], ['Active users', '12,840', '+8.1%'], ['Conversion', '4.62%', '+0.6%'], ['Churn', '1.8%', '−0.3%']]
        .map(([k, v, d]) => `<div style="background:#fff;border:1px solid #e5e7eb;border-radius:18px;padding:24px"><div style="color:#64748b;font-size:17px">${k}</div><div style="font-size:36px;font-weight:700;margin-top:8px">${v}</div><div style="color:#059669;font-size:16px;margin-top:6px">${d} vs last week</div></div>`)
        .join('')}
    </div>
    <div style="display:grid;grid-template-columns:2fr 1fr;gap:24px;margin-top:24px">
      <div style="background:#fff;border:1px solid #e5e7eb;border-radius:18px;padding:26px;height:430px;box-sizing:border-box">
        <div style="font-weight:600;font-size:20px">Weekly revenue</div>
        <div style="display:flex;align-items:end;gap:22px;height:320px;margin-top:30px">
          ${[42, 58, 50, 66, 72, 61, 80, 74, 88, 92, 84, 97].map((h) => `<div style="flex:1;height:${h}%;background:linear-gradient(#818cf8,#4f46e5);border-radius:8px 8px 3px 3px"></div>`).join('')}
        </div>
      </div>
      <div style="background:#fff;border:1px solid #e5e7eb;border-radius:18px;padding:26px;font-size:18px">
        <div style="font-weight:600;font-size:20px;margin-bottom:18px">Top channels</div>
        ${[['Organic search', '42%', '#4f46e5'], ['Direct', '27%', '#06b6d4'], ['Referral', '18%', '#f59e0b'], ['Social', '13%', '#ec4899']]
          .map(([k, v, c]) => `<div style="margin:16px 0"><div style="display:flex;justify-content:space-between"><span>${k}</span><b>${v}</b></div><div style="height:10px;background:#eef2ff;border-radius:9px;margin-top:8px"><div style="width:${v};height:100%;background:${c};border-radius:9px"></div></div></div>`)
          .join('')}
      </div>
    </div>
  </div></body>`,

  slides: `<body style="margin:0;background:#fff;${font}height:100vh;overflow:hidden;display:flex;flex-direction:column;justify-content:center;padding:0 150px;box-sizing:border-box;position:relative">
  <div style="position:absolute;top:0;right:0;width:620px;height:620px;background:radial-gradient(circle at 70% 30%,#fde68a,#fca5a5 45%,transparent 70%);opacity:.7"></div>
  <div style="color:#e11d48;font-weight:700;letter-spacing:.14em;font-size:22px">Q3 PRODUCT REVIEW</div>
  <div style="font-size:92px;font-weight:800;color:#111827;line-height:1.05;margin-top:18px;max-width:1200px">Shipping faster with smaller, safer releases</div>
  <div style="display:flex;gap:70px;margin-top:70px;font-size:26px;color:#374151">
    <div><div style="font-size:64px;font-weight:800;color:#111827">3.2×</div>more deploys</div>
    <div><div style="font-size:64px;font-weight:800;color:#111827">−41%</div>incidents</div>
    <div><div style="font-size:64px;font-weight:800;color:#111827">18 min</div>lead time</div>
  </div></body>`,

  board: `<body style="margin:0;background:#f8fafc;${font}height:100vh;overflow:hidden;padding:36px 40px;box-sizing:border-box">
  <div style="font-size:32px;font-weight:700;color:#0f172a">Sprint 24 · Launch board</div>
  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:24px;margin-top:28px">
    ${[
      ['To do', '#94a3b8', ['Pricing page copy', 'Invite flow emails', 'Billing webhooks']],
      ['In progress', '#3b82f6', ['Onboarding checklist', 'Team workspaces', 'Dark mode polish']],
      ['Review', '#f59e0b', ['SSO with Okta', 'Usage dashboard']],
      ['Done', '#10b981', ['Public API v2', 'CSV export', 'Audit log', 'Mobile layout']]
    ]
      .map(
        ([t, c, items]) =>
          `<div style="background:#eef2f7;border-radius:18px;padding:18px"><div style="display:flex;align-items:center;gap:10px;font-weight:600;font-size:20px;color:#0f172a"><span style="width:12px;height:12px;border-radius:9px;background:${c}"></span>${t}</div>${items
            .map((i) => `<div style="background:#fff;border-radius:14px;padding:20px;margin-top:14px;font-size:19px;color:#1e293b;box-shadow:0 1px 2px rgba(0,0,0,.06)">${i}<div style="display:flex;gap:8px;margin-top:14px"><span style="background:${c}22;color:${c};border-radius:6px;padding:3px 10px;font-size:14px;font-weight:600">${t === 'Done' ? 'shipped' : 'feature'}</span></div></div>`)
            .join('')}</div>`
      )
      .join('')}
  </div></body>`,

  // An illustrated presenter for demo facecam footage (clearly an illustration, not a person).
  camera: `<body style="margin:0;height:100vh;overflow:hidden;background:radial-gradient(circle at 50% 30%,#fef3c7,#fdba74 60%,#fb923c);display:flex;align-items:end;justify-content:center">
  <svg width="900" height="640" viewBox="0 0 900 640"><circle cx="450" cy="240" r="140" fill="#7c4a2d"/><circle cx="450" cy="262" r="118" fill="#f1c7a3"/>
  <path d="M332 230 Q450 90 568 230 Q560 150 450 132 Q340 150 332 230Z" fill="#3b2416"/><circle cx="410" cy="270" r="10" fill="#1f2937"/><circle cx="490" cy="270" r="10" fill="#1f2937"/>
  <path d="M410 320 Q450 350 490 320" stroke="#9a3412" stroke-width="8" fill="none" stroke-linecap="round"/><path d="M170 640 Q190 430 450 410 Q710 430 730 640Z" fill="#4f46e5"/></svg></body>`
}

const RECORDINGS = [
  { key: 'editor', name: 'Building a REST API in 10 minutes', camera: true, minutesAgo: 30, duration: 612.4 },
  { key: 'analytics', name: 'Analytics dashboard walkthrough', camera: false, minutesAgo: 60 * 26, duration: 248.9 },
  { key: 'slides', name: 'Q3 product review', camera: true, minutesAgo: 60 * 50, duration: 1104.2 },
  { key: 'board', name: 'Sprint planning recap', camera: false, minutesAgo: 60 * 75, duration: 397.5 }
]

function ff(args) {
  const r = spawnSync(ffmpeg, ['-hide_banner', '-v', 'error', '-y', ...args], { encoding: 'utf8' })
  if (r.status !== 0) throw new Error(r.stderr)
}

async function renderPage(html, width, height, file) {
  const win = new BrowserWindow({ show: false, width, height, useContentSize: true, webPreferences: { offscreen: true } })
  win.webContents.setFrameRate(5)
  const htmlFile = file.replace(/\.png$/, '.html')
  fs.writeFileSync(htmlFile, `<!doctype html><meta charset="utf-8">${html}`)
  await win.loadFile(htmlFile)
  await sleep(600)
  const img = await win.webContents.capturePage()
  fs.writeFileSync(file, img.resize({ width, height }).toPNG())
  win.destroy()
}

async function makeAssets() {
  const pages = path.join(work, 'pages')
  fs.mkdirSync(pages, { recursive: true })
  for (const [key, html] of Object.entries(PAGES)) {
    const [w, h] = key === 'camera' ? [1280, 720] : [1920, 1080]
    await renderPage(html, w, h, path.join(pages, `${key}.png`))
    log('rendered', key)
  }
  const recRoot = path.join(work, 'recordings')
  const recordings = []
  for (const r of RECORDINGS) {
    const id = `demo-${r.key}`
    const dir = path.join(recRoot, id)
    fs.mkdirSync(dir, { recursive: true })
    const screenPath = path.join(dir, 'screen.webm')
    ff(['-loop', '1', '-framerate', '30', '-i', path.join(pages, `${r.key}.png`), '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=mono', '-t', '6', '-c:v', 'libvpx-vp9', '-deadline', 'realtime', '-cpu-used', '8', '-b:v', '2M', '-pix_fmt', 'yuv420p', '-c:a', 'libopus', '-shortest', screenPath])
    let cameraPath = null
    if (r.camera) {
      cameraPath = path.join(dir, 'camera.webm')
      ff(['-loop', '1', '-framerate', '30', '-i', path.join(pages, 'camera.png'), '-t', '6', '-c:v', 'libvpx', '-deadline', 'realtime', '-b:v', '1M', '-pix_fmt', 'yuv420p', cameraPath])
    }
    const thumb = path.join(dir, 'thumbnail.jpg')
    ff(['-i', path.join(pages, `${r.key}.png`), '-vf', 'scale=640:-2', '-q:v', '3', thumb])
    recordings.push({
      id,
      name: r.name,
      createdAt: new Date(Date.now() - r.minutesAgo * 60000).toISOString(),
      durationSec: r.duration,
      width: 1920,
      height: 1080,
      fps: 30,
      audio: { microphone: true, systemAudio: r.key !== 'slides' },
      hasCamera: r.camera,
      camera: r.camera ? { width: 1280, height: 720, offsetMs: 0 } : null,
      dir,
      screenPath,
      cameraPath,
      thumbnailPath: thumb,
      sizeBytes: Math.round(r.duration * 1.3e6),
      exports: r.key === 'analytics' ? [{ id: 'e1', path: path.join(work, 'exports', 'demo.mp4'), createdAt: new Date().toISOString(), width: 1920, height: 1080, label: 'Sky Blue · Browser window' }] : []
    })
  }
  fs.writeFileSync(path.join(userData, 'library.json'), JSON.stringify({ version: 1, recordings }, null, 2))
  fs.writeFileSync(
    path.join(userData, 'settings.json'),
    JSON.stringify({
      recording: { recordingsDir: recRoot, audioMode: 'system', countdownSeconds: 3 },
      export: { exportDir: path.join(work, 'exports') },
      app: { theme: 'light' }
    })
  )
  log('assets ready in', work)
}

// ---------------------------------------------------------------------------
// Screenshots

const exec = (wc, code, ms = 5000) => Promise.race([wc.executeJavaScript(code).catch(() => undefined), sleep(ms).then(() => undefined)])
const clickText = (text, scope = 'document') => `(() => {
  const el = [...${scope}.querySelectorAll('button')].find(b => b.textContent.trim().includes(${JSON.stringify(text)}) && !b.disabled)
  if (!el) return false
  el.click(); return true
})()`
const clickSel = (sel) => `(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return false; el.click(); return true })()`
const setInput = (index, value) => `(() => {
  const el = document.querySelectorAll('aside input[type=text], aside input:not([type])')[${index}]
  if (!el) return false
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, ${JSON.stringify(value)})
  el.dispatchEvent(new Event('input', { bubbles: true }))
  return true
})()`
const openStudio = (name) => `(() => {
  const title = [...document.querySelectorAll('[title]')].find(e => e.getAttribute('title') === ${JSON.stringify(name)})
  const btn = title && [...title.closest('.group').querySelectorAll('button')].find(b => b.textContent.includes('Design'))
  if (!btn) return false
  btn.click(); return true
})()`

async function shot(win, name) {
  await sleep(900)
  const img = await Promise.race([win.capturePage(), sleep(8000).then(() => null)])
  if (!img) return log('capture timed out:', name)
  fs.writeFileSync(path.join(outDir, `${name}.png`), img.toPNG())
  log('saved', name)
}

async function seek(wc, t) {
  await exec(wc, `(() => { const v = document.querySelector('video'); if (v) v.currentTime = ${t}; return true })()`)
  await sleep(700)
}

async function takeShots() {
  fs.mkdirSync(outDir, { recursive: true })
  require('../out/main/index.js')
  await app.whenReady()
  await sleep(1200)

  // Demo capture sources so the picker never shows the real desktop.
  const pages = path.join(work, 'pages')
  const thumb = (k) => nativeImage.createFromPath(path.join(pages, `${k}.png`)).resize({ width: 480 }).toDataURL()
  ipcMain.removeHandler('capture:listSources')
  ipcMain.handle('capture:listSources', () => [
    { id: 'screen:demo:0', name: 'Entire screen', kind: 'screen', thumbnail: thumb('editor'), appIcon: null, display: { width: 1920, height: 1080, scaleFactor: 1, primary: true } },
    { id: 'screen:demo:1', name: 'Screen 2', kind: 'screen', thumbnail: thumb('slides'), appIcon: null, display: { width: 2560, height: 1440, scaleFactor: 1, primary: false } },
    { id: 'window:demo:1', name: 'app.ts — Code Editor', kind: 'window', thumbnail: thumb('editor'), appIcon: null, display: null },
    { id: 'window:demo:2', name: 'Acme Analytics — Browser', kind: 'window', thumbnail: thumb('analytics'), appIcon: null, display: null }
  ])

  const win = BrowserWindow.getAllWindows()[0]
  win.setContentSize(1440, 900)
  win.center()
  win.show()
  const wc = win.webContents
  await sleep(2500)

  // 1. Dashboard
  await shot(win, 'dashboard')

  // 2. New recording setup
  await exec(wc, clickText('New Recording'))
  await sleep(1500)
  await shot(win, 'setup')

  // 3. Studio: facecam bubble on Lavender with a title
  await exec(wc, clickSel('[aria-label="Recova home"]'))
  await sleep(800)
  await exec(wc, openStudio('Building a REST API in 10 minutes'))
  await sleep(2000)
  await seek(wc, 2)
  await exec(wc, clickText('Lavender'))
  await exec(wc, clickText('Text', 'document.querySelector("main aside nav")'))
  await sleep(300)
  await exec(wc, clickSel('[aria-label="Show Title"]'))
  await exec(wc, clickSel('[aria-label="Show Creator name"]'))
  await sleep(300)
  await exec(wc, setInput(1, 'Sam Rivera · Backend Basics'))
  await exec(wc, clickText('Templates', 'document.querySelector("main aside nav")'))
  await shot(win, 'studio-facecam')

  // 4. Studio: browser window on a gradient
  await exec(wc, clickSel('[aria-label="Back to recording"]'))
  await sleep(600)
  await exec(wc, clickSel('[aria-label="Recova home"]'))
  await sleep(800)
  await exec(wc, openStudio('Analytics dashboard walkthrough'))
  await sleep(2000)
  await seek(wc, 2)
  await exec(wc, clickText('Modern Gradient'))
  await exec(wc, clickText('Layout', 'document.querySelector("main aside nav")'))
  await sleep(300)
  await exec(wc, clickText('Browser window'))
  await shot(win, 'studio-browser')

  // 5. Export dialog
  await exec(wc, clickText('Export'))
  await sleep(800)
  await shot(win, 'export')
  await exec(wc, `document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`)
  await sleep(400)

  // 6. Portrait facecam panel on the developer template
  await exec(wc, clickSel('[aria-label="Back to recording"]'))
  await sleep(600)
  await exec(wc, clickSel('[aria-label="Recova home"]'))
  await sleep(800)
  await exec(wc, openStudio('Q3 product review'))
  await sleep(2000)
  await seek(wc, 2)
  await exec(wc, clickText('Warm Cream'))
  await exec(wc, clickText('Layout', 'document.querySelector("main aside nav")'))
  await sleep(300)
  await exec(wc, clickText('Facecam panel'))
  await exec(wc, clickText('9:16'))
  await shot(win, 'studio-portrait')

  // 7. Dark theme (switched from Settings)
  await exec(wc, clickSel('[aria-label="Settings"]'))
  await sleep(800)
  await exec(wc, clickText('Dark'))
  await sleep(600)
  await exec(wc, clickSel('[aria-label="Recordings"]'))
  await sleep(1000)
  await shot(win, 'dashboard-dark')
  await exec(wc, clickSel('[aria-label="Settings"]'))
  await sleep(600)
  await exec(wc, clickText('Light'))
  await sleep(300)
  log('done')
  app.exit(0)
}

if (phase === 'assets') {
  // Pages are rendered in short-lived windows; don't quit when one closes.
  app.on('window-all-closed', () => undefined)
  app.whenReady().then(() => makeAssets().then(() => app.exit(0), (e) => (console.error(e), app.exit(1))))
} else {
  takeShots().catch((e) => (console.error(e), app.exit(1)))
}
