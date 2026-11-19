import { createServer, type Server } from 'node:http'

export type ServerHits = {
  image: number
  background: number
  font: number
  slow: number
}

export type TestServer = {
  url: string
  hits: ServerHits
  resetHits: () => void
  close: () => Promise<void>
}

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
)
const BIG_PNG = Buffer.alloc(220_000)
for (let index = 0; index < BIG_PNG.length; index += 1) BIG_PNG[index] = (index * 31) % 256

function htmlPage(title: string, body: string, extraHead = ''): string {
  return `<!doctype html><html lang="en"><head>
    <title>${title}</title>
    <meta property="og:title" content="${title}">
    <meta name="author" content="E2E">
    ${extraHead}
  </head><body>${body}</body></html>`
}

export async function startServer(): Promise<TestServer> {
  const hits: ServerHits = { image: 0, background: 0, font: 0, slow: 0 }

  const server: Server = createServer((request, response) => {
    const url = request.url ?? '/'
    const send = (status: number, type: string, body: Buffer | string): void => {
      response.writeHead(status, {
        'content-type': type,
        'cache-control': 'no-store',
        'access-control-allow-origin': '*'
      })
      response.end(body)
    }

    if (url === '/style.css') {
      return send(
        200,
        'text/css',
        'body{color:rgb(18,52,86)}.marker{border-left:3px solid teal}' +
          '@font-face{font-family:E2E;src:url("/font.woff2") format("woff2")}' +
          'body{background-image:url("/bg.png");font-family:E2E,sans-serif}'
      )
    }
    if (url === '/font.woff2') {
      hits.font += 1
      return send(200, 'font/woff2', Buffer.alloc(2048, 9))
    }
    if (url === '/bg.png') {
      hits.background += 1
      return send(200, 'image/png', PNG_1X1)
    }
    if (url === '/img.png') {
      hits.image += 1
      return send(200, 'image/png', PNG_1X1)
    }
    if (url === '/big.png') {
      return send(200, 'image/png', BIG_PNG)
    }
    if (url === '/slow.png') {
      hits.slow += 1
      setTimeout(() => {
        if (!response.writableEnded) send(200, 'image/png', PNG_1X1)
      }, 2_000)
      return
    }
    if (url === '/slow') {
      return send(
        200,
        'text/html; charset=utf-8',
        htmlPage(
          'Slow clip',
          `<main><h1>Slow clip</h1><p>This page loads an image slowly so the capture can be cancelled.</p>
           <img src="/slow.png" alt="Slow"></main>`
        )
      )
    }
    if (url === '/big') {
      return send(
        200,
        'text/html; charset=utf-8',
        htmlPage(
          'Big clip',
          `<main><h1>Big clip</h1><p>This page carries a large image so the inline channel cannot hold it.</p>
           <img src="/big.png" alt="Large"></main>`
        )
      )
    }
    if (url === '/large') {
      const paragraphs = Array.from(
        { length: 10_000 },
        (_, index) => `<p>Paragraph ${index} with some text for the large-page guard.</p>`
      ).join('')
      return send(200, 'text/html; charset=utf-8', htmlPage('Large clip', `<main>${paragraphs}</main>`))
    }

    return send(
      200,
      'text/html; charset=utf-8',
      htmlPage(
        'Smoke page',
        `<main>
          <h1>Smoke page</h1>
          <p>Hello from the local test server. This paragraph is long enough to exercise the
          readable extraction, block conversion and image collection paths in the extension.</p>
          <figure><img src="/img.png" alt="Pixel" width="1" height="1"><figcaption>A pixel</figcaption></figure>
          <h2>Steps</h2>
          <ol><li><p>Open the page</p></li><li><p>Click the icon</p></li></ol>
          <blockquote><p>Quoted text</p></blockquote>
          <pre><code class="language-ts">const x = 1</code></pre>
        </main>`,
        '<link rel="stylesheet" href="/style.css"><style>.inline-marker{padding:4px}</style>'
      )
    )
  })

  await new Promise<void>((resolveListen) => server.listen(0, '127.0.0.1', resolveListen))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Test server did not bind a port')

  return {
    url: `http://127.0.0.1:${address.port}/`,
    hits,
    resetHits: () => {
      hits.image = 0
      hits.background = 0
      hits.font = 0
      hits.slow = 0
    },
    close: () =>
      new Promise<void>((resolveClose, reject) => {
        server.closeAllConnections?.()
        server.close((error) => (error ? reject(error) : resolveClose()))
      })
  }
}
