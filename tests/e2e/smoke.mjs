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
  const cache = join(homedir(), 'Library/Caches/ms-playwright')
  try {
    const builds = (await readdir(cache)).filter((name) => name.startsWith('chromium-')).sort().reverse()
    for (const build of builds) {
      const candidate = join(
        cache,
        build,
        'chrome-mac-arm64',
        'Google Chrome for Testing.app',
        'Contents',
        'MacOS',
        'Google Chrome for Testing'
      )
      if (existsSync(candidate)) return candidate
    }
  } catch {
    // No Playwright cache; fall through.
  }
  return undefined
}

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
    if (request.url === '/style.css') {
      response.writeHead(200, { 'content-type': 'text/css' })
      response.end('body { color: rgb(18, 52, 86); } .marker { border-left: 3px solid teal; }')
      return
    }
    if (request.url === '/img.png') {
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

    // Large embedded clip: inline URL must fail, file channel must save a package.
    await page.goto(url + 'big')
    await page.bringToFront()
    await popup.evaluate(async () => {
      const stored = await chrome.storage.local.get('settings')
      await chrome.storage.local.set({
        settings: { ...(stored.settings ?? {}), imagePolicy: 'embed' }
      })
    })
    const bigResult = await popup.evaluate(() =>
      chrome.runtime.sendMessage({ type: 'GRAPHOCK_CAPTURE', mode: 'readable', format: 'markdown' })
    )
    if (!bigResult?.ok || bigResult.channel !== 'file') {
      console.error('e2e:smoke: big result:', bigResult)
      throw new Error('large clip did not use the file channel')
    }
    if (!bigResult.savedFilename?.endsWith('.graphock-clip.json')) {
      fail('large clip did not save a .graphock-clip.json package')
    }
    if (!bigResult.url.startsWith('graphock-direct://import?file=')) {
      fail(`unexpected file-channel URL: ${bigResult.url.slice(0, 60)}`)
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
    }, [saveResult.filename, bigResult.savedFilename])

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
