// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { hashPosition } from '../src/lib/hash'
import { loadSite, site } from '../src/lib/site'

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

describe('loadSite', () => {
  it('clears the error once a retry succeeds', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response('{}', { status: 500 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ default_prefix: '!' }), { status: 200 }))
    vi.stubGlobal('fetch', fetch)
    await loadSite()
    expect(site.error).toBeTruthy()
    await loadSite()
    expect(site.error).toBeNull()
    expect(site.info).toMatchObject({ default_prefix: '!' })
  })
})

describe('hashPosition', () => {
  it('does not throw on a malformed escape', () => {
    expect(hashPosition('#%')).toBe(false)
    document.body.innerHTML = '<h2 id="%E0%A4%A">x</h2>'
    expect(hashPosition('#%E0%A4%A')).toMatchObject({ el: document.body.firstElementChild })
  })
})
