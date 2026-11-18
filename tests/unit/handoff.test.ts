import { describe, expect, it } from 'vitest'
import {
  ProtocolError,
  buildFileUrl,
  buildInlineUrl,
  buildWakeUrl,
  decodePayload,
  encodePayload,
  parseImportUrl,
  validatePayload
} from '@graphock/handoff'
import { samplePayload } from '../helpers/clip.js'

describe('inline payload encoding', () => {
  it('round-trips a payload', async () => {
    const payload = await samplePayload()
    const encoded = encodePayload(payload)
    expect(encoded.startsWith('v1.')).toBe(true)
    const decoded = decodePayload(encoded)
    expect(decoded.clipId).toBe(payload.clipId)
    expect(decoded.document.content).toBe(payload.document.content)
  })

  it('rejects an unknown payload prefix', () => {
    expect(() => decodePayload('v2.abc')).toThrowError(ProtocolError)
  })

  it('rejects corrupted compression data', () => {
    expect(() => decodePayload('v1.not-valid-deflate')).toThrowError(/decompress/)
  })
})

describe('inline URL', () => {
  it('builds and parses an inline import URL', async () => {
    const payload = await samplePayload()
    const url = buildInlineUrl('graphock-direct', payload)
    expect(url.startsWith('graphock-direct://import#p=v1.')).toBe(true)

    const parsed = parseImportUrl(url)
    expect(parsed.channel).toBe('inline')
    if (parsed.channel !== 'inline') throw new Error('unreachable')
    expect(parsed.payload.clipId).toBe(payload.clipId)
    expect(parsed.urlLength).toBe(url.length)
  })

  it('rejects URLs beyond the character limit', async () => {
    const payload = await samplePayload()
    // Repetitive text compresses too well to hit the URL limit, so use
    // incompressible content: 2,000 UUIDs (~72 KB).
    const incompressible = Array.from({ length: 2000 }, () => crypto.randomUUID()).join(' ')
    const big = await samplePayload({
      document: { format: 'markdown', content: incompressible }
    })
    expect(() => buildInlineUrl('graphock-direct', big)).toThrowError(/limit/)
    expect(payload.clipId).toBeTruthy()
  })

  it('rejects unknown routes', () => {
    expect(() => parseImportUrl('graphock-direct://callback#p=v1.abc')).toThrowError(/Unsupported route/)
  })

  it('rejects unknown schemes only when asked to', async () => {
    const payload = await samplePayload()
    const url = buildInlineUrl('something-else', payload)
    const parsed = parseImportUrl(url)
    expect(parsed.scheme).toBe('something-else')
  })
})

describe('file and wake URLs', () => {
  it('builds and parses a file handoff URL', () => {
    const url = buildFileUrl('graphock-direct', '/Users/me/Downloads/Graphock/clip.json', '22222222-2222-4222-8222-222222222222')
    const parsed = parseImportUrl(url)
    expect(parsed.channel).toBe('file')
    if (parsed.channel !== 'file') throw new Error('unreachable')
    expect(parsed.filePath).toBe('/Users/me/Downloads/Graphock/clip.json')
    expect(parsed.clipId).toBe('22222222-2222-4222-8222-222222222222')
  })

  it('accepts Windows absolute paths', () => {
    const url = buildFileUrl('graphock-direct', 'C:\\Users\\me\\Downloads\\clip.json')
    const parsed = parseImportUrl(url)
    expect(parsed.channel).toBe('file')
  })

  it('rejects relative paths', () => {
    expect(() => buildFileUrl('graphock-direct', 'relative/clip.json')).toThrowError(ProtocolError)
  })

  it('recognises a wake-only URL', () => {
    expect(parseImportUrl(buildWakeUrl('graphock')).channel).toBe('wake')
  })
})

describe('payload validation', () => {
  it('rejects a tampered checksum', async () => {
    const payload = await samplePayload()
    await expect(validatePayload({ ...payload, checksum: 'f'.repeat(64) })).rejects.toThrowError(
      /checksum/i
    )
  })

  it('rejects an unknown schema version', async () => {
    const payload = await samplePayload()
    await expect(
      validatePayload({ ...payload, protocolVersion: 2 })
    ).rejects.toThrowError(/schema/i)
  })

  it('rejects asset paths with traversal', async () => {
    const payload = await samplePayload()
    await expect(
      validatePayload({
        ...payload,
        assets: [
          {
            path: '../evil.png',
            mimeType: 'image/png',
            sha256: 'a'.repeat(64)
          }
        ]
      })
    ).rejects.toThrowError(/schema/i)
  })
})
