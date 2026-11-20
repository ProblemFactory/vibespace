// B-460d — THE WORDS OF A CONVERSATION'S CPU PRIORITY (Session Properties' «CPU priority» row): where a person looks for
// «why is my build slower». PURE (imports nothing; `t` handed in), so the fast suite reads the same sentences the
// dialog draws. The fact is the server's (src/server/spawn-priority.js priorityFor → session `cpuNice`): {by} below the
// hub, or {by: 0, why}. No fact (a conversation started before this release) ⇒ no row.

/** fact → the row's words, or null (no row). `remote`: the conversation runs on another machine (its `host`) — a step there is
 *  below THAT machine's agent (B-460d's remainder: a paired machine's start, src/spawn/dial.js); each not-lowered case keeps
 *  its sentence (a paired machine's is «set by its own machine») */
export function cpuPriorityWords(fact, t, { remote = false } = {}) {
  if (!fact || typeof fact !== 'object' || !Number.isInteger(fact.by)) return null;
  if (fact.by > 0) return remote ? t('Below its machine’s agent (nice +{n}), and everything it starts', { n: String(fact.by) }) : t('Below the server (nice +{n}) — and everything it starts', { n: String(fact.by) });
  if (fact.why === 'off') return t('The server’s own — lowering it is off in Settings');
  if (fact.why === 'no-nice') return t('The server’s own — this machine has no nice program');
  if (fact.why === 'remote') return t('Set by its own machine — not lowered from here');
  return null;
}
