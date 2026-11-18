import { htmlToBlocks, type ImageRef } from '@graphock/capture/blocks'
import { extractMetadata } from '@graphock/capture/metadata'
import { extractReadable } from '@graphock/capture/readable'
import { sanitizeElement } from '@graphock/capture/sanitize'
import type { Block } from '@graphock/clip-model'
import type { CaptureMode, CollectedPage, CollectMessage } from '../shared/messages'

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

function collect(mode: CaptureMode): CollectedPage {
  const metadata = extractMetadata(document, location.href)
  const readable = mode === 'readable' ? extractReadable(document) : { ok: false, content: null, textLength: 0 }

  let root: Element
  if (mode === 'selection') {
    const selected = selectionRoot()
    if (!selected) {
      return {
        source: metadata,
        blocks: [],
        images: [],
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

  // Images are wired in C-05 together with the asset fetcher. Until then we
  // must not emit image blocks that reference assets nobody collected.
  const { blocks } = htmlToBlocks(cleaned, {
    includeImages: false,
    skipChrome: mode === 'full'
  })

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
    images: [] as ImageRef[],
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
      try {
        sendResponse(collect(message.mode))
      } catch {
        sendResponse({
          source: { url: location.href, title: document.title || location.href },
          blocks: [] as Block[],
          images: [],
          readable: false,
          text: '',
          selectionText: '',
          htmlBytes: 0,
          nodeCount: 0
        })
      }
      return undefined
    }
  )
}
