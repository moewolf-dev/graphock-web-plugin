#!/usr/bin/env node
/**
 * Chrome local-save release verification.
 *
 * 1. Build the App-handoff-disabled E2E extension.
 * 2. Run the local-store Playwright spec (no open-app/copy-link anywhere).
 * 3. Build the exact store payload and ZIP.
 * 4. Verify the ZIP manifest has no App shortcuts and record the SHA-256.
 */
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const pkg = JSON.parse(readFileSync(join(root, 'apps/extension/package.json'), 'utf8'))
const zipPath = join(root, 'artifacts', `graphock-web-plugin-${pkg.version}-chrome.zip`)

process.env.GRAPHOCK_LOCAL_ONLY_BUILD = '1'

function run(label, args) {
  console.log(`\n[local-release] ${label}`)
  const result = spawnSync('pnpm', args, { cwd: root, stdio: 'inherit', env: process.env })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${label} failed (exit ${result.status})`)
}

run('build local-save E2E extension', ['build:e2e:local'])
run('run local-save browser acceptance', [
  'exec',
  'playwright',
  'test',
  'tests/e2e/local-store.spec.ts',
  '--reporter=line'
])
run('build and zip the store payload', ['package:chrome:store'])

if (!existsSync(zipPath)) throw new Error(`missing store ZIP: ${zipPath}`)
const manifest = JSON.parse(
  spawnSync('unzip', ['-p', zipPath, 'manifest.json'], { encoding: 'utf8' }).stdout
)
if (manifest.version !== pkg.version) {
  throw new Error(`ZIP version ${manifest.version} != package ${pkg.version}`)
}
if ((manifest.permissions ?? []).includes('contextMenus')) {
  throw new Error('store ZIP still requests contextMenus')
}
if (manifest.commands) throw new Error('store ZIP still declares App shortcut commands')
if ((manifest.host_permissions ?? []).length > 0) {
  throw new Error('store ZIP must not request host permissions at install time')
}

const sha256 = createHash('sha256').update(readFileSync(zipPath)).digest('hex')
const record = {
  generatedAt: new Date().toISOString(),
  scope: 'chrome-local-save',
  version: manifest.version,
  zip: zipPath,
  sha256,
  permissions: manifest.permissions,
  hostPermissions: manifest.host_permissions ?? [],
  commands: manifest.commands ?? null
}
mkdirSync(join(root, 'artifacts'), { recursive: true })
writeFileSync(join(root, 'artifacts/chrome-local-release.json'), `${JSON.stringify(record, null, 2)}\n`)

console.log('\n[local-release] PASS')
console.log(`[local-release] ${zipPath}`)
console.log(`[local-release] sha256 ${sha256}`)
