'use strict';
/**
 * THE DOOR OF A BACKGROUND JOB'S VAULT VALUES — ORCH (lane vault-job-road, design-vault-service-secret L1a). Every RULE is PURE
 * src/vault-job.js (the grammar, the families, the verdict, the fd plan, the frame); this file is the I/O around it, asked by
 * src/jobs.js at EVERY spawn of a job that declared `--vault` (a first start, a crash restart, a manual start, a boot replay,
 * each cron fire):
 *
 *   · `gate(job)` — the verdict over the vault's live facts: its state, the entry (does the vault hold it, did the HUB mint it —
 *     the engine's `secretNames`, names and provenance only) and the entry's `vault-job` rows (the grants store; written by
 *     `answer` below). Locked ⇒ `{wait:'vault'}`; no approval ⇒ `{wait:'approval'}`.
 *   · `payload(v)` — the values read NOW (unlocked: `secretGet`, each a Buffer, the caller's copy) into ONE frame; every value
 *     buffer is zeroed once framed, and the frame is the spawner's to zero once the wrapper has it. A value under the scrubber's
 *     floor (MIN_MASK_BYTES) is refused: the wrapper could not mask it in the job's log.
 *   · `noteUses(job, v, actor, outcome)` — ONE `vault-use` line per value per start (door `service`, by `job`, the owner
 *     conversation, ONE receipt per start) through the engine's ONE writer (`noteUse`), written once the hand-over ENDED
 *     (round 2): `ok` (used) when the wrapper acknowledged the frame (VJ.ACK — it holds the values; whether the program reads
 *     them is the program's), else `refused:<the wrapper's code>` (VJ.refusedOutcome — not used, no «last used», never counted
 *     as the actor's failure: src/vault-use.js counts).
 *   · `blocked(actor)` — the lock's ONE helper (`vault.blocked`): the lock's one For-you item names the job (never a new item).
 *   · `onChange(fn)` — fn(why) after an unlock (`vault-unlocked`) and after a `vault-job` row changed (`vault-approved`): the
 *     engine re-judges every waiting job (src/jobs.js vaultChanged).
 *   · THE APPROVAL CARD (lane vault-job-approval, design-vault-service-secret L1b — the owner's decisions ① ②): `ask(job, v)` —
 *     the engine's wait for `approval` files ONE For-you item per job × entry (action `vault-job-ask`, NO expiry: a job is
 *     asynchronous; the facts of PURE `askCardOf` — the program's real path and whether an agent can change it, the folder, the
 *     command, the entry's Vault name and reference, the destination unknown; never a value); an open card is never filed
 *     again; ≤ 4 open per conversation and 64 on the hub, a Deny quiets that conversation × entry 10 minutes — each a refusal
 *     by name the engine says (never a silent wait). The item IS the ask: `index` re-reads the open ones from the store, so a
 *     card filed before a restart is answered after it. `answer(askId, …)` — a PERSON only (src/routes/vault.js `person`, a
 *     bearer is refused human_only): 允许 needs this page's 验证是你 (`reauthed`) and adds the job to the owner conversation's
 *     member of the entry's `vault-job` row through the grants store's ONE writer (the row's change starts the job: onChange);
 *     拒绝 is a click — the job is refused `vault_denied` (the engine's vaultRefused — whatever its wait reads now: a locked
 *     boot turns an approval wait into a vault wait, the Deny still refuses it). `askOver(jobId)` — the job removed, stopped,
 *     refused, settled or started by another road — closes its cards `ask-over` (a card being answered is never closed under
 *     its own answer). A card closed by any other door would refuse its job `ask_closed` (none exists today: a decision row
 *     refuses every close that is not one of its ends — the listener is the belt). ONE `vault-job` audit line per ask /
 *     allow / deny / over — ids and references only.
 *   · TAKEN BACK = STOPPED (decision ④; a LOCK stops nothing — decision ③: this file has no lock road): `revoke(entry, job)` (a
 *     person's ✕ — the route's person()) takes the job out of the entry's row through the ONE writer and STOPS it (the engine's
 *     vaultRevoked: desiredUp false, its owner told once); `dropRow` + `entryGone` — an entry deleted (the paste door's
 *     dropEntry, and an agent's own entry's dropAgentEntry): its row goes first (a write that fails refuses the delete), then every job naming it stops (a waiting one is
 *     refused entry_unknown); `jobGone(job)` — a job removed or its content cleared: its id leaves every row.
 * Nothing here returns a value to a caller but the frame to the spawner; nothing is logged but codes and ids.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const VJ = require('../vault-job.js');
const VR = require('../vault-run.js');
const VI = require('../vault-inventory.js');
const SS = require('../secret-shapes.js');   // the card's command, folder and paths are the agent's: a secret SHAPE an agent pasted there by accident is masked (the card is an accident road)

// THE PROGRAM, said on the card (design D1: its real path, and whether an agent can change it). «Cannot» is OWNERSHIP, never
// mode bits (the run door's rule, its round 12): root owns every component of the real path, none group/other-writable. Read
// once per card filed (never per spawn); a path that does not resolve — or one on a storage mount the liveness sweep blocked
// (src/mount-door.js: never stat'ed, B-afc4) — is said as typed and counted writable.
// OFF THE LOOP, BOUNDED (主开发 r850 item 2 — the three readers of round w6tezed7d: the paths are an agent's, a job's folder is
// usually on the workspace mount, and the blocked mark does not cover a mount that is slow or newly hung): every stat / realpath
// goes through fs.promises (the threadpool) and races the card's ONE deadline (FACTS_MS); a fact not read by then is said
// «could not be read» and counted as one an agent can change (fail closed). A read past its deadline still holds its thread: while
// one is (`state.stuck`), a new card's facts are not read at all — each is «could not be read» at once (one hung mount holds no
// more threads than the reads it already took).
const DOOR = require('../mount-door.js');
const FACTS_MS = 2000;
const LATE = Symbol('late');
async function programFacts(cmd = {}, { fsp = fs.promises, ms = FACTS_MS, state = { stuck: 0 } } = {}) {
  const deadline = Date.now() + ms;
  const call = async (fn, p) => {
    if (DOOR.blocked(p)) return {};   // a mount the sweep found dead: never touched
    const left = deadline - Date.now();
    if (left <= 0 || state.stuck > 0) throw LATE;
    const raw = Promise.resolve().then(() => fn(p));
    let t = null;
    const r = await Promise.race([raw.then((v) => ({ v }), () => ({})), new Promise((res) => { t = setTimeout(() => res(LATE), left); if (t.unref) t.unref(); })]);
    clearTimeout(t);
    if (r === LATE) { state.stuck++; raw.then(() => { state.stuck--; }, () => { state.stuck--; }); throw LATE; }
    return r;
  };
  const rootOwned = async (p) => { const r = await call((x) => fsp.stat(x), p); return !!(r.v && r.v.uid === 0 && (r.v.mode & 0o022) === 0); };
  const chainRootOwned = async (p) => { const parts = String(p).split('/'); let cur = ''; for (let i = 1; i < parts.length; i++) { cur += '/' + parts[i]; if (!(await rootOwned(cur))) return false; } return true; };
  const realOf = async (p) => (await call((x) => fsp.realpath(x), p)).v || null;
  const isFile = async (p) => { const r = await call((x) => fsp.stat(x), p); return !!(r.v && r.v.isFile()); };
  const late = (e) => { if (e !== LATE) throw e; return true; };
  const argv = Array.isArray(cmd.argv) ? cmd.argv.map(String) : [];
  const cwd = typeof cmd.cwd === 'string' && cmd.cwd ? cmd.cwd : '/';
  const PATH = cmd.env && typeof cmd.env.PATH === 'string' ? cmd.env.PATH : String(process.env.PATH || '');
  const find = async (n) => {
    if (!n) return null;
    if (n.includes('/')) return realOf(path.resolve(cwd, n));
    for (const d of PATH.split(':').filter(Boolean)) { const r = await realOf(path.join(path.resolve(cwd, d), n)); if (r && await isFile(r)) return r; }
    return null;
  };
  // a WRAPPER runs the program (`timeout 3600 python3 bot.py`, `nohup`, `nice -n 5`, `env A=1 …` — the second adversarial read):
  // the program on the card is the one it runs; the wrapper's own options, durations and NAME=value words are skipped
  const WRAPS = new Set(['timeout', 'nohup', 'nice', 'env', 'setsid', 'stdbuf', 'ionice', 'chrt', 'taskset', 'time', 'unbuffer']);
  const whole = argv.slice();   // the command as it runs — the card shows it whole
  let at = 0;
  for (let guard = 0; guard < 4 && at < argv.length && WRAPS.has(VR.toolNameOf(argv[at] || '')); guard++) {
    at++;
    while (at < argv.length && (/^-/.test(argv[at]) || /^[A-Za-z_][A-Za-z0-9_]*=/.test(argv[at]) || /^\d+(\.\d+)?[smhd]?$/.test(argv[at]))) at++;
  }
  if (at > 0 && at < argv.length) argv.splice(0, at);
  let real = null, unread = false, writable = true;
  try { real = await find(argv[0]); if (real) writable = !(await chainRootOwned(real)); } catch (e) { unread = late(e); writable = true; }
  const tool = VR.toolNameOf(argv[0] || '', real).replace(/[\d.]+$/, '');
  let script = null;
  if (VR.INTERPRETERS.includes(tool) || VR.SHELLS.includes(tool)) {
    // the script an interpreter runs: the first positional that is a FILE — an option's value skipped (`-X utf8`, `--require ./x.js`),
    // nothing after a code / module flag (`-c`, `-e`, `-m`: no script file runs)
    const VALUE = new Set(['-X', '-W', '-r', '--require', '--import', '--loader', '--experimental-loader', '-I', '-M', '-o', '--env-file']);
    const CODE = new Set(['-c', '-e', '--eval', '-p', '--print', '-m']);
    for (let i = 1; i < argv.length; i++) {
      const a = argv[i];
      if (CODE.has(a)) break;
      if (VALUE.has(a)) { i++; continue; }
      if (!a || a.startsWith('-')) continue;
      const cand = path.resolve(cwd, a);
      let r = null;
      try { r = await realOf(cand); if (r && await isFile(r)) script = { path: r, writable: !(await chainRootOwned(r)) }; } catch (e) { late(e); script = { path: r || cand, writable: true, unread: true }; }
      break;
    }
  }
  const mask = (s) => SS.redactSecrets(String(s)).text;
  return { program: { path: mask(real || String(argv[0] || '')), writable, ...(unread ? { unread: true } : {}) }, script: script ? { ...script, path: mask(script.path) } : null, folder: mask(cwd), command: mask(whole.map((a) => (a === '' || /[\s'"\\$`]/.test(a) ? JSON.stringify(a) : a)).join(' ')) };
}

/**
 * @param {object} o
 * @param {object} o.vault    src/server/vault-engine.js (state, secretNames, secretGet, noteUse, blocked, onUnlock)
 * @param {() => object} [o.grants]  the grants store (src/server/grants-store.js — rowsFor, onChange), read at call time
 */
function create({ vault, grants = () => null, log = () => { }, userTodos = null, nameOf = () => null, now = () => Date.now(), fsp = fs.promises, factsMs = FACTS_MS } = {}) {
  const stateOf = () => { try { return vault.state(); } catch { return 'locked'; } };
  const store = () => { try { return grants(); } catch { return null; } };
  /** a stored secret of the vault (the secrets store: a free entry, an agent's) → { prov } | null */
  function entryOf(ref) {
    if (!ref || ref.store !== 'secrets' || ref.field !== 'secret') return null;
    let list = [];
    try { list = vault.secretNames() || []; } catch { list = []; }
    const s = list.find((x) => x && x.name === ref.entry);
    return s ? { prov: s.prov || null } : null;
  }
  function rowsFor(id) {
    const g = store();
    try { return g && typeof g.rowsFor === 'function' ? g.rowsFor(VJ.DOOR, id) : []; } catch { return []; }   // an unreadable store approves nothing
  }
  const refusal = (code, key) => ({ ok: false, code, words: VJ.WORDS[code] || code, ...(key ? { key } : {}) });   // key = the --vault NAME
  let narrowing = 0;   // lane vault-job-approval: >0 while THIS door writes a narrowing (no re-judge — see `narrow`)

  function gate(job) { return VJ.verdictOf(job, { state: stateOf(), entryOf, rowsFor }); }

  function payload(v) {
    if (stateOf() !== 'unlocked') return { wait: 'vault' };
    const entries = [];
    const zero = () => { for (const e of entries) e.value.fill(0); };
    try {
      for (const r of v.refs) {
        let got;
        try { got = vault.secretGet(r.entry); } catch { got = null; }
        if (!got || !got.ok) return String((got && got.code) || '').includes('vault_locked') ? { wait: 'vault' } : refusal('entry_unreadable', r.name);
        if (!got.value) return refusal('entry_unknown', r.name);
        entries.push({ name: r.name, value: got.value });
        if (got.value.length < VR.MIN_MASK_BYTES) return refusal('entry_too_short_to_mask', r.name);
      }
      try { return { ok: true, frame: VJ.encodeFrame(entries) }; } catch (e) { return refusal((e && e.code) || 'payload_too_large'); }
    } finally { zero(); }
  }

  function noteUses(job, v, actor, outcome = 'ok') {
    if (typeof vault.noteUse !== 'function') return null;
    const receipt = `vr-${crypto.randomBytes(8).toString('hex')}`;
    const o = VJ.ownerOf(job);
    const handed = outcome === 'ok';
    for (const r of v.refs) {
      try { vault.noteUse(r.entry, { by: 'job', door: VJ.USE_DOOR, conv: o.conv || o.scope || null }, { outcome: handed ? 'ok' : String(outcome), used: handed, purpose: `Background job ${job.id}`, actor, receipt, store: 'secrets' }); }
      catch (e) { log(`[vault-job] the use line of ${job.id} could not be written (${(e && e.code) || 'error'})`); }
    }
    return receipt;
  }

  function blocked(actor) { try { return vault.blocked(actor, 'start'); } catch { return false; } }

  const changeFns = [];   // the engine's re-judge (vaultChanged) — also run once For you has READ after a hold (B-44f3, below)
  function onChange(fn) {
    if (typeof fn === 'function') changeFns.push(fn);
    try { vault.onUnlock(() => fn('vault-unlocked')); } catch { }
    const g = store();
    try { if (g && typeof g.onChange === 'function') g.onChange((c) => { if (c && c.door === VJ.DOOR && !narrowing) fn('vault-approved'); }); } catch { }
  }

  // ── THE APPROVAL CARD (lane vault-job-approval) ───────────────────────────────────────────────────────────────────────────
  const asks = new Map();        // askId → { askId, todoId, jobId, entry (the entry id), ref, name (the --vault NAME), conv (the member key) }
  const answering = new Set();   // askIds whose answer is being written (the row's write starts the job synchronously — its start must not close the card under its own answer)
  const settled = new Set();     // ids answered or over (a second answer ⇒ ask_settled), bounded
  const quiet = new Map();       // `${conv}\n${entry}` → until — a Deny's ten minutes (memory only: a restart forgets it)
  const settling = new Set();    // the item ids THIS door is closing (its own status events are never «closed elsewhere»)
  let jm = null;                 // the engine (bindJobs): a Deny refuses its job; an answer reads the job
  const named = (code, extra = {}) => ({ ok: false, code, words: VJ.WORDS[code] || code, ...extra });
  const audit = (line) => { try { vault.audit('vault-job', line); } catch (e) { log(`[vault-job] the audit line could not be written (${(e && e.code) || 'error'})`); } };
  const recordOf = (it) => {
    const a = it && it.action;
    if (!a || a.type !== VJ.ASK_TYPE || !VJ.ASK_ID_RE.test(String(a.askId || ''))) return null;
    return { askId: String(a.askId), todoId: it.id, jobId: String(a.jobId || ''), entry: String(a.entry || ''), ref: String(a.ref || ''), name: String(a.name || ''), conv: String(a.conv || '') };
  };
  /** the open cards, re-read from the For-you store — the item IS the ask (one filed before a restart is answered after it) */
  function index() {
    if (!userTodos || typeof userTodos.snapshot !== 'function') return;
    if (userTodos.isHeldUnread?.()) return;   // B-44f3: For you held unread — its list is empty because it is unread: never frozen as the index (built from the FILE after the read)
    let open = [];
    try { open = typeof userTodos.openItems === 'function' ? userTodos.openItems() : ((userTodos.snapshot() || {}).open || []); } catch { open = []; }   // the open items only (a snapshot sorts and previews the whole tray)
    const live = new Set();
    for (const it of open) { const q = recordOf(it); if (!q) continue; live.add(q.askId); if (!asks.has(q.askId) && !settled.has(q.askId)) asks.set(q.askId, q); }
    for (const id of [...asks.keys()]) if (!live.has(id)) asks.delete(id);
  }
  const forget = (q) => { asks.delete(q.askId); settled.add(q.askId); while (settled.size > 256) settled.delete(settled.values().next().value); };
  /** close a card by THIS door (`end` = one of its row's ends: allowed | denied | ask-over), the person's mark on a decision */
  function settle(q, end, fact = null) {
    forget(q);
    if (!userTodos || !q.todoId) return;
    settling.add(q.todoId);
    try {
      const it = typeof userTodos.get === 'function' ? userTodos.get(q.todoId) : null;
      if (it && it.status === 'open') { if (fact && typeof userTodos.resolveAnswered === 'function') userTodos.resolveAnswered([q.todoId], end, fact); else userTodos.setStatus(q.todoId, 'done', end); }
    } catch (e) { log(`[vault-job] the card ${q.askId} could not be closed (${(e && e.message) || e})`); } finally { settling.delete(q.todoId); }
  }
  const entryLabelOf = (entry) => {
    let s = null;
    try { s = (vault.secretNames() || []).find((x) => x && x.name === entry) || null; } catch { s = null; }
    let row = null;
    try { row = s ? VI.secretRowOf(s) : null; } catch { row = null; }
    return String((row && row.label) || entry);
  };
  const whoOf = (conv) => { let n = null; try { n = nameOf(conv); } catch { n = null; } return String(n || '').slice(0, 80); };   // '' = unknown: the card says «a conversation» in the viewer's language

  /** A WAIT FOR `approval` (the engine, at a spawn — every re-judge of a waiting job asks here): ONE card per job × entry the
   *  verdict misses (`v.missing`), an open one never filed again. → `{ok:true, filed}` | a refusal by name (the caps, a Deny's
   *  quiet, the tray refused it — the engine refuses the job in these words) */
  let heldAsk = false;   // ONE waiter while For you is held (every re-judge of every waiting job asks here)
  function ask(job, v = {}) {
    if (!userTodos || typeof userTodos.add !== 'function') { log(`[vault-job] no For-you store is wired — the approval card of ${VJ.askJobIdOf(job)} is not filed (the job waits)`); return { ok: true, filed: 0 }; }   // a door built without the tray (a scripted engine): the L1a wait, said in the journal
    // B-44f3 (For you HELD UNREAD — its file could not be read): no card can be filed and the open ones are unread — the job WAITS
    // (never refused for it: a refusal would fail it and end a schedule's next fire); at the read every waiting job is judged
    // again (the engine's re-judge), and the cards are filed then, against the FILE's open ones
    if (userTodos.isHeldUnread?.()) {
      if (!heldAsk && typeof userTodos.whenRead === 'function') { heldAsk = true; userTodos.whenRead(() => { heldAsk = false; for (const fn of changeFns) { try { fn('vault-approved'); } catch (e) { log(`[vault-job] the re-judge at For you's read failed (${(e && e.message) || e})`); } } }, 'the Background jobs\' approval cards'); }
      return { ok: true, filed: 0, held: true };
    }
    index();
    const o = VJ.ownerOf(job), conv = o.conv || o.scope, jobId = VJ.askJobIdOf(job);
    if (!jobId) return named('ask_unfiled');
    if (!conv) return named('no_owner_conversation');   // a person-created job names no conversation an approval could name
    const missing = new Set(Array.isArray(v.missing) ? v.missing : []);
    const need = [];
    for (const r of VJ.refsOf(job)) {
      if (!missing.has(r.name)) continue;
      const ref = VR.parseRef(r.ref);
      if (ref && !need.some((x) => x.id === ref.id)) need.push({ name: r.name, ref: ref.ref, id: ref.id, entry: ref.entry });   // ONE card per job × ENTRY (two NAMEs on one entry: one card)
    }
    const open = [...asks.values()], pending = [...pend.values()];
    // a job × entry whose card is open, or whose facts are being read for its card (`pend`), is never asked twice
    const fresh = need.filter((r) => !open.some((q) => q.jobId === jobId && q.entry === r.id) && !pend.has(`${jobId}\n${r.id}`));
    if (!fresh.length) return { ok: true, filed: 0 };
    if (fresh.some((r) => r.id.length > 200 || r.ref.length > 200)) { log(`[vault-job] ${jobId}: an entry reference past the tray's 200-character field — its card is not filed`); return named('ask_unfiled'); }   // the store cuts an action's field at 200 (src/user-todos.js normalizeAction): a cut id would approve another entry
    const t = now();
    for (const [k, u] of quiet) if (!(u > t)) quiet.delete(k);
    for (const r of fresh) { const qu = quiet.get(`${conv}\n${r.id}`); if (qu) return named('ask_quiet', { key: r.name, until: new Date(qu).toISOString() }); }
    // THE CAPS COUNT JOBS (the adversarial read: by cards, a job with five entries could never start): 4 jobs waiting on cards per
    // conversation, 64 on the hub — this job's own open cards count it once
    const jobsOf = (list) => new Set(list.map((q) => q.jobId));
    const mine = jobsOf([...open, ...pending].filter((q) => q.conv === conv)), all = jobsOf([...open, ...pending]);   // a card being filed counts as one filed
    if (!mine.has(jobId) && mine.size + 1 > VJ.ASKS_PER_CONV) return named('too_many_asks');
    if (!all.has(jobId) && all.size + 1 > VJ.ASKS_MAX) return named('too_many_asks_hub');
    const parent = job.cronParent && jm ? jm.jobs.get(job.cronParent) || null : null;
    const head = parent || job;
    const cmd = (parent && parent.action && parent.action.task && parent.action.task.cmd) || job.cmd || {};
    const who = whoOf(conv);
    let label = jobId;   // §93: a job's name reaches a person only through the engine's ONE accessor (labelOf — belted), never raw
    try { if (jm && typeof jm.labelOf === 'function') label = jm.labelOf(head) || jobId; } catch { }
    // THE CARD IS FILED WHEN ITS FILE FACTS LAND (主开发 r850 item 2): the job waits meanwhile, its job × entries reserved; at the
    // landing it is judged again (still this engine's, still waiting for an approval) and a card that cannot be filed then refuses
    // it by name, as a refusal here would have
    const keys = fresh.map((r) => `${jobId}\n${r.id}`);
    for (const [i, r] of fresh.entries()) pend.set(keys[i], { jobId, conv, entry: r.id });
    const work = programFacts(cmd, { fsp, ms: factsMs, state: readState })
      .then((p) => fileCards({ job, jobId, o, conv, who, label, head, fresh, p }))
      .catch((e) => { log(`[vault-job] the approval card of ${jobId} could not be filed (${(e && e.message) || e})`); refuseLater(jobId, named('ask_unfiled')); })
      .finally(() => { for (const k of keys) pend.delete(k); });
    inflight.add(work); work.finally(() => inflight.delete(work));
    return { ok: true, filed: 0, reading: fresh.length };
  }
  const pend = new Map();   // `${jobId}\n${entry id}` → { jobId, conv, entry } — a card whose file facts are being read
  const inflight = new Set(), readState = { stuck: 0 };
  /** → a promise that resolves once no card's file facts are being read (the suites wait on it — never a fixed sleep) */
  function factsLanded() { return inflight.size ? Promise.allSettled([...inflight]).then(() => factsLanded()) : Promise.resolve(); }
  const refuseLater = (jobId, v) => { try { if (jm && typeof jm.vaultRefused === 'function') jm.vaultRefused(jobId, v, 'vault-card-unfiled'); } catch (e) { log(`[vault-job] ${jobId}: its card could not be filed and the job could not be refused (${(e && e.message) || e})`); } };
  function fileCards({ job, jobId, o, conv, who, label, head, fresh, p }) {
    const now0 = jm ? jm.jobs.get(job.id) : job;
    if (jm && (now0 !== job || job.state !== 'waiting' || job.waitFor !== 'approval')) return;   // it left its wait meanwhile (started, stopped, removed)
    if (userTodos.isHeldUnread?.()) return void ask(job, { missing: fresh.map((r) => r.name) });   // held meanwhile: the held road (the job waits, judged at the read)
    index();
    let filed = 0;
    for (const r of fresh) {
      if ([...asks.values()].some((q) => q.jobId === jobId && q.entry === r.id)) continue;
      const askId = `vj-${crypto.randomBytes(8).toString('hex')}`;
      const card = VJ.askCardOf({ who, job: { id: jobId, label, kind: head.kind, restart: head.restart }, entry: { id: r.id, ref: r.ref, name: r.name, label: entryLabelOf(r.entry) }, ...p });
      let it = null;
      try {
        it = userTodos.add(o.conv ? `claude:${o.conv}` : 'vault', {
          origin: 'vault', kind: 'action', urgency: 'normal', by: 'agent', sessionName: who || null, jobId,   // NO expiresAt: a job waits for its owner (design D1); jobId: the job's Clear content clears this card's words too (src/server/record-clear.js — its cascade finds a job's items by it; resolveByJob never closes a decision row)
          text: card.text, detail: card.detail, i18n: card.i18n, facts: card.facts,
          action: { type: 'vault-job-ask', askId, jobId, entry: r.id, ref: r.ref, name: r.name, conv },   // = VJ.ASK_TYPE (spelled for the approval census's grep) — ids and references only
        });
      } catch (e) { log(`[vault-job] the approval card of ${jobId} could not be filed (${(e && e.message) || e})`); }
      if (!it || !it.id) { if (!filed) refuseLater(jobId, named('ask_unfiled')); return; }
      asks.set(askId, { askId, todoId: it.id, jobId, entry: r.id, ref: r.ref, name: r.name, conv });
      audit({ op: 'ask', job: jobId, entry: r.ref, conv, askId });
      filed++;
    }
  }

  /** THE PERSON ANSWERS a card (src/routes/vault.js — `person`: a bearer never reaches here). allow ⇒ `reauthed` (this page's
   *  验证是你) or nothing; the job's id joins the owner conversation's member of the entry's row (the ONE writer) and the card
   *  closes `allowed` · deny ⇒ the card closes `denied`, the conversation × entry is quiet 10 minutes, the job is refused.
   *  → { ok: true, outcome, job } | a refusal by name. */
  function answer(askId, { answer: a, reauthed = false, by = 'user', person = false } = {}) {
    const id = String(askId || '');
    if (!VJ.ASK_ID_RE.test(id)) return named('ask_unknown');
    // B-44f3: the held store — never «that request is gone» over an unread list: refused by name (503), try once it reads
    if (userTodos && userTodos.isHeldUnread?.()) return { ok: false, code: 'todos-unread', words: userTodos.unreadRefusal("answering a Background job's approval card") };
    index();
    const q = asks.get(id);
    if (!q) return named(settled.has(id) ? 'ask_settled' : 'ask_unknown');
    const it = userTodos && typeof userTodos.get === 'function' ? userTodos.get(q.todoId) : null;
    if (!it || it.status !== 'open' || !it.action || it.action.type !== VJ.ASK_TYPE || it.action.askId !== id) { forget(q); return named('ask_settled'); }   // the belt: still open, still this card's
    if (a !== 'allow' && a !== 'deny') return named('bad_job_answer');
    const job = jm ? jm.jobs.get(q.jobId) : null;
    const over = (code) => { settle(q, 'ask-over'); audit({ op: 'over', job: q.jobId, entry: q.ref, askId: id }); return named(code); };
    if (!job) return over('ask_over');
    const fact = person ? { decidedBy: 'person', decidedAt: now() } : null;
    const who = String(by || 'user').slice(0, 40);
    if (a === 'deny') {
      settle(q, 'denied', fact);
      quiet.set(`${q.conv}\n${q.entry}`, now() + VJ.DENY_QUIET_MS);
      audit({ op: 'deny', job: q.jobId, entry: q.ref, conv: q.conv, askId: id, by: who });
      try { jm.vaultRefused(q.jobId, named('vault_denied', { key: q.name })); } catch (e) { log(`[vault-job] the denial of ${q.jobId} could not refuse it (${(e && e.message) || e})`); }
      return { ok: true, outcome: 'denied', job: q.jobId };
    }
    if (reauthed !== true) return named('reveal_needs_password');
    // THE RE-CHECK at the press (the adversarial read): the job still waits (a card of a job that left its wait is over — never a
    // grant for a job that will not start), and the entry is still in the vault (a deleted entry's id is never approved: a later
    // entry of the same name would inherit it)
    const waits = (j) => j && j.state === 'waiting';
    if (!(waits(job) || (job.kind === 'cron' && job.desiredUp !== false && job.state !== 'failed'))) return over('ask_over');
    if (!entryOf({ store: 'secrets', field: 'secret', entry: (VR.parseRef(q.ref) || {}).entry })) return over('entry_unknown');
    const g = store();
    if (!g || typeof g.set !== 'function') return named('not_written');
    const next = VJ.memberWith(rowsFor(q.entry)[0] || null, q.conv, q.jobId, { keep: (x) => !!(jm && jm.jobs.has(x)) });   // the ids of jobs gone (archived, collected) leave as it is written
    if (!next) return named('too_many_jobs');
    answering.add(id);   // the row's write starts the job synchronously (onChange): its start closes the job's OTHER cards, never this one
    try {
      if (!next.same) {
        let w = null;
        try { w = g.set(VJ.DOOR, q.entry, { to: next.to, except: next.except }, 'user'); } catch (e) { w = { ok: false, code: 'not_written', error: (e && e.message) || 'write failed' }; }
        if (!w || !w.ok) return { ok: false, code: (w && w.code) || 'not_written', error: (w && w.error) || 'the approval could not be saved — nothing changed' };
      }
      settle(q, 'allowed', fact);
    } finally { answering.delete(id); }
    audit({ op: 'allow', job: q.jobId, entry: q.ref, conv: q.conv, askId: id, by: who });
    // what the press did, said (the adversarial read: «starts» for a job whose start was refused): the job's state after the
    // row's change — running, still waiting (another entry's approval, the unlock) or refused at its start (its card says why)
    return { ok: true, outcome: 'allowed', job: q.jobId, state: String(job.state || ''), waitFor: job.state === 'waiting' ? job.waitFor || null : null };
  }

  /** the job removed or stopped (the engine): its open cards close `ask-over` — a later start asks again */
  function askOver(jobId) {
    const j = String(jobId || '');
    if (!j) return 0;
    index();
    let n = 0;
    for (const q of [...asks.values()]) if (q.jobId === j && !answering.has(q.askId)) { settle(q, 'ask-over'); audit({ op: 'over', job: j, entry: q.ref, askId: q.askId }); n++; }
    return n;
  }

  // THE ITEM AND THE ASK ARE ONE STATE: a card closed by any other door (a Clear content, a bulk close) refuses its job by name
  if (userTodos && typeof userTodos.onStatus === 'function') {
    userTodos.onStatus((it, { status } = {}) => {
      const q0 = recordOf(it);
      if (!q0 || settling.has(it.id) || status === 'open') return;
      const q = asks.get(q0.askId);
      if (!q || q.todoId !== it.id) return;
      forget(q);
      audit({ op: 'over', job: q.jobId, entry: q.ref, askId: q.askId, closed: String(status || '').slice(0, 20) });
      try { if (jm) jm.vaultRefused(q.jobId, named('ask_closed', { key: q.name })); } catch { }
    });
  }

  // ── TAKEN BACK (lane vault-job-approval, decision ④ — revoke / delete STOPS; a lock stops nothing: this file has no lock hook) ──
  const JOB_RE = /^jb-[0-9a-f]{8}$/;
  // a NARROWING write (a take-back, a removed job, a deleted entry) re-judges nothing: it can start no job, and a re-judge
  // there would file again the cards of the very job being removed or stopped (the second adversarial read)
  const narrow = (fn) => { narrowing++; try { return fn(); } finally { narrowing--; } };
  const write = (id, next, by) => {
    const g = store();
    if (!g || typeof g.set !== 'function') return named('not_written');
    let w = null;
    try { w = narrow(() => g.set(VJ.DOOR, id, { to: next.to, except: next.except }, by)); } catch (e) { w = { ok: false, code: 'not_written', error: (e && e.message) || 'write failed' }; }
    return w && w.ok ? { ok: true } : { ok: false, code: (w && w.code) || 'not_written', error: (w && w.error) || 'the approval could not be changed — nothing changed' };
  };
  /** THE PERSON TAKES IT BACK (✕ on the Vault row's job chip or the job card — src/routes/vault.js person()): the job leaves the
   *  entry's row through the ONE writer and is STOPPED at once (a ✕ that left it running would be a control that lies); its
   *  owner conversation is told once (the engine's vaultRevoked); its next start asks again. → {ok, outcome, job, stopped} */
  function revoke(entry, jobId, { by = 'user' } = {}) {
    const id = String(entry || ''), j = String(jobId || '');
    if (!VJ.entryOfRow(id) || !JOB_RE.test(j)) return named('bad_revoke');
    const row0 = rowsFor(id)[0] || null;
    if (row0 && !Array.isArray(row0.to)) {   // an unreadable grants store (its fail-closed row): no approval can start the job — and the ✕ still STOPS it (decision ④), said
      let stopped = false;
      try { stopped = !!(jm && jm.vaultRevoked(j, VJ.stopWords('revoked', entryLabelOf(VJ.entryOfRow(id))))); } catch { }
      return { ok: false, code: 'store_unreadable', stopped, error: 'the approvals could not be read (data/grants.json) — the job was stopped; nothing was written' };
    }
    const next = VJ.memberWithout(row0, j);
    if (!next.changed) return named('not_approved');
    const w = write(id, next, String(by || 'user').slice(0, 40));
    if (!w.ok) return w;
    audit({ op: 'revoke', job: j, entry: id, by: String(by || 'user').slice(0, 40) });
    let stopped = false;
    try { stopped = !!(jm && jm.vaultRevoked(j, VJ.stopWords('revoked', entryLabelOf(VJ.entryOfRow(id))))); } catch (e) { log(`[vault-job] the revoke of ${j} could not stop it (${(e && e.message) || e})`); }
    return { ok: true, outcome: 'revoked', job: j, stopped };
  }
  /** AN ENTRY IS DELETED (the Vault window's 删除 — src/server/vault-paste-door.js dropEntry / dropAgentEntry), in two steps around the engine's
   *  secretDrop: `dropRow(id)` FIRST — the entry's vault-job row is removed (a delete never leaves an approval dangling; a write
   *  that fails refuses the whole delete, as the vault-use row's does) → {ok, jobs:[ids]}; then `entryGone(id)` — every job that
   *  names the entry stops (a running one: stopped, its owner told once; a waiting one: refused `entry_unknown`, its card over). */
  function dropRow(entry, { by = 'user' } = {}) {
    const id = String(entry || '');
    const row = rowsFor(id)[0] || null;
    const jobs = [...new Set((Array.isArray(row && row.to) ? row.to : []).flatMap((m) => (m && Array.isArray(m.jobs) ? m.jobs.map(String) : [])))];
    if (!row) return { ok: true, jobs };
    const g = store();
    if (!g || typeof g.remove !== 'function') return named('not_written');
    let w = null;
    try { w = narrow(() => g.remove(VJ.DOOR, id, String(by || 'user').slice(0, 40))); } catch (e) { w = { ok: false, code: 'not_written', error: (e && e.message) || 'write failed' }; }
    if (!w || !w.ok) return { ok: false, code: (w && w.code) || 'not_written', error: (w && w.error) || 'the approvals of that entry could not be removed — nothing was deleted' };
    audit({ op: 'drop', entry: id, jobs, by: String(by || 'user').slice(0, 40) });
    return { ok: true, jobs };
  }
  function entryGone(entry, { label = null, why = 'deleted' } = {}) {
    const id = String(entry || '');
    if (!jm || !VJ.entryOfRow(id)) return 0;
    const words = VJ.stopWords(why === 'revoked' ? 'revoked' : 'deleted', label || VJ.entryOfRow(id));
    let n = 0;
    const names = (job) => VJ.refsOf(job).some((r) => { const p = VR.parseRef(r.ref); return !!p && p.id === id; });
    for (const job of [...jm.jobs.values()]) {
      if (!names(job)) continue;
      const parent = job.cronParent ? jm.jobs.get(job.cronParent) : null;
      if (parent && names(parent) && parent.state !== 'failed' && parent.desiredUp !== false) continue;   // its cron stops it (and its owner is told once — the cron's)
      try { if (jm.vaultEntryGone(job.id, words)) n++; } catch (e) { log(`[vault-job] ${job.id}: its deleted entry could not stop it (${(e && e.message) || e})`); }
    }
    return n;
  }
  /** A JOB REMOVED OR ITS CONTENT CLEARED (the engine's rm / clearJobs): its id leaves every vault-job row (a later job — a new id —
   *  asks again; a cleared one's next start asks again) → the rows changed */
  function jobGone(jobIds) {
    const ids = (Array.isArray(jobIds) ? jobIds : [jobIds]).map(String).filter((x) => JOB_RE.test(x));
    const g = store();
    if (!ids.length || !g || typeof g.rowsOfDoor !== 'function') return 0;
    let rows = [];
    try { rows = g.rowsOfDoor(VJ.DOOR) || []; } catch { rows = []; }
    // every row the ids leave, in ONE landed write (the second adversarial read: one write per row per id was a storm of
    // synchronous grants.json writes for a clear of many jobs)
    const changes = [];
    for (const row of rows) {
      let cur = row, changed = false;
      for (const j of ids) { const next = VJ.memberWithout(cur, j); if (next.changed) { cur = { ...cur, to: next.to, except: next.except }; changed = true; } }
      if (changed) changes.push({ door: VJ.DOOR, resource: row.resource, to: cur.to, except: cur.except });
    }
    if (!changes.length) return 0;
    let w = null;
    try { w = narrow(() => (typeof g.setMany === 'function' ? g.setMany(changes, 'hub') : changes.reduce((r, c) => (r && r.ok ? g.set(c.door, c.resource, c, 'hub') : r), { ok: true }))); } catch (e) { w = { ok: false, code: 'not_written', error: (e && e.message) || 'write failed' }; }
    if (!w || !w.ok) { log(`[vault-job] ${ids.join(', ')}: their approvals could not be removed (${(w && w.code) || 'error'})`); return 0; }
    for (const c of changes) audit({ op: 'gone', jobs: ids, entry: c.resource, by: 'hub' });
    return changes.length;
  }

  // ── WHAT THE OWNER SEES (lane vault-job-approval, L2 — design-vault-service-secret) ─────────────────────────────────────────
  // a job's state as the Vault row's chip words it — CODES (the client words them in the viewer's language), never a sentence
  const stateCodeOf = (j) => (['up', 'starting', 'awaiting-user'].includes(j.state) ? 'running' : j.state === 'waiting' ? (j.waitFor === 'vault' ? 'waiting-vault' : 'waiting-approval') : j.state === 'scheduled' ? 'scheduled' : 'stopped');
  /** A Vault row's Background jobs (src/server/vault-contents.js list — the row's `jobs`): every job its vault-job row approves,
   *  each `{id, name (the engine's belted label — §93), kind, state (a code), starts (the starts it was handed the entry, the
   *  audit's tally — a cron's: its runs')}` | null when none. Ids, codes, counts and the belted name — never a value. */
  function rowFacts(row) {
    const id = String((row && row.id) || ''), entry = VJ.entryOfRow(id);
    if (!entry || !jm) return null;
    const r = rowsFor(id)[0] || null;
    const ids = [...new Set((r && Array.isArray(r.to) ? r.to : []).flatMap((m) => (m && Array.isArray(m.jobs) ? m.jobs.map(String) : [])))];
    if (!ids.length) return null;
    let counts = {};
    try { counts = (typeof vault.useCounts === 'function' && vault.useCounts()) || {}; } catch { counts = {}; }
    const per = (counts[entry] && counts[entry].jobs) || {};
    const out = [];
    for (const j of ids) {
      const job = jm.jobs.get(j);
      if (!job) continue;   // removed meanwhile — its id leaves the row at rm (jobGone)
      let label = j;
      try { label = jm.labelOf(job) || j; } catch { }
      const starts = Object.entries(per).reduce((n, [k, v]) => { const c = k === j ? null : jm.jobs.get(k); return n + (k === j || (c && c.cronParent === j) ? Number(v) || 0 : 0); }, 0);
      out.push({ id: j, name: String(label).slice(0, 160), kind: job.kind, state: stateCodeOf(job), starts });
    }
    return out.length ? out : null;
  }
  /** A job's vault values as its card names them (the person's GET /api/jobs — never an agent's view): `[{name, ref, id, label,
   *  approved}]` — the --vault NAME, its reference, the entry's row id, its Vault name (the owner's own words) and whether a
   *  vault-job row approves THIS job on it (the card's ✕ takes that back; a value the conversation put needs none — no ✕) */
  function usesOf(job) {
    const jid = VJ.askJobIdOf(job);
    const refs = VJ.refsOf(job);
    if (refs.length) index();
    const open = [...asks.values()].filter((q) => q.jobId === jid);
    return refs.map((x) => {
      const p = VR.parseRef(x.ref);
      const row = p ? rowsFor(p.id)[0] || null : null;
      const approved = (Array.isArray(row && row.to) ? row.to : []).some((m) => m && Array.isArray(m.jobs) && m.jobs.map(String).includes(jid));
      const q = p ? open.find((c) => c.entry === p.id) : null;   // its OPEN approval card (the job card's «Open For you» opens THAT item — 主开发 r850 item 4)
      return { name: x.name, ref: x.ref, id: p ? p.id : null, label: p ? entryLabelOf(p.entry) : x.ref, approved, ...(q ? { card: q.todoId } : {}) };
    });
  }

  const bindJobs = (engine) => { jm = engine || null; };
  return { gate, payload, noteUses, blocked, onChange, ask, answer, askOver, revoke, dropRow, entryGone, jobGone, rowFacts, usesOf, bindJobs, factsLanded };
}

module.exports = { create, programFacts, FACTS_MS };
