<script setup lang="ts">
// What reaches every channel, for bot admins: the admins themselves (`admin add|remove`, bot owners only), the
// bot-wide module toggles and command rules every channel inherits, the bot-wide word filter, who is ignored
// everywhere, and the commands and packs published everywhere.
import { VxButton, VxChip, VxConfirm, VxField, VxInput, VxLoadState, VxSegmented, VxTable, type TableColumn } from '@vex/ui'
import { computed, reactive, ref } from 'vue'
import { useResource } from '@vex/ui/utils'
import { errorText } from '@vex/platform-web'
import FilterTab from '@/components/manage/FilterTab.vue'
import IgnoredTab from '@/components/manage/IgnoredTab.vue'
import RulesTab from '@/components/manage/RulesTab.vue'
import { admin, readIgnored, type AdminUser, type GlobalCommand } from '@/lib/admin'
import { api } from '@/lib/api'
import { referenceRows } from '@/lib/commands'
import type { CommandRow, LogLevel } from '@/lib/modules'
import { useAct } from '@/lib/useAct'
import { defaultSign, loadSite } from '@/lib/site'
import { atName, loginOf } from '@/lib/format'

const { data, error, reload } = useResource(async () => {
  const [admins, modules, commands, filters, ignored, roles, published, packs, channels, builtins, site] = await Promise.all([
    admin.admins(),
    admin.globalModules(),
    admin.globalCommands(),
    admin.globalFilters(),
    admin.ignoredEverywhere(),
    api.roles(),
    api.globalCommands(),
    api.packs(),
    admin.channels(),
    api.commands(),
    loadSite(),
  ])
  const globalPacks = packs.packs.filter((p) => p.scope === 'global')
  return {
    admins,
    modules: modules.modules,
    commands: commands.commands.map(asRow).sort((a, b) => a.name.localeCompare(b.name)),
    filters: filters.filters,
    ignored: ignored.ignored.map((e) => readIgnored(e, true)),
    roles: roles.roles.filter((r) => r.rank <= 100).map((r) => r.name),
    published: published.commands,
    packs: globalPacks,
    reference: referenceRows(builtins.commands, published.commands, globalPacks, site?.default_prefix ?? defaultSign()),
    // Ignoring everywhere goes through a channel's route; any joined channel does.
    anchor: channels.channels[0]?.login ?? null,
  }
})
const { busy, act } = useAct(reload)
const sign = computed(defaultSign)

/** The bot-wide rule as the rules table reads a channel's: unset means on, and the command's own role. */
function asRow(c: GlobalCommand): CommandRow {
  return {
    name: c.name,
    module: c.module,
    summary: c.summary,
    enabled: c.enabled ?? true,
    required_role: c.required_role ?? undefined,
    allowed_roles: c.allowed_roles,
    cooldowns: c.cooldowns ?? undefined,
    log_level: (c.log_level as LogLevel | null) ?? undefined,
    toggleable: c.toggleable,
    fixedPolicy: c.fixed_policy,
  }
}

const section = ref('admins')
const SECTIONS = [
  { value: 'admins', label: 'Admins' },
  { value: 'modules', label: 'Modules' },
  { value: 'rules', label: 'Command rules' },
  { value: 'filter', label: 'Word filter' },
  { value: 'ignored', label: 'Ignored' },
  { value: 'published', label: 'Published' },
]

// ── admins ──
const adminLogin = ref('')
const name = (u: AdminUser) => atName(u.login, u.user_id)
async function addAdmin() {
  const who = loginOf(adminLogin.value).toLowerCase()
  if (who && (await act('admin', () => admin.addAdmin(who), `@${who} is a bot admin`))) adminLogin.value = ''
}
const removing = ref<AdminUser | null>(null)
const ADMIN_COLUMNS: TableColumn[] = [
  { key: 'login', label: 'Admin', mono: true },
  { key: 'role', label: 'Role' },
  { key: 'actions', label: '', class: 'end' },
]
const admins = computed(() => [
  ...(data.value?.admins.owners ?? []).map((u) => ({ ...u, owner: true })),
  ...(data.value?.admins.admins ?? []).map((u) => ({ ...u, owner: false })),
])

// ── modules ──
const moduleState = (on: boolean | null) => (on === null ? 'default' : on ? 'on' : 'off')
const MODULE_STATES = [
  { value: 'default', label: 'Each channel' },
  { value: 'on', label: 'On' },
  { value: 'off', label: 'Off' },
]
function setModule(module: string, state: string) {
  if (state === 'default') return act(`m:${module}`, () => admin.resetGlobalModule(module), `${module} left to each channel`)
  return act(`m:${module}`, () => admin.setGlobalModule(module, state === 'on'), `${module} ${state} everywhere`)
}

// ── published everywhere ──
const publishing = reactive({ mode: 'command', command: '', as: '', pack: '', owner: '' })
const PUBLISH_MODES = [
  { value: 'command', label: 'A command' },
  { value: 'pack', label: 'A pack' },
]
async function publish() {
  const p = publishing
  const ok =
    p.mode === 'command'
      ? await act('publish', () => admin.publishGlobal(p.command.trim(), p.as.trim() || undefined), `${p.as.trim() || p.command.trim()} published everywhere`)
      : await act('publish', () => admin.publishGlobalPack(p.pack.trim(), loginOf(p.owner) || undefined), `Pack ${p.pack.trim()} published everywhere`)
  if (ok) Object.assign(publishing, { command: '', as: '', pack: '', owner: '' })
}
const mayPublish = computed(() => (publishing.mode === 'command' ? !!publishing.command.trim() : !!publishing.pack.trim()))
const MODULE_COLUMNS: TableColumn[] = [
  { key: 'module', label: 'Module', mono: true },
  { key: 'kind', label: 'Kind', muted: true },
  { key: 'enabled', label: 'Everywhere' },
]
const PUBLISHED_COLUMNS: TableColumn[] = [
  { key: 'name', label: 'Name' },
  { key: 'owner', label: 'Owner', muted: true },
  { key: 'what', label: 'What', muted: true },
  { key: 'actions', label: '', align: 'right', nowrap: true },
]
type Unpublishing = { kind: 'command' | 'pack'; name: string; owner?: string }
/** Commands and packs published everywhere, as one list. */
const published = computed(() => [
  ...(data.value?.published ?? []).map((c) => ({
    key: `c:${c.published_as}`,
    name: c.published_as,
    owner: c.owner,
    what: c.summary ?? (c.name !== c.published_as ? `as ${c.name}` : 'command'),
    unpublish: { kind: 'command', name: c.published_as } as Unpublishing,
  })),
  ...(data.value?.packs ?? []).map((p) => ({
    key: `p:${p.name}:${p.commands[0]?.owner}`,
    name: p.name,
    owner: p.commands[0]?.owner ?? '',
    what: p.summary ?? `${p.commands.length} commands`,
    unpublish: { kind: 'pack', name: p.name, owner: p.commands[0]?.owner } as Unpublishing,
  })),
])
const unpublishing = ref<Unpublishing | null>(null)
function unpublish() {
  const u = unpublishing.value
  if (!u) return
  const run = u.kind === 'command' ? () => admin.unpublishGlobal(u.name) : () => admin.unpublishGlobalPack(u.name, u.owner)
  act('unpublish', run, `${u.name} taken down everywhere`).then(() => (unpublishing.value = null))
}
</script>

<template>
  <section>
    <h2 class="vx-eyebrow sec">Every channel</h2>
    <p class="vx-muted small">What every channel inherits, as the <code>global</code> forms of the chat commands.</p>
    <VxLoadState :error="error" :stale="!!data" :loading="!data" error-title="Couldn't load the bot-wide settings" :error-text="errorText" :rows="5" @retry="reload">
      <template v-if="data">
        <VxSegmented v-model="section" :options="SECTIONS" label="Bot-wide settings" class="pick" />

        <template v-if="section === 'admins'">
          <p class="vx-muted small">
            Bot admins manage every channel and this page. Owners are set in the bot's configuration; only an owner adds
            or removes admins, as with <code>admin add</code> in chat.
          </p>
          <VxTable wrap headless class="vx-panel" :columns="ADMIN_COLUMNS" :rows="admins" row-key="user_id" label="Bot admins">
            <template #cell-login="{ row }">{{ name(row) }}</template>
            <template #cell-role="{ row }"><VxChip :tone="row.owner ? 'accent' : 'default'">{{ row.owner ? 'owner' : 'admin' }}</VxChip></template>
            <template #cell-actions="{ row }">
              <VxButton v-if="!row.owner && data.admins.you_manage" size="sm" variant="ghost" @click="removing = row">Remove</VxButton>
            </template>
            <template #empty>No bot admins are set: only the admin password manages the bot.</template>
          </VxTable>
          <form v-if="data.admins.you_manage" class="row" @submit.prevent="addAdmin">
            <label class="sr-only" for="admin-login">Twitch login to make an admin</label>
            <VxInput id="admin-login" v-model="adminLogin" placeholder="twitch login" mono grow width="12rem" max-width="20rem" />
            <VxButton type="submit" :loading="busy.has('admin')" :disabled="!adminLogin.trim()">Add admin</VxButton>
          </form>
        </template>

        <template v-else-if="section === 'modules'">
          <p class="vx-muted small">
            "Each channel" leaves a module to the channels (on unless one turns it off). On or off here applies wherever a
            channel hasn't set its own.
          </p>
          <VxTable wrap class="vx-panel" :columns="MODULE_COLUMNS" :rows="data.modules" row-key="module" label="Modules everywhere">
            <template #cell-enabled="{ row }">
              <VxSegmented
                v-if="row.toggleable"
                :model-value="moduleState(row.enabled)"
                :options="MODULE_STATES"
                :label="`${row.module} everywhere`"
                :disabled="busy.has(`m:${row.module}`)"
                @update:model-value="(v?: string) => v && setModule(row.module, v)"
              />
              <span v-else class="vx-muted">always on</span>
            </template>
          </VxTable>
        </template>

        <RulesTab v-else-if="section === 'rules'" :login="null" :sign="sign" :commands="data.commands" :reference="data.reference" :roles="data.roles" :reload="reload" />

        <FilterTab v-else-if="section === 'filter'" :login="null" :filters="data.filters" :reload="reload" />

        <IgnoredTab v-else-if="section === 'ignored'" :login="data.anchor" :sign="sign" :ignored="data.ignored" :reload="reload" everywhere />

        <template v-else>
          <p class="vx-muted small">
            Commands and packs every channel has, as <code>cc publish &lt;name&gt; global</code> does in chat. A channel still
            turns them off for itself.
          </p>
          <VxTable wrap class="vx-panel" :columns="PUBLISHED_COLUMNS" :rows="published" row-key="key" label="Published everywhere">
            <template #cell-name="{ row }"><span class="vx-mono">{{ row.name }}</span> <VxChip v-if="row.unpublish.kind === 'pack'">pack</VxChip></template>
            <template #cell-actions="{ row }"><VxButton size="sm" variant="ghost" @click="unpublishing = row.unpublish">Unpublish</VxButton></template>
            <template #empty>Nothing is published everywhere.</template>
          </VxTable>
          <form class="publish vx-panel" @submit.prevent="publish">
            <VxSegmented v-model="publishing.mode" :options="PUBLISH_MODES" label="What to publish" />
            <template v-if="publishing.mode === 'command'">
              <VxField label="Your command" help="One of your commands, or one you linked.">
                <template #default="{ id }"><VxInput :id="id" v-model="publishing.command" mono /></template>
              </VxField>
              <VxField label="As" help="Optional: the name channels type.">
                <template #default="{ id }"><VxInput :id="id" v-model="publishing.as" mono /></template>
              </VxField>
            </template>
            <template v-else>
              <VxField label="Pack">
                <template #default="{ id }"><VxInput :id="id" v-model="publishing.pack" mono /></template>
              </VxField>
              <VxField label="Owner" help="Empty for your own; someone else's needs every command in it shared.">
                <template #default="{ id }"><VxInput :id="id" v-model="publishing.owner" mono placeholder="twitch login" /></template>
              </VxField>
            </template>
            <div><VxButton type="submit" variant="primary" :loading="busy.has('publish')" :disabled="!mayPublish">Publish everywhere</VxButton></div>
          </form>
        </template>
      </template>
    </VxLoadState>

    <VxConfirm
      :open="removing !== null"
      :title="`Remove ${removing ? name(removing) : ''} as a bot admin?`"
      @update:open="(v: boolean) => { if (!v) removing = null }"
      confirm-label="Remove"
      tone="danger"
      :loading="busy.has('rm-admin')"
      @confirm="act('rm-admin', () => admin.removeAdmin(removing!.user_id), `${name(removing!)} is no longer an admin`).then(() => (removing = null))"
    >
      They keep whatever they have in their own and moderated channels.
    </VxConfirm>

    <VxConfirm
      :open="unpublishing !== null"
      :title="`Unpublish ${unpublishing?.name} everywhere?`"
      @update:open="(v: boolean) => { if (!v) unpublishing = null }"
      confirm-label="Unpublish"
      tone="danger"
      :loading="busy.has('unpublish')"
      @confirm="unpublish"
    >
      Channels lose it at once, unless they published it themselves.
    </VxConfirm>
  </section>
</template>

<style scoped>
.sec { margin: 0 0 8px; }
.small { font-size: 13px; margin: 0 0 8px; }
.pick { margin: 6px 0 14px; max-width: 100%; overflow-x: auto; }
.row { display: flex; flex-wrap: wrap; gap: 8px; margin: 10px 0 6px; }
.end { text-align: right; }
.nowrap { white-space: nowrap; }
.publish { display: grid; gap: 12px; padding: 12px 14px; margin-top: 12px; max-width: 32rem; }
</style>
