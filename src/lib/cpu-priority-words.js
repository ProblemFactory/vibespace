// B-460d — THE WORDS OF A CONVERSATION'S CPU PRIORITY (Session Properties' «CPU priority» row): where a person looks for
// «why is my build slower». PURE (imports nothing; `t` handed in), so the fast suite reads the same sentences the
// dialog draws. The fact is the server's (src/server/spawn-priority.js priorityFor → session `cpuNice`): {by} below the
// hub, or {by: 0, why}. No fact (a conversation started before this release) ⇒ no row.

/** fact → the row's words, or null (no row) */
export function cpuPriorityWords(fact, t) {
  if (!fact || typeof fact !== 'object' || !Number.isInteger(fact.by)) return null;
  if (fact.by > 0) return t('Below the server (nice +{n}) — and everything it starts', { n: String(fact.by) });
  if (fact.why === 'off') return t('The server’s own — lowering it is off in Settings');
  if (fact.why === 'no-nice') return t('The server’s own — this machine has no nice program');
  if (fact.why === 'remote') return t('Set by its own machine — not lowered from here');
  return null;
}
