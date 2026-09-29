// THE PAIRING CHROME (lane-pairing ①③, B-7007 — the owner's MacBook, 2026-09-27: the pairing dialog offered ONE
// address, the relay, which the Mac's network could not reach; the row then said only "offline" for a dial the
// server had refused by name). Two things every pairing surface shares:
//
//  · `dialAddressPicker({candidates, relayPublishable, onChange})` — the ADDRESS radio group: one row per address
//    the SERVER can name for itself (GET /api/device/dial-addresses — the browser's origin first, the relay,
//    Tailscale / LAN / public IPs, this host's name, IPv6), each with what the server knows about who can reach
//    it, then "Custom…" with a live verdict (PURE src/dial-facts.js dialBaseVerdict — the route re-runs it). The
//    dialog never probes: the DEVICE checks the chosen address before it installs anything (--dial-check).
//  · `dialStateText(rs)` / `dialReasonText(code)` — THE words of the one dial state (PURE dialRowState) the
//    machine row, its tooltip, the Machines card and the pairing sheet's head all print.
// Every server-provided string goes through textContent; theme vars only (public/style.css `.dap-*`).
import { t, deviceLocale } from './i18n.js';
import { dialBaseVerdict, dialUrlOf, dialDefaultChoice, dialRowState } from '../dial-facts.js';

const NOTE_WORDS = {
  origin: () => t('the address you are using now'),
  relay: () => t('reachable from anywhere the relay is'),
  tailscale: () => t('reachable from your tailnet'),
  lan: () => t('reachable on the same network'),
  public: () => t('a public address of this machine'),
  hostname: () => t('works where this name resolves (same LAN / your DNS)'),
  ipv6: () => t('IPv6 — works where IPv6 reaches this machine'),
  // naive-user N-loop: a loopback address reaches only this machine — last, never the default, said so
  'loopback-origin': () => t('the address you are using now — only this machine can reach it; another device cannot'),
  loopback: () => t('only this machine can reach it; another device cannot'),
};
const REFUSAL_WORDS = {
  scheme: () => t('Use http://, https://, ws:// or wss:// — or just host:port'),
  path: () => t('Just the address — no path or query'),
  query: () => t('Just the address — no path or query'),
  host: () => t('That is not an address VibeSpace can dial'),
  port: () => t('That is not an address VibeSpace can dial'),
  empty: () => t('That is not an address VibeSpace can dial'),
};
/** The words of a custom address's refusal code (dialBaseVerdict). */
export function baseRefusalText(code) { return (REFUSAL_WORDS[code] || REFUSAL_WORDS.host)(); }

let seq = 0;
/**
 * The address radio group. → `{el, value(): {base, viaRelay} | {error}, focus()}`. PURE dialDefaultChoice picks the checked row.
 * `relayPublishable` adds the "Publish through the relay and use that address" row (viaRelay on Generate).
 */
export function dialAddressPicker({ candidates = [], relayPublishable = false, deviceId = 'DEVICE', onChange = null, dial = null, online = false, listen = null } = {}) {
  const name = `dap-${++seq}`;
  const root = document.createElement('div');
  root.className = 'dap';
  root.setAttribute('role', 'radiogroup');
  root.setAttribute('aria-label', t('Address'));
  const head = document.createElement('div');
  head.className = 'dap-head';
  head.textContent = t('Address');
  root.appendChild(head);
  // verify-r4 F3: a server bound to this machine only (HOST=127.0.0.1) — none of its own addresses reaches it from
  // another device; say so before the list (the route leaves those rows out)
  if (listen && listen.loopbackOnly) {
    const ln = document.createElement('div');
    ln.className = 'dap-listen';
    ln.textContent = t('This VibeSpace listens only on this machine ({address}), so another device cannot reach it directly. Use the relay, or type the address of a proxy in front of it under Custom… (or restart VibeSpace with HOST=0.0.0.0).', { address: String(listen.address || '127.0.0.1') });
    root.appendChild(ln);
  }
  let chosen = null;
  const fire = () => { try { onChange?.(pick()); } catch (e) { console.warn('[dial-address-picker] onChange', e); } };
  const row = (kind, key, label, note, extra = null) => {
    const lab = document.createElement('label');
    lab.className = 'dap-row';
    lab.dataset.kind = kind;
    const r = document.createElement('input');
    r.type = 'radio'; r.name = name; r.value = key;
    r.onchange = () => { chosen = key; fire(); syncCustom(); };
    const txt = document.createElement('span');
    txt.className = 'dap-txt';
    const b = document.createElement('span'); b.className = 'dap-base'; b.textContent = label;
    const n = document.createElement('span'); n.className = 'dap-note'; n.textContent = note;
    txt.append(b, n);
    if (extra) txt.appendChild(extra);
    lab.append(r, txt);
    root.appendChild(lab);
    return r;
  };
  const radios = [];
  for (const c of candidates) {
    const r = row(c.kind, `base:${c.base}`, c.label || c.base, (NOTE_WORDS[c.note] || NOTE_WORDS.origin)());
    r.dataset.base = c.base;
    if (c.plain) r.parentElement.title = t('plain http — fine inside a trusted network; use the relay or a reverse proxy for TLS');
    radios.push(r);
  }
  if (relayPublishable) {
    const r = row('relay-publish', 'relay', t('Publish through the relay and use that address'), t('reachable from anywhere the relay is'));
    radios.push(r);
  }
  // Custom…: a text field with the live verdict (the resulting dial URL in small mono, or the refusal in place)
  const custom = document.createElement('input');
  custom.type = 'text'; custom.className = 'dap-custom'; custom.spellcheck = false; custom.autocomplete = 'off';
  custom.placeholder = 'host:3456';
  custom.setAttribute('aria-label', t('Custom…'));
  const verdict = document.createElement('div');
  verdict.className = 'dap-verdict';
  const customWrap = document.createElement('span');
  customWrap.className = 'dap-custom-wrap';
  customWrap.append(custom, verdict);
  const rc = row('custom', 'custom', t('Custom…'), '', customWrap);
  radios.push(rc);
  // the field is never disabled: a click / focus INTO it chooses the Custom row (a disabled field swallowed the click)
  const syncCustom = () => {
    const on = chosen === 'custom';
    if (!on) { verdict.textContent = ''; verdict.classList.remove('dap-bad'); return; }
    const v = dialBaseVerdict(custom.value);
    verdict.classList.toggle('dap-bad', !v.ok && !!custom.value.trim());
    verdict.textContent = v.ok ? dialUrlOf(v.base, deviceId) : (custom.value.trim() ? baseRefusalText(v.code) : '');
  };
  custom.addEventListener('input', () => { if (chosen !== 'custom') { rc.checked = true; chosen = 'custom'; } syncCustom(); fire(); });
  custom.addEventListener('focus', () => { if (chosen !== 'custom') { rc.checked = true; chosen = 'custom'; syncCustom(); fire(); } });
  // THE first choice (PURE dialDefaultChoice): for a paired device (`dial` = its facts) the address it CONNECTED
  // through since the current command, else the one that command was made for (naive-user N-sheet: the sheet checked
  // the browser's origin and "Generate" moved a working device onto it); for a new one the first row a device
  // elsewhere can reach — never a loopback row while another exists (N-loop)
  const first = dialDefaultChoice({ candidates, dial, relayPublishable });
  const own = first.why === 'connected' || first.why === 'paired' || first.why === 'unstated' || first.why === 'claim-held';
  if (first.kind === 'custom') {
    // the device's own address no row names, or (verify-r4 F3) nothing another device can reach: Custom… — empty then
    rc.checked = true; chosen = 'custom'; custom.value = first.value || '';
  } else {
    const firstRadio = (first.kind === 'relay-publish' ? radios.find((x) => x.value === 'relay') : first.kind === 'row' && radios.find((x) => x.dataset.base === first.base)) || radios[0];
    if (firstRadio) { firstRadio.checked = true; chosen = firstRadio.value; }
  }
  if (own) {
    // say WHY this row is checked: it is the device's own address (the row's note gains one clause)
    const lab = chosen === 'custom' ? rc.parentElement : radios.find((x) => x.value === chosen)?.parentElement;
    const n = lab && lab.querySelector('.dap-note');
    const tag = document.createElement('span');
    tag.className = first.why === 'unstated' || first.why === 'claim-held' ? 'dap-own dap-claim' : 'dap-own';
    // verify-r4 F1: the tense is the link's — an offline device (a relay that moved, a laptop on another network) LAST
    // connected through it; "connects through" is said only while it is dialed in
    tag.textContent = first.why === 'connected' ? (online ? t('the address this device connects through') : t('the address this device last connected through'))
      // verify-r5 C3: an older daemon states nothing and the record has no mint facts — the checked row is a guess
      : first.why === 'unstated' ? t('this device has not said which address it dials (its VibeSpace daemon is older) — check it can reach this one before you send it a command')
      // verify-r6 L1: its only statement is a claim (shown below, unchecked) — the checked row is a guess, said so
      : first.why === 'claim-held' ? t('a guess — the address this device dials is not one VibeSpace offered (shown below, not checked): pick the one it can reach')
      : t('the address of this device\'s current command');
    if (n && n.parentElement) n.parentElement.insertBefore(tag, n.nextSibling);
  }
  if (first.claim) {
    // verify-r5 C1 / verify-r6 L1: an address VibeSpace did not offer is the DEVICE's claim — shown, worded as its claim,
    // and NEVER checked: the command fetches its installer from it, and r5's pre-checked claim became the command's base
    // (hence "connects through", as a fact) on one press of Generate. Only the owner's own pick of it makes it the base
    let cr = radios.find((x) => x.dataset.base === first.claim);
    if (!cr) {
      cr = row('claim', `base:${first.claim}`, first.claim, '');
      cr.dataset.base = first.claim;
      const firstExtra = radios.find((x) => x.value === 'relay' || x.value === 'custom');
      if (firstExtra) root.insertBefore(cr.parentElement, firstExtra.parentElement);
      radios.splice(radios.indexOf(firstExtra), 0, cr);
    }
    const n2 = cr.parentElement.querySelector('.dap-note');
    const ctag = document.createElement('span');
    ctag.className = 'dap-own dap-claim';
    ctag.textContent = online ? t('the address this device says it connects through — VibeSpace did not offer it, so it is not checked: choose it only if it is yours')
      : t('the address this device said it last connected through — VibeSpace did not offer it, so it is not checked: choose it only if it is yours');
    if (n2 && n2.parentElement) n2.parentElement.insertBefore(ctag, n2.nextSibling);
  }
  syncCustom();
  function pick() {
    if (chosen === 'relay') return { base: null, viaRelay: true };
    if (chosen === 'custom') { const v = dialBaseVerdict(custom.value); return v.ok ? { base: v.base, viaRelay: false } : { error: baseRefusalText(v.code), code: v.code }; }
    const r = radios.find((x) => x.value === chosen);
    return r && r.dataset.base ? { base: r.dataset.base, viaRelay: false } : { error: t('That is not an address VibeSpace can dial'), code: 'empty' };
  }
  return { el: root, value: pick, focus: () => { const r = radios.find((x) => x.checked); r?.focus(); } };
}

/** THE words of a dial failure class / a server refusal code (the closed reasons of §11.2). */
export function dialReasonText(reason) {
  switch (reason) {
    case 'token-mismatch': return t('token mismatch');
    case 'no-pairing': return t('no pairing on record');
    case 'duplicate-device': return t('another device dials in as this one');
    case 'dns': return t('DNS');
    case 'tls': return t('TLS');
    case 'refused-connect': return t('connection refused');
    case 'timeout': return t('timed out');
    case 'unreachable': return t('no route');
    case 'not-vibespace': return t('not a VibeSpace address');
    default: return t('unknown');
  }
}
// naive-user L-time: the DEVICE's locale (i18n.js deviceLocale — the one Intl tag every surface prints dates with), never
// the browser's own: a zh page on an en-US browser read "最近一次拨号：被拒绝（令牌不匹配），04:24 PM"
const hhmm = (ms) => { try { const d = new Date(ms); const today = new Date().toDateString() === d.toDateString(); const loc = deviceLocale(); return today ? d.toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit' }) : d.toLocaleString(loc, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch { return ''; } };
/** THE sentence of a dial row state (PURE dialRowState's structure → words; the device's own language). */
export function dialStateText(rs) {
  const base = dialStateBase(rs);
  // verify-r1 B9: a second daemon refused as a copy of this pairing within the last 10 min rides the same sentence
  if (rs && rs.dup) return `${base} · ${t('Another device is also dialing in as this one (from {from}, {time}) — it holds a copy of this pairing; pair it under its own name', { from: rs.dup.from || '?', time: hhmm(rs.dup.at) })}`;
  return base;
}
function dialStateBase(rs) {
  const time = rs && rs.at ? hhmm(rs.at) : '';
  const host = (rs && rs.host) || t('this server');
  switch (rs && rs.state) {
    case 'connected': return rs.n > 0 ? t('Connected since {time} — before that {n} attempts failed ({reason})', { time, n: rs.n, reason: dialReasonText(rs.reason) }) : t('Connected since {time}', { time });
    case 'auth-fail': return t('Connected, but the device refuses this server\'s key — it was installed with a different command; generate a new one');
    // naive-user N-refused: a refusal newer than the current command means the device still runs an OLDER one — and
    // the newest is usually in the user's hands (a Generate just made it): "generate a new one" sent him round the
    // rotation loop the lane exists to end (each Generate retires the command he was about to paste). Name the
    // current command's time and say to run THAT one; a new one only if it is lost.
    case 'refused': return rs.mintedAt
      ? t('Last dial: refused ({reason}) at {time} — the device still holds a command older than the one generated at {minted}: run that one on the device (or generate a new one if you no longer have it)', { reason: dialReasonText(rs.reason), time, minted: hhmm(rs.mintedAt) })
      : t('Last dial: refused ({reason}) at {time} — the device holds an older command; generate a new one', { reason: dialReasonText(rs.reason), time });
    case 'silent': return t('Offline since {time} — no dial attempt has reached this server since (is the device on, and on a network that reaches {host}?)', { time, host });
    case 'never': return t('Never connected — the command generated at {time} has not reached this server (not run yet, or the device cannot reach {host})', { time, host });
    default: return t('Offline — nothing recorded yet');
  }
}
/**
 * verify-r4 F8 — WHAT "Generate a new command" DOES TO A DEVICE THAT IS NOT DIALED IN, said BEFORE the button (a
 * connected one has the "send it over its link" choice and its note). `h` = the machine row. Pre-fix nothing said it:
 * an OFFLINE device that had worked (a laptop asleep, a Mac at home) was refused when it came back, until someone ran
 * the new command on it — the owner's incident, rotated from the sheet. → the sentence, or '' when the keep choice
 * speaks (a device dialed in now).
 */
export function generateConsequenceText(h) {
  const rs = dialRowState(h || {});
  if (h && (h.transport === 'dial' ? h.online : h.dialLive)) return '';
  const minted = Number(h && h.dial && h.dial.tokenMintedAt) || 0;
  if (rs.state === 'never' || rs.state === 'refused') {
    return minted
      ? t('Generating replaces the command made at {time}: it stops working — run the new one on the device.', { time: hhmm(minted) })
      : t('Generating replaces the current command: it stops working — run the new one on the device.');
  }
  return t('This device is offline. Generating replaces the command it holds: when it comes back it is refused until you run the new command on it.');
}
/** One line of the device's dial history (the Machines card's "Dial history…"). */
export function dialHistoryLine(e) {
  const time = e && e.at ? hhmm(e.at) : '';
  if (e && e.outcome === 'connected') return t('{time} · connected', { time });
  if (e && e.outcome === 'lost') return t('{time} · link ended', { time });
  const code = String((e && e.code) || '');
  const reason = code === 'refused-token-mismatch' ? 'token-mismatch' : code === 'refused-no-pairing' ? 'no-pairing' : ['dns', 'tls', 'refused-connect', 'timeout', 'unreachable'].includes(code) ? code : (code === 'not-ws' || /^http-\d{3}$/.test(code)) ? 'not-vibespace' : 'other';
  return t('{time} · failed ({reason})', { time, reason: dialReasonText(reason) });
}
