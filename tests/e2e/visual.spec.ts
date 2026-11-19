import type { BrowserContext, Page } from '@playwright/test'
import { expect, test } from './fixtures'
import type { TestServer } from './server'
import { capture, waitForSuccess } from './helpers'

async function preparePopup(popup: Page, context: BrowserContext, server: TestServer): Promise<void> {
  const content = await context.newPage()
  await content.goto(server.url)
  await capture(popup, content)
  await waitForSuccess(popup)
}

test.describe('visual baseline', () => {
  test('popup (English, light)', async ({ context, popup, server }) => {
    await popup.setViewportSize({ width: 380, height: 640 })
    await preparePopup(popup, context, server)
    await expect(popup.locator('.clip')).toHaveScreenshot('popup-en-light.png', {
      mask: [popup.getByTestId('meta')]
    })
  })

  test.describe('dark', () => {
    test.use({ colorScheme: 'dark' })
    test('popup (English, dark)', async ({ context, popup, server }) => {
      await popup.setViewportSize({ width: 380, height: 640 })
      await preparePopup(popup, context, server)
      await expect(popup.locator('.clip')).toHaveScreenshot('popup-en-dark.png', {
        mask: [popup.getByTestId('meta')]
      })
    })
  })

  test.describe('Chinese', () => {
    test.use({ locale: 'zh-CN' })
    test('popup (Chinese, light)', async ({ context, popup, server }) => {
      await popup.setViewportSize({ width: 380, height: 640 })
      await preparePopup(popup, context, server)
      await expect(popup.locator('.clip')).toHaveScreenshot('popup-zh-light.png', {
        mask: [popup.getByTestId('meta')]
      })
    })
  })

  test('options (English, light)', async ({ context, extensionId }) => {
    const page = await context.newPage()
    await page.setViewportSize({ width: 900, height: 900 })
    await page.goto(`chrome-extension://${extensionId}/options.html`)
    await page.waitForSelector('.options')
    await expect(page.locator('.options')).toHaveScreenshot('options-en-light.png', {
      mask: [page.locator('.diagnostics')]
    })
  })
})
