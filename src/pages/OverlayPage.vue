<script setup lang="ts">
// The OBS chat overlay (/overlay/:login): a bare, see-through page with a channel's chat as it is said, for an OBS
// browser source. Public, no sign-in. It follows the bot's live feed (server-sent events, ADR-0038) and draws lines with
// the same pieces as the chat log (7TV/BTTV/FFZ emotes, Twitch badges); a deleted message, a timed-out chatter's
// messages or a cleared chat disappear. Settings come from the link's query (lib/overlayChat.ts). Against a bot that
// doesn't have the feed yet, or whose channel keeps its log private, the page stays empty and asks again slowly: it
// never shows an error, since nobody is there to read one.
import { loadBadges, loadChannelEmotes, toChatLine, type EmoteSet, type LogEntry, type RawBadges } from '@vex/platform-web/chat'
import { ChatLine } from '@vex/platform-web/vue'
import { useAccount } from '@vex/ui/account'
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { useRoute } from 'vue-router'
import { api } from '@/lib/api'
import { addRow, clearUser, connectFeed, expire, parseSettings, removeMessage, type Entry, type FeedEvent, type Row } from '@/lib/overlayChat'
import { createPronouns } from '@/lib/pronouns'

const props = defineProps<{ login: string }>()
const route = useRoute()
const account = useAccount()
// A link either carries its settings, or a saved preset's public id (`?p=`, which vexoul.net/obs_sources makes): then they are
// read from vex-auth, no sign-in. The feed waits for them; a preset that can't be read leaves the defaults.
const s = shallowRef(parseSettings(route.query))
async function presetSettings(signal: AbortSignal) {
  const id = route.query.p
  if (typeof id !== 'string' || !id) return
  try {
    const res = await fetch(`${account.base}/v2/public/presets/${encodeURIComponent(id)}`, { headers: { Accept: 'application/json' }, signal })
    if (!res.ok) return
    const value = ((await res.json()) as { value?: Record<string, unknown> }).value ?? {}
    // The form keeps toggles as booleans and numbers as numbers: a link carries them as text.
    s.value = parseSettings(Object.fromEntries(Object.entries(value).map(([k, v]) => [k, typeof v === 'boolean' ? (v ? '1' : '0') : String(v)])))
  } catch {
    // the defaults
  }
}
const base = computed(() => `/api/v2/channels/${encodeURIComponent(props.login)}`)

// A bare page: the library paints the page black under a site shell, so the overlay clears it and puts it back after.
let saved = { html: '', body: '' }
const rows = shallowRef<Row[]>([])
const emotes = shallowRef<EmoteSet | null>(null)
const badges = shallowRef<RawBadges | null>(null)
const pronouns = ref<Record<string, string>>({})
const lookup = createPronouns(props.login)

function apply(e: FeedEvent) {
  const now = Date.now()
  if (e.type === 'message') {
    // Commands (`!so x`) show unless the link says hidecommands.
    if (e.entry.is_command && s.value.hideCommands) return
    rows.value = addRow(rows.value, e.entry, s.value.lines, now)
  } else if (e.type === 'notification') {
    if (s.value.notices) rows.value = addRow(rows.value, e.entry, s.value.lines, now)
  } else if (e.type === 'delete') rows.value = removeMessage(rows.value, e.messageId)
  else if (e.type === 'user_clear') rows.value = clearUser(rows.value, e.userId)
  else rows.value = []
}

/** The log's recent past under the live lines: oldest first, what is already shown left out. */
async function loadHistory(ctl: AbortSignal) {
  const n = s.value.history
  if (!n) return
  try {
    const res = await fetch(`${base.value}/log?order=desc&limit=${n}&kind=message&hide_removed=true`, { signal: ctl })
    if (!res.ok) return
    const items = ((await res.json()) as { items?: Entry[] }).items ?? []
    const now = Date.now()
    const known = new Set(rows.value.map((r) => r.id))
    const old = items.filter((m) => !known.has(m.id) && !(m.kind === 'message' && m.is_command && s.value.hideCommands)).reverse()
    // Behind the live ones: they were said earlier.
    let past: Row[] = []
    for (const m of old) past = addRow(past, m, s.value.lines, now)
    rows.value = [...past, ...rows.value].slice(-s.value.lines)
  } catch {
    // no history: the live lines are enough
  }
}

let feed: { stop(): void } | null = null
const ctl = new AbortController()
let sweep: ReturnType<typeof setInterval> | undefined
onMounted(async () => {
  saved = { html: document.documentElement.style.cssText, body: document.body.style.cssText }
  document.documentElement.style.background = 'transparent'
  document.body.style.cssText += ';background:transparent;margin:0;overflow:hidden'
  document.title = `#${props.login} chat`

  await presetSettings(ctl.signal)
  if (ctl.signal.aborted) return
  loadBadges(`${base.value}/badges`, { signal: ctl.signal }).then((b) => (badges.value = b), () => {})
  // The third-party emotes are by the channel's Twitch id, which the bot's site API knows. Without it only Twitch's show.
  api.channel(props.login)
    .then((c) => (c.channel_id ? loadChannelEmotes(c.channel_id, { signal: ctl.signal }) : null))
    .then((set) => (emotes.value = set), () => {})

  feed = connectFeed({
    url: `${base.value}/chat/live`,
    onEvent: apply,
    onReady: (first) => first && loadHistory(ctl.signal),
  })
  sweep = setInterval(() => {
    if (s.value.fade) {
      const next = expire(rows.value, s.value.fade, Date.now())
      if (next.length !== rows.value.length) rows.value = next
    }
  }, 1000)
})
onBeforeUnmount(() => {
  feed?.stop()
  ctl.abort()
  clearInterval(sweep)
  document.documentElement.style.cssText = saved.html
  document.body.style.cssText = saved.body
})

// Pronouns, from the bot (lib/pronouns.ts batches and caches the asking), only while the setting is on.
watch(
  [rows, () => s.value.pronouns],
  ([list, on]) => {
    if (!on) return
    for (const r of list) {
      const login = r.entry.user?.login
      const key = login?.toLowerCase()
      if (!key || key in pronouns.value) continue
      lookup(key).then((p) => p && (pronouns.value = { ...pronouns.value, [key]: p }))
    }
  },
  { flush: 'post' },
)

const view = computed(() =>
  rows.value.map((r) => ({
    id: r.id,
    born: r.born,
    login: r.entry.user?.login ?? null,
    line: toChatLine(r.entry as LogEntry, emotes.value, badges.value),
  })),
)
const style = computed(() => ({
  '--size': `${s.value.size}px`,
  '--emote': `${s.value.emote || Math.round(s.value.size * 1.4)}px`,
  '--badge': `${Math.round(s.value.size * 0.8)}px`,
  ...(s.value.color !== 'chatter' ? { '--name': s.value.color } : {}),
}))
</script>

<template>
  <main class="ov" :class="{ shadow: s.shadow, fixed: s.color !== 'chatter' }" :style="style" aria-live="off">
    <ChatLine
      v-for="l in view"
      :key="l.id"
      class="row"
      :style="s.fade ? { '--life': `${s.fade}s` } : undefined"
      :class="{ fades: s.fade }"
      :line="l.line"
      :badges="s.badges"
      :names="s.names"
      colors="readable"
    >
      <template #before><span v-if="s.pronouns && l.login && pronouns[l.login.toLowerCase()]" class="pn">{{ pronouns[l.login.toLowerCase()] }}</span></template>
    </ChatLine>
  </main>
</template>

<style scoped>
.ov {
  --vxp-chat-ink: #fff; --vxp-chat-muted: rgb(255 255 255 / 0.7);
  position: fixed; inset: 0; display: flex; flex-direction: column; justify-content: flex-end; overflow: hidden;
  padding: 8px 12px; box-sizing: border-box; font: 500 var(--size)/1.35 var(--vx-font-sans, system-ui, sans-serif); color: #fff;
}
.ov.shadow { text-shadow: 0 0 3px #000, 0 1px 3px #000, 0 0 8px rgb(0 0 0 / 0.7); }
.row { padding: 2px 0; flex: none; }
/* The library sizes emotes and badges in px; these follow the settings instead. */
.row :deep(.img) { height: var(--emote); vertical-align: middle; }
.row :deep(.badges) { vertical-align: middle; }
.row :deep(.badges img) { width: var(--badge); height: var(--badge); }
.ov.fixed .row :deep(.who) { color: var(--name) !important; }
.row.notice { background: rgb(0 0 0 / 0.35); }
.pn { font-size: 0.6em; font-weight: 600; margin-right: 6px; padding: 0 5px; border-radius: 4px; background: rgb(255 255 255 / 0.18); vertical-align: middle; }
/* A line is removed from the page once it is gone (the page's sweep), not hidden: this only fades it out first. */
.row.fades { animation: out 0.6s ease-in forwards; animation-delay: calc(var(--life) - 0.6s); }
@keyframes out { to { opacity: 0; } }
@media (prefers-reduced-motion: reduce) { .row.fades { animation-duration: 0.01s; } }
</style>
