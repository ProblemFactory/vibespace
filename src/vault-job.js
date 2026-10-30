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
 *     scheduled run's: its cron), else WAIT `approval`. The row's writer is lane vault-job-approval; this file only reads it.
 *     Round 2 (the acceptance's MAJOR — «no silent failures; every refusal names a door»): THIS version has no writer and no
 *     card, so the approval wait's words say so and name the door that works NOW (an entry the agent PUT); the lock's words name
 *     where a person unlocks it. The CLI's first line is the wait (never «started») — data/bin/vibespace-job.
 *   · THE HAND-OFF (`fdPlan`, `envOf`, `specOf`, `encodeFrame` / `decodeFrame`): the hub writes ONE frame to the wrapper's fd 3
 *     — the names and lengths in its head, the bytes raw (never a JSON string of a value: every copy can be zeroed); the wrapper
 *     gives NAME the job's fd FD_BASE + i (fd 3 is the memory gate's — data/bin/job-wrapper.js GATE_EXEC) and the env only
 *     `NAME_FD=<n>`. The job reads that fd once: python `open(int(os.environ["NAME_FD"]), "rb").read()`, sh `$(cat <&4)`, node
 *     `fs.readFileSync(Number(process.env.NAME_FD))`; a second read is empty.
 */
const VR = require('./vault-run.js');
const VB = require('./vault-blocked.js');
const GM = require('./grant-model.js');

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
  // round 2: THE TRUTH OF THIS VERSION — no approval card exists yet (lane vault-job-approval); never a promise of one that will not come
  wait_approval: 'waiting for the user\'s approval of this job\'s vault values (a key the user stored, or a value the hub minted) — the approval card arrives in a later VibeSpace update, so in this version nothing can approve it and the job does not start; to run it now, store the key as this conversation\'s own entry (vibespace-vault put <name> --stdin — a value you put needs no approval; it takes the key in hand, so a value the hub minted, which you never saw, cannot be put), then rm this job and create it again with --vault NAME=vault://agent:<this conversation>/<name>',
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
  refsOf, parseVault, ownerOf, ownerKeysOf, jobIdsOf, familyOf, approvedBy, verdictOf,
  fdPlan, envOf, specOf, planOfSpec, encodeFrame, decodeFrame, waitWords, refusedOutcome,
};
