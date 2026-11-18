#!/usr/bin/env node
/**
 * Regenerate the Safari container project from the built extension.
 *
 * 1. builds dist/safari (no downloads/offscreen permissions, classic service worker)
 * 2. runs Apple's converter
 * 3. fixes the app bundle identifier the converter derives from the app name
 *
 * Requirements: Xcode with `safari-web-extension-converter`.
 */
import { execFileSync } from 'node:child_process'
import { readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const dist = join(root, 'apps/extension/dist/safari')
const projectRoot = join(root, 'apps/safari')
const projectDir = join(projectRoot, 'Graphock Web Clipper')
const pbxproj = join(projectDir, 'Graphock Web Clipper.xcodeproj/project.xcproj')

const APP_ID = 'com.moewolf.graphock.webclip'

execFileSync('pnpm', ['build:safari'], { cwd: root, stdio: 'inherit' })
await rm(projectRoot, { recursive: true, force: true })
execFileSync(
  'xcrun',
  [
    'safari-web-extension-converter',
    dist,
    '--project-location',
    projectRoot,
    '--app-name',
    'Graphock Web Clipper',
    '--bundle-identifier',
    APP_ID,
    '--macos-only',
    '--swift',
    '--no-open'
  ],
  { cwd: root, stdio: 'inherit' }
)

const source = await readFile(pbxproj, 'utf8')
const converterAppId = /"PRODUCT_BUNDLE_IDENTIFIER": "([^"]*Graphock-Web-Clipper)"/u
if (!converterAppId.test(source)) {
  throw new Error('Could not find the converter-generated app bundle identifier')
}
const patched = source.replace(converterAppId, `"PRODUCT_BUNDLE_IDENTIFIER": "${APP_ID}"`)
await writeFile(pbxproj, patched)

await writeFile(
  join(projectRoot, 'README.md'),
  `# Safari container project (generated)

Regenerate with:

\`\`\`bash
node tooling/build/safari-project.mjs
\`\`\`

- App bundle id: \`${APP_ID}\`
- Extension bundle id: \`${APP_ID}.Extension\`
- Team ID for signing: \`XMZJ99258B\` (shared with the desktop app)

Build without signing (what CI can do):

\`\`\`bash
xcodebuild -project "apps/safari/Graphock Web Clipper/Graphock Web Clipper.xcodeproj" \\
  -scheme "Graphock Web Clipper" -configuration Debug -destination 'platform=macOS' \\
  CODE_SIGNING_ALLOWED=NO build
\`\`\`

To run it locally: open the project, pick **Sign to Run Locally**, run the container app,
then enable the extension in Safari → Settings → Extensions (see \`docs/qa/local-dev.md\`).
`
)
console.log(`safari-project: generated ${projectDir}`)
