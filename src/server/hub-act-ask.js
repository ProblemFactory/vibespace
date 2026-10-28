'use strict';
/**
 * THE ASK OF A HUB ACT (lane hub-act-ask, design q-042 §3 D4 the asking half, owner decision ② 2026-10-19) — the state and
 * the I/O around PURE src/hub-act-policy.js.
 *
 * Every remote machine's device client (src/hosts.js ssh, src/server/dial-pairing.js dial — never this machine's own daemon:
 * that is the hub itself) hands each act it is about to send to `check(hostId, payload)` at THE ONE SEND POINT
 * (src/agentd/client.js), BEFORE the send:
 *   · allow ⇒ it goes (its audit line unchanged);
 *   · deny  ⇒ it is refused by name (`hub_act_denied` / `ask_expired`), never sent, ONE audit line saying so;
 *   · ask   ⇒ it is HELD (≤ 60 s) while ONE URGENT For-you card per subject is up — exit-proxy's ask, its rules:
 *     the item and the ask are ONE state (the item leaving 'open' by any other door settles the ask as not allowed; a
 *     reopen of an ask that is over goes back to done), a store that refuses the item refuses the act NOW (`ask_unfiled`),
 *     a boot resolves the cards a previous process filed. A second act of the same SUBJECT (machine × kind × who asks —
 *     lane ledger-dedup-law r3: consent is per subject on every road) JOINS the card; the answer settles every act waiting
 *     on it and no other subject's. Answers (a person only — the cookie route): once | always (the machine's Hub automation
 *     list set to everyone, every kind and every asker: ONE switch — every card of that machine settles allowed) | deny.
 * The act's audit line carries the verdict (`ask`: allowed / always / denied / expired / unfiled / never / quiet / standing)
 * and who answered (`answeredBy`: the person's sign-in handle).
 *
 * THE STANDING ITEM (lane ledger-dedup-law F3, B-7f9e: 958 expired cards — 257 of them the usage harvest's — filled a fleet
 * owner's For-you list to its cap). A BACKGROUND SUBJECT — machine × kind × WHO asks (`by`: system:usage-harvest and
 * system:writer-sweep on one machine are two subjects, r2) — is ONE item, filed at its first ask and never expiring: its
 * words name ITS consequence (hub-act-policy `standingOf`), its first act is held the usual 60 s, and every later act of
 * that subject is refused AT ONCE (`ask_standing`, audit `standing`) and counted on its item in place (the count, the last
 * time; re-worded at most every STANDING_WRITE_MS) — never a card every QUIET_MS. Its answers: Allow once (THAT subject's
 * NEXT act goes — no other act — then it asks again) · Always on this machine (the list) · Deny (refused, counted no
 * more). Closed by its ✓ (seen): refused quietly, back after STANDING_REMIND_MS if still refused. It CLOSES by itself (r2)
 * when its subject's next act is allowed by any road, when the machine's list or the instance-wide setting allows it, and
 * after STANDING_SILENT_MS without an act («no longer asked»); a boot re-judges each open one (`reevaluate`), never
 * restoring one blindly. r3: a background subject never JOINS a person's or an agent's card (its act waits on its own
 * item) — no card's answer reaches another subject; a DENY holds until the owner allows that subject (its item reopened
 * and allowed, the machine's list, the instance-wide setting) — through the quiet window, the week of silence and a
 * restart (the item's `resolvedFact.denied` is read back at boot).
 * r5: A DENY IS READABLE BEFORE THE FIRST ACT — the device agent's update ask fires at every daemon hello after a hub update,
 * i.e. always inside the 3 s before the boot reconcile, and r3 read the Deny back only there: the act re-filed the item,
 * the store REOPENED it (the same ask id and words) and the reconcile then skipped it — held 60 s, `ask_expired`, the Deny
 * lost. Now the standing subjects (open and denied) are read from the item store when the asker is CONSTRUCTED (a bounded
 * read of the store it holds, synchronous); `check()` consults the stored decision of a subject it holds no entry for; and
 * the store never reopens a decided item (src/user-todos.js: `resolvedFact.decidedBy: 'person'` — decided is final, a
 * re-ask after a Deny is refused by the Deny, never a new filing).
 * r8: THE STANDING ITEM IS NOT A DECISION ROW — it files with its OWN action.type (`hub-act-standing`; the 60 s cards stay
 * `hub-act-ask`): a decision row (lane wake-approve-card's registry — a person's two verbs end it, nothing else) is a
 * card whose answer is final; the standing item is a subject's standing state — counted in place, closed by its ✓
 * (seen), by itself (no longer asked, allowed by another road) and reopened while still refused — so the decision-row
 * law never applies to it, and a re-file after the owner's Deny meets the Deny (`decided`), never a second item.
 */
const crypto = require('crypto');
const P = require('../hub-act-policy.js');
const E = require('../exit-reach.js');
const DA = require('../device-acts.js');

const ACTION_TYPE = 'hub-act-ask';
const STANDING_TYPE = 'hub-act-standing'; // r8: a background subject's ONE standing item (never a card — no decision row)
const INBOX_KEY = 'machines'; // the tray's jump lands on Manage Agents → Machines (device-alerts' key)
const RECENT_MAX = 512, SETTLED_MAX = 256;
const STANDING_WRITE_MS = 60e3;            // a standing item's count is re-worded at most this often (the exact count lives here)
const STANDING_REMIND_MS = 24 * 3600e3;    // an item the owner closed with its ✓ comes back after this, if still refused
const STANDING_SILENT_MS = 7 * 24 * 3600e3; // r2: a subject with no act for this long is no longer asking — its item closes
const STANDING_SWEEP_MS = 10 * 60e3;       // r2: how often the server re-judges the standing items (the setting has no event)
/** A standing item's ask id — one per SUBJECT (machine × kind × by), the same across restarts (the item it names is found again). */
const standingIdOf = (dk) => crypto.createHash('sha256').update('hub-act-standing\n' + dk).digest('hex').slice(0, 32);

function namedError(code, message, extra = {}) { return Object.assign(new Error(message), { code, ...extra }); }

function create({ hosts, userTodos = null, log = () => {}, now = () => Date.now(), instanceKind = 'local', settingOf = () => undefined, setHubPolicy = null, nameOf = () => null,
  timers = { set: (fn, ms) => setTimeout(fn, ms), clear: (h) => clearTimeout(h) } } = {}) {
  const asks = new Map();    // askId → {askId, key, hostId, machine, kind, by, name, summary, askedAt, waiters, todoId, timer}
  const byKey = new Map();   // subject key (machine × kind × who asks — hub-act-policy subjectKey) → askId
  const recent = new Map();  // subject key → {outcome: 'denied' | 'expired', at} — the quiet window of background subjects
  const settled = new Map(); // askId → 'settled' | 'expired' — a SECOND answer says which by name
  // subject key → {askId, dk, hostId, machine, kind, by, consequence, count, firstAt, lastAt, todoId, state: open | once |
  // denied | seen, seenAt, answeredBy, writtenAt, timer} — lane ledger-dedup-law F3's standing subjects
  const standing = new Map();
  let selfClosing = false; // our own resolution of a standing item (its onStatus is ours, not the owner's ✓)
  // the instance's kind, judged at each act (a function: the shared presets folder is installed later in the boot)
  const kindNow = () => { let k = instanceKind; try { if (typeof k === 'function') k = k(); } catch { k = 'local'; } return P.INSTANCE_KINDS.includes(k) ? k : 'local'; };
  let writingFor = null; // the machine whose list an "always" answer is writing (its cards settle with who answered)

  const rawOf = (hostId) => { try { return hosts.get(hostId); } catch { return null; } };
  const machineOf = (hostId) => { const h = rawOf(hostId); return (h && (h.name || h.id)) || String(hostId); };
  /** The machine's stored 「Hub 自动化」 list: a mode, null (not set — the default applies) or 'unknown' (unreadable). */
  function machinePolicyOf(hostId) {
    const a = E.exitAccessOf(rawOf(hostId));
    if (a.mode === 'unknown') return 'unknown';
    return a.hub && P.POLICIES.includes(a.hub.mode) ? a.hub.mode : null;
  }
  const settingNow = () => { try { const v = settingOf(P.SETTING_KEY); return P.SETTING_VALUES.includes(v) ? v : 'auto'; } catch { return 'auto'; } };
  /** The policy that applies to a machine now (the dialog's view): {policy, source, stored, instanceKind, setting}. */
  function policyFor(hostId) {
    const stored = machinePolicyOf(hostId);
    const k = kindNow();
    return { ...P.policyOf({ machinePolicy: stored, instanceKind: k, setting: settingNow() }), stored, instanceKind: k, setting: settingNow() };
  }
  /** THE VERDICT (sync) of one payload on one machine. */
  function verdict(hostId, payload, { consent = false } = {}) {
    const key = DA.keyOf(payload);
    const kind = P.kindOf(key), by = payload && payload.by;
    // lane ledger-dedup-law r2 + r3: EVERY card, hold, quiet window, count and standing item is its SUBJECT's own (machine ×
    // kind × who asks) — an act joins only a card of its own subject, so no answer settles another subject's act (r3: a
    // background act joined an agent's card and went on the owner's Allow of the AGENT, its own Deny notwithstanding)
    const dk = P.subjectKey(hostId, kind, by);
    return { ...P.askVerdict({ instanceKind: kindNow(), by: payload && payload.by, layer: DA.layerOf(payload), key, machinePolicy: machinePolicyOf(hostId), setting: settingNow(), consent: !!consent, pending: byKey.has(dk), recent: recent.get(dk) || null, now: now() }), dk };
  }
  const refusal = (code, v, hostId, extra = {}) => ({ ok: false, code, error: P.refusalText(code, { machine: machineOf(hostId), kind: v.kind, reason: v.reason, until: v.until, error: extra.error }), ...extra });
  const AUDIT_OF = { nobody: 'never', quiet: 'quiet' };

  /**
   * THE GATE of one act (the client awaits it before the send) → null (it goes, nothing asked) | {ok: true, ask, answeredBy}
   * (it was asked and allowed) | {ok: false, code, error, ask, answeredBy?} (refused — never sent).
   */
  function check(hostId, payload, { consent = false } = {}) {
    const v = verdict(hostId, payload, { consent });
    if (v.verdict === 'allow') {
      // r2: the subject's act is allowed by a road of its own (the machine's list, the setting, consent) — its standing item ends
      const st = standing.get(v.dk);
      if (st) endStanding(st, 'allowed', `its act was allowed (${v.reason})`);
      return Promise.resolve(null);
    }
    // lane ledger-dedup-law F3: a BACKGROUND subject on an asking machine × kind is its ONE standing item — no card per act
    if (userTodos && P.background(P.byKindOf(payload && payload.by)) && (v.verdict === 'ask' || v.reason === 'quiet')) {
      const st = standing.get(v.dk) || storedSubject(v.dk); // r5: no entry ⇒ the store's decision for this subject, if any
      if (st && st.state === 'once') { standing.delete(v.dk); log(`${st.machine}: ${payload.by}'s ${st.kind} act goes — the user allowed it once`); return Promise.resolve({ ok: true, ask: 'allowed', ...(st.answeredBy ? { answeredBy: st.answeredBy } : {}) }); }
      if (st && !v.join) { bump(st, payload); return Promise.resolve(st.state === 'denied' ? refusal('hub_act_denied', { ...v, reason: '' }, hostId, { ask: 'denied' }) : refusal('ask_standing', v, hostId, { ask: 'standing' })); }
    }
    if (v.verdict === 'deny') return Promise.resolve(refusal(v.code, v, hostId, { ask: AUDIT_OF[v.reason] || 'denied' }));
    return new Promise((resolve) => {
      const waiter = { resolve, payload };
      if (v.join) { const k = asks.get(byKey.get(v.dk)); if (k) { k.waiters.push(waiter); log(`${k.machine}: another ${k.kind} act by ${payload.by} joins its ask that is up (${k.waiters.length} waiting)`); return; } }
      open(hostId, v, payload, waiter);
    });
  }
  function open(hostId, v, payload, waiter) {
    const askId = crypto.randomBytes(16).toString('hex');
    const machine = machineOf(hostId);
    const by = String(payload.by);
    let name = null; try { name = P.byKindOf(by) === 'agent' ? nameOf(by) : null; } catch { }
    const summary = DA.summaryOf(payload);
    const askedAt = now();
    const k = { askId, key: v.dk, hostId, machine, kind: v.kind, by, name, summary, askedAt, waiters: [waiter], todoId: null, timer: null, standing: null };
    if (userTodos && P.background(P.byKindOf(by))) {
      // lane ledger-dedup-law F3: the subject's ONE standing item — filed now (no end), the act held the usual 60 s
      let st = standing.get(v.dk);
      if (!st) { st = { askId: standingIdOf(v.dk), dk: v.dk, hostId, machine, kind: v.kind, by, consequence: P.consequenceOf(by, v.kind), count: 0, firstAt: askedAt, lastAt: askedAt, todoId: null, state: 'open', seenAt: 0, answeredBy: null, writtenAt: 0, timer: null, summary }; standing.set(v.dk, st); }
      st.state = 'open'; st.summary = summary;
      k.askId = st.askId; k.standing = st;
      asks.set(k.askId, k); byKey.set(v.dk, k.askId);
      const wrote = writeStanding(st, { force: true, held: true });
      if (wrote === 'decided') { // r5: the store holds the owner's Deny of this subject — final: refused by it, nothing filed
        asks.delete(k.askId); byKey.delete(v.dk); st.state = 'denied';
        waiter.resolve(refusal('hub_act_denied', { ...v, reason: '' }, hostId, { ask: 'denied', ...(st.answeredBy ? { answeredBy: st.answeredBy } : {}) }));
        return;
      }
      if (!wrote) {
        asks.delete(k.askId); byKey.delete(v.dk); standing.delete(v.dk);
        waiter.resolve(refusal('ask_unfiled', v, hostId, { ask: 'unfiled', error: st.fileError || 'For you refused it' }));
        return;
      }
      k.todoId = st.todoId;
      log(`${machine}: ${by} asks to ${P.KIND_WORDS[v.kind]} (${summary}) — held until the user answers (≤ 60 s); its standing item counts every later refusal`);
      k.timer = timers.set(() => settle(k, 'expired', { why: 'timeout' }), P.ASK_TTL_MS);
      k.timer?.unref?.();
      return;
    }
    asks.set(askId, k); byKey.set(v.dk, askId);
    if (userTodos) {
      const w = P.cardOf({ by, name, machine, kind: v.kind, summary });
      try {
        const it = userTodos.add(INBOX_KEY, {
          origin: 'machines', text: w.text, detail: w.detail, i18n: w.i18n, urgency: 'urgent', kind: 'action', by: 'agent', sessionName: 'Machines',
          expiresAt: askedAt + P.ASK_TTL_MS,
          action: { type: 'hub-act-ask', askId, hostId: String(hostId).slice(0, 160), machine: String(machine).slice(0, 80), kind: v.kind },
        });
        k.todoId = it && it.id;
      } catch (e) {
        // the store refused the item: an ask nobody can see must not hold the act 60 s — refused NOW
        log(`${machine}: the ask to ${P.KIND_WORDS[v.kind]} could not be filed in For you: ${e.message}`);
        asks.delete(askId); byKey.delete(v.dk);
        waiter.resolve(refusal('ask_unfiled', v, hostId, { ask: 'unfiled', error: e.message }));
        return;
      }
    }
    log(`${machine}: ${by} asks to ${P.KIND_WORDS[v.kind]} (${summary}) — held until the user answers (≤ 60 s)`);
    k.timer = timers.set(() => settle(k, 'expired', { why: 'timeout' }), P.ASK_TTL_MS);
    k.timer?.unref?.();
  }
  /** Settle one card: every waiting act gets the outcome; the item is resolved by it; the quiet window noted. */
  function settle(k, outcome, { answeredBy = null, why = outcome } = {}) {
    if (!asks.has(k.askId)) return false;
    asks.delete(k.askId);
    if (byKey.get(k.key) === k.askId) byKey.delete(k.key);
    settled.set(k.askId, outcome === 'expired' ? 'expired' : 'settled');
    while (settled.size > SETTLED_MAX) settled.delete(settled.keys().next().value);
    try { timers.clear(k.timer); } catch { }
    if (outcome === 'denied' || outcome === 'expired') {
      recent.set(k.key, { outcome, at: now() });
      while (recent.size > RECENT_MAX) recent.delete(recent.keys().next().value);
    } else recent.delete(k.key);
    if (k.standing) {
      // lane ledger-dedup-law F3: the hold ends; the ITEM stands unless the answer (or the machine / its list) ended the subject
      const st = k.standing;
      if (outcome === 'expired') { st.count += k.waiters.length; st.lastAt = now(); writeStanding(st, { force: true }); }
      else if (outcome === 'denied' && String(why).startsWith('item-')) { st.count += k.waiters.length; st.lastAt = now(); st.state = 'seen'; st.seenAt = now(); }
      else if (outcome === 'denied' && why === 'answered') { st.count += k.waiters.length; st.lastAt = now(); st.state = 'denied'; closeStanding(st, 'denied', { denied: true, by: answeredBy || 'user', decidedBy: 'person' }); }
      else { closeStanding(st, outcome === 'denied' ? (why === 'gone' ? 'ask-over' : 'denied') : outcome); standing.delete(st.dk); }
    } else if (k.todoId && userTodos) {
      try { const it = userTodos.get?.(k.todoId); if (it && it.status === 'open') userTodos.setStatus(k.todoId, 'done', outcome === 'expired' ? 'ask-expired' : why === 'gone' ? 'ask-over' : outcome); } catch { }
    }
    const allowed = outcome === 'allowed' || outcome === 'always';
    log(`${k.machine}: the ask to ${P.KIND_WORDS[k.kind]} ${allowed ? 'was allowed' : outcome === 'expired' ? 'got no answer in 60 s' : 'was denied'}${answeredBy ? ` by ${answeredBy}` : ''} — ${k.waiters.length} act(s) ${allowed ? 'go' : 'refused'}`);
    const v = { kind: k.kind, reason: '' };
    for (const w of k.waiters) {
      try {
        w.resolve(allowed ? { ok: true, ask: outcome, ...(answeredBy ? { answeredBy } : {}) }
          : refusal(outcome === 'expired' ? 'ask_expired' : 'hub_act_denied', v, k.hostId, { ask: outcome === 'expired' ? 'expired' : 'denied', ...(answeredBy ? { answeredBy } : {}) }));
      } catch { }
    }
    return true;
  }
  /** POST /api/hub-acts/asks/:askId — a PERSON's answer (`by: 'user'`: the cookie route refuses a bearer first). */
  async function answer(askId, { answer: a, by, answeredBy = null } = {}) {
    const id = String(askId || '');
    const k = asks.get(id);
    const st = k ? null : [...standing.values()].find((x) => x.askId === id) || null;
    if (st) {
      // lane ledger-dedup-law F3: a standing item with no act held — the answer applies to the subject's NEXT act
      if (by !== 'user') throw namedError('human_only', 'only the user answers this — an agent cannot approve a hub act');
      if (!P.ANSWERS.includes(a)) throw namedError('bad_answer', 'answer is once, always or deny');
      if (st.state !== 'open' && st.state !== 'seen') throw namedError('ask_settled', 'already answered');
      if (a === 'always') {
        if (typeof setHubPolicy !== 'function') throw namedError('no_policy_writer', 'this server cannot change the machine\'s list');
        writingFor = st.hostId;
        try { await setHubPolicy(st.hostId, 'everyone', { by: answeredBy || 'user' }); } finally { writingFor = null; }
        for (const o of [...asks.values()]) if (o.hostId === st.hostId) settle(o, 'always', { answeredBy, why: 'answered' });
        for (const o of [...standing.values()]) if (o.hostId === st.hostId) { closeStanding(o, 'always'); standing.delete(o.dk); }
        return { ok: true, state: 'always', machine: st.machine };
      }
      if (a === 'once') { st.state = 'once'; st.answeredBy = answeredBy; recent.delete(st.dk); closeStanding(st, 'allowed'); log(`${st.machine}: ${st.by}'s next ${st.kind} act may go (allowed once${answeredBy ? ` by ${answeredBy}` : ''})`); return { ok: true, state: 'allowed', machine: st.machine }; }
      st.state = 'denied'; closeStanding(st, 'denied', { denied: true, by: answeredBy || 'user', decidedBy: 'person' });
      return { ok: true, state: 'denied', machine: st.machine };
    }
    // answered before ⇒ ask_settled; refused after 60 s ⇒ ask_expired; never heard of (a guessed id, one from before a
    // restart) ⇒ ask_unknown — exit-proxy's three answers
    if (!k && by === 'user' && !settled.has(id)) throw namedError('ask_unknown', 'that request is gone');
    const v = P.answerVerdict(k ? { askedAt: k.askedAt } : { askedAt: 0, settled: settled.get(id) }, { answer: a, by, now: now() });
    if (!v.ok) {
      if (k && v.code === 'ask_expired') settle(k, 'expired', { why: 'timeout' });
      throw namedError(v.code, v.error || v.code);
    }
    if (v.answer === 'always') {
      // ONE switch: the machine's Hub automation list → everyone (every kind) — written FIRST; a write that fails allows nothing
      if (typeof setHubPolicy !== 'function') throw namedError('no_policy_writer', 'this server cannot change the machine\'s list');
      writingFor = k.hostId;
      try { await setHubPolicy(k.hostId, 'everyone', { by: answeredBy || 'user' }); } finally { writingFor = null; }
      for (const o of [...asks.values()]) if (o.hostId === k.hostId) settle(o, 'always', { answeredBy, why: 'answered' });
      for (const o of [...standing.values()]) if (o.hostId === k.hostId) { closeStanding(o, 'always'); standing.delete(o.dk); } // lane ledger-dedup-law: its standing items too
      return { ok: true, state: 'always', machine: k.machine };
    }
    settle(k, v.answer === 'once' ? 'allowed' : 'denied', { answeredBy, why: 'answered' });
    return { ok: true, state: v.answer === 'once' ? 'allowed' : 'denied', machine: k.machine };
  }
  // THE ITEM AND THE ASK ARE ONE STATE (exit-proxy verify-r2 ask-b): the item leaving 'open' by any door but our own answer
  // (its ✓, Mark all seen, the store's expiry sweep) settles the ask as NOT allowed; a reopen of an ask that is over goes
  // straight back to done (verify-r6 W2)
  if (userTodos && typeof userTodos.onStatus === 'function') {
    userTodos.onStatus((it, { status, by }) => {
      if (!it || !it.action || (it.action.type !== ACTION_TYPE && it.action.type !== STANDING_TYPE)) return;
      if (it.action.type === STANDING_TYPE) {
        // lane ledger-dedup-law F3: the owner closed (or reopened) a standing item — never our own resolution
        if (selfClosing) return;
        const st = [...standing.values()].find((x) => x.askId === it.action.askId);
        const k = asks.get(String(it.action.askId || ''));
        if (status === 'open') { if (st) { st.state = 'open'; st.todoId = it.id; } return; }
        if (k) { settle(k, by === 'expired' ? 'expired' : 'denied', { why: `item-${String(status)}-by-${String(by || 'user')}` }); return; }
        if (st && st.state === 'open') { st.state = 'seen'; st.seenAt = now(); }
        return;
      }
      const k = asks.get(String(it.action.askId || ''));
      if (status === 'open') { if (!k) { try { userTodos.setStatus(it.id, 'done', 'ask-over'); } catch { } } return; }
      if (!k || k.todoId !== it.id) return;
      settle(k, by === 'expired' ? 'expired' : 'denied', { why: by === 'expired' ? 'timeout' : `item-${String(status)}-by-${String(by || 'user')}` });
    });
  }
  // ── r5: THE STORED DECISION — the standing subjects the item store holds, read at CONSTRUCTION (below) ──
  /** A standing item the owner DENIED (its resolvedFact says so, and nothing re-stamped it since) — r3's rule. */
  const deniedItem = (i) => i && i.status !== 'open' && !i.clearedAt && i.resolvedBy === 'denied' && i.resolvedFact && i.resolvedFact.denied === true && i.action && i.action.type === STANDING_TYPE;
  const openItem = (i) => i && i.status === 'open' && !i.clearedAt && i.action && i.action.type === STANDING_TYPE;
  /** One stored standing item → its subject's entry again (open: counting; denied: refused at once) | null (not one). */
  function restoreItem(it) {
    const a = it && it.action;
    if (!a || !a.hostId || !P.KINDS.includes(a.kind) || !(P.byKindOf(a.by) && P.background(P.byKindOf(a.by)))) return null;
    const dk = P.subjectKey(a.hostId, a.kind, a.by);
    if (standing.has(dk)) return standing.get(dk);
    const denied = deniedItem(it);
    const st = { askId: a.askId, dk, hostId: a.hostId, machine: a.machine || a.hostId, kind: a.kind, by: a.by, consequence: a.consequence || null, count: Number(a.count) || 1, firstAt: Number(a.firstAt) || now(), lastAt: Number(a.lastAt) || now(), todoId: it.id, state: denied ? 'denied' : 'open', seenAt: 0, answeredBy: denied ? it.resolvedFact.by || null : null, writtenAt: now(), timer: null, summary: '' };
    standing.set(dk, st);
    return st;
  }
  /** The standing subjects of the store, open and denied (a bounded read: the store's own items, its cap) → how many. */
  function restoreStanding() {
    if (!userTodos || typeof userTodos.idsWhere !== 'function') return 0;
    let n = 0;
    for (const id of userTodos.idsWhere((i) => openItem(i) || deniedItem(i))) if (restoreItem(userTodos.get?.(id))) n++;
    return n;
  }
  /** `check()`'s look-up for a subject it holds no entry for: the store's own item of it (the subject's ask id), open or
   *  denied → its entry | null. */
  function storedSubject(dk) {
    if (!userTodos || typeof userTodos.idsWhere !== 'function') return null;
    const askId = standingIdOf(dk);
    const id = userTodos.idsWhere((i) => i.action && i.action.askId === askId && (openItem(i) || deniedItem(i)))[0];
    return id ? restoreItem(userTodos.get?.(id)) : null;
  }
  /** Boot: a card a previous process filed can never be answered (the acts it held died with it) — resolved `expired`. */
  function reconcile() {
    if (!userTodos) return 0;
    let n = 0;
    try {
      const snap = userTodos.snapshot?.() || {};
      for (const it of snap.open || []) {
        if (!it || !it.action || (it.action.type !== ACTION_TYPE && it.action.type !== STANDING_TYPE) || asks.has(it.action.askId)) continue;
        if (it.action.type === STANDING_TYPE && it.action.hostId && P.KINDS.includes(it.action.kind)) {
          // lane ledger-dedup-law F3: a standing item from before the restart is its subject's again (no new card for the
          // next life) — r2: then RE-JUDGED below (the list, the setting, the machine, the silence), never kept blindly;
          // r5: read already at construction — the subject's entry names THIS item, any other one of it is a second
          const by = P.byKindOf(it.action.by) && P.background(P.byKindOf(it.action.by)) ? it.action.by : null;
          if (!by) { selfClose(it.id, 'ask-over'); continue; } // a subject nobody can name (an item older than r2's key)
          const st = restoreItem(it);
          if (st && st.todoId !== it.id) selfClose(it.id, 'ask-over'); // a second item of one subject: the first one stands
          continue;
        }
        try { userTodos.setStatus(it.id, 'done', 'ask-expired'); n++; } catch { }
      }
      // r3: A DENY HOLDS ACROSS A RESTART — a standing item the owner DENIED (its resolvedFact says so) is its subject's
      // denied state again: refused at once, never re-asked (the item reopened) by the next life (r5: read at construction
      // too, so the acts before this reconcile meet it)
      restoreStanding();
      reevaluate();
    } catch (e) { log(`hub-act ask reconcile failed: ${e.message}`); }
    return n;
  }
  /** r2: RE-JUDGE every standing subject — the machine gone ⇒ closed (ask-over); its list or the instance-wide setting now
   *  allows ⇒ closed (always); refuses ⇒ closed (denied); no act for STANDING_SILENT_MS ⇒ closed, «no longer asked».
   *  r3: a subject the owner DENIED ends only when the machine is gone or the list / the setting allows it — never by the
   *  silence or a Never (the Deny holds until the owner allows that subject).
   *  At boot (reconcile), every STANDING_SWEEP_MS (wire), and by a suite. → how many it closed. */
  function reevaluate() {
    let n = 0;
    for (const st of [...standing.values()]) {
      if (st.state === 'once' || byKey.has(st.dk)) continue; // an Allow once waits for its subject's next act; a hold in flight settles first
      if (!rawOf(st.hostId)) { endStanding(st, 'ask-over', 'its machine is gone'); n++; continue; }
      const pol = policyFor(st.hostId).policy;
      if (pol === 'everyone') { endStanding(st, 'always', `${st.machine}'s Hub automation allows it now`); n++; continue; }
      if (st.state === 'denied') continue;
      if (pol === 'nobody') { endStanding(st, 'denied', `${st.machine}'s Hub automation refuses it now`); n++; continue; }
      if (now() - (Number(st.lastAt) || 0) >= STANDING_SILENT_MS) { endStanding(st, 'no-longer-asked', `no act for ${Math.round(STANDING_SILENT_MS / 86400e3)} days — no longer asked`); n++; }
    }
    return n;
  }
  /** r2: a standing subject is over — its item closed (`outcome` = the item's resolvedBy) and the subject forgotten (its
   *  next act asks afresh); one line says why. */
  function endStanding(st, outcome, why) {
    closeStanding(st, outcome);
    st.state = 'ended'; // a hold still in flight never re-files it
    standing.delete(st.dk);
    recent.delete(st.dk);
    log(`${st.machine}: ${st.by}'s standing ${st.kind} item closed — ${why}`);
  }
  function selfClose(id, outcome) { selfClosing = true; try { userTodos.setStatus(id, 'done', outcome); } catch { } finally { selfClosing = false; } }
  /** A machine unpaired: its cards settle (nothing left to act on). */
  function onMachineGone(hostId) {
    for (const k of [...asks.values()]) if (k.hostId === hostId) settle(k, 'denied', { why: 'gone' });
    for (const st of [...standing.values()]) if (st.hostId === hostId) { closeStanding(st, 'ask-over'); standing.delete(st.dk); }
  }
  /** The owner changed a machine's list: re-judge every card of it (everyone ⇒ allowed; nobody ⇒ denied; ask ⇒ kept). */
  function onPolicyChanged(hostId) {
    if (writingFor === hostId) return; // an "always" answer settles them itself, naming who answered
    const pol = policyFor(hostId).policy;
    if (pol === 'ask') return;
    for (const k of [...asks.values()]) if (k.hostId === hostId) settle(k, pol === 'everyone' ? 'always' : 'denied', { why: 'policy' });
    // r3: a Never keeps a subject the owner denied denied (its Deny holds until the owner allows it)
    for (const st of [...standing.values()]) if (st.hostId === hostId && !(pol === 'nobody' && st.state === 'denied')) { closeStanding(st, pol === 'everyone' ? 'always' : 'denied'); standing.delete(st.dk); }
  }
  // ── lane ledger-dedup-law F3: the standing item's own doors ──
  /** One more refusal of a standing subject: counted (exactly, here), re-worded on its item at most every STANDING_WRITE_MS;
   *  an item the owner closed with its ✓ comes back after STANDING_REMIND_MS; a denied subject is only counted. */
  function bump(st, payload) {
    st.count++; st.lastAt = now();
    try { st.summary = DA.summaryOf(payload); } catch { }
    if (st.state === 'seen' && now() - st.seenAt >= STANDING_REMIND_MS) { st.state = 'open'; writeStanding(st, { force: true }); return; }
    if (st.state === 'open') writeStanding(st);
  }
  /** File / re-word a standing item (one per subject: the same text + ask id ⇒ the same item, reopened if it was
   *  closed). → true when the store took it. Throttled unless `force`: a later write is scheduled instead. */
  function writeStanding(st, { force = false, held = false } = {}) {
    if (!userTodos || st.state !== 'open') return false;
    const t = now();
    if (!force && t - st.writtenAt < STANDING_WRITE_MS) {
      if (!st.timer) { st.timer = timers.set(() => { st.timer = null; writeStanding(st, { force: true }); }, STANDING_WRITE_MS - (t - st.writtenAt)); st.timer?.unref?.(); }
      return true;
    }
    if (st.timer) { try { timers.clear(st.timer); } catch { } st.timer = null; }
    const w = P.standingOf({ by: st.by, machine: st.machine, kind: st.kind, count: held ? Math.max(1, st.count + 1) : Math.max(1, st.count), lastAt: st.lastAt, consequence: st.consequence, summary: st.summary || '' });
    st.consequence = w.consequence;
    try {
      const it = userTodos.add(INBOX_KEY, {
        origin: 'machines', text: w.text, detail: w.detail, i18n: w.i18n, urgency: 'high', kind: 'action', by: 'agent', sessionName: 'Machines',
        action: { type: STANDING_TYPE, askId: st.askId, hostId: String(st.hostId).slice(0, 160), machine: String(st.machine).slice(0, 80), kind: st.kind, standing: true, by: String(st.by).slice(0, 160), consequence: st.consequence, count: st.count, firstAt: st.firstAt, lastAt: st.lastAt },
      });
      st.todoId = (it && it.id) || st.todoId; st.writtenAt = t; st.fileError = null;
      if (it && it.decided) return 'decided'; // r5: the store never reopens a decided item — the Deny stands
      return true;
    } catch (e) { st.fileError = e.message; log(`${st.machine}: the standing item could not be filed in For you: ${e.message}`); return false; }
  }
  /** Our own resolution of a standing item (an answer, the machine's list, the machine gone). r3: the item's
   *  `resolvedFact.denied` says whether the OWNER denied it (read back at boot — `fact` is given by the Deny alone; every
   *  other close of ours writes `denied: false`); a denied subject closed again by a road that allows it (the list, the
   *  setting) or ends it (the machine gone) has that said on its item, so no next life restores the Deny. */
  function closeStanding(st, outcome, fact = null) {
    if (st.timer) { try { timers.clear(st.timer); } catch { } st.timer = null; }
    if (!st.todoId || !userTodos) return;
    selfClosing = true;
    try {
      const it = userTodos.get?.(st.todoId);
      if (it && it.status === 'open') { if (typeof userTodos.resolveAnswered === 'function') userTodos.resolveAnswered([st.todoId], outcome, fact || { denied: false }); else userTodos.setStatus(st.todoId, 'done', outcome); }
      else if (it && !fact && outcome !== 'denied' && it.resolvedBy === 'denied') userTodos.setStatus(st.todoId, it.status, outcome); // the Deny is over
    } catch { } finally { selfClosing = false; }
  }
  /** The standing subjects (a suite; the dialog): machine, kind, who, how many refusals, the last, the state. */
  function standingList() { return [...standing.values()].map((st) => ({ askId: st.askId, hostId: st.hostId, machine: st.machine, kind: st.kind, by: st.by, count: st.count, lastAt: st.lastAt, state: st.state, todoId: st.todoId })); }
  function list() { return [...asks.values()].map((k) => ({ askId: k.askId, hostId: k.hostId, machine: k.machine, kind: k.kind, by: k.by, summary: k.summary, waiting: k.waiters.length, askedAt: k.askedAt, expiresAt: k.askedAt + P.ASK_TTL_MS })); }
  // r5: the stored decisions are readable BEFORE the first act — never only 3 s later, at the boot reconcile
  try { restoreStanding(); } catch (e) { log(`hub-act asks could not read the stored decisions: ${e.message}`); }
  return { check, verdict, answer, reconcile, reevaluate, onMachineGone, onPolicyChanged, policyFor, list, standingList, get instanceKind() { return kindNow(); }, ACTION_TYPE, STANDING_TYPE, INBOX_KEY };
}

/**
 * server.js's ONE line: the asker on `hosts.hubActs` (every remote device client reaches it through hosts.actGateFor), the
 * instance's kind (a fleet pod: VIBESPACE_INSTANCE_NAME or the shared presets folder), the machine list's writer (exit-proxy's
 * PATCH — the dialog's own door, its audit line), an agent's conversation name, and the boot reconcile.
 */
function wire({ hosts, userTodos, exitProxy, settingOf, activeSessions, env = process.env, log = (m) => console.log('[hub-acts]', m) } = {}) {
  const presetsDir = () => { try { return require('./cluster-presets.js').sharedPresets().dir || null; } catch { return null; } };
  const R = require('../window-reach.js');
  const asker = create({
    hosts, userTodos, log, settingOf, instanceKind: () => P.instanceKindOf(env, { presetsDir: presetsDir() }),
    setHubPolicy: (hostId, mode) => exitProxy.setAccess(hostId, { hub: { mode } }, { by: 'user' }),
    nameOf: (by) => {
      const key = String(by).slice('agent:'.length);
      for (const [id, s] of activeSessions) { try { if (R.callerKeys(s, id).includes(key)) return s.name || s.webuiName || null; } catch { } }
      return null;
    },
  });
  hosts.hubActs = asker;
  setTimeout(() => { try { const n = asker.reconcile(); if (n) log(`${n} hub-act ask(s) from before the restart resolved expired`); } catch { } }, 3000).unref?.();
  setInterval(() => { try { asker.reevaluate(); } catch { } }, STANDING_SWEEP_MS).unref?.(); // r2: the instance-wide setting has no change event
  return asker;
}

module.exports = { create, wire, ACTION_TYPE, STANDING_TYPE, INBOX_KEY, STANDING_WRITE_MS, STANDING_REMIND_MS, STANDING_SILENT_MS, STANDING_SWEEP_MS, standingIdOf };
