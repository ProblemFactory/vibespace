'use strict';
/**
 * THE DELIVERABLE REGISTRY (lane artifacts-model; the rows, reducer and view are src/artifacts.js — PURE). The rows of a
 * conversation live on the live session (`session._artifacts`, session-schema row) and persist in its session-meta
 * `artifacts` (debounced 1.5 s like `taskRecords`); a restart restores them (boot-restore) and every rebuild re-derives
 * them from the transcript and merges (normalizers.convertWithCards → `opts.artifacts`). ONE writer:
 *   · observe(session, record) — every harness's stdout consumer (claude: the parse AND the device feed's
 *     claudeSideEffects; codex-events; acp-events) hands each record here; the session's DESCRIPTOR reads it
 *     (`artifactsOf`, src/harnesses/artifacts-of.js — never an id branch here; a `null` hook never produces).
 *     A HELPER's writes (lane artifacts-handover): a record that ENDS a Task / workflow agent names its transcript
 *     (the descriptor's `helperTranscriptsOf`, src/harnesses/helper-transcripts.js); its write records go through the
 *     SAME `artifactsOf` and land as THIS conversation's rows with `via: {kind:'subagent', name}` — live here, and the
 *     rebuild's deriver asks the same door (normalizers' helper seam). A stream record stamped as a sidechain's is left
 *     to that door (one birth, at the Task's end, with its `via`).
 *   · handover({from, to, items, reach}) — `vibespace-msg send <agent> "…" --artifact <path>…`: the helper's OWN rows
 *     land as the receiver's rows with `via: {kind:'handover', from}`; a design re-registers under the receiver and
 *     opens its Design window; the helper's row keeps `handedTo`.
 *   · presentAsk(session, artifacts, {id}) — `vibespace-ask … --artifact <path|/p/id>…` (lane foryou-attachments): each
 *     attachment the ask carries is a `present` op (AF.askOp) on the asking conversation's rows — its Artifacts list shows
 *     what it asked the owner to look at; `judgeAsk` (the route's submit check) proved each one OPENS before anything is filed
 *   · touch({sessionId, host, path, summary}) — the user's own save in an editor window linked to the chat
 *     (ws `artifact-touch`): the row gets `by: user, edits+1` and the conversation hears ONE next-turn note.
 * THE REGISTRIES (lane artifacts-registries) — the three stores' ONE notification points hand their records here; the
 * registry is a VIEW over them (each keeps its store and its own list — the Pages list, the Design window's Home):
 *   · notePage(page, extra)  — src/server/published-pages.js `onPublished` (server.js): a `page` row, unpublish = its state
 *   · noteDesign(design)     — src/server/design-engine.js `onDesign` (designs.json at registration / open / rename)
 *   · noteUploads({sessionId, host, files}) — POST /api/upload when the composer names its chat (src/routes/files.js)
 *   · noteService(job)       — src/jobs.js `_serviceDoor` (jobs-wiring `onService`): a job its conversation OWNS that
 *     listens on a port is a `service` row (lane artifacts-services) — DERIVED at every read (`servicesOf`), never stored
 *   · noteForwards(msg)      — the PortForwardManager's `port-forwards-updated` broadcast (server.js): a service row's
 *     LINK reads the port's forward record (published ⇒ its public URL, else this instance's /proxy/ — lane
 *     artifacts-services-url), so a publish / unpublish patches the live service cards in place
 *   · presented pages (lane pages-chip-groups) — a /p/<id> link in a TEXT record (the hook's `present` ops, live AND
 *     rebuild) is a `page` row with `presented: true`; `listFor` resolves it against the pages store at every read
 *     (AF.resolvePresented), a birth or a page's later publish / unpublish tells the conversation's clients
 *     (`artifacts-changed` → they re-read GET /api/artifacts — the one feed)
 *   At every rebuild the pages + designs rows come back from THEIR stores (`storeRowsOf`, normalizers' store-rows seam);
 *   the uploads live in the persisted rows (the composer's attachment record IS this registry).
 * THE CONTRACT TOWARD doc-window (spelled in src/artifacts.js's header + kb-file-structure):
 *   ownerOf({host, path}) → {sessionId, row} | null     noteEdit({sessionId, host, path, summary}) → boolean
 */
const AF = require('../artifacts.js');
const { toAgentText: agentText } = require('../peer-text.js');
const DOC_EDIT_FROM = 'Doc edit'; // the stash's `doc-edit` source (lane doc-window): drained as "the user edited a document:" + the re-read hint

let deps = { activeSessions: () => new Map(), deliver: null, sessionMeta: null, pages: () => null, designs: () => null, jobs: () => null, ports: () => null, instanceUrl: null, toSession: null, log: console };
/** server.js's ONE line: the live sessions, the delivery ladder (stashFor), the session-meta store and the two stores
 *  a rebuild reads its pages / designs rows from. */
function configure(d = {}) {
  deps = { ...deps, ...d };
  try { normalizers().setArtifactStoreSource(storeRowsOf); } catch (e) { deps.log.warn?.(`[artifacts] store-rows seam not set: ${e.message}`); }
  try { normalizers().setArtifactServiceSource(servicesOf); } catch (e) { deps.log.warn?.(`[artifacts] service-rows seam not set: ${e.message}`); }
  try { normalizers().setArtifactHelperSource(helperOps); } catch (e) { deps.log.warn?.(`[artifacts] helper seam not set: ${e.message}`); }
  return api;
}
const sessions = () => { try { const m = deps.activeSessions(); return m && typeof m.entries === 'function' ? m : new Map(); } catch { return new Map(); } };
const normalizers = () => require('../normalizers.js'); // lazy: the normalizers require the harness registry

/** The session's descriptor hook — null when its harness declares none (a plain shell) or is unknown. */
function hookOf(session) {
  try { const h = require('../harnesses').harnessOf((session && session.backend) || 'claude'); return h && typeof h.artifactsOf === 'function' ? h.artifactsOf : null; } catch { return null; }
}

function persistSoon(session) {
  const store = deps.sessionMeta && deps.sessionMeta();
  if (!store || !session.sockName) return;
  clearTimeout(session._artifactsTimer);
  session._artifactsTimer = setTimeout(() => {
    try { store.writeSessionMeta(session.sockName, { ...(store.readSessionMeta(session.sockName) || {}), artifacts: session._artifacts || {} }); }
    catch (e) { deps.log.warn?.(`[artifacts] ${session.sockName}: rows not persisted: ${e.message}`); }
  }, 1500);
  if (session._artifactsTimer && session._artifactsTimer.unref) session._artifactsTimer.unref();
}

/** Fold ONE op into the session's rows; a deliverable's card is fed (born or patched in place). */
function noteOp(session, op) {
  const r = AF.apply(session._artifacts || {}, { host: session.host || '', cwd: session.cwd || '', ...op, at: Number(op.at) || Date.now() });
  if (r.skipped || !r.row) return r;
  session._artifacts = r.rows;
  if (r.evicted.length) deps.log.log?.(`[artifacts] ${session.sockName || '?'}: ${r.evicted.length} row(s) evicted past ${AF.MAX_ROWS} (oldest code first): ${r.evicted.slice(0, 3).join(', ')}`);
  if (AF.cardWorthy(r.row)) {
    const block = AF.cardBlock(r.row);
    if (AF.autoOpenVerdict(r)) block.autoOpen = true; // the client opens it beside the chat (setting artifacts.autoOpenDocs) on the LIVE create only
    try { normalizers().feedArtifactCard(session, block); } catch (e) { deps.log.warn?.(`[artifacts] card not fed: ${e.message}`); }
  }
  persistSoon(session);
  if (r.row.presented) { if (r.born) tellChanged(session); return r; } // lane pages-chip-groups: a page shown here — no file to index
  require('./search-index.js').noteArtifact({ sessionId: session.sockName || null, host: r.row.host || session.host || '', path: r.row.path }); // lane global-search: every new / edited row's file is (re)indexed
  return r;
}

/** THE LIVE CONSUMER: one record of a session's stdout (any harness) → its rows. Never throws. */
function observe(session, record) {
  if (!session || !record) return 0;
  const of = hookOf(session);
  if (!of) return 0;
  if (record.parent_tool_use_id || record.isSidechain) return 0; // a helper's own record: the helper door folds it at the Task's end (with its `via`)
  let ops = [];
  try { ops = of(record) || []; } catch { return 0; }
  if (record.type === 'user') { if (!session._helperArtifacts) session._helperArtifacts = { runs: new Map(), seen: new Set() }; ops = ops.concat(helperOps(session, record, session._helperArtifacts)); }
  let n = 0;
  for (const o of ops) { try { if (!noteOp(session, { ...o, by: 'agent' }).skipped) n++; } catch (e) { deps.log.warn?.(`[artifacts] op skipped: ${e.message}`); } }
  return n;
}

// ── THE HELPER DOOR (lane artifacts-handover) ──
/** The ops a record that ENDS a helper brings: the helper transcript's write records through the session's own
 *  `artifactsOf`, each tagged `via`. `state` = {runs: Map (workflow launches), seen: Set (op ids already folded — the
 *  parse + the device feed, or a background agent read at its launch and again at its end, fold an op once)}.
 *  A remote conversation (host ≠ '') reads nothing (its sidechains are on its machine; none is fetched). */
function helperOps(session, record, state = { runs: new Map(), seen: new Set() }) {
  if (!session || !record || record.type !== 'user' || (session.host && session.host !== 'local')) return [];
  let h = null;
  try { h = require('../harnesses').harnessOf(session.backend || 'claude'); } catch { h = null; }
  const of = h && h.artifactsOf, helpers = h && h.helperTranscriptsOf;
  if (typeof of !== 'function' || typeof helpers !== 'function') return [];
  let files = [];
  try { files = helpers(record, { sessionId: session.claudeSessionId || session.backendSessionId || null, cwd: session.cwd || '', runs: state.runs }) || []; } catch { return []; }
  const out = [];
  for (const { file, via } of files) {
    for (const rec of require('../harnesses/helper-transcripts.js').readRecords(file)) {
      let ops = [];
      try { ops = of(rec) || []; } catch { ops = []; }
      for (const o of ops) {
        const id = o.id ? 'sub:' + o.id : null;
        if (id && state.seen) { if (state.seen.has(id)) continue; state.seen.add(id); }
        out.push({ ...o, id, via, cwd: rec.cwd || session.cwd || '' });
      }
    }
  }
  return out;
}

// ── THE HAND-OVER (lane artifacts-handover) — a helper CONVERSATION's own rows → its upstream conversation ──
/** `from` = {cid, name, session} (the helper's live session holds its rows); `to` = [cid]; `items` = paths / page links;
 *  `reach(cid)` → boolean = the message's reach (msg-acl, the groups engine) — REQUIRED, never assumed.
 *  Every refusal names the item: ≤ MAX_HANDOVER items; the item must be the helper's OWN row; the receiver must be
 *  reachable and live here, on the row's machine. A design re-registers under the receiver (the Design window's home
 *  lists it "via <helper>") and opens on the receiver's screen. No turn is started here (the message's notify decides). */
function handover({ from = {}, to = [], items = [], reach = null, at = Date.now() } = {}) {
  const list = (Array.isArray(items) ? items : []).map((x) => String(x || '').trim()).filter(Boolean);
  if (!list.length) return { ok: false, code: 'bad-request', error: 'name what to hand over: --artifact <path>' };
  if (list.length > AF.MAX_HANDOVER) return { ok: false, code: 'too-many', error: `${list.length} items — at most ${AF.MAX_HANDOVER} per hand-over` };
  if (typeof reach !== 'function') return { ok: false, code: 'no-reach', error: 'hand-over needs the message reach check' };
  const helper = from.session;
  if (!helper || !from.cid) return { ok: false, code: 'bad-member', error: 'the helper has no live session here' };
  const fromRef = { cid: String(from.cid), name: String(from.name || helper.name || '') };
  const handed = [], refused = [];
  const rows = [];
  for (const it of list) {
    const row = AF.rowFor(helper._artifacts || {}, it, helper.host || '');
    if (!row) { refused.push({ item: it, why: 'not-yours', error: `${it} is not an artifact of this conversation (only a file it wrote, a design it opened or a page it published can be handed over)` }); continue; }
    rows.push({ it, row });
  }
  const receivers = [];
  for (const cid of [...new Set((Array.isArray(to) ? to : [to]).map(String).filter(Boolean))]) {
    if (cid === fromRef.cid) continue;
    if (!reach(cid)) { refused.push({ to: cid, why: 'unreachable', error: `${cid} is not reachable from this conversation (the message rules: vibespace-msg list)` }); continue; }
    const live = [...sessions()].filter(([, s]) => s && conversationOf(s) === cid);
    if (!live.length) { refused.push({ to: cid, why: 'not-live', error: `${cid} has no live session on this server` }); continue; }
    receivers.push({ cid, live });
  }
  for (const { cid, live } of receivers) {
    for (const { it, row } of rows) {
      const [sid, s] = live[0];
      if ((row.host || '') !== (s.host && s.host !== 'local' ? s.host : '')) { refused.push({ item: it, to: cid, why: 'other-machine', error: `${it} is on ${row.host || 'this server'}; ${cid} runs on ${s.host || 'this server'}` }); continue; }
      const op = AF.handoverOp(row, { from: fromRef, at });
      for (const [, rs] of live) noteOp(rs, op);
      if (row.kind === 'design') { // the Design window's registry: the receiver's now; its window opens for the user
        try {
          const de = deps.designs && deps.designs();
          const r = de && typeof de.register === 'function' ? de.register({ host: row.host || null, dir: row.path, sessionId: sid, conversationId: cid, via: fromRef }) : null;
          if (r && r.ok && typeof de.openOn === 'function') de.openOn(s, sid, r.design);
        } catch (e) { deps.log.warn?.(`[artifacts] design hand-over not registered: ${e.message}`); }
      }
      const marked = AF.markHanded(helper._artifacts || {}, row.key, { cid, name: s.name || '', at });
      if (marked) { helper._artifacts = marked; persistSoon(helper); try { normalizers().feedArtifactCard(helper, AF.cardBlock(marked[row.key])); } catch { } }
      handed.push({ item: it, to: cid, toName: s.name || '', kind: row.kind, path: row.path });
    }
  }
  return { ok: handed.length > 0, handed, refused, ...(handed.length ? {} : { code: 'nothing-handed', error: (refused[0] && refused[0].error) || 'nothing handed over' }) };
}

// ── WHAT AN ASK SHOWS (lane foryou-attachments, owner 2026-10-09 21:42Z, binding: "artifact attachment 必须要在 agent 提交的时候
// 检查 validity，确保用户收到的时候可以打开，不然就提醒 agent 重发") ──
const ASK_MANIFEST = 'design.json'; // src/design-model.js MANIFEST_FILE — a design folder is one that holds it
const errWhy = (e) => { const s = String((e && (e.code || '')) + ' ' + ((e && e.message) || '')); return /EACCES|EPERM|permission denied/i.test(s) ? 'unreadable' : /ENOENT|ENOTDIR|no such file|not found/i.test(s) ? 'missing' : 'unopenable'; };
/** THE SUBMIT JUDGE: every --artifact must OPEN for the owner — a file exists and is readable on the ASKING conversation's
 *  host (a remote host through RemoteFs `info`, never a local stat of a remote path; locally the SafeFs door: `stat`, then a
 *  one-byte `readChunk` = R_OK; a link whose target is gone fails the stat), a folder only as a design (its design.json
 *  readable), a /p/<id> registered on this server AND published. `items` = absolute paths / page links (the CLI made them
 *  absolute against its shell's cwd); `fsCall(op, payload)` = the SafeFs call; `remote` = the RemoteFs.
 *  → {artifacts: [{kind, host, path|page, name, url?}], bad: [{item, why, error}]} — ANY bad ⇒ the route files NOTHING. */
async function judgeAsk({ session = null, items = [], fsCall = null, remote = null } = {}) {
  const host = session && session.host && session.host !== 'local' ? String(session.host) : '';
  const cwd = (session && session.cwd) || '';
  const artifacts = [], bad = [];
  const where = host ? `on ${host}` : 'on this machine';
  const probe = async (p) => {
    if (host) {
      if (!remote || typeof remote.info !== 'function') throw Object.assign(new Error(`${host} cannot be reached for files`), { code: 'no-remote' });
      const i = await remote.info(host, p);
      return { dir: !!(i && i.isDirectory) };
    }
    const st = await fsCall('stat', { path: p });
    if (!st || !st.isDirectory) await fsCall('readChunk', { path: p, offset: 0, length: 1 }); // R_OK: an unreadable file throws EACCES here
    return { dir: !!(st && st.isDirectory) };
  };
  for (const raw of items) {
    const item = String(raw || '').trim();
    const pm = /^\/p\/([\w-]+)\/?$/.exec(item);
    if (pm) {
      const store = deps.pages && deps.pages();
      let hit = null;
      try { hit = store && typeof store.byId === 'function' ? store.byId(pm[1]) : null; } catch { hit = null; }
      if (!hit) { bad.push({ item, why: 'no-page', error: `${item}: no such page on this server — publish the file first (vibespace-page publish <file>) and attach the /p/<id> it prints` }); continue; }
      if (!hit.page) { bad.push({ item, why: 'unpublished', error: `${item}: not published (it was taken down) — publish it again first (vibespace-page publish <file>)` }); continue; }
      artifacts.push({ kind: 'page', host: '', page: pm[1], name: String(hit.page.name || pm[1]).slice(0, 200), url: '/p/' + pm[1] });
      continue;
    }
    const p = AF.absPath(item, cwd).replace(/\/+$/, '') || item;
    if (!p.startsWith('/')) { bad.push({ item, why: 'not-absolute', error: `${item}: not a path this server can open — pass a path (absolute, or relative to your shell's cwd) or a /p/<id> page link` }); continue; }
    let r;
    try { r = await probe(p); } catch (e) {
      const why = errWhy(e);
      bad.push({ item, why, error: why === 'missing' ? `${item}: no such file ${where} — check the path (absolute against your shell's cwd); a link whose target is gone counts as missing`
        : why === 'unreadable' ? `${item}: not readable ${where} (permission denied) — make it readable (chmod a+r) or attach a readable copy`
        : `${item}: cannot be opened ${where} (${String((e && e.message) || e).slice(0, 160)}) — check the path and run vibespace-ask again` });
      continue;
    }
    if (r.dir) {
      try { const m = await probe(p + '/' + ASK_MANIFEST); if (m.dir) throw Object.assign(new Error('a folder'), { code: 'ENOENT' }); }
      catch { bad.push({ item, why: 'folder', error: `${item}: a folder without ${ASK_MANIFEST} — attach a file in it, or a design folder (vibespace-design new|open makes one)` }); continue; }
      artifacts.push({ kind: 'design', host, path: p, name: AF.baseName(p) });
    } else artifacts.push({ kind: 'file', host, path: p, name: AF.baseName(p) });
  }
  return { artifacts, bad };
}
/** A filed ask's attachments → the asking conversation's rows (ONE `present` op each through noteOp — the one writer). */
function presentAsk(session, artifacts, { id = '', at = Date.now() } = {}) {
  if (!session || !Array.isArray(artifacts)) return 0;
  let n = 0;
  artifacts.forEach((a, k) => {
    const op = AF.askOp(a, { at, id: id ? `ask:${id}:${k}` : '' });
    if (!op) return;
    try { if (!noteOp(session, { ...op, by: 'agent' }).skipped) n++; } catch (e) { deps.log.warn?.(`[artifacts] ask attachment not shown: ${e.message}`); }
  });
  return n;
}

// ── THE REGISTRIES (lane artifacts-registries) ──
/** A published page's notification (onPublished: publish / re-publish / flags / unpublish) → its conversation's row; every
 *  OTHER conversation that shows its link hears `artifacts-changed` (its presented row re-resolves: a new name, gone). */
function notePage(page, extra = {}) {
  if (page && page.id) for (const [, s] of sessions()) if (s && s._artifacts && s._artifacts[AF.keyOf('', '/p/' + page.id)]) tellChanged(s);
  const session = page && page.sessionId ? sessions().get(page.sessionId) : null;
  const op = session ? AF.pageOp(page, { removed: !!(extra && extra.removed) }) : null;
  return op ? noteOp(session, op) : null;
}
/** A design's registry write (designs.json: registration / open / rename) → its conversation's row; a removal leaves it. */
function noteDesign(design, extra = {}) {
  const session = design && design.sessionId && !(extra && extra.removed) ? sessions().get(design.sessionId) : null;
  const op = session ? AF.designOp(design) : null;
  return op ? noteOp(session, op) : null;
}
/** The composer's upload (the route's result rows) → one `upload` row by: user per file. */
function noteUploads({ sessionId, host = '', files = [] } = {}) {
  const session = sessionId ? sessions().get(String(sessionId)) : null;
  if (!session) return 0;
  let n = 0;
  for (const f of files || []) { const op = AF.uploadOp(f, { host: host || session.host || '' }); if (op && !noteOp(session, op).skipped) n++; }
  return n;
}
/** The rebuild's third input (normalizers' store-rows seam): this conversation's pages + designs, from their stores. */
function storeRowsOf(session, sessionId) {
  const id = sessionId || (session && session.sockName);
  if (!id) return {};
  const ask = (store) => { try { const s = store && store(); return s && typeof s.list === 'function' ? s.list({ sessionId: id }) || [] : []; } catch { return []; } };
  return AF.storeRows({ pages: ask(deps.pages), designs: ask(deps.designs) });
}

// ── THE SERVICES (lane artifacts-services) — the jobs door: a job this conversation OWNS that listens on a port ──
const conversationOf = (session) => { try { return require('../claude-lock-capture.js').addressableId(session); } catch { return null; } };
const instanceBase = () => { try { return (deps.instanceUrl && deps.instanceUrl.url && deps.instanceUrl.url()) || ''; } catch { return ''; } };
const jobsList = () => { try { const jm = deps.jobs && deps.jobs(); return jm && jm.jobs ? [...jm.jobs.values()] : []; } catch { return []; } };
/** lane artifacts-services-url: the Ports panel's forward records (src/port-forward.js list()) — a row's link ladder reads them */
const forwardsList = () => { try { const pf = deps.ports && deps.ports(); return pf && typeof pf.list === 'function' ? pf.list() : []; } catch { return []; } };
const linkFacts = () => ({ now: Date.now(), base: instanceBase(), forwards: forwardsList() });
/** A conversation's service rows, DERIVED from the jobs engine at every read (AF.serviceRows: the lineage rule, the 24 h
 *  stopped window) — never folded into `session._artifacts`, never persisted. */
function servicesOf(session) {
  const cid = conversationOf(session);
  return cid ? AF.serviceRows(jobsList(), { cid, ...linkFacts() }) : {};
}
/** THE JOBS DOOR (src/jobs.js `_serviceDoor` via jobs-wiring's `onService`): a job's service facts moved (first listen,
 *  a moved port, stopped, up again) ⇒ its owner conversation's card is born at the first listen, then patched in place. */
function noteService(job) {
  const cid = AF.jobOwnerCid(job);
  const row = cid ? AF.serviceRow(job, linkFacts()) : null;
  if (!row) return 0;
  let n = 0;
  for (const [, s] of sessions()) {
    if (!s || conversationOf(s) !== cid) continue;
    try { if (normalizers().feedArtifactCard(s, AF.cardBlock(row))) n++; } catch (e) { deps.log.warn?.(`[artifacts] service card not fed: ${e.message}`); }
  }
  return n;
}
/** THE PORTS DOOR (lane artifacts-services-url): the PortForwardManager's `port-forwards-updated` broadcast (server.js hands
 *  every broadcast here — no timer of our own) ⇒ each live service card is re-fed with its link; publish / unpublish / a
 *  moved forward patches the card IN PLACE (an unchanged block is no edit — normalizers' patch compares). */
function noteForwards(msg) {
  if (!msg || msg.type !== 'port-forwards-updated') return 0;
  const facts = { ...linkFacts(), forwards: Array.isArray(msg.forwards) ? msg.forwards : forwardsList() };
  const byCid = new Map();
  for (const j of jobsList()) {
    const cid = j && j.listen ? AF.jobOwnerCid(j) : null;
    const row = cid ? AF.serviceRow(j, facts) : null;
    if (row) (byCid.get(cid) || byCid.set(cid, []).get(cid)).push(row);
  }
  let n = 0;
  if (!byCid.size) return n;
  for (const [, s] of sessions()) {
    const rows = s && byCid.get(conversationOf(s));
    for (const row of rows || []) { // patch only (a card is born at the first listen — noteService — or by a rebuild); a running rebuild queues it
      const b = AF.cardBlock(row);
      try { if (s._rebuildQueue ? normalizers().feedArtifactCard(s, b) : normalizers().patchArtifactCard(s._normalizer, b)) n++; } catch (e) { deps.log.warn?.(`[artifacts] service card not re-fed: ${e.message}`); }
    }
  }
  return n;
}

function registries() {
  const out = [];
  for (const [sessionId, s] of sessions()) if (s && s._artifacts) out.push({ sessionId, rows: s._artifacts });
  return out;
}
/** THE CONTRACT (doc-window): the newest conversation whose registry holds {host, path}. */
function ownerOf({ host, path } = {}) { return AF.ownerOfIn(registries(), { host, path }); }
/** THE CONTRACT (doc-window): ONE next-turn note to the conversation through the stash — free, never a billed wake. */
function noteEdit({ sessionId, host, path, summary } = {}) {
  require('./search-index.js').noteArtifact({ sessionId, host, path }); // lane global-search: the saved file is re-read into the index
  const session = sessions().get(sessionId);
  if (!session || !deps.deliver || typeof deps.deliver.stashFor !== 'function') return false;
  let cid = null;
  try { cid = require('../claude-lock-capture.js').addressableId(session); } catch { cid = null; }
  if (!cid) return false;
  const st = deps.deliver.stashFor(cid, { source: 'doc-edit', kind: 'peer', fromName: DOC_EDIT_FROM, ref: 'artifact:' + AF.keyOf(host, path), text: agentText(AF.editNoteText({ path, summary }), { kind: 'block', max: 1200 }) }); // the Doc window's summary names the FILE's section headings ⇒ the belt
  return !(st && st.stored === false && st.queued === false);
}
/** The user's own save (ws `artifact-touch`): the row gets by:user edits+1, the card is patched, the agent hears it. */
function touch({ sessionId, host, path, summary } = {}) {
  const session = sessions().get(sessionId);
  if (!session || typeof path !== 'string' || !path.startsWith('/')) return { ok: false, error: 'no-session-or-path' };
  const r = noteOp(session, { host, path, op: 'edit', by: 'user' });
  if (r.skipped) return { ok: false, error: r.skipped };
  return { ok: true, noted: noteEdit({ sessionId, host, path, summary }), row: r.row };
}

/** lane pages-chip-groups: the conversation's clients re-read the list (the chat view's GET /api/artifacts) — no payload. */
function tellChanged(session) {
  if (!session || !session.sockName || typeof deps.toSession !== 'function') return;
  try { deps.toSession(session, session.sockName, { type: 'artifacts-changed', sessionId: session.sockName }); } catch (e) { deps.log.warn?.(`[artifacts] artifacts-changed not sent: ${e.message}`); }
}
/** The presented page rows of `s`, resolved against the pages store NOW (AF.resolvePresented): this conversation's own
 *  page (its session id or conversation id) drops out; the publisher's name = its live session's. */
function presentedResolved(s, sessionId, rows) {
  const store = (() => { try { return deps.pages && deps.pages(); } catch { return null; } })();
  const cid = conversationOf(s);
  const live = [...sessions()];
  const nameOf = (p) => { const hit = (p.sessionId && sessions().get(p.sessionId)) || (p.conversationId && (live.find(([, x]) => x && conversationOf(x) === p.conversationId) || [])[1]); return (hit && hit.name) || ''; };
  return AF.resolvePresented(rows, { pageOf: (id) => (store && typeof store.byId === 'function' ? store.byId(id) : null), own: (p) => (p.sessionId && p.sessionId === sessionId) || (!!cid && p.conversationId === cid), base: instanceBase(), nameOf });
}
/** The Artifacts chip's list (the chat status bar asks on attach and after each card op): `view(rows)` as blocks. */
function listFor(sessionId) {
  const s = sessions().get(String(sessionId || ''));
  const v = AF.view({ ...(s ? presentedResolved(s, String(sessionId), s._artifacts || {}) : {}), ...(s ? servicesOf(s) : {}) }); // + the derived service rows; the presented pages resolved (lane pages-chip-groups)
  return { ok: true, items: v.items.map(AF.cardBlock), code: v.code.map(AF.cardBlock), count: v.count, codeCount: v.codeCount, full: v.full };
}
function mount(app) { app.get('/api/artifacts', (req, res) => res.json(listFor(req.query && req.query.sessionId))); return api; }

const api = { configure, mount, listFor, observe, helperOps, handover, judgeAsk, presentAsk, ownerOf, noteEdit, touch, notePage, noteDesign, noteUploads, storeRowsOf, servicesOf, noteService, noteForwards, DOC_EDIT_FROM };
module.exports = api;
