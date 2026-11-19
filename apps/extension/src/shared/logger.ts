export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export type LogEntry = {
  ts: string
  level: LogLevel
  scope: string
  event: string
  requestId?: string
  durationMs?: number
  data?: Record<string, unknown>
}

const MAX_LINE = 600

function safeData(data: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!data) return undefined
  const output: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(data)) {
    if (key.toLowerCase().includes('token') || key.toLowerCase().includes('secret')) continue
    if (typeof value === 'string') output[key] = value.length > MAX_LINE ? `${value.slice(0, MAX_LINE)}…` : value
    else if (value instanceof Error) output[key] = value.message
    else output[key] = value
  }
  return output
}

export function createLogger(scope: string) {
  return {
    log(
      level: LogLevel,
      event: string,
      data?: Record<string, unknown>,
      extra?: { requestId?: string; durationMs?: number }
    ): LogEntry {
      const entry: LogEntry = {
        ts: new Date().toISOString(),
        level,
        scope,
        event,
        ...(extra?.requestId ? { requestId: extra.requestId } : {}),
        ...(extra?.durationMs !== undefined ? { durationMs: Math.round(extra.durationMs) } : {}),
        ...(data ? { data: safeData(data) } : {})
      }
      const method = level === 'debug' ? 'debug' : level === 'info' ? 'info' : level === 'warn' ? 'warn' : 'error'
      // Console output is what chrome://extensions → service worker shows.
      console[method](`[graphock:${scope}]`, event, entry.data ?? '', entry.durationMs ? `${entry.durationMs}ms` : '')
      return entry
    },
    debug(event: string, data?: Record<string, unknown>, extra?: { requestId?: string; durationMs?: number }) {
      return this.log('debug', event, data, extra)
    },
    info(event: string, data?: Record<string, unknown>, extra?: { requestId?: string; durationMs?: number }) {
      return this.log('info', event, data, extra)
    },
    warn(event: string, data?: Record<string, unknown>, extra?: { requestId?: string; durationMs?: number }) {
      return this.log('warn', event, data, extra)
    },
    error(event: string, data?: Record<string, unknown>, extra?: { requestId?: string; durationMs?: number }) {
      return this.log('error', event, data, extra)
    }
  }
}

export function formatLog(entry: LogEntry): string {
  const time = entry.ts.slice(11, 23)
  const duration = entry.durationMs !== undefined ? ` ${entry.durationMs}ms` : ''
  const request = entry.requestId ? ` req=${entry.requestId.slice(0, 8)}` : ''
  const data = entry.data && Object.keys(entry.data).length > 0 ? ` ${JSON.stringify(entry.data)}` : ''
  return `${time} ${entry.level.toUpperCase().padEnd(5)} [${entry.scope}] ${entry.event}${duration}${request}${data}`
}
