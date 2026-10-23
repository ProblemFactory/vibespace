'use strict';
/**
 * THE GRANTS MIGRATION — ORCH (lane grants-unify, 2026-10-23): `2026-10-grants-unify`, run by src/server/migrations.js
 * through src/migration-runner.js (at most once; a failed run is retried next boot). The pre-unify who-lists become
 * rows of THE grants store (src/server/grants-store.js) by the model's own legacy mappers (src/grant-model.js; the
 * channel index by src/server/channels-grants.js `rowsOfChannelIndex`):
 *
 *   data/hosts.json             exit.use / exit.run (a pre-list allowExit)        → exit              <hostId>:use|run
 *   data/browser-profiles.json  owner (instance / only / the pre-list singles)    → browser-profile   <profileId>
 *   data/automation-keys.json   grants[].subject / .reach                         → automation-key-use / -reach  <grantId>
 *   data/channels/index.json    grain access + watchers, reachEntries,            → channel-reach / -watch / -api
 *                               accountGrants, apiGrants
 *   data/window-reach.json      windows[].rows                                    → window            <windowId>
 *   data/task-groups.json       tasks[].externalVisibility                        → group-visibility  <groupId>
 *
 * THE EQUIVALENCE CHECK, per resource, before its row is written: for every principal the old rows name (a
 * conversation in its old spelling AND the one spelling, a member of each named Task Group, an outsider, every live
 * session handed in), the OLD reader's verdict (GM.LEGACY — the pre-unify admission) must equal the NEW one (`admits`
 * over the mapped row, through the same reader the door uses). A resource whose verdicts differ is NOT written (no row
 * = nobody — closed) and NAMED; the run then fails by name (the ledger records it; the next boot retries) — every
 * resource that agreed is written (an owner's grants never all go dark for one odd row). A resource the store already
 * holds a row for (a door wrote it since the upgrade) is kept and not judged again. Also: a machine whose `run` list
 * asked each time keeps asking (`exit.run.ask` → the record's `exit.ask`). The old fields stay on disk ONE release,
 * unread (docs/changelog-engineering.md names the follow-up that strips them).
 */
const fs = require('fs');
const path = require('path');
const GM = require('../grant-model.js');
const F = require('../channel-filter.js');
const ACL = require('../channel-acl.js');
const B = require('../browser-profiles.js');
const A = require('../automation-keys.js');
const GS = require('./grants-store.js');
const ChannelsGrants = require('./channels-grants.js');

const PROBE_MEMBER = 'probe-member-0';
const PROBE_OUTSIDER = 'probe-outsider-0';
const PROBE_BK = 'bk-0000beef';   // a browser key no record names (the outsider's own browser)

/** A store file: `{doc}` (null = absent) — unreadable ⇒ the run fails by name, nothing written. */
function readStore(dataDir, rel) {
  const file = path.join(dataDir, rel);
  try { return JSON.parse(fs.readFileSync(file, 'utf-8')); } catch (e) {
    if (e && e.code === 'ENOENT') return null;
    throw new Error(`data/${rel} is unreadable (${e.message}) — the grants were not carried over; nothing was written`);
  }
}
/** The pre-unify reader of a browser profile's "Who can use it" (2.369.344 `whoMayUse`, kept here for the check). */
function oldWhoMayUse(p) {
  if (p.legacy) return { mode: 'all' };
  const o = p.owner;
  if (o === undefined || o === null) return { mode: 'all' };
  if (typeof o !== 'object' || Array.isArray(o)) return { mode: 'unknown' };
  if (o.kind === 'instance') return { mode: 'all' };
  if (o.kind === 'session' || o.kind === 'task') { const w = B.whoRow(o); return w ? { mode: 'only', who: [w] } : { mode: 'unknown' }; }
  if (o.kind === 'only' && Array.isArray(o.who)) return { mode: 'only', who: B.normalizeWho(o.who) };
  return { mode: 'unknown' };
}

/**
 * Plan the migration over the stores on disk (+ the channel engine's live index, + the live roster): every door's
 * rows, each resource judged. → `{rows:[row], refused:[{door, resource, who}], unknown:[{door, resource}], counts, asks}`.
 * `has(door, resource)` = the store already holds that row (kept, not judged). PURE over its inputs but for the reads.
 */
function plan({ dataDir, channelIndex = null, resolveBrowserKey = () => null, live = [], has = () => false } = {}) {
  const rows = [], refused = [], unknown = [], counts = {};
  const roster = (Array.isArray(live) ? live : []).filter((s) => s && s.cid);
  const judge = (door, resource, mapped, probes, oldOf, newOf) => {
    if (has(door, resource)) { counts[door].kept++; return; }
    const bad = probes.filter((pr) => !!oldOf(pr) !== !!newOf(pr)).map((pr) => pr.label);
    if (bad.length) { refused.push({ door, resource, who: bad.slice(0, 6) }); counts[door].refused++; return; }
    for (const r of mapped) rows.push(r);
    counts[door].rows += mapped.length;
  };
  const tally = (door) => { counts[door] = counts[door] || { rows: 0, kept: 0, refused: 0, unknown: 0 }; return counts[door]; };

  // ── exit ──
  const hostsDoc = readStore(dataDir, 'hosts.json');
  const asks = [];
  tally('exit');
  for (const h of hostsDoc && Array.isArray(hostsDoc.hosts) ? hostsDoc.hosts : []) {
    if (!h || typeof h.id !== 'string' || !h.id) continue;
    const m = GM.fromHostExit(h);
    if (h.exit && h.exit.run && h.exit.run.ask === true && h.exit.ask === undefined) asks.push(h.id);
    for (const g of ['use', 'run']) {
      const resource = `${h.id}:${g}`;
      if (m[g] && m[g].unknown) { unknown.push({ door: 'exit', resource }); counts.exit.unknown++; continue; }   // both refuse: the old reader could not read it
      const old = h.exit !== undefined ? (h.exit && h.exit[g]) : (h.allowExit === true ? { mode: 'everyone' } : { mode: 'nobody' });
      const mapped = m[g] && m[g].to.length ? [{ door: 'exit', resource, to: m[g].to, except: [] }] : [];
      const probes = [{ label: 'an outsider', old: { sessionKeys: [`claude:${PROBE_OUTSIDER}`] }, now: { conversationKey: PROBE_OUTSIDER } }];
      for (const w of old && Array.isArray(old.who) ? old.who : []) {
        if (w && w.kind === 'session') probes.push({ label: `conversation ${String(w.id).slice(0, 60)}`, old: { sessionKeys: [String(w.id)] }, now: { conversationKey: GM.keyFromSessionKey(w.id) || String(w.id) } });
        if (w && w.kind === 'group') probes.push({ label: `a member of Task Group ${String(w.id).slice(0, 60)}`, old: { sessionKeys: [`claude:${PROBE_MEMBER}`], groupIds: [String(w.id)] }, now: { conversationKey: PROBE_MEMBER, groupIds: [String(w.id)] } });
      }
      for (const s of roster) probes.push({ label: `live ${s.cid}`, old: { sessionKeys: s.sessionKeys || [], groupIds: s.groups || [] }, now: { conversationKeys: [s.cid], groupIds: s.groups || [] } });
      judge('exit', resource, mapped, probes, (pr) => GM.LEGACY.exit(h, g, pr.old), (pr) => GM.admits(mapped, pr.now).ok);
    }
  }

  // ── browser-profile ──
  const bpDoc = readStore(dataDir, 'browser-profiles.json');
  tally('browser-profile');
  for (const p of bpDoc && Array.isArray(bpDoc.profiles) ? bpDoc.profiles : []) {
    if (!p || typeof p.id !== 'string' || !p.id || B.isEphemeralProfile(p)) continue;
    const resolveKey = GM.browserKeyResolver(resolveBrowserKey);   // THE ONE spelling: a key no binding names stands for its conversation
    const m = GM.fromBrowserOwner(p, { resolveBrowserKey });
    if (m.ephemeral) continue;
    if (m.unknown) { unknown.push({ door: 'browser-profile', resource: p.id }); counts['browser-profile'].unknown++; continue; }
    const U = oldWhoMayUse(p);
    const mapped = [{ door: 'browser-profile', resource: p.id, to: m.to, except: [] }];
    const probes = [{ label: 'an outsider', old: { browserKey: PROBE_BK }, now: { conversationKeys: [PROBE_OUTSIDER, PROBE_BK] } }];
    for (const w of U.who || []) {
      if (w.kind === 'session') probes.push({ label: `conversation of ${w.id}`, old: { browserKey: w.id }, now: { conversationKeys: [...new Set([resolveKey(w.id), GM.browserKeyResolver()(w.id)])] } });   // the keeper's caller keys: its conversation + its (parent) browser key
      if (w.kind === 'task') probes.push({ label: `a member of Task Group ${w.id}`, old: { browserKey: PROBE_BK, taskIds: [w.id] }, now: { conversationKeys: [PROBE_MEMBER, PROBE_BK], groupIds: [w.id] } });
    }
    for (const s of roster) if (s.browserKey) probes.push({ label: `live ${s.cid}`, old: { browserKey: s.browserKey, taskIds: s.groups || [] }, now: { conversationKeys: [s.cid, s.browserKey], groupIds: s.groups || [] } });
    judge('browser-profile', p.id, mapped, probes, (pr) => GM.LEGACY.browser(U, pr.old), (pr) => GM.admits(mapped, pr.now).ok);
  }

  // ── automation-key-use / -reach ──
  const akDoc = readStore(dataDir, 'automation-keys.json');
  tally('automation-key-use'); tally('automation-key-reach');
  for (const g of akDoc && Array.isArray(akDoc.grants) ? akDoc.grants : []) {
    if (!g || typeof g.id !== 'string' || !g.id || g.subject === 'external') continue;
    const oldReach = A.reachOf(g.reach === undefined ? 'opened' : g.reach);
    const oldValid = oldReach !== null && A.isSubject(String(g.subject || ''));   // a damaged grant was void (the old grantOf dropped it)
    const u = GM.fromAutomationGrant(g), r = GM.fromAutomationReach(g.reach);
    if (!u || (r && r.unknown)) { unknown.push({ door: 'automation-key-use', resource: g.id }); counts['automation-key-use'].unknown++; continue; }
    const subj = String(g.subject);
    const useRows = [{ door: 'automation-key-use', resource: g.id, to: u.to, except: [] }];
    const uProbes = [{ label: 'an outsider', subjects: [`session:${PROBE_OUTSIDER}`], now: { conversationKey: PROBE_OUTSIDER } }];
    if (subj.startsWith('session:')) uProbes.push({ label: `conversation ${subj.slice(8, 68)}`, subjects: [subj], now: { conversationKey: GM.keyFromSubject(subj) || subj } });
    if (subj.startsWith('group:')) uProbes.push({ label: `a member of Task Group ${subj.slice(6, 66)}`, subjects: [`session:${PROBE_MEMBER}`, subj], now: { conversationKey: PROBE_MEMBER, groupIds: [subj.slice(6)] } });
    for (const s of roster) uProbes.push({ label: `live ${s.cid}`, subjects: [`session:${s.cid}`, ...(s.groups || []).map((x) => `group:${x}`)], now: { conversationKey: s.cid, groupIds: s.groups || [] } });
    judge('automation-key-use', g.id, useRows, uProbes, (pr) => oldValid && GM.LEGACY.automationUse(g, pr.subjects), (pr) => GM.admits(useRows, pr.now).ok);
    const reachRows = r ? [{ door: 'automation-key-reach', resource: g.id, to: r.to, except: [] }] : [];
    const rProbes = [{ label: 'a target in no Task Group', groups: [], now: { conversationKey: PROBE_OUTSIDER } }];
    for (const tg of oldReach && typeof oldReach === 'object' && Array.isArray(oldReach.taskGroups) ? oldReach.taskGroups : []) rProbes.push({ label: `a target in Task Group ${tg}`, groups: [tg], now: { conversationKey: PROBE_MEMBER, groupIds: [tg] } });
    judge('automation-key-reach', g.id, reachRows, rProbes, (pr) => oldValid && GM.LEGACY.automationReach(oldReach, pr.groups), (pr) => GM.admits(reachRows, pr.now).ok);
  }

  // ── window ──
  const wrDoc = readStore(dataDir, 'window-reach.json');
  tally('window');
  for (const [id, rec] of Object.entries(wrDoc && wrDoc.windows && typeof wrDoc.windows === 'object' ? wrDoc.windows : {})) {
    if (!rec || typeof rec !== 'object') continue;
    const m = GM.fromWindowRecord(rec);
    const mapped = m.to.length ? [{ door: 'window', resource: String(id), to: m.to, except: [] }] : [];
    const probes = [{ label: 'an outsider', old: { sessionKeys: [`claude:${PROBE_OUTSIDER}`] }, now: { conversationKey: PROBE_OUTSIDER } }];
    for (const r of Array.isArray(rec.rows) ? rec.rows : []) {
      const p = r && r.principal;
      if (p && p.kind === 'session') probes.push({ label: `conversation ${String(p.id).slice(0, 60)}`, old: { sessionKeys: [String(p.id)] }, now: { conversationKey: GM.keyFromSessionKey(p.id) || String(p.id) } });
      if (p && p.kind === 'group') probes.push({ label: `a member of Task Group ${String(p.id).slice(0, 60)}`, old: { sessionKeys: [`claude:${PROBE_MEMBER}`], groupIds: [String(p.id)] }, now: { conversationKey: PROBE_MEMBER, groupIds: [String(p.id)] } });
    }
    for (const s of roster) probes.push({ label: `live ${s.cid}`, old: { sessionKeys: s.sessionKeys || [], groupIds: s.groups || [] }, now: { conversationKeys: [s.cid], groupIds: s.groups || [] } });
    judge('window', String(id), mapped, probes, (pr) => GM.LEGACY.window(rec, pr.old), (pr) => GM.admits(mapped, pr.now).ok);
  }

  // ── group-visibility ──
  const tgDoc = readStore(dataDir, 'task-groups.json');
  tally('group-visibility');
  const tasks = tgDoc && tgDoc.tasks ? (Array.isArray(tgDoc.tasks) ? tgDoc.tasks : Object.values(tgDoc.tasks)) : [];
  for (const t of tasks) {
    if (!t || !t.id || t.externalVisibility === undefined || t.externalVisibility === null) continue;
    const m = GM.fromGroupVisibility(t.externalVisibility, String(t.id));
    const mapped = m ? [{ door: 'group-visibility', resource: String(t.id), to: m.to, except: [] }] : [];
    const probes = [{ label: 'a member', groups: [String(t.id)], now: { conversationKey: PROBE_MEMBER, groupIds: [String(t.id)] } }, { label: 'an outsider', groups: [], now: { conversationKey: PROBE_OUTSIDER } }];
    judge('group-visibility', String(t.id), mapped, probes, (pr) => GM.LEGACY.groupVisibility(t.externalVisibility, String(t.id), pr.groups), (pr) => GM.admits(mapped, pr.now).ok);
  }

  // ── channels ──
  const ix = channelIndex || readStore(dataDir, path.join('channels', 'index.json'));
  for (const d of ['channel-reach', 'channel-watch', 'channel-api']) tally(d);
  if (ix && typeof ix === 'object') {
    const ch = ChannelsGrants.rowsOfChannelIndex(ix, { F });
    for (const u of ch.unknown) { unknown.push({ door: 'channel-reach', resource: u.where }); counts['channel-reach'].unknown++; }
    const byRes = new Map();
    for (const r of ch.rows) byRes.set(`${r.door}\u0000${r.resource}`, r);
    // the NEW reader over the mapped rows: a scratch in-memory store, read through the door's own reader
    const mem = GS.create({ memory: true });
    try { mem.seed(ch.rows, 'migration-check'); } catch (e) { throw new Error(`the channel rows could not be read back (${e.message}) — the grants were not carried over; nothing was written`); }
    const cg = ChannelsGrants.create({ grants: mem });
    const named = new Set(), groups = new Set();
    const note = (p) => { if (!p) return; if (p.kind === 'agent' && p.id) named.add(String(p.id)); if (p.kind === 'group' && p.id) groups.add(String(p.id)); };
    for (const en of Object.values(ix.conversations || {})) { for (const g of (en && en.reachEntries) || []) note(g && g.principal); for (const a of (en && en.access) || []) note(a && a.principal); if (en && en.assignment) note(en.assignment.principal); }
    for (const tb of ['accountAssignments', 'patternAssignments']) for (const h of Object.values(ix[tb] || {})) { if (!h) continue; for (const a of h.access || []) note(a && a.principal); if (h.principal) note(h.principal); }
    for (const g of [...(ix.accountGrants || []), ...(ix.apiGrants || [])]) note(g && g.principal);
    const probes = [{ label: 'an outsider', ctx: { kind: 'agent', id: PROBE_OUTSIDER, groups: [] } }];
    for (const id of named) probes.push({ label: `agent ${id.slice(0, 60)}`, ctx: { kind: 'agent', id, groups: [] } });
    for (const g of groups) probes.push({ label: `a member of Task Group ${g.slice(0, 60)}`, ctx: { kind: 'agent', id: PROBE_MEMBER, groups: [g] } });
    for (const s of roster) probes.push({ label: `live ${s.cid}`, ctx: { kind: 'agent', id: s.cid, groups: s.groups || [] } });
    const oldLevel = (ctx, target, grants) => { let best = 0; for (const g of grants) if (g && GM.LEGACY.channel(g, ctx) && ACL.scopeApplies(g.scope, target)) best = Math.max(best, ACL.RANK[ACL.LEVELS.includes(g.level) ? g.level : 'hidden']); return best; };
    const newLevel = (ctx, target, grants) => ACL.RANK[ACL.effective(ctx, target, grants).level];
    const judgeReach = (resList, target, oldGrants, newGrants) => {
      const mapped = resList.map((res) => byRes.get(`channel-reach\u0000${res}`)).filter(Boolean);
      const resource = resList[0];
      judge('channel-reach', resource, mapped, probes, (pr) => oldLevel(pr.ctx, target, oldGrants), (pr) => newLevel(pr.ctx, target, newGrants));
      // a level difference (requestable vs visible) is a difference too — the boolean above only asks "anything"
      if (!has('channel-reach', resource) && !refused.some((x) => x.door === 'channel-reach' && x.resource === resource)) {
        const off = probes.filter((pr) => oldLevel(pr.ctx, target, oldGrants) !== newLevel(pr.ctx, target, newGrants)).map((pr) => pr.label);
        if (off.length) {
          for (const m of mapped) { const i = rows.indexOf(m); if (i >= 0) { rows.splice(i, 1); counts['channel-reach'].rows--; } }
          refused.push({ door: 'channel-reach', resource, who: off.slice(0, 6) }); counts['channel-reach'].refused++;
        }
      }
    };
    // a conversation's OWN rows (its access, the owner's, approved requests) against its old reach rows
    for (const [key, en] of Object.entries(ix.conversations || {})) {
      if (!en) continue;
      const own = (Array.isArray(en.reachEntries) ? en.reachEntries : []).filter((x) => x && x.scope && ((x.scope.kind === 'conversation' && x.scope.id === key) || (x.scope.kind === 'adapter' && x.scope.id === en.adapterId)));
      const resList = [ChannelsGrants.RES.conversation(key), ChannelsGrants.RES.user(key), ChannelsGrants.RES.request(key)].filter((res) => byRes.has(`channel-reach\u0000${res}`));
      if (!own.length && !resList.length) continue;
      const target = { key, adapterId: en.adapterId };
      // the pre-unify reader read an account-scoped row on this list for THIS conversation alone — so the target is this one
      const oldGrants = own.map((g) => (g.scope.kind === 'adapter' ? { ...g, scope: { kind: 'conversation', id: key } } : g));
      judgeReach(resList.length ? resList : [ChannelsGrants.RES.conversation(key)], target, oldGrants, cg.conversationGrants(key));
    }
    // an account's rows against its old account-scope grants
    const accts = new Set([...Object.keys(ix.accountAssignments || {}), ...(ix.accountGrants || []).filter((g) => g && g.scope && g.scope.kind === 'adapter').map((g) => String(g.scope.id))]);
    for (const id of accts) {
      const target = { key: '\u0000', adapterId: id };
      const oldGrants = (ix.accountGrants || []).filter((g) => g && g.scope && g.scope.kind === 'adapter' && g.scope.id === id);
      judgeReach([ChannelsGrants.RES.account(id), ChannelsGrants.RES.accountUser(id)].filter((res, i) => i === 0 || byRes.has(`channel-reach\u0000${res}`)), target, oldGrants, cg.accountGrants(id));
    }
    // a rule's access against the grants it derived (one per access row, visible, on every matching conversation)
    for (const [pid, pa] of Object.entries(ix.patternAssignments || {})) {
      if (!pa) continue;
      const target = { key: '\u0000rule', adapterId: pa.adapterId || '' };
      const oldGrants = F.grainOf(pa).access.map((r) => ({ principal: r.principal, scope: { kind: 'conversation', id: target.key }, level: 'visible', origin: 'access' }));
      judgeReach([ChannelsGrants.RES.rule(pid)], target, oldGrants, cg.ruleGrants(pid, target.key));
    }
    // a credential's raw-API tiers
    const creds = new Set((ix.apiGrants || []).filter((g) => g && g.scope && g.scope.id).map((g) => String(g.scope.id)));
    const oldTier = (ctx, cred) => { let best = 'none'; for (const g of ix.apiGrants || []) { if (!g || !ACL.API_TIERS.includes(g.api) || !g.scope || g.scope.id !== cred || !GM.LEGACY.channel(g, ctx)) continue; const t = g.api === ACL.API_NAMED_ONLY && g.principal.kind !== 'agent' ? 'write-auto' : g.api; if (ACL.API_RANK[t] > ACL.API_RANK[best]) best = t; } return best; };
    for (const cred of creds) {
      const mapped = [byRes.get(`channel-api\u0000${cred}`)].filter(Boolean);
      if (has('channel-api', cred)) { counts['channel-api'].kept++; continue; }
      const off = probes.filter((pr) => oldTier(pr.ctx, cred) !== ACL.effectiveApi(pr.ctx, cred, cg.apiGrants()).tier).map((pr) => pr.label);
      if (off.length) { refused.push({ door: 'channel-api', resource: cred, who: off.slice(0, 6) }); counts['channel-api'].refused++; continue; }
      rows.push(...mapped); counts['channel-api'].rows += mapped.length;
    }
    // who each grain's notification may wake: the same principals, listed
    const pk = (p) => GM.principalKey(GM.fromChannelPrincipal(p));
    const watchJudge = (res, holder, legacy) => {
      if (has('channel-watch', res)) { counts['channel-watch'].kept++; return; }
      const mapped = [byRes.get(`channel-watch\u0000${res}`)].filter(Boolean);
      const was = new Set(F.grainOf(holder, legacy, { inherited: ['everyone:*'] }).watchers.map((w) => pk(w.principal)).filter(Boolean));
      const now = new Set(cg.watchOf(res).to.map(GM.principalKey));
      const diff = [...was].filter((k) => !now.has(k)).concat([...now].filter((k) => !was.has(k)));
      if (diff.length) { refused.push({ door: 'channel-watch', resource: res, who: diff.slice(0, 6) }); counts['channel-watch'].refused++; return; }
      rows.push(...mapped); counts['channel-watch'].rows += mapped.length;
    };
    for (const [id, h] of Object.entries(ix.accountAssignments || {})) if (h) watchJudge(ChannelsGrants.RES.account(id), h, undefined);
    for (const [id, h] of Object.entries(ix.patternAssignments || {})) if (h) watchJudge(ChannelsGrants.RES.rule(id), h, undefined);
    for (const [key, en] of Object.entries(ix.conversations || {})) if (en && ((Array.isArray(en.watchers) && en.watchers.length) || en.assignment)) watchJudge(ChannelsGrants.RES.conversation(key), { access: en.access, watchers: en.watchers }, en.assignment && en.assignment.principal ? en.assignment : null);
  }
  return { rows, refused, unknown, counts, asks };
}

/**
 * RUN: plan, seed what agreed, carry the asks, then fail by name if anything was refused. `store` = THE grants store;
 * `hosts` = the live HostManager (the asks go through it; else the file); `ensure` = leave data/grants.json on disk even
 * when nothing was carried (the first run; the rollback re-run passes false — see migrations.js grantsStoreBoot).
 * → the report (the ledger's row).
 */
function migrate({ dataDir, store = null, hosts = null, channelIndex = null, resolveBrowserKey = () => null, live = [], ensure = true } = {}) {
  const st = store || GS.forDir(dataDir);
  if (!st || (typeof st.health === 'function' && !st.health().readable)) throw new Error('data/grants.json cannot be read — the grants were not carried over; nothing was written (repair or move it aside)');
  const has = (door, resource) => st.rowsFor(door, resource).length > 0;
  const p = plan({ dataDir, channelIndex, resolveBrowserKey, live, has });
  const seeded = p.rows.length ? st.seed(p.rows, 'migration') : { added: 0, kept: 0 };
  // a machine whose `run` asked each time keeps asking: the ask is the record's own (`exit.ask`) since this lane
  let asks = 0;
  if (p.asks.length) {
    const want = new Set(p.asks);
    const reshape = (state) => { let n = 0; for (const h of Array.isArray(state && state.hosts) ? state.hosts : []) if (h && want.has(h.id) && h.exit && h.exit.ask === undefined) { h.exit.ask = true; n++; } return n; };
    const H = typeof hosts === 'function' ? hosts() : hosts;
    if (H && typeof H.reshapeStore === 'function') { const r = H.reshapeStore((s) => ({ asks: reshape(s) })); asks = r && typeof r.asks === 'number' ? r.asks : p.asks.length; }
    else {
      const file = path.join(dataDir, 'hosts.json');
      const doc = JSON.parse(fs.readFileSync(file, 'utf-8'));
      asks = reshape(doc);
      if (asks) { let mode = 0o600; try { mode = fs.statSync(file).mode & 0o777; } catch { } const tmp = `${file}.${process.pid}.tmp`; fs.writeFileSync(tmp, JSON.stringify(doc, null, 2), { mode }); fs.renameSync(tmp, file); }
    }
  }
  // a record the old reader could not read carries NO grant (it refused everyone) — named, so the owner can give it again (verify F4)
  const report = { counts: p.counts, seeded: seeded.added, kept: seeded.kept, asks, unknown: p.unknown.length, refused: p.refused.length, ...(p.unknown.length ? { unread: p.unknown.slice(0, 20).map((u) => `${u.door} ${String(u.resource).slice(0, 80)}`) } : {}) };
  if (p.refused.length) {
    const words = p.refused.slice(0, 5).map((r) => `${r.door} ${String(r.resource).slice(0, 80)} (the old and the new reader disagree for ${r.who.join(', ')})`).join('; ');
    const err = new Error(`${p.refused.length} grant(s) could not be carried over unchanged and were NOT written (nobody may use them until they are given again): ${words}${p.refused.length > 5 ? ` and ${p.refused.length - 5} more` : ''} — every other grant was carried over (${seeded.added} row(s))`);
    err.report = report;
    throw err;
  }
  if (ensure && typeof st.ensureFile === 'function') st.ensureFile();   // verify F2: a run that carried nothing still leaves a store — a later boot without one knows it was deleted
  return report;
}

module.exports = { plan, migrate, oldWhoMayUse, PROBE_MEMBER, PROBE_OUTSIDER };
