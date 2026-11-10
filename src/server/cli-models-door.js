'use strict';
// THE CLI'S OWN MODEL LIST, READ ON A PERSON'S ACT (lane agy-models-report, the follow-on of cli-update-needs-nothing; the
// owner 2026-11-10: «Antigravity 支持的模型为什么是写死的呀？不应该从 Antigravity 自己汇报吗？»). A harness whose descriptor
// declares `modelsReport` — a command its CLI answers with the models THAT sign-in may use, without a turn (antigravity:
// `agy models`, parsed by src/harnesses/antigravity-models.js) — is listed HERE, for ONE account: a named account (its own
// HOME root) or the machine's own login (the key «machine»). The menu then offers exactly what the CLI reported for that
// account; the shipped list is only the answer before any report exists, and the menu says so (src/routes/provider-models.js).
//   · THE ACT (ruling E1; round 2 law A — BY CONSTRUCTION; round 3 law 2): the door lists only when handed a PRESS that the
//     ONE person gate minted. The MINT is a capability of its own — createCliModelsDoor returns { door, mint } ONCE; the
//     mint goes to the ONE route registrar (src/routes/provider-models.js), the door is what may be handed around and it
//     cannot mint. `mint(req, {backend, account, kind})` runs personVerdict and returns an object kept in this door's own
//     WeakSet, bound to that (backend, account, kind) and to its age (PRESS_TTL_MS); `ask` takes it once and refuses anything
//     else — a caller's `{person: true}`, a press for another menu or kind, an old one. The two POST doors of provider-models
//     mint: the OPENING of a model menu and the explicit «Refresh from …» row; no GET mints. `modelsReport` is read here alone.
//   · THE FLOORS: a listing that answered ⇒ none again for that account for FLOOR_MS (6 h); one that FAILED (signed out,
//     a timeout, unreadable, not installed, a spawn that failed) ⇒ none for FAIL_FLOOR_MS (15 min); the CLI file changed
//     since (realpath + size + mtime: an update) ⇒ the next opening lists whatever the floor says. The explicit row sets both
//     aside but keeps ONE A MINUTE and at most DAILY_MAX (24) per account per rolling 24 h (round 2 law B) — both PERSISTED
//     in the cache, so a restart keeps them. NEVER a timer, never at boot, never per spawn — `agy models` is a request to the
//     vendor under a subscription sign-in (test-agy-models-door's census + test-vendor-whitelist 5d pin the callers).
//   · THE CALL: the CLI the read-time check answers now (cli-cmd `check`, forced), the account's own spawn env (its HOME
//     root, the bus disabled) over the agents' env (every harness's credential names dropped); stdin a closed pipe, STDERR
//     NOT READ, stdout capped at 64 KiB. The child LEADS ITS OWN PROCESS GROUP (round 2 law C): every end of the listing —
//     an answer, the cap, TIMEOUT_MS (20 s) — ends the GROUP we spawned and hold (never a pid read from text), so a helper
//     the CLI forked is not left running; the listing SETTLES ON EXIT plus DRAIN_MS, so rows the CLI printed before it
//     exited are kept even while a descendant still holds the pipe. The answer is DATA for the descriptor's `parse`.
//   · THE CACHE (ruling E2; round 2 law D): data/cli-models.json — tmp + rename, 0600, local-only — a cache: never in the
//     config export, never synced to another hub, an account's entry deleted with the account (`forget` on the delete
//     route; any write drops an entry whose account is gone), and no value of the sign-in in it (stdout only). It is READ
//     ASYNC, ONCE, at most CACHE_MAX bytes (a stat first); an oversize or unreadable file is said ONCE and not read. There
//     is no synchronous fs call in this file. A listing that fails KEEPS the last good rows and records `lastError`.
//   · THE COMPLETION: `onListed({ backend, account })` — the caller broadcasts `available-models-dirty` so an open menu
//     re-reads ONCE; that re-read is a GET, which can never list.
// Spawns nothing at require time; no backend-id branch — the descriptor declares the command, its cwd and its parser.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const PI = require('../proc-identity.js'); // THE pid identity (field 22 start times, a fresh bounded /proc scan): the after-exit proof

const FLOOR_MS = 6 * 3600 * 1000;
const FAIL_FLOOR_MS = 15 * 60 * 1000;
const PACE_MS = 60 * 1000;
const DAY_MS = 24 * 3600 * 1000;
const DAILY_MAX = 24;                 // explicit asks per account per rolling 24 h: a person never needs more (round 2 law B)
const TIMEOUT_MS = 20000;
const DRAIN_MS = 150;                 // after the CLI exits: what its pipe still holds, then the listing settles
const STDOUT_CAP = 65536;
const CACHE_MAX = 2 * 1024 * 1024;    // the cache is read only below this size
const PRESS_TTL_MS = 5000;            // a press is spent in the request that minted it (round 3 law 2)
const MACHINE = 'machine';
const FILE = 'cli-models.json';
const SCHEMA = 1;
const KEY_RE = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/;
const ROW_ID_RE = /^[a-z0-9][a-z0-9._:-]{0,99}$/;
const ERROR_CODES = new Set(['signed-out', 'timeout', 'unreadable', 'not-installed', 'spawn-failed']);
const WORDS_MAX = 200;
const ROWS_MAX = 200;
const own = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);
const words = (s) => { const one = String(s || '').replace(/[\u0000-\u001f\u007f-\u009f]+/g, ' ').trim(); return one.length > WORDS_MAX ? one.slice(0, WORDS_MAX - 1) + '…' : one; };

/** Run `cmd argv` once; resolves { code, stdout, error, timedOut, over }. stdin a closed pipe, stderr never read. The child
 *  leads its own process group; the listing settles on exit (+ DRAIN_MS), at the cap, or at the timeout. Past STDOUT_CAP the
 *  cut last line is dropped.
 *  THE KILL LAW (round 3 law 1 — signal only what you spawned and still hold): BEFORE the leader's exit is seen, the group is
 *  ours — the timeout and the cap end it. AFTER the exit (Node has reaped the leader; its number is free), the group is
 *  signalled ONLY on proof that a member of OURS is alive: never while a live process holds that number (reused — not ours),
 *  and then the pipe still held past the exit, or a member of the group started at or after our child (proc-identity: the
 *  pgrp + the field-22 start time, a fresh bounded /proc scan). No proof: NOTHING is sent — a plain listing that exits and
 *  closes signals nobody. */
function runOnce(spawnImpl, cmd, argv, { env, cwd, timeoutMs, drainMs = DRAIN_MS, proc = PI }) {
  return new Promise((resolve) => {
    let child;
    try { child = spawnImpl(cmd, argv, { env, cwd, stdio: ['pipe', 'pipe', 'ignore'], detached: true }); } catch (e) { resolve({ code: null, stdout: '', error: e, timedOut: false, over: false }); return; }
    let stdout = '', error = null, timedOut = false, over = false, done = false, drain = null, exitCode, exited = false;
    const held = child.pid;                                                         // the group we spawned (detached ⇒ pgid = pid)
    let since = null;
    try { since = held ? proc.starttimeOf(held) : null; } catch { since = null; }   // our child's own start (field 22), read while it is ours
    // before the exit is seen: the group is ours — every member goes (a helper the CLI forked with it)
    const endGroup = () => { try { process.kill(-child.pid, 'SIGKILL'); } catch { } };
    // after the exit: only on proof that a member of OURS is alive — never the number alone
    const afterExit = (pipeHeld) => {
      let st = null;
      try { st = proc.stateOf(held); } catch { st = null; }
      if (st && st !== 'Z') return;                                                 // the number names a live process now: not ours
      let members = [];
      try { members = since != null ? proc.membersOf({ pgid: held, since }) : []; } catch { members = []; }
      const proof = { ok: pipeHeld || members.length > 0 };
      if (proof.ok) { try { process.kill(-held, 'SIGKILL'); } catch { } }
    };
    const finish = (code, why) => {
      if (done) return;
      done = true; clearTimeout(timer); clearTimeout(drain);
      if (held) { if (!exited) endGroup(); else afterExit(why === 'drain'); }
      try { child.stdout.destroy(); } catch { }
      resolve({ code, stdout: over ? stdout.slice(0, stdout.lastIndexOf('\n') + 1) : stdout, error, timedOut, over });
    };
    const timer = setTimeout(() => { timedOut = true; finish(null, 'timeout'); }, timeoutMs);
    try { child.stdin.on('error', () => { }); child.stdin.end(); } catch { } // a child gone at once: its closed pipe is no crash
    try { child.stdout.setEncoding('utf8'); child.stdout.on('error', () => { }); } catch { }
    child.stdout.on('data', (d) => {
      if (over || done) return;
      stdout += String(d).slice(0, STDOUT_CAP - stdout.length);
      if (stdout.length >= STDOUT_CAP) { over = true; finish(0, 'cap'); }
    });
    child.on('error', (e) => { error = e; if (!child.pid) finish(null, 'error'); });
    // settled on EXIT plus a short drain: a descendant that keeps the pipe never turns an answer into a timeout
    child.on('exit', (code, sig) => { exited = true; exitCode = sig ? `signal ${sig}` : code; if (!done) drain = setTimeout(() => finish(exitCode, 'drain'), drainMs); });
    child.on('close', (code, sig) => { exited = true; finish(exitCode !== undefined ? exitCode : (sig ? `signal ${sig}` : code), 'close'); });
  });
}

/** The CLI file's identity — realpath + size + mtime: an update replaces it. null when unreadable. (A stable launcher or a
 *  bare name hides an update until the floor ends — a stated limit; the «Refresh from …» row is the door.) */
async function identityOf(fsx, file) {
  if (!file) return null;
  try {
    const real = await fsx.promises.realpath(file);
    const st = await fsx.promises.stat(real);
    return { path: real, size: st.size, mtimeMs: Math.round(st.mtimeMs) };
  } catch { return null; }
}
const sameId = (a, b) => !!a && !!b && a.path === b.path && a.size === b.size && a.mtimeMs === b.mtimeMs;

const isId = (c) => !!c && typeof c === 'object' && typeof c.path === 'string' && c.path.length < 4096 && Number.isFinite(c.size) && Number.isFinite(c.mtimeMs);
/** One entry as the file may hold it — anything else is dropped at load (a hand edit, another build's shape). */
function cleanEntry(e) {
  if (!e || typeof e !== 'object') return null;
  const rows = Array.isArray(e.rows) ? e.rows.filter((r) => r && typeof r === 'object' && typeof r.id === 'string' && ROW_ID_RE.test(r.id) && typeof r.label === 'string' && r.label.length <= 60).slice(0, ROWS_MAX).map((r) => ({ id: r.id, label: r.label })) : [];
  const listedAt = Number.isFinite(e.listedAt) ? e.listedAt : null;
  const le = e.lastError;
  const lastError = le && typeof le === 'object' && ERROR_CODES.has(le.code) && Number.isFinite(le.at)
    ? { code: le.code, at: le.at, words: words(le.words), cli: isId(le.cli) ? { path: le.cli.path, size: le.cli.size, mtimeMs: le.cli.mtimeMs } : null } : null;
  const asks = Array.isArray(e.asks) ? e.asks.filter(Number.isFinite).sort((a, b) => a - b).slice(-2 * DAILY_MAX) : [];
  if (!(rows.length && listedAt) && !lastError && !asks.length) return null;
  return { rows: rows.length && listedAt ? rows : [], listedAt: rows.length ? listedAt : null, cli: isId(e.cli) ? { path: e.cli.path, size: e.cli.size, mtimeMs: e.cli.mtimeMs } : null, lastError, asks };
}

/** @param {object} o
 *  @param {object} o.accounts            the accounts store (get, resolveForSpawn)
 *  @param {(id:string)=>object} o.harnessOf  the harness registry's get
 *  @param {object} o.cliCmds             the CLI registry (check, current)
 *  @param {string|null} o.dataDir        data/ — null: nothing persisted (a drill)
 *  @param {()=>object} [o.agentEnv]      the agents' env
 *  @param {(req:object)=>{ok:boolean,code?:string}} [o.verdict]  THE person gate (routes/vault.js personVerdict)
 *  @param {(e:{backend:string,account:string})=>void} [o.onListed]  a listing finished (answered or failed)
 *  @param {Function} [o.spawnImpl] @param {()=>number} [o.now] @param {(l:string)=>void} [o.log] @param {object} [o.fsx] */
function createCliModelsDoor({ accounts, harnessOf, cliCmds, dataDir = null, agentEnv = () => ({ ...process.env }), onListed = () => { },
  verdict = (req) => require('../routes/vault.js').personVerdict(req),
  spawnImpl = spawn, now = Date.now, log = (l) => console.log(l), fsx = fs, homeDir = os.homedir,
  floorMs = FLOOR_MS, failFloorMs = FAIL_FLOOR_MS, paceMs = PACE_MS, dailyMax = DAILY_MAX, timeoutMs = TIMEOUT_MS, drainMs = DRAIN_MS, cacheMax = CACHE_MAX,
  pressTtlMs = PRESS_TTL_MS, proc = PI } = {}) {
  const file = dataDir ? path.join(dataDir, FILE) : null;
  let state = null;                 // { schema, harnesses: { <backend>: { <account id | machine>: entry } } } — once read
  let loading = null;               // the one async read
  const inflight = new Map();       // `${backend}\n${key}` → the listing in flight (every act shares it)
  const presses = new WeakSet();    // the presses the ONE person gate minted — a flag a caller writes is not one
  const said = new Set();           // what was said once
  let writing = Promise.resolve();  // writes in order
  let tmpSeq = 0;
  const sayOnce = (k, line) => { if (said.has(k)) return; said.add(k); log(line); };
  const slot = (be, key) => `${be}\n${key}`;
  const descOf = (be) => { let h = null; try { h = harnessOf(be); } catch { } const d = h && h.modelsReport; return d && Array.isArray(d.argv) && typeof d.parse === 'function' ? { h, d } : null; };
  const accountOk = (be, key) => {
    if (key === MACHINE) return true;
    if (typeof key !== 'string' || !KEY_RE.test(key)) return false;
    let a = null; try { a = accounts.get(key); } catch { }
    return !!a && (a.backend || 'claude') === be && a.type !== 'pooled';
  };
  const fresh = () => ({ schema: SCHEMA, harnesses: Object.create(null) });
  function load() {
    if (state) return Promise.resolve(state);
    if (!loading) loading = (async () => {
      const st = fresh();
      if (file) {
        let size = -1;
        try { size = (await fsx.promises.stat(file)).size; } catch { size = -1; } // none yet: nothing to read
        if (size > cacheMax) sayOnce('big', `[cli-models] data/${FILE} is ${size} bytes — over the ${cacheMax}-byte bound, not read (the next listing writes it anew)`);
        else if (size >= 0) {
          let raw;
          try { raw = JSON.parse(await fsx.promises.readFile(file, 'utf8')); } catch { raw = undefined; }
          if (!raw || typeof raw !== 'object' || raw.schema !== SCHEMA || !raw.harnesses || typeof raw.harnesses !== 'object') sayOnce('corrupt', `[cli-models] data/${FILE} is not this door's JSON — not read (the next listing writes it anew)`);
          else {
            for (const be of Object.keys(raw.harnesses)) {
              if (!KEY_RE.test(be) || !raw.harnesses[be] || typeof raw.harnesses[be] !== 'object') continue;
              for (const key of Object.keys(raw.harnesses[be])) {
                if (key !== MACHINE && !KEY_RE.test(key)) continue;
                const e = cleanEntry(raw.harnesses[be][key]);
                if (e) (st.harnesses[be] || (st.harnesses[be] = Object.create(null)))[key] = e;
              }
            }
          }
        }
      }
      state = st;
      return st;
    })();
    return loading;
  }
  const cur = () => state || fresh(); // before the read lands: nothing known (the GET awaits ready())
  const entryOf = (be, key) => { const h = cur().harnesses[be]; return h && own(h, key) ? h[key] : null; };
  function save() {
    if (!file || !state) return Promise.resolve();
    const st = state;
    // an entry whose account is gone goes with it (ruling E2) — at EVERY write, not only on the delete route
    for (const be of Object.keys(st.harnesses)) {
      for (const key of Object.keys(st.harnesses[be])) if (!accountOk(be, key)) delete st.harnesses[be][key];
      if (!Object.keys(st.harnesses[be]).length) delete st.harnesses[be];
    }
    const body = JSON.stringify({ schema: SCHEMA, harnesses: st.harnesses }, null, 1) + '\n';
    writing = writing.then(async () => {
      const tmp = `${file}.${process.pid}.${++tmpSeq}.tmp`;
      try {
        await fsx.promises.writeFile(tmp, body, { mode: 0o600 });
        await fsx.promises.rename(tmp, file);
      } catch (e) { try { await fsx.promises.unlink(tmp); } catch { } log(`[cli-models] the cache was not written: ${e.code || e.message}`); }
    });
    return writing;
  }
  function put(be, key, e) {
    if (!accountOk(be, key) || !state) return Promise.resolve(); // removed while it listed: nothing kept
    (state.harnesses[be] || (state.harnesses[be] = Object.create(null)))[key] = e;
    return save();
  }
  const blank = () => ({ rows: [], listedAt: null, cli: null, lastError: null, asks: [] });

  async function listOnce(be, key, h, d) {
    const label = h.label || be;
    const prev = entryOf(be, key) || blank();
    const keep = () => ({ rows: prev.rows, listedAt: prev.listedAt, cli: prev.cli, asks: (entryOf(be, key) || prev).asks || [] });
    const fail = (code, why, cli = null) => {
      log(`[cli-models] ${be} ${key}: ${code}`);
      return put(be, key, { ...keep(), lastError: { code, at: now(), words: words(why), cli } });
    };
    const cmd = await cliCmds.check(be, { force: true });
    if (!cmd) return fail('not-installed', `${label} is not installed on this machine`);
    let env = { ...agentEnv() };
    let cwd = homeDir();
    if (key !== MACHINE) {
      let se = null;
      try { se = accounts.resolveForSpawn(key, be); } catch (e) { return fail('signed-out', e.message); }
      if (!se || !se.localEnv) return fail('signed-out', 'this account has no sign-in of its own yet');
      env = { ...env, ...se.localEnv };
      cwd = typeof d.cwdOf === 'function' ? d.cwdOf(se.localEnv) : se.localEnv.HOME;
    }
    for (const k of (h.creds && h.creds.keyEnvVars) || []) delete env[k]; // an ambient key would answer for ANOTHER login
    const cli = await identityOf(fsx, cmd);
    const r = await runOnce(spawnImpl, cmd, d.argv, { env, cwd, timeoutMs, drainMs, proc });
    if (r.timedOut && !r.over) return fail('timeout', `${label} did not answer in ${Math.round(timeoutMs / 1000)} s`, cli);
    if (r.error && !r.over) return fail('spawn-failed', `could not run ${path.basename(cmd)}: ${r.error.code || r.error.message}`, cli);
    let j = null;
    try { j = d.parse({ code: r.over ? 0 : r.code, stdout: r.stdout }); } catch (e) { j = { verdict: 'unreadable', why: e.message }; }
    // past the cap with no whole row: garbage, never «signed out» (no sign-in door for an answer that is not one)
    if (r.over && (!j || j.verdict !== 'rows' || !Array.isArray(j.rows) || !j.rows.length)) return fail('unreadable', `the answer was larger than ${STDOUT_CAP / 1024} KiB and named no model`, cli);
    if (!j || j.verdict !== 'rows' || !Array.isArray(j.rows) || !j.rows.length) return fail(j && j.verdict === 'signed-out' ? 'signed-out' : 'unreadable', (j && j.why) || 'unreadable', cli);
    const rows = j.rows.filter((x) => x && ROW_ID_RE.test(x.id)).slice(0, ROWS_MAX).map((x) => ({ id: x.id, label: String(x.label || x.id).slice(0, 60) }));
    log(`[cli-models] ${be} ${key}: ${rows.length} rows`); // the account and the count — never a row, never the sign-in
    return put(be, key, { rows, listedAt: now(), cli, lastError: null, asks: keep().asks });
  }
  function start(be, key, h, d) {
    const k = slot(be, key);
    const p = listOnce(be, key, h, d)
      .catch((e) => { log(`[cli-models] ${be} ${key}: the listing threw (${e && e.message})`); })
      .finally(() => { inflight.delete(k); try { onListed({ backend: be, account: key }); } catch { } });
    inflight.set(k, p);
    return p;
  }

  /** THE MINT (round 3 law 2) — a capability of its OWN, returned once by this maker beside the door and handed to the ONE
   *  route registrar (src/routes/provider-models.js): the door that is handed around has no way to mint. It runs THE person
   *  gate (personVerdict) and binds the press to what it is minted for — (backend, account, kind) — and to its age
   *  (PRESS_TTL_MS: it is spent in the request that minted it). `scope` null: the gate's answer alone, no press.
   *  → { ok: true, press } | { ok: false, status: 403, code }. */
  function mint(req, scope = null) {
    let v = null;
    try { v = verdict(req); } catch { v = null; }
    if (!v || !v.ok) return { ok: false, status: 403, code: (v && v.code) || 'human_only' };
    if (!scope) return { ok: true, press: null };
    const p = Object.freeze({ backend: String(scope.backend || ''), key: String(scope.account || MACHINE), kind: scope.kind === 'refresh' ? 'refresh' : 'open', at: now() });
    presses.add(p);
    return { ok: true, press: p };
  }

  const door = {
    FLOOR_MS: floorMs, FAIL_FLOOR_MS: failFloorMs, PACE_MS: paceMs, DAILY_MAX: dailyMax, MACHINE,
    /** The cache read (async, once) — the menu's GET awaits it before it answers. */
    ready() { return load().then(() => true); },
    /** Does this harness report its own models? (the descriptor's `modelsReport`) */
    declares(be) { return !!descOf(be); },
    /** What the menu shows for (backend, account) — NEVER lists. null ⇒ the harness reports nothing (the shipped list).
     *  `by` = who reports, in the menu's words (the descriptor's `modelsReport.by`). */
    report(be, key) {
      const hd = descOf(be);
      if (!hd) return null;
      const by = String(hd.d.by || hd.h.label || be);
      const k = key || MACHINE;
      if (!accountOk(be, k)) return { rows: null, listedAt: null, lastError: null, listing: false, by };
      const e = entryOf(be, k);
      return { rows: e && e.rows.length ? e.rows : null, listedAt: e ? e.listedAt : null, lastError: e && e.lastError ? { code: e.lastError.code, at: e.lastError.at, words: e.lastError.words } : null, listing: inflight.has(slot(be, k)), by };
    },
    /** A person's act — `press` minted by the mint for THIS (backend, account, kind), used once, within PRESS_TTL_MS:
     *  'refresh' = the explicit row, else the OPENING of a model menu. Answers once the DECISION is made (a local stat, never
     *  the vendor): { ok, listing, code } — the listing itself finishes later (onListed). No such press: 403, nothing runs. */
    async ask(be, key, { press, kind } = {}) {
      if (!press || typeof press !== 'object' || !presses.has(press)) return { ok: false, status: 403, code: 'no-press', error: 'a person’s press only' };
      presses.delete(press); // one press, one ask
      const k = key || MACHINE;
      const want = kind === 'refresh' ? 'refresh' : 'open';
      if (press.backend !== be || press.key !== k || press.kind !== want) return { ok: false, status: 403, code: 'press-not-for-this', error: 'a press for another menu' };
      if (now() - press.at > pressTtlMs) return { ok: false, status: 403, code: 'press-expired', error: 'a press from an earlier request' };
      const explicit = want === 'refresh';
      const hd = descOf(be);
      if (!hd) return { ok: false, status: 400, code: 'no-report', error: `${be} does not report its models` };
      if (!accountOk(be, k)) return { ok: false, status: 404, code: 'unknown-account', error: 'unknown account' };
      await load();
      const s = slot(be, k);
      if (inflight.has(s)) return { ok: true, status: 200, listing: true, code: 'shared' };
      const t = now();
      const e = entryOf(be, k);
      if (explicit) {
        const asks = ((e && e.asks) || []).filter((x) => t - x < DAY_MS);
        const last = asks.length ? asks[asks.length - 1] : -Infinity;
        if (t - last < paceMs) return { ok: false, status: 429, code: 'throttled', retryInMs: paceMs - (t - last), error: 'asked less than a minute ago' };
        if (asks.length >= dailyMax) return { ok: false, status: 429, code: 'daily-bound', retryInMs: asks[0] + DAY_MS - t, freesAt: asks[0] + DAY_MS, asked: asks.length, error: `asked ${asks.length} times in 24 hours` };
        if (inflight.has(s)) return { ok: true, status: 200, listing: true, code: 'shared' };
        await put(be, k, { ...(e || blank()), asks: [...asks, t] }); // the pace and the bound survive a restart
      } else {
        let curId = null;
        try { curId = await identityOf(fsx, cliCmds.current ? cliCmds.current(be) : null); } catch { }
        if (inflight.has(s)) return { ok: true, status: 200, listing: true, code: 'shared' };
        const le = e && e.lastError;
        const moved = (was) => !!(curId && was && !sameId(curId, was)); // the CLI file changed since (an update): the floor does not hold
        if (le && t - le.at < failFloorMs && !moved(le.cli)) return { ok: true, status: 200, listing: false, code: 'failed-recently', nextAt: le.at + failFloorMs };
        if (e && e.listedAt && t - e.listedAt < floorMs && !moved(e.cli)) return { ok: true, status: 200, listing: false, code: 'floor', nextAt: e.listedAt + floorMs };
      }
      if (inflight.has(s)) return { ok: true, status: 200, listing: true, code: 'shared' };
      start(be, k, hd.h, hd.d);
      return { ok: true, status: 202, listing: true, code: 'started' };
    },
    /** The listing in flight for (backend, account), or null — a drill awaits it. */
    pending(be, key) { return inflight.get(slot(be, key || MACHINE)) || null; },
    /** An account removed: its entry goes NOW (ruling E2). */
    async forget(key) {
      const st = await load();
      let hit = false;
      for (const be of Object.keys(st.harnesses)) if (own(st.harnesses[be], key)) { delete st.harnesses[be][key]; hit = true; }
      return hit ? save() : undefined;
    },
    _flush() { return writing; },
  };
  return { door, mint };
}

module.exports = { createCliModelsDoor, cleanEntry, FLOOR_MS, FAIL_FLOOR_MS, PACE_MS, DAY_MS, DAILY_MAX, TIMEOUT_MS, DRAIN_MS, STDOUT_CAP, CACHE_MAX, PRESS_TTL_MS, MACHINE, FILE };
