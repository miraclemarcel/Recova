# Security Policy

## Supported versions

Security fixes go into the latest release.

## Reporting a vulnerability

Please **don't** open a public issue for security problems. Report them privately via [GitHub Security Advisories](https://github.com/miraclemarcel/Recova/security/advisories/new) and include the steps to reproduce. You'll get a response within a few days.

## Security model

- The renderer runs with `contextIsolation`, `sandbox` and no `nodeIntegration`.
- The preload exposes only a small typed API. IPC handlers validate their input and only accept messages from Recova's own windows.
- Media files are served through the `recova-media://` protocol, which resolves library IDs to files. It never accepts arbitrary paths.
- Recova makes no network requests of its own: no telemetry, no uploads.
