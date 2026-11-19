import { htmlToBlocks } from '@graphock/capture/blocks'
import { buildPageSnapshot, collectStyles } from './snapshot'
import { extractMetadata } from '@graphock/capture/metadata'
import { cloneForExport, measureDom } from '@graphock/capture/dom'
import { extractReadable } from '@graphock/capture/readable'
import { createLogger } from '../shared/logger'
import { sanitizeElement } from '@graphock/capture/sanitize'
import type { Block } from '@graphock/clip-model'
import type {
  CaptureMode,
  CollectedImage,
  CollectedPage,
  CollectMessage
} from '../shared/messages'

declare global {
  interface Window {
    __graphockContentLoaded?: boolean
  }
}

const MAX_TEXT_CHARS = 400_000
const MIN_READABLE_CHARS = 200
// Readability is O(document); skip it on dashboard-sized pages where the
// fallback (sanitised body) is both faster and usually more useful.
const MAX_READABLE_NODES = 8_000
const log = createLogger('content')

function countNodes(root: Node): number {
  let count = 0
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT)
  while (walker.nextNode()) count += 1
  return count
}

function selectionRoot(): Element | null {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null
  const container = document.createElement('div')
  for (let index = 0; index < selection.rangeCount; index += 1) {
    const range = selection.getRangeAt(index)
    container.append(range.cloneContents())
  }
  return container
}

async function collect(mode: CaptureMode, imagePolicy: 'embed' | 'link' | 'skip'): Promise<CollectedPage> {
  const started = performance.now()
  const metadata = extractMetadata(document, location.href)
  const measureStart = performance.now()
  const size = measureDom(document.body ?? document.documentElement)
  const measureMs = performance.now() - measureStart
  log.info('measure', { nodes: size.nodes, depth: size.depth, tooLarge: size.tooLarge, measureMs })
  if (mode !== 'selection' && size.tooLarge) {
    return {
      source: metadata,
      blocks: [],
      images: [] as CollectedImage[],
      readable: false,
      tooLarge: true,
      text: '',
      selectionText: '',
      htmlBytes: 0,
      nodeCount: size.nodes
    }
  }
  const readableStart = performance.now()
  const canRead = mode === 'readable' && size.nodes <= MAX_READABLE_NODES
  if (mode === 'readable' && !canRead) log.warn('readable-skipped', { nodes: size.nodes })
  const readable = canRead
    ? extractReadable(document)
    : { ok: false, content: null, textLength: 0 }
  const readableMs = performance.now() - readableStart

  let root: Element
  if (mode === 'selection') {
    const selected = selectionRoot()
    if (!selected) {
      return {
        source: metadata,
        blocks: [],
        images: [] as CollectedImage[],
        readable: false,
        text: '',
        selectionText: '',
        htmlBytes: 0,
        nodeCount: 0
      }
    }
    root = selected
  } else if (readable.ok && readable.content && readable.textLength >= MIN_READABLE_CHARS) {
    root = readable.content
  } else {
    root = document.body ?? document.documentElement
  }

  // Include open shadow roots and iframe placeholders before sanitizing.
  const cloneStart = performance.now()
  const raw = cloneForExport(root)
  const cleaned = sanitizeElement(raw, { stripStyles: false })
  const cloneMs = performance.now() - cloneStart

  const blocksStart = performance.now()
  const { blocks, images } = htmlToBlocks(cleaned, {
    includeImages: true,
    skipChrome: mode === 'full'
  })
  const blocksMs = performance.now() - blocksStart
  // The background worker fetches image bytes: it has the optional host
  // permission and is not subject to the page's CORS restrictions.
  const fetched = images

  const stylesStart = performance.now()
  let html: string | undefined
  if (mode === 'full' && imagePolicy !== 'skip') {
    const styles = imagePolicy === 'embed' ? await collectStyles(document) : ''
    html = buildPageSnapshot(document, cleaned, styles, fetched)
  }
  const stylesMs = performance.now() - stylesStart

  const text = (cleaned.textContent ?? '').replace(/\s+/gu, ' ').trim().slice(0, MAX_TEXT_CHARS)
  const selection = window.getSelection()
  const selectionText = selection ? selection.toString().slice(0, MAX_TEXT_CHARS) : ''

  const source = {
    ...metadata,
    ...(readable.ok && readable.title ? { title: readable.title } : {}),
    ...(readable.ok && readable.byline ? { author: readable.byline } : {}),
    ...(readable.ok && readable.siteName ? { siteName: readable.siteName } : {}),
    ...(readable.ok && readable.publishedTime ? { publishedAt: readable.publishedTime } : {})
  }

  return {
    source,
    blocks,
    images: fetched,
    ...(html ? { html } : {}),
    readable: readable.ok && root === readable.content,
    text,
    selectionText,
    htmlBytes: cleaned.innerHTML.length,
    nodeCount: countNodes(cleaned),
    timings: {
      measureMs,
      readableMs,
      cloneMs,
      blocksMs,
      stylesMs,
      totalMs: performance.now() - started
    }
  }
}

if (!window.__graphockContentLoaded) {
  window.__graphockContentLoaded = true
  chrome.runtime.onMessage.addListener(
    (message: CollectMessage, _sender, sendResponse: (value: CollectedPage) => void) => {
      if (message?.type !== 'GRAPHOCK_COLLECT') return undefined
      void collect(message.mode, message.imagePolicy ?? 'embed')
        .then(sendResponse)
        .catch(() =>
          sendResponse({
            source: { url: location.href, title: document.title || location.href },
            blocks: [] as Block[],
            images: [] as CollectedImage[],
            readable: false,
            text: '',
            selectionText: '',
            htmlBytes: 0,
            nodeCount: 0
          })
        )
      return true
    }
  )
}
