<script setup lang="ts">
// Variable storage limits (ADR-0019), the same as `admin quota|valuecap|listitems|names` in chat: the defaults for
// every owner, and overrides for one channel, publisher or chatter.
import { VxButton, VxField, VxInput, VxLoadState, VxSelect } from '@vex/ui'
import { computed, reactive, watch } from 'vue'
import { useResource } from '@vex/ui/utils'
import { bytes, errorText } from '@vex/platform-web'
import { admin, OWNER_KINDS, type LimitOverride, type Limits, type LimitsPatch } from '@/lib/admin'
import { count } from '@/lib/format'
import { useAct } from '@/lib/useAct'
import UserRef from '@/components/UserRef.vue'

const FIELDS: { key: keyof Limits; label: string; size: boolean }[] = [
  { key: 'quota_bytes', label: 'Quota (bytes)', size: true },
  { key: 'value_cap_bytes', label: 'Largest value (bytes)', size: true },
  { key: 'list_items', label: 'Items a list', size: false },
  { key: 'names_per_space', label: 'Names a namespace', size: false },
]
const show = (f: (typeof FIELDS)[number], v: number | null | undefined) => (v === null || v === undefined ? 'default' : f.size ? bytes(v) : String(v))

const { data, error, reload } = useResource(() => admin.variableLimits())
const { busy, act } = useAct(reload)

// ── defaults: the form starts at what the bot has, and sends only what changed ──
const defaults = reactive<Record<keyof Limits, string | number>>({ quota_bytes: '', value_cap_bytes: '', list_items: '', names_per_space: '' })
watch(data, (d) => {
  if (d) for (const f of FIELDS) defaults[f.key] = String(d.defaults[f.key])
})
const defaultsPatch = computed<LimitsPatch>(() => {
  const out: LimitsPatch = {}
  for (const f of FIELDS) {
    const n = count(defaults[f.key])
    if (n !== null && n !== data.value?.defaults[f.key]) out[f.key] = n
  }
  return out
})
const saveDefaults = () => act('defaults', () => admin.setDefaultLimits(defaultsPatch.value), 'Default limits saved')

// ── one owner's override: blank keeps a field, `default` puts it back to the default ──
const KIND_OPTIONS = OWNER_KINDS.map((k) => ({ value: k, label: k }))
const owner = reactive({ kind: 'channel', user: '', quota_bytes: '', value_cap_bytes: '', list_items: '', names_per_space: '' })
const ownerPatch = computed<LimitsPatch | null>(() => {
  const out: LimitsPatch = {}
  for (const f of FIELDS) {
    const raw = owner[f.key].trim().toLowerCase()
    if (!raw) continue
    if (raw === 'default') out[f.key] = null
    else if (/^\d+$/.test(raw)) out[f.key] = Number(raw)
    else return null
  }
  return out
})
const ownerReady = computed(() => !!owner.user.trim() && !!ownerPatch.value && Object.keys(ownerPatch.value).length > 0)
/** Loads an override into the form, to change it or put fields back to the default. */
function editOwner(o: LimitOverride) {
  if (!o.owner_login) return
  owner.kind = o.owner_kind
  owner.user = o.owner_login
  for (const f of FIELDS) owner[f.key] = o[f.key] === null || o[f.key] === undefined ? '' : String(o[f.key])
}
async function saveOwner() {
  const who = owner.user.trim().replace(/^[@#]/, '')
  if (!ownerReady.value) return
  if (await act('owner', () => admin.setOwnerLimits(owner.kind, who, ownerPatch.value!), `Limits for ${owner.kind} @${who} saved`)) {
    for (const f of FIELDS) owner[f.key] = ''
  }
}
</script>

<template>
  <div class="mtab">
    <VxLoadState :error="error" :stale="!!data" :loading="!data" error-title="Couldn't load the storage limits" :error-text="errorText" :rows="3" @retry="reload">
      <template v-if="data">
        <form class="add vx-form-row vx-panel" @submit.prevent="saveDefaults">
          <VxField v-for="f in FIELDS" :key="f.key" :label="f.label" :help="f.size ? bytes(Number(defaults[f.key]) || 0) : undefined">
            <template #default="{ id }"><VxInput :id="id" v-model="defaults[f.key]" type="number" mono /></template>
          </VxField>
          <VxButton type="submit" variant="primary" :loading="busy.has('defaults')" :disabled="!Object.keys(defaultsPatch).length">Save defaults</VxButton>
        </form>

        <h3 class="vx-eyebrow sub">Overrides</h3>
        <div class="table-scroll vx-panel">
          <table class="vx-table">
            <thead><tr><th>Owner</th><th v-for="f in FIELDS" :key="f.key">{{ f.label.replace(/ \(bytes\)$/, '') }}</th><th></th></tr></thead>
            <tbody>
              <tr v-for="o in data.overrides" :key="`${o.owner_kind}/${o.owner_id}`">
                <td class="nowrap"><span class="vx-muted">{{ o.owner_kind }}</span> <UserRef :id="o.owner_id" :login="o.owner_login" /></td>
                <td v-for="f in FIELDS" :key="f.key" :class="{ 'vx-muted': o[f.key] === null || o[f.key] === undefined }">{{ show(f, o[f.key]) }}</td>
                <td class="end"><VxButton v-if="o.owner_login" size="sm" @click="editOwner(o)">Edit</VxButton></td>
              </tr>
              <tr v-if="!data.overrides.length"><td :colspan="FIELDS.length + 2" class="vx-muted">Every owner has the defaults.</td></tr>
            </tbody>
          </table>
        </div>
        <form class="add vx-form-row vx-panel" @submit.prevent="saveOwner">
          <VxField label="Owner kind"><template #default><VxSelect v-model="owner.kind" :options="KIND_OPTIONS" width="140px" /></template></VxField>
          <VxField label="Twitch login">
            <template #default="{ id }"><VxInput :id="id" v-model="owner.user" mono placeholder="login" /></template>
          </VxField>
          <VxField v-for="f in FIELDS" :key="f.key" :label="f.label">
            <template #default="{ id }"><VxInput :id="id" v-model="owner[f.key]" mono placeholder="keep" /></template>
          </VxField>
          <VxButton type="submit" variant="primary" :loading="busy.has('owner')" :disabled="!ownerReady">Set override</VxButton>
        </form>
        <p class="vx-muted small">Leave a field blank to keep it; type <code>default</code> to put it back to the default.</p>
      </template>
    </VxLoadState>
  </div>
</template>
