import {
  HANDOFF_SCHEMA,
  PROTOCOL_VERSION,
  computeDocumentChecksum,
  computeHandoffChecksum,
  sha256Hex,
  type Block,
  type ClipAsset,
  type ClipDocument,
  type HandoffPayload
} from '@graphock/clip-model'
import { base64ToBytes, bytesToBase64 } from '@graphock/capture/base64'
import { strToU8, zipSync } from 'fflate'
import { storeAssets } from '@graphock/capture/assets'
import { toHtml, toJson, toMarkdown, toYaml } from '@graphock/converters'
import { buildInlineUrl, isAbsolutePath, ProtocolError } from '@graphock/handoff'
import type { CollectedPage, OutputFormat } from '../shared/messages'

export type ImagePolicy = 'embed' | 'link' | 'skip'

export type BuildOptions = {
  mode: 'readable' | 'full' | 'selection'
  imagePolicy: ImagePolicy
  scheme: string
  format: OutputFormat
  /** Full-page snapshot from the content script, used for HTML output. */
  htmlSnapshot?: string
  generator: { name: string; version: string; browser?: string }
  accessiblePathPrefixes?: string[]
}

export type BuildResult = {
  document: ClipDocument
  payload: HandoffPayload
  /** Serialized output in the requested format. */
  content: string
  format: OutputFormat
  markdown: string
  inlineUrl?: string
  inlineError?: { code: string; message: string }
  stats: {
    assetCount: number
    embedded: number
    linked: number
    failed: number
    skipped: number
  }
}

function inlineTextLength(blocks: Block[]): number {
  let total = 0
  for (const block of blocks) {
    if (block.type === 'paragraph') {
      total += block.inline.reduce((sum, item) => sum + ('text' in item ? item.text.length : 0), 0)
    } else if (block.type === 'quote') {
      total += inlineTextLength(block.blocks)
    } else if (block.type === 'list') {
      for (const item of block.items) total += inlineTextLength(item)
    } else if (block.type === 'heading') {
      total += block.text.length
    }
  }
  return total
}

function remapImageBlocks(blocks: Block[], mapping: Map<string, string>): Block[] {
  const result: Block[] = []
  for (const block of blocks) {
    if (block.type === 'image') {
      const assetId = mapping.get(block.assetId)
      if (assetId) result.push({ ...block, assetId })
      continue
    }
    if (block.type === 'quote') {
      result.push({ ...block, blocks: remapImageBlocks(block.blocks, mapping) })
      continue
    }
    if (block.type === 'list') {
      result.push({ ...block, items: block.items.map((item) => remapImageBlocks(item, mapping)) })
      continue
    }
    result.push(block)
  }
  return result
}

function dropImageBlocks(blocks: Block[]): Block[] {
  const result: Block[] = []
  for (const block of blocks) {
    if (block.type === 'image') continue
    if (block.type === 'quote') {
      result.push({ ...block, blocks: dropImageBlocks(block.blocks) })
      continue
    }
    if (block.type === 'list') {
      result.push({ ...block, items: block.items.map((item) => dropImageBlocks(item)) })
      continue
    }
    result.push(block)
  }
  return result
}

/**
 * Turn a captured page into a handoff payload.
 *
 * Pure function: no chrome APIs, no filesystem. The background worker decides
 * which channel to use based on `inlineUrl` vs `inlineError`.
 */
export async function buildClip(
  collected: CollectedPage,
  options: BuildOptions
): Promise<BuildResult> {
  const { generator } = options
  const source = collected.source
  const baseBlocks: Block[] = [
    { type: 'heading', level: 1, text: source.title },
    ...collected.blocks
  ]

  const assets: ClipAsset[] = []
  const assetDataByPath = new Map<string, string>()
  const imageIdMapping = new Map<string, string>()
  let embedded = 0
  let linked = 0
  let failed = 0
  let skipped = 0

  if (options.imagePolicy !== 'skip') {
    const fetched = collected.images.filter((image) => image.status === 'fetched' && image.dataBase64)

    if (options.imagePolicy === 'embed' && fetched.length > 0) {
      const stored = await storeAssets(
        fetched.map((image) => ({
          sourceUrl: image.sourceUrl,
          mimeType: image.mimeType ?? 'application/octet-stream',
          bytes: base64ToBytes(image.dataBase64 ?? ''),
          ...(image.alt ? { alt: image.alt } : {})
        }))
      )
      const bySource = new Map(stored.map((asset) => [asset.sourceUrl ?? '', asset]))
      for (const image of fetched) {
        const asset = bySource.get(image.sourceUrl)
        if (!asset) continue
        imageIdMapping.set(image.assetId, asset.id)
        if (assets.some((entry) => entry.id === asset.id)) continue
        assets.push({
          id: asset.id,
          path: asset.path,
          mimeType: asset.mimeType,
          sha256: asset.sha256,
          bytes: asset.bytes,
          ...(asset.sourceUrl ? { sourceUrl: asset.sourceUrl } : {}),
          ...(asset.alt ? { alt: asset.alt } : {}),
          status: 'embedded'
        })
        assetDataByPath.set(asset.path, bytesToBase64(asset.data))
        embedded += 1
      }
    }

    // Images we could not (or chose not to) embed stay as links so the user
    // still sees them when they open the Markdown online.
    const linkCandidates = collected.images.filter((image) => {
      if (imageIdMapping.has(image.assetId)) return false
      if (image.status === 'failed') {
        failed += 1
        return true
      }
      if (image.status === 'skipped') {
        skipped += 1
        return true
      }
      return options.imagePolicy === 'link'
    })

    for (const image of linkCandidates) {
      const id = `l${assets.length + 1}`
      const absolute = isAbsolutePath(image.sourceUrl) || /^https?:/iu.test(image.sourceUrl)
      if (!absolute) continue
      assets.push({
        id,
        path: `assets/${id}.linked`,
        mimeType: 'image/*',
        sha256: await sha256Hex(image.sourceUrl),
        bytes: 0,
        sourceUrl: image.sourceUrl,
        ...(image.alt ? { alt: image.alt } : {}),
        status: 'linked'
      })
      imageIdMapping.set(image.assetId, id)
      linked += 1
    }
  }

  const blocks =
    options.imagePolicy === 'skip'
      ? dropImageBlocks(baseBlocks)
      : remapImageBlocks(baseBlocks, imageIdMapping)

  const textBytes = inlineTextLength(blocks)
  const document: ClipDocument = {
    schema: 'graphock.clip.document/1',
    clipId: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    generator,
    source,
    mode: options.mode,
    blocks,
    assets,
    stats: { blockCount: blocks.length, assetCount: assets.length, bytes: textBytes },
    checksum: '0'.repeat(64)
  }
  document.checksum = await computeDocumentChecksum({
    clipId: document.clipId,
    mode: document.mode,
    source: document.source,
    blocks: document.blocks,
    assets: document.assets
  })

  const markdown = toMarkdown(document, {
    generatorName: generator.name,
    generatorVersion: generator.version
  })

  const dataUrls = new Map<string, string>()
  for (const asset of assets) {
    const data = assetDataByPath.get(asset.path)
    if (data) dataUrls.set(asset.id, `data:${asset.mimeType};base64,${data}`)
  }

  const content = serialise(document, options, markdown, dataUrls)

  const payload: HandoffPayload = {
    schema: HANDOFF_SCHEMA,
    protocolVersion: PROTOCOL_VERSION,
    clipId: document.clipId,
    createdAt: document.createdAt,
    source: document.source,
    document: { format: options.format, content },
    assets: assets
      .filter((asset) => asset.status === 'embedded')
      .map((asset) => ({
        path: asset.path,
        mimeType: asset.mimeType,
        sha256: asset.sha256,
        ...(assetDataByPath.has(asset.path) ? { data: assetDataByPath.get(asset.path) } : {}),
        ...(asset.sourceUrl ? { sourceUrl: asset.sourceUrl } : {})
      })),
    generator,
    checksum: await computeHandoffChecksum({
      clipId: document.clipId,
      document: { format: options.format, content },
      assets: assets
        .filter((asset) => asset.status === 'embedded')
        .map(({ path, sha256 }) => ({ path, sha256 }))
    })
  }

  const result: BuildResult = {
    document,
    payload,
    content,
    format: options.format,
    markdown,
    stats: { assetCount: assets.length, embedded, linked, failed, skipped }
  }

  try {
    result.inlineUrl = buildInlineUrl(options.scheme, payload)
  } catch (error) {
    result.inlineError =
      error instanceof ProtocolError
        ? { code: error.code, message: error.message }
        : { code: 'E_INLINE', message: error instanceof Error ? error.message : 'Unknown error' }
  }

  return result
}

function serialise(
  document: ClipDocument,
  options: BuildOptions,
  markdown: string,
  dataUrls: Map<string, string>
): string {
  switch (options.format) {
    case 'html':
      return options.htmlSnapshot ?? toHtml(document, { assetDataUrlById: dataUrls })
    case 'json':
      return toJson(document)
    case 'yaml':
      return toYaml(document)
    case 'markdown':
    default:
      return markdown
  }
}

/**
 * Replace remote image URLs in a full-page snapshot with data URIs.
 * The content script cannot embed bytes (the background fetches them), so the
 * substitution happens here on the serialized HTML.
 */
export function inlineHtmlImages(
  html: string,
  images: Array<{ sourceUrl: string; dataBase64?: string; mimeType?: string }>
): string {
  let output = html
  for (const image of images) {
    if (!image.dataBase64) continue
    const data = `data:${image.mimeType ?? 'image/png'};base64,${image.dataBase64}`
    const escaped = image.sourceUrl
      .replace(/&/gu, '&amp;')
      .replace(/"/gu, '&quot;')
      .replace(/</gu, '&lt;')
      .replace(/>/gu, '&gt;')
    for (const value of new Set([image.sourceUrl, escaped])) {
      output = output.split(`src="${value}"`).join(`src="${data}"`)
    }
  }
  return output
}

const ZIP_MTIME = new Date('2026-01-01T00:00:00Z')

function extensionFor(format: OutputFormat): string {
  return format === 'markdown' ? 'md' : format
}

/**
 * Deterministic zip: document + manifest + assets.
 * The manifest keeps asset metadata but drops the base64 payload to avoid
 * doubling the archive size.
 */
export function buildClipZip(build: BuildResult): Uint8Array {
  const files: Record<string, [Uint8Array, { mtime: Date; level: 9 }]> = {}
  const documentName = `document.${extensionFor(build.format)}`
  files[documentName] = [strToU8(build.content), { mtime: ZIP_MTIME, level: 9 }]

  const manifest = {
    ...build.payload,
    assets: build.payload.assets.map(({ path, mimeType, sha256, sourceUrl }) => ({
      path,
      mimeType,
      sha256,
      ...(sourceUrl ? { sourceUrl } : {})
    }))
  }
  files['manifest.json'] = [
    strToU8(`${JSON.stringify(manifest, null, 2)}\n`),
    { mtime: ZIP_MTIME, level: 9 }
  ]

  for (const asset of build.payload.assets) {
    if (!asset.data) continue
    files[asset.path] = [base64ToBytes(asset.data), { mtime: ZIP_MTIME, level: 9 }]
  }

  const sorted = Object.fromEntries(Object.entries(files).sort(([a], [b]) => a.localeCompare(b)))
  return zipSync(sorted, { mtime: ZIP_MTIME })
}

export type InlineCssOptions = {
  maxAssets?: number
  maxAssetBytes?: number
  maxTotalBytes?: number
  fetchImpl?: typeof fetch
}

const CSS_URL_PATTERN = /url\(\s*(['"]?)([^'")]+)\1\s*\)/giu

/**
 * Fetch CSS `url(...)` targets (background images, webfonts) and inline them as
 * data URIs. Best-effort: failures leave the original URL in place.
 */
export async function inlineCssAssets(
  html: string,
  options: InlineCssOptions = {}
): Promise<string> {
  const maxAssets = options.maxAssets ?? 20
  const maxAssetBytes = options.maxAssetBytes ?? 2 * 1024 * 1024
  const maxTotalBytes = options.maxTotalBytes ?? 8 * 1024 * 1024
  const fetchImpl = options.fetchImpl ?? globalThis.fetch

  const urls = new Set<string>()
  for (const match of html.matchAll(CSS_URL_PATTERN)) {
    const value = match[2]?.trim()
    if (!value) continue
    if (value.startsWith('data:') || value.startsWith('#') || value.startsWith('about:')) continue
    if (!/^https?:/iu.test(value)) continue
    urls.add(value)
    if (urls.size >= maxAssets) break
  }

  const replacements = new Map<string, string>()
  let total = 0
  for (const url of urls) {
    try {
      const response = await fetchImpl(url, { credentials: 'omit' })
      if (!response.ok) continue
      const header = (response.headers.get('content-type') ?? '').split(';')[0]?.trim() ?? ''
      const bytes = new Uint8Array(await response.arrayBuffer())
      if (bytes.byteLength > maxAssetBytes || total + bytes.byteLength > maxTotalBytes) continue
      total += bytes.byteLength
      const mime = header || (/\.(woff2?|ttf|otf)$/iu.test(url) ? 'font/woff2' : 'application/octet-stream')
      replacements.set(url, `data:${mime};base64,${bytesToBase64(bytes)}`)
    } catch {
      // Leave the original URL: offline exports still degrade gracefully.
    }
  }

  if (replacements.size === 0) return html
  return html.replace(CSS_URL_PATTERN, (whole, quote: string, raw: string) => {
    const replacement = replacements.get(raw.trim())
    return replacement ? `url(${replacement})` : whole
  })
}

/** Serialize a payload for the file channel (uncompressed JSON, UTF-8). */
export function serializePayload(payload: HandoffPayload): string {
  return `${JSON.stringify(payload)}\n`
}
