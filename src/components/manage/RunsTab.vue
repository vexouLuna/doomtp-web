<script setup lang="ts">
// The latest command and trigger runs in a channel: what ran, how it ended, and how long it took.
import { VxButton, VxChip, VxInput, VxLoadState, VxSegmented, VxTable, timeAgo, type TableColumn } from '@vex/ui'
import { computed, ref } from 'vue'
import { useResource } from '@vex/ui/utils'
import { errorText } from '@vex/platform-web'
import ChatLine from '@/components/ChatLine.vue'
import { admin, type Run } from '@/lib/admin'

const props = defineProps<{ login: string; sign: string }>()
const LIMITS = [50, 100, 200, 500].map((n) => ({ value: String(n), label: String(n) }))
const limit = ref('50')
const { data, error, loading, reload } = useResource(
  async () => (await admin.runs(props.login, Number(limit.value))).runs,
  { source: () => [props.login, limit.value], resetOnSource: false },
)

const query = ref('')
const rows = computed(() => {
  const q = query.value.trim().toLowerCase()
  const all = data.value ?? []
  return q ? all.filter((r) => [r.expr, r.message, r.code, r.trigger_type, r.user_id].some((f) => f?.toLowerCase().includes(q))) : all
})
const COLUMNS: TableColumn[] = [
  { key: 'at', label: 'When', muted: true, nowrap: true },
  { key: 'trigger_type', label: 'From' },
  { key: 'expr', label: 'Expression', wrap: true, class: 'wrap' },
  { key: 'code', label: 'Outcome', wrap: true, class: 'wrap' },
  { key: 'duration_ms', label: 'Took', muted: true, nowrap: true },
  { key: 'user_id', label: 'User', muted: true, mono: true },
]
const outcome = (r: Run): { label: string; tone: 'ok' | 'bad' | 'warn' } =>
  r.cancelled_reason ? { label: r.cancelled_reason, tone: 'warn' } : r.code ? { label: r.code, tone: 'bad' } : { label: 'ok', tone: 'ok' }
</script>

<template>
  <section class="mtab">
    <div class="filters vx-form-row">
      <VxInput v-model="query" placeholder="Find in expressions and errors" aria-label="Find a run" class="grow" />
      <VxSegmented v-model="limit" :options="LIMITS" label="How many runs" />
      <VxButton :loading="loading" @click="reload">Refresh</VxButton>
    </div>
    <VxLoadState :error="error" :stale="!!data" :loading="!data" :empty="!data?.length" error-title="Couldn't load the runs" :error-text="errorText" :rows="6" empty-title="Nothing ran here yet" empty-text="Commands and triggers show up here once they run." @retry="reload">
      <VxTable v-if="data" class="vx-panel" :columns="COLUMNS" :rows="rows" label="Runs">
        <template #cell-at="{ row }"><span :title="new Date(row.at).toLocaleString()">{{ timeAgo(row.at) }}</span></template>
        <template #cell-trigger_type="{ row }"><VxChip :tone="row.trigger_type ? 'accent' : 'default'">{{ row.trigger_type ?? 'command' }}</VxChip></template>
        <template #cell-expr="{ row }"><ChatLine :lines="row.expr" :sign="sign" context="body" /></template>
        <template #cell-code="{ row }">
          <VxChip :tone="outcome(row).tone">{{ outcome(row).label }}</VxChip>
          <div v-if="row.message" class="vx-muted small">{{ row.message }}</div>
        </template>
        <template #cell-duration_ms="{ value }">{{ value === null ? '' : `${value} ms` }}</template>
        <template #empty>No run matches “{{ query }}”.</template>
      </VxTable>
    </VxLoadState>
  </section>
</template>
