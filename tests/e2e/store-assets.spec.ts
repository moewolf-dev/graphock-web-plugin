import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from './fixtures'
import { capture, openContent, waitForSuccess } from './helpers'

/**
 * Generates Chrome Web Store screenshots from the local-save candidate build.
 * The popup is centered on a neutral canvas so the output is 1280×800.
 */
test.skip(
  process.env.GRAPHOCK_LOCAL_ONLY_BUILD !== '1',
  'requires the local-save E2E build'
)

test('generate store screenshots', async ({ context, popup, server, extensionId }) => {
  const outDir = join(process.cwd(), 'artifacts/store-assets')
  mkdirSync(outDir, { recursive: true })

  const content = await openContent(context, server.url)
  await capture(popup, content)
  await waitForSuccess(popup)
  await expect(popup.getByTestId('open-app')).toHaveCount(0)

  await popup.setViewportSize({ width: 1280, height: 800 })
  await popup.evaluate(() => {
    document.body.style.margin = '0'
    document.body.style.background =
      'radial-gradient(circle at 30% 20%, #eef4ff 0%, #f8fafc 55%, #eef2f7 100%)'
    const clip = document.querySelector('.clip') as HTMLElement | null
    if (!clip) throw new Error('popup result not found')
    const canvas = document.createElement('div')
    canvas.style.cssText =
      'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;'
    clip.parentElement?.insertBefore(canvas, clip)
    canvas.appendChild(clip)
    clip.style.width = '420px'
    clip.style.boxShadow = '0 24px 60px rgba(15, 23, 42, 0.18)'
    clip.style.borderRadius = '16px'
  })
  await popup.screenshot({ path: join(outDir, '01-popup-result.png') })

  const options = await context.newPage()
  await options.setViewportSize({ width: 1280, height: 800 })
  await options.goto(`chrome-extension://${extensionId}/options.html`)
  await expect(options.locator('body')).toBeVisible()
  await options.screenshot({ path: join(outDir, '02-options.png') })
  await options.close()
})
