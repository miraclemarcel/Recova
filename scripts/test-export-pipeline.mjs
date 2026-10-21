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
run(['-f', 'lavfi', '-i', `color=c=white@0.0:s=${W}x${H},format=rgba,drawbox=x=40:y=40:w=400:h=60:color=white@0.9:t=fill`, '-frames:v', '1', p('fg.png')], 'fg')
// Masks: white ellipse-ish via geq on black.
run(['-f', 'lavfi', '-i', `color=c=white:s=${screen.w}x${screen.h}`, '-frames:v', '1', p('smask.png')], 'screen mask')
run(['-f', 'lavfi', '-i', `color=c=black:s=${cam.w}x${cam.h},geq=lum='if(lte(hypot(X-${cam.w / 2},Y-${cam.h / 2}),${cam.w / 2}),255,0)'`, '-frames:v', '1', p('cmask.png')], 'camera mask')

const out = p('export.mp4')
const args = buildExportArgs(
  { recordingId: 'test', outputDir: dir, fileName: 'export', width: W, height: H, fps: 30, quality: 'standard', label: 'test', screen: { rect: screen, fit: 'fill' }, camera: { rect: cam, mirror: true } },
  { screenPath: p('screen.webm'), cameraPath: p('camera.webm'), durationSec: DUR, camera: { width: 640, height: 480, offsetMs: 120 } },
  { background: p('bg.png'), middle: p('mid.png'), foreground: p('fg.png'), screenMask: p('smask.png'), cameraMask: p('cmask.png') },
  out
)
const t0 = Date.now()
run(args, 'export')
if (!existsSync(out)) throw new Error('no output')
const info = spawnSync(ffmpeg, ['-hide_banner', '-i', out], { encoding: 'utf8' }).stderr
const ok = /Video: h264/.test(info) && /1920x1080/.test(info) && /Audio: aac/.test(info) && /Duration: 00:00:0[23]/.test(info)
console.log(info.split('\n').filter((l) => /Duration|Stream/.test(l)).join('\n'))
// Pixel probes: background corner should be purple, camera corner area outside the circle should show the screen.
run(['-ss', '1', '-i', out, '-frames:v', '1', p('frame.png')], 'grab frame')
console.log(ok ? `✓ export pipeline OK (${Date.now() - t0} ms) → ${out}` : '✗ unexpected output format')
process.exit(ok ? 0 : 1)
