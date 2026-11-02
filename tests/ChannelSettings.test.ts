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
