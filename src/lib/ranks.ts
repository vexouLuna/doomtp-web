// Chat's role ranks as the bot gives them (GET /roles): the built-in roles the Manage pages gate on (moderator,
// broadcaster, bot_admin...). Loaded with the session (lib/session.ts).
import { reactive } from 'vue'
import { api } from './api'

const state = reactive({
  ranks: {} as Record<string, number>,
})

/** A built-in role's rank, or undefined before /roles has answered (and for a role it doesn't list). */
export const rankOf = (role: string): number | undefined => state.ranks[role]

/** Loads the ranks once; a failure leaves them unknown, and the pages offer nothing that needs one. */
export async function loadRanks(): Promise<void> {
  try {
    const got = await api.roles()
    state.ranks = Object.fromEntries(got.roles.map((r) => [r.name, r.rank]))
  } catch {
    // The bot is unreachable: the next ensure() after a refresh asks again.
  }
}
