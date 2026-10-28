'use strict';
/**
 * THE VAULT-USE GRANT — PURE (lane vault-use-grants, 2026-10-27; the owner: 「每个密码请求都要我同意太麻烦了！能不能搞个权限分配 + 自动
 * approve 机制」). The reader of the grant door `vault-use` (src/grant-model.js DOORS): WHO may use ONE vault entry in
 * `vibespace-vault run` with no card, FOR WHICH HOSTS, UNTIL WHEN. The row is the one grant row of every door —
 * `{door: 'vault-use', resource: <the entry's Vault-window id>, to, except}` — written by ONE writer
 * (src/server/vault-use-grants.js → grants-store `set`); each `to` entry carries the door's OWN settings:
 *   · `hosts` — the destinations the use may reach: host names / addresses, or `@entry` («the hosts the entry was stored
 *     for»: an owner-filled request's named hosts — resolved at USE time, so a re-labelled entry is read as it is now);
 *     NEVER «any host» (no wildcard is a value of the field) — a use whose destination cannot be told is never admitted;
 *   · `until` — an optional end (ms); past it the entry admits nothing (the card asks again, the window says «expired»).
 *
 * THE VERDICT `useVerdict(rows, facts, run)` — membership is the MODEL's (`GM.admits`: 给谁 / 除了, a Task Group's members
 * read at use time, every refusal by name); this file only reads the admitting entries' own settings:
 *   → { ok: true, id, via, entry, hosts }  (the MOST SPECIFIC live entry whose hosts cover every host of the run)
 *   | { ok: false, code, member?, missing? } — admits' codes (not_granted · excepted · groups_unreadable · unknown_shape ·
 *     fork_pending), or `expired` (every admitting entry is past its end), `destination_unknown` (the run's shape cannot
 *     tell where the value goes — a shell, an interpreter, a config file, a tool naming no host, a program an agent could
 *     have written: the card asks), `outside_hosts` (a host of the run is not covered — `missing` names it). `member` = the
 *     caller HOLDS a live grant of this entry (its id, hosts, end): the entry is open to it, and the card names the grant
 *     («a standing approval exists … this run is outside it: host Y») and its «Always» widens it.
 *   A host covers itself and — a DNS name only — every host under it (`example.com` covers `api.example.com`; an address
 *   covers only itself).
 * THE ID `grantIdOf(resource, principalKey)` = `vg-` + 8 hex (FNV-1a over the two) — what the run line, the use line, the
 * card and the window name; the same member of the same entry keeps its id across widenings.
 * THE PLANS (the writer applies them): `withMember` (add or WIDEN one member: hosts ∪, the later end, out of `except`),
 * `withoutMember` (revoke one), `alwaysCarry` (data/vault-run.json's «always» rows, the shape keys of 2.369.359 and
 * before, as members — the hosts read off the shape key; a row with no host cannot be carried and is counted).
 * Gate: scripts/test-vault-use-grants.mjs (fast — every verdict code, hosts + expiry + Task Group membership, the plans,
 * the carry, patched-copy controls). Imports only the PURE grant model (scripts/test-architecture.mjs PURE set; §97 reader).
 */
const GM = require('./grant-model.js');

const DOOR = 'vault-use';
const ENTRY_HOSTS = '@entry';
const ID_RE = /^vg-[0-9a-f]{8}$/;
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
const toolOfHost = (member, g) => (member && member.toolFor && member.toolFor[g]) || (member && member.tool && String(g).startsWith('*.') ? String(member.tool).toLowerCase() : null);
/** A run's hosts in the one spelling (lower case, no trailing dot, no IPv6 brackets) — what the shape says (src/vault-run.js). */
const runHostsOf = (hosts) => [...new Set((Array.isArray(hosts) ? hosts : []).map((h) => String(h == null ? '' : h).trim().toLowerCase().replace(/\.$/, '').replace(/^\[(.*)\]$/, '$1')).filter(Boolean))];
/** An entry's hosts as they stand at use time: `@entry` → the entry's own hosts (GM.hostListOf's spelling). */
function effectiveHosts(list, entryHosts = []) {
  const own = GM.hostListOf(Array.isArray(entryHosts) ? entryHosts.filter((h) => h !== ENTRY_HOSTS) : []) || [];
  const out = [];
  for (const h of Array.isArray(list) ? list : []) for (const x of h === ENTRY_HOSTS ? own : [h]) if (!out.includes(x)) out.push(x);
  return out;
}
/** The run hosts a member (or a bare hosts array) does NOT cover — [] when it covers every one. Each grant-host's wildcard
 *  is scoped to the CLI that minted it (round 4, item 3: PER HOST — `toolOfHost`), a concrete host to any. */
const missingHosts = (entry, run, runTool = null, entryHosts = []) => {
  const member = Array.isArray(entry) ? null : (entry || null);
  const list = Array.isArray(entry) ? entry : effectiveHosts(entry && entry.hosts, entryHosts);
  return runHostsOf(run).filter((h) => !(list || []).some((g) => coversForTool(g, h, member ? toolOfHost(member, g) : null, runTool)));
};
const live = (e, now) => !(e && Number(e.until) > 0 && Number(e.until) <= now);
const memberOf = (hit, entryHosts) => (hit ? { id: grantIdOf(hit.row.resource, GM.principalKey(hit.entry)), via: hit.entry.kind, principal: GM.principalKey(hit.entry), hosts: effectiveHosts(hit.entry.hosts, entryHosts), declared: (hit.entry.hosts || []).slice(), tool: hit.entry.tool || null, toolFor: hit.entry.toolFor || null, until: Number(hit.entry.until) > 0 ? Number(hit.entry.until) : null } : null);

/** THE VERDICT of one use of one entry (see the head). `run` = { hosts, destinationKnown, entryHosts, tool, now }. */
function useVerdict(rows, facts = {}, { hosts = [], destinationKnown = false, entryHosts = [], tool = null, now = 0 } = {}) {
  const v = GM.admits(rows, facts);
  if (!v.ok) return { ok: false, code: v.code, ...(v.entry ? { except: GM.principalKey(v.entry) } : {}) };
  const alive = v.hits.filter((h) => live(h.entry, now));
  if (!alive.length) return { ok: false, code: 'expired', expired: memberOf(v.hits[0], entryHosts) };
  const run = runHostsOf(hosts);
  let best = null, bestMissing = null;
  for (const h of alive) {   // admits' hits: the most specific first (its own › a group's › everyone)
    const miss = missingHosts(h.entry, run, tool, entryHosts);
    if (destinationKnown === true && run.length && !miss.length) return { ok: true, id: grantIdOf(h.row.resource, GM.principalKey(h.entry)), via: h.entry.kind, entry: h.entry, hosts: effectiveHosts(h.entry.hosts, entryHosts) };
    if (!best || miss.length < bestMissing.length) { best = h; bestMissing = miss; }
  }
  const member = memberOf(best, entryHosts);
  if (destinationKnown !== true || !run.length) return { ok: false, code: 'destination_unknown', member };
  return { ok: false, code: 'outside_hosts', member, missing: bestMissing };
}
/** Does the caller hold the entry (a live member, whatever the hosts)? — the entry is open to it (the card may still ask). */
const holds = (verdict) => !!(verdict && (verdict.ok || verdict.member));

// ── THE PLANS (src/server/vault-use-grants.js writes them through the ONE writer) ──
const rowLists = (row) => { const p = row ? GM.publicRow(row) : { to: [], except: [] }; return p.unknown ? null : { to: p.to || [], except: p.except || [] }; };
/** Add — or WIDEN — ONE member: `principal` (a bare principal), `hosts` (a list of host tokens), `until` (ms | null = no
 *  end). A member already there keeps its entry, its hosts gain the new ones (∪) and its end becomes the later of the two
 *  (no end wins); it leaves `except`. → { ok: true, to, except, widened, added } | { ok: false, code } (`unknown_shape`:
 *  the row cannot be read — nothing is read wider; `bad_principal`; `hosts_required`; `too_many_hosts`). */
function withMember(row, principal, { hosts = [], until = null, tool = null } = {}) {
  const cur = rowLists(row);
  if (!cur) return { ok: false, code: 'unknown_shape' };
  const b = GM.bareOf(principal), key = b && GM.principalKey(b);
  if (!key) return { ok: false, code: 'bad_principal' };
  const add = GM.hostListOf(Array.isArray(hosts) ? hosts : []);
  if (!add) return { ok: false, code: 'hosts_required' };
  const end = Number(until) > 0 ? Math.floor(Number(until)) : null;
  const tl = tool ? String(tool).toLowerCase() : null;   // round 4 (item 3): the CLI a wildcard THIS «Always» mints is scoped to — PER HOST
  const i = cur.to.findIndex((e) => GM.principalKey(e) === key);
  const to = cur.to.slice();
  let widened = false;
  if (i >= 0) {
    const was = to[i], merged = [...(was.hosts || [])];
    // round 4 (item 3): the tool is PER HOST. Carry the member's existing per-host scopes forward (migrating a legacy single
    // `tool` onto its wildcard rows), then scope ONLY the hosts THIS «Always» adds — an existing row's tool is never rewritten.
    const toolFor = { ...(was.toolFor || {}) };
    if (was.tool) for (const h of (was.hosts || [])) if (String(h).startsWith('*.') && !(h in toolFor)) toolFor[h] = String(was.tool).toLowerCase();
    for (const h of add) if (!merged.includes(h)) { merged.push(h); widened = true; if (tl && String(h).startsWith('*.')) toolFor[h] = tl; }
    if (merged.length > GM.HOSTS_MAX) return { ok: false, code: 'too_many_hosts' };
    const wasEnd = Number(was.until) > 0 ? Number(was.until) : null;
    const nextEnd = wasEnd == null || end == null ? null : Math.max(wasEnd, end);
    if (nextEnd !== wasEnd) widened = true;
    const next = { ...was, hosts: merged };
    if (nextEnd == null) delete next.until; else next.until = nextEnd;
    delete next.tool;   // replaced by the per-host `toolFor`
    if (Object.keys(toolFor).length) next.toolFor = toolFor; else delete next.toolFor;
    to[i] = next;
  } else {
    const e = { ...b, ...(principal.name ? { name: String(principal.name) } : {}), hosts: add };
    if (end != null) e.until = end;
    const toolFor = {};
    if (tl) for (const h of add) if (String(h).startsWith('*.')) toolFor[h] = tl;   // only a WILDCARD carries a tool; a plain host is tool-agnostic
    if (Object.keys(toolFor).length) e.toolFor = toolFor;
    to.push(e);
  }
  return { ok: true, to, except: cur.except.filter((x) => GM.principalKey(x) !== key), widened, added: i < 0 };
}
/** Revoke ONE member (`principalKey`) — its exceptions stay with the row. → { ok, to, except, removed } | unknown_shape. */
function withoutMember(row, principalKey) {
  const cur = rowLists(row);
  if (!cur) return { ok: false, code: 'unknown_shape' };
  const to = cur.to.filter((e) => GM.principalKey(e) !== String(principalKey || ''));
  return { ok: true, to, except: to.length ? cur.except : [], removed: to.length !== cur.to.length };
}
/** THE CARRY of data/vault-run.json's «always» rows (each `{conv, key: <shape key>, until, entries}` — a command SHAPE a
 *  conversation was let run without asking) into members: per entry of the row, the conversation × the shape key's HOSTS
 *  (src/vault-run.js shapeKeyOf: `<v>:[tool, sub, flags, args, hosts, …]`) × the row's end. An expired row, or one whose
 *  shape names no host, is not carried (counted). → { members: [{resource, principal, hosts, until}], expired, hostless }. */
function alwaysCarry(always, { now = 0, resourceOf = (id) => id } = {}) {
  const members = [];
  let expired = 0, hostless = 0;
  for (const a of Array.isArray(always) ? always : []) {
    if (!a || typeof a.conv !== 'string' || !a.conv || typeof a.key !== 'string') continue;
    if (a.until != null && !(Number(a.until) > now)) { expired++; continue; }
    let hosts = null;
    try { const arr = JSON.parse(a.key.slice(a.key.indexOf(':') + 1)); hosts = GM.hostListOf(Array.isArray(arr) ? arr[4] : null); } catch { hosts = null; }
    if (!hosts) { hostless++; continue; }
    const principal = GM.bareOf({ kind: 'conversation', key: a.conv });
    if (!principal) continue;
    for (const id of Array.isArray(a.entries) ? a.entries : []) {
      const resource = resourceOf(String(id));
      if (resource && GM.resourceShapeOk(DOOR, resource)) members.push({ resource, principal, hosts, until: a.until == null ? null : Number(a.until) });
    }
  }
  return { members, expired, hostless };
}

// ── WHAT A PAGE SEES (the Vault window's «谁可以用» chips) ──
/** A row's members as the window draws them: [{id, kind, key|id, name, hosts (declared), until, expired}] + except. */
function publicGrants(row, { now = 0 } = {}) {
  const p = row ? GM.publicRow(row) : null;
  if (!p) return { to: [], except: [] };
  if (p.unknown) return { unknown: true, why: p.why, to: [], except: [] };
  return {
    to: (p.to || []).map((e) => ({ ...e, id: grantIdOf(p.resource, GM.principalKey(e)), principal: GM.principalKey(e), hosts: (e.hosts || []).slice(), tool: e.tool || null, toolFor: e.toolFor || null, until: Number(e.until) > 0 ? Number(e.until) : null, expired: !live(e, now) })),
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
    const on = v.member.hosts.length ? v.member.hosts.join(', ') : 'no host';
    if (v.code === 'outside_hosts') out.push(`A standing approval exists for this conversation (${v.member.id}: ${on}) — this run is outside it: ${v.missing.join(', ')}.${always ? ` «Always» widens it to ${v.missing.join(', ')}.` : ''}`);
    else if (v.code === 'destination_unknown') out.push(`A standing approval exists for this conversation (${v.member.id}: ${on}) — where this run sends it cannot be told, so it asks.`);
  }
  return [...new Set(out)];
}

module.exports = { DOOR, ENTRY_HOSTS, ID_RE, CODES, grantIdOf, hostCovers, runHostsOf, effectiveHosts, missingHosts, useVerdict, holds, withMember, withoutMember, alwaysCarry, publicGrants, standingLines };
