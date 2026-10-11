// ONE APP OF A PAIRED WINDOWS / macOS MACHINE AS ITS OWN WINDOW — the page side (lane machine-app-crop, owner 2026-10-11
// "都做吧", route ② of B-bb0b). The machine's VNC server sends its WHOLE screen (the same picture as "Open its desktop",
// src/lib/machine-desktop.js); the device agent follows the app's window (the `window-track` op through
// src/server/machine-app.js) and keeps it on top (`window-pin`); this window shows the picture CROPPED to that window:
//   • the crop is layout, not a copy: the VNC canvas is sized + shifted (src/machine-window.js cropLayout) inside a box
//     the size of the app's window, so noVNC's own pointer math lands every click on the app (pane → machine = the
//     rectangle's origin + the pane offset ÷ the fit scale); a drag that leaves the box is held at its edge, a press or a
//     wheel outside it is dropped — the rest of the machine's screen is never reached from here
//   • keys go to the machine only while the picture has the focus (noVNC's own grab); on a Mac the app is brought to the
//     front (activated) before the person's input — macOS keeps no window above the others for us
//   • the rectangle follows the window live (moves / resizes); `gone` ⇒ the pane says so with "Open its whole desktop" and
//     "Run again"; several app windows of one machine share ONE screen — the pinned one wins and each pane says which
//   • not persisted (a reload never re-opens a machine's screen); closing the window ends the watch, which undoes the pin
import { t } from './i18n.js';
import { fetchJson } from './utils.js';
import { registerWindowType, svgIcon16 } from './window-types.js';
import { createVncView, streamUrl } from './vnc-view.js';
import { machineDesktopId } from '../machine-desktop-model.js';
import { cropLayout, paneToMachine, clampToBox } from '../machine-window.js';

const nameOf = (m) => String((m && (m.label || m.hostId)) || ''); // peer-controlled text: textContent only
const el = (tag, css, text) => { const e = document.createElement(tag); if (css) e.style.cssText = css; if (text != null) e.textContent = text; return e; };
const btn = (cls, text, onclick) => { const b = document.createElement('button'); b.type = 'button'; b.className = cls; b.textContent = text; b.onclick = onclick; return b; };
const post = (url, body) => fetchJson(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const NOTE = 'flex:0 0 auto;padding:3px 10px;font-size:12px;color:var(--text-secondary);border-bottom:1px solid var(--border)';
/** A Mac is activated again before input at most this often (the person's first press / focus after a pause). */
const ACTIVATE_GAP_MS = 3000;

/** The words of a watch that ended or never found a window (PURE over the answer; `cmd` = the line that ran). */
export function machineAppStateText(a, m, cmd = '') {
  const machine = nameOf(m);
  const title = (a && a.title) || cmd;
  if (!a || a.state === 'none') return t('No window of “{cmd}” appeared on {machine} within 20 seconds', { cmd, machine });
  if (a.state === 'gone') return t('“{title}” closed on {machine}', { title, machine });
  if (a.code === 'host_needs_daemon') return t('{machine}’s VibeSpace agent is too old to show one app — update the agent there (its whole desktop still works)', { machine });
  if (a.state === 'error') return t('Could not follow the app’s window on {machine}: {why}', { machine, why: a.error || a.code || '?' });
  return '';
}

/**
 * THE WINDOW: `track` = { launched: {pid, at} } from the run's answer, or { target } (a window already followed);
 * `view` = the machine's picture options (its connect gate + sign-in — the whole desktop's own, src/lib/machine-desktop.js);
 * `openDesktop()` / `runAgain()` = the two ways on when the app's window is gone.
 */
export function openMachineApp(app, m, { cmd = '', track = {}, view: viewOpts = {}, openDesktop = null, runAgain = null } = {}) {
  const id = machineDesktopId(m && m.hostId);
  if (!id) return null;
  app._hideWelcome?.();
  const machine = nameOf(m);
  const winInfo = app.wm.createWindow({ title: t('{app} on {machine}', { app: cmd || t('An app'), machine }), type: 'machine-app' });
  winInfo._machineApp = m.hostId;
  const c = winInfo.content;
  c.style.display = 'flex'; c.style.flexDirection = 'column';
  c.classList.add('machine-app');
  const scope = el('div', NOTE, t('Only this app of {machine} shows here, and what you type here goes to it.', { machine }));
  const share = el('div', NOTE + ';display:none;align-items:center;gap:8px'); share.className = 'machine-app-share';
  const shareText = el('span', 'flex:1 1 auto;min-width:0');
  const pinBtn = btn('file-tool-btn', t('Keep this one on top'), () => setOnTop(true)); pinBtn.style.cssText = 'width:auto;padding:0 10px;flex:0 0 auto';
  share.append(shareText, pinBtn);
  const host = el('div', 'position:relative;flex:1 1 auto;min-height:0;display:flex;flex-direction:column');
  c.append(scope, share, host);

  let key = null, seq = -1, answer = null, pin = null, closed = false, layout = null, lastActivate = 0, lastTitle = '';
  const view = createVncView(host, { url: streamUrl(`/api/desktop/${id}/stream`), autoReconnect: true, resizeSession: false, ...viewOpts });
  // THE CROP: the shell's mount is the pane; inside it the BOX (the app's window, clipped) holds the STAGE (the whole
  // framebuffer, sized + shifted) — noVNC's own screen element is moved into the stage as it appears (each reconnect)
  const pane = view.mount;
  pane.classList.add('machine-app-pane');
  const box = el('div', 'position:absolute;overflow:hidden;display:none'); box.className = 'machine-app-box';
  const stage = el('div', 'position:absolute'); stage.className = 'machine-app-stage';
  box.append(stage); pane.append(box);
  const say = el('div', 'position:absolute;inset:0;display:none;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:16px;text-align:center;background:var(--bg-window);color:var(--text)');
  say.className = 'machine-app-say';
  const sayText = el('div', 'max-width:420px;font-size:13px');
  const sayActs = el('div'); sayActs.className = 'desktop-install-actions';
  say.append(sayText, sayActs); pane.append(say);
  const adopt = () => { for (const ch of [...pane.children]) if (ch !== box && ch !== say) { stage.replaceChildren(ch); place(); } };
  const mo = new MutationObserver(adopt); mo.observe(pane, { childList: true });
  const canvasOf = () => stage.querySelector('canvas');
  const px = (n) => `${Math.round(n * 1000) / 1000}px`;
  function place() {
    const cv = canvasOf();
    const a = answer && answer.state === 'found' ? answer : null;
    layout = a && cv && cv.width > 0 ? cropLayout({ pane: { w: pane.clientWidth, h: pane.clientHeight }, fb: { w: cv.width, h: cv.height }, screen: a.screen, rect: a.rect }) : null;
    box.style.display = layout ? '' : 'none';
    if (!layout) return;
    const b = layout.box, s = layout.stage;
    const want = [px(b.left), px(b.top), px(b.w), px(b.h), px(s.left), px(s.top), px(s.w), px(s.h)];
    const have = [box.style.left, box.style.top, box.style.width, box.style.height, stage.style.left, stage.style.top, stage.style.width, stage.style.height];
    if (want.join() === have.join()) return;
    [box.style.left, box.style.top, box.style.width, box.style.height] = want.slice(0, 4);
    [stage.style.left, stage.style.top, stage.style.width, stage.style.height] = want.slice(4);
  }
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => place()) : null;
  ro?.observe(pane); ro?.observe(stage);
  // the framebuffer's size arrives with the first picture (noVNC sizes its canvas then): look again until it is there
  let fbSeen = 0;
  const fbTimer = setInterval(() => { const cv = canvasOf(); const w = cv ? cv.width * 100000 + cv.height : 0; if (w !== fbSeen) { fbSeen = w; place(); } }, 250);

  // POINTER RULE (the crop's edge): only the canvas' captured drags reach here from outside the box (the box clips the rest)
  const rel = (ev) => { const r = pane.getBoundingClientRect(); return { x: ev.clientX - r.left, y: ev.clientY - r.top }; };
  const guard = (ev) => {
    if (ev._vsClamped || !layout || ev.target !== canvasOf()) return; // only noVNC's own (captured) events: the rest never reach it
    const p = rel(ev);
    if (paneToMachine(layout, p.x, p.y)) return;
    ev.stopPropagation(); ev.preventDefault();
    if (ev.type === 'mousemove' && !ev.buttons) return; // a hover outside: nothing to send
    if (ev.type === 'mousedown' || ev.type === 'wheel') return; // a press / a wheel outside the app: dropped
    const q = clampToBox(layout, p.x, p.y), r = pane.getBoundingClientRect();
    const clone = new MouseEvent(ev.type, { bubbles: true, cancelable: true, clientX: r.left + q.x, clientY: r.top + q.y, buttons: ev.buttons, button: ev.button, ctrlKey: ev.ctrlKey, shiftKey: ev.shiftKey, altKey: ev.altKey, metaKey: ev.metaKey });
    clone._vsClamped = true;
    canvasOf()?.dispatchEvent(clone);
  };
  for (const type of ['mousedown', 'mousemove', 'mouseup', 'wheel']) pane.addEventListener(type, guard, { capture: true, passive: false });
  // a Mac: the app comes to the front before the person's input (a press / the focus after a pause)
  const activate = () => { if (!key || closed || m.setup !== 'darwin' || Date.now() - lastActivate < ACTIVATE_GAP_MS) return; lastActivate = Date.now(); post('/api/desktop/machine-app/on-top', { key, on: true }).catch(() => { }); };
  pane.addEventListener('pointerdown', activate, { capture: true });
  pane.addEventListener('focusin', activate);

  function renderShare() {
    const mine = pin && pin.key === key;
    const other = pin && !mine;
    share.style.display = other || (mine && m.setup === 'win32') ? 'flex' : 'none';
    pinBtn.style.display = other ? '' : 'none';
    shareText.textContent = other ? t('{machine} has one screen: “{title}” is kept on top there, so it may cover this app', { machine, title: pin.title || t('another app') }) : mine ? t('Kept on top of the other windows on {machine}', { machine }) : '';
  }
  function showSay(text, { desk = true, again = true } = {}) {
    say.style.display = text ? 'flex' : 'none';
    sayText.textContent = text || '';
    sayActs.replaceChildren();
    if (!text) return;
    if (desk && openDesktop) sayActs.append(btn('file-tool-btn', t('Open its whole desktop'), () => openDesktop()));
    if (again && runAgain) sayActs.append(btn('btn-create', t('Run again'), () => { app.wm.closeWindow(winInfo.id); runAgain(); }));
    for (const b of sayActs.children) b.style.cssText = 'width:auto;height:auto;min-height:28px;padding:4px 12px;white-space:nowrap'; // words, not the 24 px icon box
  }
  function apply(a) {
    answer = a || answer;
    const found = answer && answer.state === 'found';
    if (found && answer.title) { lastTitle = answer.title; app.wm.setTitle(winInfo.id, t('{app} on {machine}', { app: answer.title, machine })); }
    if (!found) { share.style.display = 'none'; showSay(machineAppStateText({ ...answer, title: answer && answer.title ? answer.title : lastTitle }, m, cmd)); place(); return; }
    place();
    if (!layout && canvasOf()?.width) showSay(t('“{title}” is not on the screen {machine} shares (minimized, or on another display)', { title: answer.title || cmd, machine }), { again: false });
    else showSay('');
    renderShare();
  }
  async function setOnTop(on) {
    if (!key) return;
    const r = await post('/api/desktop/machine-app/on-top', { key, on }).catch(() => null);
    if (r && 'pin' in r) { pin = r.pin; renderShare(); }
  }
  async function follow() {
    while (!closed && key) {
      const r = await fetchJson(`/api/desktop/machine-app/watch?key=${encodeURIComponent(key)}&seq=${seq}`).catch(() => null);
      if (closed) return;
      if (!r || r.error) { await new Promise((res) => setTimeout(res, 2000)); continue; }
      seq = r.seq; pin = r.pin || null;
      apply(r.answer);
      if (r.ended || (r.answer && r.answer.state !== 'found')) { key = null; return; }
    }
  }
  async function start() {
    showSay(t('Waiting for the app’s window on {machine}…', { machine }), { desk: false, again: false });
    const body = { host: m.hostId, ...(track.launched ? { pid: track.launched.pid, since: track.launched.at } : {}), ...(track.target ? { target: track.target } : {}) };
    const r = await post('/api/desktop/machine-app/track', body).catch((e) => ({ error: String(e && e.message), code: 'host_unavailable' }));
    if (closed) { if (r && r.key) post('/api/desktop/machine-app/untrack', { key: r.key }).catch(() => { }); return; }
    if (!r || r.error) { apply({ state: 'error', code: r && r.code, error: r && r.error }); return; }
    if (!r.key) { apply(r.answer || { state: 'none' }); return; }
    key = r.key; pin = r.pin || null;
    apply(r.answer);
    view.connect();
    setOnTop(true); // the app is kept on top of the machine's other windows (a Mac: brought to the front)
    follow();
  }
  winInfo.onClose = () => {
    closed = true;
    clearInterval(fbTimer); ro?.disconnect(); mo.disconnect();
    if (key) post('/api/desktop/machine-app/untrack', { key }).catch(() => { }); // the device undoes the pin as the watch ends
    key = null;
    view.dispose();
  };
  start();
  return winInfo;
}

// ── WINDOW-TYPE REGISTRATION ── not persisted: a reload never re-opens a machine's screen (it asks the sign-in)
registerWindowType({ type: 'machine-app', label: 'Machine app', persist: false, icon: svgIcon16('<rect x="1.5" y="2.5" width="13" height="9" rx="1"/><rect x="4.5" y="4.5" width="7" height="5" rx=".5"/><path d="M8 11.5V14M5 14h6"/>') });
