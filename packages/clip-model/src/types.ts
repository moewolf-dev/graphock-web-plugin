/**
 * Shared clip document model.
 *
 * One model, many serializations: HTML, Markdown, JSON and YAML are all
 * produced from `ClipDocument`. Never add a second extraction pipeline for a
 * new output format — see docs/adr/0002-converter-stack.md.
 */

export const DOCUMENT_SCHEMA = 'graphock.clip.document/1' as const
export const HANDOFF_SCHEMA = 'graphock.clip.handoff/1' as const
export const PROTOCOL_VERSION = 1 as const

export type ClipMode = 'readable' | 'full' | 'selection'
export type DocumentFormat = 'html' | 'markdown' | 'json' | 'yaml' | 'txt'
export type AssetStatus = 'embedded' | 'linked' | 'skipped' | 'failed'

export type InlineNode =
  | { type: 'text'; text: string }
  | { type: 'code'; text: string }
  | { type: 'strong'; text: string }
  | { type: 'em'; text: string }
  | { type: 'link'; text: string; href: string }

export type TableCell = {
  text: string
  header?: boolean
  colspan?: number
  rowspan?: number
}

export type Block =
  | { type: 'heading'; level: 1 | 2 | 3 | 4 | 5 | 6; text: string }
  | { type: 'paragraph'; inline: InlineNode[] }
  | { type: 'image'; assetId: string; alt: string; title?: string; width?: number; height?: number }
  | { type: 'table'; rows: TableCell[][]; caption?: string }
  | { type: 'code'; text: string; lang?: string }
  | { type: 'quote'; blocks: Block[] }
  | { type: 'list'; ordered: boolean; items: Block[][] }
  | { type: 'hr' }

export type ClipAsset = {
  id: string
  /** Always a posix-style relative path, e.g. `assets/a1-1a2b3c4d.png`. */
  path: string
  mimeType: string
  sha256: string
  bytes: number
  sourceUrl?: string
  /** Original alt text when the asset is referenced from an image block. */
  alt?: string
  status: AssetStatus
}

export type ClipSource = {
  url: string
  title: string
  canonicalUrl?: string
  lang?: string
  author?: string
  publishedAt?: string
  siteName?: string
  faviconUrl?: string
}

export type ClipGenerator = {
  name: string
  version: string
  browser?: string
}

export type ClipStats = {
  blockCount: number
  assetCount: number
  bytes: number
}

export type ClipDocument = {
  schema: typeof DOCUMENT_SCHEMA
  clipId: string
  createdAt: string
  generator: ClipGenerator
  source: ClipSource
  mode: ClipMode
  blocks: Block[]
  assets: ClipAsset[]
  stats: ClipStats
  checksum: string
}

/** Formats a document may be serialized to when handed off. */
export type HandoffDocumentFormat = Exclude<DocumentFormat, 'json' | 'yaml'> | 'json' | 'yaml'

export type HandoffAsset = {
  path: string
  mimeType: string
  sha256: string
  /** Base64 (not base64url) bytes. Omitted for `linked`/`failed` assets. */
  data?: string
  sourceUrl?: string
}

export type HandoffPayload = {
  schema: typeof HANDOFF_SCHEMA
  protocolVersion: typeof PROTOCOL_VERSION
  clipId: string
  createdAt: string
  source: ClipSource
  document: {
    format: HandoffDocumentFormat
    content: string
  }
  assets: HandoffAsset[]
  generator: ClipGenerator
  checksum: string
}

export function isDocumentFormat(value: string): value is DocumentFormat {
  return ['html', 'markdown', 'json', 'yaml', 'txt'].includes(value)
}

export function isHandoffDocumentFormat(value: string): value is HandoffDocumentFormat {
  return isDocumentFormat(value)
}
