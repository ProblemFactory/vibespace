// PURE (imports nothing, DOM-free) — THE TWO-STEP NAME FIELD's LIST (lane vault-2fa-pick, 2026-11-17 — the owner, from the
// login card's own window: «这里下拉框怎么没用？», and then «只弹出了我截图里那个浏览器的推荐输入，没有vibespace自己的下拉框»).
// The field named the vault's two-step codes through the browser's NATIVE list (<datalist> — the tree's only one): every
// platform draws that list as its own suggestion popup, so the owner read it as the browser's history and looked for
// VibeSpace's list — there was none. The field (src/lib/vault-login-row.js loginFields — the Vault's add dialog, the login card
// in the tray and in its own window) now draws ITS OWN list, headed in plain words, a row per code by its NAME (the vault's
// own, unique — GET /api/vault/totp answers names). This file decides what that list shows and what a key does; the DOM is
// the field's (src/lib/vault-otp-field.js).
//   · entriesOf(answer)         — the names the list can show (a malformed or repeated one dropped)
//   · listState(facts)          — what the list is: 'loading' | 'locked' (said with its Unlock… door) | 'failed' | 'empty' | 'rows'
//   · rowsOf(names, query)      — the rows, in order: the typed text's matches first (the exact name, then a name it begins,
//                                 then a name holding it — case-blind), the rest after: typing NEVER empties the list (a name
//                                 typed by hand that matches nothing is said at the field)
//   · typedVerdict(facts, text) — the typed name: 'none' (nothing typed) | 'listed' | 'unlisted' (said at the field at once)
//                                 | 'unknown' (the list is not read, failed, or the vault is locked: nothing is said — the add
//                                 door's own check stands)
//   · closesOnRead(state, names, text) — a read of the names LANDS on an open list: it closes when the TYPING opened it and
//                                 the typed text now settles the choice (a full name typed before the names were read)
//   · typedSettled(names, text) — the typed text IS a listed name and begins no other: the choice is made, the list closes (so
//                                 the usual road — a known name typed, then Save — never has the list open over Save)
//   · keyStep(state, key, n)    — the list's keys: ArrowDown opens / moves, ArrowUp moves, Enter picks the highlighted row,
//                                 Escape closes an open list and is TAKEN (never the form's), Tab leaves

/** The vault's answer → the names the list can show (in the vault's order; a malformed or repeated element dropped). */
export function entriesOf(answer) {
  const list = answer && Array.isArray(answer.entries) ? answer.entries : [];
  const out = [];
  for (const e of list) {
    const name = e && typeof e.name === 'string' ? e.name : '';
    if (name && !out.includes(name)) out.push(name);
  }
  return out;
}

/** What the list is now. facts = { loaded, failed, locked (the route refused: vault_locked), state (the vault's), names }.
 *  A LOCKED vault is never «empty» and never «could not be read»: it is locked, and the list says so with its door. */
export function listState({ loaded = false, failed = false, locked = false, state = null, names = [] } = {}) {
  if (!loaded) return 'loading';
  // LOCKED only when the vault SAYS locked and lists nothing (its names are readable while locked once it has loaded them) — a
  // vault never set up is no «locked» one: it lists nothing, and the empty list's door is the one that helps (cure round 2)
  if (locked || (state === 'locked' && !names.length)) return 'locked';
  if (failed) return 'failed';
  return names.length ? 'rows' : 'empty';
}

const fold = (s) => String(s == null ? '' : s).normalize('NFKC').toLowerCase().trim();

/** The rows in order for what is typed: the exact name, a name it begins, a name holding it, then the rest (alphabetical
 *  within each band); `match` marks the rows the text matched. Every name stays a row. */
export function rowsOf(names, query = '') {
  const q = fold(query);
  const band = (n) => { if (!q) return 3; const f = fold(n); return f === q ? 0 : f.startsWith(q) ? 1 : f.includes(q) ? 2 : 3; };
  return (names || []).map((name) => ({ name, band: band(name) }))
    .sort((a, b) => a.band - b.band || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    .map(({ name, band: b }) => ({ name, match: !!q && b < 3 }));
}

/** The typed name against the list: the add door's own rule (src/server/vault-paste-door.js: the trimmed name, exactly). */
export function typedVerdict(facts = {}, text = '') {
  const v = String(text == null ? '' : text).trim();
  if (!v) return 'none';
  if (facts.reading) return 'unknown';   // a read in flight (the list re-reads at every opening): no word until it lands
  const st = listState(facts);
  if (st !== 'rows' && st !== 'empty') return 'unknown';   // not read yet, failed, or locked: the list cannot say «no such name»
  return (facts.names || []).includes(v) ? 'listed' : 'unlisted';
}

/** One key in the field. state = { open, active (row index or -1) }, n = the rows shown. → { open, active, pick (index |
 *  null), taken (the key is the list's — the field stops it) }. A composing key never reaches here (the field checks). */
export function keyStep({ open = false, active = -1 } = {}, key, n = 0) {
  const last = n - 1;
  if (key === 'ArrowDown') {
    if (!open) return { open: true, active: n ? 0 : -1, pick: null, taken: true };
    return { open, active: n ? (active >= last ? 0 : active + 1) : -1, pick: null, taken: true };
  }
  if (key === 'ArrowUp') {
    if (!open) return { open: true, active: n ? last : -1, pick: null, taken: true };
    return { open, active: n ? (active <= 0 ? last : active - 1) : -1, pick: null, taken: true };
  }
  if (key === 'Enter') {
    if (open && active >= 0 && active < n) return { open: false, active: -1, pick: active, taken: true };
    return { open, active, pick: null, taken: false };   // no row highlighted: Enter is the form's
  }
  if (key === 'Escape') {
    if (open) return { open: false, active: -1, pick: null, taken: true };   // the list closes; the form never hears it
    return { open, active, pick: null, taken: false };
  }
  if (key === 'Tab') return { open: false, active: -1, pick: null, taken: false };
  return { open, active, pick: null, taken: false };
}

/** A read of the names LANDS while the list is open (state = { open, typed — the typing opened or last drew it }): it closes
 *  when the typing opened it and the typed text now settles the choice — a listed name typed in full into a field whose names
 *  were not read yet (a fresh dialog: the typing could not settle it then; the box red of 2.369.412's owed rows). A list a press,
 *  the field's mark or a key opened stays open — the person asked to see it. */
export function closesOnRead({ open = false, typed = false } = {}, names, text = '') {
  return !!open && !!typed && typedSettled(names, text);
}

/** The typed text is a listed name, exactly, and the start of no other listed name: nothing is left to choose. */
export function typedSettled(names, text = '') {
  const v = String(text == null ? '' : text).trim();
  if (!v || !(names || []).includes(v)) return false;
  return !(names || []).some((n) => n !== v && n.startsWith(v));
}
