import {
  HANDOFF_SCHEMA,
  PROTOCOL_VERSION,
  computeDocumentChecksum,
  computeHandoffChecksum,
  type Block,
  type ClipDocument,
  type HandoffPayload
} from '@graphock/clip-model'
import { buildFilename, toMarkdown } from '@graphock/converters'
import { ProtocolError, buildInlineUrl, buildWakeUrl } from '@graphock/handoff'
import {
  DEFAULT_SETTINGS,
  type CaptureRequest,
  type CaptureResult,
  type CollectedPage,
  type OpenRequest,
  type SaveRequest,
  type Settings
} from '../shared/messages'

const GENERATOR_NAME = 'graphock-web-plugin'
const GENERATOR_VERSION = '0.1.0'
const MAX_DOWNLOAD_BYTES = 2 * 1024 * 1024

async function getSettings(): Promise<Settings> {
  const stored = await chrome.storage.local.get('settings')
  return { ...DEFAULT_SETTINGS, ...(stored['settings'] as Partial<Settings> | undefined) }
}

function textToBlocks(text: string): Block[] {
  const paragraphs = text
    .split(/\n{2,}/u)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .slice(0, 600)
  return paragraphs.map((paragraph) => ({
    type: 'paragraph',
    inline: [{ type: 'text', text: paragraph.replace(/\s*\n\s*/gu, ' ') }]
  }))
}

function buildDocument(collected: CollectedPage, mode: CaptureRequest['mode']): ClipDocument {
  const blocks: Block[] = [
    { type: 'heading', level: 1, text: collected.source.title },
    ...textToBlocks(collected.text)
  ]
  return {
    schema: 'graphock.clip.document/1',
    clipId: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    generator: { name: GENERATOR_NAME, version: GENERATOR_VERSION, browser: navigator.userAgent },
    source: collected.source,
    mode,
    blocks,
    assets: [],
    stats: { blockCount: blocks.length, assetCount: 0, bytes: collected.text.length },
    checksum: '0'.repeat(64)
  }
}

async function capture(request: CaptureRequest): Promise<CaptureResult> {
  const settings = await getSettings()
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id) {
    return { ok: false, code: 'E_NO_ACTIVE_TAB', message: 'No active tab is available.' }
  }

  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] })
  } catch {
    return {
      ok: false,
      code: 'E_INJECTION_FAILED',
      message: 'This page does not allow content scripts (browser pages and the Web Store do not).'
    }
  }

  let collected: CollectedPage
  try {
    collected = (await chrome.tabs.sendMessage(tab.id, {
      type: 'GRAPHOCK_COLLECT',
      mode: request.mode
    })) as CollectedPage
  } catch {
    return { ok: false, code: 'E_COLLECT_FAILED', message: 'The page did not respond to the capture request.' }
  }

  if (!collected.text.trim()) {
    return {
      ok: false,
      code: 'E_EMPTY_CONTENT',
      message: request.mode === 'selection' ? 'Nothing is selected on this page.' : 'This page has no readable text.'
    }
  }

  const document = buildDocument(collected, request.mode)
  document.checksum = await computeDocumentChecksum({
    clipId: document.clipId,
    mode: document.mode,
    source: document.source,
    blocks: document.blocks,
    assets: []
  })

  const markdown = toMarkdown(document, {
    generatorName: GENERATOR_NAME,
    generatorVersion: GENERATOR_VERSION
  })

  const payload: HandoffPayload = {
    schema: HANDOFF_SCHEMA,
    protocolVersion: PROTOCOL_VERSION,
    clipId: document.clipId,
    createdAt: document.createdAt,
    source: document.source,
    document: { format: 'markdown', content: markdown },
    assets: [],
    generator: document.generator,
    checksum: await computeHandoffChecksum({
      clipId: document.clipId,
      document: { format: 'markdown', content: markdown },
      assets: []
    })
  }

  try {
    const url = buildInlineUrl(settings.targetScheme, payload)
    return {
      ok: true,
      url,
      channel: 'inline',
      mode: request.mode,
      title: document.source.title,
      clipId: document.clipId,
      markdown,
      bytes: markdown.length,
      urlLength: url.length
    }
  } catch (error) {
    if (error instanceof ProtocolError) {
      return {
        ok: true,
        url: buildWakeUrl(settings.targetScheme),
        channel: 'wake',
        mode: request.mode,
        title: document.source.title,
        clipId: document.clipId,
        markdown,
        bytes: markdown.length,
        urlLength: 0,
        fallbackReason:
          'This page is too large for the inline handoff channel. Save it as a file and import it in Graphock instead.'
      }
    }
    throw error
  }
}

async function openInApp(request: OpenRequest): Promise<void> {
  try {
    await chrome.tabs.create({ url: request.url })
  } catch {
    // The browser may refuse an external protocol without a user gesture.
  }
}

async function saveMarkdown(request: SaveRequest): Promise<{ ok: true; filename: string }> {
  const settings = await getSettings()
  const bytes = new TextEncoder().encode(request.markdown)
  if (bytes.byteLength > MAX_DOWNLOAD_BYTES) {
    throw new ProtocolError(
      'E_LIMIT_EXCEEDED',
      `Markdown is ${bytes.byteLength} bytes; the temporary download limit is ${MAX_DOWNLOAD_BYTES}.`
    )
  }
  const filename = buildFilename({
    date: new Date(),
    title: request.title,
    clipId: request.clipId,
    extension: 'md'
  })
  const subdirectory = settings.downloadSubdirectory.trim().replace(/^\/+|\/+$/gu, '')
  const dataUrl = `data:text/markdown;charset=utf-8,${encodeURIComponent(request.markdown)}`
  await new Promise<void>((resolve, reject) => {
    chrome.downloads.download(
      {
        url: dataUrl,
        filename: subdirectory ? `${subdirectory}/${filename}` : filename,
        saveAs: false
      },
      (downloadId) => {
        const error = chrome.runtime.lastError
        if (error || downloadId === undefined) reject(new Error(error?.message ?? 'Download failed'))
        else resolve()
      }
    )
  })
  return { ok: true, filename }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const type = (message as { type?: string } | undefined)?.type
  if (type === 'GRAPHOCK_CAPTURE') {
    capture(message as CaptureRequest).then(sendResponse, (error: unknown) =>
      sendResponse({
        ok: false,
        code: error instanceof ProtocolError ? error.code : 'E_INTERNAL',
        message: error instanceof Error ? error.message : 'Unexpected capture error'
      })
    )
    return true
  }
  if (type === 'GRAPHOCK_OPEN') {
    void openInApp(message as OpenRequest).then(() => sendResponse({ ok: true }))
    return true
  }
  if (type === 'GRAPHOCK_SAVE') {
    saveMarkdown(message as SaveRequest).then(
      (result) => sendResponse(result),
      (error: unknown) =>
        sendResponse({
          ok: false,
          code: error instanceof ProtocolError ? error.code : 'E_INTERNAL',
          message: error instanceof Error ? error.message : 'Unexpected save error'
        })
    )
    return true
  }
  return undefined
})
