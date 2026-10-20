'use strict';
// THE SEALED ORDERS' PROVIDER RULE (lane pool-provider-latents, design q-055 M1) — PURE, imports nothing: the hub writes
// an order's provider fields (usage-pool-engine pushSealedOrders → `orderProviderFields`), the device obeys them
// (agentd sealedOrders._execute → `deviceFallback`). One file, so the two halves cannot drift.
//
// A device's local fallback is a HOT re-point made while no hub is reachable: the running CLI follows the credential
// link by itself, its base URL and model env stay. So it NEVER lands on another provider, whatever the pool's
// crossProvider says — under 'never' that move is the owner's card, under 'allow' it is COLD (the engine's
// applyCrossMove: a connected client restarts the conversation on the re-resolved model, with its line), and a device
// with no hub has neither. Under both settings the device's candidates are the members of the conversation's OWN
// provider, which serve its model by construction (one provider, one list).
//
// THE ORDER'S PROVIDER FIELDS (a hub of this lane writes all four; an older hub writes none):
//   provider            the default link's conversation provider (the provider of the member the default points at)
//   ranked[i].provider  each fallback path's provider
//   links               [{path, provider}] — every per-session link and its conversation's provider at the push
//   members             {memberId: provider} for every member a link may point at — the device re-reads the link at the
//                       banner and names the conversation's provider by the member it points at NOW
// Providers are opaque keys (the hub's providerKey). An order with NO provider field (an older hub — every pool was one
// provider) is its own provider: the old walk, unchanged. Where the order HAS provider fields, a missing one never
// widens: an unknown provider matches nothing, and the device does not move.

/** Does this order carry the provider fields at all? */
function providerAware(orders) {
  const o = orders || {};
  return o.provider != null || (o.members != null && typeof o.members === 'object') || Array.isArray(o.links)
    || (Array.isArray(o.ranked) && o.ranked.some((r) => r && r.provider != null));
}

/** The conversation provider the order recorded for a link (the default link's is the order's own). */
function recordedProviderOf(orders, link) {
  const o = orders || {};
  if (!link || link === o.linkPath) return o.provider == null ? null : String(o.provider);
  const row = (Array.isArray(o.links) ? o.links : []).find((l) => l && l.path === link);
  return row && row.provider != null ? String(row.provider) : null;
}

/** THE DEVICE'S CHOICE for one banner: `link` = the link the banner session reads (matched by the scan), `currentDir`
 *  = where it points NOW (readlink), `currentId` = that member's id (the dir's basename). → {next, provider, why}:
 *  `next` a ranked row of the conversation's OWN provider (not the dir it is on), or null with `why`:
 *  'no-fallback' (nothing ranked but where it is) · 'provider-unknown' (the order cannot name its provider — never a
 *  guess) · 'moved-since' (the link now points at another provider's member than the order recorded — the hub moved it
 *  after the push; only the hub decides) · 'no-same-provider' (only another provider's members are ranked). */
function deviceFallback({ orders, link = null, currentDir = null, currentId = null } = {}) {
  const o = orders || {};
  const ranked = (Array.isArray(o.ranked) ? o.ranked : []).filter((m) => m && m.dir && m.dir !== currentDir);
  if (!providerAware(o)) return { next: ranked[0] || null, provider: null, why: ranked.length ? null : 'no-fallback' };
  const recorded = recordedProviderOf(o, link);
  const table = o.members && typeof o.members === 'object' ? o.members : {};
  const nowProv = currentId != null && Object.prototype.hasOwnProperty.call(table, currentId) && table[currentId] != null ? String(table[currentId]) : null;
  if (recorded != null && nowProv != null && recorded !== nowProv) return { next: null, provider: nowProv, why: 'moved-since' };
  const provider = nowProv != null ? nowProv : recorded;
  if (provider == null) return { next: null, provider: null, why: 'provider-unknown' };
  if (!ranked.length) return { next: null, provider, why: 'no-fallback' };
  const next = ranked.find((m) => m.provider != null && String(m.provider) === provider) || null;
  return { next, provider, why: next ? null : 'no-same-provider' };
}

/** THE HUB'S HALF: an order's provider fields. `ranked` = the ranked rows ({id, dir, creds}); `links` = [{path, member}]
 *  (member = the link's target, null when unreadable); `memberIds` = the pool's members; `defaultMember` = where the
 *  default link points; `providerKeyOf(memberId)` = the hub's provider key for a member (never throws).
 *  `linkPaths` is what an OLDER daemon reads (it ignores the rest): only the links of the ranked list's provider, so an
 *  older daemon can never match — and so never re-point — a conversation of another provider. */
function orderProviderFields({ ranked = [], links = [], memberIds = [], defaultMember = null, providerKeyOf } = {}) {
  const keyOf = (id) => { try { const k = providerKeyOf(id); return k == null ? null : String(k); } catch { return null; } };
  const provider = keyOf(defaultMember);
  const members = {};
  for (const id of [...memberIds, ...ranked.map((r) => r && r.id), ...links.map((l) => l && l.member), defaultMember]) {
    if (typeof id === 'string' && id && !Object.prototype.hasOwnProperty.call(members, id)) members[id] = keyOf(id);
  }
  const rows = links.filter((l) => l && l.path).map((l) => ({ path: l.path, provider: keyOf(l.member) }));
  return {
    provider,
    ranked: ranked.map((r) => ({ ...r, provider: keyOf(r.id) })),
    links: rows,
    members,
    linkPaths: rows.filter((l) => l.provider != null && l.provider === provider).map((l) => l.path),
  };
}

module.exports = { providerAware, recordedProviderOf, deviceFallback, orderProviderFields };
