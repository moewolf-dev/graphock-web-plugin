<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  DEFAULT_SETTINGS,
  type CaptureMode,
  type HistoryEntry,
  type ImagePolicy,
  type OutputFormat,
  type Settings
} from '../shared/messages'
import { t } from '../shared/strings'
import { parseSettingsBackup, serializeSettings } from '../shared/settings'
import { formatLog, type LogEntry } from '../shared/logger'

const settings = ref<Settings>({ ...DEFAULT_SETTINGS })
const history = ref<HistoryEntry[]>([])
const saved = ref(false)
const error = ref('')
const diagnostics = ref('')
const importError = ref('')

const schemes = [
  { value: 'graphock-direct', label: t('directBuild') },
  { value: 'graphock', label: t('masBuild') },
  { value: 'graphock-dev', label: t('devBuild') }
]

const modes: { value: CaptureMode; label: string }[] = [
  { value: 'readable', label: t('modeReadable') },
  { value: 'full', label: t('modeFull') },
  { value: 'selection', label: t('modeSelection') }
]

const formats: { value: OutputFormat; label: string }[] = [
  { value: 'markdown', label: t('formatMarkdown') },
  { value: 'html', label: t('formatHtml') },
  { value: 'json', label: t('formatJson') },
  { value: 'yaml', label: t('formatYaml') },
  { value: 'txt', label: t('formatTxt') }
]

const policies: { value: ImagePolicy; label: string }[] = [
  { value: 'embed', label: t('policyEmbed') },
  { value: 'link', label: t('policyLink') },
  { value: 'skip', label: t('policySkip') }
]

const storageSummary = ref('')
const logsText = ref('')
let logsRaw: LogEntry[] = []

const historyCount = computed(() => history.value.length)

async function load(): Promise<void> {
  const stored = await chrome.storage.local.get(['settings', 'history'])
  settings.value = { ...DEFAULT_SETTINGS, ...((stored['settings'] as Partial<Settings>) ?? {}) }
  history.value = Array.isArray(stored['history']) ? (stored['history'] as HistoryEntry[]) : []
  await loadDiagnostics()
  await loadLogs()
}

async function loadLogs(): Promise<void> {
  const result = (await chrome.runtime.sendMessage({ type: 'GRAPHOCK_LOGS' })) as {
    entries: LogEntry[]
    persisted: LogEntry[]
  }
  logsRaw = [...result.entries, ...result.persisted]
  logsText.value = logsRaw.length === 0 ? 'No logs yet.' : logsRaw.slice(-80).map(formatLog).join('\n')
}

async function copyLogs(): Promise<void> {
  await navigator.clipboard.writeText(logsText.value)
}

function downloadLogs(): void {
  const blob = new Blob([logsText.value], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `graphock-web-plugin-logs-${new Date().toISOString().slice(0, 10)}.txt`
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
}

async function clearLogs(): Promise<void> {
  await chrome.runtime.sendMessage({ type: 'GRAPHOCK_CLEAR_LOGS' })
  await loadLogs()
}

async function loadDiagnostics(): Promise<void> {
  const manifest = chrome.runtime.getManifest()
  const bytes = await chrome.storage.local.getBytesInUse(null)
  const imageAccess = await chrome.permissions.contains({ origins: ['<all_urls>'] })
  diagnostics.value = [
    `version: ${manifest.version}`,
    `storage: ${(bytes / 1024).toFixed(1)} KB`,
    `image access (optional): ${imageAccess ? 'granted' : 'not granted'}`,
    `permissions: ${(manifest.permissions ?? []).join(', ')}`,
    `ua: ${navigator.userAgent}`
  ].join('\n')
  storageSummary.value = `${(bytes / 1024).toFixed(1)} KB used`
}

async function save(): Promise<void> {
  error.value = ''
  const subdirectory = settings.value.downloadSubdirectory.trim()
  if (subdirectory.length > 120) {
    error.value = 'Download subdirectory is too long (max 120 characters).'
    return
  }
  await chrome.storage.local.set({ settings: settings.value })
  saved.value = true
  await loadDiagnostics()
  setTimeout(() => {
    saved.value = false
  }, 2000)
}

async function reset(): Promise<void> {
  settings.value = { ...DEFAULT_SETTINGS }
  await save()
}

async function clearHistory(): Promise<void> {
  await chrome.storage.local.remove('history')
  history.value = []
  await loadDiagnostics()
}

async function clearAll(): Promise<void> {
  await chrome.storage.local.clear()
  settings.value = { ...DEFAULT_SETTINGS }
  history.value = []
  await loadDiagnostics()
}

async function openHistory(entry: HistoryEntry): Promise<void> {
  await chrome.tabs.create({ url: entry.url })
}

async function revokeImageAccess(): Promise<void> {
  await chrome.permissions.remove({ origins: ['<all_urls>'] })
  await loadDiagnostics()
}

function exportSettings(): void {
  const payload = serializeSettings(settings.value)
  const blob = new Blob([payload], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = 'graphock-web-plugin-settings.json'
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
}

async function importSettings(event: Event): Promise<void> {
  importError.value = ''
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  try {
    settings.value = parseSettingsBackup(await file.text())
    await save()
  } catch (error_) {
    importError.value = error_ instanceof Error ? error_.message : 'Could not read the file'
  } finally {
    input.value = ''
  }
}

onMounted(load)
</script>

<template>
  <main class="options">
    <header>
      <h1>Graphock Web Clipper</h1>
      <p class="subtitle">{{ t('settingsSubtitle') }}</p>
    </header>

    <section class="card">
      <h2>{{ t('desktopApp') }}</h2>
      <label class="field">
        <span>{{ t('targetBuild') }}</span>
        <select v-model="settings.targetScheme">
          <option v-for="scheme in schemes" :key="scheme.value" :value="scheme.value">
            {{ scheme.label }}
          </option>
        </select>
      </label>
      <p class="hint">
        The website-download build uses <code>graphock-direct://</code>; the Mac App Store build
        uses <code>graphock://</code>. You can copy the import link from the popup instead.
      </p>
    </section>

    <section class="card">
      <h2>{{ t('captureDefaults') }}</h2>
      <label class="field">
        <span>{{ t('defaultMode') }}</span>
        <select v-model="settings.defaultMode">
          <option v-for="mode in modes" :key="mode.value" :value="mode.value">
            {{ mode.label }}
          </option>
        </select>
      </label>
      <label class="field">
        <span>{{ t('defaultFormat') }}</span>
        <select v-model="settings.defaultFormat">
          <option v-for="option in formats" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </select>
      </label>
      <label class="field">
        <span>{{ t('images') }}</span>
        <select v-model="settings.imagePolicy">
          <option v-for="policy in policies" :key="policy.value" :value="policy.value">
            {{ policy.label }}
          </option>
        </select>
      </label>
      <label class="field">
        <span>{{ t('downloadSubdirectory') }}</span>
        <input v-model="settings.downloadSubdirectory" type="text" maxlength="120" />
      </label>
      <p class="hint">
        Files are saved inside your browser's download directory. Browsers do not allow extensions
        to write to arbitrary absolute paths.
      </p>
    </section>

    <section class="card">
      <h2>{{ t('recentClips') }} <span class="badge">{{ historyCount }}</span></h2>
      <p v-if="history.length === 0" class="hint">{{ t('noClips') }}</p>
      <ul v-else class="history">
        <li v-for="entry in history" :key="entry.clipId" class="history__item">
          <div class="history__main">
            <button class="history__title" type="button" :title="entry.url" @click="openHistory(entry)">
              {{ entry.title }}
            </button>
            <span class="history__meta">
              {{ entry.format }} · {{ entry.channel }} ·
              {{ new Date(entry.createdAt).toLocaleString() }} ·
              {{ Math.max(1, Math.round(entry.bytes / 1024)) }} KB
            </span>
          </div>
        </li>
      </ul>
      <div class="actions">
        <button type="button" :disabled="history.length === 0" @click="clearHistory">
          {{ t('clearHistory') }}
        </button>
      </div>
    </section>

    <section class="card">
      <h2>{{ t('diagnostics') }}</h2>
      <pre class="diagnostics">{{ diagnostics }}</pre>
      <div class="actions">
        <button type="button" @click="revokeImageAccess">{{ t('revokeImageAccess') }}</button>
        <button class="danger" type="button" @click="clearAll">{{ t('clearAll') }}</button>
      </div>
      <p class="hint">{{ storageSummary }} in this browser profile.</p>
      <h3 class="subhead">{{ t('logs') }}</h3>
      <pre class="diagnostics diagnostics--logs">{{ logsText }}</pre>
      <div class="actions">
        <button type="button" @click="copyLogs">{{ t('copyLogs') }}</button>
        <button type="button" @click="downloadLogs">{{ t('downloadLogs') }}</button>
        <button type="button" class="danger" @click="clearLogs">{{ t('clearLogs') }}</button>
      </div>
    </section>

    <section class="card">
      <h2>{{ t('backup') }}</h2>
      <div class="actions">
        <button type="button" @click="exportSettings">{{ t('exportSettings') }}</button>
        <label class="file-button">
          {{ t('importSettings') }}
          <input type="file" accept="application/json" @change="importSettings" />
        </label>
      </div>
      <p v-if="importError" class="error" role="alert">{{ importError }}</p>
      <p class="hint">{{ t('backupHint') }}</p>
    </section>

    <section class="card">
      <h2>{{ t('privacy') }}</h2>
      <p class="hint">{{ t('privacyHint') }}</p>
    </section>

    <div class="actions sticky">
      <button class="primary" type="button" @click="save">{{ t('saveSettings') }}</button>
      <button type="button" @click="reset">{{ t('resetDefaults') }}</button>
      <span v-if="saved" class="saved" role="status">{{ t('saved') }}</span>
      <span v-if="error" class="error" role="alert">{{ error }}</span>
    </div>
  </main>
</template>

<style>
:root {
  color-scheme: dark light;
  --bg: #0d1117;
  --card: #161b22;
  --border: #2a3038;
  --text: #e6edf3;
  --dim: #9aa4b2;
  --accent: #5eead4;
  --accent-text: #04231f;
  --danger: #f87171;
}

@media (prefers-color-scheme: light) {
  :root {
    --bg: #f6f8fa;
    --card: #ffffff;
    --border: #d0d7de;
    --text: #1f2328;
    --dim: #57606a;
    --accent: #0f766e;
    --accent-text: #ffffff;
    --danger: #b42318;
  }
}

* { box-sizing: border-box; }

body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font: 14px/1.6 system-ui, -apple-system, 'Segoe UI', sans-serif;
}

.options {
  max-width: 760px;
  margin: 0 auto;
  padding: 40px 20px 100px;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

h1 { margin: 0 0 4px; font-size: 22px; }
h2 { margin: 0 0 12px; font-size: 13px; text-transform: uppercase; letter-spacing: .08em; color: var(--dim); }
.subtitle { margin: 0; color: var(--dim); font-size: 13px; }

.card {
  border: 1px solid var(--border);
  border-radius: 14px;
  background: var(--card);
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.field { display: flex; flex-direction: column; gap: 6px; }
.field > span { font-size: 12px; color: var(--dim); }

select, input[type='text'] {
  border: 1px solid var(--border);
  border-radius: 9px;
  background: var(--bg);
  color: var(--text);
  padding: 9px 10px;
  font: inherit;
}

.hint { margin: 0; color: var(--dim); font-size: 12px; }
code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; }
.badge { margin-left: 6px; font-size: 11px; color: var(--accent); }

.actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.actions.sticky { position: sticky; bottom: 0; background: linear-gradient(transparent, var(--bg) 30%); padding-top: 10px; }

button, .file-button {
  border: 1px solid var(--border);
  border-radius: 9px;
  background: var(--card);
  color: var(--text);
  font: inherit;
  padding: 9px 14px;
  cursor: pointer;
}

button:hover:not(:disabled), .file-button:hover { border-color: color-mix(in srgb, var(--accent) 45%, var(--border)); }
button:disabled { opacity: .45; cursor: not-allowed; }

button.primary {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-text);
  font-weight: 600;
}

button.danger { color: var(--danger); border-color: color-mix(in srgb, var(--danger) 45%, var(--border)); }

.file-button { display: inline-flex; align-items: center; }
.file-button input { display: none; }

.history { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.history__item { border-top: 1px solid var(--border); padding-top: 8px; }
.history__item:first-child { border-top: 0; padding-top: 0; }
.history__main { display: flex; flex-direction: column; gap: 2px; }
.history__title {
  border: 0;
  background: transparent;
  padding: 0;
  text-align: left;
  color: var(--text);
  font-weight: 600;
  cursor: pointer;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.history__title:hover { color: var(--accent); border: 0; }
.history__meta { font-size: 11px; color: var(--dim); }

.subhead { margin: 4px 0 0; font-size: 12px; color: var(--dim); text-transform: uppercase; letter-spacing: .06em; }
.diagnostics--logs { max-height: 320px; overflow: auto; }

.diagnostics {
  margin: 0;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg);
  font: 11px/1.6 ui-monospace, SFMono-Regular, Menlo, monospace;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.saved { color: var(--accent); font-size: 12px; }
.error { color: var(--danger); font-size: 12px; }
</style>
