'use strict';
/**
 * CLUSTER PRESETS — THE ONE READER OF THE PRESETS DIRECTORY (ORCH; lane
 * cluster-presets, B-53fe, 2026-10-01 — the owner: "这种环境问题怎么总是出现
 * 以后能避免吗 每次下发环境变量都要给人家重启").
 *
 * A company preset (Google OAuth clients, a Lark app, a browser key) used to be
 * an ENV VAR read at boot and written PER RELEASE: rotating one = a helm
 * upgrade of every user = a pod roll each, and a release that never got the
 * block (a new user) silently had none. Now the presets are FILES in a
 * directory the chart mounts from ONE cluster Secret (plus an optional
 * per-release override), and this module WATCHES it:
 *
 *   <dir>/integrations.json            the cluster layer (the integrations env's JSON)
 *   <dir>/gdrive-clients.json          the cluster layer (the Google clients env's JSON)
 *   <dir>/override/integrations.json   the release layer (the user's own release values)
 *   <dir>/override/gdrive-clients.json
 *
 * `<dir>` = `VIBESPACE_PRESETS_DIR` (set and empty = off), else
 * /etc/vibespace/presets when it exists (the server's own instance only —
 * `installForServer`; the lazily-made shared instance of any other process
 * reads only an explicit VIBESPACE_PRESETS_DIR, so a suite on a fleet pod is
 * never handed the company's presets behind its env).
 *
 * KUBERNETES UPDATES A SECRET VOLUME IN PLACE by writing a new timestamped
 * directory and swapping the `..data` symlink (one rename — never a subPath
 * mount, those never update); the kubelet resyncs every `syncFrequency` (1 min
 * by default, Watch strategy ⇒ ~no cache delay) ⇒ a Secret edit lands within
 * ≤ ~2 min. A `fs.watch` on the directory sees the swap at once; a 30 s
 * signature poll (stat only — ino/size/mtime + the `..data` target) is the net
 * for a missed event or an in-place edit of a plain directory's override/.
 *
 * ON A CHANGE: ONE re-read (single flight, debounced), the layers merged per
 * key (src/preset-layers.js), and only when the merged presets DIFFER: the
 * snapshot replaced, ONE journal line naming what changed (keys, never
 * values), then every listener (the integration store re-derives its
 * `cluster:<k>` rung and broadcasts; the wiring pushes the summary to every
 * client — the 2.309.0 rule). A file that cannot be read or parsed KEEPS ITS
 * PREVIOUS presets and says so ONCE per transition; it never throws.
 *
 * The boot read is synchronous on purpose: consumers ask synchronously
 * (`drivePresets()`, `resolveIntegration()`), the files are a few KiB on the
 * kubelet's tmpfs, and each is size-checked before it is read (1 MiB bound).
 * Every later read is async. The directory must be LOCAL (a network mount
 * here would put a sync read on the boot path — the never-block law).
 */
const fs = require('fs');
const path = require('path');
const P = require('../preset-layers.js');
const { describeJsonError } = require('../secret-box.js');

const DEFAULT_DIR = '/etc/vibespace/presets';
const FILES = Object.freeze({ integrations: 'integrations.json', gdrive: 'gdrive-clients.json' });
const OVERRIDE_DIR = 'override';
const MAX_BYTES = 1024 * 1024;
const POLL_MS = 30 * 1000;
const DEBOUNCE_MS = 300;
const RE_READS = 3;              // a `..data` swap landing during a read ⇒ read the new tree, this many times at most

/** Where the presets live for THIS process: an explicit `VIBESPACE_PRESETS_DIR`
 *  ('' = off), else — only when `useDefault` — the default when it is a directory. */
function resolveDir(env = process.env, { useDefault = false, isDir = (p) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } } } = {}) {
  if (env.VIBESPACE_PRESETS_DIR !== undefined) return env.VIBESPACE_PRESETS_DIR ? path.resolve(String(env.VIBESPACE_PRESETS_DIR)) : null;
  return useDefault && isDir(DEFAULT_DIR) ? DEFAULT_DIR : null;
}

function create({ dir = null, log = console, now = () => Date.now(), pollMs = POLL_MS, debounceMs = DEBOUNCE_MS } = {}) {
  const fileOf = (layer, kind) => (layer === 'release' ? path.join(dir, OVERRIDE_DIR, FILES[kind]) : path.join(dir, FILES[kind]));
  const slots = [];                       // {layer, kind, file, list:null|[], mtimeMs, said}
  for (const layer of P.LAYERS) for (const kind of P.KINDS) slots.push({ layer, kind, list: null, mtimeMs: null, said: null });
  let merged = { integrations: null, gdrive: null };
  let loadedAt = null;
  let signature = null;
  const listeners = new Set();
  let watcher = null; let poll = null; let debounce = null;
  let running = null; let again = false; let stopped = false;
  let lastErrKey = '';

  /** One file's outcome: `{list}` (absent ⇒ list null) or `{error:{code, detail}}`. */
  function judge(slot, st, readText) {
    if (!st) return { list: null, mtimeMs: null };
    if (!st.isFile()) return { error: { code: 'not-a-file', detail: 'not a regular file' } };
    if (st.size > MAX_BYTES) return { error: { code: 'too-large', detail: `${st.size} bytes > ${MAX_BYTES}` } };
    let text;
    try { text = readText(); } catch (e) { return { error: { code: 'unreadable', detail: (e && e.code) || String(e) } }; }
    let parsed;
    // never `e.message`: V8 quotes the bytes around a JSON error (a secret's tail)
    try { parsed = JSON.parse(text); } catch (e) { return { error: { code: 'unparseable', detail: describeJsonError(e) } }; }
    try { return { list: P.PARSERS[slot.kind](parsed), mtimeMs: st.mtimeMs }; } catch (e) { return { error: { code: 'not-an-array', detail: 'the top level must be a JSON array' } }; }
  }
  /** Apply one outcome to its slot; a failure keeps the slot's previous list and is said ONCE per transition. */
  function apply(slot, out, { boot }) {
    const rel = slot.layer === 'release' ? `${OVERRIDE_DIR}/${FILES[slot.kind]}` : FILES[slot.kind];
    if (out.error) {
      const line = `[presets] ${rel} could not be read (${out.error.code}: ${out.error.detail}) — ${slot.list ? 'keeping the previous presets' : (boot ? 'no presets from it until it is fixed' : 'it offers no presets until it is fixed')}`;
      if (slot.said !== line) { slot.said = line; log.error(line); }
      slot.error = { layer: slot.layer, file: FILES[slot.kind], code: out.error.code, kept: !!slot.list };
      return;
    }
    if (slot.said) { slot.said = null; log.log(`[presets] ${rel} reads again`); }
    slot.error = null; slot.list = out.list; slot.mtimeMs = out.mtimeMs;
  }
  function remerge() {
    const next = {};
    for (const kind of P.KINDS) {
      const layers = {};
      for (const s of slots) if (s.kind === kind) layers[s.layer] = s.list;
      next[kind] = P.mergeLayers(kind, layers);
    }
    return next;
  }

  /** A file in the directory (or override/) the reader does not know — a
   *  self-hosting typo (`integration.json`), a key a newer chart projects before
   *  this app reads it — is SAID once per set, by name: never silently ignored
   *  (verify r1, the "future key" cell). The kubelet's own entries (`..data`,
   *  the timestamped dirs) and the override/ dir itself are not files to read. */
  let saidStrays = '';
  function sayStrays() {
    const known = new Set([...Object.values(FILES), OVERRIDE_DIR]);
    const strays = [];
    for (const [sub, keep] of [['', known], [OVERRIDE_DIR, new Set(Object.values(FILES))]]) {
      let names = []; try { names = fs.readdirSync(path.join(dir, sub)); } catch { continue; }
      for (const n of names) if (!n.startsWith('.') && !keep.has(n)) strays.push(sub ? `${sub}/${n}` : n);
    }
    const key = strays.join('|');
    if (key && key !== saidStrays) log.warn(`[presets] ${dir}: ignored ${strays.join(', ')} — the files read are ${Object.values(FILES).join(', ')} (and the same two under ${OVERRIDE_DIR}/)`);
    saidStrays = key;
  }

  // ── the boot read (sync, size-checked; see the header) ───────────────────
  function bootRead() {
    if (!dir) return;
    for (const slot of slots) {
      const f = fileOf(slot.layer, slot.kind);
      let st = null;
      try { st = fs.statSync(f); } catch (e) { if (!(e && e.code === 'ENOENT')) { apply(slot, { error: { code: 'unreadable', detail: e.code || String(e) } }, { boot: true }); continue; } }
      apply(slot, judge(slot, st, () => fs.readFileSync(f, 'utf-8')), { boot: true });
    }
    merged = remerge();
    loadedAt = now();
    lastErrKey = slots.map((s) => (s.error ? `${s.layer}:${s.kind}:${s.error.code}` : '')).join('|');
    const n = P.KINDS.map((k) => `${k === 'gdrive' ? 'Google clients' : 'integrations'} ${merged[k] ? merged[k].entries.length : 'absent'}`).join(', ');
    log.log(`[presets] ${dir}: ${n} (the environment is the fallback for an absent kind)`);
    sayStrays();
  }

  // ── live: the watch + the signature poll + ONE re-read ───────────────────
  async function signatureNow() {
    const bits = [];
    try { bits.push('data=' + await fs.promises.readlink(path.join(dir, '..data'))); } catch { bits.push('data=-'); }
    for (const slot of slots) {
      try { const st = await fs.promises.stat(fileOf(slot.layer, slot.kind)); bits.push(`${st.ino}:${st.size}:${st.mtimeMs}`); } catch (e) { bits.push(e && e.code === 'ENOENT' ? 'absent' : `err:${e && e.code}`); }
    }
    return bits.join('|');
  }
  async function readSlot(slot) {
    const f = fileOf(slot.layer, slot.kind);
    let st = null;
    try { st = await fs.promises.stat(f); } catch (e) { if (!(e && e.code === 'ENOENT')) return { error: { code: 'unreadable', detail: e.code || String(e) } }; }
    if (!st || !st.isFile() || st.size > MAX_BYTES) return judge(slot, st, () => '');
    let text;
    try { text = await fs.promises.readFile(f, 'utf-8'); } catch (e) { return e && e.code === 'ENOENT' ? { list: null, mtimeMs: null } : { error: { code: 'unreadable', detail: e.code || String(e) } }; }
    return judge(slot, st, () => text);
  }
  /** ONE re-read when the directory's signature moved; returns the change or null.
   *  THE READ IS KEYED ON THE TREE IT READ (verify r1 ①): the kubelet may swap
   *  `..data` BETWEEN two slot reads, and a snapshot holding one file from the
   *  old tree and another from the new is a configuration that never existed
   *  (reproduced: it was published to every listener with a "changed" line,
   *  then corrected by the next event — two notices for one edit). So the
   *  signature is taken AGAIN after the reads: moved ⇒ the tree we now see is
   *  read instead, up to RE_READS times; a tree still moving after that is
   *  left to the next event / poll — nothing torn is ever published. */
  async function reloadOnce() {
    let sig = await signatureNow();
    if (sig === signature) return null;
    let outs = null;
    for (let i = 0; i < RE_READS; i++) {
      const read = await Promise.all(slots.map(readSlot));
      if (stopped) return null;
      const after = await signatureNow();
      if (after === sig) { outs = read; break; }
      sig = after;                                   // the tree moved under the read: read the one we see now
    }
    if (!outs) { signature = null; return null; }    // still moving: the next event / poll reads again
    signature = sig;
    slots.forEach((s, i) => apply(s, outs[i], { boot: false }));
    sayStrays();
    const next = remerge();
    loadedAt = now();
    const errKey = slots.map((s) => (s.error ? `${s.layer}:${s.kind}:${s.error.code}` : '')).join('|');
    const errorsMoved = errKey !== lastErrKey; lastErrKey = errKey;
    const diffs = Object.fromEntries(P.KINDS.map((k) => [k, P.diffEntries(k, merged[k] && merged[k].entries, next[k] && next[k].entries)]));
    const rungMoved = P.KINDS.filter((k) => !!merged[k] !== !!next[k]);
    const kinds = P.KINDS.filter((k) => !P.diffEmpty(diffs[k]) || rungMoved.includes(k));
    if (!kinds.length && !errorsMoved) return null;
    const prev = merged; merged = next;
    if (kinds.length) {
      const words = P.KINDS.map((k) => P.diffWords(k, diffs[k])).filter(Boolean);
      const moved = rungMoved.map((k) => `${k === 'gdrive' ? 'Google clients' : 'integrations'} ${next[k] ? 'now from the presets directory' : 'no longer in the presets directory (the environment is the fallback)'}`);
      log.log(`[presets] changed (${dir}): ${[...words, ...moved].join(' · ')}`);
    }
    // `kinds` empty = only a file's readability moved (its presets are kept): the summary still changes
    const change = { kinds, prev, at: loadedAt };
    for (const fn of listeners) { try { fn(change); } catch (e) { log.warn('[presets] listener failed:', e && e.message); } }
    return change;
  }
  /** Single flight: a reload asked for while one runs runs ONCE more after it. */
  function reload() {
    if (!dir || stopped) return Promise.resolve(null);
    if (running) { again = true; return running; }
    running = (async () => {
      let last = null;
      do { again = false; try { last = (await reloadOnce()) || last; } catch (e) { log.warn('[presets] reload failed:', e && e.message); } } while (again && !stopped);
      return last;
    })().finally(() => { running = null; });
    return running;
  }
  function schedule() {
    if (stopped) return;
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(() => { debounce = null; reload(); }, debounceMs);
    if (debounce.unref) debounce.unref();
  }
  /** Start watching (the server's instance only). Idempotent. */
  async function start() {
    if (!dir || watcher || poll || stopped) return;
    signature = await signatureNow();     // the boot read's state is the baseline
    try {
      watcher = fs.watch(dir, { persistent: false }, schedule);
      watcher.on('error', (e) => { log.warn(`[presets] watch on ${dir} failed (${e && e.code}) — the ${Math.round(pollMs / 1000)} s poll carries on`); try { watcher.close(); } catch {} });
    } catch (e) { log.warn(`[presets] cannot watch ${dir} (${e && e.code}) — polling every ${Math.round(pollMs / 1000)} s`); }
    poll = setInterval(() => { reload(); }, pollMs);
    if (poll.unref) poll.unref();
  }
  function stop() {
    stopped = true;
    if (watcher) { try { watcher.close(); } catch {} watcher = null; }
    if (poll) { clearInterval(poll); poll = null; }
    if (debounce) { clearTimeout(debounce); debounce = null; }
  }

  // ── reads (sync, from the snapshot) ──────────────────────────────────────
  /** The merged entries of a kind (copies), or `null` = the presets directory
   *  says nothing about it (the caller falls back to the environment). */
  function entries(kind) {
    const m = merged[kind];
    return m ? m.entries.map((e) => (kind === 'integrations' ? { ...e, values: { ...e.values } } : { ...e })) : null;
  }
  /** Value-free facts for the summary: per kind the counted items by layer,
   *  the newest file's mtime (when the admin's edit landed here) and the errors. */
  function status() {
    const items = [];
    for (const k of P.KINDS) items.push(...P.countItems(k, merged[k]));
    const times = slots.map((s) => s.mtimeMs).filter((x) => Number.isFinite(x));
    return { dir, items, updatedAt: times.length ? Math.round(Math.max(...times)) : null, loadedAt, errors: slots.filter((s) => s.error).map((s) => s.error), present: Object.fromEntries(P.KINDS.map((k) => [k, !!merged[k]])) };
  }
  const onChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

  bootRead();
  return { dir, entries, status, onChange, start, stop, reload, FILES };
}

// ── the process-wide instance (MountManager.drivePresets is static) ───────
let shared = null;
/** The instance every reader in this process asks. Made lazily from an
 *  EXPLICIT VIBESPACE_PRESETS_DIR only; the server installs its own. */
function sharedPresets() { if (!shared) shared = create({ dir: resolveDir(process.env, { useDefault: false }) }); return shared; }
/** The server's boot: the default directory counts, the watch starts. */
function installForServer({ env = process.env, log = console } = {}) {
  if (shared) shared.stop();
  shared = create({ dir: resolveDir(env, { useDefault: true }), log });
  shared.start().catch((e) => log.warn('[presets] start failed:', e && e.message));
  return shared;
}
/** Suites: hand the process an instance (or null to reset); returns the previous one. */
function setSharedPresets(inst) { const prev = shared; shared = inst || null; return prev; }

module.exports = { create, resolveDir, sharedPresets, installForServer, setSharedPresets, DEFAULT_DIR, FILES, OVERRIDE_DIR, MAX_BYTES, POLL_MS, RE_READS };
