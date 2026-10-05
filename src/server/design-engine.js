'use strict';
/**
 * THE DESIGN WINDOW'S HUB (ORCH, lane design-core — docs/design-design-window.md §3.3).
 *
 * The canvas is plain-HTML artboards in a conversation's working folder (`designs/<slug>/`, src/design-model.js);
 * this module is everything the hub does about them:
 *
 *   REGISTRY   data/designs.json `{designs: [{id, sessionId, conversationId, host, dir, title, createdAt, openedAt}]}`,
 *              one row per (host, dir), written through writeJsonAtomic (async, serialized), a `designs-updated`
 *              broadcast on every write. `host` null = this machine (a PARAMETER, never a branch above the reader).
 *   READ       `read(host, dir)` = ONE operation per machine through ONE implementation, src/design-fs.js (dc-twins M1):
 *              async, bounded fs reads (readdir, then each file through an O_NOFOLLOW handle — a symlink is never
 *              followed out of the folder), in-process for this machine and as the daemon's `design-fs` op elsewhere
 *              (a Windows agent included); only a daemon-less ssh host gets the fallback rung, ONE remote command (RemoteFs.runScript) that lists and base64-cats the folder's artboards, manifest and
 *              images under the same caps — never 40 ssh round trips. Caps: 40 artboards, 2 MiB a file, 24 MB a read
 *              ⇒ `too_big` by name. The result is the model's: the manifest (or its refusals), every frame laid out
 *              with its verdict, the artboards inlined by THE ONE bundler.
 *   THE WATCH  a refcount of open windows per (host, dir), per socket (a socket's close unwatches it). This machine:
 *              an async `lstat` sweep of the manifest + the listed files every 2 s, ONLY while watched — never
 *              fs.watch / inotify (the owner's working folder is NFS, where inotify is silent; and three whole-instance
 *              outages were sync fs in this class). One stat at a time (a hung mount holds at most one threadpool
 *              thread), a per-sweep budget, no overlapping sweeps. A moved mtime ⇒ the existing `file-changed
 *              {host, path, mtime, by:'design'}` broadcast per file. A remote folder is not polled (P1: a daemon op)
 *              — the agent's `vibespace-design sync` is its notify rung (`changed`).
 *   COMMENT    the user's click on an element + their words → `[Design comment] <quote>: <text>`, the WHOLE line
 *              through THE belt (src/peer-text.js toAgentText — the quoted element text is an artboard's, and an
 *              artboard may be another agent's of a shared Task Group) → THE typing sender (src/server/user-input.js:
 *              the user's own message; mid-turn it queues like chat input). No live chat process ⇒ the durable stash
 *              (conversation-deliver's stashFor, source `design-comment`) — drained into the conversation's next
 *              turn, and the strip above its composer says a design comment waits (src/stash-summary.js).
 *   ASK        lane design-ask (design 003 §2 S1): the agent's questions (src/design-model.js validateQuestions) wait
 *              on ITS design's registry row (`ask: {id, at, sessionId, conversationId, questions}` — another conversation's
 *              design is refused `not_yours`; a newer ask replaces the older one; re-judged at every read), pushed to
 *              every client as `design-ask {host, dir, ask}`; the owner's answers become ONE line `[Design answers] …`
 *              (answersVerdict → answersText → THE belt) through the comment's own sender (userLine) to the
 *              conversation that asked; delivered ⇒ cleared (`design-ask … ask: null`).
 *   PREVIEW    lane design-ask (§2 S3): one artboard of a registered folder, as the read inlines it, for the agent's own
 *              look before a hand-over; the agent's browser carries no bearer, so `previewLink` mints a ticket bound to
 *              one (host, dir, file) for 15 minutes (at most 64 live) and every fetch re-reads the folder (a fix shows on
 *              reload). The route serves it under the published pages' sandbox CSP.
 *   CHANGES    the Design window's changes strip (lane design-changes, design 003 §2.2): ≤ 30 chips (a text edit, a
 *              style nudge, a comment — previews only, nothing written) → ONE `[Design changes]` message, the WHOLE
 *              block through THE belt → the comment's own sender (`userLine`: the typing sender, else the stash).
 *   BUNDLE     (lane design-present) read → every frame must pass → bundleCanvas (the runtime inlined) within the
 *              published-pages cap — what publish stores and the window's Download HTML hands over as a file.
 *   TWEAKS     lane design-tweaks (design 003 §2 S4): the knobs design.json declares (`tweaks`) and THE USER'S LAYER —
 *              `user.json` beside design.json, written ONLY here on the owner's act (`setTweaks`: atomic, a plain file
 *              inside the registered folder — a link or a non-file is refused by name; an ssh host through the one
 *              remote exec), read with the folder and baked into every artboard the read serves (design-model.js
 *              applyUser) — the window, the preview, publish. A write says `file-changed` for user.json: a frame whose
 *              document differs only in that layer restyles in place (design-model.js tweakSwap). "+ Tweaks" = the
 *              owner's request as ONE `[Design tweaks]` line through the comment's own sender.
 *   SYSTEMS    lane design-systems-home (design 003 §2 S5 + S6): a registry row's `kind` is 'system' for a design
 *              system (a folder holding system.md + tokens.css + component artboards — the CLI says so at `new --kind
 *              system` / `open`). `systems()` lists them; `systemTokens(name)` (name '' = the instance default, the
 *              `design.defaultSystem` setting) reads ONE registered system's tokens.css (O_NOFOLLOW; an ssh host through
 *              the one remote read) for the CLI, which writes the copy into the new folder it made — the hub writes no
 *              file. A read of a folder that holds tokens.css checks every artboard against it (DT.tokenLint — warnings).
 *              The home's acts on the registry only: `rename` (the user's name wins over the agent's title from then on)
 *              and `unlist` (the row leaves; the folder is never touched — `open` lists it again).
 *   PUBLISH    read → every frame must pass → bundleCanvas (the standalone runtime public/design-viewer.js when the
 *              build made it, else the model's placeholder) → the existing published-pages store, srcKey
 *              `<host|local>:<dir>` (same URL on republish; private by default, visibility kept unless asked).
 *
 * Gate: scripts/test-design-routes.mjs (fast).
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const M = require('../design-model.js');
const UL = require('../design-user-layer.js');   // lane design-tweaks: THE USER'S LAYER (user.json)
const DFS = require('../design-fs.js'); // dc-twins M1: THE folder reads + the user.json write, run where the folder lives
const DT = require('../design-tokens.js'); // lane design-systems-home: the design system's token check (PURE)
const { toAgentText: agentText } = require('../peer-text.js');
const { addressableId } = require('../claude-lock-capture.js');

const MiB = 1024 * 1024;
const POLL_MS = 2000;
const SWEEP_BUDGET = 128;          // stats per sweep, across every watched folder
const DIR_STATS = 48;              // stats per folder per sweep (the manifest + 40 artboards + a few images)
const WATCH_PER_SOCKET = 16;
const WATCH_TOTAL = 32;
const REMOTE_TIMEOUT_MS = 30000;
const REMOTE_MAX_BUFFER = 40 * MiB; // 24 MB of files as base64 + the frame lines
const ASSETS_PER_READ = DFS.ASSETS_PER_READ;
const COMMENT_LINE_MAX = 6000;
const CHANGES_TEXT_MAX = 48000;    // 30 chips × (a quote + a 1000-char comment), with room
const DESIGN_COMMENT_FROM = 'Design comment';
const RUNTIME_MAX = 4 * MiB;
const REGISTRY_MAX = 1000;         // rows kept (the least recently opened go first) — agents mint designs, nothing else bounds them
const LAST_READ_MAX = 200;         // folders whose last read's mtimes are remembered (to prime a watch)
const ANSWERS_LINE_MAX = 10000;    // 8 questions × (8 options of 80 + a written answer of 500) fit whole
const PREVIEW_TTL_MS = 15 * 60 * 1000;
const PREVIEW_TICKETS = 64;

/** Status per refusal code (the routes answer `{error, code}` with it). */
const STATUS = Object.freeze({
  bad_dir: 400, not_registered: 404, not_found: 404, not_a_dir: 400, too_big: 413, read_failed: 502, host_unreachable: 502,
  no_remote: 503, not_publishable: 409, empty: 400, too_long: 400, too_many: 400, bad_change: 400, no_change: 400, bad_files: 400, no_conversation: 409, input_rejected: 400,
  too_large: 400, send_failed: 500, publish_failed: 500, no_pages: 503, page_not_found: 404, page_forbidden: 403,
  watch_limit: 429, agent_forbidden: 403, no_session: 409,
  not_yours: 403, bad_questions: 400, no_questions: 409, stale: 409, bad_file: 400, not_previewable: 409, unauthorized: 401,
  bad_tweaks: 400, unknown_tweak: 400, bad_tweak: 400, not_tweakable: 409, user_not_file: 409, write_failed: 500,
  no_system: 404, no_default: 404, ambiguous: 409, no_tokens: 409, bad_tokens: 400,   // lane design-systems-home
});
const fail = (code, error, extra = {}) => ({ ok: false, code, error, ...extra });

async function writeJsonAtomic(file, obj) {
  const tmp = file + '.tmp-' + process.pid;
  await fs.promises.writeFile(tmp, JSON.stringify(obj, null, 2));
  await fs.promises.rename(tmp, file);
}

/** A folder as the caller names it → its normalized absolute posix path, or null. */
function dirOf(raw) {
  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  if (!s || s.length > 1024 || /[\u0000\n\r]/.test(s) || !s.startsWith('/')) return null;
  const n = path.posix.normalize(s).replace(/\/+$/, '');
  return n && n !== '/' ? n : null;
}
const hostOf = (h) => (h && h !== 'local' ? String(h) : null);
const keyOf = (host, dir) => `${host || 'local'}\u0000${dir}`;
const cleanTitle = (t) => String(t == null ? '' : t).replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, M.LIMITS.title);
const mintId = () => 'dg' + Array.from({ length: 10 }, () => 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)]).join('');
const isWatchable = (n) => n === M.MANIFEST_FILE || n === M.USER_FILE || M.isArtboardName(n) || M.isAssetName(n);

// ── the remote read: ONE command ────────────────────────────────────────────────────────────────────────────────────
const shq = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;
const HTML_GLOB = '*.[hH][tT][mM][lL]';
const IMAGE_GLOBS = ['*.[pP][nN][gG]', '*.[jJ][pP][gG]', '*.[jJ][pP][eE][gG]', '*.[gG][iI][fF]', '*.[wW][eE][bB][pP]', '*.[sS][vV][gG]'];
/** The one remote command: list the folder, base64-cat the manifest + every artboard (then the images) under the
 *  per-file and per-read caps, frame lines naming each file (its name base64'd — any byte is safe). POSIX sh. */
function remoteReadScript(dir) {
  return [
    `cd -- ${shq(dir)} 2>/dev/null || { printf '@@NODIR\\n'; exit 0; }`,
    `[ -d . ] || { printf '@@NODIR\\n'; exit 0; }`,
    `printf '@@VSD1\\n'; t=0; h=0; a=0`,
    `emit() { s=$(wc -c < "$1" 2>/dev/null | tr -d ' '); [ -n "$s" ] || return 0; m=$(stat -c %Y -- "$1" 2>/dev/null || stat -f %m -- "$1" 2>/dev/null || echo 0); nb=$(printf '%s' "$1" | base64 | tr -d '\\n'); if [ "$s" -le ${M.LIMITS.artboardBytes} ] && [ $((t + s)) -le ${M.LIMITS.readBytes} ]; then t=$((t + s)); printf '@@F %s %s %s 1\\n' "$s" "$m" "$nb"; base64 < "$1"; printf '@@E\\n'; else printf '@@F %s %s %s 0\\n' "$s" "$m" "$nb"; fi; }`,
    `[ -L ${M.USER_FILE} ] && printf '@@ULINK\\n'`,
    `for f in design.json ${M.USER_FILE} ${HTML_GLOB}; do [ -f "$f" ] && [ ! -L "$f" ] || continue; case "$f" in design.json|${M.USER_FILE}) ;; *) h=$((h + 1)) ;; esac; [ $h -le ${M.LIMITS.artboards} ] && emit "$f"; done`,
    `for f in ${IMAGE_GLOBS.join(' ')}; do [ -f "$f" ] && [ ! -L "$f" ] || continue; a=$((a + 1)); [ $a -le ${ASSETS_PER_READ} ] && emit "$f"; done`,
    `[ -f ${DT.TOKENS_FILE} ] && [ ! -L ${DT.TOKENS_FILE} ] && emit ${DT.TOKENS_FILE}`,   // lane design-systems-home: the token check
    `printf '@@HTML %s\\n@@END\\n' "$h"`,
  ].join('\n');
}
/** The command's output → {ok, files: Map(name → {size, mtime, bytes|null}), html} | a refusal. */
function parseRemoteRead(out) {
  const text = Buffer.isBuffer(out) ? out.toString('latin1') : String(out || '');
  const lines = text.split('\n');
  if (lines[0] === '@@NODIR') return fail('not_found', 'the folder does not exist on that machine');
  if (lines[0] !== '@@VSD1') return fail('read_failed', 'the machine answered something that is not a design read');
  const files = new Map();
  let html = null, ended = false, cur = null, body = [];
  for (let i = 1; i < lines.length; i++) {
    const l = lines[i];
    if (cur) {
      if (l === '@@E') { cur.bytes = Buffer.from(body.join(''), 'base64'); files.set(cur.name, cur); cur = null; body = []; } else body.push(l);
      continue;
    }
    let m;
    if ((m = /^@@F (\d+) (\d+) ([A-Za-z0-9+/=]*) ([01])$/.exec(l))) {
      const name = Buffer.from(m[3], 'base64').toString('utf8');
      const rec = { name, size: Number(m[1]), mtime: Number(m[2]) * 1000, bytes: null };
      if (m[4] === '1') cur = rec; else files.set(name, rec);
    } else if ((m = /^@@HTML (\d+)$/.exec(l))) html = Number(m[1]);
    else if (l === '@@ULINK') files.set(M.USER_FILE, { name: M.USER_FILE, size: 0, mtime: null, bytes: null, link: true });   // lane design-tweaks: said, never followed
    else if (l === '@@END') { ended = true; break; }
  }
  if (!ended || cur) return fail('read_failed', 'the read was cut short (the link to that machine carries a bounded answer) — try again, or make the design smaller');
  return { ok: true, files, html };
}

// ── the user's layer (lane design-tweaks): user.json beside design.json, written only by the hub ─────────────────────
/** The Tweaks read on an ssh host: design.json + user.json in ONE command (the read's frame lines; a link said apart). */
function remoteMetaScript(dir) {
  return [
    `cd -- ${shq(dir)} 2>/dev/null || { printf '@@NODIR\\n'; exit 0; }`,
    `printf '@@VSD1\\n'`,
    `[ -L ${M.USER_FILE} ] && printf '@@ULINK\\n'`,
    `for f in ${M.MANIFEST_FILE} ${M.USER_FILE}; do [ -f "$f" ] && [ ! -L "$f" ] || continue; s=$(wc -c < "$f" 2>/dev/null | tr -d ' '); [ -n "$s" ] || continue; m=$(stat -c %Y -- "$f" 2>/dev/null || stat -f %m -- "$f" 2>/dev/null || echo 0); nb=$(printf '%s' "$f" | base64 | tr -d '\\n'); if [ "$s" -le ${M.LIMITS.artboardBytes} ]; then printf '@@F %s %s %s 1\\n' "$s" "$m" "$nb"; base64 < "$f"; printf '@@E\\n'; else printf '@@F %s %s %s 0\\n' "$s" "$m" "$nb"; fi; done`,
    `printf '@@HTML 0\\n@@END\\n'`,
  ].join('\n');
}
/** The one remote command that writes user.json: a link or a non-file is refused by name, then mktemp beside it, the
 *  bytes base64'd in the command, mv (a rename replaces the name — never a file a link points at). */
function remoteUserWriteScript(dir, text) {
  const b64 = Buffer.from(String(text), 'utf8').toString('base64');
  return [
    `cd -- ${shq(dir)} 2>/dev/null || { printf '@@NODIR\\n'; exit 0; }`,
    `if [ -L ${M.USER_FILE} ] || { [ -e ${M.USER_FILE} ] && [ ! -f ${M.USER_FILE} ]; }; then printf '@@NOTFILE\\n'; exit 0; fi`,
    `t=$(mktemp ./.user.json.XXXXXX 2>/dev/null) || { printf '@@FAIL\\n'; exit 0; }`,
    `if printf '%s' ${shq(b64)} | base64 -d > "$t" 2>/dev/null && mv -f -- "$t" ${M.USER_FILE}; then printf '@@OK\\n'; else rm -f -- "$t"; printf '@@FAIL\\n'; fi`,
  ].join('\n');
}
/** A read's user.json record → {set: the user's values that fit, values: every declared knob's, warnings}. A link, an
 *  unreadable or an invalid file is SAID (a warning by name) and the defaults show. */
function userLayerFrom(rec, manifest) {
  const warnings = [];
  let user = null;
  if (rec && rec.link) warnings.push({ code: 'user_not_file', where: M.USER_FILE, why: 'user.json is a link or not a plain file — the user\'s tweak values are read only from a plain file in the design folder (the defaults show)' });
  else if (rec && !rec.bytes) warnings.push({ code: 'too_big', where: M.USER_FILE, why: 'user.json is too large to read (the defaults show)' });
  else if (rec) { const v = UL.validateUserLayer(rec.bytes.toString('utf8')); if (v.ok) user = v.user; else warnings.push({ code: v.code, where: M.USER_FILE, why: `${v.why} (the defaults show)` }); }
  const uv = UL.userValues(manifest, user);
  for (const x of uv.dropped) warnings.push({ code: 'bad_value', where: M.USER_FILE, why: x.why });
  return { set: uv.set, values: uv.values, warnings };
}
const TWEAK_WANTS = Object.freeze({ color: () => 'a colour #rrggbb', range: (t) => `a number from ${t.min} to ${t.max}`, select: () => 'one of its options', toggle: () => 'true or false' });

function create({
  dataDir, rootDir = path.join(__dirname, '..', '..'),
  activeSessions = new Map(),
  getRemoteFs = () => null, getPublishedPages = () => null, getDeliver = () => null,
  sendUserInput = null,
  broadcastAll = () => { }, broadcastToSession = () => { },
  log = () => { }, now = () => Date.now(),
  timers = { setInterval, clearInterval, setTimeout },
  pollMs = POLL_MS,
  serverSetting = () => undefined,   // lane design-systems-home: `design.defaultSystem`
} = {}) {
  const fsp = fs.promises;
  const storeFile = path.join(dataDir, 'designs.json');
  let store = { designs: [] };
  try { store = JSON.parse(fs.readFileSync(storeFile, 'utf8')) || { designs: [] }; } catch { /* first boot */ }
  if (!Array.isArray(store.designs)) store.designs = [];
  store.designs = store.designs.filter((r) => r && typeof r === 'object' && dirOf(r.dir));
  let saving = Promise.resolve();
  const save = () => {
    const snap = { designs: store.designs.map((r) => ({ ...r })) };
    saving = saving.then(() => writeJsonAtomic(storeFile, snap)).catch((e) => log('[design] registry save failed:', e.message));
    return saving;
  };
  const pub = (r) => ({ id: r.id, sessionId: r.sessionId || null, conversationId: r.conversationId || null, host: r.host || null, dir: r.dir, title: r.title || '', kind: r.kind === 'system' ? 'system' : 'design', createdAt: r.createdAt, openedAt: r.openedAt });
  const find = (host, dir) => store.designs.find((r) => (r.host || null) === (host || null) && r.dir === dir) || null;
  const notify = (row, extra = {}) => { try { broadcastAll({ type: 'designs-updated', design: pub(row), ...extra }); } catch (e) { log('[design] designs-updated broadcast failed:', e.message); } };
  const lastRead = new Map();   // key → {at, mtimes:{name: ms}} — primes a new watch, so a change after the read is seen

  // ── registry ──
  function register({ host = null, dir, title = '', sessionId = null, conversationId = null, kind = null } = {}) {
    const d = dirOf(dir);
    if (!d) return fail('bad_dir', 'name the design folder by its absolute path (vibespace-design new prints it)');
    const h = hostOf(host);
    let row = find(h, d);
    const created = !row;
    if (!row) {
      row = { id: mintId(), sessionId: null, conversationId: null, host: h, dir: d, title: '', createdAt: now(), openedAt: now() };
      store.designs.push(row);
      if (store.designs.length > REGISTRY_MAX) {   // the bound: the least recently opened rows leave (their folders stay on disk; `open` registers again)
        const order = new Map(store.designs.map((r, i) => [r, i]));   // a tie on the clock: the later row is the newer (the one just added stays)
        store.designs.sort((a, b) => ((Number(b.openedAt) || 0) - (Number(a.openedAt) || 0)) || (order.get(b) - order.get(a)));
        store.designs.length = REGISTRY_MAX;
      }
    }
    if (sessionId) row.sessionId = String(sessionId);
    if (conversationId) row.conversationId = String(conversationId);
    const t = cleanTitle(title);
    if (t && !row.named) row.title = t; else if (!row.title) row.title = path.posix.basename(d);   // a name the user gave (the home's Rename) stays
    if (kind === 'system' || kind === 'design') row.kind = kind;
    row.openedAt = now();
    save();
    notify(row, { created });
    return { ok: true, design: pub(row), created };
  }
  const list = ({ sessionId = null, conversationId = null } = {}) => store.designs
    .filter((r) => (!sessionId && !conversationId) || (sessionId && r.sessionId === sessionId) || (conversationId && r.conversationId === conversationId))
    .map(pub);
  const pageOf = (row) => {
    const pages = getPublishedPages();
    if (!pages || !row) return null;
    const key = `${row.host || 'local'}:${row.dir}`;
    const p = pages.list({}).find((x) => x.srcKey === key);
    return p ? { id: p.id, path: p.path, public: !!p.public, updatedAt: p.updatedAt } : null;
  };

  // ── reads ──
  /** THE FOLDER'S MACHINE (dc-twins M1 — the sysinfo 2.314.0 precedent): ONE implementation, src/design-fs.js. This
   *  machine (device #0) runs it in-process; a machine whose daemon serves `design-fs` runs the SAME module there in ONE
   *  op (a Windows `fs-portable` agent included — no shell); null ⇒ a daemon-less ssh host (or an older daemon): the
   *  caller's ONE-command sh script, the fallback rung. The host is a parameter here, never a branch above. */
  async function onMachine(h, action, params) {
    if (!h) return DFS.run(action, params);
    const rfs = getRemoteFs();
    const dm = rfs && typeof rfs.deviceWith === 'function' ? await rfs.deviceWith(h, DFS.CAP).catch(() => null) : null;
    if (!dm) return null;
    try { return DFS.fromWire(await dm.designFs(action, params)); }
    catch (e) { return fail('host_unreachable', `the machine did not answer (${String(e && e.message || e).slice(0, 200)})`); }
  }
  /** The sh rung (a daemon-less ssh host): ONE command through RemoteFs. */
  async function readRemote(host, dir) {
    const rfs = getRemoteFs();
    if (!rfs || typeof rfs.runScript !== 'function') return fail('no_remote', 'reading another machine is not available on this server');
    let out;
    try { out = await rfs.runScript(host, remoteReadScript(dir), { timeoutMs: REMOTE_TIMEOUT_MS, maxBuffer: REMOTE_MAX_BUFFER }); }
    catch (e) { return fail('host_unreachable', `the machine did not answer (${String(e && e.message || e).slice(0, 200)})`); }
    const r = parseRemoteRead(out);
    if (!r.ok) return r;
    if (r.html > M.LIMITS.artboards) return fail('too_big', M.readCapsVerdict({ artboards: r.html }).why);
    // a file within its own cap that came without bytes = the read's budget ran out
    for (const f of r.files.values()) if (!f.bytes && f.size <= M.LIMITS.artboardBytes) f.over = true;
    return r;
  }
  /** The raw listing → the model's answer for the window / the agent / publish. */
  function compose(host, dir, raw) {
    const files = raw.files;
    let manifest = M.emptyManifest(), refusals = [];
    const mf = files.get(M.MANIFEST_FILE);
    if (mf) {
      if (!mf.bytes) refusals = [{ code: 'too_big', where: M.MANIFEST_FILE, why: 'design.json is too large to read' }];
      else { const v = UL.validateDesign(mf.bytes.toString('utf8')); if (v.ok) manifest = v.manifest; else refusals = v.refusals; }
    }
    const ul = userLayerFrom(files.get(M.USER_FILE), manifest);   // lane design-tweaks: THE USER'S LAYER over the declared knobs
    const htmlNames = [...files.keys()].filter((n) => /\.html$/i.test(n));
    const lay = M.layoutOf(manifest, htmlNames);
    const assets = new Map();
    for (const [n, f] of files) if (M.isAssetName(n)) assets.set(n, f.bytes ? f.bytes.length : (f.capped ? -2 : f.over ? -1 : f.size));
    const usedAssets = new Set();
    let total = 0, overBudget = false;
    const sys = systemCheck(files, manifest);   // lane design-systems-home: {tokens|null, warnings}
    const frames = lay.frames.map((f) => {
      const rec = files.get(f.file);
      const out = { ...f, bytes: rec ? rec.size : 0, mtime: rec ? rec.mtime : null };
      if (f.missing || !rec) return { ...out, verdict: { ok: false, code: 'missing', why: `${f.file} is listed in design.json but is not in the folder` } };
      if (f.dup) return { ...out, verdict: { ok: false, code: 'duplicate', why: `${f.file} differs from another artboard only by case — rename one` } };
      if (rec.over) { overBudget = true; return { ...out, verdict: { ok: false, code: 'too_big', why: `${f.file} did not fit in one read (24 MB) — shrink or remove images` } }; }
      if (!rec.bytes) return { ...out, verdict: M.artboardVerdict(f.file, '', { bytes: rec.size }) };
      const html = rec.bytes.toString('utf8');
      const v = M.artboardVerdict(f.file, html, { assets, bytes: rec.bytes.length });
      if (!v.ok) return { ...out, verdict: v };
      if (sys.tokens) sys.warnings.push(...DT.tokenLint(html, sys.tokens, { file: f.file }));
      if (v.assets.some((a) => assets.get(a) === -2)) return { ...out, verdict: { ok: false, code: 'too_big', why: `${f.file} needs an image past the ${ASSETS_PER_READ}-image cap of one read — a design inlines at most ${ASSETS_PER_READ} images in all (use fewer, or split the design)` } };
      if (v.assets.some((a) => assets.get(a) === -1)) { overBudget = true; return { ...out, verdict: { ok: false, code: 'too_big', why: `${f.file}'s images did not fit in one read (24 MB) — shrink or remove images` } }; }
      total += rec.bytes.length;
      for (const a of v.assets) if (!usedAssets.has(a)) { usedAssets.add(a); total += assets.get(a) || 0; }
      const inl = M.inlineAssets(html, (name) => { const r = files.get(name); return r && r.bytes ? r.bytes.toString('base64') : null; });
      return { ...out, verdict: { ok: true }, html: UL.applyUser(inl.html, manifest, { tweaks: ul.set }) };
    });
    const mtimes = {};
    for (const [n, f] of files) if (!f.capped) mtimes[n] = f.mtime;   // an unread image is not watched
    const row = find(host, dir);
    // `artboards` = the window's read normaliser's shape (L2, design §3.7): the html + the verdict per file, beside `frames`
    const artboards = frames.map((f) => (f.verdict.ok ? { file: f.file, html: f.html, ok: true } : { file: f.file, ok: false, code: f.verdict.code, why: f.verdict.why }));
    return {
      ok: true, host: host || null, dir, design: row ? pub(row) : null,
      title: (row && row.named && row.title) || manifest.title || (row && row.title) || path.posix.basename(dir),
      manifest, refusals, warnings: [...lay.warnings, ...sys.warnings], frames, artboards, pages: manifest.pages, notes: manifest.notes, launch: manifest.launch,
      totalBytes: total, overBudget, readAt: now(), mtimes,
      tweaks: manifest.tweaks || [], user: { tweaks: ul.set }, userWarnings: ul.warnings,
    };
  }
  /** `read(host, dir)` — ONE operation for the machine that holds the folder (the registry is asked by the callers). */
  async function read(host, dir) {
    const d = dirOf(dir);
    if (!d) return fail('bad_dir', 'name the design folder by its absolute path');
    const h = hostOf(host);
    const raw = (await onMachine(h, 'read', { dir: d })) || await readRemote(h, d);
    if (!raw.ok) return raw;
    const r = compose(h, d, raw);
    const k = keyOf(h, d);
    lastRead.delete(k);
    lastRead.set(k, { at: r.readAt, mtimes: r.mtimes });
    if (lastRead.size > LAST_READ_MAX) lastRead.delete(lastRead.keys().next().value);   // the oldest read is forgotten first
    primeWatch(k, r.mtimes);
    return r;
  }
  /** A watch that started before a read of its folder finished (the window asks to watch, THEN reads) is primed by what
   *  that read saw — never by its own first sweep: a write landing between the read and that sweep would become the
   *  baseline and never be shown (L4 run 0: a write within 2 s of opening the window was missed until the next edit). */
  function primeWatch(key, mtimes) {
    const w = watches.get(key);
    if (!w || w.primed) return;
    for (const [n, m] of Object.entries(mtimes || {})) if (isWatchable(n)) { w.names.add(n); w.mtimes.set(n, m); }
    w.primed = true; w.listed = true;
  }
  /** The registered folder's read (every route goes through this one). */
  async function readDesign(host, dir) {
    const d = dirOf(dir);
    if (!d) return fail('bad_dir', 'name the design folder by its absolute path');
    if (!find(hostOf(host), d)) return fail('not_registered', `${d} is not a registered design — vibespace-design new (or open <dir>) registers it`);
    return read(host, d);
  }

  // ── design systems + the home's acts (lane design-systems-home, design 003 §2 S5 + S6) ──
  /** A read's token check: the folder's tokens.css (bounded) → {tokens: tokensOf(...) | null, warnings}. */
  function systemCheck(files, manifest) {
    const tok = files.get(DT.TOKENS_FILE);
    const named = manifest.system ? manifest.system.name : null;
    if (!tok) return { tokens: null, warnings: named ? [{ code: 'no_tokens', where: DT.TOKENS_FILE, why: `design.json follows the design system "${named}" but tokens.css is not in the folder — copy the system's tokens.css beside the artboards` }] : [] };
    const v = tok.bytes ? DT.tokensVerdict(tok.bytes.toString('utf8')) : { ok: false, why: `tokens.css is over ${DT.TOKEN_LIMITS.tokensBytes / 1024} KB` };
    if (!v.ok) return { tokens: null, warnings: [{ code: 'bad_tokens', where: DT.TOKENS_FILE, why: `${v.why} — the artboards were not checked against it` }] };
    return { tokens: DT.tokensOf(v.text), warnings: [] };
  }
  const systemName = (r) => r.title || path.posix.basename(r.dir);
  /** Every registered design system, the most recently opened first. */
  const systems = () => store.designs.filter((r) => r.kind === 'system')
    .sort((a, b) => (Number(b.openedAt) || 0) - (Number(a.openedAt) || 0))
    .map((r) => ({ id: r.id, name: systemName(r), host: r.host || null, dir: r.dir, openedAt: r.openedAt }));
  const defaultSystem = () => { try { return cleanTitle(serverSetting('design.defaultSystem') || ''); } catch { return ''; } };
  /** A system by its name (case-insensitive: the row's title or its folder's name) or its folder; '' = the instance
   *  default. → {ok, row, viaDefault} | a refusal by name. */
  function resolveSystem(name) {
    const raw = String(name == null ? '' : name).replace(/[\x00-\x1f\x7f]+/g, ' ').trim().slice(0, 1024);
    const want = raw || defaultSystem();
    if (!want) return fail('no_default', 'no design system was named and this VibeSpace has no default one (⚙ All Settings → Chat → Default design system)');
    const all = store.designs.filter((r) => r.kind === 'system');
    const d = dirOf(want);
    let hits = d ? all.filter((r) => r.dir === d) : [];
    if (!hits.length) { const k = cleanTitle(want).toLowerCase(); hits = all.filter((r) => systemName(r).toLowerCase() === k || path.posix.basename(r.dir).toLowerCase() === k); }
    if (!hits.length) return fail('no_system', `no design system is named "${cleanTitle(want)}"${raw ? '' : ' (this VibeSpace\'s default)'} — ${all.length ? `the registered ones: ${all.slice(0, 8).map(systemName).join(', ')}` : 'none is registered yet (vibespace-design new <slug> --kind system makes one)'}`);
    if (hits.length > 1) return fail('ambiguous', `${hits.length} design systems are named "${cleanTitle(want)}" — name one by its folder: ${hits.slice(0, 5).map((r) => r.dir).join(', ')}`);
    return { ok: true, row: hits[0], viaDefault: !raw };
  }
  /** ONE registered system's tokens.css: this machine = an O_NOFOLLOW read of that one file; an ssh host = the one
   *  remote read. → {ok, text} | a refusal by name. */
  async function readTokens(host, dir) {
    const missing = () => fail('no_tokens', `the design system at ${dir} has no tokens.css — its agent writes one (custom properties: --accent, --radius, …)`);
    let text;
    const viaFs = await onMachine(host, 'tokens', { dir });
    if (viaFs) {
      if (!viaFs.ok) return viaFs;
      text = viaFs.text;
    } else {
      const raw = await readRemote(host, dir);
      if (!raw.ok) return raw;
      const f = raw.files.get(DT.TOKENS_FILE);
      if (!f) return missing();
      if (!f.bytes || f.size > DT.TOKEN_LIMITS.tokensBytes) return fail('bad_tokens', `the design system's tokens.css is over ${DT.TOKEN_LIMITS.tokensBytes / 1024} KB`);
      text = f.bytes.toString('utf8');
    }
    const v = DT.tokensVerdict(text);
    return v.ok ? { ok: true, text: v.text } : fail('bad_tokens', `the design system's tokens.css: ${v.why}`);
  }
  /** For `vibespace-design new --system`: the named (or default) system + its tokens.css text. The caller writes the
   *  copy into the folder it made; nothing here writes. */
  async function systemTokens(name) {
    const s = resolveSystem(name);
    if (!s.ok) return s;
    const r = await readTokens(s.row.host || null, s.row.dir);
    if (!r.ok) return r;
    return { ok: true, system: { name: systemName(s.row), host: s.row.host || null, dir: s.row.dir }, viaDefault: s.viaDefault, tokens: r.text };
  }
  /** The home's Rename: the user's name for a design (kept over the agent's title from then on). */
  function rename({ host = null, dir, title } = {}) {
    const d = dirOf(dir);
    const row = d ? find(hostOf(host), d) : null;
    if (!row) return fail('not_registered', 'that design is not in the list');
    const t = cleanTitle(title);
    if (!t) return fail('empty', 'a design needs a name');
    row.title = t; row.named = true;
    save();
    notify(row);
    return { ok: true, design: pub(row) };
  }
  /** The home's "Remove from the list": the registry row leaves — the folder and every file in it stay as they are. */
  function unlist({ host = null, dir } = {}) {
    const d = dirOf(dir);
    const row = d ? find(hostOf(host), d) : null;
    if (!row) return fail('not_registered', 'that design is not in the list');
    store.designs = store.designs.filter((r) => r !== row);
    save();
    notify(row, { removed: true });
    return { ok: true, design: pub(row) };
  }

  // ── the watch ──
  const watches = new Map();        // key → {host, dir, sockets:Set, names:Set, mtimes:Map, primed, listed}
  const bySocket = new Map();       // ws → Set(key)
  let ticker = null, sweeping = null, rr = 0;
  const ensureTicker = () => {
    const any = [...watches.values()].some((w) => !w.host);
    if (any && !ticker) { ticker = timers.setInterval(() => { sweepOnce().catch((e) => log('[design] sweep failed:', e.message)); }, pollMs); if (ticker && ticker.unref) ticker.unref(); }
    else if (!any && ticker) { timers.clearInterval(ticker); ticker = null; }
  };
  function watch(ws, host, dir) {
    const d = dirOf(dir);
    if (!d) return fail('bad_dir', 'name the design folder by its absolute path');
    const h = hostOf(host);
    if (!find(h, d)) return fail('not_registered', `${d} is not a registered design`);
    const key = keyOf(h, d);
    const mine = bySocket.get(ws) || new Set();
    if (!mine.has(key)) {
      if (mine.size >= WATCH_PER_SOCKET) return fail('watch_limit', `one window set watches at most ${WATCH_PER_SOCKET} designs`);
      if (!watches.has(key) && watches.size >= WATCH_TOTAL) return fail('watch_limit', `this server watches at most ${WATCH_TOTAL} designs at once`);
    }
    let w = watches.get(key);
    if (!w) {
      w = { key, host: h, dir: d, sockets: new Set(), names: new Set(), mtimes: new Map(), primed: false, listed: false };
      const lr = lastRead.get(key);
      if (lr) { for (const [n, m] of Object.entries(lr.mtimes)) if (isWatchable(n)) { w.names.add(n); w.mtimes.set(n, m); } w.primed = true; w.listed = true; }
      watches.set(key, w);
    }
    w.sockets.add(ws);
    mine.add(key);
    bySocket.set(ws, mine);
    ensureTicker();
    return { ok: true, watchers: w.sockets.size, polled: !h };
  }
  /** accept-fixes F3: does a Design window watch this folder (within `ms`)? — THE fact `sync` counts, so `new` / `open`
   *  say a window is open only when the hub sees one (a push is not a window). */
  async function watchedSoon(host, dir, ms = 1500) {
    const key = keyOf(hostOf(host), dirOf(dir));
    for (const end = Date.now() + ms; ;) {
      const w = watches.get(key);
      if (w && w.sockets.size) return true;
      if (Date.now() >= end) return false;
      await new Promise((r) => (timers.setTimeout || setTimeout)(r, 100));
    }
  }
  function unwatch(ws, host, dir) {
    const d = dirOf(dir);
    if (!d) return fail('bad_dir', 'name the design folder by its absolute path');
    const key = keyOf(hostOf(host), d);
    const w = watches.get(key);
    if (w) { w.sockets.delete(ws); if (!w.sockets.size) watches.delete(key); }
    const mine = bySocket.get(ws);
    if (mine) { mine.delete(key); if (!mine.size) bySocket.delete(ws); }
    ensureTicker();
    return { ok: true, watchers: w ? w.sockets.size : 0 };
  }
  function unwatchSocket(ws) {
    const mine = bySocket.get(ws);
    if (!mine) return 0;
    for (const key of mine) { const w = watches.get(key); if (w) { w.sockets.delete(ws); if (!w.sockets.size) watches.delete(key); } }
    bySocket.delete(ws);
    ensureTicker();
    return mine.size;
  }
  async function relist(w) {
    try {
      const ents = await fsp.readdir(w.dir, { withFileTypes: true });
      const names = ents.filter((e) => e.isFile() && isWatchable(e.name)).map((e) => e.name).sort((a, b) => (a === M.MANIFEST_FILE ? -1 : b === M.MANIFEST_FILE ? 1 : 0));
      for (const n of names.slice(0, DIR_STATS)) w.names.add(n);
    } catch { /* the folder is gone: every stat below says so */ }
    w.listed = true;
  }
  async function sweepDir(w, budget) {
    if (!w.listed) await relist(w);
    const names = [M.MANIFEST_FILE, ...[...w.names].filter((n) => n !== M.MANIFEST_FILE)].slice(0, Math.max(1, Math.min(DIR_STATS, budget)));
    const changed = [];
    for (const n of names) {
      let m = null;
      try { const st = await fsp.lstat(path.join(w.dir, n)); m = st.isFile() ? Math.round(st.mtimeMs) : null; } catch { m = null; }
      const had = w.mtimes.has(n);
      const prev = had ? w.mtimes.get(n) : null;
      if (w.primed && prev !== m && (had || m !== null)) changed.push([n, m]);
      w.mtimes.set(n, m);
    }
    w.primed = true;
    if (changed.some(([n]) => n === M.MANIFEST_FILE)) await relist(w);
    for (const [n, m] of changed) {
      if (!watches.has(w.key)) break;   // unwatched mid-sweep
      try { broadcastAll({ type: 'file-changed', host: w.host, path: path.posix.join(w.dir, n), mtime: m, by: 'design' }); } catch { }
    }
    return names.length;
  }
  /** ONE sweep over the watched folders of this machine (the ticker's body; never two at once). */
  function sweepOnce() {
    if (sweeping) return sweeping;
    sweeping = (async () => {
      const keys = [...watches.keys()].filter((k) => !watches.get(k).host);
      if (!keys.length) return 0;
      let budget = SWEEP_BUDGET, swept = 0;
      const start = rr % keys.length;
      rr += 1;
      for (let i = 0; i < keys.length && budget > 0; i++) {
        const w = watches.get(keys[(start + i) % keys.length]);
        if (!w) continue;
        const used = await sweepDir(w, budget);
        budget -= used; swept += 1;
      }
      return swept;
    })().finally(() => { sweeping = null; });
    return sweeping;
  }
  /** The notify rung (`vibespace-design sync` / `add`): the named files changed. */
  async function changed(host, dir, files) {
    const d = dirOf(dir);
    if (!d) return fail('bad_dir', 'name the design folder by its absolute path');
    const h = hostOf(host);
    if (!find(h, d)) return fail('not_registered', `${d} is not a registered design — vibespace-design open ${d} registers it`);
    const list = Array.isArray(files) ? files : [];
    if (list.length > M.LIMITS.artboards + 20 || list.some((f) => !isWatchable(f))) return fail('bad_files', 'files must be the design folder\'s own artboards, images or design.json, by name (at most 60)');
    const names = list.length ? [...new Set(list)] : [M.MANIFEST_FILE];
    const w = watches.get(keyOf(h, d));
    for (const n of names) {
      let m = null;
      if (!h) { try { const st = await fsp.lstat(path.join(d, n)); m = st.isFile() ? Math.round(st.mtimeMs) : null; } catch { m = null; } }
      if (w) { w.names.add(n); w.mtimes.set(n, m); }   // the poll has seen it now — no second broadcast
      try { broadcastAll({ type: 'file-changed', host: h, path: path.posix.join(d, n), mtime: m, by: 'design' }); } catch { }
    }
    return { ok: true, notified: names.length, watchers: w ? w.sockets.size : 0 };
  }

  // ── the comment ──
  /** The conversation a design comment waits for when no live chat process can take it (`prefer`: the conversation
   *  that asked the questions an answer is for). */
  function conversationFor(sessionId, host, dir, prefer = null) {
    const s = activeSessions.get(sessionId);
    const own = s ? addressableId(s) : null;
    if (own) return own;
    if (prefer) return String(prefer);
    const d = dirOf(dir);
    const row = d ? find(hostOf(host), d) : null;
    if (row && row.conversationId && (!row.sessionId || row.sessionId === sessionId || !s)) return row.conversationId;
    return null;
  }
  /** The user's comment on an element → THE typing sender, else the stash. → {ok, delivered:'sent'|'stashed', …}. */
  function comment({ sessionId, host = null, dir = '', quote = {}, text } = {}) {
    const v = M.commentVerdict(text);
    if (!v.ok) return fail(v.code, v.why);
    if (typeof sessionId !== 'string' || !sessionId) return fail('no_session', 'name the conversation the comment is for');
    const line = agentText(M.commentText(M.pickQuote(quote), v.text), { kind: 'block', max: COMMENT_LINE_MAX });
    return userLine(sessionId, host, dir, line);
  }
  /** The session to type into: the window's own while it lives, else — a resume mints a new session id — the live
   *  session (a chat one first) of the conversation the line would be stashed for. design-joint verify r1: a window
   *  opened before a resume stashed its comments and changes for a next turn while the answers went live, so the agent
   *  read them out of the order the owner sent them (and the owner was told the conversation was not running). */
  function liveSessionFor(sessionId, host, dir, prefer) {
    if (activeSessions.has(sessionId)) return sessionId;
    const cid = conversationFor(sessionId, host, dir, prefer);
    let any = null;
    if (cid) for (const [id, s] of activeSessions) if (s && addressableId(s) === cid) { if (s.mode === 'chat') return id; any = any || id; }
    return any || sessionId;
  }
  /** The changes strip's chips → ONE `[Design changes]` message down the comment's own sender. */
  function changes({ sessionId, host = null, dir = '', items } = {}) {
    const v = M.changesVerdict(items);
    if (!v.ok) return fail(v.code, v.why, { index: v.index });
    if (typeof sessionId !== 'string' || !sessionId) return fail('no_session', 'name the conversation the changes are for');
    const line = agentText(M.changesText(v.items), { kind: 'block', max: CHANGES_TEXT_MAX });
    return { ...userLine(sessionId, host, dir, line), count: v.items.length };
  }
  /** THE sender of the window's messages — a line the USER said on a design (a comment, the answers, a batch of
   *  changes): the belted line → THE typing sender as the user's own message, else the durable stash (`prefer`: the
   *  conversation that asked — the answers). → {ok, delivered:'sent'|'stashed', …}. */
  function userLine(windowSessionId, host, dir, line, prefer = null) {
    const sessionId = liveSessionFor(windowSessionId, host, dir, prefer);
    const r = typeof sendUserInput === 'function' ? sendUserInput(sessionId, line, { msgId: now() + '-design', origin: 'design-comment' }) : { ok: false, code: 'no_session' };
    if (r && r.ok) return { ok: true, delivered: 'sent', msgId: r.msgId, text: line };
    if (!r || (r.code !== 'no_session' && r.code !== 'not_chat')) return fail((r && r.code) || 'send_failed', (r && r.error) || 'the comment was not sent');
    const cid = conversationFor(sessionId, host, dir, prefer);
    if (!cid) return fail('no_conversation', 'this conversation is not running and has no id yet — open its chat and send the comment there');
    const deliver = getDeliver();
    if (!deliver || typeof deliver.stashFor !== 'function') return fail('send_failed', 'the conversation is not running and its waiting queue is unavailable');
    let st;
    try { st = deliver.stashFor(cid, { source: 'design-comment', kind: 'peer', fromName: DESIGN_COMMENT_FROM, text: line }); }
    catch (e) { return fail('send_failed', e.message); }
    return { ok: true, delivered: 'stashed', stored: !st || st.stored !== false, why: (st && st.why) || null, conversationId: cid, text: line };
  }

  // ── ask first: the questions form (lane design-ask) ──
  /** A row's pending questions, re-judged at every read (an older build or a hand edit of the registry never puts an
   *  unjudged question on the owner's sheet). */
  function askOf(row) {
    const a = row && row.ask;
    if (!a || typeof a !== 'object' || typeof a.id !== 'string' || !/^qa[a-z0-9]{10}$/.test(a.id)) return null;
    const v = M.validateQuestions(a.questions);
    return v.ok ? { id: a.id, at: Number(a.at) || 0, sessionId: a.sessionId ? String(a.sessionId) : null, conversationId: a.conversationId ? String(a.conversationId) : null, questions: v.questions } : null;
  }
  const askPub = (a) => (a ? { id: a.id, at: a.at, questions: a.questions } : null);
  const askPush = (row) => { try { broadcastAll({ type: 'design-ask', host: row.host || null, dir: row.dir, ask: askPub(askOf(row)) }); } catch (e) { log('[design] design-ask broadcast failed:', e.message); } };
  /** The agent's questions → pending on ITS design (the caller's session or conversation registered it). → {ok, ask, design}. */
  function ask({ host = null, dir, sessionId = null, conversationId = null, questions } = {}) {
    const d = dirOf(dir);
    if (!d) return fail('bad_dir', 'name the design folder by its absolute path');
    const row = find(hostOf(host), d);
    if (!row) return fail('not_registered', `${d} is not a registered design — vibespace-design new (or open <dir>) registers it`);
    const mine = (sessionId && row.sessionId === sessionId) || (conversationId && row.conversationId === conversationId);
    if (!mine) return fail('not_yours', 'this design belongs to another conversation — ask on a design of your own (vibespace-design list)');
    const v = M.validateQuestions(questions);
    if (!v.ok) return fail('bad_questions', v.refusals[0].why, { refusals: v.refusals });
    row.ask = { id: 'qa' + mintId().slice(2), at: now(), sessionId: sessionId || null, conversationId: conversationId || null, questions: v.questions };
    save();
    askPush(row);
    return { ok: true, ask: askPub(askOf(row)), design: pub(row) };
  }
  /** The window's read of the pending questions (`ask: null` = none). */
  function pendingAsk(host, dir) {
    const d = dirOf(dir);
    if (!d) return fail('bad_dir', 'name the design folder by its absolute path');
    const row = find(hostOf(host), d);
    if (!row) return fail('not_registered', `${d} is not a registered design`);
    return { ok: true, ask: askPub(askOf(row)) };
  }
  /** The owner's answers → ONE line through the comment's own sender, to the conversation that asked; delivered ⇒ the
   *  questions are cleared on every client. A refused send keeps them (the sheet stays, the words are not lost). */
  function answer({ host = null, dir, askId, skip = false, answers } = {}) {
    const d = dirOf(dir);
    if (!d) return fail('bad_dir', 'name the design folder by its absolute path');
    const row = find(hostOf(host), d);
    if (!row) return fail('not_registered', `${d} is not a registered design`);
    const a = askOf(row);
    if (!a) return fail('no_questions', 'no questions wait on this design — they were answered already');
    if (askId !== a.id) return fail('stale', 'the agent asked new questions meanwhile — the sheet shows them now');
    const v = M.answersVerdict(a.questions, { skip: skip === true, answers });
    if (!v.ok) return fail(v.code, v.why);
    const line = agentText(M.answersText(v), { kind: 'block', max: ANSWERS_LINE_MAX });
    // the asking session, else the conversation's live session now (a resume mints a new session id), else the stash —
    // never the ROW's session (design-joint verify r1): a job of another conversation that registered the folder later
    // asks with no session of its own, and the row still names the first conversation's chat
    let sid = a.sessionId || '';
    if (!activeSessions.has(sid) && a.conversationId) for (const [id, s] of activeSessions) if (s && addressableId(s) === a.conversationId) { sid = id; break; }
    const r = userLine(sid, row.host || null, row.dir, line, a.conversationId);
    if (!r.ok) return r;
    row.ask = null;
    save();
    askPush(row);
    return r;
  }

  // ── the visual check (lane design-ask) ──
  const tickets = new Map();   // ticket → {host, dir, file, exp}
  /** One artboard as the window's read inlines it → {ok, html, file, w, h, host, dir} | a refusal by name. */
  async function preview(host, dir, file) {
    if (!M.isArtboardName(file)) return fail('bad_file', 'name one artboard of the folder by its file name (Main.html)');
    const r = await readDesign(host, dir);
    if (!r.ok) return r;
    const f = r.frames.find((x) => x.file === file);
    if (!f || f.missing) return fail('not_found', `${file} is not an artboard of ${r.dir}`);
    if (!f.verdict.ok) return fail('not_previewable', `artboard refused: ${f.verdict.why}`);
    return { ok: true, html: f.html, file: f.file, w: f.w, h: f.h, host: r.host, dir: r.dir };
  }
  /** The address the agent's browser opens (it carries no bearer): a ticket bound to ONE (host, dir, file), 15 min. */
  async function previewLink(host, dir, file) {
    const p = await preview(host, dir, file);
    if (!p.ok) return p;
    const t = now();
    for (const [k, v] of tickets) if (v.exp <= t) tickets.delete(k);
    while (tickets.size >= PREVIEW_TICKETS) tickets.delete(tickets.keys().next().value);   // the oldest goes first
    const ticket = crypto.randomBytes(24).toString('base64url');
    tickets.set(ticket, { host: p.host, dir: p.dir, file: p.file, exp: t + PREVIEW_TTL_MS });
    return { ok: true, ticket, file: p.file, w: p.w, h: p.h, expiresAt: t + PREVIEW_TTL_MS };
  }
  /** A ticket's artboard, read fresh. An unknown or expired ticket = unauthorized. */
  async function previewByTicket(ticket) {
    const k = typeof ticket === 'string' && /^[A-Za-z0-9_-]{32}$/.test(ticket) ? ticket : '';
    const v = k ? tickets.get(k) : null;
    if (!v || v.exp <= now()) { if (v) tickets.delete(k); return fail('unauthorized', 'this preview address is unknown or expired — run vibespace-design preview again'); }
    return preview(v.host, v.dir, v.file);
  }

  // ── the user's layer: Tweaks (lane design-tweaks — design 003 §2 S4) ──
  /** The Tweaks panel's read and a write's base: design.json + user.json only (this machine: two O_NOFOLLOW reads; an
   *  ssh host: ONE command) → {ok, manifest, refusals, set, values, warnings}. */
  async function readMeta(h, d) {
    let files;
    const viaFs = await onMachine(h, 'meta', { dir: d });
    if (viaFs) {
      if (!viaFs.ok) return viaFs;
      files = viaFs.files;
    } else {
      const rfs = getRemoteFs();
      if (!rfs || typeof rfs.runScript !== 'function') return fail('no_remote', 'reading another machine is not available on this server');
      let out;
      try { out = await rfs.runScript(h, remoteMetaScript(d), { timeoutMs: REMOTE_TIMEOUT_MS, maxBuffer: 8 * MiB }); }
      catch (e) { return fail('host_unreachable', `the machine did not answer (${String(e && e.message || e).slice(0, 200)})`); }
      const raw = parseRemoteRead(out);
      if (!raw.ok) return raw;
      files = raw.files;
    }
    let manifest = M.emptyManifest(), refusals = [];
    const mf = files.get(M.MANIFEST_FILE);
    if (mf) {
      if (!mf.bytes) refusals = [{ code: 'too_big', where: M.MANIFEST_FILE, why: 'design.json is too large to read' }];
      else { const v = UL.validateDesign(mf.bytes.toString('utf8')); if (v.ok) manifest = v.manifest; else refusals = v.refusals; }
    }
    return { ok: true, manifest, refusals, ...userLayerFrom(files.get(M.USER_FILE), manifest) };
  }
  /** The panel's read: the declared knobs, the values they show, the user's own. */
  async function tweaks(host, dir) {
    const d = dirOf(dir);
    if (!d) return fail('bad_dir', 'name the design folder by its absolute path');
    const h = hostOf(host);
    if (!find(h, d)) return fail('not_registered', `${d} is not a registered design`);
    const r = await readMeta(h, d);
    if (!r.ok) return r;
    return { ok: true, host: h, dir: d, tweaks: r.manifest.tweaks || [], values: r.values, set: r.set, refusals: r.refusals, warnings: r.warnings };
  }
  const userWrites = new Map();   // key → the folder's write chain: one user.json write at a time
  /** The owner moved knobs (`values`: {<id>: value | null = back to its default}) or pressed Reset → user.json written
   *  (atomic; a plain file inside the registered folder only — a link or a non-file is refused by name; an ssh host
   *  through the one remote exec) → `file-changed` for it: every open window restyles its frames. */
  function setTweaks({ host = null, dir, values = {}, reset = false } = {}) {
    const d = dirOf(dir);
    if (!d) return Promise.resolve(fail('bad_dir', 'name the design folder by its absolute path'));
    const h = hostOf(host);
    if (!find(h, d)) return Promise.resolve(fail('not_registered', `${d} is not a registered design`));
    if (!values || typeof values !== 'object' || Array.isArray(values) || Object.keys(values).length > M.TWEAK_LIMITS.tweakCount) return Promise.resolve(fail('bad_tweaks', `values must be an object {"<tweak id>": value | null} of at most ${M.TWEAK_LIMITS.tweakCount}`));
    const k = keyOf(h, d);
    const run = (userWrites.get(k) || Promise.resolve()).then(() => writeTweaks(h, d, values, reset === true));
    const tail = run.catch(() => { });
    userWrites.set(k, tail);
    tail.then(() => { if (userWrites.get(k) === tail) userWrites.delete(k); });
    return run;
  }
  async function writeTweaks(h, d, values, reset) {
    const r = await readMeta(h, d);
    if (!r.ok) return r;
    if (r.refusals.length) return fail('not_tweakable', `design.json is refused: ${r.refusals[0].why}`);
    const decl = r.manifest.tweaks || [];
    if (!decl.length && !reset) return fail('not_tweakable', 'this design declares no tweaks — ask the agent for some (+ Tweaks)');
    const next = reset ? {} : { ...r.set };
    for (const [id, v] of Object.entries(values)) {
      const t = decl.find((x) => x.id === id);
      if (!t) return fail('unknown_tweak', `${JSON.stringify(String(id).slice(0, 40))} is not a tweak this design declares`);
      if (v === null) delete next[id];
      else if (UL.tweakValueOk(t, v)) next[id] = v;
      else return fail('bad_tweak', `that is not a value of tweak "${t.id}" — ${TWEAK_WANTS[t.kind](t)}`);
    }
    const ordered = {};
    for (const t of decl) if (Object.prototype.hasOwnProperty.call(next, t.id)) ordered[t.id] = next[t.id];
    const text = UL.userLayerText(ordered);
    const w = (await onMachine(h, 'write-user', { dir: d, text })) || await writeUserRemote(h, d, text);
    if (!w.ok) return w;
    const file = path.posix.join(d, M.USER_FILE);
    const mtime = Number.isFinite(w.mtime) ? w.mtime : null;   // the machine's own lstat after the rename (the sh rung says none)
    const wt = watches.get(keyOf(h, d));
    if (wt) { wt.names.add(M.USER_FILE); wt.mtimes.set(M.USER_FILE, mtime); }   // the poll has seen it now — no second broadcast
    try { broadcastAll({ type: 'file-changed', host: h, path: file, mtime, by: 'design' }); } catch { }
    return { ok: true, set: ordered, values: UL.userValues(r.manifest, { tweaks: ordered }).values };
  }
  /** user.json on a daemon-less ssh host (the sh rung): ONE command through RemoteFs (remoteUserWriteScript). */
  async function writeUserRemote(h, d, text) {
    const rfs = getRemoteFs();
    if (!rfs || typeof rfs.runScript !== 'function') return fail('no_remote', 'writing on another machine is not available on this server');
    let out;
    try { out = await rfs.runScript(h, remoteUserWriteScript(d, text), { timeoutMs: REMOTE_TIMEOUT_MS, maxBuffer: 64 * 1024 }); }
    catch (e) { return fail('host_unreachable', `the machine did not answer (${String(e && e.message || e).slice(0, 200)})`); }
    const said = (Buffer.isBuffer(out) ? out.toString('utf8') : String(out || '')).split('\n')[0].trim();
    if (said === '@@OK') return { ok: true };
    if (said === '@@NODIR') return fail('not_found', 'the design folder does not exist on that machine');
    if (said === '@@NOTFILE') return fail('user_not_file', `${d}/user.json on that machine is a link or not a plain file — the user's tweak values are written only as a plain file inside the design folder (remove it, then try again)`);
    return fail('write_failed', 'user.json could not be written on that machine');
  }
  /** "+ Tweaks" on a design that declares none: ONE `[Design tweaks]` line (the owner's request) down the comment's sender. */
  function requestTweaks({ sessionId, host = null, dir = '', text = '' } = {}) {
    if (typeof sessionId !== 'string' || !sessionId) return fail('no_session', 'name the conversation the request is for');
    if (typeof text !== 'string' || text.length > 4 * UL.TWEAK_LIMITS.requestChars) return fail('too_long', `say it in at most ${UL.TWEAK_LIMITS.requestChars} characters`);
    const line = agentText(UL.tweaksRequestText(text), { kind: 'block', max: COMMENT_LINE_MAX });
    return userLine(sessionId, host, dir, line);
  }

  // ── publish ──
  let runtimeCache = { at: 0, js: '' };
  async function runtimeJs() {
    const fp = path.join(rootDir, 'public', 'design-viewer.js');
    try {
      const st = await fsp.stat(fp);
      if (st.size > RUNTIME_MAX) return '';
      if (runtimeCache.at === st.mtimeMs) return runtimeCache.js;
      const js = await fsp.readFile(fp, 'utf8');
      runtimeCache = { at: st.mtimeMs, js };
      return js;
    } catch { return ''; }
  }
  /** THE BUNDLE (publish's, and the window's Download HTML — lane design-present): read → every frame passes →
   *  bundleCanvas with the runtime inlined, within the published-pages size cap. → {ok, html, size, read} | refusal */
  async function bundle(host, dir) {
    const r = await readDesign(host, dir);
    if (!r.ok) return r;
    if (r.refusals.length) return fail('not_publishable', `design.json is refused: ${r.refusals[0].why}`, { refusals: r.refusals });
    if (!r.frames.length) return fail('not_publishable', 'the folder holds no artboard (write Main.html first)');
    const bad = r.frames.find((f) => !f.verdict.ok);
    if (bad) return fail('not_publishable', `artboard refused: ${bad.verdict.why}`);
    const files = {};
    for (const f of r.frames) files[f.file] = f.html;
    const html = M.bundleCanvas({ manifest: r.manifest, files, runtimeJs: await runtimeJs() });
    const size = M.sizeVerdict(Buffer.byteLength(html, 'utf8'));
    if (!size.ok) return fail('too_big', size.why);
    return { ok: true, html, size, read: r };
  }
  /** the bundle → the published-pages store (srcKey `<host|local>:<dir>`, or the existing page `pageId` the caller
   *  may write). */
  async function publish({ host = null, dir, title = '', makePublic, sessionId = null, conversationId = null, req = null, pageId = null } = {}) {
    const pages = getPublishedPages();
    if (!pages || typeof pages.publishContent !== 'function') return fail('no_pages', 'published pages are not available on this server');
    const b = await bundle(host, dir);
    if (!b.ok) return b;
    const r = b.read;
    let srcKey = `${r.host || 'local'}:${r.dir}`;
    if (pageId) {
      const rec = pages.list({}).find((p) => p.id === pageId);
      if (!rec) return fail('page_not_found', `no published page ${pageId}`);
      const mine = (sessionId && rec.sessionId === sessionId) || (conversationId && rec.conversationId === conversationId);
      if (!mine) return fail('page_forbidden', `page ${pageId} was not published by this conversation — publish without --page for its own URL`);
      srcKey = rec.srcKey;
    }
    const p = pages.publishContent({ html: b.html, name: cleanTitle(title) || r.title, srcKey, srcPath: r.dir, makePublic, sessionId, conversationId, req });
    if (!p || p.error) return fail('publish_failed', (p && p.error) || 'the page store refused it');
    return { ok: true, page: p.page, size: b.size, frames: r.frames.length };
  }

  // ── the agent's view of a read: every string a file of the folder wrote, through THE belt ──
  const line = (v, max = 400) => agentText(v == null ? '' : v, { kind: 'line', max });
  const block = (v, max = M.LIMITS.noteText) => agentText(v == null ? '' : v, { kind: 'block', max });
  /** An agent never gets the inlined HTML (it has the files): the verdicts, the layout, the words — belted. */
  function agentView(r) {
    if (!r || !r.ok) return r;
    const size = M.sizeVerdict(r.totalBytes);
    return {
      ok: true, host: r.host, dir: r.dir, title: line(r.title, M.LIMITS.title),
      kind: r.design && r.design.kind === 'system' ? 'system' : 'design', system: r.manifest && r.manifest.system ? { name: line(r.manifest.system.name, M.LIMITS.title) } : null,
      refusals: r.refusals.map((x) => ({ code: x.code, where: line(x.where, 120), why: line(x.why) })),
      warnings: r.warnings.map((x) => ({ code: x.code, where: line(x.where, 120), why: line(x.why) })),
      pages: r.pages.map((p) => ({ id: p.id, name: line(p.name, M.LIMITS.pageName) })),
      frames: r.frames.map((f) => ({ file: f.file, title: line(f.title, M.LIMITS.title), x: f.x, y: f.y, w: f.w, h: f.h, page: f.page, placed: f.placed, bytes: f.bytes, ok: !!f.verdict.ok, ...(f.verdict.ok ? {} : { code: f.verdict.code, why: line(f.verdict.why) }) })),
      notes: r.notes.map((n) => ({ id: n.id, color: n.color, page: n.page || null, text: block(n.text) })),
      launch: r.launch, totalBytes: r.totalBytes, size: { ok: size.ok, warn: !!size.warn, why: size.why || null },
      // lane design-tweaks: the knobs it declared and what the user set (THE USER'S LAYER — read it, never write it)
      tweaks: (r.tweaks || []).map((t) => ({ id: t.id, label: line(t.label, UL.TWEAK_LIMITS.labelChars), kind: t.kind, ...(t.var ? { var: t.var } : { attr: t.attr }), default: typeof t.default === 'string' ? line(t.default, 100) : t.default, ...(t.kind === 'range' ? { min: t.min, max: t.max, step: t.step, unit: t.unit } : {}), ...(t.kind === 'select' ? { options: t.options.map((o) => line(o, 100)) } : {}) })),
      user: { tweaks: Object.fromEntries(Object.entries((r.user && r.user.tweaks) || {}).map(([k, v]) => [k, typeof v === 'string' ? line(v, 100) : v])), warnings: (r.userWarnings || []).map((x) => ({ code: x.code, why: line(x.why) })) },
    };
  }

  /** The window opens (or comes to the front) on a session's clients: the openSpec rides a `design-open` push. */
  function openOn(session, sessionId, d) {
    broadcastToSession(session, sessionId, { type: 'design-open', sessionId, design: d, openSpec: { action: 'openDesign', host: d.host || null, dir: d.dir, sessionId } });
  }
  /** A registry row for an agent: its title is the registrant's words (another session of a shared folder) — belted. */
  /** The design systems as an agent reads them: every name is a registrant's words (another conversation's) — belted. */
  // a system's folder and name were written by ANOTHER conversation's agent: every one through THE belt (design-cd-joint r1)
  const agentSystems = () => ({ systems: systems().map((x) => ({ name: line(x.name, M.LIMITS.title), host: x.host, dir: line(x.dir, 1024) })), defaultSystem: line(defaultSystem(), M.LIMITS.title) });
  async function agentSystemTokens(name) {
    const r = await systemTokens(name);
    if (!r.ok) return { ...r, error: line(r.error, 2000) };   // no_system / ambiguous list other systems' names and folders
    return { ...r, system: { ...r.system, name: line(r.system.name, M.LIMITS.title), dir: line(r.system.dir, 1024) } };
  }
  const agentRow = (d) => ({ id: d.id, host: d.host, dir: d.dir, title: line(d.title, M.LIMITS.title), openedAt: d.openedAt, kind: d.kind || 'design' });

  return {
    register, list, openOn, agentRow, find: (host, dir) => { const d = dirOf(dir); const r = d ? find(hostOf(host), d) : null; return r ? pub(r) : null; }, pageOf: (host, dir) => pageOf(find(hostOf(host), dirOf(dir))),
    read, readDesign, watch, unwatch, unwatchSocket, watchedSoon, sweepOnce, changed, comment, changes, publish, agentView,
    bundle, // lane design-present: the publish bundle as a file (GET /api/design/bundle)
    ask, pendingAsk, answer, preview, previewLink, previewByTicket,
    tweaks, setTweaks, requestTweaks,
    systems, defaultSystem, systemTokens, rename, unlist, agentSystems, agentSystemTokens,   // lane design-systems-home
    flush: () => saving, _watches: watches, STATUS,
  };
}

module.exports = { create, STATUS, DESIGN_COMMENT_FROM, remoteReadScript, parseRemoteRead, dirOf, remoteMetaScript, remoteUserWriteScript };
