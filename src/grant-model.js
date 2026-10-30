'use strict';
/**
 * THE GRANT MODEL — PURE (imports nothing; CJS so the server's stores and doors, the migration, the suites AND the
 * browser bundle share ONE spelling of every rule). Lane grants-unify, 2026-10-23 — the owner: «权限系统要 unify
 * 一下，不想引入太多复杂度» then «我觉得可以 就这么做吧» over the group-grant census (the design lane of the same day).
 *
 * WHY. Eight places gave agents access — a browser profile's "Who can use it", an automation key's grant and its
 * reach, a channel's reach / raw-API tier / notification, a machine's exit, a desktop window's share, a Task Group's
 * outside visibility — in seven store tables, judged by eight hand-rolled «is it in the group» tests, none of which
 * could leave ONE member of a chosen group out. Now there is ONE row shape, ONE verdict (`admits`), ONE store
 * (src/server/grants-store.js, data/grants.json) and ONE writer (`grants.set`); the doors keep their own words.
 *
 * THE ROW — the only two user-facing concepts are 「给谁」 (`to`) and 「除了」 (`except`):
 *   { door, resource, to: [principal], except: [principal], at, by }
 *   principal = {kind:'everyone'} | {kind:'group', id} | {kind:'conversation', key}
 * A `to` entry may carry the door's OWN per-member setting (an annotation, never an admission input — ENTRY_FIELDS):
 * a channel access row's send `authority`, a raw-API `tier` + `perDay`, a window share's `origin`, a Task Group
 * visibility `level`; every entry may carry a display `name` and its provenance `at` / `by`.
 *
 * ONE CONVERSATION-KEY SPELLING: the bare CONVERSATION ID (`cid` — what channels' agent rows, automation's `session:`
 * subjects and the principal picker's `agent:<cid>` rows already carry: 13 of the 15 conversation rows on the owner's
 * stores, 2026-10-23); a session that has no conversation id yet answers to `webui:<id>` (window-reach's callerKeys
 * rule). The other spellings map in at read / migration time: exit + windows `<backend>:<cid>` → `<cid>`
 * (`keyFromSessionKey`), automation `session:<cid>` → `<cid>` (`keyFromSubject`), a browser `bk-…` key → the
 * conversation it is bound to, else itself (`browserKeyResolver` — the caller hands the binding lookup).
 *
 * THE VERDICT `admits(rows, facts)` — facts = {conversationKey | conversationKeys, groupIds, groupsUnreadable?,
 * forkPending?}. A row admits the caller when (everyone ∨ one of its keys ∨ one of its groupIds is in `to`) ∧ none of
 * its keys / groups is in `except`. ROWS ADD: any admitting row admits; an exception subtracts ONLY its own row's
 * contribution (a member's own direct row elsewhere still counts — the owner's default 2). Fail CLOSED, by NAME:
 *   · a malformed `to` ENTRY is dropped (dropping NARROWS); a malformed `except` entry VOIDS the whole row (dropping an
 *     exception would WIDEN — it would admit the one the owner left out) ⇒ `unknown_shape`; a row of an unknown door,
 *     a `to` / `except` that is not a list ⇒ `unknown_shape`; never «everyone»;
 *   · a group the caller's membership could decide while the Task Group store could not be read ⇒ `groups_unreadable`
 *     (never «not in any group»; a group in `except` that cannot be judged keeps the row from admitting);
 *   · the caller named (or one of its groups named) in an admitting row's `except` and no other row admits ⇒ `excepted`
 *     (the door words it: the exception, and where the owner lifts it);
 *   · a pending fork nothing reached ⇒ `fork_pending`; else `not_granted`.
 * Precedence when no row admits: groups_unreadable › unknown_shape › excepted › fork_pending › not_granted.
 *
 * LEGACY. Every shape the census found on disk maps to rows here (`fromExitGrant`, `fromBrowserOwner`,
 * `fromWindowRecord`, `fromAutomationGrant`, `fromAutomationReach`, `fromChannelAccess`, `fromChannelRow`,
 * `fromChannelApiRows`, `fromChannelWatchers`, `fromGroupVisibility`) — used by the ONE migration
 * (src/server/migrations.js `2026-10-grants-unify`) and the suites; `LEGACY` keeps each OLD reader's membership test,
 * verbatim in meaning, for the migration's EQUIVALENCE check only (old verdict ≡ new verdict for every live principal,
 * else the migration refuses and names the row). No other file may hold a membership test (test-architecture §97).
 *
 * Gate: scripts/test-grant-model.mjs (fast — every legacy shape, every refusal by name, rows add, except subtracts only
 * its row, the malformed to / except asymmetry, the write validator, patched-copy controls).
 */

/** THE DOORS — every place a grant is judged (a door not here refuses `unknown_door` at the write, `unknown_shape` at
 *  the read). The resource grammar per door (the store keys a row by door + resource):
 *    browser-profile       <profileId>                          (a profile's "Who can use it")
 *    automation-key-use    <grantId>                            (who holds one grant of a key — one row per grant)
 *    automation-key-reach  <grantId>                            (which conversations that grant may act on; absent ⇒
 *                                                                 'opened', the key's own openings only)
 *    channel-reach         account:<adapterId> | conversation:<adapterId>/<convId> | rule:<patternId>  (the grain's
 *                          access list, level visible) · conversation:<key>#request (approved requests, visible) ·
 *                          conversation:<key>#user (the owner's reach rows, each entry its `level`)
 *    channel-watch         the grain resource (as channel-reach's three) — who that grain's notification wakes
 *    channel-api           <credential>  (an account id or mount:<id>; each entry its `tier`, `perDay`)
 *    exit                  <hostId>:use | <hostId>:run
 *    window                <windowId>    (a desktop-app window record; each entry its `origin`)
 *    group-visibility      <groupId>     (the group's members shown to outside agents; the entry's `level`)
 *    browser-login         <origin>#<user> | <origin>#* | *   (lane browser-login: who may have a saved web login filled on
 *                          the custom kernel — ONE account, «any account on this site», «any site»; rows of the three ADD;
 *                          the shape is RESOURCE_SHAPES' — a write of any other is `bad_resource`, a read `unknown_shape`)
 *    vault-use             <store>:<entry>#<field>   (lane vault-use-grants, the owner 2026-10-27 「每个密码请求都要我同意太麻烦了！」:
 *                          who may USE a vault entry in `vibespace-vault run` with NO card — the Vault window's row id; each
 *                          entry its `hosts` (the destinations the use may reach: host names / addresses, or `@entry` = the
 *                          hosts the entry itself was stored for — never «any host») and an optional `until` (ms); the door's
 *                          reader is PURE src/vault-use-grant.js, its writer src/server/vault-use-grants.js)
 *    vault-job             <store>:<entry>#<field>   (lane vault-job-road, design-vault-service-secret D1: the owner's approval
 *                          that a Background Work JOB uses a vault entry at every start — the Vault window's row id; the member =
 *                          the job's owner conversation, its `jobs` = the job ids it approves (a scheduled run's: its cron); the
 *                          reader is PURE src/vault-job.js `approvedBy`, its writer lane vault-job-approval) */
const DOORS = Object.freeze(['browser-profile', 'automation-key-use', 'automation-key-reach', 'channel-reach', 'channel-watch', 'channel-api', 'exit', 'window', 'group-visibility', 'browser-login', 'vault-use', 'vault-job']);
/** lane browser-login: a door whose resource has a SHAPE of its own (the rest: any id RESOURCE_RE takes). browser-login: an
 *  origin (scheme + lower-case host + a port, as src/browser-login.js originOf spells it) `#` a lower-cased user name (no white
 *  space, no `#`) or `*`; or `*` alone. */
const RESOURCE_SHAPES = Object.freeze({
  'browser-login': /^(?:\*|https?:\/\/(?:[a-z0-9-]{1,63}(?:\.[a-z0-9-]{1,63}){0,20}|\[[0-9a-f:.]{2,45}\])(?::\d{1,5})?#(?:\*|[^\s#A-Z\u0000-\u001f\u007f]{1,160}))$/,
  'vault-use': /^[a-z][a-z-]{0,30}:[^\s\u0000-\u001f\u007f]{1,330}#[\w.:-]{1,60}$/,   // lane vault-use-grants: the Vault window's row id (src/vault-inventory.js refOf)
  'vault-job': /^[a-z][a-z-]{0,30}:[^\s\u0000-\u001f\u007f]{1,330}#[\w.:-]{1,60}$/,   // lane vault-job-road: the same row id as vault-use's
});
const resourceShapeOk = (door, resource) => { const re = RESOURCE_SHAPES[door]; return re ? re.test(str(resource)) : RESOURCE_RE.test(str(resource)); };
const PRINCIPAL_KINDS = Object.freeze(['everyone', 'group', 'conversation']);
/** Every code `admits` answers a refusal with — CLOSED. */
const REFUSALS = Object.freeze(['not_granted', 'excepted', 'groups_unreadable', 'unknown_shape', 'fork_pending']);
/** Every code the write validator answers — CLOSED. */
const WRITE_REFUSALS = Object.freeze(['unknown_door', 'bad_resource', 'bad_principal', 'bad_except', 'except_conflicts', 'too_many', 'bad_row']);
const LIST_MAX = 256;
const GROUP_ID_RE = /^[A-Za-z0-9._:-]{1,120}$/;
/** A conversation key: the conversation id, or `webui:<id>` before it has one. */
const CONVERSATION_KEY_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;
const RESOURCE_RE = /^[^\u0000-\u001f\u007f]{1,400}$/;
const cleanName = (s) => (typeof s === 'string' ? s.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 120) : '');
const str = (v) => (v === undefined || v === null ? '' : String(v));

/** The door's OWN per-member settings a `to` entry may carry (a closed value set each, or a typed value: `count` a
 *  positive integer, `hosts` a host list, `time` an instant in ms) — never read by `admits` (a door's own reader reads them
 *  over admits' hits: vault-use's hosts and expiry, src/vault-use-grant.js). */
const ENTRY_FIELDS = Object.freeze({
  'channel-reach': Object.freeze({ authority: Object.freeze(['draft', 'send']), level: Object.freeze(['visible', 'requestable']) }),
  'channel-api': Object.freeze({ tier: Object.freeze(['none', 'read', 'write-ask', 'write-auto', 'write-all']), perDay: 'count' }),
  window: Object.freeze({ origin: Object.freeze(['user', 'request', 'self-open']) }),
  'group-visibility': Object.freeze({ level: Object.freeze(['visible', 'messageable']) }),
  'vault-use': Object.freeze({ hosts: 'hosts', until: 'time', tool: 'tool', toolFor: 'toolmap', mac: 'mac' }),   // lane vault-use-grants (round 3: `tool` scopes a wildcard default to its CLI; round 4 item 3: `toolFor` scopes PER HOST — a wildcard row carries the tool that minted it, never rewritten by a later «Always» from another CLI; `mac` is the vault's HMAC so a forged row is dropped)
  'vault-job': Object.freeze({ jobs: 'jobs' }),   // lane vault-job-road: the job ids the member's approval names (src/vault-job.js approvedBy)
});
/** lane vault-use-grants: ONE destination a vault-use entry may name — EVERY shape the run card can name (round 2 MAJOR):
 *  a host name (one label like `router` or many like `api.example.com`), an IPv4 / IPv6 address (IPv6 bracketed or bare),
 *  any of those with a `:port`, or a `*.domain` wildcard over a registrable domain (`*.amazonaws.com`, never `*.com`); or
 *  `@entry` («the hosts the entry was stored for», resolved at use time). Never «any host» — no `*` alone, no `*.<TLD>`. A
 *  bare label (`com`, `lan`) is a HOST NAME, not a wildcard: it covers ONLY itself (src/vault-use-grant.js `hostCovers`
 *  requires a dot before it may match subdomains — a single label can never stand for everything under it). */
const _L = '[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?';   // round 3 (MINOR): a DNS label never starts or ends with a hyphen (`bad-.com` refused)
const HOST_TOKEN_RE = new RegExp(`^(?:@entry|(?:${_L}(?:\\.${_L})*\\.?|\\*(?:\\.${_L}){2,}|\\[[0-9a-f:.]{2,45}\\])(?::\\d{1,5})?|[0-9a-f]{0,4}(?::[0-9a-f]{0,4}){2,7})$`, 'i');
const HOSTS_MAX = 16;
const JOB_ID_RE = /^jb-[0-9a-f]{8}$/;   // lane vault-job-road: a Background Work job's id (src/jobs.js rid)
const JOBS_MAX = 64;
// lane vault-use-grants round 3 (item 5): the small public-suffix list (the top multi-label registry boundaries). A
// wildcard whose BASE is one of these (`*.co.uk`) spans unrelated parties, so it is refused; the full PSL stays backlog. A
// wildcard over a MULTI-TENANT registrable domain (`*.amazonaws.com`, `*.github.io`) is allowed but said in words on the card.
const PUBLIC_SUFFIXES = new Set(['co.uk', 'org.uk', 'gov.uk', 'ac.uk', 'me.uk', 'ltd.uk', 'plc.uk', 'net.uk', 'sch.uk', 'com.au', 'net.au', 'org.au', 'edu.au', 'gov.au', 'id.au', 'co.nz', 'net.nz', 'org.nz', 'govt.nz', 'co.jp', 'ne.jp', 'or.jp', 'go.jp', 'ac.jp', 'co.za', 'org.za', 'com.br', 'net.br', 'gov.br', 'com.cn', 'net.cn', 'org.cn', 'gov.cn', 'com.mx', 'com.sg', 'com.hk', 'co.in', 'co.kr', 'com.tr', 'co.il']);
const ipv4ok = (h) => !/^\d{1,3}(?:\.\d{1,3}){3}$/.test(h) || h.split('.').every((o) => Number(o) <= 255);   // round 3 (MINOR): a dotted-quad's octets are ≤ 255 (1.2.3.999 refused)
// lane vault-use-grants round 5 (MAJOR item 5): a single-label host spelled like a URL scheme the tools know (curl's
// Protocols + the ssh family) is NEVER grantable — a command's scheme-shaped token (`ftp:/HOST`, `http://http/`) would read
// the SCHEME WORD as a host and falsely match such a grant, sending the value where the word, not the owner, points. The
// grant is refused at mint (`scheme_word_host`); the run always draws the card. (The reader also BLINDS the token — src/vault-run.js.)
const SCHEME_WORD_HOSTS = new Set(['dict', 'file', 'ftp', 'ftps', 'gopher', 'gophers', 'http', 'https', 'imap', 'imaps', 'ipfs', 'ipns', 'ldap', 'ldaps', 'mqtt', 'pop3', 'pop3s', 'rtmp', 'rtmpe', 'rtmps', 'rtmpt', 'rtmpte', 'rtmpts', 'rtsp', 'scp', 'sftp', 'smb', 'smbs', 'smtp', 'smtps', 'telnet', 'tftp', 'ws', 'wss', 'ssh', 'svn', 'git', 'rsync']);
/** A single host token is valid: the shape grammar + a port in 1..65535 + IPv4 octets ≤ 255 + a wildcard base that is
 *  neither numeric nor a public suffix (round 3, item 5 + ports MINOR). → the normalized token | null. */
function hostTokenOk(h) {
  if (h === '@entry') return '@entry';
  if (h.length > 253 || !HOST_TOKEN_RE.test(h)) return null;
  const m = /:(\d{1,5})$/.exec(h.replace(/^\[.*\]/, ''));   // a :port (not inside IPv6 brackets)
  if (m) { const p = Number(m[1]); if (!(p >= 1 && p <= 65535)) return null; }
  const n = h.replace(/\.$/, '').replace(/^\[(.*)\]$/, '$1');
  const bare = n.replace(/:(\d{1,5})$/, '').replace(/^\[(.*)\]$/, '$1');
  if (!ipv4ok(bare)) return null;
  if (bare.startsWith('*.')) {
    const base = bare.slice(2);
    const labels = base.split('.');
    if (/^\d+$/.test(labels[labels.length - 1])) return null;   // a wildcard never ends in a numeric label (never an address: *.1.1, *.168.1.1)
    if (PUBLIC_SUFFIXES.has(base)) return null;                 // a wildcard over a public suffix is refused
  }
  if (!bare.includes('.') && !bare.includes(':') && !bare.startsWith('*') && SCHEME_WORD_HOSTS.has(bare)) return null;   // round 5 item 5: a single label that IS a URL scheme word is not grantable
  return n;
}
/** A `hosts` value → its normal list (lower-cased, a trailing dot and IPv6 brackets dropped, deduplicated, ≤ HOSTS_MAX) |
 *  null when it is not a non-empty list of host tokens (the entry is then refused at a write, dropped at a read). */
function hostListOf(v) {
  if (!Array.isArray(v) || !v.length || v.length > HOSTS_MAX) return null;
  const out = [];
  for (const x of v) {
    const h = String(x == null ? '' : x).trim().toLowerCase();
    const n = hostTokenOk(h);
    if (n === null) return null;
    if (n && !out.includes(n)) out.push(n);
  }
  return out.length ? out : null;
}

// ── principals ──────────────────────────────────────────────────────────────
/** A principal's identity — `everyone` | `group:<id>` | `conversation:<key>` (the dedup unit, the audit's word). */
function principalKey(p) {
  if (!p || typeof p !== 'object') return null;
  if (p.kind === 'everyone') return 'everyone';
  if (p.kind === 'group') return `group:${p.id}`;
  if (p.kind === 'conversation') return `conversation:${p.key}`;
  return null;
}
/** The bare principal (kind + id/key), or null when it is not one. */
function bareOf(p) {
  if (!p || typeof p !== 'object') return null;
  if (p.kind === 'everyone') return { kind: 'everyone' };
  if (p.kind === 'group') { const id = str(p.id); return GROUP_ID_RE.test(id) ? { kind: 'group', id } : null; }
  if (p.kind === 'conversation') { const key = str(p.key); return CONVERSATION_KEY_RE.test(key) ? { kind: 'conversation', key } : null; }
  return null;
}
/** A `to` entry as stored for `door`: the bare principal + its annotations (`name`, `at`, `by`, the door's own
 *  fields). `strict` (the write) ⇒ a bad annotation value refuses the entry (null); the read drops the ENTRY too (an
 *  entry whose setting cannot be read is never read as some other setting — it narrows). */
function normEntry(e, door) {
  const b = bareOf(e);
  if (!b) return null;
  const out = { ...b };
  const name = cleanName(e.name);
  if (name && b.kind !== 'everyone') out.name = name;
  if (Number.isFinite(Number(e.at)) && e.at !== null && e.at !== undefined && e.at !== '') out.at = Number(e.at);
  if (typeof e.by === 'string' && e.by) out.by = e.by.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 64);
  const fields = ENTRY_FIELDS[door] || {};
  for (const [f, allowed] of Object.entries(fields)) {
    if (e[f] === undefined || e[f] === null) continue;
    if (allowed === 'count') { const n = Math.floor(Number(e[f])); if (!(n > 0) || n > 100000) return null; out[f] = n; continue; }
    if (allowed === 'jobs') { const v = e[f]; if (!Array.isArray(v) || !v.length || v.length > JOBS_MAX || !v.every((x) => JOB_ID_RE.test(String(x)))) return null; out[f] = [...new Set(v.map(String))]; continue; }   // lane vault-job-road
    if (allowed === 'hosts') { const h = hostListOf(e[f]); if (!h) return null; out[f] = h; continue; }   // lane vault-use-grants
    if (allowed === 'tool') { const t = String(e[f]).toLowerCase(); if (!/^[a-z0-9][a-z0-9.+-]{0,39}$/.test(t)) return null; out[f] = t; continue; }   // lane vault-use-grants round 3: the CLI a wildcard default is granted to
    if (allowed === 'toolmap') { const v = e[f]; if (!v || typeof v !== 'object' || Array.isArray(v)) return null; const keys = Object.keys(v); if (keys.length > HOSTS_MAX) return null; const m = {}; for (const k of keys) { const hk = hostTokenOk(String(k).trim().toLowerCase()); const tv = String(v[k]).toLowerCase(); if (hk === null || hk === '@entry' || !/^[a-z0-9][a-z0-9.+-]{0,39}$/.test(tv)) return null; m[hk] = tv; } if (Object.keys(m).length) out[f] = m; continue; }   // lane vault-use-grants round 4 item 3: host → the CLI that minted its wildcard grant
    if (allowed === 'mac') { if (!/^[0-9a-f]{64}$/.test(String(e[f]))) return null; out[f] = String(e[f]); continue; }   // lane vault-use-grants round 3: the vault's HMAC over the canonical member
    if (allowed === 'time') { const n = Math.floor(Number(e[f])); if (!(n > 0) || n > 8.64e15) return null; out[f] = n; continue; }
    if (!allowed.includes(e[f])) return null;
    out[f] = e[f];
  }
  return out;
}
/** An `except` entry: a conversation or a Task Group — never everyone, never annotated beyond a display name. */
function normExcept(e) {
  const b = bareOf(e);
  if (!b || b.kind === 'everyone') return null;
  const name = cleanName(e && e.name);
  return name ? { ...b, name } : b;
}

// ── the row ─────────────────────────────────────────────────────────────────
/** A stored row read back → `{ok:true, row}` | `{ok:false, code:'unknown_shape', why}`. Malformed `to` entries are
 *  DROPPED (narrowing); one malformed `except` entry voids the row (widening is never a guess). */
function normRow(r) {
  if (!r || typeof r !== 'object' || Array.isArray(r)) return { ok: false, code: 'unknown_shape', why: 'not a row' };
  if (!DOORS.includes(r.door)) return { ok: false, code: 'unknown_shape', why: `a door this release cannot judge (${str(r.door).slice(0, 40)})` };
  const resource = str(r.resource);
  if (!RESOURCE_RE.test(resource)) return { ok: false, code: 'unknown_shape', why: 'no resource' };
  if (!resourceShapeOk(r.door, resource)) return { ok: false, code: 'unknown_shape', why: `a ${r.door} resource of another shape` };   // lane browser-login
  if (r.to !== undefined && !Array.isArray(r.to)) return { ok: false, code: 'unknown_shape', why: '`to` is not a list' };
  if (r.except !== undefined && !Array.isArray(r.except)) return { ok: false, code: 'unknown_shape', why: '`except` is not a list' };
  const to = [], seen = new Set();
  for (const e of r.to || []) {
    const n = normEntry(e, r.door);
    if (!n || seen.has(principalKey(n))) continue;
    seen.add(principalKey(n)); to.push(n);
    if (to.length >= LIST_MAX) break;
  }
  const except = [], seenX = new Set();
  for (const e of r.except || []) {
    const n = normExcept(e);
    if (!n) return { ok: false, code: 'unknown_shape', why: 'an exception this release cannot read — the whole grant is refused rather than read wider' };
    if (seenX.has(principalKey(n))) continue;
    seenX.add(principalKey(n)); except.push(n);
  }
  if (except.length > LIST_MAX) return { ok: false, code: 'unknown_shape', why: 'too many exceptions' };
  const row = { door: r.door, resource, to, except };
  if (Number.isFinite(Number(r.at)) && r.at !== null && r.at !== undefined) row.at = Number(r.at);
  if (typeof r.by === 'string' && r.by) row.by = r.by.slice(0, 64);
  return { ok: true, row };
}

/**
 * THE WRITE'S VERDICT (the ONE writer, src/server/grants-store.js `set`, asks it) — strict where the read is
 * tolerant: every entry must be one (`bad_principal` / `bad_except` by name, never dropped quietly), at most LIST_MAX
 * each (`too_many`), a principal both given and excepted is a contradiction (`except_conflicts` — the picker greys a
 * member with its own row «有自己的授权»). → `{ok:true, row}` | `{ok:false, code, error}`.
 */
function validateWrite(door, resource, { to = [], except = [] } = {}, { at = null, by = null } = {}) {
  const no = (code, error) => ({ ok: false, code, error });
  if (!DOORS.includes(door)) return no('unknown_door', `no door "${str(door).slice(0, 40)}" — one of ${DOORS.join(', ')}`);
  if (!RESOURCE_RE.test(str(resource))) return no('bad_resource', 'a resource is a non-empty id (≤ 400 characters, no control characters)');
  if (!resourceShapeOk(door, resource)) return no('bad_resource', `a ${door} resource is ${door === 'browser-login' ? '<origin>#<user>, <origin>#* or *' : door === 'vault-use' || door === 'vault-job' ? 'a vault entry id <store>:<entry>#<field>' : 'of its own shape'}`);   // lane browser-login
  if (!Array.isArray(to)) return no('bad_row', '`to` must be a list');
  if (!Array.isArray(except)) return no('bad_row', '`except` must be a list');
  if (to.length > LIST_MAX || except.length > LIST_MAX) return no('too_many', `at most ${LIST_MAX} entries in "to" and in "except"`);
  const outTo = [], seen = new Set();
  for (const e of to) {
    const n = normEntry(e, door);
    if (!n) return no('bad_principal', `${JSON.stringify(e).slice(0, 80)} is not one of: everyone, a Task Group {kind:'group', id}, a conversation {kind:'conversation', key}${ENTRY_FIELDS[door] ? ` (with ${Object.keys(ENTRY_FIELDS[door]).join(' / ')} as this door allows)` : ''}`);
    if (seen.has(principalKey(n))) continue;
    seen.add(principalKey(n)); outTo.push(n);
  }
  const outX = [], seenX = new Set();
  for (const e of except) {
    const n = normExcept(e);
    if (!n) return no('bad_except', `${JSON.stringify(e).slice(0, 80)} cannot be an exception — an exception names a conversation or a Task Group`);
    if (seenX.has(principalKey(n))) continue;
    if (seen.has(principalKey(n))) return no('except_conflicts', `${principalKey(n)} is both given and excepted — a member with its own grant here cannot also be left out of it`);
    seenX.add(principalKey(n)); outX.push(n);
  }
  const row = { door, resource: str(resource), to: outTo, except: outX };
  if (Number.isFinite(Number(at)) && at !== null) row.at = Number(at);
  if (typeof by === 'string' && by) row.by = by.slice(0, 64);
  return { ok: true, row };
}

// ── the verdict ─────────────────────────────────────────────────────────────
/** The caller's facts, normalized: its keys (a Set), its groups (a Set), the two fault flags. */
function factsOf(f = {}) {
  const keys = new Set();
  for (const k of [f.conversationKey, ...(Array.isArray(f.conversationKeys) ? f.conversationKeys : [])]) if (k !== undefined && k !== null && k !== '') keys.add(String(k));
  const groups = new Set((Array.isArray(f.groupIds) ? f.groupIds : []).filter((g) => g !== undefined && g !== null && g !== '').map(String));
  return { keys, groups, unreadable: !!f.groupsUnreadable, forkPending: !!f.forkPending };
}
const SPECIFIC = Object.freeze({ conversation: 2, group: 1, everyone: 0 });
/** ONE row against the caller → `{state:'ok', hits}` | `{state:'excepted', entry}` | `{state:'unreadable'}` |
 *  `{state:'unknown', why}` | `{state:'no'}`. */
function judgeRow(raw, F) {
  const n = normRow(raw);
  if (!n.ok) return { state: 'unknown', why: n.why };
  const row = n.row;
  let exceptUndecided = false;
  for (const x of row.except) {
    if (x.kind === 'conversation' && F.keys.has(x.key)) return { state: 'excepted', row, entry: x };
    if (x.kind === 'group') { if (F.groups.has(x.id)) return { state: 'excepted', row, entry: x }; if (F.unreadable) exceptUndecided = true; }
  }
  const hits = [];
  let groupUndecided = false;
  for (const e of row.to) {
    if (e.kind === 'everyone') { if (F.keys.size) hits.push(e); }
    else if (e.kind === 'conversation') { if (F.keys.has(e.key)) hits.push(e); }
    else if (e.kind === 'group') { if (F.groups.has(e.id)) hits.push(e); else if (F.unreadable) groupUndecided = true; }
  }
  if (hits.length) return exceptUndecided ? { state: 'unreadable', row } : { state: 'ok', row, hits: hits.sort((a, b) => SPECIFIC[b.kind] - SPECIFIC[a.kind]) };
  if (groupUndecided) return { state: 'unreadable', row };
  return { state: 'no', row };
}
/**
 * May this caller use what `rows` grant? → `{ok:true, via:'conversation'|'group'|'everyone', row, entry, hits}` (the
 * most SPECIFIC admitting entry is named: its own > a group's > everyone; `hits` = every admitting `{row, entry}`, for a
 * door that combines settings, e.g. MAX of tiers) | `{ok:false, code, row?, entry?, why?}` — `entry` on `excepted` is
 * the exception that decided (the door names it and where it is lifted).
 */
function admits(rows, facts = {}) {
  const F = factsOf(facts);
  const hits = [];
  let excepted = null, unknown = null, unreadable = null;
  for (const raw of Array.isArray(rows) ? rows : rows ? [rows] : []) {
    const j = judgeRow(raw, F);
    if (j.state === 'ok') for (const e of j.hits) hits.push({ row: j.row, entry: e });
    else if (j.state === 'excepted') excepted = excepted || j;
    else if (j.state === 'unreadable') unreadable = unreadable || j;
    else if (j.state === 'unknown') unknown = unknown || j;
  }
  if (hits.length) {
    hits.sort((a, b) => SPECIFIC[b.entry.kind] - SPECIFIC[a.entry.kind]);
    return { ok: true, via: hits[0].entry.kind, row: hits[0].row, entry: hits[0].entry, hits };
  }
  if (unreadable) return { ok: false, code: 'groups_unreadable', row: unreadable.row };
  if (unknown) return { ok: false, code: 'unknown_shape', why: unknown.why };
  if (excepted) return { ok: false, code: 'excepted', row: excepted.row, entry: excepted.entry };
  if (F.forkPending) return { ok: false, code: 'fork_pending' };
  return { ok: false, code: 'not_granted' };
}
/** Every admitting `{row, entry}` (a MAX door's input) — `admits(...).hits`, [] when refused. */
function hitsOf(rows, facts = {}) { const v = admits(rows, facts); return v.ok ? v.hits : []; }
/** Do two conversations share a Task Group (msg-acl's «same group ⇒ full mutual reach» default — not a stored grant, but
 *  a membership test, so it lives here with every other one)? */
function sharesGroup(groupsA, groupsB) {
  const b = new Set((Array.isArray(groupsB) ? groupsB : []).filter(Boolean).map(String));
  return (Array.isArray(groupsA) ? groupsA : []).some((g) => g && b.has(String(g)));
}
/** Is this principal NAMED by a row — in `to` or `except` (the permissions window's «rows that name X»)? */
function names(row, principal) {
  const n = normRow(row), k = principalKey(bareOf(principal));
  if (!n.ok || !k) return { to: false, except: false };
  return { to: n.row.to.some((e) => principalKey(e) === k), except: n.row.except.some((e) => principalKey(e) === k) };
}

// ── what a page may see ─────────────────────────────────────────────────────
/** A row as a page (the owner's views, the broadcast) sees it — ids, kinds, names, the door's settings; never a value
 *  (a row holds none) and never a malformed field: an unreadable row is answered as `{door, resource, unknown:true}`. */
function publicRow(r) {
  const n = normRow(r);
  if (!n.ok) return { door: DOORS.includes(r && r.door) ? r.door : null, resource: str(r && r.resource).slice(0, 400) || null, unknown: true, why: n.why };
  return JSON.parse(JSON.stringify(n.row));
}
const rowKey = (door, resource) => `${door}\u0000${resource}`;

/**
 * The principals of a row read against the ROSTER a page draws from (`{sessions:[{id, name, backendSessionId |
 * claudeSessionId}], groups:[{id, title|name, archived}]}`) at the moment the words are drawn: the same principals (ids
 * untouched — a save writes exactly them) with `name` = a live conversation's / a listed group's CURRENT name, or the
 * stored name plus `absent: 'conversation'` («not running now») / `absent: 'group'` («not in the list now»). Everyone
 * is never absent. (window-reach `principalsNow`'s rule, in the one spelling.)
 */
function namesNow(principals, roster) {
  const live = new Map();
  for (const s of roster && Array.isArray(roster.sessions) ? roster.sessions : []) {
    if (!s || !s.id) continue;
    for (const k of conversationKeysOf(s, s.id)) if (!live.has(k)) live.set(k, s);
  }
  const listed = new Map();
  for (const g of roster && Array.isArray(roster.groups) ? roster.groups : []) if (g && g.id && !g.archived) listed.set(String(g.id), g);
  return (Array.isArray(principals) ? principals : []).map((p) => {
    if (!p || typeof p !== 'object') return p;
    if (p.kind === 'everyone') return { kind: 'everyone' };
    if (p.kind === 'conversation') { const s = live.get(String(p.key)); return s ? { ...p, name: cleanName(s.name) || p.name || String(p.key).slice(0, 8) } : { ...p, absent: 'conversation' }; }
    const g = listed.get(String(p.id));
    return g ? { ...p, name: cleanName(g.title || g.name) || String(p.id) } : { ...p, absent: 'group' };
  });
}

// ── the one spelling ────────────────────────────────────────────────────────
/** A live session's conversation key — its conversation id, else `webui:<id>`. */
function conversationKeyOf(s, webuiId) {
  const cid = s && (s.backendSessionId || s.claudeSessionId);
  return cid ? String(cid) : `webui:${webuiId}`;
}
/** Every key a live session answers to: its conversation id AND its webui key (a grant written before it had an id). */
function conversationKeysOf(s, webuiId) {
  const out = [conversationKeyOf(s, webuiId)];
  if (webuiId !== undefined && webuiId !== null && webuiId !== '') { const w = `webui:${webuiId}`; if (!out.includes(w)) out.push(w); }
  return out;
}
/** exit / windows' `<backend>:<cid>` (and `webui:<id>`) → the one spelling. */
function keyFromSessionKey(k) {
  const s = str(k);
  if (/^webui:/.test(s)) return CONVERSATION_KEY_RE.test(s) ? s : null;
  const m = /^[a-z][a-z0-9_-]{0,31}:(.+)$/.exec(s);
  return m && CONVERSATION_KEY_RE.test(m[1]) ? m[1] : null;
}
/** automation's `session:<cid>` → the one spelling (null for `group:` / `external` / junk). */
function keyFromSubject(s) { const m = /^session:(.+)$/.exec(str(s)); return m && CONVERSATION_KEY_RE.test(m[1]) ? m[1] : null; }
// ── legacy shapes → rows (the migration's mappers; each refuses an unmappable shape by returning `unknown`) ──────
/** A legacy principal of the window / exit spelling (`{kind:'session'|'group'|'everyone', id}`) → a principal. */
function fromSessionPrincipal(p) {
  if (!p || typeof p !== 'object') return null;
  if (p.kind === 'everyone') return { kind: 'everyone' };
  if (p.kind === 'group') return bareOf({ kind: 'group', id: p.id, name: p.name });
  if (p.kind === 'session') { const key = keyFromSessionKey(p.id); return key ? { kind: 'conversation', key } : null; }
  return null;
}
const withName = (b, name) => (b && name && b.kind !== 'everyone' && cleanName(name) ? { ...b, name: cleanName(name) } : b);
/** exit `use` / `run` (`{mode:'nobody'|'everyone'|'only', who}`; `allowExit:true` arrives as everyone) → `{to}` | null
 *  (nobody ⇒ no row) | `{unknown:true}`. `everyone` KEEPS its rows (restored when All is taken away). */
function fromExitGrant(g) {
  if (!g || typeof g !== 'object' || Array.isArray(g)) return { unknown: true };
  if (!['nobody', 'everyone', 'only'].includes(g.mode)) return { unknown: true };
  if (g.mode === 'nobody') return null;
  const to = g.mode === 'everyone' ? [{ kind: 'everyone' }] : [];
  for (const w of Array.isArray(g.who) ? g.who : []) { if (w && w.kind === 'everyone') continue; const p = fromSessionPrincipal(w); if (p) to.push(p); }
  return { to };
}
/** The hub list the OLD exit reader could read (exit-reach `normHub` before this lane): absent, or one of hub-act-policy's
 *  POLICIES (test-grant-model pins the copy) — anything else, a spelled-out `default` included (the old writer never stored
 *  one), made the WHOLE access unknown: both lists refused (verify F4). */
const OLD_HUB_MODES = Object.freeze(['nobody', 'everyone', 'ask']);
const oldHubReadable = (hub) => hub === undefined || hub === null || (!!hub && typeof hub === 'object' && !Array.isArray(hub) && OLD_HUB_MODES.includes(hub.mode));
/** A host record's exit (every shape: `exit` present, legacy `allowExit:true`, absent) → `{use, run}` each as
 *  `fromExitGrant` answers (unknown exit — or a hub the old reader could not read — ⇒ both unknown: the old reader
 *  refused both). */
function fromHostExit(h) {
  if (!h || typeof h !== 'object') return { use: null, run: null };
  if (h.exit !== undefined) {
    const e = h.exit;
    if (!e || typeof e !== 'object' || Array.isArray(e)) return { use: { unknown: true }, run: { unknown: true } };
    if (e.use === undefined && e.run === undefined) return { use: null, run: null };   // a record written after the unify (no lists on it)
    if (!oldHubReadable(e.hub)) return { use: { unknown: true }, run: { unknown: true } };
    const use = fromExitGrant(e.use), run = fromExitGrant(e.run);
    if ((use && use.unknown) || (run && run.unknown)) return { use: { unknown: true }, run: { unknown: true } };
    return { use, run };
  }
  if (h.allowExit === true) return { use: { to: [{ kind: 'everyone' }] }, run: { to: [{ kind: 'everyone' }] } };
  return { use: null, run: null };
}
/**
 * A browser profile's `owner` → `{to}` | `{unknown:true}` | `{ephemeral:true}` (a conversation's own temporary browser
 * is NOT a grant — never shareable, never a picker's; the keeper judges it as itself). A `bk-…` browser key is spelled
 * by `browserKeyResolver(resolveBrowserKey)` — its bound conversation, else the key itself (a malformed one cannot be
 * carried and is dropped: the migration's equivalence check then refuses if a live conversation held it). Shapes: legacy / null / missing / instance ⇒
 * everyone (+ its kept rows); `only` ⇒ its rows; the pre-list singles `{kind:'session'|'task', id}` ⇒ that row.
 */
const EPHEMERAL_KEY_RE = /^bk-[0-9a-f]{8}(\.\d{1,4})?$/;   // browser-profiles isEphemeralProfile's key rule (a conversation's key or a helper's)
const CHILD_KEY_RE = /^bk-[0-9a-f]{8}\.\d{1,4}$/;   // browser-profiles' helper key (test-grant-model pins the copy)
/** A helper's browser key → its conversation's (browser-profiles `parentKeyOf`: the old reader collapsed a helper's key into
 *  its parent's, on the list and on the caller alike — so does the keeper's caller keys). */
const parentKeyOf = (bk) => { const s = str(bk); return CHILD_KEY_RE.test(s) ? s.slice(0, s.indexOf('.')) : s; };
/** THE ONE SPELLING of a pre-list browser key (the migration's — verify F6): a helper's key is its parent's; then the
 *  conversation its binding names, else the key ITSELF — a key no binding names stands for its own conversation (the
 *  keeper's caller keys carry it). `resolveBrowserKey(bk)` → the bound conversation id | null (none handed in ⇒ every key
 *  stands for itself). */
function browserKeyResolver(resolveBrowserKey = null) {
  return (bk) => { const k = parentKeyOf(bk); let c = null; try { c = typeof resolveBrowserKey === 'function' ? resolveBrowserKey(k) : null; } catch { c = null; } return c || k; };
}
function fromBrowserOwner(profile, { resolveBrowserKey = null } = {}) {
  const p = profile && typeof profile === 'object' ? profile : null;
  const resolveKey = browserKeyResolver(resolveBrowserKey);
  if (!p) return { unknown: true };
  if (p.ephemeral === true && p.owner && p.owner.kind === 'conversation' && EPHEMERAL_KEY_RE.test(str(p.owner.id))) return { ephemeral: true };
  const row = (w) => {
    if (!w || typeof w !== 'object') return null;
    if (w.kind === 'task') return bareOf({ kind: 'group', id: w.id });
    if (w.kind === 'session') { if (!EPHEMERAL_KEY_RE.test(str(w.id))) return null; const key = resolveKey(str(w.id)); return key && CONVERSATION_KEY_RE.test(key) ? { kind: 'conversation', key } : null; }
    return null;
  };
  if (p.legacy) return { to: [{ kind: 'everyone' }] };
  const o = p.owner;
  if (o === undefined || o === null) return { to: [{ kind: 'everyone' }] };
  if (typeof o !== 'object' || Array.isArray(o)) return { unknown: true };
  const uniq = (list) => list.filter((e, i) => e && list.findIndex((x) => x && principalKey(x) === principalKey(e)) === i);   // a helper's key and its parent's are ONE entry
  if (o.kind === 'instance') return { to: uniq([{ kind: 'everyone' }, ...(Array.isArray(o.who) ? o.who.map(row) : [])]) };
  // a pre-list single: a malformed id is an owner the old reader could not read (unknown); a well-formed browser key is carried
  // as its conversation, else as itself (browserKeyResolver)
  if (o.kind === 'session' || o.kind === 'task') { const r = row(o); return r ? { to: [r] } : (o.kind === 'task' || !EPHEMERAL_KEY_RE.test(str(o.id)) ? { unknown: true } : { to: [] }); }
  if (o.kind === 'only' && Array.isArray(o.who)) return { to: uniq(o.who.map(row)) };
  return { unknown: true };
}
/** A window-reach record `{rows:[{principal, grantedAt, by}]}` → `{to}` (each entry its `origin`, `at`, `name`). */
function fromWindowRecord(rec) {
  const to = [];
  for (const r of rec && Array.isArray(rec.rows) ? rec.rows : []) {
    const p = fromSessionPrincipal(r && r.principal);
    if (!p) continue;
    to.push({ ...withName(p, r.principal.name), ...(Number(r.grantedAt) ? { at: Number(r.grantedAt) } : {}), origin: ['user', 'request', 'self-open'].includes(r.by) ? r.by : 'user' });
  }
  return { to };
}
/** An automation grant's subject (`session:<cid>` | `group:<id>` | `everyone:*` | `external`) → a principal (null for
 *  external — an outside caller is not a conversation; automation judges it by its own rule). `everyone:*` = ALL AGENTS
 *  (lane key-grant-everyone: every conversation, the ones started later included — the picker's row key, one spelling). */
function fromSubject(s) {
  const t = str(s);
  if (t === 'everyone:*') return { kind: 'everyone' };
  if (/^group:/.test(t)) return bareOf({ kind: 'group', id: t.slice('group:'.length) });
  const k = keyFromSubject(t);
  return k ? { kind: 'conversation', key: k } : null;
}
/** One automation grant record → its use row's `{to}` (null for `external`). */
function fromAutomationGrant(g) { const p = g && fromSubject(g.subject); return p ? { to: [p] } : null; }
/** An automation grant's `reach` → `{to}` | null ('opened' or absent — the key's openings only, automation's own rung) |
 *  `{unknown:true}`. 'instance' ⇒ everyone; `{taskGroups}` ⇒ those groups. */
function fromAutomationReach(r) {
  if (r === undefined || r === null || r === 'opened') return null;
  if (r === 'instance') return { to: [{ kind: 'everyone' }] };
  if (r && typeof r === 'object' && !Array.isArray(r) && Array.isArray(r.taskGroups) && Object.keys(r).length === 1) {
    const to = r.taskGroups.map((g) => bareOf({ kind: 'group', id: g }));
    if (to.length && to.every(Boolean)) return { to };
  }
  return { unknown: true };
}
/** A channel principal (`{kind:'agent'|'group'|'everyone', id, name}`) → a principal. */
function fromChannelPrincipal(p) {
  if (!p || typeof p !== 'object') return null;
  if (p.kind === 'everyone') return { kind: 'everyone' };
  if (p.kind === 'group') return withName(bareOf({ kind: 'group', id: p.id }), p.name);
  if (p.kind === 'agent') return withName(bareOf({ kind: 'conversation', key: p.id }), p.name);
  return null;
}
/** A principal → the channel spelling (`agent` / `group` / `everyone:'*'`) the channel models keep speaking. */
function toChannelPrincipal(p) {
  if (!p) return null;
  if (p.kind === 'everyone') return { kind: 'everyone', id: '*', name: null };
  if (p.kind === 'group') return { kind: 'group', id: p.id, name: p.name || null };
  if (p.kind === 'conversation') return { kind: 'agent', id: p.key, name: p.name || null };
  return null;
}
/** A grain's ACCESS list (`[{principal, authority, createdAt, createdBy}]`) → `{to}` (each entry its `authority`). */
function fromChannelAccess(access) {
  const to = [];
  for (const a of Array.isArray(access) ? access : []) {
    const p = fromChannelPrincipal(a && a.principal);
    if (!p) continue;
    to.push({ ...p, authority: a.authority === 'send' ? 'send' : 'draft', ...(Number(a.createdAt) ? { at: Number(a.createdAt) } : {}), ...(typeof a.createdBy === 'string' && a.createdBy ? { by: a.createdBy.slice(0, 64) } : {}) });
  }
  return { to };
}
/** channel-acl rows of one origin on one scope (`reachEntries` of origin user / request) → `{to}` (each its `level`). */
function fromChannelRows(rows) {
  const to = [];
  for (const g of Array.isArray(rows) ? rows : []) {
    const p = fromChannelPrincipal(g && g.principal);
    if (!p || !['visible', 'requestable'].includes(g.level)) continue;
    to.push({ ...p, level: g.level, ...(Number(g.at) ? { at: Number(g.at) } : {}), ...(typeof g.by === 'string' && g.by ? { by: g.by.slice(0, 64) } : {}) });
  }
  return { to };
}
/** The raw-API rows of one credential → `{to}` (each its `tier`, `perDay`). */
function fromChannelApiRows(rows) {
  const to = [];
  for (const g of Array.isArray(rows) ? rows : []) {
    const p = fromChannelPrincipal(g && g.principal);
    if (!p || !['none', 'read', 'write-ask', 'write-auto', 'write-all'].includes(g.api)) continue;
    to.push({ ...p, tier: g.api, ...(Number(g.perDay) > 0 ? { perDay: Math.min(100000, Math.floor(Number(g.perDay))) } : {}), ...(Number(g.at) ? { at: Number(g.at) } : {}) });
  }
  return { to };
}
/** A grain's WATCHERS → `{to}` (who that grain's notification may wake; a member watcher saved through its group's
 *  access (`via`) is the conversation itself). */
function fromChannelWatchers(watchers) {
  const to = [];
  for (const w of Array.isArray(watchers) ? watchers : []) { const p = fromChannelPrincipal(w && w.principal); if (p) to.push(p); }
  return { to };
}
/** A Task Group's `externalVisibility` → `{to:[that group at the level]}` | null ('none' / absent / unknown — the
 *  group stays opaque, the old reader's `none`). */
function fromGroupVisibility(level, groupId) {
  if (level !== 'visible' && level !== 'messageable') return null;
  const g = bareOf({ kind: 'group', id: groupId });
  return g ? { to: [{ ...g, level }] } : null;
}

// ── whole pre-unify stores → rows (the migration's per-store mappers; the suites' fixtures use the same) ─────────
/** hosts.json's records → `{rows, unknown}`: each machine's `use` / `run` list as a row `exit` / `<id>:use|run` (nobody ⇒
 *  no row); a record whose exit the old reader could not read (`unknown` — it refused both) carries no row (nobody —
 *  still refused) and is NAMED in `unknown`. `asks` = the machines whose `run` asked each time (the record's new `ask`). */
function rowsOfHosts(hosts) {
  const rows = [], unknown = [], asks = [];
  for (const h of Array.isArray(hosts) ? hosts : []) {
    if (!h || typeof h !== 'object' || typeof h.id !== 'string' || !h.id) continue;
    const m = fromHostExit(h);
    if ((m.use && m.use.unknown) || (m.run && m.run.unknown)) { unknown.push(h.id); continue; }
    if (m.use && m.use.to.length) rows.push({ door: 'exit', resource: `${h.id}:use`, to: m.use.to, except: [] });
    if (m.run && m.run.to.length) rows.push({ door: 'exit', resource: `${h.id}:run`, to: m.run.to, except: [] });
    if (h.exit && h.exit.run && h.exit.run.ask === true) asks.push(h.id);
  }
  return { rows, unknown, asks };
}

/** browser-profiles.json's records → `{rows, unknown, ephemeral, dropped}`: each NAMED profile's "Who can use it" as a row
 *  `browser-profile` / `<profileId>` (legacy / instance / missing owner ⇒ everyone; a conversation's own temporary
 *  browser is no grant — counted in `ephemeral`); a `bk-…` key is carried as the conversation it is bound to, else as
 *  itself (`browserKeyResolver` — THE migration's spelling; a malformed one is dropped — counted, by profile, in `dropped`); an owner the old reader could not
 *  read (it refused everyone) carries no row and is NAMED in `unknown`. */
function rowsOfBrowserProfiles(profiles, { resolveBrowserKey = null } = {}) {
  const rows = [], unknown = [], dropped = [];
  let ephemeral = 0;
  for (const p of Array.isArray(profiles) ? profiles : []) {
    if (!p || typeof p !== 'object' || typeof p.id !== 'string' || !p.id) continue;
    const m = fromBrowserOwner(p, { resolveBrowserKey });
    if (m.ephemeral) { ephemeral++; continue; }
    if (m.unknown) { unknown.push(p.id); continue; }
    const o = p.owner && typeof p.owner === 'object' ? p.owner : null;
    const had = o ? (o.kind === 'only' || o.kind === 'instance' ? (Array.isArray(o.who) ? o.who.length : 0) : (o.kind === 'session' || o.kind === 'task') ? 1 : 0) : 0;
    const carried = m.to.filter((e) => e.kind !== 'everyone').length;
    if (!p.legacy && carried < had) dropped.push({ id: p.id, rows: had - carried });
    rows.push({ door: 'browser-profile', resource: p.id, to: m.to, except: [] });
  }
  return { rows, unknown, ephemeral, dropped };
}

/** automation-keys.json's grants → `{rows, unknown, external}`: each grant's subject as its use row (`automation-key-use` /
 *  `<grantId>`) and a reach wider than 'opened' as its reach row (`automation-key-reach` / `<grantId>`); an `external` grant
 *  (an outside caller — no conversation) carries no row (counted); a grant whose reach the old reader voided (it was NO
 *  grant) carries no row and is NAMED in `unknown`. */
function rowsOfAutomationGrants(grants) {
  const rows = [], unknown = [];
  let external = 0;
  for (const g of Array.isArray(grants) ? grants : []) {
    if (!g || typeof g !== 'object' || typeof g.id !== 'string' || !g.id) continue;
    if (g.subject === 'external') { external++; continue; }
    const r = fromAutomationReach(g.reach);
    const u = fromAutomationGrant(g);
    if (!u || (r && r.unknown)) { unknown.push(g.id); continue; }
    rows.push({ door: 'automation-key-use', resource: g.id, to: u.to, except: [] });
    if (r) rows.push({ door: 'automation-key-reach', resource: g.id, to: r.to, except: [] });
  }
  return { rows, unknown, external };
}

// ── the OLD readers' membership tests (the migration's equivalence check ONLY — §97 keeps them here) ──────────────
/**
 * Each answers the question its door's reader answered before this lane, over the OLD shape and the OLD spelling of
 * the caller — `true` (admitted) | `false`. The migration asks it and `admits` over the mapped rows for every live
 * principal; a disagreement refuses the migration naming the row.
 */
const LEGACY = Object.freeze({
  /** exit-reach `exitAccessOf` + `exitVerdict` over a host RECORD (verify F4: the record, not one list — the old reader
   *  read the WHOLE access, so an unreadable exit, hub or either list refused both): grant = 'use' | 'run';
   *  ctx = {sessionKeys, groupIds}. */
  exit(h, grant, ctx = {}) {
    if (!h || typeof h !== 'object') return false;
    const legacy = h.allowExit === true ? 'everyone' : 'nobody';
    const e = h.exit !== undefined ? h.exit : { use: { mode: legacy }, run: { mode: legacy } };
    if (!e || typeof e !== 'object' || Array.isArray(e) || !oldHubReadable(e.hub)) return false;
    const readable = (x) => !!x && typeof x === 'object' && !Array.isArray(x) && ['nobody', 'everyone', 'only'].includes(x.mode);
    if (!readable(e.use) || !readable(e.run)) return false;
    const g = e[grant === 'run' ? 'run' : 'use'];
    if (g.mode === 'nobody') return false;
    if (g.mode === 'everyone') return true;
    const keys = new Set((ctx.sessionKeys || []).map(String)), gids = new Set((ctx.groupIds || []).map(String));
    return (g.who || []).some((p) => (p.kind === 'session' && keys.has(p.id)) || (p.kind === 'group' && gids.has(p.id)));
  },
  /** browser-profiles `mayAttach`'s admission over `whoMayUse` (U = {mode:'all'|'only'|'unknown', who}); ctx = {browserKey, taskIds}. */
  browser(U, ctx = {}) {
    if (!U) return false;
    if (U.mode === 'all') return true;
    if (U.mode !== 'only') return false;
    const K = parentKeyOf(ctx.browserKey), mine = new Set((ctx.taskIds || []).map(String));   // the old reader collapsed the caller's helper key too
    return (U.who || []).some((w) => (w.kind === 'session' && K && w.id === K) || (w.kind === 'task' && mine.has(w.id)));
  },
  /** window-reach `reachFor`'s exposure: rec = {rows}; ctx = {sessionKeys, groupIds}. */
  window(rec, ctx = {}) {
    const keys = new Set((ctx.sessionKeys || []).map(String)), groups = new Set((ctx.groupIds || []).map(String));
    return (rec && rec.rows || []).some((r) => r && r.principal && (r.principal.kind === 'everyone' ? keys.size > 0 : r.principal.kind === 'session' ? keys.has(r.principal.id) : groups.has(r.principal.id)));
  },
  /** automation `useVerdict`'s subject match: subjects = callerSubjects (session:<cid> + group:<gid>). */
  automationUse(g, subjects = []) { return !!g && subjects.includes(g.subject); },
  /** automation `reachVerdict`'s reach rung: r = 'opened' | 'instance' | {taskGroups}; groups = the target's. */
  automationReach(r, groups = []) {
    if (r === 'instance') return true;
    return !!(r && typeof r === 'object' && Array.isArray(r.taskGroups) && (groups || []).some((g) => r.taskGroups.includes(g)));
  },
  /** channel-acl `principalApplies`: grant = {principal:{kind, id}}; ctx = {kind:'agent', id, groups}. */
  channel(grant, ctx = {}) {
    const p = grant && grant.principal;
    if (!p) return false;
    if (p.kind === 'everyone') return ctx.kind === 'agent' && !!ctx.id;
    if (p.kind === 'agent') return ctx.kind === 'agent' && ctx.id === p.id;
    if (p.kind === 'group') return Array.isArray(ctx.groups) && ctx.groups.includes(p.id);
    return false;
  },
  /** msg-acl `levelFor`'s group rung: is `target` exposed through group `gid` at a level above none? */
  groupVisibility(level, gid, targetGroups = []) { return (level === 'visible' || level === 'messageable') && (targetGroups || []).includes(gid); },
});

module.exports = {
  DOORS, PRINCIPAL_KINDS, REFUSALS, WRITE_REFUSALS, LIST_MAX, ENTRY_FIELDS, GROUP_ID_RE, CONVERSATION_KEY_RE, RESOURCE_SHAPES, resourceShapeOk, HOST_TOKEN_RE, HOSTS_MAX, hostListOf,
  principalKey, bareOf, normEntry, normExcept, normRow, validateWrite, factsOf, admits, hitsOf, sharesGroup, names, namesNow,
  publicRow, rowKey, conversationKeyOf, conversationKeysOf, keyFromSessionKey, keyFromSubject,
  fromSessionPrincipal, fromExitGrant, fromHostExit, browserKeyResolver, fromBrowserOwner, fromWindowRecord, fromSubject, fromAutomationGrant,
  fromAutomationReach, fromChannelPrincipal, toChannelPrincipal, fromChannelAccess, fromChannelRows, fromChannelApiRows,
  fromChannelWatchers, fromGroupVisibility, rowsOfHosts, rowsOfBrowserProfiles, rowsOfAutomationGrants, LEGACY, OLD_HUB_MODES,
};
