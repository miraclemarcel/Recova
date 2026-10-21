import { useEffect, useState } from 'react'
import { stopStream } from '../audio/mixer'
import { mediaErrorMessage } from '../recording/devices'

/** Opens a camera preview stream only while `enabled` is true, and always releases it. */
export function useCameraStream(enabled: boolean, deviceId: string) {
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (!enabled) {
      setStream(null)
      setError(null)
      return
    }
    let cancelled = false
    let s: MediaStream | null = null
    navigator.mediaDevices
      .getUserMedia({ video: { deviceId: deviceId ? { exact: deviceId } : undefined, width: { ideal: 1280 }, height: { ideal: 720 } } })
      .then((st) => {
        if (cancelled) return stopStream(st)
        s = st
        setStream(st)
        setError(null)
        st.getVideoTracks()[0]?.addEventListener('ended', () => setError('The camera was disconnected.'))
      })
      .catch((err) => !cancelled && setError(mediaErrorMessage(err, 'camera')))
    return () => {
      cancelled = true
      stopStream(s)
      setStream(null)
    }
  }, [enabled, deviceId])
  return { stream, error }
}
