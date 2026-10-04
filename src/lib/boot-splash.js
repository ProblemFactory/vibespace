// The boot splash's words (lane update-reload-ready, B-0ece): the DOM side of
// boot-ladder.js. A line under the loading bar says what the page waits on
// ("VibeSpace is starting… (N sessions reconnected)", a retry countdown); after
// the last rung it turns into the reason in words + a Reload button, and ONE
// `boot-stuck` telemetry event names the request it gave up on. Never a silent
// splash.
import { t } from './i18n.js';
import { track } from './telemetry-client.js';
import { ladderConfig, ladderJson, reasonOf, waitServerReady } from './boot-ladder.js';

const splash = () => document.getElementById('loading-screen');
export function splashLine(text) {
  const s = splash();
  if (!s) return;
  let el = s.querySelector('.boot-line');
  if (!el) {
    el = document.createElement('div');
    el.className = 'boot-line';
    el.setAttribute('role', 'status');
    el.style.cssText = 'font-size:12px;color:#94a3b8;max-width:min(520px,90vw);text-align:center;line-height:1.5;padding:0 12px';
    s.appendChild(el);
  }
  el.textContent = text;
}
export const bootDeps = () => ({ fetchImpl: (u, o) => fetch(u, o), sleep: (ms) => new Promise((r) => setTimeout(r, ms)), ...ladderConfig(window) });
const reasonWords = (fail) => { const r = reasonOf(fail, bootDeps().stallMs); return t(r.key, r.params); };
export const startingLine = (boot) => t('VibeSpace is starting… ({n} sessions reconnected)', { n: boot?.sessions || 0 });
export const retryLine = ({ url, fail, waitMs }) => t('Waiting for the server ({what}: {reason}) — trying again in {n} s', { what: url.split('?')[0], reason: reasonWords(fail), n: Math.round(waitMs / 1000) });
export function splashGiveUp({ url, tries, fail }) {
  const what = url.split('?')[0];
  try { track('event', 'boot-stuck', `${what}: ${fail.why}${fail.status ? ' ' + fail.status : ''}${fail.waitingOn ? ' (' + fail.waitingOn.join(', ') + ')' : ''} after ${tries} tries`); } catch { }
  const s = splash();
  if (!s) return;
  splashLine(t('The server did not answer {what} ({reason}) after {n} tries.', { what, reason: reasonWords(fail), n: tries }));
  if (s.querySelector('.boot-reload')) return;
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'boot-reload';
  b.textContent = t('Reload now');
  b.style.cssText = 'font:inherit;font-size:13px;padding:6px 16px;border-radius:6px;border:1px solid #2dd4bf;background:transparent;color:#5eead4;cursor:pointer';
  b.onclick = () => location.reload();
  s.appendChild(b);
}
/** The splash's gate before the layout restore: true once the server is ready for a page; false = gave up (Reload shown). */
export async function awaitBootReady() {
  const r = await waitServerReady({ ...bootDeps(), onStatus: (b) => splashLine(startingLine(b)), onRetry: (x) => splashLine(retryLine(x)) });
  if (!r.ok) { splashGiveUp(r); return false; }
  return true;
}
/** A first-paint request on the ladder; gives up into the Reload button and NEVER resolves then (restoring from
 *  nothing would let the first autosave overwrite the saved layout). */
export async function bootJson(url) {
  const r = await ladderJson(url, { ...bootDeps(), onRetry: (x) => splashLine(retryLine(x)) });
  if (r.gaveUp) { splashGiveUp(r.gaveUp); return new Promise(() => { }); }
  return r.json;
}
