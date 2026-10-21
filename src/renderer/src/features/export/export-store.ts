import { create } from 'zustand'
import type { ExportProgress } from '@shared/types'

interface ExportStore {
  jobs: Record<string, ExportProgress & { name: string }>
  names: Record<string, string>
  register: (jobId: string, name: string) => void
  apply: (p: ExportProgress) => void
  dismiss: (jobId: string) => void
}

export const useExports = create<ExportStore>((set) => ({
  jobs: {},
  names: {},
  register: (jobId, name) => set((s) => ({ names: { ...s.names, [jobId]: name } })),
  apply: (p) =>
    set((s) => ({
      jobs: { ...s.jobs, [p.jobId]: { ...p, name: s.names[p.jobId] ?? p.outputPath.split(/[\\/]/).pop() ?? 'Export' } }
    })),
  dismiss: (jobId) =>
    set((s) => {
      const jobs = { ...s.jobs }
      delete jobs[jobId]
      return { jobs }
    })
}))
