// Ctrl+K session palette — fuzzy switcher over every known session.
// Live sessions rank first; Enter focuses (live) or resumes (stopped);
// typing an absolute/~ path offers "new session here". Works everywhere
// except inside terminals (.xterm owns its keys).
import { escHtml } from './utils.js';

function score(q, hay) {
  hay = hay.toLowerCase();
  const i = hay.indexOf(q);
  if (i >= 0) return 100 - i; // substring: earlier = better
  // subsequence fallback
  let qi = 0;
  for (let ci = 0; ci < hay.length && qi < q.length; ci++) if (hay[ci] === q[qi]) qi++;
  return qi === q.length ? 10 : -1;
}

export function installSessionPalette(app) {
  let overlay = null;

  const close = () => { overlay?.remove(); overlay = null; };

  const activate = (s) => {
    close();
    const name = app.sidebar.getCustomName(s) || s.name || s.webuiName || '';
    if (s.webuiId) {
      app.attachSession(s.webuiId, s.webuiName || name, s.cwd, { mode: s.webuiMode, backend: s.backend || 'claude', backendSessionId: s.backendSessionId || s.sessionId });
    } else if (s.status === 'stopped') {
      app.resumeSession(s.sessionId, s.cwd, name, { backend: s.backend || 'claude', backendSessionId: s.backendSessionId || s.sessionId });
    }
  };

  const open = () => {
    if (overlay) { close(); return; }
    overlay = document.createElement('div');
    overlay.className = 'palette-overlay';
    overlay.innerHTML = `<div class="palette">
      <input class="palette-input" placeholder="Jump to a session… (type a /path for a new one)" autocomplete="off">
      <div class="palette-list"></div>
    </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(); });
    const input = overlay.querySelector('.palette-input');
    const listEl = overlay.querySelector('.palette-list');
    let items = [];
    let sel = 0;

    const render = () => {
      listEl.innerHTML = '';
      items.forEach((it, i) => {
        const row = document.createElement('div');
        row.className = 'palette-item' + (i === sel ? ' active' : '');
        if (it.newSession) {
          row.innerHTML = `<span class="palette-name">New session in <b>${escHtml(it.cwd)}</b></span>`;
        } else {
          const s = it.s;
          const live = s.status === 'live' || s.status === 'tmux' || s.status === 'external';
          row.innerHTML = `
            <span class="palette-dot ${live ? 'on' : ''}"></span>
            <span class="palette-name">${escHtml(it.label)}</span>
            ${s.hostName ? `<span class="session-host-badge">${escHtml(s.hostName)}</span>` : ''}
            <span class="palette-path">${escHtml(s.cwd || '')}</span>`;
        }
        row.onclick = () => it.newSession ? (close(), app.showNewSessionDialog({ cwd: it.cwd })) : activate(it.s);
        row.onmousemove = () => { if (sel !== i) { sel = i; render(); } };
        listEl.appendChild(row);
      });
    };

    const refresh = () => {
      const q = input.value.trim().toLowerCase();
      const all = app.sidebar?._allSessions || [];
      if (q.startsWith('/') || q.startsWith('~')) {
        items = [{ newSession: true, cwd: input.value.trim() }];
        sel = 0; render(); return;
      }
      const scored = [];
      for (const s of all) {
        const label = app.sidebar.getCustomName(s) || s.name || s.webuiName || (s.cwd || '').split('/').pop() || s.sessionId?.slice(0, 8) || '';
        const hay = `${label} ${s.cwd || ''} ${s.hostName || ''} ${s.backend || ''}`;
        const sc = q ? score(q, hay) : 1;
        if (sc < 0) continue;
        const live = s.status === 'live' || s.status === 'tmux' || s.status === 'external';
        scored.push({ s, label, sc: sc + (live ? 1000 : 0) + (s.startedAt || 0) / 1e13 });
      }
      scored.sort((a, b) => b.sc - a.sc);
      items = scored.slice(0, 12);
      sel = 0; render();
    };

    input.oninput = refresh;
    input.onkeydown = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); close(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(sel + 1, items.length - 1); render(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(sel - 1, 0); render(); }
      else if (e.key === 'Enter') {
        e.preventDefault();
        const it = items[sel];
        if (!it) return;
        if (it.newSession) { close(); app.showNewSessionDialog({ cwd: it.cwd }); }
        else activate(it.s);
      }
    };
    refresh();
    setTimeout(() => input.focus(), 0);
  };

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k' && !e.target.closest?.('.xterm')) {
      e.preventDefault();
      open();
    }
  }, true);
}
