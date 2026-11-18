export type CaptureMode = 'readable' | 'full' | 'selection'

export type CollectMessage = {
  type: 'GRAPHOCK_COLLECT'
  mode: CaptureMode
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
  status: 'fetched' | 'failed' | 'skipped'
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
}

export type CaptureResult =
  | {
      ok: true
      url: string
      channel: 'inline' | 'file' | 'wake'
      mode: CaptureMode
      title: string
      clipId: string
      markdown: string
      bytes: number
      urlLength: number
      savedFilename?: string
      format: 'markdown' | 'html' | 'json' | 'yaml'
      content: string
      assetCount: number
      embeddedAssets: number
      linkedAssets: number
      failedAssets: number
      fallbackReason?: string
    }
  | { ok: false; code: string; message: string }

export type OpenRequest = { type: 'GRAPHOCK_OPEN'; url: string }
export type SaveRequest = {
  type: 'GRAPHOCK_SAVE'
  content: string
  format: 'markdown' | 'html' | 'json' | 'yaml'
  title: string
  clipId: string
}

export type ImagePolicy = 'embed' | 'link' | 'skip'

export type OutputFormat = 'markdown' | 'html' | 'json' | 'yaml'

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
