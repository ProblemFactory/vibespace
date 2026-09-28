'use strict';
/**
 * A LIVE SESSION'S BROWSER KEY — decided at SPAWN, or on FIRST USE (B-f7ab, 2026-09-27) — ORCH.
 *
 * WHY THIS FILE EXISTS. A conversation's browser key (`bk-<8 hex>`, docs/design-agent-browser-v2.zh.md §3.2.1) is
 * minted by ws-create at SPAWN and bound to its conversation in data/browser-env/bindings.json at the ONE meta choke
 * point (session-stdout.writeSessionMeta → browser-bindings.js). A session that started before the feature, or while
 * `browser.isolateSessions` was off, never got one — and every browser route answered it `409 bad-request: "this
 * session has no browser key (browser isolation is off, or it predates the feature) — it cannot hold a profile"`.
 * The owner's 2026-09-17 chat read exactly that from `vibespace-browser status` / `open`, tried the old CLI name, was
 * refused by the shim (correct) and parked itself waiting for a human, although nothing needed a human: the CLI
 * builds its child environment from the `/resolve` answer (the session's recorded pairs, the NAMED config, the
 * keeper's socket root — browser-verbs `childEnv`), so a key minted LATE works for the process that is already running.
 *
 * ONE PATH, TWO MOMENTS. `mintKey` is THE mint and `applyKey` THE session fields a key brings — ws-create's spawn and
 * `ensureBrowserKey` (a live session's first use) both call them, over the same PURE ladder (`B.browserKeyFor`), the
 * same browser-env composition (`envFor`: the generated config / scratch dir + pin symlink / socket dir), the same pin
 * ladder (`keeper.pinForCreate`: the conversation's pin > the Task Group default > the instance default — a DEFAULT
 * pin dated when the session STARTED, `B.latePinAt`: a pin is an authorization and must not be fresher than the session
 * it stands in for, verify r1) and the same cap stamp. The binding is written by the SAME choke point: the late key is persisted into the session's own meta
 * record with `browserKeyFor` = the session's own conversation id, so `bindableIdOf` binds exactly that conversation
 * and the store's two belts (a conversation keeps its key; a key is one conversation's) stand behind it.
 *
 * THE RULES (the bindings' D15 / r5–r7, as a PURE verdict: `B.lateKeyVerdict`):
 *   · the session is LIVE and LOCAL (a remote / paired-machine session's rung is decided on its host at spawn ⇒
 *     refused `remote`, restart to get one); isolation and integration are ON (else refused by name — a restart
 *     would not help, the setting does);
 *   · its conversation id is KNOWN (a key belongs to a conversation) and is ITS OWN — a fork still carrying the id it
 *     was forked from (`restoredForkPending` over the record, the claude lock capture's rule; `bindableIdOf`'s
 *     `forkSourceId` clause) is refused `fork_pending`: a key given then would bind the PARENT (the r6 incident);
 *   · a conversation that already has a key (the binding, else the meta join — `priorKeyFor`) gets THAT key back
 *     (the resume rung), unless another LIVE session holds it — `held_elsewhere`: one conversation, one browser;
 *     never a second key for a conversation.
 *
 * SINGLE-FLIGHT BY CONSTRUCTION. `ensureBrowserKey` is synchronous end to end (browser-env writes its files
 * synchronously, the keeper's pin/cap writes are synchronous, the meta write is), so two concurrent requests of one
 * session cannot interleave: the second finds `session._browserKey` and returns it (`minted: false`). Idempotent: a
 * session with a key is answered with it and nothing is touched. A refusal changes nothing.
 *
 * Gates: test-browser-share-model ③ (the real routes + keeper + browser-env over a fake 0.38.1: a keyless session's
 * resolve mints, the binding names THAT conversation, a second resolve returns the same key, the refusals by name;
 * two patched-copy controls), test-browser-fact ⑦ (the keyless fact + its words), test-browser-share ⑦ (heavy: the
 * real binary, a session stripped of its key after create browses through the shipped CLI).
 */
const crypto = require('crypto');
const B = require('../browser-profiles.js');
const BF = require('../browser-fact.js');
const BB = require('./browser-bindings.js');
const { restoredForkPending } = require('../claude-lock-capture.js');

/** THE mint — ws-create's spawn and the late key call this one function (`bk-<8 hex>`, the caller owns no randomness). */
function mintKey() { return B.mintBrowserKey(crypto.randomBytes(4).toString('hex')); }

/** THE session fields a browser key brings (session-schema rows `_browserKey` … `_browserEnv`), written in one place
 *  for the spawn and the late key alike. `env` = browser-env's `envFor` answer; `pin` = the keeper's `pinForCreate`. */
function applyKey(session, { key, env, pin }) {
  session._browserKey = key;
  session._browserVariant = env.variant;
  session._browserProfileId = (pin && pin.profileId) || null;
  session._browserPinOrigin = (pin && pin.origin) || 'harness';
  // P2 (§4.2): the very pairs this process browses with — the live view of an EPHEMERAL browser (no attachment) asks
  // its stream port under exactly these, never a re-run of the ladder (which would rebuild the generated config)
  session._browserEnv = Array.isArray(env.pairs) && env.pairs.length ? env.pairs.slice() : null;
  return session;
}

/** The id this session's conversation is filed under (the bindings' rule: claude's, else the harness's own). */
function conversationIdOfSession(session, meta) {
  const live = BB.conversationIdOf(session ? { claudeSessionId: session.claudeSessionId, backendSessionId: session.backendSessionId } : null);
  return live || BB.conversationIdOf(meta);
}

/**
 * @param browserEnv  () => the browser-env instance (the routes' memo — the same module ws-create resolves with)
 * @param keeper      () => the profile keeper (pin ladder, cap stamp) or null
 * @param activeSessions  the live session map (liveness + "another live session holds this conversation's key")
 * @param integrationEnabled  () => the agent-integration master switch (server.js's ONE definition)
 * @param readMeta    (session) => its meta record or null — the record the late key extends
 * @param persistMeta (session, patch) => write the record back through THE choke point (the binding rides it); only
 *                    called when a real record exists (a partial record would be a restore's garbage)
 * @param onLiveFactsChanged  () => re-publish active-sessions (the browser fact moved)
 */
function create({ browserEnv = () => null, keeper = () => null, activeSessions = new Map(), integrationEnabled = () => true,
  readMeta = () => null, persistMeta = null, onLiveFactsChanged = null, log = console } = {}) {
  const be = () => { try { return browserEnv() || null; } catch { return null; } };
  const kp = () => { try { return keeper() || null; } catch { return null; } };
  const integrationOn = () => { try { return integrationEnabled() !== false; } catch { return true; } };
  const isolationOn = (e) => { try { return !e || typeof e.isolationOn !== 'function' || e.isolationOn() !== false; } catch { return true; } };
  const saidRefusal = new Set(); // `session\0why` — one journal line per (session, reason), a CLI in a loop says nothing new
  const liveIdOf = (session) => { for (const [id, s] of activeSessions) if (s === session) return id; return null; };
  const holderOf = (session, key) => {
    for (const [id, s] of activeSessions) if (s && s !== session && s._browserKey === key) return String(s.webuiName || s.name || id);
    return null;
  };

  /** Every fact the PURE verdict reads, gathered once. */
  function factsFor(session, sessionId) {
    const id = sessionId || liveIdOf(session);
    const live = !!(session && id && activeSessions.get(id) === session);
    const remote = !!(session && (session.hostId || session.host));
    const e = be();
    let meta = null; try { meta = readMeta(session) || null; } catch { meta = null; }
    const conversationId = conversationIdOfSession(session, meta);
    // the record the choke point will judge, with the live ids (an adoption may not have reached the file yet)
    const view = { ...(meta || {}), claudeSessionId: (session && session.claudeSessionId) || (meta && meta.claudeSessionId) || undefined,
      backendSessionId: (session && session.backendSessionId) || (meta && meta.backendSessionId) || undefined,
      forkRequested: !!((meta && meta.forkRequested) || (session && session._forkRequested)) };
    const forkPending = !!conversationId && (restoredForkPending(view) || BB.bindableIdOf({ ...view, browserKeyFor: conversationId }) !== conversationId);
    let priorKey = '';
    if (conversationId && e && typeof e.priorKeyFor === 'function') { try { priorKey = e.priorKeyFor(conversationId) || ''; } catch { priorKey = ''; } }
    return { id, meta, env: e, live, remote, conversationId, forkPending, priorKey, priorHolder: priorKey ? holderOf(session, priorKey) : null };
  }

  function refused(session, id, v) {
    const tag = `${id || '?'}\0${v.why}`;
    if (!saidRefusal.has(tag)) {
      saidRefusal.add(tag);
      if (saidRefusal.size > 4096) saidRefusal.delete(saidRefusal.values().next().value);
      try { log.warn?.(`[browser] ${id || 'session'}: has no browser key and none was minted (${v.why}) — ${v.error}`); } catch { /* never throws */ }
    }
    return v;
  }

  /**
   * THE late key. `session` = the live record; `sessionId` = its webui id (liveness is asked by identity). Returns
   * `{ok:true, key, minted:false}` when it already has one, `{ok:true, key, minted:true, origin:'new'|'conversation',
   * variant, conversationId}` when it got one now, else the named refusal (`B.lateKeyRefusal`).
   */
  function ensureBrowserKey(session, { sessionId = null } = {}) {
    if (session && B.isBrowserKey(session._browserKey)) return { ok: true, key: session._browserKey, minted: false };
    if (!session) return B.lateKeyRefusal('session_gone');
    const f = factsFor(session, sessionId);
    const e = f.env;
    const v = B.lateKeyVerdict({ live: f.live, remote: f.remote, integrationOn: integrationOn(), isolationOn: isolationOn(e), envAvailable: !!(e && typeof e.envFor === 'function'),
      conversationId: f.conversationId, forkPending: f.forkPending, priorKey: f.priorKey, priorHolder: f.priorHolder });
    if (!v.ok) return refused(session, f.id, v);
    // the spawn's own ladder: a conversation's key is kept (the resume rung), else minted
    const bk = B.browserKeyFor({ prior: v.reuse, resume: true, fork: false, mint: mintKey });
    // the spawn's pin ladder: the conversation's own pin (a kept key) > the Task Group default > the instance default
    let pin = { profileId: '', dir: null, origin: 'harness' };
    const k = kp();
    const groupFacts = { cwd: session.cwd || null, initialGroupId: session._initialGroupId || null };
    // verify r2: A DEFAULT REACHES A CONVERSATION ONLY AT ITS START. The ladder above is read NOW; the spawn read it at
    // the start — and a default the user set to a narrowed profile in between walked in through this key (reproduced).
    // The spawn's own record of its pick (`browserPinAtStart`, a keyless spawn's WITNESS since r2) is what the late key
    // restores; without one, the default the user has now is a LANDING dated 0 (never an authorization on a narrowed
    // profile — `userPinAuthorizes`); the group cap is the witness's, never the group's live value (PURE lateDefaultPin)
    const witness = f.meta && f.meta.browserPinAtStart !== undefined ? f.meta.browserPinAtStart : null;
    const startedAt = B.latePinAt({ recordedAt: f.meta && f.meta.createdAt, liveAt: session.createdAt });
    let late = { profileId: '', origin: 'harness', at: null, by: null, source: 'none' };
    try {
      if (k && typeof k.pinForCreate === 'function') {
        const taskGroupDefault = typeof k.taskGroupDefaultFor === 'function' ? k.taskGroupDefaultFor(groupFacts) : '';
        const ladder = k.pinForCreate({ explicit: '', priorKey: v.reuse, forkParentKey: '', taskGroupDefault, resume: !!v.reuse, fork: false });
        late = B.lateDefaultPin({ witness, ladder: ladder.refused ? { profileId: '', origin: 'harness' } : ladder, startedAt });
        if (late.refused) { try { log.warn?.(`[browser] ${f.id}: ${late.refused} — starting ephemeral`); } catch { } }
        const p = late.profileId && typeof k.profile === 'function' ? k.profile(late.profileId) : null;
        if (late.profileId && !p) { try { log.warn?.(`[browser] ${f.id}: pinned profile ${late.profileId} no longer exists — starting ephemeral`); } catch { } late = { ...late, profileId: '', origin: 'harness', source: 'none' }; }
        else if (ladder.refused && !late.profileId) { try { log.warn?.(`[browser] ${f.id}: ${ladder.refused} — starting ephemeral`); } catch { } }
        pin = late.profileId ? { profileId: late.profileId, dir: p ? p.dir : null, origin: late.origin, label: p ? p.label : null } : { profileId: '', dir: null, origin: 'harness' };
      }
    } catch (err) { try { log.warn?.('[browser] pin ladder unavailable — ' + (err && err.message)); } catch { } pin = { profileId: '', dir: null, origin: 'harness' }; late = { profileId: '', origin: 'harness', at: null, by: null, source: 'none' }; }
    // the spawn's env composition (owner ruling A: never a pinned directory — a pin is a default ATTACHMENT)
    let env = null;
    try { env = e.envFor({ browserKey: bk.key, integrationOn: true, remote: false, cwd: typeof session.cwd === 'string' ? session.cwd : null, pinnedDir: null }); }
    catch (err) { env = null; try { log.warn?.(`[browser] ${f.id}: the browser environment could not be composed — ${err && err.message}`); } catch { } }
    if (!env || !env.variant) return refused(session, f.id, B.lateKeyRefusal(isolationOn(e) ? 'unavailable' : 'isolation_off'));
    applyKey(session, { key: bk.key, env, pin });
    if (k) {
      // verify r1: the DEFAULT pin is dated when this session STARTED, never now — a pin is an authorization and the
      // user's latest choice wins (B.latePinAt; the keeper only ever dates a pin earlier than its own clock).
      // verify r2: a WITNESSED pick is restored as the spawn wrote it (`restorePin`: profile, origin, date, by — a fork's
      // parent row verbatim, no re-admission); a LANDING (no witness) is the current default dated 0 (`setPin`'s clamp
      // keeps it there): the agent's bare command names it and a narrowed profile refuses `not_owner`, by the button
      try {
        if (late.source === 'witness' && late.profileId) k.restorePin(bk.key, { profileId: late.profileId, origin: late.origin, at: late.at, by: late.by });
        else if (late.source === 'landing' && late.profileId) k.setPin(bk.key, late.profileId, { origin: late.origin, by: 'user', at: 0 });
      } catch { /* the pin row stays the session's copy */ }
      // the group cap: the witness's value (null = none was in force at the start), never the group's live value
      try { if (typeof k.stampGroupCap === 'function') k.stampGroupCap(bk.key, groupFacts, { value: B.witnessCap(witness) }); session._browserCap = typeof k.capOf === 'function' ? k.capOf(bk.key) : null; } catch { session._browserCap = null; }
    }
    // THE binding: the record extended through the ONE choke point, `browserKeyFor` = this session's own conversation
    const patch = {
      browserKey: bk.key, browserVariant: env.variant, browserKeyFor: v.conversationId,
      browserProfileId: session._browserProfileId || undefined, browserPinOrigin: session._browserPinOrigin || undefined,
      browserEnv: session._browserEnv || undefined, browserCap: Number.isInteger(session._browserCap) ? session._browserCap : undefined,
    };
    let persisted = false;
    if (f.meta && f.meta.webuiSessionId && typeof persistMeta === 'function') {
      try { persistMeta(session, patch); persisted = true; } catch (err) { try { log.warn?.(`[browser] ${f.id}: the late browser key was not persisted — ${err && err.message}`); } catch { } }
    }
    let bound = '';
    try { bound = e.bindings && typeof e.bindings.lookup === 'function' ? e.bindings.lookup(v.conversationId) : ''; } catch { bound = ''; }
    const origin = bk.origin === 'conversation' ? 'conversation' : 'new';
    try {
      log.log?.(`[browser] ${f.id}: had no browser key (it started before per-session browsers, or while they were off) — ${origin === 'conversation' ? `gave it its conversation's key ${bk.key} back` : `minted ${bk.key}`} for conversation ${v.conversationId.slice(0, 8)} on its first browser use (rung ${env.variant}${late.profileId ? `; pin ${late.profileId} ${late.origin}, ${late.source === 'witness' ? 'the pick its spawn witnessed at the start' : late.source === 'conversation' ? 'its conversation\'s own' : 'the default the user has now — a landing, never an authorization'}` : late.source === 'witness' ? '; no default was in force at its start' : ''})`
        + (persisted ? (bound === bk.key ? '' : ` — the binding was NOT recorded (the store holds ${bound || 'nothing'} for it; the next resume decides from there)`) : ' — no session record to persist it to: this process keeps it, a later resume mints its own'));
    } catch { /* never throws */ }
    try { global.__vsMetric?.('browser-key-late', 1); } catch { }
    try { onLiveFactsChanged?.(); } catch { /* optional */ }
    return { ok: true, key: bk.key, minted: true, origin, variant: env.variant, conversationId: v.conversationId };
  }

  /** The browser FACT of a live session with no key YET, from in-memory facts only (active-sessions calls this per
   *  broadcast — no file is read): "no browser yet" where the first browser command would get one, else null (as
   *  before — a remote session, a switch off, a conversation not known yet). */
  function keylessFactOf(session) {
    if (!session || B.isBrowserKey(session._browserKey)) return null;
    if (session.hostId || session.host) return null;
    if (!integrationOn()) return null;
    const e = be();
    if (!e || !isolationOn(e)) return null;
    if (!(session.claudeSessionId || session.backendSessionId) || session._forkRequested) return null;
    return BF.keylessFact();
  }

  return { ensureBrowserKey, keylessFactOf };
}

module.exports = { create, mintKey, applyKey, conversationIdOfSession };
