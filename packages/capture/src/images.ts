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
  signal?: AbortSignal
  concurrency?: number
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
export async function readResponseLimited(response: Response, maxBytes: number): Promise<Uint8Array> {
  const declared = Number(response.headers.get('content-length') ?? '')
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new Error(`Image is ${declared} bytes (limit ${maxBytes})`)
  }
  if (!response.body) {
    const buffer = new Uint8Array(await response.arrayBuffer())
    if (buffer.byteLength > maxBytes) throw new Error(`Image is ${buffer.byteLength} bytes (limit ${maxBytes})`)
    return buffer
  }
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (!value) continue
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel()
      throw new Error(`Image exceeded ${maxBytes} bytes`)
    }
    chunks.push(value)
  }
  const merged = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    merged.set(chunk, offset)
    offset += chunk.byteLength
  }
  return merged
}

export async function fetchImages(
  images: ImageRef[],
  options: FetchImagesOptions = {}
): Promise<FetchedImage[]> {
  const config = { ...DEFAULTS, ...options }
  const queue = images.slice(0, config.maxImages)
  const concurrency = Math.max(1, Math.min(options.concurrency ?? 6, queue.length || 1))
  const fetchImpl = options.fetchImpl ?? globalThis.fetch
  const results: FetchedImage[] = new Array(queue.length)
  let nextIndex = 0
  let total = 0
  let stopped = false

  const fetchOne = async (image: ImageRef): Promise<FetchedImage> => {
    if (options.signal?.aborted) return { ...image, status: 'failed', reason: 'ABORTED' }
    if (total >= config.maxTotalBytes) {
      return { ...image, status: 'skipped', reason: 'TOTAL_BUDGET' }
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), config.timeoutMs)
    const AnySignal = (AbortSignal as unknown as { any?: (signals: AbortSignal[]) => AbortSignal }).any
    const signal = options.signal && AnySignal ? AnySignal([controller.signal, options.signal]) : controller.signal
    try {
      const response = await fetchImpl(image.sourceUrl, { credentials: 'omit', signal })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const mimeType = (response.headers.get('content-type') ?? '').split(';')[0]?.trim() ?? ''
      if (!mimeType.startsWith('image/')) throw new Error(`Unsupported content type: ${mimeType || 'unknown'}`)
      const buffer = await readResponseLimited(response, config.maxImageBytes)
      if (total + buffer.byteLength > config.maxTotalBytes) {
        return { ...image, status: 'skipped', reason: 'TOTAL_BUDGET', mimeType }
      }
      total += buffer.byteLength
      return {
        ...image,
        status: 'fetched',
        mimeType,
        bytes: buffer.byteLength,
        dataBase64: toBase64(buffer)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'FETCH_FAILED'
      if (/Image (is|exceeded)/u.test(message)) {
        return { ...image, status: 'skipped', reason: 'IMAGE_TOO_LARGE' }
      }
      return { ...image, status: 'failed', reason: message }
    } finally {
      clearTimeout(timer)
    }
  }

  const worker = async (): Promise<void> => {
    while (!stopped) {
      const index = nextIndex
      nextIndex += 1
      if (index >= queue.length) return
      const image = queue[index]
      if (!image) return
      if (options.signal?.aborted) {
        stopped = true
        results[index] = { ...image, status: 'failed', reason: 'ABORTED' }
        return
      }
      results[index] = await fetchOne(image)
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()))
  return results.map((entry, index) =>
    entry ?? { ...queue[index]!, status: 'failed', reason: 'NOT_FETCHED' }
  )
}
