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

const markerName = (old, user) => `.home-migrated-${old}-to-${user}`;
const OLD_RE = /^[a-z][a-z0-9]*$/;   // an old user as claude-home's staleUsers reads it (-home-<old>-…)
// B-8033 cure 2: the starts a folder that cannot move is tried, then the move is marked (said once). A try counts once per
// TRY_GAP_MS — a restart loop during a short outage spends one, never all three
const MOVE_TRIES = 3, TRY_GAP_MS = 10 * 60e3;
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

/** Prefix-rewrite every recorded string path /home/<old>/… in the small JSON stores of `dataDir` (+ the session metas). */
function rewriteStores(dataDir, metaDir, old, user, log) {
  const rewrite = (v) => (typeof v === 'string' && v.includes(`/home/${old}/`))
    ? v.split(`/home/${old}/`).join(`/home/${user}/`)
    : (typeof v === 'string' && v === `/home/${old}`) ? `/home/${user}` : v;
  const walk = (x) => {
    if (Array.isArray(x)) return x.map(walk);
    if (x && typeof x === 'object') { for (const k of Object.keys(x)) x[k] = walk(x[k]); return x; }
    return rewrite(x);
  };
  const stores = ['mounts.json', 'layouts.json', 'task-groups.json', 'machine-mounts.json'].map((f) => path.join(dataDir, f));
  try { for (const f of fs.readdirSync(metaDir)) stores.push(path.join(metaDir, f)); } catch { }
  let rewrote = 0;
  for (const f of stores) {
    try {
      if (!fs.existsSync(f)) continue;
      const raw = fs.readFileSync(f, 'utf-8');
      if (!raw.includes(`/home/${old}`)) continue;
      const fixed = JSON.stringify(walk(JSON.parse(raw)));
      fs.writeFileSync(f + '.pre-home-migrate', raw); // one-shot backup beside it
      const tmp = f + '.tmp'; fs.writeFileSync(tmp, fixed); fs.renameSync(tmp, f);
      rewrote++;
    } catch (e) { log.warn(`[migrate] ${path.basename(f)}: ${e.message}`); }
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
function migrateHomeRename({ dataDir, metaDir, home = os.homedir(), hooks = null, log = console, homeGone = homeGoneOnDisk, now = Date.now } = {}) {
  const out = [], writes = [];
  try {
    const user = path.basename(home);
    const hrs = (hooks || require('../harnesses').list().map((h) => h.store && h.store.homeRename)).filter((hr) => hr && typeof hr.staleUsers === 'function');
    const oldUsers = new Set([...hrs.flatMap((hr) => hr.staleUsers(home, user, { homeGone })), ...markedOldUsers(home, user, homeGone)]);
    for (const old of oldUsers) {
      const hm = homeMarkerOf(home, old, user), dm = dataMarkerOf(dataDir, old, user);
      const homeDone = fs.existsSync(hm), dataDone = fs.existsSync(dm);
      if (homeDone && dataDone) continue;
      log.log(`[migrate] home rename detected: /home/${old} → ${home} — ${[!homeDone && 'projdirs', !dataDone && 'recorded paths'].filter(Boolean).join(' + ')}`);
      let moved = 0, rewrote = 0;
      let whole = true, sameName = 0, undecided = 0;
      if (!homeDone) {
        for (const hr of hrs) {
          moved += hr.moveUser(home, old, user) || 0;
          // B-8033 cure: the marker says the move is WHOLE — a projdir whose rename failed (EACCES / EXDEV) withholds it (tried
          // again at the next start); one left behind by same-name transcripts is SAID with its count and needs no retry
          if (typeof hr.leftAfterMove === 'function') { const l = hr.leftAfterMove(home, old, user) || {}; if (l.failed) whole = false; sameName += l.sameName || 0; undecided += l.undecided || 0; }
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
          if (counted) writes.push(fs.promises.mkdir(path.dirname(hm), { recursive: true, mode: 0o700 }).then(() => fs.promises.writeFile(tf, JSON.stringify({ tries, at: now() })))
            .catch((e) => log.warn(`[migrate] home rename: the tries could not be written (${e.message}) — tried again at the next start`)));
        } else {
          if (gaveUp) log.warn(`[migrate] home rename: a project folder of /home/${old} could not be moved in ${MOVE_TRIES} starts — it stays under the old name; marked, not tried again`);
          const mark = JSON.stringify({ at: Date.now(), moved, ...(sameName ? { sameName } : {}), ...(undecided ? { undecided } : {}), ...(gaveUp ? { gaveUp: true } : {}) });
          writes.push(fs.promises.mkdir(path.dirname(hm), { recursive: true, mode: 0o700 }).then(() => fs.promises.writeFile(hm, mark))
            .catch((e) => log.warn(`[migrate] home rename: the projdirs marker could not be written (${e.message}) — another install over this HOME moves again (a merge, never an overwrite)`)));
        }
      }
      if (!dataDone) {
        rewrote = rewriteStores(dataDir, metaDir, old, user, log);
        fs.writeFileSync(dm, JSON.stringify({ at: Date.now(), rewrote }));
      }
      log.log(`[migrate] home rename done: ${moved} projdirs, ${rewrote} stores rewritten (backups *.pre-home-migrate)`);
      out.push({ old, user, moved, rewrote, home: !homeDone, data: !dataDone, whole, ...(sameName ? { sameName } : {}), ...(undecided ? { undecided } : {}) });
    }
  } catch (e) { log.warn('[migrate] home-rename check failed:', e.message); }
  return Object.assign(out, { written: Promise.all(writes) });
}

module.exports = { migrateHomeRename, homeMarkerOf, dataMarkerOf, rewriteStores, markedOldUsers, homeGoneOnDisk, MOVE_TRIES };
