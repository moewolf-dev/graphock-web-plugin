import { describe, expect, it } from 'vitest'
import {
  canonicalize,
  clipDocumentSchema,
  computeDocumentChecksum,
  countBlocks,
  documentStats
} from '@graphock/clip-model'
import { sampleDocument } from '../helpers/clip.js'

describe('canonicalize', () => {
  it('sorts object keys and omits undefined values', () => {
    expect(canonicalize({ b: 1, a: 2, c: undefined })).toBe('{"a":2,"b":1}')
  })

  it('keeps array order', () => {
    expect(canonicalize([2, 1])).toBe('[2,1]')
  })

  it('rejects non-finite numbers', () => {
    expect(() => canonicalize({ value: Number.NaN })).toThrow(TypeError)
  })
})

describe('document checksum', () => {
  it('is stable across property insertion order', async () => {
    const document = sampleDocument()
    const first = await computeDocumentChecksum({
      clipId: document.clipId,
      mode: document.mode,
      source: document.source,
      blocks: document.blocks,
      assets: []
    })
    const second = await computeDocumentChecksum({
      clipId: document.clipId,
      mode: document.mode,
      source: { ...document.source },
      blocks: document.blocks.map((block) => ({ ...block })),
      assets: []
    })
    expect(first).toBe(second)
    expect(first).toMatch(/^[a-f0-9]{64}$/)
  })

  it('changes when content changes', async () => {
    const base = sampleDocument()
    const changed = sampleDocument({
      blocks: [{ type: 'paragraph', inline: [{ type: 'text', text: 'different' }] }]
    })
    const a = await computeDocumentChecksum({
      clipId: base.clipId,
      mode: base.mode,
      source: base.source,
      blocks: base.blocks,
      assets: []
    })
    const b = await computeDocumentChecksum({
      clipId: changed.clipId,
      mode: changed.mode,
      source: changed.source,
      blocks: changed.blocks,
      assets: []
    })
    expect(a).not.toBe(b)
  })
})

describe('document schema', () => {
  it('accepts a well-formed document', () => {
    const result = clipDocumentSchema.safeParse(sampleDocument())
    expect(result.success).toBe(true)
  })

  it('rejects asset paths with traversal', () => {
    const document = sampleDocument({
      assets: [
        {
          id: 'a1',
          path: '../escape.png',
          mimeType: 'image/png',
          sha256: 'a'.repeat(64),
          bytes: 3,
          status: 'embedded'
        }
      ]
    })
    expect(clipDocumentSchema.safeParse(document).success).toBe(false)
  })

  it('rejects unknown block types', () => {
    const document = {
      ...sampleDocument(),
      blocks: [{ type: 'script', text: 'alert(1)' }]
    }
    expect(clipDocumentSchema.safeParse(document).success).toBe(false)
  })
})

describe('stats', () => {
  it('counts nested blocks', () => {
    const document = sampleDocument()
    const count = countBlocks(document.blocks)
    expect(count).toBeGreaterThan(document.blocks.length)
    expect(documentStats(document.blocks, [], 10)).toEqual({
      blockCount: count,
      assetCount: 0,
      bytes: 10
    })
  })
})
