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
 *   · ask   ⇒ it is HELD (≤ 60 s) while ONE URGENT For-you card per machine per kind is up — exit-proxy's ask, its rules:
 *     the item and the ask are ONE state (the item leaving 'open' by any other door settles the ask as not allowed; a
 *     reopen of an ask that is over goes back to done), a store that refuses the item refuses the act NOW (`ask_unfiled`),
 *     a boot resolves the cards a previous process filed. A second act of the same key JOINS the card; the answer settles
 *     every act waiting on it. Answers (a person only — the cookie route): once | always (the machine's Hub automation
 *     list set to everyone, every kind: ONE switch — every card of that machine settles allowed) | deny.
 * The act's audit line carries the verdict (`ask`: allowed / always / denied / expired / unfiled / never / quiet) and who
 * answered (`answeredBy`: the person's sign-in handle).
 */
const crypto = require('crypto');
const P = require('../hub-act-policy.js');
const E = require('../exit-reach.js');
const DA = require('../device-acts.js');

const ACTION_TYPE = 'hub-act-ask';
const INBOX_KEY = 'machines'; // the tray's jump lands on Manage Agents → Machines (device-alerts' key)
const RECENT_MAX = 512, SETTLED_MAX = 256;

function namedError(code, message, extra = {}) { return Object.assign(new Error(message), { code, ...extra }); }

function create({ hosts, userTodos = null, log = () => {}, now = () => Date.now(), instanceKind = 'local', settingOf = () => undefined, setHubPolicy = null, nameOf = () => null,
  timers = { set: (fn, ms) => setTimeout(fn, ms), clear: (h) => clearTimeout(h) } } = {}) {
  const asks = new Map();    // askId → {askId, key, hostId, machine, kind, by, name, summary, askedAt, waiters, todoId, timer}
  const byKey = new Map();   // dedup key (machine + kind) → askId
  const recent = new Map();  // dedup key → {outcome: 'denied' | 'expired', at} — the quiet window of background subjects
  const settled = new Map(); // askId → 'settled' | 'expired' — a SECOND answer says which by name
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
    const kind = P.kindOf(key), dk = P.dedupKey(hostId, kind);
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
    if (v.verdict === 'allow') return Promise.resolve(null);
    if (v.verdict === 'deny') return Promise.resolve(refusal(v.code, v, hostId, { ask: AUDIT_OF[v.reason] || 'denied' }));
    return new Promise((resolve) => {
      const waiter = { resolve, payload };
      if (v.join) { const k = asks.get(byKey.get(v.dk)); if (k) { k.waiters.push(waiter); log(`${k.machine}: another ${k.kind} act by ${payload.by} joins the ask that is up (${k.waiters.length} waiting)`); return; } }
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
    const k = { askId, key: v.dk, hostId, machine, kind: v.kind, by, name, summary, askedAt, waiters: [waiter], todoId: null, timer: null };
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
    if (k.todoId && userTodos) {
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
      if (!it || !it.action || it.action.type !== ACTION_TYPE) return;
      const k = asks.get(String(it.action.askId || ''));
      if (status === 'open') { if (!k) { try { userTodos.setStatus(it.id, 'done', 'ask-over'); } catch { } } return; }
      if (!k || k.todoId !== it.id) return;
      settle(k, by === 'expired' ? 'expired' : 'denied', { why: by === 'expired' ? 'timeout' : `item-${String(status)}-by-${String(by || 'user')}` });
    });
  }
  /** Boot: a card a previous process filed can never be answered (the acts it held died with it) — resolved `expired`. */
  function reconcile() {
    if (!userTodos) return 0;
    let n = 0;
    try {
      const snap = userTodos.snapshot?.() || {};
      for (const it of snap.open || []) {
        if (it && it.action && it.action.type === ACTION_TYPE && !asks.has(it.action.askId)) { try { userTodos.setStatus(it.id, 'done', 'ask-expired'); n++; } catch { } }
      }
    } catch (e) { log(`hub-act ask reconcile failed: ${e.message}`); }
    return n;
  }
  /** A machine unpaired: its cards settle (nothing left to act on). */
  function onMachineGone(hostId) { for (const k of [...asks.values()]) if (k.hostId === hostId) settle(k, 'denied', { why: 'gone' }); }
  /** The owner changed a machine's list: re-judge every card of it (everyone ⇒ allowed; nobody ⇒ denied; ask ⇒ kept). */
  function onPolicyChanged(hostId) {
    if (writingFor === hostId) return; // an "always" answer settles them itself, naming who answered
    const pol = policyFor(hostId).policy;
    if (pol === 'ask') return;
    for (const k of [...asks.values()]) if (k.hostId === hostId) settle(k, pol === 'everyone' ? 'always' : 'denied', { why: 'policy' });
  }
  function list() { return [...asks.values()].map((k) => ({ askId: k.askId, hostId: k.hostId, machine: k.machine, kind: k.kind, by: k.by, summary: k.summary, waiting: k.waiters.length, askedAt: k.askedAt, expiresAt: k.askedAt + P.ASK_TTL_MS })); }
  return { check, verdict, answer, reconcile, onMachineGone, onPolicyChanged, policyFor, list, get instanceKind() { return kindNow(); }, ACTION_TYPE, INBOX_KEY };
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
  return asker;
}

module.exports = { create, wire, ACTION_TYPE, INBOX_KEY };
