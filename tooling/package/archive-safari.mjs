#!/usr/bin/env node
/**
 * Build an unsigned Safari release archive for store preparation.
 * Signing/notarization require the Apple team credentials and stay manual.
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const project = join(root, 'apps/safari/Graphock Web Clipper/Graphock Web Clipper.xcodeproj')
const archives = join(root, 'artifacts/safari')
const archivePath = join(archives, 'GraphockWebClipper.xcarchive')

await rm(archives, { recursive: true, force: true })
await mkdir(archives, { recursive: true })

execFileSync(
  'xcodebuild',
  [
    'archive',
    '-project',
    project,
    '-scheme',
    'Graphock Web Clipper',
    '-configuration',
    'Release',
    '-destination',
    'platform=macOS',
    '-archivePath',
    archivePath,
    'CODE_SIGNING_ALLOWED=NO'
  ],
  { cwd: root, stdio: 'inherit' }
)

const zipName = 'GraphockWebClipper-unsigned.xcarchive.zip'
execFileSync('ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', archivePath, join(archives, zipName)])

const bytes = await readFile(join(archives, zipName))
const sha = createHash('sha256').update(bytes).digest('hex')
await writeFile(join(archives, `${zipName}.sha256`), `${sha}  ${zipName}\n`)
console.log(`package:safari: ${zipName} (${bytes.byteLength} bytes, sha256 ${sha.slice(0, 16)}…)`)
