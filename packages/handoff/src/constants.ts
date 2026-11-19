/** Protocol constants. Every value here is mirrored in the spec document. */
export const PROTOCOL_ROUTE = 'import' as const
export const PAYLOAD_PARAM = 'p' as const
export const FILE_PARAM = 'file' as const
export const PAYLOAD_PREFIX = 'v1.' as const

/** Maximum length of the whole `scheme://import...` URL, in characters. */
export const MAX_URL_LENGTH = 24_000

/** Maximum JSON size of an inline handoff payload, before compression. */
export const MAX_INLINE_JSON_BYTES = 131_072

/** Maximum JSON size of an inline handoff payload, after decompression. */
export const MAX_INLINE_DECODED_BYTES = 262_144

/** Maximum number of assets in one handoff. */
export const MAX_ASSET_COUNT = 500

/** Maximum size of one asset, in bytes. */
export const MAX_ASSET_BYTES = 20 * 1024 * 1024

/** Maximum total inline asset bytes carried inside a payload. */
export const MAX_INLINE_ASSET_BYTES = 8 * 1024 * 1024

/** Maximum document content length in a handoff payload. */
export const MAX_DOCUMENT_BYTES = 64 * 1024 * 1024

/** Default maximum file size the receiver accepts through the file channel. */
export const MAX_FILE_BYTES = 200 * 1024 * 1024

/** Maximum serialized payload the sender writes for the file channel. */
export const MAX_FILE_PAYLOAD_BYTES = 64 * 1024 * 1024

/** Schemes owned by the desktop app editions. */
export const KNOWN_SCHEMES = ['graphock', 'graphock-direct', 'graphock-dev'] as const
export type KnownScheme = (typeof KNOWN_SCHEMES)[number]
