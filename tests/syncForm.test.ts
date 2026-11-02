import { describe, expect, it } from 'vitest'
import { syncForm } from '../src/lib/syncForm'

describe('syncForm', () => {
  it('keeps an edited field when the channel reloads', () => {
    const form = { prefix: '?', tz: 'UTC' }
    syncForm(form, { prefix: '!', tz: 'UTC' }, { prefix: '!', tz: 'UTC' })
    expect(form.prefix).toBe('?')
  })
  it('takes new values for untouched fields', () => {
    const form = { prefix: '?', tz: 'UTC' }
    syncForm(form, { prefix: '!', tz: 'UTC' }, { prefix: '!', tz: 'CET' })
    expect(form).toEqual({ prefix: '?', tz: 'CET' })
  })
  it('follows the save: the edited value became the saved one', () => {
    const form = { prefix: '?' }
    syncForm(form, { prefix: '!' }, { prefix: '?' })
    expect(form.prefix).toBe('?')
  })
})
