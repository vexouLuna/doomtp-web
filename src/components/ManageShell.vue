<script setup lang="ts">
// Frame for every Manage page: the site's own shell, the Manage bar, a dimmer sky, and the page's heading.
import { VxPageHead } from '@vex/ui'
import { session } from '@/lib/session'
import DtpShell from './DtpShell.vue'
import ManageBar from './ManageBar.vue'

defineProps<{ title: string; eyebrow?: string }>()
</script>

<template>
  <DtpShell sky="dim">
    <ManageBar v-if="session.authenticated" />
    <VxPageHead :title="title" :eyebrow="eyebrow ?? 'Manage'">
      <template v-if="$slots.actions" #actions><slot name="actions"></slot></template>
    </VxPageHead>
    <slot></slot>
  </DtpShell>
</template>
