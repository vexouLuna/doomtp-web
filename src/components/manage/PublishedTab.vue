<script setup lang="ts">
// The custom commands chat can run in a channel. One published on its own turns on and off here, as `cc
// enable|disable` does in chat, and one in a pack follows the pack (the Modules tab). Whoever reaches the channel's
// "publish" role publishes their own commands and packs here, or a pack someone shared, and takes them down again;
// whoever reaches its "grant" role lets published commands write the channel's variables.
import { VxButton, VxCallout, VxCheckbox, VxChip, VxConfirm, VxDialog, VxEmptyState, VxField, VxInput, VxSegmented, VxSelect, VxSwitch, VxTable, useToast, type TableColumn } from '@vex/ui'
import { computed, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useResource } from '@vex/ui/utils'
import ChatLine from '@/components/ChatLine.vue'
import { reachesRole } from '@/lib/access'
import { admin, type Grant } from '@/lib/admin'
import { errorText } from '@vex/platform-web'
import { type Pack, type Role } from '@/lib/api'
import { CUSTOM_MODULE, type PublishedRow } from '@/lib/modules'
import { session } from '@/lib/session'
import { useAct } from '@/lib/useAct'
import { loginOf } from '@/lib/format'

const props = defineProps<{
  login: string
  sign: string
  published: PublishedRow[]
  packs: Pack[]
  /** The channel's `publish_min_role` and `grant_min_role`. */
  publishRole: string
  grantRole: string
  roles: Role[]
  reload: () => Promise<void>
}>()
const route = useRoute()
const toast = useToast()

const mayPublish = computed(() => reachesRole(props.login, props.publishRole, props.roles))
const mayGrant = computed(() => reachesRole(props.login, props.grantRole, props.roles))
/** Publishing names the publisher, so it takes a Twitch sign-in (not the admin password). */
const hasUser = computed(() => !!session.user)

const grants = useResource(async () => (await admin.grants(props.login)).grants, { source: () => props.login })
const reloadAll = async () => {
  await Promise.all([props.reload(), grants.reload(), mine.reload()])
}
const { busy, act } = useAct(reloadAll)

const toggleable = (p: PublishedRow) => p.module === CUSTOM_MODULE && (p.status === 'active' || p.status === 'disabled')
const toggle = (p: PublishedRow, on: boolean) =>
  act(`p:${p.name}`, () => admin.setPublication(props.login, p.name, on), `${props.sign}${p.name} turned ${on ? 'on' : 'off'}`)
const channelPacks = computed(() => props.packs.filter((p) => p.scope === 'channel'))
const packOwner = (p: Pack) => {
  const owner = p.commands[0]?.owner
  return owner && owner !== session.user?.login ? owner : undefined
}

// ── publishing: one of your commands (or aliases), your pack, or a pack someone shared ──
const mine = useResource(async () => {
  if (!session.user) return { commands: [], packs: [], triggers: {} as Record<string, string[]>, notHere: [] }
  const [commands, packs] = await Promise.all([admin.myCommands(), admin.myPacks()])
  return {
    commands: [...commands.commands.map((c) => c.name), ...commands.linked.map((l) => l.alias)].sort(),
    packs: packs.packs.filter((p) => !p.system).map((p) => p.name),
    /** Each of your packs' trigger keys (ADR-0032): publishing a pack sets them going here. */
    triggers: Object.fromEntries(packs.packs.map((p) => [p.name, (p.triggers ?? []).map((t) => t.key)])) as Record<string, string[]>,
    /** Your own commands chat here can't run yet: published neither here nor everywhere. */
    notHere: commands.commands
      .filter((c) => !(c.publications ?? []).some((p) => p.channel === props.login || p.channel === 'global'))
      .sort((a, b) => a.name.localeCompare(b.name)),
  }
}, { source: () => props.login })
const pub = reactive({ open: false, what: 'command', command: '', as: '', pack: '', owner: '' })
function openPublish(command = '') {
  Object.assign(pub, { open: true, what: 'command', command, as: '', pack: '', owner: '' })
  void mine.reload()
}
const WHAT = [
  { value: 'command', label: 'A command' },
  { value: 'pack', label: 'My pack' },
  { value: 'shared', label: 'A shared pack' },
]
const ready = computed(() => (pub.what === 'command' ? !!pub.command : pub.what === 'pack' ? !!pub.pack : !!pub.pack.trim() && !!pub.owner.trim()))
async function publish() {
  if (!ready.value) return
  let needs: Record<string, string[]> | undefined
  let triggers: string[] | undefined
  const run = async () => {
    const answer =
      pub.what === 'command'
        ? await admin.publish(props.login, pub.command, pub.as.trim() || undefined)
        : await admin.publishPack(props.login, pub.pack.trim(), pub.what === 'shared' ? loginOf(pub.owner) : undefined)
    needs = (answer as { needs_grants?: Record<string, string[]> }).needs_grants
    triggers = (answer as { triggers?: string[] }).triggers
  }
  const label = pub.what === 'command' ? `${props.sign}${pub.as.trim() || pub.command}` : pub.pack.trim()
  if (!(await act('pub', run, `Published ${label} in #${props.login}`))) return
  pub.open = false
  if (triggers?.length) {
    toast.show(`Its triggers (${triggers.join(', ')}) now run here on their own. The ${label} module on the Modules tab turns them off.`, { duration: 8000 })
  }
  const missing = Object.entries(needs ?? {}).filter(([, vars]) => vars.length)
  if (missing.length) {
    toast.show(`It writes channel variables it isn't granted yet: ${missing.map(([c, v]) => `${c} (${v.join(', ')})`).join('; ')}. Grant them below.`, { duration: 8000 })
  }
}
const unpublishing = ref<{ kind: 'command' | 'pack'; name: string; owner?: string } | null>(null)
async function unpublish() {
  const u = unpublishing.value
  if (!u) return
  const run = () => (u.kind === 'command' ? admin.unpublish(props.login, u.name) : admin.unpublishPack(props.login, u.name, u.owner))
  if (await act('unpub', run, `Took ${u.kind === 'command' ? props.sign : ''}${u.name} down from #${props.login}`)) unpublishing.value = null
}

async function setGrant(g: Grant, variable: string, on: boolean) {
  const run = () => (on ? admin.grant(props.login, g.name, variable) : admin.ungrant(props.login, g.name, variable))
  await act(`g:${g.name}:${variable}`, run, `${props.sign}${g.name} ${on ? 'may' : 'may no longer'} write channel.${variable}`)
}
const errText = errorText
const ACTIONS: TableColumn = { key: 'actions', label: '', align: 'right', nowrap: true }
const COLUMNS: TableColumn[] = [
  { key: 'name', label: 'Command' },
  { key: 'module', label: 'Module' },
  { key: 'owner', label: 'By', muted: true },
  { key: 'version', label: 'Version', mono: true, muted: true },
  { key: 'status', label: 'State', nowrap: true },
  ACTIONS,
]
const PACK_COLUMNS: TableColumn[] = [
  { key: 'name', label: 'Pack', mono: true },
  { key: 'commands', label: 'Commands', muted: true, class: 'small' },
  { key: 'scope', label: 'Where' },
  ACTIONS,
]
const GRANT_COLUMNS: TableColumn[] = [
  { key: 'name', label: 'Command' },
  { key: 'owner', label: 'By', muted: true },
  { key: 'vars', label: 'May write' },
]
const NOT_HERE_COLUMNS: TableColumn[] = [
  { key: 'name', label: 'Command', nowrap: true },
  { key: 'body', label: 'Body', class: 'wrap body' },
  { key: 'actions', label: '', class: 'end' },
]
</script>

<template>
  <section class="mtab">
    <div class="head">
      <h2 class="vx-eyebrow sub">Published here</h2>
      <div class="actions">
        <RouterLink v-if="hasUser" :to="{ path: '/manage/me', query: { tab: 'commands', new: login } }" class="vx-btn is-sm">New command</RouterLink>
        <VxButton v-if="mayPublish && hasUser" size="sm" variant="primary" @click="openPublish()">Publish</VxButton>
      </div>
    </div>
    <p v-if="mayPublish && !hasUser" class="vx-muted small intro">Publishing names the publisher: sign in with Twitch to publish here.</p>
    <VxEmptyState v-if="!published.length" title="Nothing published here" text="Custom commands and packs published to this channel show up here." />
    <template v-else>
      <p class="vx-muted intro">
        Custom commands chat can run here. One published on its own turns on and off here, the same as
        <ChatLine :lines="`${sign}cc disable <name>`" :sign="sign" /> in chat<template v-if="!mayPublish">, for
        {{ publishRole }} and up</template>; a pack's commands turn on and off with the pack, on the Modules tab.
      </p>
      <VxTable wrap class="vx-panel" :columns="COLUMNS" :rows="published" :row-key="(p) => `${p.module}/${p.name}`" label="Published commands">
        <template #cell-name="{ row: p }">
          <ChatLine :lines="`${sign}${p.name}`" :sign="sign" />
          <div v-if="p.summary" class="vx-muted small">{{ p.summary }}</div>
        </template>
        <template #cell-module="{ row: p }">
          <RouterLink :to="{ query: { ...route.query, tab: 'modules' } }" class="vx-mono">{{ p.module }}</RouterLink>
        </template>
        <template #cell-owner="{ row: p }">@{{ p.owner }}</template>
        <template #cell-version="{ row: p }">
          v{{ p.version }}
          <div v-if="p.changedSince !== null" class="small">changed since v{{ p.changedSince }}</div>
        </template>
        <template #cell-status="{ row: p }">
          <VxSwitch
            v-if="toggleable(p)"
            :model-value="p.status === 'active'"
            :disabled="!mayPublish || busy.has(`p:${p.name}`)"
            :label="p.status === 'active' ? 'on' : 'off'"
            @update:model-value="(on: boolean) => toggle(p, on)"
          />
          <template v-else>
            <VxChip :tone="p.status === 'active' ? 'ok' : 'default'">{{ p.status }}</VxChip>
            <div v-if="p.status === 'orphaned'" class="vx-muted small">its owner deleted it</div>
          </template>
        </template>
        <template #cell-actions="{ row: p }">
          <VxButton
            v-if="mayPublish && hasUser && p.module === CUSTOM_MODULE"
            size="sm"
            variant="ghost"
            @click="unpublishing = { kind: 'command', name: p.name }"
          >Unpublish</VxButton>
        </template>
      </VxTable>
    </template>

    <template v-if="mayPublish && mine.data.value?.notHere.length">
      <h2 class="vx-eyebrow sub">Yours, not published here</h2>
      <p class="vx-muted intro">
        Your commands chat here can't run yet. Publishing one is
        <ChatLine :lines="`${sign}cc publish <name>`" :sign="sign" /> typed here.
      </p>
      <VxTable wrap headless class="vx-panel" :columns="NOT_HERE_COLUMNS" :rows="mine.data.value.notHere" row-key="id" label="Your commands not published here">
        <template #cell-name="{ row: c }">
          <span class="vx-mono">{{ c.name }}</span>
          <div v-if="c.summary" class="vx-muted small">{{ c.summary }}</div>
        </template>
        <template #cell-body="{ row: c }"><ChatLine :lines="c.body" :sign="sign" context="body" /></template>
        <template #cell-actions="{ row: c }"><VxButton size="sm" variant="ghost" @click="openPublish(c.name)">Publish</VxButton></template>
      </VxTable>
    </template>

    <template v-if="packs.length">
      <h2 class="vx-eyebrow sub">Packs</h2>
      <VxTable wrap class="vx-panel" :columns="PACK_COLUMNS" :rows="packs" :row-key="(p) => `${p.scope}/${p.name}`" label="Packs">
        <template #cell-name="{ row: p }">{{ p.name }}<div v-if="p.summary" class="vx-muted small">{{ p.summary }}</div></template>
        <template #cell-commands="{ row: p }">{{ p.commands.map((c) => c.name).join(', ') }}</template>
        <template #cell-scope="{ row: p }">
          <VxChip :tone="p.scope === 'global' ? 'default' : 'accent'">{{ p.scope === 'global' ? 'everywhere' : 'here' }}</VxChip>
        </template>
        <template #cell-actions="{ row: p }">
          <VxButton
            v-if="mayPublish && hasUser && channelPacks.includes(p)"
            size="sm"
            variant="ghost"
            @click="unpublishing = { kind: 'pack', name: p.name, owner: packOwner(p) }"
          >Unpublish</VxButton>
        </template>
      </VxTable>
    </template>

    <h2 class="vx-eyebrow sub">Variable grants</h2>
    <p class="vx-muted intro">
      A published command writes this channel's variables only where the channel lets it, as
      <ChatLine :lines="`${sign}cc grant <name> <variable>`" :sign="sign" /> does in chat<template v-if="!mayGrant">
      (for {{ grantRole }} and up)</template>.
    </p>
    <VxCallout v-if="grants.error.value" tone="error" title="Couldn't load the grants">{{ errorText(grants.error.value) }}</VxCallout>
    <VxEmptyState v-else-if="grants.data.value && !grants.data.value.length" title="Nothing to grant" text="No command published here writes channel variables." />
    <VxTable wrap v-else-if="grants.data.value" class="vx-panel" :columns="GRANT_COLUMNS" :rows="grants.data.value" row-key="id" label="Variable grants">
      <template #cell-name="{ row: g }"><ChatLine :lines="`${sign}${g.name}`" :sign="sign" /></template>
      <template #cell-owner="{ row: g }">@{{ g.owner }}</template>
      <template #cell-vars="{ row: g }">
        <span class="vars">
          <VxCheckbox
            v-for="v in [...new Set([...g.writes, ...g.granted])]"
            :key="v"
            :model-value="g.granted.includes(v)"
            :disabled="!mayGrant || busy.has(`g:${g.name}:${v}`)"
            :label="`channel.${v}`"
            @update:model-value="(on: boolean) => setGrant(g, v, on)"
          />
        </span>
      </template>
    </VxTable>

    <VxDialog v-model:open="pub.open" :title="`Publish in #${login}`" width="520px">
      <form id="pub-form" class="dialog-form" @submit.prevent="publish">
        <VxSegmented v-model="pub.what" :options="WHAT" label="What to publish" />
        <VxCallout v-if="mine.error.value" tone="error" title="Couldn't load your commands">{{ errText(mine.error.value) }}</VxCallout>
        <template v-if="pub.what === 'command'">
          <VxField label="Your command" :help="mine.data.value && !mine.data.value.commands.length ? 'You have no commands yet: make one on your Me page.' : undefined">
            <template #default="{ id }">
              <VxSelect :id="id" v-model="pub.command" :options="(mine.data.value?.commands ?? []).map((c) => ({ value: c, label: c }))" width="100%" />
            </template>
          </VxField>
          <VxField label="Publish as" help="Optional: another name for it here.">
            <template #default="{ id }"><VxInput :id="id" v-model="pub.as" mono :placeholder="pub.command" /></template>
          </VxField>
        </template>
        <VxField
          v-else-if="pub.what === 'pack'"
          label="Your pack"
          :help="mine.data.value?.triggers[pub.pack]?.length ? `Its triggers (${mine.data.value.triggers[pub.pack]!.join(', ')}) will run here on their own.` : undefined"
        >
          <template #default="{ id }">
            <VxSelect :id="id" v-model="pub.pack" :options="(mine.data.value?.packs ?? []).map((c) => ({ value: c, label: c }))" width="100%" />
          </template>
        </VxField>
        <template v-else>
          <VxField label="Owner" help="Every command in their pack must be shared.">
            <template #default="{ id }"><VxInput :id="id" v-model="pub.owner" mono placeholder="login" /></template>
          </VxField>
          <VxField label="Pack">
            <template #default="{ id }"><VxInput :id="id" v-model="pub.pack" mono /></template>
          </VxField>
        </template>
      </form>
      <template #actions="{ close }">
        <VxButton @click="close">Cancel</VxButton>
        <VxButton type="submit" form="pub-form" variant="primary" :loading="busy.has('pub')" :disabled="!ready">Publish</VxButton>
      </template>
    </VxDialog>

    <VxConfirm
      :open="unpublishing !== null"
      :title="unpublishing ? `Unpublish ${unpublishing.kind === 'command' ? sign : ''}${unpublishing.name}?` : ''"
      @update:open="(v: boolean) => { if (!v) unpublishing = null }"
      confirm-label="Unpublish"
      tone="danger"
      :loading="busy.has('unpub')"
      @confirm="unpublish"
    >
      Chat here can't run {{ unpublishing?.kind === 'pack' ? 'its commands' : 'it' }} any more. The command itself stays
      with its owner, who can publish it again.
    </VxConfirm>
  </section>
</template>

<style scoped>
.head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px; }
.head .sub { margin: 0; }
.head .actions { display: flex; flex-wrap: wrap; gap: 6px; }
.body { max-width: 26rem; }
.vars { display: flex; flex-wrap: wrap; gap: 4px 14px; }
</style>
