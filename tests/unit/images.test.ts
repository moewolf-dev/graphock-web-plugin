import { describe, expect, it, vi } from 'vitest'
import { fetchImages } from '@graphock/capture/images'
import { inlineHtmlImages } from '../../apps/extension/src/background/build'

function image(sourceUrl: string, assetId = 'img-1') {
  return { assetId, sourceUrl, alt: 'x' }
}

function response(body: Uint8Array, type = 'image/png', status = 200): Response {
  const buffer = body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer
  return new Response(buffer, { status, headers: { 'content-type': type } })
}

describe('fetchImages', () => {
  it('fetches image bytes and encodes base64', async () => {
    const bytes = Uint8Array.from([1, 2, 3, 4])
    const fetchImpl = vi.fn(async () => response(bytes))
    const result = await fetchImages([image('https://example.com/a.png')], { fetchImpl })
    expect(result[0]).toMatchObject({ status: 'fetched', mimeType: 'image/png', bytes: 4 })
    expect(result[0]?.dataBase64).toBe(btoa(String.fromCharCode(...bytes)))
  })

  it('rejects non-image responses', async () => {
    const fetchImpl = vi.fn(async () => response(new Uint8Array([1]), 'text/html'))
    const result = await fetchImages([image('https://example.com/a')], { fetchImpl })
    expect(result[0]).toMatchObject({ status: 'failed' })
    expect(result[0]?.reason).toContain('Unsupported content type')
  })

  it('skips images above the per-image limit', async () => {
    const fetchImpl = vi.fn(async () => response(new Uint8Array(11)))
    const result = await fetchImages([image('https://example.com/a.png')], {
      fetchImpl,
      maxImageBytes: 10
    })
    expect(result[0]).toMatchObject({ status: 'skipped', reason: 'IMAGE_TOO_LARGE' })
  })

  it('stops adding bytes after the total budget and marks the rest skipped', async () => {
    const fetchImpl = vi.fn(async () => response(new Uint8Array(8)))
    const result = await fetchImages([image('https://example.com/1.png'), image('https://example.com/2.png', 'img-2')], {
      fetchImpl,
      maxTotalBytes: 10
    })
    expect(result[0]).toMatchObject({ status: 'fetched' })
    expect(result[1]).toMatchObject({ status: 'skipped', reason: 'TOTAL_BUDGET' })
  })

  it('reports network errors as failed', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('CORS')
    })
    const result = await fetchImages([image('https://example.com/a.png')], { fetchImpl })
    expect(result[0]).toMatchObject({ status: 'failed', reason: 'CORS' })
  })
})

describe('inlineHtmlImages', () => {
  it('replaces both raw and HTML-escaped URLs', () => {
    const html =
      '<img src="https://example.com/a.png?x=1&amp;y=2"><img src="https://example.com/b.png">'
    const output = inlineHtmlImages(html, [
      { sourceUrl: 'https://example.com/a.png?x=1&y=2', dataBase64: 'AAA', mimeType: 'image/png' },
      { sourceUrl: 'https://example.com/b.png' }
    ])
    expect(output).toContain('src="data:image/png;base64,AAA"')
    expect(output).toContain('src="https://example.com/b.png"')
  })
})
