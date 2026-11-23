// «WHO MAY USE IT» IN THE VAULT WINDOW (lane vault-use-grants, the owner 2026-10-27 「每个密码请求都要我同意太麻烦了！能不能搞个权限分配 +
// 自动 approve 机制」). An entry an agent run may use gets, on its row:
//   · THE CHIPS — every member of its vault-use grant (a conversation, a Task Group, All agents): its name · the hosts it may
//     reach · «used N×» · its end (or «expired»), ✕ takes it back (a click — POST /api/vault/use-grants/revoke); «除了» chips
//     for the members left out; the entry's own line «used N× by M conversations»; r8 (lane vault-standing-request): a LIVE
//     1-hour window has its OWN ✕ beside it (POST …/revoke {scope: 'window'} — only the window goes, the other scopes stay);
//   · 「Who may use it…」 — THE principal picker every grant door draws (给谁 / 除了, src/lib/principal-picker.js), the HOSTS
//     (a list, or «the hosts it was stored for» when the entry has them — never «any host»), the END (none / 8 hours / 30
//     days / 90 days). Save = POST /api/vault/use-grants with the whole row; a save that gives anybody MORE asks 验证是你
//     first (the hub refuses it otherwise — reveal_needs_password), in the press's own task. r10 (lane vault-standing-request,
//     主开发's acceptance of r9): the Save keeps the row's 除了 the picker does not offer (`pickToRow` `held`), names every
//     exception it takes away («X will no longer be excluded» — `removeExcept`, the hub refuses an unnamed one), and posts
//     the ROW only when its members, scopes or 除了 changed (`rowChanged` — a policy-only Save posts the policy only). r11
//     (主开发's acceptance of r10): a member is known by its PRINCIPAL (`principal` — a Task Group as `group:<its id>`, never
//     the grant id); an ENDED 1-hour window the hub has not swept is a change (the Save prunes it, as the preview says); after
//     a Save whose row landed and whose policy did not, the next Save is compared against the row as it LANDED, and the
//     dialog says so («The members were saved; the policy was not»);
//   · R4 (default OFF — Settings ▸ «Let the policy judge approve vault uses»): the entry's POLICY for the decision-API judge, in
//     the same dialog (setting one asks 验证是你; clearing is a click); the row says the policy, whether the judge is on, and
//     what it approved («Approved by the policy judge 3× · last 14:02» + 「Revoke」: those commands ask again next time).
// The grant's facts ride the Vault window's own list (row.run.use — src/server/vault-run-door.js rowFacts): every change of
// them reaches every open window through the vault's ONE notify (`vault-contents`), patched in place.
import { t } from './i18n.js';
import { dateOf as pageDateOf } from './page-time.js'; // lane ui-language: the ONE formatter of a time / number a person reads
import { needLine, settingsDoor } from './need-line.js'; // lane ui-needs-a-button (vault-grants-4)
import { fetchJson, showToast, createModalShell } from './utils.js';
import { principalPicker, rosterFromApp } from './principal-picker.js';
import { rowToPick, pickToRow, principalOfEntry } from './principal-picker-model.js';
import { revealLeftMs, revealHeaders, forgetReveal, askRevealPassword, revealWords } from './vault-reveal.js';
import { landingOf, fieldsDiffer, sameField } from './landing-merge.js'; // B-f212: THE LANDING LAW — a landing never takes a person's unsaved pick

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const EVERYONE_KEY = 'everyone:*';
const ENTRY_HOSTS = '@entry';
const ENDS = [['keep', 0], ['none', null], ['8h', 8 * 3600e3], ['30d', 30 * 86400e3], ['90d', 90 * 86400e3]];
const endWord = (id) => ({ keep: t('As each has it now'), none: t('No end'), '8h': t('8 hours'), '30d': t('30 days'), '90d': t('90 days') })[id];
const dateOf = (ms, o) => pageDateOf(ms, o);   // its options pass through (a sentence asks `words`)
// round 3 (item 5): a WILDCARD host is said in words — and a multi-tenant base (where unrelated parties share the domain) warns
const MULTI_TENANT = /^(?:amazonaws\.com|googleapis\.com|github\.io|gitlab\.io|herokuapp\.com|cloudfront\.net|blob\.core\.windows\.net|azurewebsites\.net|web\.app|pages\.dev|workers\.dev|vercel\.app|netlify\.app|appspot\.com|firebaseapp\.com)$/i;
const oneHostWord = (h, entryHosts, tool = null, legacy = false) => {
  if (h === ENTRY_HOSTS) return t('the hosts it was stored for ({hosts})', { hosts: (entryHosts || []).join(', ') || t('none') });
  if (String(h).startsWith('*.')) { const base = String(h).slice(2); const w = MULTI_TENANT.test(base) ? t('every {host} host (incl. other customers’ endpoints)', { host: h }) : t('every {host} host', { host: h }); return tool ? t('{hostword} (via {tool})', { hostword: w, tool }) : legacy ? t('{hostword} (legacy wildcard: any tool)', { hostword: w }) : w; }   // round 4 (item 3): a wildcard carries the ONE CLI that minted it — shown per host; r3 (MAJOR 1): a carried one with no tool says so
  return h;
};
// lane vault-standing-request: a member's COMMAND SHAPES («the command python3 transcribe.py») and who wrote it, when
const baseOf = (p) => String(p == null ? '' : p).replace(/\/+$/, '').split('/').pop();
const preOf = (c) => (c && Array.isArray(c.pre) ? c.pre.filter((w) => typeof w === 'string' && w) : []);   // r2: the options / subcommand it pins before the script
const commandWord = (c) => (c && c.program ? [baseOf(c.program), ...preOf(c), c.arg == null ? '' : String(c.arg)[0] === '/' ? baseOf(c.arg) : String(c.arg)].filter(Boolean).join(' ') : '');
const commandTitle = (c) => [c.program, ...preOf(c), c.arg].filter((x) => x != null && x !== '').join(' ');
const clockOf = (ms) => { try { return new Date(ms).toTimeString().slice(0, 5); } catch { return ''; } };
// lane vault-standing-request r4 (THE ROOT MODEL): each scope says ITS OWN end — «a.example · 30 d», «b.example · no end»,
// «… (legacy wildcard: any tool) · 20 d», «… · expired» — a grant no longer has one end
const leftWord = (s) => { if (s.expired) return t('expired'); if (!(Number(s.until) > 0)) return t('no end'); const ms = Number(s.until) - Date.now(); return ms >= 86400e3 ? t('{n} d', { n: Math.round(ms / 86400e3) }) : ms >= 3600e3 ? t('{n} h', { n: Math.round(ms / 3600e3) }) : t('{n} min', { n: Math.max(1, Math.ceil(ms / 60e3)) }); };
const scopesOfM = (m) => (Array.isArray(m.scopes) && m.scopes.length ? m.scopes : [...(m.hosts || []).map((h) => ({ kind: 'host', host: h, until: m.until, expired: m.expired, tool: m.toolFor && m.toolFor[h], legacy: Array.isArray(m.legacy) && m.legacy.includes(h) })), ...(m.commands || []).map((c) => ({ kind: 'command', command: c, until: m.until, expired: m.expired }))]);   // an older hub's row: each scope with the member's end
const scopeWord = (s, entryHosts) => (s.kind === 'window' ? t('any destination') : s.kind === 'command' ? t('the command {command}', { command: commandWord(s.command) }) : oneHostWord(s.host, entryHosts, s.tool, !!s.legacy));
// lane vault-standing-request r7: a WINDOW scope (a run card's «Allow for 1 hour» — any run of this conversation until its end):
// «any destination · until 10:41 · 42 min», the warning accent; an ended one «… · expired» as the others
const windowWords = (s) => `${t('any destination')} · ${s.expired ? t('expired') : `${t('until {when}', { when: clockOf(s.until) })} · ${leftWord(s)}`}`;
/** lane vault-standing-request r5 (the r4 acceptance, MINOR 2 — «As each has it now» gave a newly typed host NO end whenever ANY
 *  live scope had none, against the rule written beside it): ONE member's scopes as the Save writes them — PURE (the suite reads
 *  it; the dialog's Save and its preview line both call it). `was` = the member as the row has it (null: new to the row),
 *  `hosts` = the hosts the Save names, `cmds` = its command shapes (kept), `endId` = the picker's choice.
 *  «As each has it now» (keep): a scope it holds keeps ITS OWN end (an ended one stays ended — history); a scope typed NEW takes
 *  the member's EARLIEST live end — none only when EVERY live scope has none; with NO live scope (every one ended, or a member
 *  new to the row) there is no «now» to keep, so a new scope takes the picker's default (30 days — what the dialog offers a new
 *  grant), said before Save. Any other choice gives every scope that end. r8 (主开发's acceptance of r7, MINOR 4): the Save
 *  sends NO window — the hub carries the member's LIVE one as it is (a dialog opened before the window's ✕ never sends a
 *  taken-back one back, an ended one is never re-sent); `kept` = the live window the preview says is kept. r9 (主开发's
 *  acceptance of r8, MINOR C): a member the Save names nothing for whose only scope is a 1-hour window that has ENDED (the hub
 *  had not swept it yet — a restart or a lock inside the hour drops the hour-end prune) is `pruned`: sent with no scope, the
 *  hub prunes it (one it still holds LIVE it keeps) — never a refusal; `refused` = nothing to send and no window (the dialog
 *  names that member).
 *  B-f212 (r11's second follow-up): `endFrom` = the instant a chosen end counts from — the dialog pins it at the Save that
 *  LANDED (before one: the press's own instant), so a repeated Save (the row landed, the policy did not) posts the SAME ends,
 *  never the row again with later ones; a Save that CHANGES the row counts from its own press (r13); `now` still judges what
 *  has ended.
 *  → { scopes, fresh: [index of each new scope], kept: [{kind: 'window', until}], pruned, refused } */
const KEEP_DEFAULT = '30d';
export function saveScopesOf({ was = null, hosts = [], cmds = [], endId = 'keep', now = Date.now(), endFrom = now } = {}) {
  const wasSc = was ? scopesOfM(was) : [];
  const ended = (s) => !!s.expired || (Number(s.until) > 0 && Number(s.until) <= now);
  const live = wasSc.filter((s) => !ended(s) && s.kind !== 'window'), finite = live.map((s) => Number(s.until)).filter((u) => u > 0);   // r7: a 1-hour window is no «now» a new host keeps
  const keepNew = !live.length ? endFrom + (ENDS.find(([id]) => id === KEEP_DEFAULT) || [])[1] : finite.length ? Math.min(...finite) : null;
  const endMs = (ENDS.find(([id]) => id === endId) || [])[1];
  const endFor = (s0) => (endId === 'keep' ? (s0 ? (Number(s0.until) > 0 ? Number(s0.until) : null) : keepNew) : endMs ? endFrom + endMs : null);
  const cmdKey = (c) => JSON.stringify([c.program, preOf(c), c.arg == null ? null : c.arg, c.sha || null, c.psha || null]);
  const scopes = [], fresh = [];
  for (const host of hosts) {
    const s0 = wasSc.find((s) => s.kind === 'host' && s.host === host), until = endFor(s0), tool = (s0 && s0.tool) || (was && was.toolFor && was.toolFor[host]) || null;
    if (!s0) fresh.push(scopes.length);
    scopes.push({ host, ...(until ? { until } : {}), ...(tool ? { tool } : {}) });
  }
  for (const c of cmds) {
    const s0 = wasSc.find((s) => s.kind === 'command' && cmdKey(s.command) === cmdKey(c)), until = endFor(s0);
    if (!s0) fresh.push(scopes.length);
    scopes.push({ command: { program: c.program, pre: preOf(c), arg: c.arg == null ? null : c.arg, sha: c.sha || null, psha: c.psha || null }, ...(until ? { until } : {}) });   // lane vault-standing-request: a command scope keeps its own end too
  }
  // r7: a WINDOW scope is the card's — the dialog never makes or moves one (the hub refuses it `window_card_only`). r8: nor
  // sends one — the hub keeps the member's LIVE window as it is; the preview names it «(kept)»
  const kept = wasSc.filter((s) => s.kind === 'window' && !ended(s)).map((s) => ({ kind: 'window', until: Number(s.until) }));
  const empty = !scopes.length && !kept.length, pruned = empty && wasSc.some((s) => s.kind === 'window');   // r9 (MINOR C)
  return { scopes, fresh, kept, pruned, refused: empty && !pruned };
}
// r10 (主开发's acceptance of r9, MAJOR): THE ROW THE SAVE WRITES against the row the dialog opened on — PURE (the suite reads
// them). A principal's key is the hub's own spelling (GM.principalKey: the hub's refusals name a member by it).
const pkOf = (p) => (p.kind === 'everyone' ? 'everyone' : p.kind === 'group' ? `group:${p.id}` : `conversation:${p.key}`);
// r11 (MAJOR): a STORED member is known by its principal's key (`principal`, the hub's own) — never by a field a publisher may
// spell otherwise (publicGrants once put the grant id `vg-…` in a Task Group's `id`)
const keyOfM = (m) => (m && typeof m.principal === 'string' && m.principal ? m.principal : pkOf(m));
const scopeSig = (s) => { const u = Number(s.until) > 0 ? Number(s.until) : 0; const c = s.command; return c ? `c\n${JSON.stringify([c.program, preOf(c), c.arg == null ? null : c.arg, c.sha || null, c.psha || null])}\n${u}` : `h\n${s.host}\n${u}\n${s.tool || ''}`; };
const sigOf = (scopes) => scopes.filter((s) => s && s.kind !== 'window').map(scopeSig).sort().join('\n\n');   // a window is the card's: never sent, never compared
/** Does the Save change the ROW — a member in or out, a member's scopes (each its host / command, its end, its tool), the 除了?
 *  `stored` = the row the Save is compared against ({to: members, except} — as the dialog opened on it, r11: or as the last
 *  Save LANDED it), `next` = what the Save would post ({to, except}). A Save that changes only the policy posts only the policy
 *  (a row Save of the same row is never sent behind it). Each member by its principal's key (r11). r11 (MINOR 1): a stored
 *  1-hour window that has ENDED (the hub had not swept it — a restart or a lock drops the hour-end timer) IS a change: the Save
 *  posts and the hub prunes it — what the preview says («the 1-hour approval ended — Save removes it»). A live one is the
 *  card's: never sent, never compared. */
export function rowChanged(stored = {}, next = {}, { now = Date.now(), undecided = false } = {}) {
  if (undecided) return true;   // r3130 MUST 2: an UNDECIDED row's Save is a change — it decides the row (posted whole)
  const endedW = (s) => !!s && s.kind === 'window' && (!!s.expired || (Number(s.until) > 0 && Number(s.until) <= now));
  if ((stored.to || []).filter(Boolean).some((m) => scopesOfM(m).some(endedW))) return true;
  // the chain's cure (C): a member's «仅本组» is part of what the row says — a flag-only change is a change (switched off = only:false)
  const a = new Map((stored.to || []).filter(Boolean).map((m) => [keyOfM(m), sigOf(scopesOfM(m)) + (m.only === true ? '#only' : '')]));
  const b = new Map((next.to || []).filter(Boolean).map((m) => [keyOfM(m), sigOf(Array.isArray(m.scopes) ? m.scopes : []) + (m.only === true ? '#only' : '')]));
  if (a.size !== b.size || [...b].some(([k, v]) => a.get(k) !== v)) return true;
  const xa = new Set((stored.except || []).filter(Boolean).map(keyOfM)), xb = new Set((next.except || []).filter(Boolean).map(keyOfM));
  return xa.size !== xb.size || [...xb].some((k) => !xa.has(k));
}
/** The stored row's exceptions the Save takes away — the preview names each («X will no longer be excluded») and the Save
 *  names them to the hub (`removeExcept`: an exception left out unnamed is refused `except_unnamed`). */
export function exceptRemovedOf(held = [], next = []) {
  const nx = new Set((next || []).filter(Boolean).map(keyOfM));
  return (held || []).filter((x) => x && !nx.has(keyOfM(x)));
}
/** The words for a Save the hub refused (`plan` = planOf's). r10 (MINOR): a member the dialog sent with NO scope (all it held
 *  was a 1-hour window) is never invited to take hosts — its grant changed while the dialog was open (the hour-end sweep, a ✕
 *  elsewhere); an exception the dialog never drew (`except_unnamed`) says the same. */
export function saveWordsOf(r, plan = null, nameOfM = (m) => m.name || '') {
  const code = r && r.code;
  const named = r && r.principal && plan ? (plan.to || []).find((m) => pkOf(m) === r.principal) : null;
  if (code === 'row_changed' || code === 'entry_unknown' || code === 'except_unnamed' || (code === 'hosts_required' && named && !(named.scopes || []).length)) return t('This grant changed while the dialog was open — close it and open it again');   // B-f212's remainder: a refusal with no row to land
  if (code === 'hosts_required') return named ? t('Name the hosts {name} may use it for — a host name or address each (never «any host»)', { name: nameOfM(named) }) : t('Name the hosts it may be used for — a host name or address each (never «any host»)');   // r9 (MINOR C): the hub's refusal names the member
  if (code === 'tool_required') return t('A wildcard host (like *.example.com) is scoped to the tool that first used it — add it from a run card with «Always», not here');
  if (code === 'bad_principal') return t('A host is a host name or address (no wildcard, no address with a path)');
  return revealWords(r || {});
}
const sourceWord = (m) => { const at = Number(m.at) > 0 ? clockOf(m.at) : ''; const w = m.source === 'request' ? t('asked by the agent') : m.source === 'card' ? (m.sourceKind === 'window' ? t('«Allow for 1 hour» on a card') : t('«Always» on a card')) : m.source === 'owner' ? t('set by you') : ''; return w && at ? `${w} · ${at}` : w; };   // r8: a window press is never called «Always»

/** A member's name: its stored name, the live roster's, else its id (never markup — textContent only). */
function nameOf(m, app) {
  if (m.kind === 'everyone') return t('All agents');
  const roster = rosterFromApp(app);
  if (m.kind === 'group') { const gid = (principalOfEntry(m) || m).id; const g = roster.find((r) => r.kind === 'group' && String(r.id) === String(gid)); return (g && g.name) || m.name || String(gid); }   // r11: the Task Group by its principal
  const s = roster.find((r) => r.kind === 'agent' && String(r.id) === String(m.key));
  return (s && s.name) || m.name || String(m.key || '').slice(0, 8);
}
/** The row's «Who may use it» facts signature (the window patches the box in place when it moves). */
export const useSigOf = (row) => JSON.stringify([(row && row.run && row.run.use) || null, !!(row && row.run && row.run.paused)]);   // round 2 MAJOR: whether the entry is suspended is part of the signature — turning it OFF/ON greys / restores the grant chips

/** r8 (主开发's acceptance of r7, MINOR 4 — «nothing ends just the window early»: the member's ✕ took every scope with it): the
 *  WINDOW's own ✕ — POST /api/vault/use-grants/revoke {scope: 'window'} (a narrowing, a click): only the window goes, the
 *  member's host and command scopes stay with their own ends; the press's record is told (the door). */
function windowX(r, m, refresh = () => {}) {
  const b = el('button', 'vw-ak-x vw-use-window-x', '✕');
  b.type = 'button'; b.title = t('Take back the 1-hour approval only — the other scopes stay'); b.setAttribute('aria-label', b.title);
  b.onclick = async (ev) => { ev.stopPropagation(); const res = await post('/api/vault/use-grants/revoke', { id: r.id, principal: m.principal, scope: 'window' }); if (!res || !res.ok) showToast(t('Not done — {reason}', { reason: res ? revealWords(res) : t('server unreachable') }), { type: 'error' }); else showToast(t('The 1-hour approval is taken back — the next run asks you')); refresh?.(); };
  return b;
}
/** The row's extras: `box` (the chips and 「Who may use it…」 under them — the main column: the row's door column keeps its
 *  width) and `doors` (none). `redraw(row)` patches the chips in place. */
export function useExtras(row, { app = null, refresh = () => {} } = {}) {
  const box = el('div', 'vw-ak vw-use');
  box.dataset.use = row.id;
  const host = el('div', 'vw-use-host');
  const useB = el('button', 'vw-btn vw-use-grant', t('Who may use it…'));
  useB.type = 'button';
  const ownTitle = t('Share it: let another conversation or a Task Group run commands with it for the hosts you name. Another host is refused — an agent\'s own value goes only where you say.');   // B-bc3b: an agent's OWN entry (no card for another host: it is refused)
  useB.title = t('Let a conversation, a Task Group or all agents run commands with it for the hosts you name — no card each time. Another host still asks you.');
  let cur = row;
  useB.onclick = () => showUseGrantDialog(cur, { app, refresh });
  function redraw(r) {
    cur = r;
    host.textContent = '';
    const u = (r && r.run && r.run.use) || null;
    if (u && u.own) useB.title = ownTitle;
    useB.hidden = false;   // lane vault-standing-request r2 (MAJOR 3): an agent's OWN entry shows the standing grants it holds (chips + ✕); B-bc3b: and «Who may use it…» — the owner shares it with another conversation or a Task Group (the run door admits them only as the row says)
    if (!u) return;
    if (u.unknown) { host.append(el('div', 'vw-use-bad', t('Who may use it could not be read — it is refused as it is (never read wider). Save it again to repair it.'))); return; }
    const live = (u.to || []).filter(Boolean);
    const paused = live.length && !!((r && r.run && r.run.paused) || u.unverified);   // round 2 MAJOR: the entry was turned OFF — its grants are kept but suspended; round 6 (MINOR item 6): a locked vault cannot verify — the chips are greyed, listed «unverified», never as held grants
    const exceptOnly = !live.length && (u.except || []).length > 0;   // r9 (MAJOR A): an except-only row — its 除了 is kept for the next grant (a prune or a ✕ never drops it)
    if (live.length || exceptOnly) {
      const chips = el('div', `vw-ak-grants vw-use-chips${paused ? ' vw-use-paused' : ''}`);
      chips.append(el('span', 'vw-ak-to vw-use-to', exceptOnly ? t('Used with no card by: nobody') : t('Used with no card by:')));
      for (const m of live) {
        const pausedM = !!m.paused;   // round 7 (MAJOR item 2): the entry is ON by another conversation's PRESS and THIS member was never resumed — the owner's pause stands (the ↻ un-pauses it). No date: the inverted model keeps no per-member pause time, so none can go stale.
        const legacyW = Array.isArray(m.legacy) ? m.legacy : [];   // r3 (MAJOR 1): a wildcard carried from an older version with no tool — open to ANY program until the owner re-mints it
        const chip = el('span', `vw-ak-chip vw-use-chip${m.expired ? ' vw-use-expired' : ''}${pausedM ? ' vw-use-chip-paused' : ''}${legacyW.length ? ' vw-use-legacy' : ''}`);
        chip.dataset.grant = m.grant || '';   // r11: the grant's id (`grant` — a Task Group's `id` is its own)
        chip.dataset.principal = m.principal || '';
        const cmds = Array.isArray(m.commands) ? m.commands : [];
        const sc = scopesOfM(m);
        const words = el('span', 'vw-use-words');
        words.append(document.createTextNode(`${nameOf(m, app)} · `));
        sc.forEach((s, k) => { if (k) words.append(document.createTextNode(', ')); const win = s.kind === 'window', liveW = win && !s.expired; const w = el('span', `vw-use-scope${s.expired ? ' vw-use-scope-ended' : ''}${liveW ? ' vw-use-scope-window' : ''}`, win ? windowWords(s) : `${scopeWord(s, u.entryHosts)} · ${leftWord(s)}`); w.title = liveW ? t('A 1-hour approval from a run card: this conversation uses it in any run without asking, each use shows a notice — then it asks again. ✕ takes it back now.') : s.expired ? t('ended {when}', { when: win ? clockOf(s.until) : dateOf(s.until, { words: true }) }) : Number(s.until) > 0 ? t('until {when}', { when: dateOf(s.until, { words: true }) }) : t('no end'); words.append(w); if (liveW) words.append(windowX(r, m, refresh)); });   // r4: EACH scope with its own end; r7: a window «any destination · until HH:MM · N min»; r8: an ENDED window is drawn as the others (its «ended» title, no warning accent), a live one has its OWN ✕
        const bits = [];
        if (m.uses) bits.push(t('used {n}×', { n: m.uses }));
        if (pausedM) bits.push(t('paused by you'));
        if (sourceWord(m)) bits.push(sourceWord(m));   // lane vault-standing-request: who wrote it and when — last, its time beside it
        if (bits.length) words.append(document.createTextNode(` · ${bits.join(' · ')}`));
        chip.append(words);
        chip.title = `${m.grant || ''}${m.convs > 1 ? ' · ' + t('{n} conversations', { n: m.convs }) : ''}${cmds.length ? '\n' + cmds.map(commandTitle).join('\n') : ''}${legacyW.length ? '\n' + t('Carried from an older version: this wildcard host is open to ANY program. Take it back (✕) and press «Always» on the next run of its tool — the new grant names its tool.') : ''}`;   // lane vault-standing-request: the whole program + script paths
        if (pausedM) {   // un-pause ONE member — a widening, so it asks for the second password (验证是你)
          const rs = el('button', 'vw-ak-x vw-use-resume', '↻');
          rs.type = 'button'; rs.title = t('Un-pause this — let it be used again'); rs.setAttribute('aria-label', rs.title);
          rs.onclick = async () => { const send = () => post('/api/vault/use-grants/resume', { id: r.id, principal: m.principal }, revealLeftMs() ? revealHeaders() : {}); let res = await send(); if (res && res.code === 'reveal_needs_password') { forgetReveal(); if (!(await askRevealPassword())) return; res = await send(); } if (!res || !res.ok) showToast(t('Not done — {reason}', { reason: res ? revealWords(res) : t('server unreachable') }), { type: 'error' }); refresh?.(); };
          chip.append(rs);
        }
        const x = el('button', 'vw-ak-x vw-use-x', '✕');
        x.type = 'button'; x.title = t('Take this back'); x.setAttribute('aria-label', x.title);
        x.onclick = async () => { const res = await post('/api/vault/use-grants/revoke', { id: r.id, principal: m.principal }); if (!res || !res.ok) showToast(t('Not done — {reason}', { reason: res ? revealWords(res) : t('server unreachable') }), { type: 'error' }); refresh?.(); };
        chip.append(x);
        chips.append(chip);
      }
      for (const x of u.except || []) chips.append(el('span', 'vw-ak-chip vw-use-chip vw-use-except', t('except {name}', { name: nameOf(x, app) })));
      host.append(chips);
      if (u.unverified && live.length) host.append(el('div', 'vw-use-paused-note', u.unverifiedWhy === 'marks_unread' ? t('Unverified: the vault-use marks could not be read — not in use until they read; nothing is lost.') : u.unverifiedWhy === 'marks_undecided' ? t('Unverified: this row\'s marks were lost — save it again (验证是你) to keep these members; not in use until then.') : t('Unverified until you unlock the vault — not in use until then.')));   // r3002 (a): the marks held / a row undecided
      else if (paused) host.append(el('div', 'vw-use-paused-note', t('Paused while the entry is off — turn «Usable by agent runs» on to restore these.')));
    }
    if (u.used && u.used.uses) host.append(el('div', 'vw-ak-used vw-use-count', t('used {n}× by {m} conversations', { n: u.used.uses, m: u.used.convs })));
    if (u.policy) host.append(el('div', 'vw-ak-used vw-use-policy', u.judge === 'on' ? t('Policy for the judge: «{text}»', { text: u.policy.text }) : t('Policy for the judge: «{text}» — the judge is off', { text: u.policy.text })));
    if (u.approved && u.approved.n) {
      const line = el('div', 'vw-ak-used vw-use-approved');
      const at = (() => { try { return new Date(u.approved.lastAt).toTimeString().slice(0, 5); } catch { return ''; } })();
      line.append(el('span', null, t('Approved by the policy judge {n}× · last {time}', { n: u.approved.n, time: at })));
      const rv = el('button', 'vw-btn vw-use-revoke', t('Revoke'));
      rv.type = 'button'; rv.title = t('The commands the judge approved ask you again next time');
      rv.onclick = async () => { const res = await post('/api/vault/use-policy/revoke', { id: r.id }); if (!res || !res.ok) showToast(t('Not done — {reason}', { reason: res ? revealWords(res) : t('server unreachable') }), { type: 'error' }); else showToast(t('Revoked — those commands ask you again')); refresh?.(); };
      line.append(rv);
      host.append(line);
    }
  }
  box.append(host, useB);
  redraw(row);
  return { box, doors: [], redraw };
}

const post = (url, body, headers = {}) => fetchJson(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });

/** 「Who may use it…」: who (给谁 / 除了), the hosts, the end — the whole row saved at once. */
export function showUseGrantDialog(row, { app = null, refresh = () => {} } = {}) {
  const u = (row.run && row.run.use) || { to: [], except: [] };
  const entryHosts = Array.isArray(u.entryHosts) ? u.entryHosts : [];
  const members = (u.to || []).filter(Boolean);
  const roster = () => rosterFromApp(app);
  const pickWords = () => ({ everyoneKey: EVERYONE_KEY, notRunning: t('not running now'), deletedGroup: t('a deleted Task Group') });
  const stored = rowToPick({ to: members, except: u.except || [] }, roster(), pickWords());   // r11: each member by its principal (`principal`)
  const extra = stored.extra || [];
  // r11 (主开发's acceptance of r10, MINOR 3): THE ROW THE NEXT SAVE IS COMPARED AGAINST — the row as the dialog opened, then
  // the row as a Save LANDED it (`landRow`: the hub's answer names it — null for an older hub's answer: every next Save then
  // posts the row whole); `held` = its 除了 as picker keys (r10)
  let snap = { to: members, except: u.except || [] }, held = stored.except;
  let undecidedNow = !!(u && u.unverifiedWhy === 'marks_undecided');   // r3130 MUST 2: the row's marks were lost — its Save decides it (the landing and a re-read move this)
  // B-f212's remainder (主开发 r1163): THE ROW'S STAMP — of the row this dialog last knew (the open, then every landing); every
  // Save sends it, the hub refuses one over a row this dialog never saw (`row_changed`). An older hub's row has none: none sent
  const revOfUse = (x) => (x && Number.isSafeInteger(x.rev) ? x.rev : null);
  let rev = revOfUse(u);
  // r1260 (3): a row whose facts could not be read at the open AND that carries no stamp (the door's catch: `unknown`, nothing
  // known) is never saved over — the dialog reads the row first; Save waits for a row it could read or one the hub stamps (a
  // press before that posts nothing and asks the read again). A row the hub cannot read but still STAMPS (its stored shape
  // unreadable — the window says «Save it again to repair it») keeps its Save: the hub judges that stamp (the tracer's read)
  let unread = !!u.unknown && revOfUse(u) == null;
  let readFailed = false, failWord = '';   // r1423: a read of the unread row came back unread — the press then says what a person can do
  // B-f212: the instant a chosen end counts from — the press's own now, then the Save that LANDED (a repeated Save posts the same
  // ends, never later ones; the read: pinned at the open, a dialog left open an hour posted «8 hours» as seven, a day as one past).
  // r13: the pin holds only while the OWNER'S inputs (who, 除了, the hosts, the end) are what landed — planNow, for the preview and
  // the Save alike
  let endPin = null, saveAt = null, landedInputs = null;
  const endsFrom = () => (saveAt != null ? saveAt : endPin != null ? endPin : Date.now());
  let picker = null;
  // the unsaved guard (test-dialog-unsaved-census): the dialog's FIELDS (who, 除了, the hosts box and words, the end, the policy)
  // against `clean`: what the dialog opened on, then what LANDED. B-f212 (src/lib/landing-merge.js): a landing keeps what the
  // person changed since its base, and that change stays unsaved
  let clean = null, saveNow = () => false, gone = false, offContents = null;
  // THE DIALOG'S FIELDS — ONE TABLE (主开发 r513: «仅本组», the picker's only-this-group keys, is one more named field — no special
  // case): each field's name, how the page reads it and how a landing writes it back. The unsaved guard compares every row, the
  // landing (src/lib/landing-merge.js) judges every row by its kind (a set of keys, or one value), the unreadable row keeps every
  // row as last read, the kept press posts every row as it is at that moment
  const FIELDS = [
    { name: 'selected', read: () => (picker ? picker.selected() : []), write: (v) => picker.setSelected(v) },
    { name: 'except', read: () => (picker ? picker.except({ held }) : []), write: (v) => picker.setExcept(v) },
    { name: 'only', read: () => (picker && typeof picker.onlyKeys === 'function' ? picker.onlyKeys() || [] : []), write: (v) => { if (typeof picker.setOnly === 'function') picker.setOnly(v); } },
    { name: 'own', read: () => (ownBox ? ownBox.checked : null), write: (v) => { if (ownBox) { ownBox.checked = !!v; syncOwn(); } } },
    { name: 'hosts', read: () => (hostsIn ? hostsIn.value.trim() : ''), write: (v) => { hostsIn.value = v; } },
    { name: 'end', read: () => (endSel ? endSel.value : ''), write: (v) => { endSel.value = v; } },
    { name: 'policy', read: () => (polIn ? polIn.value.trim() : ''), write: (v) => { polIn.value = v; } },
  ];
  const fieldsNow = () => Object.fromEntries(FIELDS.map((f) => [f.name, f.read()]));
  const unsavedNow = () => clean !== null && fieldsDiffer(fieldsNow(), clean).length > 0;
  const { body, close, dismiss, raised, ready } = createModalShell({ id: 'vault-use-grant', kind: 'form', key: row.id, title: t('Who may use «{name}»', { name: row.label }), dialogClass: 'vault-dialog-box vw-ak-dialog vw-use-dialog', escapeToClose: true, onClose: () => { gone = true; try { offContents && offContents(); } catch { } try { picker && picker.close(); } catch { } },
    unsaved: { isDirty: unsavedNow, save: () => saveNow() } });
  if (raised) return null;   // raised: the same entry's «Who may use» form, as it was (int361, dialog-yield §103 r3: key = the entry)
  let ownBox = null, hostsIn = null, endSel = null, polIn = null, previewNow = () => {};
  body.append(el('div', 'vw-ak-hint', u.own ? t('Its agents use it for the hosts below without asking you each time, and never see the secret itself. Another host, or a command that could go anywhere, is refused: an agent\'s own value goes only where you say.') : t('Its agents use it for the hosts below without asking you each time, and never see the secret itself. Another host, or a command that could go anywhere (a shell, a script), still asks you.')));   // B-bc3b: an agent's own entry — another host is REFUSED there, never a card
  picker = principalPicker({ items: () => [...roster(), ...extra.filter((x) => !roster().some((r) => r.key === x.key))], app, multi: true, selected: stored.selected, only: { keys: (stored.only || []).slice() }, placeholder: t('Search sessions and groups…'), label: t('Who may use it'), emptyText: t('No agent session is running'), everyone: { key: EVERYONE_KEY }, except: { selected: stored.except, extra, onChange: () => previewNow() }, onChange: () => previewNow() });
  body.append(el('div', 'vw-ak-sec', t('Who')), picker.el);
  // THE HOSTS: one list for the members this save writes; the entry's own («the hosts it was stored for») when it has them
  // the hosts box and words as a ROW draws them — the open, and a landing from another client (B-f212): the one list every member
  // shares; the entry's own («the hosts it was stored for») when that list is it, or when no member holds it yet
  const hostsViewOf = (ms) => {
    const k = ms.length ? JSON.stringify(ms[0].hosts || []) : null;
    const common = ms.length && ms.every((m) => JSON.stringify(m.hosts || []) === k) ? ms[0].hosts || [] : null;
    const entryOnly = !!common && common.length === 1 && common[0] === ENTRY_HOSTS;
    return { common, own: !ms.length || entryOnly, hosts: common && !entryOnly ? common.filter((h) => h !== ENTRY_HOSTS).join(', ') : '' };
  };
  const view0 = hostsViewOf(members), common = view0.common;
  body.append(el('div', 'vw-ak-sec', t('For which hosts')));
  // lane vault-standing-request (B-eba2 — the owner: 「主机是什么东西？我该怎么填」): what a host IS, said where it is typed
  body.append(el('div', 'vw-ak-hint vw-use-hosts-what', u.own ? t('A host is where a command connects to with it — e.g. api.openai.com for an API key, 192.168.1.1 for a router. Another conversation sends an agent\'s value only to the hosts you name here; a command whose destination cannot be told is refused.') : t('A host is where a command connects to with it — e.g. api.openai.com for an API key, 192.168.1.1 for a router. A program whose destination VibeSpace cannot read (a script) is allowed by its command instead, from its run card.')));   // B-bc3b (the read): an agent's own entry — no card for a grantee
  if (entryHosts.length) {
    const lab = el('label', 'vw-ak-pick vw-use-own');
    ownBox = el('input'); ownBox.type = 'checkbox';
    ownBox.checked = view0.own;
    lab.append(ownBox, el('span', null, t('The hosts it was stored for ({hosts})', { hosts: entryHosts.join(', ') })));
    body.append(lab);
  }
  hostsIn = el('input', 'vault-pw vw-use-hosts');
  hostsIn.type = 'text'; hostsIn.spellcheck = false; hostsIn.autocomplete = 'off';
  hostsIn.placeholder = common === null && members.length ? t('Each keeps its own hosts — or type hosts for all') : t('Host names or addresses, e.g. 192.168.1.1, router.lan');
  hostsIn.value = view0.hosts;
  body.append(hostsIn);
  // «让 agent 自己申请» (B-eba2): right under the field the owner could not fill — the agent can ask for exactly this grant, one card to allow
  const askAgent = el('div', 'vw-ak-hint vw-use-ask-agent');
  askAgent.append(el('b', null, t('Not sure what to fill in? Let the agent ask.')), document.createTextNode(' ' + t('It sends you ONE card with exactly this permission to allow — it knows the command.')));
  if (!u.own) body.append(askAgent);   // B-bc3b (the read): an agent's own entry — another conversation's --standing ask is refused there (use_not_granted), its own needs none
  const syncOwn = () => { hostsIn.hidden = !!(ownBox && ownBox.checked); };
  if (ownBox) { ownBox.onchange = syncOwn; syncOwn(); }
  // THE END
  body.append(el('div', 'vw-ak-sec', t('Until')));
  endSel = el('select', 'vw-use-end');
  for (const [id] of ENDS) { if (id === 'keep' && !members.length) continue; const o = el('option', null, endWord(id)); o.value = id; endSel.append(o); }
  endSel.value = members.length ? 'keep' : '30d';
  body.append(endSel);
  // r5: WHAT SAVE WRITES — each member's scopes with the end each will have (a host typed new included), before Save
  const preview = el('div', 'vw-ak-hint vw-use-preview');
  preview.hidden = true;
  body.append(preview);
  // R4: THE POLICY for the decision-API judge (default off): the owner's words — hosts, verbs, what it is for
  body.append(el('div', 'vw-ak-sec', t('Policy for the judge (optional)')));
  polIn = el('textarea', 'vault-pw vw-use-policy-in');
  polIn.rows = 2; polIn.spellcheck = false; polIn.maxLength = 600;
  polIn.placeholder = t('e.g. only 192.168.1.1, read-only status calls to read the WAN status');
  polIn.value = (u.policy && u.policy.text) || '';
  body.append(polIn, u.judge === 'on' ? el('div', 'vw-ak-hint', t('The policy judge is ON: a run its grants do not cover is judged against these words by the decision API; a yes runs it (recorded in For you), anything else shows you the card. It never sees the value.'))
    : needLine({ words: t('The policy judge is off — these words are kept for when you turn it on.'), tone: 'off', cls: 'vw-ak-hint', doors: [settingsDoor(app, 'vault.policyJudge', { label: t('Turn on…'), kind: 'secondary' })] }));
  // lane vault-standing-request: the commands a member may run are kept as they are (a card's «Always (this command)» or an
  // agent's standing request wrote them); ✕ on its chip takes the member back
  const withCmds = members.filter((m) => Array.isArray(m.commands) && m.commands.length);
  if (withCmds.length) body.append(el('div', 'vw-ak-hint vw-use-cmds', withCmds.map((m) => t('{name} may run: {commands} (kept)', { name: nameOf(m, app), commands: m.commands.map(commandWord).join(', ') })).join(' · ')));
  // B-f212 (主开发 r365, 1): the dialog SAYS when its row could not be read again (`readRow`) — its view is then the row as last read
  const stale = el('div', 'vw-ak-hint vw-use-stale'); stale.setAttribute('role', 'status'); stale.hidden = true;
  const err = el('div', 'vault-secret-error'); err.setAttribute('role', 'status');
  body.append(stale, err);
  const f = el('div', 'dialog-footer');
  const cancel = el('button', 'btn-cancel', t('Cancel'));
  const save = el('button', 'btn-create vw-use-save', t('Save'));
  cancel.type = save.type = 'button';
  cancel.onclick = () => close();
  // lane vault-standing-request r4 (THE ROOT MODEL) + r5: the Save writes SCOPES, each with its own end (saveScopesOf — «As each
  // has it now» keeps every scope's own end; a host typed new takes the member's EARLIEST live end). lane vault-use-grants round 5
  // (MAJOR item 4): each wildcard host keeps the CLI that minted it (the store refuses a wildcard with no tool — `tool_required`).
  // THE PLAN: what each member's row will be — the Save writes it and the preview line says it BEFORE Save (r5)
  const planOf = () => {
    const typed = hostsIn.value.split(/[\s,]+/).map((h) => h.trim()).filter(Boolean);
    const hosts = ownBox && ownBox.checked ? [ENTRY_HOSTS] : typed;
    // r10 (MAJOR): the 除了 the picker does not offer is kept as stored — lane held-except-doors r3 (主开发's acceptance of r2,
    // MINOR 1): the held list is the picker's OWN answer (the stored one less a kept-line ✕), so pickToRow keeps exactly what the
    // dialog shows and exceptRemovedOf names the ✕-ed one (passing the stored `held` re-added it — the ✕ did nothing)
    const exNow = picker.except({ held });
    const pick = pickToRow(picker.knownRows(), picker.selected(), exNow, { held: exNow, only: typeof picker.onlyKeys === 'function' ? picker.onlyKeys() : null, onlyWas });   // the chain's cure (C): + «仅本组»
    const had = new Map((snap ? snap.to : members).map((m) => [keyOfM(m), m]));   // r11: by the principal; the row as it landed
    const to = [], fresh = [], kept = [], gone = [];
    for (const p of pick.to) {
      const was = had.get(pkOf(p));
      const h = hosts.length ? hosts : was ? (was.hosts || []) : [];
      const cmds = was && Array.isArray(was.commands) ? was.commands : [];   // lane vault-standing-request: a member's command shapes ride the Save unchanged
      const plan = saveScopesOf({ was, hosts: h, cmds, endId: endSel.value, endFrom: endsFrom() });   // r8: no window in it — the hub keeps the live one (`kept`); B-f212: the ends from the press (then the first landed Save)
      // r9 (主开发's acceptance of r8, MINOR C): a member whose only scope is an ENDED 1-hour window the hub has not swept yet is
      // sent with none (`plan.pruned` — the hub prunes it); never a refusal for a scope the hub failed to sweep. A refusal that
      // remains names the member.
      if (plan.refused) return { error: t('Name the hosts {name} may use it for — a host name or address each (never «any host»)', { name: nameOf({ ...p, ...(was && was.name && !p.name ? { name: was.name } : {}) }, app) }) };
      to.push({ ...p, ...(was && was.name && !p.name ? { name: was.name } : {}), scopes: plan.scopes });
      fresh.push(plan.fresh); kept.push(plan.kept); gone.push(!!plan.pruned);
    }
    const removed = exceptRemovedOf(snap ? snap.except : u.except || [], pick.except);   // r10: every exception this Save takes away — said, and named to the hub
    return { to, fresh, kept, gone, pick, removed, changed: !snap || rowChanged(snap, { to, except: pick.except }, { undecided: undecidedNow }) };
  };
  // r13 (the readers of B-f212): the owner's own inputs — a change the hub made (a row answered without `use`, a 1-hour window
  // that ended meanwhile) is no reason to count the ends anew
  const inputsKeyOf = (f) => JSON.stringify(FIELDS.filter((x) => x.name !== 'policy').map((x) => (Array.isArray(f[x.name]) ? [...f[x.name]].map(String).sort() : f[x.name])));   // the owner's inputs: every field but the policy
  const inputsOf = () => inputsKeyOf(fieldsNow());
  // the plan as THIS press would post it: the ends from the landed pin; a Save whose inputs differ from what landed counts from now
  const planNow = () => {
    saveAt = endPin != null ? endPin : Date.now();
    let p = planOf();
    if (endPin != null && !p.error && p.changed && inputsOf() !== landedInputs) { saveAt = Date.now(); p = planOf(); }
    return p;
  };
  const drawPreview = () => {
    let plan = null; try { plan = planNow(); } catch { plan = null; }   // r13: the preview says what the Save would post
    preview.textContent = '';
    if (!plan || plan.error || !(plan.to.length || plan.removed.length)) { preview.hidden = true; return; }
    preview.hidden = false;
    preview.append(el('span', 'vw-use-preview-lbl', t('What Save writes:')));
    plan.to.forEach((m, k) => {
      const line = el('div', 'vw-use-preview-line');
      line.append(document.createTextNode(`${nameOf(m, app)} · `));
      if (plan.gone[k]) line.append(el('span', 'vw-use-scope', t('the 1-hour approval ended — Save removes it')));   // r9 (MINOR C)
      [...m.scopes, ...plan.kept[k]].forEach((s, i) => {
        if (i) line.append(document.createTextNode(', '));
        if (s.kind === 'window') { line.append(el('span', 'vw-use-scope vw-use-scope-window', `${windowWords({ until: s.until, expired: false })} ${t('(kept)')}`)); return; }   // r7: the card's window, kept as it is (r8: the hub keeps it — the Save never sends it)
        const sc = s.command ? { kind: 'command', command: s.command } : { kind: 'host', host: s.host, tool: s.tool };
        const isNew = plan.fresh[k].includes(i);
        line.append(el('span', `vw-use-scope${isNew ? ' vw-use-scope-new' : ''}`, `${scopeWord(sc, entryHosts)} · ${leftWord({ until: s.until, expired: Number(s.until) > 0 && Number(s.until) <= Date.now() })}${isNew ? ' ' + t('(new)') : ''}`));
      });
      preview.append(line);
    });
    for (const x of plan.removed) preview.append(el('div', 'vw-use-preview-line vw-use-except-gone', t('{name} will no longer be excluded', { name: nameOf(x, app) })));   // r10 (MAJOR): an exception goes only where it is said
  };
  // B-f212: the fields a ROW lands in this dialog — its members and 除了 as picker keys (one the picker has not seen joins its rows,
  // as at the open), the hosts box and words as the open draws them unless the dialog's own already DESCRIBE the row (the hosts
  // this dialog's Save wrote, «each keeps its own», a row with no member: nothing moves), its policy when `policy`
  const describes = (f, ms) => ms.every((m) => {
    const h = [...new Set((m.hosts || []).map(String))].sort();
    if (f.own) return JSON.stringify(h) === JSON.stringify([ENTRY_HOSTS]);
    const typed = [...new Set(String(f.hosts || '').split(/[\s,]+/).filter(Boolean))].sort();
    return !typed.length || JSON.stringify(h) === JSON.stringify(typed);
  });
  const rowFields = (lu, prev, { policy = false } = {}) => {
    const ms = (lu.to || []).filter(Boolean), known = picker.knownRows();
    const pk = rowToPick({ to: ms, except: Array.isArray(lu.except) ? lu.except : [] }, known, pickWords());
    const fresh = (pk.extra || []).filter((x) => !extra.some((y) => y.key === x.key) && !known.some((k) => String(k.key) === x.key));
    if (fresh.length) { extra.push(...fresh); picker.refresh(); }
    const v = hostsViewOf(ms), kept = describes(prev, ms);
    return { selected: pk.selected, except: pk.except, only: pk.only || [], own: kept ? prev.own : ownBox ? v.own : null, hosts: kept ? prev.hosts : v.hosts, ...(policy ? { policy: (lu.policy && lu.policy.text) || '' } : {}) };
  };
  // THE LANDING (B-f212, the law: src/lib/landing-merge.js): the page takes what landed where the person changed nothing since
  // `base`; what the person changed since is KEPT over it and stays unsaved (`clean` = what landed). r11: the snapshot the next
  // Save is compared against is the row that landed; r10's held 除了 (what a Save writes while no Task Group is picked) is what
  // the dialog now shows
  let landings = 0, polLanded = (u.policy && u.policy.text) || '', onlyWas = (stored.only || []).slice();
  const land = (base, landed) => {
    const L = landingOf({ base, now: fieldsNow(), landed, clean: clean || {} });
    clean = L.clean; landings++;
    held = L.fields.except;
    // every row of the table, in its order (who first: 除了 and «仅本组» are judged over the members picked): what the page shows
    // is written only where it is not already what the landing leaves
    for (const f of FIELDS) if (f.name in L.fields && !sameField(f.read(), L.fields[f.name])) f.write(L.fields[f.name]);
    if (typeof clean.policy === 'string') polLanded = clean.policy;
    if (Array.isArray(landed.only)) onlyWas = landed.only.slice();   // «仅本组» as the stored row now has it: what the next Save says switched off
    previewNow();
    return L;
  };
  // a Save whose ROW landed: the hub's answer names the row (`use`); an older hub's names none — what landed is what was posted
  // (r11: every next Save then posts the row whole). B-f212 (r11's first follow-up): a member the hub SWEPT at this Save (an
  // ended 1-hour window it pruned) leaves the picker — kept there, the next Save posted it as new to the row and asked its hosts
  const landRow = (r, base) => {
    const lu = r && r.use && Array.isArray(r.use.to) ? r.use : null;
    snap = lu ? { to: lu.to.filter(Boolean), except: Array.isArray(lu.except) ? lu.except : [] } : null;
    if (lu) undecidedNow = lu.unverifiedWhy === 'marks_undecided';   // r3130 MUST 2: a landed row is decided (the hub's answer says if not)
    if (lu) { stale.textContent = ''; stale.hidden = true; rev = revOfUse(lu); }   // the hub just answered the row: it was read (and its stamp)
    land(base, lu ? { ...rowFields(lu, base), end: base.end } : asPressed(base));
  };
  const asPressed = (base) => Object.fromEntries(FIELDS.filter((f) => f.name !== 'policy').map((f) => [f.name, base[f.name]]));
  // B-f212 (主开发 r365, 2): ONE SAVE IN FLIGHT. The Save stays live (never a greyed button), but a press while a post is out is
  // KEPT and posted once that reply has landed, with the fields of THAT moment (the presses of one flight are one kept press).
  // So every reply lands in the order the hub took the posts, and the dialog closes only when no post is out and nothing is
  // unsaved (two posts out, released in the other order, closed the dialog on «removed» while the hub held the access)
  let saving = null, keptPress = null;
  // B-f212's remainder (the read): a press kept while a Save the hub REFUSED (`row_changed`) was out is not posted — the person
  // first sees the row that holds with their changes kept over it, and the words; their next press is their own
  let refused = false;
  function doSave() {
    if (!saving) { refused = false; saving = saveOnce().finally(() => { saving = null; }); return saving; }
    if (!keptPress) { const next = () => { keptPress = null; if (refused) return false; return doSave(); }; keptPress = saving.then(next, next); }
    return keptPress;
  }
  async function saveOnce() {
    err.textContent = '';
    // r1260 (3) + r1423 (the owner's rule: no greyed control — a person's press is attended): a press while the row is unread posts
    // nothing, answers in words what it waits for and reads the row again; a read that keeps failing says what a person can do
    if (unread) { err.textContent = readFailed ? failWord : t('Who may use it is being read first — Save again once it shows'); readRow(); return false; }
    // B-f212: every end of this press's plan counts from the landed pin; r13: a Save the OWNER changed since (another end, a member
    // added, hours later in the same open dialog) counts from THIS press, never a past one
    const plan = planNow();
    // r14 (主开发's read of r13) + B-f212 (the landing law): THIS Save's instant and FIELDS, taken at its plan — the preview redraws
    // the shared `saveAt` and the person may edit while the post is in flight; the landing pins what was POSTED and keeps what
    // the person changed since (it stays unsaved)
    const at = saveAt, base = fieldsNow();
    if (plan.error) { err.textContent = plan.error; return false; }
    const { to, pick, removed, changed } = plan;
    const deciding = undecidedNow;   // r3130 MUST 2: this press decides an undecided row (said at its landing)
    const polWas = polLanded, polNow = base.policy;
    // r10 (主开发's acceptance of r9, MAJOR (2)): the ROW is posted only when it changed — a Save that sets only the policy never
    // rewrites the row behind the 验证是你 the owner gives for the policy
    const send = () => post('/api/vault/use-grants', { id: row.id, to, except: pick.except, ...(removed.length ? { removeExcept: removed.map(pkOf) } : {}), ...(rev != null ? { rev } : {}) }, revealLeftMs() ? revealHeaders() : {});
    let r = { ok: true }, rowSaved = false;
    flying++;
    try {
      if (changed) {
        r = await send();
        if (r && r.code === 'reveal_needs_password') { forgetReveal(); if (!(await askRevealPassword())) return false; r = await send(); }
        // B-f212's remainder: THE HUB REFUSED A SAVE OVER A ROW THIS DIALOG NEVER SAW (another client's Save, a run card's
        // «Always», a ✕ elsewhere) — the row that holds lands by the landing law over what this dialog last knew (`clean`): the
        // person's own changes are kept over it and stay unsaved; the dialog stays open and says so; Save again sends its stamp
        if (r && r.code === 'row_changed' && r.use && Array.isArray(r.use.to) && !r.use.unknown && !r.use.unverified) {
          const lu = r.use;
          refused = true;
          const knew = snap ? new Set((snap.to || []).filter(Boolean).map(keyOfM)) : null;   // the members this dialog knew (by r11's own key); an older hub's answer named none: nothing said
          const gained = knew ? lu.to.filter((m) => m && !knew.has(keyOfM(m))) : [];   // r1260 (2): the held row's members it did not
          snap = { to: lu.to.filter(Boolean), except: Array.isArray(lu.except) ? lu.except : [] }; rev = revOfUse(lu);
          if (stale.textContent !== t('«{name}» was removed from the vault', { name: row.label })) { stale.textContent = ''; stale.hidden = true; }   // a row the hub answered was read — but an entry this dialog read as removed stays said
          land(clean, rowFields(lu, clean));
          // r1260 (2): the person's typed VALUES (the hosts, the end) are kept and the next Save applies them to EVERY member — also to
          // one the row gained meanwhile (a card's «Always» with its own host and no end): the preview shows it, the line says it
          const typedValues = fieldsDiffer(fieldsNow(), clean).some((n) => n === 'hosts' || n === 'end');
          err.textContent = t('Someone changed who may use it while you were editing — this shows it as it is now, with your own changes kept; Save again to keep them') + (gained.length && typedValues ? ` ${t('Your hosts and end will apply to the new member too — see «What Save writes»')}` : '');
          return false;
        }
        if (r && r.ok) { rowSaved = true; landRow(r, base); endPin = at; landedInputs = inputsKeyOf(clean); previewNow(); }   // B-f212: the landed row's instant pins the next Save's ends (r13: every landing moves it, with the inputs it landed)
      } else land(base, asPressed(base));   // B-f212: no row to post — the row as stored IS what this press would write (hosts typed in another order, the same row)
      if (r && r.ok && polNow !== polWas) {   // R4: the policy rides the same Save (a non-empty one asks 验证是你 too)
        const sendP = () => post('/api/vault/use-policy', { id: row.id, text: polNow }, revealLeftMs() ? revealHeaders() : {});
        const notPol = t('The members were saved; the policy was not');   // r11 (MINOR 3): the row landed — said, never a silent half
        let q = await sendP();
        if (q && q.code === 'reveal_needs_password') { forgetReveal(); if (!(await askRevealPassword())) { if (rowSaved) { err.textContent = notPol; refresh?.(); } return false; } q = await sendP(); }
        if (!q || !q.ok) { err.textContent = rowSaved ? `${notPol} — ${revealWords(q || {})}` : revealWords(q || {}); if (rowSaved) refresh?.(); return false; }
        land(base, { policy: polNow });   // B-f212: the policy landed — words typed over it since the press stay unsaved
      }
      if (r && r.ok) {
        if (changed) showToast(deciding && to.length ? t('Saved — these members are in use again') : to.length ? t('Saved — they use it with no card for those hosts') : t('Saved — nobody uses it without a card')); else if (polNow !== polWas) showToast(t('Saved'));   // r3130 MUST 2
        // B-f212 (b): a landing closes a CLEAN dialog only. An edit made while the Save was in flight is still unsaved: the dialog
        // asks, as the person's own close does (Save / Discard / Keep editing); the ask's own Save hears why it is not done
        if (keptPress) { refresh?.(); return t('what you changed while it was saving'); }   // a press kept during this flight posts next: it closes or asks
        if (!unsavedNow()) { close(); refresh?.(); return true; }
        refresh?.();
        dismiss();
        return t('what you changed while it was saving');
      }
      err.textContent = saveWordsOf(r, plan, (m) => nameOf(m, app));
      return false;
    } finally { flying--; if (owed) readRow(); }
  }
  // B-f212 (multi-client): another client's save of this row — the vault's ONE notify (`vault-contents`) — lands here by the same
  // law, its base what this dialog last knew (`clean`). The dialog reads its row again: one read at a time, never while its own
  // Save is in flight (that answer lands first), and a read that began before one of this dialog's landings is read again (its
  // row may be older than what landed)
  let flying = 0, reading = false, owed = false;
  async function readRow() {
    if (gone) return;
    if (flying || reading) { owed = true; return; }
    reading = true; owed = false;
    const at = landings;
    let r = null;
    try { r = await fetchJson('/api/vault/contents', { headers: revealHeaders() }); } catch { r = null; }
    reading = false;
    if (gone) return;
    if (flying || at !== landings) owed = true;
    else {
      // B-f212 (主开发 r365, 1): A ROW THAT COULD NOT BE READ IS NOT AN EMPTY ROW — unknown is never read as empty. A row marked
      // unknown (the hub could not read its grants: it answers empty lists), unverified (a locked vault cannot verify them), a
      // failed read, a locked vault, an entry that is gone: the landing is NOT taken — the dialog keeps its view and says so; a
      // Save then meets the hub's refusal by name, as before
      const listed = !!r && r.ok !== false && Array.isArray(r.rows);
      const x = listed ? r.rows.find((y) => y && y.id === row.id) : null, lu = x && x.run ? x.run.use : null;
      const locked = (r && (r.code === 'vault_locked' || r.state === 'locked')) || !!(lu && lu.unverified && !lu.unverifiedWhy);   // r3130 MUST 2: a held or undecided row is not «locked»
      const word = lu && lu.unverifiedWhy === 'marks_unread' ? t('The vault-use marks could not be read — this shows who may use it as last read; nothing is lost')
        : locked ? t('The vault is locked — who may use it could not be read just now; this shows it as last read')
        : !listed ? t('Who may use it could not be read just now — this shows it as last read')
          : !x ? t('«{name}» was removed from the vault', { name: row.label })
            : !lu || lu.unknown || !Array.isArray(lu.to) ? t('Who may use it could not be read just now — this shows it as last read') : '';
      stale.textContent = word; stale.hidden = !word;
      if (word && unread && lu && revOfUse(lu) != null) { rev = revOfUse(lu); unread = false; err.textContent = ''; }   // a row the hub cannot read but stamps: Save saves (the hub judges it)
      // r1423: the read came back unread — a press says what a person can do: close it and open it again; but a LOCKED vault or an
      // entry that is GONE says its own status (unlocking re-reads by itself; a removed entry cannot be opened again). Words a press
      // already showed («being read») follow the read that failed after it (the tracer's read)
      if (word && unread) { readFailed = true; failWord = locked || (listed && !x) ? word : t('Who may use it could not be read — nothing was saved; close it and open it again (it stays as it is)'); if (err.textContent) err.textContent = failWord; }
      if (!word) { undecidedNow = lu.unverifiedWhy === 'marks_undecided'; snap = { to: lu.to.filter(Boolean), except: Array.isArray(lu.except) ? lu.except : [] }; if (unread) { unread = false; err.textContent = ''; } rev = revOfUse(lu); land(clean, rowFields(lu, clean, { policy: true })); }   // B-f212's remainder: and its stamp
    }
    if (owed && !flying) readRow();
  }
  save.onclick = () => { doSave(); };
  saveNow = doSave;
  hostsIn.addEventListener('input', drawPreview); endSel.addEventListener('change', drawPreview); if (ownBox) ownBox.addEventListener('change', drawPreview);
  previewNow = drawPreview; drawPreview();
  f.append(cancel, save);
  body.parentNode.append(f);
  clean = fieldsNow();
  if (unread) { stale.textContent = t('Who may use it could not be read just now — this shows it as last read'); stale.hidden = false; ready.then((s) => { if (s) readRow(); }); }   // r1260 (3): a row that could not be read is read first, once the dialog has opened (§103 r4: a queued form waits behind the open one's ask); r1423: the Save stays a LIVE button — never greyed with a hint
  if (app && app.ws && typeof app.ws.onGlobal === 'function') {
    const onContents = (m) => { if (m && m.type === 'vault-contents') readRow(); };
    app.ws.onGlobal(onContents);
    offContents = () => { try { app.ws.offGlobal(onContents); } catch { } };
  }
}
