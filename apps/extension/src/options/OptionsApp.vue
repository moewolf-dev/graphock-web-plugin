<script setup lang="ts">
import { onMounted, ref } from 'vue'
import {
  DEFAULT_SETTINGS,
  type CaptureMode,
  type ImagePolicy,
  type OutputFormat,
  type Settings
} from '../shared/messages'

const settings = ref<Settings>({ ...DEFAULT_SETTINGS })
const saved = ref(false)
const error = ref('')

const schemes = [
  { value: 'graphock-direct', label: 'Graphock Direct (website download)' },
  { value: 'graphock', label: 'Graphock (Mac App Store)' },
  { value: 'graphock-dev', label: 'Graphock Dev (local build)' }
]

const modes: { value: CaptureMode; label: string }[] = [
  { value: 'readable', label: 'Readable main content' },
  { value: 'full', label: 'Full page text' },
  { value: 'selection', label: 'Selection only' }
]

const formats: { value: OutputFormat; label: string }[] = [
  { value: 'markdown', label: 'Markdown' },
  { value: 'html', label: 'HTML (self-contained)' },
  { value: 'json', label: 'JSON (document model)' },
  { value: 'yaml', label: 'YAML (document model)' }
]

const policies: { value: ImagePolicy; label: string }[] = [
  { value: 'embed', label: 'Embed image files (package file when large)' },
  { value: 'link', label: 'Keep image links only' },
  { value: 'skip', label: 'Text only' }
]

async function load(): Promise<void> {
  const stored = await chrome.storage.local.get('settings')
  settings.value = { ...DEFAULT_SETTINGS, ...((stored['settings'] as Partial<Settings>) ?? {}) }
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
  setTimeout(() => {
    saved.value = false
  }, 2000)
}

async function reset(): Promise<void> {
  settings.value = { ...DEFAULT_SETTINGS }
  await save()
}

onMounted(load)
</script>

<template>
  <main class="options">
    <header>
      <h1>Graphock Web Clipper</h1>
      <p class="subtitle">Settings are stored locally in this browser. No account, no telemetry.</p>
    </header>

    <section class="card">
      <h2>Desktop app</h2>
      <label class="field">
        <span>Which build should receive clips?</span>
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
      <h2>Capture defaults</h2>
      <label class="field">
        <span>Default mode</span>
        <select v-model="settings.defaultMode">
          <option v-for="mode in modes" :key="mode.value" :value="mode.value">
            {{ mode.label }}
          </option>
        </select>
      </label>
      <label class="field">
        <span>Default format</span>
        <select v-model="settings.defaultFormat">
          <option v-for="option in formats" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </select>
      </label>
      <label class="field">
        <span>Images</span>
        <select v-model="settings.imagePolicy">
          <option v-for="policy in policies" :key="policy.value" :value="policy.value">
            {{ policy.label }}
          </option>
        </select>
      </label>
      <label class="field">
        <span>Download subdirectory</span>
        <input v-model="settings.downloadSubdirectory" type="text" maxlength="120" />
      </label>
      <p class="hint">
        Files are saved inside your browser's download directory. Browsers do not allow extensions
        to write to arbitrary absolute paths.
      </p>
    </section>

    <section class="card">
      <h2>Privacy</h2>
      <p class="hint">
        The extension reads the current tab only after you click it. Page content never leaves your
        device: it is either saved locally or handed to the desktop app through a custom protocol.
      </p>
    </section>

    <div class="actions">
      <button class="primary" type="button" @click="save">Save settings</button>
      <button type="button" @click="reset">Reset to defaults</button>
      <span v-if="saved" class="saved" role="status">Saved</span>
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
  max-width: 720px;
  margin: 0 auto;
  padding: 40px 20px 80px;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

h1 { margin: 0 0 4px; font-size: 22px; }
h2 { margin: 0 0 12px; font-size: 14px; text-transform: uppercase; letter-spacing: .08em; color: var(--dim); }
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

select, input {
  border: 1px solid var(--border);
  border-radius: 9px;
  background: var(--bg);
  color: var(--text);
  padding: 9px 10px;
  font: inherit;
}

.hint { margin: 0; color: var(--dim); font-size: 12px; }
code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; }

.actions { display: flex; align-items: center; gap: 10px; }

button {
  border: 1px solid var(--border);
  border-radius: 9px;
  background: var(--card);
  color: var(--text);
  font: inherit;
  padding: 9px 14px;
  cursor: pointer;
}

button.primary {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-text);
  font-weight: 600;
}

.saved { color: var(--accent); font-size: 12px; }
.error { color: #f87171; font-size: 12px; }
</style>
