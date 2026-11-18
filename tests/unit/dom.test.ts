// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { cloneForExport, countOpenShadowRoots } from '@graphock/capture/dom'

function dom(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html')
}

describe('cloneForExport', () => {
  it('includes open shadow roots without touching the live document', () => {
    const document = dom('<body><div id="host"></div></body>')
    const host = document.getElementById('host')!
    const shadow = host.attachShadow({ mode: 'open' })
    shadow.innerHTML = '<p>Inside shadow</p><h2>Shadow heading</h2>'

    const clone = cloneForExport(document.body)
    expect(clone.querySelector('[data-graphock-shadow-root]')).not.toBeNull()
    expect(clone.textContent).toContain('Inside shadow')
    expect(clone.textContent).toContain('Shadow heading')
    // Live DOM is untouched: the shadow content is not in light DOM.
    expect(host.innerHTML).toBe('')
    expect(countOpenShadowRoots(document.body)).toBe(1)
  })

  it('replaces iframes with a placeholder figure', () => {
    const document = dom('<body><iframe src="https://example.com/embed"></iframe></body>')
    const clone = cloneForExport(document.body)
    expect(clone.querySelector('iframe')).toBeNull()
    const figure = clone.querySelector('figure[data-graphock-iframe]')
    expect(figure?.getAttribute('data-graphock-iframe')).toBe('https://example.com/embed')
    expect(figure?.textContent).toContain('Embedded content')
  })

  it('drops scripts and event handlers', () => {
    const document = dom('<body><div onclick="alert(1)">x</div><script>alert(2)</script></body>')
    const clone = cloneForExport(document.body)
    expect(clone.querySelector('script')).toBeNull()
    expect(clone.querySelector('[onclick]')).not.toBeNull() // sanitizeElement removes handlers next
    expect(clone.textContent).toContain('x')
  })

  it('keeps nested shadow roots', () => {
    const document = dom('<body><div id="outer"></div></body>')
    const outer = document.getElementById('outer')!
    const shadow = outer.attachShadow({ mode: 'open' })
    shadow.innerHTML = '<div id="inner"></div>'
    const inner = shadow.getElementById('inner') as HTMLElement
    const innerShadow = inner.attachShadow({ mode: 'open' })
    innerShadow.innerHTML = '<span>deep</span>'

    const clone = cloneForExport(document.body)
    expect(clone.textContent).toContain('deep')
    expect(clone.querySelectorAll('[data-graphock-shadow-root]')).toHaveLength(2)
  })
})
