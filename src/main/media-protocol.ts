import { app, protocol } from 'electron'
import { createReadStream, existsSync, promises as fs } from 'node:fs'
import { extname, join } from 'node:path'
import { Readable } from 'node:stream'
import { MEDIA_SCHEME } from '@shared/constants'
import { getRecording } from './library'

export const backgroundsDir = () => join(app.getPath('userData'), 'backgrounds')

const MIME: Record<string, string> = {
  '.webm': 'video/webm',
  '.mp4': 'video/mp4',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp'
}

/** Must run before app ready. */
export function registerMediaScheme(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: MEDIA_SCHEME, privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true, corsEnabled: true } }
  ])
}

/**
 * Resolves a media URL to a file the library knows about. The renderer never supplies raw paths,
 * so it can only read recordings, exports and imported backgrounds.
 */
async function resolvePath(url: URL): Promise<string | null> {
  const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent)
  if (url.host === 'recording' && parts.length === 2) {
    const rec = await getRecording(parts[0])
    if (parts[1] === 'screen') return rec.screenPath
    if (parts[1] === 'camera') return rec.cameraPath
    if (parts[1] === 'thumbnail') return rec.thumbnailPath
  }
  if (url.host === 'export' && parts.length === 2) {
    const rec = await getRecording(parts[0])
    return rec.exports.find((e) => e.id === parts[1])?.path ?? null
  }
  if (url.host === 'background' && parts.length === 1 && /^[\w-]+\.(png|jpe?g|webp)$/i.test(parts[0])) {
    return join(backgroundsDir(), parts[0])
  }
  return null
}

const cors = { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-cache' }

export function handleMediaProtocol(): void {
  protocol.handle(MEDIA_SCHEME, async (request) => {
    try {
      const file = await resolvePath(new URL(request.url))
      if (!file || !existsSync(file)) return new Response('Not found', { status: 404, headers: cors })
      const { size } = await fs.stat(file)
      const type = MIME[extname(file).toLowerCase()] ?? 'application/octet-stream'
      const range = /bytes=(\d*)-(\d*)/.exec(request.headers.get('range') ?? '')
      if (range && size > 0) {
        const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]))
        const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1
        if (start >= size || start > end) {
          return new Response(null, { status: 416, headers: { ...cors, 'Content-Range': `bytes */${size}` } })
        }
        const body = Readable.toWeb(createReadStream(file, { start, end })) as ReadableStream
        return new Response(body, {
          status: 206,
          headers: {
            ...cors,
            'Content-Type': type,
            'Accept-Ranges': 'bytes',
            'Content-Range': `bytes ${start}-${end}/${size}`,
            'Content-Length': String(end - start + 1)
          }
        })
      }
      const body = Readable.toWeb(createReadStream(file)) as ReadableStream
      return new Response(body, { status: 200, headers: { ...cors, 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Content-Length': String(size) } })
    } catch {
      return new Response('Not found', { status: 404, headers: cors })
    }
  })
}
