import { expect, test } from 'vitest'
import { applyEdits, prettyEdits } from '../src/lib/pretty'

const run = (t: string) => applyEdits([{ text: t }], prettyEdits(t)).map((s) => s.text).join('')

test('short lines stay as they are', () => {
  expect(run('!random 1-6 | echo you rolled {_1}')).toBe('!random 1-6 | echo you rolled {_1}')
})
test('ifelse groups are indented', () => {
  expect(run('!var pop channel.queue || ifelse {_.code == 254} ( echo queue is empty ) ( echo {_.message} )')).toBe(
    '!var pop channel.queue\n|| ifelse {_.code == 254} (\n  echo queue is empty\n) (\n  echo {_.message}\n)',
  )
})
test('nested groups and quotes', () => {
  expect(run('!a "x  y" && ifelse {1} ( ifelse {2} ( !b ) ( !c ) )')).toBe(
    '!a "x  y"\n&& ifelse {1} (\n  ifelse {2} (\n    !b\n  ) (\n    !c\n  )\n)',
  )
})
