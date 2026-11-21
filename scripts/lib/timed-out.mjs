// A WAIT THAT RUNS OUT SAYS SO (主开发 r1141 / r1197, lane bl-tests-chrome; test-ci-gate §2p) — THE ONE MARK of a wait whose bound ran out.
// markTimedOut(read, ms, what) answers the LAST READ with its truthiness kept: a null stays a null, an undefined stays an undefined, a
// number or a string stays what it was (a judge that reads «nothing there» never goes green over a state that never came). An object or
// a list carries `timedOut` BESIDE its own fields. Whatever the read is, the state that never came is SAID on its own line, right above
// the judge that reads it. never(read) is the words a judge appends to its red when the read carries the mark.
const shown = (v) => { try { return String(JSON.stringify(v === undefined ? null : v)); } catch { return String(v); } };

export function markTimedOut(v, ms, what, { say = (m) => console.log(m) } = {}) {
  const why = `the state it waits for did not come in ${ms / 1000} s`;
  say(`    (${what}: ${why} (a wait that expects nothing ends so too); its last read ${shown(v).slice(0, 160)})`);
  if (v && typeof v === 'object') { try { Object.defineProperty(v, 'timedOut', { value: `${what}: ${why}`, enumerable: true, configurable: true, writable: true }); } catch { /* a frozen read: said above, kept as it was */ } }
  return v;
}

export const never = (read) => (read && read.timedOut ? ` — THE STATE NEVER CAME: ${read.timedOut}, so this red is that, not a verdict on the product` : '');
