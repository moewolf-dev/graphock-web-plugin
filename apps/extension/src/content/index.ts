import { extractMetadata } from '@graphock/capture/metadata'
import type { CaptureMode, CollectedPage, CollectMessage } from '../shared/messages'

declare global {
  interface Window {
    __graphockContentLoaded?: boolean
  }
}

const MAX_TEXT_CHARS = 400_000

function countNodes(root: Node): number {
  let count = 0
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT)
  while (walker.nextNode()) count += 1
  return count
}

function collect(mode: CaptureMode): CollectedPage {
  const source = extractMetadata(document, location.href)
  const selection = window.getSelection()
  const selectionText = selection ? selection.toString().slice(0, MAX_TEXT_CHARS) : ''
  const body = document.body
  const text = (mode === 'selection' && selectionText ? selectionText : body?.innerText ?? '').slice(
    0,
    MAX_TEXT_CHARS
  )
  return {
    source,
    text,
    selectionText,
    htmlBytes: body?.innerHTML.length ?? 0,
    nodeCount: body ? countNodes(body) : 0
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
          source: { url: location.href, title: document.title },
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
