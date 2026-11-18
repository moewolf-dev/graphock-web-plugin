import type { HandoffPayload } from '@graphock/clip-model'
import { buildFilename } from '@graphock/converters'
import {
  ProtocolError,
  buildFileUrl,
  buildWakeUrl
} from '@graphock/handoff'
import {
  DEFAULT_SETTINGS,
  type CaptureRequest,
  type CaptureResult,
  type CollectedPage,
  type OpenRequest,
  type SaveRequest,
  type Settings
} from '../shared/messages'
import { fetchImages } from '@graphock/capture/images'
import { TimeoutError, withTimeout } from './timeout'
import {
  buildClip,
  buildClipZip,
  inlineCssAssets,
  inlineHtmlImages,
  serializePayload,
  type BuildResult
} from './build'

const GENERATOR_NAME = 'graphock-web-plugin'
const GENERATOR_VERSION = '0.1.0'
const MAX_DOWNLOAD_BYTES = 2 * 1024 * 1024
const MAX_PACKAGE_BYTES = 12 * 1024 * 1024
const FILE_CHANNEL_UNAVAILABLE_SCHEMES = new Set(['graphock'])
const MAX_PAGE_SAVE_BYTES = 5 * 1024 * 1024
const HISTORY_KEY = 'history'
const MAX_HISTORY = 20

const lastBuilds = new Map<string, BuildResult>()

function rememberBuild(build: BuildResult): void {
  lastBuilds.set(build.document.clipId, build)
  while (lastBuilds.size > 3) {
    const oldest = lastBuilds.keys().next().value
    if (oldest) lastBuilds.delete(oldest)
  }
}

async function rememberHistory(build: BuildResult, channel: 'inline' | 'file' | 'wake'): Promise<void> {
  const stored = await chrome.storage.local.get(HISTORY_KEY)
  const history = Array.isArray(stored[HISTORY_KEY]) ? (stored[HISTORY_KEY] as unknown[]) : []
  const entry = {
    clipId: build.document.clipId,
    title: build.document.source.title,
    url: build.document.source.url,
    createdAt: build.document.createdAt,
    format: build.format,
    channel,
    bytes: build.content.length
  }
  const next = [entry, ...history.filter((item) => (item as { url?: string })?.url !== entry.url)]
  await chrome.storage.local.set({ [HISTORY_KEY]: next.slice(0, MAX_HISTORY) })
}

function hasDownloadsApi(): boolean {
  return typeof chrome.downloads?.download === 'function'
}

function hasOffscreenApi(): boolean {
  return typeof chrome.offscreen?.createDocument === 'function'
}

/** Safari fallback: hand the file to an extension page and let it download. */
async function saveViaPage(content: string, filename: string, mime: string): Promise<void> {
  const bytes = new TextEncoder().encode(content)
  if (bytes.byteLength > MAX_PAGE_SAVE_BYTES) {
    throw new ProtocolError(
      'E_LIMIT_EXCEEDED',
      `This browser cannot save files larger than ${MAX_PAGE_SAVE_BYTES / 1024 / 1024} MB. Try a smaller format.`
    )
  }
  const id = crypto.randomUUID()
  await chrome.storage.local.set({ [`graphock:save:${id}`]: { content, filename, mime } })
  await chrome.tabs.create({ url: chrome.runtime.getURL(`save.html?id=${id}`) })
}

async function getSettings(): Promise<Settings> {
  const stored = await chrome.storage.local.get('settings')
  return { ...DEFAULT_SETTINGS, ...(stored['settings'] as Partial<Settings> | undefined) }
}

function downloadSubdirectory(settings: Settings): string {
  return settings.downloadSubdirectory.trim().replace(/^\/+|\/+$/gu, '')
}

let creatingOffscreen: Promise<void> | null = null

/**
 * Ensure the offscreen download helper exists. Service workers cannot create
 * Blob URLs, and Chrome interrupts `data:` downloads, so all file writes go
 * through this document.
 */
async function ensureOffscreen(): Promise<void> {
  if (await chrome.offscreen.hasDocument()) return
  if (!creatingOffscreen) {
    creatingOffscreen = chrome.offscreen
      .createDocument({
        url: 'offscreen.html',
        reasons: [chrome.offscreen.Reason.BLOBS ?? 'BLOBS'],
        justification: 'Create a blob URL to download the captured page or clip package.'
      })
      .finally(() => {
        creatingOffscreen = null
      })
  }
  await creatingOffscreen
}

function download(options: chrome.downloads.DownloadOptions): Promise<number> {
  return new Promise((resolve, reject) => {
    chrome.downloads.download(options, (downloadId) => {
      const error = chrome.runtime.lastError
      if (error || downloadId === undefined) reject(new Error(error?.message ?? 'Download failed'))
      else resolve(downloadId)
    })
  })
}

async function downloadText(
  content: string,
  filename: string,
  mime: string
): Promise<{ id: number }> {
  if (!hasDownloadsApi() || !hasOffscreenApi()) {
    await saveViaPage(content, filename, mime)
    return { id: -1 }
  }
  await ensureOffscreen()
  const created = (await chrome.runtime.sendMessage({
    type: 'GRAPHOCK_OFFSCREEN_CREATE',
    content,
    mime
  })) as { ok?: boolean; url?: string; message?: string } | undefined
  if (!created?.ok || !created.url) {
    throw new ProtocolError(
      'E_DOWNLOAD_FAILED',
      created?.message ?? 'The offscreen helper did not create a download blob'
    )
  }
  try {
    const id = await download({ url: created.url, filename, saveAs: false })
    return { id }
  } catch (error) {
    await chrome.runtime.sendMessage({ type: 'GRAPHOCK_OFFSCREEN_REVOKE', url: created.url })
    throw new ProtocolError(
      'E_DOWNLOAD_FAILED',
      error instanceof Error ? error.message : 'Download failed'
    )
  }
}

async function waitForDownload(id: number): Promise<chrome.downloads.DownloadItem> {
  const deadline = Date.now() + 15_000
  while (Date.now() < deadline) {
    const [item] = await chrome.downloads.search({ id })
    if (item?.state === 'complete') return item
    if (item?.state === 'interrupted') {
      throw new ProtocolError('E_DOWNLOAD_INTERRUPTED', `Download was interrupted: ${item.error ?? 'unknown'}`)
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 150))
  }
  throw new ProtocolError('E_DOWNLOAD_TIMEOUT', 'Timed out waiting for the clip package to be written')
}

async function savePackage(
  payload: HandoffPayload,
  title: string,
  clipId: string,
  settings: Settings
): Promise<{ path: string; filename: string }> {
  if (!hasDownloadsApi()) {
    throw new ProtocolError(
      'E_CHANNEL_UNAVAILABLE',
      'This browser cannot hand a package file to the app. Use “Save file” instead.'
    )
  }
  const json = serializePayload(payload)
  const bytes = new TextEncoder().encode(json)
  if (bytes.byteLength > MAX_PACKAGE_BYTES) {
    throw new ProtocolError(
      'E_PACKAGE_TOO_LARGE',
      `Clip package is ${Math.round(bytes.byteLength / 1024)} KB; the current limit is ${MAX_PACKAGE_BYTES / 1024 / 1024} MB.`
    )
  }
  const filename = buildFilename({
    date: new Date(),
    title,
    clipId,
    extension: 'graphock-clip.json'
  })
  const subdirectory = downloadSubdirectory(settings)
  const { id } = await downloadText(
    json,
    subdirectory ? `${subdirectory}/${filename}` : filename,
    'application/json'
  )
  const item = await waitForDownload(id)
  return { path: item.filename, filename }
}

async function capture(request: CaptureRequest): Promise<CaptureResult> {
  const settings = await getSettings()
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id) {
    return { ok: false, code: 'E_NO_ACTIVE_TAB', message: 'No active tab is available.' }
  }

  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] })
  } catch (error) {
    return {
      ok: false,
      code: 'E_INJECTION_FAILED',
      message:
        'This page does not allow content scripts (browser pages and the Web Store do not). ' +
        `[${error instanceof Error ? error.message : 'unknown error'}]`
    }
  }

  let collected: CollectedPage
  try {
    collected = (await withTimeout(
      chrome.tabs.sendMessage(tab.id, {
        type: 'GRAPHOCK_COLLECT',
        mode: request.mode
      }) as Promise<CollectedPage>,
      20_000,
      'The page took too long to capture.'
    )) as CollectedPage
  } catch (error) {
    if (error instanceof TimeoutError) {
      return {
        ok: false,
        code: error.code,
        message: 'This page took more than 20 seconds to capture. Try “Readable” or “Selection”.'
      }
    }
    return {
      ok: false,
      code: 'E_COLLECT_FAILED',
      message: 'The page did not respond to the capture request.'
    }
  }

  if (settings.imagePolicy !== 'skip' && collected.images.length > 0) {
    collected.images = await fetchImages(collected.images)
  }

  if (collected.blocks.length === 0 && !collected.text.trim()) {
    return {
      ok: false,
      code: 'E_EMPTY_CONTENT',
      message:
        request.mode === 'selection'
          ? 'Nothing is selected on this page.'
          : 'This page has no readable text.'
    }
  }

  const format = request.format ?? settings.defaultFormat
  let htmlSnapshot = collected.html
  if (format === 'html' && request.mode === 'full' && htmlSnapshot) {
    htmlSnapshot = await inlineCssAssets(inlineHtmlImages(htmlSnapshot, collected.images))
  }
  const options = {
    mode: request.mode,
    imagePolicy: settings.imagePolicy,
    scheme: settings.targetScheme,
    format,
    ...(format === 'html' && request.mode === 'full' && htmlSnapshot ? { htmlSnapshot } : {}),
    generator: { name: GENERATOR_NAME, version: GENERATOR_VERSION, browser: navigator.userAgent }
  }

  let built: BuildResult = await buildClip(collected, options)

  const canUseFileChannel = hasDownloadsApi() && !FILE_CHANNEL_UNAVAILABLE_SCHEMES.has(settings.targetScheme)

  // Embedded images rarely fit in a 24k-character URL. When the target build
  // can read a file, save the package and pass its path; MAS cannot, so it
  // degrades to linked images instead of pretending the images were included.
  if (!built.inlineUrl && !canUseFileChannel) {
    built = await buildClip(collected, { ...options, imagePolicy: 'link' })
  }

  const imagePermissionGranted =
    settings.imagePolicy === 'skip' ? true : await chrome.permissions.contains({ origins: ['<all_urls>'] })

  const base = {
    ok: true as const,
    mode: request.mode,
    title: built.document.source.title,
    clipId: built.document.clipId,
    markdown: built.markdown,
    format: built.format,
    content: built.content,
    bytes: built.content.length,
    assetCount: built.stats.assetCount,
    embeddedAssets: built.stats.embedded,
    linkedAssets: built.stats.linked,
    failedAssets: built.stats.failed,
    skippedAssets: built.stats.skipped,
    canRequestImageAccess: built.stats.failed > 0 && !imagePermissionGranted
  }

  if (built.inlineUrl) {
    rememberBuild(built)
    await rememberHistory(built, 'inline')
    return {
      ...base,
      url: built.inlineUrl,
      channel: 'inline',
      urlLength: built.inlineUrl.length
    }
  }

  if (canUseFileChannel) {
    try {
      const saved = await savePackage(built.payload, base.title, base.clipId, settings)
      const url = buildFileUrl(settings.targetScheme, saved.path, base.clipId)
      rememberBuild(built)
      await rememberHistory(built, 'file')
      return {
        ...base,
        url,
        channel: 'file',
        urlLength: url.length,
        savedFilename: saved.filename
      }
    } catch (error) {
      return {
        ok: false,
        code: error instanceof ProtocolError ? error.code : 'E_PACKAGE_FAILED',
        message: error instanceof Error ? error.message : 'Could not save the clip package'
      }
    }
  }

  rememberBuild(built)
  await rememberHistory(built, 'wake')
  return {
    ...base,
    url: buildWakeUrl(settings.targetScheme),
    channel: 'wake',
    urlLength: 0,
    fallbackReason:
      'This clip is too large for an import link and the Mac App Store build cannot read downloads. Use “Save file” instead.'
  }
}

async function openInApp(request: OpenRequest): Promise<void> {
  try {
    await chrome.tabs.create({ url: request.url })
  } catch {
    // The browser may refuse an external protocol without a user gesture.
  }
}

const FORMAT_META: Record<SaveRequest['format'], { extension: string; mime: string }> = {
  markdown: { extension: 'md', mime: 'text/markdown' },
  html: { extension: 'html', mime: 'text/html' },
  json: { extension: 'json', mime: 'application/json' },
  yaml: { extension: 'yaml', mime: 'application/yaml' }
}

async function downloadBytes(
  bytes: Uint8Array,
  filename: string,
  mime: string
): Promise<{ id: number }> {
  let base64 = ''
  const chunk = 0x8000
  for (let index = 0; index < bytes.length; index += chunk) {
    base64 += String.fromCharCode(...bytes.subarray(index, index + chunk))
  }
  const encoded = btoa(base64)
  if (!hasDownloadsApi() || !hasOffscreenApi()) {
    throw new ProtocolError(
      'E_CHANNEL_UNAVAILABLE',
      'This browser cannot save zip archives. Save a single file instead.'
    )
  }
  await ensureOffscreen()
  const created = (await chrome.runtime.sendMessage({
    type: 'GRAPHOCK_OFFSCREEN_CREATE',
    base64: encoded,
    mime
  })) as { ok?: boolean; url?: string; message?: string } | undefined
  if (!created?.ok || !created.url) {
    throw new ProtocolError('E_DOWNLOAD_FAILED', created?.message ?? 'Could not create the archive blob')
  }
  try {
    return { id: await download({ url: created.url, filename, saveAs: false }) }
  } catch (error) {
    await chrome.runtime.sendMessage({ type: 'GRAPHOCK_OFFSCREEN_REVOKE', url: created.url })
    throw new ProtocolError('E_DOWNLOAD_FAILED', error instanceof Error ? error.message : 'Download failed')
  }
}

async function saveContent(request: SaveRequest): Promise<{ ok: true; filename: string }> {
  const settings = await getSettings()
  const subdirectory = downloadSubdirectory(settings)
  const build = lastBuilds.get(request.clipId)

  if (request.withAssets && build && build.payload.assets.length > 0 && request.format !== 'html') {
    const zip = buildClipZip(build)
    const filename = buildFilename({
      date: new Date(),
      title: request.title,
      clipId: request.clipId,
      extension: 'zip'
    })
    const { id } = await downloadBytes(
      zip,
      subdirectory ? `${subdirectory}/${filename}` : filename,
      'application/zip'
    )
    await waitForDownload(id)
    return { ok: true, filename }
  }

  const meta = FORMAT_META[request.format] ?? FORMAT_META.markdown
  const bytes = new TextEncoder().encode(request.content)
  if (bytes.byteLength > MAX_DOWNLOAD_BYTES) {
    throw new ProtocolError(
      'E_LIMIT_EXCEEDED',
      `The export is ${bytes.byteLength} bytes; the temporary download limit is ${MAX_DOWNLOAD_BYTES}. Use “Open in Graphock” or a smaller format.`
    )
  }
  const filename = buildFilename({
    date: new Date(),
    title: request.title,
    clipId: request.clipId,
    extension: meta.extension
  })
  const { id } = await downloadText(
    request.content,
    subdirectory ? `${subdirectory}/${filename}` : filename,
    meta.mime
  )
  if (id >= 0) await waitForDownload(id)
  return { ok: true, filename }
}

const MENU_PAGE = 'graphock-clip-page'
const MENU_SELECTION = 'graphock-clip-selection'

function createMenus(): void {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_PAGE,
      title: 'Clip page to Graphock',
      contexts: ['page']
    })
    chrome.contextMenus.create({
      id: MENU_SELECTION,
      title: 'Clip selection to Graphock',
      contexts: ['selection']
    })
  })
}

chrome.runtime.onInstalled.addListener(createMenus)
chrome.runtime.onStartup.addListener(createMenus)

async function quickClip(mode: CaptureRequest['mode']): Promise<void> {
  const result = await capture({ type: 'GRAPHOCK_CAPTURE', mode })
  if (!result.ok) {
    await chrome.action.setBadgeBackgroundColor({ color: '#b42318' })
    await chrome.action.setBadgeText({ text: '!' })
    setTimeout(() => {
      void chrome.action.setBadgeText({ text: '' })
    }, 5_000)
    return
  }
  await chrome.action.setBadgeText({ text: '' })
  try {
    await chrome.tabs.create({ url: result.url })
  } catch {
    // The browser may block the external protocol; the popup offers a copy path.
  }
}

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId === MENU_PAGE) void quickClip('readable')
  else if (info.menuItemId === MENU_SELECTION) void quickClip('selection')
})

chrome.commands.onCommand.addListener((command) => {
  if (command === 'clip-page') void quickClip('readable')
  else if (command === 'clip-selection') void quickClip('selection')
})

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
    saveContent(message as SaveRequest).then(
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
