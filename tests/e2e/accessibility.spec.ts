import { expect, test } from './fixtures'

test.describe.configure({ mode: 'serial' })

test('popup and options have no serious accessibility violations', async ({
  context,
  extensionId,
  popup
}) => {
  const options = await context.newPage()
  await options.goto(`chrome-extension://${extensionId}/options.html`)
  await options.waitForSelector('.options')

  for (const [name, page] of [
    ['popup', popup],
    ['options', options]
  ] as const) {
    await page.addScriptTag({ url: `chrome-extension://${extensionId}/axe.min.js` })
    const violations = await page.evaluate(async () => {
      const axe = (globalThis as unknown as { axe: { run: (root: Document, options: unknown) => Promise<{ violations: Array<{ id: string; impact: string | null; nodes: unknown[] }> }> } }).axe
      const result = await axe.run(document, { runOnly: ['wcag2a', 'wcag2aa'] })
      return result.violations
        .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
        .map((violation) => ({ id: violation.id, impact: violation.impact, nodes: violation.nodes.length }))
    })
    expect(violations, `${name} accessibility violations`).toEqual([])
  }
})
