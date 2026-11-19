import { describe, expect, it } from 'vitest'
import {
  buildFilename,
  sanitizeFilenamePart,
  toHtml,
  toMarkdown,
  validateDownloadSubdirectory
} from '@graphock/converters'
import { sampleDocument } from '../helpers/clip.js'

const options = { generatorName: 'graphock-web-plugin', generatorVersion: '0.1.0' }

describe('markdown edge cases', () => {
  it('renders nested quotes, lists, hr and missing assets', () => {
    const document = sampleDocument({
      blocks: [
        {
          type: 'quote',
          blocks: [
            { type: 'paragraph', inline: [{ type: 'text', text: 'quoted' }] },
            { type: 'list', ordered: true, items: [[{ type: 'paragraph', inline: [{ type: 'text', text: 'one' }] }]] }
          ]
        },
        { type: 'image', assetId: 'missing', alt: 'Missing' },
        { type: 'hr' }
      ]
    })
    const markdown = toMarkdown(document, options)
    expect(markdown).toContain('> quoted')
    expect(markdown).toContain('> 1. one')
    expect(markdown).not.toContain('Missing]')
    expect(markdown).toContain('---')
  })

  it('renders an empty table without throwing', () => {
    const document = sampleDocument({ blocks: [{ type: 'table', rows: [] }] })
    expect(() => toMarkdown(document, options)).not.toThrow()
  })
})

describe('html edge cases', () => {
  it('renders every block type with an asset and a table caption', () => {
    const document = sampleDocument({
      blocks: [
        { type: 'heading', level: 2, text: 'H' },
        { type: 'paragraph', inline: [{ type: 'code', text: 'x' }, { type: 'strong', text: 'b' }, { type: 'em', text: 'i' }] },
        { type: 'image', assetId: 'a1', alt: 'A', title: 'T' },
        { type: 'table', caption: 'Cap', rows: [[{ text: 'a', header: true, colspan: 2 }]] },
        { type: 'code', lang: 'ts', text: 'const x = 1' },
        { type: 'quote', blocks: [{ type: 'paragraph', inline: [{ type: 'text', text: 'q' }] }] },
        { type: 'list', ordered: true, items: [[{ type: 'paragraph', inline: [{ type: 'text', text: 'item' }] }]] },
        { type: 'hr' }
      ],
      assets: [
        {
          id: 'a1',
          path: 'assets/a1.png',
          mimeType: 'image/png',
          sha256: 'a'.repeat(64),
          bytes: 3,
          status: 'embedded'
        }
      ]
    })
    const html = toHtml(document, { assetDataUrlById: new Map([['a1', 'data:image/png;base64,AAA']]) })
    expect(html).toContain('<h2>H</h2>')
    expect(html).toContain('<code>x</code>')
    expect(html).toContain('<img src="data:image/png;base64,AAA"')
    expect(html).toContain('<table>')
    expect(html).toContain('colspan="2"')
    expect(html).toContain('<ol>')
    expect(html).toContain('<hr>')
  })

  it('drops an image without a data URL', () => {
    const document = sampleDocument({
      blocks: [{ type: 'image', assetId: 'missing', alt: 'x' }]
    })
    expect(toHtml(document)).not.toContain('<img')
  })
})

describe('filename edge cases', () => {
  it('handles empty and overlong titles', () => {
    expect(sanitizeFilenamePart('   ')).toBe('untitled')
    const name = buildFilename({
      date: '2026-11-18T00:00:00.000Z',
      title: 'a'.repeat(200),
      clipId: 'abcdef12-0000-4000-8000-000000000000',
      extension: 'md'
    })
    expect(name.length).toBeLessThan(110)
    expect(name).toContain('abcdef12')
  })

  it('rejects illegal subdirectory segments', () => {
    expect(() => validateDownloadSubdirectory('a/b/c/d')).toThrow()
    expect(() => validateDownloadSubdirectory('a//b')).toThrow()
    expect(() => validateDownloadSubdirectory('a/b\u0000')).toThrow()
  })
})
