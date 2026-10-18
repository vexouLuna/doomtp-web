// Lays a one-line command out over several lines: each `&&` / `||` / `|` starts a line, and the contents of an
// `ifelse ( … ) ( … )` group are indented under it. Only the whitespace between words changes, so the result is
// returned as edits to the original text and the lexer's colours still line up (applyEdits in lib/lexer.ts).
import type { Span } from './lexer'

/** [from, to, replacement]: the whitespace run text[from..to] becomes `replacement`. */
export type Edit = [number, number, string]

const OPERATORS = new Set(['&&', '||', '|'])
const INDENT = '  '

/** Words of a line with their positions. Quotes, `\` escapes and `{ … }` placeholders keep their spaces inside one word. */
function words(text: string): { w: string; from: number; to: number }[] {
  const out: { w: string; from: number; to: number }[] = []
  let i = 0
  while (i < text.length) {
    if (/\s/.test(text[i])) { i++; continue }
    const from = i
    let quoted = false
    let braces = 0
    while (i < text.length && (quoted || braces > 0 || !/\s/.test(text[i]))) {
      const c = text[i]
      if (c === '\\') i++
      else if (c === '"') quoted = !quoted
      else if (!quoted && c === '{') braces++
      else if (!quoted && c === '}' && braces > 0) braces--
      i++
    }
    out.push({ w: text.slice(from, i), from, to: i })
  }
  return out
}

/** The edits that spread `text` over lines, or none when it is short and simple enough to stay as it is. */
export function prettyEdits(text: string): Edit[] {
  const ws = words(text)
  const ops = ws.filter(({ w }) => OPERATORS.has(w)).length
  if (!ws.some(({ w }) => w === '(') && ops < 3 && text.length < 70) return []
  const edits: Edit[] = []
  let depth = 0
  let prev = ''
  ws.forEach(({ w, from }, k) => {
    if (w.startsWith('#')) return // a trailing comment keeps its place
    const gap: [number, number] = [k ? ws[k - 1].to : from, from]
    const line = (d: number) => k && edits.push([...gap, `\n${INDENT.repeat(d)}`])
    if (w === ')' && depth > 0) line(--depth)
    else if (OPERATORS.has(w)) line(depth)
    else if (prev === '(') line(depth)
    if (w === '(') depth++
    prev = w
  })
  return edits
}

/** `spans` with the edits applied: the new whitespace is plain text, every other character keeps its colour. */
export function applyEdits(spans: Span[], edits: Edit[]): Span[] {
  if (!edits.length) return spans
  const out: Span[] = []
  const push = (text: string, cls?: string) => {
    if (!text) return
    const last = out[out.length - 1]
    if (last && last.cls === cls) last.text += text
    else out.push({ text, cls })
  }
  let at = 0 // position in the original text
  let e = 0
  for (const s of spans) {
    for (let i = 0; i < s.text.length; i++, at++) {
      if (e < edits.length && at === edits[e][0]) push(edits[e][2])
      if (e < edits.length && at >= edits[e][0] && at < edits[e][1]) {
        if (at === edits[e][1] - 1) e++
        continue
      }
      push(s.text[i], s.cls)
    }
  }
  return out
}
