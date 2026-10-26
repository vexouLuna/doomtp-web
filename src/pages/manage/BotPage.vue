<script setup lang="ts">
// The bot itself, for its admins: health, joining channels, API keys, variable storage limits and the hosts
// `http get` may fetch, and what every channel inherits (admins, modules, rules, filter, ignored, published).
import { VxButton, VxCheckbox, VxChip, VxConfirm, VxDialog, VxEmptyState, VxField, VxInput, VxLoadState, VxTable, timeAgo, useToast, type TableColumn } from '@vex/ui'
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useResource } from '@vex/ui/utils'
import ManageShell from '@/components/ManageShell.vue'
import BotGlobal from '@/components/manage/BotGlobal.vue'
import HttpHostsPanel from '@/components/manage/HttpHostsPanel.vue'
import LimitsPanel from '@/components/manage/LimitsPanel.vue'
import '@/components/manage/tabs.css'
import { can } from '@/lib/access'
import { admin, health, type ApiKey } from '@/lib/admin'
import { errorText } from '@vex/platform-web'

const toast = useToast()
const router = useRouter()
const allowed = computed(() => can('bot'))
const { data, error, reload } = useResource(async () => {
  if (!allowed.value) return null
  const [ready, keys] = await Promise.all([health(), admin.keys()])
  return { ready, keys: keys.keys }
})

// ── health ──
const components = computed(() =>
  Object.entries(data.value?.ready?.components ?? {}).map(([name, c]) => {
    const { status, ...detail } = c
    return { name, status, detail: Object.entries(detail).map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`).join(' ') }
  }),
)
const tone = (status: string) => (status === 'ok' ? 'ok' : status === 'disabled' ? 'default' : 'bad')

// ── channels ──
const joinLogin = ref('')
const joining = ref(false)
async function join() {
  const login = joinLogin.value.trim().replace(/^#/, '').toLowerCase()
  if (!login) return
  joining.value = true
  try {
    await admin.join(login)
    joinLogin.value = ''
    toast.show(`Joined #${login}`)
    router.push(`/manage/channels/${encodeURIComponent(login)}`)
  } catch (e) {
    toast.show(`Couldn't join #${login}: ${errorText(e)}`, { kind: 'error', duration: 5000 })
  } finally {
    joining.value = false
  }
}

// ── API keys ──
const keyOpen = ref(false)
const keyName = ref('')
const keyWrite = ref(false)
const keyBusy = ref(false)
const keyError = ref<string | null>(null)
const secret = ref<{ name: string; value: string } | null>(null)
async function createKey() {
  if (!keyName.value.trim()) return
  keyBusy.value = true
  keyError.value = null
  try {
    const key = await admin.createKey(keyName.value.trim(), keyWrite.value ? ['read', 'write'] : ['read'])
    keyOpen.value = false
    secret.value = { name: key.name, value: key.secret }
    keyName.value = ''
    keyWrite.value = false
    await reload()
  } catch (e) {
    keyError.value = errorText(e)
  } finally {
    keyBusy.value = false
  }
}
async function copySecret() {
  if (!secret.value) return
  try {
    await navigator.clipboard.writeText(secret.value.value)
    toast.show('Key copied')
  } catch {
    toast.show("Couldn't copy: select it and copy by hand", { kind: 'error' })
  }
}

const revoking = ref<ApiKey | null>(null)
const revokeBusy = ref(false)
async function revoke() {
  if (!revoking.value) return
  revokeBusy.value = true
  try {
    await admin.revokeKey(revoking.value.id)
    toast.show(`Revoked ${revoking.value.name}`)
    revoking.value = null
    await reload()
  } catch (e) {
    toast.show(`Couldn't revoke: ${errorText(e)}`, { kind: 'error', duration: 5000 })
  } finally {
    revokeBusy.value = false
  }
}
const HEALTH_COLUMNS: TableColumn[] = [
  { key: 'name', label: 'Component', mono: true },
  { key: 'status', label: 'Status' },
  { key: 'detail', label: 'Detail', muted: true, wrap: true },
]
const KEY_COLUMNS: TableColumn[] = [
  { key: 'name', label: 'Name' },
  { key: 'scopes', label: 'Scopes' },
  { key: 'created_at', label: 'Created', muted: true },
  { key: 'last_used_at', label: 'Last used', muted: true },
  { key: 'actions', label: '', align: 'right', nowrap: true },
]
</script>

<template>
  <ManageShell title="Bot">
    <VxEmptyState v-if="!allowed" code="403" title="Bot admins only" text="This page runs the bot itself: its health, joining channels and API keys." />
    <VxLoadState v-else :error="error" :stale="!!data" :loading="!data" error-title="Couldn't load the bot's state" :error-text="errorText" :rows="8" @retry="reload">
      <template v-if="data">
        <section>
          <h2 class="vx-eyebrow sec">Health</h2>
          <VxTable class="vx-panel" :columns="HEALTH_COLUMNS" :rows="components" row-key="name" label="Health">
            <template #cell-status="{ row: c }"><VxChip :tone="tone(c.status)">{{ c.status }}</VxChip></template>
            <template #cell-detail="{ row: c }"><span class="detail">{{ c.detail }}</span></template>
          </VxTable>
        </section>

        <section>
          <h2 class="vx-eyebrow sec">Join a channel</h2>
          <form class="row" @submit.prevent="join">
            <label class="sr-only" for="join-login">Channel to join</label>
            <VxInput id="join-login" v-model="joinLogin" placeholder="channel login" mono grow width="14rem" max-width="20rem" />
            <VxButton type="submit" :loading="joining" :disabled="!joinLogin.trim()">Join channel</VxButton>
          </form>
          <p class="vx-muted small">The same as <code>join</code> in chat: the bot joins and subscribes to the channel's events.</p>
        </section>

        <section>
          <h2 class="vx-eyebrow sec">API keys</h2>
          <p class="vx-muted small">
            Keys for <code>/api/v1</code>. A <code>read</code> key sees configuration and logs; a <code>write</code> key
            also changes them. The key is shown once, when it's made, and only its hash is kept: if it's lost, revoke it
            and make another. The routes are on the <RouterLink to="/docs/api">API page</RouterLink>; the
            <code>/api/v2</code> ones (jobs, audit, chat log) are in <a href="/api/v2/docs">their own Swagger UI</a>, open to
            anyone signed in.
          </p>
          <VxTable class="vx-panel" :columns="KEY_COLUMNS" :rows="data.keys" row-key="id" label="API keys" empty="No keys yet.">
            <template #cell-scopes="{ row: k }"><VxChip v-for="s in k.scopes" :key="s" :tone="s === 'write' ? 'warn' : 'default'">{{ s }}</VxChip></template>
            <template #cell-created_at="{ row: k }">{{ timeAgo(k.created_at) }}</template>
            <template #cell-last_used_at="{ row: k }">{{ timeAgo(k.last_used_at) }}</template>
            <template #cell-actions="{ row: k }"><VxButton size="sm" variant="danger" @click="revoking = k">Revoke</VxButton></template>
          </VxTable>
          <div class="row"><VxButton @click="keyOpen = true">New key</VxButton></div>
        </section>

        <section>
          <h2 class="vx-eyebrow sec">Variable storage limits</h2>
          <p class="vx-muted small">
            How much each channel, publisher and chatter may store in variables. The same as
            <code>admin quota</code>, <code>valuecap</code>, <code>listitems</code> and <code>names</code> in chat.
          </p>
          <LimitsPanel />
        </section>

        <section>
          <h2 class="vx-eyebrow sec">HTTP hosts</h2>
          <p class="vx-muted small">The hosts custom commands may fetch with <code>http get</code>, the same as <code>admin http</code> in chat.</p>
          <HttpHostsPanel />
        </section>

        <BotGlobal />

      </template>
    </VxLoadState>

    <VxDialog v-model:open="keyOpen" title="New API key">
      <form id="new-key" class="dialog-form" @submit.prevent="createKey">
        <VxField label="What it's for" :error="keyError ?? undefined">
          <template #default="{ id }"><VxInput :id="id" v-model="keyName" placeholder="stream overlay" /></template>
        </VxField>
        <VxCheckbox v-model="keyWrite" label="Can also change settings (write)" />
      </form>
      <template #actions="{ close }">
        <VxButton @click="close">Cancel</VxButton>
        <VxButton type="submit" form="new-key" variant="primary" :loading="keyBusy" :disabled="!keyName.trim()">Create key</VxButton>
      </template>
    </VxDialog>

    <VxDialog :open="!!secret" title="Copy the key now" :dismissable="false" width="520px">
      It's shown this once. Only its hash is kept.
      <pre class="vx-code secret">{{ secret?.value }}</pre>
      <template #actions>
        <VxButton @click="copySecret">Copy</VxButton>
        <VxButton variant="primary" @click="secret = null">Done</VxButton>
      </template>
    </VxDialog>

    <VxConfirm
      :open="!!revoking"
      :title="`Revoke ${revoking?.name ?? ''}?`"
      @update:open="(v: boolean) => { if (!v) revoking = null }"
      confirm-label="Revoke"
      tone="danger"
      :loading="revokeBusy"
      @confirm="revoke"
    >
      Anything using this key stops working at once. This can't be undone.
    </VxConfirm>
  </ManageShell>
</template>

<style scoped>
section { margin-bottom: 28px; }
.sec { margin: 0 0 8px; }
.small { font-size: 13px; margin: 0 0 8px; }
.row { display: flex; flex-wrap: wrap; gap: 8px; margin: 10px 0 6px; }
.detail { font-family: var(--vx-font-mono); font-size: 12px; overflow-wrap: anywhere; }
.vx-chip + .vx-chip { margin-left: 4px; }
.dialog-form { display: grid; gap: 12px; margin-top: 12px; }
.secret { margin: 12px 0 0; white-space: pre-wrap; word-break: break-all; user-select: all; color: var(--vx-ink); }
</style>
