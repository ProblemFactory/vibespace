// THE CARD AN AGENT'S WINDOW LEAVES (lane agent-window-no-pop, owner incident inc-mvhebl4n-rkvr, 2026-10-21 「design还是被强行
// 弹出了」): an agent's window opens beside its chat only where the person already looks (PURE agentWindowPlacement,
// src/lib/desktop-app-placement.js); everywhere else the verdict answers `card` — NOTHING opens, and this card above the
// chat's composer says what the agent wanted to show (a Design: its title) with Open, the person's press that opens +
// focuses it (the human origin; the agent's push never does). The chat's taskbar entry carries the badge (window.js
// markArrived). This module draws and decides nothing: ChatInput holds ONE list per composer, keyed (host|dir) — a second
// push of the same design re-pulses its card, never a second one; Open runs the caller's door and removes the card; ✕
// removes it. Every string lands through textContent (a title is the agent's words); the icons are the library's own SVG.
import { t } from './i18n.js';
import { UI_ICONS } from './icons.js';

const node = (tag, cls) => { const n = document.createElement(tag); n.className = cls; return n; };

export function createAgentCards() {
  const el = node('div', 'chat-agent-cards');
  el.hidden = true;
  el.setAttribute('role', 'status');
  const cards = new Map(); // key → { card, title }
  const sync = () => { el.hidden = cards.size === 0; };
  function drop(key) {
    const c = cards.get(key); if (!c) return;
    cards.delete(key); c.card.remove(); sync();
  }
  /** `{ key, title, open }` — one card per key; a repeat re-titles it and pulses it again. */
  function show({ key, title = '', open = null } = {}) {
    if (!key) return null;
    let c = cards.get(key);
    if (!c) {
      const card = node('div', 'chat-agent-card');
      card.dataset.key = key;
      const ic = node('span', 'chat-agent-card-ic'); ic.setAttribute('aria-hidden', 'true'); ic.innerHTML = UI_ICONS.design; // the library's own static SVG
      const text = node('span', 'chat-agent-card-text');
      const name = node('span', 'chat-agent-card-title');
      const why = node('span', 'chat-agent-card-why'); why.textContent = t('The agent wants to show you this design');
      text.append(name, why);
      const go = node('button', 'chat-agent-card-open'); go.type = 'button'; go.textContent = t('Open'); go.title = t('Open the Design window');
      const x = node('button', 'chat-agent-card-x'); x.type = 'button'; x.innerHTML = UI_ICONS.close; x.title = t('Dismiss'); x.setAttribute('aria-label', t('Dismiss'));
      card.append(ic, text, go, x);
      c = { card, title: null, open: null };
      go.addEventListener('click', (e) => { e.stopPropagation(); const run = c.open; drop(key); if (run) run(); });
      x.addEventListener('click', (e) => { e.stopPropagation(); drop(key); });
      cards.set(key, c);
      el.appendChild(card);
    }
    c.open = typeof open === 'function' ? open : null;
    if (c.title !== title) { c.title = title; c.card.querySelector('.chat-agent-card-title').textContent = title; }
    c.card.classList.remove('arrived'); void c.card.offsetWidth; c.card.classList.add('arrived'); // the pulse restarts on a repeat
    sync();
    return c.card;
  }
  return { el, show, drop, keys: () => [...cards.keys()] };
}
