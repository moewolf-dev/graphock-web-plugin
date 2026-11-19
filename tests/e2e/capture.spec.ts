import { execFileSync } from 'node:child_process'
import type { Page } from '@playwright/test'
import { mkdir, readFile } from 'node:fs/promises'
import { strFromU8, unzipSync } from 'fflate'
import { expect, test } from './fixtures'
import {
  appliedSequence,
  capture,
  clickAndWait,
  downloads,
  extensionLogs,
  historyLength,
  openContent,
  readDownloadedText,
  waitForNewDownload,
  waitForNextResult,
  waitForSuccess
} from './helpers'

test.describe.configure({ mode: 'serial' })

const root = process.cwd()

test('captures a readable page and saves Markdown', async ({ context, popup, server }) => {
  const content = await openContent(context, server.url)
  await ensurePolicy(popup, 'link')
  await capture(popup, content)
  await waitForSuccess(popup)
  await expect(popup.getByTestId('meta')).toContainText('KB')

  const baseline = await downloads(popup)
  await popup.getByTestId('save').click()
  const item = await waitForNewDownload(popup, baseline)
  const text = await readDownloadedText(item)
  expect(text).toContain('title: Smoke page')
  expect(text).toContain('# Smoke page')
})

test('format switch hides the stale result, then saves HTML', async ({ context, popup, server }) => {
  const content = await openContent(context, server.url, 'slow')
  await ensurePolicy(popup, 'embed')
  await capture(popup, content)
  await waitForSuccess(popup)

  const beforeFormat = await appliedSequence(popup)
  await popup.getByTestId('format-html').click()
  // The old Markdown result must disappear and delivery must be blocked.
  await expect(popup.locator('.clip__skeleton')).toBeVisible()
  await expect(popup.getByTestId('meta')).toHaveCount(0)
  await expect(popup.getByTestId('save')).toBeDisabled()
  await expect(popup.getByTestId('copy-link')).toBeDisabled()
  await expect(popup.getByTestId('open-app')).toBeDisabled()

  await waitForNextResult(popup, beforeFormat)
  const baseline = await downloads(popup)
  await popup.getByTestId('save').click()
  const item = await waitForNewDownload(popup, baseline)
  const html = await readDownloadedText(item)
  expect(html.trimStart().startsWith('<!doctype html>')).toBe(true)
  expect(html).toContain('<h1>Slow clip</h1>')
})

test('cancel aborts a slow capture with no download or history', async ({
  context,
  popup,
  server
}) => {
  const content = await openContent(context, server.url, 'slow')
  await capture(popup, content)
  await waitForSuccess(popup)

  const baselineDownloads = await downloads(popup)
  const baselineHistory = await historyLength(popup)

  await popup.getByTestId('format-html').click()
  await expect(popup.locator('.clip__skeleton')).toBeVisible()
  await popup.getByTestId('cancel').click()
  await expect(popup.getByTestId('meta')).toHaveCount(0)

  // The background must report an aborted capture for the request we cancelled
  // and must never emit a build event for it.
  let cancelledRequest = ''
  await expect
    .poll(async () => {
      const logs = await extensionLogs(popup)
      const starts = logs.filter((entry) => entry.event === 'capture-start')
      const requestId = starts.at(-1)?.requestId ?? ''
      const failure = logs.find(
        (entry) =>
          entry.event === 'capture-failed' &&
          entry.requestId === requestId &&
          entry.data?.code === 'E_CAPTURE_CANCELLED'
      )
      if (failure) cancelledRequest = requestId
      return Boolean(failure)
    }, { timeout: 10_000, intervals: [200, 500] })
    .toBe(true)
  const logs = await extensionLogs(popup)
  expect(
    logs.some((entry) => entry.event === 'build' && entry.requestId === cancelledRequest)
  ).toBe(false)

  await new Promise((resolveWait) => setTimeout(resolveWait, 2_500))
  expect((await downloads(popup)).length).toBe(baselineDownloads.length)
  expect(await historyLength(popup)).toBe(baselineHistory)
})

test('selection mode only exports the selected paragraph', async ({ context, popup, server }) => {
  const content = await openContent(context, server.url)
  await content.evaluate(() => {
    const paragraph = document.querySelector('p')
    if (!paragraph) throw new Error('missing paragraph')
    const range = document.createRange()
    range.selectNodeContents(paragraph)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
  })
  await content.bringToFront()
  await clickAndWait(popup, () => popup.getByTestId('mode-selection').click())
  await waitForSuccess(popup)

  const baseline = await downloads(popup)
  await popup.getByTestId('save').click()
  const item = await waitForNewDownload(popup, baseline)
  const text = await readDownloadedText(item)
  expect(text).toContain('Hello from the local test server')
  expect(text).not.toContain('Steps')
})

test('full-page HTML follows link, skip and embed image policies', async ({
  context,
  popup,
  server
}) => {
  await openContent(context, server.url)
  await clickAndWait(popup, () => popup.getByTestId('mode-full').click())
  await clickAndWait(popup, () => popup.getByTestId('format-html').click())

  // link: URLs stay, no image bytes and no extra image requests
  server.resetHits()
  await clickAndWait(popup, () => popup.getByTestId('policy-link').click())
  const linkBaseline = await downloads(popup)
  await popup.getByTestId('save').click()
  const linkItem = await waitForNewDownload(popup, linkBaseline)
  const linkHtml = await readDownloadedText(linkItem)
  expect(linkHtml).toContain('/img.png')
  expect(linkHtml).not.toContain('data:image')
  expect(server.hits.image).toBe(0)
  expect(server.hits.font).toBe(0)

  // skip: no images, no CSS image/font URLs, no requests
  server.resetHits()
  await clickAndWait(popup, () => popup.getByTestId('policy-skip').click())
  const skipBaseline = await downloads(popup)
  await popup.getByTestId('save').click()
  const skipItem = await waitForNewDownload(popup, skipBaseline)
  const skipHtml = await readDownloadedText(skipItem)
  expect(skipHtml).not.toContain('<img')
  expect(skipHtml).not.toContain('data:image')
  expect(skipHtml).not.toContain('url(http')
  expect(server.hits.image).toBe(0)
  expect(server.hits.font).toBe(0)

  // embed: images and fonts inlined, CSP allows fonts
  server.resetHits()
  await clickAndWait(popup, () => popup.getByTestId('policy-embed').click())
  const embedBaseline = await downloads(popup)
  await popup.getByTestId('save').click()
  const embedItem = await waitForNewDownload(popup, embedBaseline)
  const embedHtml = await readDownloadedText(embedItem)
  expect(embedHtml).toContain('data:image')
  expect(embedHtml).toContain('data:font/woff2')
  expect(embedHtml).toContain('font-src data:')
  expect(server.hits.image).toBeGreaterThan(0)
  expect(server.hits.font).toBeGreaterThan(0)
})

test('saves a zip with document, manifest and assets', async ({ context, popup, server }) => {
  const content = await openContent(context, server.url)
  await ensurePolicy(popup, 'embed')
  await capture(popup, content)
  await waitForSuccess(popup)

  const baseline = await downloads(popup)
  await expect(popup.getByTestId('save')).toContainText('Save .zip')
  await popup.getByTestId('save').click()
  const item = await waitForNewDownload(popup, baseline)
  const buffer = await readFile(item.filename)
  const entries = unzipSync(new Uint8Array(buffer))
  expect(entries['document.md']).toBeTruthy()
  expect(entries['manifest.json']).toBeTruthy()
  expect(Object.keys(entries).some((name) => name.startsWith('assets/'))).toBe(true)
  const manifest = JSON.parse(strFromU8(entries['manifest.json']!))
  expect(manifest.assets.some((asset: { data?: string }) => asset.data)).toBe(false)
})

test('large clips prepare a file package and the reference receiver imports it', async ({
  context,
  popup,
  server
}, testInfo) => {
  const content = await openContent(context, server.url, 'big')
  await ensurePolicy(popup, 'embed')
  await capture(popup, content)
  await waitForSuccess(popup)
  await expect(popup.getByTestId('meta')).toContainText('package')

  const baseline = await downloads(popup)
  await popup.getByTestId('open-app').click()
  const item = await waitForNewDownload(popup, baseline)
  const packageJson = JSON.parse(await readDownloadedText(item))
  expect(packageJson.schema).toBe('graphock.clip.handoff/1')

  await expect
    .poll(() => popup.locator('.clip').getAttribute('data-delivered-url'), { timeout: 10_000 })
    .toContain('graphock-direct://import?file=')
  const url = await popup.locator('.clip').getAttribute('data-delivered-url')
  if (!url) throw new Error('product did not expose the delivered protocol URL')

  const outputDir = testInfo.outputPath('receiver')
  await mkdir(outputDir, { recursive: true })
  const output = execFileSync(
    'pnpm',
    [
      'exec',
      'tsx',
      'packages/protocol-receiver/src/cli.ts',
      '--out',
      outputDir,
      '--url',
      url
    ],
    { cwd: root, encoding: 'utf8' }
  )
  const imported = JSON.parse(output.slice(output.indexOf('{')))
  expect(imported.channel).toBe('file')
  expect(imported.assetPaths.length).toBeGreaterThan(0)
  const document = await readFile(imported.documentPath, 'utf8')
  expect(document).toContain('Big clip')
})

test('diagnostics are available after a capture', async ({ context, popup, server }) => {
  const content = await openContent(context, server.url)
  await capture(popup, content)
  await waitForSuccess(popup)
  const logs = await popup.evaluate(() => chrome.runtime.sendMessage({ type: 'GRAPHOCK_LOGS' }))
  const events = (logs?.entries ?? []).map((entry: { event: string }) => entry.event)
  expect(events).toContain('capture-start')
  expect(events).toContain('collect')
  expect(events).toContain('build')
})

async function ensurePolicy(popup: Page, policy: 'embed' | 'link' | 'skip'): Promise<void> {
  const button = popup.getByTestId(`policy-${policy}`)
  if ((await button.getAttribute('aria-pressed')) === 'true') return
  await clickAndWait(popup, () => button.click())
}
