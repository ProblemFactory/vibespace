'use strict';
// THE USE LAW (lane vault-use-law — design q-043 D1 「用途，不给值」, D2's audit line, D7's daily-failure card; the owner
// 2026-10-20: ① there is no `vibespace-vault get` — an agent gets a PURPOSE and a RECEIPT, never an entry's bytes). No route,
// no CLI verb, no broadcast answers an entry's bytes to a BEARER (an agent's vsst_, a job's jbt_, an automation key); only
// the owner's cookie doors reveal, behind 验证是你 (scripts/test-vault-law.mjs ⑧ is the census). This file is the use's
// SHAPE, its AUDIT LINE and its DAILY FAILURE COUNT; the engine's `noteUse` (src/server/vault-engine.js) is the ONE writer.
//   · THE ONE SHAPE of a use — `useOf` → { at, by, door, conv }: WHO (`by`: human · agent · job · automation · system — the
//     Vault window's «last used» reads the same field), through WHICH door (a store's own read is `store`, the Vault window
//     `vault-window`, the attach child's `link-token`, a person's door by its name …), for WHICH conversation (`conv`: the
//     session's conversation key / `job-<id>`; null for a person or the hub).
//   · THE AUDIT LINE — `useLine` → { at, event: 'vault-use', entry, purpose, by, door, conv, actor, outcome, receipt, ip, grant }: a
//     CLOSED key set (whatever else a door hands the writer is dropped — a value can never ride along), every field a
//     bounded one-line string or null. Written for every use by a BEARER (`BEARERS`), allowed or refused; a person's doors
//     keep their own lines (vault-reveal, vault-unlock-failed …) and the hub's own store reads write none (one line per read
//     would drown the file — the window's «last used» says them).
//   · THE DAILY FAILURE COUNT (D7) — `createFailures`: failed uses per ACTOR × ENTRY over a rolling day; the 20th in 24 h
//     FIRES once (the hub files ONE For-you item naming the actor and the entry — src/server/vault-hooks.js) and the same
//     pair fires again only a day later. What the vault's own state refused (locked, not set up) and the pace are not the
//     actor's failure — never counted (the lock's own item names who it stopped). Bounded: ≤ 200 pairs × ≤ 20 instants.
//   · AN AGENT'S OWN RECEIPTS (lane vault-manual-and-lock, design D4 — `vibespace-vault uses`): `usesOf(text, conv)` reads the
//     audit file's tail back — the `vault-use` lines of ONE conversation (its `conv`), newest first, each the line's own closed
//     fields (entry, purpose, when, door, outcome, receipt). A line never holds a value, and another conversation's are skipped.
//   · THE COUNTS (lane vault-use-grants — the Vault window's «used 12× by 3 conversations»): `countsOf(text)` over the same tail —
//     per entry, the uses that OPENED (outcome ok) and how many conversations made them, and the same per GRANT (`grant` = the
//     vault-use grant's id, src/vault-use-grant.js, when a standing approval admitted the use — the run door writes it).
// PURE: imports nothing (scripts/test-architecture.mjs PURE set).

const BY = Object.freeze(['human', 'agent', 'job', 'automation', 'system']);
const BEARERS = Object.freeze(['agent', 'job', 'automation']);   // the law's subjects: a token, not a person on the page
const VAULT_ENTRY = 'vault';        // the second password itself (a person's unlock / setup / change / 验证是你)
const CONTENTS_ENTRY = 'contents';  // the stored values as a list (the Vault window's list and reveal doors)
const FAIL_PER_DAY = 20;            // design q-043 §2 T7: ≥ 20 failures in a day ⇒ the owner's card
const DAY_MS = 864e5;
const MAX_PAIRS = 200;
const LINE_KEYS = Object.freeze(['at', 'event', 'entry', 'purpose', 'by', 'door', 'conv', 'actor', 'outcome', 'receipt', 'ip', 'grant']);
const GRANT_ID_RE = /^vg-[0-9a-f]{8}$/;   // lane vault-use-grants: the vault-use grant that admitted the use (src/vault-use-grant.js grantIdOf)
const DOOR_RE = /^[a-z][a-z0-9-]{0,39}$/;
const OUTCOME_RE = /^[a-z][a-z0-9_:-]{0,59}$/;
const RECEIPT_RE = /^vr-[0-9a-f]{8,32}$/;
const UNCOUNTED = Object.freeze(['ok', 'paced', 'busy', 'error', 'vault_not_set_up',
  'ask_expired', 'ask_unfiled', 'caller_gone']);   // lane vault-manual-and-lock: the owner's silence (60 s), the hub's For-you store, the agent's own cancel — none is the actor's failure
const USES_MAX = 50;                // vibespace-vault uses: the newest lines of one conversation (lane vault-manual-and-lock)
const clean = (s, max) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

/** THE ONE SHAPE: a use record from what a door says (`u` = { by, door, conv } or a bare `by`), stamped `at`. */
function useOf(u, at = null) {
  const o = u && typeof u === 'object' ? u : { by: u };
  const t = Number(at != null ? at : o.at);
  return {
    at: Number.isFinite(t) && t > 0 ? t : null,
    by: BY.includes(o.by) ? o.by : 'system',
    door: DOOR_RE.test(String(o.door || '')) ? String(o.door) : null,
    conv: o.conv == null || o.conv === '' ? null : clean(o.conv, 160) || null,
  };
}
/** An outcome is 'ok' or a refusal's code — anything else is 'error' (a free sentence never rides as an outcome). */
const outcomeOf = (x) => (x == null || x === true ? 'ok' : OUTCOME_RE.test(String(x)) ? String(x) : 'error');
/** Does this outcome count toward the actor's daily failures? The vault's own state and the pace never do — nor (lane
 *  vault-job-road r2) a start whose hand-over the hub's OWN wrapper refused (`refused:<its code>`: no program got the value). */
const counts = (x) => { const o = outcomeOf(x); return !UNCOUNTED.includes(o) && !o.includes('vault_locked') && !o.startsWith('refused:'); };

/** THE `vault-use` AUDIT LINE — the closed key set (LINE_KEYS, in that order), never a value. */
function useLine({ at, entry, purpose, use, actor, outcome, receipt, ip, grant } = {}) {
  const u = useOf(use, at);
  const line = {
    at: new Date(u.at || 0).toISOString(),
    event: 'vault-use',
    entry: clean(entry, 200) || null,
    purpose: clean(purpose, 160) || null,
    by: u.by,
    door: u.door,
    conv: u.conv,
    actor: clean(actor, 80) || null,
    outcome: outcomeOf(outcome),
    receipt: RECEIPT_RE.test(String(receipt || '')) ? String(receipt) : null,
    ip: clean(ip, 64) || null,
    grant: GRANT_ID_RE.test(String(grant || '')) ? String(grant) : null,
  };
  return Object.fromEntries(LINE_KEYS.map((k) => [k, line[k]]));
}

/** What an entry IS, in words a person reads (the card's «what») — never a machine's or a key's id. */
function entryLabel(name) {
  const n = String(name || '');
  if (n === VAULT_ENTRY) return 'the second password';
  if (n === CONTENTS_ENTRY) return 'the stored values';
  const kind = n.includes(':') ? n.slice(0, n.indexOf(':')) : '';
  if (kind === 'host') return 'a machine link token';
  if (kind === 'file') return 'a sealed file key';
  if (kind === 'apikey') return 'an automation key';
  if (kind === 'agent') return `the agent secret ${clean(n.slice(n.lastIndexOf('/') + 1), 64)}`;
  const store = /^(?:\.([a-z][a-z-]*)-key|([a-z][a-z-]*)\.key)$/.exec(n);
  if (store) return `the ${(store[1] || store[2]).replace(/^browser-/, '')} store key`;
  return kind ? `the stored secret ${clean(n, 80)}` : clean(n, 80) || 'a stored value';   // a plugin's own entry (the relay's frp:token) by its name — never a branch on a plugin id (test-architecture §78)
}

/** THE DAILY FAILURE COUNT: `note({ key, actor, by, entry, door, outcome, at })` → { n, fire, card } — `fire` once when an
 *  actor × entry pair reaches `threshold` failures inside `windowMs`, then not again for `windowMs`. */
function createFailures({ threshold = FAIL_PER_DAY, windowMs = DAY_MS, maxPairs = MAX_PAIRS } = {}) {
  const rows = new Map();   // `${key}\n${entry}` → { times, firedAt }
  const lastOf = (r) => (r.times.length ? r.times[r.times.length - 1] : 0);
  function note({ key, actor = null, by = null, entry, door = null, outcome = null, at = 0 } = {}) {
    const t = Number(at) || 0;
    const k = `${clean(key, 200)}\n${clean(entry, 200)}`;
    let row = rows.get(k);
    if (!row) {
      if (rows.size >= maxPairs) { let stale = null; for (const [kk, r] of rows) if (!stale || lastOf(r) < lastOf(stale[1])) stale = [kk, r]; if (stale) rows.delete(stale[0]); }
      row = { times: [], firedAt: null };
      rows.set(k, row);
    }
    row.times = row.times.filter((x) => x <= t && t - x < windowMs);
    row.times.push(t);
    if (row.times.length > threshold) row.times.splice(0, row.times.length - threshold);
    const fire = row.times.length >= threshold && !(row.firedAt != null && row.firedAt <= t && t - row.firedAt < windowMs);
    if (fire) row.firedAt = t;
    const n = row.times.length;
    return { n, fire, card: fire ? { actor: clean(actor, 80) || null, by, key: clean(key, 200), entry: clean(entry, 200), door, outcome: outcomeOf(outcome), n, since: row.times[0], at: t } : null };
  }
  return { note, size: () => rows.size };
}

/** THIS conversation's own uses (lane vault-manual-and-lock — design D4, `vibespace-vault uses`): the `vault-use` lines of
 *  `text` (the audit file's tail, one JSON line each) whose `conv` is `conv` → newest first, ≤ `limit`, each
 *  { at, entry, purpose, door, outcome, receipt } — re-checked field by field (a line the file holds is read, never trusted
 *  whole); another conversation's lines and every other event are skipped. */
function usesOf(text, conv, limit = USES_MAX) {
  const c = clean(conv, 160);
  const out = [];
  if (!c) return out;
  const lines = String(text == null ? '' : text).split('\n');
  for (let i = lines.length - 1; i >= 0 && out.length < Math.max(0, Math.min(Number(limit) || 0, USES_MAX)); i--) {
    const l = lines[i];
    if (!l || l.indexOf('"vault-use"') < 0) continue;
    let o = null;
    try { o = JSON.parse(l); } catch { continue; }
    if (!o || typeof o !== 'object' || o.event !== 'vault-use' || o.conv !== c) continue;
    out.push({
      at: typeof o.at === 'string' && Number.isFinite(Date.parse(o.at)) ? o.at.slice(0, 40) : null,
      entry: clean(o.entry, 200) || null,
      purpose: clean(o.purpose, 160) || null,
      door: DOOR_RE.test(String(o.door || '')) ? String(o.door) : null,
      outcome: outcomeOf(o.outcome),
      receipt: RECEIPT_RE.test(String(o.receipt || '')) ? String(o.receipt) : null,
    });
  }
  return out;
}
/** lane vault-use-grants: THE COUNTS over the audit tail `text` — `vault-use` lines that OPENED (outcome ok) → { <entry>:
 *  { uses, convs, grants: { <grant id>: { uses, convs } } } } (`convs` = how many conversations; a line with no conversation
 *  counts as a use only). Each line re-checked (a line the file holds is read, never trusted whole). */
function countsOf(text) {
  const acc = new Map();
  for (const l of String(text == null ? '' : text).split('\n')) {
    if (!l || l.indexOf('"vault-use"') < 0) continue;
    let o = null;
    try { o = JSON.parse(l); } catch { continue; }
    if (!o || typeof o !== 'object' || o.event !== 'vault-use' || outcomeOf(o.outcome) !== 'ok') continue;
    const entry = clean(o.entry, 200), conv = clean(o.conv, 160);
    if (!entry) continue;
    let e = acc.get(entry);
    if (!e) acc.set(entry, (e = { uses: 0, convs: new Set(), grants: new Map() }));
    e.uses++; if (conv) e.convs.add(conv);
    if (GRANT_ID_RE.test(String(o.grant || ''))) {
      let g = e.grants.get(o.grant);
      if (!g) e.grants.set(o.grant, (g = { uses: 0, convs: new Set() }));
      g.uses++; if (conv) g.convs.add(conv);
    }
  }
  const out = {};
  for (const [k, e] of acc) out[k] = { uses: e.uses, convs: e.convs.size, grants: Object.fromEntries([...e.grants].map(([id, g]) => [id, { uses: g.uses, convs: g.convs.size }])) };
  return out;
}

module.exports = { useOf, useLine, outcomeOf, counts, entryLabel, createFailures, usesOf, countsOf, BY, BEARERS, VAULT_ENTRY, CONTENTS_ENTRY, FAIL_PER_DAY, DAY_MS, LINE_KEYS, USES_MAX, RECEIPT_RE, GRANT_ID_RE };
