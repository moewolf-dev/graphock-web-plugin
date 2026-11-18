import { Readability } from '@mozilla/readability'

export type ReadableResult = {
  ok: boolean
  content: Element | null
  title?: string
  byline?: string
  siteName?: string
  lang?: string
  publishedTime?: string
  textLength: number
}

/**
 * Extract the main article from a page.
 *
 * Readability mutates the document it receives, so we always hand it a clone.
 * The returned `content` is a detached element owned by the caller's document;
 * it has NOT been sanitized yet — run `sanitizeElement` before serializing.
 */
export function extractReadable(doc: Document): ReadableResult {
  let parsed: ReturnType<Readability['parse']> = null
  try {
    const clone = doc.cloneNode(true) as Document
    parsed = new Readability(clone, { charThreshold: 200 }).parse()
  } catch {
    return { ok: false, content: null, textLength: 0 }
  }

  if (!parsed?.content) {
    return { ok: false, content: null, textLength: 0 }
  }

  const container = doc.createElement('div')
  container.innerHTML = parsed.content

  return {
    ok: true,
    content: container,
    ...(parsed.title ? { title: parsed.title } : {}),
    ...(parsed.byline ? { byline: parsed.byline } : {}),
    ...(parsed.siteName ? { siteName: parsed.siteName } : {}),
    ...(parsed.lang ? { lang: parsed.lang } : {}),
    ...(parsed.publishedTime ? { publishedTime: parsed.publishedTime } : {}),
    textLength: (parsed.textContent ?? '').trim().length
  }
}
