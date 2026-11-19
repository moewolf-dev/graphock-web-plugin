import { existsSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  test as base,
  chromium,
  type BrowserContext,
  type Page,
  type TestInfo
} from '@playwright/test'
import { startServer, type TestServer } from './server'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const defaultBuild = join(root, 'apps/extension/dist/e2e')

export type Fixtures = {
  context: BrowserContext
  extensionId: string
  server: TestServer
  popup: Page
}

async function findChrome(): Promise<string | undefined> {
  if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH
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
        for (const arch of ['chrome-mac-arm64', 'chrome-mac-x64', 'chrome-mac', 'chrome-linux']) {
          const candidates = [
            join(cache, build, arch, 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing'),
            join(cache, build, arch, 'chrome')
          ]
          for (const candidate of candidates) if (existsSync(candidate)) return candidate
        }
      }
    } catch {
      // Try the next cache location.
    }
  }
  return undefined
}

async function attachFailureArtifacts(
  context: BrowserContext,
  testInfo: TestInfo
): Promise<void> {
  const pages = context.pages()
  for (const [index, page] of pages.entries()) {
    try {
      const path = testInfo.outputPath(`failure-page-${index + 1}.png`)
      await page.screenshot({ path, fullPage: false })
      await testInfo.attach(`page-${index + 1}`, { path, contentType: 'image/png' })
    } catch {
      // Page may already be closed.
    }
  }

  try {
    const worker = context.serviceWorkers()[0]
    if (worker) {
      const logs = await worker.evaluate(() => chrome.runtime.sendMessage({ type: 'GRAPHOCK_LOGS' }))
      await testInfo.attach('extension-logs', {
        body: JSON.stringify(logs, null, 2),
        contentType: 'application/json'
      })
    }
  } catch {
    // Logging is best-effort.
  }
}

export const test = base.extend<Fixtures>({
  context: async ({ locale, colorScheme }, use, testInfo) => {
    const extensionPath = process.env.E2E_BUILD_DIR ?? defaultBuild
    const chrome = await findChrome()
    if (!chrome) throw new Error('Chrome for Testing not found. Set CHROME_PATH or install Playwright Chromium.')
    if (!existsSync(join(extensionPath, 'manifest.json'))) {
      throw new Error(`Extension build missing at ${extensionPath}. Run pnpm qa (which builds it).`)
    }

    const context = await chromium.launchPersistentContext(testInfo.outputPath('profile'), {
      executablePath: chrome,
      headless: process.env.HEADFUL !== '1',
      locale,
      colorScheme,
      acceptDownloads: true,
      viewport: { width: 1280, height: 900 },
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        '--no-first-run',
        '--no-default-browser-check'
      ]
    })

    const pageErrors: string[] = []
    context.on('page', (page) => {
      page.on('pageerror', (error) => pageErrors.push(`${page.url()}: ${error.message}`))
    })

    await use(context)

    if (testInfo.status !== testInfo.expectedStatus) {
      await attachFailureArtifacts(context, testInfo)
      if (pageErrors.length > 0) {
        await testInfo.attach('page-errors', {
          body: pageErrors.join('\n'),
          contentType: 'text/plain'
        })
      }
    }
    await context.close()
  },

  extensionId: async ({ context }, use) => {
    let worker = context.serviceWorkers()[0]
    if (!worker) worker = await context.waitForEvent('serviceworker', { timeout: 20_000 })
    await use(new URL(worker.url()).host)
  },

  server: async ({ browserName: _browserName }, use) => {
    const server = await startServer()
    await use(server)
    await server.close()
  },

  popup: async ({ context, extensionId }, use) => {
    const page = await context.newPage()
    await page.goto(`chrome-extension://${extensionId}/popup.html`)
    await page.waitForSelector('.clip', { timeout: 15_000 })
    await use(page)
  }
})

export { expect } from '@playwright/test'
