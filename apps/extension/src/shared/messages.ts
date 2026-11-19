export type CaptureMode = 'readable' | 'full' | 'selection'

export type CollectMessage = {
  type: 'GRAPHOCK_COLLECT'
  mode: CaptureMode
  imagePolicy?: ImagePolicy
}

export type CollectedImage = {
  assetId: string
  sourceUrl: string
  alt: string
  width?: number
  height?: number
  mimeType?: string
  dataBase64?: string
  bytes?: number
  status?: 'fetched' | 'failed' | 'skipped'
  reason?: string
}

export type CollectedPage = {
  source: {
    url: string
    title: string
    canonicalUrl?: string
    lang?: string
    author?: string
    publishedAt?: string
    siteName?: string
    faviconUrl?: string
  }
  blocks: import('@graphock/clip-model').Block[]
  images: CollectedImage[]
  /** Self-contained HTML for full-page mode; absent for other modes. */
  html?: string
  /** True when the page exceeded the DOM size guard before cloning. */
  tooLarge?: boolean
  timings?: {
    measureMs: number
    readableMs: number
    cloneMs: number
    blocksMs: number
    stylesMs: number
    totalMs: number
  }
  readable: boolean
  text: string
  selectionText: string
  htmlBytes: number
  nodeCount: number
}

export type CaptureRequest = {
  type: 'GRAPHOCK_CAPTURE'
  mode: CaptureMode
  format?: OutputFormat
  requestId: string
}

export type CancelRequest = { type: 'GRAPHOCK_CANCEL'; requestId: string }

export type DeliverRequest = { type: 'GRAPHOCK_DELIVER'; clipId: string }

export type DeliverResult =
  | {
      ok: true
      url: string
      channel: 'inline' | 'file' | 'wake'
      savedFilename?: string
      savedPath?: string
      fallbackReason?: string
    }
  | { ok: false; code: string; message: string }

export type LogsResult = {
  entries: import('./logger').LogEntry[]
  persisted: import('./logger').LogEntry[]
  manifest: { version: string; permissions: string[] }
  userAgent: string
}

export type Capabilities = {
  downloads: boolean
  offscreen: boolean
  zip: boolean
  fileChannel: boolean
}

export type CaptureResult =
  | {
      ok: true
      requestId: string
      url?: string
      channel: 'inline' | 'file-ready' | 'wake'
      mode: CaptureMode
      title: string
      clipId: string
      markdown: string
      bytes: number
      urlLength?: number
      format: OutputFormat
      content: string
      assetCount: number
      embeddedAssets: number
      linkedAssets: number
      failedAssets: number
      skippedAssets: number
      canRequestImageAccess: boolean
      canSaveZip: boolean
      fallbackReason?: string
    }
  | { ok: false; code: string; message: string }

export type OpenRequest = { type: 'GRAPHOCK_OPEN'; url: string }
export type SaveRequest = {
  type: 'GRAPHOCK_SAVE'
  content: string
  format: OutputFormat
  title: string
  clipId: string
  withAssets?: boolean
}

export type HistoryEntry = {
  clipId: string
  title: string
  url: string
  createdAt: string
  format: OutputFormat
  channel: 'inline' | 'file' | 'wake'
  bytes: number
}

export type ImagePolicy = 'embed' | 'link' | 'skip'

export type OutputFormat = 'markdown' | 'html' | 'json' | 'yaml' | 'txt'

export type Settings = {
  targetScheme: string
  defaultMode: CaptureMode
  imagePolicy: ImagePolicy
  defaultFormat: OutputFormat
  downloadSubdirectory: string
}

export const DEFAULT_SETTINGS: Settings = {
  targetScheme: 'graphock-direct',
  defaultMode: 'readable',
  imagePolicy: 'embed',
  defaultFormat: 'markdown',
  downloadSubdirectory: 'Graphock'
}
