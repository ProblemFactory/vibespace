'use strict';
/**
 * A BACKGROUND JOB'S VAULT VALUES — PURE (lane vault-job-road, design-vault-service-secret L1a; the owner 2026-10-30: «如果我在
 * vault 里面存了个 API key，我的 agent 想要启动一个以后会自动启动的 service 能用这个 vault 里的 key 吗？»). THE THREAT MODEL is the
 * owner's: «我们的防范是针对 agent 不小心把 key 明文展示了之类的情况的» — the ACCIDENT roads close (a transcript, a tool's output,
 * a log, the env, argv, a file on disk, a card); an agent that WANTS a value can change its own program, and that is the owner's
 * accepted residual — no word here promises otherwise.
 *
 *   · DECLARE (`parseVault`): `vibespace-job run … --vault NAME=vault://…` — at most MAX, NAME `^[A-Z][A-Z0-9_]{0,63}$`, its
 *     `NAME_FD` a name the env may carry (the run door's env refusal table, never VIBESPACE_*, never one the job's own env sets).
 *     The record holds the REFERENCES only ({name, ref}); `show` prints them. A refusal never echoes what was typed (a value
 *     pasted where a reference belongs is never repeated back) — it names the position.
 *   · THE FAMILIES (`familyOf`): a free entry (`vault://secrets/secret:<id>/secret` — a key the owner stored for agents) and the job owner's OWN
 *     agent entry (`vault://agent:<its conversation>/<name>`). Another conversation's agent entry ⇒ `use_not_granted`; every
 *     other entry (a sign-in, a pairing, a channel, a store key, a passkey…) ⇒ `entry_not_for_jobs`, by name.
 *   · THE VERDICT AT EVERY SPAWN (`verdictOf` — a first start, a crash restart, a manual start, a boot replay, each cron fire):
 *     the vault not unlocked ⇒ WAIT `vault` (never a start without its values, never a counted failure); a value the agent PUT
 *     itself (it saw it) ⇒ go; a value the hub MINTED (the agent never saw it) or a free entry ⇒ go only on a `vault-job` grant
 *     row (src/grant-model.js — ONE row per entry, the member = the job's owner conversation, its `jobs` naming THIS job — a
 *     scheduled run's: its cron), else WAIT `approval`. Round 2 (the acceptance's MAJOR — «no silent failures; every refusal
 *     names a door»): the wait's words name the door that works; the lock's name where a person unlocks it. The CLI's first line
 *     is the wait (never «started») — data/bin/vibespace-job.
 *   · THE APPROVAL (lane vault-job-approval, L1b — design D1, D9): a wait for `approval` files ONE For-you card per job × entry
 *     (`askCardOf` — the facts, never a value; no expiry; ≤ ASKS_PER_CONV open per conversation, ≤ ASKS_MAX on the hub; a Deny
 *     quiets that conversation × entry DENY_QUIET_MS). 允许 (a person, the second password) adds the job to the owner
 *     conversation's member of the entry's `vault-job` row (`memberWith` — through the grants store's ONE writer: the I/O is
 *     src/server/vault-job-door.js); 拒绝 refuses the job (`vault_denied`). TAKEN BACK (decision ④): the ✕ — `memberWithout`
 *     — or the entry deleted STOPS the job (`stopWords` say it to its owner once); a job removed or cleared leaves the row too;
 *     a lock stops nothing that runs (decision ③ — no lock road exists).
 *   · THE HAND-OFF (`fdPlan`, `envOf`, `specOf`, `encodeFrame` / `decodeFrame`): the hub writes ONE frame to the wrapper's fd 3
 *     — the names and lengths in its head, the bytes raw (never a JSON string of a value: every copy can be zeroed); the wrapper
 *     gives NAME the job's fd FD_BASE + i (fd 3 is the memory gate's — data/bin/job-wrapper.js GATE_EXEC) and the env only
 *     `NAME_FD=<n>`. The job reads that fd once: python `open(int(os.environ["NAME_FD"]), "rb").read()`, sh `$(cat <&4)`, node
 *     `fs.readFileSync(Number(process.env.NAME_FD))`; a second read is empty.
 */
const VR = require('./vault-run.js');
const VB = require('./vault-blocked.js');
const GM = require('./grant-model.js');
const HC = require('./hidden-chars.js');   // lane vault-job-approval: the card shows a hidden character, never draws it

const MAX = 8;                          // --vault values per job
const NAME_RE = /^[A-Z][A-Z0-9_]{0,63}$/;
const FD_BASE = 4;                      // the job's first value fd (fd 3 is the memory gate's)
const PAYLOAD_MAX = 64 * 1024;          // the hub → wrapper frame, whole (the wrapper refuses a longer one)
const DRAIN_MS = 5000;                  // the wrapper reads its frame within this, or the run is not started
const DOOR = 'vault-job';               // the grant door (src/grant-model.js DOORS) — an approval names the job
const USE_DOOR = 'service';             // the `vault-use` line's door: a value handed to a job at a start
const MAGIC = 'VSJ1';                   // the frame's first bytes (the protocol of the hand-off, never a value)
const ACK = 0x06;                       // round 2: the wrapper's ONE byte back on fd 3 — the frame read whole (the hand-over completed)
const REFUSED_RE = /^[a-z][a-z0-9_]{0,40}$/;   // the wrapper's refusal code (its exit.json `refused`)
const RESERVED_RE = /^VIBESPACE_/;      // the hub's own env names
const WAITS = Object.freeze(['vault', 'approval']);
// lane vault-job-approval (L1b, design D1 + D9): THE APPROVAL CARD — one For-you item per job × entry, no expiry, 允许 (the second
// password) writes the job's id into the entry's `vault-job` grant row, 拒绝 refuses the job
const ASK_TYPE = 'vault-job-ask';       // the card's For-you action type (src/foryou-actions.js row)
const ASK_ID_RE = /^vj-[0-9a-f]{16}$/;  // a card's id (`askId`)
const ASKS_PER_CONV = 4;                // JOBS waiting on open cards per conversation (the paste request's number — design D9; a job with
                                        // several entries holds one card each, counted as ONE job — the adversarial read: a 5-entry job
                                        // counted by cards could never start)
const ASKS_MAX = 64;                    // …and on the whole hub (jobs)
const DENY_QUIET_MS = 10 * 60 * 1000;   // a Deny quiets the same conversation × entry this long (request_quiet's ten minutes)
const MEMBER_JOBS_MAX = 64;             // = src/grant-model.js JOBS_MAX: the job ids one member's approval names
const CARD_LINE_MAX = 400;              // a path, a folder or a command on the card, cut with its mark (never a value — a reference)

const WORDS = Object.freeze({
  vault_bad_spec: 'a --vault is NAME=vault://<entry> — the reference `vibespace-vault list` prints, never a value',
  vault_too_many: `a job takes at most ${MAX} --vault values`,
  vault_bad_name: 'a --vault NAME is upper case: a letter, then letters, digits or _ (at most 64) — the job reads the fd named by $NAME_FD',
  vault_dup_name: 'each --vault NAME may be given once',
  vault_name_refused: 'that --vault NAME is refused: its NAME_FD would be a VibeSpace name, a name the job\'s own env sets, or a name a program reads as code or config',
  vault_bad_ref: 'a --vault reference is vault://secrets/secret:<id>/secret or vault://agent:<conversation>/<name> — `vibespace-vault list` prints the ones this conversation may use',
  entry_not_for_jobs: 'a Background Work job may use a key stored for agents (vault://secrets/secret:…) or one its own conversation stored (vault://agent:…) — never a sign-in, a pairing, a channel or a store key',
  use_not_granted: 'that entry belongs to another conversation — a job uses its own conversation\'s entries, or a key stored for agents',
  entry_unknown: 'the vault holds no such entry (deleted?) — `vibespace-vault list` names what exists',
  entry_unreadable: 'the vault could not open that entry — the job was not started',
  entry_too_short_to_mask: VR.WORDS.entry_too_short_to_mask,
  vault_not_set_up: 'the vault is not set up on this instance — there is no value to hand the job',
  payload_too_large: `the job's vault values are larger than ${PAYLOAD_MAX / 1024} KiB together — the job was not started`,
  wait_vault: VB.agentWords('the job waits (a wait, never a failure) and starts by itself once a person unlocks it on this instance\'s page (⚙ System ▸ Vault…)'),
  // lane vault-job-approval (L1b): THE CARD EXISTS — the wait names it, and what each answer does (round 2's law: never a promise of
  // a door that is not there, and the door that is)
  wait_approval: 'waiting for the user\'s approval of this job\'s vault values (a key the user stored, or a value the hub minted) — at its start ONE card per entry asks the user in their For-you tray (a schedule: at its first fire); the job starts by itself once they allow it, and is refused if they deny it; a value this conversation PUT itself needs no approval (vibespace-vault put <name> --stdin, then --vault NAME=vault://agent:<this conversation>/<name>)',
  vault_denied: 'the user denied this job the use of that vault entry — it was not started; `vibespace-job start` asks again (not within 10 minutes of the denial)',
  ask_quiet: 'the user denied this conversation that vault entry less than 10 minutes ago — the job was not started; start it again later to ask again',
  too_many_asks: `this conversation already has ${ASKS_PER_CONV} Background Work jobs waiting for the user's approval — the job was not started; wait for an answer (or rm a waiting job), then start it again`,
  too_many_asks_hub: `${ASKS_MAX} Background Work jobs on this instance are waiting for the user's approval — the job was not started; start it again later`,
  no_owner_conversation: 'a job with no owner conversation cannot be approved to use a vault value (an approval names its conversation) — the job was not started; create it from a conversation',
  ask_unfiled: 'the approval card could not be filed in the user\'s For-you tray — the job was not started',
  ask_closed: 'the approval card was closed without an answer — the job was not started; `vibespace-job start` asks again',
});

const refuse = (code, extra = {}) => ({ ok: false, code, words: WORDS[code] || code, ...extra });
const own = Object.prototype.hasOwnProperty;

/** A job record's declared values → [{name, ref}] (the record's own, re-read; [] when none). A scheduled run reads its task's. */
function refsOf(job) {
  const v = job && (Array.isArray(job.vault) ? job.vault : job.action && job.action.task && Array.isArray(job.action.task.vault) ? job.action.task.vault : null);
  return v ? v.filter((r) => r && typeof r.name === 'string' && typeof r.ref === 'string') : [];
}

/** THE GRAMMAR: `--vault` values (strings `NAME=vault://…`, or the record's {name, ref}) → `{ok:true, refs:[{name, ref}]}` (the
 *  reference in its canonical spelling) | a refusal with `at` (the 1-based position — never the text typed). `env` = the job's
 *  own env (its NAME_FD may not collide with one it sets). */
function parseVault(list, { env = null } = {}) {
  if (list === undefined || list === null || list === false) return { ok: true, refs: [] };
  const items = Array.isArray(list) ? list : [list];
  if (items.length > MAX) return refuse('vault_too_many');
  const out = [], names = new Set();
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    let name, text;
    if (typeof it === 'string') { const eq = it.indexOf('='); if (eq < 1) return refuse('vault_bad_spec', { at: i + 1 }); name = it.slice(0, eq); text = it.slice(eq + 1); }
    else if (it && typeof it === 'object' && !Array.isArray(it)) { name = it.name; text = it.ref; }
    else return refuse('vault_bad_spec', { at: i + 1 });
    name = typeof name === 'string' ? name : '';
    if (!NAME_RE.test(name)) return refuse('vault_bad_name', { at: i + 1 });
    if (names.has(name)) return refuse('vault_dup_name', { at: i + 1, key: name });
    const fdName = `${name}_FD`;
    if (RESERVED_RE.test(name) || VR.envRefusedOf(fdName) || (env && typeof env === 'object' && own.call(env, fdName))) return refuse('vault_name_refused', { at: i + 1, key: name });
    const ref = VR.parseRef(typeof text === 'string' ? text.trim() : '');
    if (!ref) return refuse('vault_bad_ref', { at: i + 1, key: name });
    names.add(name);
    out.push(Object.freeze({ name, ref: ref.ref }));
  }
  return { ok: true, refs: out };
}

/** The job's owner as the run door's ownership rule reads a caller: its registered id and its durable conversation id. */
function ownerOf(job) {
  const o = (job && job.owner) || {};
  return { scope: typeof o.sessionId === 'string' ? o.sessionId : '', conv: o.conversation && typeof o.conversation.id === 'string' ? o.conversation.id : null };
}
/** The owner's conversation keys a `vault-job` member is matched by. */
const ownerKeysOf = (job) => { const o = ownerOf(job); return [o.conv, o.scope].filter((k) => typeof k === 'string' && k !== ''); };
/** The job ids an approval may name: the job, and for a scheduled run its cron (an approval is the cron's, every fire reads it). */
const jobIdsOf = (job) => [job && job.id, job && job.cronParent].filter((x) => typeof x === 'string' && x !== '');

/** THE FAMILY of one reference for this job's owner → `{ok:true, family:'free'|'own', ref}` | a refusal. */
function familyOf(text, owner = {}) {
  const ref = VR.parseRef(String(text == null ? '' : text));
  if (!ref) return refuse('vault_bad_ref');
  if (VR.isFreeEntry(ref.store, ref.entry, ref.field)) return { ok: true, family: 'free', ref };
  if (VR.agentScopeOf(ref)) return VR.ownsAgentEntry(ref, owner) ? { ok: true, family: 'own', ref } : refuse('use_not_granted');
  return refuse('entry_not_for_jobs');
}

/** Does a `vault-job` row approve THIS job? `rows` = the grants store's rows of the entry (rowsFor), `keys` = the owner's
 *  conversation keys, `jobIds` = jobIdsOf. An admitting member whose `jobs` names one of them. */
function approvedBy(rows, { keys = [], jobIds = [] } = {}) {
  const v = GM.admits(rows, { conversationKeys: keys });
  return !!v.ok && v.hits.some((h) => Array.isArray(h.entry && h.entry.jobs) && h.entry.jobs.some((id) => jobIds.includes(id)));
}

/**
 * THE VERDICT of one spawn. `state` = the vault's (unlocked | locked | not_set_up); `entryOf(ref)` → `{prov}` of a stored entry
 * (`prov: 'minted'` — the hub made it) | null when the vault holds none; `rowsFor(entryId)` → the entry's `vault-job` rows.
 * → `{go:true, refs:[{name, ref, id, entry, by:'own'|'grant'}], plan}` | `{wait:'vault'|'approval', missing?:[name]}` |
 * a refusal (`{ok:false, code, words, key}` — `key` = the --vault NAME; the run cannot start whatever anyone does now).
 */
function verdictOf(job, { state, entryOf = () => null, rowsFor = () => [] } = {}) {
  const refs = refsOf(job);
  if (!refs.length) return { go: true, refs: [], plan: [] };
  if (state === 'not_set_up') return refuse('vault_not_set_up');
  if (state !== 'unlocked') return { wait: 'vault' };
  const owner = ownerOf(job), keys = ownerKeysOf(job), jobIds = jobIdsOf(job);
  const out = [], missing = [];
  for (const r of refs) {
    const f = familyOf(r.ref, owner);
    if (!f.ok) return { ...f, key: r.name };
    const e = entryOf(f.ref);
    if (!e) return refuse('entry_unknown', { key: r.name });
    const by = f.family === 'own' && e.prov !== 'minted' ? 'own' : approvedBy(rowsFor(f.ref.id), { keys, jobIds }) ? 'grant' : null;
    if (!by) { missing.push(r.name); continue; }
    out.push(Object.freeze({ name: r.name, ref: f.ref.ref, id: f.ref.id, entry: f.ref.entry, by }));
  }
  if (missing.length) return { wait: 'approval', missing };
  return { go: true, refs: out, plan: fdPlan(out) };
}

/** NAME → the job's fd: [{name, fd, env}] (FD_BASE + i, in the declared order). */
const fdPlan = (refs) => refs.map((r, i) => Object.freeze({ name: r.name, fd: FD_BASE + i, env: `${r.name}_FD` }));
/** What the job's env gets: `NAME_FD=<n>` — never a value. */
const envOf = (plan) => Object.fromEntries(plan.map((p) => [p.env, String(p.fd)]));
/** What rides the spec file: the names and their fds — never a value (the values ride the wrapper's fd 3). */
const specOf = (plan) => plan.map((p) => ({ name: p.name, fd: p.fd }));
/** The wrapper's check of the spec's list → the plan | null (a list this protocol cannot read starts nothing). */
function planOfSpec(list) {
  if (!Array.isArray(list) || !list.length || list.length > MAX) return null;
  const seen = new Set();
  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    if (!p || !NAME_RE.test(String(p.name)) || p.fd !== FD_BASE + i || seen.has(p.name)) return null;
    seen.add(p.name);
  }
  return fdPlan(list);
}

/** THE FRAME (hub → wrapper, its fd 3): MAGIC · count (1 byte) · per value: name length (1) · name (ASCII) · value length
 *  (uint32 BE) · the bytes. `entries` = [{name, value: Buffer}] → ONE Buffer the caller zeroes once it is written (throws
 *  `payload_too_large`). Never a JSON string: a string cannot be zeroed. */
function encodeFrame(entries) {
  let n = MAGIC.length + 1;
  for (const e of entries) n += 1 + Buffer.byteLength(e.name, 'ascii') + 4 + e.value.length;
  if (n > PAYLOAD_MAX || entries.length > MAX) { const err = new Error(WORDS.payload_too_large); err.code = 'payload_too_large'; throw err; }
  const out = Buffer.alloc(n);
  let o = out.write(MAGIC, 0, 'ascii');
  out[o++] = entries.length;
  for (const e of entries) {
    const nb = Buffer.from(e.name, 'ascii');
    out[o++] = nb.length; nb.copy(out, o); o += nb.length;
    out.writeUInt32BE(e.value.length, o); o += 4;
    e.value.copy(out, o); o += e.value.length;
  }
  return out;
}
/** The wrapper's read of a frame against its plan → `{ok:true, values:[Buffer]}` (fresh copies, in the plan's order) |
 *  `{ok:false, why}` (a sentence with no byte of the frame in it). */
function decodeFrame(buf, plan) {
  const bad = (why) => ({ ok: false, why });
  if (!Buffer.isBuffer(buf) || buf.length < MAGIC.length + 1 || buf.toString('ascii', 0, MAGIC.length) !== MAGIC) return bad('the values arrived in a shape this wrapper does not read');
  let o = MAGIC.length;
  const count = buf[o++];
  if (!Array.isArray(plan) || count !== plan.length) return bad('the values arrived for another list of names');
  const values = [];
  for (const p of plan) {
    if (o >= buf.length) return bad('the values arrived cut short');
    const nl = buf[o++];
    if (o + nl + 4 > buf.length || buf.toString('ascii', o, o + nl) !== p.name) return bad('the values arrived for another list of names');
    o += nl;
    const vl = buf.readUInt32BE(o); o += 4;
    if (o + vl > buf.length) return bad('the values arrived cut short');
    const v = Buffer.alloc(vl); buf.copy(v, 0, o, o + vl); o += vl;
    values.push(v);
  }
  if (o !== buf.length) return bad('the values arrived with bytes past their end');
  return { ok: true, values };
}

/** The job id an approval names: a scheduled run's is its cron's (every fire reads the cron's approval — D4), else the job's. */
const askJobIdOf = (job) => String((job && (job.cronParent || job.id)) || '');

/** THE APPROVAL CARD (lane vault-job-approval, design D1) — the facts of ONE job × entry → `{text, detail, i18n, facts}`: who asks,
 *  the job (its name, its kind and what that means), the entry (its Vault name, its reference, the fd the program reads), the
 *  program (its real path — and, a PLAIN fact, that an agent can change it: design D1's risk, never an alarm), the script an
 *  interpreter runs, the folder, the command, the destination (unknown — a program), what a lock does. Names, paths and
 *  references only — never a value (the card is an accident road). `facts` = the closed codes a client draws in its language. */
const i18nKey = (s) => s;   // the extractor's marker (scripts/i18n-extract.mjs): a declared human-visible string — the card's lines are t()'d by the client
const KIND_LINES = Object.freeze({
  service: i18nKey('A service: it starts again by itself when it stops, and again after a VibeSpace restart once the vault is unlocked — each start gets the secret.'),
  'service-never': i18nKey('A service that is not restarted by itself — each start gets the secret.'),
  cron: i18nKey('A scheduled job: each run on its schedule gets the secret.'),
  task: i18nKey('A task: it runs once and gets the secret once.'),
});
/** the kind's line by its restart policy (the adversarial reads: a `never` service does not «start again by itself»; every
 *  other policy restarts it at ANY exit — src/jobs.js onServiceExit reads no exit code — so it is «when it stops») */
const kindKeyOf = (kind, restart) => (kind === 'service' ? (restart === 'never' ? 'service-never' : 'service') : kind === 'cron' ? 'cron' : 'task');
// THE ONE HIDDEN-CHARACTER DOOR (src/hidden-chars.js — the approval census §1d): a job's name, a path and a command are the
// agent's — a reordering / invisible character is SHOWN as ⟦U+XXXX⟧ (never drawn), a line break or a tab becomes a space
const cardClip = (s) => { const t = HC.revealHidden(String(s == null ? '' : s)).replace(/[\u0000-\u001f\u007f]/g, ' '); return t.length > CARD_LINE_MAX ? `${t.slice(0, CARD_LINE_MAX - 1)}…` : t; };
const fillLine = (l) => l.key.replace(/\{(\w+)\}/g, (m, k) => (l.params && l.params[k] != null ? String(l.params[k]) : m));
function askCardOf({ who = '', job = {}, entry = {}, program = {}, script = null, folder = '', command = '' } = {}) {
  const kind = ['service', 'cron', 'task'].includes(job.kind) ? job.kind : 'task';
  const restart = kind === 'service' && ['always', 'on-failure', 'never'].includes(job.restart) ? job.restart : null;
  const f = {
    v: 1, who: cardClip(who).slice(0, 80), job: { id: String(job.id || ''), name: cardClip(job.label || job.id || ''), kind, ...(restart ? { restart } : {}) },   // who '' = unknown (the client says «a conversation» in its language)   // `label` = the engine's belted name (labelOf — §93), never the record's raw one
    entry: { label: cardClip(entry.label || entry.id || ''), ref: cardClip(entry.ref || ''), var: `${entry.name || ''}_FD` },
    program: { path: cardClip(program.path || ''), writable: program.writable === true, ...(program.unread === true ? { unread: true } : {}) },   // unread: its file facts were not read in time (counted writable)
    ...(script && script.path ? { script: { path: cardClip(script.path), writable: script.writable === true, ...(script.unread === true ? { unread: true } : {}) } } : {}),
    folder: cardClip(folder), command: cardClip(command), dest: 'unknown', lock: 'runs-on',
  };
  // ≤ 12 lines whatever the facts (the store keeps an item's first 12 i18n lines — src/user-todos.js normalizeI18n): «an agent
  // can change it» rides its path's own line
  const lines = [
    { key: i18nKey('Job: {name} ({id})'), params: { name: f.job.name, id: f.job.id } },
    { key: KIND_LINES[kindKeyOf(kind, restart)] },
    { key: i18nKey('Secret: {label} — {ref}'), params: { label: f.entry.label, ref: f.entry.ref } },
    { key: i18nKey('The program reads it once from the descriptor ${var} names — never from its environment, its command line or a file.'), params: { var: f.entry.var } },
    f.program.unread ? { key: i18nKey('Program: {path} — its file facts could not be read in time; counted as one an agent can change.'), params: { path: f.program.path } }
      : f.program.writable ? { key: i18nKey('Program: {path} — an agent can change this program.'), params: { path: f.program.path } } : { key: i18nKey('Program: {path}'), params: { path: f.program.path } },
    ...(f.script ? [f.script.unread ? { key: i18nKey('Script: {path} — its file facts could not be read in time; counted as one an agent can change.'), params: { path: f.script.path } }
      : f.script.writable ? { key: i18nKey('Script: {path} — an agent can change this script.'), params: { path: f.script.path } } : { key: i18nKey('Script: {path}'), params: { path: f.script.path } }] : []),
    { key: i18nKey('Folder: {folder}'), params: { folder: f.folder } },
    { key: i18nKey('Command: {command}'), params: { command: f.command } },
    { key: i18nKey('Where it sends the secret: unknown — VibeSpace cannot read where a program connects.') },
    { key: i18nKey('Locking the vault stops nothing that runs; a new start waits for the unlock. A value the program has read cannot be taken back — rotate the key at its provider to end it.') },
    { key: i18nKey('Taking it back — ✕ on its Vault row or on the job card — stops it at once.') },   // lane vault-job-approval L2: the ✕ exists (both surfaces)
  ];
  // an unknown asker has its own key (never an English «a conversation» param inside a translated sentence)
  const text = f.who ? { key: i18nKey('{who} asks to let the Background job «{name}» use a stored secret'), params: { who: f.who, name: f.job.name } } : { key: i18nKey('A conversation asks to let the Background job «{name}» use a stored secret'), params: { name: f.job.name } };
  return { text: fillLine(text), detail: lines.map(fillLine).join('\n'), i18n: { text, detail: lines }, facts: f };
}

/** THE GRANT ROW'S NEXT LISTS (lane vault-job-approval — 允许 writes through the grants store's ONE writer): the member of the job's
 *  owner conversation (`key`) gains `jobId`; every other member and every exception is kept as it is. `row` = the entry's
 *  `vault-job` row | null. → `{to, except, same}` (`same`: the member names the job already — nothing to write) | null (the
 *  member names MEMBER_JOBS_MAX jobs already). */
function memberWith(row, key, jobId, { keep = null } = {}) {
  const to = Array.isArray(row && row.to) ? row.to.map((m) => (m && typeof m === 'object' ? { ...m } : m)) : [];
  const except = Array.isArray(row && row.except) ? row.except.slice() : [];
  const m = to.find((x) => x && typeof x === 'object' && x.kind === 'conversation' && x.key === key);
  if (!m) { to.push({ kind: 'conversation', key, jobs: [jobId] }); return { to, except, same: false }; }
  // `keep(id)`: the ids of jobs that still exist (the adversarial read: an archived or collected job's id would hold one of the 64
  // places for ever) — the member is pruned as it is written
  const all = Array.isArray(m.jobs) ? m.jobs.map(String) : [];
  const jobs = typeof keep === 'function' ? all.filter((id) => id === jobId || keep(id)) : all;
  if (jobs.length !== all.length) m.jobs = jobs;
  if (jobs.includes(jobId)) return { to, except, same: jobs.length === all.length };
  if (jobs.length >= MEMBER_JOBS_MAX) return null;
  m.jobs = [...jobs, jobId];
  return { to, except, same: false };
}

/** …and the member WITHOUT the job (lane vault-job-approval — decision ④: the ✕ takes it back; a job removed or cleared takes
 *  its id with it): every conversation member's `jobs` loses `jobId`, a member left naming no job leaves, every exception is
 *  kept. → `{to, except, changed}` (`changed` false: no member named the job — nothing to write). */
function memberWithout(row, jobId) {
  const to = [];
  let changed = false;
  for (const m of Array.isArray(row && row.to) ? row.to : []) {
    if (!m || typeof m !== 'object' || !Array.isArray(m.jobs) || !m.jobs.map(String).includes(jobId)) { to.push(m && typeof m === 'object' ? { ...m } : m); continue; }
    changed = true;
    const jobs = m.jobs.map(String).filter((x) => x !== jobId);
    if (jobs.length) to.push({ ...m, jobs });
  }
  return { to, except: Array.isArray(row && row.except) ? row.except.slice() : [], changed };
}
/** The entry name of a `vault-job` row's resource (`secrets:<entry>#secret`) | null. */
const entryOfRow = (id) => { const m = /^secrets:(.+)#secret$/.exec(String(id || '')); return m ? m[1] : null; };
/** What the owner conversation is told ONCE when the person takes a running job's value back (`revoked`) or deletes its entry
 *  (`deleted`) — and the job's own event line. Names only; what cannot be undone said plainly (a value already read). */
// ≤ 200 characters whatever the label (the owner notice cuts its words there — src/job-model.js agentPiece): the label ≤ 40
const stopWords = (why, label) => { const l = String(label || '').slice(0, 40); return why === 'deleted'
  ? `stopped: the user deleted its vault entry «${l}» — it cannot start again with it`
  : `stopped: the user took back its vault entry «${l}»; a value it read cannot be taken back (rotate the key); a start asks again`; };

/** The job's state line while it waits. */
const waitWords = (w) => (w === 'approval' ? WORDS.wait_approval : WORDS.wait_vault);
/** Round 2 — A USE IS A HAND-OVER THAT COMPLETED: a start the wrapper never acknowledged (no ACK before its fd 3 closed) → the
 *  start's `vault-use` outcome from the wrapper's exit record (`exit` = its exit.json | null): `refused:update_window` (a
 *  wrapper of another protocol — an update in flight), `refused:stopped` (a stop before it read), `refused:<its code>`
 *  (masker_missing, vault_shape, spec_refused, values_late, values_too_large, values_unreadable, no_channel), else
 *  `refused:not_started` (it wrote no record — killed). Never 'ok': no program was given the value. */
function refusedOutcome(exit) {
  const e = exit && typeof exit === 'object' ? exit : {};
  const code = e.reason === 'update_window' ? 'update_window' : e.stop ? 'stopped' : REFUSED_RE.test(String(e.refused || '')) ? e.refused : 'not_started';
  return `refused:${code}`;
}

module.exports = {
  MAX, NAME_RE, FD_BASE, PAYLOAD_MAX, DRAIN_MS, DOOR, USE_DOOR, MAGIC, ACK, WAITS, WORDS,
  ASK_TYPE, ASK_ID_RE, ASKS_PER_CONV, ASKS_MAX, DENY_QUIET_MS, askJobIdOf, askCardOf, memberWith, memberWithout, entryOfRow, stopWords,
  refsOf, parseVault, ownerOf, ownerKeysOf, jobIdsOf, familyOf, approvedBy, verdictOf,
  fdPlan, envOf, specOf, planOfSpec, encodeFrame, decodeFrame, waitWords, refusedOutcome,
};
