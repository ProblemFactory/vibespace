// lane desktop-handover (the owner 2026-10-19 「把远程桌面的控制权交给 agent」): THE HAND-OVER, the page's half. While the
// machine-desktop window's stream plays, its strip offers 「交给 agent」 → a picker of this hub's live agent conversations (the
// principal picker, ONE holder: one pointer, one keyboard) → the hub leases the window's stream to it
// (src/server/desktop-handover-engine.js; the decisions are src/desktop-handover.js) and the strip reads 「<agent> 正在操作 ·
// 收回」. The owner's OWN input in the window — any key, pointer or wheel the stream sends — PAUSES the agent (its verbs answer
// `window_paused`) until 「继续交给它」; 「收回」 ends it, and so does closing the window (no window, no hand-over). The lease's
// facts ride the stream's long poll (`handover`): the holder, its state, the agent's last point — drawn over the picture as
// the agent's pointer (browser-live-window's labelled cursor and its CSS). Every name is peer-controlled text: textContent only.
import { t } from './i18n.js';
import { createModalShell, fetchJson, showToast } from './utils.js';
import { principalPicker, rosterFromApp } from './principal-picker.js';

const BASE = '/api/desktop/machine-desktop/handover';
const post = (url, body) => fetchJson(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const mk = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const button = (cls, text, onclick) => { const b = mk('button', cls, text); b.type = 'button'; b.onclick = onclick; return b; };

/** A refused give, in words (by the hub's code; its own sentence otherwise). */
export function giveRefusalText(r, machine) {
  const c = r && r.code;
  if (c === 'host_needs_update') return t('{machine}’s agent is too old for a hand-over — it updates itself with VibeSpace', { machine });
  if (c === 'no_conversation') return t('That conversation is not running any more');
  if (c === 'stream_not_live') return t('The stream is not playing — a hand-over rides it');
  if (c === 'not_an_agent') return t('A plain shell cannot drive a desktop');
  return t('The hand-over did not start: {why}', { why: String((r && (r.error || r.code)) || '?') });
}
/** Why a hand-over ended, for the toast (null = no toast: the owner did it, or the window is gone). */
export function endedText(cause, name, machine) {
  if (cause === 'conversation_ended') return t('{name} no longer drives {machine}’s desktop — its conversation ended', { name, machine });
  if (cause === 'stream_ended' || cause === 'daemon_gone') return t('{name} no longer drives {machine}’s desktop — the stream ended', { name, machine }); // daemon_gone (fix r2): the machine's agent restarted
  if (cause === 'agent_done') return t('{name} handed {machine}’s desktop back', { name, machine });
  return null;
}
/** Where a picture pixel sits in the element (object-fit: contain — the letterbox's bars) → { left, top } | null */
export function pictureToElement(p, box, video) {
  if (!p || !box || !video || !(video.w > 0) || !(video.h > 0) || !(box.width > 0) || !(box.height > 0)) return null;
  const s = Math.min(box.width / video.w, box.height / video.h);
  return { left: (box.width - video.w * s) / 2 + (p.x + 0.5) * s, top: (box.height - video.h * s) / 2 + (p.y + 0.5) * s };
}

/**
 * The strip's hand-over controls. `strip` / `before` = where they go; `pane` = the picture's box (the agent's pointer is drawn
 * in it); `streamOf()` = the window's live stream view (its key, its <video>). → { facts(f), ownerInput(), playing(on), dispose() }
 */
export function createHandover({ app, hostId, machine, strip, before = null, pane, streamOf }) {
  let st = null, isPlaying = false, pausing = false, lastEnd = null, disposed = false, switchPaused = false;
  const give = button('desktop-strip-btn desktop-strip-handover-give', t('Hand to an agent'), () => pick());
  give.hidden = true;
  const box = mk('span', 'desktop-strip-handover'); box.hidden = true;
  const who = mk('span', 'desktop-strip-handover-who');
  const resume = button('file-tool-btn desktop-strip-handover-resume', t('Let it continue'), async () => { const r = await post(`${BASE}/resume`, { host: hostId }).catch(() => null); if (r && r.lease) draw({ ...r.lease, state: r.lease.input }); });
  const take = button('file-tool-btn desktop-strip-handover-take', t('Take back'), async () => { await post(`${BASE}/revoke`, { host: hostId }).catch(() => null); draw(null); });
  box.append(who, resume, take);
  if (before && before.parentNode === strip) { strip.insertBefore(give, before); strip.insertBefore(box, before); } else strip.append(give, box);
  // the agent's pointer: browser-live-window's labelled cursor (its classes, its CSS), over the picture
  const cursor = mk('div', 'browser-live-agent-cursor'); cursor.style.display = 'none';
  cursor.innerHTML = '<svg width="14" height="18" viewBox="0 0 14 18" aria-hidden="true"><path d="M1 1l4.5 14 2.2-5.4 5.8-1.2z" fill="var(--accent)" stroke="var(--bg)" stroke-width="1.2" stroke-linejoin="round"/></svg>';
  const label = mk('span', 'browser-live-agent-cursor-label');
  cursor.append(label);
  pane.append(cursor);

  function drawCursor() {
    const s = streamOf(), v = s && s.video;
    const p = st && st.state === 'agent' && st.own !== false && st.dot ? pictureToElement(st.dot, v ? v.getBoundingClientRect() : null, v && v.videoWidth ? { w: v.videoWidth, h: v.videoHeight } : null) : null;
    cursor.style.display = p ? '' : 'none';
    if (!p) return;
    cursor.style.left = p.left + 'px'; cursor.style.top = p.top + 'px';
    label.textContent = (st.holder && st.holder.name) || t('agent');
  }
  function draw(f) {
    if (disposed) return;
    const live = f && f.state && f.state !== 'none' ? f : null;
    if (f && f.state === 'none' && f.ended && (!lastEnd || lastEnd.at !== f.at)) {
      lastEnd = { at: f.at, cause: f.ended };
      const words = endedText(f.ended, f.name || t('The agent'), machine);
      if (words) showToast(words);
    }
    st = live;
    if (!live || live.state !== 'rebinding') switchPaused = false;
    const name = (live && live.holder && live.holder.name) || t('The agent');
    box.hidden = !live;
    give.hidden = !!live || !isPlaying;
    if (live) {
      who.textContent = live.state === 'user' ? t('Paused — you are using it') : live.state === 'rebinding' ? t('Switching display…') : t('{name} is driving', { name });
      who.title = live.state === 'user' ? t('{name} waits until you let it continue', { name }) : t('{name} drives this desktop — any key, click or scroll of yours pauses it', { name });
      resume.hidden = live.state !== 'user';
    }
    drawCursor();
  }
  async function pick() {
    const s = streamOf();
    if (!s || !s.key) { showToast(giveRefusalText({ code: 'stream_not_live' }, machine)); return; }
    let chosen = [];
    const { body, close, raised } = createModalShell({ id: 'machine-desktop-handover', key: s.key, title: t('Hand {machine}’s desktop to an agent', { machine }), dialogClass: 'machine-desktop-handover', escapeToClose: true, kind: 'form' });
    if (raised) return;   // raised: the same subject's form, as it was
    const note = mk('p', 'machine-desktop-handover-note', t('It sees this display and uses its keyboard and pointer through this window’s stream. Any key, click or scroll of yours here pauses it; Take back ends it — closing this window ends it too.'));
    const why = mk('p', 'machine-desktop-handover-why'); why.hidden = true;
    const ok = button('btn-create', t('Hand over'), async () => {
      if (!chosen.length) return;
      ok.disabled = true;
      const cur = streamOf();
      const r = await post(BASE, { host: hostId, key: cur && cur.key, principal: chosen[0] }).catch((e) => ({ error: String((e && e.message) || e) }));
      ok.disabled = false;
      if (!r || !r.ok) { why.textContent = giveRefusalText(r, machine); why.hidden = false; return; }
      close();
      draw({ ...r.lease, state: r.lease.input });
      showToast(t('{name} drives {machine}’s desktop — any key or click of yours pauses it', { name: (r.lease.holder && r.lease.holder.name) || t('The agent'), machine }));
    });
    ok.disabled = true;
    const picker = principalPicker({ items: () => rosterFromApp(app, { groups: false }), app, multi: false, label: t('Agent'), placeholder: t('Search live agent sessions…'), emptyText: t('No agent conversation is running — start one, then come back.'), autofocus: true,
      onChange: (keys) => { chosen = keys.slice(0, 1); ok.disabled = !chosen.length; why.hidden = true; } });
    const row = mk('div', 'desktop-install-actions');
    row.append(button('file-tool-btn', t('Cancel'), () => close()), ok);
    body.append(note, picker.el, why, row);
  }
  return {
    facts: (f) => draw(f || null),
    /** The owner's own key / pointer / wheel went down the stream: the agent pauses (once — the hub says when it did). */
    ownerInput() {
      // fix r2: mid-switch (rebinding) the owner's input pauses too — ONCE a switch; the next stream comes back paused
      if (st && st.state === 'rebinding' && !switchPaused && !pausing) { switchPaused = true; pausing = true; post(`${BASE}/pause`, { host: hostId, cause: 'owner_input' }).then(() => { pausing = false; }, () => { pausing = false; switchPaused = false; }); return; }
      if (!st || st.state !== 'agent' || pausing) return;
      pausing = true;
      st = { ...st, state: 'user' }; draw(st);
      post(`${BASE}/pause`, { host: hostId, cause: 'owner_input' }).then((r) => { pausing = false; if (r && r.lease) draw({ ...r.lease, state: r.lease.input }); }, () => { pausing = false; });
    },
    playing(on) { isPlaying = !!on; give.hidden = !!st || !isPlaying; if (!on) cursor.style.display = 'none'; },
    redraw: drawCursor,
    get state() { return st; },
    dispose() { disposed = true; give.remove(); box.remove(); cursor.remove(); },
  };
}
