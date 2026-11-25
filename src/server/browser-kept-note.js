'use strict';
/**
 * THE NOTE OF A KEPT BROWSER'S FOLDER (主开发 r3786, line 821's second form — LAW 5: «nothing that protects a sign-in is born in
 * memory during a hold»). The fact that protects a conversation's kept sign-ins lives WITH THEM: a small file in the browser's own
 * folder, `data/browser-profiles/<key>/.vibespace-kept.json` — the root of Chromium's user-data-dir, beside its `Local State`.
 * Chromium never reads, moves or removes a file it does not know at that root; its «Clear browsing data» works inside the profile
 * (`Default/`), never there. The folder's removal (a Forget, an end, the bound) takes the note with it, and a person who deletes the
 * note by hand leaves a folder with no note (the release's rules). The size measure leaves it out of the folder's bytes and the
 * cache trim never touches it (it is in none of the cache folders).
 *
 * IT HOLDS THREE THINGS AND NO MORE: the browser's name (its key, the folder's own name), the conversation's id, the first time — no
 * site, no place, no label, no address. A note COUNTS ONLY WHEN IT IS TRUE TO ITS FOLDER (`trueNote`): exactly those three fields,
 * its key equal to the folder's name — a folder a person copied carries another folder's note, which is ignored (a folder with no
 * note). ≤ 1 KB, a regular file, never through a link.
 *
 * WHO WRITES IT (both off the hub's loop — fs.promises on libuv's threads — whole: a temp file written, synced, renamed over; 0600;
 * BOUNDED at NOTE_WRITE_MS; one write at a time per folder, so a later one never lands under an earlier one):
 *   · THE START (src/server/browser-kept.js startGate, called by the keeper's ensureEphemeral before a conversation's own browser
 *     starts on its folder — the agent's command and the person's Resume): the note must be there and true; written when it is not.
 *     Past the bound or on a failure the browser is NOT kept (the keeper starts it without its folder) and both are told.
 *   · THE CHOKE POINT (src/server/session-stdout.js writeSessionMeta, where a binding is offered by browser-bindings.bindableIdOf's
 *     rule): the conversation a key was decided for is remembered for this run (`decided`, read by the start) and joined into a TRUE
 *     note that names none yet — a conversation whose id was announced after its browser started (a fork's). Never over another
 *     conversation (the first holder keeps a key). A join that does not land is offered again at the next record and at the next start.
 *
 * WHO READS IT: ONE CHILD (listFolders) at every start and every lift of the kept store — it lists the folders and reads each note,
 * BOUNDED in time (LIST_TIMEOUT_MS, SIGKILL by its own execFile — its starter, never a signal by a pid) and in output (LIST_MAX_DIRS
 * key-named folders, 1 KB a note, LIST_MAX_BYTES on the pipe), started with the ALLOWLISTED environment (src/agent-env.js serviceEnv —
 * the tree's builder for every other child: PATH, HOME, the locale, TMPDIR; never the hub's tokens or a NODE_OPTIONS). The gate's own read is the folder's note alone (readNote).
 *
 * A PAIRED MACHINE: a conversation running there keeps its browser's folder ON THAT MACHINE (rung H, ~/.vibespace/browser-profiles,
 * swept there); the kept list holds such a browser as a tabs-only row (no folder here), so nothing here writes or reads its note.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const NOTE_NAME = '.vibespace-kept.json';
const NOTE_MODE = 0o600;
const NOTE_MAX_BYTES = 1024;
const NOTE_WRITE_MS = 5 * 1000;
const TEMP_REAP_MS = 60 * 1000;   // r3961: a note's temp older than this in a folder no write of ours is on is a crash's leftover (reaped)
const CONVERSATION_MAX = 200;
const LIST_TIMEOUT_MS = 20 * 1000;
const LIST_MAX_DIRS = 4096;
const LIST_MAX_BYTES = 8 * 1024 * 1024;
const REG_MAX = 512;
const KEY_RE = /^bk-[0-9a-f]{8}$/;
const NOTE_FIELDS = ['conversation', 'firstAt', 'key'];

/** the note's three fields, nothing else */
function noteDoc(key, conversation, firstAt) {
  return { key: String(key), conversation: convOf(conversation), firstAt: Math.round(Number(firstAt)) || Date.now() };
}
const convOf = (c) => (typeof c === 'string' && c.length <= CONVERSATION_MAX && !/[\u0000-\u001f]/.test(c) ? c : '');
/** a note TRUE TO ITS FOLDER `name` → its three fields; anything else (another folder's, a fourth field, a wrong type) → null */
function trueNote(name, doc) {
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return null;
  const ks = Object.keys(doc).sort();
  if (ks.length !== NOTE_FIELDS.length || ks.some((k, i) => k !== NOTE_FIELDS[i])) return null;
  if (!KEY_RE.test(String(name || '')) || doc.key !== name) return null;
  if (typeof doc.conversation !== 'string' || doc.conversation !== convOf(doc.conversation)) return null;
  if (!Number.isFinite(doc.firstAt) || doc.firstAt <= 0) return null;
  return { key: doc.key, conversation: doc.conversation, firstAt: doc.firstAt };
}

const bounded = (p, ms, late) => { let t = null; return Promise.race([p, new Promise((res) => { t = setTimeout(() => res(late), ms); })]).finally(() => clearTimeout(t)); };
/** THE FOLDER'S NOTE, read off the loop → { state: 'none' | 'true' | 'untrue' | 'unreadable', doc?, why? } */
async function readNote(dir, { fsp = fs.promises } = {}) {
  let fh = null, out;
  try {
    fh = await fsp.open(path.join(dir, NOTE_NAME), fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0) | (fs.constants.O_NONBLOCK || 0));   // r3961: never through a link, and a pipe planted there answers at once (not a file: not a note)
    const st = await fh.stat();
    if (!st.isFile() || st.size > NOTE_MAX_BYTES) out = { state: 'untrue' };
    else {
      let doc; try { doc = JSON.parse(await fh.readFile('utf8')); } catch { doc = undefined; }
      const t = doc === undefined ? null : trueNote(path.basename(dir), doc);
      out = t ? { state: 'true', doc: t } : { state: 'untrue' };
    }
  } catch (e) {
    const c = e && e.code;
    out = c === 'ENOENT' ? { state: 'none' } : (c === 'ELOOP' || c === 'EISDIR') ? { state: 'untrue' } : { state: 'unreadable', why: String(c || 'failed') };
  }
  if (fh) { const cl = await fh.close().then(() => null, (x) => x); if (cl) out = { state: 'unreadable', why: `its close failed (${(cl && cl.code) || 'failed'})` }; }   // a read whose close failed is not trusted
  return out;
}
/** WRITE IT WHOLE: a temp file beside it (0600), synced, renamed over — bounded. A landing past the bound is taken back when the
 *  folder had no true note before (`takeBack`): its browser was started «not kept» and the folder must not read as kept after.
 *  r3961 (1): the take-back removes ONLY the file this write put there (the temp's inode, read before its rename), never a note another
 *  write made true; and `ended(work)` hands the write's REAL end to the folder's chain, so the folder's next write starts only after it */
async function writeNote(dir, doc, { timeoutMs = NOTE_WRITE_MS, fsp = fs.promises, takeBack = true, ended = null } = {}) {
  const tmp = path.join(dir, `${NOTE_NAME}.tmp-${crypto.randomBytes(4).toString('hex')}`);
  const fin = path.join(dir, NOTE_NAME);
  let cut = false;
  const work = (async () => {
    let fh = null, ino = null;
    try {
      fh = await fsp.open(tmp, 'wx', NOTE_MODE);
      await fh.writeFile(JSON.stringify(doc));
      await fh.sync();
      ino = await fh.stat().then((s) => s.ino, () => null);
      await fh.close(); fh = null;
      if (cut) { await fsp.unlink(tmp).catch(() => { }); return { ok: false, code: 'kept_note_timeout' }; }
      await fsp.rename(tmp, fin);
      if (cut && takeBack) await takeBackOwn(fin, ino, fsp, dir, doc);
      return cut ? { ok: false, code: 'kept_note_timeout' } : { ok: true };
    } catch (e) {
      const cl = fh ? await fh.close().then(() => null, (x) => x) : null;   // the temp's close on the failed road: said in the why, never swallowed
      await fsp.unlink(tmp).catch(() => { });
      return { ok: false, code: 'kept_note_unwritten', why: String((e && e.code) || 'failed') + (cl ? ` (and its close: ${(cl && cl.code) || 'failed'})` : '') };
    }
  })();
  if (typeof ended === 'function') ended(work);   // r3961 (1): the folder's next write waits for THIS one's real end, not its bound
  let t = null;
  const bound = new Promise((res) => { t = setTimeout(() => { cut = true; res({ ok: false, code: 'kept_note_timeout' }); }, timeoutMs); });   // the cut is set AT the bound, so a rename that lands after it is taken back
  try { return await Promise.race([work, bound]); } finally { clearTimeout(t); }
}
/** r3961 (1): a late landing's take-back — only when the file at the note's name is still the one this write renamed there (its inode) */
async function takeBackOwn(fin, ino, fsp, dir = null, doc = null) {
  if (ino === null || ino === undefined) {
    // r4094 (small): the temp's inode could not be read — the note there is taken back when it is still THIS write's own (its three
    // fields; the folder's chain lets no other write of ours land meanwhile); a note of other fields is another write's and stays
    if (!dir || !doc) return;
    const r = await readNote(dir, { fsp });
    if (r.state === 'true' && r.doc.key === doc.key && r.doc.conversation === doc.conversation && r.doc.firstAt === doc.firstAt) await fsp.unlink(fin).catch(() => { });
    return;
  }
  const st = await fsp.lstat(fin).catch(() => null);
  if (st && st.ino === ino) await fsp.unlink(fin).catch(() => { });
}
/** r3961: a crash between a temp's open and its rename leaves `.vibespace-kept.json.tmp-…` for good — reaped at the folder's next write
 *  (no write of ours is on it then: the chain), when older than TEMP_REAP_MS (another hub's write in flight is younger) */
async function reapTemps(dir, fsp) {
  const names = await fsp.readdir(dir).catch(() => []);
  for (const n of names) {
    if (!n.startsWith(NOTE_NAME + '.tmp-')) continue;
    const p = path.join(dir, n), st = await fsp.lstat(p).catch(() => null);
    if (st && st.isFile() && Date.now() - st.mtimeMs > TEMP_REAP_MS) await fsp.unlink(p).catch(() => { });
  }
}
// ONE WRITE AT A TIME PER FOLDER (the start's and the choke point's): each waits for the one before it to TRULY end — r3961 (1): the
// chain holds on the write's own promise (`hold(work)`), never on its bounded answer, so a cut write still running blocks the next one
const chains = new Map();   // key → the promise of its last write's real end
function serial(key, fn, waitMs = Infinity) {
  const prev = chains.get(key) || Promise.resolve();
  let held = null, ran = false;
  // the wait for the previous write is BOUNDED for a start (waitMs): past it this one writes nothing and answers «not kept», and the chain
  // stays on the previous write (a later one still waits for it)
  const free = waitMs === Infinity ? prev.then(() => true) : bounded(prev.then(() => true), waitMs, false);
  // r4094 (small): a waiter that times out takes its own link back off the chain when it is still the last one — the waits of a folder
  // whose write never ends do not pile up one a start
  const run = free.then((ok) => { if (!ok) { if (chains.get(key) === end) chains.set(key, prev); return null; } ran = true; return fn((p) => { held = p; }); });
  const end = run.then(() => (ran ? held : prev), () => null).then(() => null, () => null);
  chains.set(key, end);
  end.then(() => { if (chains.get(key) === end) chains.delete(key); });
  return run.then((v) => (ran ? v : { ok: false, code: 'kept_note_timeout', why: 'the folder\'s previous write has not ended' }));
}
/** THE NOTE MADE TRUE for `conversation` ('' = not decided yet): a true note that names it (or names another: the first holder keeps
 *  the key) is left alone; a true note naming none gets it; none, or a note not true to the folder, is written fresh. Bounded whole.
 *  → { ok: true, doc, wrote, other } | { ok: false, code, why } */
function ensureNote(dir, key, conversation, { timeoutMs = NOTE_WRITE_MS, now = Date.now, fsp = fs.promises } = {}) {
  // r3961 (1): the start stays BOUNDED while it waits for the folder's previous write to truly end — past its bound it is not kept and
  // starts no write of its own (the previous one may still land: only its own file is ever taken back)
  const k = String(key), t0 = Date.now();
  return serial(k, async (hold) => {
    const conv = convOf(conversation);
    const left = () => Math.max(1, timeoutMs - (Date.now() - t0));   // the ONE bound, from the start's ask (its wait included)
    const r = await bounded(readNote(dir, { fsp }), left(), { state: 'cut' });
    if (r.state === 'cut') return { ok: false, code: 'kept_note_timeout' };
    if (r.state === 'unreadable') return { ok: false, code: 'kept_note_unreadable', why: r.why };
    if (r.state === 'true' && (r.doc.conversation === conv || r.doc.conversation)) return { ok: true, doc: r.doc, wrote: false, other: !!(conv && r.doc.conversation !== conv) };   // it names this one, or names another first (kept)
    const doc = noteDoc(key, conv, r.state === 'true' ? r.doc.firstAt : now());
    await bounded(reapTemps(dir, fsp), left(), null);
    const w = await writeNote(dir, doc, { timeoutMs: left(), fsp, takeBack: r.state !== 'true', ended: hold });
    if (w.ok) quiet.delete(String(key));   // the choke point's next record looks at it again (it may join a conversation now)
    return w.ok ? { ok: true, doc, wrote: true, other: false } : w;
  }, timeoutMs);
}

// ── the choke point's join (src/server/session-stdout.js, beside the binding's record) ──
const decided = new Map();   // key → the conversation the choke point decided it for, THIS run (the first holder)
const joined = new Set();    // `key\0conversation` a true note already names
const quiet = new Map();     // key → when its folder last had no true note (the choke point runs at every record: it looks again at most once a minute)
const QUIET_MS = 60 * 1000;
const rejoin = new Set();   // r4145: keys whose join waits for the folder's write in flight (one queued second try each)
/** remembered for the start (bounded: a run's keys), and joined into a TRUE note that names no conversation yet */
function join(profileDir, key, conversation, { fsp = fs.promises } = {}) {
  const k = String(key || ''), c = convOf(conversation);
  if (!KEY_RE.test(k) || !c || notKept.has(k)) return null;   // r4099: a key handed past the bound names no conversation in a note
  if (!decided.has(k)) { decided.set(k, c); if (decided.size > 8192) decided.delete(decided.keys().next().value); }
  if (decided.get(k) !== c || joined.has(k + '\0' + c)) return null;
  if (Date.now() - (quiet.get(k) || 0) < QUIET_MS) return null;
  // r4094 (small) / r4145: a write of this folder is in flight — one waiter a folder, and ONE queued second try when that write ends (a
  // start's note written before its conversation was decided gets it then, with no later record needed)
  if (chains.has(k)) { if (!rejoin.has(k)) { rejoin.add(k); chains.get(k).then(() => { rejoin.delete(k); join(profileDir, key, conversation, { fsp }); }, () => rejoin.delete(k)); } return null; }
  const dir = path.join(profileDir, k);
  return serial(k, async (hold) => {
    const r = await bounded(readNote(dir, { fsp }), NOTE_WRITE_MS, { state: 'cut' });
    if (r.state === 'true' && r.doc.conversation) { joined.add(k + '\0' + c); return { ok: true, wrote: false }; }   // named (by it, or first by another: kept)
    if (r.state !== 'true') { quiet.set(k, Date.now()); if (quiet.size > 8192) quiet.delete(quiet.keys().next().value); return { ok: true, wrote: false, none: true }; }   // no note yet: its browser's start writes it, with this conversation
    const w = await writeNote(dir, noteDoc(k, c, r.doc.firstAt), { fsp, takeBack: false, ended: hold });
    if (w.ok) joined.add(k + '\0' + c);
    return w;
  }).catch(() => null);
}
const conversationDecided = (key) => decided.get(String(key || '')) || '';
// r4099: THE KEYS A DOOR HANDED PAST THE KEPT RECONCILE's BOUND (this process) — NOT KEPT: no note names the conversation in their folder
// (the store's startGate), and NO BINDING: the choke point (src/server/session-stdout.js) records none for them, the doors write them into no
// session record — so the conversation's place stays empty for its own folder's note. Memory only (bounded): a key never written into a
// record is bound by nothing after a restart either
// ONE BOUND, ONE RULE (r4145): this list and the kept store's start notes are each bounded at NOT_KEPT_MAX, the oldest first out
const NOT_KEPT_MAX = 4096;
const notKept = new Set();
function markNotKept(key) { const k = String(key || ''); if (!KEY_RE.test(k)) return false; notKept.delete(k); notKept.add(k); if (notKept.size > NOT_KEPT_MAX) notKept.delete(notKept.values().next().value); return true; }
const isNotKept = (key) => notKept.has(String(key || ''));

// ── r3786 (hold 8): THE FOLDERS OF TODAY HAVE NO NOTE ──
/**
 * ONE PASS through the tree's migration runner (src/server/migrations.js 2026-11-kept-browser-notes: at most once — its ledger; STEPPED —
 * this promise, so the boot never waits for it; off the loop — fs.promises; a failure throws and is not recorded, so it runs again at the
 * next start): every row that the kept list AND a binding BOTH name, while BOTH files read, gets its note (its conversation the binding's,
 * its first time the row's start); a row only one of them names gets nothing (it stays as the release keeps it). → Promise<{ noted,
 * already, only }>
 */
async function noteExisting({ dataDir, fsp = fs.promises } = {}) {
  const SR = require('../store-read.js');
  const KB = require('../browser-kept.js');
  const readOf = async (f) => { try { return { text: await fsp.readFile(f, 'utf8') }; } catch (error) { return { error }; } };
  const kept = SR.storeAnswer(await readOf(path.join(dataDir, KB.KEPT_FILE)), { valid: require('./browser-kept.js').KEPT_SHAPE });
  const BB = require('./browser-bindings.js');
  const bind = SR.storeAnswer(await readOf(path.join(dataDir, BB.DIR_REL, BB.FILE_NAME)), { valid: BB.BINDINGS_SHAPE });
  if (kept.state === 'missing' || bind.state === 'missing') return { noted: 0, already: 0, only: 0 };   // nothing both name
  if (kept.state !== 'data' || bind.state !== 'data') throw new Error(`the kept browsers' list or the bindings could not be read (${kept.state !== 'data' ? kept.why || kept.state : bind.why || bind.state}) — not run; tried again at the next start`);
  const holder = new Map();
  for (const [sid, v] of Object.entries(bind.value.byConversation)) if (v && KEY_RE.test(String(v.key || '')) && !holder.has(String(v.key))) holder.set(String(v.key), { sid, at: Number(v.at) || 0 });
  let noted = 0, already = 0, only = 0, failed = 0;
  for (const [k, e] of Object.entries(KB.normalizeKeptStore(kept.value).entries)) {
    const h = holder.get(k);
    if (!h || !e.hasDir || !convOf(h.sid)) { only++; continue; }
    const dir = path.join(dataDir, 'browser-profiles', k);
    let st = null;
    try { st = await fsp.lstat(dir); } catch (er) { if (er && er.code === 'ENOENT') { only++; continue; } failed++; continue; }
    if (!st.isDirectory()) { only++; continue; }
    const r = await ensureNote(dir, k, h.sid, { now: () => Number(e.startedAt) || h.at || Date.now(), fsp });
    if (!r.ok) failed++; else if (r.wrote) noted++; else already++;
  }
  if (failed) throw new Error(`${failed} kept folder(s) could not get their note — not recorded; tried again at the next start (${noted} written meanwhile)`);
  return { noted, already, only };
}

// ── the listing child (the reconcile's one read) ──
const LIST_SRC = "const fs=require('fs'),p=require('path');const a=process.argv.slice(1),d=a[0],regs=a.slice(1);const K=/^bk-[0-9a-f]{8}$/,N='.vibespace-kept.json',MAXD=" + LIST_MAX_DIRS + ",NB=" + NOTE_MAX_BYTES + ";let n=[];try{n=fs.readdirSync(d)}catch(e){if(e&&e.code==='ENOENT'){n=null}else{process.stderr.write(String((e&&e.code)||'unreadable'));process.exit(3)}}const o=[];for(const x of (n||[])){if(!K.test(x))continue;if(o.length>=MAXD){process.stderr.write('too-many');process.exit(4)}let s;try{s=fs.lstatSync(p.join(d,x))}catch(e){continue}if(!s.isDirectory())continue;let st='none',doc=null;try{const fd=fs.openSync(p.join(d,x,N),fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW||0)|(fs.constants.O_NONBLOCK||0));try{const z=fs.fstatSync(fd);if(!z.isFile()||z.size>NB)st='bad';else{const b=Buffer.alloc(z.size);fs.readSync(fd,b,0,z.size,0);try{doc=JSON.parse(b.toString('utf8'));st='doc'}catch(e){st='bad'}}}finally{fs.closeSync(fd)}}catch(e){st=e&&e.code==='ENOENT'?'none':(e&&(e.code==='ELOOP'||e.code==='EISDIR'))?'bad':'unreadable'}o.push([x,s.mtimeMs,String(s.dev),String(s.ino),st,doc])}const r=[];for(const g of regs){try{const s=fs.statSync(g);r.push([g,String(s.dev),String(s.ino)])}catch(e){r.push([g,null,null,String((e&&e.code)||'unreadable')])}}process.stdout.write(JSON.stringify({dirs:o,regs:r}))";
/** THE CHILD: the key-named folders of `profileDir` with their identity and their note, and the registered folders' identities →
 *  Promise<{ ok: true, dirs: [{ name, mtimeMs, id, note: 'none'|'true'|'untrue'|'unreadable', doc }], regs: [{ dir, id }] } | { ok: false, why }> */
function listFolders(profileDir, { registered = [], timeoutMs = LIST_TIMEOUT_MS, execFileImpl = require('child_process').execFile } = {}) {
  const regs = (Array.isArray(registered) ? registered : []).filter((x) => typeof x === 'string' && path.isAbsolute(x));
  if (regs.length > REG_MAX) return Promise.resolve({ ok: false, why: 'too many registered profiles to compare' });
  return new Promise((resolve) => {
    try {
      execFileImpl(process.execPath, ['-e', LIST_SRC, profileDir, ...regs], { timeout: timeoutMs, killSignal: 'SIGKILL', maxBuffer: LIST_MAX_BYTES, windowsHide: true, env: require('../agent-env.js').serviceEnv(process.env), encoding: 'utf8' }, (err, stdout, stderr) => {
        if (err) return resolve({ ok: false, why: err.killed ? 'the listing passed its bound' : /too-many/.test(String(stderr || '')) ? `more than ${LIST_MAX_DIRS} kept folders` : String(err.code || 'failed') });
        let a = null; try { a = JSON.parse(String(stdout || '')); } catch { a = null; }
        if (!a || !Array.isArray(a.dirs) || !Array.isArray(a.regs)) return resolve({ ok: false, why: 'no listing' });
        const dirs = [];
        for (const row of a.dirs) {
          if (!Array.isArray(row) || !KEY_RE.test(String(row[0] || ''))) continue;
          const name = String(row[0]);
          const t = row[4] === 'doc' ? trueNote(name, row[5]) : null;
          dirs.push({ name, mtimeMs: Math.round(Number(row[1])) || 0, id: row[2] && row[3] ? `${row[2]}:${row[3]}` : null, note: row[4] === 'unreadable' ? 'unreadable' : row[4] === 'none' ? 'none' : t ? 'true' : 'untrue', doc: t });
        }
        resolve({ ok: true, dirs, regs: a.regs.filter(Array.isArray).map((r) => ({ dir: String(r[0]), id: r[1] && r[2] ? `${r[1]}:${r[2]}` : null, why: r[3] ? String(r[3]) : null })) });
      });
    } catch (e) { resolve({ ok: false, why: String((e && e.code) || 'spawn failed') }); }
  });
}

/** A START THAT IS NOT KEPT (rung D): the session's own generated config loses the `profile` that names its kept folder — rewritten
 *  whole off the loop (temp + rename, 0600), before the browser starts, so the browser runs on the binary's own temporary folder */
async function unkeepConfig(configPath, keptDir, { fsp = fs.promises } = {}) {
  try {
    const cur = JSON.parse(await fsp.readFile(configPath, 'utf8'));
    if (!cur || typeof cur !== 'object' || Array.isArray(cur)) return { ok: false, why: 'its config is not an object' };
    if (typeof cur.profile !== 'string' || path.resolve(cur.profile) !== path.resolve(keptDir)) return { ok: true, changed: false };
    const next = { ...cur }; delete next.profile;
    const tmp = `${configPath}.tmp-${crypto.randomBytes(4).toString('hex')}`;
    let fh = null;
    try {
      fh = await fsp.open(tmp, 'wx', NOTE_MODE);
      await fh.writeFile(JSON.stringify(next, null, 2));
      await fh.sync();
      await fh.close(); fh = null;
      await fsp.rename(tmp, configPath);
    } catch (e) { const cl = fh ? await fh.close().then(() => null, (x) => x) : null; await fsp.unlink(tmp).catch(() => { }); if (cl) e.message = `${e.message} (and its close: ${(cl && cl.code) || 'failed'})`; throw e; }
    return { ok: true, changed: true };
  } catch (e) { return { ok: false, why: String((e && e.code) || (e && e.message) || 'failed') }; }
}

module.exports = { NOTE_NAME, NOTE_WRITE_MS, LIST_TIMEOUT_MS, NOT_KEPT_MAX, ensureNote, join, conversationDecided, markNotKept, isNotKept, noteExisting, listFolders, unkeepConfig };
