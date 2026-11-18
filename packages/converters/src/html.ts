import type { Block, ClipDocument, InlineNode, TableCell } from '@graphock/clip-model'

function escapeHtml(value: string): string {
  return value
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')
    .replace(/'/gu, '&#39;')
}

function renderInline(nodes: InlineNode[]): string {
  return nodes
    .map((node) => {
      switch (node.type) {
        case 'text':
          return escapeHtml(node.text)
        case 'code':
          return `<code>${escapeHtml(node.text)}</code>`
        case 'strong':
          return `<strong>${escapeHtml(node.text)}</strong>`
        case 'em':
          return `<em>${escapeHtml(node.text)}</em>`
        case 'link':
          return `<a href="${escapeHtml(node.href)}" rel="noopener noreferrer">${escapeHtml(node.text)}</a>`
        default:
          return ''
      }
    })
    .join('')
}

function renderTable(rows: TableCell[][]): string {
  const body = rows
    .map((row) => {
      const cells = row
        .map((cell) => {
          const tag = cell.header ? 'th' : 'td'
          const colspan = cell.colspan && cell.colspan > 1 ? ` colspan="${cell.colspan}"` : ''
          const rowspan = cell.rowspan && cell.rowspan > 1 ? ` rowspan="${cell.rowspan}"` : ''
          return `<${tag}${colspan}${rowspan}>${escapeHtml(cell.text)}</${tag}>`
        })
        .join('')
      return `<tr>${cells}</tr>`
    })
    .join('')
  return `<table>${body}</table>`
}

export type HtmlOptions = {
  assetDataUrlById?: Map<string, string>
}

export function renderBlocksHtml(blocks: Block[], options: HtmlOptions = {}): string {
  return blocks
    .map((block) => {
      switch (block.type) {
        case 'heading':
          return `<h${block.level}>${escapeHtml(block.text)}</h${block.level}>`
        case 'paragraph':
          return `<p>${renderInline(block.inline)}</p>`
        case 'image': {
          const src = options.assetDataUrlById?.get(block.assetId)
          if (!src) return ''
          const title = block.title ? ` title="${escapeHtml(block.title)}"` : ''
          return `<figure><img src="${escapeHtml(src)}" alt="${escapeHtml(block.alt)}"${title} loading="lazy"></figure>`
        }
        case 'table':
          return renderTable(block.rows)
        case 'code': {
          const lang = block.lang ? ` class="language-${escapeHtml(block.lang)}"` : ''
          return `<pre><code${lang}>${escapeHtml(block.text)}</code></pre>`
        }
        case 'quote':
          return `<blockquote>${renderBlocksHtml(block.blocks, options)}</blockquote>`
        case 'list': {
          const tag = block.ordered ? 'ol' : 'ul'
          const items = block.items
            .map((item) => `<li>${renderBlocksHtml(item, options)}</li>`)
            .join('')
          return `<${tag}>${items}</${tag}>`
        }
        case 'hr':
          return '<hr>'
        default:
          return ''
      }
    })
    .filter(Boolean)
    .join('\n')
}

/**
 * Self-contained HTML export. No scripts, no remote stylesheets, no inline
 * event handlers: the output must be safe to open offline and to re-import.
 */
export function toHtml(document: ClipDocument, options: HtmlOptions = {}): string {
  const title = escapeHtml(document.source.title || 'Untitled clip')
  const body = renderBlocksHtml(document.blocks, options)
  const source = escapeHtml(document.source.canonicalUrl ?? document.source.url)
  return `<!doctype html>
<html lang="${escapeHtml(document.source.lang ?? 'und')}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'">
<title>${title}</title>
<style>
:root { color-scheme: light dark; }
body { margin: 0 auto; max-width: 72ch; padding: 2rem 1.25rem 4rem; font: 16px/1.7 system-ui, -apple-system, "Segoe UI", sans-serif; }
img { max-width: 100%; height: auto; }
pre { overflow-x: auto; padding: 1rem; background: color-mix(in srgb, currentColor 8%, transparent); border-radius: 8px; }
table { border-collapse: collapse; width: 100%; }
th, td { border: 1px solid color-mix(in srgb, currentColor 25%, transparent); padding: .4rem .6rem; text-align: left; }
blockquote { margin: 1rem 0; padding-left: 1rem; border-left: 3px solid color-mix(in srgb, currentColor 25%, transparent); }
.clip-source { margin-top: 3rem; font-size: .85rem; opacity: .7; }
</style>
</head>
<body>
<article>
${body}
</article>
<footer class="clip-source">
<p>来源：<a href="${source}" rel="noopener noreferrer">${source}</a></p>
<p>抓取于 ${escapeHtml(document.createdAt)} · ${escapeHtml(document.generator.name)} ${escapeHtml(document.generator.version)}</p>
</footer>
</body>
</html>
`
}
