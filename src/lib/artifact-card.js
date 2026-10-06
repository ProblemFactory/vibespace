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
import { UI_ICONS } from './icons.js';
import { absUrl, showContextMenu, copyText } from './utils.js';
import { replayOpenSpec } from './window-types.js'; // lane artifacts-services-url: "Show in Ports" = the Ports window's own open action

const lang = () => { try { const l = resolveLang(); return l === 'zh' || l === 'ja' ? l : 'en'; } catch { return 'en'; } }; // the house language (i18n.js) — <html lang> is never set (the real-Opus zh run read "Document")
const div = (cls) => { const n = document.createElement('div'); n.className = cls; return n; };
const span = (cls) => { const n = document.createElement('span'); n.className = cls; return n; };

/** "Edited 3 times · 2min ago · last by you" (the card's meta line and the list row's words). */
/** lane artifacts-services-url: a service row's link = the ROW's url (the server's ladder, src/artifacts.js serviceLink:
 *  the port's published forward, else this instance's /proxy/) — the client never builds a host:port; a relative proxy
 *  url resolves through absUrl (the instance URL when one is mapped), never location.origin. */
export const serviceHref = (b) => absUrl((b && b.url) || '');
/** The Web view's open: a proxied row opens its TARGET in proxy mode (the Web view loads /proxy/<target>), else its url. */
export const serviceOpenSpec = (b) => (b && b.via === 'proxy' && b.target ? { url: b.target, proxy: true } : { url: serviceHref(b), proxy: false });
/** The small word beside the url: how the link reaches the service. */
export const serviceViaText = (b) => (b && b.via === 'published' ? t('Published') : b && b.via === 'proxy' ? t('Through this VibeSpace') : t('Only on its machine'));
/** ⋯ "Show in Ports": the Ports window (its forward row — data-forward-id — scrolled to and flashed once it renders; a
 *  port not yet forwarded is in its scan list, where the existing Forward / Publish acts are). */
export function showInPorts(app, forwardId) {
  if (!app) return;
  replayOpenSpec(app, { action: 'openPorts' });
  let tries = 0;
  const find = () => {
    const r = forwardId && document.querySelector(`.rail-panel-ports .ports-row[data-forward-id="${CSS.escape(String(forwardId))}"]`);
    if (r) { r.scrollIntoView({ block: 'nearest' }); r.classList.add('ports-row-flash'); setTimeout(() => r.classList.remove('ports-row-flash'), 1600); }
    else if (forwardId && ++tries < 30) setTimeout(find, 100); // the panel paints after its /api/port-forwards read
  };
  find();
}
const stamp = (ts) => { try { return new Date(ts).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch { return ''; } };
export function artifactMetaText(b) {
  const f = cardFacts(b);
  if (f.kind === 'service') return f.state === 'stopped' ? t('Stopped at {time}', { time: stamp(f.stoppedAt) }) : `${t('Running')} · ${t('since {ago}', { ago: agoText(f.since || f.lastAt, t) })}`;
  const upload = f.kind === 'upload' && f.byUser && !f.changes; // lane artifacts-registries: the registries' rows say their store's fact
  const parts = [f.state === 'unpublished' ? t('Unpublished') : f.state === 'published' ? t('Published') : upload ? t('Attached by you') : f.changes ? t('Changed {n} times', { n: f.changes }) : t('Written by the agent')];
  if (f.lastAt) parts.push(agoText(f.lastAt, t));
  if (f.byUser && !upload) parts.push(t('last by you'));
  // lane artifacts-handover: WHO made it for this conversation, and whom the helper handed it to
  if (f.via && f.via.kind === 'handover') parts.unshift(t('Handed over by {name}', { name: f.via.from.name || f.via.from.cid }));
  else if (f.via && f.via.kind === 'subagent') parts.push(t('By subagent {name}', { name: f.via.name }));
  if (f.handedTo.length) parts.push(t('Handed to {names}', { names: f.handedTo.join(', ') }));
  return parts.join(' · ');
}

/** ⋯ on a service: copy the link / open it in a new tab / show it in Ports / copy the machine-local address / show its job. */
function serviceMenu(e, b, { showJob = null, showPorts = null } = {}) {
  e.preventDefault(); e.stopPropagation();
  const r = e.currentTarget.getBoundingClientRect();
  showContextMenu(r.left, r.bottom, [
    { label: t('Copy URL'), action: () => copyText(serviceHref(b)) },
    { label: t('Open in a new tab'), action: () => window.open(serviceHref(b), '_blank', 'noopener') },
    { label: t('Show in Ports'), action: () => showPorts && showPorts(b.forwardId || null) },
    { label: t('Copy the machine-local address'), action: () => copyText(b.localUrl || '') },
    { label: t('Show the job'), action: () => showJob && showJob(b.jobId) },
  ]);
}
export function renderArtifactCard(msg, { open = null, showJob = null, showPorts = null } = {}) {
  const el0 = div('chat-msg chat-msg-system chat-vs-notice chat-artifact-card');
  el0.tabIndex = 0;
  el0.setAttribute('role', 'button');
  const head = div('chat-vs-notice-head');
  const ic = span('chat-artifact-ic'); ic.setAttribute('aria-hidden', 'true');
  head.append(ic, span('chat-vs-notice-title chat-artifact-name'), span('chat-artifact-kind chat-status-dim'));
  const service = (msg && msg.content && msg.content[0] && msg.content[0].kind) === 'service';
  const where = div(service ? 'chat-artifact-path chat-artifact-url chat-status-dim' : 'chat-artifact-path chat-status-dim'); // a URL is not a path: LTR, END-truncated (chat.css)
  if (service) where.append(span('chat-artifact-href'), span('chat-artifact-via'));
  el0.append(head, where, div('chat-artifact-meta chat-status-dim'));
  if (service) {
    const more = document.createElement('button'); more.type = 'button'; more.className = 'chat-artifact-more'; more.textContent = '⋯'; more.title = t('More');
    more.addEventListener('click', (e) => serviceMenu(e, el0._rawMsg.content[0], { showJob, showPorts }));
    more.addEventListener('keydown', (e) => e.stopPropagation());
    head.appendChild(more);
  }
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
  if (b.kind === 'service') el0.dataset.state = b.state || 'running'; // stopped ⇒ greyed (chat.css)
  const set = (sel, v) => { const n = el0.querySelector(sel); if (n && n.textContent !== v) n.textContent = v; };
  const ic = el0.querySelector('.chat-artifact-ic');
  if (ic && ic.dataset.name !== b.name) { ic.innerHTML = (b.kind === 'service' ? UI_ICONS.globe : getFileIcon(b.name || '')) || ''; ic.dataset.name = b.name || ''; } // the icon table's own SVG (trusted), keyed by name
  set('.chat-artifact-name', b.name || '');
  set('.chat-artifact-kind', kindWord(b.kind, lang()));
  if (b.kind === 'service') { set('.chat-artifact-href', serviceHref(b)); set('.chat-artifact-via', serviceViaText(b)); } // lane artifacts-services-url: the url as it reads, LTR (the .223 rtl box painted its trailing "/" first: "/http://…")
  else set('.chat-artifact-path', b.path ? '\u200e' + b.path : ''); // LRM: the row is direction:rtl (front-truncate) — without it the path's leading "/" is drawn at its END (the real-Opus e2e shot)
  set('.chat-artifact-meta', artifactMetaText(b));
  el0.title = b.kind === 'service' ? `${t('Open {url} in the Web view', { url: serviceHref(b) })} · ${serviceViaText(b)}${b.publishedBy ? ' · ' + b.publishedBy : ''}` : t('Open {name} beside the chat', { name: b.name || '' });
}

/** The Artifacts chip's popover: deliverables by kind (the server's view order), code folded behind "Code (n)". */
export function renderArtifactList(box, v, { onOpen = null, close = null } = {}) {
  const row = (b) => {
    const it = div('chat-status-dropdown-item chat-artifact-row');
    it.dataset.key = b.key;
    it.dataset.kind = b.kind;
    if (b.kind === 'service') it.dataset.state = b.state || 'running';
    const ic = span('chat-artifact-ic'); ic.innerHTML = (b.kind === 'service' ? UI_ICONS.globe : getFileIcon(b.name || '')) || '';
    const name = span('chat-artifact-name'); name.textContent = b.name || '';
    const words = div('chat-status-dim chat-artifact-meta'); words.textContent = `${kindWord(b.kind, lang())} · ${artifactMetaText(b)}`;
    const top = div('chat-artifact-row-top'); top.append(ic, name);
    it.append(top, words);
    it.title = b.kind === 'service' ? serviceHref(b) : b.path || '';
    it.onclick = (ev) => { ev.stopPropagation(); if (close) close(); if (onOpen) onOpen(b); };
    return it;
  };
  const items = Array.isArray(v && v.items) ? v.items : [];
  const code = Array.isArray(v && v.code) ? v.code : [];
  if (!items.length) { const n = div('chat-status-dropdown-note'); n.textContent = t('No documents yet — only code.'); box.appendChild(n); }
  for (const b of items) {
    if (b.kind === 'service' && !box.querySelector('.chat-artifact-head')) { const h = div('chat-artifact-head chat-status-dim'); h.textContent = t('Services'); box.appendChild(h); } // lane artifacts-services: its own head, after the docs
    box.appendChild(row(b));
  }
  if (code.length) {
    const d = document.createElement('details'); d.className = 'chat-artifact-code';
    const s = document.createElement('summary'); s.textContent = t('Code ({n})', { n: code.length });
    d.appendChild(s);
    for (const b of code) d.appendChild(row(b));
    box.appendChild(d);
  }
  if (v && v.full) { const n = div('chat-status-dropdown-note'); n.textContent = t('The list keeps the newest {n} files.', { n: 500 }); box.appendChild(n); }
}
