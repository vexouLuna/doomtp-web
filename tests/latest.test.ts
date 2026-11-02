import { describe, expect, it } from 'vitest'
import { latest } from '../src/lib/latest'

describe('latest', () => {
  it('is live only until the next run starts', () => {
    const run = latest()
    const first = run()
    expect(first()).toBe(true)
    const second = run()
    expect(first()).toBe(false)
    expect(second()).toBe(true)
  })
})
