import yaml from 'js-yaml'
import type { Block, ClipDocument, InlineNode, TableCell } from '@graphock/clip-model'

export type FrontmatterOptions = {
  generatorName: string
  generatorVersion: string
  clippedAt?: string
}

type RenderContext = {
  assetPathById: Map<string, string>
}

function escapeInlineText(text: string): string {
  return text.replace(/\\/gu, '\\\\').replace(/`/gu, '\\`')
}

function renderInline(nodes: InlineNode[]): string {
  return nodes
    .map((node) => {
      switch (node.type) {
        case 'text':
          return escapeInlineText(node.text)
        case 'code':
          return `\`${node.text.replace(/`/gu, '\\`')}\``
        case 'strong':
          return `**${escapeInlineText(node.text)}**`
        case 'em':
          return `*${escapeInlineText(node.text)}*`
        case 'link':
          return `[${node.text.replace(/\]/gu, '\\]')}](${node.href.replace(/\)/gu, '\\)')})`
        default:
          return ''
      }
    })
    .join('')
}

function renderTable(rows: TableCell[][]): string {
  if (rows.length === 0) return ''
  const width = Math.max(...rows.map((row) => row.length))
  const cell = (value: string | undefined) =>
    (value ?? '').replace(/\|/gu, '\\|').replace(/\n/gu, ' ')
  const lines: string[] = []
  const [first, ...rest] = rows
  lines.push(
    `| ${Array.from({ length: width }, (_, index) => cell(first?.[index]?.text)).join(' | ')} |`
  )
  lines.push(`| ${Array.from({ length: width }, () => '---').join(' | ')} |`)
  for (const row of rest) {
    lines.push(`| ${Array.from({ length: width }, (_, index) => cell(row[index]?.text)).join(' | ')} |`)
  }
  return lines.join('\n')
}

export function renderBlocks(blocks: Block[], context: RenderContext, indent = ''): string {
  const chunks: string[] = []
  for (const block of blocks) {
    switch (block.type) {
      case 'heading':
        chunks.push(`${'#'.repeat(block.level)} ${escapeInlineText(block.text)}`)
        break
      case 'paragraph':
        chunks.push(renderInline(block.inline))
        break
      case 'image': {
        const path = context.assetPathById.get(block.assetId)
        if (!path) break
        const title = block.title ? ` "${block.title.replace(/"/gu, '\\"')}"` : ''
        chunks.push(`![${block.alt.replace(/\]/gu, '\\]')}](${path}${title})`)
        break
      }
      case 'table':
        chunks.push(renderTable(block.rows))
        break
      case 'code':
        chunks.push(`\`\`\`${block.lang ?? ''}\n${block.text}\n\`\`\``)
        break
      case 'quote': {
        const inner = renderBlocks(block.blocks, context, indent)
        chunks.push(
          inner
            .split('\n')
            .map((line) => `> ${line}`)
            .join('\n')
        )
        break
      }
      case 'list': {
        const lines: string[] = []
        block.items.forEach((item, index) => {
          const marker = block.ordered ? `${index + 1}.` : '-'
          const rendered = renderBlocks(item, context, `${indent}   `)
          const [head, ...tail] = rendered.split('\n')
          lines.push(`${indent}${marker} ${head ?? ''}`)
          for (const line of tail) lines.push(`${indent}   ${line}`)
        })
        chunks.push(lines.join('\n'))
        break
      }
      case 'hr':
        chunks.push('---')
        break
      default:
        break
    }
  }
  return chunks.filter((chunk) => chunk !== '').join('\n\n')
}

export function renderFrontmatter(document: ClipDocument, options: FrontmatterOptions): string {
  const meta: Record<string, unknown> = {
    title: document.source.title,
    url: document.source.url,
    site: document.source.siteName,
    author: document.source.author,
    published: document.source.publishedAt,
    clipped: options.clippedAt ?? document.createdAt,
    mode: document.mode,
    generator: `${options.generatorName}@${options.generatorVersion}`
  }
  for (const key of Object.keys(meta)) {
    if (meta[key] === undefined || meta[key] === null || meta[key] === '') delete meta[key]
  }
  const dumped = yaml.dump(meta, { lineWidth: -1, noRefs: true, sortKeys: false }).trimEnd()
  return `---\n${dumped}\n---\n`
}

export function toMarkdown(document: ClipDocument, options: FrontmatterOptions): string {
  const context: RenderContext = {
    assetPathById: new Map(document.assets.map((asset) => [asset.id, asset.path]))
  }
  const body = renderBlocks(document.blocks, context)
  return `${renderFrontmatter(document, options)}\n${body}\n`
}

export function toPlainText(document: ClipDocument): string {
  const lines: string[] = []
  const walk = (blocks: Block[]): void => {
    for (const block of blocks) {
      switch (block.type) {
        case 'heading':
          lines.push(block.text, '')
          break
        case 'paragraph':
          lines.push(
            block.inline
              .map((node) => ('text' in node ? node.text : ''))
              .join('')
              .trim(),
            ''
          )
          break
        case 'code':
          lines.push(block.text, '')
          break
        case 'quote':
          walk(block.blocks)
          break
        case 'list':
          for (const item of block.items) walk(item)
          break
        case 'table':
          for (const row of block.rows) lines.push(row.map((cell) => cell.text).join('\t'))
          lines.push('')
          break
        case 'image':
          if (block.alt) lines.push(`[${block.alt}]`, '')
          break
        default:
          break
      }
    }
  }
  walk(document.blocks)
  return `${lines.join('\n').replace(/\n{3,}/gu, '\n\n').trim()}\n`
}
