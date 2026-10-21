import { useEffect, useMemo, useRef, useState } from 'react'
import type { RecordingMeta } from '@shared/types'
import {
  clamp,
  computeLayout,
  drawBaseLayer,
  drawForegroundLayer,
  drawMiddleLayer,
  drawVideoInto,
  hitTest,
  type BackgroundAssets,
  type Composition,
  type Size
} from './composition'
import { getTemplate } from './templates'

interface Props {
  comp: Composition
  rec: RecordingMeta
  hasCamera: boolean
  out: Size
  assets: BackgroundAssets
  screenVideo: HTMLVideoElement | null
  cameraVideo: HTMLVideoElement | null
  onChange: (fn: (c: Composition) => Composition) => void
}

function makeLayerCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}

/**
 * Live preview. Static layers are rendered once per change into cached canvases using the same
 * drawing functions as the exporter; each frame only blits the caches and draws the video frames.
 */
export function PreviewCanvas({ comp, rec, hasCamera, out, assets, screenVideo, cameraVideo, onChange }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [box, setBox] = useState({ w: 0, h: 0 })
  const [hover, setHover] = useState<'camera' | 'screen' | null>(null)
  const drag = useRef<{ kind: 'camera' | 'screen'; startX: number; startY: number; orig: Composition } | null>(null)

  const source = useMemo(() => ({ w: rec.width, h: rec.height }), [rec.width, rec.height])
  const layout = useMemo(() => computeLayout(comp, source, hasCamera, out), [comp, source, hasCamera, out])

  // Fit the preview canvas into the available space, keeping the output aspect ratio.
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect()
      const aspect = out.w / out.h
      let w = r.width
      let h = w / aspect
      if (h > r.height) {
        h = r.height
        w = h * aspect
      }
      setBox({ w: Math.floor(w), h: Math.floor(h) })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [out.w, out.h])

  const pixelScale = box.w > 0 ? Math.min(1, (box.w * window.devicePixelRatio) / out.w) : 0
  const pw = Math.max(1, Math.round(out.w * pixelScale))
  const ph = Math.max(1, Math.round(out.h * pixelScale))

  const layers = useMemo(() => {
    if (pixelScale <= 0) return null
    const painter = getTemplate(comp.templateId).paint
    const make = (draw: (ctx: CanvasRenderingContext2D) => void) => {
      const c = makeLayerCanvas(pw, ph)
      const ctx = c.getContext('2d')!
      ctx.setTransform(pixelScale, 0, 0, pixelScale, 0, 0)
      draw(ctx)
      return c
    }
    return {
      base: make((ctx) => drawBaseLayer(ctx, comp, layout, assets, painter)),
      middle: make((ctx) => drawMiddleLayer(ctx, comp, layout)),
      fore: make((ctx) => drawForegroundLayer(ctx, comp, layout))
    }
  }, [comp, layout, assets, pw, ph, pixelScale])

  // Render loop.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !layers) return
    const ctx = canvas.getContext('2d')!
    let raf = 0
    const draw = () => {
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, pw, ph)
      ctx.drawImage(layers.base, 0, 0)
      ctx.setTransform(pixelScale, 0, 0, pixelScale, 0, 0)
      if (screenVideo && screenVideo.readyState >= 2) {
        drawVideoInto(ctx, screenVideo, { w: screenVideo.videoWidth, h: screenVideo.videoHeight }, layout.screen, layout.screenRadii, comp.fit)
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.drawImage(layers.middle, 0, 0)
      ctx.setTransform(pixelScale, 0, 0, pixelScale, 0, 0)
      if (layout.camera) {
        const camReady = cameraVideo && cameraVideo.readyState >= 2 && cameraVideo.videoWidth > 0
        if (camReady) {
          drawVideoInto(ctx, cameraVideo, { w: cameraVideo.videoWidth, h: cameraVideo.videoHeight }, layout.camera, layout.cameraRadius, 'fill', comp.camera.mirror)
        } else {
          ctx.save()
          ctx.beginPath()
          ctx.roundRect(layout.camera.x, layout.camera.y, layout.camera.w, layout.camera.h, layout.cameraRadius)
          ctx.fillStyle = '#2a2a33'
          ctx.fill()
          ctx.restore()
        }
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.drawImage(layers.fore, 0, 0)
      raf = requestAnimationFrame(draw)
    }
    draw()
    return () => cancelAnimationFrame(raf)
  }, [layers, layout, comp.fit, comp.camera.mirror, screenVideo, cameraVideo, pw, ph, pixelScale])

  const toCanvas = (e: React.PointerEvent) => {
    const r = canvasRef.current!.getBoundingClientRect()
    return { x: ((e.clientX - r.left) / r.width) * out.w, y: ((e.clientY - r.top) / r.height) * out.h }
  }
  const target = (p: { x: number; y: number }) =>
    layout.camera && comp.camera.mode === 'overlay' && hitTest(layout.camera, p.x, p.y) ? 'camera' : hitTest(layout.window, p.x, p.y) && (layout.free.x > 1 || layout.free.y > 1) ? 'screen' : null

  const onPointerDown = (e: React.PointerEvent) => {
    const p = toCanvas(e)
    const kind = target(p)
    if (!kind) return
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    drag.current = { kind, startX: p.x, startY: p.y, orig: comp }
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const p = toCanvas(e)
    const d = drag.current
    if (!d) {
      setHover(target(p))
      return
    }
    const dx = p.x - d.startX
    const dy = p.y - d.startY
    if (d.kind === 'camera') {
      onChange((c) => ({ ...c, camera: { ...c.camera, x: clamp(d.orig.camera.x + dx / out.w, 0, 1), y: clamp(d.orig.camera.y + dy / out.h, 0, 1) } }))
    } else {
      onChange((c) => ({
        ...c,
        screen: {
          ...c.screen,
          offsetX: layout.free.x > 1 ? clamp(d.orig.screen.offsetX + (2 * dx) / layout.free.x, -1, 1) : c.screen.offsetX,
          offsetY: layout.free.y > 1 ? clamp(d.orig.screen.offsetY + (2 * dy) / layout.free.y, -1, 1) : c.screen.offsetY
        }
      }))
    }
  }
  const onPointerUp = () => (drag.current = null)

  return (
    <div ref={wrapRef} className="flex size-full items-center justify-center">
      <canvas
        ref={canvasRef}
        width={pw}
        height={ph}
        style={{ width: box.w, height: box.h, cursor: drag.current ? 'grabbing' : hover ? 'grab' : 'default' }}
        className="rounded-lg shadow-pop ring-1 ring-black/5"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => !drag.current && setHover(null)}
      />
    </div>
  )
}
