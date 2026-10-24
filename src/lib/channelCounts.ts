// Each joined channel's counts, for the Channels and Right now pages: one /channels/{login}/stats call per channel.
import { api, type Counts } from './api'
import { loadSite } from './site'

/** Counts by login; a channel whose counts didn't load (or a bot before doomtp-bot #176) maps to null. */
export async function channelCounts(): Promise<Record<string, Counts | null>> {
  const info = await loadSite()
  const logins = info?.channels.map((c) => c.login) ?? []
  const counts = await Promise.all(logins.map((login) => api.channelStats(login).catch(() => null)))
  return Object.fromEntries(logins.map((login, i) => [login, counts[i]]))
}

/** yes / no for a field an older bot leaves out, which shows as a dash. */
export const yesNo = (value: boolean | undefined) => (value === undefined ? '—' : value ? 'yes' : 'no')
