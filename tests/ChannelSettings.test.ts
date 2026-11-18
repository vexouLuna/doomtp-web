// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ChannelSettings from '../src/components/ChannelSettings.vue'
import type { Channel } from '../src/lib/admin'

const channel = (): Channel => ({
  channel_id: '1',
  login: 'chan',
  active: true,
  status: 'joined',
  banned: false,
  tier: 'free',
  capabilities: [],
  prefix: '!',
  timezone: 'UTC',
  log_enabled: true,
  history_backfill: false,
  quiet_errors: false,
  cc_edit_notice: false,
  reply_hold_ms: 0,
  automod: { action: 'off', timeout_s: 60 },
  roles: { channel_var_write: 'mod', grant_min: 'mod', publish_min: 'mod', create_min: 'mod', var_admin: 'mod' },
})

describe('ChannelSettings', () => {
  it('keeps unsaved edits when the channel is reloaded as a new object', async () => {
    const w = mount(ChannelSettings, { props: { channel: channel(), roles: ['everyone', 'mod'] } })
    const prefix = w.findAllComponents({ name: 'VxInput' }).find((i) => i.props('modelValue') === '!')!
    prefix.vm.$emit('update:modelValue', '?')
    await w.vm.$nextTick()
    await w.setProps({ channel: channel() })
    const again = w.findAllComponents({ name: 'VxInput' }).find((i) => i.props('modelValue') === '?')
    expect(again).toBeTruthy()
  })
})

describe('ChannelSettings extra signs', () => {
  it('is hidden for a bot that does not send them', () => {
    const w = mount(ChannelSettings, { props: { channel: channel(), roles: ['mod'] } })
    expect(w.text()).not.toContain('Extra signs')
  })

  it('sends only the edited list, with commands split and All as "all"', async () => {
    const c = { ...channel(), alt_prefixes: [{ prefix: '?', commands: ['ping', 'so'] }] }
    const w = mount(ChannelSettings, { props: { channel: c, roles: ['mod'] } })
    expect(w.text()).toContain('Extra signs')
    const vm = w.vm as unknown as { patch: Record<string, unknown> }
    expect(vm.patch).toEqual({})
    const cmds = w.findAllComponents({ name: 'VxInput' }).find((i) => i.props('modelValue') === 'ping so')!
    cmds.vm.$emit('update:modelValue', 'ping, so  quote')
    await w.vm.$nextTick()
    expect(vm.patch).toEqual({ alt_prefixes: [{ prefix: '?', commands: ['ping', 'so', 'quote'] }] })
    await w.findAll('button').find((b) => b.text() === 'Add extra sign')!.trigger('click')
    // Inputs in order: the sign, then each extra sign and its commands.
    w.findAllComponents({ name: 'VxInput' })[3]!.vm.$emit('update:modelValue', '$')
    w.findAllComponents({ name: 'VxCheckbox' })[1]!.vm.$emit('update:modelValue', true)
    await w.vm.$nextTick()
    expect(vm.patch).toEqual({
      alt_prefixes: [
        { prefix: '?', commands: ['ping', 'so', 'quote'] },
        { prefix: '$', commands: 'all' },
      ],
    })
  })
})

describe('ChannelSettings extra signs after a save', () => {
  it('has nothing left to save once the bot answers with what was sent', async () => {
    const w = mount(ChannelSettings, { props: { channel: channel(), roles: ['mod'] } })
    await w.setProps({ channel: { ...channel(), alt_prefixes: [] } })
    await w.findAll('button').find((b) => b.text() === 'Add extra sign')!.trigger('click')
    const inputs = w.findAllComponents({ name: 'VxInput' })
    inputs[1]!.vm.$emit('update:modelValue', '$')
    w.findAllComponents({ name: 'VxCheckbox' })[0]!.vm.$emit('update:modelValue', true)
    await w.vm.$nextTick()
    const vm = w.vm as unknown as { patch: Record<string, unknown> }
    expect(vm.patch).toEqual({ alt_prefixes: [{ prefix: '$', commands: 'all' }] })
    await w.setProps({ channel: { ...channel(), alt_prefixes: [{ prefix: '$', commands: 'all' }] } })
    expect(vm.patch).toEqual({})
  })
})
