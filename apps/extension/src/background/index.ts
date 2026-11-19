import type { HandoffPayload } from '@graphock/clip-model'
import { buildFilename } from '@graphock/converters'
import {
  MAX_FILE_PAYLOAD_BYTES,
  ProtocolError,
  assertLimits,
  buildFileUrl,
  buildWakeUrl
} from '@graphock/handoff'
import { fetchImages } from '@graphock/capture/images'
import {
  DEFAULT_SETTINGS,
  type CancelRequest,
  type Capabilities,
  type CaptureRequest,
  type CaptureResult,
  type CollectedPage,
  type DeliverRequest,
  type DeliverResult,
  type SaveRequest,
  type Settings
} from '../shared/messages'
import { TimeoutError, withTimeout } from './timeout'
import { createLogger, type LogEntry } from '../shared/logger'
import {
  buildClip,
  buildClipZip,
  prepareHtmlSnapshot,
  serializePayload,
  type BuildResult
} from './build'

const GENERATOR_NAME = 'graphock-web-plugin'
const GENERATOR_VERSION = '0.1.0'
const MAX_DOWNLOAD_BYTES = 2 * 1024 * 1024
const MAX_PACKAGE_BYTES = MAX_FILE_PAYLOAD_BYTES
const FILE_CHANNEL_UNAVAILABLE_SCHEMES = new Set(['graphock'])
const MAX_PAGE_SAVE_BYTES = 5 * 1024 * 1024
const HISTORY_KEY = 'history'
const MAX_HISTORY = 20
const PREPARED_TTL_MS = 10 * 60 * 1000
const MAX_PREPARED = 5
const CAPTURE_DEADLINE_MS = 45_000
const COLLECT_TIMEOUT_MS = 30_000

type Prepared = {
  build: BuildResult
  settings: Settings
  canUseFileChannel: boolean
  inlineUrl?: string
  createdAt: number
  delivered?: DeliverResult
}

const prepared = new Map<string, Prepared>()
const activeCaptures = new Map<string, AbortController>()

const log = createLogger('background')
const logRing: LogEntry[] = []
let persistTimer: ReturnType<typeof setTimeout> | null = null

function record(entry: LogEntry): void {
  logRing.push(entry)
  if (logRing.length > 300) logRing.shift()
  if (entry.level === 'warn' || entry.level === 'error') {
    if (persistTimer) clearTimeout(persistTimer)
    persistTimer = setTimeout(() => {
      const failures = logRing.filter((item) => item.level === 'warn' || item.level === 'error').slice(-100)
      void chrome.storage.local.set({ debugLogs: failures })
    }, 800)
  }
}

function logInfo(event: string, data?: Record<string, unknown>, extra?: { requestId?: string; durationMs?: number }): void {
  record(log.info(event, data, extra))
}
function logError(event: string, data?: Record<string, unknown>, extra?: { requestId?: string; durationMs?: number }): void {
  record(log.error(event, data, extra))
}

function rememberPrepared(record: Prepared): void {
  prepared.set(record.build.document.clipId, record)
  const now = Date.now()
  for (const [id, entry] of prepared) {
    if (now - entry.createdAt > PREPARED_TTL_MS) prepared.delete(id)
  }
  while (prepared.size > MAX_PREPARED) {
    const oldest = prepared.keys().next().value
    if (oldest) prepared.delete(oldest)
  }
}

function requirePrepared(clipId: string): Prepared {
  const record = prepared.get(clipId)
  if (!record || Date.now() - record.createdAt > PREPARED_TTL_MS) {
    prepared.delete(clipId)
    throw new ProtocolError(
      'E_BUILD_EXPIRED',
      'This clip preview has expired. Capture the page again before saving or opening it.'
    )
  }
  return record
}

function abortError(signal: AbortSignal): ProtocolError {
  return signal.reason === 'timeout'
    ? new ProtocolError('E_CAPTURE_TIMEOUT', 'Capture exceeded its 25 second deadline')
    : new ProtocolError('E_CAPTURE_CANCELLED', 'Capture was cancelled')
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw abortError(signal)
}

/** Reject as soon as the capture is cancelled, even if the wrapped call hangs. */
function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) {
    return Promise.reject(abortError(signal))
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(abortError(signal))
    signal.addEventListener('abort', onAbort, { once: true })
    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort)
        resolve(value)
      },
      (error) => {
        signal.removeEventListener('abort', onAbort)
        reject(error)
      }
    )
  })
}

async function rememberHistory(
  build: BuildResult,
  channel: 'inline' | 'file' | 'wake'
): Promise<void> {
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

function canUseFileChannel(settings: Settings): boolean {
  return hasDownloadsApi() && !FILE_CHANNEL_UNAVAILABLE_SCHEMES.has(settings.targetScheme)
}

function capabilities(settings: Settings): Capabilities {
  const downloads = hasDownloadsApi()
  return {
    downloads,
    offscreen: hasOffscreenApi(),
    zip: downloads && hasOffscreenApi(),
    fileChannel: canUseFileChannel(settings)
  }
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
    return { id: await download({ url: created.url, filename, saveAs: false }) }
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
      throw new ProtocolError(
        'E_DOWNLOAD_INTERRUPTED',
        `Download was interrupted: ${item.error ?? 'unknown'}`
      )
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
  // Validate with the same rules the receiver applies to the file channel.
  try {
    assertLimits(payload, 'file')
  } catch (error) {
    if (error instanceof ProtocolError) throw error
    throw new ProtocolError('E_SCHEMA_INVALID', 'Clip package failed validation')
  }
  const json = serializePayload(payload)
  const bytes = new TextEncoder().encode(json)
  if (bytes.byteLength > MAX_PACKAGE_BYTES) {
    throw new ProtocolError(
      'E_PACKAGE_TOO_LARGE',
      `Clip package is ${Math.round(bytes.byteLength / 1024)} KB; the limit is ${MAX_PACKAGE_BYTES / 1024 / 1024} MB.`
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
  const requestId = request.requestId || crypto.randomUUID()
  const controller = new AbortController()
  activeCaptures.set(requestId, controller)
  const started = performance.now()
  let stage = 'init'
  const deadline = setTimeout(() => controller.abort('timeout'), CAPTURE_DEADLINE_MS)
  logInfo('capture-start', { mode: request.mode, format: request.format }, { requestId })

  try {
    const settings = await getSettings()
    const signal = controller.signal
    throwIfAborted(signal)
    stage = 'tab'

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
    throwIfAborted(signal)
    stage = 'collect'

    let collected: CollectedPage
    try {
      collected = await abortable(
        withTimeout(
          chrome.tabs.sendMessage(tab.id, {
            type: 'GRAPHOCK_COLLECT',
            mode: request.mode,
            imagePolicy: settings.imagePolicy
          }) as Promise<CollectedPage>,
          COLLECT_TIMEOUT_MS,
          'The page took too long to capture.'
        ),
        signal
      )
      logInfo('collect', {
        blocks: collected.blocks.length,
        images: collected.images.length,
        nodes: collected.nodeCount,
        readable: collected.readable,
        timings: collected.timings
      }, { requestId, durationMs: performance.now() - started })
    } catch (error) {
      if (error instanceof ProtocolError) throw error
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

    throwIfAborted(signal)

    if (collected.tooLarge) {
      return {
        ok: false,
        code: 'E_TOO_LARGE',
        message: 'This page is too large to capture safely. Try “Selection” or a simpler page.'
      }
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
    const rawHtml = collected.html
    const canUseFile = canUseFileChannel(settings)

    // Only the embed policy downloads image bytes. Link and text-only modes
    // never fetch images, so a policy change cannot leak network requests.
    if (settings.imagePolicy === 'embed' && collected.images.length > 0) {
      stage = 'images'
      const imageStart = performance.now()
      // Images are best-effort: give the whole phase a budget and continue with
      // whatever arrived instead of failing the clip on one slow host.
      const imageBudget = new AbortController()
      const imageTimer = setTimeout(() => imageBudget.abort('images-timeout'), 15_000)
      const AnySignal = (AbortSignal as unknown as { any?: (signals: AbortSignal[]) => AbortSignal }).any
      const imageSignal = AnySignal ? AnySignal([signal, imageBudget.signal]) : signal
      try {
        collected.images = await fetchImages(collected.images, {
          signal: imageSignal,
          concurrency: 6,
          timeoutMs: 6_000
        })
      } finally {
        clearTimeout(imageTimer)
      }
      const fetched = collected.images.filter((item) => item.status === 'fetched').length
      const failed = collected.images.filter((item) => item.status === 'failed').length
      logInfo('images', { total: collected.images.length, fetched, failed }, {
        requestId,
        durationMs: performance.now() - imageStart
      })
    }
    throwIfAborted(signal)

    const snapshotFor = async (policy: Settings['imagePolicy']): Promise<string | undefined> => {
      if (format !== 'html' || request.mode !== 'full' || !rawHtml) return undefined
      return prepareHtmlSnapshot(rawHtml, policy, collected.images, { signal })
    }

    stage = 'snapshot'
    let policy = settings.imagePolicy
    const snapshotStart = performance.now()
    let htmlSnapshot = await snapshotFor(policy)
    if (htmlSnapshot) {
      logInfo('snapshot', { bytes: htmlSnapshot.length, policy }, {
        requestId,
        durationMs: performance.now() - snapshotStart
      })
    }
    throwIfAborted(signal)

    const baseOptions = {
      mode: request.mode,
      scheme: settings.targetScheme,
      format,
      generator: { name: GENERATOR_NAME, version: GENERATOR_VERSION, browser: navigator.userAgent }
    }

    stage = 'build'
    const buildStart = performance.now()
    let built = await buildClip(collected, {
      ...baseOptions,
      imagePolicy: policy,
      ...(htmlSnapshot ? { htmlSnapshot } : {})
    })
    logInfo('build', {
      format: built.format,
      blocks: built.document.blocks.length,
      assets: built.stats,
      inline: Boolean(built.inlineUrl)
    }, { requestId, durationMs: performance.now() - buildStart })
    throwIfAborted(signal)

    // Embedded images rarely fit in a 24k-character URL. When the target build
    // cannot read files, degrade to links and regenerate the HTML snapshot so
    // the delivered artefact matches the policy instead of reusing embed bytes.
    if (!built.inlineUrl && !canUseFile) {
      policy = 'link'
      htmlSnapshot = await snapshotFor('link')
      built = await buildClip(collected, {
        ...baseOptions,
        imagePolicy: 'link',
        ...(htmlSnapshot ? { htmlSnapshot } : {})
      })
      throwIfAborted(signal)
    }

    const imagePermissionGranted =
      settings.imagePolicy === 'skip'
        ? true
        : await chrome.permissions.contains({ origins: ['<all_urls>'] })

    rememberPrepared({
      build: built,
      settings,
      canUseFileChannel: canUseFile,
      ...(built.inlineUrl ? { inlineUrl: built.inlineUrl } : {}),
      createdAt: Date.now()
    })

    return {
      ok: true,
      requestId,
      ...(built.inlineUrl ? { url: built.inlineUrl } : {}),
      channel: built.inlineUrl ? 'inline' : canUseFile ? 'file-ready' : 'wake',
      mode: request.mode,
      title: built.document.source.title,
      clipId: built.document.clipId,
      markdown: built.markdown,
      format: built.format,
      content: built.content,
      bytes: built.content.length,
      ...(built.inlineUrl ? { urlLength: built.inlineUrl.length } : {}),
      assetCount: built.stats.assetCount,
      embeddedAssets: built.stats.embedded,
      linkedAssets: built.stats.linked,
      failedAssets: built.stats.failed,
      skippedAssets: built.stats.skipped,
      canRequestImageAccess: built.stats.failed > 0 && !imagePermissionGranted,
      canSaveZip: capabilities(settings).zip && built.stats.embedded > 0 && built.format !== 'html',
      ...(!built.inlineUrl && !canUseFile
        ? {
            fallbackReason:
              'This clip is too large for an import link and this build cannot read downloads. Images were linked; use “Save file” or grant image access.'
          }
        : {})
    }
  } catch (error) {
    const code = error instanceof ProtocolError ? error.code : 'E_INTERNAL'
    const message =
      error instanceof ProtocolError && error.code === 'E_CAPTURE_TIMEOUT'
        ? `Capture exceeded ${CAPTURE_DEADLINE_MS / 1000}s while ${stage === 'collect' ? 'reading the page' : stage === 'images' ? 'loading images' : stage === 'snapshot' ? 'building the HTML snapshot' : stage === 'build' ? 'building the clip' : 'starting'}. Try “Readable” or “Selection”.`
        : error instanceof Error
          ? error.message
          : 'Unexpected capture error'
    logError('capture-failed', { stage, code, message }, {
      requestId,
      durationMs: performance.now() - started
    })
    return { ok: false, code, message }
  } finally {
    clearTimeout(deadline)
    activeCaptures.delete(requestId)
  }
}

async function deliver(request: DeliverRequest): Promise<DeliverResult> {
  const started = performance.now()
  logInfo('deliver-start', { clipId: request.clipId })
  let record: Prepared
  try {
    record = requirePrepared(request.clipId)
  } catch (error) {
    return {
      ok: false,
      code: error instanceof ProtocolError ? error.code : 'E_BUILD_EXPIRED',
      message: error instanceof Error ? error.message : 'Clip preview expired'
    }
  }
  if (record.delivered) return record.delivered

  const build = record.build
  try {
    if (record.inlineUrl) {
      await rememberHistory(build, 'inline')
      record.delivered = { ok: true, url: record.inlineUrl, channel: 'inline' }
      logInfo('deliver-ok', { channel: 'inline' }, { durationMs: performance.now() - started })
      return record.delivered
    }

    if (record.canUseFileChannel) {
      const saved = await savePackage(
        build.payload,
        build.document.source.title,
        build.document.clipId,
        record.settings
      )
      const url = buildFileUrl(record.settings.targetScheme, saved.path, build.document.clipId)
      await rememberHistory(build, 'file')
      record.delivered = {
        ok: true,
        url,
        channel: 'file',
        savedFilename: saved.filename,
        savedPath: saved.path
      }
      logInfo('deliver-ok', { channel: 'file', filename: saved.filename }, {
        durationMs: performance.now() - started
      })
      return record.delivered
    }

    const url = buildWakeUrl(record.settings.targetScheme)
    await rememberHistory(build, 'wake')
    record.delivered = {
      ok: true,
      url,
      channel: 'wake',
      fallbackReason:
        'Graphock opened. Choose “Import file” in the app to bring this page in.'
    }
    logInfo('deliver-ok', { channel: 'wake' }, { durationMs: performance.now() - started })
    return record.delivered
  } catch (error) {
    logError('deliver-failed', {
      code: error instanceof ProtocolError ? error.code : 'E_DELIVERY_FAILED',
      message: error instanceof Error ? error.message : 'unknown'
    }, { durationMs: performance.now() - started })
    return {
      ok: false,
      code: error instanceof ProtocolError ? error.code : 'E_DELIVERY_FAILED',
      message: error instanceof Error ? error.message : 'Could not deliver the clip'
    }
  }
}

const FORMAT_META: Record<SaveRequest['format'], { extension: string; mime: string }> = {
  markdown: { extension: 'md', mime: 'text/markdown' },
  html: { extension: 'html', mime: 'text/html' },
  json: { extension: 'json', mime: 'application/json' },
  yaml: { extension: 'yaml', mime: 'application/yaml' },
  txt: { extension: 'txt', mime: 'text/plain' }
}

async function downloadBytes(
  bytes: Uint8Array,
  filename: string,
  mime: string
): Promise<{ id: number }> {
  let binary = ''
  const chunk = 0x8000
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk))
  }
  const encoded = btoa(binary)
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
  const started = performance.now()
  const subdirectory = downloadSubdirectory(settings)
  const build = prepared.get(request.clipId)

  if (request.withAssets) {
    if (!build || Date.now() - build.createdAt > PREPARED_TTL_MS) {
      prepared.delete(request.clipId)
      throw new ProtocolError(
        'E_BUILD_EXPIRED',
        'The clip preview has expired. Capture the page again to save a zip with assets.'
      )
    }
    if (build.build.payload.assets.length === 0) {
      throw new ProtocolError('E_NO_ASSETS', 'This clip has no embedded assets to zip.')
    }
    const zip = buildClipZip(build.build)
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
    logInfo('save-zip', { filename }, { durationMs: performance.now() - started })
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
  logInfo('save-file', { filename, format: request.format }, { durationMs: performance.now() - started })
  return { ok: true, filename }
}

const MENU_PAGE = 'graphock-clip-page'
const MENU_SELECTION = 'graphock-clip-selection'

function createMenus(): void {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: MENU_PAGE, title: 'Clip page to Graphock', contexts: ['page'] })
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
  const requestId = crypto.randomUUID()
  const result = await capture({ type: 'GRAPHOCK_CAPTURE', mode, requestId })
  if (!result.ok) {
    await chrome.action.setBadgeBackgroundColor({ color: '#b42318' })
    await chrome.action.setBadgeText({ text: '!' })
    setTimeout(() => {
      void chrome.action.setBadgeText({ text: '' })
    }, 5_000)
    return
  }
  const delivered = await deliver({ type: 'GRAPHOCK_DELIVER', clipId: result.clipId })
  if (!delivered.ok) {
    await chrome.action.setBadgeBackgroundColor({ color: '#b42318' })
    await chrome.action.setBadgeText({ text: '!' })
    return
  }
  await chrome.action.setBadgeText({ text: '' })
  try {
    await chrome.tabs.create({ url: delivered.url })
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
    capture(message as CaptureRequest).then(sendResponse)
    return true
  }
  if (type === 'GRAPHOCK_CANCEL') {
    const request = message as CancelRequest
    activeCaptures.get(request.requestId)?.abort('cancelled')
    sendResponse({ ok: true })
    return true
  }
  if (type === 'GRAPHOCK_DELIVER') {
    deliver(message as DeliverRequest).then(sendResponse)
    return true
  }
  if (type === 'GRAPHOCK_CAPABILITIES') {
    void getSettings().then((settings) => sendResponse(capabilities(settings)))
    return true
  }
  if (type === 'GRAPHOCK_LOGS') {
    void chrome.storage.local.get('debugLogs').then((stored) => {
      sendResponse({
        entries: logRing.slice(-200),
        persisted: Array.isArray(stored.debugLogs) ? stored.debugLogs : [],
        manifest: {
          version: chrome.runtime.getManifest().version,
          permissions: chrome.runtime.getManifest().permissions ?? []
        },
        userAgent: navigator.userAgent
      })
    })
    return true
  }
  if (type === 'GRAPHOCK_CLEAR_LOGS') {
    logRing.length = 0
    void chrome.storage.local.remove('debugLogs')
    sendResponse({ ok: true })
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
