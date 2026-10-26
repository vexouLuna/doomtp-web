<script setup lang="ts">
// History backfill jobs for a channel: the queue and the latest finished ones. The broadcaster queues a pass over
// every gap in the log (as `backfill` does in chat), or any range they pick (from before the bot was listening,
// say), and cancels a job that hasn't started. Each is a `chat_backfill` job run: an admin follows it to its job page.
import { VxButton, VxCallout, VxChip, VxDateInput, VxEmptyState, VxField, VxTable, timeAgo, type TableColumn } from '@vex/ui'
import { computed, reactive, ref, watch } from 'vue'
import { useResource } from '@vex/ui/utils'
import { errorText } from '@vex/platform-web'
import { can, isAdmin } from '@/lib/access'
import { admin, type BackfillJob } from '@/lib/admin'
import { useAct } from '@/lib/useAct'
import { dateTime, localInput } from '@/lib/format'

const props = defineProps<{ login: string }>()
const { data, error, reload } = useResource(() => admin.backfill(props.login), { source: () => props.login })
const { busy, act } = useAct(reload)
const mayRun = computed(() => can('backfill.run', props.login))

const TONE: Record<string, 'ok' | 'bad' | 'accent' | 'default'> = { done: 'ok', failed: 'bad', running: 'accent' }

// ── a range of their choosing, in the viewer's own time ──
const HOUR = 3_600_000
const parse = (v: string) => (v ? new Date(v).getTime() : null)
const range = reactive({ from: '', to: '' })
const fromMs = computed(() => parse(range.from))
const toMs = computed(() => parse(range.to))
const rangeError = computed(() => {
  const now = Date.now()
  if (fromMs.value === null) return null
  if (fromMs.value >= now) return 'The start is in the future.'
  if (toMs.value !== null && toMs.value <= fromMs.value) return 'The end must come after the start.'
  return null
})
// When the log begins: the day before it is the usual "before the bot was up" range.
const logStart = ref<number | null>(null)
watch(
  () => [props.login, mayRun.value && data.value?.enabled] as const,
  async ([login, load]) => {
    logStart.value = null
    if (!load) return
    try {
      const got = await admin.coverage(login, new Date(0).toISOString())
      const start = got.gaps.find((g) => g.reason === 'before_log')?.end
      logStart.value = start ? Date.parse(start) : null
    } catch {
      // no coverage (an older bot, or no log): the preset just isn't offered
    }
  },
  { immediate: true },
)
const PRESETS = [
  { label: 'Last hour', hours: 1 },
  { label: 'Last 6 hours', hours: 6 },
  { label: 'Last 24 hours', hours: 24 },
]
function preset(hours: number) {
  Object.assign(range, { from: localInput(Date.now() - hours * HOUR), to: '' })
}
function beforeLog() {
  if (logStart.value === null) return
  Object.assign(range, { from: localInput(logStart.value - 24 * HOUR), to: localInput(logStart.value) })
}
async function queueRange() {
  if (fromMs.value === null || rangeError.value) return
  const body = { from_ms: fromMs.value, ...(toMs.value === null ? {} : { to_ms: toMs.value }) }
  if (await act('range', () => admin.startBackfill(props.login, body), 'Queued a backfill of that range')) {
    Object.assign(range, { from: '', to: '' })
  }
}

const result = (j: BackfillJob) =>
  j.error ?? (j.state === 'done' ? `${j.inserted} new of ${j.fetched} fetched${j.complete === false ? ', partial' : ''}` : '')
const COLUMNS: TableColumn[] = [
  { key: 'range', label: 'Range', nowrap: true },
  { key: 'state', label: 'State', nowrap: true },
  { key: 'requested_at', label: 'Asked', muted: true, nowrap: true },
  { key: 'result', label: 'Result', wrap: true, class: 'wrap' },
  { key: 'actions', label: '', align: 'right', nowrap: true },
]
</script>

<template>
  <section class="backfill vx-panel">
    <div class="head">
      <h3 class="vx-eyebrow">Backfill jobs</h3>
      <VxButton
        v-if="mayRun"
        size="sm"
        variant="primary"
        :disabled="!data?.enabled"
        :loading="busy.has('gaps')"
        @click="act('gaps', () => admin.startBackfill(login, { gaps: true }), 'Queued a backfill of the gaps in the log')"
      >Backfill the gaps now</VxButton>
    </div>
    <p v-if="data && !data.enabled" class="vx-muted small">Turn Backfill on (above) to fill gaps in the log.</p>
    <p v-else-if="!mayRun" class="vx-muted small">Only the broadcaster starts a backfill.</p>
    <form v-if="mayRun && data?.enabled" class="range" @submit.prevent="queueRange">
      <p class="vx-muted small">
        Or fetch a range of your choosing, in your own time: chat from before the bot joined, say. The history
        service keeps only recent chat, and only for channels it was already following, so an older range can come
        back partial.
      </p>
      <div class="vx-form-row">
        <VxField label="From" :error="rangeError ?? undefined">
          <template #default="{ id }">
            <VxDateInput :id="id" v-model="range.from" time :max="localInput(Date.now())" required />
          </template>
        </VxField>
        <VxField label="To" help="Empty: until now.">
          <template #default="{ id }">
            <VxDateInput :id="id" v-model="range.to" time :min="range.from || undefined" :max="localInput(Date.now())" />
          </template>
        </VxField>
        <VxButton type="submit" :disabled="fromMs === null || !!rangeError" :loading="busy.has('range')">Backfill this range</VxButton>
      </div>
      <div class="presets">
        <button v-for="p in PRESETS" :key="p.label" type="button" class="vx-chip" @click="preset(p.hours)">{{ p.label }}</button>
        <button
          v-if="logStart !== null"
          type="button"
          class="vx-chip"
          :title="`The log begins ${dateTime(logStart)}`"
          @click="beforeLog"
        >The day before the log began</button>
      </div>
    </form>
    <VxCallout v-if="error" tone="error" title="Couldn't load the backfill jobs">{{ errorText(error) }}</VxCallout>
    <VxEmptyState v-else-if="data && !data.jobs.length" title="No backfill jobs yet" />
    <VxTable wrap v-else-if="data" :columns="COLUMNS" :rows="data.jobs" row-key="id" label="Backfill jobs">
      <template #cell-range="{ row: j }"><span class="small">{{ dateTime(j.from_ms) }} → {{ dateTime(j.to_ms) }}</span></template>
      <template #cell-state="{ row: j }">
        <VxChip :tone="TONE[j.state] ?? 'default'">{{ j.state }}</VxChip>
        <RouterLink v-if="isAdmin()" class="job small" :to="`/manage/jobs/${j.id}`">job {{ j.id }}</RouterLink>
      </template>
      <template #cell-requested_at="{ row: j }">
        <span class="small" :title="new Date(j.requested_at).toLocaleString()">{{ timeAgo(j.requested_at) }} · {{ j.requested_by }}</span>
      </template>
      <template #cell-result="{ row: j }"><span class="small" :class="{ bad: j.error }">{{ result(j) }}</span></template>
      <template #cell-actions="{ row: j }">
        <VxButton
          v-if="mayRun && j.state === 'queued'"
          size="sm"
          variant="ghost"
          :loading="busy.has(`c:${j.id}`)"
          @click="act(`c:${j.id}`, () => admin.cancelBackfill(login, j.id), 'Backfill job cancelled')"
        >Cancel</VxButton>
      </template>
    </VxTable>
  </section>
</template>

<style scoped>
.backfill { display: grid; gap: 8px; padding: 14px 16px; margin-top: 14px; }
.head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; }
.head h3 { margin: 0; }
.range { display: grid; gap: 10px; padding: 4px 0 8px; }
.presets { display: flex; flex-wrap: wrap; gap: 6px; }
.presets .vx-chip { cursor: pointer; }
.small { font-size: 12px; margin: 0; }
.bad { color: var(--vx-bad); }
.job { margin-left: 6px; color: inherit; }
</style>
