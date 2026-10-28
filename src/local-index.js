'use strict';
/**
 * PURE (imports nothing; CJS) — THE MACHINE'S OWN SESSION INDEX and every judgment THE PERSON'S CLI makes from it
 * (lane human-cli, 2026-10-28; the owner after the 89-minute hub freeze: «今天的停机事件给了我一些 idea，我感觉你应该做一个
 * 给人用的 cli，这样在 hub 挂掉的时候我可以从机器上快速用指令列出来有哪些 session，attach 进一个 session 和 session 交互»).
 * Shipped beside data/bin/vibespace as `vibespace-local-index.js` (copied at every boot, gitignored, in AGENT_TOOLS)
 * and beside the copy the hub installs on the machine's own disk (`<place>/bin/`).
 *
 * THE INCIDENT. 2026-10-27 17:50–19:16 PT the hub's main loop was held 89 minutes: data/ sits on a fuse.bindfs over
 * NFS and the NAS stalled. The web UI, the For-you tray and every agent CLI (each one speaks HTTP to the hub) were dead
 * while the dtach sessions kept running on local disks. The owner could not list them (`ls data/sockets` hung) nor talk
 * to one (`dtach -a` by hand reaches a terminal only; a chat session is a stream-json wrapper, not a screen).
 *
 * THE INDEX — ONE FILE PER HUB ROOT, `<place>/sessions.<rootDigest>.json` (round 2: two hubs on one HOME never share a
 * file — a crash, a stop or a restart of one never touches the other's rows), written by that hub (src/server/local-index.js,
 * the ONE writer, fed by the session list's ONE notify point) on the machine's OWN disk: the place ladder below never picks
 * a network or FUSE mount — judged by where the folder LANDS (its symlinks followed without touching a mount), never by
 * the path's spelling. The person's place (`~/.vibespace/local`) holds only INSTALLED hubs' files; a throwaway hub (a
 * worktree, a temp root, a test harness — src/server-root.js's verdict) writes under its OWN root. A row names what a person needs to reach a session with no hub: id, name, kind, backend, folder, the dtach socket, the
 * buffer, the transcript, the CLI's pid + birth. Closed keys (ROW_KEYS) — never a token, an env, an account. The hub's
 * own part carries its pid + birth and a heartbeat (`seenAt`), so a reader tells a hub that is DOWN from one that is
 * FROZEN (its process runs; its loop has written nothing for minutes).
 *
 * THE JUDGE. A stale index is still read: each row is judged by what the KERNEL says now (the CLI's pid + birth, the
 * socket answering a connect) — never by the hub's word. A fact nobody could get (a socket on a mount that does not
 * answer) is UNKNOWN, said with its reason: never alive, never dead by guess.
 *
 * Also here, because the CLI imports nothing it does not ship: the dtach client packet (dtach 0.9 dtach.h — the CLI
 * speaks a chat session's socket itself), the fill of the chat frames the hub's own adapters wrote into the row, and the record → line rendering of the three stdout families (claude stream-json, acp-events,
 * codex). Gate: scripts/test-local-index.mjs (fast).
 */

const INDEX_VERSION = 2;
const INDEX_KIND = 'vibespace-local-index';
// one file per hub root: `sessions.<the first 12 hex of sha256(root)>.json` (the writer names it; a reader lists them all)
const INDEX_FILE_RE = /^sessions\.([0-9a-f]{12})\.json$/;
const indexFileOf = (digest) => `sessions.${String(digest || '').toLowerCase().replace(/[^0-9a-f]/g, '').slice(0, 12)}.json`;
const OWN_ROOT_DIR = 'data/local-index';   // a THROWAWAY hub's place: under its own root, never the person's HOME
const SWEEP_MS = 24 * 3600 * 1000;       // a DOWN hub's file whose sessions are all gone is swept after a day
const HEARTBEAT_MS = 30000;              // the hub rewrites the index this often even when nothing moved (its loop's pulse)
const FRESH_MS = 3 * HEARTBEAT_MS;       // a pulse older than three beats = the hub's loop wrote nothing: not fresh
// = src/mount-path-class.js NET_FSTYPE (test-local-index pins the two equal): a network or FUSE file system — the kind
// that stalled the hub. The index never lives on one.
const NET_FSTYPE = /^(?:fuse(?:\..+)?|nfs4?|cifs|smb3?|smbfs|sshfs|davfs2?)$/;

/** /proc/self/mountinfo text + an absolute path → {target, fstype, source} of the mount it lives on (longest
 *  mount-point prefix), or null — the same reading as src/fd-budget.js mountOf (parity-pinned). */
function mountOf(p, mountinfoText) {
  const file = String(p || '');
  if (!file.startsWith('/')) return null;
  let best = null;
  for (const line of String(mountinfoText || '').split('\n')) {
    const dash = line.indexOf(' - ');
    if (dash < 0) continue;
    const pre = line.slice(0, dash).split(' ');
    const post = line.slice(dash + 3).split(' ');
    const target = (pre[4] || '').replace(/\\040/g, ' ');
    if (!target) continue;
    const under = target === '/' || file === target || file.startsWith(target + '/');
    if (!under) continue;
    if (!best || target.length >= best.target.length) best = { target, fstype: post[0] || '', source: post[1] || '' };
  }
  return best;
}

const trimSlash = (s) => String(s || '').replace(/\/+$/, '') || '/';

/**
 * WHERE A PATH LANDS (round 2, G1: `~/.vibespace` a symlink onto a FUSE mount read as «the machine's own disk» and one
 * flush held the hub's loop 4.6 s). Walks the path one component at a time and follows each symlink — but before it
 * TOUCHES a component (lstat / readlink) it asks the mount table which file system that component lives on: a network or
 * FUSE mount is never touched; the walk stops there and says so. `lstat(p)` → {symlink: bool} | null (missing);
 * `readlink(p)` → target. A missing component ends the walk: the rest lands where its parent lands.
 * → {path} | {blocked: {at, fstype}} | {loop: true}.
 */
function landedPathOf(p, { lstat = null, readlink = null, mountinfo = '' } = {}) {
  let todo = String(p || '').split('/').filter(Boolean);
  if (!String(p || '').startsWith('/')) return { path: String(p || '') };
  let cur = '';
  for (let hops = 0; todo.length;) {
    const part = todo.shift();
    if (part === '.') continue;
    if (part === '..') { cur = cur.slice(0, cur.lastIndexOf('/')); continue; }
    const next = cur + '/' + part;
    const m = mountinfo ? mountOf(next, mountinfo) : null;
    if (m && NET_FSTYPE.test(m.fstype)) return { blocked: { at: next, fstype: m.fstype } };
    if (typeof lstat !== 'function') { cur = next; continue; }
    let st = null; try { st = lstat(next); } catch { st = null; }
    if (!st) {   // missing: the rest lands where it reads — judged as a whole (a mount point further down is still a mount)
      const full = [next, ...todo].join('/');
      const mf = mountinfo ? mountOf(full, mountinfo) : null;
      return mf && NET_FSTYPE.test(mf.fstype) ? { blocked: { at: mf.target, fstype: mf.fstype } } : { path: full };
    }
    if (!st.symlink) { cur = next; continue; }
    if (++hops > 40) return { loop: true };
    let to = ''; try { to = String(readlink(next) || ''); } catch { return { path: [next, ...todo].join('/') }; }
    todo = [...to.split('/').filter(Boolean), ...todo];
    if (to.startsWith('/')) cur = '';
  }
  return { path: cur || '/' };
}

/**
 * THE PLACE — decided by the hub at its start (and said in its log), recomputed identically by the CLI: the first rung
 * whose folder LANDS on the machine's own disk (landedPathOf — a symlink is followed, a mount never touched) and whose
 * folder, if it exists, passes the rung law (rungFolderOf: no symlink, the uid's own, 0700).
 *   1. home         <home>/.vibespace/local
 *   2. var-tmp      /var/tmp/vibespace-<uid>          (the home folder is itself a network mount)
 *   3. runtime-dir  <XDG_RUNTIME_DIR>/vibespace        (RAM: lost at a restart — and so is every dtach session)
 * `own` = {root} for a THROWAWAY hub: its ONE rung is <root>/data/local-index (never the HOME).
 * `facts(dir)` → the lstat facts of the folder itself ({exists, symlink, dir, uid, mode}) — null = not asked (pure tests).
 * No mount table (macOS) ⇒ the home rung. → {dir, bin, via, fstype, why, tried} | {dir: null, code, why, tried}.
 */
function indexPlaceOf({ home = '', uid = null, mountinfo = '', xdgRuntimeDir = '', varTmp = '/var/tmp', own = null, lstat = null, readlink = null, facts = null } = {}) {
  const rungs = [];
  if (own && String(own.root || '').startsWith('/')) rungs.push(['own-root', trimSlash(own.root) + '/' + OWN_ROOT_DIR]);
  else {
    if (String(home).startsWith('/')) rungs.push(['home', trimSlash(home) + '/.vibespace/local']);
    if (Number.isInteger(uid) && uid >= 0) rungs.push(['var-tmp', trimSlash(varTmp) + '/vibespace-' + uid]);
    if (String(xdgRuntimeDir || '').startsWith('/')) rungs.push(['runtime-dir', trimSlash(xdgRuntimeDir) + '/vibespace']);
  }
  const tried = [];
  for (const [via, dir] of rungs) {
    const land = landedPathOf(dir, { lstat, readlink, mountinfo });
    if (land.blocked) { tried.push({ via, dir, fstype: land.blocked.fstype, why: `lands on a ${land.blocked.fstype} mount (${land.blocked.at})` }); continue; }
    if (land.loop) { tried.push({ via, dir, fstype: null, why: 'a symlink loop' }); continue; }
    const m = mountinfo ? mountOf(land.path, mountinfo) : null;   // the words only: landedPathOf judged every component
    const fstype = m ? m.fstype : null;
    const f = typeof facts === 'function' ? facts(dir) : null;
    const law = rungFolderOf(f, { uid, dir });
    if (!law.ok) { tried.push({ via, dir, fstype, why: law.why }); continue; }
    tried.push({ via, dir, fstype, why: null });
    const landed = land.path !== dir ? ` (it lands at ${land.path})` : '';
    const first = tried[0];
    const why = tried.length === 1
      ? `${via === 'home' ? 'the home folder' : via === 'own-root' ? 'this hub\'s own root' : dir} is on the machine's own disk (${fstype || 'no mount table'})${landed}`
      : `${first.dir} ${first.why} — the index lives where a stalled mount cannot hold it: ${dir} (${fstype || 'no mount table'})${landed}`;
    return { dir, bin: via === 'own-root' ? null : dir + '/bin', via, fstype, landed: land.path, why, tried };
  }
  return { dir: null, bin: null, code: 'no_local_disk', why: `no candidate folder is usable (${tried.map((t) => `${t.dir}: ${t.why}`).join('; ') || 'no home, no uid'})`, tried };
}

/**
 * THE RUNG LAW (round 2, G2: another local user can make `/var/tmp/vibespace-<your uid>` first — /var/tmp is world-
 * writable — a symlink to their 0777 folder; the index and the CLI then landed there). The folder itself, by its lstat
 * facts: missing = fine (the writer makes it 0700); a symlink, not a folder, another uid's, or open to anyone (mode &
 * 077) = REFUSED by name. f = {exists, symlink, dir, uid, mode} | null (not asked).
 */
function rungFolderOf(f, { uid = null, dir = '' } = {}) {
  if (!f || !f.exists) return { ok: true };
  if (f.symlink) return { ok: false, why: `${dir} is a symlink someone made — refused (the rung's folder is made by the hub itself, 0700)` };
  if (!f.dir) return { ok: false, why: `${dir} is not a folder — refused` };
  if (Number.isInteger(uid) && Number.isInteger(f.uid) && f.uid !== uid) return { ok: false, why: `${dir} belongs to uid ${f.uid}, not ${uid} — refused` };
  if (Number.isInteger(f.mode) && (f.mode & 0o077)) return { ok: false, why: `${dir} is open to others (mode ${(f.mode & 0o777).toString(8)}) — refused until it is 0700 (chmod 700 ${dir})` };
  return { ok: true };
}

const str = (v, max = 400) => (typeof v === 'string' && v ? v.slice(0, max) : null);
const num = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : null);

/** The CLOSED row keys: what a person needs to reach a session. Nothing else is ever written (no token, no env). */
const ROW_KEYS = Object.freeze(['id', 'name', 'kind', 'backend', 'cwd', 'host', 'hostName', 'purpose', 'socket', 'buffer',
  'transcript', 'conversationId', 'input', 'child', 'createdAt', 'attachedAt', 'clients', 'turn', 'inputHeld']);
const HUB_KEYS = Object.freeze(['pid', 'starttime', 'bootId', 'root', 'throwaway', 'host', 'port', 'version', 'unit', 'startedAt', 'seenAt',
  'stoppedAt', 'dataDir', 'dataFs', 'place']);
// throwaway = false (an INSTALLED hub: the person's place) | the root verdict's kind ('worktree' | 'tmp' | 'override' |
// 'unknown' — src/server-root.js): such a hub writes under its own root and installs nothing

/** Why a CHAT session would not take a line now, in the hub's own words for it (the card's remoteState) — or null. */
function inputHeldOf(s = {}) {
  if (s._vaultWait) return 'vault-locked';
  const st = s._remoteState && s._remoteState.state;
  if (st && st !== 'connected') return 'host-' + String(st).slice(0, 40);
  return null;
}

/** A live session (the hub's in-memory object) → its index row. `turn` = turn-facts' word (null when unknown);
 *  `conversationId` = the harness's own id field (the hub reads its row); `input` = frameTemplatesOf the session's adapter. */
function rowOf(id, s = {}, { buffersDir = null, transcript = null, turn = null, attachedAt = null, conversationId = null, input = null } = {}) {
  const ci = s._childIdentity && num(s._childIdentity.pid) ? s._childIdentity : null;
  const child = ci ? { pid: num(ci.pid), starttime: num(ci.starttime), bootId: str(ci.bootId, 64) }
    : num(s._childPid) ? { pid: num(s._childPid), starttime: null, bootId: null } : null;
  return {
    id: String(id), name: str(s.name, 200), kind: s.mode === 'chat' ? 'chat' : 'terminal', backend: str(s.backend, 40) || 'claude',
    cwd: str(s.cwd), host: str(s.host, 80), hostName: str(s.hostName, 120), purpose: str(s._purpose, 40),
    socket: str(s.socketPath), buffer: buffersDir ? `${trimSlash(buffersDir)}/${id}.buf` : null,
    transcript: str(transcript), conversationId: str(conversationId || s.backendSessionId, 120),
    input: s.mode === 'chat' && input && input.line && input.stop ? { line: input.line, stop: input.stop } : null, child, createdAt: num(s.createdAt), attachedAt: num(attachedAt),
    clients: s.clients && typeof s.clients.size === 'number' ? s.clients.size : 0,
    turn: turn === 'running' || turn === 'waiting' || turn === 'idle' ? turn : null, inputHeld: inputHeldOf(s),
  };
}

/** The whole file: {v, kind, writtenAt, hub, sessions}. Unknown hub keys are dropped (HUB_KEYS is closed too). */
function docOf({ hub = {}, rows = [], now = 0 } = {}) {
  const h = {};
  for (const k of HUB_KEYS) h[k] = hub[k] === undefined ? null : hub[k];
  return { v: INDEX_VERSION, kind: INDEX_KIND, writtenAt: now, hub: h, sessions: rows.map((r) => Object.fromEntries(ROW_KEYS.map((k) => [k, r[k] === undefined ? null : r[k]]))) };
}

/** The file's text → {ok, doc} | {ok: false, why}. A newer version is still read (its known keys). */
function parseIndex(text) {
  let doc;
  try { doc = JSON.parse(String(text || '')); } catch (e) { return { ok: false, why: `the index is not JSON (${e.message})` }; }
  if (!doc || doc.kind !== INDEX_KIND || !Array.isArray(doc.sessions)) return { ok: false, why: 'the file is not a VibeSpace session index' };
  return { ok: true, doc };
}

/** /proc/<pid>/stat text → {state, starttime} (fields 3 and 22, counted after the LAST ') ' — comm may hold one), or null. */
function procStat(text) {
  const t = String(text || '');
  const i = t.lastIndexOf(') ');
  if (i < 0) return null;
  const f = t.slice(i + 2).split(' ');
  const st = Number(f[19]);
  return { state: f[0] || '', starttime: Number.isFinite(st) ? st : null };
}

/**
 * A recorded process {pid, starttime, bootId} against what /proc says NOW → 'same' | 'gone' | 'recycled' |
 * 'other-boot' | 'unknown'. `stat` = the /proc/<pid>/stat text or null (no such pid); `hasProc` false (macOS) ⇒ unknown.
 */
function procVerdict(rec, { stat = null, bootId = '', hasProc = true } = {}) {
  if (!rec || !num(rec.pid)) return 'unknown';
  if (rec.bootId && bootId && rec.bootId !== bootId) return 'other-boot';
  if (!hasProc) return 'unknown';
  const p = stat == null ? null : procStat(stat);
  if (!p) return 'gone';
  if (p.state === 'Z' || p.state === 'X') return 'gone';
  if (!num(rec.starttime)) return 'unknown';            // a pid without its birth proves nothing (it may be recycled)
  return p.starttime === Number(rec.starttime) ? 'same' : 'recycled';
}

/** What a connect to the socket said → one fact word. */
const SOCKET_FACTS = Object.freeze(['accepts', 'missing', 'refused', 'not-socket', 'no-answer', 'error']);
function socketFactOf(code) {
  if (code === 'ok') return 'accepts';
  if (code === 'ENOENT') return 'missing';
  if (code === 'ECONNREFUSED') return 'refused';
  if (code === 'ENOTSOCK') return 'not-socket';
  return 'error';
}

/**
 * THE ROW JUDGE: {state: 'alive'|'dead'|'unknown', why}. `child` = procVerdict of the row's CLI process, `socket` = a
 * SOCKET_FACTS word (null = not asked), `rebooted` = the machine started after the index was written.
 */
function judgeRow(row = {}, { child = null, socket = null, rebooted = false } = {}) {
  if (rebooted) return { state: 'dead', why: 'the machine restarted after the hub wrote this row (a dtach session does not survive a restart)' };
  const childGone = child === 'gone' || child === 'recycled' || child === 'other-boot';
  if (!row.socket) {
    if (child === 'same') return { state: 'alive', why: 'its process runs; it has no dtach socket (a daemon pipe) — only the hub reaches it' };
    if (childGone) return { state: 'dead', why: 'its process is gone (it had no dtach socket)' };
    return { state: 'unknown', why: 'no dtach socket and no recorded process birth to judge' };
  }
  switch (socket) {
    case 'accepts': return { state: 'alive', why: 'its socket answers' };
    case 'missing': return { state: 'dead', why: 'its socket file is gone' };
    case 'refused': return { state: 'dead', why: 'its socket file is left behind but nothing listens on it' };
    case 'not-socket': return { state: 'dead', why: 'the path is no longer a socket' };
    case 'no-answer':
      if (child === 'same') return { state: 'alive', why: 'its process runs; its socket sits on a mount that is not answering' };
      return { state: 'unknown', why: `its socket sits on a mount that is not answering${childGone ? ' (its CLI process is gone; a terminal wrapper may still run)' : ''}` };
    default:
      if (child === 'same') return { state: 'alive', why: 'its process runs (its socket was not asked)' };
      return { state: 'unknown', why: `its socket could not be asked${childGone ? '; its CLI process is gone' : ''}` };
  }
}

/**
 * THE ESC BELT (round 2): every string the CLI prints from the wire — a transcript, a buffer, a session's name, a hub's log —
 * is shown, never obeyed: an agent could otherwise write the person's clipboard (OSC 52), retitle the window, erase a
 * line and fake a «you:» line. A whole escape sequence (CSI / OSC / DCS / a two-byte ESC) becomes «␛» + its printable
 * rest; any other C0 / C1 control or DEL becomes its visible picture (␀…␟, ␡, ‹9b›). `keep` = the controls kept as-is
 * ('\n' for a message body; nothing for a table cell).
 */
function clean(s, { keep = '' } = {}) {
  return String(s == null ? '' : s)
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]|\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)?|\u001b[PX^_][^\u001b]*(?:\u001b\\)?|\u001b[ -~]?/g, (m) => '␛' + m.slice(1).replace(/[\u0000-\u001f\u007f]/g, ''))
    .replace(/[\u0000-\u001f\u007f\u0080-\u009f]/g, (c) => (keep.includes(c) ? c : c === '\u007f' ? '␡' : c < ' ' ? String.fromCharCode(0x2400 + c.charCodeAt(0)) : `‹${c.charCodeAt(0).toString(16)}›`));
}

/** Milliseconds → «5s» «3m» «2h» «4d». */
function ageWords(ms) {
  const s = Math.max(0, Math.round(Number(ms) / 1000) || 0);
  if (s < 60) return s + 's';
  if (s < 3600) return Math.floor(s / 60) + 'm';
  if (s < 86400) return Math.floor(s / 3600) + 'h';
  return Math.floor(s / 86400) + 'd';
}

/**
 * THE HUB JUDGE: {state: 'up'|'frozen'|'starting'|'stopped'|'down'|'unknown'|'none', why}. `http` = 'answers' |
 * 'no-answer' | 'refused' | null (not asked — `ls` never asks), `proc` = procVerdict of the hub's own process.
 */
function judgeHub(hub, { http = null, proc = null, now = 0 } = {}) {
  if (!hub || !num(hub.pid)) return { state: 'none', why: 'no VibeSpace hub has run here' };
  const pulse = num(hub.seenAt) ? now - hub.seenAt : null;
  const pulseWords = pulse == null ? '' : `; its loop last wrote the index ${ageWords(pulse)} ago`;
  if (http === 'answers') return { state: 'up', why: `it answers (pid ${hub.pid})` };
  if (proc === 'same') {
    if (http === 'no-answer') return { state: 'frozen', why: `its process (pid ${hub.pid}) runs but did not answer in 2 s${pulseWords}` };
    if (http === 'refused') return { state: 'starting', why: `its process (pid ${hub.pid}) runs but nothing listens on port ${hub.port} — starting or stopping` };
    if (pulse != null && pulse > FRESH_MS) return { state: 'frozen', why: `its process (pid ${hub.pid}) runs but its loop has written nothing for ${ageWords(pulse)}` };
    return { state: 'up', why: `its process runs (pid ${hub.pid})${pulseWords}` };
  }
  if (proc === 'gone' || proc === 'recycled' || proc === 'other-boot') {
    if (num(hub.stoppedAt)) return { state: 'stopped', why: `it stopped ${ageWords(now - hub.stoppedAt)} ago (pid ${hub.pid})` };
    return { state: 'down', why: `its process (pid ${hub.pid}) is gone — it did not stop cleanly${pulseWords}` };
  }
  return { state: 'unknown', why: `its process (pid ${hub.pid}) could not be judged${pulseWords}` };
}

/** THE ORDER inside one hub: oldest first (a number stays put while new sessions arrive — not when an older one ends:
 *  that is why a number is a terminal's word only, see pickSession). */
function orderRows(rows = []) {
  return rows.slice().sort((a, b) => (Number(a.createdAt) || 0) - (Number(b.createdAt) || 0) || String(a.id).localeCompare(String(b.id)));
}

/** THE HUB ORDER (one file per hub root): the hub the systemd unit runs first, then the others by root. docs = [{doc, file}]. */
function orderHubs(docs = []) {
  const unitOf = (d) => !!(d && d.doc && d.doc.hub && d.doc.hub.unit && !d.doc.hub.throwaway);
  return docs.slice().sort((a, b) => (unitOf(b) - unitOf(a)) || String((a.doc.hub || {}).root || '').localeCompare(String((b.doc.hub || {}).root || '')) || String(a.file || '').localeCompare(String(b.file || '')));
}
/** Every hub's rows as ONE numbered list (the hub order, then oldest first) → [{row, hub: the doc's index in docs, n}]. */
function entriesOf(docs = []) {
  const out = [];
  docs.forEach((d, h) => { for (const row of orderRows((d.doc && d.doc.sessions) || [])) out.push({ row, hub: h, n: out.length + 1 }); });
  return out;
}

/** `<session>` → {row, n, by} | {ambiguous: [rows]} | {none: true} | {code: 'number_not_tty'}: its number in `ls` (ONLY
 *  when `numbers` — a terminal, where the CLI then confirms the name: a number moves when an older session ends, so a
 *  piped line could reach the wrong conversation), its id (or ≥ 4 chars of its end or start), its exact name, or (a
 *  terminal again) a unique part of its name (case-insensitive). `list` = the rows in `ls` order (entriesOf). */
function pickSession(list = [], query = '', { numbers = true } = {}) {
  const q = String(query || '').trim();
  if (!q) return { none: true };
  const nOf = (r) => list.indexOf(r) + 1;
  const one = (r, by) => ({ row: r, n: nOf(r), by });
  const m = /^#?(\d{1,4})$/.exec(q);
  if (m && !numbers) return { code: 'number_not_tty', n: Number(m[1]) };
  if (m && list[Number(m[1]) - 1]) return one(list[Number(m[1]) - 1], 'number');
  const exact = list.find((r) => r.id === q);
  if (exact) return one(exact, 'id');
  const lq = q.toLowerCase();
  const named = list.filter((r) => (r.name || '').toLowerCase() === lq);
  if (named.length === 1) return one(named[0], 'name');
  if (named.length > 1) return { ambiguous: named };
  if (q.length >= 4) {
    const byId = list.filter((r) => r.id.endsWith(q) || r.id.startsWith(q));
    if (byId.length === 1) return one(byId[0], 'id');
    if (byId.length > 1) return { ambiguous: byId };
  }
  if (!numbers) return { none: true };
  const part = list.filter((r) => (r.name || '').toLowerCase().includes(lq));
  if (part.length === 1) return one(part[0], 'part');
  if (part.length > 1) return { ambiguous: part };
  return { none: true };
}

/** Terminal cells of a string: East Asian wide / fullwidth / emoji code points take two. */
function cellWidth(s) {
  let w = 0;
  for (const ch of String(s || '')) {
    const c = ch.codePointAt(0);
    if (c < 32 || (c >= 0x7f && c < 0xa0) || (c >= 0x300 && c < 0x370) || c === 0x200b) continue;
    w += (c >= 0x1100 && c <= 0x115f) || (c >= 0x2e80 && c <= 0xa4cf) || (c >= 0xac00 && c <= 0xd7a3) || (c >= 0xf900 && c <= 0xfaff)
      || (c >= 0xfe30 && c <= 0xfe4f) || (c >= 0xff00 && c <= 0xff60) || (c >= 0xffe0 && c <= 0xffe6) || (c >= 0x1f300 && c <= 0x1faff)
      || (c >= 0x20000 && c <= 0x3fffd) ? 2 : 1;
  }
  return w;
}
/** Cut to `w` cells (an ellipsis marks a cut) and pad to exactly `w`. */
function fitCell(s, w) {
  const t = String(s == null ? '' : s).replace(/\s+/g, ' ');
  if (cellWidth(t) <= w) return t + ' '.repeat(w - cellWidth(t));
  let out = '', used = 0;
  for (const ch of t) { const cw = cellWidth(ch); if (used + cw > w - 1) break; out += ch; used += cw; }
  return out + '…' + ' '.repeat(Math.max(0, w - used - 1));
}

const TURN_WORDS = Object.freeze({ running: 'working', waiting: 'needs you', idle: 'idle' });
const homeShort = (p, home) => (home && p && (p === home || p.startsWith(home + '/')) ? '~' + p.slice(home.length) : (p || ''));

/**
 * THE TABLE `vibespace ls` prints. items = [{row, verdict}] (any order — numbered by orderRows), `turnFresh` = the
 * hub's pulse is fresh (a stale turn word would lie: shown as «?»). → lines (no trailing newline).
 */
function tableOf(items = [], { now = 0, width = 120, home = '', turnFresh = false, start = 1 } = {}) {
  const ordered = orderRows(items.map((i) => i.row)).map((r) => items.find((i) => i.row === r));
  const fixed = { n: 3, state: 7, turn: 9, kind: 8, agent: 8, age: 4, id: 0 };
  fixed.id = Math.max(10, ...ordered.map((i) => cellWidth(i.row.id)));
  const gaps = 9; // between the 10 columns: 2 spaces each, minus the first
  const left = Math.max(24, width - 2 * gaps - Object.values(fixed).reduce((a, b) => a + b, 0));
  const nameW = Math.max(10, Math.floor(left * 0.4)), cwdW = Math.max(12, left - nameW);
  const line = (c) => [fitCell(c.n, fixed.n), fitCell(c.state, fixed.state), fitCell(c.turn, fixed.turn), fitCell(clean(c.kind), fixed.kind),
    fitCell(clean(c.agent), fixed.agent), fitCell(clean(c.name), nameW), fitCell(clean(c.cwd), cwdW), fitCell(c.age, fixed.age), clean(c.id)].join('  ').replace(/\s+$/, '');
  const out = [line({ n: '#', state: 'STATE', turn: 'TURN', kind: 'KIND', agent: 'AGENT', name: 'NAME', cwd: 'FOLDER', age: 'AGE', id: 'ID' })];
  ordered.forEach((it, i) => {
    const r = it.row, v = it.verdict || { state: 'unknown' };
    const turn = r.kind !== 'chat' || v.state !== 'alive' ? '—' : !turnFresh ? '?' : (TURN_WORDS[r.turn] || '—');
    out.push(line({ n: String(start + i), state: v.state, turn, kind: r.kind, agent: r.backend || '', name: r.name || '(no name)',
      cwd: (r.host ? (r.hostName || r.host) + ':' : '') + homeShort(r.cwd, home), age: r.createdAt ? ageWords(now - r.createdAt) : '?', id: r.id }));
  });
  return out;
}

// ── the dtach client packet (dtach 0.9, dtach.h): struct packet { uchar type; uchar len; union { uchar buf[8];
//    struct winsize ws; } u; } = 10 bytes; the master reads one packet per read and pushes at most 8 bytes per PUSH ──
const DTACH = Object.freeze({ PUSH: 0, ATTACH: 1, DETACH: 2, WINCH: 3, REDRAW: 4, REDRAW_NONE: 1, REDRAW_WINCH: 3, PACKET_BYTES: 10, PUSH_MAX: 8 });
function dtachPacket(type, len = 0, payload = null) {
  const b = Buffer.alloc(DTACH.PACKET_BYTES);
  b[0] = type; b[1] = len;
  if (payload) Buffer.from(payload).copy(b, 2, 0, DTACH.PUSH_MAX);
  return b;
}
/** Bytes → the PUSH packets that carry them, in order (≤ 8 bytes each). */
function dtachPush(bytes) {
  const src = Buffer.from(bytes);
  const out = [];
  for (let i = 0; i < src.length; i += DTACH.PUSH_MAX) { const part = src.subarray(i, i + DTACH.PUSH_MAX); out.push(dtachPacket(DTACH.PUSH, part.length, part)); }
  return Buffer.concat(out);
}
const dtachAttach = () => dtachPacket(DTACH.ATTACH);

// ── the chat frames: what each wrapper's stdin takes is the HUB'S OWN frame — the session's adapter (src/adapters/*
//    formatChatInput / formatInterrupt) asked once with two placeholders; the row carries the templates, the CLI fills
//    them. No harness is named here: a new harness's chat session is reachable the day it ships (test-local-index ⑪
//    pins the fill against every adapter) ──
const FRAME_TEXT = '\u0000vibespace-cli-text\u0000';
const FRAME_ID = '\u0000vibespace-cli-id\u0000';
/** The adapter's two frames (its stdin texts) → the row's templates {line, stop} — a stop's `request_id` (the stream-json
 *  control protocol's correlation key) becomes the id placeholder, so each Stop is its own request. null when unusable. */
function frameTemplatesOf(lineText, stopText) {
  let line, stop;
  try { line = JSON.parse(String(lineText)); stop = JSON.parse(String(stopText)); } catch { return null; }
  if (!line || typeof line !== 'object' || !stop || typeof stop !== 'object' || !JSON.stringify(line).includes(JSON.stringify(FRAME_TEXT).slice(1, -1))) return null;
  if (typeof stop.request_id === 'string') stop.request_id = FRAME_ID;
  return { line, stop };
}
/** A template with the placeholders filled — every string value, at any depth. */
function fillFrame(tpl, { text = '', id = '' } = {}) {
  // ONE pass: the id is filled in the template's own parts only — a text that happens to hold a placeholder stays as typed
  const fill = (v) => (typeof v === 'string' ? v.split(FRAME_TEXT).map((part) => part.split(FRAME_ID).join(String(id))).join(String(text))
    : Array.isArray(v) ? v.map(fill) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fill(x)])) : v);
  return fill(tpl);
}

// ── the wrapper's RECEIPTS (round 2): a frame carrying `webui_receipt: true` is acked INTO the wrapper's buffer (the CLI
//    never stays attached — it reads the buffer), the ack naming the frame's own id; a line that came in TORN (two
//    writers at once, a dropped byte) is refused with a nack — never a user message. ──
const RECEIPT_FLAG = 'webui_receipt';
/** A buffer record → {kind: 'ack', id} | {kind: 'nack', reason, bytes} | null. */
function receiptOf(rec) {
  if (!rec || typeof rec !== 'object') return null;
  if (rec.type === '_stdin_ack') return { kind: 'ack', id: typeof rec.msg_id === 'string' ? rec.msg_id : null, at: Number(rec.timestamp) || null };
  if (rec.type === '_stdin_nack') return { kind: 'nack', reason: String(rec.reason || 'torn'), bytes: Number(rec.bytes) || null, at: Number(rec.timestamp) || null };
  return null;
}

// ── the records → lines. {who: 'you'|'agent'|'tool'|'turn'|'note', text, chunk?} — the same records the web renders
//    (the user's and the agent's text; a tool call as ONE line; the turn's end) ──
const oneLine = (s, max = 160) => { const t = String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); return t.length > max ? t.slice(0, max - 1) + '…' : t; };
function toolLine(name, input) {
  const i = input && typeof input === 'object' ? input : {};
  const n = String(name || 'tool');
  if (typeof i.command === 'string') return `${n}: ${oneLine(i.command, 140)}`;
  for (const k of ['file_path', 'path', 'notebook_path', 'url', 'pattern', 'query', 'description', 'prompt']) if (typeof i[k] === 'string' && i[k]) return `${n}: ${oneLine(i[k], 140)}`;
  const first = Object.values(i).find((v) => typeof v === 'string' && v);
  return first ? `${n}: ${oneLine(first, 140)}` : n;
}
const textBlocks = (content) => (typeof content === 'string' ? [content]
  : Array.isArray(content) ? content.filter((b) => b && (b.type === 'text' || b.type === 'input_text' || b.type === 'output_text') && typeof b.text === 'string').map((b) => b.text) : []);
/** A typed message the transcript wraps in a tag (a slash command, a system reminder) — the command is shown, the rest is not the person's words. */
function personText(t) {
  const s = String(t || '').trim();
  if (!s) return null;
  const cmd = /^<command-name>([^<]{1,200})<\/command-name>(?:[\s\S]*?<command-args>([^<]{0,400})<\/command-args>)?/.exec(s);
  if (cmd) return (cmd[1].trim() + (cmd[2] ? ' ' + cmd[2].trim() : '')).trim();
  if (/^<[a-z][\w-]*[\s>]/i.test(s)) return null;
  if (/^Caveat: /.test(s)) return null;
  return s;
}
function recordLines(rec) { return rawRecordLines(rec).map((l) => ({ ...l, text: clean(l.text, { keep: '\n\t' }) })); }
function rawRecordLines(rec) {
  if (!rec || typeof rec !== 'object') return [];
  const out = [];
  // claude: stream-json on stdout AND the transcript (~/.claude/projects/…/<id>.jsonl) share these shapes
  if ((rec.type === 'assistant' || rec.type === 'user') && rec.message && !rec.isSidechain && !rec.parent_tool_use_id) {
    const c = rec.message.content;
    if (rec.type === 'assistant') {
      for (const b of Array.isArray(c) ? c : [{ type: 'text', text: c }]) {
        if (b && b.type === 'text' && String(b.text || '').trim()) out.push({ who: 'agent', text: String(b.text).trim() });
        else if (b && b.type === 'tool_use') out.push({ who: 'tool', text: toolLine(b.name, b.input) });
      }
    } else if (!rec.isMeta) {
      for (const t of textBlocks(c)) { const p = personText(t); if (p) out.push({ who: 'you', text: p }); }
    }
    return out;
  }
  // A PERMISSION ASK waits for an answer this CLI cannot give (the answer frame is the hub's) — said, never silent
  const ASK_DOOR = 'answer it on the hub\'s page (vibespace chat cannot answer a permission ask)';
  if (rec.type === 'control_request' && rec.request && rec.request.subtype === 'can_use_tool') return [{ who: 'note', text: `the agent asks to use ${toolLine(rec.request.tool_name, rec.request.input)} — ${ASK_DOOR}` }];
  if (rec.type === 'result') return [{ who: 'turn', text: rec.subtype && rec.subtype !== 'success' ? `turn ended (${rec.subtype})` : 'turn ended' }];
  if (rec.type === 'queue_changed' && Array.isArray(rec.items)) return [{ who: 'note', text: rec.items.length ? `${rec.items.length} message(s) held until the running turn ends` : 'nothing held' }];
  // acp-events (data/bin/acp-wrapper.js, agy-wrapper.js): {type:'acp', kind, …}
  if (rec.type === 'acp') {
    if (rec.kind === 'user') { for (const t of textBlocks(rec.content)) { const p = personText(t); if (p) out.push({ who: 'you', text: p }); } return out; }
    if (rec.kind === 'prompt_end') return [{ who: 'turn', text: rec.error && rec.error.message ? `turn ended (${oneLine(rec.error.message, 120)})` : 'turn ended' }];
    if (rec.kind === 'notice' && rec.text) return [{ who: 'note', text: oneLine(rec.text, 200) }];
    if (rec.kind === 'permission_request') return [{ who: 'note', text: `the agent asks: ${oneLine((rec.toolCall && (rec.toolCall.title || rec.toolCall.kind)) || 'a tool', 120)} — answer it on the hub's page (vibespace chat cannot answer a permission ask)` }];
    const u = rec.kind === 'update' && rec.update;
    if (u && u.sessionUpdate === 'agent_message_chunk' && u.content && typeof u.content.text === 'string' && !rec.replay) return [{ who: 'agent', text: u.content.text, chunk: true }];
    if (u && u.sessionUpdate === 'tool_call') return [{ who: 'tool', text: oneLine(u.title || u.kind || 'tool', 160) }];
    return [];
  }
  // codex (data/bin/codex-chat-wrapper.js): {timestamp, type: 'response_item'|'event_msg', payload}
  const p = rec.payload && typeof rec.payload === 'object' ? rec.payload : null;
  if (p && rec.type === 'response_item') {
    if (p.type === 'message' && p.role === 'user') { for (const t of textBlocks(p.content)) { const q = personText(t); if (q) out.push({ who: 'you', text: q }); } return out; }
    if (p.type === 'message' && p.role === 'assistant') { for (const t of textBlocks(p.content)) if (t.trim()) out.push({ who: 'agent', text: t.trim() }); return out; }
    if (p.type === 'agent_message' && typeof (p.text || p.message) === 'string') return [{ who: 'agent', text: String(p.text || p.message).trim() }];
    if (p.type === 'function_call') return [{ who: 'tool', text: oneLine(p.name || 'tool', 160) }];
    return [];
  }
  if (p && rec.type === 'server_request') return [{ who: 'note', text: `the agent asks (${oneLine(p.method || 'a request', 80)}) — answer it on the hub's page (vibespace chat cannot answer a permission ask)` }];
  if (p && rec.type === 'event_msg') {
    if (p.type === 'exec_command_begin') return [{ who: 'tool', text: `shell: ${oneLine(Array.isArray(p.command) ? p.command.join(' ') : p.command, 140)}` }];
    if (p.type === 'task_complete' || p.type === 'turn_aborted') return [{ who: 'turn', text: p.type === 'task_complete' ? 'turn ended' : 'turn ended (stopped)' }];
    if (p.type === 'task_failed') return [{ who: 'turn', text: `turn ended (${oneLine(p.message || p.error || 'failed', 120)})` }];
    return [];
  }
  return [];
}

/** JSON-lines text → its messages, oldest first (consecutive chunks of one speaker joined), the last `max`. */
const shownLines = recordLines;   // recordLines already belts every text (a message keeps its new lines)

function historyOf(text, { max = 20 } = {}) {
  const msgs = [];
  for (const ln of String(text || '').split('\n')) {
    const t = ln.replace(/\r$/, '').trim();
    if (!t || t[0] !== '{') continue;
    let rec; try { rec = JSON.parse(t); } catch { continue; }
    for (const l of shownLines(rec)) {
      const last = msgs[msgs.length - 1];
      if (l.chunk && last && last.chunk && last.who === l.who) { last.text += l.text; continue; }
      msgs.push({ ...l });
    }
  }
  return msgs.filter((m) => !m.chunk || m.text.trim()).map((m) => (m.chunk ? { who: m.who, text: m.text.trim() } : m)).slice(-Math.max(1, max));
}

/** /proc/<pid>/cgroup text → the systemd unit the process runs in ({unit, user}) — the hub's log is that unit's journal.
 *  The cgroup alone over-attributes (round 2): a hub started INSIDE a session of the unit's hub sits in the unit's cgroup
 *  too — the writer attributes the unit only when this process IS the unit's main process (unitOwnedBy). */
function unitOfCgroup(text) {
  for (const ln of String(text || '').split('\n')) {
    const p = ln.split(':').slice(2).join(':');
    const m = /\/([^/]+\.service)(?:\/[^/]*)?$/.exec(p);
    if (m && !/^user@\d+\.service$/.test(m[1])) return { unit: m[1], user: /\/user@\d+\.service\//.test(p) };
  }
  return null;
}

/** Is this process the unit's MAIN process? systemd ≥ 248 hands every unit process SYSTEMD_EXEC_PID = the pid it
 *  exec'd (scripts/install-service.sh: ExecStart=node server.js ⇒ the hub itself); without it, the parent is the
 *  manager (`systemd`). A hub inside a session has neither. */
function unitOwnedBy({ pid, execPid = null, ppid = null, parentComm = null } = {}) {
  if (execPid != null && String(execPid).trim() !== '') return Number(execPid) === Number(pid);
  return ppid != null && String(parentComm || '').trim() === 'systemd';
}

module.exports = {
  INDEX_VERSION, INDEX_KIND, INDEX_FILE_RE, OWN_ROOT_DIR, SWEEP_MS, HEARTBEAT_MS, FRESH_MS, NET_FSTYPE, ROW_KEYS, HUB_KEYS, SOCKET_FACTS, DTACH, TURN_WORDS,
  FRAME_TEXT, FRAME_ID, RECEIPT_FLAG, indexFileOf, mountOf, landedPathOf, indexPlaceOf, rungFolderOf, inputHeldOf, rowOf, docOf, parseIndex, procStat,
  procVerdict, socketFactOf, judgeRow, judgeHub, clean, ageWords, orderRows, orderHubs, entriesOf, pickSession, cellWidth, fitCell, tableOf,
  dtachPacket, dtachPush, dtachAttach, frameTemplatesOf, fillFrame, receiptOf, toolLine, personText, recordLines, historyOf, unitOfCgroup, unitOwnedBy,
};
