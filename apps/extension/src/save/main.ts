/**
 * Safari fallback for saving a clip.
 *
 * Safari has no `downloads` API. The background worker stores the pending file
 * in extension storage and opens this page, which creates a Blob URL and
 * triggers a normal anchor download, then closes itself.
 */
type PendingSave = {
  content: string
  filename: string
  mime: string
}

const statusEl = document.getElementById('status')

async function run(): Promise<void> {
  const id = new URLSearchParams(location.search).get('id')
  if (!id) {
    if (statusEl) statusEl.textContent = 'Missing download id.'
    return
  }
  const key = `graphock:save:${id}`
  const stored = await chrome.storage.local.get(key)
  const pending = stored[key] as PendingSave | undefined
  await chrome.storage.local.remove(key)

  if (!pending) {
    if (statusEl) statusEl.textContent = 'This download has expired. Capture the page again.'
    return
  }

  const blob = new Blob([pending.content], { type: `${pending.mime};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = pending.filename
  document.body.append(anchor)
  anchor.click()
  if (statusEl) statusEl.textContent = `Saved ${pending.filename}. You can close this tab.`
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
  setTimeout(() => window.close(), 1_500)
}

void run()
