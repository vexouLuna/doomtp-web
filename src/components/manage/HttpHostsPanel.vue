<script setup lang="ts">
// The hosts `http get` may fetch (ADR-0020), the same as `admin http` in chat: allow and remove them, attach a
// secret the bot adds to each request (its value goes in and never comes back), and the rate limits.
import { VxButton, VxCheckbox, VxChip, VxConfirm, VxDialog, VxField, VxInput, VxLoadState, VxRadioGroup, VxTable, timeAgo, type TableColumn } from '@vex/ui'
import { computed, reactive, ref, watch } from 'vue'
import { useResource } from '@vex/ui/utils'
import { errorText } from '@vex/platform-web'
import { admin, type HttpHost, type HttpLimits } from '@/lib/admin'
import { count } from '@/lib/format'
import { useAct } from '@/lib/useAct'

const { data, error, reload } = useResource(() => admin.httpHosts())
const { busy, act } = useAct(reload)

const COLUMNS: TableColumn[] = [
  { key: 'pattern', label: 'Host', mono: true, wrap: true, class: 'wrap' },
  { key: 'plain_http', label: 'Scheme' },
  { key: 'secret', label: 'Secret' },
  { key: 'added_at', label: 'Added', muted: true, nowrap: true },
  { key: 'actions', label: '', align: 'right', nowrap: true },
]

// ── allow a host ──
const adding = reactive({ pattern: '', plainHttp: false })
async function allow() {
  const pattern = adding.pattern.trim().toLowerCase()
  if (!pattern) return
  if (await act('allow', () => admin.allowHost(pattern, adding.plainHttp), `${pattern} allowed`)) {
    adding.pattern = ''
    adding.plainHttp = false
  }
}
const removing = ref<HttpHost | null>(null)
const remove = (h: HttpHost) => act('deny', () => admin.denyHost(h.pattern), `${h.pattern} removed`).then((ok) => ok && (removing.value = null))

// ── secrets: write only ──
const SECRET_KINDS = [
  { value: 'header', label: 'Header' },
  { value: 'query', label: 'Query parameter' },
]
const secretFor = ref<HttpHost | null>(null)
const secret = reactive({ kind: 'header' as 'header' | 'query', name: '', value: '' })
function editSecret(h: HttpHost) {
  Object.assign(secret, { kind: h.secret?.kind ?? 'header', name: h.secret?.name ?? '', value: '' })
  secretFor.value = h
}
async function saveSecret() {
  const h = secretFor.value
  if (!h || !secret.name.trim() || !secret.value) return
  const body = { kind: secret.kind, name: secret.name.trim(), value: secret.value }
  if (await act('secret', () => admin.setHostSecret(h.pattern, body), `Secret set for ${h.pattern}`)) {
    secret.value = ''
    secretFor.value = null
  }
}
const clearSecret = (h: HttpHost) => act(`clear:${h.pattern}`, () => admin.clearHostSecret(h.pattern), `Secret removed from ${h.pattern}`)

// ── rate limits ──
const limits = reactive<Record<keyof HttpLimits, string | number>>({ channel_per_minute: '', host_per_minute: '' })
watch(data, (d) => {
  if (d) Object.assign(limits, { channel_per_minute: String(d.limits.channel_per_minute), host_per_minute: String(d.limits.host_per_minute) })
})
const limitsPatch = computed<Partial<HttpLimits>>(() => {
  const out: Partial<HttpLimits> = {}
  for (const k of ['channel_per_minute', 'host_per_minute'] as const) {
    const n = count(limits[k])
    if (n !== null && n !== data.value?.limits[k]) out[k] = n
  }
  return out
})
const saveLimits = () => act('limits', () => admin.setHttpLimits(limitsPatch.value), 'HTTP rate limits saved')
</script>

<template>
  <div class="mtab">
    <VxLoadState :error="error" :stale="!!data" :loading="!data" error-title="Couldn't load the HTTP hosts" :error-text="errorText" :rows="3" @retry="reload">
      <template v-if="data">
        <VxTable wrap class="vx-panel" :columns="COLUMNS" :rows="data.hosts" row-key="pattern" label="HTTP hosts">
          <template #cell-plain_http="{ row }"><VxChip :tone="row.plain_http ? 'warn' : 'default'">{{ row.plain_http ? 'http too' : 'https' }}</VxChip></template>
          <template #cell-secret="{ row }">
            <span v-if="row.secret" class="vx-mono">{{ row.secret.kind }} {{ row.secret.name }}</span>
            <span v-else class="vx-muted">none</span>
          </template>
          <template #cell-added_at="{ row }">
            <span :title="row.added_at ? new Date(row.added_at).toLocaleString() : undefined">{{ timeAgo(row.added_at) }}<template v-if="row.added_by"> · {{ row.added_by }}</template></span>
          </template>
          <template #cell-actions="{ row }">
            <VxButton size="sm" variant="ghost" @click="editSecret(row)">{{ row.secret ? 'Replace secret' : 'Add secret' }}</VxButton>
            <VxButton v-if="row.secret" size="sm" variant="ghost" :loading="busy.has(`clear:${row.pattern}`)" @click="clearSecret(row)">Remove secret</VxButton>
            <VxButton size="sm" variant="danger" @click="removing = row">Remove</VxButton>
          </template>
          <template #empty>No hosts yet: <code>http get</code> can't fetch anything.</template>
        </VxTable>
        <form class="add vx-form-row vx-panel" @submit.prevent="allow">
          <VxField label="Host" class="grow" help="A name like api.example.com, or *.example.com for its subdomains.">
            <template #default="{ id }"><VxInput :id="id" v-model="adding.pattern" mono placeholder="api.example.com" /></template>
          </VxField>
          <VxCheckbox v-model="adding.plainHttp" label="Allow plain http" />
          <VxButton type="submit" variant="primary" :loading="busy.has('allow')" :disabled="!adding.pattern.trim()">Allow</VxButton>
        </form>

        <h3 class="vx-eyebrow sub">Rate limits</h3>
        <form class="add vx-form-row vx-panel" @submit.prevent="saveLimits">
          <VxField label="Requests a minute, per channel">
            <template #default="{ id }"><VxInput :id="id" v-model="limits.channel_per_minute" type="number" mono /></template>
          </VxField>
          <VxField label="Requests a minute, per host">
            <template #default="{ id }"><VxInput :id="id" v-model="limits.host_per_minute" type="number" mono /></template>
          </VxField>
          <VxButton type="submit" variant="primary" :loading="busy.has('limits')" :disabled="!Object.keys(limitsPatch).length">Save limits</VxButton>
        </form>
      </template>
    </VxLoadState>

    <VxDialog :open="secretFor !== null" :title="`Secret for ${secretFor?.pattern ?? ''}`" @update:open="(v: boolean) => { if (!v) secretFor = null }">
      <form id="host-secret" class="dialog-form" @submit.prevent="saveSecret">
        <p class="vx-muted small">
          The bot adds it to every request to this host. Once saved, the value can't be read back, only replaced.
        </p>
        <VxRadioGroup v-model="secret.kind" :options="SECRET_KINDS" label="Sent as" inline />
        <VxField :label="secret.kind === 'header' ? 'Header name' : 'Parameter name'">
          <template #default="{ id }"><VxInput :id="id" v-model="secret.name" mono :placeholder="secret.kind === 'header' ? 'Authorization' : 'api_key'" /></template>
        </VxField>
        <VxField label="Value">
          <template #default="{ id }"><VxInput :id="id" v-model="secret.value" type="password" mono autocomplete="off" /></template>
        </VxField>
      </form>
      <template #actions="{ close }">
        <VxButton @click="close">Cancel</VxButton>
        <VxButton type="submit" form="host-secret" variant="primary" :loading="busy.has('secret')" :disabled="!secret.name.trim() || !secret.value">Save secret</VxButton>
      </template>
    </VxDialog>
    <VxConfirm
      :open="removing !== null"
      :title="`Remove ${removing?.pattern ?? ''}?`"
      @update:open="(v: boolean) => { if (!v) removing = null }"
      confirm-label="Remove"
      tone="danger"
      :loading="busy.has('deny')"
      @confirm="remove(removing!)"
    >
      Commands that fetch from it fail from now on, and its secret is dropped.
    </VxConfirm>
  </div>
</template>
