import type { FetchedImage } from '@graphock/capture/images'

const MAX_STYLES_CHARS = 1_500_000
const MAX_SNAPSHOT_BYTES = 8 * 1024 * 1024

function escapeHtml(value: string): string {
  return value
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')
}

/**
 * Collect inline <style> blocks and same-origin stylesheets.
 *
 * Cross-origin stylesheets are skipped (CORS); the exported page still renders
 * with the inline CSS plus the browser default. Everything is capped so a
 * hostile page cannot exhaust memory.
 */
export async function collectStyles(doc: Document): Promise<string> {
  const parts: string[] = []
  for (const style of Array.from(doc.querySelectorAll('style'))) {
    parts.push(style.textContent ?? '')
  }

  const links = Array.from(doc.querySelectorAll('link[rel~="stylesheet"]')).slice(0, 8)
  for (const link of links) {
    const href = link.getAttribute('href')?.trim()
    if (!href) continue
    try {
      const url = new URL(href, doc.baseURI).toString()
      const response = await fetch(url, { credentials: 'omit' })
      if (!response.ok) continue
      const text = await response.text()
      if (text.length <= 512 * 1024) parts.push(`/* ${url} */\n${text}`)
    } catch {
      // Cross-origin or offline: keep the inline styles we already have.
    }
  }

  return parts.join('\n').slice(0, MAX_STYLES_CHARS)
}

/**
 * Build a self-contained HTML document from the sanitized subtree.
 * Images with fetched bytes become data URIs; the rest keep their absolute URL.
 */
export function buildPageSnapshot(
  doc: Document,
  root: Element,
  styles: string,
  images: FetchedImage[]
): string {
  const clone = root.cloneNode(true) as Element
  for (const link of Array.from(clone.querySelectorAll('link[rel~="stylesheet"]'))) link.remove()
  for (const style of Array.from(clone.querySelectorAll('style'))) style.remove()

  const bySource = new Map(
    images.filter((image) => image.dataBase64).map((image) => [image.sourceUrl, image])
  )
  for (const image of Array.from(clone.querySelectorAll('img'))) {
    const src = image.getAttribute('src')
    if (!src || src.startsWith('data:')) continue
    try {
      const absolute = new URL(src, doc.baseURI).toString()
      const fetched = bySource.get(absolute)
      if (fetched?.dataBase64) {
        image.setAttribute('src', `data:${fetched.mimeType ?? 'image/png'};base64,${fetched.dataBase64}`)
      } else {
        image.setAttribute('src', absolute)
      }
    } catch {
      image.removeAttribute('src')
    }
  }

  const body = root.tagName === 'BODY' ? clone.innerHTML : clone.outerHTML
  const title = escapeHtml(doc.title || location.href)
  const lang = escapeHtml(doc.documentElement.lang || 'und')
  const styleBlock = styles ? `<style>\n${styles}\n</style>` : ''

  const html = `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'">
<title>${title}</title>
${styleBlock}
</head>
<body>
${body}
</body>
</html>
`
  return html.length > MAX_SNAPSHOT_BYTES ? html.slice(0, MAX_SNAPSHOT_BYTES) : html
}
