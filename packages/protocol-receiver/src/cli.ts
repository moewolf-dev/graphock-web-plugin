#!/usr/bin/env node
import { resolve } from 'node:path'
import { isProtocolError } from '@graphock/handoff'
import { receiveImportUrl } from './receiver.js'

type CliOptions = {
  url?: string
  urlFile?: string
  out: string
  allowDuplicate: boolean
  pretty: boolean
}

function usage(): string {
  return `Usage: graphock-protocol-receiver --out <dir> (--url <url> | --url-file <path>) [--allow-duplicate] [--no-pretty]

Receives a Graphock web-clip handoff URL and writes the clip to <dir>/<clipId>/.

Exit codes:
  0  imported
  2  invalid arguments
  3  protocol or validation error
`
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    out: resolve(process.cwd(), 'graphock-clips'),
    allowDuplicate: false,
    pretty: true
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    switch (arg) {
      case '--out':
        options.out = resolve(argv[++index] ?? options.out)
        break
      case '--url':
        options.url = argv[++index]
        break
      case '--url-file':
        options.urlFile = argv[++index]
        break
      case '--allow-duplicate':
        options.allowDuplicate = true
        break
      case '--no-pretty':
        options.pretty = false
        break
      case '--help':
      case '-h':
        process.stdout.write(usage())
        process.exit(0)
        break
      default:
        if (arg?.startsWith('--')) {
          process.stderr.write(`Unknown option: ${arg}\n\n${usage()}`)
          process.exit(2)
        }
    }
  }
  return options
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2))
  if (!options.url && !options.urlFile) {
    process.stderr.write(`Missing --url or --url-file\n\n${usage()}`)
    process.exit(2)
  }

  let url = options.url
  if (options.urlFile) {
    const { readFile } = await import('node:fs/promises')
    url = (await readFile(resolve(options.urlFile), 'utf8')).trim()
  }

  try {
    const result = await receiveImportUrl(url ?? '', {
      outDir: options.out,
      allowDuplicate: options.allowDuplicate
    })
    const output = options.pretty ? JSON.stringify(result, null, 2) : JSON.stringify(result)
    process.stdout.write(`${output}\n`)
  } catch (error) {
    if (isProtocolError(error)) {
      process.stderr.write(
        `${JSON.stringify({ ok: false, code: error.code, message: error.message, details: error.details })}\n`
      )
      process.exit(3)
    }
    throw error
  }
}

void main()
