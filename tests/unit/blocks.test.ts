// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { JSDOM } from 'jsdom'
import { htmlToBlocks, extractReadable } from '@graphock/capture'
import type { Block } from '@graphock/clip-model'

const ARTICLE = `<!doctype html><html lang="en"><head><title>Sample</title></head><body>
  <nav><a href="/">Home</a><a href="/about">About</a></nav>
  <main>
    <article>
      <h1>How to clip a page</h1>
      <p>This is the <strong>first</strong> paragraph with a <a href="https://example.com/x">link</a>.</p>
      <h2>Steps</h2>
      <ol>
        <li><p>Open the page</p></li>
        <li><p>Click the icon</p></li>
      </ol>
      <blockquote><p>Quoted text</p></blockquote>
      <pre><code class="language-ts">const x = 1</code></pre>
      <table>
        <thead><tr><th>Name</th><th>Value</th></tr></thead>
        <tbody><tr><td>a</td><td>1</td></tr></tbody>
      </table>
      <figure>
        <img src="/img/diagram.png" alt="Diagram" width="640" height="320">
        <figcaption>A diagram</figcaption>
      </figure>
      <p>Final paragraph.</p>
    </article>
  </main>
  <aside><p>Related links</p></aside>
  <footer><p>Copyright</p></footer>
  <script>alert(1)</script>
</body></html>`

function dom(html: string): Document {
  return new JSDOM(html, { url: 'https://example.com/post' }).window.document
}

function types(blocks: Block[]): string[] {
  return blocks.map((block) => block.type)
}

describe('htmlToBlocks', () => {
  it('converts headings, paragraphs, lists, quotes, code and tables', () => {
    const document = dom(ARTICLE)
    const article = document.querySelector('article')!
    const { blocks } = htmlToBlocks(article, { includeImages: false })
    expect(types(blocks)).toEqual([
      'heading',
      'paragraph',
      'heading',
      'list',
      'quote',
      'code',
      'table',
      'paragraph',
      'paragraph'
    ])

    const heading = blocks[0]
    expect(heading).toMatchObject({ type: 'heading', level: 1, text: 'How to clip a page' })

    const paragraph = blocks[1] as Extract<Block, { type: 'paragraph' }>
    expect(paragraph.inline).toEqual([
      { type: 'text', text: 'This is the ' },
      { type: 'strong', text: 'first' },
      { type: 'text', text: ' paragraph with a ' },
      { type: 'link', text: 'link', href: 'https://example.com/x' },
      { type: 'text', text: '.' }
    ])

    const list = blocks[3] as Extract<Block, { type: 'list' }>
    expect(list).toMatchObject({ type: 'list', ordered: true })
    expect(list.items).toHaveLength(2)

    const code = blocks[5]
    expect(code).toMatchObject({ type: 'code', lang: 'ts', text: 'const x = 1' })

    const table = blocks[6] as Extract<Block, { type: 'table' }>
    expect(table.rows[0]).toEqual([
      { text: 'Name', header: true },
      { text: 'Value', header: true }
    ])
    expect(table.rows[1]).toEqual([{ text: 'a' }, { text: '1' }])
  })

  it('drops chrome landmarks when asked', () => {
    const document = dom(ARTICLE)
    const { blocks } = htmlToBlocks(document.body, { includeImages: false, skipChrome: true })
    const text = JSON.stringify(blocks)
    expect(text).not.toContain('Related links')
    expect(text).not.toContain('Copyright')
    expect(text).toContain('How to clip a page')
    expect(text).not.toContain('alert(1)')
  })

  it('collects images and emits image blocks', () => {
    const document = dom(ARTICLE)
    const { blocks, images } = htmlToBlocks(document.querySelector('article')!, { includeImages: true })
    expect(images).toEqual([
      {
        assetId: 'img-1',
        sourceUrl: 'https://example.com/img/diagram.png',
        alt: 'Diagram',
        width: 640,
        height: 320
      }
    ])
    expect(blocks.some((block) => block.type === 'image')).toBe(true)
    const figureIndex = blocks.findIndex((block) => block.type === 'image')
    expect(blocks[figureIndex + 1]).toMatchObject({ type: 'paragraph' })
  })

  it('skips data: images', () => {
    const document = dom('<body><p><img src="data:image/png;base64,AAA" alt="inline"></p></body>')
    expect(htmlToBlocks(document.body, { includeImages: true }).images).toHaveLength(0)
  })

  it('stops at the block and character limits', () => {
    const paragraphs = Array.from({ length: 50 }, (_, index) => `<p>paragraph ${index}</p>`).join('')
    const document = dom(`<body>${paragraphs}</body>`)
    const limited = htmlToBlocks(document.body, { maxBlocks: 5, includeImages: false })
    expect(limited.blocks.length).toBeLessThanOrEqual(5)

    const long = dom(`<body><p>${'x'.repeat(500)}</p><p>after</p></body>`)
    const chars = htmlToBlocks(long.body, { maxTextChars: 100, includeImages: false })
    expect(JSON.stringify(chars.blocks)).not.toContain('after')
  })
})

describe('extractReadable', () => {
  it('extracts the article and ignores navigation', () => {
    const document = dom(ARTICLE)
    const readable = extractReadable(document)
    expect(readable.ok).toBe(true)
    // Readability may drop the duplicated <h1> and expose it as `title` instead.
    expect(readable.content?.textContent).toContain('This is the first paragraph')
    expect(readable.content?.textContent).not.toContain('Related links')
    expect(readable.title).toBe('How to clip a page')
    expect(readable.textLength).toBeGreaterThan(200)
  })

  it('does not mutate the original document', () => {
    const document = dom(ARTICLE)
    const before = document.body.innerHTML
    extractReadable(document)
    expect(document.body.innerHTML).toBe(before)
  })

  it('returns ok:false for a page with no article', () => {
    const document = dom('<body><div id="x"></div></body>')
    expect(extractReadable(document).ok).toBe(false)
  })
})
