// «WHO MAY USE IT» IN THE VAULT WINDOW (lane vault-use-grants, the owner 2026-10-27 「每个密码请求都要我同意太麻烦了！能不能搞个权限分配 +
// 自动 approve 机制」). An entry an agent run may use gets, on its row:
//   · THE CHIPS — every member of its vault-use grant (a conversation, a Task Group, All agents): its name · the hosts it may
//     reach · «used N×» · its end (or «expired»), ✕ takes it back (a click — POST /api/vault/use-grants/revoke); «除了» chips
//     for the members left out; the entry's own line «used N× by M conversations»; r8 (lane vault-standing-request): a LIVE
//     1-hour window has its OWN ✕ beside it (POST …/revoke {scope: 'window'} — only the window goes, the other scopes stay);
//   · 「Who may use it…」 — THE principal picker every grant door draws (给谁 / 除了, src/lib/principal-picker.js), the HOSTS
//     (a list, or «the hosts it was stored for» when the entry has them — never «any host»), the END (none / 8 hours / 30
//     days / 90 days). Save = POST /api/vault/use-grants with the whole row; a save that gives anybody MORE asks 验证是你
//     first (the hub refuses it otherwise — reveal_needs_password), in the press's own task.
//   · R4 (default OFF — Settings ▸ «Let the policy judge approve vault uses»): the entry's POLICY for the decision-API judge, in
//     the same dialog (setting one asks 验证是你; clearing is a click); the row says the policy, whether the judge is on, and
//     what it approved («Approved by the policy judge 3× · last 14:02» + 「Revoke」: those commands ask again next time).
// The grant's facts ride the Vault window's own list (row.run.use — src/server/vault-run-door.js rowFacts): every change of
// them reaches every open window through the vault's ONE notify (`vault-contents`), patched in place.
import { t } from './i18n.js';
import { fetchJson, showToast, createModalShell } from './utils.js';
import { principalPicker, rosterFromApp } from './principal-picker.js';
import { rowToPick, pickToRow } from './principal-picker-model.js';
import { revealLeftMs, revealHeaders, forgetReveal, askRevealPassword, revealWords } from './vault-reveal.js';

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const EVERYONE_KEY = 'everyone:*';
const ENTRY_HOSTS = '@entry';
const ENDS = [['keep', 0], ['none', null], ['8h', 8 * 3600e3], ['30d', 30 * 86400e3], ['90d', 90 * 86400e3]];
const endWord = (id) => ({ keep: t('As each has it now'), none: t('No end'), '8h': t('8 hours'), '30d': t('30 days'), '90d': t('90 days') })[id];
const dateOf = (ms) => { try { return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); } catch { return ''; } };
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
 *  → { scopes, fresh: [index of each new scope], kept: [{kind: 'window', until}], pruned, refused } */
const KEEP_DEFAULT = '30d';
export function saveScopesOf({ was = null, hosts = [], cmds = [], endId = 'keep', now = Date.now() } = {}) {
  const wasSc = was ? scopesOfM(was) : [];
  const ended = (s) => !!s.expired || (Number(s.until) > 0 && Number(s.until) <= now);
  const live = wasSc.filter((s) => !ended(s) && s.kind !== 'window'), finite = live.map((s) => Number(s.until)).filter((u) => u > 0);   // r7: a 1-hour window is no «now» a new host keeps
  const keepNew = !live.length ? now + (ENDS.find(([id]) => id === KEEP_DEFAULT) || [])[1] : finite.length ? Math.min(...finite) : null;
  const endMs = (ENDS.find(([id]) => id === endId) || [])[1];
  const endFor = (s0) => (endId === 'keep' ? (s0 ? (Number(s0.until) > 0 ? Number(s0.until) : null) : keepNew) : endMs ? now + endMs : null);
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
const sourceWord = (m) => { const at = Number(m.at) > 0 ? clockOf(m.at) : ''; const w = m.source === 'request' ? t('asked by the agent') : m.source === 'card' ? (m.sourceKind === 'window' ? t('«Allow for 1 hour» on a card') : t('«Always» on a card')) : m.source === 'owner' ? t('set by you') : ''; return w && at ? `${w} · ${at}` : w; };   // r8: a window press is never called «Always»

/** A member's name: its stored name, the live roster's, else its id (never markup — textContent only). */
function nameOf(m, app) {
  if (m.kind === 'everyone') return t('All agents');
  const roster = rosterFromApp(app);
  if (m.kind === 'group') { const g = roster.find((r) => r.kind === 'group' && String(r.id) === String(m.id)); return (g && g.name) || m.name || String(m.id); }
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
  useB.title = t('Let a conversation, a Task Group or all agents run commands with it for the hosts you name — no card each time. Another host still asks you.');
  let cur = row;
  useB.onclick = () => showUseGrantDialog(cur, { app, refresh });
  function redraw(r) {
    cur = r;
    host.textContent = '';
    const u = (r && r.run && r.run.use) || null;
    useB.hidden = !!(u && u.own);   // lane vault-standing-request r2 (MAJOR 3): an agent's OWN entry shows the standing grants it holds (chips + ✕) — nobody else may use it, so there is no «Who may use it…» to add with
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
        chip.dataset.grant = m.id || '';
        chip.dataset.principal = m.principal || '';
        const cmds = Array.isArray(m.commands) ? m.commands : [];
        const sc = scopesOfM(m);
        const words = el('span', 'vw-use-words');
        words.append(document.createTextNode(`${nameOf(m, app)} · `));
        sc.forEach((s, k) => { if (k) words.append(document.createTextNode(', ')); const win = s.kind === 'window', liveW = win && !s.expired; const w = el('span', `vw-use-scope${s.expired ? ' vw-use-scope-ended' : ''}${liveW ? ' vw-use-scope-window' : ''}`, win ? windowWords(s) : `${scopeWord(s, u.entryHosts)} · ${leftWord(s)}`); w.title = liveW ? t('A 1-hour approval from a run card: this conversation uses it in any run without asking, each use shows a notice — then it asks again. ✕ takes it back now.') : s.expired ? t('ended {when}', { when: win ? clockOf(s.until) : dateOf(s.until) }) : Number(s.until) > 0 ? t('until {when}', { when: dateOf(s.until) }) : t('no end'); words.append(w); if (liveW) words.append(windowX(r, m, refresh)); });   // r4: EACH scope with its own end; r7: a window «any destination · until HH:MM · N min»; r8: an ENDED window is drawn as the others (its «ended» title, no warning accent), a live one has its OWN ✕
        const bits = [];
        if (m.uses) bits.push(t('used {n}×', { n: m.uses }));
        if (pausedM) bits.push(t('paused by you'));
        if (sourceWord(m)) bits.push(sourceWord(m));   // lane vault-standing-request: who wrote it and when — last, its time beside it
        if (bits.length) words.append(document.createTextNode(` · ${bits.join(' · ')}`));
        chip.append(words);
        chip.title = `${m.id || ''}${m.convs > 1 ? ' · ' + t('{n} conversations', { n: m.convs }) : ''}${cmds.length ? '\n' + cmds.map(commandTitle).join('\n') : ''}${legacyW.length ? '\n' + t('Carried from an older version: this wildcard host is open to ANY program. Take it back (✕) and press «Always» on the next run of its tool — the new grant names its tool.') : ''}`;   // lane vault-standing-request: the whole program + script paths
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
      if (u.unverified && live.length) host.append(el('div', 'vw-use-paused-note', t('Unverified until you unlock the vault — not in use until then.')));
      else if (paused) host.append(el('div', 'vw-use-paused-note', t('Paused while the entry is off — turn «Usable by agent runs» on to restore these.')));
    }
    if (u.used && u.used.uses) host.append(el('div', 'vw-ak-used vw-use-count', t('used {n}× by {m} conversations', { n: u.used.uses, m: u.used.convs })));
    if (u.policy) host.append(el('div', 'vw-ak-used vw-use-policy', u.judge === 'on' ? t('Policy for the judge: «{text}»', { text: u.policy.text }) : t('Policy for the judge: «{text}» — the judge is off (Settings ▸ Integration)', { text: u.policy.text })));
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
  const stored = rowToPick({ to: members, except: u.except || [] }, roster(), { everyoneKey: EVERYONE_KEY, notRunning: t('not running now'), deletedGroup: t('a deleted Task Group') });
  const extra = stored.extra || [];
  let picker = null;
  // the unsaved guard (test-dialog-unsaved-census): who, the hosts and the end as the dialog opened — a close with a change asks
  let start = null, saveNow = () => false;
  const stateOf = () => JSON.stringify([picker ? picker.selected().slice().sort() : [], picker ? picker.except().slice().sort() : [], ownBox ? ownBox.checked : null, hostsIn ? hostsIn.value.trim() : '', endSel ? endSel.value : '', polIn ? polIn.value.trim() : '']);
  const { body, close, raised } = createModalShell({ id: 'vault-use-grant', kind: 'form', key: row.id, title: t('Who may use «{name}»', { name: row.label }), dialogClass: 'vault-dialog-box vw-ak-dialog vw-use-dialog', escapeToClose: true, onClose: () => { try { picker && picker.close(); } catch { } },
    unsaved: { isDirty: () => start !== null && stateOf() !== start, save: () => saveNow() } });
  if (raised) return null;   // raised: the same entry's «Who may use» form, as it was (int361, dialog-yield §103 r3: key = the entry)
  let ownBox = null, hostsIn = null, endSel = null, polIn = null, previewNow = () => {};
  body.append(el('div', 'vw-ak-hint', t('They run commands with it — vibespace-vault run — for the hosts below with no card each time; they never see it. Another host, or a command whose destination cannot be told (a shell, a script), still asks you.')));
  picker = principalPicker({ items: () => [...roster(), ...extra.filter((x) => !roster().some((r) => r.key === x.key))], app, multi: true, selected: stored.selected, placeholder: t('Search sessions and groups…'), label: t('Who may use it'), emptyText: t('No agent session is running'), everyone: { key: EVERYONE_KEY }, except: { selected: stored.except, extra, onChange: () => previewNow() }, onChange: () => previewNow() });
  body.append(el('div', 'vw-ak-sec', t('Who')), picker.el);
  // THE HOSTS: one list for the members this save writes; the entry's own («the hosts it was stored for») when it has them
  const common = (() => { if (!members.length) return null; const k = JSON.stringify(members[0].hosts || []); return members.every((m) => JSON.stringify(m.hosts || []) === k) ? members[0].hosts || [] : null; })();
  body.append(el('div', 'vw-ak-sec', t('For which hosts')));
  // lane vault-standing-request (B-eba2 — the owner: 「主机是什么东西？我该怎么填」): what a host IS, said where it is typed
  body.append(el('div', 'vw-ak-hint vw-use-hosts-what', t('A host is where a command connects to with it — e.g. api.openai.com for an API key, 192.168.1.1 for a router. A program whose destination VibeSpace cannot read (a script) is allowed by its command instead, from its run card.')));
  if (entryHosts.length) {
    const lab = el('label', 'vw-ak-pick vw-use-own');
    ownBox = el('input'); ownBox.type = 'checkbox';
    ownBox.checked = !members.length || (common && common.length === 1 && common[0] === ENTRY_HOSTS);
    lab.append(ownBox, el('span', null, t('The hosts it was stored for ({hosts})', { hosts: entryHosts.join(', ') })));
    body.append(lab);
  }
  hostsIn = el('input', 'vault-pw vw-use-hosts');
  hostsIn.type = 'text'; hostsIn.spellcheck = false; hostsIn.autocomplete = 'off';
  hostsIn.placeholder = common === null && members.length ? t('Each keeps its own hosts — or type hosts for all') : t('Host names or addresses, e.g. 192.168.1.1, router.lan');
  hostsIn.value = common && !(common.length === 1 && common[0] === ENTRY_HOSTS) ? common.filter((h) => h !== ENTRY_HOSTS).join(', ') : '';
  body.append(hostsIn);
  // «让 agent 自己申请» (B-eba2): right under the field the owner could not fill — the agent can ask for exactly this grant, one card to allow
  const askAgent = el('div', 'vw-ak-hint vw-use-ask-agent');
  askAgent.append(el('b', null, t('Not sure what to fill in? Let the agent ask.')), document.createTextNode(' ' + t('It asks with vibespace-vault request {ref} --standing (--host … or --command …), and you get ONE card with exactly this grant to allow.', { ref: u.ref || 'vault://…' })));
  body.append(askAgent);
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
  body.append(polIn, el('div', 'vw-ak-hint', u.judge === 'on' ? t('The policy judge is ON: a run its grants do not cover is judged against these words by the decision API; a yes runs it (recorded in For you), anything else shows you the card. It never sees the value.') : t('The policy judge is OFF (Settings ▸ Integration ▸ «Let the policy judge approve vault uses») — the words are kept for when you turn it on.')));
  // lane vault-standing-request: the commands a member may run are kept as they are (a card's «Always (this command)» or an
  // agent's standing request wrote them); ✕ on its chip takes the member back
  const withCmds = members.filter((m) => Array.isArray(m.commands) && m.commands.length);
  if (withCmds.length) body.append(el('div', 'vw-ak-hint vw-use-cmds', withCmds.map((m) => t('{name} may run: {commands} (kept)', { name: nameOf(m, app), commands: m.commands.map(commandWord).join(', ') })).join(' · ')));
  const err = el('div', 'vault-secret-error'); err.setAttribute('role', 'status');
  body.append(err);
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
    const pick = pickToRow(picker.knownRows(), picker.selected(), picker.except());
    const had = new Map(members.map((m) => [m.principal, m]));
    const keyOf = (p) => (p.kind === 'everyone' ? 'everyone' : p.kind === 'group' ? `group:${p.id}` : `conversation:${p.key}`);
    const to = [], fresh = [], kept = [], gone = [];
    for (const p of pick.to) {
      const was = had.get(keyOf(p));
      const h = hosts.length ? hosts : was ? (was.hosts || []) : [];
      const cmds = was && Array.isArray(was.commands) ? was.commands : [];   // lane vault-standing-request: a member's command shapes ride the Save unchanged
      const plan = saveScopesOf({ was, hosts: h, cmds, endId: endSel.value });   // r8: no window in it — the hub keeps the live one (`kept`)
      // r9 (主开发's acceptance of r8, MINOR C): a member whose only scope is an ENDED 1-hour window the hub has not swept yet is
      // sent with none (`plan.pruned` — the hub prunes it); never a refusal for a scope the hub failed to sweep. A refusal that
      // remains names the member.
      if (plan.refused) return { error: t('Name the hosts {name} may use it for — a host name or address each (never «any host»)', { name: nameOf({ ...p, ...(was && was.name && !p.name ? { name: was.name } : {}) }, app) }) };
      to.push({ ...p, ...(was && was.name && !p.name ? { name: was.name } : {}), scopes: plan.scopes });
      fresh.push(plan.fresh); kept.push(plan.kept); gone.push(!!plan.pruned);
    }
    return { to, fresh, kept, gone, pick };
  };
  const drawPreview = () => {
    let plan = null; try { plan = planOf(); } catch { plan = null; }
    preview.textContent = '';
    if (!plan || plan.error || !plan.to.length) { preview.hidden = true; return; }
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
  };
  async function doSave() {
    err.textContent = '';
    const plan = planOf();
    if (plan.error) { err.textContent = plan.error; return false; }
    const { to, pick } = plan;
    const send = () => post('/api/vault/use-grants', { id: row.id, to, except: pick.except }, revealLeftMs() ? revealHeaders() : {});
    let r = await send();
    if (r && r.code === 'reveal_needs_password') { forgetReveal(); if (!(await askRevealPassword())) return false; r = await send(); }
    const polWas = (u.policy && u.policy.text) || '', polNow = polIn.value.trim();
    if (r && r.ok && polNow !== polWas) {   // R4: the policy rides the same Save (a non-empty one asks 验证是你 too)
      const sendP = () => post('/api/vault/use-policy', { id: row.id, text: polNow }, revealLeftMs() ? revealHeaders() : {});
      let q = await sendP();
      if (q && q.code === 'reveal_needs_password') { forgetReveal(); if (!(await askRevealPassword())) return false; q = await sendP(); }
      if (!q || !q.ok) { err.textContent = revealWords(q || {}); return false; }
    }
    if (r && r.ok) { showToast(to.length ? t('Saved — they use it with no card for those hosts') : t('Saved — nobody uses it without a card')); close(); refresh?.(); return true; }
    const named = r && r.principal ? to.find((m) => (m.kind === 'everyone' ? 'everyone' : m.kind === 'group' ? `group:${m.id}` : `conversation:${m.key}`) === r.principal) : null;   // r9 (MINOR C): the hub's refusal names the member
    err.textContent = r && r.code === 'hosts_required' ? (named ? t('Name the hosts {name} may use it for — a host name or address each (never «any host»)', { name: nameOf(named, app) }) : t('Name the hosts it may be used for — a host name or address each (never «any host»)')) : r && r.code === 'tool_required' ? t('A wildcard host (like *.example.com) is scoped to the tool that first used it — add it from a run card with «Always», not here') : r && r.code === 'bad_principal' ? t('A host is a host name or address (no wildcard, no address with a path)') : revealWords(r || {});
    return false;
  }
  save.onclick = () => { doSave(); };
  saveNow = doSave;
  hostsIn.addEventListener('input', drawPreview); endSel.addEventListener('change', drawPreview); if (ownBox) ownBox.addEventListener('change', drawPreview);
  previewNow = drawPreview; drawPreview();
  f.append(cancel, save);
  body.parentNode.append(f);
  start = stateOf();
}
