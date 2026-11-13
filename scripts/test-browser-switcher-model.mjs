#!/usr/bin/env node
// THE BROWSER-SWITCH DIALOG'S WORDS — the fast gate (the rebuilt dialog, 2026-09-27; the owner's zh screenshot of
// the old one: "tier 1", "chromium 151", a disabled Install under a paragraph about "§7.2.1 egress" and
// "binary_absent", buttons stacked one glyph per line). No DOM, no server: the PURE model
// src/lib/browser-switcher-model.js over fixture views built by the REAL src/browser-switch.js
// (scripts/fixtures/browser-switcher-views.mjs, the ONE producer the heavy chrome suite shares).
//   §1 THE STATE TABLE — every ROW_STATES entry has a fixture whose row reports exactly that state; the model's
//      card (en) is the spec's sentences + control label verbatim and the right act; the driver's live view only
//      when a listed session holds the key; not-live says "isn't open right now" (no count line); switching is the
//      now line alone;
//   §2 THE CLOSED SET — SW.ROW_STATES = the model's; every state has words; every switch answer is worded (every
//      SWITCH_CODE, every start refusal with restored true AND false, the stale-view codes, not-found, unavailable,
//      no body) — the rollback facts win over the code; no text equals `r.error` or carries a developer word;
//   §3 HIDDEN ROWS — cdp / local-window (consent off and on) / cloud:* never draw a card; W1 = no card + the empty
//      line (a); a preselected unwired fixture row = the not-in-this-version notice; a paired machine's profile = the
//      empty line (b) naming the machine, no notice; a current cdp / cloud = no card, no empty line, the blurb says why;
//   §4 THE DIGEST FACTS — switchChoices ([] shipped, [fixture] wired, [] on a paired machine / from cdp), backendFact,
//      chipWords (no major, no plan), backendName of a raw id;
//   §5 PENDING — the click's overlay: switching = the now line alone;
//   §6 i18n — every literal of the model + the DOM half has zh AND ja; every rendered zh / ja sentence has no
//      `{param}` left and ja never carries “ ”; the retired keys are gone; "License key" zh is 授权码;
//   §7 WIRING PINS over the DOM half and its neighbours;
//   NEGATIVE CONTROLS (scripts/mutant-copy.mjs, never src/): (a) a model that shows the server's sentence ⇒ §1 + §2
//      red; (b) a switch module missing 'older-browser' ⇒ §2 red; (c) switchChoices ignoring the control ⇒ §4 red;
//      (d) rowState without its key rule ⇒ §1 red on needs-key; (e) switchOutcomeWords
//      reading the code before `restored` ⇒ §2 red; the copies census.
// Run: node scripts/test-browser-switcher-model.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
import * as F from './fixtures/browser-switcher-views.mjs';

const require = createRequire(import.meta.url);
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(repo, f), 'utf8');
const MUT = mutantCopies('browser-switcher-model', repo);
let pass = 0, fail = 0;
const ok = (c, name, extra) => { if (c) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.error(`  ✗ ${name}${extra !== undefined ? '\n    ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 1400) : ''}`); } return !!c; };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const SW = require('../src/browser-switch.js');
const B = require('../src/browser-profiles.js');
const R = require('../src/integration-registry.js');
const M = await import('../src/lib/browser-switcher-model.js');
const zh = (await import('../src/lib/i18n-zh.js')).default;
const ja = (await import('../src/lib/i18n-ja.js')).default;
const mkT = (dict) => (k, p) => { let s = (dict && dict[k]) || k; if (p) s = s.replace(/\{(\w+)\}/g, (m, x) => (p[x] !== undefined ? String(p[x]) : m)); return s; };
const tEn = mkT(null), tZh = mkT(zh), tJa = mkT(ja);

// ── the spec's table (§3.2 / §3.3), en, over the fixtures (label “shopping”, the target the fixture row «Fixture Browser» —
// lane engine-spi-egress L3: the shipped table has no in-place target since the anti-bot backend left the core) ──
const RDY = 'Switching restarts the browser; open pages reopen by themselves and saved logins come along. You can switch back any time.';
const EXPECT = {
  ready: { state: 'ready', sentences: [[RDY, false], ['2 conversations use this browser now; their pages reopen too and their work pauses briefly.', false]], action: ['switch', 'Switch to Fixture Browser'] },
  'not-live': { state: 'ready', sentences: [["The browser isn't open right now; the next time your agent opens “shopping” it opens in Fixture Browser. You can switch back any time.", false]], action: ['switch', 'Switch to Fixture Browser'] },
  'ready-confirm': { state: 'ready-confirm', sentences: [[RDY, false], ["VibeSpace can't check that Fixture Browser isn't older than the browser that last opened “shopping”. If it is, “shopping” may stop opening, along with its saved logins.", true]], action: ['switch-confirm', 'Switch to Fixture Browser'] },
  // the naive-user verifier (2026-09-28): the confirm card says who else a switch moves, as the plain one does
  'ready-confirm-two': { state: 'ready-confirm', sentences: [[RDY, false], ['2 conversations use this browser now; their pages reopen too and their work pauses briefly.', false], ["VibeSpace can't check that Fixture Browser isn't older than the browser that last opened “shopping”. If it is, “shopping” may stop opening, along with its saved logins.", true]], action: ['switch-confirm', 'Switch to Fixture Browser'] },
  driven: { state: 'in-use-by-hand', sentences: [["You're driving this browser by hand in the live view. Once you hand it back to your agent, you can switch.", true]], action: null },
  'needs-key': { state: 'needs-key', sentences: [['Fixture Browser needs a license key from its maker.', false]], action: ['integration', 'Enter license key…'] },
  'needs-key-undecryptable': { state: 'needs-key', sentences: [['Fixture Browser needs a license key from its maker.', false], ["The saved key can't be used: the stored keys (apiKey) cannot be decrypted with the current key file", false]], action: ['integration', 'Enter license key…'] },
  'needs-key-unknown-code': { state: 'needs-key', sentences: [['Fixture Browser needs a license key from its maker.', false]], action: ['integration', 'Enter license key…'] },
  // nothing configured anywhere says NOTHING about a saved key (the naive-user verifier, 2026-09-28: `no-preset` is what the
  // real store answers on a plain instance, and the card said "the saved key can't be used: the cluster provides no default")
  'needs-key-no-preset': { state: 'needs-key', sentences: [['Fixture Browser needs a license key from its maker.', false]], action: ['integration', 'Enter license key…'] },
  'needs-key-own-missing': { state: 'needs-key', sentences: [['Fixture Browser needs a license key from its maker.', false]], action: ['integration', 'Enter license key…'] },
  'needs-key-preset-gone': { state: 'needs-key', sentences: [['Fixture Browser needs a license key from its maker.', false], ["The saved key can't be used: the preset you chose (team) is no longer provided by the cluster", false]], action: ['integration', 'Enter license key…'] },
  unavailable: { state: 'unavailable', sentences: [["Fixture Browser can't be used right now. Check back later.", true]], action: null },
  'older-browser': { state: 'older-browser', sentences: [["Fixture Browser is older than the browser “shopping” uses now; opening it there would damage its saved logins, so it can't be switched. A new profile can start in Fixture Browser.", true]], action: null },
  'all-in-use-own': { state: 'all-in-use-own', sentences: [['Your license allows 1 Fixture Browser browsers at once and all are in use: Vendor portal. Stop one in the Agent browser panel; this updates by itself.', true]], action: ['profiles', 'Open Agent browser…'] },
  'all-in-use-shared': { state: 'all-in-use-shared', sentences: [['The shared Fixture Browser license is full (1 in use). Try later, or use your own key.', true]], action: ['integration', 'Use my own license key…'] },
};
/** Which fixture reports each HIDDEN state on its target row (the visible ones are EXPECT's). */
const HIDDEN_FIXTURE = { current: 'ready', 'not-a-switch': 'current-cdp', 'other-machine': 'host-profile', 'not-in-this-version': 'w1' };
const DEV_WORDS = /§|src\/|\.mjs|`|\bprovider\b|\btier\b|\blease\b|\bseeded\b|\begress\b|binary_absent|\bclaim\b|\bbackend\b|\bnpm\b|\bcloak\b|fixture-browser|\{/i; // + a bare provider id (a person reads Fixture Browser)

const credentialWhy = (x, o) => R.credentialWhyText(x, o);
/** Every text a model says (for the censuses). */
function textsOf(m) {
  const out = [m.title, m.now.text, m.now.blurb, m.notice && m.notice.text, m.empty && m.empty.text];
  for (const c of m.claims) out.push(c.text);
  for (const tg of m.targets) {
    out.push(tg.name, tg.blurb, ...tg.sentences.map((s) => s.text));
    if (tg.action) { out.push(tg.action.label); if (tg.action.confirm) out.push(tg.action.confirm.title, tg.action.confirm.message, tg.action.confirm.confirmText); }
  }
  return out.filter((x) => typeof x === 'string');
}

/** The driven card's act: the handback itself, for the session holding the driver key (the naive-user verifier, 2026-09-28). */
function drivenActs(Mm) {
  const a = Mm.switcherModel(F.views().driven, { t: tEn, sessionOf: (k) => (k === 'bk-0000a001' ? 'w1' : null) }).targets[0].action;
  return !!a && a.kind === 'handback' && a.sessionId === 'w1' && a.label === 'Hand it back to your agent' && !a.confirm;
}

// ── §1 THE STATE TABLE ──
console.log('§1 the state table (en, verbatim)');
function judgeStates(Mm, V) {
  const bad = [];
  const seen = new Set();
  for (const v of Object.values(V)) for (const r of v.rows) seen.add(r.state);
  for (const st of SW.ROW_STATES) if (!seen.has(st)) bad.push(`no fixture reports ${st}`);
  for (const [name, want] of Object.entries(EXPECT)) {
    const view = V[name];
    const row = F.targetRowOf(view);
    if (row.state !== want.state) { bad.push(`${name}: the row reports ${row.state}, want ${want.state}`); continue; }
    const m = Mm.switcherModel(view, { t: tEn, credentialWhy, sessionOf: () => null });
    const tg = m.targets.find((x) => x.id === row.id);
    if (!tg) { bad.push(`${name}: no card for ${row.id}`); continue; }
    const got = tg.sentences.map((s) => [s.text, s.warn]);
    if (!same(got, want.sentences)) bad.push(`${name}: sentences ${JSON.stringify(got)} ≠ ${JSON.stringify(want.sentences)}`);
    const act = tg.action ? [tg.action.kind, tg.action.label] : null;
    if (!same(act, want.action)) bad.push(`${name}: action ${JSON.stringify(act)} ≠ ${JSON.stringify(want.action)}`);
    if (tg.name !== 'Fixture Browser' || tg.blurb !== null) bad.push(`${name}: name/blurb ${tg.name} / ${tg.blurb}`);
  }
  for (const [st, name] of Object.entries(HIDDEN_FIXTURE)) {
    const view = V[name];
    const r = st === 'current' ? view.rows.find((x) => x.id === 'chromium') : F.targetRowOf(view);
    if (r.state !== st) bad.push(`${name}: the hidden row reports ${r.state}, want ${st}`);
    const m = Mm.switcherModel(view, { t: tEn });
    if (m.targets.some((x) => x.id === r.id)) bad.push(`${name}: a hidden ${st} row drew a card`);
  }
  return bad;
}
{
  const V = F.views();
  const bad = judgeStates(M, V);
  ok(bad.length === 0, `every state's card = the spec's sentences + control, verbatim (${Object.keys(EXPECT).length} visible fixtures, ${Object.keys(HIDDEN_FIXTURE).length} hidden)`, bad.join('\n    '));
  const drv = M.switcherModel(V.driven, { t: tEn, sessionOf: (k) => (k === 'bk-0000a001' ? 'w1' : null) }).targets[0];
  ok(drv.state === 'in-use-by-hand' && drivenActs(M), 'driven + a listed session holding the driver key ⇒ "Hand it back to your agent" with THAT session — the act itself, never a trip behind the modal');
  ok(M.switcherModel(V.driven, { t: tEn }).targets[0].action === null, '…and with no listed session ⇒ no button (the sentence already says what happens)');
  const nl = M.switcherModel(V['not-live'], { t: tEn }).targets[0];
  ok(/isn't open right now/.test(nl.sentences[0].text) && !nl.sentences.some((s) => /conversations use/.test(s.text)), 'not live ⇒ "isn\'t open right now", never the count line');
  const sw = M.switcherModel(V.switching, { t: tEn });
  ok(sw.switching === true && sw.targets.length === 0 && sw.notice === null && sw.empty === null && sw.now.text === 'Switching to Fixture Browser… You can close this window; the switch goes on.' && sw.now.blurb === null, 'view.switching ⇒ the now line alone (the keeper has already committed the provider it switches to)', sw);
  const rc = M.switcherModel(V['ready-confirm'], { t: tEn }).targets[0].action.confirm;
  ok(rc && rc.title === 'Switch to Fixture Browser?' && rc.confirmText === 'Switch anyway' && rc.danger === true && /can't check/.test(rc.message), 'ready-confirm: the click asks ONE question (the house confirm, "Switch anyway")');
  const m1 = M.switcherModel(V.ready, { t: tEn });
  ok(m1.title === 'Browser for “shopping”' && m1.now.text === "Your agent's browser: Chromium" && m1.now.blurb === "VibeSpace's default browser (the open-source version of Chrome).", 'the title names the profile; the now line says whose browser it is and what it is');
}

// ── §2 THE CLOSED SET ──
console.log('§2 the closed set: states, and every switch answer worded');
const START_REFUSALS = ['backend_unavailable', 'backend_no_key', 'provider_needs_local_key', 'provider_local_only', 'provider_unavailable', 'provider_needs_consent', 'browser_cap', 'fence_refused', 'not_managed', 'host_unavailable', 'cdp_unreachable', 'profile_locked', 'backend_seat_taken', 'launch_failed', 'binary_absent'];
const STALE = ['backend_no_key', 'downgrade_refused', 'downgrade_unknown', 'backend_seat_ceiling', 'backend_unavailable', 'switch_refused', 'switch_export_only', 'switch_noop', 'provider_unknown', 'provider_needs_local_key', 'provider_local_only', 'provider_needs_consent'];
function judgeClosed(Mm, SWm) {
  const bad = [];
  if (!same([...SWm.ROW_STATES], [...Mm.ROW_STATES])) bad.push(`SW.ROW_STATES ≠ the model's (${SWm.ROW_STATES.length} vs ${Mm.ROW_STATES.length})`);
  for (const st of Mm.ROW_STATES) { const w = Mm.stateWords(st, {}, { name: 'Fixture Browser', label: 'shopping' }, tEn); if (!w.sentences.length || !w.sentences[0].text) bad.push(`stateWords(${st}) has no sentence`); }
  const err = (code, extra = {}) => ({ error: `provider "cloak": ${code} — a sentence for the agent (§7.4, \`vibespace-browser\`, egress, tier 2, lease)`, code, ...extra });
  const cases = [];
  for (const c of SWm.SWITCH_CODES) cases.push([c, err(c)]);
  for (const c of START_REFUSALS) { cases.push([c + '+restored', err(c, { restored: true, from: 'chromium', to: F.FIXTURE_ID })]); cases.push([c + '+not-restored', err(c, { restored: false, from: 'chromium', to: F.FIXTURE_ID })]); }
  for (const c of STALE) cases.push([c + ' (stale)', err(c)]);
  cases.push(['not-found', err('not-found')], ['unavailable', err('unavailable')], ['null', null], ['no body', undefined], ['weird', err('zz_new_code')]);
  for (const [n, r] of cases) {
    const w = Mm.switchOutcomeWords(r, { t: tEn, from: 'chromium', to: F.FIXTURE_ID, label: 'shopping' });
    if (!w || !w.text || !['ok', 'warn', 'error'].includes(w.tone)) { bad.push(`${n}: not worded`); continue; }
    if (r && w.text === r.error) bad.push(`${n}: the raw error reached the toast`);
    if (DEV_WORDS.test(w.text)) bad.push(`${n}: a developer word in "${w.text}"`);
    if (r && typeof r.restored === 'boolean') {
      const want = r.restored ? "Fixture Browser didn't start. “shopping” is back on Chromium." : "Fixture Browser didn't start, and Chromium didn't start again either. “shopping” stays on Chromium; its browser starts the next time your agent uses it.";
      if (w.text !== want) bad.push(`${n}: the rollback facts did not win over the code ("${w.text}")`);
    }
  }
  const okSw = Mm.switchOutcomeWords({ ok: true, mode: 'switch', from: 'chromium', to: F.FIXTURE_ID, reopened: [{ ok: true }, { ok: true }, { ok: false }], profile: { label: 'shopping' } }, { t: tEn });
  if (okSw.text !== 'Switched “shopping” to Fixture Browser; 2 pages reopened. 1 could not be reopened.' || okSw.tone !== 'ok') bad.push(`switched: "${okSw.text}"`);
  if (Mm.switchOutcomeWords({ ok: true, mode: 'switch', to: F.FIXTURE_ID, reopened: [] }, { t: tEn, label: 'shopping' }).text !== 'Switched “shopping” to Fixture Browser.') bad.push('switched n=0');
  if (Mm.switchOutcomeWords({ ok: true, mode: 'switch', to: F.FIXTURE_ID, reopened: [{ ok: true }] }, { t: tEn, label: 'shopping' }).text !== 'Switched “shopping” to Fixture Browser; 1 page reopened.') bad.push('switched n=1');
  const prop = (filed) => Mm.switchOutcomeWords({ ok: true, mode: 'proposal', filed, reason: 'somebody is driving this browser (bk-1) — a proposal' }, { t: tEn });
  if (prop(true).tone !== 'warn' || !/A reminder is in For you/.test(prop(true).text) || !/Hand it back, then switch again/.test(prop(false).text)) bad.push('proposal words');
  if (Mm.switchOutcomeWords(err('browser_restarting'), { t: tEn }).text !== 'The browser is already restarting; try again in a moment.') bad.push('restarting words');
  // the other answers' words (§4.5–§4.7) through the same census
  const other = [];
  for (const r of [{ removed: false }, { error: 'x', code: 'y' }, null]) other.push(Mm.dismissOutcomeWords(r, tEn).text);
  if (Mm.dismissOutcomeWords({ removed: true }, tEn) !== null) bad.push('a dismiss that removed the row is not quiet');
  for (const c of ['not-found', 'unavailable', 'ambiguous', 'unsupported-host', 'zz']) other.push(Mm.viewErrorWords(err(c), tEn));
  other.push(Mm.viewErrorWords(null, tEn));
  for (const x of other) { if (!x) bad.push('an unworded answer'); else if (DEV_WORDS.test(x)) bad.push(`a developer word in "${x}"`); }
  // every sentence every fixture's model says
  for (const [name, view] of Object.entries(F.views())) for (const x of textsOf(Mm.switcherModel(view, { t: tEn, credentialWhy, preselect: F.FIXTURE_ID }))) if (DEV_WORDS.test(x)) bad.push(`${name}: a developer word in "${x}"`);
  return bad;
}
{
  const bad = judgeClosed(M, SW);
  ok(bad.length === 0, `ROW_STATES equal on both sides (${M.ROW_STATES.length}); every state worded; every switch answer worded (the rollback facts before the code), never r.error, never a developer word — nor any other answer or fixture sentence`, bad.slice(0, 12).join('\n    '));
}
// the answers' words
{
  ok(M.viewErrorWords({ code: 'ambiguous' }, tEn) === 'Several profiles share this name; open the one you want from the Agent browser panel.' && M.viewErrorWords(null, tEn) === 'Could not reach the server' && M.dismissOutcomeWords({ removed: false }, tEn).text === 'That note was already gone.', 'viewErrorWords / dismissOutcomeWords: the §4.6–§4.7 tables');
  const c1 = M.claimWords(F.CLAIM, tEn), c2 = M.claimWords({ host: 'shop.example' }, tEn);
  ok(c1.text === 'Your agent reports shop.example blocked it: “captcha”.' && c1.detail === F.CLAIM.evidence && c2.text === 'Your agent reports shop.example blocked it.' && c2.detail === null && M.claimWords({ host: 'x', evidence: 'e'.repeat(900) }, tEn).detail.length === 400, 'claimWords: WHO said it (your agent), the agent\'s words quoted, the evidence behind the fold (≤ 400)');
}

// ── §3 HIDDEN ROWS ──
console.log('§3 hidden rows, the empty line, the notice');
{
  const V = F.views();
  const consentOn = { ids: F.wired.ids, row: F.wired.row, control: (id, o) => (id === 'local-window' ? B.providerControl(id, { ...(o || {}), desktopConsent: true }) : F.wired.control(id, o)) };
  const all = { ...V, 'consent-on': F.viewOf({ world: consentOn }) };
  const leaked = [];
  for (const [name, view] of Object.entries(all)) for (const tg of M.switcherModel(view, { t: tEn }).targets) if (tg.id === 'cdp' || tg.id === 'local-window' || /^cloud:/.test(tg.id)) leaked.push(`${name}: ${tg.id}`);
  ok(leaked.length === 0 && Object.keys(all).length >= 25, `cdp / local-window (consent off AND on) / every cloud:* never draw a card in any of ${Object.keys(all).length} fixtures`, leaked.join(', '));
  const w1 = M.switcherModel(V.w1, { t: tEn });
  ok(w1.targets.length === 0 && w1.notice === null && w1.empty && w1.empty.text === "There's no other browser for “shopping” yet. If a site blocks your agent, take over in the live view and get past the check yourself.", 'W1 (this build): no card, no notice, the empty line (a)', w1);
  const w1p = M.switcherModel(V.w1, { t: tEn, preselect: F.FIXTURE_ID });
  ok(w1p.notice && w1p.notice.text === "Fixture Browser isn't part of this version of VibeSpace." && w1p.empty, 'W1 with the fixture row preselected (a stale client\'s banner): the not-in-this-version notice, then the empty line');
  const hp = M.switcherModel(V['host-profile'], { t: tEn, preselect: F.FIXTURE_ID, hostNameOf: (id) => (id === 'dev-1' ? 'Dev box' : id) });
  ok(hp.targets.length === 0 && hp.notice === null && hp.empty && hp.empty.text === '“shopping” is saved on another computer (Dev box); Fixture Browser only works on the computer VibeSpace runs on.', 'a paired machine\'s profile: the empty line (b) naming the MACHINE (its name, not its id) — no notice even preselected', hp);
  const hpId = M.switcherModel(V['host-profile'], { t: tEn });
  ok(/another computer \(dev-1\)/.test(hpId.empty.text), '…the id only when the client lists no such machine');
  for (const [name, why] of [['current-cdp', "VibeSpace didn't start this browser, only connected to it, so it can't be switched from here."], ['current-cloud', "Its saved logins live with Browserbase, so it can't be switched to another browser."], ['current-local-window', "This is a window on your own desktop, not a browser VibeSpace started, so it can't be switched from here."]]) {
    const m = M.switcherModel(V[name], { t: tEn });
    ok(m.targets.length === 0 && m.empty === null && m.now.blurb === why, `${name}: no card, no empty line — the now line's blurb says why ("${m.now.text}")`, m);
  }
  const cdpPre = M.switcherModel(V['current-cdp'], { t: tEn, preselect: F.FIXTURE_ID });
  ok(cdpPre.notice && cdpPre.notice.text === "“shopping” can't be switched to Fixture Browser.", 'a preselected row that is not a switch of this profile ⇒ the not-a-switch notice');
  const cc = M.switcherModel(V['current-fixture'], { t: tEn });
  ok(cc.now.text === "Your agent's browser: Fixture Browser" && cc.targets.length === 1 && cc.targets[0].id === 'chromium' && cc.targets[0].action.label === 'Switch to Chromium', 'on Fixture Browser: the card is Chromium (switching back)');
  // BROWSE YOURSELF (B-6ae8): nothing runs ⇒ the empty line opens it for the user (ONE button); the user browsing it himself
  // ⇒ in-use-by-hand whose ONE button closes his browsing (a switch would restart the browser under his page)
  // the SHIPPED table (no in-place target since lane engine-spi-egress L3): no card at all — the line + its ONE button
  const w1off = M.switcherModel(F.viewOf({ world: F.shipped, key: { source: 'none', whyCode: 'no-values' }, live: false }), { t: tEn });
  ok(w1off.targets.length === 0 && w1off.empty && w1off.empty.text === "The browser isn't open right now. If a site blocks your agent, open “shopping” yourself and get past the check." && w1off.empty.action && w1off.empty.action.kind === 'browse-yourself' && w1off.empty.action.label === 'Open it yourself' && w1off.empty.action.profileId === F.PROFILE_ID,
    'not running, on this computer, the shipped table: no card, the empty line opens it for the user (ONE button)', w1off);
  const w1none = M.switcherModel({ ...F.viewOf({ live: false }), rows: [] }, { t: tEn });
  ok(w1none.targets.length === 0 && w1none.empty && w1none.empty.action && w1none.empty.action.kind === 'browse-yourself', '…and the same line + button over a world whose rows are empty', w1none.empty);
  ok(!(w1.empty && w1.empty.action) && !(hp.empty && hp.empty.action), '…a LIVE browser keeps the take-over sentence (no button), a paired machine\'s profile gets none');
  const HU = 'hu-' + F.PROFILE_ID.slice(3);
  const byHand = F.viewOf({ leases: [], humans: [], inputs: {} });
  const selfRows = SW.switcherRows({ profile: byHand.profile, providerIds: F.wired.ids(), rowOf: F.wired.row, controlOf: F.wired.control, capabilityRefusalOf: B.capabilityRefusal, sources: () => ({ source: 'user' }), now: F.NOW, majors: { [F.FIXTURE_ID]: { major: 146, at: F.NOW } }, leases: [], inputs: { [`${HU}|${F.PROFILE_ID}`]: { input: 'user' } }, humans: [{ profileId: F.PROFILE_ID, browserKey: HU }] });
  const selfCard = M.switcherModel({ ...byHand, rows: selfRows }, { t: tEn, sessionOf: () => 'never-a-session' }).targets.find((x) => x.id === F.FIXTURE_ID);
  ok(selfCard && selfCard.state === 'in-use-by-hand' && selfCard.sentences[0].text === "You're browsing “shopping” yourself. Close your browsing first, then switch." && selfCard.action && selfCard.action.kind === 'close-browsing' && selfCard.action.key === HU && selfCard.action.label === 'Close my browsing', 'the USER browsing it himself (his holder row, no lease) ⇒ in-use-by-hand, "Close your browsing first" + ONE button that closes it — never a session\'s hand-back', selfCard);
  const noSelf = SW.switcherRows({ profile: byHand.profile, providerIds: F.wired.ids(), rowOf: F.wired.row, controlOf: F.wired.control, capabilityRefusalOf: B.capabilityRefusal, sources: () => ({ source: 'user' }), now: F.NOW, majors: { [F.FIXTURE_ID]: { major: 146, at: F.NOW } }, leases: [], inputs: { [`${HU}|${F.PROFILE_ID}`]: { input: 'user' } }, humans: [] }).find((r) => r.id === F.FIXTURE_ID);
  ok(noSelf.state === 'ready' && SW.switchVerdict({ profile: byHand.profile, target: F.FIXTURE_ID, rowOf: F.wired.row, controlOf: F.wired.control, resolveKey: () => ({ source: 'user' }), now: F.NOW, majors: { [F.FIXTURE_ID]: { major: 146, at: F.NOW } }, leases: [], inputs: { [`${HU}|${F.PROFILE_ID}`]: { input: 'user' } }, humans: [{ profileId: F.PROFILE_ID, browserKey: HU }] }).mode === 'proposal', 'CONTROL: without the human rows the same world reads `ready` (a switch would stop the Chrome under his page); with them the switch itself is a PROPOSAL');
}

// ── §4 THE DIGEST FACTS ──
console.log('§4 the digest facts: choices, the fact, the chip words');
function judgeDigest(SWm, Mm) {
  const bad = [];
  const p = { id: 'bp-1', label: 'shopping', provider: 'chromium', host: null, lastChromiumMajor: 151 };
  const ids = F.wired.ids();
  const ch = (world, prof = p) => SWm.switchChoices({ profile: prof, providerIds: ids, rowOf: world.row, controlOf: world.control });
  // lane engine-spi-egress L3: the SHIPPED table has no in-place target ⇒ []; the fixture row wired ⇒ [it]; not wired ⇒ []
  if (!same(ch(F.shipped), [])) bad.push(`shipped ⇒ ${JSON.stringify(ch(F.shipped))}`);
  if (!same(ch(F.unwired), [])) bad.push(`unwired ⇒ ${JSON.stringify(ch(F.unwired))}`);
  if (!same(ch(F.wired), [F.FIXTURE_ID])) bad.push(`wired ⇒ ${JSON.stringify(ch(F.wired))}`);
  if (!same(ch(F.wired, { ...p, host: 'dev-1' }), [])) bad.push('a paired machine ⇒ not []');
  if (!same(ch(F.wired, { ...p, provider: 'cdp' }), [])) bad.push('from cdp ⇒ not []');
  if (!same(SWm.backendFact(p), { id: 'chromium', major: 151, plan: null })) bad.push(`backendFact ${JSON.stringify(SWm.backendFact(p))}`);
  const cw = (id, extra = {}) => Mm.chipWords({ id, major: 146, plan: 'free', ...extra }, tEn);
  if (cw('chromium') !== 'Chromium' || cw('cloud:browserbase') !== 'Browserbase (cloud)' || cw('cdp') !== 'connected browser' || cw('local-window') !== 'desktop window' || cw('zz-raw') !== 'unknown browser' || Mm.chipWords(null, tEn) !== null) bad.push('chipWords');
  if (Mm.backendName('zz-raw', tEn) !== 'an unknown browser' || Mm.backendName('cloud:agentcore', tEn) !== 'Amazon Bedrock AgentCore (cloud)' || Mm.backendName('cdp', tEn) !== 'a browser VibeSpace connected to') bad.push('backendName');
  const d = { backends: { 'bp-1': { id: 'chromium', major: 151, plan: null, choices: ['cloak'] } } };
  if (!same(Mm.choicesOf(d, 'bp-1'), ['cloak']) || !same(Mm.choicesOf({}, 'bp-1'), []) || !same(Mm.choicesOf(null, 'bp-1'), []) || Mm.backendFactOf(d, 'bp-1').major !== 151 || Mm.backendFactOf({}, 'bp-1') !== null) bad.push('choicesOf / backendFactOf');
  return bad;
}
{
  const bad = judgeDigest(SW, M);
  ok(bad.length === 0, 'switchChoices ([] shipped, [] not wired, [the fixture row] wired, [] on a paired machine or from cdp), backendFact, chipWords (no major, no plan), backendName, choicesOf', bad.join('\n    '));
}

// ── §5 PENDING ──
console.log('§5 the click\'s own overlay');
{
  const V = F.views();
  const s = M.switcherModel(V.ready, { t: tEn, pending: { state: 'switching', to: F.FIXTURE_ID } });
  ok(s.switching && s.targets.length === 0 && s.now.text === 'Switching to Fixture Browser… You can close this window; the switch goes on.', 'pending switching ⇒ the now line alone, naming the target');
}
// ── §6 i18n ──
console.log('§6 i18n: zh + ja, no param left, ja quotes, the retired keys');
const libTexts = Object.fromEntries(fs.readdirSync(path.join(repo, 'src/lib')).filter((f) => f.endsWith('.js')).map((f) => [f, read('src/lib/' + f)]));
{
  const lit = (src) => {
    const out = new Set();
    for (const m of src.matchAll(/\b(?:t|i18nKey)\(\s*('(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*")/g)) out.add(Function(`return ${m[1]}`)());
    for (const m of src.matchAll(/\btc\(\s*'([^']+)'\s*,\s*('(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*")/g)) out.add(m[1] + '::' + Function(`return ${m[2]}`)());
    return [...out];
  };
  const keys = [...new Set([...lit(libTexts['browser-switcher-model.js']), ...lit(libTexts['browser-switcher.js'])])];
  const missing = keys.filter((k) => !zh[k] || !ja[k]);
  ok(keys.length >= 60 && missing.length === 0, `every literal of the model + the DOM half (${keys.length}) has zh AND ja`, missing.join(' | '));
  const bad = [];
  for (const [lang, tt] of [['zh', tZh], ['ja', tJa]]) {
    for (const [name, view] of Object.entries(F.views())) {
      for (const pre of [null, F.FIXTURE_ID]) {
        const m = M.switcherModel(view, { t: tt, credentialWhy: (x, o) => R.credentialWhyText(x, o), preselect: pre, sessionOf: () => 'w1' });
        for (const x of textsOf(m)) {
          if (/\{\w+\}/.test(x)) bad.push(`${lang} ${name}: a param left in "${x}"`);
          if (lang === 'ja' && /[“”]/.test(x)) bad.push(`ja ${name}: “ ” in "${x}"`);
        }
      }
    }
    for (const x of [M.switchOutcomeWords({ restored: true, from: 'chromium', to: F.FIXTURE_ID, code: 'launch_failed' }, { t: tt, label: 'shopping' }).text, M.switchOutcomeWords({ ok: true, mode: 'switch', to: F.FIXTURE_ID, reopened: [{ ok: true }, { ok: false }] }, { t: tt, label: 'shopping' }).text, M.claimWords(F.CLAIM, tt).text]) {
      if (/\{\w+\}/.test(x)) bad.push(`${lang}: a param left in "${x}"`);
      if (lang === 'ja' && /[“”]/.test(x)) bad.push(`ja: “ ” in "${x}"`);
    }
  }
  ok(bad.length === 0, 'every zh / ja sentence of every fixture renders with no {param} left, and ja quotes with 「」 (never “ ”)', bad.slice(0, 8).join('\n    '));
  const jaQuoted = keys.filter((k) => /[“”]/.test(k)).filter((k) => !/「/.test(ja[k] || ''));
  ok(jaQuoted.length === 0, 'every quoted en sentence reads 「…」 in ja', jaQuoted.join(' | '));
  const RETIRED = ['Browser backend', 'browser backend', 'tier {tier}', 'it suggests tier {tier}', 'Backend: {chip} — switch…', 'This profile’s backend — click to switch', 'backend unknown', 'Open Integrations', 'Install Fixture Browser…', 'Installing Fixture Browser…', 'Open with Fixture Browser', 'Per-site memory (claims, never an automatic switch)', 'Remember', 'Switch', 'Make this the profile’s default backend', 'Your own key', 'Cluster default (seats shared with other users)', '{used} used on this instance', 'The agent says this page is blocked: {host}', 'installed at {path}', 'install in progress…', 'Switch refused — {reason}', 'Not switched: {reason}. {filed}', '{n} could not be re-opened', 'exact host, e.g. portal.example', 'why (optional)', 'by you', 'switching…', 'current', 'This browser has no profile — a backend is a property of a profile', 'Fixture Browser executable path', '{n} s', "You're driving this browser by hand in the live view. Hand it back to your agent; this updates by itself.", 'Go to live view', 'Empty means the free tier (one concurrent session).', 'Browser: {chip}; switch…'];
  const PREFIX = ['A switch stops this profile’s browser', 'seat limit unknown —', '{used} used / {total} seats', 'This profile had no stable fingerprint before:', 'This profile leaves its stable fingerprint behind:', 'npm install {spec} into the VibeSpace data directory', 'Switch anyway — nothing recorded', 'Switched {label} from {from} to {to}'];
  const inDict = [...RETIRED.filter((k) => k in zh || k in ja), ...Object.keys({ ...zh, ...ja }).filter((k) => PREFIX.some((p) => k.startsWith(p)))];
  const allLib = Object.entries(libTexts).filter(([f]) => !/^i18n-(zh|ja)\.js$/.test(f));
  const inSrc = RETIRED.filter((k) => allLib.some(([, s]) => s.includes(`t('${k}'`) || s.includes(`t("${k}"`) || s.includes(`tr('${k}'`)));
  ok(inDict.length === 0 && inSrc.length === 0, `the retired keys (${RETIRED.length} + ${PREFIX.length} families) are gone from both dictionaries and from src/lib`, JSON.stringify({ inDict, inSrc }));
  ok(zh['browser::Dismiss'] === '知道了' && ja['browser::Dismiss'] === '非表示', 'Dismiss contexted (zh 知道了, ja 非表示 — never the footer\'s Close)');
  // the label law: every button label ≤ 26 Latin / ≤ 14 CJK (counted without a trailing …)
  const LABELS = ['Switch to {name}', 'Hand it back to your agent', 'Enter license key…', 'Open Agent browser…', 'Use my own license key…', 'Details', 'Hide details', 'Close'];
  const tooLong = [];
  for (const k of LABELS) for (const [lang, d] of [['en', null], ['zh', zh], ['ja', ja]]) {
    const s = mkT(d)(k, { name: 'Fixture Browser' }).replace(/…$/, '');
    const cjk = [...s].filter((c) => /[　-鿿＀-￯]/.test(c)).length;
    const latin = [...s].length - cjk;
    if (cjk ? cjk > 14 || latin > 26 : latin > 26) tooLong.push(`${lang}: "${s}"`);
  }
  ok(tooLong.length === 0, 'the label law: every dialog button label fits the phone column in every language', tooLong.join(' | '));
}

// ── §7 WIRING PINS ──
console.log('§7 wiring pins');
{
  const dom = libTexts['browser-switcher.js'], lw = libTexts['browser-live-window.js'], pk = libTexts['browser-profile-picker.js'], ma = libTexts['manage-agents.js'], su = libTexts['settings-ui.js'];
  const sw = read('src/browser-switch.js'), kp = read('src/server/browser-keeper.js'), rt = read('src/routes/browser.js');
  const code = (s) => s.replace(/\/\/.*$/gm, '');
  ok(/from '\.\/browser-switcher-model\.js'/.test(dom) && !/file-tool-btn/.test(dom), 'the DOM half imports the model and never the 24 px icon class');
  const writes = [...code(dom).matchAll(/(?:textContent\s*=\s*|\bel\([^,]*,[^,]*,\s*)([^;\n)]*)/g)].map((m) => m[1]);
  ok(writes.length >= 8 && !writes.some((w) => /\.reason\b|\.error\b|iv\.error|whyCode/.test(w)), `no server sentence (.reason / .error / iv.error / whyCode) reaches a textContent or el() (${writes.length} writes read)`);
  ok(!/makeDefault/.test(dom) && /dialog\.appendChild\(footer\)/.test(dom) && /footer\.className = 'dialog-footer'/.test(dom) && /reconcileKeyed\(body,/.test(dom), 'no makeDefault; the footer (Close) is appended to the dialog outside the body; the body is a keyed patch');
  ok(/app\.ws\?\.onGlobal\?\.\(onGlobal\)/.test(dom) && /onClose: \(\) => \{[^}]*app\.ws\?\.offGlobal\?\.\(onGlobal\)/.test(dom), 'the broadcast handler is removed BY NAME in onClose');
  ok(/a\.kind === 'switch-confirm'\) \{ if \(await showConfirmDialog\(\{ \.\.\.a\.confirm \}\)\)/.test(dom) && !/a\.kind === 'install'/.test(dom),   // ONE options object (the approval census §1b, the .197 integration)
     'the downgrade goes through the house showConfirmDialog; no install act is left (lane engine-spi-egress L3)');
  ok(/if \(gen !== st\.gen \|\| st\.closed\) return;/.test(dom) && /const gen = \+\+st\.gen;/.test(dom), 'a slower fetch never paints over a newer one (st.gen)');
  const pri = /export const LIVE_BAR_PRIORITY = Object\.freeze\((\{[^}]*\})\)/.exec(lw);
  ok(pri && /backendLabel: 4/.test(pri[1]) && !/LIVE_BAR_PRIORITY\.\w+\s*=/.test(lw) && /className = 'browser-live-backend-label browser-chip'/.test(lw) && /backendLabel: backendLabelEl/.test(lw) && /key === 'backendLabel'\) rows\.push\(\{ caption: t\("Your agent's browser: \{name\}", \{ name: backendLabelEl\.textContent \}\) \}\)/.test(lw) && /key === 'backend'\) rows\.push\(\{ label: t\('Switch browser \(now \{name\}\)…'/.test(lw), 'the live bar: the plain-label span, `backendLabel: 4` INSIDE the frozen literal; folded, the name says what it is (an info row "Your agent\'s browser: …", or "Switch browser (now …)…")');
  const banner = lw.slice(lw.indexOf('const claims = app.browserBlockedFor'), lw.indexOf('backendBtn.onclick = () =>'));
  ok(/tc\('browser', 'Dismiss'\)/.test(banner) && /dismissOutcomeWords\(r, t\)/.test(banner) && /claimWords\(b, t\)/.test(banner) && /if \(pid && choices\.length\)/.test(banner) && !/Open with Fixture Browser|it suggests tier/.test(lw), 'the banner: the claim\'s words, a switch button only with a choice, Dismiss contexted and its answer worded');
  ok(/pid && choices\.length \? w\.text : `\$\{w\.text\} \$\{t\('Take over to get past the check yourself\.'\)\}`/.test(banner) && /if \(w\.detail\)/.test(banner) && /st\.claimOpen/.test(banner) && !/file-tool-btn/.test(banner) && (banner.match(/textBtn\(/g) || []).length === 3, 'the banner (2026-09-28): no switch ⇒ it says the way out (take over), the agent\'s evidence behind a Details fold that survives a rebuild, every button the house text button');
  ok(/export function pickerItems\(\{[^\n]*choicesOf = \(\) => \[\] \}\)/.test(pk) && /choicesOf: \(id\) => \(this\.browserChoicesFor/.test(pk) && /this\.browserChipFor\(p\.id\)/.test(pk), 'the picker takes choicesOf (defaulted) and every chip site reads browserChipFor');
  ok(!/'browser backend'/.test(ma) && !/\/api\/browser\/install\b/.test(ma) && !/installVerdictWords|installConfirmWords|installOutcomeWords/.test(ma), 'Manage Agents: no "browser backend", and no anti-bot install row or door any more (lane engine-spi-egress L3)');
  ok(/open\(\{ syncId, search(, category)? \} = \{\}\)/.test(su), 'SettingsUI.open destructures `search` (and `category` — lane plugin-settings-p0)');
  const rows = sw.slice(sw.indexOf('function switcherRows('), sw.indexOf('function switchChoices('));
  ok(/leases = \[\], inputs = \{\}, keyRequiredOf = keyRequiredFor, humans = \[\] \} = \{\}\)/.test(rows) && !/fingerprintChange|binaryOf|sitesOf/.test(rows), 'switcherRows: the new inputs defaulted (browse yourself: + humans, the user\'s own holder rows — the .197 integration spells cloak\'s + browse-yourself\'s together); fingerprintChange outside any `v.ok ?`');
  ok(/why: 'switch rolled back'/.test(kp) && /backends: Object\.fromEntries\(named\(\)\.map\(\(p\) => \[p\.id, backendFactFor\(p\)\]\)\)/.test(kp), 'the keeper: the start-failure rollback, installVerdict = installFacts (the cloak install row\'s file, rv-browser F7), the digest\'s backends');
  ok(/typeof e\?\.restored === 'boolean' \? \{ restored: e\.restored, from: e\.from \|\| null, to: e\.to \|\| null \}/.test(rt) && /k\.choicesFor\(profileId\)/.test(rt), 'routes: fail() spreads restored / from / to; the blocked `next` reads the profile\'s choices');
  ok(!/^import /m.test(libTexts['browser-switcher-model.js']) && !/\bdocument\b|\bwindow\./.test(code(libTexts['browser-switcher-model.js'])), 'the model is PURE (imports nothing, no DOM)');
}

// ── NEGATIVE CONTROLS ──
console.log('NEGATIVE CONTROLS (patched copies in the scratch dir)');
{
  const msrc = read('src/lib/browser-switcher-model.js'), ssrc = read('src/browser-switch.js');
  // (a) a model that shows the server's sentence instead of its own words
  const aSrc = msrc.replace("return { key: 'target:' + r.id, id: r.id, name, blurb: blurbOf(r.id, t), state, sentences: w.sentences,", "return { key: 'target:' + r.id, id: r.id, name, blurb: blurbOf(r.id, t), state, sentences: [{ text: String(r.reason || r.code || r.state), warn: false }],");
  // (e) the code read before the rollback facts
  const eSrc = msrc.replace("  if (r.restored === true) return", "  if (STALE_CODES.has(String(r.code || ''))) return { tone: 'warn', text: t(i18nKey('Not switched; something changed — see the reason below.')), refresh: true };\n  if (r.restored === true) return");
  // (b) the closed set short of one state; (c) choices that ignore the control; (d) the key before the program
  const bSrc = ssrc.replace("'needs-key', 'older-browser', 'all-in-use-own',", "'needs-key', 'all-in-use-own',");
  const cSrc = ssrc.replace('    return !!(c && c.ok === true);\n', '    return true;\n');
  const dSrc = ssrc.replace("  if (v.code === 'backend_no_key') return 'needs-key';\n", "");
  ok(aSrc !== msrc && eSrc !== msrc && bSrc !== ssrc && cSrc !== ssrc && dSrc !== ssrc, 'NEGATIVE CONTROL: the five mutations applied to their copies (the anchors exist)');
  const Ma = await import(pathToFileURL(MUT.write('src/lib/browser-switcher-model.js', aSrc, 'echo', { esm: true })).href);
  const Me = await import(pathToFileURL(MUT.write('src/lib/browser-switcher-model.js', eSrc, 'codefirst', { esm: true })).href);
  const SWb = MUT.load('src/browser-switch.js', bSrc, 'noolderbrowser');
  const SWc = MUT.load('src/browser-switch.js', cSrc, 'nocontrol');
  const SWd = MUT.load('src/browser-switch.js', dSrc, 'keyfirst');
  const a1 = judgeStates(Ma, F.views()), a2 = judgeClosed(Ma, SW);
  ok(a1.length >= 10 && a2.some((x) => /developer word/.test(x)), `NEGATIVE CONTROL (a): a model echoing the server's sentence fails §1 (${a1.length}) AND §2's developer-word census (${a2.filter((x) => /developer word/.test(x)).length})`);
  const b = judgeClosed(M, SWb);
  ok(b.some((x) => /ROW_STATES ≠/.test(x)), `NEGATIVE CONTROL (b): a switch module missing 'older-browser' fails §2 (${b[0]})`);
  const c = judgeDigest(SWc, M);
  ok(c.some((x) => /^unwired/.test(x)), `NEGATIVE CONTROL (c): switchChoices ignoring control.ok answers [the fixture row] where it is not wired — §4 red (${c[0]})`);
  const d = judgeStates(M, F.views(SWd));
  ok(d.some((x) => /^needs-key/.test(x)), `NEGATIVE CONTROL (d): rowState without its key rule fails §1 on needs-key (${d.find((x) => /^needs-key/.test(x))})`);
  const e = judgeClosed(Me, SW);
  ok(e.some((x) => /backend_no_key\+restored/.test(x)), `NEGATIVE CONTROL (e): switchOutcomeWords reading the code before restored fails §2 (${e.find((x) => /restored/.test(x))})`);
  // (f) the needs-key card's pre-fix filter (every code but `no-values` explained) — the plain instance's `no-preset`
  const fSrc = msrc.replace("if (k && KEY_UNUSABLE.has(String(k.whyCode || '')) && typeof c.credentialWhy === 'function') {", "if (k && k.whyCode && k.whyCode !== 'no-values' && typeof c.credentialWhy === 'function') {");
  // (g) the driven card's pre-fix act (a trip to the live view, behind the modal)
  const gSrc = msrc.replace("action: sessionId ? act('handback', t(i18nKey('Hand it back to your agent')), { sessionId }) : null", "action: sessionId ? act('live-view', t(i18nKey('Go to live view')), { sessionId }) : null");
  ok(fSrc !== msrc && gSrc !== msrc, 'NEGATIVE CONTROL: (f) + (g) applied to their copies (the anchors exist)');
  const Mf = await import(pathToFileURL(MUT.write('src/lib/browser-switcher-model.js', fSrc, 'keyfilter', { esm: true })).href);
  const f = judgeStates(Mf, F.views());
  ok(f.some((x) => /^needs-key-no-preset/.test(x)) && f.some((x) => /^needs-key-own-missing/.test(x)), `NEGATIVE CONTROL (f): the pre-fix needs-key filter explains "nothing configured" as a saved key that can't be used — §1 red (${f.find((x) => /no-preset/.test(x))})`);
  const Mg = await import(pathToFileURL(MUT.write('src/lib/browser-switcher-model.js', gSrc, 'liveview', { esm: true })).href);
  ok(!drivenActs(Mg), 'NEGATIVE CONTROL (g): the pre-fix driven card (a trip to the live view, behind the modal) fails the §1 handback pin');
}
for (const r of copiesCensus(MUT.files, MUT.dir, repo, { minCopies: 7 })) ok(r.pass, 'tree: ' + r.name + (r.pass ? '' : ' — ' + r.detail));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
