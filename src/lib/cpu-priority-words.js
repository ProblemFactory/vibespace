// B-460d — THE WORDS OF A CONVERSATION'S CPU PRIORITY (Session Properties' «CPU priority» row): where a person looks for
// «why is my build slower». PURE (imports nothing; `t` handed in), so the fast suite reads the same sentences the
// dialog draws. The fact is the server's (src/server/spawn-priority.js priorityFor → session `cpuNice`): {by} below the
// hub, or {by: 0, why}. No fact (a conversation started before this release) ⇒ no row.

/** fact → the row's words, or null (no row). `remote`: the conversation runs on another machine (its `host`) — a step there is
 *  below THAT machine's agent (B-460d's remainder: a paired machine's start, src/spawn/dial.js); each not-lowered case keeps
 *  its sentence (a paired machine's is «set by its own machine») */
export function cpuPriorityWords(fact, t, { remote = false } = {}) {
  if (!fact || typeof fact !== 'object' || !Number.isInteger(fact.by)) return null;
  // the follow (round wmm5vpkhl): an ssh road's step is below the ssh LOGIN on that machine (`of: 'login'`); the terminal road may
  // have JOINED a shell already running (`join`), which keeps its own priority — said, never claimed
  if (fact.by > 0 && fact.of === 'login') return fact.join ? t('Below its ssh login on that machine (nice +{n}) when this terminal started its shell — a terminal that joined a shell already running keeps that shell’s', { n: String(fact.by) }) : t('Below its ssh login on that machine (nice +{n}), and everything it starts', { n: String(fact.by) });
  if (fact.by > 0) return remote ? t('Below its machine’s agent (nice +{n}), and everything it starts', { n: String(fact.by) }) : t('Below the server (nice +{n}) — and everything it starts', { n: String(fact.by) });
  // r1911: a conversation on ANOTHER machine with the setting off runs at THAT machine's own priority — never «the server's own»; the
  // ssh terminal's `join` holds for an unlowered start too (it may have joined a shell another start lowered)
  if (fact.why === 'off') return remote ? (fact.join ? t('Its machine’s own when this terminal started its shell — lowering it is off in Settings; a terminal that joined a shell already running keeps that shell’s') : t('Its machine’s own — lowering it is off in Settings')) : t('The server’s own — lowering it is off in Settings');
  if (fact.why === 'no-nice') return t('The server’s own — this machine has no nice program');
  if (fact.why === 'remote') return fact.join ? t('Set by its own machine when this terminal started its shell — a terminal that joined a shell already running keeps that shell’s') : t('Set by its own machine — not lowered from here');
  return null;
}
