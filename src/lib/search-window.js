// SEARCH EVERYTHING (lane global-search, .221): the `search` window — what was
// SAID in any conversation and what any agent MADE, from the server's index
// (GET /api/search; src/server/search-index.js). Results are grouped by
// conversation (≤ 3 hits, "+N more"); a snippet's <mark>s are built from the
// server's offsets with textContent — never HTML of a peer's words. A message
// hit opens its conversation (live: attach; otherwise the read-only history
// view) and lands ON the message through the chat view's own search door
// (ChatSearch.seek → the server's per-conversation search + _jumpToSearchResult
// — no new scroll path); a file hit opens through app.openFile.
import { fetchJson, showToast } from './utils.js';
import { t } from './i18n.js';
import { registerWindowType } from './window-types.js';
import { registerCommand, registerKeybinding, registerMenuItem } from './contributions.js';

const SCOPES = [['all', 'All'], ['chats', 'Conversations'], ['artifacts', 'Files']];
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const fmtTime = (ts) => { const d = new Date(Number(ts) || 0); if (!ts) return ''; const same = new Date().toDateString() === d.toDateString(); return same ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString(); };
const fmtMb = (b) => `${(Number(b || 0) / 1048576).toFixed(1)} MB`;

/** A snippet → a node whose marks come from offsets (textContent only). */
export function snippetNode({ text = '', ranges = [], head, tail } = {}) {
  const s = el('span', 'search-snippet');
  let at = 0;
  if (head) s.append('…');
  for (const [a, b] of ranges) { if (a < at || b > text.length) continue; s.append(text.slice(at, a)); s.append(el('mark', null, text.slice(a, b))); at = b; }
  s.append(text.slice(at));
  if (tail) s.append('…');
  return s;
}

/** The words the index state says (empty state + the System line). */
export function indexStateText(st) {
  const b = st && st.backfill, ix = st && st.index;
  if (st && st.state === 'disabled') return t('Search is off: {why}', { why: st.reason || '' });
  if (b && b.running && b.total) return t('Indexing {done} of {total} conversations…', { done: b.done.toLocaleString(), total: b.total.toLocaleString() });
  // counts only once a backfill has finished (`lastBuild`): a file the live door indexed first is not a built index
  if (ix && ix.lastBuild) return t('{rows} messages and {files} files indexed', { rows: Number(ix.rows || 0).toLocaleString(), files: Number(ix.artifacts || 0).toLocaleString() });
  return t('The index starts a minute after the server');
}
/** Until a backfill has finished, the empty state keeps asking /status (and patches its one line). */
const indexPending = (st) => !st || (st.state !== 'disabled' && (!(st.index && st.index.lastBuild) || !!(st.backfill && st.backfill.running)));

/** The ONE line in the System panel: the index's size + Rebuild. */
export async function paintIndexLine(host) {
  if (!host) return;
  const st = await fetchJson('/api/search/status').catch(() => null);
  if (!host.isConnected || !st || st.error) return;
  host.textContent = '';
  const line = el('div', 'sys-search-line');
  line.append(el('span', null, t('Search index') + ': ' + indexStateText(st) + (st.index ? ' · ' + fmtMb(st.index.bytes) : '')));
  const btn = el('button', 'sys-search-rebuild', t('Rebuild'));
  btn.onclick = async () => { btn.disabled = true; const r = await fetchJson('/api/search/rebuild', { method: 'POST' }).catch((e) => ({ error: e.message })); showToast(r && !r.error ? t('Rebuilding the search index…') : t('Could not rebuild: {why}', { why: (r && r.error) || '' }), { type: r && !r.error ? 'info' : 'error' }); paintIndexLine(host); };
  line.append(btn);
  host.append(line);
}

function sessionFor(app, sid, host) {
  const all = app.sidebar?._allSessions || [];
  return all.find((s) => (s.backendSessionId || s.claudeSessionId || s.sessionId) === sid && (s.host || '') === (host || '')) || null;
}
const labelOf = (app, s, hit) => (s && (app.sidebar?.getCustomName?.(s) || s.name || s.webuiName)) || hit.name || (hit.cwd || '').split('/').pop() || String(hit.sid || hit.sessionId || '').slice(0, 8);

/** Open a message hit's conversation and land on the message. */
export async function openMessageHit(app, hit) {
  const s = sessionFor(app, hit.sid, hit.host);
  const name = labelOf(app, s, hit);
  const backend = (s && s.backend) || hit.backend;
  if (s && s.webuiId) app.attachSession(s.webuiId, s.webuiName || name, s.cwd, { mode: s.webuiMode, backend, backendSessionId: hit.sid });
  else app.viewSession(hit.sid, (s && s.cwd) || hit.cwd || '', name, { backend, backendSessionId: hit.sid, hostId: hit.host || undefined });
  const term = hit.snippet && hit.snippet.ranges && hit.snippet.ranges[0] ? hit.snippet.text.slice(hit.snippet.ranges[0][0], hit.snippet.ranges[0][1]) : '';
  if (!term) return;
  for (let i = 0; i < 50; i++) {
    await new Promise((r) => setTimeout(r, 200));
    const cv = [...(app.sessions?.values?.() || [])].find((v) => v && v._search && typeof v._getSessionIds === 'function' && (v._getSessionIds() || {}).backendSessionId === hit.sid);
    if (cv && cv._messageList && cv._messageList.querySelector('.chat-msg')) { await cv._search.seek(term, { mid: hit.uuid }); return; }
  }
}

export function openSearchWindow(app, opts = {}) {
  for (const [, w] of app.wm.windows) if (w.type === 'search') { app.wm.revealWindow(w.id, { replay: !!opts.syncId }); if (opts.q != null && w._searchSet) w._searchSet(opts.q, opts.scope); return w; }
  let q = String(opts.q || ''), scope = SCOPES.some(([k]) => k === opts.scope) ? opts.scope : 'all';
  const winInfo = app.wm.createWindow({ title: t('Search'), type: 'search', syncId: opts.syncId, openSpec: { action: 'openSearch', q: '', scope }, width: 720, height: 560 });
  const root = el('div', 'search-win');
  const box = el('input', 'search-input'); box.type = 'search'; box.placeholder = t('Search conversations and files…'); box.value = q; box.setAttribute('aria-label', t('Search everything'));
  const chips = el('div', 'search-chips');
  const status = el('div', 'search-status');
  const list = el('div', 'search-list'); list.setAttribute('role', 'listbox');
  root.append(box, chips, status, list);
  winInfo.content.appendChild(root);
  let ac = null, timer = null, poll = null, rows = [], sel = -1;

  const paintChips = () => { chips.textContent = ''; for (const [k, label] of SCOPES) { const c = el('button', 'search-chip' + (k === scope ? ' on' : ''), t(label)); c.onclick = () => { scope = k; paintChips(); run(); }; chips.append(c); } };
  const select = (i) => { sel = Math.max(-1, Math.min(rows.length - 1, i)); rows.forEach((r, j) => r.classList.toggle('active', j === sel)); if (sel >= 0) rows[sel].scrollIntoView({ block: 'nearest' }); };
  const activate = (hit) => { if (hit.kind === 'artifact') app.openFile(hit.path, hit.path.split('/').pop(), { host: hit.host || '' }); else openMessageHit(app, hit).catch(() => { }); };

  async function idleState() {
    clearTimeout(poll);
    const st = await fetchJson('/api/search/status').catch(() => null);
    if (!root.isConnected || box.value.trim()) return;
    const said = indexStateText(st);
    if (status.textContent !== said) status.textContent = said; // patched in place: the line changes only when its words do
    if (indexPending(st)) poll = setTimeout(idleState, 1000);
  }
  const hitKey = (h) => (h.host || '') + '|' + (h.kind === 'artifact' ? 'a|' + h.path : 'm|' + h.sid + '|' + (h.uuid || ''));
  function paint(r) {
    // KEYED: the rows / groups this paint draws again are the SAME nodes (a scope chip filters in place)
    const oldGroups = new Map([...list.children].filter((g) => g._key).map((g) => [g._key, g]));
    const oldRows = new Map([...list.querySelectorAll('.search-hit')].filter((h) => h._key).map((h) => [h._key, h]));
    rows = []; sel = -1;
    const groups = new Map(), drawn = [];
    for (const h of r.hits || []) { const k = (h.host || '') + '|' + (h.kind === 'artifact' ? h.sessionId : h.sid); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(h); }
    status.textContent = r.total ? t('{n} matches · {ms} ms', { n: r.total.toLocaleString(), ms: r.took }) : t('No matches');
    for (const [, hits] of groups) {
      const first = hits[0];
      const s = first.kind === 'message' ? sessionFor(app, first.sid, first.host) : null;
      const gk = (first.host || '') + '|' + (first.kind === 'artifact' ? 'files' : first.sid);
      const g = oldGroups.get(gk) || el('div', 'search-group'); g._key = gk;
      const head = el('div', 'search-group-head');
      if (s && (s.status === 'live' || s.webuiId)) head.append(el('span', 'palette-dot on'));
      const name = el('span', 'search-group-name', first.kind === 'artifact' ? t('Files') : labelOf(app, s, first)); name.title = name.textContent;
      head.append(name);
      const addHit = (h) => {
        const k = hitKey(h);
        const row = oldRows.get(k) || el('div', 'search-hit'); row._key = k; row.setAttribute('role', 'option'); row.classList.remove('active');
        const meta = el('span', 'search-hit-meta', h.kind === 'artifact' ? h.path.split('/').pop() : `${fmtTime(h.ts)} · ${h.role === 'user' ? t('You') : t('Agent')}`);
        if (h.kind === 'artifact') meta.title = h.path;
        row.replaceChildren(meta, snippetNode(h.snippet || {}));
        row.onclick = () => activate(row._hit);
        row._hit = h;
        return row;
      };
      const kids = [head, ...hits.slice(0, 3).map(addHit)];
      if (hits.length > 3) {
        const more = el('button', 'search-more', t('+{n} more', { n: hits.length - 3 }));
        more.onclick = () => { more.replaceWith(...hits.slice(3).map(addHit)); rows = [...list.querySelectorAll('.search-hit')]; };
        kids.push(more);
      }
      g.replaceChildren(...kids);
      drawn.push(g);
    }
    list.replaceChildren(...drawn);
    rows = [...list.querySelectorAll('.search-hit')];
  }
  async function run() {
    const v = box.value.trim();
    winInfo._openSpec && (winInfo._openSpec.scope = scope);
    if (ac) ac.abort();
    if (!v) { list.textContent = ''; rows = []; idleState(); return; }
    ac = new AbortController();
    const my = ac;
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(v)}&scope=${scope}&limit=30`, { signal: my.signal });
      const r = await res.json();
      if (my !== ac || !root.isConnected) return;
      if (!res.ok) { list.textContent = ''; status.textContent = r.error || t('Search failed'); return; }
      paint(r);
    } catch (e) { if (e.name !== 'AbortError') status.textContent = t('Search failed'); }
  }
  box.oninput = () => { clearTimeout(timer); timer = setTimeout(run, 250); };
  box.onkeydown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); select(sel + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); select(sel - 1); }
    else if (e.key === 'Enter') { e.preventDefault(); const r = rows[sel >= 0 ? sel : 0]; if (r) activate(r._hit); }
    else if (e.key === 'Escape') { e.preventDefault(); if (box.value) { box.value = ''; run(); } else { try { app.wm.closeWindow(winInfo.id); } catch { } } }
  };
  winInfo._searchSet = (nq, sc) => { box.value = String(nq || ''); if (sc && SCOPES.some(([k]) => k === sc)) scope = sc; paintChips(); run(); setTimeout(() => box.focus(), 0); };
  winInfo._listenerCtl?.signal.addEventListener('abort', () => { clearTimeout(poll); clearTimeout(timer); ac?.abort(); });
  paintChips(); run();
  setTimeout(() => box.focus(), 0);
  return winInfo;
}

registerWindowType({ type: 'search', label: 'Search', singleton: true, icon: '', action: 'openSearch', replay: (app, spec, { syncId } = {}) => app.openSearch({ ...spec, syncId }) });
registerCommand({ id: 'search.open', title: 'Search everything…', run: (c) => c.app.openSearch({}) });
// ctrl+shift+f: free at .221 (no registration, no chat / editor handler claims it)
registerKeybinding({ key: 'ctrl+shift+f', command: 'search.open' });
registerMenuItem({ menu: 'gear', parent: 'tools', order: 5, label: () => t('Search everything…'), run: (c) => c.app.openSearch({}) });
