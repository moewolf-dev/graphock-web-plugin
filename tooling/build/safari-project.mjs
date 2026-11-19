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
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const dist = join(root, 'apps/extension/dist/safari')
const projectRoot = join(root, 'apps/safari')
const stagingRoot = join(root, 'apps/.safari-staging')
const pbxprojRelative = 'Graphock Web Clipper.xcodeproj/project.xcproj'

const APP_ID = 'com.moewolf.graphock.webclip'

execFileSync('pnpm', ['build:safari'], { cwd: root, stdio: 'inherit' })

// Generate into a staging directory first. If conversion fails, the existing
// project (and its README) stays intact.
await rm(stagingRoot, { recursive: true, force: true })
try {
execFileSync(
  'xcrun',
  [
    'safari-web-extension-converter',
    dist,
    '--project-location',
    stagingRoot,
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

const stagingProject = join(stagingRoot, 'Graphock Web Clipper')
const pbxproj = join(stagingProject, pbxprojRelative)

// Privacy manifest: no tracking, no collected data.
const extensionDir = join(stagingProject, 'Graphock Web Clipper Extension')
await writeFile(
  join(extensionDir, 'PrivacyInfo.xcprivacy'),
  `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>NSPrivacyTracking</key>
  <false/>
  <key>NSPrivacyTrackingDomains</key>
  <array/>
  <key>NSPrivacyCollectedDataTypes</key>
  <array/>
  <key>NSPrivacyAccessedAPITypes</key>
  <array/>
</dict>
</plist>
`
)

const source = await readFile(pbxproj, 'utf8')
const converterAppId = /"PRODUCT_BUNDLE_IDENTIFIER": "([^"]*Graphock-Web-Clipper)"/u
if (!converterAppId.test(source)) {
  throw new Error('Could not find the converter-generated app bundle identifier')
}
let patched = source.replace(converterAppId, `"PRODUCT_BUNDLE_IDENTIFIER": "${APP_ID}"`)
if (!patched.includes('PrivacyInfo.xcprivacy')) {
  patched = patched.replace(
    '        { "path": "SafariWebExtensionHandler.swift"',
    '        { "path": "PrivacyInfo.xcprivacy", "target-membership": [ "Graphock Web Clipper Extension/resources" ] },\n        { "path": "SafariWebExtensionHandler.swift"'
  )
}
await writeFile(pbxproj, patched)

// App icon: resize the committed master with sips (macOS-only project).
const appIconDir = join(stagingProject, 'Graphock Web Clipper/Assets.xcassets/AppIcon.appiconset')
const master = join(root, 'tooling/assets/app-icon-1024.png')
const iconSizes = [
  ['mac-icon-16@1x.png', 16],
  ['mac-icon-16@2x.png', 32],
  ['mac-icon-32@1x.png', 32],
  ['mac-icon-32@2x.png', 64],
  ['mac-icon-128@1x.png', 128],
  ['mac-icon-128@2x.png', 256],
  ['mac-icon-256@1x.png', 256],
  ['mac-icon-256@2x.png', 512],
  ['mac-icon-512@1x.png', 512],
  ['mac-icon-512@2x.png', 1024]
]
for (const [name, size] of iconSizes) {
  execFileSync('sips', ['-z', String(size), String(size), master, '--out', join(appIconDir, name)], {
    stdio: 'ignore'
  })
}

await rm(projectRoot, { recursive: true, force: true })
await mkdir(projectRoot, { recursive: true })
await rename(stagingProject, join(projectRoot, 'Graphock Web Clipper'))

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
console.log(`safari-project: generated ${projectRoot}`)
} finally {
  await rm(stagingRoot, { recursive: true, force: true })
}
