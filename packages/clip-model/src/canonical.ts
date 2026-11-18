/**
 * Deterministic JSON canonicalization.
 *
 * Both the checksum and any persisted JSON output use this function so that
 * the same document always produces the same bytes, regardless of property
 * insertion order. This is what makes the checksum verifiable across
 * implementations (browser plugin, reference receiver, desktop app).
 */
export function canonicalize(value: unknown): string {
  return stringify(value)
}

function stringify(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return JSON.stringify(value)
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('Non-finite numbers are not canonicalizable')
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stringify(item)).join(',')}]`
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>
    const keys = Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort()
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stringify(record[key])}`).join(',')}}`
  }
  throw new TypeError(`Unsupported value type: ${typeof value}`)
}
