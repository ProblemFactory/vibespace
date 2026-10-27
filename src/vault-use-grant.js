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
/** Does grant host `g` cover run host `h`? The same host, or (both DNS names) `h` under `g`. */
function hostCovers(g, h) {
  const a = String(g || '').toLowerCase(), b = String(h || '').toLowerCase();
  if (!a || !b) return false;
  if (a === b) return true;
  return !isAddress(a) && !isAddress(b) && /[a-z]/.test(a) && b.endsWith(`.${a}`);
}
/** A run's hosts in the one spelling (lower case, no trailing dot, no IPv6 brackets) — what the shape says (src/vault-run.js). */
const runHostsOf = (hosts) => [...new Set((Array.isArray(hosts) ? hosts : []).map((h) => String(h == null ? '' : h).trim().toLowerCase().replace(/\.$/, '').replace(/^\[(.*)\]$/, '$1')).filter(Boolean))];
/** An entry's hosts as they stand at use time: `@entry` → the entry's own hosts (GM.hostListOf's spelling). */
function effectiveHosts(list, entryHosts = []) {
  const own = GM.hostListOf(Array.isArray(entryHosts) ? entryHosts.filter((h) => h !== ENTRY_HOSTS) : []) || [];
  const out = [];
  for (const h of Array.isArray(list) ? list : []) for (const x of h === ENTRY_HOSTS ? own : [h]) if (!out.includes(x)) out.push(x);
  return out;
}
/** The run hosts `hosts` (an entry's effective list) does NOT cover — [] when it covers every one. */
const missingHosts = (hosts, run) => runHostsOf(run).filter((h) => !(hosts || []).some((g) => hostCovers(g, h)));
const live = (e, now) => !(e && Number(e.until) > 0 && Number(e.until) <= now);
const memberOf = (hit, entryHosts) => (hit ? { id: grantIdOf(hit.row.resource, GM.principalKey(hit.entry)), via: hit.entry.kind, principal: GM.principalKey(hit.entry), hosts: effectiveHosts(hit.entry.hosts, entryHosts), declared: (hit.entry.hosts || []).slice(), until: Number(hit.entry.until) > 0 ? Number(hit.entry.until) : null } : null);

/** THE VERDICT of one use of one entry (see the head). `run` = { hosts, destinationKnown, entryHosts, now }. */
function useVerdict(rows, facts = {}, { hosts = [], destinationKnown = false, entryHosts = [], now = 0 } = {}) {
  const v = GM.admits(rows, facts);
  if (!v.ok) return { ok: false, code: v.code, ...(v.entry ? { except: GM.principalKey(v.entry) } : {}) };
  const alive = v.hits.filter((h) => live(h.entry, now));
  if (!alive.length) return { ok: false, code: 'expired', expired: memberOf(v.hits[0], entryHosts) };
  const run = runHostsOf(hosts);
  let best = null, bestMissing = null;
  for (const h of alive) {   // admits' hits: the most specific first (its own › a group's › everyone)
    const miss = missingHosts(effectiveHosts(h.entry.hosts, entryHosts), run);
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
function withMember(row, principal, { hosts = [], until = null } = {}) {
  const cur = rowLists(row);
  if (!cur) return { ok: false, code: 'unknown_shape' };
  const b = GM.bareOf(principal), key = b && GM.principalKey(b);
  if (!key) return { ok: false, code: 'bad_principal' };
  const add = GM.hostListOf(Array.isArray(hosts) ? hosts : []);
  if (!add) return { ok: false, code: 'hosts_required' };
  const end = Number(until) > 0 ? Math.floor(Number(until)) : null;
  const i = cur.to.findIndex((e) => GM.principalKey(e) === key);
  const to = cur.to.slice();
  let widened = false;
  if (i >= 0) {
    const was = to[i], merged = [...(was.hosts || [])];
    for (const h of add) if (!merged.includes(h)) { merged.push(h); widened = true; }
    if (merged.length > GM.HOSTS_MAX) return { ok: false, code: 'too_many_hosts' };
    const wasEnd = Number(was.until) > 0 ? Number(was.until) : null;
    const nextEnd = wasEnd == null || end == null ? null : Math.max(wasEnd, end);
    if (nextEnd !== wasEnd) widened = true;
    const next = { ...was, hosts: merged };
    if (nextEnd == null) delete next.until; else next.until = nextEnd;
    to[i] = next;
  } else {
    const e = { ...b, ...(principal.name ? { name: String(principal.name) } : {}), hosts: add };
    if (end != null) e.until = end;
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
    to: (p.to || []).map((e) => ({ ...e, id: grantIdOf(p.resource, GM.principalKey(e)), principal: GM.principalKey(e), hosts: (e.hosts || []).slice(), until: Number(e.until) > 0 ? Number(e.until) : null, expired: !live(e, now) })),
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
