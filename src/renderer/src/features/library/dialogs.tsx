import { useEffect, useState } from 'react'
import type { LibraryItem } from '@shared/types'
import { Button, ConfirmDialog, Modal, TextInput } from '@renderer/components/ui'
import { useApp } from '@renderer/store/app-store'
import { errorMessage } from '@renderer/lib/format'

export function RenameDialog({ rec, onClose }: { rec: LibraryItem | null; onClose: () => void }) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const toast = useApp((s) => s.toast)
  useEffect(() => setName(rec?.name ?? ''), [rec])
  const save = async () => {
    if (!rec || !name.trim()) return
    setBusy(true)
    try {
      await window.recova.library.rename(rec.id, name.trim())
      onClose()
    } catch (err) {
      toast({ kind: 'error', title: 'Rename failed', message: errorMessage(err) })
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal
      open={rec !== null}
      onClose={onClose}
      title="Rename recording"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save} loading={busy} disabled={!name.trim()}>
            Save
          </Button>
        </>
      }
    >
      <TextInput value={name} maxLength={120} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void save()} />
    </Modal>
  )
}

export function DeleteDialog({ rec, onClose, onDeleted }: { rec: LibraryItem | null; onClose: () => void; onDeleted?: () => void }) {
  const [busy, setBusy] = useState(false)
  const toast = useApp((s) => s.toast)
  const confirm = async () => {
    if (!rec) return
    setBusy(true)
    try {
      await window.recova.library.remove(rec.id)
      toast({ kind: 'success', title: 'Recording deleted' })
      onClose()
      onDeleted?.()
    } catch (err) {
      toast({ kind: 'error', title: 'Delete failed', message: errorMessage(err) })
    } finally {
      setBusy(false)
    }
  }
  return (
    <ConfirmDialog
      open={rec !== null}
      title="Delete recording?"
      danger
      busy={busy}
      confirmLabel="Delete permanently"
      onCancel={onClose}
      onConfirm={confirm}
      message={
        <>
          <p>
            <strong className="text-ink">{rec?.name}</strong> and its original video files will be permanently deleted from your computer.
          </p>
          {rec && rec.exports.length > 0 && <p className="mt-2">Exported MP4 files are kept where you saved them.</p>}
        </>
      }
    />
  )
}
