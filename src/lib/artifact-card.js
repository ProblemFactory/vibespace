// THE DELIVERABLE CARD + THE ARTIFACTS LIST — the DOM half (lane artifacts-model; the rows are src/artifacts.js, the
// server's registry src/server/artifact-registry.js). The server sends the BLOCK (cardBlock: the row's facts, never
// markup); the words are t() over the PURE `cardFacts`; every string lands through textContent (a path is the agent's).
// ONE element per deliverable, PATCHED IN PLACE (the live-card rule: a card re-created per update blinks): a later
// write / edit rewrites its keyed children's text. One click = open the file in its kind's viewer BESIDE the chat
// (`from`: the same door a Cmd+click on a path takes — no Cmd needed).
import { t, resolveLang } from './i18n.js';
import { getFileIcon } from './file-types.js';
import { agoText } from './user-todos-row.js';
import { cardFacts, kindWord } from '../artifacts.js';

const lang = () => { try { const l = resolveLang(); return l === 'zh' || l === 'ja' ? l : 'en'; } catch { return 'en'; } }; // the house language (i18n.js) — <html lang> is never set (the real-Opus zh run read "Document")
const div = (cls) => { const n = document.createElement('div'); n.className = cls; return n; };
const span = (cls) => { const n = document.createElement('span'); n.className = cls; return n; };

/** "Edited 3 times · 2min ago · last by you" (the card's meta line and the list row's words). */
export function artifactMetaText(b) {
  const f = cardFacts(b);
  const parts = [f.changes ? t('Changed {n} times', { n: f.changes }) : t('Written by the agent')];
  if (f.lastAt) parts.push(agoText(f.lastAt, t));
  if (f.byUser) parts.push(t('last by you'));
  return parts.join(' · ');
}

export function renderArtifactCard(msg, { open = null } = {}) {
  const el0 = div('chat-msg chat-msg-system chat-vs-notice chat-artifact-card');
  el0.tabIndex = 0;
  el0.setAttribute('role', 'button');
  const head = div('chat-vs-notice-head');
  const ic = span('chat-artifact-ic'); ic.setAttribute('aria-hidden', 'true');
  head.append(ic, span('chat-vs-notice-title chat-artifact-name'), span('chat-artifact-kind chat-status-dim'));
  el0.append(head, div('chat-artifact-path chat-status-dim'), div('chat-artifact-meta chat-status-dim'));
  const go = (e) => { e.preventDefault(); e.stopPropagation(); const b = el0._rawMsg && el0._rawMsg.content && el0._rawMsg.content[0]; if (b && open) open(b); };
  el0.addEventListener('click', go);
  el0.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') go(e); });
  patchArtifactCard(el0, msg);
  return el0;
}

/** THE PATCH (every later write / edit): the same element, its keyed children's text. */
export function patchArtifactCard(el0, msg) {
  const b = msg && msg.content && msg.content[0];
  if (!el0 || !b) return;
  el0._rawMsg = msg;
  el0.dataset.key = String(b.key || '');
  el0.dataset.kind = String(b.kind || 'other');
  const set = (sel, v) => { const n = el0.querySelector(sel); if (n && n.textContent !== v) n.textContent = v; };
  const ic = el0.querySelector('.chat-artifact-ic');
  if (ic && ic.dataset.name !== b.name) { ic.innerHTML = getFileIcon(b.name || '') || ''; ic.dataset.name = b.name || ''; } // the icon table's own SVG (trusted), keyed by name
  set('.chat-artifact-name', b.name || '');
  set('.chat-artifact-kind', kindWord(b.kind, lang()));
  set('.chat-artifact-path', b.path ? '\u200e' + b.path : ''); // LRM: the row is direction:rtl (front-truncate) — without it the path's leading "/" is drawn at its END (the real-Opus e2e shot)
  set('.chat-artifact-meta', artifactMetaText(b));
  el0.title = t('Open {name} beside the chat', { name: b.name || '' });
}

/** The Artifacts chip's popover: deliverables by kind (the server's view order), code folded behind "Code (n)". */
export function renderArtifactList(box, v, { onOpen = null, close = null } = {}) {
  const row = (b) => {
    const it = div('chat-status-dropdown-item chat-artifact-row');
    it.dataset.key = b.key;
    it.dataset.kind = b.kind;
    const ic = span('chat-artifact-ic'); ic.innerHTML = getFileIcon(b.name || '') || '';
    const name = span('chat-artifact-name'); name.textContent = b.name || '';
    const words = div('chat-status-dim chat-artifact-meta'); words.textContent = `${kindWord(b.kind, lang())} · ${artifactMetaText(b)}`;
    const top = div('chat-artifact-row-top'); top.append(ic, name);
    it.append(top, words);
    it.title = b.path || '';
    it.onclick = (ev) => { ev.stopPropagation(); if (close) close(); if (onOpen) onOpen(b); };
    return it;
  };
  const items = Array.isArray(v && v.items) ? v.items : [];
  const code = Array.isArray(v && v.code) ? v.code : [];
  if (!items.length) { const n = div('chat-status-dropdown-note'); n.textContent = t('No documents yet — only code.'); box.appendChild(n); }
  for (const b of items) box.appendChild(row(b));
  if (code.length) {
    const d = document.createElement('details'); d.className = 'chat-artifact-code';
    const s = document.createElement('summary'); s.textContent = t('Code ({n})', { n: code.length });
    d.appendChild(s);
    for (const b of code) d.appendChild(row(b));
    box.appendChild(d);
  }
  if (v && v.full) { const n = div('chat-status-dropdown-note'); n.textContent = t('The list keeps the newest {n} files.', { n: 500 }); box.appendChild(n); }
}
