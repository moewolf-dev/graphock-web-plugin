import type { ImageRef } from './blocks.js'

export type FetchedImage = ImageRef & {
  mimeType?: string
  dataBase64?: string
  bytes?: number
  status: 'fetched' | 'failed' | 'skipped'
  reason?: string
}

export type FetchImagesOptions = {
  maxImages?: number
  maxImageBytes?: number
  maxTotalBytes?: number
  timeoutMs?: number
  fetchImpl?: typeof fetch
}

const DEFAULTS = {
  maxImages: 100,
  maxImageBytes: 10 * 1024 * 1024,
  maxTotalBytes: 16 * 1024 * 1024,
  timeoutMs: 8_000
}

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk))
  }
  return globalThis.btoa(binary)
}

/**
 * Fetch image bytes from the page context.
 *
 * Same-origin images and cross-origin images that opt in via CORS succeed.
 * Everything else is reported as `failed` (or `skipped` when over budget) so
 * the UI can tell the user instead of silently dropping content.
 */
export async function fetchImages(
  images: ImageRef[],
  options: FetchImagesOptions = {}
): Promise<FetchedImage[]> {
  const config = { ...DEFAULTS, ...options }
  const fetchImpl = options.fetchImpl ?? globalThis.fetch
  const results: FetchedImage[] = []
  let total = 0

  for (const image of images) {
    if (results.length >= config.maxImages) break
    if (total >= config.maxTotalBytes) {
      results.push({ ...image, status: 'skipped', reason: 'TOTAL_BUDGET' })
      continue
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), config.timeoutMs)
    try {
      const response = await fetchImpl(image.sourceUrl, {
        credentials: 'omit',
        signal: controller.signal
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const mimeType = (response.headers.get('content-type') ?? '').split(';')[0]?.trim() ?? ''
      if (!mimeType.startsWith('image/')) throw new Error(`Unsupported content type: ${mimeType || 'unknown'}`)
      const buffer = new Uint8Array(await response.arrayBuffer())
      if (buffer.byteLength > config.maxImageBytes) {
        results.push({ ...image, status: 'skipped', reason: 'IMAGE_TOO_LARGE', mimeType })
        continue
      }
      if (total + buffer.byteLength > config.maxTotalBytes) {
        results.push({ ...image, status: 'skipped', reason: 'TOTAL_BUDGET', mimeType })
        continue
      }
      total += buffer.byteLength
      results.push({
        ...image,
        status: 'fetched',
        mimeType,
        bytes: buffer.byteLength,
        dataBase64: toBase64(buffer)
      })
    } catch (error) {
      results.push({
        ...image,
        status: 'failed',
        reason: error instanceof Error ? error.message : 'FETCH_FAILED'
      })
    } finally {
      clearTimeout(timer)
    }
  }

  return results
}
