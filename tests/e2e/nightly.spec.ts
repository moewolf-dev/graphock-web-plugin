import { expect, test } from './fixtures'
import { capture, downloads, historyLength, openContent, waitForSuccess } from './helpers'

test.describe('@nightly', () => {
  test('20 sequential captures stay stable and bounded', async ({ context, popup, server }) => {
    const content = await openContent(context, server.url)
    for (let index = 0; index < 20; index += 1) {
      await capture(popup, content)
      await waitForSuccess(popup)
      await expect(popup.getByTestId('meta')).toContainText('KB')
    }
    expect((await downloads(popup)).length).toBe(0)
    expect(await historyLength(popup)).toBe(0)
  })

  test('a 10k-paragraph page is bounded or rejected cleanly', async ({ context, popup, server }) => {
    const content = await openContent(context, server.url, 'large')
    const started = Date.now()
    await capture(popup, content)
    const elapsed = Date.now() - started
    const errorLocator = popup.locator('.clip__error-text')
    const error = (await errorLocator.count()) > 0 ? await errorLocator.textContent() : null
    if (error) {
      expect(error).toMatch(/E_TOO_LARGE|E_CAPTURE_TIMEOUT/)
    } else {
      await expect(popup.getByTestId('meta')).toBeVisible()
    }
    expect(elapsed).toBeLessThan(75_000)
  })
})
