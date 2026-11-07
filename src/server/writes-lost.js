'use strict';
/**
 * A LOST WRITE OUTLIVES THE PROCESS THAT SAID IT (lane cli-2-1-319-records r2, round-1 acceptance's D1).
 *
 * `system`/`session_writes_lost` (claude 2.1.319) is the CLI's only word that the disk refused the conversation's
 * transcript or ~/.claude.json. It is sent once, on stdout, as the CLI exits 0. Nothing else keeps it: the transcript
 * cannot carry its own loss, the pty-exit path deletes the session's meta and buffer files, and every rebuild reads the
 * JSONL. So the warning line in message-manager was gone after a reload, a hub restart, a reopen or a restart-in-place,
 * exactly when the person comes back to read it.
 *
 * THE RECORD'S LIFETIME IS THE CONVERSATION'S (the shape of src/server/browser-bindings.js, and for the same reason):
 * `data/writes-lost.json` = `{ v: 1, byConversation: { <conversation id>: [row…] } }`, keyed by the CLI's conversation
 * id, never deleted by an exit. A row is the record itself, reduced to the fields the warning reads. A rebuild and a
 * view-only history place it by time through normalizers' card list (`setWritesLostSource`), and message-manager draws
 * it through the SAME handler the live record takes, so the line is one line in every road.
 *
 * THE DISK MAY BE THE ONE THAT IS FULL. A write that fails is never thrown at the stdout consumer: the row stays in
 * memory (every rebuild in this hub's life still draws it), the journal says so once, the write is retried until it
 * lands, and the hub's shutdown (SIGINT / SIGTERM) tries once more. Freeing the space and restarting therefore keeps it.
 * Lost: a hub that stops while the disk still has no room, or is killed outright inside the retry; the journal says it.
 *
 * A READ THAT FAILED IS TRIED AGAIN (data/ can sit on NFS). A store that has not read its file never writes it, so one
 * transient error cannot replace every other conversation's warnings; what was noted meanwhile waits in memory and is
 * merged. A file that parses as no store is set aside, its bytes kept: the writes are atomic, so no retry would mend it.
 */
const fs = require('fs');
const path = require('path');

const MAX_CONVERSATIONS = 200;
const MAX_PER_CONVERSATION = 8;
const RETRY_MS = 60e3;
const ID_RE = /^[A-Za-z0-9_-]{1,128}$/;

const strings = (v, n, len) => (Array.isArray(v) ? v : []).filter((x) => typeof x === 'string' && x).map((x) => x.slice(0, len)).slice(0, n);
const idOr = (v) => (typeof v === 'string' && ID_RE.test(v) ? v : '');

/** PURE: the record reduced to what the warning reads, stamped with its instant (the CLI's record carries no time). */
function rowOf(msg, at) {
  const m = msg && typeof msg === 'object' ? msg : {};
  const ids = strings(m.transcript_session_ids, 16, 128).filter((x) => ID_RE.test(x));
  return {
    type: 'system', subtype: 'session_writes_lost',
    error_code: typeof m.error_code === 'string' ? m.error_code.slice(0, 40) : '',
    lost: strings(m.lost, 8, 40),
    ...(ids.length ? { transcript_session_ids: ids } : {}),
    uuid: typeof m.uuid === 'string' && m.uuid ? m.uuid.slice(0, 64) : `at-${at}`,
    session_id: idOr(m.session_id),
    timestamp: new Date(at).toISOString(),
  };
}
/** PURE: the conversations it is about: the one the CLI is in (its live line was there), each whose transcript lost lines,
 *  and the session's own id when the record names neither. */
function conversationsOf(msg, sessionConversation) {
  const out = new Set();
  const m = msg && typeof msg === 'object' ? msg : {};
  if (idOr(m.session_id)) out.add(m.session_id);
  for (const x of strings(m.transcript_session_ids, 16, 128)) if (ID_RE.test(x)) out.add(x);
  if (idOr(sessionConversation)) out.add(sessionConversation);
  return [...out];
}
const rowOk = (r) => !!r && r.type === 'system' && r.subtype === 'session_writes_lost' && typeof r.uuid === 'string' && Array.isArray(r.lost) && Number.isFinite(Date.parse(r.timestamp));

function writeAtomic(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  try { fs.writeFileSync(tmp, text); fs.renameSync(tmp, file); } catch (e) { try { fs.unlinkSync(tmp); } catch { } throw e; }
}

function create({ dataDir, log = (...a) => console.warn(...a), now = () => Date.now(), write = writeAtomic, retryMs = RETRY_MS } = {}) {
  const file = path.join(dataDir, 'writes-lost.json');
  // What this store holds: the file's rows once it has been read, plus every row noted since. A row noted before the file could be read waits here,
  // `dirty` until it reaches the disk. A STORE THAT HAS NOT READ ITS FILE NEVER WRITES IT: one transient read error must not replace everyone's rows.
  const rows = new Map();
  let read = false, dirty = false, timer = null, writeFailing = false, readFailing = false;
  const merged = (a, b) => { const seen = new Set(), out = []; for (const r of [...a, ...b]) if (!seen.has(r.uuid)) { seen.add(r.uuid); out.push(r); } return out.sort((x, y) => Date.parse(x.timestamp) - Date.parse(y.timestamp)).slice(-MAX_PER_CONVERSATION); };
  function arm() {
    if (timer || !dirty || !(retryMs > 0)) return;
    timer = setTimeout(() => { timer = null; flush(); }, retryMs);
    if (timer.unref) timer.unref();
  }
  function readFailed(what) {
    if (!readFailing) log(`[writes-lost] ${file} ${what} — it is read again before anything is written over it`);
    readFailing = true;
    arm();
    return false;
  }
  /** true once the file has been read (or is known absent). A failed read is no answer: the next ask reads again, as src/server/browser-bindings.js does. */
  function load() {
    if (read) return true;
    let text = null;
    try { text = fs.readFileSync(file, 'utf8'); } catch (e) { if (e.code !== 'ENOENT') return readFailed(`not read (${e.code || e.message})`); }
    if (text !== null) {
      let by = null;
      try { by = JSON.parse(text).byConversation; } catch { by = null; }
      if (!by || typeof by !== 'object' || Array.isArray(by)) {
        // the writes are atomic, so this is no torn write and no read will ever parse it: the bytes are set aside, never overwritten
        const aside = `${file}.unreadable-${now()}`;
        try { fs.renameSync(file, aside); log(`[writes-lost] ${file} is no store — its bytes are set aside as ${aside}`); } catch (e) { return readFailed(`is no store and could not be set aside (${e.code || e.message})`); }
      } else {
        for (const [id, list] of Object.entries(by)) if (ID_RE.test(id) && Array.isArray(list)) rows.set(id, merged(list.filter(rowOk), rows.get(id) || []));
      }
    }
    read = true;
    if (readFailing) log('[writes-lost] the file can be read again');
    readFailing = false;
    return true;
  }
  function flush() {
    if (!dirty) return true;
    if (!load()) return false;
    if (rows.size > MAX_CONVERSATIONS) {
      const newest = (list) => Date.parse((list[list.length - 1] || {}).timestamp) || 0;
      for (const [id] of [...rows].sort((a, b) => newest(a[1]) - newest(b[1])).slice(0, rows.size - MAX_CONVERSATIONS)) rows.delete(id);
    }
    try {
      write(file, JSON.stringify({ v: 1, byConversation: Object.fromEntries(rows) }) + '\n');
      dirty = false;
      if (writeFailing) log('[writes-lost] the kept warnings reached the disk');
      writeFailing = false;
      return true;
    } catch (e) {
      if (!writeFailing) log(`[writes-lost] the warning could not reach ${file} (${e.code || e.message}) — held in memory, retrying`);
      writeFailing = true;
      arm();
      return false;
    }
  }
  /** the stdout consumer's door: never throws. {ids, row} — ids = the conversations it was kept for. */
  function note(msg, sessionConversation = null) {
    load();
    const ids = conversationsOf(msg, sessionConversation);
    const row = rowOf(msg, now());
    log(`[writes-lost] claude could not save ${row.lost.join(' + ') || 'its work'} (${row.error_code || 'no code'}) — conversation ${ids.join(', ') || '(unnamed)'}`);
    for (const id of ids) {
      const list = rows.get(id) || [];
      if (list.some((r) => r.uuid === row.uuid)) continue;
      rows.set(id, merged(list, [row]));
      dirty = true;
    }
    flush();
    return { ids, row };
  }
  const rowsFor = (id) => { if (!idOr(id)) return []; load(); return rows.get(id) || []; };
  /** normalizers.setWritesLostSource: the conversation's kept records as cards placed by time. */
  const cards = ({ session = null, conversationId = null } = {}) => {
    const cid = conversationId || (session && (session.claudeSessionId || session.backendSessionId)) || null;
    // the instant rides beside the record: `timestamp` is no field of its stream shape, and the replay would raise a drift card for it
    return rowsFor(cid).map(({ timestamp, ...record }) => ({ type: 'writes_lost', at: Date.parse(timestamp), record }));
  };
  /** the hub's shutdown (server.js shutdownNow, the atomic-persistence law): a row still held is written now. What cannot be is said by name: the journal is all that is left of it. */
  const stop = () => {
    if (timer) { clearTimeout(timer); timer = null; }
    const ok = flush();
    if (!ok) log(`[writes-lost] the hub stops with a warning that never reached ${file} — only these journal lines are left of it`);
    return ok;
  };
  return { note, rowsFor, cards, flush, stop, file };
}

// THE HUB'S ONE STORE: installed once by the wiring; a harness that installs none has no store and no source
let installedStore = null;
function install(opts) {
  if (installedStore) installedStore.stop();
  installedStore = opts ? create(opts) : null;
  require('../normalizers').setWritesLostSource(installedStore ? installedStore.cards : null);
  return installedStore;
}
const installed = () => installedStore;

module.exports = { create, install, installed, rowOf, conversationsOf, MAX_CONVERSATIONS, MAX_PER_CONVERSATION };
