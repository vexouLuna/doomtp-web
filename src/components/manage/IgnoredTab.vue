<script setup lang="ts">
// The users the bot ignores in a channel (and everywhere): their messages are logged but never run commands. With
// `everywhere`, the bot-wide list alone, for bot admins: `login` is then any joined channel (the bot-wide routes go
// through one), or null when the bot is in none and the list can only be read.
import { VxButton, VxCheckbox, VxChip, VxConfirm, VxField, VxInput, VxTable, timeAgo, type TableColumn } from '@vex/ui'
import { computed, reactive, ref } from 'vue'
import ChatLine from '@/components/ChatLine.vue'
import { can, isMe } from '@/lib/access'
import { admin, type Ignored } from '@/lib/admin'
import { useAct } from '@/lib/useAct'
import { atName, loginOf } from '@/lib/format'

const props = defineProps<{ login: string | null; sign: string; ignored: Ignored[]; reload: () => Promise<void>; everywhere?: boolean }>()
const { busy, act } = useAct(props.reload)

const ignoring = reactive({ login: '', reason: '', everywhere: false })
async function ignore() {
  const who = loginOf(ignoring.login)
  const at = props.login
  if (!who || !at) return
  const everywhere = props.everywhere || ignoring.everywhere
  const ok = await act(
    'ignore',
    () => admin.ignore(at, { login: who, everywhere, reason: ignoring.reason.trim() || undefined }),
    `Ignoring @${who}${everywhere ? ' everywhere' : ''}`,
  )
  if (!ok) return
  ignoring.login = ''
  ignoring.reason = ''
}
const columns = computed<TableColumn[]>(() => [
  { key: 'login', label: 'User' },
  ...(props.everywhere ? [] : [{ key: 'everywhere', label: 'Where' }]),
  { key: 'addedBy', label: 'Ignored by' },
  { key: 'addedAt', label: 'When', muted: true, nowrap: true },
  { key: 'reason', label: 'Reason', muted: true, wrap: true, class: 'wrap' },
  { key: 'actions', label: '', align: 'right', nowrap: true },
])
const name = (u: Ignored) => atName(u.login, u.userId)
/** A moderator lifts ignores in this channel, an admin also bot-wide ones; anyone may lift their own self-ignore. */
const mayLift = (u: Ignored, at: string) => (u.self && isMe(u.userId)) || (can('ignored.edit', at) && (!u.everywhere || can('ignored.everywhere')))
/** Who may add: a channel's moderators here, a bot admin everywhere (and only with a channel to go through). */
const mayAdd = (at: string | null): at is string => !!at && (props.everywhere ? can('ignored.everywhere') : can('ignored.edit', at))
const lifting = ref<Ignored | null>(null)
const lift = (u: Ignored, at: string) =>
  act('unignore', () => admin.unignore(at, u.userId, u.everywhere), `${name(u)} isn't ignored ${u.everywhere ? 'anywhere' : 'here'} any more`).then(
    (ok) => ok && (lifting.value = null),
  )
</script>

<template>
  <section class="mtab">
    <p v-if="everywhere" class="vx-muted intro">Their messages are logged in every channel but never run a command.</p>
    <p v-else class="vx-muted intro">
      Their messages are still logged but never run commands. Changed from chat with
      <ChatLine :lines="`${sign}ignore add <user>`" :sign="sign" />; chatters can opt out with
      <ChatLine :lines="`${sign}ignore me`" :sign="sign" /> and take it back with
      <ChatLine :lines="`${sign}unignore me`" :sign="sign" />.
    </p>
    <VxTable class="vx-panel" :columns="columns" :rows="ignored" :row-key="(u) => `${u.everywhere}${u.userId}`" label="Ignored users">
      <template #cell-login="{ row }">
        <span v-if="row.login">@{{ row.login }}</span>
        <span v-else class="vx-mono">{{ row.userId }}</span>
      </template>
      <template #cell-everywhere="{ row }">{{ row.everywhere ? 'every channel' : 'this channel' }}</template>
      <template #cell-addedBy="{ row }">
        <VxChip v-if="row.self" tone="accent" title="They asked for it, so they can undo it themselves">themselves</VxChip>
        <span v-else-if="row.addedByLogin">@{{ row.addedByLogin }}</span>
        <span v-else-if="row.addedBy" class="vx-mono">{{ row.addedBy }}</span>
        <span v-else class="vx-muted" title="Set with the admin password or an API key">admin</span>
      </template>
      <template #cell-addedAt="{ row }"><span :title="row.addedAt ? new Date(row.addedAt).toLocaleString() : undefined">{{ timeAgo(row.addedAt) }}</span></template>
      <template #cell-actions="{ row }">
        <template v-if="login">
          <VxButton v-if="row.self && isMe(row.userId)" size="sm" @click="lifting = row">Stop ignoring me</VxButton>
          <VxButton v-else-if="mayLift(row, login)" size="sm" variant="ghost" @click="lifting = row">Unignore</VxButton>
        </template>
      </template>
      <template #empty>Nobody is ignored {{ everywhere ? 'everywhere' : 'here' }}.</template>
    </VxTable>
    <form v-if="mayAdd(login)" class="add vx-form-row vx-panel" @submit.prevent="ignore">
      <VxField label="User">
        <template #default="{ id }"><VxInput :id="id" v-model="ignoring.login" mono placeholder="twitch login" /></template>
      </VxField>
      <VxField label="Reason" class="grow">
        <template #default="{ id }"><VxInput :id="id" v-model="ignoring.reason" placeholder="optional" /></template>
      </VxField>
      <VxCheckbox v-if="!everywhere && can('ignored.everywhere')" v-model="ignoring.everywhere" label="In every channel" />
      <VxButton type="submit" variant="primary" :loading="busy.has('ignore')" :disabled="!ignoring.login.trim()">{{ everywhere ? 'Ignore everywhere' : 'Ignore' }}</VxButton>
    </form>
    <p v-else-if="everywhere && !login" class="vx-muted intro">The bot has to be in a channel to ignore someone everywhere.</p>

    <VxConfirm
      :open="lifting !== null"
      :title="lifting && isMe(lifting.userId) ? 'Stop ignoring you?' : `Unignore ${lifting ? name(lifting) : ''}?`"
      @update:open="(v: boolean) => { if (!v) lifting = null }"
      confirm-label="Unignore"
      :loading="busy.has('unignore')"
      @confirm="lift(lifting!, login!)"
    >
      <template v-if="lifting && isMe(lifting.userId)">The bot answers your commands here again.</template>
      <template v-else>The bot answers their commands {{ lifting?.everywhere ? 'in every channel' : 'here' }} again.</template>
    </VxConfirm>
  </section>
</template>
