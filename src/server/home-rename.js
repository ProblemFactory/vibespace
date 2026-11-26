'use strict';
// THE HOME-RENAME MIGRATION (B-b4a2, one-shot at boot — moved out of server.js by B-8033). The 3.5.0 fleet image
// personalizes the container user, so $HOME moves (e.g. /home/vibe → /home/userL) while the PVC keeps everything recorded
// under the OLD path: ~/.claude/projects dirs encode the old cwd (claude's resume lookup goes by CURRENT-cwd encoding →
// every resume died "No conversation found"), and mounts/layouts/session metas hold dead /home/vibe/... paths. Migrated
// automatically: projdirs re-encoded (each harness's store.homeRename hook — claude: src/harnesses/claude-home.js) and the
// recorded paths prefix-rewritten.
// B-8033 (B-ba47 pick A, 主开发 ruling 2, 2026-11-14): the migration has TWO HALVES that act on two different things, so
// it keeps ONE MARKER PER HALF, each beside what it changed:
//   · the projdirs MOVE acts on HOME — its marker lives with that HOME: ~/.vibespace/.home-migrated-<old>-to-<user>;
//   · the recorded-path REWRITE acts on data/'s stores — its marker lives in that data/: data/.home-migrated-<old>-to-<user>.
// (It kept one marker in data/ for both: a second real install over the same HOME — a fresh data/ — moved that HOME's
// projdirs again, and found no old user at all once they were moved: its own stores kept /home/<old> paths.) THE OLD USERS
// are the harness hooks' (`staleUsers`: projdirs left under the old encoding) AND the HOME markers' (an old user another
// install over this HOME already moved — this data/ still owes its rewrite). A HOME with no marker MOVES (a merge, never an
// overwrite — safe to repeat; r1 of the lane's read: «adopting» a pre-split data/ marker skipped projdirs a failed rename
// had left behind, for good).
const fs = require('fs');
const os = require('os');
const path = require('path');
const { renameSynced, SYNC_UNSUPPORTED, syncUnsupportedWords } = require('../fd-close.js');   // B-574d (lane nl-migrations): the one synced replace and its law

const markerName = (old, user) => `.home-migrated-${old}-to-${user}`;
/** B-574d (lane nl-migrations): the tries' ASYNC synced replace — the HOME move's writes stay OFF the boot's synchronous road (B-8033
 *  cure 3), under the one law of src/fd-close.js renameSynced: the temp written, ONE sync of it, its close judged, then renamed. A
 *  sync or a close that FAILS is a failed write: the temp removed, the old tries file standing, rejected into the caller's «could not
 *  be written — tried again at the next start»; only a file system that does no sync at all (SYNC_UNSUPPORTED) lets the bytes take
 *  their name, said once in the door's words (a sink that throws says nothing more). */
async function replaceSyncedAsync(tmp, final, text, log) {
  const fh = await fs.promises.open(tmp, 'w');
  let failed = null;
  try {
    await fh.writeFile(text);
    try { await fh.sync(); } catch (e) { if (!SYNC_UNSUPPORTED.has(e && e.code)) throw e; try { log.warn(syncUnsupportedWords('[migrate] home rename: the tries', e.code)); } catch { /* a sink that throws says nothing more */ } }
  } catch (e) { failed = e; }
  try { await fh.close(); } catch (e) { if (!failed) failed = e; }   // a close that fails after the write: its bytes may not be there
  if (failed) { await fs.promises.unlink(tmp).catch(() => { }); throw failed; }   // the temp goes; the old tries stand
  await fs.promises.rename(tmp, final);
}
const OLD_RE = /^[a-z][a-z0-9]*$/;   // an old user as claude-home's staleUsers reads it (-home-<old>-…)
// B-8033 cure 2: the starts a folder that cannot move is tried, then the move is marked (said once). A try counts once per
// TRY_GAP_MS — a restart loop during a short outage spends one, never all three
const MOVE_TRIES = 3, TRY_GAP_MS = 10 * 60e3;
/** B-8033 cure 3: how many folders the start that MOVED judged old projects (its HOME marker); a marker from before this
 *  count says what it moved. */
function judgedOf(hm) {
  try { const j = JSON.parse(fs.readFileSync(hm, 'utf8')); return Number.isFinite(j.judgedOld) ? j.judgedOld : Number(j.moved) || 0; } catch { return 0; }
}
/** Is /home/<old> gone? — the check claude-home's staleUsers asks too (B-8033 cure: both sources of an old user agree). */
const homeGoneOnDisk = (old) => !fs.existsSync(`/home/${old}`);
/** The old users this HOME's markers name for `user` — moved by an install over this HOME (its rewrite owed per data/) —
 *  whose old home is gone (a user whose /home/<old> exists again is no renamed one). */
function markedOldUsers(home, user, homeGone = homeGoneOnDisk) {
  let names = [];
  try { names = fs.readdirSync(path.join(home, '.vibespace')); } catch { return []; }
  const head = '.home-migrated-', tail = `-to-${user}`;
  return names.filter((n) => n.startsWith(head) && n.endsWith(tail)).map((n) => n.slice(head.length, n.length - tail.length)).filter((o) => OLD_RE.test(o) && o !== user && homeGone(o));
}
/** The HOME half's marker (the projdirs move) — under ~/.vibespace, the folder this HOME's VibeSpace files already use. */
const homeMarkerOf = (home, old, user) => path.join(home, '.vibespace', markerName(old, user));
/** The data/ half's marker (the recorded-path rewrite). */
const dataMarkerOf = (dataDir, old, user) => path.join(dataDir, markerName(old, user));

/** B-574d follow (主开发 r4897): what a person can do about a store the rewrite could not rewrite, by its failure's code. NONE of them
 *  fails by its NATURE — a refused read, bytes that do not parse, a refused write or sync each mends by a hand (its permissions, the
 *  folder in its name moved, the bytes restored, space freed) or by the store's owner — so an owed store is tried at every start. */
function ownedHint(code) {
  if (code === 'unparsable') return 'its bytes do not parse: move it aside or restore it';
  if (code === 'EACCES' || code === 'EPERM') return 'its permissions refuse the hub: let the hub\'s user read and write it';
  if (code === 'EISDIR') return 'a folder has its name: move the folder';
  if (code === 'ENOSPC' || code === 'EDQUOT') return 'the disk is full: free some space';
  if (code === 'EROFS') return 'its folder is read-only: make it writable';
  return 'tried again at the next start';
}
/** B-574d follow (the second read, R-A): the data marker's bytes now MEAN something (owed or done), so it takes its name only after one
 *  sync of its temp (src/fd-close.js renameSynced): never torn by a power cut into «done». A write that fails is said and is no failure
 *  of the start (the other old users go on): the next start finds the marker as it was and runs the rewrite again. */
function writeDataMarker(dm, mark, log) {
  try { renameSynced(dm + '.tmp', dm, JSON.stringify(mark), { where: '[migrate] home rename: the data marker', say: (l) => log.warn(l) }); }
  catch (e) { log.warn(`[migrate] home rename: the data marker could not be written (${(e && e.code) || 'error'}) — the rewrite runs again at the next start`); }
}
/** B-574d follow (the second read, R-B): the old users an OWED data marker of this data/ names — a source beside the hooks and the HOME
 *  markers: a whole move whose HOME marker never landed still owes its rewrite, while no hook names its old user any more (moved). */
function owedOldUsers(dataDir, user, homeGone = homeGoneOnDisk) {
  let names = [];
  try { names = fs.readdirSync(dataDir); } catch { return []; }
  const head = '.home-migrated-', tail = `-to-${user}`;
  return names.filter((n) => n.startsWith(head) && n.endsWith(tail)).map((n) => [n, n.slice(head.length, n.length - tail.length)])
    .filter(([n, o]) => OLD_RE.test(o) && o !== user && homeGone(o) && !!dataMarkerState(path.join(dataDir, n)).owed).map(([, o]) => o);
}
/** B-574d follow (主开发 r4866): the data half's marker as a start reads it — absent; DONE (any marker the release wrote, a «kept» or
 *  bytes that do not parse: the marker's existence meant «done» before this follow, kept so); or a rewrite an earlier start still
 *  OWES: `owed` the stores it could not rewrite (by key), `judgedOld` that start's verdict. THE LAW (主开发 r4897): the marker never
 *  says done while a store is owed — no count of tries is kept. */
function dataMarkerState(dm) {
  let text; try { text = fs.readFileSync(dm, 'utf8'); } catch (e) { return { done: !(e && e.code === 'ENOENT'), owed: null }; }
  let j = null; try { j = JSON.parse(text); } catch { return { done: true, owed: null }; }
  if (!j || !Array.isArray(j.owed)) return { done: true, owed: null };
  return { done: false, owed: j.owed.map(String), judgedOld: Number(j.judgedOld) || 0 };
}

/** Prefix-rewrite every recorded string path /home/<old>/… in the small JSON stores of `dataDir` (+ the session metas).
 *  `retry` (B-574d follow): { failed: [] } collects the stores whose rewrite failed ({ key, name, code } — said by the caller, once
 *  a start), `only` (a Set of keys) tries ONLY those an earlier start could not rewrite — the others hold what was recorded since. */
function rewriteStores(dataDir, metaDir, old, user, log, retry = null) {
  const rewrite = (v) => (typeof v === 'string' && v.includes(`/home/${old}/`))
    ? v.split(`/home/${old}/`).join(`/home/${user}/`)
    : (typeof v === 'string' && v === `/home/${old}`) ? `/home/${user}` : v;
  const walk = (x) => {
    if (Array.isArray(x)) return x.map(walk);
    if (x && typeof x === 'object') { for (const k of Object.keys(x)) x[k] = walk(x[k]); return x; }
    return rewrite(x);
  };
  const stores = ['mounts.json', 'layouts.json', 'task-groups.json', 'machine-mounts.json'].map((n) => ({ f: path.join(dataDir, n), key: n }));
  // a session meta is a store: a <key>.json FILE — its own backup (*.pre-home-migrate), a temp, a set-aside copy or a folder is not (a
  // rewrite never rewrites its backups; a folder there never makes the rewrite owed for ever)
  try { for (const e of fs.readdirSync(metaDir, { withFileTypes: true })) if (e.isFile() && e.name.endsWith('.json')) stores.push({ f: path.join(metaDir, e.name), key: 'session-meta/' + e.name }); } catch { }
  const only = retry && retry.only;
  let rewrote = 0;
  for (const { f, key } of stores) {
    if (only && !only.has(key)) continue;
    try {
      if (!fs.existsSync(f)) continue;
      const raw = fs.readFileSync(f, 'utf-8');
      if (!raw.includes(`/home/${old}`)) continue;
      const fixed = JSON.stringify(walk(JSON.parse(raw)));
      fs.writeFileSync(f + '.pre-home-migrate', raw); // one-shot backup beside it
      renameSynced(f + '.tmp', f, fixed, { where: `[migrate] ${path.basename(f)}`, say: (l) => log.warn(l) });   // B-574d: synced before it takes the name; a failed sync is this store's failed rewrite (said below, not counted)
      rewrote++;
    } catch (e) { if (retry) retry.failed.push({ key, name: path.basename(f), code: (e && e.code) || (e instanceof SyntaxError ? 'unparsable' : 'error') }); else log.warn(`[migrate] ${path.basename(f)}: ${e.message}`); }
  }
  return rewrote;
}

/**
 * Run both halves for every old user a harness hook finds (`staleUsers`), each only while ITS marker is absent.
 * `dataDir` = the checkout's data/, `metaDir` = its session metas, `home` = this HOME, `hooks` = the harnesses'
 * store.homeRename hooks (default: every registered harness's). → one summary per old user that ran something
 * ({ old, user, moved, rewrote, home: ran the move, data: ran the rewrite }); `out.written` = the HOME markers' writes
 * settled (they go OFF the boot's synchronous road — the store-write census' debt only falls; a start that ends before one
 * lands moves again at the next: a merge).
 */
function migrateHomeRename({ dataDir, metaDir, home = os.homedir(), hooks = null, log = console, homeGone = homeGoneOnDisk, now = Date.now, throwaway = () => require('./throwaway-root.js').throwaway() } = {}) {
  const out = [], writes = [];
  // B-ba47 shape H: a THROWAWAY hub (the one test) never moves a person's transcript folders (a scratch data/ has no marker, so it would run again)
  if (throwaway()) { log.log('[migrate] home rename: refused — this copy is a throwaway one (a git worktree, or a temp folder handed a temp home); only an installed copy moves a person\'s transcript folders'); return out; }
  try {
    const user = path.basename(home);
    const hrs = (hooks || require('../harnesses').list().map((h) => h.store && h.store.homeRename)).filter((hr) => hr && typeof hr.staleUsers === 'function');
    const oldUsers = new Set([...hrs.flatMap((hr) => hr.staleUsers(home, user, { homeGone })), ...markedOldUsers(home, user, homeGone)]);
    for (const o of owedOldUsers(dataDir, user, homeGone)) oldUsers.add(o);   // B-574d follow: an owed rewrite names its old user too
    for (const old of oldUsers) {
      const hm = homeMarkerOf(home, old, user), dm = dataMarkerOf(dataDir, old, user);
      const homeDone = fs.existsSync(hm), dmState = dataMarkerState(dm), dataDone = dmState.done;
      if (homeDone && dataDone) continue;
      log.log(`[migrate] home rename detected: /home/${old} → ${home} — ${[!homeDone && 'projdirs', !dataDone && 'recorded paths'].filter(Boolean).join(' + ')}`);
      let moved = 0, rewrote = 0, notMarked = 0;
      let whole = true, sameName = 0, undecided = 0, judged = 0, marked = homeDone;
      if (!homeDone) {
        for (const hr of hrs) {
          const ctx = {};   // B-8033 cure 3: ONE verdict per folder per boot — the move and the count of what is left share it
          const m = hr.moveUser(home, old, user, ctx) || 0;
          moved += m;
          // B-8033 cure: the marker says the move is WHOLE — a projdir whose rename failed (EACCES / EXDEV) withholds it (tried
          // again at the next start); one left behind by same-name transcripts is SAID with its count and needs no retry
          if (typeof hr.leftAfterMove === 'function') { const l = hr.leftAfterMove(home, old, user, ctx) || {}; if (l.failed) whole = false; sameName += l.sameName || 0; undecided += l.undecided || 0; judged += Number.isFinite(l.judged) ? l.judged : m; }
          else judged += m;
        }
        if (sameName) log.warn(`[migrate] home rename: ${sameName} project folder(s) of /home/${old} stay under the old name — each name in them is in the new folder too (never overwritten; a subfolder's own files are not compared)`);
        // B-8033 cure 2: a folder whose owner no transcript says stays where it is (never moved on a guess) — said
        if (undecided) log.warn(`[migrate] home rename: ${undecided} project folder(s) of /home/${old} could not be told apart (no transcript says its working folder, or they disagree) — left as they are`);
        // …and a folder that can never move does not make the whole move run again at every start for ever: MOVE_TRIES starts, then
        // said once and marked (the tries live beside the HOME marker)
        const tf = `${hm}.tries`;
        let tries = 0, counted = false;
        if (!whole) {
          let prev = null; try { prev = JSON.parse(fs.readFileSync(tf, 'utf8')); } catch { prev = null; }
          const n0 = prev && Number(prev.tries) > 0 ? Number(prev.tries) : 0, at0 = prev && Number.isFinite(Number(prev.at)) ? Number(prev.at) : -Infinity;
          counted = !n0 || now() - at0 >= TRY_GAP_MS;
          tries = counted ? n0 + 1 : n0;
        }
        const gaveUp = !whole && tries >= MOVE_TRIES;
        if (!whole && !gaveUp) {
          log.warn(`[migrate] home rename: a project folder of /home/${old} could not be moved — no marker; tried again at the next start (${tries} of ${MOVE_TRIES})`);
          if (counted) writes.push(fs.promises.mkdir(path.dirname(hm), { recursive: true, mode: 0o700 }).then(() => replaceSyncedAsync(`${tf}.tmp`, tf, JSON.stringify({ tries, at: now() }), log))   // cure 3: by temp and rename
            .catch((e) => log.warn(`[migrate] home rename: the tries could not be written (${e.message}) — tried again at the next start`)));
        } else {
          if (gaveUp) log.warn(`[migrate] home rename: a project folder of /home/${old} could not be moved in ${MOVE_TRIES} starts — it stays under the old name; marked, not tried again`);
          const mark = JSON.stringify({ at: Date.now(), moved, judgedOld: Math.max(judged, dmState.owed ? dmState.judgedOld : 0), ...(sameName ? { sameName } : {}), ...(undecided ? { undecided } : {}), ...(gaveUp ? { gaveUp: true } : {}) });
          writes.push(fs.promises.unlink(tf).catch(() => { }));   // cure 3: the tries go once the move is marked
          marked = true;
          writes.push(fs.promises.mkdir(path.dirname(hm), { recursive: true, mode: 0o700 }).then(() => fs.promises.writeFile(hm, mark))
            .catch((e) => log.warn(`[migrate] home rename: the projdirs marker could not be written (${e.message}) — another install over this HOME moves again (a merge, never an overwrite)`)));
        }
      }
      if (!dataDone) {
        // B-8033 cure 3: the stores are rewritten ONLY for an old user the move JUDGED old — a folder of it judged an old project in
        // place (this start, or the HOME marker's record of the start that moved). A name taken from a folder name alone (the
        // person john.smith, no /home/john here) rewrites nothing: a paired machine's own /home/john/… path stays
        // …and while the move is not marked and nothing was judged old yet (a transcript unreadable this start), the data half
        // waits for a later start — it is never marked «kept» on a verdict still owed
        // B-574d follow (主开发 r4866): a rewrite an earlier start OWES carries its verdict (the folders it judged old: a later start that
        // finds them moved judges none) and tries ONLY the stores it could not rewrite
        const prior = dmState.owed ? dmState : null;
        const judgedOld = Math.max(!homeDone ? judged : judgedOf(hm), prior ? prior.judgedOld : 0);
        const retry = { failed: [], only: prior ? new Set(prior.owed) : null };
        if (judgedOld > 0) rewrote = rewriteStores(dataDir, metaDir, old, user, log, retry);
        else if (marked) log.log(`[migrate] home rename: no folder of /home/${old} was judged an old project — its recorded paths stay as they are`);
        // …and a store whose rewrite FAILED (a read, a parse, a write, a sync) WITHHOLDS «done»: the marker says the rewrite OWED (the stores
        // by key, the verdict); every start tries them again — safe to repeat (a backup beside each, a rewritten store holds no /home/<old>)
        // — and says it ONCE a start, every owed store in that one line with what a person can do. THE LAW (主开发 r4897): the marker never
        // says done while a store is owed; no count of tries is kept
        let mark = null;
        if (retry.failed.length) {
          const keys = retry.failed.map((x) => x.key), named = retry.failed.slice(0, 5).map((x) => `${x.name} (${x.code}: ${ownedHint(x.code)})`).join('; ') + (keys.length > 5 ? `; and ${keys.length - 5} more` : '');
          notMarked = keys.length;
          log.warn(`[migrate] home rename: ${keys.length} store(s) could not be rewritten — ${named} — they keep their /home/${old} paths until then; not marked done, tried again at the next start`);
          mark = { at: Date.now(), owed: keys, judgedOld };
        } else if (judgedOld > 0 || marked) mark = { at: Date.now(), rewrote, ...(judgedOld > 0 ? {} : { kept: true }) };
        if (mark) writeDataMarker(dm, mark, log);
      }
      log.log(`[migrate] home rename ${notMarked ? `ran (${notMarked} store(s) owed)` : 'done'}: ${moved} projdirs, ${rewrote} stores rewritten (backups *.pre-home-migrate)`);
      out.push({ old, user, moved, rewrote, home: !homeDone, data: !dataDone, whole, ...(notMarked ? { notMarked } : {}), ...(sameName ? { sameName } : {}), ...(undecided ? { undecided } : {}) });
    }
  } catch (e) { log.warn('[migrate] home-rename check failed:', e.message); }
  return Object.assign(out, { written: Promise.all(writes) });
}

module.exports = { migrateHomeRename, homeMarkerOf, dataMarkerOf, owedOldUsers, rewriteStores, markedOldUsers, homeGoneOnDisk, MOVE_TRIES };
