import { afterEach, describe, expect, it, vi } from 'vitest'
import { channelCounts, yesNo } from '../src/lib/channelCounts'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const COUNTS = { messages_logged: { minute: 0, hour: 1, day: 2 }, messages_sent: { minute: 0, hour: 0, day: 0 }, runs_day: { ok: 3, failed: 0, cancelled: 0 }, at: 0 }

describe('channelCounts', () => {
  afterEach(() => vi.unstubAllGlobals())

  it("keeps every channel, with null for one whose counts didn't load", async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.endsWith('/site')) return json({ version: '1', syntax_version: '2', default_prefix: '!', admin_enabled: false, channels: [{ login: 'a', prefix: '!', tier: 'basic' }, { login: 'b', prefix: '!', tier: 'full' }] })
      if (url.includes('/channels/a/')) return json({ ...COUNTS, channel: 'a' })
      return json({ title: 'gone' }, 500)
    }))
    expect(await channelCounts()).toEqual({ a: { ...COUNTS, channel: 'a' }, b: null })
  })
})

describe('yesNo', () => {
  it('shows a dash for a field an older bot leaves out', () => {
    expect([yesNo(true), yesNo(false), yesNo(undefined)]).toEqual(['yes', 'no', '—'])
  })
})
