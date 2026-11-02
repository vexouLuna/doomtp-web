// Run guard for loaders that can overlap: each call starts a run and returns a check that is true only
// until the next run starts, so a late response from an older run can be dropped.
export function latest() {
  let n = 0
  return () => {
    const id = ++n
    return () => id === n
  }
}
