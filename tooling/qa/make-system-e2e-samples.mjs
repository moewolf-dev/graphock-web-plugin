#!/usr/bin/env node
/**
 * Generate real handoff payloads for the packaged-App system test.
 *
 * Outputs live under `artifacts/system-e2e/` (git-ignored build output):
 *   inline.url      channel A, self-contained
 *   file.url        channel B, points at an allowed temp file
 *   wake-direct.url channel C for the Direct build
 *   wake-mas.url    channel C for the MAS build
 *   handoff.json    the same payload for inspection
 *
 * The inline document deliberately mentions `assets/pixel.png` in a code fence
 * and in prose: after import only the image reference may be rewritten.
 */
import { createHash, randomUUID } from 'node:crypto'
import { closeSync, mkdirSync, openSync, writeFileSync, writeSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateRawSync } from 'node:zlib'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const outDir = join(root, 'artifacts/system-e2e')
mkdirSync(outDir, { recursive: true })

const sha256 = (value) => createHash('sha256').update(value).digest('hex')

function canonicalize(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return JSON.stringify(value)
  }
  if (typeof value === 'number') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`
  if (typeof value === 'object') {
    const keys = Object.keys(value)
      .filter((key) => value[key] !== undefined)
      .sort()
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(',')}}`
  }
  throw new TypeError('Unsupported canonical value')
}

// 1x1 transparent PNG.
const assetBytes = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z1ZkAAAAASUVORK5CYII=',
  'base64'
)
const assetSha = sha256(assetBytes)
const clipId = randomUUID()
const createdAt = new Date().toISOString()
const document = {
  format: 'markdown',
  content: [
    '# Web clip system E2E',
    '',
    'Source: https://example.com/system-e2e',
    '',
    '![inline asset](assets/pixel.png)',
    '',
    '```text',
    'assets/pixel.png',
    '```',
    '',
    'The prose also mentions assets/pixel.png without becoming an image.',
    ''
  ].join('\n')
}
const assets = [
  {
    path: 'assets/pixel.png',
    mimeType: 'image/png',
    sha256: assetSha,
    data: assetBytes.toString('base64'),
    sourceUrl: 'https://example.com/pixel.png'
  }
]
const checksum = sha256(
  canonicalize({
    clipId,
    document,
    assets: assets.map(({ path, sha256: digest }) => ({ path, sha256: digest }))
  })
)

const payload = {
  schema: 'graphock.clip.handoff/1',
  protocolVersion: 1,
  clipId,
  createdAt,
  source: {
    url: 'https://example.com/system-e2e',
    title: 'Graphock system E2E clip',
    canonicalUrl: 'https://example.com/system-e2e',
    lang: 'en',
    author: 'Graphock QA'
  },
  document,
  assets,
  generator: { name: 'graphock-web-plugin', version: '0.1.0', browser: 'system-e2e' },
  checksum
}

const encoded = deflateRawSync(Buffer.from(JSON.stringify(payload), 'utf8'), {
  level: 9
}).toString('base64url')
const inlineUrl = `graphock-direct://import#p=v1.${encoded}`
if (inlineUrl.length > 24_000) {
  throw new Error(`inline URL exceeds the protocol limit: ${inlineUrl.length}`)
}

const fileDir = join(tmpdir(), 'graphock-system-e2e')
mkdirSync(fileDir, { recursive: true })
const filePath = join(fileDir, `handoff-${clipId}.json`)
writeFileSync(filePath, JSON.stringify(payload))
const fileUrl = `graphock-direct://import?file=${encodeURIComponent(filePath)}&v=1&clipId=${clipId}`

const files = {
  'inline.url': inlineUrl,
  'file.url': fileUrl,
  'wake-direct.url': 'graphock-direct://import',
  'wake-mas.url': 'graphock://import',
  'handoff.json': JSON.stringify(payload, null, 2)
}
for (const [name, value] of Object.entries(files)) {
  writeFileSync(join(outDir, name), `${value}\n`)
}

const openCommand =
  process.platform === 'darwin'
    ? 'open'
    : process.platform === 'win32'
      ? 'start ""'
      : 'xdg-open'
const readme = `Graphock system E2E samples (${createdAt})

clipId: ${clipId}
inline URL length: ${inlineUrl.length}
file payload: ${filePath}
file payload sha256: ${sha256(JSON.stringify(payload))}

Run from the repository root after the App has registered the scheme:

  ${openCommand} "$(cat artifacts/system-e2e/inline.url)"
  ${openCommand} "$(cat artifacts/system-e2e/file.url)"
  ${openCommand} "$(cat artifacts/system-e2e/wake-direct.url)"
  ${openCommand} "$(cat artifacts/system-e2e/wake-mas.url)"

Run the inline command twice to exercise E_DUPLICATE_CLIP.

Expected document after import:
- the image becomes a data: URL;
- the code fence and prose still contain assets/pixel.png;
- the file appears in the workspace file list.
`
writeFileSync(join(outDir, 'README.txt'), readme)
writeFileSync(
  join(outDir, 'manifest.json'),
  `${JSON.stringify({ clipId, createdAt, inlineUrlLength: inlineUrl.length, filePath, checksum }, null, 2)}\n`
)

const logFd = openSync(join(outDir, 'created.log'), 'a')
writeSync(logFd, `${createdAt}\t${clipId}\t${inlineUrl.length}\n`)
closeSync(logFd)

console.log(`[system-e2e] clip ${clipId}`)
console.log(`[system-e2e] inline length ${inlineUrl.length}; file payload ${filePath}`)
console.log(`[system-e2e] samples written to ${outDir}`)
