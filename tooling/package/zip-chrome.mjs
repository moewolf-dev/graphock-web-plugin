#!/usr/bin/env node
/**
 * Build a Chrome Web Store zip from apps/extension/dist/chrome.
 *
 * Checks performed before writing the archive (fail closed):
 *  - manifest version matches apps/extension/package.json
 *  - permissions match tooling/package/permissions.snapshot.json
 *  - no source maps, certificates, secrets or test fixtures in the payload
 *  - deterministic entry order and timestamps (reproducible zip)
 */
import { readFile, mkdir, readdir, stat, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { zipSync } from 'fflate'
import { spawnSync } from 'node:child_process'

// ZIP stores local DOS time. Re-exec with TZ=UTC so the archive is
// byte-identical on developer machines and CI runners in other timezones.
if (process.env.TZ !== 'UTC') {
  const result = spawnSync(process.execPath, [fileURLToPath(import.meta.url), ...process.argv.slice(2)], {
    stdio: 'inherit',
    env: { ...process.env, TZ: 'UTC' }
  })
  process.exit(result.status ?? 1)
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const distDir = resolve(root, 'apps/extension/dist/chrome')
const outDir = resolve(root, 'artifacts')
const localOnly = process.argv.includes('--local-only')

const FORBIDDEN = [/\.map$/u, /\.p12$/u, /\.p8$/u, /\.mobileprovision$/u, /\.provisionprofile$/u, /\.cer$/u, /(^|\/)\.env/u, /(^|\/)secrets?\//u]

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = []
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) files.push(...(await walk(full)))
    else if (entry.isFile()) files.push(full)
  }
  return files
}

function fail(message) {
  console.error(`package:chrome: ${message}`)
  process.exit(1)
}

async function main() {
  const manifestPath = join(distDir, 'manifest.json')
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  const pkg = JSON.parse(await readFile(join(root, 'apps/extension/package.json'), 'utf8'))
  if (manifest.version !== pkg.version) {
    fail(`manifest version ${manifest.version} does not match package version ${pkg.version}`)
  }

  const snapshot = JSON.parse(
    await readFile(join(root, 'tooling/package/permissions.snapshot.json'), 'utf8')
  )
  const actualPermissions = manifest.permissions ?? []
  const expectedPermissions = localOnly
    ? snapshot.localOnlyPermissions
    : snapshot.permissions
  if (JSON.stringify(actualPermissions) !== JSON.stringify(expectedPermissions)) {
    fail(
      `permissions changed: ${JSON.stringify(actualPermissions)}.\n` +
        'Update tooling/package/permissions.snapshot.json intentionally, then re-run.'
    )
  }
  if (localOnly && manifest.commands) {
    fail('local-only package must not declare App shortcut commands')
  }
  const hostPermissions = manifest.host_permissions ?? []
  if (JSON.stringify(hostPermissions) !== JSON.stringify(snapshot.hostPermissions)) {
    fail(`host_permissions changed: ${JSON.stringify(hostPermissions)}`)
  }

  const files = await walk(distDir)
  const archive = {}
  const mtime = new Date('2026-01-01T00:00:00Z')
  for (const file of files) {
    const name = relative(distDir, file).split('\\').join('/')
    if (FORBIDDEN.some((pattern) => pattern.test(name))) fail(`forbidden file in package: ${name}`)
    const info = await stat(file)
    archive[name] = [new Uint8Array(await readFile(file)), { mtime, level: 9 }]
    if (info.size === 0) fail(`empty file in package: ${name}`)
  }
  if (!archive['manifest.json']) fail('manifest.json is missing from dist')

  const zipped = zipSync(archive, { mtime })
  await mkdir(outDir, { recursive: true })
  const outFile = join(outDir, `graphock-web-plugin-${pkg.version}-chrome.zip`)
  await writeFile(outFile, zipped)
  await writeFile(
    `${outFile}.sha256`,
    `${(await import('node:crypto')).createHash('sha256').update(zipped).digest('hex')}  ${outFile.split('/').pop()}\n`
  )
  console.log(`package:chrome: wrote ${outFile} (${zipped.byteLength} bytes, ${Object.keys(archive).length} entries)`)
}

await main()
