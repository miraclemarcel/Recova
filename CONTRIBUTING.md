# Contributing to Recova

Thanks for helping make Recova better! Bug reports, feature ideas, docs fixes and code are all welcome.

## Ground rules

- Be kind. This project follows the [Code of Conduct](CODE_OF_CONDUCT.md).
- Recova is **local-first**. Please don't propose features that upload user data, add telemetry, or require an account.
- Discuss large changes in an issue before opening a pull request.

## Development setup

```bash
git clone https://github.com/miraclemarcel/Recova.git
cd Recova
npm install
npm run dev
```

You need Node.js 22.6+ (24 recommended). `npm install` downloads Electron and a bundled FFmpeg binary.

## Before you open a pull request

```bash
npm run typecheck       # strict TypeScript, no `any`
npm run test:pipeline   # FFmpeg composition → MP4 test
npm run test:e2e        # drives the real app: record → studio → export (needs a desktop session)
```

- Keep the process boundaries intact. The renderer has no Node access, so add new capabilities as typed IPC in `src/shared/types.ts`, `src/preload/index.ts` and `src/main/index.ts`.
- Anything that changes how a composition looks must go through `src/renderer/src/features/studio/composition.ts`, so the preview and the export stay identical.
- Release media streams and tracks when you're done with them.
- Use short, imperative commit messages (e.g. `Add 4:3 aspect ratio`).

## Adding a background template

Add an entry to `TEMPLATES` in `src/renderer/src/features/studio/templates.ts`. A template is a deterministic `paint(ctx, W, H)` function plus text colours. Use the seeded `rng()` instead of `Math.random()` so the export matches the preview.

## Reporting bugs

Open an issue using the **Bug report** template. Include your OS version, Recova version (Settings → Application → Version) and the steps to reproduce it.
