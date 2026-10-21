// Generates build/icon.png (1024×1024) — the Recova mark — with no dependencies.
// Usage: node scripts/generate-icon.mjs
import { writeFileSync, mkdirSync } from 'node:fs'
import { deflateSync } from 'node:zlib'

const S = 1024
const SS = 4 // supersampling per axis for anti-aliasing
const u = S / 32 // the mark is designed on a 32×32 grid

function roundRectDist(px, py, x, y, w, h, r) {
  const cx = Math.max(x + r, Math.min(px, x + w - r))
  const cy = Math.max(y + r, Math.min(py, y + h - r))
  const inside = px >= x && px <= x + w && py >= y && py <= y + h
  const dx = px - cx
  const dy = py - cy
  const d = Math.hypot(dx, dy)
  if (px >= x + r && px <= x + w - r) return inside ? -Math.min(py - y, y + h - py) : Math.max(y - py, py - y - h)
  if (py >= y + r && py <= y + h - r) return inside ? -Math.min(px - x, x + w - px) : Math.max(x - px, px - x - w)
  return d - r
}

function sample(px, py) {
  // Returns RGBA for a point on the 32×32 grid.
  const gx = px / u
  const gy = py / u
  if (roundRectDist(gx, gy, 0, 0, 32, 32, 9) > 0) return [0, 0, 0, 0]
  if (Math.hypot(gx - 16, gy - 16) <= 3.6) return [255, 90, 95, 255]
  const d = roundRectDist(gx, gy, 6.5, 9, 19, 14, 3.5)
  if (Math.abs(d) <= 1) return [255, 255, 255, 255]
  return [22, 22, 29, 255]
}

const raw = Buffer.alloc((S * 4 + 1) * S)
for (let y = 0; y < S; y++) {
  raw[y * (S * 4 + 1)] = 0
  for (let x = 0; x < S; x++) {
    const acc = [0, 0, 0, 0]
    for (let sy = 0; sy < SS; sy++)
      for (let sx = 0; sx < SS; sx++) {
        const c = sample(x + (sx + 0.5) / SS, y + (sy + 0.5) / SS)
        acc[0] += c[0] * c[3]
        acc[1] += c[1] * c[3]
        acc[2] += c[2] * c[3]
        acc[3] += c[3]
      }
    const o = y * (S * 4 + 1) + 1 + x * 4
    const a = acc[3]
    raw[o] = a ? Math.round(acc[0] / a) : 0
    raw[o + 1] = a ? Math.round(acc[1] / a) : 0
    raw[o + 2] = a ? Math.round(acc[2] / a) : 0
    raw[o + 3] = Math.round(a / (SS * SS))
  }
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc32 = (buf) => {
  let c = 0xffffffff
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
const chunk = (type, data) => {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}
const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(S, 0)
ihdr.writeUInt32BE(S, 4)
ihdr[8] = 8
ihdr[9] = 6
const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))])
mkdirSync('build', { recursive: true })
writeFileSync('build/icon.png', png)
console.log(`build/icon.png written (${png.length} bytes)`)
