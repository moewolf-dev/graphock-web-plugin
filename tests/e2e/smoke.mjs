#!/usr/bin/env node
/**
 * Extension smoke test (Q-03, first slice).
 *
 * What it proves:
 *  - the built MV3 directory loads in a real Chrome;
 *  - the background service worker registers;
 *  - popup.html and options.html render without page errors;
 *  - the manifest exposes only the expected permissions.
 *
 * What it does not prove (needs the action-click gesture or a privileged harness):
 *  - a full capture from a live tab. That lands with the Playwright suite.
 *
 * Usage: pnpm test:e2e
 */
import { execFileSync } from 'node:child_process'
import { strFromU8, unzipSync } from 'fflate'
import { randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { chromium } from 'playwright-core'

const require = createRequire(import.meta.url)
void require

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const extensionPath = join(
  root,
  process.env.E2E_HOST_PERMISSION === '1' ? 'apps/extension/dist/e2e' : 'apps/extension/dist/chrome'
)

function fail(message) {
  console.error(`e2e:smoke: ${message}`)
  process.exitCode = 1
}

/**
 * Branded Chrome 137+ ignores --load-extension. Prefer an explicit CHROME_PATH,
 * then a Playwright-managed Chrome for Testing build, and only then system Chrome.
 */
async function findChrome() {
  if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH

  // Prefer the exact revision playwright-core expects (installed by CI).
  try {
    const bundled = chromium.executablePath()
    if (bundled && existsSync(bundled)) return bundled
  } catch {
    // Fall through to cache scanning.
  }

  for (const cache of [
    join(homedir(), 'Library/Caches/ms-playwright'),
    join(homedir(), '.cache/ms-playwright')
  ]) {
    try {
      const builds = (await readdir(cache))
        .filter((name) => name.startsWith('chromium-'))
        .sort()
        .reverse()
      for (const build of builds) {
        for (const arch of ['chrome-mac-arm64', 'chrome-mac-x64', 'chrome-mac']) {
          const candidate = join(
            cache,
            build,
            arch,
            'Google Chrome for Testing.app',
            'Contents',
            'MacOS',
            'Google Chrome for Testing'
          )
          if (existsSync(candidate)) return candidate
        }
      }
    } catch {
      // Try the next cache location.
    }
  }
  return undefined
}

const hits = { image: 0, background: 0, font: 0 }
let slowImage = false

async function serve() {
  // 1x1 transparent PNG.
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64'
  )
  const big = Buffer.alloc(220_000)
  for (let index = 0; index < big.length; index += 1) big[index] = (index * 31) % 256
  const server = createServer((request, response) => {
    if (request.url === '/big.png') {
      response.writeHead(200, { 'content-type': 'image/png', 'content-length': big.length })
      response.end(big)
      return
    }
    if (request.url === '/big') {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      response.end(`<!doctype html><html><head><title>Big clip</title></head><body>
        <main><h1>Big clip</h1><p>This page carries a large image so the inline channel cannot hold it.</p>
        <img src="/big.png" alt="Large"></main></body></html>`)
      return
    }
    if (request.url === '/slow.png') {
      slowImage = true
      setTimeout(() => {
        response.writeHead(200, { 'content-type': 'image/png', 'content-length': png.length })
        response.end(png)
      }, 2_000)
      return
    }
    if (request.url === '/slow') {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      response.end(`<!doctype html><html><head><title>Slow clip</title></head><body>
        <main><h1>Slow clip</h1><p>This page loads an image slowly so the capture can be cancelled.</p>
        <img src="/slow.png" alt="Slow"></main></body></html>`)
      return
    }
    if (request.url === '/bg.png') {
      hits.background += 1
      response.writeHead(200, { 'content-type': 'image/png', 'content-length': png.length })
      response.end(png)
      return
    }
    if (request.url === '/font.woff2') {
      hits.font += 1
      const font = Buffer.alloc(2048, 9)
      response.writeHead(200, { 'content-type': 'font/woff2', 'content-length': font.length })
      response.end(font)
      return
    }
    if (request.url === '/style.css') {
      response.writeHead(200, { 'content-type': 'text/css' })
      response.end(
        'body { color: rgb(18, 52, 86); } .marker { border-left: 3px solid teal; }' +
          '@font-face { font-family: E2E; src: url("/font.woff2") format("woff2"); }' +
          'body { background-image: url("/bg.png"); font-family: E2E, sans-serif; }'
      )
      return
    }
    if (request.url === '/img.png') {
      hits.image += 1
      response.writeHead(200, { 'content-type': 'image/png', 'content-length': png.length })
      response.end(png)
      return
    }
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    response.end(`<!doctype html><html lang="en"><head>
      <title>Graphock smoke page</title>
      <meta property="og:title" content="Smoke page title">
      <meta name="author" content="E2E">
      <link rel="stylesheet" href="/style.css">
      <style>.inline-marker { padding: 4px; }</style>
    </head><body><main><h1>Smoke page</h1>
      <p>Hello from the local test server. This page is long enough to exercise the capture pipeline and image collection path.</p>
      <figure><img src="/img.png" alt="Pixel" width="1" height="1"><figcaption>A pixel</figcaption></figure>
    </main></body></html>`)
  })
  await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen))
  const address = server.address()
  return { server, url: `http://127.0.0.1:${address.port}/` }
}

async function main() {
  const shippedManifest = JSON.parse(
    await readFile(join(root, 'apps/extension/dist/chrome/manifest.json'), 'utf8')
  )
  const snapshot = JSON.parse(
    await readFile(join(root, 'tooling/package/permissions.snapshot.json'), 'utf8')
  )
  if (JSON.stringify(shippedManifest.permissions) !== JSON.stringify(snapshot.permissions)) {
    fail(`unexpected permissions: ${JSON.stringify(shippedManifest.permissions)}`)
  }
  if ((shippedManifest.host_permissions ?? []).length > 0) {
    fail('host_permissions must stay empty in the shipped build')
  }

  const userDataDir = await mkdtemp(join(tmpdir(), 'graphock-e2e-'))
  const { server, url } = await serve()
  const executablePath = await findChrome()
  if (!executablePath) {
    server.close()
    fail('No Chrome for Testing build found. Set CHROME_PATH to a Chromium/Chrome for Testing binary.')
    return
  }

  const context = await chromium.launchPersistentContext(userDataDir, {
    executablePath,
    // Chrome for Testing supports extensions in new headless mode. Set
    // HEADFUL=1 locally if you want to watch the run.
    headless: process.env.HEADFUL !== '1',
    // Playwright intercepts downloads into its artifact folder, which is fine:
    // chrome.downloads still reports completion and the test can read the file.
    acceptDownloads: true,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      '--no-first-run',
      '--no-default-browser-check'
    ]
  })

  try {
    let worker = context.serviceWorkers()[0]
    if (!worker) worker = await context.waitForEvent('serviceworker', { timeout: 15000 })
    const extensionId = new URL(worker.url()).host
    console.log(`e2e:smoke: service worker ${worker.url()}`)

    const page = await context.newPage()
    const errors = []
    page.on('pageerror', (error) => errors.push(String(error)))

    await page.goto(url)
    if ((await page.title()) !== 'Graphock smoke page') fail('local test page did not load')

    const popup = await context.newPage()
    popup.on('pageerror', (error) => errors.push(`popup: ${String(error)}`))
    await popup.goto(`chrome-extension://${extensionId}/popup.html`)
    await popup.waitForSelector('.clip', { timeout: 10000 })
    const popupText = await popup.innerText('body')
    if (!popupText.includes('Graphock')) fail('popup did not render the brand')

    const options = await context.newPage()
    options.on('pageerror', (error) => errors.push(`options: ${String(error)}`))
    await options.goto(`chrome-extension://${extensionId}/options.html`)
    await options.waitForSelector('.options', { timeout: 10000 })
    await options.waitForSelector('select', { timeout: 5000 })

    for (const [name, target] of [
      ['popup', popup],
      ['options', options]
    ]) {
      await target.addScriptTag({ url: `chrome-extension://${extensionId}/axe.min.js` })
      const violations = await target.evaluate(async () => {
        const result = await globalThis.axe.run(document, {
          runOnly: ['wcag2a', 'wcag2aa']
        })
        return result.violations
          .filter((violation) => ['serious', 'critical'].includes(violation.impact))
          .map((violation) => ({ id: violation.id, impact: violation.impact, nodes: violation.nodes.length }))
      })
      if (violations.length > 0) {
        fail(`${name} accessibility violations: ${JSON.stringify(violations)}`)
      }
    }

    // The popup cannot capture without the action-click gesture; it must show a
    // recoverable error state instead of crashing.
    // Bring the content page back to the front, then ask the background worker to
    // capture it from the still-open popup page (the E2E build has host access).
    await page.bringToFront()
    const captureResult = await popup.evaluate(
      () => chrome.runtime.sendMessage({ type: 'GRAPHOCK_CAPTURE', mode: 'readable' })
    )
    if (!captureResult || captureResult.ok !== true) {
      console.error('e2e:smoke: capture result:', captureResult)
      throw new Error('capture failed')
    }
    if (!captureResult.url.startsWith('graphock-direct://import#p=v1.')) {
      fail(`unexpected handoff URL: ${captureResult.url.slice(0, 60)}`)
    }
    if (!captureResult.markdown.includes('Smoke page')) {
      fail('captured Markdown does not contain the page heading')
    }
    if (captureResult.embeddedAssets < 1) {
      fail(`expected at least one embedded image, got ${JSON.stringify(captureResult)}`)
    }
    if (!captureResult.markdown.includes('assets/a1-')) {
      fail('captured Markdown does not reference the embedded asset path')
    }
    console.log(
      `e2e:smoke: captured ${captureResult.assetCount} asset(s), channel=${captureResult.channel}`
    )

    // Full-page HTML export: stylesheet inlined, image as a data URI, no scripts.
    const htmlResult = await popup.evaluate(() =>
      chrome.runtime.sendMessage({ type: 'GRAPHOCK_CAPTURE', mode: 'full', format: 'html' })
    )
    if (!htmlResult?.ok || htmlResult.format !== 'html') {
      console.error('e2e:smoke: html capture result:', htmlResult)
      throw new Error('full-page HTML capture failed')
    }
    if (!htmlResult.content.includes('rgb(18, 52, 86)')) {
      fail('external stylesheet was not inlined into the HTML snapshot')
    }
    if (!htmlResult.content.includes('.inline-marker')) {
      fail('inline <style> was not preserved in the HTML snapshot')
    }
    if (!htmlResult.content.includes('data:image/png;base64')) {
      fail('image was not embedded as a data URI in the HTML snapshot')
    }
    if (htmlResult.content.includes('<script')) {
      fail('HTML snapshot contains a script tag')
    }
    console.log(
      `e2e:smoke: full-page HTML ${Math.round(htmlResult.content.length / 1024)} KB, channel=${htmlResult.channel}`
    )

    // Selection mode only captures the selected range.
    await page.bringToFront()
    await page.evaluate(() => {
      const paragraph = document.querySelector('p')
      if (!paragraph) throw new Error('missing paragraph')
      const range = document.createRange()
      range.selectNodeContents(paragraph)
      const selection = window.getSelection()
      selection?.removeAllRanges()
      selection?.addRange(range)
    })
    const selectionResult = await popup.evaluate(() =>
      chrome.runtime.sendMessage({ type: 'GRAPHOCK_CAPTURE', mode: 'selection', format: 'markdown' })
    )
    if (!selectionResult?.ok) {
      console.error('e2e:smoke: selection result:', selectionResult)
      throw new Error('selection capture failed')
    }
    if (!selectionResult.content.includes('Hello from the local test server')) {
      fail('selection capture did not include the selected paragraph')
    }
    if (selectionResult.content.includes('A pixel')) {
      fail('selection capture leaked content outside the selection')
    }

    // Link-only image policy must not embed bytes.
    await popup.evaluate(async () => {
      const stored = await chrome.storage.local.get('settings')
      await chrome.storage.local.set({
        settings: { ...(stored.settings ?? {}), imagePolicy: 'link' }
      })
    })
    const linkResult = await popup.evaluate(() =>
      chrome.runtime.sendMessage({ type: 'GRAPHOCK_CAPTURE', mode: 'readable', format: 'json' })
    )
    if (!linkResult?.ok || linkResult.embeddedAssets !== 0 || linkResult.linkedAssets < 1) {
      console.error('e2e:smoke: link result:', linkResult)
      throw new Error('link-only image policy failed')
    }
    const parsedLink = JSON.parse(linkResult.content)
    if (!JSON.stringify(parsedLink.assets).includes('http://127.0.0.1')) {
      fail('linked image asset lost its source URL')
    }

    // Save flow: ask the worker to write a file and confirm the download.
    const baseline = await popup.evaluate(() =>
      chrome.downloads.search({}).then((items) => items.map((item) => item.id))
    )
    const saveResult = await popup.evaluate(() =>
      chrome.runtime.sendMessage({
        type: 'GRAPHOCK_SAVE',
        content: '# Saved from e2e\n',
        format: 'json',
        title: 'E2E save',
        clipId: '44444444-4444-4444-8444-444444444444'
      })
    )
    if (!saveResult?.ok || !saveResult.filename?.endsWith('.json')) {
      console.error('e2e:smoke: save result:', saveResult)
      throw new Error('save flow failed')
    }
    const savedItems = await popup.evaluate(() => chrome.downloads.search({}))
    const savedList = savedItems.filter(
      (item) => !baseline.includes(item.id) && item.state === 'complete' && item.filename
    )
    if (savedList.length === 0) {
      console.error('e2e:smoke: save debug:', JSON.stringify({ saveResult, savedItems }))
      throw new Error('saved file was not completed')
    }
    const savedText = await readFile(savedList[savedList.length - 1].filename, 'utf8')
    if (!savedText.includes('Saved from e2e')) {
      fail('saved file content does not match what was requested')
    }

    // Diagnostics: capture stages must be observable without opening devtools.
    const logs = await popup.evaluate(() => chrome.runtime.sendMessage({ type: 'GRAPHOCK_LOGS' }))
    const events = (logs?.entries ?? []).map((entry) => entry.event)
    for (const required of ['capture-start', 'collect', 'build']) {
      if (!events.includes(required)) {
        console.error('e2e:smoke: missing log event', required, events)
        fail(`diagnostics missing ${required}`)
      }
    }

    // Full-page HTML must respect all three image policies.
    await page.bringToFront()
    await popup.evaluate(async () => {
      const stored = await chrome.storage.local.get('settings')
      await chrome.storage.local.set({ settings: { ...(stored.settings ?? {}), imagePolicy: 'link' } })
    })
    const linkHits = { ...hits }
    const htmlLink = await popup.evaluate(() =>
      chrome.runtime.sendMessage({ type: 'GRAPHOCK_CAPTURE', mode: 'full', format: 'html', requestId: crypto.randomUUID() })
    )
    if (!htmlLink?.ok) throw new Error('link-policy HTML capture failed')
    if (htmlLink.content.includes('data:image')) fail('link policy embedded image bytes in HTML')
    if (!htmlLink.content.includes('/img.png')) fail('link policy dropped image URLs')
    if (hits.image !== linkHits.image || hits.background !== linkHits.background) {
      fail('link policy unexpectedly fetched image resources')
    }

    await popup.evaluate(async () => {
      const stored = await chrome.storage.local.get('settings')
      await chrome.storage.local.set({ settings: { ...(stored.settings ?? {}), imagePolicy: 'skip' } })
    })
    const skipHits = { ...hits }
    const htmlSkip = await popup.evaluate(() =>
      chrome.runtime.sendMessage({ type: 'GRAPHOCK_CAPTURE', mode: 'full', format: 'html', requestId: crypto.randomUUID() })
    )
    if (!htmlSkip?.ok) throw new Error('skip-policy HTML capture failed')
    if (htmlSkip.content.includes('<img')) fail('text-only policy kept <img> elements')
    if (htmlSkip.content.includes('data:image') || htmlSkip.content.includes('data:font')) {
      fail('text-only policy embedded resources')
    }
    if (htmlSkip.content.includes('url(http')) fail('text-only policy kept CSS image URLs')
    if (hits.image !== skipHits.image || hits.font !== skipHits.font) {
      fail('text-only policy fetched image or font resources')
    }

    await popup.evaluate(async () => {
      const stored = await chrome.storage.local.get('settings')
      await chrome.storage.local.set({ settings: { ...(stored.settings ?? {}), imagePolicy: 'embed' } })
    })
    const embedHits = { ...hits }
    const htmlEmbed = await popup.evaluate(() =>
      chrome.runtime.sendMessage({ type: 'GRAPHOCK_CAPTURE', mode: 'full', format: 'html', requestId: crypto.randomUUID() })
    )
    if (!htmlEmbed?.ok) throw new Error('embed-policy HTML capture failed')
    if (!htmlEmbed.content.includes('data:image')) fail('embed policy did not inline images')
    if (!htmlEmbed.content.includes('data:font/woff2')) fail('embed policy did not inline fonts')
    if (!htmlEmbed.content.includes('font-src data:')) fail('HTML CSP blocks inlined fonts')
    if (hits.image <= embedHits.image || hits.font <= embedHits.font) {
      fail('embed policy did not fetch image and font resources')
    }

    // ZIP save uses the prepared build; missing previews must fail explicitly.
    const zipCapture = await popup.evaluate((requestId) =>
      chrome.runtime.sendMessage({ type: 'GRAPHOCK_CAPTURE', mode: 'readable', format: 'markdown', requestId }), randomUUID())
    if (!zipCapture?.ok || !zipCapture.canSaveZip) {
      console.error('e2e:smoke: zip capture:', zipCapture)
      throw new Error('zip capture did not expose a save-with-assets option')
    }
    const zipBaseline = await popup.evaluate(() =>
      chrome.downloads.search({}).then((items) => items.map((item) => item.id)))
    const zipSave = await popup.evaluate((value) =>
      chrome.runtime.sendMessage({
        type: 'GRAPHOCK_SAVE',
        content: value.content,
        format: value.format,
        title: value.title,
        clipId: value.clipId,
        withAssets: true
      }), zipCapture)
    if (!zipSave?.ok || !zipSave.filename?.endsWith('.zip')) {
      console.error('e2e:smoke: zip save:', zipSave)
      throw new Error('zip save failed')
    }
    const zipItems = await popup.evaluate(() => chrome.downloads.search({}))
    const zipItem = zipItems.find(
      (item) => !zipBaseline.includes(item.id) && item.state === 'complete' && item.filename
    )
    if (!zipItem) throw new Error('zip download was not completed')
    const zipEntries = unzipSync(new Uint8Array(await readFile(zipItem.filename)))
    if (!zipEntries['document.md'] || !zipEntries['manifest.json']) {
      throw new Error('zip is missing document or manifest')
    }
    if (!Object.keys(zipEntries).some((name) => name.startsWith('assets/'))) {
      throw new Error('zip is missing assets')
    }
    const manifest = JSON.parse(strFromU8(zipEntries['manifest.json']))
    if (manifest.assets.some((asset) => asset.data)) {
      throw new Error('zip manifest duplicated base64 asset data')
    }

    const expired = await popup.evaluate(() =>
      chrome.runtime.sendMessage({
        type: 'GRAPHOCK_SAVE',
        content: 'x',
        format: 'markdown',
        title: 'expired',
        clipId: crypto.randomUUID(),
        withAssets: true
      }))
    if (expired?.ok || expired?.code !== 'E_BUILD_EXPIRED') {
      console.error('e2e:smoke: expired save:', expired)
      fail('missing preview did not fail explicitly')
    }

    // Cancel must stop the background capture with no downloads or history.
    await page.goto(url + 'slow')
    await page.bringToFront()
    await popup.evaluate(async () => {
      const stored = await chrome.storage.local.get('settings')
      await chrome.storage.local.set({ settings: { ...(stored.settings ?? {}), imagePolicy: 'embed' } })
    })
    const beforeCancel = await popup.evaluate(async () => {
      const downloads = await chrome.downloads.search({})
      const stored = await chrome.storage.local.get('history')
      return { downloads: downloads.length, history: Array.isArray(stored.history) ? stored.history.length : 0 }
    })
    const cancelId = randomUUID()
    const pendingCapture = popup.evaluate((requestId) =>
      chrome.runtime.sendMessage({ type: 'GRAPHOCK_CAPTURE', mode: 'readable', format: 'markdown', requestId }), cancelId)
    await new Promise((resolveWait) => setTimeout(resolveWait, 150))
    await popup.evaluate((requestId) =>
      chrome.runtime.sendMessage({ type: 'GRAPHOCK_CANCEL', requestId }), cancelId)
    const cancelled = await pendingCapture
    if (cancelled?.ok || cancelled?.code !== 'E_CAPTURE_CANCELLED') {
      console.error('e2e:smoke: cancelled result:', cancelled)
      fail('cancel did not abort the capture')
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 2_500))
    const afterCancel = await popup.evaluate(async () => {
      const downloads = await chrome.downloads.search({})
      const stored = await chrome.storage.local.get('history')
      return { downloads: downloads.length, history: Array.isArray(stored.history) ? stored.history.length : 0 }
    })
    if (afterCancel.downloads !== beforeCancel.downloads) fail('cancel still created a download')
    if (afterCancel.history !== beforeCancel.history) fail('cancel still wrote history')
    if (!slowImage) fail('slow image endpoint was not requested')

    // Large embedded clip: capture is now side-effect free; delivery writes the
    // package, and the reference receiver must accept what the browser wrote.
    await page.goto(url + 'big')
    await page.bringToFront()
    await popup.evaluate(async () => {
      const stored = await chrome.storage.local.get('settings')
      await chrome.storage.local.set({
        settings: { ...(stored.settings ?? {}), imagePolicy: 'embed' }
      })
    })
    const bigCapture = await popup.evaluate((requestId) =>
      chrome.runtime.sendMessage({
        type: 'GRAPHOCK_CAPTURE',
        mode: 'readable',
        format: 'markdown',
        requestId
      }), randomUUID())
    if (!bigCapture?.ok || bigCapture.channel !== 'file-ready') {
      console.error('e2e:smoke: big capture:', bigCapture)
      throw new Error('large clip did not prepare the file channel')
    }
    const bigResult = await popup.evaluate((clipId) =>
      chrome.runtime.sendMessage({ type: 'GRAPHOCK_DELIVER', clipId }), bigCapture.clipId)
    if (!bigResult?.ok || bigResult.channel !== 'file') {
      console.error('e2e:smoke: big deliver:', bigResult)
      throw new Error('large clip did not deliver the file channel')
    }
    if (!bigResult.savedFilename?.endsWith('.graphock-clip.json')) {
      fail('large clip did not save a .graphock-clip.json package')
    }
    if (!bigResult.url.startsWith('graphock-direct://import?file=')) {
      fail(`unexpected file-channel URL: ${bigResult.url.slice(0, 60)}`)
    }

    // Hand the browser-produced package to the reference receiver.
    const receiverOut = await mkdtemp(join(tmpdir(), 'graphock-e2e-receiver-'))
    try {
      const output = execFileSync(
        'pnpm',
        [
          'exec',
          'tsx',
          'packages/protocol-receiver/src/cli.ts',
          '--out',
          receiverOut,
          '--url',
          bigResult.url
        ],
        { cwd: root, encoding: 'utf8' }
      )
      const imported = JSON.parse(output.slice(output.indexOf('{')))
      if (imported.channel !== 'file' || !imported.assetPaths?.length) {
        console.error('e2e:smoke: receiver output:', imported)
        throw new Error('reference receiver rejected the browser package')
      }
      const document = await readFile(imported.documentPath, 'utf8')
      if (!document.includes('Big clip')) fail('receiver document is missing the capture')
      console.log(`e2e:smoke: receiver imported ${imported.assetPaths.length} asset(s)`)
    } finally {
      await rm(receiverOut, { recursive: true, force: true })
    }

    // Clean up files this test created in the real download folder.
    await popup.evaluate(async (filenames) => {
      const items = await chrome.downloads.search({})
      for (const item of items) {
        if (!filenames.some((name) => item.filename.endsWith(name))) continue
        try {
          await chrome.downloads.removeFile(item.id)
        } catch {
          // best effort
        }
        await chrome.downloads.erase({ id: item.id })
      }
    }, [saveResult.filename, bigResult.savedFilename, zipSave.filename])

    console.log('e2e:smoke: selection, link policy, save and file channel OK')

    if (errors.length > 0) fail(`page errors:\n${errors.join('\n')}`)
    console.log('e2e:smoke: OK (extension loaded, popup and options rendered)')
  } finally {
    await context.close()
    server.close()
    await rm(userDataDir, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
