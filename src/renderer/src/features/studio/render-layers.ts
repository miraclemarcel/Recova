import type { Rect } from '@shared/types'
import {
  computeLayout,
  drawBaseLayer,
  drawForegroundLayer,
  drawMask,
  drawMiddleLayer,
  even,
  type BackgroundAssets,
  type Composition,
  type Layout,
  type Size
} from './composition'
import { getTemplate } from './templates'

async function toPng(canvas: OffscreenCanvas): Promise<ArrayBuffer> {
  const blob = await canvas.convertToBlob({ type: 'image/png' })
  return blob.arrayBuffer()
}

function canvas2d(w: number, h: number): [OffscreenCanvas, OffscreenCanvasRenderingContext2D] {
  const c = new OffscreenCanvas(Math.max(2, Math.round(w)), Math.max(2, Math.round(h)))
  const ctx = c.getContext('2d')
  if (!ctx) throw new Error('Canvas is unavailable.')
  return [c, ctx]
}

/** Snaps a rect to even integer pixels, matching how FFmpeg places the scaled video. */
function snap(r: Rect): Rect {
  return { x: Math.round(r.x), y: Math.round(r.y), w: even(r.w), h: even(r.h) }
}

export interface RenderedLayers {
  layout: Layout
  background: ArrayBuffer
  middle: ArrayBuffer
  foreground: ArrayBuffer
  screenRect: Rect
  screenMask: ArrayBuffer
  cameraRect: Rect | null
  cameraMask: ArrayBuffer | null
}

/** Renders the static layers of a composition at full output resolution for the exporter. */
export async function renderExportLayers(c: Composition, source: Size, hasCamera: boolean, out: Size, assets: BackgroundAssets): Promise<RenderedLayers> {
  const layout = computeLayout(c, source, hasCamera, out)
  const screenRect = snap(layout.screen)
  const cameraRect = layout.camera ? snap(layout.camera) : null
  // Draw with the snapped rects so the layers line up exactly with the composited video.
  const L: Layout = { ...layout, screen: screenRect, camera: cameraRect }
  const painter = getTemplate(c.templateId).paint

  const [bg, bgCtx] = canvas2d(out.w, out.h)
  drawBaseLayer(bgCtx, c, L, assets, painter)
  const [mid, midCtx] = canvas2d(out.w, out.h)
  drawMiddleLayer(midCtx, c, L)
  const [fg, fgCtx] = canvas2d(out.w, out.h)
  drawForegroundLayer(fgCtx, c, L)

  const [sm, smCtx] = canvas2d(screenRect.w, screenRect.h)
  drawMask(smCtx, screenRect.w, screenRect.h, L.screenRadii)

  let cameraMask: ArrayBuffer | null = null
  if (cameraRect) {
    const [cm, cmCtx] = canvas2d(cameraRect.w, cameraRect.h)
    drawMask(cmCtx, cameraRect.w, cameraRect.h, L.cameraRadius)
    cameraMask = await toPng(cm)
  }

  return {
    layout: L,
    background: await toPng(bg),
    middle: await toPng(mid),
    foreground: await toPng(fg),
    screenRect,
    screenMask: await toPng(sm),
    cameraRect,
    cameraMask
  }
}
