#!/usr/bin/env node
/**
 * Chrome Web Store API v2 upload + publish.
 *
 * Requires CWS_ACCESS_TOKEN (OAuth access token with
 * https://www.googleapis.com/auth/chromewebstore), CWS_PUBLISHER_ID and
 * CWS_EXTENSION_ID. The first listing must be created manually.
 *
 * Usage:
 *   node tooling/release/cws-publish.mjs \
 *     --zip artifacts/graphock-web-plugin-0.1.1-chrome.zip \
 *     --publish-type DEFAULT_PUBLISH
 */
import { createHash, createSign } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { unzipSync } from 'fflate'

const API = 'https://chromewebstore.googleapis.com/v2/publishers'

function arg(name, fallback = '') {
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback
}

const zipPath = arg('zip', process.env.CWS_ZIP)
const publisherId = arg('publisher', process.env.CWS_PUBLISHER_ID)
const extensionId = arg('extension', process.env.CWS_EXTENSION_ID)
const publishType = arg('publish-type', process.env.CWS_PUBLISH_TYPE || 'DEFAULT_PUBLISH')
const dryRun = process.argv.includes('--dry-run')

function fail(message) {
  console.error(`[cws] ${message}`)
  process.exit(1)
}

if (!zipPath) fail('--zip is required')
if (!['DEFAULT_PUBLISH', 'STAGED_PUBLISH'].includes(publishType)) {
  fail(`unsupported --publish-type ${publishType}`)
}

const bytes = readFileSync(zipPath)
const entries = unzipSync(new Uint8Array(bytes))
if (!entries['manifest.json']) fail('ZIP has no manifest.json at the root')
const manifest = JSON.parse(new TextDecoder().decode(entries['manifest.json']))
if (!/^\d+\.\d+\.\d+$/u.test(manifest.version || '')) fail(`invalid version ${manifest.version}`)
if ((manifest.permissions || []).includes('contextMenus')) fail('ZIP requests contextMenus')
if (manifest.commands) fail('ZIP declares commands')
if ((manifest.host_permissions || []).length > 0) fail('ZIP requests install-time host permissions')

const sha256 = createHash('sha256').update(bytes).digest('hex')
console.log(`[cws] zip ${zipPath}`)
console.log(`[cws] version ${manifest.version}; sha256 ${sha256}; ${bytes.byteLength} bytes`)
if (dryRun) {
  console.log('[cws] dry run: no network calls')
  process.exit(0)
}

if (!publisherId) fail('CWS_PUBLISHER_ID is required')
if (!extensionId) fail('CWS_EXTENSION_ID is required')

async function serviceAccountToken(raw) {
  let credentials
  try {
    credentials = JSON.parse(raw)
  } catch {
    fail('CWS_SERVICE_ACCOUNT_JSON is not valid JSON')
  }
  if (!credentials.client_email || !credentials.private_key) {
    fail('CWS_SERVICE_ACCOUNT_JSON must be a service account key with client_email/private_key')
  }
  const now = Math.floor(Date.now() / 1000)
  const tokenUri = credentials.token_uri || 'https://oauth2.googleapis.com/token'
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url')
  const unsigned = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({
    iss: credentials.client_email,
    scope: 'https://www.googleapis.com/auth/chromewebstore',
    aud: tokenUri,
    iat: now,
    exp: now + 3600
  })}`
  const signer = createSign('RSA-SHA256')
  signer.update(unsigned)
  signer.end()
  const assertion = `${unsigned}.${signer.sign(credentials.private_key, 'base64url')}`
  const response = await fetch(tokenUri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion
    }),
    signal: AbortSignal.timeout(30_000)
  })
  const text = await response.text()
  if (!response.ok) fail(`service account token exchange failed (${response.status}): ${text.slice(0, 1500)}`)
  let json
  try {
    json = JSON.parse(text)
  } catch {
    fail('service account token exchange returned invalid JSON')
  }
  if (!json.access_token) fail('service account token exchange returned no access_token')
  return json.access_token
}

const token =
  process.env.CWS_ACCESS_TOKEN ||
  process.env.GOOGLE_OAUTH_ACCESS_TOKEN ||
  (process.env.CWS_SERVICE_ACCOUNT_JSON
    ? await serviceAccountToken(process.env.CWS_SERVICE_ACCOUNT_JSON)
    : '')
if (!token) fail('CWS_ACCESS_TOKEN or CWS_SERVICE_ACCOUNT_JSON is required')

const metadataBase = `${API}/${encodeURIComponent(publisherId)}/items/${encodeURIComponent(extensionId)}`
const uploadBase = `https://chromewebstore.googleapis.com/upload/v2/publishers/${encodeURIComponent(publisherId)}/items/${encodeURIComponent(extensionId)}:upload`

async function request(label, url, options) {
  const response = await fetch(url, options)
  const text = await response.text()
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    // Keep the raw text for the error message.
  }
  if (!response.ok) {
    fail(`${label} failed (${response.status}): ${text.slice(0, 2000)}`)
  }
  console.log(`[cws] ${label}: ${text.slice(0, 2000) || '(empty)'}`)
  return json
}

const uploaded = await request('upload', uploadBase, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/zip'
  },
  body: bytes,
  signal: AbortSignal.timeout(120_000)
})

function uploadState(value) {
  return value?.lastAsyncUploadState ?? value?.uploadState ?? ''
}

if (uploadState(uploaded) === 'FAILED') fail('Chrome Web Store rejected the upload')
for (let attempt = 1; uploadState(uploaded) !== 'SUCCEEDED' && attempt <= 60; attempt += 1) {
  const status = await request('fetchStatus', `${metadataBase}:fetchStatus`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(30_000)
  })
  const state = uploadState(status)
  if (state === 'SUCCEEDED') break
  if (state === 'FAILED') fail('Chrome Web Store rejected the upload')
  if (attempt === 60) fail(`upload still ${state || 'unknown'} after 5 minutes`)
  await new Promise((resolve) => setTimeout(resolve, 5_000))
}

const published = await request('publish', `${metadataBase}:publish`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ publishType }),
  signal: AbortSignal.timeout(30_000)
})

if (published?.state === 'REJECTED') fail('Chrome Web Store rejected the submission')
console.log(
  `[cws] submitted version ${manifest.version} with ${publishType}; state ${published?.state || 'unknown'}; Google review is still required`
)
