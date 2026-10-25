// The bot's vex-platform routes (/api/v2: job runs, their events and kinds, the audit log) through the shared client.
// Same rules as every other call (api.ts `auth`): the session's CSRF token on writes, and a 401 ends the session.
import { PlatformClient } from '@vex/platform-web'
import { auth } from './api'

async function platformFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(input, init)
  if (res.status === 401) auth.onUnauthorized?.()
  return res
}

export const platform = new PlatformClient({
  base: '/api/v2',
  csrf: () => auth.csrf,
  fetch: platformFetch,
  credentials: 'same-origin',
})

/** A backfill job's subject: `channel:<id>`. */
export const channelSubject = (channelId: string) => `channel:${channelId}`
