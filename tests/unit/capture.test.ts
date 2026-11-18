// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { JSDOM } from 'jsdom'
import { extractMetadata, sanitizeElement, snapshotDocument, storeAssets } from '@graphock/capture'

function dom(html: string): Document {
  return new JSDOM(html, { url: 'https://example.com/page' }).window.document
}

describe('metadata extraction', () => {
  it('prefers og/twitter metadata and resolves absolute links', () => {
    const document = dom(`<!doctype html><html lang="zh-CN"><head>
      <title>Fallback title</title>
      <meta property="og:title" content="OG title">
      <meta name="author" content="Ada">
      <meta property="article:published_time" content="2026-11-01T00:00:00.000Z">
      <meta property="og:site_name" content="Example">
      <link rel="canonical" href="/canonical">
      <link rel="icon" href="/favicon.ico">
    </head><body><p>hi</p></body></html>`)

    expect(extractMetadata(document, 'https://example.com/page')).toEqual({
      url: 'https://example.com/page',
      title: 'OG title',
      canonicalUrl: 'https://example.com/canonical',
      lang: 'zh-CN',
      author: 'Ada',
      publishedAt: '2026-11-01T00:00:00.000Z',
      siteName: 'Example',
      faviconUrl: 'https://example.com/favicon.ico'
    })
  })

  it('falls back to document title and JSON-LD', () => {
    const document = dom(`<!doctype html><html><head>
      <title>Doc title</title>
      <script type="application/ld+json">{"@type":"Article","headline":"LD headline","author":{"name":"Grace"}}</script>
    </head><body></body></html>`)
    const source = extractMetadata(document, 'https://example.com/x')
    expect(source.title).toBe('LD headline')
    expect(source.author).toBe('Grace')
  })

  it('survives malformed JSON-LD', () => {
    const document = dom(`<!doctype html><html><head>
      <title>Title</title>
      <script type="application/ld+json">{not json</script>
    </head><body></body></html>`)
    expect(extractMetadata(document, 'https://example.com/x').title).toBe('Title')
  })
})

describe('sanitization', () => {
  it('removes scripts, handlers and dangerous URLs', () => {
    const document = dom(`<!doctype html><html><body>
      <script>alert(1)</script>
      <a id="bad" href="javascript:alert(2)">bad</a>
      <a id="good" href="/docs">good</a>
      <img id="img" src="/a.png" onerror="alert(3)">
      <form><input type="password" value="secret"></form>
      <div onclick="alert(4)">click</div>
    </body></html>`)

    const cleaned = sanitizeElement(document.body)
    expect(cleaned.querySelector('script')).toBeNull()
    expect(cleaned.querySelector('form')).toBeNull()
    expect(cleaned.querySelector('#bad')?.getAttribute('href')).toBeNull()
    expect(cleaned.querySelector('[onclick]')).toBeNull()
    expect(cleaned.querySelector('#img')?.getAttribute('onerror')).toBeNull()
    expect(cleaned.querySelector('#img')?.getAttribute('src')).toBe('https://example.com/a.png')
    expect(cleaned.querySelector('#good')?.getAttribute('href')).toBe('https://example.com/docs')
  })

  it('does not mutate the live page', () => {
    const document = dom('<!doctype html><html><body><script>alert(1)</script><p id="p">x</p></body></html>')
    sanitizeElement(document.body)
    expect(document.querySelector('script')).not.toBeNull()
    expect(document.querySelector('#p')?.textContent).toBe('x')
  })

  it('snapshots a full document without scripts', () => {
    const document = dom('<!doctype html><html lang="en"><body><script>alert(1)</script><h1>Hi</h1></body></html>')
    const html = snapshotDocument(document)
    expect(html.startsWith('<!doctype html>')).toBe(true)
    expect(html).not.toContain('alert(1)')
    expect(html).toContain('<h1>Hi</h1>')
  })
})

describe('asset storage', () => {
  it('deduplicates identical bytes and derives paths from the digest', async () => {
    const bytes = new TextEncoder().encode('same bytes')
    const assets = await storeAssets([
      { bytes, mimeType: 'image/png', sourceUrl: 'https://a/1.png' },
      { bytes: new TextEncoder().encode('same bytes'), mimeType: 'image/png' },
      { bytes: new TextEncoder().encode('other'), mimeType: 'image/jpeg' }
    ])
    expect(assets).toHaveLength(2)
    expect(assets[0]?.path.startsWith('assets/a1-')).toBe(true)
    expect(assets[0]?.path.endsWith('.png')).toBe(true)
    expect(assets[1]?.path.endsWith('.jpg')).toBe(true)
    expect(assets[0]?.sha256).toHaveLength(64)
  })
})
