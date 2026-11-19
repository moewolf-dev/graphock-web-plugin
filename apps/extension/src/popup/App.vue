<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  DEFAULT_SETTINGS,
  type CaptureMode,
  type CaptureResult,
  type ImagePolicy,
  type OutputFormat,
  type Settings
} from '../shared/messages'
import { t } from '../shared/strings'
import { formatLog, type LogEntry } from '../shared/logger'

const loading = ref(true)
const busy = ref(false)
const result = ref<CaptureResult | null>(null)
const mode = ref<CaptureMode>(DEFAULT_SETTINGS.defaultMode)
const format = ref<OutputFormat>(DEFAULT_SETTINGS.defaultFormat)
const settings = ref<Settings>({ ...DEFAULT_SETTINGS })
const notice = ref('')
const copied = ref(false)
let requestSeq = 0
let currentRequestId = ''

const modes: { value: CaptureMode; label: string; hint: string }[] = [
  { value: 'readable', label: t('readable'), hint: 'Main article text' },
  { value: 'full', label: t('fullPage'), hint: 'All visible text' },
  { value: 'selection', label: t('selection'), hint: 'Only what is selected' }
]

const formats: { value: OutputFormat; label: string }[] = [
  { value: 'markdown', label: 'MD' },
  { value: 'html', label: 'HTML' },
  { value: 'json', label: 'JSON' },
  { value: 'yaml', label: 'YAML' },
  { value: 'txt', label: 'TXT' }
]

const policies: { value: ImagePolicy; label: string; hint: string }[] = [
  { value: 'embed', label: t('embed'), hint: 'Embed image files (larger clips use a package file)' },
  { value: 'link', label: t('links'), hint: 'Keep image URLs only' },
  { value: 'skip', label: t('textOnly'), hint: 'Drop images' }
]

const errorText = computed(() => {
  const value = result.value
  if (!value || value.ok) return ''
  return `${value.code}: ${value.message}`
})

const metaText = computed(() => {
  const value = result.value
  if (!value?.ok) return ''
  const kb = Math.max(1, Math.round(value.bytes / 1024))
  const images =
    value.assetCount > 0 || value.failedAssets > 0
      ? ` · ${value.embeddedAssets} embedded, ${value.linkedAssets} linked` +
        `${value.failedAssets > 0 ? `, ${value.failedAssets} failed` : ''}` +
        `${value.skippedAssets > 0 ? `, ${value.skippedAssets} skipped` : ''}`
      : ''
  if (value.channel === 'inline') {
    return `${kb} KB · link ${value.urlLength.toLocaleString()} characters${images}`
  }
  if (value.channel === 'file-ready') {
    return `${kb} KB · package is written when you open Graphock${images}`
  }
  return `${kb} KB · saved as file, open Graphock manually${images}`
})

async function loadSettings(): Promise<void> {
  const stored = await chrome.storage.local.get('settings')
  settings.value = { ...DEFAULT_SETTINGS, ...((stored['settings'] as Partial<Settings>) ?? {}) }
  mode.value = settings.value.defaultMode
  format.value = settings.value.defaultFormat
}

async function capture(): Promise<void> {
  const seq = ++requestSeq
  currentRequestId = crypto.randomUUID()
  loading.value = true
  notice.value = ''
  copied.value = false
  try {
    const response = (await chrome.runtime.sendMessage({
      type: 'GRAPHOCK_CAPTURE',
      mode: mode.value,
      format: format.value,
      requestId: currentRequestId
    })) as CaptureResult
    if (seq !== requestSeq) return
    result.value = response
  } catch (error) {
    if (seq !== requestSeq) return
    result.value = {
      ok: false,
      code: 'E_EXTENSION',
      message: error instanceof Error ? error.message : 'The extension could not reach its background worker.'
    }
  } finally {
    if (seq === requestSeq) loading.value = false
  }
}

function cancelCapture(): void {
  requestSeq += 1
  void chrome.runtime.sendMessage({ type: 'GRAPHOCK_CANCEL', requestId: currentRequestId })
  loading.value = false
  notice.value = t('cancelled')
}

function setMode(next: CaptureMode): void {
  if (mode.value === next) return
  mode.value = next
  void capture()
}

function setFormat(next: OutputFormat): void {
  if (format.value === next) return
  format.value = next
  void capture()
}

function setPolicy(next: ImagePolicy): void {
  if (settings.value.imagePolicy === next) return
  settings.value = { ...settings.value, imagePolicy: next }
  void chrome.storage.local.set({ settings: settings.value })
  void capture()
}

async function copyLink(): Promise<void> {
  const value = result.value
  if (!value?.ok || !value.url) return
  await navigator.clipboard.writeText(value.url)
  copied.value = true
  notice.value = t('copied')
}

async function copyDiagnostics(): Promise<void> {
  try {
    const logs = (await chrome.runtime.sendMessage({ type: 'GRAPHOCK_LOGS' })) as {
      entries: LogEntry[]
      persisted: LogEntry[]
      manifest: { version: string; permissions: string[] }
      userAgent: string
    }
    const lines = [
      `Graphock Web Clipper ${logs.manifest.version}`,
      `UA: ${logs.userAgent}`,
      `Permissions: ${logs.manifest.permissions.join(', ')}`,
      '--- session ---',
      ...logs.entries.map(formatLog),
      '--- persisted warnings/errors ---',
      ...logs.persisted.map(formatLog)
    ]
    await navigator.clipboard.writeText(lines.join('\n'))
    notice.value = t('diagnosticsCopied')
  } catch {
    notice.value = t('diagnosticsFailed')
  }
}

async function requestImageAccess(): Promise<void> {
  const granted = await chrome.permissions.request({ origins: ['<all_urls>'] })
  notice.value = granted
    ? 'Image access granted. Capturing again…'
    : 'Image access was not granted; images stay as links.'
  if (granted) await capture()
}

async function openApp(): Promise<void> {
  const value = result.value
  if (!value?.ok) return
  busy.value = true
  notice.value = ''
  try {
    const delivered = (await chrome.runtime.sendMessage({
      type: 'GRAPHOCK_DELIVER',
      clipId: value.clipId
    })) as
      | { ok: true; url: string; channel: 'inline' | 'file' | 'wake'; savedFilename?: string; fallbackReason?: string }
      | { ok: false; code: string; message: string }
    if (!delivered.ok) {
      notice.value = `${delivered.code}: ${delivered.message}`
      return
    }
    // Keep the navigation in the popup: the click gesture is required for the
    // browser to hand the custom scheme to the OS.
    await chrome.tabs.create({ url: delivered.url })
    notice.value =
      delivered.channel === 'wake'
        ? t('openedWake')
        : delivered.channel === 'file'
          ? t('savedAndOpening')
          : t('openedConfirm')
  } catch {
    notice.value = t('protocolBlocked')
  } finally {
    busy.value = false
  }
}

const saveNeedsZip = computed(() => {
  const value = result.value
  return Boolean(value?.ok && value.canSaveZip && value.embeddedAssets > 0 && value.format !== 'html')
})

async function saveFile(): Promise<void> {
  const value = result.value
  if (!value?.ok) return
  busy.value = true
  notice.value = ''
  try {
    const response = (await chrome.runtime.sendMessage({
      type: 'GRAPHOCK_SAVE',
      content: value.content,
      format: value.format,
      title: value.title,
      clipId: value.clipId,
      withAssets: saveNeedsZip.value
    })) as { ok: boolean; filename?: string; code?: string; message?: string }
    notice.value = response.ok
      ? t('savedAs').replace('{name}', response.filename ?? '')
      : t('saveFailed').replace(
          '{message}',
          `${response.code ?? 'E_SAVE'}: ${response.message ?? ''}`.trim()
        )
  } finally {
    busy.value = false
  }
}

function openOptions(): void {
  void chrome.runtime.openOptionsPage()
}

onMounted(async () => {
  await loadSettings()
  await capture()
})
</script>

<template>
  <main class="clip">
    <header class="clip__header">
      <div class="clip__brand">
        <span class="clip__dot" aria-hidden="true"></span>
        <span>Graphock</span>
      </div>
      <button class="clip__icon-button" type="button" title="Options" @click="openOptions">
        ⚙
      </button>
    </header>

    <section v-if="result?.ok" class="clip__page">
      <p class="clip__eyebrow">{{ t('currentPage') }}</p>
      <h1 class="clip__title" :title="result.title">{{ result.title }}</h1>
      <p class="clip__meta">{{ metaText }}</p>
    </section>

    <section v-else-if="loading" class="clip__page clip__page--loading">
      <p class="clip__eyebrow">{{ t('readingPage') }}</p>
      <div class="clip__skeleton"></div>
      <button class="clip__link" type="button" @click="cancelCapture">{{ t('cancel') }}</button>
    </section>

    <section v-else class="clip__error" role="alert">
      <p class="clip__eyebrow">{{ t('couldNotClip') }}</p>
      <p class="clip__error-text">{{ errorText }}</p>
      <button class="clip__link" type="button" @click="copyDiagnostics">
        {{ t('copyDiagnostics') }}
      </button>
    </section>

    <fieldset class="clip__modes" :disabled="loading">
      <legend class="clip__legend">{{ t('capture') }}</legend>
      <button
        v-for="option in modes"
        :key="option.value"
        class="clip__mode"
        :class="{ 'clip__mode--active': mode === option.value }"
        type="button"
        :title="option.hint"
        :aria-pressed="mode === option.value"
        @click="setMode(option.value)"
      >
        {{ option.label }}
      </button>
    </fieldset>

    <fieldset class="clip__modes clip__modes--compact" :disabled="loading">
      <legend class="clip__legend">{{ t('format') }}</legend>
      <button
        v-for="option in formats"
        :key="option.value"
        class="clip__mode"
        :class="{ 'clip__mode--active': format === option.value }"
        type="button"
        :aria-pressed="format === option.value"
        @click="setFormat(option.value)"
      >
        {{ option.label }}
      </button>
    </fieldset>

    <fieldset class="clip__modes clip__modes--compact" :disabled="loading">
      <legend class="clip__legend">{{ t('images') }}</legend>
      <button
        v-for="option in policies"
        :key="option.value"
        class="clip__mode"
        :class="{ 'clip__mode--active': settings.imagePolicy === option.value }"
        type="button"
        :title="option.hint"
        :aria-pressed="settings.imagePolicy === option.value"
        @click="setPolicy(option.value)"
      >
        {{ option.label }}
      </button>
    </fieldset>

    <p v-if="result?.ok && result.fallbackReason" class="clip__warning" role="status">
      {{ result.fallbackReason }}
    </p>

    <p
      v-if="result?.ok && (result.failedAssets > 0 || result.skippedAssets > 0)"
      class="clip__warning"
      role="status"
    >
      {{ t('someImagesFailed') }}
    </p>

    <p
      v-if="result?.ok && result.embeddedAssets > 0 && !result.canSaveZip && result.format !== 'html'"
      class="clip__warning"
      role="status"
    >
      {{ t('zipUnavailable') }}
    </p>
    <button
      v-if="result?.ok && result.canRequestImageAccess"
      class="clip__button"
      type="button"
      @click="requestImageAccess"
    >
      {{ t('allowCrossOriginImages') }}
    </button>

    <div class="clip__actions">
      <button class="clip__button clip__button--primary" type="button" :disabled="!result?.ok || busy" @click="saveFile">
        {{ saveNeedsZip ? t('saveZip') : t('saveFile') }}
      </button>
      <div class="clip__row">
        <button
          class="clip__button"
          type="button"
          :disabled="!result?.ok || !result.url"
          @click="copyLink"
        >
          {{ copied ? t('copied') : t('copyImportLink') }}
        </button>
        <button class="clip__button" type="button" :disabled="!result?.ok || busy" @click="openApp">
          {{ t('openInGraphock') }}
        </button>
      </div>
    </div>

    <p v-if="notice" class="clip__notice" role="status">{{ notice }}</p>

    <footer class="clip__footer">
      <span class="clip__scheme">{{ settings.targetScheme }}://import</span>
      <button class="clip__link" type="button" @click="openOptions">{{ t('settings') }}</button>
    </footer>
  </main>
</template>

<style>
:root {
  color-scheme: dark light;
  --bg: #0d1117;
  --bg-elevated: #161b22;
  --border: #2a3038;
  --text: #e6edf3;
  --text-dim: #9aa4b2;
  --accent: #5eead4;
  --accent-text: #04231f;
  --danger: #f87171;
  --warning: #fbbf24;
  --radius: 12px;
}

@media (prefers-color-scheme: light) {
  :root {
    --bg: #f6f8fa;
    --bg-elevated: #ffffff;
    --border: #d0d7de;
    --text: #1f2328;
    --text-dim: #57606a;
    --accent: #0f766e;
    --accent-text: #ffffff;
    --danger: #b42318;
    --warning: #9a6700;
  }
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  width: 380px;
  background: var(--bg);
  color: var(--text);
  font: 13px/1.5 system-ui, -apple-system, 'Segoe UI', sans-serif;
}

.clip {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 14px;
}

.clip__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.clip__brand {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  letter-spacing: 0.02em;
}

.clip__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--accent);
  box-shadow: 0 0 10px var(--accent);
}

.clip__icon-button,
.clip__link {
  border: 0;
  background: transparent;
  color: var(--text-dim);
  cursor: pointer;
  font-size: 14px;
  padding: 4px;
}

.clip__page {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--bg-elevated);
}

.clip__eyebrow {
  margin: 0;
  font-size: 10px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--text-dim);
}

.clip__title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.clip__meta {
  margin: 0;
  font-size: 11px;
  color: var(--text-dim);
}

.clip__skeleton {
  height: 34px;
  border-radius: 8px;
  background: linear-gradient(90deg, var(--border), transparent, var(--border));
  animation: shimmer 1.2s infinite;
}

@keyframes shimmer {
  0% { opacity: 0.4; }
  50% { opacity: 0.9; }
  100% { opacity: 0.4; }
}

@media (prefers-reduced-motion: reduce) {
  .clip__skeleton { animation: none; }
}

.clip__error {
  padding: 12px;
  border: 1px solid color-mix(in srgb, var(--danger) 45%, var(--border));
  border-radius: var(--radius);
  background: color-mix(in srgb, var(--danger) 10%, transparent);
}

.clip__error-text {
  margin: 6px 0 0;
  color: var(--danger);
  font-size: 12px;
}

.clip__modes {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 4px;
  margin: 0;
  padding: 4px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg-elevated);
  border-width: 1px;
}

.clip__modes--compact .clip__mode {
  font-size: 11px;
  padding: 6px 4px;
}

.clip__legend {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
}

.clip__mode {
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--text-dim);
  font-size: 12px;
  padding: 7px 4px;
  cursor: pointer;
}

.clip__mode--active {
  background: color-mix(in srgb, var(--accent) 18%, transparent);
  color: var(--text);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 45%, transparent);
}

.clip__actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.clip__row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.clip__button {
  border: 1px solid var(--border);
  border-radius: 9px;
  background: var(--bg-elevated);
  color: var(--text);
  font: inherit;
  padding: 9px 10px;
  cursor: pointer;
}

.clip__button:hover:not(:disabled) {
  border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
}

.clip__button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.clip__button--primary {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-text);
  font-weight: 600;
}

.clip__warning {
  margin: 0;
  font-size: 11px;
  color: var(--warning);
}

.clip__notice {
  margin: 0;
  font-size: 11px;
  color: var(--text-dim);
}

.clip__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-top: 1px solid var(--border);
  padding-top: 8px;
}

.clip__scheme {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 10px;
  color: var(--text-dim);
}
</style>
