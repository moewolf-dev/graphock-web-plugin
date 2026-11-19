export type CloneOptions = {
  /** Replace <iframe> with a visible placeholder figure. Defaults to true. */
  iframePlaceholders?: boolean
  /** Copy open shadow roots into a wrapper div. Defaults to true. */
  flattenShadowRoots?: boolean
}

const SKIP_TAGS = new Set(['SCRIPT', 'NOSCRIPT', 'TEMPLATE'])

function copyAttributes(source: Element, target: Element): void {
  for (const attribute of Array.from(source.attributes)) {
    if (SKIP_TAGS.has(source.tagName) && attribute.name.startsWith('on')) continue
    target.setAttribute(attribute.name, attribute.value)
  }
}

function iframePlaceholder(source: Element, doc: Document): Element {
  const src = source.getAttribute('src')?.trim() ?? ''
  const figure = doc.createElement('figure')
  figure.setAttribute('data-graphock-iframe', src)
  const caption = doc.createElement('figcaption')
  caption.textContent = src ? `Embedded content: ${src}` : 'Embedded content'
  figure.append(caption)
  return figure
}

/**
 * Deep-clone a subtree for export.
 *
 * Unlike `cloneNode(true)`, this:
 *  - includes open shadow roots (as `<div data-graphock-shadow-root>`),
 *  - replaces iframes with a readable placeholder instead of dropping them,
 *  - never touches the live document.
 *
 * Closed shadow roots are inaccessible by design; callers cannot capture them.
 */
export function cloneForExport(root: Element, options: CloneOptions = {}): Element {
  const doc = root.ownerDocument
  const iframePlaceholders = options.iframePlaceholders ?? true
  const flattenShadowRoots = options.flattenShadowRoots ?? true

  const visit = (node: Node): Node | null => {
    if (node.nodeType === 3) return doc.createTextNode(node.textContent ?? '')
    if (node.nodeType === 8) return doc.createComment(node.textContent ?? '')
    if (node.nodeType !== 1) return null

    const element = node as Element
    if (element.tagName === 'SCRIPT' || element.tagName === 'NOSCRIPT') return null
    if (element.tagName === 'IFRAME' && iframePlaceholders) return iframePlaceholder(element, doc)

    const clone = doc.createElement(element.tagName)
    copyAttributes(element, clone)

    for (const child of Array.from(element.childNodes)) {
      const copied = visit(child)
      if (copied) clone.append(copied)
    }

    if (flattenShadowRoots && element.shadowRoot) {
      const wrapper = doc.createElement('div')
      wrapper.setAttribute('data-graphock-shadow-root', '')
      for (const child of Array.from(element.shadowRoot.childNodes)) {
        const copied = visit(child)
        if (copied) wrapper.append(copied)
      }
      clone.append(wrapper)
    }

    return clone
  }

  return (visit(root) as Element | null) ?? doc.createElement(root.tagName)
}

export type DomSize = { nodes: number; depth: number; tooLarge: boolean }

/**
 * Measure a subtree before cloning it. This keeps a hostile or gigantic page
 * from allocating a full clone only to discover it is too large.
 */
export function measureDom(
  root: Node,
  limits: { maxNodes?: number; maxDepth?: number } = {}
): DomSize {
  const maxNodes = limits.maxNodes ?? 100_000
  const maxDepth = limits.maxDepth ?? 600
  let nodes = 0
  let depth = 0

  type Entry = { node: Node; depth: number }
  const stack: Entry[] = [{ node: root, depth: 1 }]
  while (stack.length > 0) {
    const entry = stack.pop() as Entry
    nodes += 1
    if (entry.depth > depth) depth = entry.depth
    if (nodes > maxNodes || depth > maxDepth) return { nodes, depth, tooLarge: true }
    for (const child of Array.from(entry.node.childNodes)) {
      if (child.nodeType === 1 || child.nodeType === 3) {
        stack.push({ node: child, depth: entry.depth + 1 })
      }
    }
  }
  return { nodes, depth, tooLarge: false }
}

/** Count open shadow roots in a subtree (used for diagnostics/tests). */
export function countOpenShadowRoots(root: Element): number {
  let count = 0
  for (const element of [root, ...Array.from(root.querySelectorAll('*'))]) {
    if ((element as HTMLElement).shadowRoot) count += 1
  }
  return count
}
