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
// placement: 'chat' = the chat composer (src/lib/chat-input.js places btn AND chip); 'field' = a box wired with its own
// microphone (voiceField; the chip floats above the button, fixed, only while it shows); 'follow' = the focus follower's.
// DICTATION FOLLOWS THE FOCUS (lane voice-follows-focus; the owner 2026-10-21: 「我发现还是有些输入框不能用 drop line，比如说编辑或者
// 拒绝 Agent 要发的消息」 — the reject box of an agent's message had no microphone: sixteen hand-wired boxes were a fence, not a
// census). followFocus() (app.js, once) binds ONE document focusin / focusout pair: ANY editable field the person focuses —
// a textarea, a text input, a [contenteditable] — that the PURE predicate (src/voice-focus.js dictationTarget: never a
// secret field, the terminal, a read-only / disabled / hidden / data-no-dictation one) calls a target and that has no
// microphone of its own (OWN — the composer, a voiceField box) gets one: a small button in a fixed host ANCHORED to the
// field's box (PURE followPlace: outside it — never over the field, the keyboard-yield strip or the buttons beside it),
// re-placed on scroll / resize / the field's own resize, gone on blur (a recording finishes first) or when the field leaves
// the page; the field's layout and DOM never change. The words land at the caret through the same attachDictation (a
// text input / contenteditable through `boxOf`; a one-line box takes a dictated line break as a space — a dictation never
// types Enter, chat-enter-keys.js's 2026-10-14 lesson) and fire `input` (unfocused: `change` too) so the box's own rules
// run; its context = the field's label + the dialog's title or the card's words (PURE followFacts, ≤ 600 chars). A press
// on the follower's microphone or its chip is nobody else's press: a window-capture guard (bound only while one shows)
// keeps the field's focus and keeps a popover / dialog closer from reading it as an outside press.
import { t, resolveLang } from './i18n.js';
import { copyText, uiScale } from './utils.js';
import { VOICE_LIMITS, RECORDER_MIME, dictationContext, dictationMessagesOf, voiceWords } from '../voice-model.js';
import { dictationTarget, followPlace, followCandidates, followFacts, VOICE_UI } from '../voice-focus.js'; // lane voice-follows-focus: the ONE predicate + placement + facts
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

// a box with a microphone of its own (attachDictation 'chat' / 'field') — marked ON THE ELEMENT through the global symbol
// registry, so the lazy doc bundle's copy of this module (public/doc-editor.js) marks the box the main bundle's follower reads
const OWN = Symbol.for('vibespace.voice.own');

/** the box the words go into: a textarea / a text input (its value and caret; type=email has no caret API — its end) or
 *  a [contenteditable] (a Range). mark() = the cursor now, end() = the box's end; around(m) = before / after / selected;
 *  put(text, m) inserts (a FOCUSED box: insertText, its own undo; else a range edit + input/change); back(u) undoes. */
function boxOf(el) {
  const fire = (change) => { el.dispatchEvent(new Event('input', { bubbles: true })); if (change) el.dispatchEvent(new Event('change', { bubbles: true })); };
  if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
    let caret = true;
    try { caret = el.selectionStart !== null; } catch { caret = false; }
    const end = () => { const v = el.value; return { start: v.length, end: v.length, value: v }; };
    return {
      single: el.tagName === 'INPUT', end,
      text: () => el.value,
      mark: () => (caret ? { start: el.selectionStart, end: el.selectionEnd, value: el.value } : end()),
      around(m) { const v = el.value, a = m || this.mark(); return { before: v.slice(0, a.start), after: v.slice(a.end), selected: v.slice(a.start, a.end) }; },
      put(text, m, change) {
        // the stop-time cursor, unless the text changed while Dropline was writing (then: where the cursor is now)
        const a = m && m.value === el.value ? m : this.mark();
        const before = el.value;
        let via = 'range';
        if (document.activeElement === el && caret) { el.setSelectionRange(a.start, a.end); if (document.execCommand('insertText', false, text)) via = 'exec'; }
        if (via !== 'exec') {
          if (caret) el.setRangeText(text, a.start, a.end, 'end');
          else el.value = before.slice(0, a.start) + text + before.slice(a.end);
          fire(change);
        }
        return { before, after: el.value, s: a.start, e: a.end, via };
      },
      back(u) {
        if (u.via === 'exec' && document.activeElement === el) { document.execCommand('undo'); return; }
        if (el.value !== u.after) return; // typed on since — the person's text wins
        el.value = u.before;
        if (caret) el.setSelectionRange(u.s, u.e);
        fire(false);
      },
      hint(v) { if (v === undefined) return el.placeholder; el.placeholder = v; return v; },
    };
  }
  const end = () => { const r = document.createRange(); r.selectNodeContents(el); r.collapse(false); return { range: r, value: el.textContent }; };
  const span = (a, b) => { const r = document.createRange(); r.setStart(a[0], a[1]); r.setEnd(b[0], b[1]); return r.toString(); };
  return {
    single: false, end,
    text: () => el.textContent,
    mark() { const sel = document.getSelection(); if (!sel || !sel.rangeCount) return end(); const r = sel.getRangeAt(0); return el.contains(r.startContainer) && el.contains(r.endContainer) ? { range: r.cloneRange(), value: el.textContent } : end(); },
    around(m) { const a = m || this.mark(), r = a.range; return { before: span([el, 0], [r.startContainer, r.startOffset]), after: span([r.endContainer, r.endOffset], [el, el.childNodes.length]), selected: r.toString() }; },
    put(text, m, change) {
      const a = m && m.value === el.textContent ? m : this.mark();
      const sel = document.getSelection();
      if (document.activeElement === el && sel) { sel.removeAllRanges(); sel.addRange(a.range); if (document.execCommand('insertText', false, text)) return { via: 'exec' }; }
      const gone = a.range.extractContents(), node = document.createTextNode(text);
      a.range.insertNode(node);
      fire(change);
      return { via: 'range', node, gone, after: el.textContent };
    },
    back(u) {
      if (u.via === 'exec') { if (document.activeElement === el) document.execCommand('undo'); return; }
      if (!u.node.isConnected || el.textContent !== u.after) return; // typed on since — the person's text wins
      u.node.replaceWith(u.gone);
      fire(false);
    },
    hint() { return undefined; },
  };
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

export function attachDictation(textarea, { getFacts = () => ({}), getCwd = () => null, openPlugins = openPluginsDefault, placement = 'field', onIdle = null } = {}) {
  const chat = placement === 'chat', followed = placement === 'follow';
  if (!followed) textarea[OWN] = true; // its own microphone: the focus follower leaves this box to it
  const box = boxOf(textarea);
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = chat ? 'chat-attach-btn chat-voice-btn' : 'voice-btn chat-voice-btn';
  btn.title = t('Voice input (Dropline)');
  btn.innerHTML = MIC_SVG;
  try { if (followed || (window.matchMedia && window.matchMedia('(max-width: 768px)').matches)) btn.tabIndex = -1; } catch { } // the phone: never a focus stop (the desk keeps Tab); a follower's mic never is (a Tab onto it would blur its field)
  const chip = document.createElement('div');
  chip.className = chat ? 'voice-chip hidden' : 'voice-chip voice-chip-float hidden';
  chip.setAttribute('role', 'status');
  let state = 'idle';      // idle | asking | recording | waiting
  let rec = null, stream = null, chunks = [], t0 = 0, tick = null, chipTimer = null, cancelled = false, autoStopped = false;
  let audioCtx = null, analyser = null, held = null, stopSel = null, blockedUntil = 0, undo = null;
  let everFocused = document.activeElement === textarea;
  textarea.addEventListener('focus', () => { everFocused = true; }); // on the box itself — it goes with the box
  const placeholder = box.hint();
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
    if (w.action === 'unlock') act(t('Unlock'), () => { hideChip(); window.dispatchEvent(new CustomEvent('vs-vault-door')); });   // lane vault-e2e-password-fix-r2: the vault's door (src/lib/vault-unlock.js)
    if (w.action === 'undo') act(t('Undo'), () => { hideChip(); undoInsert(); });
    if (w.action === 'resend') act(t('Resend'), () => { hideChip(); if (held) send(held.blob, held.ctx); });
    const x = document.createElement('button'); x.type = 'button'; x.className = 'voice-chip-close'; x.textContent = '✕'; x.title = t('Close'); x.onclick = hideChip; chip.appendChild(x);
    chip.classList.remove('hidden');
    place();
    if (!sticky) chipTimer = setTimeout(hideChip, w.action === 'undo' ? VOICE_LIMITS.chipMs : 9000);
  }
  function hideChip() { clearTimeout(chipTimer); chip.classList.add('hidden'); if (!chat) chip.remove(); }
  /** 'field': the chip floats above the button (fixed — no box's overflow clips it), only while it shows; a followed
   *  field's microphone BELOW the field takes it below (the chip never lies over the words it just wrote) */
  function place() {
    if (chat) return;
    if (!chip.isConnected) document.body.appendChild(chip);
    const r = btn.getBoundingClientRect(), Z = uiScale() || 1;
    chip.style.right = `${Math.max(8, (window.innerWidth - r.right) / Z)}px`;
    const side = (followed && btn.parentElement && btn.parentElement.dataset.side) || '';
    if (side.startsWith('below') && r.bottom + 6 + chip.offsetHeight * Z <= window.innerHeight) { chip.style.top = `${(r.bottom + 6) / Z}px`; chip.style.bottom = 'auto'; return; }
    chip.style.top = 'auto';
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
    if (state === 'idle' && onIdle) setTimeout(onIdle, 0); // after this task: the words and the chip land first
  }

  const onKey = (e) => { if (e.key === 'Escape' && state === 'recording') { e.preventDefault(); e.stopPropagation(); cancel(); } };
  function release() {
    document.removeEventListener('keydown', onKey, true);
    clearInterval(tick); tick = null;
    try { stream && stream.getTracks().forEach((tr) => tr.stop()); } catch { }
    try { audioCtx && audioCtx.close(); } catch { }
    stream = null; audioCtx = null; analyser = null; rec = null;
    box.hint(placeholder);
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
    if (!st.connected && st.vaultLocked) { state = 'idle'; say('vault-locked', {}, { sticky: true }); return; }   // r2: the sealed sign-in — the door, never "connect"
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
    box.hint(t(voiceWords('listening').words));
    tick = setInterval(() => {
      if (!btn.isConnected) { cancel(); return; } // the box left the page (a dialog closed, a row folded): no microphone stays open
      if ((Date.now() - t0) / 1000 >= VOICE_LIMITS.autoStopSeconds) { autoStopped = true; stop(); return; }
      paint();
    }, 250);
    paint();
  }

  /** the cursor/selection AT STOP TIME + the conversation facts → the PURE context (a followed field: its label and the
   *  words around it as `text`, no conversation) */
  function contextNow() {
    const f = getFacts() || {};
    const said = f.text != null && f.messages == null ? { text: f.text } : { messages: f.messages || [] };
    return dictationContext({ title: f.title, ...box.around(stopSel), ...said, cwd: getCwd() || '' });
  }

  function stop() {
    if (state !== 'recording' || !rec) return;
    // a box never focused takes the words at its end
    stopSel = everFocused ? box.mark() : box.end();
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
    if (followed && !textarea.isConnected) return; // its field left the page while Dropline wrote (a dialog closed): nothing to land, no chip
    insert(body.text);
    const f = getFacts() || {};
    teachAfterDictation(lastStatus, { conv: f.conv || '', title: f.title || '', cwd: getCwd() || '', messages: dictationMessagesOf(f.messages || []).slice(-12), uiLang: resolveLang() }).catch(() => { });
    const rewritten = !body.rewrite || !body.rewrite.status || body.rewrite.status === 'used';
    say(autoStopped ? 'auto-stopped' : rewritten ? 'inserted' : 'raw-inserted');
    if (autoStopped) setTimeout(() => say(rewritten ? 'inserted' : 'raw-inserted'), 2500);
  }

  function insert(text) {
    if (!text) return;
    // a one-line box takes a dictated line break as a space: a dictation never types the Enter that would commit it
    if (box.single) text = text.replace(/\s*[\r\n]+\s*/g, ' ');
    const at = stopSel;
    stopSel = null;
    // never focus: a focused box (the keyboard is up, the desk) takes it as a typed edit — its own Ctrl+Z undoes it; an
    // unfocused one by a range edit + `input` (a followed field: `change` too — its own rules run as after typing)
    undo = box.put(text, at, followed);
  }
  /** the chip's Undo: the box's own undo when it holds the focus, else its text before the insertion (never a focus) */
  function undoInsert() {
    const u = undo; undo = null;
    if (u) box.back(u);
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

// ── DICTATION FOLLOWS THE FOCUS (lane voice-follows-focus) — see the head of this file ──
const followers = new WeakMap(); // a followed field → its dictation (made at its first focus, kept as long as the field lives)
let follow = null;               // the one shown: { el, d, host, ctl, ro, timer, raf }
let following = false;
// what a microphone beside a field never sits on (besides the field): what the person presses or types into, and the
// keyboard-yield strip (lane takeover-keyboard: "your keys come here")
const KEEP_CLEAR = 'button, a[href], input, textarea, select, [role="button"], [contenteditable], .chat-kbd-yield';
/** a node of the voice UI outside every box (the follower's microphone, a floating chip — src/voice-focus.js VOICE_UI): a press
 *  on it is the dictation's own (lane phone-tray-voice-done: the same selector keeps every outside-press closer off it) */
export const voiceOwns = (n) => !!(n && n.closest && n.closest(VOICE_UI));

/** the DOM facts of a focused element, for the PURE predicate (src/voice-focus.js dictationTarget) */
export function fieldFacts(el) {
  const tag = String((el && el.tagName) || '').toLowerCase();
  let box = null, opacity = null;
  try { const r = el.getBoundingClientRect(); box = { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; } catch { }
  try { opacity = Number(getComputedStyle(el).opacity); } catch { }
  const near = (sel) => { try { return !!el.closest(sel); } catch { return false; } };
  return {
    tag, type: tag === 'input' ? String(el.type || '') : '', editable: !!el.isContentEditable,
    autocomplete: (el.getAttribute && el.getAttribute('autocomplete')) || '',
    terminal: !!(el.classList && el.classList.contains('xterm-helper-textarea')) || near('.xterm'),
    disabled: !!el.disabled, readOnly: !!el.readOnly, noDictation: near('[data-no-dictation]'),
    opacity, box, view: { width: window.innerWidth, height: window.innerHeight },
  };
}

/** a followed field's context: its label, the dialog's title or the card's words (PURE followFacts bounds it) */
function factsOf(el) {
  const attr = (n) => (el.getAttribute && el.getAttribute(n)) || '';
  const by = attr('aria-labelledby').split(/\s+/).map((id) => (id ? document.getElementById(id) : null)).filter(Boolean).map((x) => x.textContent).join(' ');
  const lab = el.labels && el.labels.length ? [...el.labels].map((l) => l.innerText).join(' ') : '';
  const label = attr('aria-label') || by || lab || attr('placeholder') || attr('aria-placeholder') || attr('title');
  const dlg = el.closest('.dialog, [role="dialog"]');
  const h = dlg ? dlg.querySelector('.dialog-header h3') || dlg.querySelector('h1, h2, h3') : null;
  const dialog = dlg ? (h && h.textContent) || dlg.getAttribute('aria-label') || '' : '';
  let near = '';
  for (let p = el.parentElement, i = 0; !dialog && p && p !== document.body && i < 6; p = p.parentElement, i++) {
    const words = String(p.innerText || '').trim();
    if (words.length >= 40) { near = words; break; }
  }
  return followFacts({ label, dialog, near });
}

/** the first element under a point that is not the follower's own (its microphone, its chip) */
function underPoint(x, y) {
  try { for (const n of document.elementsFromPoint(x, y)) if (!voiceOwns(n)) return n; } catch { }
  return null;
}

function placeFollow() {
  const f = follow;
  if (!f) return;
  f.raf = 0;
  const el = f.el;
  if (!el.isConnected) { f.d.destroy(); unfollow(); return; } // the field left the page (a dialog closed): no microphone stays
  const Z = uiScale() || 1, r = el.getBoundingClientRect(), vv = window.visualViewport;
  const view = vv ? { left: vv.offsetLeft, top: vv.offsetTop, right: vv.offsetLeft + vv.width, bottom: vv.offsetTop + vv.height } : { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
  const field = { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
  // a field scrolled out of its pane or covered by something else: no microphone until it is seen again
  const cx = Math.min(Math.max(r.left + r.width / 2, view.left + 1), view.right - 1), cy = Math.min(Math.max(r.top + r.height / 2, view.top + 1), view.bottom - 1);
  const top = r.width > 0 && r.height > 0 && r.bottom > view.top && r.top < view.bottom ? underPoint(cx, cy) : null;
  f.host.hidden = !(top && (top === el || el.contains(top)));
  if (f.host.hidden) return;
  const size = (f.host.offsetHeight || 26) * Z;
  const avoid = [];
  for (const c of followCandidates({ field, size })) {
    const q = c.rect;
    for (const [x, y] of [[q.left + 1, q.top + 1], [q.right - 1, q.top + 1], [q.left + 1, q.bottom - 1], [q.right - 1, q.bottom - 1], [(q.left + q.right) / 2, (q.top + q.bottom) / 2]]) {
      const n = underPoint(x, y), o = n && n.closest ? n.closest(KEEP_CLEAR) : null;
      if (o && o !== el && !o.contains(el) && !el.contains(o)) { const b = o.getBoundingClientRect(); avoid.push({ left: b.left, top: b.top, right: b.right, bottom: b.bottom }); }
    }
  }
  const p = followPlace({ field, view, size, avoid });
  if (!p) return;
  const st = f.host.style;
  st.top = `${p.y / Z}px`;
  if (p.anchor === 'right') { st.right = `${(window.innerWidth - p.x - size) / Z}px`; st.left = 'auto'; } else { st.left = `${p.x / Z}px`; st.right = 'auto'; }
  f.host.dataset.side = p.side;
}
const followSoon = () => { if (follow && !follow.raf) follow.raf = requestAnimationFrame(placeFollow); };

function unfollow() {
  const f = follow;
  if (!f) return;
  follow = null;
  f.ctl.abort();
  try { f.ro && f.ro.disconnect(); } catch { }
  clearInterval(f.timer);
  if (f.raf) cancelAnimationFrame(f.raf);
  f.host.remove();
}

/** a dictation back to idle: its field lost the focus meanwhile ⇒ its microphone goes (another field holding it now is followed) */
function followSettled(el) {
  if (!follow || follow.el !== el || document.activeElement === el) return;
  unfollow();
  const a = document.activeElement;
  if (a && a !== document.body) followTo(a);
}

function followTo(el) {
  if (!el || el.nodeType !== 1 || voiceOwns(el)) return;
  if (follow && follow.el === el) { followSoon(); return; }
  if (follow && follow.d.state !== 'idle') return; // a recording (or the words on their way) belongs to its field: it finishes first
  const v = el[OWN] ? { ok: false, why: 'own' } : dictationTarget(fieldFacts(el));
  unfollow();
  if (!v.ok) return;
  let d = followers.get(el);
  if (!d) { d = attachDictation(el, { placement: 'follow', getFacts: () => factsOf(el), onIdle: () => followSettled(el) }); followers.set(el, d); }
  const host = document.createElement('div');
  host.className = 'voice-follow';
  host.appendChild(d.btn);
  document.body.appendChild(host);
  const ctl = new AbortController(), o = { signal: ctl.signal };
  // a press on the follower's microphone (or its chip) is nobody else's press: the field keeps its focus (the phone keyboard
  // stays) and no popover / dialog closer reads it as an outside press — window capture runs before their document capture
  // (utils.js onOutsidePress); a cancelled pointerdown fires no compatibility mousedown (§59: no mousedown listener here)
  const guard = (e) => { if (voiceOwns(e.target)) { e.preventDefault(); e.stopPropagation(); } };
  window.addEventListener('pointerdown', guard, { capture: true, ...o });
  window.addEventListener('scroll', followSoon, { capture: true, passive: true, ...o });
  window.addEventListener('resize', followSoon, o);
  if (window.visualViewport) { window.visualViewport.addEventListener('resize', followSoon, o); window.visualViewport.addEventListener('scroll', followSoon, o); }
  let ro = null;
  try { ro = new ResizeObserver(followSoon); ro.observe(el); } catch { }
  // a field removed without a blur, a pane that moved without a scroll: looked at four times a second while one shows
  const timer = setInterval(followSoon, 250);
  follow = { el, d, host, ctl, ro, timer, raf: 0 };
  placeFollow();
}

/** ONE document focusin / focusout pair for the page's life (app.js calls it once): the microphone follows the focus */
export function followFocus() {
  if (following || typeof document === 'undefined') return false;
  following = true;
  bindAvailability();
  document.addEventListener('focusin', (e) => followTo(e.target));
  document.addEventListener('focusout', (e) => {
    if (!follow || e.target !== follow.el) return;
    setTimeout(() => { if (follow && follow.el === e.target && document.activeElement !== follow.el && follow.d.state === 'idle') unfollow(); }, 0);
  });
  return true;
}
