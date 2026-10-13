// The chat box's microphone (Dropline voice input, design q-029 D5 + §5; P0). Click to start, click again to stop:
// the button turns into the capsule "● 0:12 ▮▮▮ ✕" (✕ or Esc cancels — no request), 170 s stops by itself; the
// recording (MediaRecorder audio/webm;codecs=opus, 32 kbps) goes to the HUB (/api/voice/dictate — the token never
// reaches a browser) with the PURE context of src/voice-model.js, and the answer is inserted with
// execCommand('insertText') at the cursor the person had WHEN THEY STOPPED (a selection is replaced), so the
// textarea's own Ctrl+Z undoes it; a 5-s chip "Inserted · Undo" follows. Every failure says its sentence
// (voiceWords). A page that is not a secure context has no microphone: the press says so and offers the localhost
// address — and never calls getUserMedia.
import { t, resolveLang } from './i18n.js';
import { copyText } from './utils.js';
import { VOICE_LIMITS, RECORDER_MIME, dictationContext, dictationMessagesOf, voiceWords } from '../voice-model.js';
import { teachAfterDictation } from './voice-teach-ui.js'; // P1: teach / context — only when the person turned them on

const MIC_SVG = '<svg viewBox="0 0 16 16" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="5.5" y="1.5" width="5" height="8" rx="2.5"/><path d="M3 7.5a5 5 0 0 0 10 0M8 12.5v2M5.5 14.5h5"/></svg>';
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export function createVoiceInput({ textarea, getFacts = () => ({}), getCwd = () => null, openPlugins = () => {} }) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'chat-attach-btn chat-voice-btn';
  btn.title = t('Voice input (Dropline)');
  btn.innerHTML = MIC_SVG;
  const chip = document.createElement('div');
  chip.className = 'voice-chip hidden';
  chip.setAttribute('role', 'status');
  let state = 'idle';      // idle | asking | recording | waiting
  let rec = null, stream = null, chunks = [], t0 = 0, tick = null, chipTimer = null, cancelled = false, autoStopped = false;
  let audioCtx = null, analyser = null, held = null, stopSel = null, blockedUntil = 0;
  const placeholder = textarea.placeholder;

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
    if (w.action === 'undo') act(t('Undo'), () => { textarea.focus(); document.execCommand('undo'); hideChip(); });
    if (w.action === 'resend') act(t('Resend'), () => { hideChip(); if (held) send(held.blob, held.ctx); });
    const x = document.createElement('button'); x.type = 'button'; x.className = 'voice-chip-close'; x.textContent = '✕'; x.title = t('Close'); x.onclick = hideChip; chip.appendChild(x);
    chip.classList.remove('hidden');
    if (!sticky) chipTimer = setTimeout(hideChip, w.action === 'undo' ? VOICE_LIMITS.chipMs : 9000);
  }
  function hideChip() { clearTimeout(chipTimer); chip.classList.add('hidden'); }

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

  function release() {
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
    t0 = Date.now(); state = 'recording';
    textarea.placeholder = t(voiceWords('listening').words);
    tick = setInterval(() => {
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
    stopSel = { start: textarea.selectionStart, end: textarea.selectionEnd, value: textarea.value };
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
    textarea.focus();
    // the stop-time cursor, unless the text changed while Dropline was writing (then: where the cursor is now)
    if (stopSel && stopSel.value === textarea.value) textarea.setSelectionRange(stopSel.start, stopSel.end);
    stopSel = null;
    if (!document.execCommand('insertText', false, text)) {
      textarea.setRangeText(text, textarea.selectionStart, textarea.selectionEnd, 'end');
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  btn.addEventListener('mousedown', (e) => e.preventDefault()); // keep the textarea's cursor + selection
  btn.onclick = (e) => {
    e.preventDefault();
    if (state === 'recording') { if (e.target && e.target.closest && e.target.closest('.voice-cancel')) cancel(); else stop(); return; }
    if (state === 'idle') start();
  };
  const onKey = (e) => { if (e.key === 'Escape' && state === 'recording') { e.preventDefault(); e.stopPropagation(); cancel(); } };
  document.addEventListener('keydown', onKey, true);
  return { btn, chip, destroy() { document.removeEventListener('keydown', onKey, true); cancel(); release(); hideChip(); }, get state() { return state; } };
}
