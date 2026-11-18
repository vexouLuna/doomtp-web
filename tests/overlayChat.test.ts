import { describe, expect, it, vi } from 'vitest'
import { createPronouns } from '../src/lib/pronouns'
import {
  addRow, backoff, clearUser, connectFeed, DEFAULTS, expire, parseSettings, removeMessage,
  type Entry, type FeedEvent, type SourceLike,
} from '../src/lib/overlayChat'

const msg = (id: string, user = '1', extra = {}): Entry =>
  ({ kind: 'message', id, at: '2026-11-18T00:00:00Z', user: { id: user, login: `u${user}` }, text: id, fragments: [], badges: [], color: null, is_command: false, ...extra }) as unknown as Entry
const sub = (id: string, user = '1'): Entry => ({ kind: 'notification', id, user: { id: user, login: 'x' }, type: 'sub', payload: {}, at: '', source: '' }) as unknown as Entry

describe('settings', () => {
  it('defaults when the link carries nothing, commands shown', () => {
    expect(parseSettings(new URLSearchParams())).toEqual(DEFAULTS)
    expect(DEFAULTS.hideCommands).toBe(false)
  })
  it('reads each setting', () => {
    const s = parseSettings(new URLSearchParams('size=40&emote=60&color=FF8800&badges=off&pronouns=1&lines=5&fade=30&history=10&notices=1&hidecommands=1&shadow=0&names=both'))
    expect(s).toEqual({ size: 40, emote: 60, color: '#ff8800', badges: false, pronouns: true, lines: 5, fade: 30, history: 10, notices: true, hideCommands: true, shadow: false, names: 'both' })
  })
  it('bounds numbers and ignores junk', () => {
    const s = parseSettings(new URLSearchParams('size=9999&lines=0&history=-4&fade=2&emote=abc&color=red&names=x&pronouns=maybe'))
    expect(s).toMatchObject({ size: 96, lines: 1, history: 0, fade: 5, emote: 0, color: 'chatter', names: 'display', pronouns: false })
  })
})

describe('lines', () => {
  it('adds in order, once, and keeps at most max', () => {
    let rows = addRow([], msg('a'), 2, 0)
    rows = addRow(rows, msg('a'), 2, 1)
    expect(rows).toHaveLength(1)
    rows = addRow(addRow(rows, msg('b'), 2, 2), msg('c'), 2, 3)
    expect(rows.map((r) => r.id)).toEqual(['b', 'c'])
  })
  it('removes one message, a user\'s messages (not their notices), and expires by age', () => {
    let rows = [msg('a', '1'), msg('b', '2'), sub('s', '1'), msg('c', '1')].reduce((r, e, i) => addRow(r, e, 10, i * 1000), [] as ReturnType<typeof addRow>)
    expect(removeMessage(rows, 'b').map((r) => r.id)).toEqual(['a', 's', 'c'])
    expect(clearUser(rows, '1').map((r) => r.id)).toEqual(['b', 's'])
    expect(expire(rows, 0, 1e9)).toHaveLength(4)
    expect(expire(rows, 5, 5500).map((r) => r.id)).toEqual(['b', 's', 'c'])
    rows = expire(rows, 5, 1e9)
    expect(rows).toHaveLength(0)
  })
})

class FakeSource implements SourceLike {
  onerror: ((e: Event) => void) | null = null
  closed = false
  private h = new Map<string, ((e: MessageEvent) => void)[]>()
  addEventListener(t: string, l: (e: MessageEvent) => void) { this.h.set(t, [...(this.h.get(t) ?? []), l]) }
  close() { this.closed = true }
  emit(t: string, data: unknown) { for (const l of this.h.get(t) ?? []) l({ data: typeof data === 'string' ? data : JSON.stringify(data) } as MessageEvent) }
}

function setup() {
  const sources: FakeSource[] = []
  const events: FeedEvent[] = []
  const timers: { fn: () => void; ms: number }[] = []
  const ready = vi.fn()
  const stopped = vi.fn()
  const feed = connectFeed({
    url: '/x', open: () => { const s = new FakeSource(); sources.push(s); return s },
    onEvent: (e) => events.push(e), onReady: ready, onStopped: stopped,
    schedule: (fn, ms) => timers.push({ fn, ms }) - 1, cancel: (h) => { timers[h as number] = { fn: () => {}, ms: -1 } },
  })
  return { sources, events, timers, ready, stopped, feed }
}

describe('feed', () => {
  it('turns events into FeedEvents and skips broken data', () => {
    const { sources, events, ready } = setup()
    const s = sources[0]!
    s.emit('ready', { channel: 'c' })
    s.emit('message', msg('a'))
    s.emit('notification', sub('n'))
    s.emit('delete', { message_id: 'a', user_id: '1', at: '' })
    s.emit('user_clear', { user_id: '7', duration_s: 600, at: '' })
    s.emit('chat_clear', { at: '' })
    s.emit('message', 'not json')
    expect(ready).toHaveBeenCalledWith(true)
    expect(events.map((e) => e.type)).toEqual(['message', 'notification', 'delete', 'user_clear', 'chat_clear'])
    expect(events[3]).toEqual({ type: 'user_clear', userId: '7' })
  })
  it('retries slowly and ever slower while the route 404s, and shows nothing', () => {
    const { sources, events, timers } = setup()
    for (let i = 0; i < 6; i++) {
      sources.at(-1)!.onerror?.(new Event('error'))
      timers.at(-1)!.fn()
    }
    expect(timers.map((t) => t.ms)).toEqual([5000, 10000, 20000, 40000, 60000, 60000])
    expect(sources).toHaveLength(7)
    expect(sources.slice(0, 6).every((s) => s.closed)).toBe(true)
    expect(events).toEqual([])
    expect(backoff(0)).toBe(5000)
  })
  it('starts the backoff over after a ready', () => {
    const { sources, timers, ready } = setup()
    sources[0]!.onerror?.(new Event('error'))
    timers[0]!.fn()
    sources[1]!.emit('ready', {})
    sources[1]!.onerror?.(new Event('error'))
    expect(timers[1]!.ms).toBe(5000)
    timers[1]!.fn()
    sources[2]!.emit('ready', {})
    expect(ready.mock.calls).toEqual([[true], [false]])
  })
  it('reconnects after too_slow and shutdown', () => {
    const { sources, timers } = setup()
    sources[0]!.emit('end', { reason: 'too_slow' })
    expect(sources[0]!.closed).toBe(true)
    expect(timers).toHaveLength(1)
    timers[0]!.fn()
    sources[1]!.emit('end', { reason: 'shutdown' })
    expect(timers).toHaveLength(2)
  })
  it('stops for good after log_private', () => {
    const { sources, timers, stopped } = setup()
    sources[0]!.emit('end', { reason: 'log_private' })
    sources[0]!.onerror?.(new Event('error'))
    expect(stopped).toHaveBeenCalled()
    expect(sources[0]!.closed).toBe(true)
    expect(timers).toHaveLength(0)
  })
  it('ignores a closed source\'s late events and stop() cancels a pending retry', () => {
    const { sources, events, timers, feed } = setup()
    sources[0]!.onerror?.(new Event('error'))
    sources[0]!.emit('message', msg('late'))
    expect(events).toEqual([])
    feed.stop()
    expect(timers[0]!.ms).toBe(-1)
  })
})

describe('pronouns', () => {
  const table = { hehim: { subject: 'He', object: 'Him', singular: false }, any: { subject: 'Any', object: 'Any', singular: true } }
  const fetcher = (users: Record<string, unknown>) =>
    vi.fn(async (url: string | URL | Request) => {
      const u = String(url)
      if (u.endsWith('/pronouns')) return new Response(JSON.stringify(table))
      const login = decodeURIComponent(u.split('/users/')[1]!)
      return login in users ? new Response(JSON.stringify(users[login])) : new Response('not_found', { status: 404 })
    })
  it('shows pronouns, an alternate one, and asks once per login', async () => {
    const f = fetcher({ a: { pronoun_id: 'hehim', alt_pronoun_id: 'any' }, b: { pronoun_id: null, alt_pronoun_id: null } })
    const get = createPronouns(f as unknown as typeof fetch)
    expect(await get('a')).toBe('He/Him · Any')
    expect(await get('A')).toBe('He/Him · Any')
    expect(await get('b')).toBeNull()
    expect(await get('nobody')).toBeNull()
    expect(f.mock.calls.filter(([u]) => String(u).endsWith('/users/a'))).toHaveLength(1)
    expect(f.mock.calls.filter(([u]) => String(u).endsWith('/pronouns'))).toHaveLength(1)
  })
  it('fails silently', async () => {
    const get = createPronouns((() => Promise.reject(new Error('offline'))) as unknown as typeof fetch)
    expect(await get('a')).toBeNull()
  })
})
