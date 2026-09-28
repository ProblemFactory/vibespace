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

function create({ app, dataDir, bcastAll = () => {}, now = () => Date.now(), env = process.env, integrations = null, userTodos = null, deliver = null, serverSetting = () => undefined, liveSessions = () => [], groupSetting = () => 'none', authEnabled = () => false, getMounts = () => null, sessions = () => null, sessionMeta = () => null } = {}) {
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
  // AGENT GROUPS (design §22): the SAME store (groups.json + the group logs
  // behind its serialized doors), the SAME ladder (a wake is a billed turn —
  // spendReason peer-message, the authorizer inside it), reach = msg-acl over
  // the live roster + the Task Groups' externalVisibility (`groupSetting`).
  const groups = createGroups({ store: channels.store, deliver, broadcast: (msg) => bcastAll(msg), now, roster: liveSessions, groupSetting });
  // `authEnabled` (r2): with auth OFF the owner's group routes are reachable by any
  // local caller, so they are PACED like an agent's (src/routes/channels.js ownerPacer)
  // THE WITNESS (§26, B-099e): every agent read / search / reply / compose of a conversation, recorded by the agent
  // routes on the SESSION (`sessions` = the live map, `sessionMeta` = its meta store — the ring survives a restart),
  // broadcast as `channel-touch`, read back by the chat view and the conversation window (cookie routes)
  const touches = createTouches({ sessions, broadcast: (msg) => bcastAll(msg), metaStore: sessionMeta, now,
    accountOf: (id) => { const r = channels.adapterRecords().adapters.find((a) => a.id === id); return r ? { label: r.label || r.id, kind: r.kind || null } : null; } });
  channelsRoutes.setup({ getEngine: () => channels, getGroups: () => groups, authEnabled, getTouches: () => touches });
  app.use(channelsRoutes.router);
  channels.start();
  return { channels, groups, touches, shutdown: () => { try { touches.flush(); } catch (e) { console.warn('[channel-touches] flush:', e && e.message); } try { channels.stop(); } catch (e) { console.warn('[channels] shutdown:', e && e.message); } } };
}

module.exports = { create };
