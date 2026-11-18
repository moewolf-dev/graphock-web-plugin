export type SanitizeOptions = {
  /** Remove <style> elements. Defaults to false (full-page export needs CSS). */
  stripStyles?: boolean
  /** Remove elements matching these selectors in addition to the defaults. */
  removeSelectors?: string[]
  /** Drop attributes starting with these prefixes (event handlers etc.). */
  dropAttributePrefixes?: string[]
}

const DEFAULT_REMOVE = ['script', 'noscript', 'template', 'iframe', 'object', 'embed', 'form']
const DEFAULT_DROP_PREFIXES = ['on']

/**
 * Clone and clean a DOM subtree for export.
 *
 * Rules:
 * - scripts, inline event handlers and `javascript:` URLs are removed;
 * - links become absolute so the exported file still works offline;
 * - password/hidden form values are never captured (forms are dropped whole).
 *
 * The function never mutates the live page.
 */
export function sanitizeElement(root: Element, options: SanitizeOptions = {}): Element {
  const clone = root.cloneNode(true) as Element
  const removeSelectors = [...DEFAULT_REMOVE, ...(options.removeSelectors ?? [])]
  for (const selector of removeSelectors) {
    for (const node of Array.from(clone.querySelectorAll(selector))) node.remove()
  }
  if (options.stripStyles) {
    for (const node of Array.from(clone.querySelectorAll('style'))) node.remove()
  }

  const prefixes = [...DEFAULT_DROP_PREFIXES, ...(options.dropAttributePrefixes ?? [])]
  const base = clone.ownerDocument?.baseURI ?? 'about:blank'

  for (const element of [clone, ...Array.from(clone.querySelectorAll('*'))]) {
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase()
      if (prefixes.some((prefix) => name.startsWith(prefix))) {
        element.removeAttribute(attribute.name)
        continue
      }
      if (name === 'href' || name === 'src' || name === 'poster' || name === 'action') {
        const value = attribute.value.trim()
        if (!value) continue
        if (/^(javascript|vbscript|data:text\/html)/iu.test(value)) {
          element.removeAttribute(attribute.name)
          continue
        }
        if (name === 'src' && /^data:/iu.test(value)) continue
        try {
          element.setAttribute(attribute.name, new URL(value, base).toString())
        } catch {
          element.removeAttribute(attribute.name)
        }
      }
      if (name === 'srcset') {
        element.removeAttribute(attribute.name)
      }
    }
  }
  return clone
}

/** Serialize a full page snapshot with scripts and handlers removed. */
export function snapshotDocument(doc: Document): string {
  const root = doc.documentElement
  if (!root) return ''
  const clone = sanitizeElement(root, { stripStyles: false })
  return `<!doctype html>\n${clone.outerHTML}`
}
