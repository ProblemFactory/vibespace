// THE STATS ROW of a machine's picture stream (lane stream-window-fixes — the owner's first window stream said nothing about its
// connection while the whole screen's window did): ONE component both stream windows show — the whole screen's
// (src/lib/machine-desktop.js) and one window's (src/lib/machine-app.js openWindowStream):
//   • the numbers: RTT · jitter · fps · decode · kbps (the page's getStats), the relay path (via the hub · UDP / the device link)
//     and the machine's encoder with its encode ms — the facts are src/stream-model.js streamNumbersOf, the words are here
//   • the firewall notice while the hub relay carries the picture (the machine's self-probe said blocked), with the owner's
//     admin line to copy (run once there; VibeSpace never runs it)
// The whole screen's strip classes are kept (.desktop-strip-stream / -firewall / -fw-copy): their CSS, and the suites' anchors.
import { t } from './i18n.js';
import { copyText, showToast } from './utils.js';
import { streamNumbersOf } from '../stream-model.js';

const ms = (v) => (v == null ? '—' : v);
/** The numbers' words: streamNumbersOf's facts → one line ('' before the first numbers). */
export function streamNumbersText(n) {
  if (!n) return '';
  return t('RTT {rtt} ms · jitter {jitter} ms · {fps} fps · decode {decode} ms · {kbps} kbps', { rtt: ms(n.rtt), jitter: ms(n.jitter), fps: ms(n.fps), decode: ms(n.decode), kbps: ms(n.kbps) })
    + (n.via === 'udp' ? ' · ' + t('via the hub · UDP') : n.via === 'link' ? ' · ' + t('via the device link') : n.via === 'relay' ? ' · ' + t('via the hub') : '') // lane stream-relay-udp: which relay path
    + (n.encoder ? ' · ' + (n.encodeMs != null ? t('{encoder} · encode {ms} ms', { encoder: n.encoder, ms: n.encodeMs }) : n.encoder) : ''); // lane stream-p1b-screen: the machine's encoder
}

/** `machine` = the machine's name (the copy toast's words). → { numbers, firewall, draw(stream) → { playing, page, agent, via } }
 *  — the caller places the two elements in its strip; draw() reads the stream view (src/lib/stream-view.js) each tick. */
export function createStreamStats({ machine = '' } = {}) {
  const numbers = document.createElement('span'); numbers.className = 'desktop-strip-stream'; numbers.hidden = true;
  const firewall = document.createElement('span'); firewall.className = 'desktop-strip-firewall'; firewall.hidden = true;
  const fwText = document.createElement('span'); fwText.textContent = t('The machine’s firewall blocks the direct path; going through the hub');
  const fwCopy = document.createElement('button'); fwCopy.type = 'button'; fwCopy.className = 'file-tool-btn desktop-strip-fw-copy'; fwCopy.textContent = t('Copy the admin command');
  let command = null;
  fwCopy.onclick = () => { if (command) copyText(command).then(() => showToast(t('Copied — paste it into an administrator PowerShell on {machine}', { machine }))); };
  firewall.append(fwText, fwCopy);
  function draw(stream) {
    const page = stream ? stream.stats() : null, agent = stream ? stream.agent() : null;
    const playing = !!stream && stream.state === 'playing';
    const via = stream && stream.path ? stream.path() : null, fw = via && via !== 'direct' && stream.firewall ? stream.firewall() : null;
    numbers.hidden = !playing;
    firewall.hidden = !(playing && fw); command = (fw && fw.command) || null; fwCopy.hidden = !command; firewall.title = command || '';
    const n = streamNumbersOf(page, agent, via);
    if (n) { numbers.textContent = streamNumbersText(n); numbers.dataset.path = page.path || ''; numbers.dataset.via = via || ''; }
    return { playing, page, agent, via };
  }
  return { numbers, firewall, draw };
}
