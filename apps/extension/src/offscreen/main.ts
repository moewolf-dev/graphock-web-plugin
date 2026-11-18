/**
 * Offscreen document used only to turn captured text into a Blob URL.
 *
 * MV3 service workers cannot call URL.createObjectURL, and Chrome interrupts
 * `data:` URL downloads. A Blob URL created here is downloaded through the
 * normal downloads API and revoked once Chrome reports completion.
 */
type CreateRequest = {
  type: 'GRAPHOCK_OFFSCREEN_CREATE'
  content?: string
  base64?: string
  mime: string
}

type RevokeRequest = { type: 'GRAPHOCK_OFFSCREEN_REVOKE'; url: string }

/**
 * Offscreen documents only get a subset of extension APIs (no `downloads`),
 * so this page just creates and owns the Blob URL. The service worker starts
 * the actual download and tells us when to revoke it.
 */
const REVOKE_AFTER_MS = 5 * 60_000
const owned = new Set<string>()

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const request = message as CreateRequest | RevokeRequest | undefined

  if (request?.type === 'GRAPHOCK_OFFSCREEN_REVOKE') {
    if (owned.delete(request.url)) URL.revokeObjectURL(request.url)
    sendResponse({ ok: true })
    return undefined
  }

  if (request?.type !== 'GRAPHOCK_OFFSCREEN_CREATE') return undefined

  try {
    const blob = request.base64
      ? (() => {
          const binary = atob(request.base64)
          const bytes = new Uint8Array(binary.length)
          for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
          return new Blob([bytes], { type: request.mime })
        })()
      : new Blob([request.content ?? ''], { type: `${request.mime};charset=utf-8` })
    const url = URL.createObjectURL(blob)
    owned.add(url)
    setTimeout(() => {
      if (owned.delete(url)) URL.revokeObjectURL(url)
    }, REVOKE_AFTER_MS)
    sendResponse({ ok: true, url })
  } catch (error) {
    sendResponse({
      ok: false,
      code: 'E_OFFSCREEN_CREATE',
      message: error instanceof Error ? error.message : 'Could not create the download blob'
    })
  }
  return undefined
})
