// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { createAccount } from '@vex/ui/account'
import { describe, expect, it } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import AccountMenu from '../src/components/AccountMenu.vue'

const ME = { id: '1', login: 'vex', display_name: 'Vex', csrf: 't' }

async function setup(logout: number) {
  const fetch = (async (url: RequestInfo | URL) =>
    String(url).includes('/v2/logout')
      ? new Response(null, { status: logout })
      : new Response(JSON.stringify(ME), { status: 200, headers: { 'Content-Type': 'application/json' } })) as typeof globalThis.fetch
  const account = createAccount({ authBase: 'https://auth.example', fetch })
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:p(.*)*', component: { template: '<i/>' } }] })
  await router.push('/manage')
  await account.refresh()
  const w = mount(AccountMenu, { global: { plugins: [account, router] } })
  return { w, account, router }
}

describe('AccountMenu sign out', () => {
  it('stays on the manage pages and signed in when the logout fails', async () => {
    const { w, account, router } = await setup(500)
    w.findComponent({ name: 'VxAccountMenu' }).vm.$emit('sign-out')
    await flushPromises()
    expect(account.user.value).not.toBeNull()
    expect(router.currentRoute.value.path).toBe('/manage')
  })

  it('leaves the manage pages once signed out', async () => {
    const { w, account, router } = await setup(204)
    w.findComponent({ name: 'VxAccountMenu' }).vm.$emit('sign-out')
    await flushPromises()
    expect(account.user.value).toBeNull()
    expect(router.currentRoute.value.path).toBe('/')
  })
})
