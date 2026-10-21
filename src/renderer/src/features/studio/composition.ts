import type { CameraShape, Rect } from '@shared/types'

/**
 * The composition engine. Everything here is pure geometry plus canvas drawing, and is used
 * both by the live preview and by the exporter (which renders the same layers to PNG and lets
 * FFmpeg composite the video into them), so preview and export always match.
 */

export type AspectRatio = 'original' | '16:9' | '9:16' | '1:1' | '4:5'
export type FrameStyle = 'none' | 'browser' | 'window'
export type ShadowLevel = 'none' | 'soft' | 'medium' | 'strong'
export type FitMode = 'fit' | 'fill'
export type LayoutId = 'centered' | 'card' | 'floating' | 'framed' | 'small' | 'browser' | 'window' | 'pip' | 'bubble' | 'panel'

export type BackgroundSpec =
  | { kind: 'template'; templateId: string }
  | { kind: 'solid'; color: string }
  | { kind: 'gradient'; from: string; to: string; angle: number }
  | { kind: 'image'; id: string; url: string }

export interface TextLine {
  enabled: boolean
  text: string
  size: number
  color: string
}

export interface Composition {
  templateId: string
  background: BackgroundSpec
  aspect: AspectRatio
  fit: FitMode
  layoutId: LayoutId
  screen: {
    padding: number
    scale: number
    offsetX: number
    offsetY: number
    radius: number
    shadow: ShadowLevel
    borderWidth: number
    borderColor: string
    frame: FrameStyle
    frameTheme: 'light' | 'dark'
  }
  camera: {
    visible: boolean
    mode: 'overlay' | 'panel'
    shape: CameraShape
    size: number
    x: number
    y: number
    borderWidth: number
    borderColor: string
    shadow: boolean
    panel: boolean
    panelColor: string
    mirror: boolean
  }
  text: {
    align: 'left' | 'center' | 'right'
    position: 'top' | 'bottom'
    title: TextLine
    subtitle: TextLine
    creator: TextLine
    brand: TextLine
  }
}

export interface Size {
  w: number
  h: number
}

export type Radii = [number, number, number, number]

export interface TextItem {
  text: string
  x: number
  y: number
  size: number
  weight: number
  color: string
  align: CanvasTextAlign
}

export interface Layout {
  W: number
  H: number
  u: number
  /** Area occupied by the video pixels. */
  screen: Rect
  screenRadii: Radii
  /** Video area plus window chrome. */
  window: Rect
  windowRadius: number
  bar: Rect | null
  camera: Rect | null
  cameraRadius: number
  panel: Rect | null
  text: TextItem[]
  brand: { rect: Rect; item: TextItem } | null
  /** Free space around the screen window inside its area, used to map drags to offsets. */
  free: { x: number; y: number }
}

export const even = (n: number) => Math.max(2, Math.round(n / 2) * 2)

/** Output canvas size. `resolution` is the length of the short side. */
export function outputSize(aspect: AspectRatio, resolution: number, source: Size): Size {
  const ratios: Record<Exclude<AspectRatio, 'original'>, number> = { '16:9': 16 / 9, '9:16': 9 / 16, '1:1': 1, '4:5': 4 / 5 }
  const r = aspect === 'original' ? (source.w > 0 && source.h > 0 ? source.w / source.h : 16 / 9) : ratios[aspect]
  return r >= 1 ? { w: even(resolution * r), h: even(resolution) } : { w: even(resolution), h: even(resolution / r) }
}

const FONT_STACK = '"Segoe UI Variable Display", "Segoe UI", -apple-system, "Helvetica Neue", Arial, sans-serif'
export const font = (weight: number, size: number) => `${weight} ${Math.round(size)}px ${FONT_STACK}`

function textBlock(c: Composition, u: number): { lines: { line: TextLine; weight: number }[]; height: number } {
  const lines = [
    { line: c.text.title, weight: 700 },
    { line: c.text.subtitle, weight: 400 },
    { line: c.text.creator, weight: 600 }
  ].filter((l) => l.line.enabled && l.line.text.trim().length > 0)
  const height = lines.reduce((h, l, i) => h + l.line.size * u * 1.25 + (i > 0 ? 6 * u : 0), 0)
  return { lines, height }
}

export function cameraAspect(shape: CameraShape): number {
  return shape === 'rounded' ? 4 / 3 : 1
}

export function computeLayout(c: Composition, source: Size, hasCamera: boolean, out: Size): Layout {
  const W = out.w
  const H = out.h
  const u = Math.min(W, H) / 1080
  const short = Math.min(W, H)
  const pad = c.screen.padding * short
  const srcAspect = source.w > 0 && source.h > 0 ? source.w / source.h : 16 / 9

  let area: Rect = { x: pad, y: pad, w: W - pad * 2, h: H - pad * 2 }

  // Text block reserves a band at the top or bottom.
  const block = textBlock(c, u)
  const text: TextItem[] = []
  if (block.lines.length > 0) {
    const margin = Math.max(pad, 48 * u)
    const gap = 28 * u
    const top = c.text.position === 'top' ? margin : H - margin - block.height
    const x = c.text.align === 'left' ? margin : c.text.align === 'right' ? W - margin : W / 2
    let y = top
    for (const { line, weight } of block.lines) {
      text.push({ text: line.text, x, y, size: line.size * u, weight, color: line.color, align: c.text.align })
      y += line.size * u * 1.25 + 6 * u
    }
    const reserved = block.height + gap + Math.max(0, margin - pad)
    area = c.text.position === 'top' ? { ...area, y: area.y + reserved, h: area.h - reserved } : { ...area, h: area.h - reserved }
  }

  // Separate facecam panel takes a column (landscape) or row (portrait).
  let panel: Rect | null = null
  let camera: Rect | null = null
  const cam = c.camera
  const showCamera = hasCamera && cam.visible
  if (showCamera && cam.mode === 'panel') {
    const gap = Math.max(24 * u, pad * 0.5)
    const camAspect = cam.shape === 'rounded' ? 3 / 4 : 1
    if (W >= H) {
      const pw = Math.min(area.w * 0.3, area.w * cam.size * 1.6)
      area = { ...area, w: area.w - pw - gap }
      panel = { x: area.x + area.w + gap, y: area.y, w: pw, h: area.h }
    } else {
      const ph = Math.min(area.h * 0.34, area.h * cam.size * 1.4)
      area = { ...area, h: area.h - ph - gap }
      panel = { x: area.x, y: area.y + area.h + gap, w: area.w, h: ph }
    }
    let cw = Math.min(panel.w, panel.h * camAspect)
    let ch = cw / camAspect
    if (ch > panel.h) {
      ch = panel.h
      cw = ch * camAspect
    }
    camera = { x: panel.x + (panel.w - cw) / 2, y: panel.y + (panel.h - ch) / 2, w: cw, h: ch }
  }

  // Screen window: video area plus optional chrome bar, scaled inside the available area.
  const barH = c.screen.frame === 'browser' ? 44 * u : c.screen.frame === 'window' ? 38 * u : 0
  const scale = Math.min(1, Math.max(0.2, c.screen.scale))
  const maxW = area.w * scale
  const maxH = area.h * scale
  const aspect = c.fit === 'fit' ? srcAspect : maxW / Math.max(1, maxH - barH)
  let vw = Math.max(1, Math.min(maxW, (maxH - barH) * aspect))
  let vh = vw / aspect
  if (vh + barH > maxH) {
    vh = maxH - barH
    vw = vh * aspect
  }
  const win: Rect = {
    x: area.x + ((area.w - vw) / 2) * (1 + clamp(c.screen.offsetX, -1, 1)),
    y: area.y + ((area.h - vh - barH) / 2) * (1 + clamp(c.screen.offsetY, -1, 1)),
    w: vw,
    h: vh + barH
  }
  const radius = Math.min(c.screen.radius * u, Math.min(vw, vh) / 2)
  const bar = barH > 0 ? { x: win.x, y: win.y, w: win.w, h: barH } : null
  const screen: Rect = { x: win.x, y: win.y + barH, w: vw, h: vh }
  const screenRadii: Radii = bar ? [0, 0, radius, radius] : [radius, radius, radius, radius]

  if (showCamera && cam.mode === 'overlay') {
    const cw = cam.size * short
    const ch = cw / cameraAspect(cam.shape)
    const cx = clamp(cam.x * W, cw / 2, W - cw / 2)
    const cy = clamp(cam.y * H, ch / 2, H - ch / 2)
    camera = { x: cx - cw / 2, y: cy - ch / 2, w: cw, h: ch }
  }
  const cameraRadius = camera ? (cam.shape === 'circle' ? Math.min(camera.w, camera.h) / 2 : cam.shape === 'rounded' ? Math.min(camera.w, camera.h) * 0.14 : 0) : 0

  let brand: Layout['brand'] = null
  if (c.text.brand.enabled && c.text.brand.text.trim()) {
    const size = c.text.brand.size * u
    const m = Math.max(28 * u, pad * 0.45)
    const w = approxTextWidth(c.text.brand.text, size, 600) + size * 1.6
    const h = size * 2
    const atTop = c.text.position === 'bottom' || block.lines.length === 0
    const rightSide = c.text.align !== 'right'
    const rect = { x: rightSide ? W - m - w : m, y: atTop ? m : H - m - h, w, h }
    brand = { rect, item: { text: c.text.brand.text, x: rect.x + w / 2, y: rect.y + h / 2 - size * 0.62, size, weight: 600, color: c.text.brand.color, align: 'center' } }
  }

  return { W, H, u, screen, screenRadii, window: win, windowRadius: radius, bar, camera, cameraRadius, panel, text, brand, free: { x: area.w - vw, y: area.h - vh - barH } }
}

/** Default facecam centre (as canvas fractions) for a corner, kept in the padding margin where possible. */
export function cornerPosition(corner: string, size: number, out: Size, shape: CameraShape): { x: number; y: number } {
  const short = Math.min(out.w, out.h)
  const cw = size * short
  const ch = cw / cameraAspect(shape)
  const m = short * 0.035
  const left = (m + cw / 2) / out.w
  const right = 1 - left
  const top = (m + ch / 2) / out.h
  const bottom = 1 - top
  return {
    x: corner.endsWith('left') ? left : right,
    y: corner.startsWith('top') ? top : bottom
  }
}

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v))
}

function approxTextWidth(text: string, size: number, weight: number): number {
  return text.length * size * (weight >= 600 ? 0.58 : 0.54)
}

/** Centred cover crop of a source of size `src` into a target aspect. */
export function coverCrop(src: Size, target: Size): Rect {
  const sa = src.w / src.h
  const ta = target.w / target.h
  if (sa > ta) {
    const w = src.h * ta
    return { x: (src.w - w) / 2, y: 0, w, h: src.h }
  }
  const h = src.w / ta
  return { x: 0, y: (src.h - h) / 2, w: src.w, h }
}

// ---------------------------------------------------------------------------
// Drawing

export type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D
export type Drawable = CanvasImageSource & { width: number; height: number }

export function roundRectPath(ctx: Ctx, r: Rect, radii: number | Radii): void {
  ctx.beginPath()
  const rr = typeof radii === 'number' ? [radii, radii, radii, radii] : radii
  ctx.roundRect(r.x, r.y, r.w, r.h, rr.map((v) => Math.max(0, Math.min(v, r.w / 2, r.h / 2))))
}

function shapePath(ctx: Ctx, r: Rect, radius: number): void {
  roundRectPath(ctx, r, radius)
}

const SHADOWS: Record<ShadowLevel, { blur: number; y: number; alpha: number }> = {
  none: { blur: 0, y: 0, alpha: 0 },
  soft: { blur: 40, y: 12, alpha: 0.14 },
  medium: { blur: 60, y: 22, alpha: 0.22 },
  strong: { blur: 90, y: 36, alpha: 0.32 }
}

function withShadow(ctx: Ctx, level: ShadowLevel, u: number, draw: () => void): void {
  const s = SHADOWS[level]
  ctx.save()
  if (s.alpha > 0) {
    ctx.shadowColor = `rgba(15, 18, 30, ${s.alpha})`
    ctx.shadowBlur = s.blur * u
    ctx.shadowOffsetY = s.y * u
  }
  draw()
  ctx.restore()
}

export interface BackgroundAssets {
  image: Drawable | null
}

export type TemplatePainter = (ctx: Ctx, W: number, H: number) => void

export function drawBackground(ctx: Ctx, c: Composition, L: Layout, assets: BackgroundAssets, templatePainter: TemplatePainter): void {
  const { W, H } = L
  const bg = c.background
  ctx.save()
  if (bg.kind === 'solid') {
    ctx.fillStyle = bg.color
    ctx.fillRect(0, 0, W, H)
  } else if (bg.kind === 'gradient') {
    const a = (bg.angle * Math.PI) / 180
    const dx = (Math.cos(a) * W) / 2
    const dy = (Math.sin(a) * H) / 2
    const g = ctx.createLinearGradient(W / 2 - dx, H / 2 - dy, W / 2 + dx, H / 2 + dy)
    g.addColorStop(0, bg.from)
    g.addColorStop(1, bg.to)
    ctx.fillStyle = g
    ctx.fillRect(0, 0, W, H)
  } else if (bg.kind === 'image' && assets.image) {
    ctx.fillStyle = '#111'
    ctx.fillRect(0, 0, W, H)
    const crop = coverCrop({ w: assets.image.width, h: assets.image.height }, { w: W, h: H })
    ctx.drawImage(assets.image, crop.x, crop.y, crop.w, crop.h, 0, 0, W, H)
  } else {
    templatePainter(ctx, W, H)
  }
  ctx.restore()
}

/** Layer 1 (under the screen video): background, screen shadow and window chrome. */
export function drawBaseLayer(ctx: Ctx, c: Composition, L: Layout, assets: BackgroundAssets, templatePainter: TemplatePainter): void {
  drawBackground(ctx, c, L, assets, templatePainter)
  const bw = c.screen.borderWidth * L.u
  const outer = expand(L.window, bw)
  if (c.screen.shadow !== 'none' || bw > 0) {
    withShadow(ctx, c.screen.shadow, L.u, () => {
      roundRectPath(ctx, outer, L.windowRadius + bw)
      ctx.fillStyle = bw > 0 ? c.screen.borderColor : '#000'
      ctx.fill()
    })
    if (bw === 0) {
      // Keep only the shadow: repaint the background inside the shape, so the video's
      // anti-aliased rounded edges blend with the background rather than a dark fill.
      ctx.save()
      roundRectPath(ctx, L.window, L.windowRadius)
      ctx.clip()
      drawBackground(ctx, c, L, assets, templatePainter)
      ctx.restore()
    }
  }
  if (L.bar) drawChrome(ctx, c, L, L.bar)
  if (L.panel && c.camera.panel) {
    roundRectPath(ctx, L.panel, 24 * L.u)
    ctx.fillStyle = c.camera.panelColor
    ctx.fill()
  }
}

/** Layer 2 (between screen and camera): screen border and camera shadow/backing. */
export function drawMiddleLayer(ctx: Ctx, c: Composition, L: Layout): void {
  if (c.screen.borderWidth > 0) {
    const bw = c.screen.borderWidth * L.u
    roundRectPath(ctx, expand(L.window, bw / 2), L.windowRadius + bw / 2)
    ctx.lineWidth = bw
    ctx.strokeStyle = c.screen.borderColor
    ctx.stroke()
  }
  if (!L.camera) return
  const cr = L.camera
  if (c.camera.panel && !L.panel) {
    const p = expand(cr, 10 * L.u)
    roundRectPath(ctx, p, L.cameraRadius + 10 * L.u)
    ctx.fillStyle = c.camera.panelColor
    withShadow(ctx, c.camera.shadow ? 'medium' : 'none', L.u, () => ctx.fill())
  } else if (c.camera.shadow) {
    // Shadow only: draw the shape with a shadow, then punch the shape out.
    withShadow(ctx, 'medium', L.u, () => {
      shapePath(ctx, cr, L.cameraRadius)
      ctx.fillStyle = '#000'
      ctx.fill()
    })
    ctx.save()
    ctx.globalCompositeOperation = 'destination-out'
    shapePath(ctx, cr, L.cameraRadius)
    ctx.fill()
    ctx.restore()
  }
}

/** Layer 3 (top): camera border, titles and brand label. */
export function drawForegroundLayer(ctx: Ctx, c: Composition, L: Layout): void {
  if (L.camera && c.camera.borderWidth > 0) {
    const bw = c.camera.borderWidth * L.u
    shapePath(ctx, L.camera, L.cameraRadius)
    ctx.save()
    ctx.clip()
    shapePath(ctx, L.camera, L.cameraRadius)
    ctx.lineWidth = bw * 2
    ctx.strokeStyle = c.camera.borderColor
    ctx.stroke()
    ctx.restore()
  }
  ctx.textBaseline = 'top'
  for (const t of L.text) {
    ctx.font = font(t.weight, t.size)
    ctx.fillStyle = t.color
    ctx.textAlign = t.align
    ctx.fillText(t.text, t.x, t.y, L.W * 0.9)
  }
  if (L.brand) {
    const { rect, item } = L.brand
    roundRectPath(ctx, rect, rect.h / 2)
    ctx.fillStyle = hexWithAlpha(item.color, 0.12)
    ctx.fill()
    ctx.font = font(item.weight, item.size)
    ctx.fillStyle = item.color
    ctx.textAlign = 'center'
    ctx.fillText(item.text, item.x, item.y)
  }
}

function drawChrome(ctx: Ctx, c: Composition, L: Layout, bar: Rect): void {
  const dark = c.screen.frameTheme === 'dark'
  const u = L.u
  roundRectPath(ctx, bar, [L.windowRadius, L.windowRadius, 0, 0])
  ctx.fillStyle = dark ? '#1f2128' : '#eceef2'
  ctx.fill()
  ctx.fillStyle = dark ? '#2b2e37' : '#dcdfe5'
  ctx.fillRect(bar.x, bar.y + bar.h - Math.max(1, u), bar.w, Math.max(1, u))
  const cy = bar.y + bar.h / 2
  if (c.screen.frame === 'browser') {
    const dots = ['#ff5f57', '#febc2e', '#28c840']
    dots.forEach((col, i) => {
      ctx.beginPath()
      ctx.arc(bar.x + 22 * u + i * 20 * u, cy, 6 * u, 0, Math.PI * 2)
      ctx.fillStyle = col
      ctx.fill()
    })
    const urlW = Math.min(bar.w * 0.5, 620 * u)
    const url: Rect = { x: bar.x + (bar.w - urlW) / 2, y: cy - 13 * u, w: urlW, h: 26 * u }
    roundRectPath(ctx, url, 13 * u)
    ctx.fillStyle = dark ? '#2b2e37' : '#ffffff'
    ctx.fill()
    ctx.font = font(500, 13 * u)
    ctx.fillStyle = dark ? '#9aa0ad' : '#6b7280'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('recova.app', url.x + url.w / 2, cy + u)
  } else {
    // Windows-style caption buttons.
    const col = dark ? '#c9ccd4' : '#4b5060'
    ctx.strokeStyle = col
    ctx.lineWidth = Math.max(1, 1.4 * u)
    const s = 5 * u
    const right = bar.x + bar.w
    const xs = [right - 28 * u, right - 66 * u, right - 104 * u]
    ctx.beginPath()
    ctx.moveTo(xs[0] - s, cy - s)
    ctx.lineTo(xs[0] + s, cy + s)
    ctx.moveTo(xs[0] + s, cy - s)
    ctx.lineTo(xs[0] - s, cy + s)
    ctx.stroke()
    ctx.strokeRect(xs[1] - s, cy - s, s * 2, s * 2)
    ctx.beginPath()
    ctx.moveTo(xs[2] - s, cy)
    ctx.lineTo(xs[2] + s, cy)
    ctx.stroke()
    ctx.beginPath()
    roundRectPath(ctx, { x: bar.x + 14 * u, y: cy - 7 * u, w: 14 * u, h: 14 * u }, 3 * u)
    ctx.fillStyle = '#6366f1'
    ctx.fill()
    ctx.font = font(500, 13 * u)
    ctx.fillStyle = col
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText('Recova', bar.x + 38 * u, cy + u)
  }
}

/** Masks carry the shape in their alpha channel (FFmpeg reads it with alphaextract, avoiding colour-range issues). */
export function drawMask(ctx: Ctx, w: number, h: number, radii: number | Radii): void {
  ctx.clearRect(0, 0, w, h)
  roundRectPath(ctx, { x: 0, y: 0, w, h }, radii)
  ctx.fillStyle = '#fff'
  ctx.fill()
}

/** Draws a video frame into a rect, either stretched to an aspect-matched rect (fit) or cover-cropped (fill). */
export function drawVideoInto(ctx: Ctx, video: Drawable, src: Size, rect: Rect, radii: number | Radii, mode: FitMode, mirror = false): void {
  if (src.w <= 0 || src.h <= 0) return
  ctx.save()
  roundRectPath(ctx, rect, radii)
  ctx.clip()
  const crop = mode === 'fill' ? coverCrop(src, rect) : { x: 0, y: 0, w: src.w, h: src.h }
  if (mirror) {
    ctx.translate(rect.x * 2 + rect.w, 0)
    ctx.scale(-1, 1)
  }
  ctx.drawImage(video, crop.x, crop.y, crop.w, crop.h, rect.x, rect.y, rect.w, rect.h)
  ctx.restore()
}

export function expand(r: Rect, d: number): Rect {
  return { x: r.x - d, y: r.y - d, w: r.w + d * 2, h: r.h + d * 2 }
}

export function hexWithAlpha(color: string, alpha: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(color)
  if (!m) return color
  const n = parseInt(m[1], 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
}

export function hitTest(r: Rect | null, x: number, y: number): boolean {
  return r !== null && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h
}
