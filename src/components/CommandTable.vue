<script setup lang="ts">
// The searchable command table shared by the command reference and the channel pages. One line per command;
// clicking it opens the details underneath (arguments, cooldowns, examples, a custom command's body).
// On a phone the columns stack inside each row instead of being dropped. The Manage pages add their controls to each
// line (the `actions` slot), a note under the summary (`note`) and more details (`detail`).
import { VxButton, VxChip, VxInput } from '@vex/ui'
import { computed, ref, useSlots } from 'vue'
import { type CommandRow, filterRows, nameLine } from '@/lib/commands'
import ChatLine from './ChatLine.vue'

const props = withDefaults(
  defineProps<{ rows: CommandRow[]; sign: string; noun?: string; /** The header over the `actions` slot. */ actionsLabel?: string }>(),
  { noun: 'commands', actionsLabel: '' },
)

const slots = useSlots()
const query = ref('')
const shown = computed(() => filterRows(props.rows, query.value))
const count = computed(() => {
  const n = shown.value.length
  return `${n} ${n === 1 ? props.noun.replace(/s$/, '') : props.noun}`
})
/** The commands by module, in the order modules first appear. Each module's block can be folded away. */
const groups = computed(() => {
  const by = new Map<string, CommandRow[]>()
  for (const row of shown.value) by.set(row.module, [...(by.get(row.module) ?? []), row])
  return [...by].map(([module, items]) => ({ module, items }))
})
const folded = ref(new Set<string>())
/** While searching, every module with a match stays open, so nothing found is hidden. */
const isFolded = (module: string) => !query.value && folded.value.has(module)
function fold(module: string) {
  const next = new Set(folded.value)
  if (!next.delete(module)) next.add(module)
  folded.value = next
}
const allFolded = computed(() => groups.value.length > 0 && groups.value.every((g) => folded.value.has(g.module)))
const foldAll = () => (folded.value = allFolded.value ? new Set() : new Set(groups.value.map((g) => g.module)))
const open = ref(new Set<string>())
function toggle(key: string) {
  const next = new Set(open.value)
  if (!next.delete(key)) next.add(key)
  open.value = next
}
</script>

<template>
  <div class="cmdblock">
    <div class="filters">
      <VxInput
        v-model="query"
        type="search"
        clearable
        class="search"
        placeholder="Search by name, module, author or text…"
        @keydown.esc="query = ''"
      />
      <span class="vx-muted vx-mono count" aria-live="polite">{{ count }}</span>
      <VxButton size="sm" :disabled="!!query" @click="foldAll">{{ allFolded ? 'Expand all' : 'Collapse all' }}</VxButton>
    </div>

    <div class="table vx-panel" role="table" :aria-label="`${noun}, ${count}`">
      <div class="line head" role="row">
        <div class="row vx-eyebrow">
          <span role="columnheader">Command</span><span role="columnheader">Module</span>
          <span role="columnheader">Needs</span><span role="columnheader">What it does</span>
        </div>
        <span v-if="slots.actions" class="actions vx-eyebrow" role="columnheader">{{ actionsLabel }}</span>
      </div>
      <template v-for="g in groups" :key="g.module">
      <button
        type="button"
        class="group"
        :aria-expanded="!isFolded(g.module)"
        :aria-label="`${g.module} module, ${g.items.length} ${g.items.length === 1 ? 'command' : 'commands'}`"
        @click="fold(g.module)"
      >
        <span class="chev" aria-hidden="true">{{ isFolded(g.module) ? '▸' : '▾' }}</span>
        <span class="vx-mono gname">{{ g.module }}</span>
        <span class="vx-muted vx-mono gcount">{{ g.items.length }}</span>
      </button>
      <template v-if="!isFolded(g.module)">
      <div v-for="row in g.items" :key="row.key" class="item" :class="{ 'is-open': open.has(row.key) }" role="rowgroup">
        <div class="line">
          <button
            type="button"
            class="row"
            role="row"
            :aria-expanded="open.has(row.key)"
            @click="toggle(row.key)"
          >
            <ChatLine class="name" :class="{ internal: row.internal }" role="cell" :lines="nameLine(row, sign)" :sign="sign" signature />
            <span class="vx-muted module" role="cell">{{ row.module }}</span>
            <span role="cell">
              <VxChip v-if="row.internal" tone="warn" class="tag-internal" title="Only this pack's own commands call it; chat can't type it">⚙ internal</VxChip>
              <VxChip v-else :tone="row.role === 'everyone' ? 'ok' : 'accent'">{{ row.role }}</VxChip>
            </span>
            <span class="summary" role="cell">{{ row.summary }}<span v-if="slots.note" class="note"><slot name="note" :row="row"></slot></span></span>
          </button>
          <div v-if="slots.actions" class="actions"><slot name="actions" :row="row"></slot></div>
        </div>

        <div v-if="open.has(row.key)" class="detail">
          <p v-if="row.description">{{ row.description }}</p>
          <p v-if="row.internal" class="vx-muted">
            Internal to the <strong>{{ row.module }}</strong> pack: only its own commands call it, so it can't be typed in chat.
          </p>
          <p v-if="row.kind === 'form'" class="vx-muted">
            Part of the language rather than a command: it has no role, cooldown or switch of its own, and only the
            branch it chooses runs.
          </p>
          <template v-if="row.kind === 'derived' || row.kind === 'published'">
            <p class="vx-muted">
              A custom command by <strong>@{{ row.owner }}</strong> (v{{ row.version }})<template v-if="row.kind === 'derived'">,
              published for every channel</template>. Its author can change it at any time.
            </p>
            <ChatLine :lines="row.body" :sign="sign" context="body" block />
          </template>
          <div class="chips">
            <VxChip v-if="!row.internal" k="needs">{{ row.role }}</VxChip>
            <VxChip v-if="row.aliases.length" k="also">{{ row.aliases.join(', ') }}</VxChip>
            <VxChip v-if="row.alwaysOn" tone="ok">always on</VxChip>
            <VxChip v-if="row.fixedPolicy">no cooldown, no role</VxChip>
            <VxChip v-for="c in row.cooldowns" :key="c.role" :k="c.role">{{ c.shared }}s shared / {{ c.personal }}s personal</VxChip>
          </div>
          <div v-if="row.params.length" class="params vx-scroll">
            <table class="vx-table">
              <thead><tr><th>Argument</th><th>Type</th><th>Required</th><th>Meaning</th></tr></thead>
              <tbody>
                <tr v-for="p in row.params" :key="p.position">
                  <td><code>{{ p.name }}</code> <span class="vx-muted">({{ p.position }})</span></td>
                  <td>{{ p.type }}<template v-if="p.choices?.length">: {{ p.choices.join(', ') }}</template></td>
                  <td>{{ p.required ? 'yes' : 'no' }}</td>
                  <td>{{ p.description }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-if="Object.keys(row.returns).length" class="params vx-scroll">
            <table class="vx-table">
              <thead><tr><th>Returns, when used as</th><th>What <code>{_}</code> holds</th></tr></thead>
              <tbody>
                <tr v-for="(holds, form) in row.returns" :key="form">
                  <td>{{ form || 'plain' }}</td>
                  <td><code>{{ holds }}</code></td>
                </tr>
              </tbody>
            </table>
            <p v-if="Object.values(row.returns).some((t) => t.includes('?:'))" class="vx-muted small">
              A field written <code>key?</code> isn't returned by every way the command can end.
            </p>
          </div>
          <slot name="detail" :row="row"></slot>
          <div v-if="row.examples.length" class="examples">
            <div v-for="(e, i) in row.examples" :key="i">
              <ChatLine :lines="e.invocation" :sign="sign" block />
              <p v-if="e.output" class="out vx-mono">→ {{ e.output }}</p>
            </div>
          </div>
        </div>
      </div>
      </template>
      </template>
      <p v-if="!shown.length" class="vx-muted empty">Nothing matches that.</p>
    </div>
  </div>
</template>

<style scoped>
.filters { display: flex; gap: 12px; align-items: center; margin-bottom: 12px; }
.filters .search { flex: 1; min-width: 0; max-width: none; margin: 0; }
.count { font-size: 12px; white-space: nowrap; }
.table { overflow: hidden; }
.row {
  display: grid;
  grid-template-columns: minmax(12rem, 32%) 7rem 8rem minmax(0, 1fr);
  gap: 12px;
  align-items: baseline;
  width: 100%;
  padding: 9px 14px;
  border: 0;
  border-bottom: 1px solid var(--vx-line);
  background: none;
  color: inherit;
  font: inherit;
  font-size: 14px;
  text-align: left;
}
.line { display: flex; align-items: stretch; border-bottom: 1px solid var(--vx-line); }
.line > .row { flex: 1; min-width: 0; border-bottom: 0; }
/* One width for every line, so the columns to its left line up. */
.actions { flex: none; width: var(--cmd-actions, 9rem); display: flex; align-items: center; justify-content: flex-end; gap: 8px; padding: 4px 14px 4px 0; }
button.row { cursor: pointer; }
.line:hover, .is-open > .line { background: rgb(170 170 170 / 0.07); }
.head .row, .head .actions { font-size: 11px; }
.head:hover { background: none; }
.note { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }
.note:empty { display: none; }
/* Beats the pages' inline-code pill (.doc code): the name is the row, not a snippet in text. */
.name { font-family: var(--vx-font-mono); font-size: 13px; overflow-wrap: anywhere; padding: 0; background: none; border: 0; }
.module { font-size: 13px; }
.name.internal { color: var(--vx-muted); font-style: italic; }
/* Two tags that must not blur together: a rank is a solid pill (green for everyone, accent for the rest); an
   internal command is amber, dashed and gear-marked, because nobody can type it. */
.tag-internal { border-style: dashed; background: none; }
.group {
  display: flex; align-items: center; gap: 8px; width: 100%; padding: 6px 14px; cursor: pointer;
  background: rgb(255 255 255 / 0.035); border: 0; border-bottom: 1px solid var(--vx-line); color: var(--vx-ink); font: inherit; text-align: left;
}
.group:hover { background: rgb(255 255 255 / 0.07); }
.chev { width: 1em; color: var(--vx-accent); }
.gname { font-size: 12px; text-transform: uppercase; letter-spacing: 0.1em; }
.gcount { font-size: 11px; }
.examples { display: flex; flex-direction: column; gap: 6px; }
.examples .out { margin: 2px 0 0 14px; font-size: 13px; color: var(--vx-muted); }
.summary { color: var(--vx-ink); }
.detail { padding: 12px 14px 16px; border-bottom: 1px solid var(--vx-line); display: flex; flex-direction: column; gap: 10px; }
.detail p { margin: 0; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; }
.params { overflow-x: auto; }
.params .vx-table { width: 100%; font-size: 13px; }
.empty { padding: 12px 14px; margin: 0; }
.small { font-size: 12px; margin-top: 4px; }

/* Phones: every column stays, stacked inside the row: the command and its role, then module and summary. */
@container vx-site (max-width: 700px) {
  .row { grid-template-columns: minmax(0, 1fr) auto; gap: 2px 10px; }
  .head { display: none; }
  .actions { width: auto; flex-direction: column; align-items: flex-end; justify-content: center; gap: 4px; padding-left: 4px; }
  .name { grid-column: 1; grid-row: 1; }
  .row > :nth-child(3) { grid-column: 2; grid-row: 1; }
  .module { grid-column: 1 / -1; grid-row: 2; font-size: 12px; }
  .summary { grid-column: 1 / -1; grid-row: 3; font-size: 13px; }
}
</style>
