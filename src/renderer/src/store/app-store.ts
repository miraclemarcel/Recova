import { create } from 'zustand'
import type { AppSettings, DeepPartial, LibraryItem, PlatformInfo } from '@shared/types'
import { errorMessage } from '@renderer/lib/format'

export type View =
  | { name: 'dashboard' }
  | { name: 'setup' }
  | { name: 'recording' }
  | { name: 'player'; recordingId: string }
  | { name: 'studio'; recordingId: string }
  | { name: 'settings' }

export interface Toast {
  id: number
  kind: 'info' | 'success' | 'error'
  title: string
  message?: string
}

interface AppState {
  view: View
  settings: AppSettings | null
  platform: PlatformInfo | null
  library: LibraryItem[]
  libraryLoaded: boolean
  toasts: Toast[]
  navigate: (view: View) => void
  init: () => Promise<void>
  refreshLibrary: () => Promise<void>
  updateSettings: (patch: DeepPartial<AppSettings>) => Promise<void>
  setSettings: (s: AppSettings) => void
  toast: (t: Omit<Toast, 'id'>) => void
  dismissToast: (id: number) => void
}

let toastId = 0

export const useApp = create<AppState>((set, get) => ({
  view: { name: 'dashboard' },
  settings: null,
  platform: null,
  library: [],
  libraryLoaded: false,
  toasts: [],
  navigate: (view) => set({ view }),
  init: async () => {
    const [settings, platform] = await Promise.all([window.recova.settings.get(), window.recova.platform.info()])
    set({ settings, platform, view: settings.app.startupView === 'new-recording' ? { name: 'setup' } : { name: 'dashboard' } })
    await get().refreshLibrary()
  },
  refreshLibrary: async () => {
    try {
      set({ library: await window.recova.library.list(), libraryLoaded: true })
    } catch (err) {
      set({ libraryLoaded: true })
      get().toast({ kind: 'error', title: 'Could not load recordings', message: errorMessage(err) })
    }
  },
  updateSettings: async (patch) => {
    try {
      set({ settings: await window.recova.settings.update(patch) })
    } catch (err) {
      get().toast({ kind: 'error', title: 'Could not save settings', message: errorMessage(err) })
    }
  },
  setSettings: (settings) => set({ settings }),
  toast: (t) => {
    const id = ++toastId
    set((s) => ({ toasts: [...s.toasts, { ...t, id }] }))
    setTimeout(() => get().dismissToast(id), t.kind === 'error' ? 7000 : 4000)
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
}))
