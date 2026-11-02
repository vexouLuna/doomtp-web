<script setup lang="ts">
// What the bot is doing right now, in full: its own counts, then the same counts for each channel.
import { VxSkeleton } from '@vex/ui'
import { usePoll } from '@vex/ui/utils'
import DtpShell from '@/components/DtpShell.vue'
import StatsPanel from '@/components/StatsPanel.vue'
import { api } from '@/lib/api'
import { channelCounts } from '@/lib/channelCounts'

// The bot recounts every 30 seconds, so neither poll asks faster.
const { data: stats } = usePoll(() => api.stats(), 30_000)
const { data: counts } = usePoll(channelCounts, 30_000)
const n = (value: number) => value.toLocaleString()
</script>

<template>
  <DtpShell>
    <div class="doc">
      <h1 class="vx-display">Right now</h1>
      <p class="vx-muted">The bot's counts, kept fresh while this page is open. It recounts every 30 seconds.</p>
      <StatsPanel v-if="stats" :counts="stats" :build="stats" />
      <VxSkeleton v-else h="140px" />

      <h2 class="vx-display">By channel</h2>
      <VxSkeleton v-if="!counts" h="120px" />
      <p v-else-if="!Object.keys(counts).length" class="vx-muted">The bot hasn't joined any channels yet.</p>
      <div v-else class="table-scroll">
        <table class="vx-table">
          <thead>
            <tr>
              <th>Channel</th><th class="num">Lines, hour</th><th class="num">Lines, day</th>
              <th class="num">Bot sent, day</th><th class="num">Runs ran</th><th class="num">failed</th>
              <th class="num">held back</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(c, login) in counts" :key="login">
              <td class="name"><RouterLink :to="`/channels/${login}`" :title="`#${login}`">#{{ login }}</RouterLink></td>
              <template v-if="c">
                <td class="num vx-mono" data-label="Lines, hour">{{ n(c.messages_logged.hour) }}</td>
                <td class="num vx-mono" data-label="Lines, day">{{ n(c.messages_logged.day) }}</td>
                <td class="num vx-mono" data-label="Bot sent, day">{{ n(c.messages_sent.day) }}</td>
                <td class="num vx-mono" data-label="Runs ran">{{ n(c.runs_day.ok) }}</td>
                <td class="num vx-mono" data-label="Failed">{{ n(c.runs_day.failed) }}</td>
                <td class="num vx-mono" data-label="Held back">{{ n(c.runs_day.cancelled) }}</td>
              </template>
              <td v-else colspan="6" class="vx-muted">No counts for this channel.</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="vx-muted small">Held back: runs that moderation cancelled before they finished.</p>
    </div>
  </DtpShell>
</template>

<style scoped>
/* A data page: the table takes the full width, only the prose keeps the reading measure. */
.doc { max-width: none; }
.doc > p { max-width: 52rem; }
.num { text-align: right; white-space: nowrap; }
.name { max-width: 14rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.small { font-size: 12px; }
</style>
