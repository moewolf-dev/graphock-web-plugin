import type { Block, InlineNode, TableCell } from '@graphock/clip-model'

export type ImageRef = {
  assetId: string
  sourceUrl: string
  alt: string
  width?: number
  height?: number
}

export type BuildBlocksOptions = {
  /** Emit image blocks and collect their sources. Defaults to true. */
  includeImages?: boolean
  /** Drop chrome-like landmarks (nav/aside/footer) for full-page mode. */
  skipChrome?: boolean
  /** Hard stop to keep hostile pages bounded. */
  maxBlocks?: number
  /** Hard stop for total text, in characters. */
  maxTextChars?: number
}

export type BuildBlocksResult = {
  blocks: Block[]
  images: ImageRef[]
}

const ALWAYS_SKIP = new Set([
  'SCRIPT',
  'STYLE',
  'NOSCRIPT',
  'TEMPLATE',
  'IFRAME',
  'OBJECT',
  'EMBED',
  'FORM',
  'VIDEO',
  'AUDIO',
  'CANVAS',
  'SVG'
])

const CHROME_TAGS = new Set(['NAV', 'ASIDE', 'FOOTER'])

const BLOCK_CONTAINERS = new Set([
  'ARTICLE',
  'MAIN',
  'SECTION',
  'DIV',
  'HEADER',
  'BODY',
  'HTML',
  'FIGURE',
  'DETAILS'
])

const HEADINGS: Record<string, 1 | 2 | 3 | 4 | 5 | 6> = {
  H1: 1,
  H2: 2,
  H3: 3,
  H4: 4,
  H5: 5,
  H6: 6
}

function normalizeText(value: string): string {
  return value.replace(/\s+/gu, ' ').trim()
}

function resolveUrl(value: string, base: string | undefined): string {
  try {
    return new URL(value, base || 'about:blank').toString()
  } catch {
    return value
  }
}

function isElement(node: Node): node is Element {
  return node.nodeType === 1
}

function collectInline(node: Element, context: Context): InlineNode[] {
  const inline: InlineNode[] = []
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === 3) {
      const text = child.textContent ?? ''
      if (text) inline.push({ type: 'text', text })
      continue
    }
    if (!isElement(child)) continue
    const tag = child.tagName

    if (tag === 'BR') {
      inline.push({ type: 'text', text: ' ' })
      continue
    }
    if (tag === 'IMG') {
      // Images become their own block; keep the alt text inline so the
      // paragraph still reads correctly when images are skipped.
      const alt = normalizeText(child.getAttribute('alt') ?? '')
      if (alt) inline.push({ type: 'text', text: ` [${alt}] ` })
      continue
    }
    if (tag === 'CODE' || tag === 'KBD' || tag === 'SAMP') {
      inline.push({ type: 'code', text: child.textContent ?? '' })
      continue
    }
    if (tag === 'STRONG' || tag === 'B') {
      inline.push({ type: 'strong', text: normalizeText(child.textContent ?? '') })
      continue
    }
    if (tag === 'EM' || tag === 'I') {
      inline.push({ type: 'em', text: normalizeText(child.textContent ?? '') })
      continue
    }
    if (tag === 'A') {
      const href = child.getAttribute('href')?.trim()
      const text = normalizeText(child.textContent ?? '')
      if (href && !/^(javascript|vbscript):/iu.test(href)) {
        inline.push({ type: 'link', text, href })
      } else if (text) {
        inline.push({ type: 'text', text })
      }
      continue
    }
    inline.push(...collectInline(child, context))
  }
  return inline
}

function paragraphFrom(node: Element, context: Context): Block[] {
  const inline = collectInline(node, context).filter((item) => item.type !== 'text' || item.text.trim())
  const blocks: Block[] = []
  if (inline.length > 0) {
    context.count += 1
    context.chars += inline.reduce((total, item) => total + ('text' in item ? item.text.length : 0), 0)
    blocks.push({ type: 'paragraph', inline })
  }
  blocks.push(...collectImages(node, context))
  return blocks
}

function collectImages(node: Element, context: Context): Block[] {
  if (!context.includeImages) return []
  const blocks: Block[] = []
  const images = Array.from(node.querySelectorAll('img'))
  if (node.tagName === 'IMG') images.unshift(node as HTMLImageElement)
  for (const image of images) {
    const sourceUrl =
      (image as HTMLImageElement).currentSrc ||
      image.getAttribute('src')?.trim() ||
      image.getAttribute('data-src')?.trim() ||
      ''
    if (!sourceUrl || /^data:/iu.test(sourceUrl)) continue
    const absolute = resolveUrl(sourceUrl, image.ownerDocument?.baseURI)
    const assetId = `img-${context.images.length + 1}`
    const width = Number.parseInt(image.getAttribute('width') ?? '', 10)
    const height = Number.parseInt(image.getAttribute('height') ?? '', 10)
    context.images.push({
      assetId,
      sourceUrl: absolute,
      alt: normalizeText(image.getAttribute('alt') ?? ''),
      ...(Number.isFinite(width) && width > 0 ? { width } : {}),
      ...(Number.isFinite(height) && height > 0 ? { height } : {})
    })
    blocks.push({
      type: 'image',
      assetId,
      alt: normalizeText(image.getAttribute('alt') ?? '')
    })
    context.count += 1
  }
  return blocks
}

function tableFrom(table: Element): Block | null {
  const rows: TableCell[][] = []
  for (const row of Array.from(table.querySelectorAll('tr'))) {
    const cells: TableCell[] = []
    const inHead = row.closest('thead') !== null
    for (const cell of Array.from(row.children)) {
      const tag = cell.tagName
      if (tag !== 'TD' && tag !== 'TH') continue
      cells.push({
        text: normalizeText(cell.textContent ?? ''),
        ...(tag === 'TH' || inHead ? { header: true } : {})
      })
    }
    if (cells.length > 0) rows.push(cells)
  }
  if (rows.length === 0) return null
  const caption = table.querySelector('caption')?.textContent
  return { type: 'table', rows, ...(caption ? { caption: normalizeText(caption) } : {}) }
}

type Context = {
  includeImages: boolean
  skipChrome: boolean
  maxBlocks: number
  maxTextChars: number
  count: number
  chars: number
  images: ImageRef[]
}

function walk(node: Node, context: Context): Block[] {
  if (context.count >= context.maxBlocks || context.chars >= context.maxTextChars) return []

  if (node.nodeType === 3) {
    const text = normalizeText(node.textContent ?? '')
    if (!text) return []
    context.count += 1
    context.chars += text.length
    return [{ type: 'paragraph', inline: [{ type: 'text', text }] }]
  }
  if (!isElement(node)) return []

  const tag = node.tagName
  if (ALWAYS_SKIP.has(tag)) return []
  if (context.skipChrome && CHROME_TAGS.has(tag)) return []

  const heading = HEADINGS[tag]
  if (heading) {
    const text = normalizeText(node.textContent ?? '')
    if (!text) return []
    context.count += 1
    context.chars += text.length
    return [{ type: 'heading', level: heading, text }]
  }

  switch (tag) {
    case 'P':
      return paragraphFrom(node, context)
    case 'PRE': {
      const code = node.querySelector('code')
      const text = (code ?? node).textContent ?? ''
      if (!text.trim()) return []
      const className = (code ?? node).getAttribute('class') ?? ''
      const lang = /(?:language|lang)-([\w+-]+)/u.exec(className)?.[1]
      context.count += 1
      context.chars += text.length
      return [{ type: 'code', text, ...(lang ? { lang } : {}) }]
    }
    case 'BLOCKQUOTE': {
      const inner = walkChildren(node, context)
      if (inner.length === 0) return []
      context.count += 1
      return [{ type: 'quote', blocks: inner }]
    }
    case 'UL':
    case 'OL': {
      const items: Block[][] = []
      for (const item of Array.from(node.children)) {
        if (item.tagName !== 'LI') continue
        const inner = walkChildren(item, context)
        if (inner.length > 0) items.push(inner)
      }
      if (items.length === 0) return []
      context.count += 1
      return [{ type: 'list', ordered: tag === 'OL', items }]
    }
    case 'TABLE': {
      const table = tableFrom(node)
      if (!table) return []
      context.count += 1
      return [table]
    }
    case 'IMG':
      return collectImages(node, context)
    case 'HR':
      context.count += 1
      return [{ type: 'hr' }]
    case 'FIGURE': {
      const image = node.querySelector('img')
      if (image) {
        const blocks = collectImages(node, context)
        const caption = node.querySelector('figcaption')?.textContent
        if (caption && normalizeText(caption)) {
          blocks.push({ type: 'paragraph', inline: [{ type: 'text', text: normalizeText(caption) }] })
        }
        return blocks
      }
      return walkChildren(node, context)
    }
    default:
      if (BLOCK_CONTAINERS.has(tag)) return walkChildren(node, context)
      return paragraphFrom(node, context)
  }
}

function walkChildren(node: Element, context: Context): Block[] {
  const blocks: Block[] = []
  for (const child of Array.from(node.childNodes)) {
    blocks.push(...walk(child, context))
    if (context.count >= context.maxBlocks || context.chars >= context.maxTextChars) break
  }
  return blocks
}

/**
 * Convert a DOM subtree into the shared block model.
 *
 * The caller is responsible for sanitizing the subtree first; this function
 * only reads text and attributes, never executes anything.
 */
export function htmlToBlocks(root: Element, options: BuildBlocksOptions = {}): BuildBlocksResult {
  const context: Context = {
    includeImages: options.includeImages ?? true,
    skipChrome: options.skipChrome ?? false,
    maxBlocks: options.maxBlocks ?? 800,
    maxTextChars: options.maxTextChars ?? 400_000,
    count: 0,
    chars: 0,
    images: []
  }
  const blocks = walkChildren(root, context)
  return { blocks, images: context.images }
}
