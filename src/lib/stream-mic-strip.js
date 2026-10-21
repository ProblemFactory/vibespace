// lane stream-mic-road (backlog B-7af0 — the measured road: lane stream-mic-wheel-probe): THE STRIP'S 「麦克风」 — the viewer's
// microphone to a paired machine's apps. The ONE strip of a machine's desktop stream (src/lib/machine-desktop.js — a phone shows
// the same strip). The decisions are PURE src/mic-model.js (micStep: the toggle's verdict table; micRoadWords: what it says):
//   • muted until pressed; a press asks the browser (its own prompt; echo cancellation ON, mono — MIC_CONSTRAINTS) and puts the
//     track on the stream's audio m-line (`view.setMic` — replaceTrack, no renegotiation); live = the red dot
//   • it stops with the window, a lock (this page hidden — a phone's lock, a minimized window), a press, the stream's end or the
//     track's own end; a RESTORED window never re-opens it by itself (nothing about it is remembered)
//   • while live it says WHERE the voice goes — the machine's own word from the stream's numbers (`mic` — where it IS writing),
//     else the facts (GET …/mic): 「你的声音 → 本机应用的麦克风『…』」, or (no virtual microphone yet) 「对方电脑会从扬声器播放你的
//     声音」 every time that road is in force, with 「安装虚拟麦克风…」 as the door
//   • the button shows only once a stream offered the m-line (an older agent offers none: no dead toggle)
import { t } from './i18n.js';
import { fetchJson, showToast } from './utils.js';
import { micStep, micAskCode, micRoadWords, micDefaultDoors, MIC_CONSTRAINTS } from '../mic-model.js';

const MIC_SVG = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false"><rect x="5.5" y="1.5" width="5" height="8.5" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M3 7.5a5 5 0 0 0 10 0M8 12.5V14.5M5.5 14.5h5" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>';
/** The refusal words by the toggle's code (micAskCode / the m-line's absence). */
export function micRefusalText(code) {
  if (code === 'insecure') return t('This page is not https, so the browser gives it no microphone — open VibeSpace at its https address');
  if (code === 'denied') return t('The browser refused the microphone — allow it in the site permissions in the address bar');
  if (code === 'no_device') return t('No microphone was found on this device');
  if (code === 'busy') return t('The microphone is busy in another app — close it there, then press again');
  if (code === 'no_mline') return t('This stream has no microphone — the agent on that machine is too old (reconnect it to upgrade)');
  if (code === 'attach_failed') return t('The microphone could not join the stream — press again');
  return t('The browser gave no microphone');
}

/** `carrier()` = the stream view the voice rides (null while none plays); `install()` = the 「安装虚拟麦克风…」 door.
 *  → { el, ready(view, ok), ended(view), dispose(), get state() } */
export function createMicToggle({ hostId, strip, before = null, install = null, getUserMedia = null, secure = () => (typeof window === 'undefined' || window.isSecureContext !== false), doc = typeof document !== 'undefined' ? document : null } = {}) {
  let st = { state: 'off' }, track = null, view = null, facts = null, askSeq = 0, disposed = false, factsAsked = false, said = '';
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'desktop-strip-btn desktop-strip-mic'; b.hidden = true; b.setAttribute('aria-pressed', 'false');
  b.innerHTML = `${MIC_SVG}<span class="desktop-strip-mic-label"></span><span class="desktop-strip-mic-dot" hidden></span>`;
  b.querySelector('.desktop-strip-mic-label').textContent = t('Microphone');
  const dot = b.querySelector('.desktop-strip-mic-dot');
  const words = document.createElement('span'); words.className = 'desktop-strip-mic-road'; words.hidden = true;
  const wordsText = document.createElement('span');
  const door = document.createElement('button'); door.type = 'button'; door.className = 'desktop-strip-mic-install'; door.textContent = t('Install a virtual microphone…'); door.hidden = true;
  door.onclick = () => { try { install?.(); } catch { /* the shell's */ } };
  words.append(wordsText, door);
  strip.insertBefore(b, before && before.parentNode === strip ? before : null);
  strip.insertBefore(words, before && before.parentNode === strip ? before : null);
  const ask = getUserMedia || ((c) => navigator.mediaDevices.getUserMedia(c));
  const readFacts = async () => { factsAsked = true; const r = await fetchJson(`/api/desktop/machine-desktop/mic?host=${encodeURIComponent(hostId)}`); if (!disposed && r && !r.error) { facts = r; draw(); } };
  /** Where the voice goes: the machine's own word while it writes (the stream's numbers), else the facts' verdict. */
  function road() {
    const live = view && typeof view.agent === 'function' && view.agent() ? view.agent().mic : null;
    const now = live && live.state === 'live' ? { to: live.to, mic: live.mic } : live && live.state === 'no_target' && live.code === 'no_ffmpeg' ? { state: live.state, code: live.code } : null; // lane ci-339-reds: its refusal by name
    if (!facts && !now) return null;
    return micRoadWords(facts ? facts.state : null, now);
  }
  function draw() {
    const on = st.state === 'live';
    b.setAttribute('aria-pressed', String(on));
    b.classList.toggle('is-live', on);
    b.classList.toggle('is-asking', st.state === 'asking');
    dot.hidden = !on;
    const r = road();
    if (on && r) {
      wordsText.textContent = t(r.key, r.params) + (r.note ? ` · ${t(r.note.key, r.note.params)}` : '');
      door.hidden = !(r.road === 'speakers' && install);
      words.hidden = false;
      words.dataset.road = r.road || '';
    } else { words.hidden = true; door.hidden = true; }
    b.title = on ? t('Microphone on — press to turn it off') + (r ? `\n${t(r.key, r.params)}` : '')
      : st.state === 'refused' || st.state === 'unavailable' ? micRefusalText(st.code)
        : t('Speak to this machine’s apps — off until you press it; it stops when you close the window, lock or hide this page, or press again');
  }
  function stopTrack() { if (track) { try { track.onended = null; track.stop(); } catch { /* gone */ } track = null; } }
  function run(r) {
    st = { state: r.state, code: r.code };
    if (r.action === 'ask') {
      const mine = ++askSeq;
      let p;
      try { p = Promise.resolve(ask(MIC_CONSTRAINTS)); } catch (e) { p = Promise.reject(e); }
      p.then((ms) => {
        const tr = ms && typeof ms.getAudioTracks === 'function' ? ms.getAudioTracks()[0] : null;
        if (mine !== askSeq || st.state !== 'asking' || disposed) { if (ms) for (const x of ms.getTracks()) x.stop(); return; } // pressed again / closed while the browser asked
        if (!tr) { run(micStep(st, { type: 'denied', code: 'no_device' })); return; }
        track = tr;
        tr.onended = () => run(micStep(st, { type: 'track_ended' }));
        run(micStep(st, { type: 'granted' }));
      }, (e) => { if (mine === askSeq && !disposed) run(micStep(st, { type: 'denied', code: micAskCode(e && e.name, secure()) })); });
    } else if (r.action === 'attach') {
      const v = view, tr = track;
      (v ? v.setMic(tr) : Promise.resolve(false)).then((ok) => { if (!ok && track === tr && st.state === 'live') { stopTrack(); st = { state: 'refused', code: 'attach_failed' }; draw(); showToast(micRefusalText('attach_failed'), { type: 'error' }); } });
      if (!factsAsked) readFacts();
    } else if (r.action === 'stop' || r.action === 'cancel') {
      askSeq++;
      if (view) view.setMic(null).catch?.(() => { });
      stopTrack();
    }
    if (st.state === 'refused' || st.state === 'unavailable') { const w = micRefusalText(st.code); if (w !== said) { said = w; showToast(w, { type: 'error' }); } } else said = '';
    draw();
  }
  b.onclick = () => run(micStep(st, { type: 'press', ready: !!(view && view.micReady), code: view ? 'no_mline' : 'no_mline' }));
  const onHidden = () => { if (doc && doc.visibilityState === 'hidden' && (st.state === 'live' || st.state === 'asking')) run(micStep(st, { type: 'lock' })); };
  doc?.addEventListener?.('visibilitychange', onHidden);
  const tick = setInterval(() => { if (st.state === 'live') draw(); }, 2000); // the machine's word follows the stream's numbers
  draw();
  return {
    el: b,
    get state() { return st.state; },
    /** A stream view answered its offer: `ok` = it carries the microphone's m-line. The first that does carries the voice. */
    ready(v, ok) {
      if (disposed) return;
      if (ok && (!view || view === v)) { view = v; b.hidden = false; if (!factsAsked) readFacts(); if (st.state === 'live' && track) v.setMic(track); }
      else if (!ok && view === v) { run(micStep(st, { type: 'stream_end' })); view = null; b.hidden = true; }
      draw();
    },
    /** That stream ended (a fallback, a switch, its window): the voice stops with it. */
    ended(v) { if (disposed || !v || v !== view) return; run(micStep(st, { type: 'stream_end' })); view = null; b.hidden = true; draw(); },
    dispose() { if (disposed) return; run(micStep(st, { type: 'close' })); disposed = true; clearInterval(tick); doc?.removeEventListener?.('visibilitychange', onHidden); b.remove(); words.remove(); },
  };
}

/** THE MACHINES CARD'S MICROPHONE ROW (Leg 4 items 1, 4, 5, 6 — src/lib/machine-desktop.js showMachineDesktopDialog): the
 *  machine's virtual microphone said in one line, and its doors — 「安装虚拟麦克风…」 when there is none (the setup row, the
 *  plan shown first), 「设为默认麦克风」 / 「改回」 (for apps that only use the default), 「移除虚拟麦克风…」 (what goes away is said
 *  in the plan). `install(what)` opens the install dialog. → { el, refresh() } */
export function createMicCard({ hostId, machine, install = null } = {}) {
  const row = document.createElement('div'); row.className = 'machine-mic-row';
  const line = document.createElement('span'); line.className = 'machine-mic-state';
  const acts = document.createElement('span'); acts.className = 'machine-mic-acts';
  row.append(line, acts);
  const mk = (cls, label, fn) => { const x = document.createElement('button'); x.type = 'button'; x.className = cls; x.textContent = label; x.onclick = fn; return x; };
  let busy = false;
  async function setDefault(to) {
    if (busy) return; busy = true;
    const r = await fetchJson('/api/desktop/machine-desktop/mic/default', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ host: hostId, to }) });
    busy = false;
    if (!r || r.error) { showToast((r && r.error) || t('server unreachable'), { type: 'error' }); return; }
    showToast(t('The default microphone of {machine} is now «{name}»', { machine, name: (r.device && r.device.name) || '' }));
    draw(r);
  }
  function draw(r) {
    acts.replaceChildren(); row.hidden = false; line.classList.toggle('is-bad', false);
    if (!r || r.error) {
      if (r && r.code === 'not_desktop_machine') { row.hidden = true; return; }
      line.textContent = r && r.code === 'host_needs_daemon' ? t('The VibeSpace agent on {machine} is too old for the microphone — reconnect it to upgrade', { machine }) : t('Could not read the microphone: {why}', { why: (r && r.error) || t('server unreachable') });
      line.classList.toggle('is-bad', true); return;
    }
    const st = r.state || {}, doors = r.doors || micDefaultDoors(st, r.facts && r.facts.previous);
    if (st.state === 'unsupported') { row.hidden = true; return; }
    const name = (st.mic && st.mic.name) || '';
    const w = micRoadWords(st);
    if (st.state === 'installed' || st.state === 'reboot_owed') line.textContent = (st.micIsDefault ? t('Virtual microphone: «{name}» (the default microphone)', { name }) : t('Virtual microphone: «{name}»', { name })) + (w.note ? ` · ${t(w.note.key, w.note.params)}` : '');
    else if (st.state === 'absent') line.textContent = t('No virtual microphone — your voice plays on its speakers');
    else if (st.state === 'inactive') line.textContent = t('VB-CABLE is installed, but its devices are turned off in Windows’ sound settings');
    else { line.textContent = st.error || t('This machine did not say where your voice would go'); line.classList.toggle('is-bad', true); }
    if (st.state === 'absent' && install) acts.append(mk('btn-create machine-mic-install', t('Install a virtual microphone…'), () => install('virtual-mic')));
    if (doors.make) acts.append(mk('file-tool-btn machine-mic-default', t('Make it the default microphone'), () => setDefault('virtual')));
    if (doors.restore) acts.append(mk('file-tool-btn machine-mic-restore', t('Change it back'), () => setDefault('restore')));
    if ((st.state === 'installed' || st.state === 'reboot_owed' || st.state === 'inactive') && install) acts.append(mk('file-tool-btn machine-mic-remove', t('Remove the virtual microphone…'), () => install('virtual-mic-remove')));
  }
  async function refresh({ force = false } = {}) {
    line.textContent = t('Reading the microphone…');
    const r = await fetchJson(`/api/desktop/machine-desktop/mic?host=${encodeURIComponent(hostId)}${force ? '&force=1' : ''}`);
    draw(r);
  }
  return { el: row, refresh };
}
