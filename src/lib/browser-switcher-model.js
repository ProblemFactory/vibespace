// THE SWITCH DIALOG'S WORDS, AS A PURE MODEL (the rebuilt dialog, 2026-09-27).
// DOM-free, imports nothing, `t` injected: the server sends STRUCTURE (a row's
// closed `state` from src/browser-switch.js `rowState`, its `facts`, the view's
// `live` / `switching` / `leases`), and this file turns it into the sentences a
// person reads and the ONE control a card offers — the same words in every
// language the device speaks (the fast suite renders en / zh / ja from one node
// process). The server's English `error` / `reason` sentences stay the agent's
// and the CLI's; nothing here reads them. src/lib/browser-switcher.js is the DOM
// half (the modal, the keyed patch, the acts). Laws: plain words (no version,
// no plan, no tier, no "backend"); a card shows a control only when it WORKS;
// every row that can change by itself says so; the assistant is "your agent".
const i18nKey = (s) => s;

/** The closed set — equal to src/browser-switch.js ROW_STATES (the fast suite asserts it). */
export const ROW_STATES = Object.freeze(['current', 'not-a-switch', 'other-machine', 'not-in-this-version', 'installing', 'path-not-runnable', 'install-failed', 'not-installed', 'not-installed-here', 'needs-key', 'older-browser', 'all-in-use-own', 'all-in-use-shared', 'in-use-by-hand', 'ready-confirm', 'ready', 'unavailable']);
/** The states that never draw a card (the current browser, and every row that is not a switch of THIS profile). */
export const HIDDEN_STATES = Object.freeze(['current', 'not-a-switch', 'other-machine', 'not-in-this-version']);

// lane dc-browser-backends (F5): A BACKEND'S WORDS ARE ITS ROW'S — declared in its own file (src/browser-backends/<id>.js;
// a cloud row's in src/browser-profiles.js, its vendor's name as `{vendor}`) as i18n keys, carried by every row the
// server sends (the digest's `providers`, the /providers rows, the switch dialog's rows); this model LEARNS them from
// those rows and words them through t() — one lookup where three if-ladders over the ids stood.
const ROWS = new Map();
export function learnBackendRows(rows) {
  // a provider row says `canSwitchTo`, a switch dialog row the same cell as `switchKind`
  for (const r of Array.isArray(rows) ? rows : []) if (r && r.id && r.words && typeof r.words === 'object') ROWS.set(String(r.id), { words: r.words, canSwitchTo: r.canSwitchTo || r.switchKind || null });
}
const wordsOf = (id) => { const r = ROWS.get(String(id || '')); return r ? r.words : null; };
// `brand: true` = its name and chip are a brand name, said as they are in every language (Chromium, CloakBrowser)
const said = (w, key, t) => (!w || !w[key] ? null : w.brand && (key === 'name' || key === 'chip') ? String(w[key]) : t(w[key], w.vendor ? { vendor: w.vendor } : undefined));
// a row that is not switched in place (somebody else's browser, a desktop window, a cloud vendor's) has no switch card
const isStructural = (id) => { const r = ROWS.get(String(id || '')); return !!r && !!r.canSwitchTo && r.canSwitchTo !== 'in-place'; };

/** The browser's name inside sentences and on the now line. */
export function backendName(id, t) {
  return said(wordsOf(id), 'name', t) || t(i18nKey('an unknown browser'));
}
/** The short form for a PILL (the live bar, the picker row, Session Properties, the Actions pane): no major, no plan. */
export function chipWords(fact, t) {
  if (!fact || typeof fact !== 'object') return null;
  return said(wordsOf(fact.id), 'chip', t) || t(i18nKey('unknown browser'));
}
/** One line about a browser, under its name; null for an id we do not know. */
export function blurbOf(id, t) {
  return said(wordsOf(id), 'blurb', t);
}
/** The agent's claim: WHO said it (your agent), the site, its own words quoted as data; the evidence behind a fold. */
export function claimWords(claim, t) {
  const c = claim || {};
  const host = String(c.host || '');
  const why = String(c.why || '').trim();
  const text = why ? t(i18nKey('Your agent reports {host} blocked it: “{why}”.'), { host, why }) : t(i18nKey('Your agent reports {host} blocked it.'), { host });
  const ev = String(c.evidence || '').trim();
  return { text, detail: ev ? ev.slice(0, 400) : null };
}

const S = (text, warn = false) => ({ text, warn: !!warn });
/** BROWSE YOURSELF (B-6ae8): the user's own browsing holder's key (src/browser-human.js HUMAN_KEY_RE — this file imports nothing). */
const HUMAN_KEY_RE = /^hu-[0-9a-f]{8}$/;
const countOf = (l) => (Array.isArray(l) ? l.length : (Number(l) || 0));
/** THE download confirm (the dialog's not-installed / install-failed cards and the Manage Agents row share it).
 *  lane-cloak: `iv` = the install verdict (`GET /api/browser/install` / the switcher view's `install`) — its MEASURED
 *  record says how big the download is, where it comes from and how big it unpacks, so the words are the record's
 *  numbers, never a guess; without one (an old server) the generic sentence. */
export function installConfirmWords(name, t, iv = null) {
  const p = iv && iv.proof ? iv.proof : null;
  const mb = (b) => Math.max(1, Math.round(Number(b) / 1e6));
  const measured = !!(p && p.status === 'measured' && Number(p.downloadBytes) > 0 && Number(p.installedBytes) > 0);
  const message = measured
    ? t(i18nKey("About {down} MB is downloaded once from {host}, its maker, and unpacked to about {size} MB in VibeSpace's data folder. VibeSpace checks it is the exact copy it tested; in that test the browser itself connected to nothing on the internet. No account or key is needed."), { down: mb(p.downloadBytes), host: String(p.downloadHost || name), size: mb(p.installedBytes) })
    : t(i18nKey("About 200 MB is downloaded from {name}'s maker and kept in VibeSpace's data folder."), { name });
  return { title: t(i18nKey('Install {name}?'), { name }), message, confirmText: t(i18nKey('Download and install')), danger: false };
}
/** The credential codes that mean a key EXISTS and cannot be used — the only ones the needs-key card explains (every
 *  "nothing configured" code — no-values / no-preset / own-missing / no-store — says nothing past the first line). */
const KEY_UNUSABLE = new Set(['undecryptable', 'store-unreadable', 'preset-gone', 'rebound', 'ambiguous', 'unknown-credential']);
/** The lines both switch cards share: what a switch does, the fingerprint note, (live, 2 or more) who else it moves,
 *  and — lane-cloak — a browser behind the egress allowlist with no site named yet (it would open nothing). */
function readyLines(ctx, t, facts = {}) {
  const { name, label } = ctx;
  const out = [S(ctx.live
    ? t(i18nKey('Switching restarts the browser; open pages reopen by themselves and saved logins come along. You can switch back any time.'))
    : t(i18nKey("The browser isn't open right now; the next time your agent opens “{label}” it opens in {name}. You can switch back any time."), { label, name }))];
  if (ctx.fingerprintChange === 'gains' || ctx.fingerprintChange === 'loses') out.push(S(t(i18nKey('A few sites may still ask you to sign in again.')), true));
  const n = countOf(ctx.leases);
  if (ctx.live && n >= 2) out.push(S(t(i18nKey('{n} conversations use this browser now; their pages reopen too and their work pauses briefly.'), { n })));
  if (facts && facts.sites === 0) out.push(S(t(i18nKey('{name} opens only the sites you list in Settings → Agent browser, and none are listed yet.'), { name }), true));
  return out;
}
/**
 * One card's sentences + its ONE control, from the row's state and facts.
 * ctx = {name, label, live, leases, fingerprintChange, integrationId, credentialWhy, sessionOf, hostName, install}. `install` = the view's install verdict (the download confirm reads its measured sizes).
 * → { sentences: [{text, warn}], action: null | {kind, label, primary, confirm, sessionId?, integrationId?} }
 */
export function stateWords(state, facts, ctx, t) {
  const f = facts || {};
  const c = ctx || {};
  const name = c.name || '';
  const label = c.label || '';
  const act = (kind, text, extra = {}) => ({ kind, label: text, primary: false, confirm: null, ...extra });
  switch (state) {
    case 'ready': {
      return { sentences: readyLines(c, t, f), action: act('switch', t(i18nKey('Switch to {name}'), { name }), { primary: true }) };
    }
    case 'ready-confirm': {
      const warn = t(i18nKey("VibeSpace can't check that {name} isn't older than the browser that last opened “{label}”. If it is, “{label}” may stop opening, along with its saved logins."), { name, label });
      return { sentences: [...readyLines(c, t, f), S(warn, true)], action: act('switch-confirm', t(i18nKey('Switch to {name}'), { name }), { primary: true, confirm: { title: t(i18nKey('Switch to {name}?'), { name }), message: warn, confirmText: t(i18nKey('Switch anyway')), danger: true } }) };
    }
    case 'in-use-by-hand': {
      // BROWSE YOURSELF (B-6ae8): the user browses it HIMSELF (the driver is his own holder, `hu-…`) — a switch restarts the
      // browser and would close his page, so ONE button performs his browsing window's Close first
      if (HUMAN_KEY_RE.test(String(f.driver || ''))) return { sentences: [S(t(i18nKey("You're browsing “{label}” yourself. Close your browsing first, then switch."), { label }), true)], action: act('close-browsing', t(i18nKey('Close my browsing')), { key: String(f.driver) }) };
      // the button DOES the act the sentence names (the naive-user verifier, 2026-09-28: "hand it back … this updates by
      // itself" could not be watched — the hand-back button sat behind this modal); the dialog stays open and updates
      const sessionId = typeof c.sessionOf === 'function' && f.driver ? c.sessionOf(f.driver) : null;
      return { sentences: [S(t(i18nKey("You're driving this browser by hand in the live view. Once you hand it back to your agent, you can switch.")), true)], action: sessionId ? act('handback', t(i18nKey('Hand it back to your agent')), { sessionId }) : null };
    }
    case 'needs-key': {
      const s = [S(t(i18nKey('{name} needs a license key from its maker.'), { name }))];
      const k = f.key || null;
      // the second line ONLY for a key that EXISTS and cannot be used (the naive-user verifier, 2026-09-28: with nothing
      // configured anywhere the store answers `no-preset`, and the card said "the saved key can't be used: the cluster
      // provides no default for this integration" — no key was ever saved); "nothing configured" says nothing more
      if (k && KEY_UNUSABLE.has(String(k.whyCode || '')) && typeof c.credentialWhy === 'function') {
        let why = '';
        try { why = String(c.credentialWhy({ whyCode: k.whyCode, whyParams: k.whyParams || null }, { t }) || ''); } catch { why = ''; }
        if (why && why !== String(k.whyCode)) s.push(S(t(i18nKey("The saved key can't be used: {why}"), { why })));
      }
      return { sentences: s, action: act('integration', t(i18nKey('Enter license key…')), { integrationId: c.integrationId || null }) };
    }
    case 'not-installed':
      return { sentences: [S(t(i18nKey("{name} isn't installed on the computer VibeSpace runs on."), { name }))], action: act('install', t(i18nKey('Download and install…')), { confirm: installConfirmWords(name, t, c.install || null) }) };
    case 'not-installed-here':
      return { sentences: [S(t(i18nKey("VibeSpace can't install {name} here by itself. Ask whoever runs VibeSpace, or install it yourself and enter where it is under Settings → Agent browser."), { name }))], action: act('settings', t(i18nKey('Set location in Settings…'))) };
    case 'installing':
      return { sentences: [S(t(i18nKey('Installing {name}; this can take a few minutes. You can close this window, it keeps going.'), { name }))], action: null };
    case 'install-failed':
      return { sentences: [S(t(i18nKey("The last install of {name} didn't finish."), { name }), true)], action: act('install', t(i18nKey('Install again…')), { confirm: installConfirmWords(name, t, c.install || null) }) };
    case 'path-not-runnable':
      return { sentences: [S(t(i18nKey("The {name} set in Settings won't start; the location may be wrong."), { name }), true)], action: act('settings', t(i18nKey('Set location in Settings…'))) };
    case 'older-browser':
      return { sentences: [S(t(i18nKey("{name} is older than the browser “{label}” uses now; opening it there would damage its saved logins, so it can't be switched. A new profile can start in {name}."), { name, label }), true)], action: null };
    case 'all-in-use-own':
      return { sentences: [S(t(i18nKey('Your license allows {total} {name} browsers at once and all are in use: {holders}. Stop one in the Agent browser panel; this updates by itself.'), { total: f.seatsTotal == null ? '?' : f.seatsTotal, name, holders: (Array.isArray(f.holders) ? f.holders : []).join(', ') }), true)], action: act('profiles', t(i18nKey('Open Agent browser…'))) };
    case 'all-in-use-shared':
      return { sentences: [S(t(i18nKey('The shared {name} license is full ({total} in use). Try later, or use your own key.'), { name, total: f.seatsTotal == null ? '?' : f.seatsTotal }), true)], action: act('integration', t(i18nKey('Use my own license key…')), { integrationId: c.integrationId || null }) };
    // the hidden states never draw a card — their sentences are the notice / empty / now lines' words
    case 'current': return { sentences: [S(t(i18nKey("Your agent's browser: {name}"), { name }))], action: null };
    case 'not-a-switch': return { sentences: [S(t(i18nKey("“{label}” can't be switched to {name}."), { label, name }))], action: null };
    case 'other-machine': return { sentences: [S(t(i18nKey('“{label}” is saved on another computer ({host}); {name} only works on the computer VibeSpace runs on.'), { label, host: c.hostName || String(f.host || ''), name }))], action: null };
    case 'not-in-this-version': return { sentences: [S(t(i18nKey("{name} isn't part of this version of VibeSpace."), { name }))], action: null };
    case 'unavailable':
    default:
      return { sentences: [S(t(i18nKey("{name} can't be used right now. Check back later."), { name }), true)], action: null };
  }
}
/** The now line: whose browser it is (or the switch in flight), and its one-line description. */
export function nowWords(view, { t, pending = null } = {}) {
  const v = view || {};
  learnBackendRows(v.rows);
  const cur = String((v.profile && v.profile.provider) || 'chromium');
  if (v.switching || (pending && pending.state === 'switching')) {
    const name = backendName(pending && pending.to ? pending.to : cur, t);
    return { text: t(i18nKey('Switching to {name}… You can close this window; the switch goes on.'), { name }), blurb: null };
  }
  return { text: t(i18nKey("Your agent's browser: {name}"), { name: backendName(cur, t) }), blurb: blurbOf(cur, t) };
}
/** Why there is no card — ONE sentence by the fact; null when a card exists or the now blurb already says why. */
export function emptyWords(view, model, t) {
  const v = view || {};
  learnBackendRows(v.rows);
  const m = model || {};
  if (Array.isArray(m.targets) && m.targets.length) return null;
  const cur = String((v.profile && v.profile.provider) || 'chromium');
  if (isStructural(cur)) return null;
  const label = String((v.profile && v.profile.label) || '');
  const away = v.profile && v.profile.host ? (v.rows || []).find((r) => r && r.switchKind === 'in-place' && r.state === 'other-machine') : null;
  if (away) return t(i18nKey('“{label}” is saved on another computer ({host}); {name} only works on the computer VibeSpace runs on.'), { label, host: m.hostName || String(v.profile.host), name: backendName(away.id, t) });
  // BROWSE YOURSELF (B-6ae8): nothing runs, so there is no live view to take over — the user opens it himself
  if (!v.live && !(v.profile && v.profile.host)) return t(i18nKey("The browser isn't open right now. If a site blocks your agent, open “{label}” yourself and get past the check."), { label });
  return t(i18nKey("There's no other browser for “{label}” yet. If a site blocks your agent, take over in the live view and get past the check yourself."), { label });
}
/** The notice a caller's `preselect` earns when it names a row with no card that the empty line does not explain. */
export function noticeWords(state, facts, name, label, t) {
  if (state === 'not-in-this-version') return t(i18nKey("{name} isn't part of this version of VibeSpace."), { name });
  if (state === 'not-a-switch') return t(i18nKey("“{label}” can't be switched to {name}."), { label, name });
  return null;
}
/**
 * THE DIALOG, as data: `{title, switching, claims, now, notice, targets, empty}` — every entry keyed for the patch.
 * `pending` = the local overlay a click sets before the POST answers ({state:'switching', to} or {id, state:'installing'});
 * `sessionOf(browserKey)` → a webui id (the driver's live view); `hostNameOf(hostId)` → the machine's name.
 */
export function switcherModel(view, { t, preselect = null, pending = null, sessionOf = () => null, hostNameOf = (id) => id, credentialWhy = null } = {}) {
  const v = view || {};
  learnBackendRows(v.rows);
  const p = v.profile || {};
  const label = String(p.label || p.id || '');
  const hostName = p.host ? String((typeof hostNameOf === 'function' && hostNameOf(p.host)) || p.host) : null;
  const switching = !!(v.switching || (pending && pending.state === 'switching'));
  const claims = (Array.isArray(v.blocked) ? v.blocked : []).map((b) => ({ key: 'claim:' + String(b.id), id: String(b.id), ...claimWords(b, t) }));
  const now = { key: 'now', ...nowWords(v, { t, pending }) };
  const out = { title: t(i18nKey('Browser for “{label}”'), { label }), switching, claims, now, notice: null, targets: [], empty: null, hostName };
  if (switching) return out;
  const rows = Array.isArray(v.rows) ? v.rows : [];
  const nLeases = Array.isArray(v.leases) ? v.leases.length : 0;
  out.targets = rows.filter((r) => r && r.switchKind === 'in-place' && !HIDDEN_STATES.includes(r.state)).map((r) => {
    const name = backendName(r.id, t);
    const state = pending && pending.state === 'installing' && pending.id === r.id ? 'installing' : r.state;
    const w = stateWords(state, r.facts || {}, { name, label, live: !!v.live, leases: nLeases, fingerprintChange: r.fingerprintChange || null, integrationId: r.integrationId || null, credentialWhy, sessionOf, hostName, install: v.install || null }, t);
    return { key: 'target:' + r.id, id: r.id, name, blurb: blurbOf(r.id, t), state, sentences: w.sentences, action: w.action, integrationId: r.integrationId || null, code: r.code || null };
  });
  if (preselect) {
    const r = rows.find((x) => x && x.id === preselect);
    if (r && HIDDEN_STATES.includes(r.state)) {
      const text = noticeWords(r.state, r.facts || {}, backendName(r.id, t), label, t);
      if (text) out.notice = { key: 'notice', text };
    }
  }
  let empty = emptyWords(v, out, t);
  // BROWSE YOURSELF (B-6ae8): not running, on this computer ⇒ the empty line's ONE button opens it for the user.
  // The .197 integration (cloak × browse-yourself): offered whenever the browser is not open here — INDEPENDENT of the
  // switch cards (lane-cloak's CloakBrowser Install card made this dialog never empty, and the line vanished); the two
  // are different rows: a card switches the browser, this line opens the one there is
  const canSelfOpen = !v.live && !p.host && !isStructural(p.provider || 'chromium');
  if (!empty && canSelfOpen) empty = t(i18nKey("The browser isn't open right now. If a site blocks your agent, open “{label}” yourself and get past the check."), { label });
  const selfOpen = !!empty && canSelfOpen;
  out.empty = empty ? { key: 'empty', text: empty, ...(selfOpen ? { action: { kind: 'browse-yourself', label: t(i18nKey('Open it yourself')), primary: true, confirm: null, profileId: String(p.id || '') } } : {}) } : null;
  return out;
}

// ── the answers to the dialog's acts ──
/** The switch's stale-view refusals: the gate refused before anything moved (the view the click read was old). */
const STALE_CODES = new Set(['backend_no_key', 'downgrade_refused', 'downgrade_unknown', 'backend_seat_ceiling', 'backend_unavailable', 'switch_refused', 'switch_export_only', 'switch_noop', 'provider_unknown', 'provider_needs_local_key', 'provider_local_only', 'provider_needs_consent']);
/** `POST /api/browser/switch` → `{tone, text, refresh?}`. The rollback facts are judged BEFORE the code (any refusal start() threw arrives after the profile moved). */
export function switchOutcomeWords(r, { t, name = null, from = null, to = null, label = '' } = {}) {
  if (!r || typeof r !== 'object') return { tone: 'error', text: t(i18nKey('Could not reach the server')) };
  const lab = String((r.profile && r.profile.label) || label || '');
  const toName = r.to ? backendName(r.to, t) : (to ? backendName(to, t) : (name || backendName('', t)));
  const fromName = backendName(r.from || from || 'chromium', t);
  if (r.restored === true) return { tone: 'error', text: t(i18nKey("{to} didn't start. “{label}” is back on {from}."), { to: toName, from: fromName, label: lab }), refresh: true };
  if (r.restored === false) return { tone: 'error', text: t(i18nKey("{to} didn't start, and {from} didn't start again either. “{label}” stays on {from}; its browser starts the next time your agent uses it."), { to: toName, from: fromName, label: lab }), refresh: true };
  if (r.ok && !r.error) {
    if (r.mode === 'proposal') {
      return { tone: 'warn', text: r.filed
        ? t(i18nKey('Not switched: the browser is being driven by hand. A reminder is in For you so you can finish the switch later.'))
        : t(i18nKey('Not switched: the browser is being driven by hand. Hand it back, then switch again.')), refresh: true };
    }
    const list = Array.isArray(r.reopened) ? r.reopened : [];
    const good = list.filter((x) => x && x.ok).length;
    const bad = list.length - good;
    const head = good === 0 ? t(i18nKey('Switched “{label}” to {to}.'), { label: lab, to: toName })
      : good === 1 ? t(i18nKey('Switched “{label}” to {to}; 1 page reopened.'), { label: lab, to: toName })
        : t(i18nKey('Switched “{label}” to {to}; {n} pages reopened.'), { label: lab, to: toName, n: good });
    return { tone: 'ok', text: bad ? head + ' ' + t(i18nKey('{bad} could not be reopened.'), { bad }) : head };
  }
  const code = String(r.code || '');
  if (code === 'browser_restarting') return { tone: 'warn', text: t(i18nKey('The browser is already restarting; try again in a moment.')) };
  if (STALE_CODES.has(code)) return { tone: 'warn', text: t(i18nKey('Not switched; something changed — see the reason below.')), refresh: true };
  if (code === 'not-found') return { tone: 'error', text: t(i18nKey('This profile no longer exists.')) };
  if (code === 'unavailable') return { tone: 'error', text: t(i18nKey("Browser profiles aren't available on this server.")) };
  return { tone: 'error', text: t(i18nKey("The switch didn't go through.")), refresh: true };
}
/** `POST /api/browser/install` → `{tone, text}`. */
export function installOutcomeWords(r, { t, name = 'CloakBrowser' } = {}) {
  if (!r || typeof r !== 'object') return { tone: 'error', text: t(i18nKey('Could not reach the server')) };
  if (r.ok && !r.error) return { tone: 'ok', text: t(i18nKey('Installing {name}; this can take a few minutes.'), { name }) };
  switch (String(r.code || '')) {
    case 'install_running': return { tone: 'warn', text: t(i18nKey('An install is already running.')) };
    case 'already_installed': return { tone: 'ok', text: t(i18nKey('{name} is already installed.'), { name }) };
    case 'install_unavailable': return { tone: 'error', text: t(i18nKey("VibeSpace can't install {name} here by itself."), { name }) };
    case 'install_precondition_unmet': return { tone: 'error', text: t(i18nKey("{name} isn't part of this version of VibeSpace."), { name }) };
    case 'install_unmeasured_platform': return { tone: 'error', text: t(i18nKey("VibeSpace can't install {name} here by itself."), { name }) };
    case 'install_local_only': return { tone: 'error', text: t(i18nKey('{name} can only be installed on the computer VibeSpace runs on.'), { name }) };
    default: return { tone: 'error', text: t(i18nKey("The install didn't start.")) };
  }
}
/**
 * The Manage Agents CloakBrowser row, from `GET /api/browser/install`: `{text, state, offer, title}` — the state word or
 * sentence, and the ONE act the row offers (`install` / `install-again`, both behind the download confirm) or none.
 * The order mirrors the dialog's rule 6: a finished-but-failed run, then an installable one (VibeSpace can do it here
 * only with npm), then a build that has none of this. A disabled Install with a tooltip is gone.
 */
export function installVerdictWords(iv, { t, name = 'CloakBrowser' } = {}) {
  const v = iv || {};
  if (v.code === 'already_installed') return { text: t(i18nKey('installed')), state: 'installed', offer: null, title: v.path ? String(v.path) : '' };
  if (v.state && v.state.running) return { text: t(i18nKey('installing…')), state: 'installing', offer: null, title: '' };
  if (v.state && v.state.failed) return { text: t(i18nKey("The last install of {name} didn't finish."), { name }), state: 'install-failed', offer: v.npm === false ? null : 'install-again', title: '' };
  // lane-cloak: a machine the measurement never covered — VibeSpace will not install it here (the same words as no npm)
  if (v.code === 'install_unmeasured_platform') return { text: t(i18nKey("VibeSpace can't install {name} here by itself. Ask whoever runs VibeSpace, or install it yourself and enter where it is under Settings → Agent browser."), { name }), state: 'not-installed-here', offer: null, title: '' };
  if (v.ok) {
    if (v.npm === false) return { text: t(i18nKey("VibeSpace can't install {name} here by itself. Ask whoever runs VibeSpace, or install it yourself and enter where it is under Settings → Agent browser."), { name }), state: 'not-installed-here', offer: null, title: '' };
    return { text: t(i18nKey('not installed')), state: 'not-installed', offer: 'install', title: '' };
  }
  if (v.code === 'install_precondition_unmet') return { text: t(i18nKey("{name} isn't part of this version of VibeSpace."), { name }), state: 'not-in-this-version', offer: null, title: '' };
  return { text: t(i18nKey("{name} can't be used right now. Check back later."), { name }), state: 'unavailable', offer: null, title: '' };
}
/** `DELETE /api/browser/blocked/:id` → `{tone, text, refresh?}` | null (a removal is quiet: the broadcast removes the row). */
export function dismissOutcomeWords(r, t) {
  if (!r || typeof r !== 'object') return { tone: 'error', text: t(i18nKey('Could not reach the server')) };
  if (r.error) return { tone: 'error', text: t(i18nKey("Couldn't dismiss it.")) };
  if (r.removed === true) return null;
  return { tone: 'warn', text: t(i18nKey('That note was already gone.')), refresh: true };
}
/** `GET /api/browser/switcher` failed → the ONE sentence that replaces the body. */
export function viewErrorWords(r, t) {
  if (!r || typeof r !== 'object') return t(i18nKey('Could not reach the server'));
  switch (String(r.code || '')) {
    case 'not-found': return t(i18nKey('This profile no longer exists.'));
    case 'unavailable': return t(i18nKey("Browser profiles aren't available on this server."));
    case 'ambiguous': return t(i18nKey('Several profiles share this name; open the one you want from the Agent browser panel.'));
    case 'unsupported-host': return t(i18nKey("Profiles saved on another computer can't be switched in this version."));
    default: return t(i18nKey("Couldn't read which browser this profile uses."));
  }
}
/** The digest's switch choices for a profile (an older server sends no `backends` ⇒ none). */
export function choicesOf(digest, profileId) {
  const b = digest && digest.backends && profileId ? digest.backends[profileId] : null;
  return b && Array.isArray(b.choices) ? b.choices.slice() : [];
}
/** The digest's backend FACT for a profile (`{id, major, plan, choices}`), or null. */
export function backendFactOf(digest, profileId) {
  return (digest && digest.backends && profileId && digest.backends[profileId]) || null;
}
