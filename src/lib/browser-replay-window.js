// THE BROWSER REPLAY WINDOW (2026-09-27, the owner: "最关键是能在聊天界面和浏览器查看界面两个地方都能看到 session 的开始和
// 结束，以及每个浏览器 session 的回放"). Window type `browser-replay`, openSpec `{action:'openBrowserReplay', browserKey?,
// conversation?, profileId?, session?, at?}` — one window per conversation (or per profile, from the Agent browser
// panel); opening it again focuses it and selects the session asked for.
//
// What it draws (every rule is src/browser-sessions.js's — PURE; every word is ./browser-session-words.js's):
//   · LEFT — the SESSIONS of this conversation, newest first (when · how long · how many actions), and under the chosen
//     one its ACTIONS (time · verb · target or URL · the after-frame's thumbnail);
//   · RIGHT — the chosen action's after-frame at full width with the click point / element box DRAWN on it (the same
//     `drawOverlay` the entry dialog uses), a Before / After toggle, the action in words + its page + its time;
//     ← / → the previous / next action, Space plays (one action a second, stopping at the last), Home / End;
//   · THE EMPTY STATES by name: no sessions for this conversation; the action trace is off; a session whose frames the
//     size limit removed (its action list stays); a session in which the agent did nothing.
//   · the PHONE (or a pane narrower than 620 px): the list above, the picture below, every target ≥ 44 px.
// Data: `GET /api/browser/sessions?…&session=bs-…` (cookie only) — the list + the chosen session's actions; frames
// through `img.src` from `/api/browser/actions/:id/frame/:which` (never markup). A session start / end or a new action
// of this conversation re-reads the list (debounced); rows are keyed by id and patched in place.
import { t, tc } from './i18n.js';
import { fetchJson, showToast } from './utils.js';
import { registerWindowType } from './window-types.js';
import { UI_ICONS } from './icons.js';
import { btn } from './channel-chrome.js';
import { drawOverlay, positionKindText, statusText } from './browser-trace-view.js';
import { frameUrl, timelineLabel, positionText } from '../browser-trace.js';
import { replayEmpty, frameState, replayKey, playTick, pickSession, pickIndex, PLAY_STEP_MS, isSessionId } from '../browser-sessions.js';
import { whenText, sessionRowText, emptyText, replayTitle, retentionText, actionsText, durationText } from './browser-session-words.js';

const TYPE = 'browser-replay';
const NARROW_PX = 620;
const RELOAD_DEBOUNCE_MS = 700;
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const clock = (at) => { const d = new Date(Number(at) || 0); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`; };

/** The window's target — what it lists: a conversation (its browser key and/or its CLI id) or one profile. */
function targetOf(o) {
  const browserKey = /^bk-[0-9a-f]{8}$/.test(String(o.browserKey || '')) ? String(o.browserKey) : null;
  const conversation = o.conversation ? String(o.conversation).slice(0, 120) : null;
  const profileId = /^bp-[0-9a-f]{8}$/.test(String(o.profileId || '')) ? String(o.profileId) : null;
  return { browserKey, conversation, profileId, id: browserKey || conversation || (profileId ? 'profile:' + profileId : null) };
}
/** The name in the title: the conversation's (the sidebar row carrying its key / id), else the profile's label. */
function nameOf(app, tg) {
  const rows = (app.sidebar && app.sidebar._allSessions) || [];
  const r = rows.find((s) => (tg.browserKey && s.browserKey === tg.browserKey) || (tg.conversation && (s.sessionId === tg.conversation || s.backendSessionId === tg.conversation || s.claudeSessionId === tg.conversation)));
  if (r) return (app.sidebar.getCustomName && app.sidebar.getCustomName(r)) || r.webuiName || r.name || '';
  if (tg.profileId) { const p = ((app._browserProfiles && app._browserProfiles.profiles) || []).find((x) => x.id === tg.profileId); return p ? String(p.label || '') : ''; }
  return '';
}

export function openBrowserReplayWindow(app, opts = {}) {
  const tg = targetOf(opts || {});
  const session = isSessionId(opts.session) ? opts.session : null;
  const at = Number(opts.at) > 0 ? Number(opts.at) : null;
  if (!tg.id) { showToast(t('No conversation to replay'), { type: 'error' }); return null; }
  for (const [, w] of app.wm.windows) {
    if (w.type === TYPE && w._browserReplay && w._browserReplay.target().id === tg.id) {
      if (!opts.syncId) { app.goToWinId?.(w.id); if (session || at) w._browserReplay.select(session, at); }
      return w;
    }
  }
  app._hideWelcome?.();
  const spec = { action: 'openBrowserReplay', ...(tg.browserKey ? { browserKey: tg.browserKey } : {}), ...(tg.conversation ? { conversation: tg.conversation } : {}), ...(tg.profileId ? { profileId: tg.profileId } : {}), ...(session ? { session } : {}), ...(at ? { at } : {}) };
  const winInfo = app.wm.createWindow({ title: replayTitle(nameOf(app, tg)), type: TYPE, syncId: opts.syncId, openSpec: spec, width: 1000, height: 660 });
  const signal = winInfo._listenerCtl?.signal;
  const st = { tg, sessions: [], traceOn: true, limit: 0, chosen: session, entries: [], entriesTotal: 0, index: 0, which: 'after', playing: false, timer: null, reloadTimer: null, loading: false, error: null, closed: false, pendingAt: at, seq: 0 };

  // ── the skeleton (built once; rows keyed by id and patched in place) ──
  const root = el('div', 'brp');
  root.tabIndex = 0;
  const side = el('div', 'brp-side');
  const sessHead = el('div', 'brp-head', t('Sessions'));
  const sessList = el('div', 'brp-sessions');
  sessList.setAttribute('role', 'listbox'); sessList.setAttribute('aria-label', t('Sessions'));
  const actHead = el('div', 'brp-head brp-actions-head', t('Actions'));
  const actList = el('div', 'brp-actions');
  actList.setAttribute('role', 'listbox'); actList.setAttribute('aria-label', t('Actions'));
  side.append(sessHead, sessList, actHead, actList);
  const main = el('div', 'brp-main');
  const bar = el('div', 'brp-bar');
  const beforeBtn = btn(t('Before'), () => setWhich('before'), 'brp-which');
  const afterBtn = btn(t('After'), () => setWhich('after'), 'brp-which');
  // the house text buttons, each saying what it does (the key rides the tooltip)
  const iconBtn = (icon, label, cls, title) => { const b = el('button', 'mounts-btn ' + cls); b.type = 'button'; b.innerHTML = icon || ''; b.appendChild(el('span', 'brp-btn-label', label)); b.title = title; return b; };
  // the step words are contexted (tc 'replay'): zh 上一步 / 下一步 / 第 k / n 步 — one word with the tooltips (the naive-user
  // verifier, 2026-09-28: 上一个 / 下一个 under 上一步 / 下一步 tooltips; the bare keys are chat search's and the trace dialog's)
  const prevBtn = iconBtn(UI_ICONS.chevronLeft, tc('replay', 'Previous'), 'brp-step brp-prev', t('Previous action (←)'));
  const playBtn = el('button', 'mounts-btn brp-play'); playBtn.type = 'button';
  const nextBtn = iconBtn(UI_ICONS.chevronRight, tc('replay', 'Next'), 'brp-step brp-next', t('Next action (→)'));
  const posEl = el('span', 'brp-pos');
  bar.append(beforeBtn, afterBtn, prevBtn, playBtn, nextBtn, posEl);
  const stage = el('div', 'brp-stage');
  const pic = el('div', 'brp-pic');
  const img = el('img', 'brp-img'); img.alt = ''; img.draggable = false;
  pic.appendChild(img);
  const empty = el('div', 'brp-empty');
  stage.append(pic, empty);
  const caption = el('div', 'brp-caption');
  const capText = el('div', 'brp-cap-text');
  const capMeta = el('div', 'brp-cap-meta chat-status-dim');
  caption.append(capText, capMeta);
  const note = el('div', 'brp-note chat-status-dim');
  main.append(bar, stage, caption, note);
  root.append(side, main);
  winInfo.content.appendChild(root);

  // ── the list rows ──
  const sessRows = new Map();
  function sessionRow(s) {
    let r = sessRows.get(s.id);
    if (!r) {
      r = el('button', 'brp-session'); r.type = 'button'; r.dataset.session = s.id; r.setAttribute('role', 'option');
      r.onclick = () => choose(s.id);
      sessRows.set(s.id, r);
    }
    const text = sessionRowText(s);
    const sub = [s.label ? String(s.label) : t('a browser of its own'), s.child ? t('a helper') : '', !s.frameEntries && s.framesRemoved ? t('frames removed') : ''].filter(Boolean).join(' · ');
    const sig = JSON.stringify([text, sub, s.open, st.chosen === s.id]);
    if (r.dataset.sig !== sig) {
      r.dataset.sig = sig;
      r.replaceChildren(el('span', 'brp-session-when', text), el('span', 'brp-session-sub', sub));
      r.classList.toggle('open', !!s.open);
      r.classList.toggle('active', st.chosen === s.id);
      r.setAttribute('aria-selected', st.chosen === s.id ? 'true' : 'false');
      r.title = t('Session started {time}', { time: whenText(s.startAt) }) + (s.open ? '' : ' · ' + durationText(s.durationMs)) + ' · ' + actionsText(s.count);
    }
    return r;
  }
  function renderSessions() {
    const out = st.sessions.map(sessionRow);
    const kids = sessList.childNodes;
    for (let i = 0; i < out.length; i++) if (kids[i] !== out[i]) sessList.insertBefore(out[i], kids[i] || null);
    while (kids.length > out.length) sessList.removeChild(kids[kids.length - 1]);
    for (const k of [...sessRows.keys()]) if (!st.sessions.some((s) => s.id === k)) sessRows.delete(k);
    sessHead.textContent = `${t('Sessions')} (${st.sessions.length})`;
    revealChosen();
  }
  /** The chosen session's row stays in view of its own list (the naive-user verifier, 2026-09-28: on a phone the list opens
   *  on the newest three, and the actions below belonged to a row scrolled out of sight). The list's scrollTop only —
   *  never scrollIntoView (it would scroll the page / the workspace too). */
  function revealChosen() {
    const r = st.chosen ? sessRows.get(st.chosen) : null;
    if (!r || !r.isConnected || !sessList.clientHeight) return;
    const lb = sessList.getBoundingClientRect(), rb = r.getBoundingClientRect();
    if (rb.top < lb.top) sessList.scrollTop -= lb.top - rb.top;
    else if (rb.bottom > lb.bottom) sessList.scrollTop += Math.min(rb.bottom - lb.bottom, rb.top - lb.top);
  }
  // KEYED by the action's trace id (verifier 2026-09-28): a reload — every `browser-trace-appended` of this conversation
  // while its agent keeps working, every sweep — used to rebuild all 1 000 rows (a row under the pointer detached, its
  // click dropped); now a row is made once and only what it says is patched, its place moved only when it moved
  const actRows = new Map();
  function actionRow(e, i) {
    let r = actRows.get(e.id);
    if (!r) {
      r = el('button', 'brp-action'); r.type = 'button'; r.dataset.traceId = e.id; r.setAttribute('role', 'option');
      r.onclick = () => { stop(); show(Number(r.dataset.index) || 0); };
      actRows.set(e.id, r);
    }
    r.dataset.index = String(i);
    const fs = frameState(e, 'after') === 'frame' ? 'after' : frameState(e, 'before') === 'frame' ? 'before' : null;
    const sig = JSON.stringify([e.ok === false, fs, !!e.framesRemoved, e.at, timelineLabel(e), String(e.text || '')]);
    if (r.dataset.sig !== sig) {
      r.dataset.sig = sig;
      const thumb = el('span', 'brp-action-thumb');
      if (fs) { const im = el('img', 'brp-action-img'); im.alt = ''; im.loading = 'lazy'; im.draggable = false; im.src = frameUrl(e.id, fs); thumb.appendChild(im); }
      else thumb.appendChild(el('span', 'brp-action-noframe', e.framesRemoved ? t('removed') : t('no frame')));
      const text = el('span', 'brp-action-text');
      text.append(el('span', 'brp-action-time', clock(e.at)), el('span', 'brp-action-label', timelineLabel(e)));
      r.replaceChildren(thumb, text);
      r.classList.toggle('failed', e.ok === false);
      r.title = String(e.text || '');
    }
    r.classList.toggle('active', i === st.index);
    return r;
  }
  function renderActions() {
    const s = current();
    const out = s ? st.entries.map(actionRow) : [];
    const kids = actList.childNodes;
    for (let i = 0; i < out.length; i++) if (kids[i] !== out[i]) actList.insertBefore(out[i], kids[i] || null);
    while (kids.length > out.length) actList.removeChild(kids[kids.length - 1]);
    const keep = new Set(out.map((r) => r.dataset.traceId));
    for (const k of [...actRows.keys()]) if (!keep.has(k)) actRows.delete(k);
    // the answer carries the NEWEST 1 000 of a session; a cut is said, never a smaller number under a bigger one
    const cut = s && st.entriesTotal > st.entries.length;
    actHead.textContent = !s ? t('Actions') : cut ? t('Actions (last {n} of {total})', { n: st.entries.length, total: st.entriesTotal }) : `${t('Actions')} (${st.entries.length})`;
    actHead.title = cut ? t('The replay carries the last {n} actions of this session; the earlier {m} are on disk but not shown here.', { n: st.entries.length, m: st.entriesTotal - st.entries.length }) : '';
  }
  const current = () => st.sessions.find((s) => s.id === st.chosen) || null;

  // ── the picture ──
  function setWhich(w) { st.which = w === 'before' ? 'before' : 'after'; renderPicture(); }
  function show(i) {
    st.index = Math.max(0, Math.min(Math.max(0, st.entries.length - 1), Number(i) || 0));
    for (const r of actList.querySelectorAll('.brp-action')) r.classList.toggle('active', Number(r.dataset.index) === st.index);
    const row = actList.querySelector(`.brp-action[data-index="${st.index}"]`);
    if (row) row.scrollIntoView({ block: 'nearest' });
    renderPicture();
  }
  function setEmpty(kind) {
    const on = !!kind;
    empty.textContent = on ? emptyText(kind, { limit: st.limit }) : '';
    empty.dataset.kind = kind || '';
    empty.style.display = on ? '' : 'none';
    pic.style.display = on ? 'none' : '';
  }
  function renderPicture() {
    const s = current();
    const e = st.entries[st.index] || null;
    const kind = st.error ? null : replayEmpty({ traceOn: st.traceOn, sessions: st.sessions, session: s, entries: st.entries });
    const n = st.entries.length;
    beforeBtn.classList.toggle('active', st.which === 'before'); afterBtn.classList.toggle('active', st.which === 'after');
    beforeBtn.setAttribute('aria-pressed', st.which === 'before' ? 'true' : 'false'); afterBtn.setAttribute('aria-pressed', st.which === 'after' ? 'true' : 'false');
    prevBtn.disabled = !n || st.index <= 0; nextBtn.disabled = !n || st.index >= n - 1;
    playBtn.innerHTML = (st.playing ? UI_ICONS.pause : UI_ICONS.play) || '';
    playBtn.appendChild(el('span', 'brp-btn-label', st.playing ? t('Pause') : t('Play')));
    playBtn.title = st.playing ? t('Pause (Space)') : t('Play one action a second (Space)');
    playBtn.disabled = n < 2;
    posEl.textContent = n ? tc('replay', '{i} of {n}', { i: st.index + 1, n }) : '';
    if (st.error) { setEmpty(null); pic.style.display = 'none'; empty.style.display = ''; empty.dataset.kind = 'error'; empty.textContent = t('Browser replay unavailable: {why}', { why: String(st.error) }); capText.textContent = ''; capMeta.textContent = ''; return; }
    if (kind) { setEmpty(kind); capText.textContent = ''; capMeta.textContent = ''; if (kind !== 'frames-removed' || !e) return; }
    if (!e) { setEmpty(kind || null); return; }
    capText.textContent = `${String(e.action || '')} · ${positionKindText(e.position)} ${positionText(e.position)}`.trim();
    capMeta.textContent = [clock(e.at), e.url ? String(e.url) : '', statusText(e)].filter(Boolean).join(' · ');
    const fstate = frameState(e, st.which);
    if (fstate === 'frame') {
      setEmpty(null);
      const url = frameUrl(e.id, st.which);
      if (img.dataset.url !== url) { img.dataset.url = url; img.src = url; }
      drawOverlay(pic, img, e, st.which);
    } else if (fstate === 'removed') setEmpty('frames-removed');
    else { setEmpty(null); pic.style.display = 'none'; empty.style.display = ''; empty.dataset.kind = 'no-frame'; empty.textContent = st.which === 'before' ? t('no before frame (the first action after the stream opened)') : t('no after frame (the stream ended first)'); }
  }

  // ── play (one action a second; the PURE step stops at the last) ──
  function stop() { st.playing = false; if (st.timer) { clearInterval(st.timer); st.timer = null; } }
  function applyKey(key) {
    const next = replayKey({ index: st.index, playing: st.playing }, key, st.entries.length);
    const wasPlaying = st.playing;
    st.playing = next.playing;
    if (st.playing && !wasPlaying) { st.timer = setInterval(() => { const r = playTick({ index: st.index, playing: st.playing }, st.entries.length); st.playing = r.playing; show(r.index); if (!r.playing) stop(); }, PLAY_STEP_MS); }
    if (!st.playing && st.timer) { clearInterval(st.timer); st.timer = null; }
    show(next.index);
  }
  prevBtn.onclick = () => applyKey('ArrowLeft');
  nextBtn.onclick = () => applyKey('ArrowRight');
  playBtn.onclick = () => applyKey(' ');
  root.addEventListener('keydown', (ev) => {
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
    if (ev.target && /^(INPUT|TEXTAREA|SELECT)$/.test(ev.target.tagName)) return;
    const k = ev.key === 'Spacebar' ? ' ' : ev.key;
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End', ' '].includes(k)) return;
    ev.preventDefault(); ev.stopPropagation();
    applyKey(k);
  }, { signal });

  // ── data ──
  const query = (extra = {}) => {
    const q = new URLSearchParams();
    if (st.tg.browserKey) q.set('browserKey', st.tg.browserKey);
    if (st.tg.conversation) q.set('conversation', st.tg.conversation);
    if (st.tg.profileId && !st.tg.browserKey && !st.tg.conversation) q.set('profile', st.tg.profileId);
    for (const [k, v] of Object.entries(extra)) if (v) q.set(k, v);
    return q;
  };
  async function load({ keepIndex = false } = {}) {
    if (st.closed) return;
    const my = ++st.seq;
    st.loading = true;
    const r = await fetchJson(`/api/browser/sessions?${query({ session: st.chosen || '' })}`);
    if (st.closed || my !== st.seq) return;
    st.loading = false;
    if (!r || r.error) { st.error = (r && r.error) || t('server unreachable'); renderSessions(); renderActions(); renderPicture(); return; }
    st.error = null;
    st.traceOn = r.traceOn !== false; st.limit = Number(r.limit) || 0;
    if (r.browserKey && !st.tg.browserKey) st.tg = { ...st.tg, browserKey: r.browserKey };
    st.sessions = Array.isArray(r.sessions) ? r.sessions : [];
    const pick = pickSession(st.sessions, st.chosen, st.pendingAt);
    if (pick && pick.id !== st.chosen) { st.chosen = pick.id; return load(); } // the list named a session this answer did not carry — ask for its actions
    const prevId = st.entries[st.index] ? st.entries[st.index].id : null;
    st.entries = Array.isArray(r.entries) ? r.entries : [];
    st.entriesTotal = Number.isFinite(Number(r.entriesTotal)) ? Number(r.entriesTotal) : st.entries.length;
    renderSessions(); renderActions();
    let i = 0;
    if (st.pendingAt) { i = pickIndex(st.entries, st.pendingAt); st.pendingAt = null; }
    else if (keepIndex && prevId) { const j = st.entries.findIndex((e) => e.id === prevId); i = j >= 0 ? j : 0; }
    show(i);
    note.textContent = retentionText(st.limit);
    app.wm.setTitle?.(winInfo.id, replayTitle(nameOf(app, st.tg)));
  }
  function choose(id) { if (!id || id === st.chosen) return; stop(); st.chosen = id; st.index = 0; renderSessions(); load(); }
  function select(id, at2) { stop(); if (at2) st.pendingAt = Number(at2); if (id && id !== st.chosen) { st.chosen = id; st.index = 0; } load(); }
  const scheduleReload = () => { if (st.reloadTimer) clearTimeout(st.reloadTimer); st.reloadTimer = setTimeout(() => { st.reloadTimer = null; load({ keepIndex: true }); }, RELOAD_DEBOUNCE_MS); };
  const mine = (m) => {
    if (st.tg.browserKey && m.browserKey && (m.browserKey === st.tg.browserKey || String(m.browserKey).startsWith(st.tg.browserKey + '.'))) return true;
    if (st.tg.profileId && m.profileId === st.tg.profileId) return true;
    return false;
  };
  const onGlobal = (m) => {
    if (st.closed || !m) return;
    if ((m.type === 'browser-sessions-updated' || m.type === 'browser-trace-appended') && mine(m)) scheduleReload();
    else if (m.type === 'browser-housekeeping-updated' && m.sweep) scheduleReload(); // a sweep may have removed this session's frames
  };
  app.ws?.onGlobal?.(onGlobal);

  // ── the phone / a narrow pane: the list above, the picture below, ≥ 44 px targets ──
  const applyNarrow = () => { const w = root.clientWidth; if (!w) return; const was = root.classList.contains('narrow'); root.classList.toggle('narrow', w < NARROW_PX || !!app.isMobile); if (was !== root.classList.contains('narrow')) revealChosen(); };
  let ro = null;
  if (typeof ResizeObserver === 'function') { ro = new ResizeObserver(() => applyNarrow()); ro.observe(root); }
  winInfo.onResize = applyNarrow;
  winInfo.onClose = () => { st.closed = true; stop(); if (st.reloadTimer) clearTimeout(st.reloadTimer); try { app.ws?.offGlobal?.(onGlobal); } catch { /* optional */ } try { ro && ro.disconnect(); } catch { /* */ } };
  winInfo._browserReplay = {
    target: () => st.tg, select, load, key: applyKey,
    state: () => ({ sessions: st.sessions.length, chosen: st.chosen, index: st.index, n: st.entries.length, total: st.entriesTotal, which: st.which, playing: st.playing, traceOn: st.traceOn, empty: empty.style.display === 'none' ? null : empty.dataset.kind || null, error: st.error, limit: st.limit }),
  };
  applyNarrow();
  renderPicture();
  load();
  if (!opts.syncId) setTimeout(() => { if (root.isConnected && !root.contains(document.activeElement)) root.focus({ preventScroll: true }); }, 0);
  return winInfo;
}

export function installBrowserReplay(App) {
  /** THE replay window of a conversation (or a profile): `{browserKey?, conversation?, profileId?, session?, at?, syncId?}`. */
  App.prototype.openBrowserReplay = function (opts) { return openBrowserReplayWindow(this, opts || {}); };
}

registerWindowType({
  type: 'browser-replay', label: 'Browser replay', // a LITERAL type: the window-types census reads it
  icon: UI_ICONS.browserReplay,
  action: 'openBrowserReplay', replay: (app, spec, { syncId } = {}) => app.openBrowserReplay({ ...(spec || {}), syncId }),
});
