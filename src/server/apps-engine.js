'use strict';
/**
 * APPS THAT SURVIVE A REBUILT MACHINE — THE HUB'S ORCHESTRATION (Layer 0 of docs/design-app-persistence.zh.md §3.1).
 * The machine half (src/app-serve.js) plans and records WHERE the apps live; this module decides WHEN and WHO:
 *
 *   · THE DOOR IS THE USER'S (owner D3). The user installs from the Desktop apps dialog (search → plan → Install). An
 *     agent can only PROPOSE: `propose()` plans on the machine, keeps the proposal (data/app-proposals.json) and files
 *     ONE For-you item (origin `apps`, action `app-install`) — nothing runs until the user presses Install in THE
 *     install dialog (the same component as "Install xpra on {machine}…"). "Not now" (the item dismissed) rejects it.
 *   · ONE PACKAGE SLOT PER MACHINE. Every run — an install, a removal, a source, a Refresh, the boot replay — goes
 *     through src/server/desktop-access.js installPackage (`what: 'app:…'`), the same detached, flock-held, re-attached
 *     slot the xpra install uses; the plan run is the plan shown (its digest binds the commands AND the closure).
 *   · THE RESULT RETURNS FREE. A finished / refused proposal is told to the proposing conversation through the delivery
 *     ladder's STASH (`VibeSpace apps`, ref = the proposal id) — it rides the agent's next turn, never a billed wake;
 *     `vibespace-app wait` that reads the outcome takes the stashed copy back (told once).
 *   · AFTER A REBUILD (design §3.3). `afterListen()` asks this machine's status: the replay marker on the ephemeral root
 *     filesystem hit = nothing to do (1 ms); a miss runs rung 1 (offline, the local repository) through the slot, rung 2
 *     (online) when rung 1 could not put an entry back or the image changed; the rows read "restoring…" meanwhile
 *     (`decorate`), a failure is ONE For-you notice naming each entry, never blocking another entry.
 *   · Refresh (D5): "N updates · last refreshed N d ago" + Refresh = the slot's `install --only-upgrade`; never automatic.
 *   · The drift tripwire's verdict (installed outside VibeSpace) is offered as Adopt — the user's press.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const A = require('../app-manifest.js');
const { toAgentText } = require('../peer-text.js');
const HC = require('../hidden-chars.js'); // THE one set: an agent's why on the approval card carries no hidden / reordering character (verify-r1 F8) // THE belt on text toward an agent: a package's .desktop Name / the machine's error words ride the outcome
/** a piece of an outcome sentence that a PACKAGE (its .desktop Name) or the MACHINE (an error line) wrote — the belt (line) */
const piece = (s, max = 160) => toAgentText(String(s == null ? '' : s), { max, kind: 'line' });

const STORE_FILE = 'app-proposals.json';
const FROM_NAME = 'VibeSpace apps'; // a NOTIFICATION_SENDERS whole name (src/notification-senders.js) — the stash's sender
const INBOX_KEY = 'apps';           // the For-you key of the machine's own notices (a failed restore)
const KEEP_MS = 30 * 24 * 3600 * 1000;
const MAX_PROPOSALS = 300;
const WAIT_MAX_MS = 100 * 1000;
const PROPOSAL_STATES = Object.freeze(['proposed', 'installing', 'done', 'failed', 'rejected', 'withdrawn']);
const TERMINAL = new Set(['done', 'failed', 'rejected', 'withdrawn']);
const REQUEST_KINDS = Object.freeze(['apt', 'deb', 'source', 'source-remove', 'remove', 'refresh', 'adopt', 'replay']);
const AGENT_KINDS = Object.freeze(['apt', 'remove', 'source']); // what an agent may PROPOSE (a .deb is the user's file — D4 is the user's door)
const i18nKey = (s) => s; // extraction marker (scripts/i18n-extract.mjs) — the client words these with t()
const WORDS = Object.freeze({
  wants: i18nKey('{name} wants to install {app} ({n} packages, {size} to download)'),
  wantsOne: i18nKey('{name} wants to install {app} ({size} to download)'),
  wantsRemove: i18nKey('{name} wants to remove {app}'),
  wantsSource: i18nKey('{name} wants to add the package source {app}'),
  restoreFailed: i18nKey('Some apps could not be put back after this machine was rebuilt: {apps}'),
  source: i18nKey('Apps'),
});

const named = (code, msg, extra = {}) => { const e = new Error(msg); e.code = code; Object.assign(e, extra); return e; };
function writeJsonAtomic(file, obj) { const tmp = `${file}.${process.pid}.tmp`; fs.writeFileSync(tmp, JSON.stringify(obj, null, 2)); fs.renameSync(tmp, file); }
const sizeWords = (n) => A.fmtBytes(Math.max(0, Number(n) || 0));

/** A request as a person or an agent sends it → `{ok, request}` | `{ok:false, code, error}` (closed kinds, names by rule). */
function normRequest(r, { agent = false } = {}) {
  const x = r && typeof r === 'object' ? r : {};
  const kind = String(x.kind || 'apt');
  if (!REQUEST_KINDS.includes(kind)) return { ok: false, code: 'bad-request', error: `unknown request kind ${JSON.stringify(kind.slice(0, 20))}` };
  if (agent && !AGENT_KINDS.includes(kind)) return { ok: false, code: 'agent_forbidden', error: `an agent may propose ${AGENT_KINDS.join(' / ')} — ${kind} is the user's` };
  if (kind === 'apt' || kind === 'adopt') {
    const packages = (Array.isArray(x.packages) ? x.packages : String(x.packages || '').split(/[\s,]+/)).map(String).filter(Boolean);
    if (!packages.length || packages.length > 32) return { ok: false, code: 'bad_name', error: 'name one to 32 packages' };
    const bad = packages.find((p) => !A.PKG_RE.test(p));
    if (bad !== undefined) return { ok: false, code: 'bad_name', error: `${JSON.stringify(bad.slice(0, 64))} is not a Debian package name` };
    return { ok: true, request: { kind, packages } };
  }
  if (kind === 'deb') { const p = String(x.debPath || ''); if (!p.startsWith('/') || !p.endsWith('.deb') || p.length > 4096 || /[\0\n]/.test(p)) return { ok: false, code: 'bad_name', error: 'name a .deb file by its absolute path on that machine' }; return { ok: true, request: { kind, debPath: p } }; }
  if (kind === 'source') { const v = A.validateSourceSpec(x.source); return v.ok ? { ok: true, request: { kind, source: v.source } } : { ok: false, code: v.code, error: v.error }; }
  if (kind === 'source-remove') { const id = String(x.sourceId || ''); return A.ENTRY_ID_RE.test(id) ? { ok: true, request: { kind, sourceId: id } } : { ok: false, code: 'bad-request', error: 'name the source' }; }
  if (kind === 'remove') { const id = String(x.entryId || ''); return A.ENTRY_ID_RE.test(id) ? { ok: true, request: { kind, entryId: id } } : { ok: false, code: 'bad-request', error: 'name the app (its entry id)' }; }
  if (kind === 'replay') return { ok: true, request: { kind, ...(x.rung === 1 || x.rung === 2 ? { rung: x.rung } : {}) } };
  return { ok: true, request: { kind } };
}
const labelOf = (rq, plan = null) => (plan && plan.label) || (rq.packages ? rq.packages.join(' ') : rq.source ? rq.source.id : rq.entryId || rq.sourceId || (rq.debPath ? path.basename(rq.debPath) : rq.kind));
/** The `what` the package slot logs (`app:<kind>:<label>`) — only plain characters. */
const whatOf = (rq, plan) => `app:${rq.kind}:${String(labelOf(rq, plan)).toLowerCase().replace(/[^a-z0-9.+-]+/g, '-').replace(/^-+/, '').slice(0, 60) || 'x'}`;
/** The record op and its params for a run of request kind `k` after the slot ran plan `pl`. */
function recordOf(rq, pl, { by, why = null } = {}) {
  const k = rq.kind;
  if (k === 'apt' || k === 'deb') return ['app-install', { entryId: pl.entryId, nonce: pl.nonce, kind: k === 'deb' ? 'deb' : 'apt', by, why, label: pl.label || null, deb: pl.deb || null, source: pl.source && pl.source.startsWith('source:') ? pl.source.slice(7) : null }];
  if (k === 'adopt') return ['app-adopt-drift', { entryId: pl.entryId, nonce: pl.nonce, by, why, label: pl.label || null }];
  if (k === 'source') return ['app-install', { kind: 'source', sourceId: pl.entryId, nonce: pl.nonce, source: pl.sourceSpec, by }];
  if (k === 'source-remove') return ['app-remove', { kind: 'source', sourceId: pl.entryId, nonce: pl.nonce }];
  if (k === 'remove') return ['app-remove', { entryId: pl.entryId, nonce: pl.nonce }];
  return ['app-refresh', { nonce: pl.nonce, id: k === 'replay' ? 'replay' : 'refresh', mode: pl.mode }];
}

/**
 * @param access      src/server/desktop-access.js layer (call / installPackage / installBusy / planDigest / setAppPlanner)
 * @param userTodos   the For-you store (add / setStatus / onStatus)
 * @param deliver     the delivery ladder (stashFor / stashEntries / drainStash) — the result rides the next turn, free
 * @param activeSessions () => Map of live sessions (a proposer's name + key; a helper's session)
 * @param sessionStatusKey (session, id) => the For-you key of a session
 * @param broadcast   (msg) => every client — `apps-updated {host}`
 */
function create({ access, userTodos = null, deliver = null, activeSessions = () => new Map(), sessionStatusKey = null, broadcast = () => { }, dataDir, log = console, now = Date.now } = {}) {
  if (!access) throw new Error('apps-engine: access required');
  const file = dataDir ? path.join(dataDir, STORE_FILE) : null;
  let store = { proposals: [], helpers: [] };
  if (file) { try { const j = JSON.parse(fs.readFileSync(file, 'utf8')); if (j && Array.isArray(j.proposals)) store = { proposals: j.proposals, helpers: Array.isArray(j.helpers) ? j.helpers : [] }; } catch (e) { if (e.code !== 'ENOENT') log.warn?.(`[apps] ${STORE_FILE} unreadable (${e.message}) — starting empty, the file left in place`); } }
  const replaying = new Map(); // host → {since, rung}
  const lastStatus = new Map(); // host → {at, status}
  const waiters = new Map();   // proposal id → Set<fn>
  const save = () => {
    if (!file) return;
    const t = now();
    store.proposals = store.proposals.filter((p) => !TERMINAL.has(p.state) || t - (p.finishedAt || p.createdAt || t) < KEEP_MS).slice(-MAX_PROPOSALS);
    try { writeJsonAtomic(file, store); } catch (e) { log.warn?.(`[apps] ${STORE_FILE} not written: ${e.message}`); }
  };
  const bump = (host) => { try { broadcast({ type: 'apps-updated', host: host || 'local' }); } catch { /* no clients */ } };
  const get = (id) => store.proposals.find((p) => p.id === id) || null;
  const sessions = () => { try { return (typeof activeSessions === 'function' ? activeSessions() : activeSessions) || new Map(); } catch { return new Map(); } };
  const notify = (p) => { const s = waiters.get(p.id); if (s) for (const fn of [...s]) { try { fn(p); } catch { /* gone */ } } };
  /** ONE state move: the fields, then (`tell`) the proposer's stashed outcome, then the store, the broadcast and the
   *  waiters — in that order, so a `wait` that reads a terminal state can take back the copy it just read. */
  function setState(p, state, extra = {}, { tell = false } = {}) {
    Object.assign(p, extra, { state });
    if (TERMINAL.has(state)) p.finishedAt = now();
    if (tell) tellProposer(p);
    save(); bump(p.host); notify(p);
  }

  // ── the planner the access layer runs at Install (the machine's own app-plan) ──
  async function planner(hostId, what, planOpts) {
    const r = await access.call(hostId, 'app-plan', planOpts || {});
    return { plan: r.plan, install: r.install || null, facts: r.facts || null };
  }
  if (typeof access.setAppPlanner === 'function') access.setAppPlanner(planner);

  /** The plan the dialog SHOWS (+ its digest — the press names it). */
  async function plan(host, request, { agent = false } = {}) {
    const v = normRequest(request, { agent });
    if (!v.ok) throw named(v.code, v.error);
    const r = await access.call(host, 'app-plan', v.request);
    return { host: host || 'local', request: v.request, plan: r.plan, facts: r.facts || null, install: r.install || null, digest: typeof access.planDigest === 'function' ? access.planDigest(r.plan) : null };
  }
  /** The fresh plan of a proposal (the dialog opened from its For-you item). */
  async function planProposal(id) {
    const p = get(id);
    if (!p) throw named('not-found', `no proposal ${id}`);
    const shown = await plan(p.host, p.request);
    return { ...shown, proposal: view(p) };
  }
  async function search(host, query) {
    const r = await access.call(host, 'app-plan', { kind: 'search', query });
    return { host: host || 'local', results: r.results || [], code: r.code || null };
  }
  async function status(host) {
    const r = await access.call(host, 'app-status', {});
    lastStatus.set(host || 'local', { at: now(), status: r.status });
    const h = host || 'local';
    return { host: h, ...r.status, replaying: replaying.get(h) || null, proposals: store.proposals.filter((p) => p.host === h && !TERMINAL.has(p.state)).map(view), helpers: store.helpers.filter((x) => x.host === h) };
  }
  const view = (p) => ({ id: p.id, host: p.host, kind: p.request.kind, request: p.request, label: p.label, by: p.by, why: p.why || null, state: p.state, summary: p.summary || null, createdAt: p.createdAt, decidedAt: p.decidedAt || null, finishedAt: p.finishedAt || null, result: p.result || null, todoId: p.todoId || null });
  const summaryOf = (pl) => ({ newCount: pl.newCount || 0, upgradeCount: pl.upgradeCount || 0, downloadBytes: pl.downloadBytes || 0, installedBytes: pl.installedBytes || 0, origins: (pl.origins || []).slice(0, 8), packages: (pl.packages || []).slice(0, 32), replaySeconds: pl.replaySeconds || null, fingerprints: pl.sourceSpec ? pl.sourceSpec.fingerprints : null });

  // ── an agent's PROPOSAL ──
  /** `by` = {kind:'agent', sessionId, conversation, name, sessionKey}. Plans first — a plan the machine refuses is never
   *  filed (the agent hears the refusal by name); a filed proposal is ONE For-you item. */
  async function propose({ host = 'local', request, by, why = '' }) {
    if (!by || by.kind !== 'agent' || !by.conversation) throw named('bad-request', 'a proposal names its conversation');
    // verify-r1 F2: ONE open proposal (and ONE For-you card) per conversation × machine × request — the same ask again
    // answers the open one (asked before the plan AND after its await: two asks in flight are one)
    const v0 = normRequest(request, { agent: true });
    const openOne = () => (v0.ok ? store.proposals.find((x) => !TERMINAL.has(x.state) && x.host === (host || 'local') && x.by && x.by.conversation === by.conversation && JSON.stringify(x.request) === JSON.stringify(v0.request)) : null);
    const again = (x) => ({ ...view(x), again: true });
    if (openOne()) return again(openOne());
    const shown = await plan(host, request, { agent: true });
    const pl = shown.plan;
    if (!pl.ok) throw named(pl.code || 'refused', pl.error || 'the machine refused the plan', { plan: pl });
    if (openOne()) return again(openOne());
    // …and an app VibeSpace already keeps there, with nothing to install, is no proposal (never a card that does nothing)
    if (pl.nothing && pl.recorded) throw named('nothing', `${labelOf(shown.request, pl)} is already installed through VibeSpace on that machine — nothing to propose`, { plan: pl });
    const id = 'ap-' + crypto.randomBytes(3).toString('hex');
    const label = labelOf(shown.request, pl);
    const p = { id, host: host || 'local', request: shown.request, label, by: { kind: 'agent', sessionId: by.sessionId || null, conversation: by.conversation, name: by.name || null }, why: String(why || '').replace(HC.HIDDEN_RE, '').slice(0, 500), state: 'proposed', summary: summaryOf(pl), digest: shown.digest, createdAt: now() };
    store.proposals.push(p);
    if (userTodos && by.sessionKey) {
      const n = (pl.closure || []).length, size = sizeWords(pl.downloadBytes);
      const name = String(by.name || 'An agent').slice(0, 80);
      const k = shown.request.kind;
      const text = k === 'remove' ? `${name} wants to remove ${label}` : k === 'source' ? `${name} wants to add the package source ${label}` : n === 1 ? `${name} wants to install ${label} (${size} to download)` : `${name} wants to install ${label} (${n} packages, ${size} to download)`;
      const lines = [];
      if (p.why) lines.push(`Why: ${p.why}`);
      if (k === 'source') lines.push(`Address: ${shown.request.source.uris.join(' ')}`, `Key fingerprint: ${(pl.sourceSpec && pl.sourceSpec.fingerprints || []).join(' ')}`);
      else if (k !== 'remove') lines.push(`Packages: ${(pl.closure || []).map((c) => c.package).slice(0, 60).join(' ')}${n > 60 ? ` … (+${n - 60})` : ''}`, `From: ${(pl.origins || []).join(', ')}`, `Download ${size}, ${sizeWords(pl.installedBytes)} on disk`);
      else lines.push(`Removes: ${(pl.removes || []).join(' ') || '(nothing else)'}`);
      try {
        const it = userTodos.add(by.sessionKey, { origin: 'apps', kind: 'action', urgency: 'normal', by: 'agent', text, detail: lines.join('\n'), sessionName: name,
          action: { type: 'app-install', id, host: p.host, kind: k },
          i18n: { text: { key: k === 'remove' ? WORDS.wantsRemove : k === 'source' ? WORDS.wantsSource : n === 1 ? WORDS.wantsOne : WORDS.wants, params: { name, app: String(label).slice(0, 120), n, size } }, source: { key: WORDS.source } } });
        p.todoId = it && it.id;
      } catch (e) { log.warn?.(`[apps] proposal ${id} not filed in For you: ${e.message}`); store.proposals = store.proposals.filter((x) => x !== p); throw named('not_filed', `the proposal could not be shown to the user (${e.message}) — nothing was proposed`); }
    }
    save(); bump(p.host);
    log.log?.(`[apps] ${p.by.name || p.by.conversation} proposed ${k3(shown.request)} ${label} on ${p.host} (${id})`);
    return view(p);
  }
  const k3 = (rq) => (rq.kind === 'apt' ? 'installing' : rq.kind === 'remove' ? 'removing' : rq.kind === 'source' ? 'adding the source' : rq.kind);

  // ── THE RUN (the user's press — the dialog, or the For-you item's Install) ──
  /** Run a request (or a proposal) through the machine's ONE package slot, then the record op. Throws coded errors (the
   *  route streams them); `expectDigest` = the plan the dialog showed (plan_changed otherwise, nothing run). */
  async function run({ host = 'local', request = null, proposalId = null, expectDigest = null, by = { kind: 'user' }, onData = () => { }, onReattach = () => { } }) {
    let p = null, rq;
    if (proposalId) {
      p = get(proposalId);
      if (!p) throw named('not-found', `no proposal ${proposalId}`);
      if (p.state !== 'proposed') throw named('proposal_state', `that proposal is ${p.state}`);
      host = p.host; rq = p.request;
    } else {
      const v = normRequest(request);
      if (!v.ok) throw named(v.code, v.error);
      rq = v.request;
    }
    if (rq.kind === 'replay') replaying.set(host || 'local', { since: now(), rung: rq.rung || null });
    if (p) setState(p, 'installing', { decidedAt: now() });
    bump(host);
    let r;
    try { r = await access.installPackage(host, { what: whatOf(rq, null), planOpts: rq, expectDigest, onData, onReattach }); }
    catch (e) {
      if (p) { if (e && e.code === 'plan_changed') setState(p, 'proposed'); else setState(p, 'failed', { result: { code: e.code || 'install_failed', error: String(e.message || e).slice(0, 500) } }, { tell: true }); }
      throw e;
    } finally { if (rq.kind === 'replay') { replaying.delete(host || 'local'); bump(host); } }
    const pl = r.plan || {};
    const [op, params] = recordOf(rq, pl, { by: p ? { kind: 'agent', conversation: p.by.conversation, name: p.by.name } : by, why: p ? p.why : null });
    let rec;
    try { rec = await access.call(host, op, params); }
    catch (e) {
      const err = e && e.code === 'not_run' && r.reattached ? named('not_run', 'another install was running on that machine — it finished; press Install again') : e;
      if (p) setState(p, err.code === 'not_run' ? 'proposed' : 'failed', { result: { code: err.code || 'record_failed', error: String(err.message || err).slice(0, 500) } }, { tell: err.code !== 'not_run' });
      throw err;
    }
    const out = { done: true, host: host || 'local', kind: rq.kind, entryId: pl.entryId || null, label: labelOf(rq, pl), rows: (rec.rows || []).map((x) => ({ id: x.id, label: x.label })), reattached: !!r.reattached, run: rec.run || null, state: rec.state || null };
    if (p) {
      if (userTodos && p.todoId) { try { userTodos.setStatus(p.todoId, 'done', 'apps'); } catch { /* resolved already */ } }
      setState(p, 'done', { result: { entryId: out.entryId, rows: out.rows } }, { tell: true });
    }
    lastStatus.delete(host || 'local');
    bump(host);
    return out;
  }

  /** The proposer hears the outcome on its NEXT turn (the stash — free), once. */
  function tellProposer(p) {
    if (!deliver || typeof deliver.stashFor !== 'function' || !p.by || !p.by.conversation) return;
    const text = outcomeText(p);
    try { const st = deliver.stashFor(p.by.conversation, { source: 'agent', kind: 'notification', fromName: FROM_NAME, ref: p.id, text }); if (st && st.stored === false) log.warn?.(`[apps] ${p.id}: the outcome is queued in memory only — ${st.why}`); }
    catch (e) { log.warn?.(`[apps] ${p.id}: the outcome could not be queued for ${p.by.conversation}: ${e.message}`); }
  }
  /** The agent-facing sentence of a proposal's state (English — the agent's contract; the CLI prints it too). */
  function outcomeText(p) {
    const label = piece(p.label, 120);
    const what = p.request.kind === 'remove' ? `removing ${label}` : p.request.kind === 'source' ? `adding the package source ${label}` : `installing ${label}`;
    if (p.state === 'done') {
      const rows = (p.result && p.result.rows) || [];
      return `Your proposal ${p.id} (${what}) was approved by the user and is done.` + (rows.length ? ` Open it with: ${rows.map((x) => `vibespace-window open ${piece(x.id, 64)}`).join(' · ')}` : p.request.kind === 'apt' ? ' It added no desktop app (no .desktop file) — the programs are on PATH.' : '');
    }
    if (p.state === 'rejected') return `Your proposal ${p.id} (${what}) was declined by the user (Not now). Nothing was installed. Do not propose it again unless they ask.`;
    if (p.state === 'failed') return `Your proposal ${p.id} (${what}) was approved but failed: ${piece((p.result && p.result.error) || 'see the Desktop apps dialog', 400)}.`;
    if (p.state === 'installing') return `Your proposal ${p.id} (${what}) was approved and is installing.`;
    return `Your proposal ${p.id} (${what}) waits for the user (For you → Install).`;
  }
  /** The user said Not now (the item dismissed, or the dialog's button). */
  function reject(id, { by = 'user' } = {}) {
    const p = get(id);
    if (!p) throw named('not-found', `no proposal ${id}`);
    if (p.state !== 'proposed') throw named('proposal_state', `that proposal is ${p.state}`);
    setState(p, 'rejected', { decidedAt: now(), decidedBy: by }, { tell: true });
    if (userTodos && p.todoId) { try { if (userTodos.get(p.todoId)?.status === 'open') userTodos.setStatus(p.todoId, 'dismissed', 'apps'); } catch { /* gone */ } }
    return view(p);
  }
  if (userTodos && typeof userTodos.onStatus === 'function') {
    userTodos.onStatus((it, info) => {
      const st = info && info.status;
      if (!it || !it.action || it.action.type !== 'app-install' || (info && info.by === 'apps')) return;
      const p = get(it.action.id);
      if (!p) return;
      if (p.state === 'proposed' && (st === 'dismissed' || st === 'done')) { try { reject(p.id, { by: 'user' }); } catch { /* raced */ } }
    });
  }
  /** `vibespace-app wait` — resolves when the proposal leaves `since` (or at ms ≤ 100 s); a TERMINAL answer takes back the
   *  stashed copy of the same outcome (the agent read it here — told once). */
  function wait(id, { ms = WAIT_MAX_MS, since = null, conversation = null } = {}) {
    const p = get(id);
    if (!p) return Promise.reject(named('not-found', `no proposal ${id}`));
    if (conversation && p.by.conversation !== conversation) return Promise.reject(named('not-yours', `${id} is another conversation's proposal`));
    const settle = (q) => { if (TERMINAL.has(q.state)) takeBack(q); return { ...view(q), text: outcomeText(q) }; };
    const t = ms == null || ms === '' || !Number.isFinite(Number(ms)) ? WAIT_MAX_MS : Math.max(0, Math.min(WAIT_MAX_MS, Number(ms)));
    if (TERMINAL.has(p.state) || (since && p.state !== since) || t === 0) return Promise.resolve(settle(p));
    const from = since || p.state; // the state the caller saw — any move away from it answers
    return new Promise((resolve) => {
      const set = waiters.get(id) || new Set(); waiters.set(id, set);
      let timer = null;
      const done = (q) => { clearTimeout(timer); set.delete(fn); if (!set.size) waiters.delete(id); resolve(settle(q)); };
      const fn = (q) => { if (TERMINAL.has(q.state) || q.state !== from) done(q); };
      set.add(fn);
      timer = setTimeout(() => done(get(id) || p), t);
      timer.unref?.();
    });
  }
  function takeBack(p) {
    if (!deliver || typeof deliver.stashEntries !== 'function' || !p.by || !p.by.conversation) return;
    try { const mine = deliver.stashEntries(p.by.conversation).filter((e) => e && e.ref === p.id && e.fromName === FROM_NAME && !e.ho); if (mine.length) deliver.drainStash(p.by.conversation, new Set(mine)); } catch { /* the next turn tells it */ }
  }
  /** `vibespace-app add --kind …` — a user-level tool the agent installed as the user (HELD by its CLI's card): recorded. */
  async function recordUserKind(host, { kind, name, why = null, by }) {
    const r = await access.call(host, 'app-install', { kind, name, why, by });
    bump(host);
    return r;
  }
  /** An agent's own proposals (its conversation's). */
  function proposalsOf(conversation) { return store.proposals.filter((p) => p.by && p.by.conversation === conversation).map((p) => ({ ...view(p), text: outcomeText(p) })); }

  // ── after listen: the rebuilt machine's replay ──
  async function afterListen({ host = 'local' } = {}) {
    let st;
    try { st = await status(host); } catch (e) { log.warn?.(`[apps] boot: the apps status could not be read (${e.message})`); return { ran: false, error: e.message }; }
    const d = st.replay && st.replay.decision;
    if (!d || !d.run) { log.log?.(`[apps] boot: nothing to put back (${d ? d.why : 'no decision'})`); return { ran: false, why: d && d.why }; }
    log.log?.(`[apps] boot: putting ${st.entries.length} app(s) back (rung ${d.rung}: ${d.why}) — the rows read "restoring…" meanwhile`);
    const failed = new Set();
    let last = null, err = null;
    for (const rung of d.rung === 1 ? [1, 2] : [2]) {
      try { last = await run({ host, request: { kind: 'replay', rung }, by: { kind: 'user' } }); }
      catch (e) { err = e; log.warn?.(`[apps] boot: rung ${rung} failed (${e.code || ''} ${e.message})`); continue; }
      failed.clear();
      for (const [id, x] of Object.entries((last.run && last.run.entries) || {})) if (!x.ok) failed.add(id);
      if (!failed.size) { err = null; break; }
    }
    if ((failed.size || err) && userTodos) {
      const apps = failed.size ? [...failed].join(', ') : 'every app';
      try { userTodos.add(INBOX_KEY, { origin: 'apps', kind: 'notice', urgency: 'normal', by: 'agent', sessionName: 'Apps', text: `Some apps could not be put back after this machine was rebuilt: ${apps}`, detail: err ? `${err.code || 'error'}: ${err.message}` : 'Open Desktop apps to see each app and try again.', i18n: { text: { key: WORDS.restoreFailed, params: { apps } } } }); }
      catch (e) { log.warn?.(`[apps] boot: the restore notice was not filed: ${e.message}`); }
    }
    bump(host);
    return { ran: true, failed: [...failed], error: err ? err.code || err.message : null };
  }

  /** The catalog rows as a route serves them, worded by what THIS hub knows: restoring… while a replay runs there, the
   *  replay's own failure for an entry it could not put back. Mutates `listResult.registry` rows in place. */
  function decorate(host, listResult) {
    const h = host || 'local';
    const rep = replaying.get(h);
    const ls = lastStatus.get(h);
    const lastReplay = ls && ls.status && ls.status.state && ls.status.state.replay;
    for (const row of (listResult && listResult.registry) || []) {
      if (!row || !row.app || row.available) continue;
      if (rep) { row.reasonCode = 'restoring'; row.reason = 'restoring…'; continue; }
      const e = lastReplay && lastReplay.entries && lastReplay.entries[row.app];
      if (e && !e.ok) { row.reasonCode = 'restore-failed'; row.reason = `could not be put back after the rebuild (${e.code || 'failed'})`; }
    }
    return listResult;
  }
  const isReplaying = (host) => replaying.has(host || 'local');

  // ── "Let an agent help…" — the temporary helper session ──
  function addHelper({ host = 'local', sessionId, request = '' }) {
    if (!/^[A-Za-z0-9._-]{1,80}$/.test(String(sessionId || ''))) throw named('bad-request', 'bad session id');
    store.helpers = store.helpers.filter((x) => x.sessionId !== sessionId).concat({ host, sessionId, request: String(request).slice(0, 500), at: now() }).slice(-50);
    save(); bump(host);
    return store.helpers.find((x) => x.sessionId === sessionId);
  }
  function dropHelper(sessionId) { const n = store.helpers.length; store.helpers = store.helpers.filter((x) => x.sessionId !== sessionId); if (store.helpers.length !== n) { save(); bump('local'); } }
  const helperIds = () => new Set(store.helpers.map((x) => x.sessionId));

  return { plan, planProposal, search, status, propose, recordUserKind, run, reject, wait, proposalsOf, get: (id) => { const p = get(id); return p ? view(p) : null; }, outcomeText: (id) => { const p = get(id); return p ? outcomeText(p) : null; }, afterListen, decorate, isReplaying, addHelper, dropHelper, helperIds, helpers: () => store.helpers.slice(), planner, storeFile: file };
}

module.exports = { create, normRequest, recordOf, whatOf, STORE_FILE, FROM_NAME, INBOX_KEY, WAIT_MAX_MS, PROPOSAL_STATES, REQUEST_KINDS, AGENT_KINDS, WORDS };
