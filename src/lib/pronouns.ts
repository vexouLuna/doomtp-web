// Pronouns from alejo.io's service, the one the Twitch Chat Pronouns browser extension (and Chatterino's and FFZ's
// pronoun add-ons) read: https://api.pronouns.alejo.io/v1. The service publishes no written API reference or terms,
// so what this relies on is what it answers (checked 2026-11-18):
//   GET /v1/pronouns            -> { <id>: { name, subject, object, singular } }, one table
//   GET /v1/users/{login}       -> { channel_id, channel_login, pronoun_id, alt_pronoun_id }, or 404 for nobody
// Only the chatter's login is sent, once per chatter per session, from the viewer's browser (OBS). Never called unless
// the overlay's `pronouns` setting is on; any failure means no pronouns, quietly.
const BASE = 'https://api.pronouns.alejo.io/v1'

interface Pronoun {
  subject: string
  object: string
  singular: boolean
}
type Table = Record<string, Pronoun>

/** "He/Him"; a singular one ("Any", "Other") stands alone. */
export const show = (p: Pronoun): string => (p.singular ? p.subject : `${p.subject}/${p.object}`)

export function createPronouns(fetcher: typeof fetch = (...a) => fetch(...a)) {
  let table: Promise<Table | null> | null = null
  const cache = new Map<string, Promise<string | null>>()
  const getTable = () =>
    (table ??= fetcher(`${BASE}/pronouns`)
      .then((r) => (r.ok ? (r.json() as Promise<Table>) : null))
      .catch(() => null))

  async function load(login: string): Promise<string | null> {
    const [pronouns, res] = await Promise.all([getTable(), fetcher(`${BASE}/users/${encodeURIComponent(login)}`)])
    if (!pronouns || !res.ok) return null
    const u = (await res.json()) as { pronoun_id?: string | null; alt_pronoun_id?: string | null }
    const names = [u.pronoun_id, u.alt_pronoun_id].flatMap((id) => (id && pronouns[id] ? [show(pronouns[id])] : []))
    return names.length ? names.join(' · ') : null
  }
  /** A chatter's pronouns, or null. Asked once per login for the page's life. */
  return (login: string): Promise<string | null> => {
    const key = login.toLowerCase()
    let hit = cache.get(key)
    if (!hit) cache.set(key, (hit = load(key).catch(() => null)))
    return hit
  }
}
