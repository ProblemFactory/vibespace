// 「取得 FFmpeg」 — THE DOOR ON THE LINE (lane machine-needs-at-pairing pick 2; 主开发's law 5: a need that a program meets with no
// rights runs AT ONCE, on the line that states it, and says what it fetched — no dialog; people only: the route refuses an agent).
// Every surface that says a Windows machine has no usable ffmpeg draws THIS button: the desktop window's strip (the stream, the
// sound, the microphone), one app's own window, and the machine's desktop dialog. The plan is the PURE row src/ffmpeg-install.js:
// the machine fetches it from the publisher (a fixed address, two pinned SHA-256s) into its own folder — the hub carries no bytes.
// Shown only when NO candidate passes (主开发's Q6: a machine whose own ffmpeg passes keeps it; nothing is fetched).
import { t } from './i18n.js';
import { fetchJson } from './utils.js';
import { FFMPEG, FFMPEG_FOLDER } from '../ffmpeg-install.js';

const MB = (n) => Math.round(n / 1e6);
/** The button's words: the build, its publisher, its size. */
export const ffmpegDoorLabel = () => t('Get {app} ({publisher}, {mb} MB)', { app: FFMPEG.label, publisher: FFMPEG.publisher, mb: MB(FFMPEG.bytes) });
/** Its title: where it lands, how its bytes are checked, that nobody signs it. */
export const ffmpegDoorTitle = () => t('That machine downloads it from {publisher} ({licence}) into {folder}, with no administrator rights. No publisher signs ffmpeg, so its bytes are checked against two fixed SHA-256 fingerprints before it is used.', { publisher: FFMPEG.publisher, licence: FFMPEG.licence, folder: FFMPEG_FOLDER });
/** Is this need one the door meets? (the stream's / the sound's / the microphone's ffmpeg codes) */
export const ffmpegNeedCode = (code) => code === 'no_ffmpeg' || code === 'no_encoder';

/**
 * THE FETCH: the plan as shown (GET install-plan?what=ffmpeg — its digest), then the run (POST /api/desktop/install
 * {what:'ffmpeg', planDigest} — NDJSON {log}… then ONE {done}|{error}). `say(text, bad)` = the line's own words as it goes.
 * → the last answer ({done, ffmpeg, label} | {error, code}) or null when nothing could start
 */
export async function getFfmpeg(hostId, say = () => { }) {
  const shown = await fetchJson(`/api/desktop/install-plan?host=${encodeURIComponent(hostId)}&what=ffmpeg`);
  const plan = shown && shown.plan;
  if (!shown || shown.error || !plan || !plan.ok) { say(t('{app} was not fetched: {why}', { app: FFMPEG.label, why: (shown && (shown.error || (plan && plan.error))) || t('server unreachable') }), true); return shown || null; }
  say(t('Fetching {app} on that machine from {publisher}…', { app: FFMPEG.label, publisher: FFMPEG.publisher }), false);
  let res;
  try { res = await fetch('/api/desktop/install', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ host: hostId, what: 'ffmpeg', planDigest: shown.digest || null }) }); }
  catch (e) { say(t('{app} was not fetched: {why}', { app: FFMPEG.label, why: e.message }), true); return null; }
  if (!res.ok || !res.body) { let j = null; try { j = await res.json(); } catch { j = null; } say(t('{app} was not fetched: {why}', { app: FFMPEG.label, why: (j && j.error) || `HTTP ${res.status}` }), true); return j; }
  const reader = res.body.getReader(), dec = new TextDecoder();
  let buf = '', end = null, last = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const parts = buf.split('\n'); buf = parts.pop();
    for (const p of parts) {
      if (!p.trim()) continue;
      let o; try { o = JSON.parse(p); } catch { continue; }
      if (o.log != null && String(o.log).trim()) { last = String(o.log).trim().slice(0, 200); say(last, false); }
      if (o.done || o.error) end = o;
    }
  }
  if (end && end.done) say(t('Fetched {app} — both SHA-256 fingerprints checked — into {folder}', { app: end.label || FFMPEG.label, folder: FFMPEG_FOLDER }), false);
  else say(t('{app} was not fetched: {why}', { app: FFMPEG.label, why: (end && end.error) || last || t('no answer') }), true);
  return end;
}

/** The button for `hostId`: one press = the fetch; `say` = the line's words; `onDone(end)` once the machine has one that passes. */
export function ffmpegDoor(hostId, { say = () => { }, onDone = null, cls = 'btn-create' } = {}) {
  const b = document.createElement('button');
  b.type = 'button'; b.className = `${cls} machine-ffmpeg-get`; b.textContent = ffmpegDoorLabel(); b.title = ffmpegDoorTitle();
  b.onclick = async () => {
    if (b.disabled) return;
    b.disabled = true;
    let end = null;
    try { end = await getFfmpeg(hostId, say); } finally { b.disabled = false; }
    if (end && end.done) { b.hidden = true; try { onDone?.(end); } catch { /* the surface is gone */ } }
  };
  return b;
}
