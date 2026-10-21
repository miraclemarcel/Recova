import { useEffect, useState } from 'react'
import { Folder, RotateCcw } from 'lucide-react'
import type { AudioMode, CameraShape, CameraSize, Corner, ExportResolution, FrameRate, QualityPreset, RecordingQuality, ThemePreference } from '@shared/types'
import { Button, Card, ConfirmDialog, Notice, Segmented, Select, Toggle } from '@renderer/components/ui'
import { useApp } from '@renderer/store/app-store'
import { errorMessage, formatBytes } from '@renderer/lib/format'
import { useDevices } from '../recording/devices'

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-6 border-b border-line py-3.5 last:border-b-0">
      <div className="min-w-0">
        <div className="text-[13.5px] font-medium">{label}</div>
        {hint && <div className="mt-0.5 text-[12px] text-ink-3">{hint}</div>}
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 text-[12px] font-semibold tracking-wide text-ink-3 uppercase">{title}</h2>
      <Card className="px-5">{children}</Card>
    </section>
  )
}

function DirPicker({ value, title, onPick }: { value: string; title: string; onPick: (dir: string) => void }) {
  return (
    <>
      <span className="max-w-[300px] truncate text-[12.5px] text-ink-2" title={value}>
        {value}
      </span>
      <Button
        size="sm"
        icon={Folder}
        onClick={async () => {
          const dir = await window.recova.settings.chooseDirectory(title, value)
          if (dir) onPick(dir)
        }}
      >
        Change
      </Button>
    </>
  )
}

export function SettingsView() {
  const { settings, platform, updateSettings, setSettings, toast } = useApp()
  const [storage, setStorage] = useState<{ recordingsDir: string; userDataDir: string; recordingsBytes: number; recordingCount: number } | null>(null)
  const [confirmReset, setConfirmReset] = useState(false)
  const mics = useDevices('audioinput')
  const cams = useDevices('videoinput')

  useEffect(() => {
    window.recova.settings.storageInfo().then(setStorage).catch(() => setStorage(null))
  }, [settings?.recording.recordingsDir])

  if (!settings) return null
  const s = settings

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl space-y-8 px-8 py-7">
        <header>
          <h1 className="text-[22px] font-semibold tracking-tight">Settings</h1>
          <p className="mt-0.5 text-[13px] text-ink-3">Defaults for new recordings and exports. Saved locally on this computer.</p>
        </header>

        <Section title="Recording">
          <Row label="Default quality">
            <Segmented<RecordingQuality> size="sm" value={s.recording.quality} onChange={(quality) => void updateSettings({ recording: { quality } })} options={(['720p', '1080p', '1440p'] as const).map((v) => ({ value: v, label: v }))} />
          </Row>
          <Row label="Default frame rate">
            <Segmented<FrameRate> size="sm" value={s.recording.fps} onChange={(fps) => void updateSettings({ recording: { fps } })} options={[{ value: 30, label: '30 FPS' }, { value: 60, label: '60 FPS' }]} />
          </Row>
          <Row label="Default audio" hint={platform?.systemAudioSupported ? undefined : platform?.systemAudioNote}>
            <Segmented<AudioMode>
              size="sm"
              value={s.recording.audioMode}
              onChange={(audioMode) => void updateSettings({ recording: { audioMode } })}
              options={[
                { value: 'none', label: 'None' },
                { value: 'mic', label: 'Mic' },
                { value: 'system', label: 'System', disabled: !platform?.systemAudioSupported },
                { value: 'both', label: 'Both', disabled: !platform?.systemAudioSupported }
              ]}
            />
          </Row>
          <Row label="Default microphone" hint={mics.permission !== 'granted' ? 'Device names appear after microphone access is granted.' : undefined}>
            <div className="w-64">
              <Select value={s.recording.microphoneId ?? ''} onChange={(id) => void updateSettings({ recording: { microphoneId: id || null } })} options={[{ value: '', label: 'System default' }, ...mics.devices.filter((d) => d.deviceId !== 'default').map((d) => ({ value: d.deviceId, label: d.label }))]} />
            </div>
          </Row>
          <Row label="Recording folder" hint="New recordings are saved here.">
            <DirPicker value={s.recording.recordingsDir} title="Choose recordings folder" onPick={(recordingsDir) => void updateSettings({ recording: { recordingsDir } })} />
          </Row>
          <Row label="Countdown before recording">
            <Segmented<0 | 3 | 5> size="sm" value={s.recording.countdownSeconds} onChange={(countdownSeconds) => void updateSettings({ recording: { countdownSeconds } })} options={[{ value: 0, label: 'Off' }, { value: 3, label: '3 sec' }, { value: 5, label: '5 sec' }]} />
          </Row>
        </Section>

        <Section title="Camera">
          <Row label="Enable facecam by default" hint="When off, the camera is never accessed unless you turn it on for a recording.">
            <Toggle checked={s.camera.enabledByDefault} onChange={(enabledByDefault) => void updateSettings({ camera: { enabledByDefault } })} label="Enable facecam by default" />
          </Row>
          <Row label="Default camera">
            <div className="w-64">
              <Select value={s.camera.cameraId ?? ''} onChange={(id) => void updateSettings({ camera: { cameraId: id || null } })} options={[{ value: '', label: 'System default' }, ...cams.devices.map((d) => ({ value: d.deviceId, label: d.label }))]} />
            </div>
          </Row>
          <Row label="Default shape">
            <Segmented<CameraShape> size="sm" value={s.camera.shape} onChange={(shape) => void updateSettings({ camera: { shape } })} options={[{ value: 'circle', label: 'Circle' }, { value: 'rounded', label: 'Rounded' }, { value: 'square', label: 'Square' }]} />
          </Row>
          <Row label="Default size">
            <Segmented<CameraSize> size="sm" value={s.camera.size} onChange={(size) => void updateSettings({ camera: { size } })} options={[{ value: 'small', label: 'Small' }, { value: 'medium', label: 'Medium' }, { value: 'large', label: 'Large' }]} />
          </Row>
          <Row label="Default position">
            <Segmented<Corner>
              size="sm"
              value={s.camera.position}
              onChange={(position) => void updateSettings({ camera: { position } })}
              options={[
                { value: 'top-left', label: 'Top left' },
                { value: 'top-right', label: 'Top right' },
                { value: 'bottom-left', label: 'Bottom left' },
                { value: 'bottom-right', label: 'Bottom right' }
              ]}
            />
          </Row>
        </Section>

        <Section title="Export">
          <Row label="Default format" hint="H.264 video with AAC audio, playable everywhere.">
            <span className="rounded-md bg-surface-2 px-2 py-1 text-[12.5px] font-medium">MP4</span>
          </Row>
          <Row label="Default resolution">
            <Segmented<ExportResolution> size="sm" value={s.export.resolution} onChange={(resolution) => void updateSettings({ export: { resolution } })} options={([720, 1080, 1440, 2160] as const).map((r) => ({ value: r, label: r === 2160 ? '4K' : `${r}p` }))} />
          </Row>
          <Row label="Default frame rate">
            <Segmented<FrameRate> size="sm" value={s.export.fps} onChange={(fps) => void updateSettings({ export: { fps } })} options={[{ value: 30, label: '30 FPS' }, { value: 60, label: '60 FPS' }]} />
          </Row>
          <Row label="Default quality">
            <Segmented<QualityPreset> size="sm" value={s.export.quality} onChange={(quality) => void updateSettings({ export: { quality } })} options={[{ value: 'standard', label: 'Standard' }, { value: 'high', label: 'High' }, { value: 'maximum', label: 'Maximum' }]} />
          </Row>
          <Row label="Export folder">
            <DirPicker value={s.export.exportDir} title="Choose export folder" onPick={(exportDir) => void updateSettings({ export: { exportDir } })} />
          </Row>
        </Section>

        <Section title="Application">
          <Row label="Theme">
            <Segmented<ThemePreference> size="sm" value={s.app.theme} onChange={(theme) => void updateSettings({ app: { theme } })} options={[{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }, { value: 'system', label: 'System' }]} />
          </Row>
          <Row label="Open at login" hint="Available in the installed app.">
            <Toggle
              checked={s.app.launchAtLogin}
              onChange={async (v) => {
                try {
                  await window.recova.app.setLaunchAtLogin(v)
                  setSettings(await window.recova.settings.get())
                } catch (err) {
                  toast({ kind: 'error', title: 'Could not change startup setting', message: errorMessage(err) })
                }
              }}
              label="Open at login"
            />
          </Row>
          <Row label="On startup, show">
            <Segmented size="sm" value={s.app.startupView} onChange={(startupView: 'dashboard' | 'new-recording') => void updateSettings({ app: { startupView } })} options={[{ value: 'dashboard', label: 'Recordings' }, { value: 'new-recording', label: 'New recording' }]} />
          </Row>
          <Row label="Local storage" hint={storage ? `${storage.recordingCount} recordings · ${formatBytes(storage.recordingsBytes)}` : undefined}>
            <Button size="sm" icon={Folder} onClick={() => void window.recova.library.openRecordingsFolder()}>
              Open recordings folder
            </Button>
          </Row>
          <Row label="Version" hint={platform ? `Electron ${platform.electronVersion} · Chromium ${platform.chromeVersion}` : undefined}>
            <span className="text-[13px] font-medium tabular-nums">Recova {platform?.appVersion}</span>
          </Row>
          <Row label="Reset settings" hint="Restores every default. Recordings are not affected.">
            <Button size="sm" variant="secondary" icon={RotateCcw} onClick={() => setConfirmReset(true)}>
              Reset…
            </Button>
          </Row>
        </Section>

        {platform && !platform.ffmpegAvailable && <Notice kind="error">The bundled FFmpeg binary is missing, so exports will fail. Reinstall Recova to restore it.</Notice>}
        <p className="pb-4 text-center text-[12px] text-ink-3">Recova works fully offline. No accounts, analytics or uploads — your recordings never leave this computer.</p>
      </div>
      <ConfirmDialog
        open={confirmReset}
        title="Reset all settings?"
        message="All preferences return to their defaults. Your recordings and exports are kept."
        confirmLabel="Reset settings"
        onCancel={() => setConfirmReset(false)}
        onConfirm={async () => {
          setConfirmReset(false)
          setSettings(await window.recova.settings.reset())
          toast({ kind: 'success', title: 'Settings reset' })
        }}
      />
    </div>
  )
}
