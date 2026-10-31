'use strict';
/**
 * THE VAULT-USE GRANT — PURE (lane vault-use-grants, 2026-10-27; the owner: 「每个密码请求都要我同意太麻烦了！能不能搞个权限分配 + 自动
 * approve 机制」). The reader of the grant door `vault-use` (src/grant-model.js DOORS): WHO may use ONE vault entry in
 * `vibespace-vault run` with no card, FOR WHICH HOSTS, UNTIL WHEN. The row is the one grant row of every door —
 * `{door: 'vault-use', resource: <the entry's Vault-window id>, to, except}` — written by ONE writer
 * (src/server/vault-use-grants.js → grants-store `set`); each `to` entry carries the door's OWN settings:
 *   · `hosts` — the destinations the use may reach: host names / addresses, or `@entry` («the hosts the entry was stored
 *     for»: an owner-filled request's named hosts — resolved at USE time, so a re-labelled entry is read as it is now);
 *     NEVER «any host» (no wildcard is a value of the field) — a use whose destination cannot be told is never admitted by a
 *     host — EXCEPT by a WINDOW scope (below): the owner's time-boxed trust of ONE conversation, written from the card only,
 *     one hour, every use noticed and never filed;
 *   · `until` — an optional end (ms); past it the scope admits nothing (the card asks again, the window says «expired»);
 *   · r4 (lane vault-standing-request, THE ROOT MODEL — 主开发: «a member's scopes carry THEIR OWN ENDS … never one end per
 *     member»): a member is stored as its `scopes` — each host `{host, until?, tool?, source?, at?}` and each command
 *     `{command, until?, source?, at?}` with ITS OWN end, tool and writer (src/grant-model.js scopeListOf). A member stored
 *     before r4 (`hosts` + `toolFor` + `commands` + ONE `until`) is read as each of its scopes with that end (`scopesOf` — the
 *     ONE reader); the migration `2026-10-vault-use-per-scope-ends` reshapes it where its canon (the mark) is unchanged;
 *   · `commands` (lane vault-standing-request, the owner 2026-10-30 「能不能让 agent 自行申请权限 … 常驻的，跟我配"谁可以用"等效的权限」)
 *     — the COMMAND SHAPES the member may run where the hub cannot read the destination (an interpreter and its script, a
 *     program outside the tool table): `{program, arg, sha, psha}` (src/grant-model.js commandListOf) — the program's real path,
 *     its first argument (the script's real path + the sha256 of its bytes), the program's own sha256 when an agent could
 *     rewrite it. The owner trusts THE COMMAND ITSELF: a run is admitted only by the EXACT token (another program, another
 *     script, a script whose bytes changed ⇒ another shape ⇒ the card). A member carries hosts, commands, or both — never none;
 *   · `source` — who wrote the member last: 'owner' (the row's «谁可以用…»), 'request' (an agent's standing request the owner
 *     allowed), 'card' (a run card's «Always»); `at` its time. A standing grant is the OWNER's row whoever asked for it.
 *   · r7 — THE WINDOW (the owner 2026-10-31, on a card that offered no «Always» because the hub could not read where `bash -c
 *     '… curl …'` sends the key: 「以后对于这种情况，不清楚发往何处的话，就允许我直接给agent … 1个小时授权吧 … 如果攻击者通过钓鱼我的agent来让它
 *     发送密钥到未知地方，那得正好是我给了授权之后一个小时之内攻击才行，我此时也大概率能发现。你可以每次自动允许也弹个notification，但不常驻到
 *     inbox。」): a scope `{kind: 'window', until, source: 'card', at}` — «this conversation may use this entry in ANY run (any
 *     shape, any destination) until `until`». Written ONLY by a run card's «Allow for 1 hour» (offered exactly where the card
 *     cannot offer a hosts «Always»), `until` = the press + WINDOW_MS. THE OWNER'S THREAT MODEL, in his words: a phished agent
 *     would have to exfiltrate inside that hour, and every use in it pops a notice on every open client (never filed in For
 *     you), so he is likely to see it — the hour BOUNDS the exposure, the notice makes it SEEN. It is the vault's
 *     accident-not-adversary model: a determined agent inside the hour is the owner's accepted risk. Fail closed: a window
 *     with no end (or a non-finite one) is DROPPED by the one reader — it admits nothing, ever.
 *     r8 (主开发's acceptance of r7): the writer refuses a window longer than WINDOW_MS (`window_too_long`) and the reader
 *     admits none ending more than WINDOW_READ_MAX (24 h) ahead of its clock; a conversation the row EXCEPTS (除了) is never
 *     given one (`window_excepted` — the press would have taken it out of 除了 for good, and the owner's row rule wins); an
 *     ENDED window is pruned at the next write of its row (a member left with none goes — `withoutEndedWindows`), so the
 *     .366 reader, which drops a whole member that holds any `kind` scope, loses at most the members holding a LIVE window
 *     on a rollback (kb-design-lessons: the rollback note); `withoutWindow` takes back only the window (its chip's ✕).
 *     r9 (主开发's acceptance of r8, MAJOR A): A 除了 LIST IS NEVER DROPPED by a prune or a removal — a row left with no member
 *     keeps its `except` (an except-only row `{to: [], except: [...]}` is a stored row the Vault window draws «除了 …»);
 *     only the owner's own Save takes an exception away, and that is a widening (验证是你).
 *
 * THE VERDICT `useVerdict(rows, facts, run)` — membership is the MODEL's (`GM.admits`: 给谁 / 除了, a Task Group's members
 * read at use time, every refusal by name); this file only reads the admitting entries' own settings:
 *   → { ok: true, id, via, entry, hosts, scope }  (the MOST SPECIFIC live entry whose hosts cover every host of the run —
 *     scope 'hosts' — or whose `commands` hold the run's exact command token — scope 'command' — or, r7, one holding a LIVE
 *     window — scope 'window', + `until` (its end) and `member`: any run, whatever the destination or the token. The verdict
 *     names the NARROWEST scope that admits it — hosts › command › window, across every admitting entry — so the receipt says
 *     the least trust that let it through; membership (给谁 / 除了) is judged first: a conversation left out holds nothing)
 *   | { ok: false, code, member?, missing? } — admits' codes (not_granted · excepted · groups_unreadable · unknown_shape ·
 *     fork_pending), or `expired` (every admitting entry is past its end), `destination_unknown` (the run's shape cannot
 *     tell where the value goes — a shell, an interpreter, a config file, a tool naming no host, a program an agent could
 *     have written: the card asks), `outside_hosts` (a host of the run is not covered — `missing` names it). `member` = the
 *     caller HOLDS a live grant of this entry (its id, hosts, end): the entry is open to it, and the card names the grant
 *     («a standing approval exists … this run is outside it: host Y»); its «Always» replaces it, or adds to one with the same
 *     end (lane vault-standing-request r3b — the card says which).
 *   A host covers itself and — a DNS name only — every host under it (`example.com` covers `api.example.com`; an address
 *   covers only itself).
 * THE ID `grantIdOf(resource, principalKey)` = `vg-` + 8 hex (FNV-1a over the two) — what the run line, the use line, the
 * card and the window name; the same member of the same entry keeps its id across widenings.
 * THE PLANS (the writer applies them): `withMember` (lane vault-standing-request r4: a write ADDS the scopes it names with
 * the end it names, REPLACES only the SAME scope when its end differs or has passed — `changes` says which, the card says it —
 * and never touches another scope; out of `except`),
 * `withoutMember` (revoke one), r8 `withoutWindow` (take back one member's window only), `alwaysCarry` (data/vault-run.json's «always» rows, the shape keys of 2.369.359 and
 * before, as members — the hosts read off the shape key; a row with no host cannot be carried and is counted),
 * `withWildTools` (r3: a carried wildcard with no tool gets the CLI the tool table names for it, else stays LEGACY).
 * Gate: scripts/test-vault-use-grants.mjs (fast — every verdict code, hosts + expiry + Task Group membership, the plans,
 * the carry, patched-copy controls). Imports only the PURE grant model (scripts/test-architecture.mjs PURE set; §97 reader).
 */
const GM = require('./grant-model.js');

const DOOR = 'vault-use';
const ENTRY_HOSTS = '@entry';
const ID_RE = /^vg-[0-9a-f]{8}$/;
const SOURCES = Object.freeze(['owner', 'request', 'card']);
/** r7: THE WINDOW's length — the card's «Allow for 1 hour» writes exactly the press + WINDOW_MS (the owner: 「1个小时授权」). */
const WINDOW_MS = 3600e3;
/** r8 (the r7 acceptance MINOR 5 — hardening): no window ending further than this ahead of the reader's clock admits anything
 *  (the writer caps one at WINDOW_MS; a row whose end is a day out was not written by a card). */
const WINDOW_READ_MAX = 24 * 3600e3;
const CODES = Object.freeze(['not_granted', 'excepted', 'groups_unreadable', 'unknown_shape', 'fork_pending', 'expired', 'destination_unknown', 'outside_hosts']);

/** FNV-1a (32 bit) over `resource` NUL `principalKey` → `vg-xxxxxxxx`. */
function grantIdOf(resource, principalKey) {
  let h = 0x811c9dc5;
  const s = `${String(resource || '')}\u0000${String(principalKey || '')}`;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return `vg-${h.toString(16).padStart(8, '0')}`;
}
const isAddress = (h) => /^\d{1,3}(?:\.\d{1,3}){3}$/.test(h) || h.includes(':');
/** A host token → { host, port } (IPv6 brackets dropped, a `:port` split off; a bare IPv6 literal keeps its colons). */
function splitHostPort(s) {
  let x = String(s == null ? '' : s).trim().toLowerCase().replace(/\.$/, '');
  if (x[0] === '[') { const j = x.indexOf(']'); if (j > 0) { const m = /^:(\d{1,5})$/.exec(x.slice(j + 1)); return { host: x.slice(1, j), port: m ? m[1] : null }; } }
  const colons = (x.match(/:/g) || []).length;
  if (colons === 1) { const [h, p] = x.split(':'); if (/^\d{1,5}$/.test(p)) return { host: h, port: p }; }
  return { host: x, port: null };   // no port, or a bare IPv6 literal (> 1 colon)
}
/** Does grant host `g` cover run host `h`? A `:port` on the grant is specific (it must match); then: the same host, a
 *  `*.domain` wildcard over `h`, or (both DNS names) `h` a subdomain of `g`. An address covers only itself, and NO wildcard
 *  ever covers an address (round 3, item 5: `*.0.1` must not cover 127.0.0.1 — the agent's own listener). */
function hostCovers(g, h) {
  const G = splitHostPort(g), H = splitHostPort(h);
  if (!G.host || !H.host) return false;
  if (G.port && G.port !== H.port) return false;   // a grant naming a port is exact on the port
  if (G.host.startsWith('*.')) { const base = G.host.slice(2); return !isAddress(H.host) && !isAddress(base) && (H.host === base || H.host.endsWith(`.${base}`)); }
  if (G.host === H.host) return true;
  return !isAddress(G.host) && !isAddress(H.host) && G.host.includes('.') && H.host.endsWith(`.${G.host}`);
}
/** A grant host covers a run host FOR THIS TOOL: a WILDCARD default (`*.amazonaws.com`) is granted to the CLI that MINTED it
 *  only (round 3, item 5 — so an «Always» on `aws` never lets `curl` reach execute-api.amazonaws.com); a concrete host is
 *  not tool-scoped. `hostTool` null (a plain host, or a wildcard minted with no tool) ⇒ no tool scope. */
const coversForTool = (g, h, hostTool, runTool) => hostCovers(g, h) && (!String(g).startsWith('*.') || !hostTool || hostTool === runTool);
/** The CLI a member's grant-host `g` is scoped to (round 4, item 3): its PER-HOST `toolFor` entry, or a legacy single `tool`
 *  (old grants) applied to a wildcard. null ⇒ not tool-scoped. The scope is per host — a later «Always» from another CLI
 *  adds its own host rows and never rewrites this one's tool. */
const toolOfHost = (member, g) => { if (member && Array.isArray(member.scopes)) { const s = member.scopes.find((x) => x && x.host === g); return s && s.tool ? String(s.tool).toLowerCase() : null; } return (member && member.toolFor && member.toolFor[g]) || (member && member.tool && String(g).startsWith('*.') ? String(member.tool).toLowerCase() : null); };   // r4: a scoped member's tool is its host scope's
/** A run's hosts in the one spelling (lower case, no trailing dot, no IPv6 brackets) — what the shape says (src/vault-run.js). */
const runHostsOf = (hosts) => [...new Set((Array.isArray(hosts) ? hosts : []).map((h) => String(h == null ? '' : h).trim().toLowerCase().replace(/\.$/, '').replace(/^\[(.*)\]$/, '$1')).filter(Boolean))];
/** An entry's hosts as they stand at use time: `@entry` → the entry's own hosts (GM.hostListOf's spelling). */
function effectiveHosts(list, entryHosts = []) {
  const own = GM.hostListOf(Array.isArray(entryHosts) ? entryHosts.filter((h) => h !== ENTRY_HOSTS) : []) || [];
  const out = [];
  for (const h of Array.isArray(list) ? list : []) for (const x of h === ENTRY_HOSTS ? own : [h]) if (!out.includes(x)) out.push(x);
  return out;
}
const endOf = (x) => (Number(x) > 0 ? Math.floor(Number(x)) : null);
const isWild = (h) => String(h).startsWith('*.');
const liveScope = (s, now) => !(s && s.until != null && s.until <= now) && !(s && s.kind === 'window' && Number(now) > 0 && s.until > Number(now) + WINDOW_READ_MAX);   // r8: a window a day out admits nothing
// ── THE SCOPES (lane vault-standing-request r4, THE ROOT MODEL — 主开发: «four rounds have moved the member-write rule
// between merge and replace and each form loses something … a member's scopes carry THEIR OWN ENDS») ──
/** THE ONE READER of a member's scopes → [{kind: 'host', key, host, until, tool, source, at} | {kind: 'command', key,
 *  command, until, tool: null, source, at}] (`key` = the scope's identity: its host token, or GM.commandKeyOf). A member
 *  stored in the r4 shape is its `scopes`; one stored before r4 (one end per member: `hosts` + `toolFor` + `commands` +
 *  `until`) is read as each of its scopes with the member's end and writer — what it always meant. Every reader below and in
 *  the ORCH reads a member through THIS (never `e.hosts` / `e.until`). */
function scopesOf(e) {
  if (!e || typeof e !== 'object') return [];
  if (Array.isArray(e.scopes)) {
    // r7: a WINDOW scope is read only WITH a finite end — one with none (or a non-finite one) is DROPPED: it admits nothing, ever
    const winOf = (s) => { const n = Number(s.until); return n > 0 && Number.isFinite(n) ? { kind: 'window', key: 'window', until: Math.floor(n), tool: null, source: SOURCES.includes(s.source) ? s.source : null, at: endOf(s.at) } : null; };
    return e.scopes.filter((s) => s && typeof s === 'object').map((s) => (s.kind === 'window' ? winOf(s) : s.kind !== undefined ? null : s.command
      ? { kind: 'command', key: GM.commandKeyOf(s.command), command: s.command, until: endOf(s.until), tool: null, source: SOURCES.includes(s.source) ? s.source : null, at: endOf(s.at) }
      : { kind: 'host', key: String(s.host), host: String(s.host), until: endOf(s.until), tool: s.tool ? String(s.tool).toLowerCase() : null, source: SOURCES.includes(s.source) ? s.source : null, at: endOf(s.at) })).filter(Boolean);
  }
  const until = endOf(e.until), source = SOURCES.includes(e.source) ? e.source : null, at = endOf(e.at);
  const hs = (Array.isArray(e.hosts) ? e.hosts : []).map((h) => ({ kind: 'host', key: String(h), host: String(h), until, tool: toolOfHost(e, h), source, at }));
  const cs = [];
  for (const c of Array.isArray(e.commands) ? e.commands : []) { const n = GM.commandListOf([c]); if (n) cs.push({ kind: 'command', key: GM.commandKeyOf(n[0]), command: n[0], until, tool: null, source, at }); }
  return [...hs, ...cs];
}
/** A scope as the store keeps it (GM.scopeListOf's closed keys; no end = no `until`). */
const storedScope = (s) => (s.kind === 'window' ? { kind: 'window', until: s.until, ...(s.source ? { source: s.source } : {}), ...(s.at ? { at: s.at } : {}) } : s.kind === 'command'
  ? { command: s.command, ...(s.until ? { until: s.until } : {}), ...(s.source ? { source: s.source } : {}), ...(s.at ? { at: s.at } : {}) }
  : { host: s.host, ...(s.until ? { until: s.until } : {}), ...(s.tool ? { tool: s.tool } : {}), ...(s.source ? { source: s.source } : {}), ...(s.at ? { at: s.at } : {}) });
/** A member in the r4 shape: its principal, its name (and GM's `by`), its scopes — every one-end field dropped; `mac` kept
 *  (the canon below is over what a member MEANS, so a reshape keeps it). */
function scopedMember(e, scopes = scopesOf(e)) {
  const b = GM.bareOf(e);
  if (!b) return null;
  return { ...b, ...(typeof e.name === 'string' && e.name ? { name: e.name } : {}), ...(typeof e.by === 'string' && e.by ? { by: e.by } : {}), scopes: scopes.map(storedScope), ...(typeof e.mac === 'string' ? { mac: e.mac } : {}) };
}
/** Derived views a page / the CLI / a test read off the scopes (all — live or ended): the hosts, the per-host tools, the
 *  command tokens. `span` = until when ANY of `list` is usable: null when one has no end, else the latest end. */
const hostsOfScopes = (list) => list.filter((s) => s.kind === 'host').map((s) => s.host);
const commandsOfScopes = (list) => list.filter((s) => s.kind === 'command').map((s) => s.command);
const toolForOfScopes = (list) => { const m = {}; for (const s of list) if (s.kind === 'host' && s.tool) m[s.host] = s.tool; return Object.keys(m).length ? m : null; };
const spanOf = (list) => (!list.length ? null : list.some((s) => s.until == null) ? null : Math.max(...list.map((s) => s.until)));
const latestOf = (list) => list.reduce((a, s) => (s.at && (!a || s.at > a.at) ? s : a), null);
/** THE CANON the vault's mark (the ORCH's mac) is made over (moved here from the ORCH in r4: PURE). It is over what a member
 *  MEANS: a member stored before r4 → the r3b canon verbatim; a scoped member whose scopes share ONE end and ONE writer (what
 *  a one-end member is) → the SAME bytes, so the migration that reshapes a one-end member keeps its mac (it needs no vault —
 *  a boot is locked); scopes with their own ends / writers → the per-scope canon (`vault-use-v2`: every scope's identity, end,
 *  tool, writer and time). */
function canonOf(id, e, xc, gen) {
  const pk = GM.principalKey(GM.bareOf(e)) || '', name = typeof (e && e.name) === 'string' ? e.name : null, x = Array.isArray(xc) ? xc : [], g = Number(gen) || 0;
  if (!Array.isArray(e && e.scopes)) {
    const cs = Array.isArray(e.commands) ? e.commands.map((c) => GM.commandKeyOf(c)).sort() : [];
    const extra = cs.length || e.source ? [{ c: cs, s: e.source || null, a: e.source && Number(e.at) > 0 ? Math.floor(Number(e.at)) : null }] : [];
    return JSON.stringify([String(id), pk, (e.hosts || []).map(String).slice().sort(), e.toolFor && typeof e.toolFor === 'object' && !Array.isArray(e.toolFor) ? Object.keys(e.toolFor).sort().map((k) => [k, String(e.toolFor[k]).toLowerCase()]) : null, endOf(e.until), name, x, g, ...extra]);
  }
  const sc = scopesOf(e), u = sc[0] || null;
  if (u && !sc.some((s) => s.kind === 'window') && sc.every((s) => s.until === u.until && s.source === u.source && (!u.source || s.at === u.at))) {   // r7: a member with a window is never «uniform» — its canon names the window (tag 'w')
    const tf = sc.filter((s) => s.kind === 'host' && s.tool).map((s) => [s.host, s.tool]).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    const cs = sc.filter((s) => s.kind === 'command').map((s) => s.key).sort();
    const extra = cs.length || u.source ? [{ c: cs, s: u.source || null, a: u.source && u.at ? u.at : null }] : [];
    return JSON.stringify([String(id), pk, hostsOfScopes(sc).slice().sort(), tf.length ? tf : null, u.until, name, x, g, ...extra]);
  }
  return JSON.stringify(['vault-use-v2', String(id), pk, name, x, g, sc.map((s) => JSON.stringify([s.kind === 'host' ? 'h' : s.kind === 'window' ? 'w' : 'c', s.key, s.until, s.tool, s.source, s.at])).sort()]);
}
const live = (e, now) => scopesOf(e).some((s) => liveScope(s, now));
/** lane vault-standing-request: do these scopes hold the run's EXACT command token? (null token ⇒ never) */
const commandIn = (list, command) => { if (!command) return false; const c = GM.commandListOf([command]); if (!c) return false; const k = GM.commandKeyOf(c[0]); return list.some((s) => s.kind === 'command' && s.key === k); };
const commandHeld = (e, command) => commandIn(scopesOf(e), command);
/** The run hosts a list of host scopes does NOT cover — [] when it covers every one (r4: each scope's wildcard is scoped to ITS
 *  tool — round 4 item 3, per host; a concrete host to any tool). */
const missingIn = (list, run, runTool, entryHosts) => runHostsOf(run).filter((h) => !list.some((s) => s.kind === 'host' && (s.host === ENTRY_HOSTS ? effectiveHosts([ENTRY_HOSTS], entryHosts) : [s.host]).some((g) => coversForTool(g, h, s.tool, runTool))));
const memberOf = (hit, entryHosts, now = 0) => {
  if (!hit) return null;
  const all = scopesOf(hit.entry), ls = all.filter((s) => liveScope(s, now)), shown = ls.length ? ls : all, last = latestOf(shown);
  const win = ls.find((s) => s.kind === 'window');   // r7: the live window (its end) — the CLI and the notice say it
  return { id: grantIdOf(hit.row.resource, GM.principalKey(hit.entry)), via: hit.entry.kind, principal: GM.principalKey(hit.entry), hosts: effectiveHosts(hostsOfScopes(shown), entryHosts), declared: hostsOfScopes(shown), commands: commandsOfScopes(shown), scopes: all.map((s) => ({ ...s, expired: !liveScope(s, now) })), source: last ? last.source : null, at: last ? last.at : null, tool: null, toolFor: toolForOfScopes(shown), until: spanOf(shown), window: win ? win.until : null };
};

/** THE VERDICT of one use of one entry (see the head). `run` = { hosts, destinationKnown, entryHosts, tool, command, now } —
 *  `command` (lane vault-standing-request) = the run's command token when its destination cannot be read (else null).
 *  r4: judged on the LIVE scopes only — a scope past its end admits nothing, whatever its member's other scopes hold. */
function useVerdict(rows, facts = {}, { hosts = [], destinationKnown = false, entryHosts = [], tool = null, command = null, now = 0 } = {}) {
  const v = GM.admits(rows, facts);
  if (!v.ok) return { ok: false, code: v.code, ...(v.entry ? { except: GM.principalKey(v.entry) } : {}) };
  const alive = v.hits.filter((h) => live(h.entry, now));
  if (!alive.length) return { ok: false, code: 'expired', expired: memberOf(v.hits[0], entryHosts, now) };
  const run = runHostsOf(hosts);
  let best = null, bestMissing = null, win = null;
  for (const h of alive) {   // admits' hits: the most specific first (its own › a group's › everyone)
    const ls = scopesOf(h.entry).filter((s) => liveScope(s, now));
    if (!win && ls.some((s) => s.kind === 'window')) win = h;   // r7: a live window — taken only when NO hosts / command scope of any admitting entry admits the run (the narrowest scope is named)
    const miss = missingIn(ls, run, tool, entryHosts);
    if (destinationKnown === true && run.length && !miss.length) return { ok: true, id: grantIdOf(h.row.resource, GM.principalKey(h.entry)), via: h.entry.kind, entry: h.entry, hosts: effectiveHosts(hostsOfScopes(ls), entryHosts), scope: 'hosts' };
    if (destinationKnown !== true && commandIn(ls, command)) return { ok: true, id: grantIdOf(h.row.resource, GM.principalKey(h.entry)), via: h.entry.kind, entry: h.entry, hosts: effectiveHosts(hostsOfScopes(ls), entryHosts), scope: 'command' };   // lane vault-standing-request: the EXACT command the owner trusted — only where the hub cannot read the destination (a known destination is judged by its hosts)
    if (!best || miss.length < bestMissing.length) { best = h; bestMissing = miss; }
  }
  if (win) { const m = memberOf(win, entryHosts, now); return { ok: true, id: m.id, via: win.entry.kind, entry: win.entry, hosts: m.hosts, scope: 'window', until: m.window, member: m }; }   // r7: THE WINDOW — any run, whatever the destination or the token, until its end
  const member = memberOf(best, entryHosts, now);
  if (destinationKnown !== true || !run.length) return { ok: false, code: 'destination_unknown', member };
  return { ok: false, code: 'outside_hosts', member, missing: bestMissing };
}
/** Does the caller hold the entry (a live member, whatever the hosts)? — the entry is open to it (the card may still ask). */
const holds = (verdict) => !!(verdict && (verdict.ok || verdict.member));

// ── THE PLANS (src/server/vault-use-grants.js writes them through the ONE writer) ──
const rowLists = (row) => { const p = row ? GM.publicRow(row) : { to: [], except: [] }; return p.unknown ? null : { to: p.to || [], except: p.except || [] }; };
/** r4 (THE ROOT MODEL): ONE member's SCOPES written — `principal` (a bare principal), `hosts` (host tokens) and/or `commands`
 *  (command tokens), each written as a scope with THIS write's end `until` (ms | null = none), `tool` (the CLI a wildcard it
 *  names is scoped to), `source` + `at` (who, when). Per asked scope, against the member as it is (`now` decides what has ended):
 *    · absent                                   ⇒ ADDED, with this end;
 *    · present, live, the same end (and tool)   ⇒ SAME — nothing moves;
 *    · present with ANOTHER end, or past its end ⇒ REPLACED — exactly this scope, now with this end (`changes.replaced` names
 *      it: the scope, its old end, whether it had ended) — an ended scope is never revived or merged into: the write is a new
 *      grant of that scope, and the card that asked for it said so (the door compares the card's words with these AT THE PRESS);
 *    · a wildcard the member holds for ANOTHER tool is kept as it is (round 4: a later «Always» never re-scopes its tool).
 *  NO OTHER SCOPE IS TOUCHED — not its hosts, not its end. `carry` (the migration only): a present scope takes the EARLIER of
 *  the two ends, never a later one (an ended one stays ended). Over GM.HOSTS_MAX host scopes the member's oldest ENDED host
 *  scopes go first (`changes.pruned`), then `too_many_hosts`; over COMMANDS_MAX command scopes `too_many_commands`. The member
 *  leaves `except`; it is written in the r4 shape (a one-end member is read as its scopes and written back scoped).
 *  r7: `window` (ms) — the member's WINDOW scope with THAT end (a run card's «Allow for 1 hour»: the press + WINDOW_MS), by the
 *  same rule (a live one with another end, or an ended one, is REPLACED and named; the same end moves nothing); an end that
 *  is not in the future (`now`) is refused `window_end_required` — a window is never written without one.
 *  r8 (主开发's acceptance of r7): one ending more than WINDOW_MS after `now` is refused `window_too_long`; a principal the
 *  row EXCEPTS is refused `window_excepted` (a window never takes a conversation out of 除了 — the owner's row rule wins);
 *  every member's ENDED windows are pruned in the row this write returns (`swept`; this member's in `changes.pruned`), and a
 *  member left with no scope goes.
 *  → { ok: true, to, except, widened, added, swept, changes: {added: [scope], replaced: [{scope, was, until, expired}], same:
 *    [scope], kept: [scope], pruned: [scope]} } (a `scope` = {kind, key, host | command}) | { ok: false, code } (`unknown_shape`,
 *    `bad_principal`, `hosts_required`, `command_unreadable`, `too_many_hosts`, `too_many_commands`, `window_end_required`,
 *    `window_too_long`, `window_excepted`). */
function withMember(row, principal, { hosts = [], until = null, tool = null, commands = null, source = null, at = null, now = 0, carry = false, window = null } = {}) {
  const cur = rowLists(row);
  if (!cur) return { ok: false, code: 'unknown_shape' };
  const b = GM.bareOf(principal), key = b && GM.principalKey(b);
  if (!key) return { ok: false, code: 'bad_principal' };
  const wantCmds = Array.isArray(commands) && commands.length > 0;
  const cmds = wantCmds ? GM.commandListOf(commands) : null;
  if (wantCmds && !cmds) return { ok: false, code: 'command_unreadable' };
  const hostsGiven = Array.isArray(hosts) && hosts.length > 0;
  const add = hostsGiven ? GM.hostListOf(hosts) : [];
  const winEnd = window == null ? null : Number(window) > 0 && Number.isFinite(Number(window)) ? Math.floor(Number(window)) : NaN;   // r7
  if (window != null && !(winEnd > (Number(now) > 0 ? Number(now) : 0))) return { ok: false, code: 'window_end_required' };
  if (winEnd && Number(now) > 0 && winEnd > Number(now) + WINDOW_MS) return { ok: false, code: 'window_too_long' };   // r8: the writer's cap — the press + 1 hour, never more
  if (winEnd && cur.except.some((x) => GM.principalKey(x) === key)) return { ok: false, code: 'window_excepted' };   // r8 (the 除了 hazard): this write would have deleted the exception for good
  if (!add || (!add.length && !cmds && !winEnd)) return { ok: false, code: 'hosts_required' };
  const src = SOURCES.includes(source) ? source : null, stampAt = endOf(at);
  const end = endOf(until);
  const tl = tool ? String(tool).toLowerCase() : null;   // round 4 (item 3): the CLI a wildcard THIS «Always» mints is scoped to — PER HOST
  const i = cur.to.findIndex((e) => GM.principalKey(e) === key);
  const was = i >= 0 ? cur.to[i] : null;
  const next = was ? scopesOf(was).map((s) => ({ ...s })) : [];
  const asked = [...add.map((h) => ({ kind: 'host', key: h, host: h, until: end, tool: tl && isWild(h) ? tl : null, source: src, at: src ? stampAt : null })), ...(cmds || []).map((c) => ({ kind: 'command', key: GM.commandKeyOf(c), command: c, until: end, tool: null, source: src, at: src ? stampAt : null })), ...(winEnd ? [{ kind: 'window', key: 'window', until: winEnd, tool: null, source: src, at: src ? stampAt : null }] : [])];
  const nowN = Number(now) > 0 ? Number(now) : 0;
  const gone = (s) => s.until != null && nowN > 0 && s.until <= nowN;
  const scopeWord = (s) => (s.kind === 'host' ? { kind: 'host', key: s.key, host: s.host } : s.kind === 'window' ? { kind: 'window', key: 'window' } : { kind: 'command', key: s.key, command: s.command });
  const changes = { added: [], replaced: [], same: [], kept: [], pruned: [] };
  for (const s of asked) {
    const j = next.findIndex((x) => x.kind === s.kind && x.key === s.key);
    if (j < 0) { next.push(s); changes.added.push({ ...scopeWord(s), until: s.until }); continue; }
    const w = next[j];
    if (s.kind === 'host' && isWild(s.host) && w.tool && s.tool && w.tool !== s.tool) { changes.kept.push(scopeWord(w)); continue; }   // round 4: a wildcard held for another CLI keeps its tool
    if (carry) {
      const e2 = w.until == null ? s.until : s.until == null ? w.until : Math.min(w.until, s.until);   // the EARLIER end — never a later one
      if (e2 === w.until && (w.tool || !s.tool)) { changes.same.push(scopeWord(w)); continue; }
      next[j] = { ...w, until: e2, tool: w.tool || s.tool };
      changes.replaced.push({ ...scopeWord(w), was: w.until, until: e2, expired: gone(w) });
      continue;
    }
    if (!gone(w) && w.until === s.until && (s.kind !== 'host' || !isWild(s.host) || (w.tool || null) === (s.tool || null))) { changes.same.push(scopeWord(w)); continue; }   // the same end (a wildcard: and the same tool) — nothing moves
    next[j] = s;
    changes.replaced.push({ ...scopeWord(w), was: w.until, until: s.until, expired: gone(w) });
  }
  // r8: an ENDED window this write does not renew goes (it admits nothing, and the .366 reader drops a member that holds one)
  for (const s of next.filter((x) => x.kind === 'window' && gone(x) && !winEnd)) { next.splice(next.indexOf(s), 1); changes.pruned.push({ ...scopeWord(s), was: s.until }); }
  // the limits count what the member holds: an ENDED host scope beyond them goes first (oldest end first) — it admits nothing
  let nHosts = next.filter((s) => s.kind === 'host').length;
  if (nHosts > GM.HOSTS_MAX) {
    const askedKeys = new Set(asked.map((s) => `${s.kind}\n${s.key}`));
    const ended = next.filter((s) => s.kind === 'host' && gone(s) && !askedKeys.has(`host\n${s.key}`)).sort((a, b2) => a.until - b2.until);
    for (const s of ended) { if (nHosts <= GM.HOSTS_MAX) break; next.splice(next.indexOf(s), 1); changes.pruned.push({ ...scopeWord(s), was: s.until }); nHosts--; }
  }
  if (nHosts > GM.HOSTS_MAX) return { ok: false, code: 'too_many_hosts' };
  if (next.filter((s) => s.kind === 'command').length > GM.COMMANDS_MAX) return { ok: false, code: 'too_many_commands' };
  const moved = changes.added.length + changes.replaced.length + changes.pruned.length > 0;
  const to = cur.to.slice();
  if (was) {
    const m = scopedMember({ ...was, ...(principal.name && !was.name ? { name: String(principal.name) } : {}) }, next);
    delete m.mac;
    to[i] = m;   // r3: the member keeps its place (its id is the principal's)
  } else {
    to.push({ ...b, ...(principal.name ? { name: String(principal.name) } : {}), scopes: next.map(storedScope) });
  }
  const sw = withoutEndedWindows(to.filter((e) => GM.principalKey(e) !== key), nowN), kept = new Map(sw.to.map((e) => [GM.principalKey(e), e]));   // r8: every OTHER member's ended windows go too (the order kept)
  const rowTo = to.filter((e) => GM.principalKey(e) === key || kept.has(GM.principalKey(e))).map((e) => (GM.principalKey(e) === key ? e : kept.get(GM.principalKey(e))));
  return { ok: true, to: rowTo, except: cur.except.filter((x) => GM.principalKey(x) !== key), widened: moved, added: i < 0, swept: sw.swept, changes };
}
/** r8 (the r7 acceptance MINOR 5): A ROW'S ENDED WINDOWS PRUNED — every member's window past `now` goes (it admits nothing);
 *  a member left with no scope goes too (the store holds no member without one). The writer applies it at every write of the
 *  row, so an ended window outlives its hour only until the row is next written (or the door's hour-end prune).
 *  → { to, swept: [{principal, until}], dropped: [principal] } */
function withoutEndedWindows(to, now) {
  const n = Number(now) > 0 ? Number(now) : 0, swept = [], dropped = [], out = [];
  for (const e of Array.isArray(to) ? to : []) {
    const sc = scopesOf(e), ended = n > 0 ? sc.filter((s) => s.kind === 'window' && s.until <= n) : [];
    if (!ended.length) { out.push(e); continue; }
    for (const s of ended) swept.push({ principal: GM.principalKey(e), until: s.until });
    const rest = sc.filter((s) => !ended.includes(s));
    if (!rest.length) { dropped.push(GM.principalKey(e)); continue; }
    const m = scopedMember(e, rest); delete m.mac; out.push(m);
  }
  return { to: out, swept, dropped };
}
/** Revoke ONE member (`principalKey`) — its exceptions stay with the row (r9: ALWAYS — the last member's ✕ too: an
 *  except-only row is kept). r8: every other member's ended windows are pruned,
 *  and `window` = the end of the LIVE window the member held (null: none) — its record is told it was taken back.
 *  → { ok, to, except, removed, window } | unknown_shape. */
function withoutMember(row, principalKey, { now = 0 } = {}) {
  const cur = rowLists(row);
  if (!cur) return { ok: false, code: 'unknown_shape' };
  const was = cur.to.find((e) => GM.principalKey(e) === String(principalKey || ''));
  const w = was ? scopesOf(was).find((s) => s.kind === 'window' && liveScope(s, Number(now) || 0)) : null;
  const to = withoutEndedWindows(cur.to.filter((e) => GM.principalKey(e) !== String(principalKey || '')), now).to;
  return { ok: true, to, except: cur.except, removed: !!was, window: w && Number(now) > 0 && w.until > Number(now) ? w.until : null };   // r9 (MAJOR A): the 除了 list stays, member or none
}
/** r8 (the r7 acceptance MINOR 4 — «nothing ends just the window early»): TAKE BACK ONE MEMBER'S WINDOW only — its host and
 *  command scopes stay as they are (their own ends); a member that held nothing else goes; every other member's ended
 *  windows are pruned. → { ok, to, except, removed (a window was there), until (its end), memberGone } | unknown_shape. */
function withoutWindow(row, principalKey, { now = 0 } = {}) {
  const cur = rowLists(row);
  if (!cur) return { ok: false, code: 'unknown_shape' };
  const key = String(principalKey || '');
  const i = cur.to.findIndex((e) => GM.principalKey(e) === key);
  const sc = i >= 0 ? scopesOf(cur.to[i]) : [], w = sc.find((s) => s.kind === 'window');
  if (!w) return { ok: true, to: cur.to, except: cur.except, removed: false, until: null, memberGone: false };
  const rest = sc.filter((s) => s.kind !== 'window');
  const others = withoutEndedWindows(cur.to.filter((e, k) => k !== i), now), kept = new Map(others.to.map((e) => [GM.principalKey(e), e]));
  let self = null;
  if (rest.length) { self = scopedMember(cur.to[i], rest); delete self.mac; }
  const to = cur.to.map((e, k) => (k === i ? self : kept.get(GM.principalKey(e)) || null)).filter(Boolean);   // the order kept
  return { ok: true, to, except: cur.except, removed: true, until: w.until, memberGone: !self };   // r9 (MAJOR A): the 除了 list stays, member or none
}
/** r3 (MAJOR 1 — the acceptance: the 2.369.363/.364 carry wrote legacy aws «always» rows as `*.amazonaws.com` members with NO
 *  tool, and r2's row rules then refused every OTHER conversation's write on that entry): A LEGACY WILDCARD IS A MIGRATION
 *  FACT. Each wildcard host SCOPE with no tool gets the CLI the tool table names for it (`toolOfWild(h)` — aws for
 *  `*.amazonaws.com`: the only road a wildcard ever entered a shape); one the table cannot name stays as it is, a LEGACY
 *  wildcard (any tool) — the Vault row names it (publicGrants `legacy`), the owner is told once. r4 (D): `legacy` lists only a
 *  LIVE scope (`now`) — an ended one admits nothing and is never told as «any program». → { ok, to, except, healed:
 *  [{principal, host, tool}], legacy: [{principal, host}] } | unknown_shape. */
function withWildTools(row, toolOfWild, { now = 0 } = {}) {
  const cur = rowLists(row);
  if (!cur) return { ok: false, code: 'unknown_shape' };
  const healed = [], legacy = [];
  const to = cur.to.map((e) => {
    let changed = false;
    const sc = scopesOf(e).map((s) => {
      if (s.kind !== 'host' || !isWild(s.host) || s.tool) return s;
      const t = typeof toolOfWild === 'function' ? toolOfWild(s.host) : null;
      if (t) { changed = true; healed.push({ principal: GM.principalKey(e), host: s.host, tool: String(t).toLowerCase() }); return { ...s, tool: String(t).toLowerCase() }; }
      if (liveScope(s, Number(now) || 0)) legacy.push({ principal: GM.principalKey(e), host: s.host });
      return s;
    });
    if (!changed) return e;
    const m = scopedMember(e, sc); delete m.mac; return m;
  });
  return { ok: true, to, except: cur.except, healed, legacy };
}
/** A member's wildcard host scopes that carry NO tool (a legacy carried member — any tool): what its chip names. */
const legacyWildOf = (e) => scopesOf(e).filter((s) => s.kind === 'host' && isWild(s.host) && !s.tool).map((s) => s.host);
/** r4 (E — the migration `2026-10-vault-use-per-scope-ends`, src/server/migrations.js): a stored row's ONE-END members in the
 *  r4 shape — each reshaped ONLY where its canon is unchanged (canonOf: the same bytes ⇒ its mac carries over, no vault); a
 *  member that cannot be (a canon that would move — a legacy single `tool`, a tool for a host it does not hold) is left as it
 *  is (read as before) and named. → { ok, to, except, mapped, unmapped: [principal] } | unknown_shape. */
function scopedRowOf(row) {
  const cur = rowLists(row);
  if (!cur) return { ok: false, code: 'unknown_shape' };
  let mapped = 0; const unmapped = [];
  const to = cur.to.map((e) => {
    if (Array.isArray(e.scopes)) return e;
    const s = scopedMember(e);
    const n = s && GM.normEntry(s, DOOR);
    if (n && canonOf('-', n, [], 0) === canonOf('-', e, [], 0)) { mapped++; return n; }
    unmapped.push(GM.principalKey(e)); return e;
  });
  return { ok: true, to, except: cur.except, mapped, unmapped };
}
/** THE CARRY of data/vault-run.json's «always» rows (each `{conv, key: <shape key>, until, entries}` — a command SHAPE a
 *  conversation was let run without asking) into members: per entry of the row, the conversation × the shape key's HOSTS
 *  (src/vault-run.js shapeKeyOf: `<v>:[tool, sub, flags, args, hosts, …]`) × the row's end. An expired row, or one whose
 *  shape names no host, is not carried (counted). → { members: [{resource, principal, hosts, until}], expired, hostless }. */
function alwaysCarry(always, { now = 0, resourceOf = (id) => id, toolOfWild = null } = {}) {
  const members = [];
  let expired = 0, hostless = 0;
  for (const a of Array.isArray(always) ? always : []) {
    if (!a || typeof a.conv !== 'string' || !a.conv || typeof a.key !== 'string') continue;
    if (a.until != null && !(Number(a.until) > now)) { expired++; continue; }
    let hosts = null, tool = null;
    try { const arr = JSON.parse(a.key.slice(a.key.indexOf(':') + 1)); hosts = GM.hostListOf(Array.isArray(arr) ? arr[4] : null); tool = Array.isArray(arr) && typeof arr[0] === 'string' ? (String(arr[0]).split(/[\\/]/).pop().toLowerCase().replace(/\.exe$/, '') || null) : null; } catch { hosts = null; }   // r2: the shape key's tool — a carried wildcard keeps its CLI
    if (!hosts) { hostless++; continue; }
    const principal = GM.bareOf({ kind: 'conversation', key: a.conv });
    if (!principal) continue;
    for (const id of Array.isArray(a.entries) ? a.entries : []) {
      const resource = resourceOf(String(id));
      const wild = hosts.filter((h) => String(h).startsWith('*.')), wt = tool || (wild.length && typeof toolOfWild === 'function' ? toolOfWild(wild[0]) : null);   // r3: the shape key's tool, else the one the tool table names for its wildcard
      if (resource && GM.resourceShapeOk(DOOR, resource)) members.push({ resource, principal, hosts, until: a.until == null ? null : Number(a.until), ...(wild.length ? (wt ? { tool: wt } : { legacy: true }) : {}) });   // r3 (MAJOR 1): a wildcard whose CLI nobody can name is carried as a LEGACY member (named on its row), never dropped
    }
  }
  return { members, expired, hostless };
}

// ── WHAT A PAGE SEES (the Vault window's «谁可以用» chips) ──
/** A row's members as the window draws them: [{id, kind, key|id, name, scopes: [{kind, host | command, until, expired, tool,
 *  legacy, source, at}] (r4: EACH scope with its own end — the chip says each), and the derived views: hosts, commands,
 *  toolFor (all scopes), legacy (its wildcard scopes with no tool), until (until when any scope is usable — null when one has
 *  no end), expired (no scope is), source + at (the latest writer)}] + except. */
function publicGrants(row, { now = 0 } = {}) {
  const p = row ? GM.publicRow(row) : null;
  if (!p) return { to: [], except: [] };
  if (p.unknown) return { unknown: true, why: p.why, to: [], except: [] };
  return {
    to: (p.to || []).map((e) => {
      const all = scopesOf(e), ls = all.filter((s) => liveScope(s, now)), last = latestOf(all);
      const { scopes: _s, hosts: _h, commands: _c, toolFor: _t, tool: _tl, until: _u, source: _src, at: _at, ...rest } = e;
      const win = ls.find((s) => s.kind === 'window');   // r7: its live window (the chip says «any destination · until HH:MM»)
      return { ...rest, id: grantIdOf(p.resource, GM.principalKey(e)), principal: GM.principalKey(e), hosts: hostsOfScopes(all), commands: commandsOfScopes(all), source: last ? last.source : null, at: last ? last.at : null, sourceKind: last ? last.kind : null, tool: null, toolFor: toolForOfScopes(all), legacy: legacyWildOf(e), until: spanOf(ls.length ? ls : all), expired: !ls.length, window: win ? win.until : null,   // r8: `sourceKind` — the latest writer's scope ('window': the chip says «“Allow for 1 hour” on a card», never «“Always” on a card»)
        scopes: all.map((s) => ({ kind: s.kind, ...(s.kind === 'host' ? { host: s.host } : s.kind === 'command' ? { command: s.command } : {}), until: s.until, expired: !liveScope(s, now), tool: s.tool, legacy: s.kind === 'host' && isWild(s.host) && !s.tool, source: s.source, at: s.at })) };   // r3: `legacy` — its wildcard hosts with no tool (any tool)
    }),
    except: p.except || [],
  };
}

// ── THE CARD'S WORDS (English keys — src/server/vault-run-door.js files them; the page says them in its language) ──
/** The lines a run card adds about a STANDING APPROVAL the caller holds but this run is outside of (`verdicts` = one per
 *  entry, useVerdict's). [] when none holds one. */
function standingLines(verdicts, { always = false } = {}) {
  const out = [];
  for (const v of Array.isArray(verdicts) ? verdicts : []) {
    if (!v || v.ok || !v.member) continue;
    const cw = (v.member.commands || []).map((c) => commandWords(c)).join(', ');
    const on = [v.member.hosts.length ? v.member.hosts.join(', ') : '', cw ? `the command ${cw}` : ''].filter(Boolean).join('; ') || 'no host';
    if (v.code === 'outside_hosts') out.push(`A standing approval exists for this conversation (${v.member.id}: ${on}) — this run is outside it: ${v.missing.join(', ')}.`);   // r3b: «Always» no longer widens it — the door's replace / add line says what it does
    else if (v.code === 'destination_unknown') out.push(`A standing approval exists for this conversation (${v.member.id}: ${on}) — where this run sends it cannot be told${cw ? ' and it is not that command' : ''}, so it asks.`);
  }
  return [...new Set(out)];
}

/** lane vault-standing-request: a command token in words — the program's name and its first argument's (`python3
 *  transcribe.py`); the whole paths ride the token. */
const baseOf = (p) => String(p == null ? '' : p).replace(/\/+$/, '').split('/').pop();
const commandWords = (c) => (c && c.program ? [baseOf(c.program), ...(Array.isArray(c.pre) ? c.pre : []), c.arg == null ? '' : String(c.arg)[0] === '/' ? baseOf(c.arg) : String(c.arg)].filter(Boolean).join(' ') : '');   // r2: + the options it pins before the script

module.exports = { DOOR, ENTRY_HOSTS, ID_RE, CODES, SOURCES, WINDOW_MS, WINDOW_READ_MAX, commandWords, grantIdOf, hostCovers, toolOfHost, legacyWildOf, runHostsOf, effectiveHosts, useVerdict, holds, withMember, withoutMember, withoutWindow, withoutEndedWindows, withWildTools, alwaysCarry, publicGrants, standingLines, scopesOf, scopedMember, scopedRowOf, canonOf, spanOf };
