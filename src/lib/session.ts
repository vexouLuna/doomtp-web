// The bot session: one reactive session for the whole app. DtpShell loads it on every page, so the Manage bar
// shows as soon as someone is signed in; the router guard awaits it on /manage pages. A 401 from any call made with
// the session drops it, and the next step lands on the sign-in page. The asking, CSRF and 401 handling are
// platform-web's useAdminSession; this adds chat's ranks and reads the bot's own fields.
import { useAdminSession } from '@vex/platform-web/vue'
import { computed, reactive, readonly } from 'vue'
import { admin, type Session } from './admin'
import { auth } from './api'
import { loadRanks } from './ranks'

const core = useAdminSession<Session>({
  auth,
  load: admin.session,
  logout: admin.logout,
  signedOut: (s) => ({
    ...s,
    authenticated: false,
    csrf: null,
    expires_at: null,
    role: null,
    user: null,
    channels: null,
    channel_roles: null,
    channel_ranks: null,
    own_channel: null,
  }),
})
const field = <K extends keyof Session>(k: K) => computed(() => core.data.value?.[k] ?? null)

/** The session as the bot gave it: signing in and out, the router guard, the account menu and every page read it. */
export const session = readonly(
  reactive({
    checked: core.checked,
    authenticated: core.authenticated,
    /** False when the password login isn't offered here: none is set, or this visitor is off its networks. */
    enabled: computed(() => core.data.value?.admin_enabled ?? true),
    /** Whether the bot offers signing in with Twitch. */
    twitchLogin: computed(() => !!core.data.value?.twitch_login),
    expiresAt: field('expires_at'),
    /** What the session may do (see access.ts); an older bot doesn't say, which means admin. */
    role: field('role'),
    /** The signed-in Twitch user; null for the admin password. */
    user: field('user'),
    /** The channels the session manages; null means every channel (an admin). */
    channels: field('channels'),
    /** Why it manages each one, and its chat rank there (custom roles included). Null for an admin. */
    channelRoles: field('channel_roles'),
    channelRanks: field('channel_ranks'),
    /** The user's own channel, for the "add the bot" and "upgrade" buttons. */
    ownChannel: field('own_channel'),
    /** Why the visitor was sent to the sign-in page (an expired session). */
    notice: core.notice,
  }),
)

/** Called (by main.ts) with a way to reach the sign-in page when the session ends mid-use. */
export const setExpiredHandler = core.setExpiredHandler

let pending: Promise<void> | null = null
/** Loads the session once, with chat's ranks; later calls share the answer. */
export function ensure(): Promise<void> {
  if (session.checked) return Promise.resolve()
  pending ??= Promise.all([core.ensure(), loadRanks()])
    .then(() => undefined)
    .finally(() => (pending = null))
  return pending
}

/** Asks the bot again, after something that changes what the session manages (adding the bot to a channel). */
export function refresh(): Promise<void> {
  return Promise.all([core.refresh(), loadRanks()]).then(() => undefined)
}

/**
 * Where the Twitch sign-in starts: the bot sends the person to Twitch (or through the vexoul.net account, ADR-0023) and
 * back to its own callback, which sets the session cookie and lands on `next` (a path on this site), or on
 * /admin/login?error=<reason> when it fails.
 */
export function twitchLoginUrl(next: string): string {
  return `/auth/admin/login?${new URLSearchParams({ next })}`
}

/** Where a broadcaster grants the bot more of their channel (a basic or moderator tier becomes full). */
export const CONNECT_URL = '/auth/connect'

const BOUNCED = 'dtp:signin-bounced'
/**
 * Someone signed in to their vexoul.net account but without a bot session goes through the bot's sign-in once, which
 * comes straight back signed in. At most once per tab, so a sign-in that fails can't loop. True if it navigated.
 */
export function bounceOnce(accountSignedIn: boolean, here: string, go = (url: string) => window.location.assign(url)): boolean {
  if (!accountSignedIn || !session.checked || session.authenticated || !session.twitchLogin) return false
  try {
    if (sessionStorage.getItem(BOUNCED)) return false
    sessionStorage.setItem(BOUNCED, '1')
  } catch {
    return false // no storage: no way to tell a second bounce from the first, so none at all
  }
  go(twitchLoginUrl(here))
  return true
}

/** Why a Twitch sign-in came back to the sign-in page (`?error=` from the bot's callback). */
export const SIGNIN_ERRORS: Record<string, string> = {
  denied: 'The sign-in was cancelled on Twitch.',
  expired: 'The sign-in took too long, or was finished in another browser. Try again.',
  twitch: "Twitch didn't answer. Try again in a moment.",
  no_channels: "That Twitch account doesn't own or moderate any channel the bot is in.",
  not_configured: "Signing in with Twitch isn't set up on this bot.",
}

export async function login(password: string): Promise<void> {
  core.signIn(await admin.login(password))
}

export const logout = core.logout

/** Adds the bot to the user's own channel; the session manages it straight away. */
export async function joinOwnChannel(): Promise<void> {
  await admin.joinOwn()
  await refresh()
}
