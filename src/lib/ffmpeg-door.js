// 「取得 FFmpeg」 — THE DOOR ON THE LINE (lane machine-needs-at-pairing pick 2; 主开发's law 5: a need that a program meets with no
// rights runs AT ONCE, on the line that states it, and says what it fetched — no dialog; people only: the route refuses an agent).
// Every surface that says a Windows machine has no usable ffmpeg draws THIS button: the desktop window's strip (the stream, the
// sound, the microphone), one app's own window, and the machine's desktop dialog. The plan is the PURE row src/ffmpeg-install.js:
// the machine fetches it from the publisher (a fixed address, two pinned SHA-256s) into its own folder — the hub carries no bytes.
// Shown only when NO candidate passes (主开发's Q6: a machine whose own ffmpeg passes keeps it; nothing is fetched).
import { t } from './i18n.js';
import { fetchJson, createModalShell } from './utils.js';
import { FFMPEG, FFMPEG_BUILDS, FFMPEG_FOLDER } from '../ffmpeg-install.js';

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

/** WHERE the bytes come from, as a person reads it (the release's address without its scheme). */
const whereOf = (b) => String(b.url).replace(/^https:\/\//, '');
/** THE SHEET (the reader's item 3): what is fetched, from whom and from WHERE, the licence, where it lands, that no administrator
 *  right is asked, that VibeSpace did not build it and checks two fingerprints, and the second build tried — read BEFORE the
 *  press, in the product's own small sheet, with ONE button. → its body's lines (PURE words, for the sheet and its pins) */
export function ffmpegSheetLines() {
  const a = FFMPEG_BUILDS[0], b2 = FFMPEG_BUILDS[1];
  return [
    t('What: {app}, built by {publisher} — {mb} MB to download, one program (ffmpeg.exe, {exe} MB).', { app: a.label, publisher: a.publisher, mb: MB(a.bytes), exe: MB(a.memberBytes) }),
    t('From where: its release on GitHub — {where}', { where: whereOf(a) }),
    t('Licence: {licence}. VibeSpace did not build it, and no publisher signs ffmpeg — so that machine checks two fixed SHA-256 fingerprints, the download\'s and ffmpeg.exe\'s, before anything is placed.', { licence: a.licence }),
    t('Where it lands: {folder} on that machine. No administrator rights are asked, and it listens on nothing.', { folder: FFMPEG_FOLDER }),
    ...(b2 ? [t('If that build cannot be had, the second named build is tried: {app} by {publisher} ({mb} MB, {where}).', { app: b2.label, publisher: b2.publisher, mb: MB(b2.bytes), where: whereOf(b2) })] : []),
  ];
}
/** The button for `hostId`: a press opens THE SHEET; its ONE button runs the fetch (the line's `say` and the sheet's own status
 *  follow it); `onDone(end)` once the machine has one that passes. */
export function ffmpegDoor(hostId, { say = () => { }, onDone = null, cls = 'btn-create', machine = null } = {}) {
  const b = document.createElement('button');
  b.type = 'button'; b.className = `${cls} machine-ffmpeg-get`; b.textContent = ffmpegDoorLabel(); b.title = ffmpegDoorTitle();
  b.onclick = () => {
    const sh = createModalShell({ id: 'ffmpeg-get-sheet', key: hostId, title: machine ? t('Get {app} for {machine}', { app: FFMPEG.label, machine }) : t('Get {app}', { app: FFMPEG.label }), dialogClass: 'ffmpeg-get-sheet', escapeToClose: true, kind: 'form' });
    if (!sh || sh.raised) return;
    const body = sh.body;
    for (const line of ffmpegSheetLines()) { const p = document.createElement('p'); p.className = 'ffmpeg-get-fact'; p.textContent = line; body.appendChild(p); }
    const status = document.createElement('p'); status.className = 'ffmpeg-get-status'; status.style.display = 'none';
    const go = document.createElement('button'); go.type = 'button'; go.className = 'btn-create ffmpeg-get-go'; go.textContent = t('Get it');
    const acts = document.createElement('div'); acts.className = 'dialog-actions'; acts.appendChild(go);
    body.append(status, acts);
    go.onclick = async () => {
      if (go.disabled) return;
      go.disabled = true; status.style.display = '';
      const tell = (text, bad) => { status.textContent = text; status.classList.toggle('is-bad', !!bad); try { say(text, bad); } catch { /* the line is gone */ } };
      let end = null;
      try { end = await getFfmpeg(hostId, tell); } finally { go.disabled = false; }
      if (end && end.done) { go.style.display = 'none'; b.hidden = true; try { onDone?.(end); } catch { /* the surface is gone */ } }
    };
  };
  return b;
}
