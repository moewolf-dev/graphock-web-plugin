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
import { chromium } from 'playwright-core'

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
  const server = createServer((request, response) => {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    response.end(`<!doctype html><html lang="en"><head>
      <title>Graphock smoke page</title>
      <meta property="og:title" content="Smoke page title">
      <meta name="author" content="E2E">
    </head><body><main><h1>Smoke page</h1><p>Hello from the local test server.</p></main></body></html>`)
  })
  await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen))
  const address = server.address()
  return { server, url: `http://127.0.0.1:${address.port}/` }
}

async function main() {
  const shippedManifest = JSON.parse(
    await readFile(join(root, 'apps/extension/dist/chrome/manifest.json'), 'utf8')
  )
  const expected = ['activeTab', 'scripting', 'storage', 'downloads']
  if (JSON.stringify(shippedManifest.permissions) !== JSON.stringify(expected)) {
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
    // MV3 extensions are reliable only in headful Chrome today; CI wraps this
    // script with xvfb. Set HEADLESS=1 only for experiments.
    headless: process.env.HEADLESS === '1',
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
