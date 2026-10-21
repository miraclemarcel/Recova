import type { RecovaApi } from '../shared/types'

declare global {
  interface Window {
    recova: RecovaApi
  }
}

export {}
