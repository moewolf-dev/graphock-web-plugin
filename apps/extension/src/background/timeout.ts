export class TimeoutError extends Error {
  readonly code = 'E_CAPTURE_TIMEOUT'

  constructor(message: string) {
    super(message)
    this.name = 'TimeoutError'
  }
}

/** Reject with a typed timeout instead of hanging forever. */
export function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError(message)), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        clearTimeout(timer)
        reject(error)
      }
    )
  })
}
