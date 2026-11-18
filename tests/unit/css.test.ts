import { describe, expect, it, vi } from 'vitest'
import { inlineCssAssets } from '../../apps/extension/src/background/build'
import { TimeoutError, withTimeout } from '../../apps/extension/src/background/timeout'

function response(bytes: Uint8Array, type: string): Response {
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
  return new Response(buffer, { status: 200, headers: { 'content-type': type } })
}

describe('inlineCssAssets', () => {
  it('inlines background images and fonts', async () => {
    const html =
      '<style>body{background:url(https://example.com/bg.png)}@font-face{src:url("https://example.com/f.woff2")}</style>'
    const fetchImpl = vi.fn(async (url: string) =>
      response(new Uint8Array([1, 2, 3]), url.endsWith('.woff2') ? 'font/woff2' : 'image/png')
    )
    const output = await inlineCssAssets(html, { fetchImpl: fetchImpl as unknown as typeof fetch })
    expect(output).toContain('url(data:image/png;base64,AQID)')
    expect(output).toContain('url(data:font/woff2;base64,AQID)')
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('leaves data URLs and failed fetches untouched', async () => {
    const html =
      '<style>a{background:url(data:image/png;base64,AAA)}b{background:url(https://example.com/x.png)}</style>'
    const fetchImpl = vi.fn(async () => {
      throw new Error('CORS')
    })
    const output = await inlineCssAssets(html, { fetchImpl: fetchImpl as unknown as typeof fetch })
    expect(output).toContain('url(data:image/png;base64,AAA)')
    expect(output).toContain('url(https://example.com/x.png)')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('respects the asset and total budgets', async () => {
    const html = '<style>a{background:url(https://example.com/big.png)}</style>'
    const fetchImpl = vi.fn(async () => response(new Uint8Array(100), 'image/png'))
    const output = await inlineCssAssets(html, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      maxAssetBytes: 10
    })
    expect(output).toContain('url(https://example.com/big.png)')
  })
})

describe('withTimeout', () => {
  it('resolves before the deadline', async () => {
    await expect(withTimeout(Promise.resolve(42), 50, 'slow')).resolves.toBe(42)
  })

  it('rejects with a typed timeout', async () => {
    const pending = new Promise<never>(() => {})
    await expect(withTimeout(pending, 10, 'too slow')).rejects.toBeInstanceOf(TimeoutError)
  })
})
