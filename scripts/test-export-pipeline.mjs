// End-to-end check of the FFmpeg composition pipeline used by the exporter.
// Generates a WebM "recording" (VP9 + Opus, like MediaRecorder), a camera WebM and PNG layers,
// runs the real buildExportArgs() command, and verifies the MP4 output.
// Run with: node scripts/test-export-pipeline.mjs  (Node 22.6+ for TypeScript type stripping)
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import ffmpeg from 'ffmpeg-static'
import { buildExportArgs } from '../src/main/export-args.ts'

const dir = resolve('test-output')
rmSync(dir, { recursive: true, force: true })
mkdirSync(dir, { recursive: true })
const p = (f) => join(dir, f)

function run(args, label) {
  const r = spawnSync(ffmpeg, ['-hide_banner', '-y', ...args], { encoding: 'utf8' })
  if (r.status !== 0) {
    console.error(`✗ ${label}\n${r.stderr.split('\n').slice(-15).join('\n')}`)
    process.exit(1)
  }
  return r.stderr
}

const DUR = 3
run(['-f', 'lavfi', '-i', `testsrc2=size=1920x1080:rate=30:duration=${DUR}`, '-f', 'lavfi', '-i', `sine=frequency=440:duration=${DUR}`, '-c:v', 'libvpx-vp9', '-deadline', 'realtime', '-cpu-used', '8', '-b:v', '2M', '-c:a', 'libopus', p('screen.webm')], 'generate screen')
run(['-f', 'lavfi', '-i', `testsrc=size=640x480:rate=30:duration=${DUR}`, '-c:v', 'libvpx', '-deadline', 'realtime', '-b:v', '1M', p('camera.webm')], 'generate camera')

const W = 1920, H = 1080
const screen = { x: 160, y: 90, w: 1600, h: 900 }
const cam = { x: 1500, y: 760, w: 300, h: 300 }
run(['-f', 'lavfi', '-i', `color=c=0x6d28d9:s=${W}x${H}`, '-frames:v', '1', p('bg.png')], 'bg')
run(['-f', 'lavfi', '-i', `color=c=black@0.0:s=${W}x${H},format=rgba`, '-frames:v', '1', p('mid.png')], 'mid')
// Foreground: a white "title" bar, transparent elsewhere.
const rgba = (w, h, alpha) => `color=c=white:s=${w}x${h},format=rgba,geq=r=255:g=255:b=255:a='${alpha}'`
run(['-f', 'lavfi', '-i', rgba(W, H, 'if(lt(X,440)*gt(X,40)*lt(Y,70)*gt(Y,20),255,0)'), '-frames:v', '1', p('fg.png')], 'fg')
// Masks carry the shape in alpha, exactly like the renderer's drawMask().
run(['-f', 'lavfi', '-i', rgba(screen.w, screen.h, 'if(lte(hypot(max(0,abs(X-W/2)-(W/2-40)),max(0,abs(Y-H/2)-(H/2-40))),40),255,0)'), '-frames:v', '1', p('smask.png')], 'screen mask')
run(['-f', 'lavfi', '-i', rgba(cam.w, cam.h, `if(lte(hypot(X-${cam.w / 2},Y-${cam.h / 2}),${cam.w / 2}),255,0)`), '-frames:v', '1', p('cmask.png')], 'camera mask')

const exportWith = (out, withCamera) =>
  buildExportArgs(
    { recordingId: 'test', outputDir: dir, fileName: 'export', width: W, height: H, fps: 30, quality: 'standard', label: 'test', screen: { rect: screen, fit: 'fill' }, camera: withCamera ? { rect: cam, mirror: true } : null },
    { screenPath: p('screen.webm'), cameraPath: withCamera ? p('camera.webm') : null, durationSec: DUR, camera: withCamera ? { width: 640, height: 480, offsetMs: 120 } : null },
    { background: p('bg.png'), middle: p('mid.png'), foreground: p('fg.png'), screenMask: p('smask.png'), cameraMask: withCamera ? p('cmask.png') : null },
    out
  )
const out = p('export.mp4')
const t0 = Date.now()
run(exportWith(out, true), 'export')
const elapsed = Date.now() - t0
run(exportWith(p('export-nocam.mp4'), false), 'export without camera')
run(['-ss', '1', '-i', p('export-nocam.mp4'), '-frames:v', '1', p('frame-nocam.png')], 'grab frame (no camera)')
if (!existsSync(out)) throw new Error('no output')
const info = spawnSync(ffmpeg, ['-hide_banner', '-i', out], { encoding: 'utf8' }).stderr
const ok = /Video: h264/.test(info) && /1920x1080/.test(info) && /Audio: aac/.test(info) && /Duration: 00:00:0[23]/.test(info)
console.log(info.split('\n').filter((l) => /Duration|Stream/.test(l)).join('\n'))
run(['-ss', '1', '-i', out, '-frames:v', '1', p('frame.png')], 'grab frame')
// Pixel probes (RGB at a point) to verify masking and layering.
function pixel(x, y, file = 'frame.png') {
  const r = spawnSync(ffmpeg, ['-v', 'error', '-i', p(file), '-vf', `crop=1:1:${x}:${y}`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { encoding: 'buffer' })
  return [...r.stdout]
}
const near = (a, b, tol = 40) => a.every((v, i) => Math.abs(v - b[i]) <= tol)
const checks = [
  ['background outside video is purple', pixel(20, 20), [0x6d, 0x28, 0xd9]],
  ['rounded screen corner shows background', pixel(screen.x + 3, screen.y + 3), [0x6d, 0x28, 0xd9]],
  ['camera square corner (outside circle) shows the screen beneath', pixel(cam.x + 6, cam.y + 6), pixel(cam.x + 6, cam.y + 6, 'frame-nocam.png')],
  ['camera centre shows camera footage', pixel(cam.x + 150, cam.y + 150), pixel(cam.x + 150, cam.y + 150, 'frame-nocam.png')],
  ['foreground title bar is white', pixel(200, 45), [255, 255, 255]]
]
let pass = ok
for (const [label, got, want] of checks) {
  const good = label.startsWith('camera centre') ? !near(got, want, 12) : near(got, want)
  pass &&= good
  console.log(`${good ? '✓' : '✗'} ${label} (got ${got.join(',')})`)
}
console.log(pass ? `✓ export pipeline OK (${elapsed} ms) → ${out}` : '✗ export pipeline checks failed')
process.exit(pass ? 0 : 1)
