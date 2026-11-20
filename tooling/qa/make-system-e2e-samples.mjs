#!/usr/bin/env node
/**
 * Generate real handoff payloads for the packaged-App system test.
 *
 * Every success path gets its own clipId; only the dedicated duplicate case
 * reuses the inline id. Reusing one id across inline/file/picker would make the
 * second import hit E_DUPLICATE_CLIP, so the checklist would never exercise the
 * intended success path.
 *
 * Outputs (`artifacts/system-e2e/`):
 *   inline.url                  channel A, Direct
 *   inline-duplicate.url        same clipId as inline.url, for E_DUPLICATE_CLIP
 *   inline-mas.url              channel A, MAS scheme, separate clipId
 *   file.url                    channel B, Direct, temp payload
 *   file-mas.url                channel B, MAS scheme, must be rejected
 *   wake-direct.url /
 *   wake-mas.url                channel C
 *   wake-package.graphock-clip.json
 *                               the package the MAS picker should import
 */
import { createHash, randomUUID } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateRawSync } from 'node:zlib'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const outDir = join(root, 'artifacts/system-e2e')
const fileDir = join(tmpdir(), 'graphock-system-e2e')
mkdirSync(outDir, { recursive: true })
mkdirSync(fileDir, { recursive: true })

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

function makePayload(label, clipId = randomUUID()) {
  const createdAt = new Date().toISOString()
  const document = {
    format: 'markdown',
    content: [
      `# ${label}`,
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
  return {
    schema: 'graphock.clip.handoff/1',
    protocolVersion: 1,
    clipId,
    createdAt,
    source: {
      url: 'https://example.com/system-e2e',
      title: `Graphock ${label}`,
      canonicalUrl: 'https://example.com/system-e2e',
      lang: 'en',
      author: 'Graphock QA'
    },
    document,
    assets,
    generator: { name: 'graphock-web-plugin', version: '0.1.0', browser: 'system-e2e' },
    checksum
  }
}

function inlineUrlFor(scheme, payload) {
  const encoded = deflateRawSync(Buffer.from(JSON.stringify(payload), 'utf8'), {
    level: 9
  }).toString('base64url')
  return `${scheme}://import#p=v1.${encoded}`
}

function makeCase(name, scheme) {
  const payload = makePayload(name)
  const filePath = join(fileDir, `${name}-${payload.clipId}.graphock-clip.json`)
  writeFileSync(filePath, JSON.stringify(payload))
  return {
    clipId: payload.clipId,
    payload,
    filePath,
    fileUrl: `${scheme}://import?file=${encodeURIComponent(filePath)}&v=1&clipId=${payload.clipId}`,
    inlineUrl: inlineUrlFor(scheme, payload)
  }
}

const inline = makeCase('inline-direct', 'graphock-direct')
const file = makeCase('file-direct', 'graphock-direct')
const inlineMas = makeCase('inline-mas', 'graphock')
const fileMas = makeCase('file-mas', 'graphock')
const wakePackage = makeCase('wake-package', 'graphock')

const packagePath = join(outDir, 'wake-package.graphock-clip.json')
writeFileSync(packagePath, JSON.stringify(wakePackage.payload))
// Keep the temp copy so the wake picker and file-channel checks use the same
// validated bytes and an allowed root.
writeFileSync(wakePackage.filePath, JSON.stringify(wakePackage.payload))

for (const url of [
  inline.inlineUrl,
  inlineMas.inlineUrl,
  file.fileUrl,
  fileMas.fileUrl
]) {
  if (url.length > 24_000) throw new Error(`URL exceeds the 24,000 character limit`)
}

const files = {
  'inline.url': inline.inlineUrl,
  'inline-duplicate.url': inline.inlineUrl,
  'inline-mas.url': inlineMas.inlineUrl,
  'file.url': file.fileUrl,
  'file-mas.url': fileMas.fileUrl,
  'wake-direct.url': 'graphock-direct://import',
  'wake-mas.url': 'graphock://import',
  'handoff-inline.json': JSON.stringify(inline.payload, null, 2)
}
for (const [name, value] of Object.entries(files)) {
  writeFileSync(join(outDir, name), `${value}\n`)
}

const manifest = {
  createdAt: new Date().toISOString(),
  cases: {
    inline: {
      clipId: inline.clipId,
      url: 'inline.url',
      file: 'handoff-inline.json',
      expected: 'import succeeds once'
    },
    duplicate: {
      clipId: inline.clipId,
      url: 'inline-duplicate.url',
      expected: 'E_DUPLICATE_CLIP after inline succeeded in the same data dir'
    },
    file: { clipId: file.clipId, url: 'file.url', payload: file.filePath },
    inlineMas: { clipId: inlineMas.clipId, url: 'inline-mas.url' },
    fileMas: {
      clipId: fileMas.clipId,
      url: 'file-mas.url',
      expected: 'E_PATH_NOT_ALLOWED in the MAS build'
    },
    wakePackage: {
      clipId: wakePackage.clipId,
      pick: 'wake-package.graphock-clip.json',
      url: 'wake-mas.url or wake-direct.url'
    }
  }
}
writeFileSync(join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)

const openCommand =
  process.platform === 'darwin'
    ? 'open'
    : process.platform === 'win32'
      ? 'start ""'
      : 'xdg-open'
const readme = `Graphock system E2E samples (${manifest.createdAt})

Every success path has its own clipId:
  inline            ${inline.clipId}
  duplicate         ${inline.clipId}  (same URL, run after inline)
  file              ${file.clipId}
  inline MAS        ${inlineMas.clipId}
  file MAS          ${fileMas.clipId}
  wake package      ${wakePackage.clipId}

Run from the repository root after the App has registered the scheme:

  ${openCommand} "$(cat artifacts/system-e2e/inline.url)"
  ${openCommand} "$(cat artifacts/system-e2e/inline-duplicate.url)"
  ${openCommand} "$(cat artifacts/system-e2e/file.url)"
  ${openCommand} "$(cat artifacts/system-e2e/wake-direct.url)"

MAS:

  ${openCommand} "$(cat artifacts/system-e2e/inline-mas.url)"
  ${openCommand} "$(cat artifacts/system-e2e/file-mas.url)"
  ${openCommand} "$(cat artifacts/system-e2e/wake-mas.url)"
  # select artifacts/system-e2e/wake-package.graphock-clip.json

Use a separate App data directory for a repeatable run; the duplicate case is
only expected after the inline case in the same directory.
`
writeFileSync(join(outDir, 'README.txt'), readme)

console.log(`[system-e2e] inline ${inline.clipId}`)
console.log(`[system-e2e] file ${file.clipId}`)
console.log(`[system-e2e] MAS inline ${inlineMas.clipId}; MAS file ${fileMas.clipId}`)
console.log(`[system-e2e] wake package ${wakePackage.clipId} -> ${packagePath}`)
console.log(`[system-e2e] samples written to ${outDir}`)
