// The microphone on EVERY message box (Dropline voice input, design q-029 D5 + §5; P0; lane voice-everywhere, owner
// 2026-10-13 "每个输入框都做一下 Dropline"). ONE attach point: attachDictation(textarea, {getFacts, getCwd, openPlugins,
// placement}) → {btn, chip, destroy}; the box's owner puts `btn` where its grammar says (voiceField wraps the box and
// the button: the mic inside the box's trailing edge). Click to start, click again to stop: the button turns into the
// capsule "● 0:12 ▮▮▮ ✕" (✕ or Esc cancels — no request), 170 s stops by itself; the recording (MediaRecorder
// audio/webm;codecs=opus, 32 kbps) goes to the HUB (/api/voice/dictate — the token never reaches a browser) with the
// PURE context of src/voice-model.js, and the answer lands at the cursor the box HAD when the person stopped (a
// selection is replaced; a box never focused takes it at its end). A 5-s chip "Inserted · Undo" follows. Every
// failure says its sentence (voiceWords). A page that is not a secure context has no microphone: the press says so
// and offers the localhost address — and never calls getUserMedia.
// THE MIC NEVER FOCUSES THE BOX (owner: a tap that opens the phone keyboard is a mis-tap): pointerdown/mousedown are
// cancelled, the button is out of the phone's tab order, and nothing is ever focused or blurred by it — a FOCUSED box
// (the keyboard already up, or the desk) takes the words by execCommand('insertText') so its own Ctrl+Z undoes them,
// an unfocused box by setRangeText (the chip's Undo puts its old text back).
// ABSENT, never greyed: voice input off or no Dropline connected ⇒ every microphone on the page is gone (ONE class,
// html.voice-absent — no per-box listener): /api/voice/status at the first attach, the plugins-updated broadcast
// (noteVoicePlugins, app.js), every other status read (noteVoiceStatus). An idle microphone holds NO document
// listener (Esc is bound only while it records), so a box dropped without destroy() leaks nothing.
// placement: 'chat' = the chat composer (src/lib/chat-input.js places btn AND chip); 'field' = everywhere else (the
// chip floats above the button, fixed, only while it shows).
import { t, resolveLang } from './i18n.js';
import { copyText, uiScale } from './utils.js';
import { VOICE_LIMITS, RECORDER_MIME, dictationContext, dictationMessagesOf, voiceWords } from '../voice-model.js';
import { teachAfterDictation } from './voice-teach-ui.js'; // P1: teach / context — only when the person turned them on

const MIC_SVG = '<svg viewBox="0 0 16 16" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="5.5" y="1.5" width="5" height="8" rx="2.5"/><path d="M3 7.5a5 5 0 0 0 10 0M8 12.5v2M5.5 14.5h5"/></svg>';
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

// ── is there a microphone at all? ONE fact for the whole page (unknown = absent until the first answer) ──
let voiceOn = false, voiceKnown = false, askedAt = 0, visBound = false;
function paintAvailability() { try { document.documentElement.classList.toggle('voice-absent', !voiceOn); } catch { } }
/** an /api/voice/status answer, from any reader: on = the plugin switched on AND Dropline connected */
export function noteVoiceStatus(st) {
  if (!st || typeof st !== 'object' || st.error) return;
  voiceOn = st.on !== undefined ? !!st.on : !!(st.enabled && st.connected);
  voiceKnown = true;
  paintAvailability();
}
/** the plugins-updated broadcast (app.js): the voice-input row's `enabled` = switched on AND keyed (src/plugins/voice-input.js) */
export function noteVoicePlugins(plugins) {
  const row = Array.isArray(plugins) ? plugins.find((p) => p && p.id === 'voice-input') : null;
  if (!row) return;
  voiceOn = !!row.enabled;
  voiceKnown = true;
  paintAvailability();
}
function askAvailability() {
  if (Date.now() - askedAt < 30e3) return; // one read per 30 s however many boxes attach
  askedAt = Date.now();
  fetch('/api/voice/status').then((r) => r.json()).then(noteVoiceStatus).catch(() => { askedAt = 0; });
}
function bindAvailability() {
  try {
    if (!voiceKnown) paintAvailability();
    askAvailability();
    if (visBound) return;
    visBound = true; // ONE page-lifetime listener for every box: a tab coming back re-reads the fact
    document.addEventListener('visibilitychange', () => { if (!document.hidden) askAvailability(); });
  } catch { }
}

/** the box and its microphone as ONE field — the mic inside the box's trailing edge (takes the box's place if it has one) */
export function voiceField(textarea, d, cls = '') {
  const f = document.createElement('div');
  f.className = cls ? `voice-field ${cls}` : 'voice-field';
  if (textarea.parentNode) textarea.parentNode.insertBefore(f, textarea);
  f.append(textarea, d.btn);
  // a box the person can resize keeps its drag grip free: the mic steps left of the bottom-right corner (read once laid out)
  try { requestAnimationFrame(() => { if (textarea.isConnected && getComputedStyle(textarea).resize !== 'none') f.classList.add('voice-field-grip'); }); } catch { }
  return f;
}

/** the chat composer's flavour (src/lib/chat-input.js places btn and chip itself) */
export function createVoiceInput({ textarea, getFacts, getCwd, openPlugins }) {
  return attachDictation(textarea, { getFacts, getCwd, openPlugins, placement: 'chat' });
}

const openPluginsDefault = () => { const a = globalThis.app; if (a && typeof a.openPluginsDialog === 'function') a.openPluginsDialog(); };

export function attachDictation(textarea, { getFacts = () => ({}), getCwd = () => null, openPlugins = openPluginsDefault, placement = 'field' } = {}) {
  const chat = placement === 'chat';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = chat ? 'chat-attach-btn chat-voice-btn' : 'voice-btn chat-voice-btn';
  btn.title = t('Voice input (Dropline)');
  btn.innerHTML = MIC_SVG;
  try { if (window.matchMedia && window.matchMedia('(max-width: 768px)').matches) btn.tabIndex = -1; } catch { } // the phone: never a focus stop (the desk keeps Tab)
  const chip = document.createElement('div');
  chip.className = chat ? 'voice-chip hidden' : 'voice-chip voice-chip-float hidden';
  chip.setAttribute('role', 'status');
  let state = 'idle';      // idle | asking | recording | waiting
  let rec = null, stream = null, chunks = [], t0 = 0, tick = null, chipTimer = null, cancelled = false, autoStopped = false;
  let audioCtx = null, analyser = null, held = null, stopSel = null, blockedUntil = 0, undo = null;
  let everFocused = document.activeElement === textarea;
  textarea.addEventListener('focus', () => { everFocused = true; }); // on the box itself — it goes with the box
  const placeholder = textarea.placeholder;
  bindAvailability();

  let lastStatus = null; // the /api/voice/status answer of this recording (teach / context switches)
  function say(code, params = {}, { sticky = false } = {}) {
    const w = voiceWords(code, params);
    clearTimeout(chipTimer);
    chip.innerHTML = '';
    chip.dataset.code = w.code;
    const txt = document.createElement('span');
    txt.className = 'voice-chip-text';
    txt.textContent = t(w.words, params);
    chip.appendChild(txt);
    const act = (label, fn) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'voice-chip-btn'; b.textContent = label; b.onclick = fn; chip.appendChild(b); };
    if (w.action === 'copy-url') act(t('Copy'), () => { copyText(params.url); });
    if (w.action === 'open-plugin') act(t('Open Plugins'), () => { hideChip(); openPlugins(); });
    if (w.action === 'undo') act(t('Undo'), () => { hideChip(); undoInsert(); });
    if (w.action === 'resend') act(t('Resend'), () => { hideChip(); if (held) send(held.blob, held.ctx); });
    const x = document.createElement('button'); x.type = 'button'; x.className = 'voice-chip-close'; x.textContent = '✕'; x.title = t('Close'); x.onclick = hideChip; chip.appendChild(x);
    chip.classList.remove('hidden');
    place();
    if (!sticky) chipTimer = setTimeout(hideChip, w.action === 'undo' ? VOICE_LIMITS.chipMs : 9000);
  }
  function hideChip() { clearTimeout(chipTimer); chip.classList.add('hidden'); if (!chat) chip.remove(); }
  /** 'field': the chip floats above the button (fixed — no box's overflow clips it), only while it shows */
  function place() {
    if (chat) return;
    if (!chip.isConnected) document.body.appendChild(chip);
    const r = btn.getBoundingClientRect(), Z = uiScale() || 1;
    chip.style.right = `${Math.max(8, (window.innerWidth - r.right) / Z)}px`;
    chip.style.bottom = `${Math.max(8, (window.innerHeight - r.top + 6) / Z)}px`;
  }
  // a press on the chip (Undo, Copy, ✕) never takes the focus from the box either — and a floating chip is never an
  // "outside press" that closes the popover / dialog its box lives in
  for (const ev of ['pointerdown', 'mousedown', 'click']) chip.addEventListener(ev, (e) => { if (ev !== 'click') e.preventDefault(); if (!chat) e.stopPropagation(); });

  function paint() {
    btn.classList.toggle('recording', state === 'recording');
    btn.classList.toggle('waiting', state === 'waiting');
    if (state === 'recording') {
      const secs = (Date.now() - t0) / 1000;
      let lvl = 0;
      if (analyser) { const a = new Uint8Array(analyser.fftSize); analyser.getByteTimeDomainData(a); let m = 0; for (const v of a) m = Math.max(m, Math.abs(v - 128)); lvl = Math.min(3, Math.ceil(m / 16)); }
      btn.innerHTML = `<span class="voice-dot">●</span><span class="voice-time">${fmt(secs)}</span><span class="voice-bars">${[1, 2, 3].map((i) => `<i class="${i <= lvl ? 'on' : ''}"></i>`).join('')}</span><span class="voice-cancel" title="${t('Cancel')}">✕</span>`;
      btn.title = t('Click to stop and insert');
    } else if (state === 'waiting') {
      btn.innerHTML = '<span class="voice-spin"></span>';
      btn.title = t(voiceWords('waiting').words);
    } else { btn.innerHTML = MIC_SVG; btn.title = t('Voice input (Dropline)'); }
  }

  const onKey = (e) => { if (e.key === 'Escape' && state === 'recording') { e.preventDefault(); e.stopPropagation(); cancel(); } };
  function release() {
    document.removeEventListener('keydown', onKey, true);
    clearInterval(tick); tick = null;
    try { stream && stream.getTracks().forEach((tr) => tr.stop()); } catch { }
    try { audioCtx && audioCtx.close(); } catch { }
    stream = null; audioCtx = null; analyser = null; rec = null;
    textarea.placeholder = placeholder;
  }

  async function start() {
    if (Date.now() < blockedUntil) { say('rate-limited', { n: Math.ceil((blockedUntil - Date.now()) / 1000) }); return; }
    // no secure context ⇒ no navigator.mediaDevices: say it and stop — getUserMedia is never called
    if (!window.isSecureContext || !navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
      say('insecure', { url: `http://localhost:${location.port || '80'}` }, { sticky: true });
      return;
    }
    state = 'asking';
    let st = null;
    try { st = await (await fetch('/api/voice/status')).json(); } catch { }
    lastStatus = st;
    if (!st) { state = 'idle'; say('offline'); return; }
    if (!st.connected || !st.enabled) { state = 'idle'; say(st.connected ? 'plugin-off' : 'not-connected', {}, { sticky: true }); return; }
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch (e) {
      state = 'idle'; release();
      say(e && (e.name === 'NotFoundError' || e.name === 'OverconstrainedError') ? 'no-mic' : 'denied', {}, { sticky: true });
      return;
    }
    chunks = []; cancelled = false; autoStopped = false; hideChip();
    const opts = { audioBitsPerSecond: VOICE_LIMITS.bitsPerSecond };
    try { if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(RECORDER_MIME)) opts.mimeType = RECORDER_MIME; } catch { }
    rec = new MediaRecorder(stream, opts);
    rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    rec.onstop = () => {
      const type = (rec && rec.mimeType) || RECORDER_MIME;
      const blob = new Blob(chunks, { type });
      const wasCancelled = cancelled;
      release();
      if (wasCancelled || !blob.size) { state = 'idle'; paint(); return; }
      const ctx = contextNow();
      send(blob, ctx);
    };
    try { audioCtx = new AudioContext(); analyser = audioCtx.createAnalyser(); analyser.fftSize = 256; audioCtx.createMediaStreamSource(stream).connect(analyser); } catch { analyser = null; }
    rec.start(250);
    document.addEventListener('keydown', onKey, true); // Esc cancels — bound only while recording
    t0 = Date.now(); state = 'recording';
    textarea.placeholder = t(voiceWords('listening').words);
    tick = setInterval(() => {
      if (!btn.isConnected) { cancel(); return; } // the box left the page (a dialog closed, a row folded): no microphone stays open
      if ((Date.now() - t0) / 1000 >= VOICE_LIMITS.autoStopSeconds) { autoStopped = true; stop(); return; }
      paint();
    }, 250);
    paint();
  }

  /** the cursor/selection AT STOP TIME + the conversation facts → the PURE context */
  function contextNow() {
    const v = textarea.value;
    const s = stopSel ? stopSel.start : textarea.selectionStart, e = stopSel ? stopSel.end : textarea.selectionEnd;
    const f = getFacts() || {};
    return dictationContext({ title: f.title, before: v.slice(0, s), after: v.slice(e), selected: v.slice(s, e), messages: f.messages || [], cwd: getCwd() || '' });
  }

  function stop() {
    if (state !== 'recording' || !rec) return;
    const n = textarea.value.length; // a box never focused takes the words at its end
    stopSel = everFocused ? { start: textarea.selectionStart, end: textarea.selectionEnd, value: textarea.value } : { start: n, end: n, value: textarea.value };
    state = 'waiting'; paint();
    try { rec.stop(); } catch { release(); state = 'idle'; paint(); }
  }

  function cancel() {
    if (state !== 'recording' || !rec) return;
    cancelled = true; stopSel = null;
    try { rec.stop(); } catch { release(); }
    state = 'idle'; paint();
  }

  async function send(blob, ctx) {
    state = 'waiting'; paint();
    const fd = new FormData();
    fd.append('ctx', JSON.stringify(ctx));
    fd.append('uiLang', resolveLang());
    fd.append('audio', blob, 'dictation.webm');
    let res = null, body = null;
    try { res = await fetch('/api/voice/dictate', { method: 'POST', body: fd }); body = await res.json().catch(() => null); } catch { res = null; }
    state = 'idle'; paint();
    if (!res) { held = { blob, ctx }; setTimeout(() => { if (held && held.blob === blob) held = null; }, VOICE_LIMITS.keepBlobMs); say('offline', {}, { sticky: true }); return; }
    held = null;
    if (!res.ok || !body || typeof body.text !== 'string') {
      const code = (body && body.error) || 'failed';
      const n = Number((body && body.retryAfter) || res.headers.get('retry-after')) || 0;
      if (code === 'rate-limited' && n) blockedUntil = Date.now() + n * 1000;
      say(code, { n });
      return;
    }
    insert(body.text);
    const f = getFacts() || {};
    teachAfterDictation(lastStatus, { conv: f.conv || '', title: f.title || '', cwd: getCwd() || '', messages: dictationMessagesOf(f.messages || []).slice(-12), uiLang: resolveLang() }).catch(() => { });
    const rewritten = !body.rewrite || !body.rewrite.status || body.rewrite.status === 'used';
    say(autoStopped ? 'auto-stopped' : rewritten ? 'inserted' : 'raw-inserted');
    if (autoStopped) setTimeout(() => say(rewritten ? 'inserted' : 'raw-inserted'), 2500);
  }

  function insert(text) {
    if (!text) return;
    // the stop-time cursor, unless the text changed while Dropline was writing (then: where the cursor is now)
    let s = textarea.selectionStart, e = textarea.selectionEnd;
    if (stopSel && stopSel.value === textarea.value) { s = stopSel.start; e = stopSel.end; }
    stopSel = null;
    const before = textarea.value;
    let via = 'range';
    // never focus: a focused box (the keyboard is up, the desk) takes it as a typed edit — its own Ctrl+Z undoes it
    if (document.activeElement === textarea) { textarea.setSelectionRange(s, e); if (document.execCommand('insertText', false, text)) via = 'exec'; }
    if (via !== 'exec') {
      textarea.setRangeText(text, s, e, 'end');
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    }
    undo = { before, after: textarea.value, s, e, via };
  }
  /** the chip's Undo: the box's own undo when it holds the focus, else its text before the insertion (never a focus) */
  function undoInsert() {
    const u = undo; undo = null;
    if (!u) return;
    if (u.via === 'exec' && document.activeElement === textarea) { document.execCommand('undo'); return; }
    if (textarea.value !== u.after) return; // typed on since — the person's text wins
    textarea.value = u.before;
    textarea.setSelectionRange(u.s, u.e);
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  }

  // THE MIC NEVER FOCUSES THE BOX: no focus moves on the press (the box keeps its cursor + selection, the phone
  // keyboard neither opens nor folds); recording starts on click
  const hold = (e) => e.preventDefault();
  btn.addEventListener('pointerdown', hold);
  btn.addEventListener('mousedown', hold);
  btn.onclick = (e) => {
    e.preventDefault();
    if (state === 'recording') { if (e.target && e.target.closest && e.target.closest('.voice-cancel')) cancel(); else stop(); return; }
    if (state === 'idle') start();
  };
  return { btn, chip, destroy() { cancel(); release(); hideChip(); }, get state() { return state; } };
}
