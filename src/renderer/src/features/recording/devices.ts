import { useCallback, useEffect, useState } from 'react'

export interface DeviceOption {
  deviceId: string
  label: string
}

export type PermissionState = 'unknown' | 'granted' | 'denied' | 'unavailable'

export function mediaErrorMessage(err: unknown, device: 'microphone' | 'camera' | 'screen'): string {
  const name = err instanceof DOMException ? err.name : ''
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return device === 'screen' ? 'Screen capture was cancelled or blocked by the system.' : `Access to the ${device} was denied. Allow it in your system privacy settings and try again.`
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return `The selected ${device} is not available. It may have been disconnected.`
  if (name === 'NotReadableError' || name === 'AbortError') return `The ${device} is in use by another application or could not be started.`
  return err instanceof Error ? err.message : `Could not start the ${device}.`
}

/**
 * Lists devices of one kind. Labels are only exposed after permission is granted,
 * so we only call getUserMedia (via `requestAccess`) when the user enables that input.
 */
export function useDevices(kind: 'audioinput' | 'videoinput') {
  const [devices, setDevices] = useState<DeviceOption[]>([])
  const [permission, setPermission] = useState<PermissionState>('unknown')

  const refresh = useCallback(async () => {
    const all = await navigator.mediaDevices.enumerateDevices()
    const list = all
      .filter((d) => d.kind === kind && d.deviceId !== 'communications')
      .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `${kind === 'audioinput' ? 'Microphone' : 'Camera'} ${i + 1}` }))
    setDevices(list)
    if (list.some((d) => d.deviceId && !d.label.startsWith(kind === 'audioinput' ? 'Microphone ' : 'Camera '))) setPermission('granted')
    if (list.length === 0) setPermission('unavailable')
    return list
  }, [kind])

  const requestAccess = useCallback(async (): Promise<boolean> => {
    try {
      const s = await navigator.mediaDevices.getUserMedia(kind === 'audioinput' ? { audio: true } : { video: true })
      s.getTracks().forEach((t) => t.stop())
      setPermission('granted')
      await refresh()
      return true
    } catch (err) {
      const name = err instanceof DOMException ? err.name : ''
      setPermission(name === 'NotFoundError' ? 'unavailable' : 'denied')
      return false
    }
  }, [kind, refresh])

  useEffect(() => {
    void refresh()
    const onChange = () => void refresh()
    navigator.mediaDevices.addEventListener('devicechange', onChange)
    return () => navigator.mediaDevices.removeEventListener('devicechange', onChange)
  }, [refresh])

  return { devices, permission, refresh, requestAccess }
}
