import { htmlToBlocks } from '@graphock/capture/blocks'
import { fetchImages } from '@graphock/capture/images'
import { buildPageSnapshot, collectStyles } from './snapshot'
import { extractMetadata } from '@graphock/capture/metadata'
import { extractReadable } from '@graphock/capture/readable'
import { sanitizeElement } from '@graphock/capture/sanitize'
import type { Block } from '@graphock/clip-model'
import type { CaptureMode, CollectedImage, CollectedPage, CollectMessage } from '../shared/messages'

declare global {
  interface Window {
    __graphockContentLoaded?: boolean
  }
}

const MAX_TEXT_CHARS = 400_000
const MIN_READABLE_CHARS = 200

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

async function collect(mode: CaptureMode): Promise<CollectedPage> {
  const metadata = extractMetadata(document, location.href)
  const readable = mode === 'readable' ? extractReadable(document) : { ok: false, content: null, textLength: 0 }

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

  const cleaned = sanitizeElement(root, { stripStyles: false })

  const { blocks, images } = htmlToBlocks(cleaned, {
    includeImages: true,
    skipChrome: mode === 'full'
  })
  const fetched = await fetchImages(images)

  let html: string | undefined
  if (mode === 'full') {
    const styles = await collectStyles(document)
    html = buildPageSnapshot(document, cleaned, styles, fetched)
  }

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
    nodeCount: countNodes(cleaned)
  }
}

if (!window.__graphockContentLoaded) {
  window.__graphockContentLoaded = true
  chrome.runtime.onMessage.addListener(
    (message: CollectMessage, _sender, sendResponse: (value: CollectedPage) => void) => {
      if (message?.type !== 'GRAPHOCK_COLLECT') return undefined
      void collect(message.mode)
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
