// THE CONNECT BLOCK (lane dropline-connect-door, a fleet user's report 2026-10-18: "plugin页面没地方进行登录，integrations
// （一般人发现不了）里也只能setup key") — a registry row's OAuth tier (`connect`, src/integration-registry.js) drawn the
// same way wherever it is offered: the Integrations card (above the key field) and the Voice row's sheet. Everything
// row-specific comes from the declaration — the label, the four owner routes, the words, the `connectWhy` sentences —
// so this file names no vendor and no row. The status answer (`decl.status`) says {account, connectVia, connectWhy}:
// connected by OAuth ⇒ who + Disconnect; a key saved ⇒ nothing (the key outranks; its field says so); else the Connect
// button — never dead: without a way to sign in here it says why, in the sentence the SERVER picked (connectWhy).
import { fetchJson, showToast, familyHeldWords } from './utils.js';   // r3334: a held code worded from the family's ONE table
import { t } from './i18n.js';
import { needDoorButton, settingsDoor } from './need-line.js'; // lane ui-needs-a-button (plugins-integrations-13): a why with its door

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const call = (url, body) => fetchJson(url, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  .then((x) => { if (!x) throw new Error(t('Server unreachable — nothing was changed')); if (x.error) throw Object.assign(new Error(x.message || x.error), { code: x.error }); return x; });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** `box` gets the row (+ its words line); `st` = the answer of `decl.status`; `rerender()` after a sign-in / Disconnect.
 *  Returns what was drawn: 'connected' | 'key' | 'vault-locked' | 'connect'. */
// lane ui-needs-a-button (plugins-integrations-13): a server-picked why that a person here can cure carries ITS door on the line
// (`self-hosted` = this instance has no https address and its owner is the person: the https row); the others have none
// reader follow-up #14: on the DEFAULT 'auto' the https row has nothing to turn on — what is missing is on Tailscale's side (the
// tailnet's HTTPS certificates); the line says so, and the door stays the row's (for «My own certificate files»)
const httpsAuto = (app) => { try { return !!(app && app.settings && app.settings.get('server.https') === 'auto'); } catch { return false; } };
const WHY_DOORS = Object.freeze({ 'self-hosted': (app) => ({ also: httpsAuto(app) ? t('This instance already asks Tailscale for a certificate — turn on HTTPS Certificates for your tailnet in the Tailscale admin console.') : '',
  door: settingsDoor(app, 'server.https', { label: httpsAuto(app) ? t('Use my own certificate files…') : t('Turn on HTTPS…'), kind: 'secondary' }) }) });
export function renderConnectRow(box, decl, st, rerender, { app = null } = {}) {
  const a = (st && st.account) || {};
  const W = decl.words || {};
  // B-1e9a cure: the person's row hides the cluster's settings (an earlier Connect saved its own client id there) — said, with
  // the door that heals it: the store's «use the cluster's settings» (PUT /api/integrations/<row> {use:'cluster'}), or — the
  // cluster offering several with none the default (cure 3: `presetChoices`) — its picker (PUT {clusterKey})
  if (st && st.presetShadowed && W.shadowed) {
    const sh = el('div', 'plugin-cfg-row oauth-connect-shadow');
    const sw = el('div', 'plugin-detail plugin-cfg-warn oauth-connect-shadow-words', t(W.shadowed));
    // cure 3: the store's refusal is never shown raw — the card's own sentence, then a redraw (the status draws the picker when
    // the cluster's settings are several with none the default: `presetChoices`, the store's own pick)
    const put = async (body, ctl) => {
      ctl.disabled = true;
      const r = await fetchJson(`/api/integrations/${encodeURIComponent(st.presetShadowed)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!r) { showToast(t('Server unreachable — nothing was changed'), { type: 'error' }); if (ctl.tagName === 'SELECT') ctl.value = ''; ctl.disabled = false; return; }   // fetchJson answers null when the hub is unreachable; the picker back on its head (the same choice again is a change)
      if (r.error) showToast(body.clusterKey ? t('Could not update') : t('Could not switch to the cluster default'), { type: 'error' });
      rerender();
    };
    const choices = Array.isArray(st.presetChoices) && st.presetChoices.length > 1 ? st.presetChoices : null;
    let ctl;
    if (choices) {
      ctl = el('select', 'plugin-cfg-select oauth-use-cluster-pick');
      const head = el('option', null, t('Use the cluster\'s settings')); head.value = ''; head.disabled = true; head.selected = true; ctl.appendChild(head);
      for (const o of choices) { const op = el('option', null, t('Cluster preset · {label}', { label: o.label })); op.value = o.key; ctl.appendChild(op); }
      ctl.onchange = () => { if (ctl.value) put({ clusterKey: ctl.value }, ctl); };
    } else {
      ctl = el('button', 'mounts-btn oauth-use-cluster', t('Use the cluster\'s settings'));
      ctl.onclick = () => put({ use: 'cluster' }, ctl);
    }
    sh.append(sw, ctl);
    box.appendChild(sh);
  }
  const row = el('div', 'plugin-cfg-row oauth-connect');
  const words = el('div', 'plugin-detail oauth-connect-words');
  if (a.tier === 'oauth' && a.state === 'connected') {
    words.classList.add('oauth-connect-ok');
    words.textContent = t('Connected: {account}', { account: `${a.name || ''}${a.team ? ' · ' + a.team : ''}` });
    const off = el('button', 'mounts-btn oauth-disconnect', t('Disconnect'));
    off.onclick = async () => {
      off.disabled = true;
      try { await call(decl.disconnect, {}); showToast(t(W.disconnected)); rerender(); } catch (e) { showToast(e.code === 'vault-locked' ? t('The vault is locked — unlock it first (Unlock… at the top of the page; For you names what is waiting on it)') : e.message, { type: 'error' }); off.disabled = false; }
    };
    row.append(words, off);
    box.appendChild(row);
    return 'connected';
  }
  if (a.tier === 'key') return 'key';
  // lane vault-e2e-password-fix-r2: the sign-in is SEALED and the vault is LOCKED — the vault's door, never "connect" (a new
  // sign-in could not even be stored while locked)
  if (a.state === 'vault-locked') {
    words.classList.add('plugin-cfg-warn'); words.textContent = t('The vault is locked — unlock it first (Unlock… at the top of the page; For you names what is waiting on it)');
    const open = el('button', 'mounts-btn mounts-btn-primary oauth-unlock', t('Unlock'));
    open.onclick = () => window.dispatchEvent(new CustomEvent('vs-vault-door'));
    row.append(words, open);
    box.appendChild(row);
    return 'vault-locked';
  }
  // r3334 unit 2: the sign-in's file could not be read and is HELD — said, with no Connect (a Connect would be refused: nothing is
  // written over it); it is read again by itself
  if (a.state === 'unread' && W.unread) {
    words.classList.add('plugin-cfg-warn'); words.textContent = t(W.unread);
    box.appendChild(words);
    return 'unread';
  }
  const go = el('button', 'mounts-btn mounts-btn-primary oauth-connect-btn', t(decl.label));
  if (a.state === 'reconnect') { words.classList.add('plugin-cfg-warn'); words.textContent = t(W.expired); }
  if (a.state === 'damaged' && W.damaged) { words.classList.add('plugin-cfg-warn'); words.textContent = t(W.damaged, { copy: a.copy || '' }); }   // r3334: torn bytes kept aside — Connect is the way out
  const whys = decl.whys || {};
  const why = () => t(whys[st && st.connectWhy] || Object.values(whys)[0] || '');
  const sayWhy = () => {
    words.textContent = why();
    const k = st && whys[st.connectWhy] ? st.connectWhy : Object.keys(whys)[0];
    const d = WHY_DOORS[k] ? WHY_DOORS[k](app) : null;
    if (d && d.also) words.append(' ', d.also);
    if (d && d.door) words.append(' ', needDoorButton(d.door));
  };
  if (!(st && st.connectVia)) { words.classList.add('plugin-cfg-warn'); sayWhy(); }
  go.onclick = async () => {
    const tab = window.open('about:blank', '_blank');  // opened in the press itself (a later open is a blocked pop-up)
    go.disabled = true;
    try {
      const r = await call(decl.start, { origin: location.origin });
      if (tab) tab.location.href = r.url; else window.open(r.url, '_blank');
      words.className = 'plugin-detail oauth-connect-words'; words.textContent = t(W.finish);
      for (let i = 0; i < 400; i++) {
        await sleep(1500);
        const f = await call(`${decl.flow}${encodeURIComponent(r.flowId)}`);
        if (f.done) { if (!f.ok) throw new Error(f.error || t('Failed')); showToast(t(W.done)); break; }
      }
      rerender();
    } catch (e) {
      try { if (tab) tab.close(); } catch { }
      words.className = 'plugin-detail plugin-cfg-warn oauth-connect-words';
      if (e.code === 'needs-https' || e.code === 'preset-no-relay') sayWhy();   // B-1e9a cure: the relay-less fleet client is a why of its own
      else if (e.code === 'vault-locked') words.textContent = t('The vault is locked — unlock it first (Unlock… at the top of the page; For you names what is waiting on it)');
      else words.textContent = familyHeldWords(e.code) || e.message;   // r3334: a held code in the page's own words
      go.disabled = false;
    }
  };
  row.append(go);
  box.append(row, words);
  return 'connect';
}
