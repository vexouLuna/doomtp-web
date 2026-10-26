<script setup lang="ts">
// Every page's frame: the shared shell with dtp's nav, Manage lives in the account menu
// (the Manage bar itself is on the Manage pages, ManageShell), and the bot's version and default sign in the footer.
import { VxSiteFooter, VxSiteShell } from '@vex/ui'
import type { NavItem } from '@vex/ui'
import { useAccount } from '@vex/ui/account'
import { computed, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { bounceOnce, ensure, session } from '@/lib/session'
import { loadSite, site } from '@/lib/site'
import AccountMenu from './AccountMenu.vue'

withDefaults(defineProps<{ sky?: 'full' | 'dim' | 'off' }>(), { sky: 'full' })

const account = useAccount()
const route = useRoute()

// RouterLink marks only an exact match, so Channels is set current by hand to stay lit on a channel's own page.
const nav = computed<NavItem[]>(() => [
  { label: 'Features', to: '/docs/features' },
  { label: 'Commands', to: '/docs/commands' },
  { label: 'Language', to: '/docs/language' },
  { label: 'API', to: '/docs/api' },
  { label: 'Channels', to: '/channels', current: route.path.startsWith('/channels') },
  { label: 'Stats', to: '/stats' },
])

onMounted(() => {
  loadSite()
  ensure()
})
// Signed in to the vexoul.net account but not to the bot: one trip through the bot's sign-in makes the session.
watch(
  () => [account.user.value, session.checked] as const,
  ([user, checked]) => {
    if (checked && !route.meta.public) bounceOnce(!!user, route.fullPath)
  },
  { immediate: true },
)
</script>

<template>
  <VxSiteShell site="dtp" :nav="nav" :sky="sky">
    <template #account><AccountMenu /></template>
    <slot></slot>
    <template #footer>
      <VxSiteFooter>
        <span v-if="site.info" class="meta">
          doomtp-bot {{ site.info.version }} · language {{ site.info.syntax_version }} · default sign
          <code>{{ site.info.default_prefix }}</code>
        </span>
      </VxSiteFooter>
    </template>
  </VxSiteShell>
</template>

<style scoped>
.meta { font-size: 12px; }
</style>
