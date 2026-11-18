import { canonicalize } from './canonical.js'
import type { ClipAsset, ClipDocument, ClipMode, ClipSource, Block } from './types.js'
import { DOCUMENT_SCHEMA } from './types.js'

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

export async function sha256Hex(input: string | Uint8Array): Promise<string> {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input
  const view = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
  const digest = await globalThis.crypto.subtle.digest('SHA-256', view)
  return toHex(digest)
}

/**
 * Checksum definition (must match docs/protocol/CUSTOM_PROTOCOL_IMPORT.md):
 *
 *   sha256( canonicalize({
 *     schema, clipId, mode, source,
 *     blocks,
 *     assets: assets.map(({ path, sha256, bytes }) => ({ path, sha256, bytes })).sort(by path)
 *   }) )
 *
 * Only stable, content-bearing fields participate. `createdAt`, `generator`
 * and `stats` are excluded so a re-export of the same content keeps the same
 * checksum (used for de-duplication on the receiving side).
 */
export function documentChecksumInput(input: {
  clipId: string
  mode: ClipMode
  source: ClipSource
  blocks: Block[]
  assets: Pick<ClipAsset, 'path' | 'sha256' | 'bytes'>[]
}): string {
  return canonicalize({
    schema: DOCUMENT_SCHEMA,
    clipId: input.clipId,
    mode: input.mode,
    source: input.source,
    blocks: input.blocks,
    assets: [...input.assets]
      .map(({ path, sha256, bytes }) => ({ path, sha256, bytes }))
      .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
  })
}

export async function computeDocumentChecksum(input: {
  clipId: string
  mode: ClipMode
  source: ClipSource
  blocks: Block[]
  assets: Pick<ClipAsset, 'path' | 'sha256' | 'bytes'>[]
}): Promise<string> {
  return sha256Hex(documentChecksumInput(input))
}

/**
 * Handoff checksum: covers the serialized document plus the asset digests,
 * but not the (possibly large) asset bytes themselves.
 */
export async function computeHandoffChecksum(input: {
  clipId: string
  document: { format: string; content: string }
  assets: { path: string; sha256: string }[]
}): Promise<string> {
  return sha256Hex(
    canonicalize({
      clipId: input.clipId,
      document: { format: input.document.format, content: input.document.content },
      assets: [...input.assets]
        .map(({ path, sha256 }) => ({ path, sha256 }))
        .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
    })
  )
}

export function documentStats(
  blocks: Block[],
  assets: Pick<ClipAsset, 'bytes'>[],
  bytes: number
): ClipDocument['stats'] {
  return {
    blockCount: countBlocks(blocks),
    assetCount: assets.length,
    bytes
  }
}

export function countBlocks(blocks: Block[]): number {
  let count = 0
  for (const block of blocks) {
    count += 1
    if (block.type === 'quote') count += countBlocks(block.blocks)
    if (block.type === 'list') {
      for (const item of block.items) count += countBlocks(item)
    }
  }
  return count
}
