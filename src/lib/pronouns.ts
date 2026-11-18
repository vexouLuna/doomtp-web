// Chatters' pronouns from the bot: GET /api/v2/channels/{login}/pronouns?user=a&user=b (doomtp-bot ADR-0039), readable
// by anyone while the channel's public log is on, like the live feed. The bot asks the pronouns service; the browser
// sends only the channel's own address, never a third party's.
//   200 { items: [{ login, status: 'set' | 'none' | 'unknown', display }] }, one item per distinct login asked.
// A public request is one of the log's 30 reads a minute per address, so lookups are batched (a short wait, at most 50
// logins a request) and answered once per chatter for the page's life. `unknown` (the service didn't answer) and any
// failure leave the chatter without pronouns and are asked again no sooner than a minute later. Never throws.
const WAIT_MS = 300
const RETRY_MS = 60_000
const MAX_USERS = 50
const LOGIN = /^[A-Za-z0-9_]{1,25}$/

interface Item {
  login: string
  status: 'set' | 'none' | 'unknown'
  display: string | null
}

export function createPronouns(channel: string, fetcher: typeof fetch = (...a) => fetch(...a), now: () => number = Date.now) {
  /** Settled answers: a string, or null for "none". */
  const known = new Map<string, string | null>()
  /** Logins not to ask about again before this time (ms). */
  const retryAt = new Map<string, number>()
  const waiting = new Map<string, ((v: string | null) => void)[]>()
  let timer: ReturnType<typeof setTimeout> | undefined

  async function flush() {
    timer = undefined
    const batch = [...waiting.keys()].slice(0, MAX_USERS)
    const done = new Map(batch.map((l) => [l, waiting.get(l)!]))
    for (const l of batch) waiting.delete(l)
    if (waiting.size) timer = setTimeout(flush, 0)
    const settle = (login: string, v: string | null) => done.get(login)?.forEach((r) => r(v))
    let items: Item[] = []
    try {
      const q = new URLSearchParams()
      for (const l of batch) q.append('user', l)
      const res = await fetcher(`/api/v2/channels/${encodeURIComponent(channel)}/pronouns?${q}`, { credentials: 'same-origin' })
      if (res.ok) items = ((await res.json()) as { items?: Item[] }).items ?? []
    } catch {
      // answered below as "no pronouns, ask later"
    }
    const byLogin = new Map(items.map((i) => [String(i.login).toLowerCase(), i]))
    for (const l of batch) {
      const i = byLogin.get(l)
      if (i?.status === 'set' && i.display) known.set(l, i.display)
      else if (i?.status === 'none') known.set(l, null)
      else retryAt.set(l, now() + RETRY_MS)
      settle(l, known.get(l) ?? null)
    }
  }

  /** A chatter's pronouns, or null (none, unknown, an error, or not yet allowed to ask again). */
  return (login: string): Promise<string | null> => {
    if (!LOGIN.test(login)) return Promise.resolve(null)
    const key = login.toLowerCase()
    if (known.has(key)) return Promise.resolve(known.get(key)!)
    if ((retryAt.get(key) ?? 0) > now()) return Promise.resolve(null)
    return new Promise((resolve) => {
      waiting.set(key, [...(waiting.get(key) ?? []), resolve])
      timer ??= setTimeout(flush, WAIT_MS)
    })
  }
}
