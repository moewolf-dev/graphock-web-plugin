import { test } from './fixtures'
import { capture, openContent, waitForSuccess } from './helpers'

/**
 * Controlled failure used to verify that CI collects screenshots, trace and
 * extension logs without uploading the Chromium profile.
 *
 * Run: ARTIFACT_PROBE=1 pnpm exec playwright test tests/e2e/probe.spec.ts --grep @artifact-probe
 */
test('@artifact-probe intentional failure', async ({ context, popup, server }) => {
  test.skip(process.env.ARTIFACT_PROBE !== '1', 'set ARTIFACT_PROBE=1 to run the probe')
  const content = await openContent(context, server.url)
  await capture(popup, content)
  await waitForSuccess(popup)
  throw new Error('artifact probe: intentional failure')
})
