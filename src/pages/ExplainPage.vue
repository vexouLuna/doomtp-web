<script setup lang="ts">
import { VxLoadState } from '@vex/ui'
import { computed } from 'vue'
import { useResource } from '@vex/ui/utils'
import { errorText } from '@vex/platform-web'
import DtpShell from '@/components/DtpShell.vue'
import ExplainReport from '@/components/ExplainReport.vue'
import { api, statusOf } from '@/lib/api'

const props = defineProps<{ token: string }>()
const { data: report, error, reload } = useResource(() => api.explainReport(props.token), { source: () => props.token })
const status = computed(() => statusOf(error.value))
</script>

<template>
  <DtpShell>
    <div class="doc">
      <h1 class="vx-display">What this would do</h1>
      <template v-if="status === 404">
        <p class="vx-muted">
          This report is gone. Reports are kept in memory for an hour, and not across a restart: run
          <code>explain</code> in chat again for a fresh link, or try the line in the
          <RouterLink to="/docs/language#try">language page's editor</RouterLink>.
        </p>
      </template>
      <VxLoadState v-else :error="error" :stale="!!report" :loading="!report" error-title="Couldn't load the report" :error-text="errorText" @retry="reload">
        <template v-if="report">
          <ExplainReport :report="report" />
          <p class="vx-muted note">The report is checked against the rank of whoever asked, and kept for an hour.</p>
        </template>
      </VxLoadState>
    </div>
  </DtpShell>
</template>

<style scoped>
.doc { max-width: none; }
.note { margin-top: 18px; }
</style>
