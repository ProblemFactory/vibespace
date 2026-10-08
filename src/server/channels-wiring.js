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
const { create: createTouches } = require('./channel-touches.js');
const { create: createChannelApi } = require('./channel-api.js');
const { create: createApiCards } = require('./channel-api-cards.js');
const N = require('../normalizers.js');

// lane pair-group-fate (+ r2: `gone` needs EVIDENCE): THE liveness reader supplies FACTS only — the live roster, the
// sidebar's archived list (user-state keys are `<backend>:<cid>`), a transcript on disk (Claude / codex), WHO OWNS the
// conversation (a conversation-index claim ⇒ another machine's, or unknown when the claims are ambiguous; else a
// session-meta of this machine: no `host` ⇒ local) and whether the transcript directory was readable. PURE
// channel-groups `livenessFrom` judges: a remote / unknown-owner / unreadable-store conversation is never gone.
function livenessReader({ liveSessions = () => [], readUserState = () => ({}), convIndex = () => null, metaDir = null, transcriptDirs = null, findTranscript = null, now = () => Date.now() } = {}) {
  const fs = require('fs'), path = require('path'), os = require('os'), G = require('../channel-groups.js');
  const dirs = transcriptDirs || (() => [path.join(os.homedir(), '.claude', 'projects')]);
  const found = findTranscript || ((cid) => !!(require('../session-store.js').findSessionJsonlPath(cid) || require('../adapters/codex.js').findCodexSessionJsonlPath(cid)));
  const archivedCids = () => { try { const st = readUserState() || {}; return new Set((st.archivedSessions || []).map((k) => { const v = String(k); return v.includes(':') ? v.slice(v.indexOf(':') + 1) : v; })); } catch { return new Set(); } };
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
  return (cid, arch = archivedCids()) => {
    const live = (liveSessions() || []).some((s) => s && s.cid === cid);
    if (live || arch.has(cid)) return G.livenessFrom({ live, archived: arch.has(cid) });
    const transcript = transcriptOf(cid);
    return G.livenessFrom(transcript ? { transcript } : { transcript, owner: ownerOf(cid), dirReadable: dirReadable() });
  };
}

function create({ app, dataDir, bcastAll = () => {}, now = () => Date.now(), env = process.env, integrations = null, userTodos = null, deliver = null, serverSetting = () => undefined, liveSessions = () => [], readUserState = () => ({}), convIndex = () => null, groupSetting = () => 'none', authEnabled = () => false, getMounts = () => null, sessions = () => null, sessionMeta = () => null, onGroupsPending = () => {} } = {}) {
  if (!app) throw new Error('channels-wiring: app is required');
  if (!dataDir) throw new Error('channels-wiring: dataDir is required');

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
  const channels = createEngine({ dataDir, broadcast: (msg) => bcastAll(msg), now, env, integrations, userTodos, deliver, serverSetting, liveSessions, mountClients });
  // B-2198: the raw API pass-through's orchestrator (src/server/channel-api.js) — reached by the agent and owner routes as `channels.rawApi`
  channels.rawApi = createChannelApi({ dataDir, engine: channels, getMounts, now, broadcast: (msg) => { bcastAll(msg); if (channels.apiCards) channels.apiCards.onUpdate(msg); } });
  // B-2198 part 2: ONE card per proposal in the chat, the Outbox and For you; the next-turn receipt; the 24 h expiry + withdrawal
  channels.apiCards = createApiCards({ dataDir, api: () => channels.rawApi, userTodos, deliver, now });
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
  const liveness = livenessReader({ liveSessions, readUserState, convIndex, metaDir: require('path').join(dataDir, 'session-meta') });
  const groups = createGroups({ store: channels.store, deliver, broadcast: (msg) => bcastAll(msg), now, roster: liveSessions, groupSetting, onPending: onGroupsPending, onCleared: onGroupCardsCleared, liveness });
  // the archive / boot door: ONE sweep at a time, a write during a sweep re-runs it once after
  let sweeping = null, sweepAgain = false;
  groups.noteUserState = () => {
    if (sweeping) { sweepAgain = true; return sweeping; }
    sweeping = groups.sweepEnded().catch((e) => console.warn('[groups] ended sweep failed:', e && e.message)).finally(() => { sweeping = null; if (sweepAgain) { sweepAgain = false; groups.noteUserState(); } });
    return sweeping;
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
  app.use(channelsRoutes.router);
  channels.start();
  return { channels, groups, touches, flushGroupCards, shutdown: () => { try { channels.apiCards.stop(); } catch {} try { touches.flush(); } catch (e) { console.warn('[channel-touches] flush:', e && e.message); } try { flushGroupCards(); } catch (e) { console.warn('[groups] card flush:', e && e.message); } try { channels.stop(); } catch (e) { console.warn('[channels] shutdown:', e && e.message); } } };
}

module.exports = { create, livenessReader };
