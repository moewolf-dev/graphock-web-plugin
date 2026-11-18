import { describe, expect, it } from 'vitest'
import { base64ToBytes } from '@graphock/capture/base64'
import { buildClip } from '../../apps/extension/src/background/build'
import type { CollectedPage } from '../../apps/extension/src/shared/messages'

function collectedPage(images: CollectedPage['images']): CollectedPage {
  return {
    source: { url: 'https://example.com/post', title: '示例文章' },
    blocks: [
      { type: 'paragraph', inline: [{ type: 'text', text: 'Hello images.' }] },
      { type: 'image', assetId: 'img-1', alt: 'Diagram' },
      { type: 'image', assetId: 'img-2', alt: 'Second' }
    ],
    images,
    readable: true,
    text: 'Hello images.',
    selectionText: '',
    htmlBytes: 100,
    nodeCount: 10
  }
}

const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const pngBase64 = btoa(String.fromCharCode(...png))

function image(overrides: Partial<CollectedPage['images'][number]> = {}): CollectedPage['images'][number] {
  return {
    assetId: 'img-1',
    sourceUrl: 'https://example.com/img/diagram.png',
    alt: 'Diagram',
    status: 'fetched',
    mimeType: 'image/png',
    dataBase64: pngBase64,
    bytes: png.byteLength,
    ...overrides
  }
}

const generator = { name: 'graphock-web-plugin', version: '0.1.0' }

describe('buildClip', () => {
  it('embeds images, dedupes by content and rewrites markdown paths', async () => {
    const result = await buildClip(collectedPage([image(), image({ assetId: 'img-2', alt: 'Second' })]), {
      mode: 'readable',
      imagePolicy: 'embed',
      scheme: 'graphock-direct',
      format: 'markdown',
      generator
    })

    expect(result.stats).toMatchObject({ assetCount: 1, embedded: 1 })
    expect(result.document.assets[0]).toMatchObject({ status: 'embedded', mimeType: 'image/png' })
    expect(result.markdown).toContain('![Diagram](assets/a1-')
    expect(result.markdown).toContain('![Second](assets/a1-')
    expect(result.payload.assets[0]?.data).toBeTruthy()
    expect(base64ToBytes(result.payload.assets[0]!.data!).byteLength).toBe(png.byteLength)
  })

  it('keeps image links without embedding bytes', async () => {
    const result = await buildClip(collectedPage([image({ status: 'failed', dataBase64: undefined })]), {
      mode: 'readable',
      imagePolicy: 'link',
      scheme: 'graphock-direct',
      format: 'markdown',
      generator
    })
    expect(result.stats.linked).toBe(1)
    expect(result.document.assets[0]).toMatchObject({ status: 'linked', sourceUrl: 'https://example.com/img/diagram.png' })
    expect(result.markdown).toContain('https://example.com/img/diagram.png')
    expect(result.payload.assets).toHaveLength(0)
  })

  it('drops images entirely in text-only mode', async () => {
    const result = await buildClip(collectedPage([image()]), {
      mode: 'readable',
      imagePolicy: 'skip',
      scheme: 'graphock-direct',
      format: 'markdown',
      generator
    })
    expect(result.document.assets).toHaveLength(0)
    expect(result.document.blocks.some((block) => block.type === 'image')).toBe(false)
    expect(result.markdown).not.toContain('assets/')
  })

  it('reports an inline failure when an embedded clip cannot fit in a URL', async () => {
    const big = crypto.getRandomValues(new Uint8Array(60_000))
    const bigBase64 = btoa(String.fromCharCode(...big.subarray(0, 60_000)))
    const result = await buildClip(
      collectedPage([image({ dataBase64: bigBase64, bytes: 65536 })]),
      { mode: 'readable', imagePolicy: 'embed', scheme: 'graphock-direct', format: 'markdown', generator }
    )
    expect(result.inlineUrl).toBeUndefined()
    expect(result.inlineError?.code).toBe('E_URL_TOO_LONG')
    expect(result.stats.embedded).toBe(1)
  })

  it('serializes JSON and YAML from the same document', async () => {
    const json = await buildClip(collectedPage([]), {
      mode: 'readable',
      imagePolicy: 'skip',
      scheme: 'graphock-direct',
      format: 'json',
      generator
    })
    const parsed = JSON.parse(json.content)
    expect(parsed.schema).toBe('graphock.clip.document/1')
    expect(json.payload.document.format).toBe('json')

    const yaml = await buildClip(collectedPage([]), {
      mode: 'readable',
      imagePolicy: 'skip',
      scheme: 'graphock-direct',
      format: 'yaml',
      generator
    })
    expect(yaml.content).toContain('schema: graphock.clip.document/1')
    expect(yaml.payload.document.format).toBe('yaml')
  })

  it('uses the full-page snapshot for HTML output', async () => {
    const snapshot = '<!doctype html><html><head><style>body{color:red}</style></head><body><h1>Snapshot</h1></body></html>'
    const result = await buildClip(collectedPage([]), {
      mode: 'full',
      imagePolicy: 'skip',
      scheme: 'graphock-direct',
      format: 'html',
      htmlSnapshot: snapshot,
      generator
    })
    expect(result.content).toBe(snapshot)
    expect(result.payload.document.format).toBe('html')
  })

  it('reports failed images as linked and counts them', async () => {
    const result = await buildClip(collectedPage([image({ status: 'failed' })]), {
      mode: 'readable',
      imagePolicy: 'embed',
      scheme: 'graphock-direct',
      format: 'markdown',
      generator
    })
    expect(result.stats.failed).toBe(1)
    expect(result.stats.linked).toBe(1)
    expect(result.markdown).toContain('https://example.com/img/diagram.png')
  })
})
