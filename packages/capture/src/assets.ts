export type AssetInput = {
  sourceUrl?: string
  mimeType: string
  bytes: Uint8Array
  alt?: string
}

export type StoredAsset = {
  id: string
  path: string
  mimeType: string
  sha256: string
  bytes: number
  sourceUrl?: string
  alt?: string
  data: Uint8Array
}

const EXTENSION_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
  'image/avif': 'avif'
}

export function extensionForMime(mimeType: string): string {
  return EXTENSION_BY_MIME[mimeType] ?? 'bin'
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const view = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
  const digest = await globalThis.crypto.subtle.digest('SHA-256', view)
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Deduplicate assets by content hash and assign stable ids/paths.
 * Paths are always relative and derived from the digest, never from the
 * remote URL, so hostile filenames cannot influence the output tree.
 */
export async function storeAssets(inputs: AssetInput[]): Promise<StoredAsset[]> {
  const seen = new Map<string, StoredAsset>()
  for (const input of inputs) {
    const digest = await sha256Hex(input.bytes)
    if (seen.has(digest)) continue
    const id = `a${seen.size + 1}`
    const extension = extensionForMime(input.mimeType)
    seen.set(digest, {
      id,
      path: `assets/${id}-${digest.slice(0, 8)}.${extension}`,
      mimeType: input.mimeType,
      sha256: digest,
      bytes: input.bytes.byteLength,
      ...(input.sourceUrl ? { sourceUrl: input.sourceUrl } : {}),
      ...(input.alt ? { alt: input.alt } : {}),
      data: input.bytes
    })
  }
  return [...seen.values()]
}
