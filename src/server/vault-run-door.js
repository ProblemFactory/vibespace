'use strict';
/**
 * THE DOOR OF `vibespace-vault run` (lane vault-run-door — design q-043 §8 + §5 P0-f; the owner 2026-10-19 12:29Z 「agent 要用
 * 敏感信息执行指令——vault 提供指令 proxy」, his five decisions 2026-10-20). ORCH tier: every RULE is PURE src/vault-run.js (the
 * reference grammar, the injection and refusal tables, the shape key, the verdict, the scrubber — lane vault-run-model); this
 * file is the I/O around them:
 *
 *   · THE SWITCH (decision ⑤): a run references an entry only once the owner opened it — the Vault window's per-row «Usable
 *     by agent runs», OFF by default (`setRunnable`: a person's door; ON needs the page's 验证是你 window). NEVER a login,
 *     pairing, channel, passkey, automation or hub secret: the model's `ownDoorOf` AND this file's own entry-class check
 *     (`classOf` — the store's class, a sign-in token's kind) both refuse it by name, whatever a switch says.
 *   · THE STORE data/vault-run.json (0600; tmp `wx` + fsync + rename): the switches and the remembered «always» shapes, MARKED
 *     by the vault (`vault.macOf` — an HMAC under a key derived from the DEK). An agent shares the hub's uid and can write the
 *     file — never a mark that verifies: a file that does not verify reads as EMPTY (every entry closed, no «always»), said
 *     in the audit. Read and written only while the vault is unlocked; an 8-hour «always» lives in memory only (a lock ends it).
 *     The body carries a GENERATION: a copy older than one this hub read or wrote is a replay — read as empty too. Switching an
 *     entry OFF drops every «always» and seen shape that names it.
 *   · THE CARD (decisions ② ④; exit-proxy's ask: one per conversation × shape, 60 s, the For-you item and the ask ONE state,
 *     a full tray ⇒ `ask_unfiled` at once, a second run of a shape whose card is up ⇒ `ask_pending`): 允许一次 / 此形状总是 /
 *     拒绝. A CLUSTER instance asks for every run without a live «always»; a LOCAL one asks the first time a shape runs and
 *     allows it after one 允许 (`seen`, this unlock). The card shows the whole command (references — never a value), the
 *     secrets, how each is given, the PROGRAM that runs (its real path — said when an agent could have written it), the hosts,
 *     the folder, the templates and what «this shape» means; 此形状总是 needs the
 *     second password again (the page's 验证是你 window, opened in the press's own task — the route checks it) and is not
 *     offered for a shell, an interpreter or a tool whose destination is unknown. An allow re-checks the item (open, this
 *     ask's, the very detail it showed) — a changed item runs nothing (`ask_changed`).
 *   · THE RUN: the HUB spawns the child — argv[0] resolved on agentEnv()'s PATH (a bare name is never looked up in the cwd)
 *     and realpath'd, refused by the typed name AND the resolved one; the cwd inside the conversation's project folder, the
 *     temp folder or ~/Downloads (exit-transfer's fence); env = agentEnv() + the agent's plain env + the injected values;
 *     each file 0600 (O_EXCL | O_NOFOLLOW) in a 0700 directory `vs-vault-run-<rand>` under $XDG_RUNTIME_DIR, SHREDDED and
 *     unlinked once the child is gone; stdin = the value + a newline, closed at once; NEVER argv (the model refuses it); its
 *     own process group; a hard timeout (120 s by default, ≤ 600 s: SIGTERM, then SIGKILL 5 s later); stdout and stderr
 *     through ONE streaming scrubber per run, fed in arrival order (a StringDecoder each → createRunMasker: the value in every
 *     spelling of vault-run.js's FORMS over ONE window — a value split between the two pipes is seen whole; lane
 *     vault-scrub-forms), ≤ 2 MiB together, then secret-shapes (a name stays, its value «redacted»). ONLY that reaches the
 *     agent. A stream CUT (the bound, the timeout, a lock, the caller gone) never flushes the scrubber's held tail: a value
 *     begun there is dropped whole.
 *   · A RUN ENDS WHOLE (the security review): when its child is gone, the child's process group is SIGKILLed (a backgrounded
 *     `cmd &` holds the value in its environ) and so is every process still carrying the run's MARK (`VS_RUN_MARK`
 *     in its environ — a descendant that left the group: setsid, a double fork), found by a fresh /proc scan. A run folder
 *     carries its hub's identity (`.owner`, src/proc-identity.js): the boot sweep shreds only the folders of a hub that is
 *     GONE, after ending the processes that still carry their mark (another hub on the box keeps its runs).
 *   · THE LOCK (decision ③): a lock act ends every running child BY NAME (its process group: SIGTERM, SIGKILL after the
 *     grace — then the end above) and the agent's answer is `vault_locked`; its run files are shredded AT ONCE; every card
 *     up settles `vault_locked`; the seen shapes and the 8-hour «always» go with it — and (lane vault-manual-and-lock) every
 *     open REQUEST is withdrawn `vault_locked` and every GRANT ends (one of the lock's four consequences, test-vault-engine's
 *     census). A locked vault refuses before anything is read and notes WHO it stopped (the vault's one helper).
 *   · THE REQUEST AND ITS GRANT (lane vault-manual-and-lock — design q-043 D4 + D3 ⑤): an agent whose entry is closed asks
 *     the owner for it WITH ITS PURPOSE (`request`: ONE For-you ask naming the agent, the entry and the purpose — it waits for
 *     nobody and never expires; a second request for the same conversation × entry while one is open ⇒ `request_pending`).
 *     The owner's answer (允许一次 / 8 小时 / 拒绝 — a person's door) writes a GRANT ROW in THIS door, the «always» rows' shape
 *     `{conv, key: null, entries, until, at, by}` + `once` and the purpose — memory only, ≤ 8 hours: it opens that entry for
 *     THAT conversation's runs as the per-row switch opens it for everyone (the shape card still shows each new command); a
 *     once-grant is spent before its run starts. The run's use line carries the grant's purpose.
 *     THE CAP (B-4934, q-043 verify L2): 8 open requests PER CONVERSATION (`too_many_requests`) and, hub-wide, 32 CONVERSATIONS
 *     asking at once (the 33rd ⇒ `too_many_askers`) — a count of callers, never of requests, so one conversation's many open
 *     questions never refuse another's first. More than 8 conversations asking ⇒ ONE Vault notice in For you «N conversations
 *     are asking» (re-worded as N moves; closed at 8 or fewer, at a lock, at a boot).
 *   · THE USE LINE (lane vault-manual-and-lock — the use law's seam): every run that ran, and every refusal past the plan, is
 *     ALSO one `vault-use` line per entry through the engine's ONE writer (`noteUse`: door `run`, the conversation, the
 *     purpose, the outcome, the run's receipt) — what `vibespace-vault uses` reads back for that conversation.
 *   · THE AUDIT: ONE `vault-run` line in data/vault-audit.jsonl per run and per refusal past the parse — the actor, the
 *     entries (references), the shape (its id and its key, secret-shapes'd), the tool, the hosts, the injection, the verdict,
 *     the exit code, the time, the scrubbed bytes, and the scrubbed heads of the command and of each stream (≤ 4 KiB) — NEVER
 *     a value, never another conversation's name.
 *
 * WHAT IT IS NOT — §8.6, THE THREE HOLES, said where the door is:
 *   ① the child runs under the agent's uid: the agent can read /proc/<child>/environ and the 0600 file while the child lives.
 *     Short-lived, env before a file, audited — hygiene and an audit boundary, NOT isolation (q-040's per-run uid closes it;
 *     the HUB spawns, never the CLI, so nothing here changes shape when it lands);
 *   ② a tool can SEND the value elsewhere (`curl -d @$VAULT_FILE{x} https://elsewhere`): the card shows the hosts and the whole
 *     command, a destination-unknown tool gets no «always»; the egress fence is P1 (vault-run-egress);
 *   ③ THE SCRUBBER IS A SIEVE: it reads the child's stdout and stderr in the spellings a real tool prints by itself —
 *     a custom encoding, compression, encryption, a hash or the last four characters pass it, and a value the tool WRITES TO A FILE that the agent then reads with its own shell
 *     never meets it. WRITE-THEN-CAT IS ACCEPTED AND AUDITED (the run's line names the command, the folder and the entries) —
 *     not closed; the copy / print / pack tools are refused by the model already.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { StringDecoder } = require('string_decoder');
const VR = require('../vault-run.js');
const VI = require('../vault-inventory.js');
const VB = require('../vault-blocked.js');
const SS = require('../secret-shapes.js');
const HC = require('../hidden-chars.js');
const DOOR = require('../mount-door.js');   // B-afc4: a blocked storage path is answered by name, never read (a cwd, a tool, a template)
const PI = require('../proc-identity.js');   // a run folder's hub: its identity, never a bare pid (the boot sweep)

const ACTION_TYPE = 'vault-run-ask';
const REQUEST_TYPE = 'vault-grant-ask';      // lane vault-manual-and-lock: an agent's request for an entry (its For-you ask)
const PURPOSE_MAX = 200;                     // the request's purpose, in the agent's own words (one line)
const GRANT_MS = 8 * 3600e3;                 // a grant lives ≤ 8 hours (once: until its run; 8h: every run) — and never past a lock
const GRANT_ANSWERS = Object.freeze(['once', '8h', 'deny']);
// B-4934 (q-043 verify L2): the hub-wide bound counts CONVERSATIONS, not requests — 64 requests hub-wide let eight
// conversations × 8 open asks fill the table, and a ninth conversation's honest first ask answered too_many_requests
const REQUESTS_PER_CALLER = 8, REQUEST_CALLERS_MAX = 32;
const ASKING_LINE_OVER = 8;                  // more conversations than this asking at once ⇒ ONE Vault notice «N conversations are asking»
const VAULT_INBOX_KEY = 'vault';             // the For-you bucket the vault's own notices file under (src/server/vault-hooks.js)
const ASKING_TEXT = `More than ${ASKING_LINE_OVER} conversations are asking to use stored secrets`;   // the store's dedupe key (one row; N rides its words)
const ASKING_KEY = '{n} conversations are asking to use stored secrets';
const ASKING_DETAIL = 'Each conversation asks on its own card in For you. This line goes when 8 or fewer are asking.';
const REQUEST_QUIET_MS = 10 * 60e3;          // a Deny (or the card dismissed) quiets that conversation × entry 10 minutes (the automation card's rule)
const USE_SKIP = new Set(['ask_pending', 'too_many_runs', 'spawn_failed', 'storage_blocked']);   // a wait or the hub's own failure before any child ran — not a use's outcome (a child that ran is always one)
const STORE_FILE = 'vault-run.json';
const MARK_LABEL = 'vault-run-store-v1';
const RUN_DIR_PREFIX = 'vs-vault-run-';
const OWNER_FILE = '.owner';                 // the run folder's hub identity { pid, starttime, bootId }
const MARK_ENV = 'VS_RUN_MARK';      // every child of a run carries its folder's name here (the end's /proc scan)
const ARGS_MAX = 65536, CWD_MAX = 4096;      // the request's words (the review: an unbounded value stalled the loop)
const STORE_MAX = 1024 * 1024;               // data/vault-run.json read bounded (a FIFO / a huge file never stalls the hub)
const KILL_GRACE_MS = 5000;
const PIPE_GRACE_MS = 2000;                  // after the child's exit, a pipe a stray still holds is cut (the answer never waits on it)
const HEAD_MAX = 4096;               // bytes of a head on the audit line (the command, each stream)
const DETAIL_MAX = 8000;             // the For-you store's detail bound — a card that would be cut is refused (what you approve is what runs)
const SETTLED_MAX = 256;
const RUNS_MAX = 16, RUNS_PER_CALLER = 4;
// THE HTTP status of each answer (src/routes/vault.js reads it) — a refusal is a 4xx by name; a run that ran is 200 whatever its exit
const STATUS = Object.freeze({
  vault_not_set_up: 409, vault_locked: 423, bad_flag: 400, bad_reference: 400, bad_env_name: 400, duplicate_name: 400, no_command: 400,
  cmd_too_long: 400, no_reference: 400, template_unread: 400, template_too_long: 400, hidden_chars: 400, card_too_long: 400,
  env_refused: 403, argv_refused: 403, tool_prints_secrets: 403, tool_wraps_another: 403, tool_has_its_own_door: 403,
  entry_has_its_own_door: 403, entry_unknown: 404, entry_not_runnable: 403, entry_too_short_to_mask: 403, use_not_granted: 403,
  job_no_use: 403, device_road_later: 403, cwd_refused: 403, template_refused: 403, tool_not_found: 404, unauthorized: 401,
  ask_pending: 409, ask_denied: 403, ask_expired: 403, ask_unfiled: 503, ask_changed: 409, caller_gone: 410, too_many_runs: 429,
  spawn_failed: 500, failed: 500, storage_blocked: 503, request_too_large: 400,
  request_pending: 409, request_quiet: 429, purpose_required: 400, purpose_too_long: 400, too_many_requests: 429,   // lane vault-manual-and-lock
  too_many_askers: 429,   // B-4934
});
const MORE_WORDS = Object.freeze({
  hidden_chars: 'the command holds characters that show differently than they run (control or direction marks) — refused',
  card_too_long: `the card that shows this run to the user would be cut (over ${DETAIL_MAX} characters) — a shorter command or template`,
  unauthorized: 'only a conversation\'s own session token runs a command with a stored secret',
  storage_blocked: `${DOOR.SENTENCE} (the run's folder, its program or a template is on it) — nothing ran`,
  request_too_large: `the run's words are over ${ARGS_MAX} characters or its folder over ${CWD_MAX} — refused before anything is read`,
  failed: 'the run door failed — nothing ran',
  // lane vault-manual-and-lock: the request's own codes
  request_pending: 'you already asked the user for that entry — the question waits in their For you tray; `vibespace-vault uses` shows the answer when it comes',
  purpose_required: 'say what the entry is for: vibespace-vault request <vault://…> --for "<what you will run with it, and why>"',
  purpose_too_long: `the purpose is one line of at most ${PURPOSE_MAX} characters`,
  too_many_requests: `this conversation already has ${REQUESTS_PER_CALLER} questions waiting on the user — wait for their answers (\`vibespace-vault uses\` lists them)`,
  too_many_askers: `${REQUEST_CALLERS_MAX} other conversations are waiting on the user's answers already — nothing was filed; ask again once some are answered`,   // B-4934
  request_quiet: 'the user said no to that a moment ago — do not ask again for 10 minutes; do other work',
});
const named = (code, extra = {}) => (MORE_WORDS[code] ? { ok: false, code, words: MORE_WORDS[code], ...extra } : VR.refusalOf(code, extra));
const NO_ALWAYS = Object.freeze({
  shell: 'a shell\'s whole script is its shape',
  interpreter: 'an interpreter runs a program this card cannot read',
  'unknown-destination': 'where this tool sends what it reads is unknown',
  'runs-project-code': 'it runs the project\'s own code (package scripts, setup files, a Dockerfile)',
  'config-file': 'it reads a config file this card cannot show',
  'program-writable': 'the program sits where an agent could have written it',
});

// THE ENGINE'S ENTRY-CLASS CHECK (decision ⑤ — the second of two that say no, beside the model's ownDoorOf): the stores whose
// rows a person may open for runs, by THIS file's own table; every other store's class is named; a sign-in token's kind is
// never runnable wherever it sits
const RUN_CLASS = Object.freeze({ mounts: 'storage', 'app-secrets': 'app-login' });
const NEVER_CLASS = Object.freeze({ accounts: 'login', integrations: 'channel', channels: 'channel', passkeys: 'passkey', automation: 'automation', secrets: 'pairing' });
const NEVER_KINDS = Object.freeze(['long-lived-oauth-token', 'session-token']);
/** A reference (and its row) → { cls, runnable, door? }. */
function classOf(ref, row = null) {
  if (!ref) return { cls: 'unknown', runnable: false };
  const modelDoor = VR.ownDoorOf(ref);
  if (modelDoor) return { cls: NEVER_CLASS[ref.store] || 'unknown', runnable: false, door: modelDoor };
  if (VR.agentScopeOf(ref)) return { cls: 'agent-entry', runnable: true };   // an AGENT's own entry (lane vault-mint-put: mint / put) — the owner opens it like any other; only its conversation may use it
  if (VR.isFreeEntry(ref.store, ref.entry, ref.field)) return { cls: 'secret', runnable: true };   // lane vault-paste-request: a free entry (`secret:<id>`) — the owner opens it (the switch, a grant, a paste for the asker)
  if (!Object.prototype.hasOwnProperty.call(RUN_CLASS, ref.store)) return { cls: NEVER_CLASS[ref.store] || 'unknown', runnable: false, door: 'no run door (a store this door does not open)' };
  if (row && NEVER_KINDS.includes(row.kind)) return { cls: 'login', runnable: false, door: 'a sign-in token is never referenced by a run' };
  return { cls: RUN_CLASS[ref.store], runnable: true };
}

/** THE atomic persistence law: tmp opened `wx` 0600, fsync, rename. */
function writeJsonAtomic(file, obj) {
  const tmp = `${file}.tmp-${process.pid}-${crypto.randomBytes(4).toString('hex')}`;
  const fd = fs.openSync(tmp, 'wx', 0o600);
  try { fs.writeSync(fd, JSON.stringify(obj, null, 1) + '\n'); try { fs.fsyncSync(fd); } catch { /* best effort */ } } finally { fs.closeSync(fd); }
  try { fs.renameSync(tmp, file); } catch (e) { try { fs.unlinkSync(tmp); } catch { } throw e; }
}
/** Overwrite a run file's bytes and unlink it (never through a link). */
function shredFile(file) {
  try {
    const st = fs.lstatSync(file);
    if (st.isFile() && st.size > 0) { const fd = fs.openSync(file, fs.constants.O_WRONLY | (fs.constants.O_NOFOLLOW || 0)); try { fs.writeSync(fd, crypto.randomBytes(st.size), 0, st.size, 0); try { fs.fsyncSync(fd); } catch { } } finally { fs.closeSync(fd); } }
  } catch { /* gone, or not ours to write: unlinked below all the same */ }
  try { fs.unlinkSync(file); } catch { }
}
/** A small regular file, read bounded through ONE fd (never through a link, never a FIFO's wait, never past `max`). */
function readBounded(file, max) {
  const fd = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0) | (fs.constants.O_NONBLOCK || 0));
  try {
    const st = fs.fstatSync(fd);
    if (!st.isFile()) throw Object.assign(new Error('not a regular file'), { code: 'ENOTREG' });
    if (st.size > max) throw Object.assign(new Error('too large'), { code: 'EFBIG' });
    const b = Buffer.alloc(st.size);
    let n = 0;
    while (n < st.size) { const k = fs.readSync(fd, b, n, st.size - n, null); if (!k) break; n += k; }
    return b.subarray(0, n);
  } finally { fs.closeSync(fd); }
}
/** THE MARK's end: every process whose environ carries `VS_RUN_MARK=<mark>` (a run's descendant that left its group —
 *  setsid, a double fork, a child its hub did not live to end) is SIGKILLed — its pid read off a FRESH /proc scan in this very
 *  call, its environ the proof. → how many. */
function endMarked(mark) {
  const needle = Buffer.from(`${MARK_ENV}=${mark}\0`);
  let names = [], n = 0;
  try { names = fs.readdirSync('/proc'); } catch { return 0; }
  for (const d of names) {
    if (!/^\d+$/.test(d) || Number(d) === process.pid) continue;
    let environ = null;
    try { environ = fs.readFileSync(`/proc/${d}/environ`); } catch { continue; }
    if (environ.includes(needle)) { try { process.kill(Number(d), 'SIGKILL'); n++; } catch { } }
  }
  return n;
}
function shredDir(dir) {
  try { for (const n of fs.readdirSync(dir)) shredFile(path.join(dir, n)); } catch { }
  try { fs.rmdirSync(dir); } catch { }
}
/** The command as a shell would read it back — the card, the audit (references stay references). */
const quote = (a) => (/^[\w@%+=:,./~^-]+$/.test(a) ? a : `'${String(a).replace(/'/g, `'\\''`)}'`);
const cmdText = (argv) => argv.map(quote).join(' ');
const utf8Head = (s, n = HEAD_MAX) => { const b = Buffer.from(String(s || ''), 'utf8'); return b.length <= n ? String(s || '') : b.subarray(0, n).toString('utf8').replace(/�$/, '') + '…'; };
/** secret-shapes over a long text: windows of ≤ INPUT_MAX characters, each cut at a line end (the rule bounds its input). */
function redactLong(text) {
  let out = '', n = 0, i = 0;
  const t = String(text || '');
  while (i < t.length) {
    let j = Math.min(t.length, i + SS.INPUT_MAX);
    if (j < t.length) { const nl = t.lastIndexOf('\n', j - 1); if (nl > i) j = nl + 1; }
    const r = SS.redactSecrets(t.slice(i, j));
    out += r.text; n += r.redacted; i = j;
  }
  return { text: out, redacted: n };
}

/**
 * @param {object} o
 * @param {string} o.dataDir
 * @param {object} o.vault       src/server/vault-engine.js (state, epoch, macOf, audit, noteUse, blocked, onLock)
 * @param {Object<string, () => ({ vaultRows, vaultReveal } | null)>} o.sources  the Vault window's per-store getters (vault-contents)
 * @param {object} [o.userTodos] the For-you store (the card)
 * @param {() => object} [o.agentEnv]  the sanitized base env of an agent's child (src/agent-env.js over the hub's env)
 * @param {() => ('cluster'|'local')} [o.instanceKind]
 * @param {(conversationId: string) => boolean} [o.liveOf]  is the asking conversation still running
 */
function create({ dataDir, vault, sources = {}, userTodos = null, agentEnv = () => ({ ...process.env }), instanceKind = () => 'local', policy = () => null,
  liveOf = () => true, runRoot = () => process.env.XDG_RUNTIME_DIR || os.tmpdir(), home = os.homedir(), tmpDir = os.tmpdir(),
  now = () => Date.now(), log = () => {}, spawnImpl = spawn, killGraceMs = KILL_GRACE_MS, pipeGraceMs = PIPE_GRACE_MS,
  timers = { set: (fn, ms) => setTimeout(fn, ms), clear: (h) => clearTimeout(h) }, randomBytes = crypto.randomBytes } = {}) {
  if (!dataDir || !vault) throw new TypeError('vault-run-door: dataDir and vault are required');
  const FILE = path.join(dataDir, STORE_FILE);
  const asks = new Map();      // askId → the card up
  const byPair = new Map();    // `${conv}\n${shapeKey}` → askId (ONE card per conversation × shape)
  const settled = new Map();   // askId → 'settled' | 'expired' (a second answer says which)
  const seen = new Map();      // pair → at — the owner allowed this shape once, THIS unlock (a local instance asks no more)
  const shortAlways = new Map(); // pair → until — an 8-hour «always» (memory only: a lock ends it)
  const runs = new Set();      // the children running now
  // lane vault-manual-and-lock: an agent's REQUESTS (one For-you ask each, open until answered or the lock) and the GRANT ROWS
  // their answers write (memory only — the «always» rows' shape + once + purpose; a lock ends them all)
  const requests = new Map();  // askId → { askId, pair, scope, conv, sessionKey, who, ref, id, label, purpose, detail, askedAt, todoId }
  const reqByPair = new Map(); // `${scope}\n${entry id}` → askId (ONE open request per conversation × entry)
  const grants = new Map();    // `${scope}\n${entry id}` → { conv, key: null, entries: [id], until, once, at, by, askId, purpose }
  const reqQuiet = new Map();  // pair → until (a Deny / a dismissed card: no new card for that pair for 10 minutes)
  let asking = { id: null, n: 0, quiet: false, batch: false };   // B-4934: the «N conversations are asking» notice (its item, its count, set aside by the owner)
  let db = null, dbEpoch = -1;
  const hubIdentity = (() => { try { return PI.identityOf(process.pid); } catch { return null; } })();   // written into every run folder (the boot sweep's proof)
  const vaultState = () => { try { return vault.state(); } catch { return 'locked'; } };
  const audit = (event, line) => { try { vault.audit(event, line); } catch (e) { log(`the audit line could not be written (${e.message})`); } };

  // ── THE STORE (marked by the vault) ──
  const bodyOf = (d) => JSON.stringify({ v: 1, gen: Number(d.gen) || 0, runnable: [...d.runnable].sort(), always: d.always.slice().sort((a, b) => (a.conv + a.key).localeCompare(b.conv + b.key)) });
  const okAlways = (a) => a && typeof a.conv === 'string' && typeof a.key === 'string' && a.key.startsWith(VR.SHAPE_V + ':') && (a.until === null || Number.isFinite(a.until)) && Array.isArray(a.entries);
  let lastGen = 0;   // the newest generation this hub read or wrote — an older copy is a replay (the review: a saved copy restored)
  /** The store as the vault vouches for it — null unless unlocked. Read once per unlock (the epoch), kept in memory. */
  function load() {
    if (vaultState() !== 'unlocked') return null;
    if (db && dbEpoch === vault.epoch()) return db;
    let raw = null, why = null;
    try { raw = JSON.parse(readBounded(FILE, STORE_MAX).toString('utf8')); } catch (e) { if (!(e && e.code === 'ENOENT')) why = `unreadable (${e.code || 'not JSON'})`; }
    let next = { gen: lastGen, runnable: new Set(), always: [] };
    if (raw && !why) {
      try {
        const cand = { gen: Number.isSafeInteger(raw.gen) && raw.gen >= 0 ? raw.gen : -1, runnable: new Set((Array.isArray(raw.runnable) ? raw.runnable : []).filter((id) => typeof id === 'string' && VI.parseRef(id))), always: (Array.isArray(raw.always) ? raw.always : []).filter(okAlways).map((a) => ({ conv: a.conv, key: a.key, until: a.until, entries: a.entries.filter((x) => typeof x === 'string').slice(0, 64), at: Number(a.at) || null, by: String(a.by || 'user').slice(0, 40) })) };
        const want = vault.macOf(MARK_LABEL, bodyOf(cand));
        const got = typeof raw.mark === 'string' && /^[0-9a-f]{64}$/.test(raw.mark) ? raw.mark : null;   // the review: a non-hex mark threw in timingSafeEqual
        if (!(want && got && cand.gen >= 0 && crypto.timingSafeEqual(Buffer.from(got, 'hex'), Buffer.from(want, 'hex')))) why = 'its mark does not verify';
        else if (cand.gen < lastGen) why = `an older copy (generation ${cand.gen} < ${lastGen}) — a replay`;
        else { next = cand; lastGen = cand.gen; }
      } catch (e) { why = `its mark could not be judged (${(e && e.code) || 'error'})`; }
    }
    if (why) { audit('vault-run-store-refused', { why: `data/${STORE_FILE}: ${why} — read as empty (every entry closed for runs, no «always» shape)` }); log(`data/${STORE_FILE}: ${why} — read as empty`); }
    db = next; dbEpoch = vault.epoch();
    return db;
  }
  function save(next0) {
    const next = { ...next0, gen: Math.max(lastGen, Number(db && db.gen) || 0) + 1 };
    const mark = vault.macOf(MARK_LABEL, bodyOf(next));
    if (!mark) return named('vault_locked');
    try { writeJsonAtomic(FILE, { ...JSON.parse(bodyOf(next)), mark }); } catch (e) { return named('failed', { why: `data/${STORE_FILE} could not be written (${e.code || e.message})` }); }
    db = next; dbEpoch = vault.epoch(); lastGen = next.gen;
    return { ok: true };
  }

  // ── THE ROWS a run may reference (each store lists its own; a value is read only for a run) ──
  const sourceOf = (store) => { try { const g = sources[store]; const s = typeof g === 'function' ? g() : null; return s && typeof s.vaultRows === 'function' ? s : null; } catch { return null; } };
  function rowOf(ref) {
    const src = sourceOf(ref.store);
    if (!src) return null;
    let rows = [];
    try { rows = src.vaultRows() || []; } catch { rows = []; }
    const raw = rows.find((r) => r && String(r.entry) === ref.entry && String(r.field) === ref.field);
    return raw ? VI.rowOf(ref.store, raw) : null;
  }
  function valueOf(ref) {
    const src = sourceOf(ref.store);
    const v = src && typeof src.vaultReveal === 'function' ? src.vaultReveal(ref.entry, ref.field) : null;
    return typeof v === 'string' ? v : null;
  }

  /** The Vault window's fact for a row: may it be opened for runs, is it open. */
  function rowFacts(row) {
    const ref = row && VI.parseRef(row.id);
    const c = classOf(ref, row);
    const d = c.runnable ? load() : null;
    return { can: c.runnable, open: !!(c.runnable && d && d.runnable.has(row.id)) };
  }
  /** A PERSON's switch (src/routes/vault.js: people only; ON needs this page's 验证是你 window — `reauthed`). */
  function setRunnable({ id, on, reauthed = false, by = 'user' } = {}) {
    const st = vaultState();
    if (st !== 'unlocked') return named(st === 'not_set_up' ? 'vault_not_set_up' : 'vault_locked');
    const key = String(id || ''), ref = VI.parseRef(key);   // `<store>:<entry>#<field>` (src/vault-inventory.js — the row's id)
    if (!ref) return named('entry_unknown');
    const row = rowOf(ref);
    const c = classOf(ref, row);
    if (on && !c.runnable) return named('entry_has_its_own_door', { door: c.door, words: `${VR.WORDS.entry_has_its_own_door}: ${c.door}` });
    if (on && !row) return named('entry_unknown');
    if (on && !reauthed) return { ok: false, code: 'reveal_needs_password' };
    const d = load();
    const was = d.runnable.has(key);
    if (!!on === was) return { ok: true, id: key, open: was, already: true };
    const runnable = new Set(d.runnable);
    if (on) runnable.add(key); else runnable.delete(key);
    // OFF takes back every «always» and seen shape that names this entry (the review: an «always» outlived its switch)
    const always = on ? d.always : d.always.filter((a) => !a.entries.includes(key));
    if (!on) { for (const [p, x] of shortAlways) if (x.entries.includes(key)) shortAlways.delete(p); for (const [p, x] of seen) if (x.entries.includes(key)) seen.delete(p); for (const [p, x] of grants) if (x.entries.includes(key)) grants.delete(p); }   // + the grants (lane vault-manual-and-lock: OFF = closed for every conversation)
    const r = save({ runnable, always });
    if (!r.ok) return r;
    audit('vault-run-switch', { by: String(by).slice(0, 40), store: ref.store, entry: ref.entry, field: ref.field, open: !!on });
    return { ok: true, id: key, open: !!on };
  }
  /** What THIS caller may reference (vibespace-vault list): the opened rows — a reference, a label, a kind; never a value —
   *  and (lane vault-manual-and-lock) the entries a grant opened for THIS conversation (`by: 'grant'`, its purpose and end). */
  function runnableFor(caller = {}) {
    const st = vaultState();
    if (st !== 'unlocked') return named(st === 'not_set_up' ? 'vault_not_set_up' : 'vault_locked');
    const d = load(), out = [], scope = scopeOf(caller);
    const ids = new Set(d.runnable);
    if (scope) for (const g of grants.values()) if (g.conv === scope && g.until > now()) ids.add(g.entries[0]);
    for (const id of [...ids].sort()) {
      const ref = VI.parseRef(id), row = ref && rowOf(ref);
      if (!row || !classOf(ref, row).runnable) continue;
      const r = VR.refFor(ref.store, ref.entry, ref.field);   // the canonical spelling (the review: encodeURIComponent left !'()* raw)
      const g = d.runnable.has(id) || !scope ? null : grantOf(scope, id);
      out.push({ ref: r ? r.ref : null, store: ref.store, label: row.label, kind: row.kind, field: ref.field, ...(g ? { by: 'grant', once: g.once, until: new Date(g.until).toISOString() } : {}) });
    }
    return { ok: true, entries: out.filter((x) => x.ref) };
  }

  // ── THE CARD (exit-proxy's ask: one per conversation × shape, 60 s, the item and the ask ONE state) ──
  const pairOf = (conv, key) => `${conv}\n${key}`;
  /** `fact` (lane wake-approve-card r3): the PERSON's mark — the answer came through THE person verdict (src/routes/vault.js
   *  `person`), so the item's record says «allowed by you · 09:41» (resolvedFact {decidedBy: 'person', decidedAt}). */
  function settle(q, outcome, why = outcome, fact = null) {
    if (!asks.has(q.askId)) return false;
    asks.delete(q.askId);
    if (byPair.get(q.pair) === q.askId) byPair.delete(q.pair);
    settled.set(q.askId, outcome === 'expired' ? 'expired' : 'settled');
    while (settled.size > SETTLED_MAX) settled.delete(settled.keys().next().value);
    try { timers.clear(q.timer); } catch { }
    if (q.todoId && userTodos) { try { const it = userTodos.get?.(q.todoId); const by = outcome === 'expired' ? 'ask-expired' : why === 'gone' ? 'ask-over' : outcome === 'changed' ? 'ask-changed' : outcome; if (it && it.status === 'open') { if (fact && typeof userTodos.resolveAnswered === 'function') userTodos.resolveAnswered([q.todoId], by, fact); else userTodos.setStatus(q.todoId, 'done', by); } } catch { } }
    log(`${q.who}: the run card for \`${q.head}\` ${outcome === 'expired' ? 'got no answer in 60 s' : outcome}`);
    try { q.resolve({ outcome, askId: q.askId }); } catch { }
    return true;
  }
  function ask({ caller, run, shape, key, detail, signal }) {
    const pair = pairOf(caller.conversationId, key);
    if (byPair.has(pair) && asks.has(byPair.get(pair))) return Promise.resolve({ outcome: 'pending', askId: byPair.get(pair) });
    if (signal && signal.aborted) return Promise.resolve({ outcome: 'gone', askId: null });
    return new Promise((resolve) => {
      const askId = randomBytes(16).toString('hex');
      const who = String(caller.name || caller.sessionKey || caller.conversationId).slice(0, 80);
      const q = { askId, pair, conv: caller.conversationId, sessionKey: caller.sessionKey, who, key, always: !!shape.always, detail, entries: run.refs.map((r) => r.id), head: cmdText(run.argv).slice(0, 80), askedAt: now(), todoId: null, timer: null, resolve };
      asks.set(askId, q); byPair.set(pair, askId);
      if (userTodos) {
        try {
          const it = userTodos.add(caller.sessionKey || 'vault', {
            origin: 'vault', urgency: 'urgent', kind: 'action', by: 'agent', sessionName: who, expiresAt: q.askedAt + VR.ASK_TTL_MS,
            text: `${who} wants to run a command with a stored secret`,
            detail,   // THE WHOLE RUN as the owner approves it — the command (references, never a value), the secrets, how, the hosts, the folder
            i18n: { text: { key: '{who} wants to run a command with a stored secret', params: { who } } },
            action: { type: 'vault-run-ask', askId, always: !!shape.always, tool: String(shape.name || '').slice(0, 40) },   // = ACTION_TYPE (spelled for the approval census's grep)
          });
          q.todoId = it && it.id;
        } catch (e) {
          asks.delete(askId); byPair.delete(pair);
          log(`${who}: the run card could not be filed in For you: ${e.message}`);
          resolve({ outcome: 'unfiled', askId: null });
          return;
        }
      }
      q.timer = timers.set(() => settle(q, 'expired', 'timeout'), VR.ASK_TTL_MS);
      q.timer?.unref?.();
      if (signal && typeof signal.addEventListener === 'function') signal.addEventListener('abort', () => settle(q, 'gone', 'gone'), { once: true });
    });
  }
  /** A PERSON's answer (src/routes/vault.js: people only; «always» needs this page's 验证是你 window — `reauthed`). */
  function answer(askId, { answer: a, ttl = VR.ALWAYS_DEFAULT, reauthed = false, by = 'user', person = false } = {}) {
    const id = String(askId || '');
    const q = asks.get(id);
    const mark = () => (person ? { decidedBy: 'person', decidedAt: now() } : null);   // r3: the person verdict's mark (the route's `person`)
    if (!q) return { ok: false, code: settled.get(id) === 'expired' ? 'ask_expired' : settled.has(id) ? 'ask_settled' : 'ask_unknown' };
    if (now() - q.askedAt >= VR.ASK_TTL_MS) { settle(q, 'expired', 'timeout'); return { ok: false, code: 'ask_expired' }; }
    if (!['once', 'always', 'deny'].includes(a)) return { ok: false, code: 'bad_answer' };
    if (a === 'deny') { settle(q, 'denied', 'answered', mark()); return { ok: true, outcome: 'denied' }; }   // `outcome` (the route lays the vault's facts — its `state` — over the answer)
    if (a === 'always' && !q.always) return { ok: false, code: 'always_not_offered' };
    if (a === 'always' && !Object.prototype.hasOwnProperty.call(VR.ALWAYS_TTLS, ttl)) return { ok: false, code: 'bad_answer' };
    if (a === 'always' && !reauthed) return { ok: false, code: 'reveal_needs_password' };
    if (vaultState() !== 'unlocked') { settle(q, 'vault_locked'); return { ok: false, code: 'vault_locked' }; }
    // THE BELT (approval census b): an allow is for what the owner was SHOWN — the item still open, still this ask's, its detail the very text
    if (q.todoId && userTodos && typeof userTodos.get === 'function') {
      let it = null; try { it = userTodos.get(q.todoId); } catch { }
      const shown = !!(it && it.status === 'open' && it.action && it.action.type === ACTION_TYPE && it.action.askId === q.askId && String(it.detail || '') === q.detail);
      if (!shown) { settle(q, 'changed', 'item-changed'); return { ok: false, code: 'ask_changed' }; }
    }
    if (!liveOf(q.conv)) { settle(q, 'denied', 'gone'); return { ok: false, code: 'conversation_gone' }; }
    if (a === 'always') {
      const ms = VR.ALWAYS_TTLS[ttl], until = ms == null ? null : now() + ms;
      if (ttl === '8h') shortAlways.set(q.pair, { until, entries: q.entries });
      else {
        const d = load();
        if (!d) { settle(q, 'vault_locked'); return { ok: false, code: 'vault_locked' }; }
        const r = save({ runnable: d.runnable, always: [...d.always.filter((x) => !(x.conv === q.conv && x.key === q.key)), { conv: q.conv, key: q.key, until, entries: q.entries, at: now(), by: String(by).slice(0, 40) }] });
        if (!r.ok) { settle(q, 'denied', r.code); return r; }
      }
      audit('vault-run-always', { by: String(by).slice(0, 40), conv: q.conv, shapeId: shapeIdOf(q.key), ttl, until });
    }
    seen.set(q.pair, { at: now(), entries: q.entries });
    settle(q, a === 'always' ? 'always' : 'allowed', 'answered', mark());
    return { ok: true, outcome: a === 'always' ? 'always' : 'allowed', ...(a === 'always' ? { ttl } : {}) };
  }
  // THE ITEM AND THE ASK ARE ONE STATE: the item leaving 'open' by another door settles the ask refused; a reopen of an ask that is over goes back to done
  if (userTodos && typeof userTodos.onStatus === 'function') {
    userTodos.onStatus((it, { status, by }) => {
      if (!it || !it.action || (it.action.type !== ACTION_TYPE && it.action.type !== REQUEST_TYPE)) return;
      const req = it.action.type === REQUEST_TYPE;
      const q = (req ? requests : asks).get(String(it.action.askId || ''));
      if (status === 'open') { if (!q) { try { userTodos.setStatus(it.id, 'done', 'ask-over'); } catch { } } return; }
      if (req) { if (q && q.todoId === it.id) settleRequest(q, 'denied', `item-${String(status)}-by-${String(by || 'user')}`); return; }   // a request's card closed elsewhere = not granted
      if (!q || q.todoId !== it.id) return;
      settle(q, by === 'expired' ? 'expired' : 'denied', by === 'expired' ? 'timeout' : `item-${String(status)}-by-${String(by || 'user')}`);
    });
  }
  /** Boot: a card a previous process filed can never be answered (the run it held died with it). */
  function reconcile() {
    if (!userTodos) return 0;
    let n = 0;
    try { for (const it of (userTodos.snapshot?.() || {}).open || []) if (it && it.action && ((it.action.type === ACTION_TYPE && !asks.has(it.action.askId)) || (it.action.type === REQUEST_TYPE && !requests.has(it.action.askId)))) { try { userTodos.setStatus(it.id, 'done', it.action.type === REQUEST_TYPE ? 'vault_locked' : 'ask-expired'); n++; } catch { } } } catch (e) { log(`run card reconcile failed: ${e.message}`); }
    try { for (const it of (userTodos.snapshot?.() || {}).open || []) if (it && it.sessionKey === VAULT_INBOX_KEY && !it.action && it.text === ASKING_TEXT && it.id !== asking.id) userTodos.setStatus(it.id, 'done', 'vault'); } catch { }   // B-4934: a previous process's «N are asking» (its requests died with it)
    return n;
  }
  const shapeIdOf = (key) => crypto.createHash('sha256').update(String(key)).digest('hex').slice(0, 16);

  // ── THE REQUEST AND ITS GRANT (lane vault-manual-and-lock — design q-043 D4: `vibespace-vault request <entry> --for "<why>"`) ──
  /** THIS conversation as the use law spells it (its `conv` — the session's registered id; a mint's scope) — the run's own
   *  card / «always» keep the conversation id they always had. */
  const scopeOf = (caller) => String((caller && (caller.scope || caller.conversationId)) || '');
  /** A live grant of `id` to `scope` — or null (an expired one goes). */
  function grantOf(scope, id) {
    const p = pairOf(scope, id), g = grants.get(p);
    if (!g) return null;
    if (!(g.until > now())) { grants.delete(p); return null; }
    return g;
  }
  const requestWords = (r) => [
    { key: 'Secret: {label} — {ref}', params: { label: r.label, ref: r.ref } },
    { key: 'What for, in the agent\'s words: {purpose}', params: { purpose: r.purpose } },
    { key: 'Allow once: its next run with this secret (within 8 hours). For 8 hours: every run with it. Both ask for the second password, as «Usable by agent runs» does; a new kind of command still shows you its card first, and locking the vault ends the grant.' },
    { key: 'To let every conversation use it, turn on «Usable by agent runs» on its row in ⚙ System ▸ Vault….' },
  ];
  const fill = (l) => l.key.replace(/\{(\w+)\}/g, (m, k) => (l.params && l.params[k] != null ? String(l.params[k]) : m));
  /** `fact` (r4): the PERSON's mark — the answer came through THE person verdict (src/routes/vault.js `person`), so the item's
   *  record says «allowed by you for 8 h · 09:41» (resolvedFact {decidedBy: 'person', decidedAt}). */
  function settleRequest(q, outcome, why = outcome, fact = null) {
    if (!requests.has(q.askId)) return false;
    requests.delete(q.askId);
    if (reqByPair.get(q.pair) === q.askId) reqByPair.delete(q.pair);
    settled.set(q.askId, 'settled');
    while (settled.size > SETTLED_MAX) settled.delete(settled.keys().next().value);
    if (q.todoId && userTodos) { try { const it = userTodos.get?.(q.todoId); const by = outcome === 'vault_locked' ? 'vault_locked' : outcome === 'changed' ? 'ask-changed' : outcome; if (it && it.status === 'open') { if (fact && typeof userTodos.resolveAnswered === 'function') userTodos.resolveAnswered([q.todoId], by, fact); else userTodos.setStatus(q.todoId, 'done', by); } } catch { } }
    if (outcome === 'denied') { reqQuiet.set(q.pair, now() + REQUEST_QUIET_MS); for (const [p, u] of reqQuiet) if (!(u > now())) reqQuiet.delete(p); }
    log(`${q.who}: the request for ${q.ref} ${outcome}${why !== outcome ? ` (${why})` : ''}`);
    askingLine();
    return true;
  }
  /** B-4934: the owner's tray says how many conversations hold open requests once there are more than 8 — ONE Vault notice,
   *  re-worded in place as the count moves (its English text is the store's dedupe key; N rides its words), closed at 8 or
   *  fewer. Set aside by the owner, it stays quiet until the count falls to 8 or fewer. */
  function askingLine() {
    if (!userTodos || asking.batch) return;
    const n = new Set([...requests.values()].map((x) => x.scope)).size;
    const it = asking.id ? (() => { try { return userTodos.get(asking.id); } catch { return null; } })() : null;
    if (n <= ASKING_LINE_OVER) {
      if (it && it.status === 'open') { try { userTodos.setStatus(it.id, 'done', 'vault'); } catch { } }
      asking = { id: null, n: 0, quiet: false, batch: false };
      return;
    }
    if (it && it.status !== 'open' && it.resolvedBy !== 'vault') asking.quiet = true;   // dismissed / done by a person
    if (asking.quiet || (it && it.status === 'open' && asking.n === n)) return;
    try {
      const r = userTodos.add(VAULT_INBOX_KEY, { origin: 'vault', kind: 'notice', urgency: 'normal', by: 'agent', sessionName: 'Vault', text: ASKING_TEXT,
        detail: ASKING_DETAIL, i18n: { text: { key: ASKING_KEY, params: { n } }, detail: [{ key: ASKING_DETAIL }] } });
      if (r && r.id) asking = { ...asking, id: r.id, n };
    } catch (e) { log(`the «${n} conversations are asking» line could not be filed: ${e.message}`); }
  }
  /**
   * An AGENT asks the owner for an entry, with its purpose. `caller` as `run` reads it; `entry` = a `vault://` reference;
   * `purpose` = one line. → { ok: true, askId } (ONE For-you ask filed — nothing waits on it) | { ok: true, already: 'open' |
   * 'granted', … } | a named refusal.
   */
  function request({ caller = {}, entry = '', purpose = '' } = {}) {
    if (caller.job) return named('job_no_use');
    const scope = scopeOf(caller);
    if (!scope || !caller.conversationId) return named('unauthorized');
    const st = vaultState();
    if (st === 'not_set_up') return named('vault_not_set_up');
    if (st !== 'unlocked') { try { vault.blocked(VB.actorName(caller.name, 'a conversation'), 'vibespace-vault request'); } catch { } return named('vault_locked'); }
    if (caller.remote) return named('device_road_later');
    const raw = String(entry == null ? '' : entry).trim(), why0 = String(purpose == null ? '' : purpose);
    if (raw.length > 1024 || why0.length > 4 * PURPOSE_MAX) return named('request_too_large');
    if (HC.hiddenCharsOf(raw, { max: 1 }).length || HC.hiddenCharsOf(why0, { max: 1 }).length) return named('hidden_chars');
    const ref = VR.parseRef(raw);
    if (!ref) return named('bad_reference');
    const why = why0.replace(/\s+/g, ' ').trim();
    if (!why) return named('purpose_required');
    if (why.length > PURPOSE_MAX) return named('purpose_too_long');
    const said = SS.redactSecrets(why).text;   // the purpose lands in the owner's tray and the audit: a value pasted into it is «redacted»
    const row = rowOf(ref), c = classOf(ref, row);
    if (!c.runnable) return named('entry_has_its_own_door', { ref: ref.ref, door: c.door, words: `${VR.WORDS.entry_has_its_own_door}: ${c.door}` });
    if (!row) return named('entry_unknown', { ref: ref.ref });
    const sc = VR.agentScopeOf(ref);
    if (sc && sc !== scope && sc !== caller.conversationId) return named('use_not_granted', { ref: ref.ref });   // another conversation's own entry is its own
    const pair = pairOf(scope, ref.id);
    const g = grantOf(scope, ref.id);
    if (g) return { ok: true, already: 'granted', ref: ref.ref, once: g.once, until: g.until };
    const d = load();
    if (d && d.runnable.has(ref.id)) return { ok: true, already: 'open', ref: ref.ref };
    const up = reqByPair.get(pair);
    if (up && requests.has(up)) return named('request_pending', { ref: ref.ref });
    const qu = reqQuiet.get(pair);
    if (qu && qu > now()) return named('request_quiet', { ref: ref.ref, until: new Date(qu).toISOString() });
    const askers = new Set([...requests.values()].map((x) => x.scope));
    if ([...requests.values()].filter((x) => x.scope === scope).length >= REQUESTS_PER_CALLER) return named('too_many_requests');
    if (!askers.has(scope) && askers.size >= REQUEST_CALLERS_MAX) return named('too_many_askers');   // B-4934: a conversation already asking is never refused for others' asks
    const askId = randomBytes(16).toString('hex');
    const who = String(VB.actorName(caller.name, 'a conversation')).slice(0, 80);
    const q = { askId, pair, scope, conv: caller.conversationId, sessionKey: caller.sessionKey || null, who, ref: ref.ref, id: ref.id, label: String(row.label || ref.label).slice(0, 120), purpose: said, detail: '', askedAt: now(), todoId: null };
    const lines = requestWords(q);
    q.detail = lines.map(fill).join('\n');
    if (q.detail.length > DETAIL_MAX) return named('card_too_long');
    if (userTodos) {
      try {
        const it = userTodos.add(caller.sessionKey || 'vault', {
          origin: 'vault', urgency: 'high', kind: 'action', by: 'agent', sessionName: who,   // NO expiresAt: a request waits for the owner (design D4 — never expires; a lock withdraws it)
          text: `${who} asks to use a stored secret`,
          detail: q.detail,
          i18n: { text: { key: '{who} asks to use a stored secret', params: { who } }, detail: lines },
          action: { type: 'vault-grant-ask', askId },   // = REQUEST_TYPE (spelled for the approval census's grep)
        });
        q.todoId = it && it.id;
      } catch (e) {
        log(`${who}: the request could not be filed in For you: ${e.message}`);
        return named('ask_unfiled');
      }
    }
    requests.set(askId, q); reqByPair.set(pair, askId);
    askingLine();
    audit('vault-request', { by: { kind: 'agent', key: caller.sessionKey || null, name: caller.name || null }, conv: scope, entry: ref.ref, purpose: said, askId });
    return { ok: true, askId, ref: ref.ref, todoId: q.todoId || null };   // lane chat-needs-you-card: the item the agent's line names
  }
  /** A PERSON's answer to a request (src/routes/vault.js: people only): once | 8h | deny → the grant row. A grant opens a
   *  closed entry for a conversation — the per-row switch's job — so it needs the switch's 验证是你 (`reauthed`: this page's
   *  window, the second password again; the review: a click alone is a header a local process can forge on a hub with no
   *  sign-in); Deny stays a click. */
  function answerRequest(askId, { answer: a, reauthed = false, by = 'user', person = false } = {}) {
    const id = String(askId || '');
    const q = requests.get(id);
    if (!q) return { ok: false, code: settled.has(id) ? 'ask_settled' : 'ask_unknown' };
    if (!GRANT_ANSWERS.includes(a)) return { ok: false, code: 'bad_grant_answer' };
    const said = { by: String(by).slice(0, 40), conv: q.scope, entry: q.ref, askId: q.askId };
    const mark = () => (person ? { decidedBy: 'person', decidedAt: now() } : null);   // r4: the person verdict's mark (the route's `person`)
    if (a === 'deny') { settleRequest(q, 'denied', 'answered', mark()); audit('vault-grant', { ...said, answer: 'deny' }); return { ok: true, outcome: 'denied' }; }
    if (vaultState() !== 'unlocked') { settleRequest(q, 'vault_locked'); return { ok: false, code: 'vault_locked' }; }
    if (!reauthed) return { ok: false, code: 'reveal_needs_password' };   // the card stays up
    // THE BELT (as the run card's): a grant is for what the owner was SHOWN — the item still open, this request's, its very detail
    if (q.todoId && userTodos && typeof userTodos.get === 'function') {
      let it = null; try { it = userTodos.get(q.todoId); } catch { }
      const shown = !!(it && it.status === 'open' && it.action && it.action.type === REQUEST_TYPE && it.action.askId === q.askId && String(it.detail || '') === q.detail);
      if (!shown) { settleRequest(q, 'changed', 'item-changed'); return { ok: false, code: 'ask_changed' }; }
    }
    if (!liveOf(q.conv)) { settleRequest(q, 'denied', 'gone'); return { ok: false, code: 'conversation_gone' }; }
    const ref = VR.parseRef(q.ref), row = ref && rowOf(ref);
    if (!row) { settleRequest(q, 'denied', 'entry gone'); return { ok: false, code: 'entry_unknown' }; }
    if (!classOf(ref, row).runnable) { settleRequest(q, 'denied', 'its own door'); return { ok: false, code: 'entry_has_its_own_door' }; }
    const t = now(), until = t + GRANT_MS;
    grants.set(q.pair, { conv: q.scope, key: null, entries: [q.id], until, once: a === 'once', at: t, by: said.by, askId: q.askId, purpose: q.purpose });
    audit('vault-grant', { ...said, answer: a, until });
    // r4: the item says which of its verbs; r5 (主开发: «a record says only what was decided»): each verb its OWN value —
    // `granted-8h` carries the duration (a record from before .360 stored `granted` for BOTH verbs: it reads «allowed»)
    const end = a === 'once' ? 'granted-once' : 'granted-8h';
    settleRequest(q, end, 'answered', mark());
    return { ok: true, outcome: end, until };
  }
  /** lane vault-paste-request: THE PASTE IS THE GRANT — the owner pasted a NEW free entry into For you in answer to THIS
   *  conversation's request (its purpose on the card, src/server/vault-paste-door.js): the conversation may use that one
   *  entry in runs for GRANT_MS (a lock ends it; each new command shape still draws its run card). No 验证是你: the entry did
   *  not exist before the paste — a press forged on a hub with no sign-in grants only the value it supplied itself, never a
   *  secret the owner had stored. → { ok, until, hours } | a named refusal. */
  function grantPasted({ scope = '', ref = '', purpose = '', by = 'user', requestId = null } = {}) {
    const r = VR.parseRef(String(ref || ''));
    if (!scope || !r || !VR.isFreeEntry(r.store, r.entry, r.field)) return named('bad_reference');
    if (vaultState() !== 'unlocked') return named('vault_locked');
    const t = now(), until = t + GRANT_MS;
    grants.set(pairOf(String(scope), r.id), { conv: String(scope), key: null, entries: [r.id], until, once: false, at: t, by: String(by).slice(0, 40), askId: null, purpose: String(purpose || '').slice(0, PURPOSE_MAX) });
    audit('vault-grant', { by: String(by).slice(0, 40), conv: String(scope), entry: r.ref, answer: 'pasted', requestId, until });
    return { ok: true, until, hours: GRANT_MS / 3600e3 };
  }
  /** `vibespace-vault uses` (design D4): THIS conversation's grants, its open requests and its own use lines (the engine reads
   *  the audit file's tail) — references, purposes, times, outcomes, receipts; never a value, never another conversation's. */
  function usesFor(caller = {}) {
    if (caller.job) return named('job_no_use');
    const scope = scopeOf(caller);
    if (!scope) return named('unauthorized');
    const t = now(), mine = [];
    for (const [p, g] of grants) { if (!(g.until > t)) { grants.delete(p); continue; } if (g.conv === scope) mine.push(g); }
    const refOfId = (id) => { const r = VI.parseRef(id); const x = r && VR.refFor(r.store, r.entry, r.field); return x ? x.ref : null; };
    return {
      ok: true,
      state: vaultState(),
      grants: mine.map((g) => ({ entry: refOfId(g.entries[0]), purpose: g.purpose, once: g.once, until: new Date(g.until).toISOString(), at: new Date(g.at).toISOString() })),
      requests: [...requests.values()].filter((q) => q.scope === scope).map((q) => ({ entry: q.ref, purpose: q.purpose, at: new Date(q.askedAt).toISOString() })),
      uses: typeof vault.usesOf === 'function' ? vault.usesOf(scope) : [],
    };
  }

  // ── THE PLACE: the cwd fence, argv[0] on the base PATH, a template's text ──
  const BV = () => require('../browser-verbs.js');
  const physOps = { lstat: (x) => fs.lstatSync(x), readlink: (x) => fs.readlinkSync(x) };
  const spell = (d) => { let x = null; try { x = fs.realpathSync(d); } catch { x = null; } return x && x !== d ? [d, x] : [d]; };
  /** `p` (absolute, physical) inside the conversation's project folder / the temp folder / ~/Downloads, outside what the
   *  browser CLI's write rule refuses (.ssh, .git, VibeSpace's data, a home's dot-entries) — → the physical path | null. */
  function fenced(p, sessionCwd) {
    if (typeof p !== 'string' || p[0] !== '/' || DOOR.blocked(p)) return null;
    const b = BV();
    const r = b.physicalPath(p, { base: '/', home, ...physOps });
    if (!r.ok) return null;
    const root = typeof sessionCwd === 'string' && sessionCwd[0] === '/' ? b.physicalPath(sessionCwd, { base: '/', home, ...physOps }) : null;
    const v = b.writePathVerdict([{ file: p, paths: path.resolve(p) === r.path ? [r.path] : [path.resolve(p), r.path] }], {
      allow: [tmpDir, path.join(home, 'Downloads')].flatMap(spell), homes: spell(home), dataDir: spell(dataDir), sessionRoot: root && root.ok ? root.path : null });
    return v ? null : r.path;
  }
  /** argv[0] → its real path: a name with a slash from the cwd, a bare name on the base env's PATH (absolute entries only). */
  function resolveTool(argv0, cwd, env) {
    const x = String(argv0 || '');
    const isExe = (p) => { try { const st = fs.statSync(p); if (!st.isFile()) return false; fs.accessSync(p, fs.constants.X_OK); return true; } catch { return false; } };
    let hit = null;
    if (x.includes('/')) { const p = path.resolve(cwd, x); if (!DOOR.blocked(p) && isExe(p)) hit = p; }
    else for (const d of String((env && env.PATH) || '').split(':')) { if (!d || d[0] !== '/' || DOOR.blocked(d)) continue; const p = path.join(d, x); if (isExe(p)) { hit = p; break; } }
    if (!hit) return null;
    try { return fs.realpathSync(hit); } catch { return null; }
  }
  /** The templates a `--file NAME=@path` names: read inside the fence, a regular file, ≤ TEMPLATE_MAX. → { ok, templates } | refusal. */
  function readTemplates(req, cwd, sessionCwd) {
    const out = {};
    for (const [, v] of req.file || []) {
      if (!String(v).startsWith('@')) continue;
      const p = String(v).slice(1);
      if (!p || Object.prototype.hasOwnProperty.call(out, p)) continue;
      if (DOOR.blocked(path.resolve(cwd, p))) return named('storage_blocked', { template: p });
      const abs = fenced(path.resolve(cwd, p), sessionCwd);
      if (!abs) return named('template_refused', { template: p });
      try { out[p] = readBounded(abs, VR.TEMPLATE_MAX).toString('utf8'); }   // one fd: never through a link swapped in, never a FIFO's wait
      catch (e) { return named(e && e.code === 'EFBIG' ? 'template_too_long' : e && (e.code === 'ENOTREG' || e.code === 'ELOOP' || e.code === 'ENOENT') ? 'template_refused' : 'template_unread', { template: p }); }
    }
    return { ok: true, templates: out };
  }

  // ── THE CARD'S WORDS (the whole run, deterministic: the belt compares it) ──
  function detailOf(run, shape, cwd) {
    const L = [cmdText(run.argv), ''];
    L.push(`Program: ${run.tool}${run.programWritable ? ' — in a folder an agent can write' : ''}`);   // the review: the typed name is not what runs
    L.push(`Secrets: ${run.refs.map((r) => r.ref).join(', ')}`);
    L.push(`Given as: ${run.injection.join(', ')}`);
    if (run.argvExposed) L.push('ON THE COMMAND LINE: every user of this machine can read it while it runs (/proc/<pid>/cmdline)');
    L.push(`Hosts: ${shape.hosts.length ? shape.hosts.join(', ') : 'unknown — the tool names none'}`);
    if (run.plainEnv.length) L.push(`Env: ${run.plainEnv.map((e) => `${e.name}=${quote(e.value)}`).join(' ')}`);
    L.push(`Folder: ${cwd}`);
    for (const f of run.files) if (f.template != null) L.push(`Template ${f.name} (@${f.template}):`, String(f.text).replace(/\s+$/, ''));
    L.push(`This shape = ${shape.kind === 'tool' ? 'the tool + its flags + the hosts + the secrets; positional arguments may change' : 'this whole command line'}.`);
    if (!shape.always) L.push(`«Always» is not offered: ${NO_ALWAYS[shape.noAlways] || shape.noAlways}.`);
    return L.join('\n').trim();
  }

  // ── THE RUN ──
  const callerRuns = (conv) => [...runs].filter((r) => r.conv === conv).length;
  function killGroup(rec, sig) {
    const child = rec.child;   // THIS process's own spawn handle — its group (spawned detached) ends with it
    if (!child || !child.pid) return;
    try { process.kill(-child.pid, sig); } catch { try { child.kill(sig); } catch { } }
  }
  function stop(rec, why) {
    if (rec.stopped) return;
    rec.stopped = why;
    killGroup(rec, 'SIGTERM');
    rec.hard = timers.set(() => killGroup(rec, 'SIGKILL'), killGraceMs);
    rec.hard?.unref?.();
  }
  /**
   * ONE run. `caller` = { conversationId, sessionKey, name, cwd (the conversation's project folder), remote, job };
   * `args` = the CLI's words after `run`; `cwd` = where the agent stood. → { ok: true, exit, signal, timedOut, truncated, ms,
   * stdout, stderr, scrubbed, redacted, by } | { ok: false, code, words, … }.
   */
  async function run({ caller = {}, args = [], cwd = null, signal = null } = {}) {
    const t0 = now();
    const by = { kind: caller.job ? 'job' : 'agent', key: caller.sessionKey || null, name: caller.name || null };
    const scope = scopeOf(caller);
    const runReceipt = `vr-${randomBytes(8).toString('hex')}`;   // ONE receipt per run: the answer of a run that ran, its run line and every entry's use line (a refusal's lines carry it too — the audit's)
    let usedRefs = null;           // the plan's references, once it parsed — each one's use line (lane vault-manual-and-lock)
    const purposes = new Map();    // entry id → the purpose of the grant that opened it
    const useLines = (outcome, receipt, ran = false) => {
      if (!usedRefs || (USE_SKIP.has(outcome) && !ran) || typeof vault.noteUse !== 'function') return;   // a child that RAN with the value is a use whatever ended it
      for (const r of usedRefs) { try { vault.noteUse(r.ref, { by: by.kind, door: 'run', conv: scope }, { outcome: outcome === 'ran' ? 'ok' : outcome, purpose: purposes.get(r.id) || null, actor: VB.actorName(caller.name, 'a conversation'), receipt, store: r.store, used: ran }); } catch { } }
    };
    const note = (outcome, extra = {}) => { audit('vault-run', { by, outcome, ...extra }); useLines(outcome, runReceipt, !!extra.receipt); };   // ONE line: the actor, the outcome (ran | the refusal's code), the facts — never a value; + each entry's use line
    if (caller.job) { note('job_no_use'); return named('job_no_use'); }
    if (!caller.conversationId) return named('unauthorized');
    const st = vaultState();
    if (st === 'not_set_up') return named('vault_not_set_up');
    if (st !== 'unlocked') { try { vault.blocked(VB.actorName(caller.name, 'a conversation'), 'vibespace-vault run'); } catch { } note('vault_locked'); return named('vault_locked'); }
    if (!Array.isArray(args) || args.reduce((n, x) => n + String(x).length, 0) > ARGS_MAX || String(cwd || '').length > CWD_MAX) return named('request_too_large');
    const pr = VR.parseRunArgs(args);
    if (!pr.ok) return pr;
    const req = pr.req;
    if (caller.remote || req.on) { note('device_road_later'); return named('device_road_later'); }
    const all = [...req.argv, ...(req.env || []).flat(), ...(req.file || []).flat(), req.stdin || '', String(cwd || '')];   // the cwd too: the card prints it
    if (all.some((x) => HC.hiddenCharsOf(String(x), { max: 1 }).length)) return named('hidden_chars');
    if (cwd && DOOR.blocked(String(cwd))) { note('storage_blocked'); return named('storage_blocked'); }
    const place = fenced(String(cwd || ''), caller.cwd);
    if (!place) { note('cwd_refused', { cwd: String(cwd || '').slice(0, 300) }); return named('cwd_refused'); }
    const base = agentEnv();
    const resolved = req.argv.length ? resolveTool(req.argv[0], place, base) : null;
    if (req.argv.length && !resolved) {
      const early = VR.refusedTool(req.argv[0]);   // a refused name is refused by name even when it is not installed here
      return early || named('tool_not_found', { tool: VR.toolNameOf(req.argv[0]) });
    }
    const tp = readTemplates(req, place, caller.cwd);
    if (!tp.ok) return tp;
    if (Object.values(tp.templates).some((t) => HC.hiddenCharsOf(t, { allowCR: true, max: 1 }).length)) return named('hidden_chars');
    const writable = (p) => { try { fs.accessSync(p, fs.constants.W_OK); return true; } catch { return false; } };
    const programWritable = !!resolved && (writable(resolved) || writable(path.dirname(resolved)));   // an agent (the same uid) could have written it
    const spec = VR.planOf({ ...req, resolved, templates: tp.templates, programWritable });
    if (!spec.ok) { note(spec.code, { tool: resolved, why: spec.why || null }); return spec; }
    usedRefs = spec.refs;
    const shape = VR.shapeOf(spec), key = VR.shapeKeyOf(shape), shapeId = shapeIdOf(key);
    const detail = detailOf(spec, shape, place);
    if (detail.length > DETAIL_MAX) return named('card_too_long');
    const head = { tool: spec.tool, entries: spec.refs.map((r) => r.ref), shapeId, hosts: shape.hosts, injection: spec.injection, argvExposed: spec.argvExposed, cwd: place, cmd: utf8Head(SS.redactSecrets(cmdText(spec.argv)).text) };
    // THE FACTS the verdict reads: each entry's row (exists), its switch (open), its class (the engine's check) and its length
    const d = load();
    const entries = [];
    const admitted = [];   // a GRANT that opened a closed entry (lane vault-manual-and-lock) — a once-grant is spent before the run starts
    for (const r of spec.refs) {
      const row = rowOf(r), c = classOf(r, row);
      if (!c.runnable) { note('entry_has_its_own_door', { ...head, ref: r.ref }); return named('entry_has_its_own_door', { ref: r.ref, door: c.door, words: `${VR.WORDS.entry_has_its_own_door}: ${c.door}` }); }
      const sw = !!(row && d && d.runnable.has(r.id)), g = row ? grantOf(scope, r.id) : null;
      if (g) purposes.set(r.id, g.purpose);
      if (g && !sw) admitted.push({ pair: pairOf(scope, r.id), g });
      const open = sw || !!g;   // the owner's switch (every conversation) OR the grant his answer wrote (this one)
      let bytes = 0;
      if (row && open) { try { const v = valueOf(r); bytes = v == null ? 0 : Buffer.byteLength(v, 'utf8'); } catch { bytes = 0; } }
      entries.push({ id: r.id, exists: !!row, open, bytes });
    }
    const pair = pairOf(caller.conversationId, key);
    const stored = d ? d.always.find((a) => a.conv === caller.conversationId && a.key === key) : null;
    const short = shortAlways.get(pair);
    const remembered = stored && (stored.until == null || stored.until > now()) ? stored : short && short.until > now() ? { until: short.until } : null;
    // granted: P0 has no who-may-use list — the owner's per-row switch and the card ARE the grant (P1 vault-use-reach narrows it
    // to whom); an AGENT's own entry (`agent:<scope>/<name>`) is its conversation's only
    const granted = spec.refs.every((r) => { const sc = VR.agentScopeOf(r); return !sc || sc === scope || sc === caller.conversationId; });   // a mint's scope is the use law's conv (lane vault-mint-put)
    let verdict = VR.runVerdict({ state: vaultState(), plan: spec, shape, entries, granted, remembered, seen: seen.has(pair), instance: instanceKind(), policy: policy(), now: now() });
    let askId = null, asked = null;
    if (!verdict.ok && verdict.ask) {
      if (callerRuns(caller.conversationId) >= RUNS_PER_CALLER || runs.size >= RUNS_MAX) return named('too_many_runs');
      const a = await ask({ caller, run: spec, shape, key, detail, signal });
      asked = a.outcome; askId = a.askId;
      if (asked === 'pending') { note('ask_pending', { ...head, askId }); return named('ask_pending'); }
      const outcome = { gone: 'caller_gone', unfiled: 'ask_unfiled', denied: 'ask_denied', expired: 'ask_expired', changed: 'ask_changed', vault_locked: 'vault_locked' }[asked];
      if (outcome) { note(outcome, { ...head, askId }); return named(outcome); }
      // allowed / always — the verdict AGAIN over the facts as they stand NOW (a lock, a switch closed while the card waited)
      const d2 = load();
      const again = spec.refs.map((r) => { const row = rowOf(r); return { id: r.id, exists: !!row, open: !!(row && ((d2 && d2.runnable.has(r.id)) || grantOf(scope, r.id))), bytes: entries.find((e) => e.id === r.id).bytes }; });
      verdict = VR.runVerdict({ state: vaultState(), plan: spec, shape, entries: again, granted, remembered: { until: null }, seen: true, instance: instanceKind(), policy: 'allow', now: now() });
      if (verdict.ok) verdict = { ok: true, by: asked === 'always' ? 'always' : 'once' };
    }
    if (!verdict.ok) { if (verdict.code === 'vault_locked') { try { vault.blocked(VB.actorName(caller.name, 'a conversation'), 'vibespace-vault run'); } catch { } } note(verdict.code, { ...head, askId }); return verdict; }
    if (signal && signal.aborted) { note('caller_gone', head); return named('caller_gone'); }
    if (callerRuns(caller.conversationId) >= RUNS_PER_CALLER || runs.size >= RUNS_MAX) return named('too_many_runs');
    // A ONCE-GRANT IS SPENT BEFORE THE RUN (a grant never runs twice): still the very row the verdict read — a lock, the switch
    // or another run of this conversation took it meanwhile ⇒ nothing runs
    const spent = [];
    for (const a of admitted) {
      if (grants.get(a.pair) !== a.g || !(a.g.until > now())) { note('use_not_granted', head); return named('use_not_granted'); }
      if (a.g.once) spent.push(a);
    }
    for (const a of spent) grants.delete(a.pair);
    // L3 (int331): a once-grant is spent only when a child RAN — restore it when nothing ran (entry_unknown / too-short / spawn_failed,
    // sync or the async spawn error) so a failure before the child does not burn the owner's one-time grant (the agent runs it again)
    const BURNED = new Set(['entry_unknown', 'entry_too_short_to_mask', 'spawn_failed']);
    const restoreOnce = (r) => { if (r && r.ok === false && BURNED.has(r.code)) for (const a of spent) if (a.g.until > now()) grants.set(a.pair, a.g); return r; };
    const out = spawnRun({ caller, spec, shape, head, verdict, askId, place, base, signal, t0, note, receipt: runReceipt });
    return out && typeof out.then === 'function' ? out.then(restoreOnce) : restoreOnce(out);
  }

  function spawnRun({ caller, spec, head, verdict, askId, place, base, signal, t0, note, receipt }) {
    // THE VALUES — read now, held in this closure only for the spawn and the scrubbers; never stored, never logged
    let values = new Map();
    for (const r of spec.refs) {
      let v = null;
      try { v = valueOf(r); } catch (e) { note('entry_unknown', { ...head, ref: r.ref, why: String((e && e.code) || 'unreadable').slice(0, 60) }); return named('entry_unknown', { ref: r.ref }); }
      if (v == null) { note('entry_unknown', { ...head, ref: r.ref }); return named('entry_unknown', { ref: r.ref }); }
      if (Buffer.byteLength(v, 'utf8') < VR.MIN_MASK_BYTES) { note('entry_too_short_to_mask', { ...head, ref: r.ref }); return named('entry_too_short_to_mask', { ref: r.ref }); }
      values.set(r.ref, v);
    }
    const secrets = spec.refs.map((r) => ({ ref: r, value: values.get(r.ref) }));
    let scrub;
    try { scrub = VR.createRunMasker(secrets, ['out', 'err']); }   // ONE per run, both pipes in arrival order (one window); BEFORE any file holds a value (the review: a throw here leaked the folder)
    catch (e) { values = null; note('spawn_failed', { ...head, why: `the scrubber (${(e && e.code) || 'error'})` }); return named('spawn_failed', { why: 'the scrubber could not be built' }); }
    let dir = null;
    try {
      dir = fs.mkdtempSync(path.join(runRoot(), RUN_DIR_PREFIX)); fs.chmodSync(dir, 0o700);
      const ofd = fs.openSync(path.join(dir, OWNER_FILE), fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | (fs.constants.O_NOFOLLOW || 0), 0o600);
      try { fs.writeSync(ofd, JSON.stringify(hubIdentity || { pid: process.pid })); } finally { fs.closeSync(ofd); }
    } catch (e) { if (dir) shredDir(dir); values = null; note('spawn_failed', { ...head, why: `the run directory (${e.code || e.message})` }); return named('spawn_failed', { why: 'the run directory could not be made' }); }
    const mark = path.basename(dir);
    const m = VR.materialize(spec, { valueOf: (ref) => values.get(ref), pathOf: (slot) => path.join(dir, `f${slot}`) });
    try {
      for (const f of m.files) {
        const fd = fs.openSync(f.path, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | (fs.constants.O_NOFOLLOW || 0), 0o600);
        try { fs.writeSync(fd, f.content); } finally { fs.closeSync(fd); }
      }
    } catch (e) { shredDir(dir); values = null; note('spawn_failed', { ...head, why: `a run file (${e.code || e.message})` }); return named('spawn_failed', { why: 'a run file could not be written' }); }
    return new Promise((resolve) => {
      const rec = { conv: caller.conversationId, name: caller.name || null, child: null, stopped: null, hard: null, timer: null, dir, mark, piped: false };
      const dec = { out: new StringDecoder('utf8'), err: new StringDecoder('utf8') };
      const parts = { out: [], err: [] };
      const handOn = (o) => { parts.out.push(o.out); parts.err.push(o.err); };   // what the run's scrubber hands on, each to the stream it came on
      let got = 0, truncated = false, done = false, spawnError = null;
      const take = (k, buf) => {
        if (truncated) return;
        let b = buf;
        if (got + b.length > VR.OUTPUT_MAX_BYTES) { b = b.subarray(0, VR.OUTPUT_MAX_BYTES - got); truncated = true; }
        got += b.length;
        const text = dec[k].write(b);
        if (text) handOn(scrub.push(k, text));
      };
      const finish = (code, sig) => {
        if (done) return;
        done = true;
        runs.delete(rec);
        try { timers.clear(rec.timer); } catch { }
        try { timers.clear(rec.hard); } catch { }
        // THE RUN ENDS WHOLE: its group's leftovers (a backgrounded `cmd &`) and every process still carrying its mark (setsid,
        // a double fork) hold the value in their environ — they end with it (the review: they outlived a lock)
        killGroup(rec, 'SIGKILL');
        const strays = endMarked(mark);
        shredDir(dir);
        // A CUT STREAM (the 2 MiB bound, a timeout, a lock, the caller gone) keeps its held tail BACK for good: a value that
        // began in the last (longest form − 1) characters may be only half there — flushed, its half would pass unscrubbed
        const cut = truncated || !!rec.stopped || rec.piped;   // + the pipes cut 2 s after the child's exit (the review)
        for (const k of ['out', 'err']) handOn(scrub.push(k, dec[k].end()));
        if (!cut) handOn(scrub.end());
        values = null;
        const ms = now() - t0;
        const outT = redactLong(parts.out.join('')), errT = redactLong(parts.err.join(''));
        const scrubbed = { hits: scrub.hits, bytes: scrub.bytes, byForm: Object.fromEntries(VR.FORMS.map((f) => [f, scrub.byForm[f] || 0]).filter(([, n]) => n)) };
        // the run's RECEIPT (minted at the run's start): the agent's answer, its audit line and each entry's use line carry the same one (design D1: a use + a receipt)
        const line = { ...head, receipt, allowedBy: verdict.by, askId, exit: Number.isInteger(code) ? code : null, signal: sig || null, ms, timedOut: rec.stopped === 'timeout', truncated, tailDropped: cut, strays, scrubbed, redacted: outT.redacted + errT.redacted, stdout: utf8Head(outT.text), stderr: utf8Head(errT.text) };
        if (spawnError) { const { receipt: _r, ...noRun } = line; note('spawn_failed', { ...noRun, why: spawnError }); resolve(named('spawn_failed', { why: spawnError })); return; }   // no child ran: no receipt, no use
        if (rec.stopped === 'lock') { note('vault_locked', { ...line, killed: true }); try { vault.blocked(VB.actorName(caller.name, 'a conversation'), 'vibespace-vault run'); } catch { } resolve(named('vault_locked', { killed: true })); return; }
        if (rec.stopped === 'gone') { note('caller_gone', { ...line, killed: true }); resolve(named('caller_gone')); return; }
        note('ran', line);
        resolve({ ok: true, exit: line.exit, signal: line.signal, timedOut: line.timedOut, truncated, ms, stdout: outT.text, stderr: errT.text, scrubbed: { hits: scrubbed.hits, bytes: scrubbed.bytes }, redacted: line.redacted, by: verdict.by, shapeId: head.shapeId, receipt });
      };
      let child;
      try {
        child = spawnImpl(spec.tool, m.argv.slice(1), { argv0: m.argv[0], cwd: place, env: { ...base, ...m.env, [MARK_ENV]: mark }, stdio: [m.stdin != null ? 'pipe' : 'ignore', 'pipe', 'pipe'], detached: true, windowsHide: true });
      } catch (e) { spawnError = String((e && e.code) || (e && e.message) || 'spawn').slice(0, 80); finish(null, null); return; }
      rec.child = child;
      runs.add(rec);
      child.on('error', (e) => { spawnError = String((e && e.code) || (e && e.message) || 'spawn').slice(0, 80); if (!child.pid) finish(null, null); });
      if (child.stdout) child.stdout.on('data', (b) => take('out', b));
      if (child.stderr) child.stderr.on('data', (b) => take('err', b));
      if (m.stdin != null && child.stdin) { child.stdin.on('error', () => { }); child.stdin.end(m.stdin); }
      child.on('close', (code, sig) => finish(code, sig));
      // a grandchild that left the group and holds the pipes open never holds the answer: PIPE_GRACE_MS after the child's exit, the pipes are cut
      child.on('exit', (code, sig) => { const t = timers.set(() => { if (done) return; rec.piped = true; try { child.stdout && child.stdout.destroy(); child.stderr && child.stderr.destroy(); } catch { } finish(code, sig); }, pipeGraceMs); t?.unref?.(); });
      rec.timer = timers.set(() => stop(rec, 'timeout'), spec.timeoutSec * 1000);
      rec.timer?.unref?.();
      if (signal && typeof signal.addEventListener === 'function') { if (signal.aborted) stop(rec, 'gone'); else signal.addEventListener('abort', () => stop(rec, 'gone'), { once: true }); }
    });
  }

  // THE LOCK (decision ③): every running child ends BY NAME, every card settles, the seen shapes and the 8-hour «always» go
  function onLocked(why = 'lock') {
    for (const rec of [...runs]) { log(`the vault locked (${why}): stopping the run of ${rec.name || rec.conv}`); stop(rec, 'lock'); shredDir(rec.dir); }   // its files go AT ONCE (the child is being stopped)
    for (const q of [...asks.values()]) settle(q, 'vault_locked', 'locked');
    asking.batch = true;   // B-4934: one recount after the whole withdrawal, not one per request
    try { for (const q of [...requests.values()]) settleRequest(q, 'vault_locked', 'locked'); } finally { asking.batch = false; }   // lane vault-manual-and-lock: every open request is withdrawn
    askingLine();
    seen.clear(); shortAlways.clear(); grants.clear(); db = null; dbEpoch = -1;   // … and every grant ends (once / 8 hours)
  }
  if (typeof vault.onLock === 'function') vault.onLock((why) => onLocked(why));

  /** Boot: a run directory a previous process left (it died with its child) — shredded. → how many. */
  function sweep() {
    let n = 0, names = [];
    const root = runRoot();
    try { names = fs.readdirSync(root); } catch { return 0; }
    for (const e of names) {
      if (!e.startsWith(RUN_DIR_PREFIX)) continue;
      const p = path.join(root, e);
      let st = null; try { st = fs.lstatSync(p); } catch { continue; }
      if (!st.isDirectory() || (typeof process.getuid === 'function' && st.uid !== process.getuid())) continue;
      let owner = null; try { owner = JSON.parse(readBounded(path.join(p, OWNER_FILE), 4096).toString('utf8')); } catch { owner = null; }
      if (owner && Number(owner.pid) === process.pid) continue;   // this hub's own run
      if (owner && PI.aliveIdentity(owner) !== false) continue;   // ANOTHER hub that lives (or one that cannot be proven gone): its runs are its own (the review)
      endMarked(e);   // the children that outlived their hub end first — then the files
      shredDir(p); n++;
    }
    return n;
  }
  /** The process ends: every child, its strays and its files with it (sync — an exit handler). */
  function closeAll() { for (const rec of [...runs]) { killGroup(rec, 'SIGKILL'); endMarked(rec.mark); shredDir(rec.dir); } runs.clear(); }

  return { run, answer, setRunnable, rowFacts, runnableFor, reconcile, sweep, closeAll, onLocked, request, answerRequest, usesFor, grantPasted,
    listRequests: () => [...requests.values()].map((q) => ({ askId: q.askId, who: q.who, ref: q.ref, askedAt: q.askedAt })), _grants: grants, _requests: requests, _reqQuiet: reqQuiet,
    listAsks: () => [...asks.values()].map((q) => ({ askId: q.askId, who: q.who, always: q.always, askedAt: q.askedAt, expiresAt: q.askedAt + VR.ASK_TTL_MS })), running: () => runs.size, ACTION_TYPE, _asks: asks, _seen: seen };
}

const statusOf = (code) => STATUS[code] || 400;
module.exports = { create, classOf, statusOf, STATUS, MORE_WORDS, ACTION_TYPE, REQUEST_TYPE, GRANT_MS, GRANT_ANSWERS, PURPOSE_MAX, REQUESTS_PER_CALLER, REQUEST_CALLERS_MAX, ASKING_LINE_OVER, ASKING_TEXT, ASKING_KEY, STORE_FILE, MARK_LABEL, RUN_DIR_PREFIX, OWNER_FILE, MARK_ENV, ARGS_MAX, CWD_MAX, readBounded, endMarked, KILL_GRACE_MS, HEAD_MAX, DETAIL_MAX, NO_ALWAYS, RUN_CLASS, NEVER_CLASS, redactLong };
