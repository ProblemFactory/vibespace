/**
 * THE REMOTEAPP SETTINGS CARD (design q-024 r1 §1.4, lane remoteapp-r1b) — the launcher → a Windows machine's dialog →
 * «RemoteApp settings…». Set up ONCE per machine, by its owner:
 *   · the machine's Remote Desktop FACTS (GET …/remoteapp/facts — the `remoteapp-facts` device op, read-only): one row per
 *     fact, an unmet fact is a SENTENCE with its door (Settings → System → Remote Desktop, or an admin PowerShell line to copy
 *     and run there — VibeSpace never runs it); an agent too old to answer says the version it needs, never a guess
 *   · the fixed console-takeover sentence (an RDP sign-in locks that machine's own screen)
 *   · the SIGN-IN (POST …/remoteapp/setup): user, domain, password — the password SEALED on the server; the page only ever
 *     hears "set", never its bytes
 *   · the CERTIFICATE: 「首次连接」 (POST …/remoteapp/trust) signs in once without an app and pins what the machine shows; a
 *     launch refused for a changed certificate shows that sentence and 「重新信任」 (the same door)
 * Card grammar (docs/kb-patterns.md «The card grammar»): every raw string — the fingerprint, the edition id, the admin
 * commands — sits in ONE 技术细节 fold (`data-fold="tech"`); no greyed control (a fact that is not met is a sentence).
 */
import { t } from './i18n.js';
import { createModalShell, fetchJson, showToast, copyText } from './utils.js';
import { ALLOWLIST_COMMAND, GPU_COMMAND } from '../remoteapp.js';
import { enterSubmits } from './chat-enter-keys.js';

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const btn = (cls, text, onclick) => { const b = el('button', cls, text); b.type = 'button'; b.onclick = onclick; return b; };
const post = (url, body) => fetchJson(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const ICON_OK = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const ICON_TODO = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8 4.6v4.2M8 10.9v.4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';

/** The words of one fact row (its label, the met text, the unmet sentence by its CODE — src/remoteapp.js remoteappFactRows). */
export function factWords(row, machine, facts) {
  const ed = facts && facts.edition ? facts.edition : {};
  if (row.key === 'edition') return { label: t('Windows edition'), state: row.met ? t('{edition} — it has the Remote Desktop service', { edition: ed.product || ed.id || 'Windows' }) : row.code === 'edition_home' ? t('This machine runs Windows Home, which has no Remote Desktop service; RemoteApp cannot work here, “Run as its own window…” (a cropped picture) can') : t('Could not tell this machine’s Windows edition; RemoteApp needs Windows Pro or Enterprise') };
  if (row.key === 'rdp') return { label: t('Remote Desktop'), state: row.met ? t('On, and answering on the machine itself') : row.code === 'rdp_not_listening' ? t('Remote Desktop is on, but nothing answers on its port 3389; restart {machine} or check Settings → System → Remote Desktop', { machine }) : t('Turn it on in Settings → System → Remote Desktop; no firewall opening to the local network is needed') };
  if (row.key === 'allowlist') return { label: t('Apps allowed as RemoteApps'), state: row.met ? t('Any app may open as a RemoteApp') : t('Windows opens only listed programs as RemoteApps; copy the admin command and run it once in an administrator PowerShell on {machine}', { machine }), copy: row.met ? null : t('Copy the admin command') };
  if (row.key === 'gpu') return { label: t('Graphics card in remote sessions (optional)'), state: row.met ? t('Remote sessions use the graphics card') : t('Apps like Blender render in software; to use the graphics card, turn on this policy with the admin command'), copy: row.met ? null : t('Copy the admin command') };
  return { label: row.key, state: '' };
}
/** The fixed console-takeover sentence (design §1.4: on the card, always). */
export function consoleTakeoverWords() { return t('After the Remote Desktop sign-in, that machine’s own screen shows its lock screen; anyone using it in person is pushed out. Best for a machine nobody sits at.'); }
/** A refused door of this card, in words (by its code; its own sentence otherwise). */
export function remoteappCardRefusal(r, machine) {
  const c = r && r.code;
  if (c === 'host_unavailable' || c === 'unsupported-host') return t('{machine} is offline', { machine });
  if (c === 'human_only') return t('Only people can set up RemoteApp');
  if (c === 'remoteapp_needs_setup') return t('Save the Windows user name and password first');
  if (c === 'rdp_auth_failed') return t('{machine} refused the Windows sign-in; check the user name and password', { machine });
  if (c === 'rdp_unreachable') return t('Nothing answered on {machine}’s Remote Desktop port; is Remote Desktop turned on there?', { machine });
  if (c === 'rdp_session_busy') return t('{machine} shows a RemoteApp session now; stop it before connecting again', { machine });
  if (c === 'rdp_trust_busy') return t('A first connection to {machine} is already running', { machine });
  if (c === 'invalid-values') return t('Not saved: {why}', { why: (r && r.error) || '' });
  return (r && r.error) || t('Could not reach {machine}', { machine });
}

/** Open the card for machine `m` (a GET /api/desktop/machines row: { hostId, name, setup, code }). */
export function openRemoteappSettings(app, m) {
  const machine = m.name || m.hostId;
  const host = encodeURIComponent(m.hostId);
  const { body, close } = createModalShell({ id: 'remoteapp-settings', title: t('RemoteApp settings — {machine}', { machine }), dialogClass: 'remoteapp-settings', escapeToClose: true });
  const lead = el('p', 'ra-lead', t('Open {machine}’s apps as their own windows through Remote Desktop. Set it up once here.', { machine }));
  const factsHead = el('div', 'ra-head', t('What {machine} needs', { machine }));
  const factsBox = el('div', 'ra-facts');
  const recheck = btn('file-tool-btn ra-recheck', t('Check again'), () => loadFacts());
  const takeover = el('p', 'ra-takeover', consoleTakeoverWords());
  takeover.dataset.sentence = 'console-takeover';
  const signHead = el('div', 'ra-head', t('Windows sign-in'));
  const field = (label, type, name) => { const l = el('label', 'ra-field'); const s = el('span', null, label); const i = el('input'); i.type = type; i.name = name; i.autocomplete = type === 'password' ? 'new-password' : 'off'; i.spellcheck = false; l.append(s, i); return { l, i }; };
  const fu = field(t('Windows user name'), 'text', 'user');
  const fd = field(t('Domain (only for a domain account)'), 'text', 'domain');
  const fp = field(t('Windows password'), 'password', 'password');
  const sealedNote = el('p', 'ra-note', t('The password is sealed on this VibeSpace server; only the Remote Desktop client receives it, when you open an app.'));
  const save = btn('btn-create ra-save', t('Save sign-in'), () => doSave());
  const certHead = el('div', 'ra-head', t('Certificate'));
  const certLine = el('p', 'ra-cert');
  const trust = btn('btn-create ra-trust', t('First connection'), () => doTrust());
  const fold = el('details', 'ra-tech'); fold.dataset.fold = 'tech';
  const foldBody = el('div', 'ra-tech-body');
  fold.append(el('summary', null, t('Technical details')), foldBody);
  body.append(lead, factsHead, factsBox, recheck, takeover, signHead, fu.l, fd.l, fp.l, sealedNote, save, certHead, certLine, trust, fold);

  let setup = null, facts = null, factsAnswer = null;
  const tech = () => {
    foldBody.replaceChildren();
    const line = (k, v) => { if (!v) return; const p = el('div', 'ra-tech-line'); p.append(el('span', null, k), el('code', null, v)); foldBody.append(p); };
    const ed = facts && facts.edition ? facts.edition : null;
    if (ed) line(t('Edition'), [ed.id, ed.product, ed.build && `build ${ed.build}`].filter(Boolean).join(' · '));
    if (setup && setup.values && setup.values.certFp) line(t('Pinned certificate (sha256)'), setup.values.certFp);
    for (const [k, cmd] of [[t('Allow every app as a RemoteApp (admin PowerShell)'), ALLOWLIST_COMMAND], [t('Use the graphics card in remote sessions (admin PowerShell)'), GPU_COMMAND]]) {
      const box = el('div', 'ra-tech-cmd');
      box.append(el('span', null, k), el('pre', null, cmd), btn('file-tool-btn ra-copy', t('Copy'), () => copyAndSay(cmd)));
      foldBody.append(box);
    }
  };
  const copyAndSay = (cmd) => { copyText(cmd).then(() => showToast(t('Copied — paste it into an administrator PowerShell on {machine}', { machine }))); };
  function drawFacts() {
    factsBox.replaceChildren();
    const a = factsAnswer;
    if (!a) { factsBox.append(el('p', 'ra-note', t('Reading {machine}’s Remote Desktop settings…', { machine }))); return; }
    if (a.code === 'agent_too_old') { factsBox.append(el('p', 'ra-todo-line', a.have ? t('{machine}’s agent ({have}) cannot read these settings; it needs version {need} or later', { machine, have: a.have, need: a.need }) : t('{machine}’s agent cannot read these settings; it needs version {need} or later', { machine, need: a.need }))); return; }
    if (!a.ok) { factsBox.append(el('p', 'ra-todo-line', remoteappCardRefusal(a, machine))); return; }
    for (const row of a.rows || []) {
      const w = factWords(row, machine, a.facts);
      const r = el('div', `ra-fact ${row.met ? 'ra-met' : 'ra-unmet'}${row.optional ? ' ra-optional' : ''}`);
      r.dataset.fact = row.key; r.dataset.met = row.met ? '1' : '0';
      const icon = el('span', 'ra-icon'); icon.innerHTML = row.met ? ICON_OK : ICON_TODO; // static SVG literals only
      const text = el('div', 'ra-fact-text');
      text.append(el('div', 'ra-fact-label', w.label), el('div', 'ra-fact-state', w.state));
      if (w.copy && row.command) text.append(btn('file-tool-btn ra-copy', w.copy, () => copyAndSay(row.command)));
      r.append(icon, text);
      factsBox.append(r);
    }
    const ready = el('p', a.ready ? 'ra-ready' : 'ra-todo-line', a.ready ? t('{machine} is ready for RemoteApp', { machine }) : t('{machine} is not ready for RemoteApp yet', { machine }));
    ready.dataset.ready = a.ready ? '1' : '0';
    factsBox.append(ready);
  }
  function drawSetup() {
    const v = (setup && setup.values) || {};
    const set = (setup && setup.set) || {};
    if (document.activeElement !== fu.i) fu.i.value = v.user || '';
    if (document.activeElement !== fd.i) fd.i.value = v.domain || '';
    fp.i.value = '';
    fp.i.placeholder = set.password ? t('Saved — type to replace') : '';
    const pinned = !!v.certFp;
    if (setup && setup.refused) certLine.textContent = t('{machine} showed a different certificate at the last launch, so the launch was refused. If the machine was reinstalled, trust it again.', { machine });
    else if (pinned) certLine.textContent = t('{machine}’s certificate is pinned; every launch checks it.', { machine });
    else certLine.textContent = t('No certificate is pinned yet. First connection signs in once without opening an app and pins the certificate {machine} shows.', { machine });
    certLine.dataset.state = setup && setup.refused ? 'refused' : pinned ? 'pinned' : 'none';
    trust.textContent = pinned ? t('Trust again') : t('First connection');
    tech();
  }
  async function loadSetup() {
    const r = await fetchJson(`/api/desktop/machine-desktop/remoteapp/setup?host=${host}`);
    if (!body.isConnected) return;
    if (!r || r.error) { showToast(remoteappCardRefusal(r, machine), { type: 'error' }); return; }
    setup = r.setup; drawSetup();
  }
  async function loadFacts() {
    factsAnswer = null; drawFacts();
    const r = await fetchJson(`/api/desktop/machine-desktop/remoteapp/facts?host=${host}`);
    if (!body.isConnected) return;
    factsAnswer = r || { ok: false, code: 'host_unavailable' };
    facts = r && r.ok ? r.facts : null;
    drawFacts(); tech();
  }
  async function doSave() {
    const patch = { user: fu.i.value, domain: fd.i.value };
    if (fp.i.value) patch.password = fp.i.value;
    save.disabled = true;
    const r = await post('/api/desktop/machine-desktop/remoteapp/setup', { host: m.hostId, ...patch });
    save.disabled = false;
    fp.i.value = '';
    if (!r || r.error) { showToast(remoteappCardRefusal(r, machine), { type: 'error' }); return; }
    setup = { ...r.setup, refused: setup && setup.refused }; drawSetup();
    showToast(t('Saved {machine}’s sign-in', { machine }));
  }
  async function doTrust() {
    trust.disabled = true;
    const r = await post('/api/desktop/machine-desktop/remoteapp/trust', { host: m.hostId });
    trust.disabled = false;
    if (!r || r.error) { showToast(remoteappCardRefusal(r, machine), { type: 'error' }); return; }
    setup = r.setup; drawSetup();
    showToast(r.setup && r.setup.changed ? t('Signed in to {machine} and pinned its new certificate', { machine }) : t('Signed in to {machine} and pinned its certificate', { machine }));
  }
  fp.i.onkeydown = (e) => { if (enterSubmits(e)) { e.preventDefault(); doSave(); } }; // the IME guard: a composing Enter is the IME's
  drawFacts(); tech();
  loadSetup(); loadFacts();
  return { close };
}
