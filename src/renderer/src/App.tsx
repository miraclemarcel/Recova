import { useEffect, useState } from 'react'
import { FolderOpen, LayoutGrid, Plus, Settings as SettingsIcon } from 'lucide-react'
import { useApp, type View } from './store/app-store'
import { Toasts } from './components/Toasts'
import { Logo, Spinner, Tooltip } from './components/ui'
import { cn, errorMessage } from './lib/format'
import { Dashboard } from './features/library/Dashboard'
import { PlayerView } from './features/library/PlayerView'
import { SetupView } from './features/recording/SetupView'
import { RecordingView } from './features/recording/RecordingView'
import { StudioView } from './features/studio/StudioView'
import { SettingsView } from './features/settings/SettingsView'
import { ExportTray } from './features/export/ExportTray'

function useTheme(): void {
  const theme = useApp((s) => s.settings?.app.theme ?? 'light')
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => document.documentElement.classList.toggle('dark', theme === 'dark' || (theme === 'system' && mq.matches))
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [theme])
}

const NAV: { view: View['name']; label: string; icon: typeof LayoutGrid; target: View }[] = [
  { view: 'dashboard', label: 'Recordings', icon: LayoutGrid, target: { name: 'dashboard' } },
  { view: 'setup', label: 'New Recording', icon: Plus, target: { name: 'setup' } },
  { view: 'settings', label: 'Settings', icon: SettingsIcon, target: { name: 'settings' } }
]

export function App() {
  const { view, navigate, init, refreshLibrary, toast } = useApp()
  const ready = useApp((s) => s.settings !== null)
  const [initError, setInitError] = useState<string | null>(null)
  useTheme()

  useEffect(() => {
    init().catch((err) => setInitError(errorMessage(err)))
    return window.recova.library.onChanged(() => void refreshLibrary())
  }, [init, refreshLibrary])

  if (initError) return <div className="flex h-full items-center justify-center p-10 text-danger">Recova failed to start: {initError}</div>
  if (!ready) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner />
      </div>
    )
  }

  // While recording, the whole window is dedicated to the live session.
  const recording = view.name === 'recording'
  const active = view.name === 'player' || view.name === 'studio' ? 'dashboard' : view.name

  return (
    <div className="flex h-full">
      {!recording && (
        <aside className="flex w-[76px] shrink-0 flex-col items-center border-r border-line bg-surface py-4">
          <Tooltip label="Recova" side="bottom">
            <button onClick={() => navigate({ name: 'dashboard' })} aria-label="Recova home">
              <Logo size={34} />
            </button>
          </Tooltip>
          <nav className="mt-6 flex flex-col gap-1.5">
            {NAV.map((n) => (
              <Tooltip key={n.view} label={n.label}>
                <button
                  aria-label={n.label}
                  onClick={() => navigate(n.target)}
                  className={cn(
                    'flex size-11 items-center justify-center rounded-xl transition',
                    active === n.view ? 'bg-accent-soft text-accent' : 'text-ink-3 hover:bg-surface-2 hover:text-ink',
                    n.view === 'setup' && active !== 'setup' && 'text-ink-2'
                  )}
                >
                  <n.icon className="size-5" strokeWidth={n.view === 'setup' ? 2.4 : 2} />
                </button>
              </Tooltip>
            ))}
          </nav>
          <div className="mt-auto">
            <Tooltip label="Open recordings folder">
              <button
                aria-label="Open recordings folder"
                onClick={() => window.recova.library.openRecordingsFolder().catch((e) => toast({ kind: 'error', title: 'Could not open folder', message: errorMessage(e) }))}
                className="flex size-11 items-center justify-center rounded-xl text-ink-3 transition hover:bg-surface-2 hover:text-ink"
              >
                <FolderOpen className="size-5" />
              </button>
            </Tooltip>
          </div>
        </aside>
      )}
      <main className="min-w-0 flex-1 overflow-hidden">
        {view.name === 'dashboard' && <Dashboard />}
        {view.name === 'setup' && <SetupView />}
        {view.name === 'recording' && <RecordingView />}
        {view.name === 'player' && <PlayerView recordingId={view.recordingId} />}
        {view.name === 'studio' && <StudioView key={view.recordingId} recordingId={view.recordingId} />}
        {view.name === 'settings' && <SettingsView />}
      </main>
      <ExportTray />
      <Toasts />
    </div>
  )
}
