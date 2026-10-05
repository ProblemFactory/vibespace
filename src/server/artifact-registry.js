'use strict';
/**
 * THE DELIVERABLE REGISTRY (lane artifacts-model; the rows, reducer and view are src/artifacts.js — PURE). The rows of a
 * conversation live on the live session (`session._artifacts`, session-schema row) and persist in its session-meta
 * `artifacts` (debounced 1.5 s like `taskRecords`); a restart restores them (boot-restore) and every rebuild re-derives
 * them from the transcript and merges (normalizers.convertWithCards → `opts.artifacts`). ONE writer:
 *   · observe(session, record) — every harness's stdout consumer (claude: the parse AND the device feed's
 *     claudeSideEffects; codex-events; acp-events) hands each record here; the session's DESCRIPTOR reads it
 *     (`artifactsOf`, src/harnesses/artifacts-of.js — never an id branch here; a `null` hook never produces).
 *   · touch({sessionId, host, path, summary}) — the user's own save in an editor window linked to the chat
 *     (ws `artifact-touch`): the row gets `by: user, edits+1` and the conversation hears ONE next-turn note.
 * THE CONTRACT TOWARD doc-window (spelled in src/artifacts.js's header + kb-file-structure):
 *   ownerOf({host, path}) → {sessionId, row} | null     noteEdit({sessionId, host, path, summary}) → boolean
 */
const AF = require('../artifacts.js');
const { toAgentText: agentText } = require('../peer-text.js');
const DOC_EDIT_FROM = 'Doc edit'; // the stash's `doc-edit` source (lane doc-window): drained as "the user edited a document:" + the re-read hint

let deps = { activeSessions: () => new Map(), deliver: null, sessionMeta: null, log: console };
/** server.js's ONE line: the live sessions, the delivery ladder (stashFor) and the session-meta store. */
function configure(d = {}) { deps = { ...deps, ...d }; return api; }
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
  const r = AF.apply(session._artifacts || {}, { host: session.host || '', cwd: session.cwd || '', ...op, at: Date.now() });
  if (r.skipped || !r.row) return r;
  session._artifacts = r.rows;
  if (r.evicted.length) deps.log.log?.(`[artifacts] ${session.sockName || '?'}: ${r.evicted.length} row(s) evicted past ${AF.MAX_ROWS} (oldest code first): ${r.evicted.slice(0, 3).join(', ')}`);
  if (AF.cardWorthy(r.row)) {
    const block = AF.cardBlock(r.row);
    if (AF.autoOpenVerdict(r)) block.autoOpen = true; // the client opens it beside the chat (setting artifacts.autoOpenDocs) on the LIVE create only
    try { normalizers().feedArtifactCard(session, block); } catch (e) { deps.log.warn?.(`[artifacts] card not fed: ${e.message}`); }
  }
  persistSoon(session);
  return r;
}

/** THE LIVE CONSUMER: one record of a session's stdout (any harness) → its rows. Never throws. */
function observe(session, record) {
  if (!session || !record) return 0;
  const of = hookOf(session);
  if (!of) return 0;
  let ops = [];
  try { ops = of(record) || []; } catch { return 0; }
  let n = 0;
  for (const o of ops) { try { if (!noteOp(session, { ...o, by: 'agent' }).skipped) n++; } catch (e) { deps.log.warn?.(`[artifacts] op skipped: ${e.message}`); } }
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

/** The Artifacts chip's list (the chat status bar asks on attach and after each card op): `view(rows)` as blocks. */
function listFor(sessionId) {
  const s = sessions().get(String(sessionId || ''));
  const v = AF.view((s && s._artifacts) || {});
  return { ok: true, items: v.items.map(AF.cardBlock), code: v.code.map(AF.cardBlock), count: v.count, codeCount: v.codeCount, full: v.full };
}
function mount(app) { app.get('/api/artifacts', (req, res) => res.json(listFor(req.query && req.query.sessionId))); return api; }

const api = { configure, mount, listFor, observe, ownerOf, noteEdit, touch, DOC_EDIT_FROM };
module.exports = api;
