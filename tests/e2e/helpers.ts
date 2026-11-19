import { readFile } from 'node:fs/promises'
import { expect, type BrowserContext, type Page } from '@playwright/test'

export type DownloadItem = { id: number; filename: string; state: string }

export async function openContent(
  context: BrowserContext,
  url: string,
  path = ''
): Promise<Page> {
  const page = await context.newPage()
  await page.goto(`${url}${path}`, { waitUntil: 'load' })
  await page.bringToFront()
  return page
}

export async function appliedSequence(popup: Page): Promise<number> {
  const value = await popup.locator('.clip').getAttribute('data-applied-seq')
  return Number(value ?? 0)
}

export async function waitForNextResult(popup: Page, before: number): Promise<void> {
  await popup.waitForFunction(
    (previous) =>
      Number(document.querySelector('.clip')?.getAttribute('data-applied-seq') ?? 0) > previous,
    before,
    { timeout: 60_000 }
  )
  await expect(popup.locator('.clip')).toHaveAttribute('data-loading', 'false', {
    timeout: 10_000
  })
  await expect(
    popup.getByTestId('meta').or(popup.locator('.clip__error-text'))
  ).toBeVisible({ timeout: 10_000 })
}

export async function clickAndWait(popup: Page, action: () => Promise<void>): Promise<void> {
  const before = await appliedSequence(popup)
  await action()
  await waitForNextResult(popup, before)
}

export async function capture(popup: Page, content: Page): Promise<void> {
  await content.bringToFront()
  await clickAndWait(popup, () => popup.getByTestId('refresh').click())
}

export async function waitForCapture(popup: Page): Promise<void> {
  // Legacy helper: wait for a result that is already in flight or settled.
  await expect(popup.locator('.clip')).toHaveAttribute('data-loading', 'false', {
    timeout: 60_000
  })
  await expect(
    popup.getByTestId('meta').or(popup.locator('.clip__error-text'))
  ).toBeVisible({ timeout: 10_000 })
}

export async function waitForSuccess(popup: Page): Promise<void> {
  await expect(popup.getByTestId('meta')).toBeVisible({ timeout: 60_000 })
}

export async function downloads(popup: Page): Promise<DownloadItem[]> {
  return popup.evaluate(() =>
    chrome.downloads.search({}).then((items) =>
      items.map((item) => ({ id: item.id, filename: item.filename, state: item.state }))
    )
  )
}

export async function waitForNewDownload(
  popup: Page,
  baseline: DownloadItem[],
  timeout = 30_000
): Promise<DownloadItem> {
  const known = new Set(baseline.map((item) => item.id))
  let found: DownloadItem | undefined
  await expect
    .poll(
      async () => {
        const items = await downloads(popup)
        found = items.find((item) => !known.has(item.id) && item.state === 'complete' && item.filename)
        return found?.id ?? 0
      },
      { timeout, intervals: [200, 400, 800] }
    )
    .toBeGreaterThan(0)
  if (!found) throw new Error('No completed download was found')
  return found
}

export async function readDownloadedText(item: DownloadItem): Promise<string> {
  return readFile(item.filename, 'utf8')
}

export type ExtensionLog = {
  ts: string
  level: string
  event: string
  requestId?: string
  durationMs?: number
  data?: Record<string, unknown>
}

export async function extensionLogs(popup: Page): Promise<ExtensionLog[]> {
  const result = (await popup.evaluate(() =>
    chrome.runtime.sendMessage({ type: 'GRAPHOCK_LOGS' })
  )) as { entries?: ExtensionLog[]; persisted?: ExtensionLog[] }
  return [...(result.entries ?? []), ...(result.persisted ?? [])]
}

export async function historyLength(popup: Page): Promise<number> {
  return popup.evaluate(async () => {
    const stored = await chrome.storage.local.get('history')
    return Array.isArray(stored.history) ? stored.history.length : 0
  })
}

export async function setSetting(popup: Page, key: string, value: unknown): Promise<void> {
  await popup.evaluate(
    async ({ key: name, value: next }) => {
      const stored = await chrome.storage.local.get('settings')
      const settings = { ...(stored.settings ?? {}), [name]: next }
      await chrome.storage.local.set({ settings })
    },
    { key, value }
  )
}
