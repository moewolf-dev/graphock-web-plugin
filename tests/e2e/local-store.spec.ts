import { readFile } from 'node:fs/promises'
import { unzipSync } from 'fflate'
import { expect, test } from './fixtures'
import {
  capture,
  clickAndWait,
  downloads,
  openContent,
  readDownloadedText,
  setSetting,
  waitForCapture,
  waitForNewDownload,
  waitForSuccess
} from './helpers'

/**
 * Chrome local-save release surface.
 *
 * Runs against `build:e2e:local` (GRAPHOCK_APP_HANDOFF=0). The first store
 * release must complete capture + Markdown/HTML/ZIP downloads without any
 * desktop app, and must not expose protocol handoff entry points.
 */
test.skip(
  process.env.GRAPHOCK_LOCAL_ONLY_BUILD !== '1',
  'requires the local-save E2E build'
)

test.describe.configure({ mode: 'serial' })
test.setTimeout(150_000)

test('hides every App handoff entry point', async ({ popup, context, extensionId }) => {
  await expect(popup.getByTestId('open-app')).toHaveCount(0)
  await expect(popup.getByTestId('copy-link')).toHaveCount(0)
  await expect(popup.locator('.clip__scheme')).toHaveCount(0)

  const options = await context.newPage()
  await options.goto(`chrome-extension://${extensionId}/options.html`)
  await expect(options.locator('body')).toBeVisible()
  await expect(options.getByText('Desktop app', { exact: true })).toHaveCount(0)
  await expect(options.getByText('Which build should receive clips?', { exact: true })).toHaveCount(0)
  await options.close()
})

test('saves Markdown without an App', async ({ context, popup, server }) => {
  const content = await openContent(context, server.url)
  await clickAndWait(popup, () => popup.getByTestId('policy-link').click())
  await capture(popup, content)
  await waitForSuccess(popup)

  const baseline = await downloads(popup)
  await popup.getByTestId('save').click()
  const item = await waitForNewDownload(popup, baseline)
  const text = await readDownloadedText(item)
  expect(text).toContain('title: Smoke page')
  expect(text).toContain('# Smoke page')
})

test('saves self-contained HTML without an App', async ({ context, popup, server }) => {
  const content = await openContent(context, server.url)
  await clickAndWait(popup, () => popup.getByTestId('format-html').click())
  await capture(popup, content)
  await waitForSuccess(popup)

  const baseline = await downloads(popup)
  await popup.getByTestId('save').click()
  const item = await waitForNewDownload(popup, baseline)
  const html = await readDownloadedText(item)
  expect(html.trimStart().startsWith('<!doctype html>')).toBe(true)
  expect(html).toContain('<h1>Smoke page</h1>')
})

test('saves a ZIP with assets without an App', async ({ context, popup, server }) => {
  // Reset both stored settings, then let the popup load them fresh. This avoids
  // three recaptures from clicking format+policy controls in sequence.
  await setSetting(popup, 'imagePolicy', 'embed')
  await setSetting(popup, 'defaultFormat', 'markdown')
  await popup.reload()
  await expect(popup.getByTestId('save')).toBeVisible({ timeout: 60_000 })
  await waitForCapture(popup).catch(() => undefined)

  const content = await openContent(context, server.url)
  await capture(popup, content)
  await waitForSuccess(popup)
  await expect(popup.getByTestId('save')).toContainText('Save .zip')

  const baseline = await downloads(popup)
  await popup.getByTestId('save').click()
  const item = await waitForNewDownload(popup, baseline)
  const entries = unzipSync(new Uint8Array(await readFile(item.filename)))
  expect(entries['document.md']).toBeTruthy()
  expect(entries['manifest.json']).toBeTruthy()
  expect(Object.keys(entries).some((name) => name.startsWith('assets/'))).toBe(true)
})
