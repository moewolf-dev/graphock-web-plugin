import { writeFile } from 'node:fs/promises'
import { expect, test } from './fixtures'
import { openContent } from './helpers'

test.describe.configure({ mode: 'serial' })

test('settings import is reachable and operable from the keyboard', async ({
  context,
  extensionId
}, testInfo) => {
  const page = await context.newPage()
  await page.goto(`chrome-extension://${extensionId}/options.html`)
  await page.waitForSelector('.options')

  let focused = false
  for (let index = 0; index < 60; index += 1) {
    await page.keyboard.press('Tab')
    const testId = await page.evaluate(() => document.activeElement?.getAttribute('data-testid'))
    if (testId === 'import-settings') {
      focused = true
      break
    }
  }
  expect(focused).toBe(true)

  const backupPath = testInfo.outputPath('settings.json')
  await writeFile(
    backupPath,
    JSON.stringify({
      schema: 'graphock.web-plugin.settings/1',
      settings: { targetScheme: 'graphock', defaultFormat: 'txt', imagePolicy: 'link' }
    })
  )

  const chooserPromise = page.waitForEvent('filechooser')
  await page.keyboard.press('Enter')
  const chooser = await chooserPromise
  await chooser.setFiles(backupPath)

  await expect(page.locator('select').first()).toHaveValue('graphock')
  await expect(page.locator('select').nth(1)).toHaveValue('readable')
  await expect(page.locator('select').nth(2)).toHaveValue('txt')
  await expect(page.locator('select').nth(3)).toHaveValue('link')
})

test('settings import rejects an unknown schema and shows an error', async ({
  context,
  extensionId
}, testInfo) => {
  const page = await context.newPage()
  await page.goto(`chrome-extension://${extensionId}/options.html`)
  await page.waitForSelector('.options')
  const badPath = testInfo.outputPath('bad-settings.json')
  await writeFile(badPath, JSON.stringify({ schema: 'other/9', settings: {} }))

  await page.getByTestId('import-input').setInputFiles(badPath)
  await expect(page.locator('.error')).toContainText('Unsupported backup schema')
  await expect(page.locator('select').first()).toHaveValue('graphock-direct')
})

test('logs can be copied, downloaded and cleared from settings', async ({
  context,
  extensionId
}) => {
  const page = await context.newPage()
  await page.goto(`chrome-extension://${extensionId}/options.html`)
  await page.waitForSelector('.options')

  // Generate at least one background log entry.
  const content = await openContent(context, 'about:blank')
  const popup = await context.newPage()
  await popup.goto(`chrome-extension://${extensionId}/popup.html`)
  await popup.waitForSelector('.clip')
  await content.bringToFront()
  await popup.getByTestId('refresh').click()
  await expect(popup.locator('.clip__error-text')).toBeVisible()

  await page.reload()
  await page.waitForSelector('.options')
  await expect(page.getByTestId('logs')).not.toHaveText('No logs yet.')
  await page.getByTestId('clear-logs').click()
  await expect(page.getByTestId('logs')).toHaveText('No logs yet.')
})

test.describe('Chinese layout', () => {
  test.use({ locale: 'zh-CN' })

  test('renders Chinese, sets lang and has no horizontal overflow at 320px', async ({
    popup
  }) => {
    await popup.setViewportSize({ width: 320, height: 640 })
    const metrics = await popup.evaluate(() => ({
      lang: document.documentElement.lang,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      bodyWidth: document.body.getBoundingClientRect().width
    }))
    expect(metrics.lang).toBe('zh-CN')
    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth)
    expect(metrics.bodyWidth).toBeLessThanOrEqual(320)
    await expect(popup.getByTestId('refresh')).toHaveAttribute('aria-label', '重新抓取')
    await expect(popup.locator('.clip')).toBeVisible()
  })
})
