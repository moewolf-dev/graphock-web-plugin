import { describe, expect, it } from 'vitest'
import yaml from 'js-yaml'
import {
  buildFilename,
  sanitizeFilenamePart,
  toHtml,
  toJson,
  toMarkdown,
  toPlainText,
  toYaml,
  truncateSlug,
  validateDownloadSubdirectory
} from '@graphock/converters'
import { sampleDocument } from '../helpers/clip.js'

describe('filename rules', () => {
  it('strips characters that are illegal on Windows', () => {
    expect(sanitizeFilenamePart('a<b>c:d"e/f\\g|h?i*j')).toBe('a b c d e f g h i j')
  })

  it('escapes reserved device names', () => {
    expect(sanitizeFilenamePart('CON')).toBe('CON-file')
    expect(sanitizeFilenamePart('lpt9')).toBe('lpt9-file')
  })

  it('trims trailing dots and spaces', () => {
    expect(sanitizeFilenamePart('name... ')).toBe('name')
  })

  it('does not split surrogate pairs when truncating', () => {
    const value = `${'a'.repeat(79)}😀😀`
    const result = truncateSlug(value)
    expect(result.length).toBeLessThanOrEqual(80)
    expect(result.endsWith('\ud83d')).toBe(false)
  })

  it('builds the default template', () => {
    expect(
      buildFilename({
        date: new Date('2026-11-18T06:00:00.000Z'),
        title: '示例 文章: part 1',
        clipId: 'a1b2c3d4-0000-4000-8000-000000000000',
        extension: 'md'
      })
    ).toBe('2026-11-18-示例 文章 part 1-a1b2c3d4.md')
  })

  it('keeps Chinese and emoji titles', () => {
    const name = buildFilename({
      date: '2026-11-18T00:00:00.000Z',
      title: '中文标题 🚀',
      clipId: 'ffffffff-0000-4000-8000-000000000000',
      extension: '.json'
    })
    expect(name).toBe('2026-11-18-中文标题 🚀-ffffffff.json')
  })

  it('validates download subdirectories', () => {
    expect(validateDownloadSubdirectory(' Graphock/2026 ')).toBe('Graphock/2026')
    expect(validateDownloadSubdirectory('')).toBe('')
    expect(() => validateDownloadSubdirectory('../escape')).toThrow()
    expect(() => validateDownloadSubdirectory('a/b/c/d')).toThrow()
  })
})

describe('markdown', () => {
  const options = { generatorName: 'graphock-web-plugin', generatorVersion: '0.1.0' }

  it('renders frontmatter, headings, tables, code and lists', () => {
    const markdown = toMarkdown(sampleDocument(), options)
    expect(markdown.startsWith('---\n')).toBe(true)
    expect(markdown).toContain('title: 示例文章 / Example article')
    expect(markdown).toContain('generator: graphock-web-plugin@0.1.0')
    expect(markdown).toContain('# 示例文章')
    expect(markdown).toContain('**world**')
    expect(markdown).toContain('[link](https://example.com/x)')
    expect(markdown).toContain('```ts\nconst answer = 42\n```')
    expect(markdown).toContain('| Name | Value |')
    expect(markdown).toContain('- first')
    expect(markdown).toContain('---\n')
  })

  it('escapes table pipes', () => {
    const document = sampleDocument({
      blocks: [
        {
          type: 'table',
          rows: [[{ text: 'a|b', header: true }], [{ text: 'c|d' }]]
        }
      ]
    })
    expect(toMarkdown(document, options)).toContain('a\\|b')
  })
})

describe('image rendering', () => {
  it('uses local paths for embedded assets and source URLs for linked ones', () => {
    const document = sampleDocument({
      blocks: [
        { type: 'image', assetId: 'a1', alt: 'Local' },
        { type: 'image', assetId: 'l1', alt: 'Remote' }
      ],
      assets: [
        {
          id: 'a1',
          path: 'assets/a1-12345678.png',
          mimeType: 'image/png',
          sha256: 'a'.repeat(64),
          bytes: 10,
          status: 'embedded'
        },
        {
          id: 'l1',
          path: 'assets/l1.linked',
          mimeType: 'image/*',
          sha256: 'b'.repeat(64),
          bytes: 0,
          sourceUrl: 'https://example.com/remote.png',
          status: 'linked'
        }
      ]
    })
    const markdown = toMarkdown(document, {
      generatorName: 'graphock-web-plugin',
      generatorVersion: '0.1.0'
    })
    expect(markdown).toContain('![Local](assets/a1-12345678.png)')
    expect(markdown).toContain('![Remote](https://example.com/remote.png)')
  })
})

describe('json and yaml', () => {
  it('produces deterministic JSON', () => {
    const document = sampleDocument()
    expect(toJson(document)).toBe(toJson(document))
    expect(toJson(document).endsWith('\n')).toBe(true)
  })

  it('yaml round-trips to the same object as JSON', () => {
    const document = sampleDocument()
    const fromYaml = yaml.load(toYaml(document))
    expect(fromYaml).toEqual(JSON.parse(toJson(document)))
  })
})

describe('html', () => {
  it('escapes content and never emits scripts', () => {
    const document = sampleDocument({
      source: { url: 'https://example.com', title: '<script>alert(1)</script>' },
      blocks: [
        {
          type: 'paragraph',
          inline: [{ type: 'text', text: '<img src=x onerror=alert(1)>' }]
        }
      ]
    })
    const html = toHtml(document)
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
    expect(html).toContain('Content-Security-Policy')
  })
})

describe('plain text', () => {
  it('flattens blocks with readable spacing', () => {
    const text = toPlainText(sampleDocument())
    expect(text).toContain('示例文章')
    expect(text).toContain('Hello world')
    expect(text).toContain('Name\tValue')
  })
})
