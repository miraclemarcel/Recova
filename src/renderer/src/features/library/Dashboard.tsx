import { useMemo, useState } from 'react'
import { Clapperboard, FolderOpen, HardDrive, Plus, Search, Video } from 'lucide-react'
import type { LibraryItem } from '@shared/types'
import { Button, EmptyState, Spinner, TextInput } from '@renderer/components/ui'
import { useApp } from '@renderer/store/app-store'
import { errorMessage, formatBytes, formatDuration } from '@renderer/lib/format'
import { RecordingCard, type CardActions } from './RecordingCard'
import { DeleteDialog, RenameDialog } from './dialogs'

export function Dashboard() {
  const { library, libraryLoaded, navigate, toast } = useApp()
  const [query, setQuery] = useState('')
  const [renaming, setRenaming] = useState<LibraryItem | null>(null)
  const [deleting, setDeleting] = useState<LibraryItem | null>(null)

  const filtered = useMemo(() => library.filter((r) => r.name.toLowerCase().includes(query.trim().toLowerCase())), [library, query])
  const totals = useMemo(
    () => ({ duration: library.reduce((n, r) => n + r.durationSec, 0), size: library.reduce((n, r) => n + r.sizeBytes, 0), exports: library.reduce((n, r) => n + r.exports.length, 0) }),
    [library]
  )

  const fail = (title: string) => (err: unknown) => toast({ kind: 'error', title, message: errorMessage(err) })
  const actions: CardActions = {
    onPreview: (r) => navigate({ name: 'player', recordingId: r.id }),
    onStudio: (r) => navigate({ name: 'studio', recordingId: r.id }),
    onRename: setRenaming,
    onReveal: (r) => window.recova.library.reveal(r.id).catch(fail('Could not open file location')),
    onDelete: setDeleting
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1400px] px-8 py-7">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-[22px] font-semibold tracking-tight">Recordings</h1>
            <p className="mt-0.5 text-[13px] text-ink-3">Everything is stored locally on this computer.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button icon={FolderOpen} onClick={() => window.recova.library.openRecordingsFolder().catch(fail('Could not open folder'))}>
              Open folder
            </Button>
            <Button variant="record" size="lg" icon={Plus} onClick={() => navigate({ name: 'setup' })}>
              New Recording
            </Button>
          </div>
        </header>

        {library.length > 0 && (
          <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat icon={Video} label="Recordings" value={String(library.length)} />
            <Stat icon={Clapperboard} label="Total length" value={formatDuration(totals.duration)} />
            <Stat icon={HardDrive} label="Disk usage" value={formatBytes(totals.size)} />
            <Stat icon={Clapperboard} label="Exports" value={String(totals.exports)} />
          </div>
        )}

        {!libraryLoaded ? (
          <div className="flex justify-center py-24">
            <Spinner />
          </div>
        ) : library.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-dashed border-line-strong bg-surface">
            <EmptyState
              icon={Video}
              title="Make your first recording"
              description="Capture your screen, voice and optionally your face. Then turn it into a polished video with a designed background in Video Studio."
              action={
                <Button variant="record" size="lg" icon={Plus} onClick={() => navigate({ name: 'setup' })}>
                  New Recording
                </Button>
              }
            />
          </div>
        ) : (
          <>
            <div className="mt-8 mb-4 flex items-center justify-between gap-3">
              <h2 className="text-[14px] font-semibold">Recent</h2>
              <div className="relative w-64">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3" />
                <TextInput placeholder="Search recordings" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-9" />
              </div>
            </div>
            {filtered.length === 0 ? (
              <p className="py-16 text-center text-[13px] text-ink-3">No recordings match “{query}”.</p>
            ) : (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-5">
                {filtered.map((r) => (
                  <RecordingCard key={r.id} rec={r} actions={actions} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
      <RenameDialog rec={renaming} onClose={() => setRenaming(null)} />
      <DeleteDialog rec={deleting} onClose={() => setDeleting(null)} />
    </div>
  )
}

function Stat({ icon: Icon, label, value }: { icon: typeof Video; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3 shadow-card">
      <div className="flex size-9 items-center justify-center rounded-lg bg-surface-2">
        <Icon className="size-4 text-ink-2" />
      </div>
      <div>
        <div className="text-[12px] text-ink-3">{label}</div>
        <div className="text-[15px] font-semibold tabular-nums">{value}</div>
      </div>
    </div>
  )
}
