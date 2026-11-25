// B-8703 (主开发 r4450 / r4586): THE DOOR OF THE LONG-LIVED TOKEN IDENTITY CHECK's four For-you items — PURE (imports nothing; the page
// hands it its own facts and verbs: src/lib/app.js openOatDialog). It opens THAT account's long-lived token dialog, the one the row's
// own «Long-lived token…» in Manage agents opens; it never says an account is gone on a list that has not answered:
//   the list holds the account                         → open its dialog
//   the list cannot be read (held)                      → say so (the accounts list's own held words), never «gone»
//   the list answered once and the account is not in it → «gone» (the notice can be closed)
//   the list has not answered yet (a freshly loaded page) → ask it once (the page's own refresh), then judge again; still no
//     answer (the ask failed) → say the list cannot be read, never «gone»
/** the step for `list` (the page's account list: {accounts, held, answered}) and the row `id` → {kind, account?} */
export function oatDoorStep(list, id) {
  const l = list && typeof list === 'object' ? list : null;
  if (l && l.held) return { kind: 'held' };
  const a = l && Array.isArray(l.accounts) ? l.accounts.find((x) => x && x.id === id) : null;
  if (a) return { kind: 'open', account: a };
  return l && l.answered === true ? { kind: 'gone' } : { kind: 'ask' };
}
/** the press: `getList()` → the page's list now; `ask()` → the page's own refresh (a promise); `open(account)`; `say(words)`;
 *  `goneWords()` / `heldWords()` → the two sentences, already in the reader's language → what it did ('open' | 'held' | 'gone' | 'unread') */
export async function openOatDoor({ id, getList, ask, open, say, goneWords, heldWords }) {
  let step = oatDoorStep(getList(), id);
  if (step.kind === 'ask') { try { await ask(); } catch { } step = oatDoorStep(getList(), id); if (step.kind === 'ask') step = { kind: 'unread' }; }
  if (step.kind === 'open') { open(step.account); return 'open'; }
  if (step.kind === 'gone') { say(goneWords()); return 'gone'; }
  say(heldWords()); return step.kind;   // held, or a list that did not answer the ask: it cannot be read now — never «gone»
}
