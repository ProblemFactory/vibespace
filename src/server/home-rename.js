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
/** The old users this HOME's markers name for `user` — moved by an install over this HOME (its rewrite owed per data/). */
function markedOldUsers(home, user) {
  let names = [];
  try { names = fs.readdirSync(path.join(home, '.vibespace')); } catch { return []; }
  const head = '.home-migrated-', tail = `-to-${user}`;
  return names.filter((n) => n.startsWith(head) && n.endsWith(tail)).map((n) => n.slice(head.length, n.length - tail.length)).filter((o) => OLD_RE.test(o) && o !== user);
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
function migrateHomeRename({ dataDir, metaDir, home = os.homedir(), hooks = null, log = console } = {}) {
  const out = [], writes = [];
  try {
    const user = path.basename(home);
    const hrs = (hooks || require('../harnesses').list().map((h) => h.store && h.store.homeRename)).filter((hr) => hr && typeof hr.staleUsers === 'function');
    const oldUsers = new Set([...hrs.flatMap((hr) => hr.staleUsers(home, user)), ...markedOldUsers(home, user)]);
    for (const old of oldUsers) {
      const hm = homeMarkerOf(home, old, user), dm = dataMarkerOf(dataDir, old, user);
      const homeDone = fs.existsSync(hm), dataDone = fs.existsSync(dm);
      if (homeDone && dataDone) continue;
      log.log(`[migrate] home rename detected: /home/${old} → ${home} — ${[!homeDone && 'projdirs', !dataDone && 'recorded paths'].filter(Boolean).join(' + ')}`);
      let moved = 0, rewrote = 0;
      if (!homeDone) {
        for (const hr of hrs) moved += hr.moveUser(home, old, user) || 0;
        const mark = JSON.stringify({ at: Date.now(), moved });
        writes.push(fs.promises.mkdir(path.dirname(hm), { recursive: true, mode: 0o700 }).then(() => fs.promises.writeFile(hm, mark))
          .catch((e) => log.warn(`[migrate] home rename: the projdirs marker could not be written (${e.message}) — another install over this HOME moves again (a merge, never an overwrite)`)));
      }
      if (!dataDone) {
        rewrote = rewriteStores(dataDir, metaDir, old, user, log);
        fs.writeFileSync(dm, JSON.stringify({ at: Date.now(), rewrote }));
      }
      log.log(`[migrate] home rename done: ${moved} projdirs, ${rewrote} stores rewritten (backups *.pre-home-migrate)`);
      out.push({ old, user, moved, rewrote, home: !homeDone, data: !dataDone });
    }
  } catch (e) { log.warn('[migrate] home-rename check failed:', e.message); }
  return Object.assign(out, { written: Promise.all(writes) });
}

module.exports = { migrateHomeRename, homeMarkerOf, dataMarkerOf, rewriteStores, markedOldUsers };
