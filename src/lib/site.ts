// What every page's chrome needs from the bot (version, default sign, whether admin exists), loaded once.
import { reactive } from 'vue'
import { errorText } from '@vex/platform-web'
import { api, type Site } from './api'

export const site = reactive<{ info: Site | null; error: string | null }>({ info: null, error: null })

let loading: Promise<Site | null> | null = null

/** Loads /api/v1/site once; later calls share the same answer. */
export function loadSite(): Promise<Site | null> {
  loading ??= api.site().then(
    (info) => (site.info = info),
    (e: unknown) => {
      site.error = errorText(e)
      loading = null // let the next page try again
      return null
    },
  )
  return loading
}

/** The bot's own Twitch channel, where a broadcaster types join. */
// shortcut: /site doesn't name the bot's own login yet; read it from there once doomtp-bot adds it.
export const BOT_CHANNEL = 'doomtopyramidsbot'

/** What each channel tier means, for the tier chips (the tiers table on the features page has more). */
export const TIERS: Record<string, string> = {
  basic: 'Basic: the bot reads chat and replies. Comes with joining',
  moderator: 'Moderator: the broadcaster modded the bot, for follow events, moderation detail and higher send limits',
  full: 'Full: the broadcaster connected the bot, for channel points, sub and cheer events and the chat bot badge',
}

/** The bot's default command sign, or its long-standing default while /site loads. */
export const defaultSign = () => site.info?.default_prefix ?? '🏜'
