<script setup lang="ts">
// The Manage bar: at the top of the Manage pages (ManageShell), with what the person signed in may manage. A channel
// switcher for the channels they run, their own area, Explain and Audit, and the bot's jobs and own page for admins.
// On a narrow screen it wraps; nothing is dropped.
import { VxNavBar, VxSelect, type NavLink } from '@vex/ui'
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { can, isAdmin } from '@/lib/access'
import { session } from '@/lib/session'
import { site } from '@/lib/site'

const route = useRoute()
const router = useRouter()

const current = (to: string, exact = false) => (exact ? route.path === to : route.path === to || route.path.startsWith(`${to}/`))
const LINKS = computed<NavLink[]>(() =>
  [
    { label: 'Overview', to: '/manage', exact: true },
    { label: 'Me', to: '/manage/me' },
    { label: 'Explain', to: '/manage/explain' },
    { label: 'Audit', to: '/manage/audit' },
    ...(can('bot') ? [{ label: 'Jobs', to: '/manage/jobs' }] : []),
    ...(can('bot') ? [{ label: 'Bot', to: '/manage/bot' }] : []),
  ].map(({ exact, ...l }) => ({ ...l, current: current(l.to, exact) })),
)

/** The channels to switch between: an admin's are every channel the bot knows. */
const channels = computed(() => {
  const logins = isAdmin() ? (site.info?.channels ?? []).map((c) => c.login) : [...(session.channels ?? [])]
  return logins.sort().map((login) => ({
    value: login,
    label: `#${login}`,
    sub: session.channelRoles?.[login] === 'broadcaster' ? 'yours' : undefined,
  }))
})
const channel = computed(() => {
  const m = /^\/manage\/channels\/([^/]+)/.exec(route.path)
  return m ? decodeURIComponent(m[1]!) : undefined
})
function open(login: string | undefined) {
  if (login && login !== channel.value) router.push(`/manage/channels/${encodeURIComponent(login)}`)
}

const who = computed(() => {
  if (!session.user) return 'admin'
  const role = session.role === 'admin' ? 'bot admin' : null
  return role ? `@${session.user.login} · ${role}` : `@${session.user.login}`
})
</script>

<template>
  <VxNavBar :links="LINKS" label="Manage" title="Manage">
    <template #lead>
      <VxSelect
        v-if="channels.length"
        :model-value="channel"
        :options="channels"
        placeholder="Channel…"
        size="sm"
        width="190px"
        aria-label="Channel to manage"
        @update:model-value="open"
      />
    </template>
    <template #trail><span class="who vx-mono">{{ who }}</span></template>
  </VxNavBar>
</template>

<style scoped>
.who { display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
</style>
