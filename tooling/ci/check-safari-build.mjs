#!/usr/bin/env node
/** Assert the Safari build variant carries the expected manifest shape. */
import { readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const dist = join(root, 'apps/extension/dist/safari')
const manifest = JSON.parse(await readFile(join(dist, 'manifest.json'), 'utf8'))

const failures = []
if ((manifest.permissions ?? []).includes('downloads')) failures.push('downloads permission present')
if ((manifest.permissions ?? []).includes('offscreen')) failures.push('offscreen permission present')
if (manifest.background?.type) failures.push('background.type must be absent for Safari')
if (manifest.minimum_chrome_version) failures.push('minimum_chrome_version must be absent')
if (manifest.options_ui?.open_in_tab !== undefined) failures.push('options_ui.open_in_tab must be absent')

for (const file of ['background.js', 'content.js', 'popup.html', 'options.html', 'save.html', 'save.js', 'manifest.json']) {
  try {
    await readFile(join(dist, file))
  } catch {
    failures.push(`missing ${file}`)
  }
}

if (failures.length > 0) {
  console.error('check-safari-build:')
  for (const failure of failures) console.error(`  - ${failure}`)
  process.exit(1)
}
console.log('check-safari-build: ok')
