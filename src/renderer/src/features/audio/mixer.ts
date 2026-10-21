/**
 * Mixes microphone and system audio into a single track with Web Audio.
 * The microphone passes through a gain node so its volume can be adjusted live.
 */
export interface AudioMix {
  track: MediaStreamTrack | null
  setMicGain: (gain: number) => void
  dispose: () => void
}

export function createAudioMix(mic: MediaStream | null, system: MediaStream | null, micGain: number): AudioMix {
  const hasMic = !!mic && mic.getAudioTracks().length > 0
  const hasSystem = !!system && system.getAudioTracks().length > 0
  if (!hasMic && !hasSystem) return { track: null, setMicGain: () => undefined, dispose: () => undefined }

  const ctx = new AudioContext({ sampleRate: 48000 })
  const dest = ctx.createMediaStreamDestination()
  let gain: GainNode | null = null
  const nodes: AudioNode[] = []
  if (hasMic && mic) {
    const src = ctx.createMediaStreamSource(mic)
    gain = ctx.createGain()
    gain.gain.value = micGain
    src.connect(gain).connect(dest)
    nodes.push(src, gain)
  }
  if (hasSystem && system) {
    const src = ctx.createMediaStreamSource(new MediaStream(system.getAudioTracks()))
    src.connect(dest)
    nodes.push(src)
  }
  return {
    track: dest.stream.getAudioTracks()[0] ?? null,
    setMicGain: (g) => {
      if (gain) gain.gain.setTargetAtTime(g, ctx.currentTime, 0.02)
    },
    dispose: () => {
      nodes.forEach((n) => n.disconnect())
      dest.stream.getTracks().forEach((t) => t.stop())
      void ctx.close()
    }
  }
}

/** Live input level (0..1) for a stream, used by the microphone meter. */
export function createLevelMeter(stream: MediaStream, onLevel: (level: number) => void, gainValue = 1): { setGain: (g: number) => void; dispose: () => void } {
  const ctx = new AudioContext()
  const src = ctx.createMediaStreamSource(stream)
  const gain = ctx.createGain()
  gain.gain.value = gainValue
  const analyser = ctx.createAnalyser()
  analyser.fftSize = 1024
  src.connect(gain).connect(analyser)
  const data = new Float32Array(analyser.fftSize)
  let raf = 0
  let smoothed = 0
  const tick = () => {
    analyser.getFloatTimeDomainData(data)
    let sum = 0
    for (const v of data) sum += v * v
    const rms = Math.sqrt(sum / data.length)
    const level = Math.min(1, Math.max(0, (20 * Math.log10(rms + 1e-8) + 60) / 60))
    smoothed = level > smoothed ? level : smoothed * 0.9 + level * 0.1
    onLevel(smoothed)
    raf = requestAnimationFrame(tick)
  }
  tick()
  return {
    setGain: (g) => (gain.gain.value = g),
    dispose: () => {
      cancelAnimationFrame(raf)
      src.disconnect()
      gain.disconnect()
      void ctx.close()
    }
  }
}

export function stopStream(stream: MediaStream | null | undefined): void {
  stream?.getTracks().forEach((t) => t.stop())
}
