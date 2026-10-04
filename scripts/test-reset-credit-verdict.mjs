#!/usr/bin/env node
// THE RESET-CREDIT VERDICT (docs/design-reset-credits.zh.md §4/§6, owner rulings
// 2026-09-22). PURE — src/reset-credit.js — plus the WIRING PINS that prove the
// pool engine consumes it and forks the ladder on warmth (the 2.355.0 lesson: a
// pure fix with no call site is dead; comments stripped — the 2.369.134 lesson).
//   §1 the common preconditions, each one alone refusing by name
//   §2 openai: use at the wall at once; the ONE refusal = the last credit below CREDIT_FLOOR
//   §3 anthropic: the ReLU — the knee at exactly weekQuota/burnRate, use-by, replenishes
//   §4 the ladder fork: warm ⇒ credit before the switch; cold ⇒ only with nowhere to switch
//   §5 describeUse / reasonText / offerOf / windowPaceRate
//   §6 NEGATIVE CONTROLS: patched copies of the module (a dropped precondition, a
//      floor that ignores the credit count, a knee off by one) turn the tables red
//   §7 WIRING PINS: engine, both normalizers, auto-resume, server.js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (n, c, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? ' — ' + e : '')); } };
const MOD = path.join(REPO, 'src/reset-credit.js');
const RC = require(MOD);

const NOW = 1_800_000_000;
const H = 3600, D = 86400, WEEK = 7 * D;
// a warm openai wall, a week window with 3 days to its natural reset, 3 credits
const base = (o = {}) => ({ vendor: 'openai', wallHit: true, remainingPct: 0, resetsAtSec: NOW + 3 * D, nowSec: NOW, periodSec: WEEK, creditsLeft: 3, inTurn: true, warm: true, poolAlternative: true, ...o });

/** The two vendors' tables — a list of [name, facts, {use, reason}] rows; run
 *  against any module copy so a patched copy can be shown to fail them. */
const TABLE = [
  // §1 preconditions
  ['no wall ⇒ never proactive', base({ wallHit: false }), { use: false, reason: 'no-wall' }],
  ['a wall stated as a string is not a wall (only `true` counts)', base({ wallHit: 'yes' }), { use: false, reason: 'no-wall' }],
  ['zero credits', base({ creditsLeft: 0 }), { use: false, reason: 'no-credits' }],
  ['unknown credit count is NOT zero (the vendor answers harmlessly)', base({ creditsLeft: null }), { use: true, reason: 'wall-use-now' }],
  ['in the one-try cooldown', base({ cooldownUntilSec: NOW + 60 }), { use: false, reason: 'cooldown' }],
  ['a cooldown that has passed does not refuse', base({ cooldownUntilSec: NOW - 1 }), { use: true, reason: 'wall-use-now' }],
  ['an expired grant', base({ useBySec: NOW - 1 }), { use: false, reason: 'grant-expired' }],
  ['an unknown vendor', base({ vendor: 'gemini' }), { use: false, reason: 'unknown-vendor' }],
  // §2 openai
  ['openai warm wall, 3 days of a week left, 3 credits ⇒ use now', base(), { use: true, reason: 'wall-use-now' }],
  ['openai warm wall, 1 hour of a week left, 3 credits ⇒ still use (a spare credit is not scarce)', base({ resetsAtSec: NOW + H }), { use: true, reason: 'wall-use-now' }],
  ['openai LAST credit, 1 hour of a week left ⇒ keep (last-credit-low-value)', base({ resetsAtSec: NOW + H, creditsLeft: 1 }), { use: false, reason: 'last-credit-low-value' }],
  ['openai LAST credit, 3 days of a week left ⇒ use', base({ creditsLeft: 1 }), { use: true, reason: 'wall-use-now' }],
  ['openai LAST credit exactly AT the floor (0.1 of the window) ⇒ use (the floor is strict)', base({ resetsAtSec: NOW + 0.1 * WEEK, creditsLeft: 1 }), { use: true, reason: 'wall-use-now' }],
  ['openai LAST credit, reset unknown ⇒ use (ignorance never refuses)', base({ resetsAtSec: null, creditsLeft: 1 }), { use: true, reason: 'wall-use-now' }],
  ['openai LAST credit on a 5h window with 20 min left ⇒ keep', base({ periodSec: 5 * H, resetsAtSec: NOW + 20 * 60, creditsLeft: 1 }), { use: false, reason: 'last-credit-low-value' }],
  // §3 anthropic — W = 1 (a whole window), b = 1/(2 days) ⇒ the knee is 2 days
  ['anthropic 3 days left at a 2-day knee ⇒ above-knee', base({ vendor: 'anthropic', weekQuota: 1, burnRate: 1 / (2 * D) }), { use: true, reason: 'above-knee' }],
  ['anthropic EXACTLY at the knee (R−t = W/b) ⇒ above-knee', base({ vendor: 'anthropic', weekQuota: 1, burnRate: 1 / (2 * D), resetsAtSec: NOW + 2 * D }), { use: true, reason: 'above-knee' }],
  // r2: the knee is decided on the UNROUNDED ratio — at 2 days minus ONE SECOND
  // the ratio is 0.9999942, which rounded to 3 decimals read 1.000 and spent
  ['anthropic ONE SECOND below the knee ⇒ keep (the knee is exact — the ratio is not rounded first)', base({ vendor: 'anthropic', weekQuota: 1, burnRate: 1 / (2 * D), resetsAtSec: NOW + 2 * D - 1 }), { use: false, reason: 'below-knee-keep' }],
  ['anthropic one hour below the knee ⇒ keep', base({ vendor: 'anthropic', weekQuota: 1, burnRate: 1 / (2 * D), resetsAtSec: NOW + 2 * D - H }), { use: false, reason: 'below-knee-keep' }],
  ['anthropic below the knee, grant lapses in 20 h ⇒ use-by-imminent', base({ vendor: 'anthropic', weekQuota: 1, burnRate: 1 / (2 * D), resetsAtSec: NOW + D, useBySec: NOW + 20 * H }), { use: true, reason: 'use-by-imminent' }],
  ['anthropic below the knee, grant lapses in 3 days ⇒ keep', base({ vendor: 'anthropic', weekQuota: 1, burnRate: 1 / (2 * D), resetsAtSec: NOW + D, useBySec: NOW + 3 * D }), { use: false, reason: 'below-knee-keep' }],
  ['anthropic below the knee, re-granted weekly ⇒ replenishes', base({ vendor: 'anthropic', weekQuota: 1, burnRate: 1 / (2 * D), resetsAtSec: NOW + D, replenishes: true }), { use: true, reason: 'replenishes' }],
  ['anthropic, no burn rate ⇒ kept, named burn-unknown', base({ vendor: 'anthropic', weekQuota: 1, burnRate: null }), { use: false, reason: 'burn-unknown' }],
  // §4 the ladder fork
  ['COLD with a pool alternative ⇒ switch first', base({ inTurn: false, warm: false }), { use: false, reason: 'cold-switch-first' }],
  ['COLD with an UNKNOWN pool alternative ⇒ switch first (unknown is not "none")', base({ inTurn: false, warm: false, poolAlternative: null }), { use: false, reason: 'cold-switch-first' }],
  ['COLD with NO pool alternative ⇒ the credit is its rung', base({ inTurn: false, warm: false, poolAlternative: false }), { use: true, reason: 'wall-use-now' }],
  ['COLD after the switch rung ran and moved nothing ⇒ credit', base({ inTurn: false, warm: false, ladderPosition: 'after-switch' }), { use: true, reason: 'wall-use-now' }],
  ['WARM by cache only (not in a turn) ⇒ credit before the switch', base({ inTurn: false, warm: true }), { use: true, reason: 'wall-use-now' }],
  ['WARM by turn only (cache stamp missing) ⇒ credit before the switch', base({ inTurn: true, warm: false }), { use: true, reason: 'wall-use-now' }],
  ['a cold anthropic conversation with somewhere to go ⇒ switch first (the fork precedes the curve)', base({ vendor: 'anthropic', weekQuota: 1, burnRate: 1 / D, inTurn: false, warm: false }), { use: false, reason: 'cold-switch-first' }],
];
const runTable = (mod) => TABLE.map(([name, f, want]) => {
  const v = mod.resetCreditVerdict(f);
  return { name, good: v.use === want.use && v.reason === want.reason, got: `${v.use}/${v.reason}`, want: `${want.use}/${want.reason}` };
});

console.log('\n§1–§4 the verdict tables (both vendors, both warmths, every precondition)');
for (const r of runTable(RC)) ok(r.name, r.good, `got ${r.got}, want ${r.want}`);
ok('every reason the table produced is in the closed REASONS set', TABLE.every(([, f]) => RC.REASONS.includes(RC.resetCreditVerdict(f).reason)));
ok('every refusal names a reason and has words for it', RC.REASONS.every((r) => typeof RC.reasonText(r) === 'string' && RC.reasonText(r) !== r));
ok('CREDIT_FLOOR is the documented tenth of a window', RC.CREDIT_FLOOR === 0.1);

console.log('\n§2/§3 the numbers the verdict reports');
{
  const v = RC.resetCreditVerdict(base());
  ok('openai valueFraction = (R−t)/P + (1−q) (3/7 + 1)', Math.abs(v.valueFraction - (3 / 7 + 1)) < 0.001 && Math.abs(v.windowFraction - 3 / 7) < 0.001, JSON.stringify(v));
  ok('…waitSavedSec = R − t', v.waitSavedSec === 3 * D);
  const vq = RC.resetCreditVerdict(base({ remainingPct: 40 }));
  ok('…q = 40 % lowers the value by 0.4', Math.abs(vq.valueFraction - (3 / 7 + 0.6)) < 0.001, JSON.stringify(vq));
  const va = RC.resetCreditVerdict(base({ vendor: 'anthropic', weekQuota: 1, burnRate: 1 / (4 * D) }));
  ok('anthropic valueFraction = min(1, b·(R−t)/W) — 3 days at a 4-day knee = 0.75', va.valueFraction === 0.75 && va.reason === 'below-knee-keep', JSON.stringify(va));
  ok('kneeSec = W / b', RC.kneeSec({ weekQuota: 1, burnRate: 1 / (2 * D) }) === 2 * D && RC.kneeSec({ weekQuota: 1, burnRate: 0 }) === null);
}

console.log('\n§5 the sentences, the offer, the pace');
{
  const fmt = (s) => `T${s - NOW}`;
  const v = RC.resetCreditVerdict(base({ periodSec: 5 * H, resetsAtSec: NOW + 2 * H }));
  const o = RC.describeUse('openai', v, { nowSec: NOW, resetsAtSec: NOW + 2 * H, periodSec: 5 * H, creditsLeft: 3, fmtTime: fmt });
  ok('openai: a NEW window until t+P, the natural reset, the wait saved, the credits left',
    o.text === 'Starts a new 5h window now, running until T18000. Without it the limit resets at T7200. Saves a wait of 2h. 2 reset credits left after this one.', o.text);
  ok('…as i18n lines (key + params) the client words with t()', o.lines.length === 4 && o.lines[0].key === 'Starts a new {period} window now, running until {until}.' && o.lines[0].params.until === 'T18000');
  const o1 = RC.describeUse('openai', v, { nowSec: NOW, resetsAtSec: NOW + 2 * H, periodSec: 5 * H, creditsLeft: 2, fmtTime: fmt });
  ok('…one credit left after this one is singular', /1 reset credit left after this one\.$/.test(o1.text), o1.text);
  const va = RC.resetCreditVerdict(base({ vendor: 'anthropic', weekQuota: 1, burnRate: 1 / D }));
  const a = RC.describeUse('anthropic', va, { nowSec: NOW, resetsAtSec: NOW + 3 * D, creditsLeft: 1, fmtTime: fmt });
  ok('anthropic: refills until R, the period unchanged; the LAST credit says so',
    a.text === 'Refills the limit now; it still resets at T259200 (the period does not change). Saves a wait of 3d. This is the last stored reset credit.', a.text);
  ok('…an unknown count says nothing about credits', !/credit/.test(RC.describeUse('anthropic', va, { nowSec: NOW, resetsAtSec: NOW + 3 * D, creditsLeft: null, fmtTime: fmt }).text));
  ok('the default time format is an ISO minute in UTC', /^Starts a new 7d window now, running until \d{4}-\d\d-\d\d \d\d:\d\d UTC\./.test(RC.describeUse('openai', RC.resetCreditVerdict(base()), { nowSec: NOW, resetsAtSec: NOW + 3 * D, periodSec: WEEK }).text));
  ok('fmtWait', RC.fmtWait(30) === '<1m' && RC.fmtWait(12 * 60) === '12m' && RC.fmtWait(2 * H + 5 * 60) === '2h 5m' && RC.fmtWait(3 * D + 4 * H) === '3d 4h' && RC.fmtWait(WEEK) === '7d');
  ok('offerOf accepts {available>0 integer, known mode}', JSON.stringify(RC.offerOf({ available: 2, mode: 'ask', junk: '<b>' })) === '{"available":2,"mode":"ask"}');
  ok('offerOf refuses zero / fractional / unknown mode / non-objects', [{ available: 0, mode: 'off' }, { available: 1.5, mode: 'off' }, { available: 1, mode: 'always' }, null, 'x'].every((x) => RC.offerOf(x) === null));
  // pace: half the window spent in its first 3.5 days ⇒ at 3.5 days left the refill is worth exactly half
  const rate = RC.windowPaceRate({ usedFraction: 0.5, resetsAtSec: NOW + 3.5 * D, periodSec: WEEK, nowSec: NOW });
  ok('windowPaceRate = used / time since the window opened', Math.abs(rate - 0.5 / (3.5 * D)) < 1e-12, String(rate));
  ok('…feeds the anthropic curve (3.5 days left at that pace = 0.5 of a refill ⇒ kept)',
    RC.resetCreditVerdict(base({ vendor: 'anthropic', weekQuota: 1, burnRate: rate, resetsAtSec: NOW + 3.5 * D })).valueFraction === 0.5);
  ok('…null before the window opened / on unknown input', RC.windowPaceRate({ usedFraction: 0.1, resetsAtSec: NOW + 8 * D, periodSec: WEEK, nowSec: NOW }) === null && RC.windowPaceRate({ usedFraction: null, resetsAtSec: NOW + D, periodSec: WEEK, nowSec: NOW }) === null);
}

console.log('\n§6 NEGATIVE CONTROLS — patched copies of the module');
{
  const src = fs.readFileSync(MOD, 'utf8');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-rcverdict-'));
  const patched = (tag, from, to) => {
    if (!src.includes(from)) return { hit: false };
    const f = path.join(dir, `reset-credit.${tag}.js`);
    fs.writeFileSync(f, src.replace(from, to));
    return { hit: true, mod: require(f) };
  };
  const controls = [
    ['a dropped wall precondition (proactive spend)', "  if (f.wallHit !== true) return out(false, 'no-wall'); // NEVER proactive\n", '', 'no wall ⇒ never proactive'],
    ['a floor that ignores the credit count', 'if (credits === 1 && windowFraction !== null', 'if (windowFraction !== null', 'openai warm wall, 1 hour of a week left, 3 credits ⇒ still use (a spare credit is not scarce)'],
    ['a knee off by one (strict >)', 'ratio >= 1) return out(true', 'ratio > 1) return out(true', 'anthropic EXACTLY at the knee (R−t = W/b) ⇒ above-knee'],
    ['the knee decided on the ROUNDED value (the pre-r2 code)', 'if (ratio !== null && ratio >= 1) return out(true', 'if (valueFraction !== null && valueFraction >= 1) return out(true', 'anthropic ONE SECOND below the knee ⇒ keep (the knee is exact — the ratio is not rounded first)'],
    ['no ladder fork (cold conversations spend first)', "  if (!warm && position === 'wall' && f.poolAlternative !== false) return out(false, 'cold-switch-first');\n", '', 'COLD with a pool alternative ⇒ switch first'],
    ['unknown count treated as zero', 'if (credits !== null && credits <= 0)', 'if (credits === null || credits <= 0)', 'unknown credit count is NOT zero (the vendor answers harmlessly)'],
  ];
  for (const [what, from, to, row] of controls) {
    const p = patched(what.replace(/\W+/g, '-'), from, to);
    ok(`NEGATIVE CONTROL (${what}): the patch hit the product source`, p.hit);
    if (!p.hit) continue;
    const red = runTable(p.mod).filter((r) => !r.good).map((r) => r.name);
    ok(`NEGATIVE CONTROL (${what}): the table goes red on "${row}"`, red.includes(row), red.join(' | ') || 'all green');
  }
  fs.rmSync(dir, { recursive: true, force: true });
}

console.log('\n§7 WIRING PINS (code only, comments stripped)');
{
  const strip = (f) => fs.readFileSync(path.join(REPO, f), 'utf8').split('\n').map((l) => l.replace(/(^|\s)\/\/.*$/, '')).filter((l) => !/^\s*\*/.test(l)).join('\n');
  const eng = strip('src/server/usage-pool-engine.js');
  ok('the engine requires the PURE verdict', /const resetCredit = require\('\.\.\/reset-credit\.js'\);/.test(eng));
  ok('the rung CALLS resetCreditVerdict with the warmth facts (inTurn + warm) and the pool alternative',
    /const warmth = conversationWarmth\(session, now\);/.test(eng) && /const poolAlternative = poolAlternativeFor\(session, now\);/.test(eng)
    && /resetCredit\.resetCreditVerdict\(\{[\s\S]{0,400}inTurn: warmth\.inTurn, warm: warmth\.warm, poolAlternative, ladderPosition: ladderPosition === 'after-switch' \? 'after-switch' : 'wall',/.test(eng));
  ok('…the vendor comes from the harness quota source, never a harness id', /const vendor = quotaSourceFor\(session\.backend\)\.resetCreditVendor \|\| null;/.test(eng));
  ok('…the mode is read through the SESSION\'s harness and gated on capsOf(…).resetCredit',
    /capsOf\(session\.backend\)\.resetCredit !== true\) return null;[\s\S]{0,200}harnessSetting\(session\.backend, 'limitResetCredit'\)/.test(eng));
  // r2: …and a cold conversation's switch that moved NOTHING asks the rung again
  // at the verdict's `after-switch` position (the 2.355.0 unwired class: the
  // PURE verdict accepted it, no call site passed it)
  const SITE = (args) => new RegExp(`const rcArgs = \\{ resetsAtSec: ${args},[^\\n]*\\n\\s*const rung = resetCreditRung\\(session, rcArgs\\);\\s*\\n\\s*if \\(rung === 'consumed'\\) return;\\s*\\n\\s*const poolBefore = poolDefaultOf\\(session\\);\\s*\\n\\s*maybePoolAutoSwitch\\(session\\);\\s*\\n\\s*if \\(rung === 'switch-first' && poolDefaultOf\\(session\\) === poolBefore && resetCreditRung\\(session, \\{ \\.\\.\\.rcArgs, ladderPosition: 'after-switch' \\}\\) === 'consumed'\\) return;`);
  ok('BOTH exhaustion sites run the rung BEFORE the switch rung, only a consumed credit stops the ladder, and a switch that moved nothing re-asks at after-switch',
    SITE('tripped\\?\\.resetsAt').test(eng) && SITE('resets').test(eng), 'site shape changed');
  ok('…NEGATIVE CONTROL: the pre-r2 site (no after-switch re-ask) does not satisfy the pin', !SITE('resets').test("        if (resetCreditRung(session, { resetsAtSec: resets, lane: x }) === 'consumed') return;\n        maybePoolAutoSwitch(session);\n"));
  ok('the old opt-in closure is gone (one rung, one verdict)', !/tryResetCredit/.test(eng));
  // lane reset-path: the CHARGE moved from the write to the SEND — the authorizer's hold rides the
  // attempt record (openResetCreditTry) and is converted by noteResetCreditSent, given back when it never went out
  ok('AUTO consumes through the spend ceiling, and charges the slot it authorized — when the request WENT OUT',
    /spendGuard\.authorize\(\{ reason: 'codex-reset-credit'[^\n]*identity: key \? \{ key, name: nameOf\(key\) \|\| key \} : null \}\)[\s\S]{0,3000}openResetCreditTry\(\{[^\n]*\bav\b[^\n]*\}\);\s*\n\s*session\.pty\.write\(JSON\.stringify\(\{ type: 'codex-reset-credit', idempotencyKey: idemKey, \.\.\.\(rf \? \{ readFirst: true \} : \{\}\) \}\)/.test(eng)
    && /function noteResetCreditSent\(t, now = Date\.now\(\), \{ proof = 'record' \} = \{\}\) \{[\s\S]{0,1100}spendGuard\.note\(\{ reason: 'codex-reset-credit', session: [^\n]*identity: t\.identity, hold: t\.hold \}\)/.test(eng) // (verify r10: the guessed-send rule sits between the head and the charge)
    && /identity: \(av && av\.identity\) \|\| null/.test(eng) && /spendGuard\.release\(\{ hold: t\.hold \}\)/.test(eng));
  ok('ASK files ONE For-you action item with an i18n structure and a reset-credit action payload',
    /if \(mode === 'ask'\) \{[\s\S]{0,300}if \(session\._resetCreditAsked === eventKey\) return 'skipped';\s*\n\s*session\._resetCreditAsked = eventKey;[\s\S]{0,900}todos\.add\(sessionKey, \{[\s\S]{0,600}kind: 'action'[\s\S]{0,300}i18n: \{ text: \{ key: i18nKey\('Use a stored reset credit on \{account\}\?'\)[\s\S]{0,200}action: \{ type: 'reset-credit', sessionId: session\._webuiId/.test(eng));
  ok('the pool alternative never counts a pay-per-use (usage credits) member', /return !!\(d && d\.to && !d\.toCredits\);/.test(eng));
  ok('the pool DEFAULT keeps the proactive warm hold but computes NO inTurn (the soft hold is dropped, §8 ③)',
    /const w = warmCache\(\{ lastActivityMs: s\._lastPtyDataAt, nowMs: now, model: cacheModelFor\(s\) \}\);\s*\n\s*if \(!w\.warm\) continue;/.test(eng)
    && !/inTurn: conversationInTurn\(\{ isStreaming: s\._isStreaming, turnState: s\._turnState \}\)/.test(eng)
    && !/':default:soft'/.test(eng) && /':default'\); return; \}/.test(eng));
  for (const f of ['src/message-manager.js', 'src/codex-message-manager.js']) {
    const m = strip(f);
    ok(`${f}: injectPeerCard carries a sanitized resetCredit offer (offerOf)`, /injectPeerCard\(\{[^}]*resetCredit = null(?:, kind = null)?(?:, group = null)?(?:, exitRun = null)?(?:, channel = null)?(?:, belongsTo = null)? \}\)/.test(m) && /const rc = offerOf\(resetCredit\);\s*\n\s*if \(rc\) \{ msg\.resetCredit = rc;/.test(m));
  }
  const { createMessageManager } = require(path.join(REPO, 'src/normalizers.js'));
  for (const be of ['claude', 'codex']) {
    const mm = createMessageManager(be, 'rc-' + be);
    const good = mm.injectPeerCard({ fromName: 'VibeSpace', text: 'limit', resetCredit: { available: 2, mode: 'ask', html: '<img>' } });
    const bad = mm.injectPeerCard({ fromName: 'VibeSpace', text: 'limit 2', resetCredit: { available: 0, mode: 'ask' } });
    const none = mm.injectPeerCard({ fromName: 'VibeSpace', text: 'limit 3' });
    ok(`${be} normalizer: a peer card carries the sanitized offer; a bad or absent one carries none`,
      JSON.stringify(good.resetCredit) === '{"available":2,"mode":"ask"}' && bad.resetCredit === undefined && none.resetCredit === undefined, JSON.stringify([good.resetCredit, bad.resetCredit]));
  }
  // the For-you item's ACTION PAYLOAD (user-todos.js normalizeAction): flat facts only
  const { UserTodoManager, normalizeAction } = require(path.join(REPO, 'src/user-todos.js'));
  ok('normalizeAction keeps {type, flat facts}', JSON.stringify(normalizeAction({ type: 'reset-credit', sessionId: 'cx1', creditsLeft: 3, resetsAtSec: null })) === '{"type":"reset-credit","sessionId":"cx1","creditsLeft":3,"resetsAtSec":null}');
  const refuses = (x) => { try { normalizeAction(x); return false; } catch { return true; } };
  ok('…refuses a nested object, a non-kebab type, a non-finite number, an array', refuses({ type: 'reset-credit', nested: { a: 1 } }) && refuses({ type: 'Reset Credit' }) && refuses({ type: 'x', n: Infinity }) && refuses([]));
  {
    const tdir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-rcverdict-todos-'));
    const um = new UserTodoManager({ dataDir: tdir, expirySweepMs: 0 });
    const it = um.add('codex:t1', { origin: 'pool', text: 'Use a stored reset credit on A?', kind: 'action', action: { type: 'reset-credit', sessionId: 'cx1' } });
    const again = um.add('codex:t1', { origin: 'pool', text: 'Use a stored reset credit on A?', kind: 'action', action: { type: 'reset-credit', sessionId: 'cx1' } });
    ok('a filed item keeps its action; the same text re-filed is the SAME item (one per limit event)', it.action?.type === 'reset-credit' && again.id === it.id && again.existing === true && um.snapshot().open.length === 1);
    um.stop(); um.flush(); fs.rmSync(tdir, { recursive: true, force: true });
  }
  const ar = strip('src/server/auto-resume.js');
  ok('auto-resume: the ARM card asks resetCreditOffer and hands the offer to notify', /offer = resetCreditOffer \? resetCreditOffer\(id, s2\) : null;[\s\S]{0,200}notify\(id, s2, armNoticeFor\(reason, resets, Date\.now\(\), a\.cause\), offer \? \{ resetCredit: offer \} : undefined\)/.test(ar));
  const srv = strip('server.js');
  ok('server.js: notify passes extra.resetCredit to the peer card, and resetCreditOffer is the engine\'s',
    /notify: \(id, s, text, extra\) => \{ try \{ feedPeerCard\(s, \{ fromName: 'VibeSpace', (?:kind: 'notification', )?text, \.\.\.\(extra && extra\.resetCredit \? \{ resetCredit: extra\.resetCredit \} : \{\}\) \}\); \} catch \{ \} \}, resetCreditOffer: \(id, s\) => \{ try \{ return resetCreditOffer\(s\); \}/.test(srv)
    && /usageCacheKeyFor, resetCreditOffer,/.test(srv));
  const cq = require(path.join(REPO, 'src/harnesses/codex-quota.js'));
  const clq = require(path.join(REPO, 'src/harnesses/claude-quota.js'));
  ok('the harness quota sources declare the credit semantics (codex re-opens = openai; claude refills = anthropic)', cq.resetCreditVendor === 'openai' && clq.resetCreditVendor === 'anthropic' && RC.VENDORS.includes(cq.resetCreditVendor));
  const { capsOf } = require(path.join(REPO, 'src/backend-caps.js'));
  ok('…while only codex has the capability to spend one (claude: interactive /limit-reset only)', capsOf('codex').resetCredit === true && capsOf('claude').resetCredit === false);
}

console.log('\n§8 WHEN AN ATTEMPT ARMS THE TEN-MINUTE FLOOR (lane reset-path, the owner\'s report 2026-10-01)');
// The owner's dialog said "already tried in the last 10 minutes — try again after 10:40" after an attempt
// codex had REFUSED (a wrapper older than the idempotency key). The floor exists so a second press cannot
// mint a second key while the first consume might still land: it arms ONLY on a consume that WENT OUT and
// then re-opened the window or got no answer.
const ATTEMPT_TABLE = (M) => {
  const NOWMS = 1_800_000_000_000, FLOOR = M.RESET_CREDIT_FLOOR_MS, ACK = M.RESET_CREDIT_ACK_MS;
  const A = (p) => M.creditAnswerOf(p);
  const B = (t, now = NOWMS) => M.attemptBlock(t, { now });
  const rows = [];
  const row = (name, good) => rows.push({ name, good: !!good });
  // the answer's shapes
  row('answer: `reset` went out and arms', (() => { const a = A({ outcome: 'reset', idempotencyKey: 'k', attempts: 1 }); return a.outcome === 'reset' && a.sent && M.outcomeArmsFloor(a.outcome); })());
  row('answer: a KEYED alreadyRedeemed is this press\'s own reset (arms)', A({ outcome: 'alreadyRedeemed', idempotencyKey: 'k', attempts: 2 }).outcome === 'reset');
  row('answer: a keyless alreadyRedeemed is somebody else\'s (no floor)', (() => { const a = A({ outcome: 'alreadyRedeemed' }); return a.outcome === 'alreadyRedeemed' && !M.outcomeArmsFloor(a.outcome); })());
  row('answer: nothingToReset went out, spent nothing — no floor', (() => { const a = A({ outcome: 'nothingToReset', idempotencyKey: 'k', attempts: 1 }); return a.sent && !M.outcomeArmsFloor(a.outcome); })());
  row('answer: noCredit — no floor', !M.outcomeArmsFloor(A({ outcome: 'noCredit', idempotencyKey: 'k', attempts: 1 }).outcome));
  row('answer: a wrapper older than the key, refused locally — never sent, no floor', (() => { const a = A({ error: 'Invalid request: missing field `idempotencyKey`' }); return a.outcome === 'refused-stale' && a.sent === false && !M.outcomeArmsFloor(a.outcome); })());
  row('answer: the same words from a KEYED wrapper are an answered error, not the stale refusal', A({ error: 'Invalid request: missing field `idempotencyKey`', idempotencyKey: 'k', attempts: 1 }).outcome === 'error');
  row('answer: a consume that timed out (sent, unanswered) arms — it may still land', (() => { const a = A({ error: 'account/rateLimitResetCredit/consume timed out after 30000ms', idempotencyKey: 'k', attempts: 2 }); return a.outcome === 'unanswered' && a.sent && M.outcomeArmsFloor(a.outcome); })());
  row('answer: an answered error after a retry is still unanswered (the first may have landed)', A({ error: 'upstream 502', idempotencyKey: 'k', attempts: 2 }).outcome === 'unanswered');
  row('answer: an answered error on the first try — nothing spent, no floor', (() => { const a = A({ error: 'codex account authentication required', idempotencyKey: 'k', attempts: 1 }); return a.outcome === 'error' && a.sent && !M.outcomeArmsFloor(a.outcome); })());
  row('answer: the helper\'s wall BEFORE the consume (sent:false) — not-sent', A({ error: 'the codex helper did not finish within 30000ms (stage initialize) timed out after', idempotencyKey: 'k', attempts: 0, sent: false }).outcome === 'not-sent');
  row('answer: the helper never started (keyed, zero attempts) — not sent', A({ error: 'could not start codex app-server: ENOENT', idempotencyKey: 'k', attempts: 0, sent: false }).sent === false);
  // verify r2: the app-server EXITED after taking the consume — sent, never answered, whatever the words say
  row('answer (r2): the helper\'s app-server exited after the consume went out (sent:true, answered:false) — UNANSWERED, arms (it may have landed)', (() => { const a = A({ error: 'codex app-server exited (0) during consume', idempotencyKey: 'k', attempts: 1, sent: true, answered: false }); return a.outcome === 'unanswered' && a.sent && M.outcomeArmsFloor(a.outcome); })());
  row('answer (r2): …an answered error (answered:true) with the same words stays an error (nothing spent)', A({ error: 'codex app-server exited (0) during consume', idempotencyKey: 'k', attempts: 1, sent: true, answered: true }).outcome === 'error');
  // verify r3 (money): the vendor's enum is a CLOSED world — a word outside it, or no word, is a consume we cannot read
  row('answer (r3): a word outside the measured enum (cooldownActive) ⇒ unknown-outcome: went out, answered, ARMS, unsettled — never "nothing spent"', (() => { const a = A({ outcome: 'cooldownActive', idempotencyKey: 'k', attempts: 1 }); return a.outcome === 'unknown-outcome' && a.sent && a.answered && a.word === 'cooldownActive' && M.outcomeArmsFloor(a.outcome) && M.UNSETTLED_OUTCOMES.includes(a.outcome) && Array.isArray(M.VENDOR_OUTCOMES) && M.VENDOR_OUTCOMES.length === 4; })());
  row('answer (r3): an answer with NO word and no error (a result shape never measured) ⇒ unknown-outcome too; with sent:false it stays not sent', A({ result: { status: 'queued' }, outcome: null, idempotencyKey: 'k', attempts: 1 }).outcome === 'unknown-outcome' && A({ result: {}, outcome: null, idempotencyKey: 'k', attempts: 0, sent: false }).outcome !== 'unknown-outcome');
  row('answer (r3): every measured word still reads as itself (reset / nothingToReset / noCredit / keyless alreadyRedeemed)', ['reset', 'nothingToReset', 'noCredit'].every((w) => A({ outcome: w, idempotencyKey: 'k', attempts: 1 }).outcome === w) && A({ outcome: 'alreadyRedeemed' }).outcome === 'alreadyRedeemed');
  row('block (r3): an unknown-outcome attempt holds the floor from the send, then is unsettled until a reading', B({ at: NOWMS - 70e3, sentAt: NOWMS - 60e3, outcome: 'unknown-outcome' }).code === 'cooldown' && B({ at: NOWMS - 11 * 60e3, sentAt: NOWMS - 11 * 60e3, outcome: 'unknown-outcome', outcomeAt: NOWMS - 60e3, resetsAtSec: Math.floor(NOWMS / 1000) + 3600, creditsAt: 3 }).code === 'unsettled');
  // the block an attempt leaves
  row('block: written 10 s ago, not yet sent — in_flight (not the floor)', (() => { const b = B({ at: NOWMS - 10e3, sentAt: 0, outcome: null }); return b.code === 'in_flight' && b.until === NOWMS - 10e3 + ACK && b.armedAt === 0; })());
  row('block: written and never sent, the ack window passed — nothing', B({ at: NOWMS - ACK - 1, sentAt: 0, outcome: null }).code === null);
  row('block: sent a minute ago, no answer yet — the floor, from the SEND', (() => { const b = B({ at: NOWMS - 70e3, sentAt: NOWMS - 60e3, outcome: null }); return b.code === 'cooldown' && b.until === NOWMS - 60e3 + FLOOR; })());
  row('block: reset — the floor', B({ at: NOWMS - 70e3, sentAt: NOWMS - 60e3, outcome: 'reset' }).code === 'cooldown');
  row('block: reset from a wrapper that never said "sent" — the floor from the write', B({ at: NOWMS - 60e3, sentAt: 0, outcome: 'reset' }).until === NOWMS - 60e3 + FLOOR);
  row('block: sent then unanswered — the floor', B({ at: NOWMS - 70e3, sentAt: NOWMS - 60e3, outcome: 'unanswered' }).code === 'cooldown');
  row('block: sent then nothingToReset — nothing (THE OWNER\'S REPORT, vendor shape)', B({ at: NOWMS - 70e3, sentAt: NOWMS - 60e3, outcome: 'nothingToReset' }).code === null);
  row('block: refused by codex before the send — nothing (THE OWNER\'S REPORT)', B({ at: NOWMS - 60e3, sentAt: 0, outcome: 'refused-stale' }).code === null);
  row('block: never sent (the ack window settled it) — nothing', B({ at: NOWMS - ACK - 5e3, sentAt: 0, outcome: 'not-sent' }).code === null);
  row('block: an answered error — nothing', B({ at: NOWMS - 70e3, sentAt: NOWMS - 60e3, outcome: 'error' }).code === null);
  row('block: a reset eleven minutes ago — nothing (the floor lifted)', B({ at: NOWMS - 11 * 60e3, sentAt: NOWMS - 11 * 60e3, outcome: 'reset' }).code === null);
  // the AUTO rung: one try per limit event
  const R = Math.floor(NOWMS / 1000) + 3600;
  row('rung: the same event after a nothingToReset is not retried before the event\'s reset', M.rungBlockUntil({ at: NOWMS - 70e3, sentAt: NOWMS - 60e3, outcome: 'nothingToReset', outcomeAt: NOWMS - 50e3, eventKey: 'A|' + R }, { now: NOWMS, eventKey: 'A|' + R, resetsAtSec: R }) === R * 1000);
  row('rung: a refused attempt on an event with no stated reset blocks that event for the floor', M.rungBlockUntil({ at: NOWMS - 60e3, sentAt: 0, outcome: 'refused-stale', outcomeAt: NOWMS - 50e3, eventKey: 'A|?' }, { now: NOWMS, eventKey: 'A|?', resetsAtSec: null }) === NOWMS - 50e3 + FLOOR);
  row('rung: a NEW event after a nothingToReset is free', M.rungBlockUntil({ at: NOWMS - 70e3, sentAt: NOWMS - 60e3, outcome: 'nothingToReset', outcomeAt: NOWMS - 50e3, eventKey: 'A|' + R }, { now: NOWMS, eventKey: 'A|' + (R + 99), resetsAtSec: R + 99 }) === 0);
  row('rung: an open attempt (written, not sent) blocks every event until it is sent or the ack window passes', M.rungBlockUntil({ at: NOWMS - 10e3, sentAt: 0, outcome: null, eventKey: 'A|' + R }, { now: NOWMS, eventKey: 'A|other', resetsAtSec: R }) === NOWMS - 10e3 + ACK);
  // verify r1 — THE UNKNOWN CONSUME: an unanswered consume is never freed by the clock alone
  const U = { at: NOWMS - 11 * 60e3, sentAt: NOWMS - 11 * 60e3, outcome: 'unanswered', outcomeAt: NOWMS - 60e3, resetsAtSec: R, creditsAt: 3 };
  row('unsettled: past the floor an unanswered consume still blocks (code unsettled) until a reading settles it', (() => { const b = B(U); return b.code === 'unsettled' && b.until === 0 && b.sinceMs === U.sentAt && typeof M.isUnsettled === 'function' && M.isUnsettled(U); })());
  row('unsettled: the same for the floor timer\'s no-answer and the silent carrier\'s unknown; a settled one is free', B({ ...U, outcome: 'no-answer' }).code === 'unsettled' && B({ ...U, outcome: 'unknown' }).code === 'unsettled' && B({ ...U, settled: { how: 'not-landed' } }).code === null && B({ ...U, outcome: 'nothingToReset' }).code === null);
  row('unsettled: inside the floor it is still the cooldown', B({ ...U, sentAt: NOWMS - 60e3, at: NOWMS - 60e3 }).code === 'cooldown');
  row('rung: an unsettled attempt holds the rung one floor at a time (every turn\'s reading can settle it)', M.rungBlockUntil(U, { now: NOWMS, eventKey: 'A|other', resetsAtSec: R }) === NOWMS + FLOOR);
  row('settle: the stored count fell ⇒ landed', (M.settleByReading(U, { fetchedAt: NOWMS, creditsLeft: 2 }) || {}).how === 'landed');
  row('settle: the stored count unchanged ⇒ not landed (the vendor would have taken one)', (M.settleByReading(U, { fetchedAt: NOWMS, creditsLeft: 3 }) || {}).how === 'not-landed');
  row('settle: no count — the window moved before its own reset ⇒ landed; the same window ⇒ not landed', (M.settleByReading({ ...U, creditsAt: null }, { fetchedAt: NOWMS, resetsAtSec: R + 500 }) || {}).how === 'landed' && (M.settleByReading({ ...U, creditsAt: null }, { fetchedAt: NOWMS, resetsAtSec: R }) || {}).how === 'not-landed');
  row('settle: a reading past the wall\'s own reset (+ the minute of grace, r2) ⇒ expired (nothing left to protect)', (M.settleByReading({ ...U, creditsAt: null }, { fetchedAt: (R + 60) * 1000 + 1, resetsAtSec: R + 604800 }) || {}).how === 'expired');
  row('settle: a reading OLDER than the send, or carrying neither witness, settles nothing', M.settleByReading(U, { fetchedAt: U.sentAt - 1, creditsLeft: 2 }) === null && M.settleByReading({ ...U, creditsAt: null }, { fetchedAt: NOWMS }) === null && M.settleByReading({ ...U, outcome: 'reset' }, { fetchedAt: NOWMS, creditsLeft: 2 }) === null);
  row('words: the dialog\'s unsettled fact names the send; the refusal (a read that could not tell) names it too, by its own code', (() => { const l = M.unsettledLine({ via: 'session', unsettled: { sinceSec: 5 } }, { fmtTime: (x) => 'T' + x }); const r = M.refusalLine('unsettled', { until: 'T5' }); return l && /got no answer — it may have been spent\. Use reads the account first/.test(l.key) && l.params.time === 'T5' && M.REFUSAL_CODES.includes('unsettled') && /could not be read to learn whether it landed — nothing was spent/.test(r.key) && r.params.until === 'T5' && M.unsettledLine({ code: 'cooldown', unsettled: { sinceSec: 5 } }) === null; })());
  row('words: the dialog carries the unsettled line (model), canConfirm stays true', (() => { const m = M.dialogModel({ key: 'k', name: 'A', vendor: 'openai', creditsLeft: 2, resetsAtSec: 1000 + 7200, periodSec: 604800, remainingPct: 0, sessionId: 'cx1', unsettled: { sinceSec: 900 } }, { nowSec: 1000, fmtTime: (x) => 'T' + x }); return m.canConfirm === true && m.lines.some((l) => /Use reads the account first/.test(l.key)); })());
  // verify r2 — THE WITNESS-LESS ATTEMPT, THE CLOCK, THE LAPSE
  const G = typeof M.RESET_GRACE_SEC === 'number' ? M.RESET_GRACE_SEC : 60;
  row('settle (r2): no count known at the send, the reading carries one ⇒ UNTOLD (the block ends, the count named) — never not-landed, never landed', (() => { const s = M.settleByReading({ ...U, creditsAt: null, resetsAtSec: 0 }, { fetchedAt: NOWMS, creditsLeft: 1 }); return s && s.how === 'untold' && /now holds 1/.test(s.why); })());
  row('settle (r2): no count at the send and NO count in the reading ⇒ nothing (a witness-less reading settles nothing)', M.settleByReading({ ...U, creditsAt: null, resetsAtSec: 0 }, { fetchedAt: NOWMS }) === null);
  row('settle (r2): the window ROLLED by the clock (R1 = R0 + period, within the grace) ⇒ expired, not landed; moved elsewhere ⇒ landed', (() => { const a = M.settleByReading({ ...U, creditsAt: null }, { fetchedAt: NOWMS, resetsAtSec: R + 604800, periodSec: 604800 }); const b = M.settleByReading({ ...U, creditsAt: null }, { fetchedAt: NOWMS, resetsAtSec: R + 604800 + G, periodSec: 604800 }); const c = M.settleByReading({ ...U, creditsAt: null }, { fetchedAt: NOWMS, resetsAtSec: R + 302400, periodSec: 604800 }); return a && a.how === 'expired' && b && b.how === 'expired' && c && c.how === 'landed'; })());
  row('settle (r2): a reading inside the grace after the stated reset with the window unchanged is NOT yet expired (the vendor lands late); past the grace it is', (() => { const a = M.settleByReading({ ...U, creditsAt: null }, { fetchedAt: R * 1000 + 30e3, resetsAtSec: R }); const b = M.settleByReading({ ...U, creditsAt: null }, { fetchedAt: (R + G) * 1000, resetsAtSec: R }); return a && a.how === 'not-landed' && b && b.how === 'expired'; })());
  row('settle (r2): no window at the send — the reading\'s every window began AFTER the send ⇒ expired; one that began before ⇒ untold (count carried)', (() => { const a = M.settleByReading({ ...U, creditsAt: null, resetsAtSec: 0 }, { fetchedAt: NOWMS, creditsLeft: 1, windowStartSec: Math.floor(U.sentAt / 1000) + 60 }); const b = M.settleByReading({ ...U, creditsAt: null, resetsAtSec: 0 }, { fetchedAt: NOWMS, creditsLeft: 1, windowStartSec: Math.floor(U.sentAt / 1000) - 60 }); return a && a.how === 'expired' && b && b.how === 'untold'; })());
  row('settle (r2 + r5): a FALLEN count still wins over every window rule (landed, whatever the window says)', (M.settleByReading(U, { fetchedAt: NOWMS, creditsLeft: 2, resetsAtSec: R }) || {}).how === 'landed' && (M.settleByReading(U, { fetchedAt: NOWMS, creditsLeft: 2, resetsAtSec: R + 302400, periodSec: 604800 }) || {}).how === 'landed');
  // verify r5 (reproduced on the real engine, money): a credit GRANTED after the send masks a landing from the count
  row('settle (r5): an UNCHANGED count with the window MOVED (not a roll) ⇒ UNTOLD — a landing + a grant, or another request; never not-landed (press 2 consumed again over a landed press 1)', (() => { const s = M.settleByReading(U, { fetchedAt: NOWMS, creditsLeft: 3, resetsAtSec: R + 302400, periodSec: 604800 }); return s && s.how === 'untold' && /still 3 but the window moved/.test(s.why); })());
  row('settle (r5): an unchanged count with the window UNCHANGED, or with no window witness, still proves NOT LANDED', (M.settleByReading(U, { fetchedAt: NOWMS, creditsLeft: 3, resetsAtSec: R }) || {}).how === 'not-landed' && (M.settleByReading(U, { fetchedAt: NOWMS, creditsLeft: 3 }) || {}).how === 'not-landed' && (M.settleByReading(U, { fetchedAt: NOWMS, creditsLeft: 3, resetsAtSec: R - 600 }) || {}).how === 'not-landed');
  row('settle (r5): an unchanged count with the window ROLLED by the clock ⇒ expired (the wall is gone, nothing landed)', (M.settleByReading(U, { fetchedAt: NOWMS, creditsLeft: 3, resetsAtSec: R + 604800, periodSec: 604800 }) || {}).how === 'expired');
  row('settle (r5): a count that ROSE is a grant for certain — the window alone judges: unchanged ⇒ not landed; moved ⇒ untold; none ⇒ untold', (() => { const a = M.settleByReading(U, { fetchedAt: NOWMS, creditsLeft: 4, resetsAtSec: R }); const b = M.settleByReading(U, { fetchedAt: NOWMS, creditsLeft: 4, resetsAtSec: R + 302400, periodSec: 604800 }); const c = M.settleByReading(U, { fetchedAt: NOWMS, creditsLeft: 4 }); return a && a.how === 'not-landed' && /rose 3 → 4/.test(a.why) && b && b.how === 'untold' && c && c.how === 'untold' && /rose 3 → 4/.test(c.why); })());
  row('settle (r5): the r4 supersession rule holds under the new order (count fell after a later send ⇒ untold; unchanged + window in place ⇒ not landed)', (M.settleByReading({ ...U, supersededAt: NOWMS - 10e3 }, { fetchedAt: NOWMS, creditsLeft: 2, resetsAtSec: R }) || {}).how === 'untold' && (M.settleByReading({ ...U, supersededAt: NOWMS - 10e3 }, { fetchedAt: NOWMS, creditsLeft: 3, resetsAtSec: R }) || {}).how === 'not-landed');
  row('settle (r2): a window restated EARLIER than the reset it had is never a credit\'s new window (a credit\'s ends a whole period after the consume) — nothing without another witness; untold with a count', M.settleByReading({ ...U, creditsAt: null }, { fetchedAt: NOWMS, resetsAtSec: R - 600 }) === null && (M.settleByReading({ ...U, creditsAt: null }, { fetchedAt: NOWMS, resetsAtSec: R - 600, creditsLeft: 1 }) || {}).how === 'untold');
  row('lapse (r2): an unsettled attempt whose stated reset + grace has passed blocks nothing — LAPSED, said (code null, lapsed.sinceMs = the send)', (() => { const b = B({ ...U, resetsAtSec: Math.floor(NOWMS / 1000) - G - 1 }); return b.code === null && b.lapsed && b.lapsed.sinceMs === U.sentAt && b.lapsed.atMs === (Math.floor(NOWMS / 1000) - 1) * 1000; })());
  row('lapse (r2): one second before the stated reset + grace it is still unsettled (and names when it lapses)', (() => { const b = B({ ...U, resetsAtSec: Math.floor(NOWMS / 1000) - G + 1 }); return b.code === 'unsettled' && b.lapseAtMs === (Math.floor(NOWMS / 1000) + 1) * 1000; })());
  row('lapse (r2): with no stated reset, a whole longest window (7 d) after the send', (() => { const t = { ...U, resetsAtSec: 0, sentAt: NOWMS - M.RESET_CREDIT_LAPSE_MS, at: NOWMS - M.RESET_CREDIT_LAPSE_MS }; const t2 = { ...t, sentAt: t.sentAt + 1, at: t.at + 1 }; return B(t).code === null && !!B(t).lapsed && B(t2).code === 'unsettled' && M.isLapsed(t, NOWMS) && !M.isLapsed(t2, NOWMS); })());
  row('lapse (r2): the rung is free too (a lapsed attempt holds no floor)', M.rungBlockUntil({ ...U, resetsAtSec: Math.floor(NOWMS / 1000) - G - 1 }, { now: NOWMS, eventKey: 'A|other', resetsAtSec: R }) === 0);
  row('lapse (r2): a settled attempt never "lapses" (isLapsed is for unsettled ones)', !M.isLapsed({ ...U, settled: { how: 'not-landed' }, resetsAtSec: 1 }, NOWMS));
  row('words (r2): the dialog carries the lapsed line (the count may be one high), canConfirm true; never beside a refusal', (() => { const m = M.dialogModel({ key: 'k', name: 'A', vendor: 'openai', creditsLeft: 2, resetsAtSec: 1000 + 7200, periodSec: 604800, remainingPct: 0, sessionId: 'cx1', lapsed: { sinceSec: 900 } }, { nowSec: 1000, fmtTime: (x) => 'T' + x }); const l = m.lines.find((x) => /count shown may be one high/.test(x.key)); return m.canConfirm === true && l && l.params.time === 'T900' && M.lapsedLine({ code: 'cooldown', lapsed: { sinceSec: 9 } }) === null; })());
  // verify r3 — THE CLOCK, NOT THE TIMER: between the floor (or the ack window) elapsing and the timer's callback a sent
  // attempt read as free (reproduced on the real engine with a busy loop) and a press minted a second key
  row('clock (r3): a SENT attempt past the floor with NO outcome yet (its timer has not run) is unsettled by the clock — never free', (() => { const t = { at: NOWMS - 11 * 60e3, sentAt: NOWMS - 11 * 60e3, outcome: null }; const b = B(t); return b.code === 'unsettled' && b.sinceMs === t.sentAt && M.isUnsettled(t, { now: NOWMS }) === true && M.isUnsettled(t, { now: t.sentAt + FLOOR - 1 }) === false; })());
  row('clock (r3): …inside the floor it is the cooldown, from the send', B({ at: NOWMS - 60e3, sentAt: NOWMS - 60e3, outcome: null }).code === 'cooldown');
  row('clock (r3): an OPEN attempt on a carrier that CANNOT report, past the ack window ⇒ the cooldown from the WRITE (the unknown its timer will stamp), a floor later unsettled; a reporting carrier\'s stays free (not sent)', (() => { const o = { at: NOWMS - ACK - 1e3, sentAt: 0, outcome: null, reportsSent: false }; const b = B(o); return b.code === 'cooldown' && b.until === o.at + FLOOR && B({ ...o, at: NOWMS - 11 * 60e3 }).code === 'unsettled' && B({ ...o, reportsSent: true }).code === null && B({ ...o, at: NOWMS - 10e3 }).code === 'in_flight'; })());
  row('clock (r3): a reading settles a clock-unsettled attempt (no outcome on the record yet) like any other', (M.settleByReading({ at: NOWMS - 11 * 60e3, sentAt: NOWMS - 11 * 60e3, outcome: null, creditsAt: 3 }, { fetchedAt: NOWMS, creditsLeft: 2 }, { now: NOWMS }) || {}).how === 'landed' && M.settleByReading({ at: NOWMS - 60e3, sentAt: NOWMS - 60e3, outcome: null, creditsAt: 3 }, { fetchedAt: NOWMS, creditsLeft: 2 }, { now: NOWMS }) === null);
  row('clock (r3): armedByClock = the send; the write for a non-reporting carrier past the ack window; 0 for an open reporting one and for an outcome that arms nothing', typeof M.armedByClock === 'function' && M.armedByClock({ at: 1, sentAt: 5, outcome: null }, { now: NOWMS }) === 5 && M.armedByClock({ at: NOWMS - ACK - 1, sentAt: 0, outcome: null, reportsSent: false }, { now: NOWMS }) === NOWMS - ACK - 1 && M.armedByClock({ at: NOWMS - ACK - 1, sentAt: 0, outcome: null }, { now: NOWMS }) === 0 && M.armedByClock({ at: 1, sentAt: 5, outcome: 'nothingToReset' }, { now: NOWMS }) === 0 && M.armedByClock({ at: 1, sentAt: 5, outcome: 'reset' }, { now: NOWMS }) === 5);
  // verify r3 — SUPERSEDED: a prior was judged by the reading taken after its SUCCESSOR's consume (the drop was the
  // new one's) and the person was told the OLD request "did land"; a chain of lapsed priors grew without bound
  row('superseded (r3 + r4): a reading at or after the newer attempt\'s send never CREDITS a landing to a prior (count fell 3 → 2 — the newer consume\'s: untold, which one cannot be said); the same count still proves NOT LANDED (a restart mid-press left one superseded while unsettled — nothing else could ever settle it); one before the send still lands it', (M.settleByReading({ ...U, supersededAt: NOWMS - 10e3 }, { fetchedAt: NOWMS, creditsLeft: 2 }) || {}).how === 'untold' && (M.settleByReading({ ...U, supersededAt: NOWMS - 10e3 }, { fetchedAt: NOWMS, creditsLeft: 3 }) || {}).how === 'not-landed' && (M.settleByReading({ ...U, supersededAt: NOWMS - 10e3, creditsAt: null }, { fetchedAt: NOWMS, resetsAtSec: U.resetsAtSec, periodSec: 604800 }) || {}).how === 'not-landed' && (M.settleByReading({ ...U, supersededAt: NOWMS + 10e3 }, { fetchedAt: NOWMS, creditsLeft: 2 }) || {}).how === 'landed' && (M.settleByReading({ ...U, supersededAt: NOWMS }, { fetchedAt: NOWMS - 1, creditsLeft: 2 }) || {}).how === 'landed');
  row('superseded (r3): supersede(prior, at) stamps every prior with the send and DROPS a lapsed one (nothing can settle it now); a settled or a not-yet-lapsed prior keeps its place and order', (() => { const lapsed = { ...U, idempotencyKey: 'L', resetsAtSec: Math.floor(NOWMS / 1000) - G - 1, prior: null }; const settled = { ...U, idempotencyKey: 'S', settled: { how: 'not-landed' }, prior: lapsed }; const live = { ...U, idempotencyKey: 'V', prior: settled }; const h = M.supersede(live, NOWMS); return typeof M.supersede === 'function' && h === live && h.supersededAt === NOWMS && h.prior === settled && settled.supersededAt === NOWMS && settled.prior === null && lapsed.supersededAt === NOWMS && M.supersede(null, NOWMS) === null && M.supersede(lapsed, NOWMS) === null; })());
  row('superseded (r3): …a prior stamped earlier keeps its first send (the oldest supersession is the fact)', (() => { const x = { ...U, supersededAt: NOWMS - 5e3, prior: null }; M.supersede(x, NOWMS); return x.supersededAt === NOWMS - 5e3; })());
  // verify r3 — THE CHAIN: a free newest record (a helper that never started, an answered refusal) in front of an
  // unsettled attempt hid it from the block; the next press consumed with no read first
  const FREE = { at: NOWMS - 60e3, sentAt: 0, outcome: 'error', outcomeAt: NOWMS - 50e3, prior: U };
  row('chain (r3): a FREE newest record with an UNSETTLED prior behind it ⇒ the block is unsettled, naming the prior\'s send', (() => { const b = B(FREE); return b.code === 'unsettled' && b.sinceMs === U.sentAt; })());
  row('chain (r3): …a LAPSED prior behind it ⇒ free, and the lapsed fact names the prior', (() => { const b = B({ ...FREE, prior: { ...U, resetsAtSec: Math.floor(NOWMS / 1000) - G - 1 } }); return b.code === null && b.lapsed && b.lapsed.sinceMs === U.sentAt; })());
  row('chain (r3): …two deep (free → free → unsettled) the same; a chain with nothing unsettled answers free', B({ ...FREE, prior: { ...FREE, prior: U } }).code === 'unsettled' && B({ ...FREE, prior: { ...U, settled: { how: 'not-landed' } } }).code === null);
  row('chain (r3): unsettledInChain = the newest unsettled attempt wherever it sits (the record itself first); none ⇒ null', typeof M.unsettledInChain === 'function' && M.unsettledInChain(FREE) === U && M.unsettledInChain(U) === U && M.unsettledInChain({ ...FREE, prior: { ...U, settled: { how: 'expired' } } }) === null && M.unsettledInChain(null) === null);
  return rows;
};
{
  const rows = ATTEMPT_TABLE(RC);
  for (const r of rows) ok(r.name, r.good);
  ok('the ack window fits inside a spend hold (3 min) and outlasts the 2.369.199 wrapper\'s worst answer (30 + 30 + 20 s)', RC.RESET_CREDIT_ACK_MS >= 80e3 && RC.RESET_CREDIT_ACK_MS < 3 * 60e3 && RC.RESET_CREDIT_FLOOR_MS === 10 * 60e3);
  ok('the refusal set names `in_flight` with its own words', RC.REFUSAL_CODES.includes('in_flight') && RC.refusalLine('in_flight').key !== RC.refusalLine('zzz').key);
  // NEGATIVE CONTROLS: the pre-fix rule (armed at the WRITE, whatever happened), a classifier that reads the
  // stale refusal as an answered error, a rung without the one-try-per-event bound
  const src = fs.readFileSync(MOD, 'utf8');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-rcverdict-'));
  const patched = (tag, from, to) => { if (!src.includes(from)) return null; const f = path.join(dir, `reset-credit.${tag}.js`); fs.writeFileSync(f, src.replace(from, to)); return require(f); };
  const ctl = [
    ['the floor armed at the WRITE (the pre-fix engine)', '  const armedAt = armedByClock(t, { now, ackMs }); // r3: the clock, not the timer\'s stamp\n  if (!t.outcome && !sentAt && now - at < ackMs) return { code: \'in_flight\', until: at + ackMs, armedAt: 0 };', '  const armedAt = at;', 'block: refused by codex before the send — nothing (THE OWNER\'S REPORT)'],
    ['the stale refusal read as an answered error', "  if (!keyed && /idempotencyKey/.test(err)) return { outcome: 'refused-stale', sent: false, answered: true, keyed };\n", '', 'answer: a wrapper older than the key, refused locally — never sent, no floor'],
    ['an unanswered consume that arms nothing', "const FLOOR_OUTCOMES = Object.freeze(['reset', 'unanswered', 'no-answer', 'unknown', 'unknown-outcome']);", "const FLOOR_OUTCOMES = Object.freeze(['reset']);", 'block: sent then unanswered — the floor'],
    // verify r1: the clock alone frees an unanswered consume (the pre-verify rule)
    ['an unanswered consume freed by the clock alone', "  if (live) return { code: 'unsettled', until: 0, armedAt, sinceMs: num(live.sentAt) || num(live.at) || 0, lapseAtMs: lapseAtOf(live) };\n", "  if (live) return { code: null, until: 0, armedAt };\n", 'unsettled: past the floor an unanswered consume still blocks (code unsettled) until a reading settles it'],
    // verify r2: an unsettled attempt that never lapses (a dead account = a press refused for ever); a witness-less attempt judged by a count it never had
    ['an unsettled attempt that never lapses', "  if (lapsedOne) return { code: null, until: 0, armedAt, lapsed: { sinceMs: num(lapsedOne.sentAt) || num(lapsedOne.at) || 0, atMs: lapseAtOf(lapsedOne) } };\n", "  if (lapsedOne) return { code: 'unsettled', until: 0, armedAt, sinceMs: 0, lapseAtMs: 0 };\n", 'lapse (r2): an unsettled attempt whose stated reset + grace has passed blocks nothing — LAPSED, said (code null, lapsed.sinceMs = the send)'],
    ['a count the attempt never had read as 0 (the pre-r2 engine shape)', '  const c0 = num(t.creditsAt), c1 = num(r.creditsLeft);\n', '  const c0 = num(t.creditsAt) ?? 0, c1 = num(r.creditsLeft);\n', 'settle (r2): no count known at the send, the reading carries one ⇒ UNTOLD (the block ends, the count named) — never not-landed, never landed'],
    ['an exited app-server read as an answered error', "  if (pv.answered === false && sentFlag === true) return { outcome: 'unanswered', sent: true, answered: false, keyed };\n", '', 'answer (r2): the helper\'s app-server exited after the consume went out (sent:true, answered:false) — UNANSWERED, arms (it may have landed)'],
    ['a window that rolled by the clock read as a credit\'s new window', "(P && Math.abs(R1 - (R0 + P)) <= RESET_GRACE_SEC) ? 'rolled' : ", "false ? 'rolled' : ",'settle (r2): the window ROLLED by the clock (R1 = R0 + period, within the grace) ⇒ expired, not landed; moved elsewhere ⇒ landed'],
    ['a settle that ignores the credit count', "  if (c0 !== null && c1 !== null) {\n    if (c1 < c0) return superseded", "  if (false) {\n    if (c1 < c0) return superseded", 'settle: the stored count fell ⇒ landed'],
    // verify r5 (reproduced on the real engine, money): the count-first order (an unchanged count outranked a moved window), a risen count read as not landed
    ['the r4 count-first order back (an UNCHANGED count outranks a MOVED window — a grant hid press 1\'s landing and press 2 consumed again)', "    if (win === 'moved') return { how: 'untold', why: `the stored credit count is still ${c1} but the window moved (${R0} → ${R1}) — a credit may have been granted since the send, or another request moved the window; which cannot be said` };\n", '', 'settle (r5): an UNCHANGED count with the window MOVED (not a roll) ⇒ UNTOLD — a landing + a grant, or another request; never not-landed (press 2 consumed again over a landed press 1)'],
    ['a RISEN count read as not landed (a grant never considered)', "    if (c1 > c0) return win === 'same' ? { how: 'not-landed', why: `the window is unchanged (the stored credit count rose ${c0} → ${c1}: a credit was granted since the send)` } : { how: 'untold', why: `the stored credit count rose ${c0} → ${c1} — a credit was granted since the send, so the count cannot say whether the request landed` };\n", '', 'settle (r5): a count that ROSE is a grant for certain — the window alone judges: unchanged ⇒ not landed; moved ⇒ untold; none ⇒ untold'],
    ['no one-try-per-event bound on the rung', '  if (t && t.outcome && eventKey && t.eventKey === eventKey) {', '  if (false) {', 'rung: the same event after a nothingToReset is not retried before the event\'s reset'],
    // verify r3: an unmeasured vendor word read as "answered, nothing spent" (the pre-r3 classifier)
    ['an unmeasured outcome word read as nothing spent', "    if (!VENDOR_OUTCOMES.includes(word)) return { outcome: 'unknown-outcome', sent: true, answered: true, keyed, word };\n", '', 'answer (r3): a word outside the measured enum (cooldownActive) ⇒ unknown-outcome: went out, answered, ARMS, unsettled — never "nothing spent"'],
    ['an answer with no word read as nothing spent', "  if (!err && sentFlag !== false) return { outcome: 'unknown-outcome', sent: true, answered: true, keyed, word: null };\n", '', 'answer (r3): an answer with NO word and no error (a result shape never measured) ⇒ unknown-outcome too; with sent:false it stays not sent'],
    // verify r3: a prior judged by a reading taken after its successor's send (the pre-r3 settle)
    ['a prior judged by a reading after its successor\'s send', "  const sup = num(t.supersededAt), superseded = !!(sup && at >= sup);\n", "  const sup = num(t.supersededAt), superseded = false;\n", 'superseded (r3 + r4): a reading at or after the newer attempt\'s send never CREDITS a landing to a prior (count fell 3 → 2 — the newer consume\'s: untold, which one cannot be said); the same count still proves NOT LANDED (a restart mid-press left one superseded while unsettled — nothing else could ever settle it); one before the send still lands it'],
    ['the r3 rule back (a superseded prior refused EVERY later reading — the r4 dead end after a restart mid-press)', "  const sup = num(t.supersededAt), superseded = !!(sup && at >= sup);\n", "  const sup = num(t.supersededAt), superseded = !!(sup && at >= sup);\n  if (superseded) return null;\n", 'superseded (r3 + r4): a reading at or after the newer attempt\'s send never CREDITS a landing to a prior (count fell 3 → 2 — the newer consume\'s: untold, which one cannot be said); the same count still proves NOT LANDED (a restart mid-press left one superseded while unsettled — nothing else could ever settle it); one before the send still lands it'],
    ['a supersede that drops nothing (the chain of lapsed priors grows for ever)', '    if (isUnsettled(x, opts) && (num(at) || Date.now()) >= lapseAtOf(x)) continue;\n', '', 'superseded (r3): supersede(prior, at) stamps every prior with the send and DROPS a lapsed one (nothing can settle it now); a settled or a not-yet-lapsed prior keeps its place and order'],
    // verify r3: the floor judged by the timer's stamp only (a sent attempt free between the floor and the timer)
    ['the floor judged by the timer\'s stamp only', "  return !!(armed && now - armed >= floorMs); // a sent attempt past the floor whose timer has not run is unsettled by the clock\n", "  return false;\n", 'clock (r3): a SENT attempt past the floor with NO outcome yet (its timer has not run) is unsettled by the clock — never free'],
    ['an open attempt on a non-reporting carrier free past the ack window', "  if (t.reportsSent === false && now - at >= ackMs) return at; // the ack timer's `unknown`, from the write, by the clock\n", '', 'clock (r3): an OPEN attempt on a carrier that CANNOT report, past the ack window ⇒ the cooldown from the WRITE (the unknown its timer will stamp), a floor later unsettled; a reporting carrier\'s stays free (not sent)'],
    // verify r3: the block that read only the newest record (an unsettled prior behind a free one blocked nothing)
    ['a block that reads only the newest record', '  for (let x = t; x; x = x.prior) { if (!isUnsettled(x, opts)) continue;', '  for (let x = t; x; x = x.prior) { if (!isUnsettled(x, opts) || x !== t) continue;', 'chain (r3): a FREE newest record with an UNSETTLED prior behind it ⇒ the block is unsettled, naming the prior\'s send'],
  ];
  for (const [what, from, to, rowName] of ctl) {
    const m = patched(what.replace(/\W+/g, '-'), from, to);
    ok(`§8 NEGATIVE CONTROL (${what}): the patch hit the product source`, !!m);
    if (!m) continue;
    const red = ATTEMPT_TABLE(m).filter((r) => !r.good).map((r) => r.name);
    ok(`§8 NEGATIVE CONTROL (${what}): the table goes red on "${rowName}"`, red.includes(rowName), red.join(' | ') || 'all green');
  }
  fs.rmSync(dir, { recursive: true, force: true });
  // WIRING: the engine reads the PURE rule — the preview, the rung, the answer
  const eng = fs.readFileSync(path.join(REPO, 'src/server/usage-pool-engine.js'), 'utf8');
  ok('§8 WIRING: the preview\'s floor is the PURE attemptBlock (in_flight / cooldown), the rung\'s is rungBlockUntil, the answer is creditAnswerOf',
    /function resetCreditBlock\(key, now = Date\.now\(\)\) \{ return resetCredit\.attemptBlock\(resetCreditTryFor\(key\)/.test(eng) && /const block = resetCreditBlock\(key, now\);/.test(eng)
    && /if \(block\.code === 'in_flight'\) return \{ \.\.\.out, code: 'in_flight'/.test(eng) && /const blockUntil = resetCredit\.rungBlockUntil\(t, /.test(eng) && /const ans = resetCredit\.creditAnswerOf\(payload\);/.test(eng)
    && !/resetCreditTriedAt/.test(eng));
}

console.log('\n§9 THE ATTEMPT LIFECYCLE — one closed table, every cell, a seeded walk (verify r3)');
// Three rounds found money holes in the same state machine; the machine is now ONE pure step (attemptStep) over the
// record the engine persists. The walk: (1) every reachable canonical state × every event — the CELLS; (2) from every
// state, seeded length-4 sequences. Six invariants, judged by an INDEPENDENT oracle over the raw record + the clock
// (never the module's own phase / block — a patched module must go red): I1 a record is charged at most once per path;
// I2 a charge is never undone; I3 a key is never minted while any attempt in the chain may have gone out and is
// neither answered nor lapsed (nor while one is open); I4 a settle happens once and is never re-judged; I5 an
// attempt that went out is charged; I6 the persisted view alone decides the phase; I7 the chain is bounded (≤ 3).
const LIFECYCLE = (M, { seedRuns = 40 } = {}) => {
  const num = (x) => (x === null || x === undefined || x === '' ? null : (Number.isFinite(Number(x)) ? Number(x) : null));
  const FLOOR = M.RESET_CREDIT_FLOOR_MS, ACK = M.RESET_CREDIT_ACK_MS, G = M.RESET_GRACE_SEC, LAPSE = M.RESET_CREDIT_LAPSE_MS;
  const NOW0 = 1_800_000_000_000, R0 = Math.floor(NOW0 / 1000) + 3600, o0 = { floorMs: FLOOR, ackMs: ACK };
  const newestUnsettled = (t, now) => { for (let x = t; x; x = x.prior) if (M.isUnsettled(x, { ...o0, now })) return x; return t; };
  const livePriorOf = (t, now) => { for (let x = t && t.prior; x; x = x.prior) if (M.isUnsettled(x, { ...o0, now }) && now < M.lapseAtOf(x)) return true; return false; };
  const EV = (now, t) => {
    const u = newestUnsettled(t, now);
    const c0 = u ? num(u.creditsAt) : null, Rr = u ? num(u.resetsAtSec) : null;
    // an UNSENT helper record over a live prior never consumes (its read-first gate): no answer of its can say "sent" —
    // such an answer is not an engine sequence, so the walk offers only the not-sent shapes there
    const gated = !!(t && !num(t.sentAt) && livePriorOf(t, now)); // (a session record never reaches this state: its press was refused)
    const saysSent = (p) => { const a = M.creditAnswerOf(p); return a.sent === true; };
    const kk = (t && t.idempotencyKey) || 'k'; // verify r4: a keyed answer belongs to the record that holds its key — the walk answers the newest
    return [
      { type: 'press', origin: 'user', creditsAt: 3, resetsAtSec: R0, window: { resetsAtSec: R0, periodSec: 604800 }, now },
      { type: 'press', origin: 'auto', reportsSent: false, creditsAt: null, resetsAtSec: R0, now },
      { type: 'press', via: 'helper', origin: 'user', creditsAt: 3, resetsAtSec: R0, window: { resetsAtSec: R0, periodSec: 604800 }, now },
      { type: 'sent', now }, { type: 'skipped', now },
      { type: 'answer', payload: { error: 'could not start codex app-server: ENOENT', idempotencyKey: kk, attempts: 0, sent: false }, now },
      { type: 'answer', payload: { outcome: 'reset', idempotencyKey: kk, attempts: 1 }, now },
      { type: 'answer', payload: { outcome: 'nothingToReset', idempotencyKey: kk, attempts: 1 }, now },
      { type: 'answer', payload: { error: 'account/rateLimitResetCredit/consume timed out after 30000ms', idempotencyKey: kk, attempts: 2 }, now },
      { type: 'answer', payload: { error: 'codex app-server exited (0) during consume', idempotencyKey: kk, attempts: 1, sent: true, answered: false }, now },
      { type: 'answer', payload: { error: 'Invalid request: missing field `idempotencyKey`' }, now },
      { type: 'answer', payload: { outcome: 'cooldownActive', idempotencyKey: kk, attempts: 1 }, now },
      { type: 'answer', payload: { error: 'upstream 502', idempotencyKey: kk, attempts: 1 }, now },
      { type: 'answer', payload: { outcome: 'reset', idempotencyKey: 'gone-' + kk, attempts: 2 }, now }, // verify r4: a LATE answer for an attempt no record holds
      { type: 'ack-expired', now }, { type: 'floor-expired', now },
      { type: 'reading', r: { fetchedAt: now, creditsLeft: c0 !== null ? c0 - 1 : 2 }, now },
      { type: 'reading', r: { fetchedAt: now, creditsLeft: c0 !== null ? c0 : 3 }, now },
      { type: 'reading', r: { fetchedAt: now, resetsAtSec: (Rr || R0) + 500, periodSec: 604800 }, now },
      { type: 'reading', r: { fetchedAt: now, resetsAtSec: Rr || R0, periodSec: 604800 }, now },
      { type: 'reading', r: { fetchedAt: now, windowStartSec: Math.floor(now / 1000) }, now },
      { type: 'reading', r: { fetchedAt: (u ? (num(u.sentAt) || num(u.at)) : now) - 1, creditsLeft: 1 }, now }, // a LAGGING reading (older than the send)
      { type: 'clock', ms: FLOOR + 1000, now }, { type: 'clock', ms: 8 * 86400e3, now }, { type: 'clock', ms: ACK + 1000, now },
      { type: 'boot', now }, { type: 'torn', now }, { type: 'pool-move', now }, { type: 'clear', now },
    ].filter((ev) => !(gated && ev.type === 'answer' && saysSent(ev.payload)));
  };
  const cls = (x) => (!x.outcome ? '-' : x.outcome === 'reset' ? 'R' : M.UNSETTLED_OUTCOMES.includes(x.outcome) ? 'U' : x.outcome === 'not-sent' ? 'N' : 'X');
  const canon = (t, now) => { if (!t) return 'none'; const k = [`${M.phaseOf(t, { ...o0, now })}:${t.charged ? 1 : 0}:${t.reportsSent === false ? 0 : 1}:${t.settled ? t.settled.how : '-'}:${cls(t)}:${t.supersededAt ? 's' : '-'}`]; let n = 0; for (let x = t.prior; x && n < 2; x = x.prior) { if (x.settled) continue; k.push('p' + M.phaseOf(x, { ...o0, now })); n++; } return k.join('|'); };
  const chainKeys = (t) => { const m = new Map(); for (let x = t; x; x = x.prior) m.set(x.idempotencyKey, x); return m; };
  const chainLen = (t) => { let n = 0; for (let x = t; x; x = x.prior) n++; return n; };
  // THE INDEPENDENT ORACLE (raw fields + the clock + the vendor's words spelled here, never the module's phase)
  const SPENT_NOTHING = ['nothingToReset', 'noCredit', 'alreadyRedeemed', 'error', 'refused-stale', 'not-sent', 'skipped', 'superseded'];
  const mayHaveGoneOut = (x, now) => num(x.sentAt) > 0 || (x.reportsSent === false && now - (num(x.at) || 0) >= ACK) || ['unanswered', 'no-answer', 'unknown', 'unknown-outcome'].includes(x.outcome);
  const isOpen = (x, now) => !x.outcome && !num(x.sentAt) && now - (num(x.at) || 0) < ACK;
  const answered = (x) => !!x.settled || x.outcome === 'reset' || SPENT_NOTHING.includes(x.outcome);
  const lapsedByClock = (x, now) => now >= (num(x.resetsAtSec) ? (num(x.resetsAtSec) + G) * 1000 : (num(x.sentAt) || num(x.at) || 0) + LAPSE);
  const viol = [];
  const flipped = (before, after) => { const B = chainKeys(before); const out = []; for (const [k, x] of chainKeys(after)) if (x.charged && !(B.get(k) && B.get(k).charged)) out.push(k); return out; };
  const check = (before, nowB, ev, after, fx, nowA, trail) => {
    const B = chainKeys(before), A = chainKeys(after);
    for (const [k, x] of A) {
      const b = B.get(k);
      if (b && b.charged && !x.charged) viol.push(['I2 a charge undone', k, trail]);
      if (b && b.settled && !x.settled && x.outcome !== 'reset') viol.push(['I4 a settle undone', k, trail]);
      if (b && b.settled && x.settled && b.settled.how !== x.settled.how) viol.push(['I4 a settle re-judged', k, trail]);
      if (num(x.sentAt) > 0 && !x.charged) viol.push(['I5 went out, not charged', k, trail]);
      if (M.phaseOf(M.persistedView(x), { ...o0, now: nowA }) !== M.phaseOf(x, { ...o0, now: nowA })) viol.push(['I6 the file is not the state', k, trail]);
    }
    // I3 at a SESSION press (its verb goes out at once) and at every FIRST SEND (the helper read first): no attempt in the
    // chain may have gone out unanswered and unlapsed, none may be open
    const liveBefore = (x) => isOpen(x, nowB) || (mayHaveGoneOut(x, nowB) && !answered(x) && !lapsedByClock(x, nowB));
    if (fx.minted && ev.via !== 'helper') for (let x = before; x; x = x.prior) if (liveBefore(x)) viol.push(['I3 minted over an attempt that may have gone out (or is open)', x.idempotencyKey, trail]);
    const nb = chainKeys(before);
    if (ev.type !== 'boot') for (const [k, x] of A) { const b = nb.get(k); if (b && !num(b.sentAt) && num(x.sentAt) > 0) for (let y = b.prior; y; y = y.prior) if (liveBefore(y)) viol.push(['I3 sent over a prior that may have gone out', y.idempotencyKey, trail]); }
    // I7, STRUCTURAL: (a) at a supersession no entry lapsed at that instant is kept (nothing can settle it); (b) a press
    // carries at most MAX_PRIOR_TAIL live entries behind its head, none settled, none lapsed; (c) a step adds at most one
    for (const [k, x] of A) { const b = nb.get(k); if (num(x.supersededAt) && !(b && num(b.supersededAt)) && !answered(x) && lapsedByClock(x, num(x.supersededAt))) viol.push(['I7 a lapsed prior kept at its supersession', k, trail]); }
    if (fx.minted && after && after.prior) { let n = 0; for (let y = after.prior.prior; y; y = y.prior) { n++; if (answered(y) || lapsedByClock(y, nowA) || !mayHaveGoneOut(y, nowA)) viol.push(['I7 a press carried a dead tail entry', y.idempotencyKey, trail]); } if (n > 8) viol.push(['I7 a press carried a tail past MAX_PRIOR_TAIL', n, trail]); }
    if (chainLen(after) > chainLen(before) + 1) viol.push(['I7 a step grew the chain by more than one', chainLen(after), trail]);
  };
  const phases = new Set(), seen = new Map(), queue = [{ t: null, now: NOW0 }]; let cells = 0; seen.set('none', { t: null, now: NOW0 });
  while (queue.length) {
    const { t, now } = queue.shift();
    for (const ev of EV(now, t)) {
      const { t: t2, effects } = M.attemptStep(t, ev, o0);
      const now2 = ev.type === 'clock' ? now + ev.ms : now;
      cells++;
      const trail = [canon(t, now), ev.type + (ev.payload ? ':' + String(ev.payload.outcome || ev.payload.error || '').slice(0, 14) : ev.ms ? ':' + ev.ms : '')];
      const f = flipped(t, t2);
      if (effects.charge !== (f.length > 0)) viol.push(['I1 a charge effect and the records flipped disagree', f, trail]);
      check(t, now, ev, t2, effects, now2, trail);
      for (let x = t2; x; x = x.prior) phases.add(M.phaseOf(x, { ...o0, now: now2 }));
      const key = canon(t2, now2);
      if (!seen.has(key)) { seen.set(key, { t: t2, now: now2 }); queue.push({ t: t2, now: now2 }); }
      if (cells > 200000) { viol.push(['the quotient did not close (cells > 200000)']); queue.length = 0; break; }
    }
  }
  if (!phases.has('none')) phases.add('none');
  let seed = 0x9e3779b9; const rnd = () => { seed ^= seed << 13; seed >>>= 0; seed ^= seed >>> 17; seed ^= seed << 5; seed >>>= 0; return seed / 4294967296; };
  let walked = 0, maxChain = 0;
  for (const [k0, st] of seen) {
    for (let n = 0; n < seedRuns; n++) {
      let t = st.t, now = st.now; const charges = new Map(); const trail = [k0];
      for (let d = 0; d < 4; d++) {
        const evs = EV(now, t); const ev = evs[Math.floor(rnd() * evs.length)];
        const { t: t2, effects } = M.attemptStep(t, ev, o0);
        const now2 = ev.type === 'clock' ? now + ev.ms : now;
        trail.push(ev.type);
        for (const k of flipped(t, t2)) { charges.set(k, (charges.get(k) || 0) + 1); if (charges.get(k) > 1) viol.push(['I1 charged twice on one path', k, trail.join(' > ')]); }
        check(t, now, ev, t2, effects, now2, trail);
        maxChain = Math.max(maxChain, chainLen(t2));
        t = t2; now = now2; walked++;
      }
    }
  }
  return { states: seen.size, cells, walked, viol, phases, maxChain };
};
{
  const L = LIFECYCLE(RC);
  ok(`§9 the quotient closes: ${L.states} canonical states × every event = ${L.cells} cells, ${L.walked} seeded steps`, L.states >= 40 && L.cells >= 1000 && L.walked >= 5000 && L.cells >= L.states * 25 && L.cells <= L.states * 29, JSON.stringify([L.states, L.cells, L.walked]));
  ok('§9 every phase of the closed set is reached (none · open · sent · landed · unspent · not-sent · unanswered · unsettled · lapsed · settled)', RC.ATTEMPT_PHASES.every((p) => L.phases.has(p)) && [...L.phases].every((p) => RC.ATTEMPT_PHASES.includes(p)), [...L.phases].join(','));
  ok('§9 the invariants hold on every cell and every seeded step (I1 one charge per attempt · I2 never undone · I3 never a send over an attempt that may have gone out · I4 one settle · I5 went out ⇒ charged · I6 the file is the state · I7 the chain is bounded)', L.viol.length === 0, L.viol.slice(0, 5).map((v) => JSON.stringify(v)).join(' | '));
  ok('§9 the chain stays short through the walk (a superseded lapsed prior is dropped at the send; the carried tail is capped at MAX_PRIOR_TAIL)', L.maxChain <= 6, String(L.maxChain));
  // THE MATRIX, spelled: the press verdict per phase, the send per phase, the boot per phase
  const NOWMS = 1_800_000_000_000, FLOOR = RC.RESET_CREDIT_FLOOR_MS, ACK = RC.RESET_CREDIT_ACK_MS, o = { now: NOWMS, floorMs: FLOOR, ackMs: ACK };
  const R = Math.floor(NOWMS / 1000) + 3600;
  const FIX = {
    open: { at: NOWMS - 10e3, sentAt: 0, outcome: null, charged: false, hold: true, reportsSent: true, idempotencyKey: 'o' },
    sent: { at: NOWMS - 60e3, sentAt: NOWMS - 60e3, outcome: null, charged: true, idempotencyKey: 's' },
    landed: { at: NOWMS - 11 * 60e3, sentAt: NOWMS - 11 * 60e3, outcome: 'reset', outcomeAt: NOWMS - 10 * 60e3, charged: true, idempotencyKey: 'l' },
    unspent: { at: NOWMS - 60e3, sentAt: NOWMS - 60e3, outcome: 'nothingToReset', outcomeAt: NOWMS - 50e3, charged: true, idempotencyKey: 'x' },
    'not-sent': { at: NOWMS - ACK - 5e3, sentAt: 0, outcome: 'not-sent', outcomeAt: NOWMS - 5e3, charged: false, idempotencyKey: 'n' },
    unanswered: { at: NOWMS - 60e3, sentAt: NOWMS - 60e3, outcome: 'unanswered', outcomeAt: NOWMS - 30e3, charged: true, creditsAt: 3, resetsAtSec: R, idempotencyKey: 'u' },
    unsettled: { at: NOWMS - 11 * 60e3, sentAt: NOWMS - 11 * 60e3, outcome: 'unanswered', outcomeAt: NOWMS - 10 * 60e3, charged: true, creditsAt: 3, resetsAtSec: R, idempotencyKey: 'v' },
    lapsed: { at: NOWMS - 11 * 60e3, sentAt: NOWMS - 11 * 60e3, outcome: 'unanswered', outcomeAt: NOWMS - 10 * 60e3, charged: true, creditsAt: 3, resetsAtSec: Math.floor(NOWMS / 1000) - 120, idempotencyKey: 'p' },
    settled: { at: NOWMS - 11 * 60e3, sentAt: NOWMS - 11 * 60e3, outcome: 'unanswered', outcomeAt: NOWMS - 10 * 60e3, charged: true, settled: { how: 'not-landed', at: NOWMS - 1000 }, idempotencyKey: 'z' },
  };
  ok('§9 the fixtures are the phases they name', Object.entries(FIX).every(([p, t]) => RC.phaseOf(t, o) === p) && RC.phaseOf(null, o) === 'none', Object.entries(FIX).map(([p, t]) => p + '=' + RC.phaseOf(t, o)).join(' '));
  const PRESS = { none: 'minted', open: 'in_flight', sent: 'cooldown', landed: 'minted', unspent: 'minted', 'not-sent': 'minted', unanswered: 'cooldown', unsettled: 'unsettled', lapsed: 'minted', settled: 'minted' };
  const pressOn = (t) => { const r = RC.attemptStep(t, { type: 'press', origin: 'user', creditsAt: 3, now: NOWMS }, o); return r.effects.minted ? 'minted' : r.effects.refused; };
  ok('§9 THE PRESS ROW (session): minted over none / landed (past the floor) / unspent / not-sent / lapsed / settled; refused in_flight over open, cooldown over sent and unanswered, unsettled over unsettled', Object.entries(PRESS).every(([p, want]) => pressOn(p === 'none' ? null : FIX[p]) === want), Object.keys(PRESS).map((p) => p + '→' + pressOn(p === 'none' ? null : FIX[p])).join(' '));
  const hp = RC.attemptStep(FIX.unsettled, { type: 'press', via: 'helper', origin: 'user', creditsAt: 3, now: NOWMS }, o);
  const hs = RC.attemptStep(hp.t, { type: 'sent', now: NOWMS }, o);
  const hr = RC.attemptStep(hp.t, { type: 'reading', r: { fetchedAt: NOWMS, creditsLeft: 3 }, now: NOWMS }, o);
  const hs2 = RC.attemptStep(hr.t, { type: 'sent', now: NOWMS }, o);
  ok('§9 THE PRESS ROW (helper): admitted over an UNSETTLED chain with that attempt as its prior (the read-first\'s witness); the SEND is refused while the prior is unsettled, and goes out once a reading settled it (the prior then superseded)', hp.effects.minted && hp.t.prior && hp.t.prior.idempotencyKey === 'v' && hs.effects.refused === 'unsettled-prior' && !hs.t.sentAt && hr.effects.settle === 'not-landed' && hs2.t.sentAt === NOWMS && hs2.effects.charge && hs2.t.prior && hs2.t.prior.supersededAt === NOWMS, JSON.stringify([hp.effects, hs.effects.refused, hr.effects.settle, hs2.t.sentAt, hs2.t.prior && hs2.t.prior.supersededAt]));
  const hk = RC.attemptStep(hp.t, { type: 'skipped', now: NOWMS }, o);
  ok('§9 …the helper\'s read-first saying no ends it `skipped` (unspent, the hold given back, nothing sent); skipped on a session record or a sent one changes nothing', RC.phaseOf(hk.t, o) === 'unspent' && hk.effects.release && !hk.t.sentAt && RC.phaseOf(RC.attemptStep(FIX.open, { type: 'skipped', now: NOWMS }, o).t, o) === 'open' && RC.phaseOf(RC.attemptStep(FIX.sent, { type: 'skipped', now: NOWMS }, o).t, o) === 'sent');
  ok('§9 a free newest record with an unsettled prior (the helper that never started) is UNSETTLED to the block; a lapsed head never hides a live unsettled one behind it', RC.attemptBlock({ ...FIX.unspent, prior: FIX.unsettled }, o).code === 'unsettled' && RC.attemptBlock({ ...FIX.lapsed, prior: { ...FIX.unsettled, idempotencyKey: 'deep' } }, o).code === 'unsettled' && RC.attemptBlock({ ...FIX.lapsed, prior: { ...FIX.lapsed, idempotencyKey: 'deep' } }, o).code === null);
  ok('§9 …a press over a lapsed attempt carries it as the prior (the read-first\'s witness); over a settled one carries nothing', (RC.attemptStep(FIX.lapsed, { type: 'press', origin: 'user', now: NOWMS }, o).t.prior || {}).idempotencyKey === 'p' && RC.attemptStep(FIX.settled, { type: 'press', origin: 'user', now: NOWMS }, o).t.prior === null);
  const sentOn = (t) => { const r = RC.attemptStep(t, { type: 'sent', now: NOWMS }, o); return `${RC.phaseOf(r.t, o)}${r.effects.charge ? '+charge' : ''}`; };
  ok('§9 THE SEND ROW: open ⇒ sent + charged (the hold converted); not-sent ⇒ re-opened as sent + charged (it went out after all); every other phase unchanged, nothing charged twice', sentOn(FIX.open) === 'sent+charge' && sentOn(FIX['not-sent']) === 'sent+charge' && ['sent', 'landed', 'unspent', 'unanswered', 'unsettled', 'lapsed', 'settled'].every((p) => sentOn(FIX[p]) === p), ['open', 'not-sent', 'sent', 'landed', 'unspent'].map((p) => p + '→' + sentOn(FIX[p])).join(' '));
  const bootOn = (t) => { const r = RC.attemptStep(t, { type: 'boot', now: NOWMS }, o); return `${RC.phaseOf(r.t, o)}${r.effects.charge ? '+charge' : ''}`; };
  ok('§9 THE BOOT ROW: open ⇒ unanswered (unknown — it may have gone out) + charged by its identity; sent ⇒ unanswered (charged already); every settled / answered phase unchanged', bootOn(FIX.open) === 'unanswered+charge' && bootOn(FIX.sent) === 'unanswered' && ['landed', 'unspent', 'not-sent', 'unanswered', 'unsettled', 'lapsed', 'settled'].every((p) => bootOn(FIX[p]) === p), ['open', 'sent'].map((p) => p + '→' + bootOn(FIX[p])).join(' '));
  const readOn = (t, r) => { const x = RC.attemptStep(t, { type: 'reading', r, now: NOWMS }, o); return `${RC.phaseOf(x.t, o)}:${x.effects.settle || '-'}`; };
  ok('§9 THE READING ROW: unsettled + count fell ⇒ landed; same count ⇒ settled (not-landed); a lagging reading (older than the send) settles nothing; a reading at or after a newer send never CREDITS a landing (a fallen count ⇒ untold, verify r4) but the same count still proves not-landed; a settled / landed / unspent record ignores every reading', readOn(FIX.unsettled, { fetchedAt: NOWMS, creditsLeft: 2 }) === 'landed:landed' && readOn(FIX.unsettled, { fetchedAt: NOWMS, creditsLeft: 3 }) === 'settled:not-landed' && readOn(FIX.unsettled, { fetchedAt: FIX.unsettled.sentAt - 1, creditsLeft: 2 }) === 'unsettled:-' && readOn({ ...FIX.unsettled, supersededAt: NOWMS - 1 }, { fetchedAt: NOWMS, creditsLeft: 2 }) === 'settled:untold' && readOn({ ...FIX.unsettled, supersededAt: NOWMS - 1 }, { fetchedAt: NOWMS, creditsLeft: 3 }) === 'settled:not-landed' && readOn({ ...FIX.unsettled, supersededAt: NOWMS - 1, creditsAt: null }, { fetchedAt: NOWMS, resetsAtSec: R + 500, periodSec: 604800 }) === 'settled:untold' && ['settled', 'landed', 'unspent'].every((p) => readOn(FIX[p], { fetchedAt: NOWMS, creditsLeft: 1 }) === p + ':-'));
  ok('§9 THE ACK / FLOOR ROWS: ack-expired on an open reporting carrier ⇒ not-sent (the hold released); on one that cannot report ⇒ unanswered (unknown) + charged; floor-expired on sent ⇒ no-answer — unsettled the instant the floor is full; neither touches another phase', (() => { const a = RC.attemptStep(FIX.open, { type: 'ack-expired', now: FIX.open.at + ACK }, o); const b = RC.attemptStep({ ...FIX.open, reportsSent: false }, { type: 'ack-expired', now: FIX.open.at + ACK }, o); const c = RC.attemptStep(FIX.sent, { type: 'floor-expired', now: FIX.sent.sentAt + FLOOR }, o); return RC.phaseOf(a.t, { ...o, now: FIX.open.at + ACK }) === 'not-sent' && a.effects.release && RC.phaseOf(b.t, { ...o, now: FIX.open.at + ACK }) === 'unanswered' && b.effects.charge && c.t.outcome === 'no-answer' && RC.phaseOf(c.t, { ...o, now: FIX.sent.sentAt + FLOOR }) === 'unsettled' && RC.phaseOf(c.t, { ...o, now: FIX.sent.sentAt + FLOOR - 1 }) === 'unanswered' && ['landed', 'unspent', 'settled'].every((p) => RC.phaseOf(RC.attemptStep(FIX[p], { type: 'floor-expired', now: NOWMS }, o).t, o) === p); })());
  ok('§9 pool-move and Clear content… change no attempt; a torn file is none + a notice; an unknown event throws (the set is closed)', RC.phaseOf(RC.attemptStep(FIX.unsettled, { type: 'pool-move', now: NOWMS }, o).t, o) === 'unsettled' && RC.phaseOf(RC.attemptStep(FIX.sent, { type: 'clear', now: NOWMS }, o).t, o) === 'sent' && RC.attemptStep(FIX.sent, { type: 'torn', now: NOWMS }, o).t === null && RC.attemptStep(FIX.sent, { type: 'torn', now: NOWMS }, o).effects.notice === 'attempts-unreadable' && (() => { try { RC.attemptStep(null, { type: 'nap' }, o); return false; } catch { return true; } })());
  ok('§9 THE ANSWER ROW BY KEY (verify r4): a keyed answer settles the record that holds its key wherever it sits in the chain; one whose key no record holds is LATE — it changes no record (a late reset is said by the engine)', (() => { const c = { ...FIX.sent, idempotencyKey: 'new', prior: { ...FIX.unsettled, idempotencyKey: 'old' } }; const a = RC.attemptStep(c, { type: 'answer', payload: { outcome: 'reset', idempotencyKey: 'old', attempts: 2 }, now: NOWMS }, o); const b = RC.attemptStep(c, { type: 'answer', payload: { outcome: 'reset', idempotencyKey: 'gone', attempts: 2 }, now: NOWMS }, o); return a.t.outcome === null && a.t.prior.outcome === 'reset' && a.effects.settle === 'reset' && !a.effects.late && b.effects.late && b.t.outcome === null && b.t.prior.outcome === 'unanswered' && b.effects.settle === 'late-reset'; })());
  ok('§9 attemptStep never writes its input (the engine\'s record is the engine\'s)', (() => { const t = JSON.parse(JSON.stringify(FIX.open)); const before = JSON.stringify(t); RC.attemptStep(t, { type: 'sent', now: NOWMS }, o); RC.attemptStep(t, { type: 'boot', now: NOWMS }, o); return JSON.stringify(t) === before; })());
  // NEGATIVE CONTROLS — a patched table goes red on the walk's invariants (the oracle is the suite's, never the module's)
  const src9 = fs.readFileSync(MOD, 'utf8');
  const dir9 = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-rcverdict9-'));
  const patched9 = (tag, edits) => { let s = src9; for (const [from, to] of edits) { if (!s.includes(from)) return null; s = s.replace(from, to); } const f = path.join(dir9, `reset-credit.${tag}.js`); fs.writeFileSync(f, s); return require(f); };
  const CTL9 = [
    ['a block that reads only the newest record (an unsettled prior behind a free one)', [['  for (let x = t; x; x = x.prior) { if (!isUnsettled(x, opts)) continue;', '  for (let x = t; x; x = x.prior) { if (!isUnsettled(x, opts) || x !== t) continue;']], /^I3/],
    ['the floor judged by the timer\'s stamp only', [["  return !!(armed && now - armed >= floorMs); // a sent attempt past the floor whose timer has not run is unsettled by the clock\n", '  return false;\n']], /^I3/],
    ['an unmeasured vendor word read as nothing spent', [["    if (!VENDOR_OUTCOMES.includes(word)) return { outcome: 'unknown-outcome', sent: true, answered: true, keyed, word };\n", '']], /^I3/],
    ['a supersede that drops nothing (the chain of lapsed priors grows for ever)', [['    if (isUnsettled(x, opts) && (num(at) || Date.now()) >= lapseAtOf(x)) continue;\n', '']], /^I7/],
    ['a send that charges nothing', [['      t.sentAt = now; charge(t); t.prior = supersede(t.prior, now, o); break;', '      t.sentAt = now; t.prior = supersede(t.prior, now, o); break;']], /^I5/],
    ['a press that ignores the block', [["      if (b.code && !(helper && b.code === 'unsettled')) { fx.refused = b.code; break; }\n", '']], /^I3/],
    ['a send that ignores a live prior (the helper consuming without its read-first)', [["      for (let x = t.prior; x; x = x.prior) if (isUnsettled(x, o) && now < lapseAtOf(x)) { fx.refused = 'unsettled-prior'; break; }\n      if (fx.refused) break;\n", '']], /^I3/],
    ['a press that carries the whole tail uncut (the chain grows)', [['  h.prior = tail;\n  return h;', '  return h;'], ['const MAX_PRIOR_TAIL = 8;', 'const MAX_PRIOR_TAIL = 0;']], /^I7/],
    ['a boot that charges the open record twice (once per boot)', [["      for (let x = t; x; x = x.prior) { x.hold = false; if (!x.outcome) { x.sentGuessed = !x.sentAt; x.sentAt = x.sentAt || x.at; x.outcome = 'unknown'; x.outcomeAt = now; charge(x); x.revivedAt = now; }", "      for (let x = t; x; x = x.prior) { x.hold = false; if (!x.outcome) { x.sentGuessed = !x.sentAt; x.sentAt = x.sentAt || x.at; x.outcome = 'unknown'; x.outcomeAt = now; charge(x); x.revivedAt = now; } if (x.outcome === 'unknown') { x.charged = false; charge(x); }"]], /^I1|^I2/],
  ];
  for (const [what, edits, re] of CTL9) {
    const m = patched9(what.replace(/\W+/g, '-'), edits);
    ok(`§9 NEGATIVE CONTROL (${what}): the patch hit the product source`, !!m);
    if (!m) continue;
    const L2 = LIFECYCLE(m, { seedRuns: 20 });
    ok(`§9 NEGATIVE CONTROL (${what}): the walk goes RED on ${String(re).replace(/\W/g, '')}`, L2.viol.some((v) => re.test(String(v[0]))), L2.viol.slice(0, 3).map((v) => String(v[0])).join(' | ') || 'all green');
  }
  // verify r10 ② (reproduced on the real engine, money): WHICH half the boot guesses. A press OPEN at the boot has its SEND guessed
  // (`sentGuessed`) and its wrapper's later `beforeReset` push re-opens it; a press SENT before the boot keeps its send as a fact and
  // the same push re-opens NOTHING — the reading settles it. Pinned on the table directly: the seeded walk above never emits a
  // `beforeReset` reading, so a drift of this predicate is invisible to it (a walk-control on it reads "all green")
  { const NOW = 1_800_000_000_000, R = 1_800_000_000 + 3600, o10 = { now: NOW, floorMs: RC.RESET_CREDIT_FLOOR_MS, ackMs: RC.RESET_CREDIT_ACK_MS };
    const run = (M, sentFirst) => { let t = null; const ev = (e) => { const r = M.attemptStep(t, e, o10); t = r.t; return r.effects; };
      ev({ type: 'press', key: 'k', origin: 'user', readFirst: true, creditsAt: 3, resetsAtSec: R, window: { resetsAtSec: R, periodSec: 604800 }, now: NOW });
      if (sentFirst) ev({ type: 'sent', now: NOW + 1000 });
      ev({ type: 'boot', now: NOW + 5000 });
      const fx = ev({ type: 'reading', beforeReset: true, idemKey: t.idempotencyKey, now: NOW + 6000, r: { fetchedAt: NOW + 6000, creditsLeft: 3, resetsAtSec: R, periodSec: 604800, windowStartSec: R - 604800 } });
      return { t, fx }; };
    const open = run(RC, false), sent = run(RC, true);
    ok('§9 r10 ②: a press OPEN at the boot (its send guessed) is re-opened by its wrapper\'s later push (sentAt 0, outcome null, the guess kept until a real send); a press SENT before the boot (its send a fact) is NOT — the reading settles it not-landed, it stays sent, unknown and charged', open.fx.reopened === true && open.t.outcome === null && open.t.sentAt === 0 && open.t.sentGuessed === true && sent.fx.reopened === false && sent.t.outcome === 'unknown' && sent.t.sentAt === NOW + 1000 && sent.t.sentGuessed === false && sent.t.settled && sent.t.settled.how === 'not-landed' && sent.t.charged === true, JSON.stringify([open.fx, open.t.sentAt, sent.fx, sent.t.settled]));
    const m10 = patched9('r10-guess-every-send', [["      for (let x = t; x; x = x.prior) { x.hold = false; if (!x.outcome) { x.sentGuessed = !x.sentAt; x.sentAt = x.sentAt || x.at;", "      for (let x = t; x; x = x.prior) { x.hold = false; if (!x.outcome) { x.sentGuessed = true; x.sentAt = x.sentAt || x.at;"]]);
    ok('§9 r10 ② NEGATIVE CONTROL (a boot that guesses EVERY revived send — the r9 shape): the SENT press is re-opened by the replayed push (sentAt 0 over a consume that went out) — the pin above sees the rule', !!m10 && run(m10, true).fx.reopened === true && run(m10, true).t.sentAt === 0);
    { let t = null; const ev = (e) => { const r = RC.attemptStep(t, e, o10); t = r.t; return r.effects; };
      ev({ type: 'press', key: 'k', origin: 'user', readFirst: true, creditsAt: 3, resetsAtSec: R, now: NOW }); ev({ type: 'boot', now: NOW + 5000 }); const g = { ...t }; const fx = ev({ type: 'sent', now: NOW + 7000 });
      ok('§9 r10: a REAL send over a guessed one (the wrapper\'s own `reset_credit_sent`, read back from its file at its instant) takes the real instant and clears the guess; the charge stays the boot\'s one (no second)', g.sentGuessed === true && g.sentAt === NOW && t.sentGuessed === false && t.sentAt === NOW + 7000 && t.charged === true && fx.charge === false && t.outcome === 'unknown', JSON.stringify([g.sentAt, t.sentAt, t.sentGuessed, fx])); }
  }
  fs.rmSync(dir9, { recursive: true, force: true });
  // WIRING: the engine's handlers are the table's events (the step is pinned to the code that runs)
  const eng9 = fs.readFileSync(path.join(REPO, 'src/server/usage-pool-engine.js'), 'utf8');
  ok('§9 WIRING: press = openResetCreditTry (prior = priorForPress) · sent = noteResetCreditSent (charge + supersede) · ack-expired = onResetCreditNotSent / onResetCreditUnknown · reading = settleResetCreditByReading (settleByReading with the clock) · boot = loadResetCreditTries (unknown + charged + supersede)',
    /prior: resetCredit\.priorForPress\(prev, clockOpts\(now\)\) \}/.test(eng9) && /function noteResetCreditSent\(t, now = Date\.now\(\), \{ proof = 'record' \} = \{\}\) \{[\s\S]{0,1100}t\.prior = resetCredit\.supersede\(t\.prior, now, clockOpts\(now\)\);/.test(eng9) // (verify r10: the guessed-send rule + its essay sit between the head and the supersede; `proof` = record | answer)
    && /if \(!t\.reportsSent\) return onResetCreditUnknown\(t\);/.test(eng9) && /const r = resetCredit\.settleByReading\(x, \{[^\n]*\}, co\);/.test(eng9)
    && /if \(Number\(t\.sentAt\) > 0\) t\.prior = resetCredit\.supersede\(t\.prior, Number\(t\.sentAt\), clockOpts\(Number\(t\.sentAt\)\)\);/.test(eng9) && /t\.outcome = 'unknown'; t\.outcomeAt = Date\.now\(\); t\.settled = null;/.test(eng9));
}

console.log('\n§10 THE READ BEFORE A PRESS (verify r8 T0 — the owner\'s yes on ut-cdaa01aff0, 2026-10-02): ONE table for both carriers');
{
  // the rows of preConsumeVerdict over the shapes the carriers meet, then the attempt table's readFirst rows, then
  // a patched copy per rule (a dropped row ⇒ its cell red, counted) — the helper's read-first and the wrapper's are
  // judged by the SAME function (wiring pins in §7's spirit, below)
  const R0 = 1_800_000_000, NOW = (R0 - 3600) * 1000;
  const o = { now: NOW, floorMs: RC.RESET_CREDIT_FLOOR_MS, ackMs: RC.RESET_CREDIT_ACK_MS };
  const base = { key: 'k', at: NOW - 1000, sentAt: 0, outcome: null, resetsAtSec: R0, window: { resetsAtSec: R0, periodSec: 604800 }, creditsAt: 3, prior: null, reportsSent: true };
  const unsettled = { key: 'k', at: NOW - 20 * 60e3, sentAt: NOW - 20 * 60e3, outcome: 'unanswered', outcomeAt: NOW - 10 * 60e3, resetsAtSec: R0, creditsAt: 3, settled: null, prior: null, reportsSent: true, idempotencyKey: 'u' };
  const settledAs = (how) => ({ ...unsettled, settled: { how, why: 'x', at: NOW - 1 } });
  const lapsed = (x) => ({ ...x, resetsAtSec: R0 - 86400 });
  const rows10 = (mod) => {
    const v = (t, opts) => mod.preConsumeVerdict(t, { now: NOW, ...opts });
    const is = (got, want) => got && got.go === want.go && (want.why === undefined || got.why === want.why);
    return [
      ['go: the read restates the window shown, counts credits, no prior', is(v(base, { freshWindow: R0, freshCount: 3 }), { go: true, why: null })],
      ['window-moved: the read states another window ⇒ no consume (what you approve is what runs)', (() => { const r = v(base, { freshWindow: R0 + 604800, freshCount: 3 }); return is(r, { go: false, why: 'window-moved' }) && r.window === R0 + 604800; })()],
      ['…an EARLIER restatement is a move too (the r6 plan-change shape: S51)', is(v(base, { freshWindow: R0 - 600, freshCount: 3 }), { go: false, why: 'window-moved' })],
      ['…a read stating no window, or an attempt that showed none, leaves the window row silent', is(v(base, { freshWindow: null, freshCount: 3 }), { go: true }) && is(v({ ...base, resetsAtSec: 0 }, { freshWindow: R0 + 5, freshCount: 3 }), { go: true })],
      ['prior-unsettled: an earlier attempt still unsettled (not lapsed) ⇒ no consume (it needs this reading to settle it first)', is(v({ ...base, prior: unsettled }, { freshWindow: R0, freshCount: 3 }), { go: false, why: 'prior-unsettled' })],
      ['prior-landed ⇒ no (the credit was used then)', is(v({ ...base, prior: settledAs('landed') }, { freshWindow: R0, freshCount: 2 }), { go: false, why: 'prior-landed' })],
      ['prior-expired ⇒ no (the wall reset by itself)', is(v({ ...base, prior: settledAs('expired') }, { freshWindow: R0, freshCount: 3 }), { go: false, why: 'prior-expired' })],
      ['prior-untold ⇒ no (the person sees the fresh count first)', is(v({ ...base, prior: settledAs('untold') }, { freshWindow: R0, freshCount: 3 }), { go: false, why: 'prior-untold' })],
      ['a prior settled NOT LANDED lets the consume through', is(v({ ...base, prior: settledAs('not-landed') }, { freshWindow: R0, freshCount: 3 }), { go: true })],
      ['a LAPSED prior blocks nothing — still unsettled, or settled by this very reading (its wall is gone by itself)', is(v({ ...base, prior: lapsed(unsettled) }, { freshWindow: R0, freshCount: 3 }), { go: true }) && is(v({ ...base, prior: lapsed(settledAs('untold')) }, { freshWindow: R0, freshCount: 3 }), { go: true }) && is(v({ ...base, prior: lapsed(settledAs('landed')) }, { freshWindow: R0, freshCount: 3 }), { go: true })],
      ['read-failed: the read itself failed and nothing is unsettled ⇒ GO, said (a failed read never blocks a person\'s press)', is(v(base, { readOk: false }), { go: true, why: 'read-failed' })],
      ['read-failed over an unsettled prior ⇒ no (a consume over it needs a reading)', is(v({ ...base, prior: unsettled }, { readOk: false }), { go: false, why: 'prior-unsettled' })],
      ['read-failed never judges the window or the count (nothing was read)', is(v(base, { readOk: false, freshWindow: R0 + 1, freshCount: 0 }), { go: true, why: 'read-failed' })],
      ['no-credits: the read counts zero ⇒ no consume, said', is(v(base, { freshWindow: R0, freshCount: 0 }), { go: false, why: 'no-credits' })],
      ['…a count the read did not carry is not zero', is(v(base, { freshWindow: R0, freshCount: null }), { go: true })],
      ['THE ORDER: the window first (a moved window over a landed prior says window-moved — the person approved THAT window)', is(v({ ...base, prior: settledAs('landed') }, { freshWindow: R0 + 604800, freshCount: 2 }), { go: false, why: 'window-moved' })],
      ['…the priors before the count (a zero count behind a landed prior says prior-landed)', is(v({ ...base, prior: settledAs('landed') }, { freshWindow: R0, freshCount: 0 }), { go: false, why: 'prior-landed' })],
      ['every why is in PRE_CONSUME_WHY', ['window-moved', 'prior-unsettled', 'prior-landed', 'prior-expired', 'prior-untold', 'read-failed', 'no-credits'].every((w) => mod.PRE_CONSUME_WHY.includes(w))],
    ];
  };
  for (const [name, good] of rows10(RC)) ok(`§10 ${name}`, good);
  // the attempt table learns readFirst: the press carries it, the open head takes the reading's count, `skipped` ends it
  { const press = RC.attemptStep(null, { type: 'press', origin: 'user', creditsAt: 3, resetsAtSec: R0, window: { resetsAtSec: R0, periodSec: 604800 }, readFirst: true, now: NOW }, o);
    const plain = RC.attemptStep(null, { type: 'press', origin: 'user', creditsAt: 3, resetsAtSec: R0, now: NOW }, o);
    const helper = RC.attemptStep(null, { type: 'press', via: 'helper', origin: 'user', creditsAt: 3, resetsAtSec: R0, now: NOW }, o);
    ok('§10 THE PRESS ROW: a session press with readFirst mints a record that says so; a plain session press does not; a helper press always reads first', press.effects.minted && press.t.readFirst === true && plain.t.readFirst === false && helper.t.readFirst === true, JSON.stringify([press.t.readFirst, plain.t.readFirst, helper.t.readFirst]));
    const rd = RC.attemptStep(press.t, { type: 'reading', r: { fetchedAt: NOW + 10, creditsLeft: 2, resetsAtSec: R0, periodSec: 604800 }, now: NOW + 10 }, o);
    const rdPlain = RC.attemptStep(plain.t, { type: 'reading', r: { fetchedAt: NOW + 10, creditsLeft: 2, resetsAtSec: R0, periodSec: 604800 }, now: NOW + 10 }, o);
    ok('§10 THE READING ROW: the read before the consume refreshes the OPEN read-first head\'s count (3 → 2 = the count at the send); a plain session head keeps the count it carried', rd.t.creditsAt === 2 && rdPlain.t.creditsAt === 3, JSON.stringify([rd.t.creditsAt, rdPlain.t.creditsAt]));
    const sk = RC.attemptStep(rd.t, { type: 'skipped', now: NOW + 20 }, o), skPlain = RC.attemptStep(plain.t, { type: 'skipped', now: NOW + 20 }, o);
    ok('§10 THE SKIPPED ROW: a read-first session head ends `skipped` (unspent, the hold given back, nothing sent); a plain session head ignores it', sk.t.outcome === 'skipped' && sk.effects.release && !sk.t.sentAt && RC.phaseOf(sk.t, { ...o, now: NOW + 20 }) === 'unspent' && skPlain.t.outcome === null, JSON.stringify([sk.t.outcome, sk.effects.release, skPlain.t.outcome]));
    const go = RC.attemptStep(rd.t, { type: 'sent', now: NOW + 20 }, o);
    ok('§10 THE SENT ROW after a go: sent + charged, the count at the send the read\'s', go.t.sentAt === NOW + 20 && go.effects.charge && go.t.creditsAt === 2, JSON.stringify([go.t.sentAt, go.effects.charge, go.t.creditsAt]));
    const ans = RC.creditAnswerOf({ skipped: true, why: 'window-moved', idempotencyKey: 'k', attempts: 0, sent: false });
    const ansNV = RC.creditAnswerOf({ skipped: true, why: 'no-verdict', error: 'no verdict on the read before the consume within 25000ms — nothing sent', idempotencyKey: 'k', attempts: 0, sent: false });
    ok('§10 THE ANSWER: the wrapper\'s `skipped` result is read as skipped (not sent, answered), its why carried — the no-verdict shape too, whatever its error text says', ans.outcome === 'skipped' && ans.sent === false && ans.why === 'window-moved' && ansNV.outcome === 'skipped' && ansNV.why === 'no-verdict', JSON.stringify([ans, ansNV]));
    ok('§10 …and a skipped record ends the chain unspent (SPENT_NOTHING), never arming the floor', RC.ATTEMPT_OUTCOMES.includes('skipped') && !RC.outcomeArmsFloor('skipped'));
  }
  // NEGATIVE CONTROLS — a patched copy per rule
  { const src = fs.readFileSync(MOD, 'utf8');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-rcverdict10-'));
    const controls = [
      ['the no-credits row dropped', "  if (freshCount !== null && num(freshCount) !== null && num(freshCount) <= 0) return { go: false, why: 'no-credits' };\n", '', 'no-credits: the read counts zero ⇒ no consume, said'],
      ['the lapsed skip dropped (a lapsed prior blocks the press)', '    if (now >= lapseAtOf(x)) continue; // LAPSED (its wall gone by itself): blocks nothing — whatever this very reading just said about it\n', '', 'a LAPSED prior blocks nothing — still unsettled, or settled by this very reading (its wall is gone by itself)'],
      ['a failed read blocks the press', "  if (readOk === false) return { go: true, why: 'read-failed' };", "  if (readOk === false) return { go: false, why: 'read-failed' };", 'read-failed: the read itself failed and nothing is unsettled ⇒ GO, said (a failed read never blocks a person\'s press)'],
      ['the window row dropped', "  if (readOk !== false && freshWindow !== null && num(freshWindow) !== null && shown > 0 && num(freshWindow) !== shown) return { go: false, why: 'window-moved', window: num(freshWindow) };\n", '', 'window-moved: the read states another window ⇒ no consume (what you approve is what runs)'],
      ['the priors judged after the count (the order flipped)', "  for (let x = x0.prior; x; x = x.prior) {\n    if (now >= lapseAtOf(x)) continue;", "  if (freshCount !== null && num(freshCount) !== null && num(freshCount) <= 0) return { go: false, why: 'no-credits' };\n  for (let x = x0.prior; x; x = x.prior) {\n    if (now >= lapseAtOf(x)) continue;", '…the priors before the count (a zero count behind a landed prior says prior-landed)'],
    ];
    for (const [what, from, to, row] of controls) {
      const hit = src.includes(from);
      ok(`§10 NEGATIVE CONTROL (${what}): the patch hits the product source`, hit);
      if (!hit) continue;
      const f = path.join(dir, `reset-credit.${what.replace(/\W+/g, '-')}.js`); fs.writeFileSync(f, src.replace(from, to));
      let red = [];
      try { red = rows10(require(f)).filter(([, good]) => !good).map(([n]) => n); } catch (e) { red = ['threw: ' + e.message]; }
      ok(`§10 NEGATIVE CONTROL (${what}): the table goes red on "${row}"`, red.includes(row), red.join(' | ') || 'all green');
    }
    fs.rmSync(dir, { recursive: true, force: true });
  }
  // WIRING: both carriers call the ONE table; the seam is true; the auto rung never asks for the read
  { const eng = fs.readFileSync(path.join(REPO, 'src/server/usage-pool-engine.js'), 'utf8').split('\n').map((l) => l.replace(/(^|\s)\/\/.*$/, '')).join('\n');
    const helperBody = eng.slice(eng.indexOf('function writeResetCreditViaHelper('), eng.indexOf('function judgeReadFirst('));
    const sessionBody = eng.slice(eng.indexOf('function answerReadBeforePress('), eng.indexOf('function onResetCreditHelperDone('));
    ok('§10 WIRING: readBeforePress() is TRUE (the owner\'s yes), the helper\'s read-first and the wrapper\'s (answerReadBeforePress) both judge through resetCredit.preConsumeVerdict → judgeReadFirst, and only a USER origin asks the wrapper to read first', /function readBeforePress\(\) \{ return true; \}/.test(eng) && (helperBody.match(/resetCredit\.preConsumeVerdict\(/g) || []).length === 2 && (sessionBody.match(/resetCredit\.preConsumeVerdict\(/g) || []).length === 1 && /judgeReadFirst\(t, resetCredit\.preConsumeVerdict\(/.test(helperBody) && /const go = judgeReadFirst\(t, v,/.test(sessionBody) && /const rf = readFirst === true && origin === 'user' && readBeforePress\(\) && wrapperReadsFirst\(session\);/.test(eng) && !/function resetCreditRung\([\s\S]{0,6000}readFirst: true/.test(eng));
    const wrapper = fs.readFileSync(path.join(REPO, 'data/bin/codex-chat-wrapper.js'), 'utf8');
    ok('§10 WIRING: the wrapper advertises resetCreditReadFirst, reads before the consume only on the verb\'s readFirst, pushes it `beforeReset` with the key, waits for codex-reset-credit-go and never consumes on go:false or no verdict', /resetCreditReadFirst: true/.test(wrapper) && /if \(msg\.readFirst === true\) \{/.test(wrapper) && /beforeReset: true, idempotencyKey \}\)/.test(wrapper) && /msg\.type === 'codex-reset-credit-go'/.test(wrapper) && /if \(!verdict\.go\) \{[\s\S]{0,600}emitTaskEvent\('reset_credit_result', \{ skipped: true/.test(wrapper) && /why: 'no-verdict'/.test(wrapper));
  }
}

console.log(`\n${fail ? fail + ' FAILED' : 'ALL PASS'} (${pass})`);
process.exit(fail ? 1 : 0);
