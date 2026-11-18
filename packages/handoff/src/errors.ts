export type ProtocolErrorCode =
  | 'E_SCHEME'
  | 'E_ROUTE'
  | 'E_URL_TOO_LONG'
  | 'E_PAYLOAD_MISSING'
  | 'E_PAYLOAD_ENCODING'
  | 'E_PAYLOAD_COMPRESSION'
  | 'E_PAYLOAD_TOO_LARGE'
  | 'E_SCHEMA_VERSION'
  | 'E_SCHEMA_INVALID'
  | 'E_LIMIT_EXCEEDED'
  | 'E_CHECKSUM_MISMATCH'
  | 'E_PATH_NOT_ALLOWED'
  | 'E_FILE_NOT_FOUND'
  | 'E_FILE_TOO_LARGE'
  | 'E_UNSUPPORTED_FORMAT'
  | 'E_DUPLICATE_CLIP'
  | 'E_DOWNLOAD_INTERRUPTED'
  | 'E_DOWNLOAD_TIMEOUT'
  | 'E_PACKAGE_TOO_LARGE'
  | 'E_PACKAGE_FAILED'
  | 'E_DOWNLOAD_FAILED'

export class ProtocolError extends Error {
  readonly code: ProtocolErrorCode
  readonly details?: Record<string, unknown>

  constructor(code: ProtocolErrorCode, message: string, details?: Record<string, unknown>) {
    super(message)
    this.name = 'ProtocolError'
    this.code = code
    this.details = details
  }
}

export function isProtocolError(error: unknown): error is ProtocolError {
  return error instanceof ProtocolError
}
