<script setup lang="ts">
// Every channel the bot is in, with what it does there: the Channels section of the home page in full.
import { VxButton, VxCallout, VxChip, VxSkeleton } from '@vex/ui'
import { usePoll } from '@vex/ui/utils'
import DtpShell from '@/components/DtpShell.vue'
import { channelCounts, yesNo } from '@/lib/channelCounts'
import { TIERS, loadSite, site } from '@/lib/site'

// The bot recounts every 30 seconds, so this asks no faster.
const { data: counts } = usePoll(channelCounts, 30_000)
const n = (value: number | undefined) => (value === undefined ? '—' : value.toLocaleString())
const since = (at: number | null | undefined) => (at ? new Date(at).toLocaleDateString(undefined, { dateStyle: 'medium' }) : '—')
</script>

<template>
  <DtpShell>
    <div class="doc">
      <h1 class="vx-display">Channels</h1>
      <p class="vx-muted">
        Where the bot is, what it may do there, and how busy each channel was over the last day.
      </p>
      <VxCallout v-if="site.error" tone="error" title="Couldn't load the channels">
        {{ site.error }}
        <template #actions><VxButton size="sm" @click="loadSite">Try again</VxButton></template>
      </VxCallout>
      <VxSkeleton v-else-if="!site.info" h="160px" />
      <p v-else-if="!site.info.channels.length" class="vx-muted">The bot hasn't joined any channels yet.</p>
      <div v-else class="table-scroll">
        <table class="vx-table">
          <thead>
            <tr>
              <th>Channel</th><th>Tier</th><th>Sign</th><th>Bot speaks</th><th>Moderates</th><th>Public log</th>
              <th>Joined</th><th class="num">Lines today</th><th class="num">Runs today</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="ch in site.info.channels" :key="ch.login">
              <td class="name"><RouterLink :to="`/channels/${ch.login}`" :title="`#${ch.login}`">#{{ ch.login }}</RouterLink></td>
              <td><VxChip :tone="ch.tier === 'full' ? 'ok' : 'default'" :title="TIERS[ch.tier]">{{ ch.tier }}</VxChip></td>
              <td class="vx-mono">{{ ch.prefix }}</td>
              <td>
                <VxChip v-if="ch.read_only" tone="warn" title="It keeps logging but never sends a message here">off</VxChip>
                <template v-else>{{ ch.read_only === undefined ? '—' : 'yes' }}</template>
              </td>
              <td>{{ yesNo(ch.can_moderate) }}</td>
              <td>{{ yesNo(ch.logs_public) }}</td>
              <td class="nowrap">{{ since(ch.joined_at) }}</td>
              <td class="num vx-mono">{{ n(counts?.[ch.login]?.messages_logged.day) }}</td>
              <td class="num vx-mono">{{ n(counts?.[ch.login]?.runs_day.ok) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </DtpShell>
</template>

<style scoped>
.num { text-align: right; white-space: nowrap; }
.nowrap { white-space: nowrap; }
.name { max-width: 14rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
