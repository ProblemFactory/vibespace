// «WHO MAY USE IT» IN THE VAULT WINDOW (lane vault-use-grants, the owner 2026-10-27 「每个密码请求都要我同意太麻烦了！能不能搞个权限分配 +
// 自动 approve 机制」). An entry an agent run may use gets, on its row:
//   · THE CHIPS — every member of its vault-use grant (a conversation, a Task Group, All agents): its name · the hosts it may
//     reach · «used N×» · its end (or «expired»), ✕ takes it back (a click — POST /api/vault/use-grants/revoke); «除了» chips
//     for the members left out; the entry's own line «used N× by M conversations»;
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
const oneHostWord = (h, entryHosts, tool = null) => {
  if (h === ENTRY_HOSTS) return t('the hosts it was stored for ({hosts})', { hosts: (entryHosts || []).join(', ') || t('none') });
  if (String(h).startsWith('*.')) { const base = String(h).slice(2); const w = MULTI_TENANT.test(base) ? t('every {host} host (incl. other customers’ endpoints)', { host: h }) : t('every {host} host', { host: h }); return tool ? t('{hostword} (via {tool})', { hostword: w, tool }) : w; }   // round 4 (item 3): a wildcard carries the ONE CLI that minted it — shown per host
  return h;
};
const hostsWord = (hosts, entryHosts, toolFor = null) => (hosts || []).map((h) => oneHostWord(h, entryHosts, toolFor && toolFor[h])).join(', ');
// lane vault-standing-request: a member's COMMAND SHAPES («the command python3 transcribe.py») and who wrote it, when
const baseOf = (p) => String(p == null ? '' : p).replace(/\/+$/, '').split('/').pop();
const preOf = (c) => (c && Array.isArray(c.pre) ? c.pre.filter((w) => typeof w === 'string' && w) : []);   // r2: the options / subcommand it pins before the script
const commandWord = (c) => (c && c.program ? [baseOf(c.program), ...preOf(c), c.arg == null ? '' : String(c.arg)[0] === '/' ? baseOf(c.arg) : String(c.arg)].filter(Boolean).join(' ') : '');
const commandTitle = (c) => [c.program, ...preOf(c), c.arg].filter((x) => x != null && x !== '').join(' ');
const clockOf = (ms) => { try { return new Date(ms).toTimeString().slice(0, 5); } catch { return ''; } };
const sourceWord = (m) => { const at = Number(m.at) > 0 ? clockOf(m.at) : ''; const w = m.source === 'request' ? t('asked by the agent') : m.source === 'card' ? t('«Always» on a card') : m.source === 'owner' ? t('set by you') : ''; return w && at ? `${w} · ${at}` : w; };

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
    if (live.length) {
      const chips = el('div', `vw-ak-grants vw-use-chips${paused ? ' vw-use-paused' : ''}`);
      chips.append(el('span', 'vw-ak-to vw-use-to', t('Used with no card by:')));
      for (const m of live) {
        const pausedM = !!m.paused;   // round 7 (MAJOR item 2): the entry is ON by another conversation's PRESS and THIS member was never resumed — the owner's pause stands (the ↻ un-pauses it). No date: the inverted model keeps no per-member pause time, so none can go stale.
        const chip = el('span', `vw-ak-chip vw-use-chip${m.expired ? ' vw-use-expired' : ''}${pausedM ? ' vw-use-chip-paused' : ''}`);
        chip.dataset.grant = m.id || '';
        chip.dataset.principal = m.principal || '';
        const cmds = Array.isArray(m.commands) ? m.commands : [];
        const bits = [nameOf(m, app), ...((m.hosts || []).length ? [hostsWord(m.hosts, u.entryHosts, m.toolFor)] : []), ...(cmds.length ? [t('the command {command}', { command: cmds.map(commandWord).join(', ') })] : [])];
        if (m.uses) bits.push(t('used {n}×', { n: m.uses }));
        if (m.expired) bits.push(t('expired'));
        else if (m.until) bits.push(t('until {when}', { when: dateOf(m.until) }));
        if (pausedM) bits.push(t('paused by you'));
        if (sourceWord(m)) bits.push(sourceWord(m));   // lane vault-standing-request: who wrote it and when — last, its time beside it
        chip.append(el('span', 'vw-use-words', bits.join(' · ')));
        chip.title = `${m.id || ''}${m.convs > 1 ? ' · ' + t('{n} conversations', { n: m.convs }) : ''}${cmds.length ? '\n' + cmds.map(commandTitle).join('\n') : ''}`;   // lane vault-standing-request: the whole program + script paths
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
      if (u.unverified) host.append(el('div', 'vw-use-paused-note', t('Unverified until you unlock the vault — not in use until then.')));
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
  let ownBox = null, hostsIn = null, endSel = null, polIn = null;
  body.append(el('div', 'vw-ak-hint', t('They run commands with it — vibespace-vault run — for the hosts below with no card each time; they never see it. Another host, or a command whose destination cannot be told (a shell, a script), still asks you.')));
  picker = principalPicker({ items: () => [...roster(), ...extra.filter((x) => !roster().some((r) => r.key === x.key))], app, multi: true, selected: stored.selected, placeholder: t('Search sessions and groups…'), label: t('Who may use it'), emptyText: t('No agent session is running'), everyone: { key: EVERYONE_KEY }, except: { selected: stored.except, extra } });
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
  async function doSave() {
    err.textContent = '';
    const typed = hostsIn.value.split(/[\s,]+/).map((h) => h.trim()).filter(Boolean);
    const hosts = ownBox && ownBox.checked ? [ENTRY_HOSTS] : typed;
    const pick = pickToRow(picker.knownRows(), picker.selected(), picker.except());
    const endId = endSel.value, endMs = (ENDS.find(([id]) => id === endId) || [])[1];
    const had = new Map(members.map((m) => [m.principal, m]));
    const keyOf = (p) => (p.kind === 'everyone' ? 'everyone' : p.kind === 'group' ? `group:${p.id}` : `conversation:${p.key}`);
    const to = [];
    for (const p of pick.to) {
      const was = had.get(keyOf(p));
      const h = hosts.length ? hosts : was ? (was.hosts || []) : [];
      const cmds = was && Array.isArray(was.commands) ? was.commands : [];   // lane vault-standing-request: a member's command shapes ride the Save unchanged
      if (!h.length && !cmds.length) { err.textContent = t('Name the hosts it may be used for — a host name or address each (never «any host»)'); return false; }
      const m = { ...p, ...(was && was.name && !p.name ? { name: was.name } : {}), ...(h.length ? { hosts: h } : {}), ...(cmds.length ? { commands: cmds.map((c) => ({ program: c.program, pre: preOf(c), arg: c.arg == null ? null : c.arg, sha: c.sha || null, psha: c.psha || null })) } : {}), ...(was && was.source ? { source: was.source, ...(Number(was.at) > 0 ? { at: was.at } : {}) } : {}) };
      // lane vault-use-grants round 5 (MAJOR item 4): carry the per-host tool scope back — a wildcard host (`*.amazonaws.com`)
      // keeps the CLI that minted it, so a whole-row Save never silently re-scopes it to every tool. The store refuses a
      // wildcard host with no tool by name (`tool_required`).
      if (was && was.toolFor && typeof was.toolFor === 'object' && Object.keys(was.toolFor).length) m.toolFor = was.toolFor;
      if (endId === 'keep') { if (was && was.until) m.until = was.until; }
      else if (endMs) m.until = Date.now() + endMs;
      to.push(m);
    }
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
    err.textContent = r && r.code === 'hosts_required' ? t('Name the hosts it may be used for — a host name or address each (never «any host»)') : r && r.code === 'tool_required' ? t('A wildcard host (like *.example.com) is scoped to the tool that first used it — add it from a run card with «Always», not here') : r && r.code === 'bad_principal' ? t('A host is a host name or address (no wildcard, no address with a path)') : revealWords(r || {});
    return false;
  }
  save.onclick = () => { doSave(); };
  saveNow = doSave;
  f.append(cancel, save);
  body.parentNode.append(f);
  start = stateOf();
}
