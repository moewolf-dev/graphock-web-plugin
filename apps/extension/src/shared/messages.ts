export type CaptureMode = 'readable' | 'full' | 'selection'

export type CollectMessage = {
  type: 'GRAPHOCK_COLLECT'
  mode: CaptureMode
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
  text: string
  selectionText: string
  htmlBytes: number
  nodeCount: number
}

export type CaptureRequest = {
  type: 'GRAPHOCK_CAPTURE'
  mode: CaptureMode
}

export type CaptureResult =
  | {
      ok: true
      url: string
      channel: 'inline' | 'wake'
      mode: CaptureMode
      title: string
      clipId: string
      markdown: string
      bytes: number
      urlLength: number
      fallbackReason?: string
    }
  | { ok: false; code: string; message: string }

export type OpenRequest = { type: 'GRAPHOCK_OPEN'; url: string }
export type SaveRequest = {
  type: 'GRAPHOCK_SAVE'
  markdown: string
  title: string
  clipId: string
}

export type Settings = {
  targetScheme: string
  defaultMode: CaptureMode
  downloadSubdirectory: string
}

export const DEFAULT_SETTINGS: Settings = {
  targetScheme: 'graphock-direct',
  defaultMode: 'readable',
  downloadSubdirectory: 'Graphock'
}
