<script setup lang="ts">
// Command text coloured by the bot's own lexer (lib/lexer.ts). Inline by default; `block` makes a code block with
// one line per entry. `context="body"` is a custom command's body, which has no command sign.
// `signature` is a usage line (`calc <value…>`), not input: the lexer would underline its `<value…>` as an error,
// so those stay plain. `pretty` (blocks, on unless `:pretty="false"`) lays a long line out over several lines, ifelse branches indented (lib/pretty.ts); a button
// switches back to the one-line text, and "Copy" always copies that one line, which is what chat takes.
import { computed, onMounted, ref } from 'vue'
import { type LexContext, loadLexer, spans, tokenizer } from '@/lib/lexer'
import { applyEdits, prettyEdits } from '@/lib/pretty'

const props = withDefaults(defineProps<{ lines: string | string[]; sign: string; block?: boolean; pretty?: boolean; signature?: boolean; context?: LexContext }>(), {
  block: false,
  pretty: true,
  signature: false,
  context: 'line',
})
const source = computed(() => (Array.isArray(props.lines) ? props.lines : [props.lines]))
const formatted = ref(true)
const reflows = computed(() => props.block && props.pretty && source.value.some((l) => prettyEdits(l).length))
const rendered = computed(() =>
  source.value.map((line) => {
    const s = spans(line, tokenizer.value, { prefix: props.sign, context: props.context })
    if (props.signature) for (const x of s) if (x.cls === 'dtb-error') x.cls = undefined
    return reflows.value && formatted.value ? applyEdits(s, prettyEdits(line)) : s
  }),
)
const copied = ref(false)
async function copy() {
  try {
    await navigator.clipboard.writeText(source.value.join('\n'))
    copied.value = true
    setTimeout(() => (copied.value = false), 1500)
  } catch {
    // no clipboard access: nothing to do
  }
}
onMounted(loadLexer)
</script>

<template>
  <div v-if="reflows" class="codewrap">
    <pre class="vx-code dtb"><template v-for="(line, i) in rendered" :key="i"><template v-if="i">{{ '\n' }}</template><span v-for="(s, j) in line" :key="j" :class="s.cls">{{ s.text }}</span></template></pre>
    <span class="tools">
      <button type="button" :aria-pressed="formatted" title="Spread the command over lines, or show it as typed in chat" @click="formatted = !formatted">{{ formatted ? 'One line' : 'Format' }}</button>
      <button type="button" title="Copy the command as one line" @click="copy">{{ copied ? 'Copied' : 'Copy' }}</button>
    </span>
  </div>
  <pre v-else-if="block" class="vx-code dtb"><template v-for="(line, i) in rendered" :key="i"><template v-if="i">{{ '\n' }}</template><span v-for="(s, j) in line" :key="j" :class="s.cls">{{ s.text }}</span></template></pre>
  <code v-else class="dtb"><span v-for="(s, j) in rendered[0]" :key="j" :class="s.cls">{{ s.text }}</span></code>
</template>

<style scoped>
.codewrap { position: relative; }
.codewrap pre { padding-right: 9rem; }
.tools { position: absolute; top: 6px; right: 6px; display: flex; gap: 4px; }
.tools button {
  height: 22px; padding: 0 8px; font: inherit; font-family: var(--vx-font-mono); font-size: 11px; cursor: pointer;
  color: var(--vx-muted); background: var(--vx-surface-2); border: 1px solid var(--vx-line); border-radius: var(--vx-radius-sm);
}
.tools button:hover { color: var(--vx-ink); }
</style>
