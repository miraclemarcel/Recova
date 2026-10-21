# Recova Architecture

This document explains how Recova is put together: the processes, how recording and exporting work, where data lives, and the rules that keep it secure. Read it before making non-trivial changes.

## Contents

1. [Overview](#overview)
2. [Technology stack](#technology-stack)
3. [Process model](#process-model)
4. [Project layout](#project-layout)
5. [IPC contract](#ipc-contract)
6. [Recording pipeline](#recording-pipeline)
7. [Composition engine](#composition-engine)
8. [Export pipeline](#export-pipeline)
9. [Storage and data model](#storage-and-data-model)
10. [Security model](#security-model)
11. [Performance and reliability](#performance-and-reliability)
12. [Platform differences](#platform-differences)
13. [Testing](#testing)
14. [Build and distribution](#build-and-distribution)
15. [Extending Recova](#extending-recova)

## Overview

Recova is a local-first Electron app. No backend, database, account or network service is involved. Everything (capture, encoding, compositing and storage) happens on the user's machine.

```
┌───────────────────────────── Main process (Node) ─────────────────────────────┐
│ windows · IPC handlers · desktopCapturer · recording sessions (disk streams)  │
│ library.json / settings.json · recova-media:// protocol · FFmpeg child procs  │
└───────────────▲──────────────────────────────▲────────────────────────────────┘
                │ typed IPC (preload bridge)   │ typed IPC
┌───────────────┴──────────────┐   ┌───────────┴────────────────┐
│ Main window renderer (React) │   │ Toolbar window renderer    │
│ setup · MediaRecorder · Web  │   │ countdown + controls,      │
│ Audio · Video Studio · export│   │ excluded from capture      │
└──────────────────────────────┘   └────────────────────────────┘
```

## Technology stack

| Concern | Choice |
| --- | --- |
| Desktop shell | Electron 44 |
| UI | React 19, Tailwind CSS 4, Lucide icons |
| State | Zustand (`store/app-store.ts`, `recording/session.ts`, `export/export-store.ts`) |
| Build | electron-vite 5 / Vite 7, TypeScript 6 (strict) |
| Capture | `desktopCapturer`, `getDisplayMedia`, `getUserMedia`, `MediaRecorder` |
| Audio | Web Audio API (mixing, gain, metering) |
| Compositing | Canvas 2D (preview + layer rendering) and FFmpeg filter graphs (export) |
| Encoding | Bundled FFmpeg (`ffmpeg-static`), libx264 + AAC |
| Packaging | electron-builder (NSIS, DMG, AppImage) |

## Process model

| Process | Entry | Responsibilities |
| --- | --- | --- |
| **Main** | `src/main/index.ts` | App lifecycle, windows, IPC, file system, FFmpeg, permissions, the media protocol |
| **Preload** | `src/preload/index.ts` | Exposes the typed `window.recova` API with `contextBridge`. This is the only bridge |
| **Main renderer** | `src/renderer/src/main.tsx` → `App` | All UI, media capture, audio mixing, Studio preview, export layer rendering |
| **Toolbar renderer** | the same bundle, loaded with `#toolbar` → `ToolbarApp` | Countdown and recording controls in a small always-on-top window |

Both renderers run with `contextIsolation: true`, `sandbox: true` and `nodeIntegration: false`. They can't touch the file system directly.

Capture and `MediaRecorder` run in the **main window's renderer**, because those are browser APIs. That window is minimised while recording, so `backgroundThrottling: false` keeps timers and the recorder running at full speed.

## Project layout

```
src/
├── main/
│   ├── index.ts          lifecycle + every IPC handler (with sender and input validation)
│   ├── windows.ts        main window, floating toolbar, countdown handshake
│   ├── capture.ts        source listing, display-media handler, permissions, platform capabilities
│   ├── recorder.ts       recording sessions: chunk streaming, finalisation, crash recovery
│   ├── library.ts        recordings index (library.json)
│   ├── settings.ts       settings.json with defaults and type-checked merging
│   ├── media-protocol.ts recova-media:// with HTTP range support
│   ├── exporter.ts       export jobs: temp layers, progress, cancellation, results
│   ├── export-args.ts    pure FFmpeg argument/filter-graph builder (no Electron imports)
│   ├── ffmpeg.ts         binary resolution, run/probe/remux/thumbnail helpers
│   └── json-store.ts     atomic JSON read/write and a serial write queue
├── preload/
│   ├── index.ts          window.recova implementation
│   └── api.d.ts          global type for the renderer
├── shared/
│   ├── types.ts          every cross-process type, including the RecovaApi contract
│   └── constants.ts      media URL builders, quality presets
└── renderer/src/
    ├── App.tsx           shell, navigation, theme
    ├── components/       Button, Modal, Segmented, Slider, Toggle, Toasts…
    ├── store/            app-wide Zustand store (view, settings, library, toasts)
    ├── lib/              formatting helpers
    └── features/
        ├── recording/    SetupView, RecordingView, session engine, device helpers
        ├── audio/        mixer, level meter, MicrophonePanel
        ├── camera/       useCameraStream
        ├── studio/       composition engine, templates, layouts, panels, preview, layer renderer
        ├── library/      Dashboard, RecordingCard, PlayerView, dialogs
        ├── export/       ExportDialog, ExportTray, export store
        ├── settings/     SettingsView
        └── toolbar/      ToolbarApp
```

## IPC contract

The single source of truth is `RecovaApi` in `src/shared/types.ts`. Adding a capability always means touching three places:

1. `src/shared/types.ts`: add the method to `RecovaApi`.
2. `src/preload/index.ts`: forward it with `ipcRenderer.invoke` / `send`.
3. `src/main/index.ts`: register a handler with `handle(...)`.

Every handler goes through `handle()`, which rejects messages that don't come from Recova's own windows. Handlers also validate their arguments (`str()`, enum checks, `ArrayBuffer` checks).

| Namespace | Purpose |
| --- | --- |
| `platform` | capabilities (system audio support, versions, FFmpeg availability) |
| `settings` | get/update/reset, folder picker, storage info |
| `capture` | list sources, prepare the source for the next `getDisplayMedia()` |
| `recording` | begin/writeChunk/finish/discard, toolbar show/hide, state + commands |
| `toolbar` | commands from the toolbar, state + countdown subscriptions, ready handshake |
| `library` | list/rename/remove/reveal, exports, change notifications |
| `studio` | import a background image |
| `export` | start/cancel jobs, progress events |
| `app` | launch at login |

Events from main to renderer: `library:changed`, `export:progress`, `recording:command`, `toolbar:state`, `toolbar:countdown`.

## Recording pipeline

```
SetupView ──prepare(sourceId)──▶ main stores the choice
    │
    ├─ getDisplayMedia() ──▶ main's setDisplayMediaRequestHandler returns { video: source, audio: 'loopback'? }
    ├─ getUserMedia(mic)     (only if audio includes the mic)
    ├─ getUserMedia(camera)  (only if Include Facecam is on)
    │
    ├─ Web Audio: mic ─▶ GainNode ─┐
    │             system audio ────┴─▶ MediaStreamDestination ─▶ one mixed track
    │
    ├─ recording.begin() ─▶ main creates <recordingsDir>/<id>/ + session.json marker + write streams
    ├─ recording.showToolbar(countdown) ─▶ main window minimises, toolbar shows the countdown
    │       toolbar ─ 'countdown-done' ─▶ main ─▶ renderer starts the MediaRecorders
    │
    ├─ MediaRecorder(screen + mixed audio) ─ 1 s chunks ─▶ writeChunk('screen') ─▶ screen.raw.webm
    ├─ MediaRecorder(camera)               ─ 1 s chunks ─▶ writeChunk('camera') ─▶ camera.raw.webm
    │
    └─ stop ─▶ flush writers ─▶ recording.finish()
                 main: FFmpeg remux (adds duration + cues) → screen.webm / camera.webm
                       probe → thumbnail.jpg → recording.json → library.json
```

Key details:

- **Session engine**: `features/recording/session.ts` owns the streams, recorders, timer and state. It's UI-independent, and both the toolbar and `RecordingView` drive it through the same commands.
- **Codecs**: VP9 + Opus by default, and VP8 for heavy captures (above 1080p30) to save CPU. Bitrate scales with pixels × fps.
- **Facecam sync**: the camera recorder's start time is measured relative to the screen recorder (`camera.offsetMs`). The preview and the export both apply that offset.
- **Pause/resume** use `MediaRecorder.pause()`, so paused time isn't in the file. The timer subtracts it too.
- **Toolbar handshake**: the toolbar sends `toolbar:ready` once it has subscribed. Main queues the countdown until then, so the first recording can't miss it.
- **Failure handling**: if the screen track ends (shared window closed, display lost), Recova saves what it has. If the mic or camera disconnects, it shows a warning and continues. Disk write errors stop and save. Permission problems become readable messages (`mediaErrorMessage`).

## Composition engine

`features/studio/composition.ts` is the heart of Video Studio. It's deliberately **pure** (geometry plus Canvas 2D calls, no React and no DOM state), so the preview and the exporter render the same thing.

- **`Composition`**: the serialisable design. It holds the background, aspect, fit, layout ID, screen (padding, scale, offset, radius, shadow, border, frame), camera (mode, shape, size, position, border, shadow, backing, mirror) and text.
- **`outputSize(aspect, resolution, source)`**: the canvas size, where `resolution` is the short side (always even numbers).
- **`computeLayout(comp, source, hasCamera, out)`** → `Layout`: every rectangle in output pixels: screen video, window chrome, camera, panel, text lines and brand pill. Sizes are expressed in units of `short side / 1080`, so designs scale with resolution.
- **Layers**, in paint order:

| Layer | Contains | Drawn by |
| --- | --- | --- |
| 1. Base | background, screen shadow, window chrome, facecam panel | `drawBaseLayer` |
| 2. Screen video | masked to `screenRadii` | preview: `drawVideoInto`; export: FFmpeg |
| 3. Middle | screen border, camera shadow / backing | `drawMiddleLayer` |
| 4. Camera video | masked to the camera shape | preview: `drawVideoInto`; export: FFmpeg |
| 5. Foreground | camera border, title/subtitle/creator, brand label | `drawForegroundLayer` |

- **Templates** (`templates.ts`) are deterministic `paint(ctx, W, H)` functions. Pattern templates use a seeded PRNG, never `Math.random()`.
- **Layouts** (`presets.ts`) are functions that patch the screen and camera settings. Users can keep adjusting afterwards.
- **Live preview** (`PreviewCanvas.tsx`) renders layers 1, 3 and 5 into cached canvases only when the design changes. Each animation frame just blits the caches and draws the current video frames. Dragging the camera or screen maps pointer deltas back to `camera.x/y` or `screen.offsetX/Y` (using `layout.free`).

## Export pipeline

```
ExportDialog
  └─ renderExportLayers()  (renderer, OffscreenCanvas at full output resolution)
        base.png · middle.png · foreground.png
        screen-mask.png · camera-mask.png   (shape stored in the ALPHA channel)
  └─ export.start(request) ─▶ main: write layers to a temp dir, spawn FFmpeg, return jobId
                                     stream progress (export:progress) ─▶ ExportTray
```

`buildExportArgs()` in `src/main/export-args.ts` produces this filter graph:

```
[0:v] screen.webm → setpts → fps → scale (fit) | scale+crop (fill) → rgba ─┐
[2:v] screen mask → alphaextract ──────────────────────────────────────────┴─ alphamerge ─┐
[1:v] base.png ──────────────────────────────────────────────────────────── overlay(x,y) ◀┘
      → overlay middle.png
[5:v] camera.webm → offset/trim → fps → scale+crop → hflip? → rgba ─┐
[6:v] camera mask → alphaextract ───────────────────────────────────┴─ alphamerge → overlay(x,y)
      → overlay foreground.png → yuv420p → libx264 (+ AAC from 0:a)
```

Why it's built this way:

- Rounded corners, circular facecams, soft shadows and typography are hard to express reliably with FFmpeg alone. Pre-rendering the static parts with Canvas gives pixel-identical results to the preview.
- Masks keep the shape in the **alpha channel** and FFmpeg reads it with `alphaextract`. This avoids limited-range luma conversion, which would make "black" masks partially transparent.
- Layer rectangles are snapped to even integers (`snap()` in `render-layers.ts`) before drawing, so the PNGs and the FFmpeg overlay positions line up exactly.
- Still images are looped for the recording's duration, and `-t` caps the output, so the graph always terminates.
- Quality presets map to x264 CRF/preset: Standard 23/veryfast, High 19/fast, Maximum 16/medium. `-movflags +faststart` makes the files stream-friendly.
- Jobs run as child processes, so the UI is never blocked. Progress comes from `-progress pipe:1`, and cancel kills the process and deletes the partial file.

## Storage and data model

| What | Where |
| --- | --- |
| Settings | `<userData>/settings.json` |
| Library index | `<userData>/library.json` (`{ version, recordings: RecordingMeta[] }`) |
| Recordings | `<recordingsDir>/<id>/screen.webm`, `camera.webm`, `thumbnail.jpg`, `recording.json` |
| In-progress session | `<recordingsDir>/<id>/session.json` + `*.raw.webm` |
| Imported backgrounds | `<userData>/backgrounds/<uuid>.<ext>` |
| Exports | user-chosen folder (default `Videos/Recova/Exports`) |
| Studio drafts | renderer `localStorage` (`recova:composition:<id>`), a convenience only |

The defaults are `recordingsDir = Videos/Recova/Recordings` and `<userData>` = Electron's per-user app-data directory.

- JSON is written atomically (temp file + rename) and through a serial queue, so concurrent updates never interleave.
- Settings are merged key by key against the defaults, and values with the wrong type are ignored. This keeps old or corrupt files from breaking the app.
- `LibraryItem` adds runtime `missing` / `cameraMissing` flags, so files moved outside Recova are shown as missing instead of crashing.
- Deleting a recording removes its folder. Exported MP4s are never deleted automatically.

## Security model

- Renderers are sandboxed, context-isolated and have no Node integration. `window.recova` is the only capability surface.
- IPC is accepted only from Recova's own `webContents`. Inputs are validated.
- **`recova-media://`** (`media-protocol.ts`) is the only way the UI reads media. URLs carry library IDs (`recording/<id>/screen`, `export/<id>/<exportId>`, `background/<file>`), and the main process resolves them to known paths. Raw paths are never accepted. It supports HTTP range requests (for seeking) and CORS (so canvases using these media stay untainted for PNG export).
- A Content Security Policy in `index.html` limits scripts to `'self'`. Navigation and `window.open` are blocked, and external links open in the system browser.
- Permissions: only `media` and `display-capture` are granted. The camera and microphone are opened only when the user enables them.
- No telemetry and no network calls.

## Performance and reliability

- Recording chunks stream straight to disk, and the renderer never accumulates the video in memory.
- Crash recovery: on startup, `recoverInterrupted()` finalises any folder that still has a `session.json` marker.
- Every stream, track, `AudioContext`, animation frame and interval is released on stop, cancel or unmount (`releaseMedia`, effect cleanups, `stopStream`).
- The preview re-renders static layers only when the design changes, and runs at the canvas's on-screen pixel size (capped at the output size).
- FFmpeg runs off the main thread. Probing parses `ffmpeg -i` output, so no separate ffprobe binary is shipped.

## Platform differences

| Capability | Windows | macOS | Linux |
| --- | --- | --- | --- |
| Screen/window capture | ✅ | ✅ (Screen Recording permission) | ✅ |
| System audio | ✅ loopback | ❌ use a virtual device | ❌ use a monitor source |
| Toolbar hidden from capture | ✅ (`WDA_EXCLUDEFROMCAPTURE`, Win10 2004+) | ✅ | ⚠️ may be visible |

`systemAudioSupport()` in `src/main/capture.ts` is the single place that decides capabilities, and the UI reads them from `platform.info()`.

## Testing

| Command | What it proves |
| --- | --- |
| `npm run typecheck` | Strict types across main, preload and renderer |
| `npm run test:pipeline` | Builds real WebM inputs and PNG layers, runs `buildExportArgs()` through FFmpeg, and checks the MP4 format plus pixel probes (background, rounded corner, camera mask, foreground) |
| `npm run test:e2e` | Launches the built app and drives the UI: New Recording → Start → countdown → pause/resume → Stop → Studio (template + layout) → Export, then verifies the saved recording and the MP4 |

The e2e test needs an interactive desktop session, so CI runs typecheck, build, the pipeline test and packaging.

## Build and distribution

- `electron-vite build` writes `out/main`, `out/preload` and `out/renderer`.
- `electron-builder` packages them. `ffmpeg-static` is listed in `asarUnpack` so the binary can run, and `ffmpegPath()` rewrites `app.asar` → `app.asar.unpacked` at runtime.
- Artifacts have stable names (`Recova-Setup.exe`, `Recova-arm64.dmg`, `Recova-x86_64.AppImage`), so `releases/latest/download/...` links always work.
- `.github/workflows/ci.yml` runs on every push and PR to `main`. `.github/workflows/release.yml` runs on `v*.*.*` tags: it creates the GitHub Release, then builds Windows, macOS and Linux in parallel and uploads the installers.

## Extending Recova

- **New template**: add an entry to `TEMPLATES` in `features/studio/templates.ts`.
- **New layout**: add a `LayoutPreset` in `features/studio/presets.ts` and an icon in `LayoutIcon` (`panels.tsx`).
- **New visual effect**: add fields to `Composition`, compute geometry in `computeLayout`, and draw it in the right layer function. The preview and the export pick it up automatically.
- **New export format**: extend `ExportRequest` and add a branch in `buildExportArgs()`, then cover it in `scripts/test-export-pipeline.mjs`.
- **New native capability**: follow the three-step IPC contract above, and validate inputs in the handler.
