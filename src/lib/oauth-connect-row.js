// THE CONNECT BLOCK (lane dropline-connect-door, a fleet user's report 2026-10-18: "plugin页面没地方进行登录，integrations
// （一般人发现不了）里也只能setup key") — a registry row's OAuth tier (`connect`, src/integration-registry.js) drawn the
// same way wherever it is offered: the Integrations card (above the key field) and the Voice row's sheet. Everything
// row-specific comes from the declaration — the label, the four owner routes, the words, the `connectWhy` sentences —
// so this file names no vendor and no row. The status answer (`decl.status`) says {account, connectVia, connectWhy}:
// connected by OAuth ⇒ who + Disconnect; a key saved ⇒ nothing (the key outranks; its field says so); else the Connect
// button — never dead: without a way to sign in here it says why, in the sentence the SERVER picked (connectWhy).
import { fetchJson, showToast } from './utils.js';
import { t } from './i18n.js';

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const call = (url, body) => fetchJson(url, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  .then((x) => { if (!x) throw new Error(t('Server unreachable — nothing was changed')); if (x.error) throw Object.assign(new Error(x.message || x.error), { code: x.error }); return x; });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** `box` gets the row (+ its words line); `st` = the answer of `decl.status`; `rerender()` after a sign-in / Disconnect.
 *  Returns what was drawn: 'connected' | 'key' | 'connect'. */
export function renderConnectRow(box, decl, st, rerender) {
  const a = (st && st.account) || {};
  const W = decl.words || {};
  const row = el('div', 'plugin-cfg-row oauth-connect');
  const words = el('div', 'plugin-detail oauth-connect-words');
  if (a.tier === 'oauth' && a.state === 'connected') {
    words.classList.add('oauth-connect-ok');
    words.textContent = t('Connected: {account}', { account: `${a.name || ''}${a.team ? ' · ' + a.team : ''}` });
    const off = el('button', 'mounts-btn oauth-disconnect', t('Disconnect'));
    off.onclick = async () => {
      off.disabled = true;
      try { await call(decl.disconnect, {}); showToast(t(W.disconnected)); rerender(); } catch (e) { showToast(e.message, { type: 'error' }); off.disabled = false; }
    };
    row.append(words, off);
    box.appendChild(row);
    return 'connected';
  }
  if (a.tier === 'key') return 'key';
  const go = el('button', 'mounts-btn mounts-btn-primary oauth-connect-btn', t(decl.label));
  if (a.state === 'reconnect') { words.classList.add('plugin-cfg-warn'); words.textContent = t(W.expired); }
  const whys = decl.whys || {};
  const why = () => t(whys[st && st.connectWhy] || Object.values(whys)[0] || '');
  if (!(st && st.connectVia)) { words.classList.add('plugin-cfg-warn'); words.textContent = why(); }
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
      words.textContent = e.code === 'needs-https' ? why() : e.message;
      go.disabled = false;
    }
  };
  row.append(go);
  box.append(row, words);
  return 'connect';
}
