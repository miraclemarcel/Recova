import { useEffect, useRef, useState } from 'react'
import { AlignCenter, AlignLeft, AlignRight, Check, Circle, Crosshair, ImagePlus, RectangleHorizontal, Square } from 'lucide-react'
import type { CameraShape } from '@shared/types'
import { Button, Field, Notice, SectionTitle, Segmented, Slider, TextInput, Toggle } from '@renderer/components/ui'
import { cn } from '@renderer/lib/format'
import { computeLayout, cornerPosition, drawBaseLayer, type AspectRatio, type Composition, type FitMode, type FrameStyle, type ShadowLevel, type TextLine } from './composition'
import { LAYOUTS } from './presets'
import { GRADIENT_PRESETS, PALETTES, TEMPLATES, getTemplate, type Template } from './templates'

export type Update = (fn: (c: Composition) => Composition) => void

const ColorInput = ({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) => (
  <label className="flex items-center gap-2 text-[12.5px] text-ink-2">
    <input type="color" aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className="h-7 w-9 cursor-pointer" />
    {label}
  </label>
)

function TemplateThumb({ template, active, onClick }: { template: Template; active: boolean; onClick: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const W = 1920
    const H = 1080
    const scale = canvas.width / W
    const c: Composition = {
      templateId: template.id,
      background: { kind: 'template', templateId: template.id },
      aspect: '16:9',
      fit: 'fit',
      layoutId: 'centered',
      screen: { padding: 0.12, scale: 1, offsetX: 0, offsetY: 0, radius: 18, shadow: 'medium', borderWidth: 0, borderColor: '#fff', frame: 'none', frameTheme: template.frameTheme },
      camera: { visible: false, mode: 'overlay', shape: 'circle', size: 0.2, x: 0.9, y: 0.85, borderWidth: 0, borderColor: '#fff', shadow: false, panel: false, panelColor: '#fff', mirror: false },
      text: {
        align: 'center',
        position: 'top',
        title: { enabled: false, text: '', size: 40, color: '#000' },
        subtitle: { enabled: false, text: '', size: 20, color: '#000' },
        creator: { enabled: false, text: '', size: 20, color: '#000' },
        brand: { enabled: false, text: '', size: 18, color: '#000' }
      }
    }
    const L = computeLayout(c, { w: 16, h: 9 }, false, { w: W, h: H })
    ctx.setTransform(scale, 0, 0, scale, 0, 0)
    drawBaseLayer(ctx, c, L, { image: null }, template.paint)
    // Mock screen content.
    ctx.save()
    ctx.beginPath()
    ctx.roundRect(L.screen.x, L.screen.y, L.screen.w, L.screen.h, 18)
    ctx.clip()
    ctx.fillStyle = template.frameTheme === 'dark' ? '#1c1f26' : '#ffffff'
    ctx.fillRect(L.screen.x, L.screen.y, L.screen.w, L.screen.h)
    ctx.fillStyle = template.frameTheme === 'dark' ? '#2d313b' : '#eceef2'
    ctx.fillRect(L.screen.x, L.screen.y, L.screen.w, 90)
    ctx.fillRect(L.screen.x + 60, L.screen.y + 160, L.screen.w * 0.5, 50)
    ctx.fillRect(L.screen.x + 60, L.screen.y + 250, L.screen.w * 0.7, 30)
    ctx.fillRect(L.screen.x + 60, L.screen.y + 310, L.screen.w * 0.6, 30)
    ctx.restore()
  }, [template])
  return (
    <button onClick={onClick} className="group text-left" title={template.name}>
      <div className={cn('relative overflow-hidden rounded-lg ring-1 transition', active ? 'ring-2 ring-accent' : 'ring-line group-hover:ring-line-strong')}>
        <canvas ref={ref} width={288} height={162} className="block aspect-video w-full" />
        {active && (
          <span className="absolute top-1.5 right-1.5 flex size-5 items-center justify-center rounded-full bg-accent text-white">
            <Check className="size-3" strokeWidth={3} />
          </span>
        )}
      </div>
      <div className={cn('mt-1.5 truncate text-[12px]', active ? 'font-semibold text-ink' : 'text-ink-2')}>{template.name}</div>
    </button>
  )
}

export function applyTemplate(c: Composition, t: Template): Composition {
  return {
    ...c,
    templateId: t.id,
    background: { kind: 'template', templateId: t.id },
    screen: { ...c.screen, frameTheme: t.frameTheme },
    text: {
      ...c.text,
      title: { ...c.text.title, color: t.textColor },
      subtitle: { ...c.text.subtitle, color: t.subtleTextColor },
      creator: { ...c.text.creator, color: t.subtleTextColor },
      brand: { ...c.text.brand, color: t.textColor }
    }
  }
}

export function TemplatesPanel({ comp, update }: { comp: Composition; update: Update }) {
  const categories = ['Light', 'Color', 'Dark', 'Pattern'] as const
  const active = comp.background.kind === 'template' ? comp.templateId : null
  return (
    <div className="space-y-6">
      {categories.map((cat) => (
        <div key={cat}>
          <SectionTitle title={cat} />
          <div className="grid grid-cols-2 gap-3">
            {TEMPLATES.filter((t) => t.category === cat).map((t) => (
              <TemplateThumb key={t.id} template={t} active={active === t.id} onClick={() => update((c) => applyTemplate(c, t))} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function LayoutIcon({ id }: { id: string }) {
  const screen = 'fill-current opacity-60'
  const cam = 'fill-current'
  const shapes: Record<string, React.ReactNode> = {
    centered: <rect x="5" y="4" width="30" height="17" rx="2" className={screen} />,
    card: <rect x="8" y="6" width="24" height="13.5" rx="3.5" className={screen} />,
    floating: <rect x="9" y="4.5" width="22" height="12.5" rx="2.5" className={screen} />,
    framed: (
      <>
        <rect x="3" y="3" width="34" height="19" rx="2" className="fill-current opacity-25" />
        <rect x="5" y="5" width="30" height="15" rx="1" className={screen} />
      </>
    ),
    small: <rect x="12" y="8" width="16" height="9" rx="1.5" className={screen} />,
    browser: (
      <>
        <rect x="6" y="4" width="28" height="3.5" rx="1" className="fill-current opacity-35" />
        <rect x="6" y="7.5" width="28" height="14" rx="1" className={screen} />
      </>
    ),
    window: (
      <>
        <rect x="6" y="4" width="28" height="3" rx="1" className="fill-current opacity-35" />
        <rect x="6" y="7" width="28" height="14" rx="1" className={screen} />
      </>
    ),
    pip: (
      <>
        <rect x="0" y="0" width="40" height="25" rx="2" className={screen} />
        <rect x="27" y="15" width="10" height="7.5" rx="1.5" className={cam} />
      </>
    ),
    bubble: (
      <>
        <rect x="5" y="4" width="30" height="17" rx="2" className={screen} />
        <circle cx="32" cy="19" r="4.5" className={cam} />
      </>
    ),
    panel: (
      <>
        <rect x="3" y="5" width="25" height="15" rx="1.5" className={screen} />
        <rect x="30" y="7" width="8" height="11" rx="1.5" className={cam} />
      </>
    )
  }
  return (
    <svg viewBox="0 0 40 25" className="h-[34px] w-[54px] text-accent">
      {shapes[id]}
    </svg>
  )
}

export function LayoutPanel({ comp, update, hasCamera }: { comp: Composition; update: Update; hasCamera: boolean }) {
  const s = comp.screen
  const setScreen = (patch: Partial<Composition['screen']>) => update((c) => ({ ...c, screen: { ...c.screen, ...patch } }))
  return (
    <div className="space-y-6">
      <div>
        <SectionTitle title="Layout" description="How the recording sits on the background" />
        <div className="grid grid-cols-2 gap-2">
          {LAYOUTS.map((l) => {
            const disabled = l.requiresCamera && !hasCamera
            return (
              <button
                key={l.id}
                disabled={disabled}
                title={disabled ? 'Needs a recording with facecam footage' : l.description}
                onClick={() => update((c) => ({ ...l.apply(c), layoutId: l.id }))}
                className={cn(
                  'flex flex-col items-center gap-1.5 rounded-xl border p-2.5 text-[12px] transition disabled:cursor-not-allowed disabled:opacity-35',
                  comp.layoutId === l.id ? 'border-accent bg-accent-soft font-semibold text-ink' : 'border-line bg-surface text-ink-2 hover:border-line-strong'
                )}
              >
                <LayoutIcon id={l.id} />
                {l.name}
              </button>
            )
          })}
        </div>
        {!hasCamera && <p className="mt-2 text-[12px] text-ink-3">Facecam layouts are available for recordings made with Include Facecam.</p>}
      </div>

      <div className="space-y-4">
        <SectionTitle title="Canvas" />
        <Field label="Aspect ratio">
          <Segmented<AspectRatio>
            className="w-full"
            size="sm"
            value={comp.aspect}
            onChange={(aspect) => update((c) => ({ ...c, aspect }))}
            options={[
              { value: 'original', label: 'Original' },
              { value: '16:9', label: '16:9' },
              { value: '9:16', label: '9:16' },
              { value: '1:1', label: '1:1' },
              { value: '4:5', label: '4:5' }
            ]}
          />
        </Field>
        <Field label="Video fit" hint={comp.fit === 'fit' ? 'Shows the whole recording without cropping.' : 'Fills the frame and crops the edges evenly.'}>
          <Segmented<FitMode> className="w-full" size="sm" value={comp.fit} onChange={(fit) => update((c) => ({ ...c, fit }))} options={[{ value: 'fit', label: 'Fit' }, { value: 'fill', label: 'Fill & crop' }]} />
        </Field>
      </div>

      <div className="space-y-4">
        <SectionTitle
          title="Video"
          action={
            <Button size="sm" variant="ghost" icon={Crosshair} onClick={() => setScreen({ offsetX: 0, offsetY: 0 })}>
              Center
            </Button>
          }
        />
        <Slider label="Size" min={0.3} max={1} value={s.scale} onChange={(scale) => setScreen({ scale })} format={(v) => `${Math.round(v * 100)}%`} />
        <Slider label="Padding" min={0} max={0.3} step={0.005} value={s.padding} onChange={(padding) => setScreen({ padding })} format={(v) => `${Math.round(v * 100)}%`} />
        <Slider label="Corner radius" min={0} max={60} step={1} value={s.radius} onChange={(radius) => setScreen({ radius })} format={(v) => `${v}px`} />
        <Slider label="Horizontal position" min={-1} max={1} value={s.offsetX} onChange={(offsetX) => setScreen({ offsetX })} format={(v) => (v === 0 ? 'Center' : v.toFixed(2))} />
        <Slider label="Vertical position" min={-1} max={1} value={s.offsetY} onChange={(offsetY) => setScreen({ offsetY })} format={(v) => (v === 0 ? 'Center' : v.toFixed(2))} />
        <Field label="Shadow">
          <Segmented<ShadowLevel>
            className="w-full"
            size="sm"
            value={s.shadow}
            onChange={(shadow) => setScreen({ shadow })}
            options={[
              { value: 'none', label: 'None' },
              { value: 'soft', label: 'Soft' },
              { value: 'medium', label: 'Medium' },
              { value: 'strong', label: 'Strong' }
            ]}
          />
        </Field>
        <Field label="Window frame">
          <Segmented<FrameStyle> className="w-full" size="sm" value={s.frame} onChange={(frame) => setScreen({ frame })} options={[{ value: 'none', label: 'None' }, { value: 'browser', label: 'Browser' }, { value: 'window', label: 'Desktop' }]} />
        </Field>
        {s.frame !== 'none' && (
          <Segmented className="w-full" size="sm" value={s.frameTheme} onChange={(frameTheme: 'light' | 'dark') => setScreen({ frameTheme })} options={[{ value: 'light', label: 'Light chrome' }, { value: 'dark', label: 'Dark chrome' }]} />
        )}
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <Slider label="Border" min={0} max={24} step={1} value={s.borderWidth} onChange={(borderWidth) => setScreen({ borderWidth })} format={(v) => `${v}px`} />
          </div>
          <input type="color" aria-label="Border color" value={s.borderColor} onChange={(e) => setScreen({ borderColor: e.target.value })} className="mt-5 h-7 w-9 cursor-pointer" />
        </div>
      </div>
    </div>
  )
}

export function BackgroundPanel({ comp, update, onUpload, uploading }: { comp: Composition; update: Update; onUpload: () => void; uploading: boolean }) {
  const bg = comp.background
  const [kind, setKind] = useState<Composition['background']['kind']>(bg.kind)
  useEffect(() => setKind(bg.kind), [bg.kind])
  const t = getTemplate(comp.templateId)
  return (
    <div className="space-y-5">
      <Segmented
        className="w-full"
        size="sm"
        value={kind}
        onChange={(k) => {
          setKind(k)
          // The image tab only changes the background once an image has been chosen.
          if (k === 'image') return
          update((c) => {
            if (k === 'template') return applyTemplate(c, getTemplate(c.templateId))
            if (k === 'solid') return c.background.kind === 'solid' ? c : { ...c, background: { kind: 'solid', color: '#f4f4f5' } }
            return c.background.kind === 'gradient' ? c : { ...c, background: { kind: 'gradient', ...GRADIENT_PRESETS[0] } }
          })
        }}
        options={[
          { value: 'template', label: 'Template' },
          { value: 'solid', label: 'Solid' },
          { value: 'gradient', label: 'Gradient' },
          { value: 'image', label: 'Image' }
        ]}
      />
      {kind === 'template' && <Notice kind="info">Using the “{t.name}” template. Pick another in the Templates tab.</Notice>}
      {bg.kind === 'solid' && (
        <div className="space-y-4">
          {PALETTES.map((p) => (
            <div key={p.name}>
              <div className="mb-1.5 text-[12px] font-medium text-ink-3">{p.name}</div>
              <div className="flex gap-2">
                {p.colors.map((col) => (
                  <button
                    key={col}
                    aria-label={col}
                    onClick={() => update((c) => ({ ...c, background: { kind: 'solid', color: col } }))}
                    className={cn('size-8 rounded-lg ring-1 ring-black/10 transition hover:scale-105', bg.color.toLowerCase() === col && 'ring-2 ring-accent ring-offset-2 ring-offset-surface')}
                    style={{ background: col }}
                  />
                ))}
              </div>
            </div>
          ))}
          <ColorInput label="Custom color" value={bg.color} onChange={(color) => update((c) => ({ ...c, background: { kind: 'solid', color } }))} />
        </div>
      )}
      {bg.kind === 'gradient' && (
        <div className="space-y-4">
          <div className="grid grid-cols-6 gap-2">
            {GRADIENT_PRESETS.map((g) => (
              <button
                key={g.from + g.to}
                aria-label="Gradient preset"
                onClick={() => update((c) => ({ ...c, background: { kind: 'gradient', ...g } }))}
                className="aspect-square rounded-lg ring-1 ring-black/10 transition hover:scale-105"
                style={{ background: `linear-gradient(${g.angle}deg, ${g.from}, ${g.to})` }}
              />
            ))}
          </div>
          <div className="flex gap-4">
            <ColorInput label="From" value={bg.from} onChange={(from) => update((c) => (c.background.kind === 'gradient' ? { ...c, background: { ...c.background, from } } : c))} />
            <ColorInput label="To" value={bg.to} onChange={(to) => update((c) => (c.background.kind === 'gradient' ? { ...c, background: { ...c.background, to } } : c))} />
          </div>
          <Slider label="Angle" min={0} max={360} step={1} value={bg.angle} onChange={(angle) => update((c) => (c.background.kind === 'gradient' ? { ...c, background: { ...c.background, angle } } : c))} format={(v) => `${v}°`} />
        </div>
      )}
      {kind === 'image' && (
        <div className="space-y-3">
          {bg.kind === 'image' ? <img src={bg.url} alt="" crossOrigin="anonymous" className="aspect-video w-full rounded-lg object-cover ring-1 ring-line" /> : <p className="text-[12.5px] text-ink-3">Choose a PNG, JPG or WebP image. It is copied into Recova’s local storage and scaled to fill the canvas.</p>}
          <Button icon={ImagePlus} className="w-full" onClick={onUpload} loading={uploading}>
            {bg.kind === 'image' ? 'Replace image' : 'Upload image'}
          </Button>
        </div>
      )}
    </div>
  )
}

export function CameraPanel({ comp, update, out }: { comp: Composition; update: Update; out: { w: number; h: number } }) {
  const cam = comp.camera
  const setCam = (patch: Partial<Composition['camera']>) => update((c) => ({ ...c, camera: { ...c.camera, ...patch } }))
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-medium">Show facecam</span>
        <Toggle checked={cam.visible} onChange={(visible) => setCam({ visible })} label="Show facecam" />
      </div>
      {cam.visible && (
        <>
          <Field label="Placement">
            <Segmented className="w-full" size="sm" value={cam.mode} onChange={(mode: 'overlay' | 'panel') => setCam({ mode })} options={[{ value: 'overlay', label: 'Overlay' }, { value: 'panel', label: 'Separate panel' }]} />
          </Field>
          <Field label="Shape">
            <Segmented<CameraShape>
              className="w-full"
              size="sm"
              value={cam.shape}
              onChange={(shape) => setCam({ shape })}
              options={[
                { value: 'circle', label: <span className="inline-flex items-center gap-1"><Circle className="size-3.5" />Circle</span> },
                { value: 'rounded', label: <span className="inline-flex items-center gap-1"><RectangleHorizontal className="size-3.5" />Rounded</span> },
                { value: 'square', label: <span className="inline-flex items-center gap-1"><Square className="size-3.5" />Square</span> }
              ]}
            />
          </Field>
          <Slider label="Size" min={0.08} max={0.45} value={cam.size} onChange={(size) => setCam({ size })} format={(v) => `${Math.round(v * 100)}%`} />
          {cam.mode === 'overlay' && (
            <Field label="Position" hint="Or drag the camera directly in the preview.">
              <div className="grid grid-cols-4 gap-1.5">
                {(['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const).map((corner) => (
                  <Button key={corner} size="sm" onClick={() => setCam(cornerPosition(corner, cam.size, out, cam.shape))}>
                    {{ 'top-left': '↖', 'top-right': '↗', 'bottom-left': '↙', 'bottom-right': '↘' }[corner]}
                  </Button>
                ))}
              </div>
            </Field>
          )}
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <Slider label="Border" min={0} max={16} step={1} value={cam.borderWidth} onChange={(borderWidth) => setCam({ borderWidth })} format={(v) => `${v}px`} />
            </div>
            <input type="color" aria-label="Camera border color" value={cam.borderColor} onChange={(e) => setCam({ borderColor: e.target.value })} className="mt-5 h-7 w-9 cursor-pointer" />
          </div>
          <div className="space-y-3">
            <Row label="Shadow">
              <Toggle checked={cam.shadow} onChange={(shadow) => setCam({ shadow })} label="Camera shadow" />
            </Row>
            <Row label="Background behind camera">
              <div className="flex items-center gap-2">
                {cam.panel && <input type="color" aria-label="Camera background color" value={cam.panelColor} onChange={(e) => setCam({ panelColor: e.target.value })} className="h-6 w-8 cursor-pointer" />}
                <Toggle checked={cam.panel} onChange={(panel) => setCam({ panel })} label="Camera background" />
              </div>
            </Row>
            <Row label="Mirror camera">
              <Toggle checked={cam.mirror} onChange={(mirror) => setCam({ mirror })} label="Mirror camera" />
            </Row>
          </div>
        </>
      )}
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between text-[13px]">
      <span className="text-ink-2">{label}</span>
      {children}
    </div>
  )
}

function TextLineEditor({ label, line, onChange, maxSize }: { label: string; line: TextLine; onChange: (l: TextLine) => void; maxSize: number }) {
  return (
    <div className="rounded-xl border border-line p-3">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-medium">{label}</span>
        <Toggle checked={line.enabled} onChange={(enabled) => onChange({ ...line, enabled })} label={`Show ${label}`} />
      </div>
      {line.enabled && (
        <div className="mt-3 space-y-3">
          <TextInput value={line.text} maxLength={120} onChange={(e) => onChange({ ...line, text: e.target.value })} />
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <Slider label="Size" min={12} max={maxSize} step={1} value={line.size} onChange={(size) => onChange({ ...line, size })} format={(v) => `${v}px`} />
            </div>
            <input type="color" aria-label={`${label} color`} value={line.color} onChange={(e) => onChange({ ...line, color: e.target.value })} className="mt-5 h-7 w-9 cursor-pointer" />
          </div>
        </div>
      )}
    </div>
  )
}

export function TextPanel({ comp, update }: { comp: Composition; update: Update }) {
  const setLine = (key: 'title' | 'subtitle' | 'creator' | 'brand') => (line: TextLine) => update((c) => ({ ...c, text: { ...c.text, [key]: line } }))
  return (
    <div className="space-y-3">
      <p className="text-[12.5px] text-ink-3">Text is optional. Turn on only what you need.</p>
      <TextLineEditor label="Title" line={comp.text.title} onChange={setLine('title')} maxSize={110} />
      <TextLineEditor label="Subtitle" line={comp.text.subtitle} onChange={setLine('subtitle')} maxSize={70} />
      <TextLineEditor label="Creator name" line={comp.text.creator} onChange={setLine('creator')} maxSize={60} />
      <TextLineEditor label="Brand label" line={comp.text.brand} onChange={setLine('brand')} maxSize={40} />
      <div className="grid grid-cols-2 gap-3 pt-2">
        <Field label="Alignment">
          <Segmented
            size="sm"
            className="w-full"
            value={comp.text.align}
            onChange={(align: 'left' | 'center' | 'right') => update((c) => ({ ...c, text: { ...c.text, align } }))}
            options={[
              { value: 'left', label: <AlignLeft className="mx-auto size-3.5" /> },
              { value: 'center', label: <AlignCenter className="mx-auto size-3.5" /> },
              { value: 'right', label: <AlignRight className="mx-auto size-3.5" /> }
            ]}
          />
        </Field>
        <Field label="Position">
          <Segmented size="sm" className="w-full" value={comp.text.position} onChange={(position: 'top' | 'bottom') => update((c) => ({ ...c, text: { ...c.text, position } }))} options={[{ value: 'top', label: 'Top' }, { value: 'bottom', label: 'Bottom' }]} />
        </Field>
      </div>
    </div>
  )
}
