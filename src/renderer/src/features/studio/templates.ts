import type { Ctx, TemplatePainter } from './composition'

export interface Template {
  id: string
  name: string
  category: 'Light' | 'Dark' | 'Color' | 'Pattern'
  textColor: string
  subtleTextColor: string
  frameTheme: 'light' | 'dark'
  paint: TemplatePainter
}

function linear(ctx: Ctx, W: number, H: number, stops: string[], angleDeg = 135): void {
  const a = (angleDeg * Math.PI) / 180
  const r = Math.hypot(W, H) / 2
  const g = ctx.createLinearGradient(W / 2 - Math.cos(a) * r, H / 2 - Math.sin(a) * r, W / 2 + Math.cos(a) * r, H / 2 + Math.sin(a) * r)
  stops.forEach((s, i) => g.addColorStop(i / Math.max(1, stops.length - 1), s))
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)
}

function glow(ctx: Ctx, W: number, H: number, x: number, y: number, r: number, color: string): void {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r)
  g.addColorStop(0, color)
  g.addColorStop(1, color.replace(/[\d.]+\)$/, '0)'))
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)
}

function radialFill(ctx: Ctx, W: number, H: number, inner: string, outer: string): void {
  const g = ctx.createRadialGradient(W / 2, H * 0.4, 0, W / 2, H * 0.4, Math.hypot(W, H) * 0.65)
  g.addColorStop(0, inner)
  g.addColorStop(1, outer)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)
}

/** Deterministic PRNG so pattern templates render identically in preview and export. */
function rng(seed: number): () => number {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
}

const solidSoft = (inner: string, outer: string): TemplatePainter => (ctx, W, H) => radialFill(ctx, W, H, inner, outer)

export const TEMPLATES: Template[] = [
  { id: 'white-studio', name: 'Clean White Studio', category: 'Light', textColor: '#111827', subtleTextColor: '#6b7280', frameTheme: 'light', paint: solidSoft('#ffffff', '#eef0f4') },
  { id: 'soft-grey', name: 'Soft Grey Professional', category: 'Light', textColor: '#1f2937', subtleTextColor: '#6b7280', frameTheme: 'light', paint: (ctx, W, H) => linear(ctx, W, H, ['#f1f2f5', '#dde0e6'], 90) },
  { id: 'warm-cream', name: 'Warm Cream', category: 'Light', textColor: '#3b2f22', subtleTextColor: '#8a7660', frameTheme: 'light', paint: solidSoft('#fbf6ee', '#efe4d3') },
  {
    id: 'midnight', name: 'Midnight Black', category: 'Dark', textColor: '#f9fafb', subtleTextColor: '#9ca3af', frameTheme: 'dark',
    paint: (ctx, W, H) => {
      ctx.fillStyle = '#09090c'
      ctx.fillRect(0, 0, W, H)
      const g = ctx.createRadialGradient(W / 2, -H * 0.2, 0, W / 2, -H * 0.2, H * 1.1)
      g.addColorStop(0, 'rgba(120,130,170,0.28)')
      g.addColorStop(1, 'rgba(9,9,12,0)')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, W, H)
    }
  },
  { id: 'deep-navy', name: 'Deep Navy', category: 'Dark', textColor: '#f1f5ff', subtleTextColor: '#93a4c8', frameTheme: 'dark', paint: (ctx, W, H) => linear(ctx, W, H, ['#16254a', '#0b1530', '#070d1f'], 120) },
  { id: 'lavender', name: 'Lavender', category: 'Color', textColor: '#2e1f5e', subtleTextColor: '#6b5aa6', frameTheme: 'light', paint: (ctx, W, H) => linear(ctx, W, H, ['#f1edff', '#ddd3fb'], 135) },
  { id: 'soft-pink', name: 'Soft Pink', category: 'Color', textColor: '#5c1f36', subtleTextColor: '#a85a78', frameTheme: 'light', paint: (ctx, W, H) => linear(ctx, W, H, ['#fff0f4', '#fad3e0'], 135) },
  { id: 'mint', name: 'Mint Green', category: 'Color', textColor: '#11402f', subtleTextColor: '#4f8a72', frameTheme: 'light', paint: (ctx, W, H) => linear(ctx, W, H, ['#ecfaf3', '#c8eedb'], 135) },
  { id: 'sky', name: 'Sky Blue', category: 'Color', textColor: '#0e2f52', subtleTextColor: '#4a7bb0', frameTheme: 'light', paint: (ctx, W, H) => linear(ctx, W, H, ['#eef7ff', '#c4e0fb'], 160) },
  { id: 'sunset', name: 'Sunset', category: 'Color', textColor: '#ffffff', subtleTextColor: '#fde7e1', frameTheme: 'dark', paint: (ctx, W, H) => linear(ctx, W, H, ['#ffb36b', '#ff7a7a', '#c86dd7', '#7c6cf2'], 125) },
  {
    id: 'geometric', name: 'Minimal Geometric', category: 'Pattern', textColor: '#1f2937', subtleTextColor: '#6b7280', frameTheme: 'light',
    paint: (ctx, W, H) => {
      const u = Math.min(W, H) / 1080
      ctx.fillStyle = '#f5f4f0'
      ctx.fillRect(0, 0, W, H)
      ctx.lineWidth = 3 * u
      ctx.strokeStyle = 'rgba(99,102,241,0.35)'
      ctx.beginPath()
      ctx.arc(W * 0.08, H * 0.15, 130 * u, 0, Math.PI * 2)
      ctx.stroke()
      ctx.fillStyle = 'rgba(251,191,36,0.28)'
      ctx.beginPath()
      ctx.arc(W * 0.93, H * 0.86, 170 * u, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = 'rgba(16,185,129,0.22)'
      ctx.beginPath()
      ctx.moveTo(W * 0.88, H * 0.05)
      ctx.lineTo(W * 0.97, H * 0.24)
      ctx.lineTo(W * 0.8, H * 0.22)
      ctx.closePath()
      ctx.fill()
      ctx.strokeStyle = 'rgba(244,63,94,0.3)'
      ctx.save()
      ctx.translate(W * 0.06, H * 0.84)
      ctx.rotate(0.3)
      ctx.strokeRect(-70 * u, -70 * u, 140 * u, 140 * u)
      ctx.restore()
      ctx.fillStyle = 'rgba(31,41,55,0.12)'
      for (let i = 0; i < 6; i++) for (let j = 0; j < 4; j++) {
        ctx.beginPath()
        ctx.arc(W * 0.2 + i * 22 * u, H * 0.92 + j * 22 * u - 40 * u, 3 * u, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  },
  {
    id: 'abstract', name: 'Abstract Color', category: 'Pattern', textColor: '#1e1b4b', subtleTextColor: '#4c4a7a', frameTheme: 'light',
    paint: (ctx, W, H) => {
      const r = Math.max(W, H)
      ctx.fillStyle = '#fbfaff'
      ctx.fillRect(0, 0, W, H)
      glow(ctx, W, H, W * 0.1, H * 0.15, r * 0.45, 'rgba(255,140,170,0.55)')
      glow(ctx, W, H, W * 0.9, H * 0.2, r * 0.42, 'rgba(120,170,255,0.55)')
      glow(ctx, W, H, W * 0.75, H * 0.95, r * 0.45, 'rgba(255,200,90,0.5)')
      glow(ctx, W, H, W * 0.15, H * 0.9, r * 0.38, 'rgba(110,220,180,0.5)')
    }
  },
  {
    id: 'modern-gradient', name: 'Modern Gradient', category: 'Color', textColor: '#ffffff', subtleTextColor: '#e0e7ff', frameTheme: 'dark',
    paint: (ctx, W, H) => {
      const r = Math.max(W, H)
      linear(ctx, W, H, ['#4338ca', '#6d28d9'], 135)
      glow(ctx, W, H, W * 0.0, H * 1.0, r * 0.6, 'rgba(34,211,238,0.55)')
      glow(ctx, W, H, W * 1.0, H * 0.0, r * 0.55, 'rgba(244,114,182,0.5)')
    }
  },
  {
    id: 'developer', name: 'Developer', category: 'Dark', textColor: '#e6edf3', subtleTextColor: '#7d8590', frameTheme: 'dark',
    paint: (ctx, W, H) => {
      const u = Math.min(W, H) / 1080
      ctx.fillStyle = '#0d1117'
      ctx.fillRect(0, 0, W, H)
      ctx.fillStyle = 'rgba(125,133,144,0.16)'
      const step = 32 * u
      for (let x = step / 2; x < W; x += step) for (let y = step / 2; y < H; y += step) ctx.fillRect(x, y, 2 * u, 2 * u)
      const g = ctx.createRadialGradient(W * 0.85, H * 0.1, 0, W * 0.85, H * 0.1, W * 0.5)
      g.addColorStop(0, 'rgba(46,160,67,0.22)')
      g.addColorStop(1, 'rgba(13,17,23,0)')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, W, H)
      const rand = rng(7)
      ctx.font = `500 ${Math.round(20 * u)}px Consolas, "Cascadia Code", Menlo, monospace`
      ctx.textBaseline = 'top'
      const snippets = ['const app = recova()', '</>', '{ }', 'npm run build', '=> render()', 'git commit', '// ship it', 'export default']
      for (let i = 0; i < 10; i++) {
        ctx.fillStyle = `rgba(${rand() > 0.5 ? '121,192,255' : '126,231,135'},${0.1 + rand() * 0.1})`
        const edge = i % 2 === 0
        ctx.fillText(snippets[i % snippets.length], edge ? 24 * u + rand() * W * 0.08 : W * 0.86 + rand() * W * 0.06, 30 * u + (i / 10) * H * 0.9)
      }
    }
  },
  {
    id: 'presentation', name: 'Minimal Presentation', category: 'Light', textColor: '#0f172a', subtleTextColor: '#64748b', frameTheme: 'light',
    paint: (ctx, W, H) => {
      const u = Math.min(W, H) / 1080
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, W, H)
      ctx.fillStyle = '#f1f5f9'
      ctx.fillRect(0, H * 0.72, W, H * 0.28)
      ctx.fillStyle = '#2563eb'
      ctx.fillRect(0, 0, 10 * u, H)
      ctx.fillStyle = 'rgba(37,99,235,0.12)'
      ctx.fillRect(W - 220 * u, 0, 220 * u, 8 * u)
    }
  }
]

export const DEFAULT_TEMPLATE_ID = 'white-studio'

export function getTemplate(id: string): Template {
  return TEMPLATES.find((t) => t.id === id) ?? TEMPLATES[0]
}

export const PALETTES: { name: string; colors: string[] }[] = [
  { name: 'Neutral', colors: ['#ffffff', '#f4f4f5', '#e4e4e7', '#a1a1aa', '#3f3f46', '#18181b'] },
  { name: 'Pastel', colors: ['#fde2e4', '#fad2e1', '#e2ece9', '#bee1e6', '#dfe7fd', '#cddafd'] },
  { name: 'Vivid', colors: ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899'] },
  { name: 'Deep', colors: ['#0f172a', '#1e1b4b', '#022c22', '#3b0764', '#450a0a', '#111827'] }
]

export const GRADIENT_PRESETS: { from: string; to: string; angle: number }[] = [
  { from: '#a1c4fd', to: '#c2e9fb', angle: 135 },
  { from: '#fbc2eb', to: '#a6c1ee', angle: 135 },
  { from: '#fddb92', to: '#d1fdff', angle: 135 },
  { from: '#667eea', to: '#764ba2', angle: 135 },
  { from: '#0f2027', to: '#2c5364', angle: 135 },
  { from: '#ff9a9e', to: '#fecfef', angle: 90 }
]
