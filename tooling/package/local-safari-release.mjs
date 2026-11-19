#!/usr/bin/env node
/**
 * Local-only Safari release archive.
 *
 * Xcode-dependent build/archive/notarization steps must never run in remote CI.
 * Run this on the release Mac:
 *
 *   pnpm release:safari:local
 */
import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

if (process.platform !== 'darwin') {
  console.error('release:safari:local: this command requires macOS with Xcode')
  process.exit(1)
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

execFileSync('node', [join(root, 'tooling/build/safari-project.mjs')], { cwd: root, stdio: 'inherit' })
execFileSync('pnpm', ['package:safari'], { cwd: root, stdio: 'inherit' })

const artifact = join(root, 'artifacts/safari/GraphockWebClipper-unsigned.xcarchive.zip')
const digest = await readFile(`${artifact}.sha256`, 'utf8').catch(() => '')
console.log(`\nSafari archive: ${artifact}`)
console.log(digest.trim() || '(sha256 file missing)')
console.log('\nNext: sign/notarize/upload on this machine — see docs/release-safari-local.md')
