import { describe, expect, it } from 'vitest'
import { deflateSync, strToU8 } from 'fflate'
import {
  ProtocolError,
  base64ToBytes,
  base64UrlToBytes,
  bytesToBase64,
  bytesToBase64Url,
  decodePayload,
  isAbsolutePath,
  parseImportUrl,
  validatePayload
} from '@graphock/handoff'
import { computeHandoffChecksum } from '@graphock/clip-model'
import { samplePayload } from '../helpers/clip.js'

describe('base64 helpers', () => {
  it('round-trips standard and url-safe base64', () => {
    const bytes = Uint8Array.from([0, 1, 2, 250, 251, 252])
    expect(Array.from(base64ToBytes(bytesToBase64(bytes)))).toEqual(Array.from(bytes))
    expect(Array.from(base64UrlToBytes(bytesToBase64Url(bytes)))).toEqual(Array.from(bytes))
  })
})

describe('payload decoding edge cases', () => {
  it('rejects an empty inline body', () => {
    expect(() => decodePayload('v1.')).toThrowError(ProtocolError)
  })

  it('rejects deflated data that is not JSON', () => {
    const encoded = bytesToBase64Url(deflateSync(strToU8('not json')))
    expect(() => decodePayload(`v1.${encoded}`)).toThrowError(/JSON/)
  })

  it('rejects too many assets on both channels', async () => {
    const payload = await samplePayload()
    const assets = Array.from({ length: 501 }, (_, index) => ({
      path: `assets/a${index}.png`,
      mimeType: 'image/png',
      sha256: 'a'.repeat(64)
    }))
    const withAssets = { ...payload, assets }
    withAssets.checksum = await computeHandoffChecksum({
      clipId: withAssets.clipId,
      document: withAssets.document,
      assets
    })
    await expect(validatePayload(withAssets)).rejects.toMatchObject({ code: 'E_LIMIT_EXCEEDED' })
    await expect(validatePayload(withAssets, { channel: 'file' })).rejects.toMatchObject({
      code: 'E_LIMIT_EXCEEDED'
    })
  })
})

describe('path helpers', () => {
  it('accepts POSIX and Windows absolute paths only', () => {
    expect(isAbsolutePath('/Users/me/clip.json')).toBe(true)
    expect(isAbsolutePath('C:\\Users\\me\\clip.json')).toBe(true)
    expect(isAbsolutePath('relative/clip.json')).toBe(false)
    expect(isAbsolutePath('')).toBe(false)
    expect(isAbsolutePath('/tmp/with\0nul')).toBe(false)
  })

  it('rejects unsupported paths on the import route', () => {
    expect(() => parseImportUrl('graphock-direct://import/extra')).toThrowError(/path/)
  })
})
