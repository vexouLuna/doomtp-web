// The OBS chat overlay's logic, apart from its page: the settings a link carries, the bounded list of lines, and the
// client of the bot's live feed (ADR-0038 of doomtp-bot: server-sent events at /api/v2/channels/{login}/chat/live).
import type { LogMessage, LogNotification } from '@vex/platform-web/chat'

// ── settings ──
export interface OverlaySettings {
  /** Text size, px. */
  size: number
  /** Emote height, px; 0 is "a little over the text size". */
  emote: number
  /** `chatter`: each chatter's own Twitch colour; else one colour for every name, `#rrggbb`. */
  color: string
  badges: boolean
  pronouns: boolean
  /** The most lines kept. */
  lines: number
  /** Seconds a line stays before it fades out; 0 keeps it until newer lines push it off. */
  fade: number
  /** Lines of the log's recent past to start with. */
  history: number
  /** Subs, raids and the like, as lines. */
  notices: boolean
  /** Messages that are commands (`!so someone`). */
  commands: boolean
  shadow: boolean
  names: 'display' | 'login' | 'both'
}

export const DEFAULTS: OverlaySettings = {
  size: 24, emote: 0, color: 'chatter', badges: true, pronouns: false, lines: 20, fade: 0, history: 0,
  notices: false, commands: false, shadow: true, names: 'display',
}

const get = (q: URLSearchParams | Record<string, unknown>, k: string): string | null => {
  const v = q instanceof URLSearchParams ? q.get(k) : q[k]
  const s = Array.isArray(v) ? v[0] : v
  return typeof s === 'string' ? s : null
}
/** A whole number inside [min, max]; a value outside it is the nearest bound, a missing or broken one the fallback. */
const int = (raw: string | null, min: number, max: number, fallback: number): number => {
  if (raw === null || raw.trim() === '') return fallback
  const n = Number(raw)
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback
}
const flag = (raw: string | null, fallback: boolean): boolean => (raw === '1' || raw === 'on' ? true : raw === '0' || raw === 'off' ? false : fallback)

/** The overlay's settings out of a link's query. Every one is optional and bounded. */
export function parseSettings(q: URLSearchParams | Record<string, unknown>): OverlaySettings {
  const hex = /^#?([0-9a-f]{6})$/i.exec((get(q, 'color') ?? '').trim())
  const fade = int(get(q, 'fade'), 0, 3600, DEFAULTS.fade)
  const names = get(q, 'names')
  return {
    size: int(get(q, 'size'), 12, 96, DEFAULTS.size),
    emote: int(get(q, 'emote'), 0, 192, DEFAULTS.emote),
    color: hex ? `#${hex[1]!.toLowerCase()}` : 'chatter',
    badges: flag(get(q, 'badges'), DEFAULTS.badges),
    pronouns: flag(get(q, 'pronouns'), DEFAULTS.pronouns),
    lines: int(get(q, 'lines'), 1, 100, DEFAULTS.lines),
    // A line that vanished in under 5 s couldn't be read.
    fade: fade === 0 ? 0 : Math.max(5, fade),
    history: int(get(q, 'history'), 0, 100, DEFAULTS.history),
    notices: flag(get(q, 'notices'), DEFAULTS.notices),
    commands: flag(get(q, 'commands'), DEFAULTS.commands),
    shadow: flag(get(q, 'shadow'), DEFAULTS.shadow),
    names: names === 'login' || names === 'both' ? names : 'display',
  }
}

// ── lines ──
export type Entry = LogMessage | LogNotification
export interface Row {
  id: string
  userId: string | null
  entry: Entry
  /** When it arrived here, ms: its fade counts from it. */
  born: number
}

/** `entry` added to the end of `rows`, which keep at most `max` (the oldest go). One already shown is left as it is. */
export function addRow(rows: readonly Row[], entry: Entry, max: number, now: number): Row[] {
  if (rows.some((r) => r.id === entry.id)) return rows as Row[]
  const next = [...rows, { id: entry.id, userId: entry.user?.id ?? null, entry, born: now }]
  return next.length > max ? next.slice(next.length - max) : next
}
export const removeMessage = (rows: readonly Row[], id: string): Row[] => rows.filter((r) => r.id !== id)
/** A user's messages go (their subs and the like stay: nothing was removed there). */
export const clearUser = (rows: readonly Row[], userId: string): Row[] => rows.filter((r) => !(r.userId === userId && r.entry.kind === 'message'))
export const expire = (rows: readonly Row[], fadeSeconds: number, now: number): Row[] =>
  fadeSeconds ? rows.filter((r) => now - r.born < fadeSeconds * 1000) : (rows as Row[])

// ── the feed ──
export type FeedEvent =
  | { type: 'message'; entry: LogMessage }
  | { type: 'notification'; entry: LogNotification }
  | { type: 'delete'; messageId: string }
  | { type: 'user_clear'; userId: string }
  | { type: 'chat_clear' }

/** What the feed needs of an EventSource, so a test can stand in for one. */
export interface SourceLike {
  addEventListener(type: string, listener: (e: MessageEvent) => void): void
  onerror: ((e: Event) => void) | null
  close(): void
}

export interface FeedOptions {
  url: string
  open?: (url: string) => SourceLike
  onEvent: (e: FeedEvent) => void
  /** The feed said `ready`: the first time with `first` true. */
  onReady?: (first: boolean) => void
  /** The channel made its log private: the feed stopped for good. */
  onStopped?: () => void
  /** Milliseconds before a retry after `attempt` failures in a row (0 for the first). */
  delay?: (attempt: number) => number
  schedule?: (fn: () => void, ms: number) => unknown
  cancel?: (handle: unknown) => void
}

/** Retries slowly: a bot that doesn't have the route yet (404) or keeps the log private (401) is asked once a minute at last. */
export const backoff = (attempt: number): number => Math.min(60_000, 5_000 * 2 ** attempt)

/** The live feed, reconnecting with backoff. EventSource's own reconnect is never used: it can't tell a 404 from a drop. */
export function connectFeed(opts: FeedOptions) {
  const open = opts.open ?? ((u: string) => new EventSource(u))
  const delay = opts.delay ?? backoff
  const schedule = opts.schedule ?? ((fn, ms) => setTimeout(fn, ms))
  const cancel = opts.cancel ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>))
  let source: SourceLike | null = null
  let timer: unknown = null
  let attempt = 0
  let seen = false
  let stopped = false

  function retry() {
    source?.close()
    source = null
    if (stopped) return
    timer = schedule(connect, delay(attempt++))
  }
  function on(es: SourceLike, type: string, fn: (data: Record<string, unknown>) => void) {
    es.addEventListener(type, (e) => {
      if (es !== source) return
      try {
        const data = JSON.parse(e.data)
        if (data && typeof data === 'object') fn(data as Record<string, unknown>)
      } catch {
        // a line that isn't JSON is skipped
      }
    })
  }
  function connect() {
    timer = null
    const es = open(opts.url)
    source = es
    es.onerror = () => {
      if (es === source) retry()
    }
    on(es, 'ready', () => {
      attempt = 0
      opts.onReady?.(!seen)
      seen = true
    })
    on(es, 'message', (d) => d.id && opts.onEvent({ type: 'message', entry: d as unknown as LogMessage }))
    on(es, 'notification', (d) => d.id && opts.onEvent({ type: 'notification', entry: d as unknown as LogNotification }))
    on(es, 'delete', (d) => typeof d.message_id === 'string' && opts.onEvent({ type: 'delete', messageId: d.message_id }))
    on(es, 'user_clear', (d) => d.user_id != null && opts.onEvent({ type: 'user_clear', userId: String(d.user_id) }))
    on(es, 'chat_clear', () => opts.onEvent({ type: 'chat_clear' }))
    on(es, 'end', (d) => {
      if (d.reason === 'log_private') {
        stop()
        opts.onStopped?.()
      } else retry()
    })
  }
  function stop() {
    stopped = true
    if (timer !== null) cancel(timer)
    source?.close()
    source = null
  }
  connect()
  return { stop }
}
