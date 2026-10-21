export const MEDIA_SCHEME = 'recova-media'

export const QUALITY_DIMENSIONS: Record<'720p' | '1080p' | '1440p', { width: number; height: number }> = {
  '720p': { width: 1280, height: 720 },
  '1080p': { width: 1920, height: 1080 },
  '1440p': { width: 2560, height: 1440 }
}

export const mediaUrl = {
  screen: (id: string, v = '') => `${MEDIA_SCHEME}://recording/${id}/screen${v ? `?v=${v}` : ''}`,
  camera: (id: string) => `${MEDIA_SCHEME}://recording/${id}/camera`,
  thumbnail: (id: string, v = '') => `${MEDIA_SCHEME}://recording/${id}/thumbnail${v ? `?v=${v}` : ''}`,
  exportFile: (id: string, exportId: string) => `${MEDIA_SCHEME}://export/${id}/${exportId}`,
  background: (bgId: string) => `${MEDIA_SCHEME}://background/${bgId}`
}
