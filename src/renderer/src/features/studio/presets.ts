import type { AppSettings, RecordingMeta } from '@shared/types'
import { cornerPosition, outputSize, type Composition, type LayoutId } from './composition'
import { DEFAULT_TEMPLATE_ID, getTemplate } from './templates'

export interface LayoutPreset {
  id: LayoutId
  name: string
  description: string
  requiresCamera: boolean
  apply: (c: Composition) => Composition
}

type ScreenPatch = Partial<Composition['screen']>

const screenPreset = (patch: ScreenPatch, camera: Partial<Composition['camera']> = { mode: 'overlay' }) => (c: Composition): Composition => ({
  ...c,
  screen: { ...c.screen, offsetX: 0, offsetY: 0, scale: 1, borderWidth: 0, frame: 'none', ...patch },
  camera: { ...c.camera, ...camera }
})

export const LAYOUTS: LayoutPreset[] = [
  { id: 'centered', name: 'Large centered', description: 'Big video with a gentle margin', requiresCamera: false, apply: screenPreset({ padding: 0.06, radius: 14, shadow: 'medium' }) },
  { id: 'card', name: 'Rounded card', description: 'Soft rounded card with a border', requiresCamera: false, apply: screenPreset({ padding: 0.1, radius: 30, shadow: 'soft', borderWidth: 2, borderColor: '#ffffff' }) },
  { id: 'floating', name: 'Floating', description: 'Lifted video with a deep shadow', requiresCamera: false, apply: screenPreset({ padding: 0.13, radius: 18, shadow: 'strong', offsetY: -0.25 }) },
  { id: 'framed', name: 'Designed frame', description: 'Full-width video in a thick frame', requiresCamera: false, apply: screenPreset({ padding: 0.04, radius: 14, shadow: 'soft', borderWidth: 14, borderColor: '#ffffff' }) },
  { id: 'small', name: 'Small centered', description: 'Compact video on a large canvas', requiresCamera: false, apply: screenPreset({ padding: 0.2, radius: 16, shadow: 'medium' }) },
  { id: 'browser', name: 'Browser window', description: 'Browser chrome around the video', requiresCamera: false, apply: screenPreset({ padding: 0.08, radius: 14, shadow: 'medium', frame: 'browser' }) },
  { id: 'window', name: 'Desktop window', description: 'Desktop title bar around the video', requiresCamera: false, apply: screenPreset({ padding: 0.08, radius: 10, shadow: 'medium', frame: 'window' }) },
  { id: 'pip', name: 'Picture-in-picture', description: 'Full-bleed screen with a camera inset', requiresCamera: true, apply: screenPreset({ padding: 0, radius: 0, shadow: 'none' }, { mode: 'overlay', visible: true, shape: 'rounded' }) },
  { id: 'bubble', name: 'Facecam bubble', description: 'Circular camera over the corner', requiresCamera: true, apply: screenPreset({ padding: 0.07, radius: 16, shadow: 'medium' }, { mode: 'overlay', visible: true, shape: 'circle' }) },
  { id: 'panel', name: 'Facecam panel', description: 'Screen beside a separate camera panel', requiresCamera: true, apply: screenPreset({ padding: 0.06, radius: 16, shadow: 'medium' }, { mode: 'panel', visible: true, shape: 'rounded' }) }
]

const CAMERA_SIZES = { small: 0.16, medium: 0.22, large: 0.3 }

export function defaultComposition(rec: Pick<RecordingMeta, 'width' | 'height' | 'hasCamera' | 'name'>, settings: AppSettings | null): Composition {
  const t = getTemplate(DEFAULT_TEMPLATE_ID)
  const shape = settings?.camera.shape ?? 'circle'
  const size = CAMERA_SIZES[settings?.camera.size ?? 'medium']
  const out = outputSize('original', 1080, { w: rec.width, h: rec.height })
  const pos = cornerPosition(settings?.camera.position ?? 'bottom-right', size, out, shape)
  const base: Composition = {
    templateId: t.id,
    background: { kind: 'template', templateId: t.id },
    aspect: 'original',
    fit: 'fit',
    layoutId: rec.hasCamera ? 'bubble' : 'centered',
    screen: { padding: 0.06, scale: 1, offsetX: 0, offsetY: 0, radius: 14, shadow: 'medium', borderWidth: 0, borderColor: '#ffffff', frame: 'none', frameTheme: t.frameTheme },
    camera: {
      visible: rec.hasCamera,
      mode: 'overlay',
      shape,
      size,
      x: pos.x,
      y: pos.y,
      borderWidth: 4,
      borderColor: '#ffffff',
      shadow: true,
      panel: false,
      panelColor: '#ffffff',
      mirror: false
    },
    text: {
      align: 'center',
      position: 'top',
      title: { enabled: false, text: rec.name, size: 52, color: t.textColor },
      subtitle: { enabled: false, text: 'A short description of this video', size: 28, color: t.subtleTextColor },
      creator: { enabled: false, text: 'Your Name', size: 22, color: t.subtleTextColor },
      brand: { enabled: false, text: 'Recova', size: 18, color: t.textColor }
    }
  }
  const preset = LAYOUTS.find((l) => l.id === base.layoutId)
  return preset ? { ...preset.apply(base), camera: { ...preset.apply(base).camera, shape } } : base
}

export { CAMERA_SIZES }
