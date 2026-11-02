// Re-syncs a form to a freshly loaded snapshot without losing edits: a field takes the new value only
// when the form still holds what was last loaded (untouched); an edited field keeps the edit.
export function syncForm<T extends object>(form: T, prev: T, next: T) {
  for (const key of Object.keys(next) as (keyof T)[]) {
    if (form[key] === prev[key]) form[key] = next[key]
  }
}
