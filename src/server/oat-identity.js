'use strict';
// ORCH — THE LONG-LIVED TOKEN'S IDENTITY POST-CHECK, ACTED ON (lane
// oat-identity-postcheck, B-3102 (b); closed against verify r1 by lane
// oat-identity-fix). The verdict is PURE (src/oat-identity-model.js
// identityPostCheck); this file is its ONE orchestrator. It gathers the row
// (its armed check, its anchor, every OTHER account's window — identity groups
// collapsed, non-account keys dropped), asks the verdict over ONE reading the
// pool engine hands it, and acts:
//   confirmed → the check closes; ONE journal line + one probe-log row — said
//               once per saved token (re-armed only when the row's anchor MOVES
//               to another weekly phase, never by a panel re-stamp).
//   suspect   → remembered on the check (`run`): K agreeing ones are a mismatch.
//   mismatch  → the token is KEPT. The row is marked (state 'mismatch': the
//               roster says it, and accounts._placeable stops NEW pool
//               placements where the pool would spend the token — the links
//               already running stay, the F5 ruling). ONE For-you notice, filed
//               once per saved token and resolved by the owner's act: a new
//               token saved, the token removed or moved (accounts tells us
//               through `_oatCheckHook`), or the owner's answer.
//   moved     → K readings agree on a window no other account's identity holds (a renewal, a plan change, or
//               an account outside the roster — fix r2 F-C): the same ONE `anchor` ask a confirmed check
//               files when its window moves by the token's own readings; never a mark.
//   hint      → no anchor, another row's window: ONE For-you ask, the row says
//               「这枚 token 看起来属于 <row>——确认或改绑」; never a mark, never
//               a placement stop — the owner's answer decides (`answer`).
//   stale-token → journaled once per conversation, nothing else.
//   …its ROAD unknown (stale-token, `road: 'unknown'` — lane oat-identity-fix-r3, verify r3 F-R1: a conversation restored
//               from a meta older than the road stamp): journaled once per conversation, the row says
//               「这段对话的 token 来路未知，不参与身份判断」 until a reading with a known road judges — its next spawn fixes it.
//   lost      → (fix r3, F-R2) the row's window stamp can no longer say who produced it and nothing else proves the
//               row's identity: the ONE anchor ask (「身份未验证」), never a mark, never a silent loss.
// THE ANCHOR FOLLOWS THE ROW (`onReanchor`, verify r1 F6): a renewal / a moved
// window proven without the token moves the owner-confirmed anchor with it; one
// made of the token's OWN readings is never followed (the token would confirm
// itself) — the owner is asked instead.
// IDENTITY (lane oat-identity-fix-r2, verify r2 F-A): the row's anchor and every OTHER account's window are their
// identity — evidence no generation of THAT row's token produced (oat-identity-model identityOf: a login stamp, the
// login identity a token's re-stamp carried, a legacy stamp older than the row's first token, an owner's answer) —
// never a window the token's own readings stamped, never a previous token's mint-probe anchor.
// It never touches the reading: the engine hands it a slot key and a window and
// files the reading exactly as before — attribution stays by slot, and nothing
// here returns a key.
const M = require('../oat-identity-model.js');

const INBOX_KEY = 'webui:oat-identity';
const STALE_SAID_MAX = 256; // conversations whose stale-token reading was journaled (once each) — oldest dropped first
const i18nKey = (s) => s; // extraction marker (scripts/i18n-extract.mjs) — the client renders the item through t()
// the verdicts a reading on a KNOWN road reaches once it is eligible — each clears the unknown-road line (fix r3)
const JUDGED = new Set(['no-evidence', 'no-anchor', 'lost', 'hint', 'suspect', 'confirmed', 'moved', 'mismatch']);

function create({ accounts, todos = () => null, windows = () => ({}), groups = (id) => [id], k = M.MISMATCH_RUN, now = () => Date.now(), log = (...a) => console.log(...a), journal = () => { } } = {}) {
  const A = () => (typeof accounts === 'function' ? accounts() : accounts);
  const T = () => { try { return typeof todos === 'function' ? todos() : todos; } catch { return null; } };
  const nameOf = (id) => { try { return A().get(id)?.name || String(id); } catch { return String(id); } };
  const ws = () => { try { return windows() || {}; } catch { return {}; } };
  const staleSaid = new Set();
  const K = () => { try { const n = Number(typeof k === 'function' ? k() : k); return n >= 1 ? n : M.MISMATCH_RUN; } catch { return M.MISMATCH_RUN; } };
  const firstAtOf = (id) => { try { return typeof A().oatFirstAtOf === 'function' ? A().oatFirstAtOf(id) : null; } catch { return null; } };
  const anchorOf = (id, check, w = ws()) => M.rowAnchorOf({ established: w[id] || null, oatAnchor: A().oatAnchorOf(id), since: check.since, firstAt: firstAtOf(id) });
  // F3: a key that is no account row (__global__, host-*) is never "another account"; a key of the row's OWN
  // identity group (an org-merged login spans several keys) is the row; one group is ONE other, named by an account
  const isAccount = (key) => { try { return !!A().get(key); } catch { return false; } };
  const repOf = (key) => { let g = [key]; try { g = groups(key) || [key]; } catch { } return g.filter(isAccount).sort()[0] || key; };
  function rowOf(id, check) {
    const w = ws();
    const mine = new Set([id, repOf(id)]);
    const others = [];
    const add = (key, win) => { if (key === id || !isAccount(key)) return; const r = repOf(key); if (!mine.has(r)) others.push({ id: r, window: win }); };
    // fix r2 F-A: another account is named by its IDENTITY only — never by a window its own token's readings stamped
    for (const [key, win] of Object.entries(M.identityWindows({ windows: w, anchors: A().oatAnchors() || {}, firstAt: firstAtOf }))) add(key, win);
    const lost = M.rowLostOf({ established: w[id] || null, oatAnchor: A().oatAnchorOf(id), since: check.since, firstAt: firstAtOf(id) });
    return { check, anchor: anchorOf(id, check, w), lost, orgUuid: null, others, run: Array.isArray(check.run) ? check.run : [] };
  }
  /** the check rewritten whole (setOatCheck replaces it): `patch` over what it holds now */
  const put = (id, cur, patch) => A().setOatCheck(id, { ...cur, ...patch });
  /** ONE For-you filing door for every item this check files (a mark's notice, a hint, an anchor ask) */
  function fileItem(id, { text, detail, i18n }) {
    const t = T();
    if (!t || typeof t.add !== 'function') return null;
    try {
      // fix r2 L1: at most ONE open item per account row (a mark resolves the ask) — the store's per-key cap of 20 (an
      // agent looping on add) would otherwise drop the 21st row's item while its roster line says it is asked
      let rows = 0; try { rows = (A().list().accounts || []).length; } catch { rows = 0; }
      const item = t.add(INBOX_KEY, { origin: 'login', kind: 'notice', urgency: 'normal', by: 'agent', sessionName: 'Manage Agents', text, detail, i18n, openCap: 2 * rows });
      return item && item.id ? String(item.id) : null;
    } catch (e) { log('[oat-identity] could not file the For-you item:', e.message); return null; }
  }
  function fileNotice(id, v) {
    const name = nameOf(id);
    const otherNames = [...new Set((v.others || []).map(nameOf))];
    return fileItem(id, {
      text: otherNames.length
        ? `${name}'s long-lived token belongs to another account (its usage matches ${otherNames.join(', ')}) — re-mint it or re-bind it in Manage Agents`
        : `${name}'s long-lived token belongs to another account — re-mint it or re-bind it in Manage Agents`,
      detail: `Account: ${name}\nWhat its token's readings said: ${v.fp || '(no window)'}${v.run ? ` (${v.run} consecutive readings)` : ''}\nThe row's identity: ${v.via === 'owner-answer' ? 'the owner said the token is not this account\'s' : (v.via || 'its anchor')}\n\n`
        + 'The long-lived token saved on this row answered with ANOTHER account\'s usage window, so it bills that account, not this one. '
        + 'It is kept (conversations already running on it continue), and the pool places nothing new where it would spend it. '
        + 'Manage Agents → the row\'s ⋯ → Long-lived token: re-mint it while signed in as this account, re-bind it to the account it belongs to, or remove it.',
      i18n: { text: otherNames.length
        ? { key: i18nKey('{account}\'s long-lived token belongs to another account (its usage matches {other}) — re-mint it or re-bind it in Manage Agents'), params: { account: name, other: otherNames.join(', ') } }
        : { key: i18nKey('{account}\'s long-lived token belongs to another account — re-mint it or re-bind it in Manage Agents'), params: { account: name } } },
    });
  }
  function fileAsk(id, kind, { others = [], fp = null, pending = false, lost = false } = {}) {
    const name = nameOf(id);
    const otherNames = [...new Set(others.map(nameOf))];
    if (lost) {
      return fileItem(id, {
        text: `${name}'s long-lived token is unverified: its usage window can no longer say whose it is — confirm the token is ${name}'s, or re-bind it in Manage Agents`,
        detail: `Account: ${name}\nWhat its token's reading said: ${fp || '(no window)'}\n\n`
          + 'This row\'s usage window was last written by a step that could not tell this account\'s sign-in from its long-lived token (an identity repair, or a conversation whose start was never recorded), so nothing proves whose the token is. Nothing was marked and the pool keeps using it. '
          + 'Manage Agents → the row\'s ⋯ → Long-lived token: confirm it is this account\'s, or re-bind it to the account it belongs to.',
        i18n: { text: { key: i18nKey('{account}\'s long-lived token is unverified: its usage window can no longer say whose it is — confirm the token is {account}\'s, or re-bind it in Manage Agents'), params: { account: name } } },
      });
    }
    return kind === 'hint'
      ? fileItem(id, {
        text: `${name}'s long-lived token looks like ${otherNames.join(', ')}'s — confirm it is ${name}'s, or re-bind it in Manage Agents`,
        detail: `Account: ${name}\nWhat its token's first reading said: ${fp || '(no window)'}\n\n`
          + `This row has no usage window of its own to check its long-lived token against, and the token's usage window is the one ${otherNames.join(', ')} holds. Two accounts can share a weekly reset hour by chance, so nothing was marked and the pool keeps using it. `
          + 'Manage Agents → the row\'s ⋯ → Long-lived token: confirm it is this account\'s, or re-bind it to the account it belongs to.',
        i18n: { text: { key: i18nKey('{account}\'s long-lived token looks like {other}\'s — confirm it is {account}\'s, or re-bind it in Manage Agents'), params: { account: name, other: otherNames.join(', ') } } },
      })
      : fileItem(id, {
        text: `${name}'s usage window moved away from the one its long-lived token was confirmed with — confirm the token is still ${name}'s, or re-bind it in Manage Agents`,
        detail: pending
          ? `Account: ${name}\nWhat its token's readings say: ${fp || '(no window)'}\n\n`
            + 'The long-lived token\'s readings keep agreeing on a weekly window that is not this row\'s and that no other account holds. A renewal or a plan change of this account moves its window like that — and so would a token of an account outside this roster — so nothing was marked and the pool keeps using it. '
            + 'Manage Agents → the row\'s ⋯ → Long-lived token: confirm it is this account\'s, or re-bind it.'
          : `Account: ${name}\nIts usage window now: ${fp || '(no window)'}\n\n`
            + 'The window moved by the long-lived token\'s own readings, so the move cannot vouch for the token: the anchor the owner confirmed is kept and nothing was marked. '
            + 'A renewal or a plan change moves the window too. Manage Agents → the row\'s ⋯ → Long-lived token: confirm it is still this account\'s, or re-bind it.',
        i18n: { text: { key: i18nKey('{account}\'s usage window moved away from the one its long-lived token was confirmed with — confirm the token is still {account}\'s, or re-bind it in Manage Agents'), params: { account: name } } },
      });
  }
  function resolveItem(id, todoId, why) {
    if (!todoId) return false;
    const t = T();
    if (!t || typeof t.get !== 'function') return false;
    let it = null;
    try { it = t.get(todoId); } catch { it = null; }
    if (!it || it.status !== 'open' || it.sessionKey !== INBOX_KEY) return false;
    try { t.setStatus(todoId, 'done', why); } catch (e) { log('[oat-identity] could not resolve the For-you item:', e.message); return false; }
    log(`[oat-identity] ${nameOf(id)}: ${why} — the identity notice is resolved`);
    return true;
  }
  /** ONE reading attributed to slot `key` (the engine's call, read-only). reading = {window, at, viaToken, gen,
   *  eligible, sid, orgUuid?}; viaToken / gen may be thunks (asked only when a check is armed — they read the
   *  member's credential file). */
  function onReading(key, reading = {}) {
    if (!key) return { verdict: 'idle' };
    let check = null;
    try { check = A().oatCheckOf(key); } catch { check = null; }
    if (!check) return { verdict: 'idle' };
    // F5: a confirmed token is judged again only when the row's anchor MOVED to another weekly phase — a panel
    // re-stamp of the same week (a new 5-hour block, the ±60 s spelling) is no change. A mismatch waits for the owner.
    if (check.state === 'confirmed') {
      const cur = anchorOf(key, check);
      if (!cur || !M.anchorMoved(cur.window, check.anchorWin)) return { verdict: 'idle' };
      const was = check.anchorFp || 'none';
      try { check = A().setOatCheck(key, { state: 'pending', since: check.since, gen: check.gen, armedAt: now(), ...(check.ask ? { ask: check.ask } : {}) }); } catch { return { verdict: 'idle' }; }
      log(`[oat-identity] ${nameOf(key)}: the row's identity anchor moved (${was} → ${cur.fp}) — its long-lived token's next reading is checked again`);
    }
    if (check.state !== 'pending') return { verdict: 'idle' };
    const ask = (f, dflt) => { try { return typeof f === 'function' ? f() : (f === undefined ? dflt : f); } catch { return dflt; } };
    const viaRaw = ask(reading.viaToken, false);
    const via = viaRaw === true ? true : (viaRaw === null ? null : false); // null = the conversation's road is unknown (fix r3 F-R1)
    const gen = via === true ? ask(reading.gen, null) : null;
    const row = rowOf(key, check);
    const v = M.identityPostCheck(row, { ...reading, viaToken: via, gen }, { now: now(), k: K() });
    const name = nameOf(key);
    // a reading on a KNOWN road judged the token: the unknown-road line goes (fix r3)
    if (check.unknownRoad && JUDGED.has(v.verdict)) check = put(key, check, { unknownRoad: null });
    if (v.verdict === 'confirmed') {
      const prevAsk = check.ask || null;
      A().setOatCheck(key, { state: 'confirmed', since: check.since, gen: check.gen, at: now(), fp: v.fp, via: v.via, on: v.on, anchorFp: row.anchor.fp, anchorWin: row.anchor.window });
      if (prevAsk) resolveItem(key, prevAsk.todoId, 'its long-lived token\'s reading agreed with the row');
      log(v.via === 'self'
        ? `[oat-identity] ${name}: its long-lived token's first reading agrees with the window its OWN mint probe stated (self ${v.fp}) — the owner's pick stands; nothing independent of the token has proved it`
        : `[oat-identity] ${name}: its long-lived token's first reading agrees with the row (${v.via} window ${v.fp}) — confirmed`);
      try { journal({ accountId: key, name, outcome: 'post-check-confirmed', via: v.via, fp: v.fp }); } catch { }
    } else if (v.verdict === 'suspect') {
      put(key, check, { run: [...(Array.isArray(check.run) ? check.run : []), v.entry].slice(-Math.max(1, K() - 1)) });
      log(`[oat-identity] ${name}: a reading of its long-lived token disagrees with the row (${v.run} of ${K()}) — ${v.why}; not judged on one reading`);
    } else if (v.verdict === 'mismatch') {
      const prevAsk = check.ask || null;
      const todoId = fileNotice(key, v);
      A().setOatCheck(key, { state: 'mismatch', since: check.since, gen: check.gen, at: now(), fp: v.fp, via: v.via, on: v.on, why: v.why, others: v.others || [], todoId, anchorFp: row.anchor ? row.anchor.fp : null, anchorWin: row.anchor ? row.anchor.window : null, win: { sevenDay: v.entry.sevenDay, scoped: v.entry.scoped } });
      if (prevAsk) resolveItem(key, prevAsk.todoId, 'the token was marked');
      const otherNames = (v.others || []).map(nameOf);
      log(`[oat-identity] ${name}: its long-lived token belongs to another account${otherNames.length ? ' (' + otherNames.join(', ') + ')' : ''} — ${v.why}; the token is kept, running conversations continue, the pool places nothing new where it would spend it, For you told`);
      try { journal({ accountId: key, name, outcome: 'post-check-mismatch', via: v.via, on: v.on, fp: v.fp, others: otherNames, run: v.run }); } catch { }
      try { global.__vsEvent?.('oat-identity-mismatch', key); } catch { }
    } else if (v.verdict === 'moved') {
      // fix r2 F-C: K readings on a window no other account's identity holds cannot tell a renewal / a plan change from
      // an account outside the roster — the owner is asked ONCE (the anchor ask), never a mark; the run is kept, so K
      // more on a phase another account's identity DOES hold is still a mark
      if (!check.ask) {
        const todoId = fileAsk(key, 'anchor', { fp: v.fp, pending: true });
        put(key, check, { ask: { kind: 'anchor', todoId, others: [], win: { sevenDay: v.entry.sevenDay, scoped: v.entry.scoped }, at: now() } });
        log(`[oat-identity] ${name}: ${v.run} readings of its long-lived token agree on a window no account holds (${v.fp}; the row's is ${row.anchor ? row.anchor.fp : '?'}) — a renewal, a plan change or an account outside the roster: the owner is asked (no mark, the pool keeps using it)`);
        try { journal({ accountId: key, name, outcome: 'anchor-ask', source: 'post-check', fp: v.fp }); } catch { }
      }
    } else if (v.verdict === 'hint') {
      if (!check.ask) {
        const todoId = fileAsk(key, 'hint', { others: v.others, fp: v.fp });
        put(key, check, { ask: { kind: 'hint', todoId, others: v.others, win: { sevenDay: v.entry.sevenDay, scoped: v.entry.scoped }, at: now() } });
        const otherNames = (v.others || []).map(nameOf);
        log(`[oat-identity] ${name}: its long-lived token's reading carries ${otherNames.join(', ')}'s window and the row has none of its own — the owner is asked (no mark, the pool keeps using it)`);
        try { journal({ accountId: key, name, outcome: 'post-check-hint', fp: v.fp, others: otherNames }); } catch { }
      }
    } else if (v.verdict === 'lost') {
      // fix r3 (verify r3 F-R2): the row HAD a window stamp, but nothing about it can say who produced it any more (written
      // after the row's first token by a writer that could not tell) and the owner never answered — the identity was lost,
      // not never made: the owner is asked ONCE (the anchor ask, 「身份未验证」), never a mark, never silence
      if (!check.ask) {
        const todoId = fileAsk(key, 'anchor', { fp: v.fp, lost: true });
        put(key, check, { ask: { kind: 'anchor', lost: true, todoId, others: [], win: { sevenDay: v.entry.sevenDay, scoped: v.entry.scoped }, at: now() } });
        log(`[oat-identity] ${name}: its usage window can no longer say whose it is (the stamp's producer cannot be told) and nothing else proves the row's identity — the owner is asked (no mark, the pool keeps using it)`);
        try { journal({ accountId: key, name, outcome: 'lost-ask', source: 'post-check', fp: v.fp }); } catch { }
      }
    } else if (v.verdict === 'stale-token' && v.road === 'unknown') {
      // fix r3 (verify r3 F-R1): the conversation cannot say whether it runs on the token or the login — it judges nothing;
      // the row says so until a reading on a known road judges (the conversation's next spawn records its road)
      const said = `${key}|${check.since}|${reading.sid || '?'}|road`;
      if (!staleSaid.has(said)) {
        staleSaid.add(said);
        if (staleSaid.size > STALE_SAID_MAX) staleSaid.delete(staleSaid.values().next().value);
        log(`[oat-identity] ${name}: a reading from a conversation whose road is unknown (${v.why}) — never a verdict`);
        try { journal({ accountId: key, name, outcome: 'post-check-unknown-road', sid: reading.sid || null }); } catch { }
      }
      if (!check.unknownRoad) put(key, check, { unknownRoad: { at: now(), sid: reading.sid || null } });
    } else if (v.verdict === 'stale-token') {
      const said = `${key}|${check.since}|${reading.sid || '?'}`;
      if (!staleSaid.has(said)) {
        staleSaid.add(said);
        if (staleSaid.size > STALE_SAID_MAX) staleSaid.delete(staleSaid.values().next().value);
        log(`[oat-identity] ${name}: a reading from a conversation not on the token saved now (${v.why}) — never a verdict`);
        try { journal({ accountId: key, name, outcome: 'post-check-stale-token', sid: reading.sid || null }); } catch { }
      }
    }
    return v;
  }
  /** F6 — THE ROW'S WINDOW WAS RE-ANCHORED (a renewal's panel, a K-run "window moved"). `independent` = the evidence
   *  was not the token's own readings. An owner-confirmed anchor FOLLOWS an independent move (the confirmed check
   *  then judges the token's next reading against it); a move made of the token's own readings is never followed
   *  — the owner is asked (ONE item), never a frozen anchor marking a healthy row. */
  function onReanchor(key, { window: w = null, source = 'api', independent = false } = {}) {
    let an = null;
    try { an = A().oatAnchorOf(key); } catch { an = null; }
    if (!an || !M.hasWeekly(an) || !M.hasWeekly(w)) return 'none';
    if (!M.anchorMoved(w, an)) return 'same';
    const name = nameOf(key), ww = M.weeklyOf(w), was = an.fp || null;
    if (independent) {
      A().setOatAnchor(key, { sevenDay: ww.sevenDay, scoped: ww.scoped, how: 'owner-confirmed', at: now(), followed: String(source).slice(0, 40), ...(an.orgUuid ? { orgUuid: an.orgUuid } : {}), ...(an.mint ? { mint: an.mint } : {}) });
      log(`[oat-identity] ${name}: its usage window moved (${source}) — the long-lived token's confirmed anchor follows it (${was || '?'} → ${M.anchorFromProbe(ww).fp}); the token's next reading is checked against it`);
      try { journal({ accountId: key, name, outcome: 'anchor-followed', source, fp: M.anchorFromProbe(ww).fp }); } catch { }
      return 'followed';
    }
    let check = null;
    try { check = A().oatCheckOf(key); } catch { check = null; }
    if (!check || check.state === 'mismatch' || check.ask) return 'kept';
    const fp = M.anchorFromProbe(ww).fp;
    const todoId = fileAsk(key, 'anchor', { fp });
    put(key, check, { ask: { kind: 'anchor', todoId, others: [], win: { sevenDay: ww.sevenDay, scoped: ww.scoped }, at: now() } });
    log(`[oat-identity] ${name}: its usage window moved by its long-lived token's own readings (${source}) — the confirmed anchor is kept and the owner is asked`);
    try { journal({ accountId: key, name, outcome: 'anchor-ask', source, fp }); } catch { }
    return 'asked';
  }
  /** THE OWNER'S ANSWER (the human-only route): 'mine' ⇒ the window the token's readings stated becomes the row's
   *  owner-confirmed anchor, the check confirmed; 'not-mine' ⇒ the mark (the placement stop + ONE notice). */
  function answer(id, ans) {
    const check = A().oatCheckOf(id);
    const v = M.ownerAnswerVerdict(check, ans);
    if (!v.ok) throw Object.assign(new Error(v.why), { code: v.code });
    const name = nameOf(id);
    if (v.act === 'confirm') {
      A().setOatAnchor(id, { ...v.anchor, at: now() });
      const an = M.rowAnchorOf({ established: null, oatAnchor: A().oatAnchorOf(id), since: check.since });
      A().setOatCheck(id, { state: 'confirmed', since: check.since, gen: check.gen, at: now(), fp: v.anchor.fp, via: 'owner-answer', on: 'window', anchorFp: an.fp, anchorWin: an.window });
      if (check.ask) resolveItem(id, check.ask.todoId, 'the owner confirmed the token is this account\'s');
      if (check.todoId) resolveItem(id, check.todoId, 'the owner confirmed the token is this account\'s');
      log(`[oat-identity] ${name}: the owner confirmed its long-lived token is ${name}'s — its window ${v.anchor.fp} is the row's anchor`);
      try { journal({ accountId: id, name, outcome: 'owner-answer', answer: 'mine', fp: v.anchor.fp }); } catch { }
      return { state: 'confirmed' };
    }
    const mark = { verdict: 'mismatch', via: 'owner-answer', on: 'owner', others: v.others, fp: check.ask && check.ask.win ? M.anchorFromProbe(check.ask.win)?.fp || null : null };
    const todoId = fileNotice(id, mark);
    A().setOatCheck(id, { state: 'mismatch', since: check.since, gen: check.gen, at: now(), fp: mark.fp, via: 'owner-answer', on: 'owner', why: 'the owner said the token is not this account\'s', others: v.others, todoId, ...(check.ask && check.ask.win ? { win: check.ask.win } : {}) });
    if (check.ask) resolveItem(id, check.ask.todoId, 'the owner answered: not this account\'s token');
    log(`[oat-identity] ${name}: the owner said its long-lived token is not ${name}'s — marked; the token is kept, the pool places nothing new where it would spend it`);
    try { journal({ accountId: id, name, outcome: 'owner-answer', answer: 'not-mine' }); } catch { }
    try { global.__vsEvent?.('oat-identity-mismatch', id); } catch { }
    return { state: 'mismatch' };
  }
  /** accounts' hook: a save / a removal / a move REPLACED the check that filed `prev.todoId` / `prev.ask` — the
   *  owner acted, so what it filed is resolved (only ours, only while still open: never an item the owner handled). */
  function checkReplaced(id, prev, why) {
    if (!prev) return false;
    const a = resolveItem(id, prev.todoId, why);
    const b = prev.ask ? resolveItem(id, prev.ask.todoId, why) : false;
    return a || b;
  }
  /** wire the store's hook (called once the account store exists — the account routes) */
  function attach() { try { A()._oatCheckHook = checkReplaced; return true; } catch { return false; } }
  /** 改绑: the owner moves `fromId`'s token to `toId` (accounts.moveOat — the sealed blob, never decrypted). */
  function rebind(fromId, toId) {
    const r = A().moveOat(fromId, toId);
    log(`[oat-identity] ${nameOf(fromId)}'s long-lived token re-bound to ${nameOf(toId)} by the owner — checked again there at its first reading`);
    try { journal({ accountId: toId, name: nameOf(toId), outcome: 'rebound', from: fromId, fromRow: nameOf(fromId) }); } catch { } // fromRow, never `fromName` (that key is the peer-text census's sender field)
    return r;
  }
  return { onReading, onReanchor, answer, checkReplaced, attach, rebind, INBOX_KEY };
}

module.exports = { create, INBOX_KEY };
