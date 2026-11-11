'use strict';
/**
 * CHANNELS WIRING (docs/design-communication-panel.zh.md §2's placement table).
 * ONE `create(deps)` factory called ONCE from server.js, so server.js gains a
 * wiring stanza and nothing else — the 2.325.0 decomposition's rule, and the
 * reason the size ratchet is survivable at all.
 *
 * It builds the engine, mounts the router, starts the scheduler, and hands
 * back the handle the shutdown path flushes. Everything it knows about the
 * feature is in `src/server/channels-engine.js` and `src/routes/channels.js`.
 */
const { create: createEngine } = require('./channels-engine.js');
const { create: createGroups } = require('./groups-engine.js');
const channelsRoutes = require('../routes/channels.js');
const webhookRoutes = require('../routes/webhook.js');   // lane webhook-l1-server: the inbound door + the owner's path / caller verbs
const { create: createTouches } = require('./channel-touches.js');
const { create: createChannelApi } = require('./channel-api.js');
const { create: createApiCards } = require('./channel-api-cards.js');
const N = require('../normalizers.js');

// lane pair-group-fate (+ r2: `gone` needs EVIDENCE): THE liveness reader supplies FACTS only — the live roster, the
// sidebar's archived list (user-state keys are `<backend>:<cid>`), a transcript on disk (Claude / codex), WHO OWNS the
// conversation (a conversation-index claim ⇒ another machine's, or unknown when the claims are ambiguous; else a
// session-meta of this machine: no `host` ⇒ local) and whether the transcript directory was readable. PURE
// channel-groups `livenessFrom` judges: a remote / unknown-owner / unreadable-store conversation is never gone.
function livenessReader({ liveSessions = () => [], readUserState = () => ({}), convIndex = () => null, metaDir = null, transcriptDirs = null, findTranscript = null, transcriptIndex = null, now = () => Date.now() } = {}) {
  const fs = require('fs'), path = require('path'), os = require('os'), G = require('../channel-groups.js');
  const dirs = transcriptDirs || (() => [path.join(os.homedir(), '.claude', 'projects')]);
  const found = findTranscript || ((cid) => !!(require('../session-store.js').findSessionJsonlPath(cid) || require('../adapters/codex.js').findCodexSessionJsonlPath(cid)));
  let archOf = null, archSet = null; // B-1319: the set is rebuilt only when the user state is (a write replaces the array) — once per member was 123 ms of the listen tick (6 291 archived)
  const archivedCids = () => { try { const st = readUserState() || {}; const arr = st.archivedSessions || []; if (arr === archOf && archSet) return archSet; archOf = arr; return (archSet = new Set(arr.map((k) => { const v = String(k); return v.includes(':') ? v.slice(v.indexOf(':') + 1) : v; }))); } catch { return new Set(); } };
  const transcriptOf = (cid) => { try { return !!found(cid); } catch { return true; } };
  const dirReadable = () => { try { for (const d of dirs()) fs.readdirSync(d); return true; } catch { return false; } };
  let metas = null, metasAt = 0;
  const metaOf = (cid) => {   // conversation id → this machine's session-meta (a 5 s memo: a sweep asks once per member)
    if (!metaDir) return null;
    if (!metas || now() - metasAt > 5000) {
      metas = new Map(); metasAt = now();
      try { for (const f of fs.readdirSync(metaDir)) { if (!f.endsWith('.json')) continue; try { const m = JSON.parse(fs.readFileSync(path.join(metaDir, f), 'utf-8')) || {}; for (const id of [m.claudeSessionId, m.backendSessionId]) if (id) metas.set(String(id), m); } catch { } } } catch { }
    }
    return metas.get(cid) || null;
  };
  const ownerOf = (cid) => {
    try { const idx = convIndex(); const c = idx && idx.lookup(cid); if (c && Object.keys(c.hosts || {}).length) return idx.ownerHost(cid) ? 'remote' : 'unknown'; } catch { return 'unknown'; }
    const m = metaOf(cid);
    return m ? (m.host ? 'remote' : 'local') : 'unknown';
  };
  const reader = (cid, arch = archivedCids()) => {
    const live = (liveSessions() || []).some((s) => s && s.cid === cid);
    if (live || arch.has(cid)) return G.livenessFrom({ live, archived: arch.has(cid) });
    const transcript = transcriptOf(cid);
    return G.livenessFrom(transcript ? { transcript } : { transcript, owner: ownerOf(cid), dirReadable: dirReadable() });
  };
  // lane roster-per-pass: ONE SWEEP READS EACH TRANSCRIPT TREE ONCE — the judge of a sweep asks the trees' indexes, built
  // once by an async walk (src/session-store.js claudeTranscriptIndex, src/adapters/codex.js codexTranscriptIndex: the same
  // directories the per-id lookups read, the reads in libuv); per id a Set lookup, no I/O. A tree that was NOT read whole
  // (a directory that failed, a walk past its bound) says NOTHING is gone: an id it would have to vouch for is judged
  // unreadable (stopped), exactly as an unreadable projects directory is — no pair closes on it; the next sweep asks again.
  // A drill that hands its own `findTranscript` keeps the per-id reader (its lookups are its own).
  // `transcriptIndex` = { claude, codex }: a drill's options for the two walks (its own fs / bound / roots)
  const io = transcriptIndex && typeof transcriptIndex === 'object' ? transcriptIndex : {};
  const indexes = findTranscript ? null : async () => {
    // ONE readdir per directory per sweep: the two walks share one listing of what both read (data/remote-jsonl)
    const fsp0 = fs.promises, listed = new Map();
    const once = { ...fsp0, readdir: (p, o) => { const k = String(p); if (!listed.has(k)) listed.set(k, fsp0.readdir(p, o)); return listed.get(k); } };
    const [c, x] = await Promise.all([require('../session-store.js').claudeTranscriptIndex({ fsp: once, ...(io.claude || {}) }), require('../adapters/codex.js').codexTranscriptIndex({ fsp: once, ...(io.codex || {}) })]);
    return { topReadable: c.topReadable, ok: c.ok && x.ok, has: (cid) => (c.has(cid) || x.has(cid) ? true : (c.ok && x.ok ? false : null)), trees: { projects: c, rollouts: x } };
  };
  const judgeWith = (idx) => (cid, arch = archivedCids()) => {
    const live = (liveSessions() || []).some((s) => s && s.cid === cid);
    if (live || arch.has(cid)) return G.livenessFrom({ live, archived: arch.has(cid) });
    const t = idx.has(cid);
    if (t === true) return G.livenessFrom({ transcript: true });
    return G.livenessFrom({ transcript: false, owner: ownerOf(cid), dirReadable: t === null ? false : idx.topReadable === true });
  };
  let asks = 0;
  reader.forSweep = async () => {
    if (!indexes) return reader;
    let idx = null;
    try { idx = await indexes(); } catch { idx = null; }
    if (!idx) return reader;
    const judge = judgeWith(idx);
    // round 2 — A «GONE» VERDICT IS TRUE WHEN IT ACTS: the index is the disk at the sweep's START, and its ids are judged
    // later (across slices and every earlier act's awaits). An id the index judges gone is ASKED AGAIN right before its
    // act — a fresh read of both trees, off the loop, its answer whatever the disk and the roster say NOW (a transcript
    // written since ⇒ stopped; a read that fails ⇒ unknown ⇒ nobody gone; live / archived again). A sweep with G gone
    // candidates costs G such asks more; running / stopped / archived keep the index.
    judge.confirm = async (cid) => { asks++; let fresh = null; try { fresh = await indexes(); } catch { fresh = null; } return fresh ? judgeWith(fresh)(cid) : null; };
    judge.index = idx;
    return judge;
  };
  reader.asks = () => asks;   // the drill's count of the gone candidates asked again
  return reader;
}

function create({ app, dataDir, bcastAll = () => {}, now = () => Date.now(), env = process.env, integrations = null, userTodos = null, deliver = null, serverSetting = () => undefined, liveSessions = () => [], rosterFingerprint = null, sweepGapMs = 5000, transcriptIndex = null, readUserState = () => ({}), convIndex = () => null, groupSetting = () => 'none', authEnabled = () => false, publicUrl = () => null, getMounts = () => null, sessions = () => null, sessionMeta = () => null, onGroupsPending = () => {}, decisionEngine = null } = {}) {
  if (!app) throw new Error('channels-wiring: app is required');
  if (!dataDir) throw new Error('channels-wiring: dataDir is required');
  // lane roster-per-pass: THE live roster, built ONCE per pass for every reader below — the channels engine (access,
  // outbound), the groups engine, the liveness reader (src/server/roster-pass.js: frozen entries, the memo checked against
  // the fingerprint of what the builder reads; server.js hands both)
  const rosterPass = require('./roster-pass.js').createRosterPass(liveSessions, { fingerprint: rosterFingerprint });
  liveSessions = rosterPass.read;

  // `integrations` is the §14 store handle: adapters ask its
  // `resolveIntegration(id)` — never `process.env` — and every real row's
  // Test runner is registered on it by the engine (the consumer owns the
  // runner). `userTodos` is the "For you" inbox a failing adapter SPEAKS in
  // and the same producer retracts from (fence 8, P1). `deliver` is THE
  // delivery ladder (P2, fence 2: the only door to an unattended turn, the
  // spend authorizer inside it), `serverSetting` reads the coalescing window
  // and `liveSessions` names the agent sessions an assignment can address.
  // 2.369.195: the storage mounts' OWN OAuth clients an account may borrow —
  // `list` = the read-only offer (no secret), `of` = the decrypted client the
  // engine re-seals under `.channels-key` at once (src/mounts.js owns `.mounts-key`)
  // verify r2: `head` = the KEY-LESS read (the id + every refusal that needs no
  // key), asked before `of` wherever the engine can refuse on the id alone
  const noMounts = () => { const e = new Error('storage mounts are not available on this instance'); e.code = 'no-mounts'; throw e; };
  const mountClients = {
    list: (vendor) => { const m = getMounts(); return m && typeof m.oauthClientsFor === 'function' ? m.oauthClientsFor(vendor) : []; },
    head: (mountId, opts = {}) => { const m = getMounts(); if (!m || typeof m.oauthClientIdOf !== 'function') noMounts(); return m.oauthClientIdOf(mountId, opts); },
    of: (mountId, opts = {}) => { const m = getMounts(); if (!m || typeof m.oauthClientOf !== 'function') noMounts(); return m.oauthClientOf(mountId, opts); },
  };
  const channels = createEngine({ dataDir, broadcast: (msg) => bcastAll(msg), now, env, integrations, userTodos, deliver, serverSetting, liveSessions, mountClients, httpInbound: true, decisionEngine, publicUrl });   // lane pod-oauth-callback: the instance's address (a redirect consent lands on its route)   // + D1's ONE decision engine: lane decision-attention's judged rows + lane decision-rule's pre-judge
  // B-2198: the raw API pass-through's orchestrator (src/server/channel-api.js) — reached by the agent and owner routes as `channels.rawApi`
  channels.rawApi = createChannelApi({ dataDir, engine: channels, getMounts, now, broadcast: (msg) => { bcastAll(msg); if (channels.apiCards) channels.apiCards.onUpdate(msg); } });
  // B-2198 part 2: ONE card per proposal in the chat, the Outbox and For you; the next-turn receipt; the 24 h expiry + withdrawal
  channels.apiCards = createApiCards({ dataDir, api: () => channels.rawApi, userTodos, deliver, now, names: (adapterId, convId) => channels.conversationName(adapterId, convId) });
  // AGENT GROUPS (design §22): the SAME store (groups.json + the group logs
  // behind its serialized doors), the SAME ladder (a wake is a billed turn —
  // spendReason peer-message, the authorizer inside it), reach = msg-acl over
  // the live roster + the Task Groups' externalVisibility (`groupSetting`).
  // the .197 integration (lane-redact × lane group-report-card): a cleared group message's CARD re-words in every live
  // conversation that carded it (the ring + the drawn card; a stopped session's ring is never drawn again — a resume
  // is a new session, a restart restores only the live ones, which are here)
  const onGroupCardsCleared = (gid, keys) => {
    const live = (() => { try { return sessions(); } catch { return null; } })();
    if (!live || !keys.length) return;
    const RCm = require('../record-clear.js');
    for (const s of live.values()) { try { N.redactGroupCards(s, keys, RCm.CLEARED_TEXT); } catch (e) { console.warn('[groups] a group card was not re-worded:', e && e.message); } }
  };
  const liveness = livenessReader({ liveSessions, readUserState, convIndex, metaDir: require('path').join(dataDir, 'session-meta'), transcriptIndex });   // transcriptIndex: a drill's own trees (null = the hub's)
  const groups = createGroups({ store: channels.store, dataDir, deliver, broadcast: (msg) => bcastAll(msg), now, roster: liveSessions, groupSetting, onPending: onGroupsPending, onCleared: onGroupCardsCleared, liveness, userTodos });
  // the archive / boot door: ONE sweep at a time, a write during a sweep re-runs it once after — and (lane roster-per-pass)
  // WRITES DO NOT QUEUE SWEEPS: a sweep starts no sooner than `sweepGapMs` (5 s) after the last one ENDED. A write after a
  // quiet gap sweeps AT ONCE (the leading edge); a burst is answered by one sweep per gap, the last write always followed by
  // one (120 writes in 55 s ⇒ at most 12 sweeps). In a person's terms: after an archive, a sender waiting on that
  // conversation is told after at most the sweep already running, 5 s, and one more sweep — and a sweep holds up to 1 + G
  // walks, each with its own 10 s bound: its index of both trees, then one fresh walk for each of its G gone candidates whose
  // act would change something (a «gone» already said in a live multi-member group is no act, so it is never asked again).
  let sweeping = null, sweepAgain = false, lastEnd = -Infinity, gapWait = null;
  const runSweep = () => {
    gapWait = null;
    sweeping = groups.sweepEnded().catch((e) => console.warn('[groups] ended sweep failed:', e && e.message)).finally(() => { sweeping = null; lastEnd = now(); if (sweepAgain) { sweepAgain = false; groups.noteUserState(); } });
    return sweeping;
  };
  groups.noteUserState = () => {
    if (sweeping) { sweepAgain = true; return sweeping; }
    if (gapWait) return gapWait.p;
    const wait = lastEnd + sweepGapMs - now();
    if (!(wait > 0)) return runSweep();
    let go = null;
    const p = new Promise((r) => { go = r; });
    gapWait = { p, t: setTimeout(() => go(runSweep()), wait) };
    if (gapWait.t && gapWait.t.unref) gapWait.t.unref();
    return p;
  };
  // THE GROUP CARDS' RING (lane group-report-card): the card door (src/normalizers.js feedGroupCard) keeps it on the live
  // session; its meta write is HERE, beside the meta store — ONE write per session per burst (a report's N cards are
  // emitted in one synchronous pass), on a MICROTASK: commitReports emits its cards before it asks the groups door for
  // the marker, whose write rides that door's promise chain queued after this flush — the ring is on disk before the
  // marker, so a re-report after a crash between the two finds its key and draws nothing twice. Flushed at shutdown.
  const cardsDirty = new Set();
  let cardsQueued = false;
  const flushGroupCards = () => {
    cardsQueued = false;
    const ms = sessionMeta();
    for (const s of cardsDirty) {
      if (!s || !s.sockName || !ms) continue;
      try { ms.writeSessionMeta(s.sockName, { ...(ms.readSessionMeta(s.sockName) || {}), groupCards: Array.isArray(s._groupCards) ? s._groupCards : [] }); }
      catch (e) { console.warn(`[groups] the group cards of ${s.sockName} were not persisted: ${(e && e.message) || e}`); }
    }
    cardsDirty.clear();
  };
  N.setGroupCardPersist((s) => { cardsDirty.add(s); if (!cardsQueued) { cardsQueued = true; queueMicrotask(flushGroupCards); } });
  // `authEnabled` (r2): with auth OFF the owner's group routes are reachable by any
  // local caller, so they are PACED like an agent's (src/routes/channels.js ownerPacer)
  // THE WITNESS (§26, B-099e): every agent read / search / reply / compose of a conversation, recorded by the agent
  // routes on the SESSION (`sessions` = the live map, `sessionMeta` = its meta store — the ring survives a restart),
  // broadcast as `channel-touch`, read back by the chat view and the conversation window (cookie routes)
  const touches = createTouches({ sessions, broadcast: (msg) => bcastAll(msg), metaStore: sessionMeta, now,
    accountOf: (id) => { const r = channels.adapterRecords().adapters.find((a) => a.id === id); if (!r) return null; let glyph = null; try { glyph = channels.registry.capsOf(r.kind).glyph || null; } catch { glyph = null; } return { label: r.label || r.id, kind: r.kind || null, glyph }; },
    nameOf: (adapterId, convId) => channels.conversationName(adapterId, convId) });   // B-c127: a touch names its conversation by THE NAME LADDER
  channelsRoutes.setup({ getEngine: () => channels, getGroups: () => groups, authEnabled, getTouches: () => touches });
  webhookRoutes.setup({ getEngine: () => channels, dataDir, serverSetting, now });
  app.use(webhookRoutes.router);
  app.use(channelsRoutes.router);
  channels.start();
  return { channels, groups, touches, flushGroupCards, liveness, roster: liveSessions, rosterChanged: () => rosterPass.invalidate(), rosterBuilds: () => rosterPass.builds(), shutdown: () => { try { channels.apiCards.stop(); } catch {} try { touches.flush(); } catch (e) { console.warn('[channel-touches] flush:', e && e.message); } try { flushGroupCards(); } catch (e) { console.warn('[groups] card flush:', e && e.message); } try { channels.stop(); } catch (e) { console.warn('[channels] shutdown:', e && e.message); } } };
}

module.exports = { create, livenessReader };
