// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'

const calls: { ns: string; resolve: (v: unknown) => void }[] = []
vi.mock('@/lib/admin', () => ({
  admin: {
    variables: async () => ({ variables: [] }),
    storage: async () => ({ used_bytes: 0, quota_bytes: 1, value_cap_bytes: 1, list_items: 1, names_per_space: 1, namespaces: {} }),
    variablesIn: (_login: string, q: { ns: string }) => new Promise((resolve) => calls.push({ ns: q.ns, resolve })),
  },
}))

import VariablesTab from '../src/components/manage/VariablesTab.vue'

const page = (name: string) => ({ variables: [{ name, value: 'x', updated_at: null, updated_by: null, updated_by_login: null }], has_more: false })

describe('VariablesTab', () => {
  it('keeps the newest view when an older response arrives last', async () => {
    const w = mount(VariablesTab, {
      props: { login: 'chan', writeRole: 'mod', adminRole: 'mod', roles: [] },
      global: { stubs: { RouterLink: true } },
    })
    await flushPromises()
    const select = w.findComponent({ name: 'VxSelect' })
    select.vm.$emit('update:modelValue', 'channel.chatter')
    await flushPromises()
    select.vm.$emit('update:modelValue', 'publisher.channel')
    await flushPromises()
    expect(calls.map((c) => c.ns)).toEqual(['channel.chatter', 'publisher.channel'])
    calls[1].resolve(page('new_ns_var'))
    await flushPromises()
    calls[0].resolve(page('old_ns_var'))
    await flushPromises()
    expect(w.text()).toContain('new_ns_var')
    expect(w.text()).not.toContain('old_ns_var')
  })
})
