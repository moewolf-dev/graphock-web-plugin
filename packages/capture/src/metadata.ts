import type { ClipSource } from '@graphock/clip-model'

function meta(doc: Document, selector: string): string | undefined {
  const element = doc.querySelector(selector)
  const value = element?.getAttribute('content')?.trim()
  return value || undefined
}

function firstMeta(doc: Document, selectors: string[]): string | undefined {
  for (const selector of selectors) {
    const value = meta(doc, selector)
    if (value) return value
  }
  return undefined
}

function jsonLd(doc: Document): Record<string, unknown> | undefined {
  const scripts = Array.from(doc.querySelectorAll('script[type="application/ld+json"]'))
  for (const script of scripts) {
    try {
      const parsed: unknown = JSON.parse(script.textContent ?? '')
      const candidates = Array.isArray(parsed) ? parsed : [parsed]
      for (const candidate of candidates) {
        if (candidate && typeof candidate === 'object') {
          const record = candidate as Record<string, unknown>
          if (record['@type'] || record.headline || record.name) return record
        }
      }
    } catch {
      // Ignore malformed JSON-LD; metadata is best-effort.
    }
  }
  return undefined
}

function stringField(record: Record<string, unknown> | undefined, keys: string[]): string | undefined {
  if (!record) return undefined
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
    if (value && typeof value === 'object') {
      const name = (value as Record<string, unknown>).name
      if (typeof name === 'string' && name.trim()) return name.trim()
    }
  }
  return undefined
}

export function extractMetadata(doc: Document, fallbackUrl: string): ClipSource {
  const locationHref = doc.location?.href || fallbackUrl
  const ld = jsonLd(doc)
  const canonical =
    doc.querySelector('link[rel="canonical"]')?.getAttribute('href')?.trim() || undefined
  const iconHref = doc.querySelector('link[rel~="icon"]')?.getAttribute('href')?.trim() || undefined

  const url = canonical ? safeAbsolute(canonical, locationHref) ?? locationHref : locationHref
  const favicon = iconHref ? safeAbsolute(iconHref, locationHref) : undefined

  const title =
    firstMeta(doc, ['meta[property="og:title"]', 'meta[name="twitter:title"]']) ??
    stringField(ld, ['headline', 'name']) ??
    doc.title?.trim() ??
    ''

  return {
    url: locationHref,
    title: title || locationHref,
    ...(url && url !== locationHref ? { canonicalUrl: url } : {}),
    ...(doc.documentElement.lang ? { lang: doc.documentElement.lang } : {}),
    ...(firstMeta(doc, ['meta[name="author"]', 'meta[property="article:author"]']) ||
    stringField(ld, ['author'])
      ? {
          author:
            firstMeta(doc, ['meta[name="author"]', 'meta[property="article:author"]']) ??
            stringField(ld, ['author'])
        }
      : {}),
    ...(firstMeta(doc, ['meta[property="article:published_time"]', 'meta[name="date"]']) ||
    stringField(ld, ['datePublished'])
      ? {
          publishedAt:
            firstMeta(doc, ['meta[property="article:published_time"]', 'meta[name="date"]']) ??
            stringField(ld, ['datePublished'])
        }
      : {}),
    ...(firstMeta(doc, ['meta[property="og:site_name"]']) || stringField(ld, ['publisher'])
      ? { siteName: firstMeta(doc, ['meta[property="og:site_name"]']) ?? stringField(ld, ['publisher']) }
      : {}),
    ...(favicon ? { faviconUrl: favicon } : {})
  }
}

export function safeAbsolute(value: string, base: string): string | undefined {
  try {
    return new URL(value, base).toString()
  } catch {
    return undefined
  }
}
