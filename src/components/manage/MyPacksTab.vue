<script setup lang="ts">
// Your packs, as `pack` manages them in chat: a named set of your commands that is published and turned on and off
// as one module. An internal member runs only when another command in the pack calls it. A pack's own triggers
// (ADR-0032) run wherever it is published. Each member's rank (ADR-0033) is the least a channel can require of it.
import { VxButton, VxCheckbox, VxChip, VxConfirm, VxEmptyState, VxField, VxInput, VxLoadState, VxSelect, VxSwitch, VxTable, type TableColumn } from '@vex/ui'
import { computed, reactive, ref } from 'vue'
import { useResource } from '@vex/ui/utils'
import { errorText } from '@vex/platform-web'
import { admin, type MyPack } from '@/lib/admin'
import { useAct } from '@/lib/useAct'
import PackTriggers from './PackTriggers.vue'

const { data, error, reload } = useResource(async () => {
  const [packs, commands] = await Promise.all([admin.myPacks(), admin.myCommands()])
  return { packs: packs.packs.filter((p) => !p.system), commands: commands.commands.map((c) => c.name).sort() }
})
const { busy, act } = useAct(reload)

const NAME = /^[a-z0-9_]{1,32}$/
const draft = reactive({ name: '', summary: '' })
const name = computed(() => draft.name.trim().toLowerCase())
async function create() {
  if (!NAME.test(name.value)) return
  if (await act('new', () => admin.createPack(name.value, draft.summary.trim()), `Pack ${name.value} created`)) Object.assign(draft, { name: '', summary: '' })
}

const adding = reactive<Record<string, { command: string; internal: boolean; role: string }>>({})
const addFor = (p: MyPack) => (adding[p.name] ??= { command: '', internal: false, role: 'everyone' })
// The ranks a pack can set: the built-in ones, since a channel's own roles don't exist in the others.
const RANKS = ['everyone', 'subscriber', 'vip', 'moderator', 'lead_moderator', 'broadcaster'].map((r) => ({
  value: r,
  label: r === 'everyone' ? 'Everyone' : `${r} and up`,
}))
const ranked = (on: string, name: string, pack: string) =>
  on === 'everyone' ? `${name} is open to everyone` : `${name} needs ${on} wherever ${pack} is published`
const choices = (p: MyPack) =>
  (data.value?.commands ?? []).filter((c) => !p.commands.some((m) => m.name === c)).map((c) => ({ value: c, label: c }))
async function add(p: MyPack) {
  const a = addFor(p)
  if (!a.command) return
  if (await act(`add:${p.name}`, () => admin.addToPack(p.name, a.command, { internal: a.internal, role: a.role }), `${a.command} added to ${p.name}`)) a.command = ''
}
const where = (p: MyPack) => p.published.map((c) => (c === 'global' ? 'everywhere' : `#${c}`))
const deleting = ref<MyPack | null>(null)
const PACK_COMMAND_COLUMNS: TableColumn[] = [
  { key: 'command', label: 'Command', mono: true },
  { key: 'shared', label: 'Shared' },
  { key: 'internal', label: 'Internal' },
  { key: 'role', label: 'Role' },
  { key: 'actions', label: '', class: 'end' },
]
</script>

<template>
  <section class="mtab">
    <VxLoadState :error="error" :stale="!!data" :loading="!data" error-title="Couldn't load your packs" :error-text="errorText" :rows="3" @retry="reload">
      <template v-if="data">
        <p class="vx-muted intro">
          A pack is a set of your commands published as one module, which a channel turns on and off as a whole. Each
          command's rank is the least a channel can require of it: a channel can raise it, not lower it. Its triggers run
          on their own wherever it is published. Publish one from a channel's Published tab. Sharing it lets
          others publish it too, once every command in it is shared.
        </p>
        <VxEmptyState v-if="!data.packs.length" title="No packs yet" text="Create one below." />
        <div v-for="p in data.packs" :key="p.id" class="pack vx-panel">
          <div class="pack-head">
            <span class="vx-mono name">{{ p.name }}</span>
            <span v-if="p.summary" class="vx-muted small">{{ p.summary }}</span>
            <span class="grow"></span>
            <VxSwitch
              :model-value="p.shareable"
              :disabled="busy.has(`sh:${p.name}`)"
              label="Shared"
              @update:model-value="(on: boolean) => act(`sh:${p.name}`, () => admin.sharePack(p.name, on), `${p.name} ${on ? 'shared' : 'no longer shared'}`)"
            />
            <VxButton size="sm" variant="ghost" @click="deleting = p">Delete</VxButton>
          </div>
          <p class="small published">
            <span class="vx-muted">Published:</span> {{ where(p).join(', ') || 'nowhere yet' }}
          </p>
          <VxTable wrap headless v-if="p.commands.length" :columns="PACK_COMMAND_COLUMNS" :rows="p.commands" row-key="name">
            <template #cell-command="{ row: c }">{{ c.name }}</template>
            <template #cell-shared="{ row: c }"><VxChip v-if="!c.shareable" tone="warn">not shared</VxChip></template>
            <template #cell-internal="{ row: c }">
              <VxSwitch
                :model-value="c.internal"
                :disabled="busy.has(`in:${p.name}:${c.name}`)"
                label="Internal"
                @update:model-value="(on: boolean) => act(`in:${p.name}:${c.name}`, () => admin.addToPack(p.name, c.name, { internal: on }), on ? `${c.name} is internal: only ${p.name}'s commands can call it` : `${c.name} is public again`)"
              />
            </template>
            <template #cell-role="{ row: c }">
              <VxSelect
                v-if="c.role"
                :model-value="c.role"
                :options="RANKS"
                size="sm"
                width="170px"
                :aria-label="`Who may run ${c.name}`"
                :disabled="busy.has(`rk:${p.name}:${c.name}`)"
                @update:model-value="(r?: string) => r && act(`rk:${p.name}:${c.name}`, () => admin.addToPack(p.name, c.name, { role: r }), ranked(r, c.name, p.name))"
              />
            </template>
            <template #cell-actions="{ row: c }">
              <VxButton
                size="sm"
                variant="ghost"
                :loading="busy.has(`rm:${p.name}:${c.name}`)"
                @click="act(`rm:${p.name}:${c.name}`, () => admin.removeFromPack(p.name, c.name), `${c.name} taken out of ${p.name}`)"
              >Remove</VxButton>
            </template>
          </VxTable>
          <p v-else class="vx-muted small">No commands in it yet.</p>
          <form class="add-cmd" @submit.prevent="add(p)">
            <VxSelect v-model="addFor(p).command" :options="choices(p)" placeholder="Add one of your commands" :disabled="!choices(p).length" />
            <VxSelect v-model="addFor(p).role" :options="RANKS" width="170px" aria-label="Who may run it" />
            <VxCheckbox v-model="addFor(p).internal" label="Internal" />
            <VxButton type="submit" size="sm" :loading="busy.has(`add:${p.name}`)" :disabled="!addFor(p).command">Add</VxButton>
          </form>
          <PackTriggers v-if="p.triggers" :pack="p" :reload="reload" />
        </div>

        <form class="add vx-form-row vx-panel" @submit.prevent="create">
          <VxField label="New pack" help="Lowercase letters, digits and _.">
            <template #default="{ id }"><VxInput :id="id" v-model="draft.name" mono :invalid="!!draft.name && !NAME.test(name)" /></template>
          </VxField>
          <VxField label="Summary" class="grow">
            <template #default="{ id }"><VxInput :id="id" v-model="draft.summary" /></template>
          </VxField>
          <VxButton type="submit" variant="primary" :loading="busy.has('new')" :disabled="!NAME.test(name)">Create</VxButton>
        </form>
      </template>
    </VxLoadState>

    <VxConfirm
      :open="deleting !== null"
      :title="`Delete the ${deleting?.name} pack?`"
      @update:open="(v: boolean) => { if (!v) deleting = null }"
      confirm-label="Delete"
      tone="danger"
      :loading="busy.has('del')"
      @confirm="act('del', () => admin.deletePack(deleting!.name), `Pack ${deleting!.name} deleted`).then(() => (deleting = null))"
    >
      It's taken down everywhere it's published<template v-if="deleting?.published.length"> ({{ deleting && where(deleting).join(', ') }})</template>.
      Its commands stay yours.
    </VxConfirm>
  </section>
</template>

<style scoped>
.pack { padding: 12px 14px; margin-bottom: 10px; }
.pack-head { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; }
.pack-head .name { font-size: 15px; }
.pack-head .grow { flex: 1; }
.published { margin: 6px 0 8px; }
.add-cmd { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; margin-top: 10px; }
</style>
