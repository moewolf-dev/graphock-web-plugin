// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { cloneForExport } from '@graphock/capture/dom'
import { sanitizeElement } from '@graphock/capture/sanitize'
import { fetchImages } from '@graphock/capture/images'
import { htmlToBlocks } from '@graphock/capture/blocks'

function dom(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html')
}

describe('hostile input', () => {
  it('drops javascript: and data:text/html links', () => {
    const document = dom(`<body>
      <a id="a" href="javascript:alert(1)">a</a>
      <a id="b" href="data:text/html,<script>alert(1)</script>">b</a>
      <img id="c" src="javascript:alert(2)">
    </body>`)
    const cleaned = sanitizeElement(document.body)
    expect(cleaned.querySelector('#a')?.getAttribute('href')).toBeNull()
    expect(cleaned.querySelector('#b')?.getAttribute('href')).toBeNull()
    expect(cleaned.querySelector('#c')?.getAttribute('src')).toBeNull()
  })

  it('does not emit links with dangerous schemes into blocks', () => {
    const document = dom('<body><p><a href="javascript:alert(1)">click</a></p></body>')
    const { blocks } = htmlToBlocks(document.body, { includeImages: false })
    expect(JSON.stringify(blocks)).not.toContain('javascript:')
    expect(JSON.stringify(blocks)).toContain('click')
  })

  it('bounds block extraction on a very large DOM', () => {
    const paragraphs = Array.from({ length: 10_000 }, (_, index) => `<p>row ${index}</p>`).join('')
    const document = dom(`<body>${paragraphs}</body>`)
    const started = Date.now()
    const { blocks } = htmlToBlocks(document.body, { includeImages: false, maxBlocks: 200 })
    expect(blocks.length).toBeLessThanOrEqual(200)
    expect(Date.now() - started).toBeLessThan(2_000)
  })

  it('clones deeply nested content without throwing', () => {
    let html = '<p>deep</p>'
    for (let index = 0; index < 500; index += 1) html = `<div>${html}</div>`
    const document = dom(`<body>${html}</body>`)
    const clone = cloneForExport(document.body)
    expect(clone.textContent).toContain('deep')
  })

  it('times out a hanging image fetch', async () => {
    const fetchImpl = vi.fn(
      (_input: URL | RequestInfo, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))
        })
    )
    const result = await fetchImages(
      [{ assetId: 'img-1', sourceUrl: 'https://example.com/a.png', alt: '' }],
      { fetchImpl: fetchImpl as unknown as typeof fetch, timeoutMs: 10 }
    )
    expect(result[0]?.status).toBe('failed')
  })
})
