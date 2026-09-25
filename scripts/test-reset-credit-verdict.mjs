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
  ok('AUTO consumes through the spend ceiling, and charges the slot it authorized',
    /spendGuard\.authorize\(\{ reason: 'codex-reset-credit'[^\n]*identity: key \? \{ key, name: nameOf\(key\) \|\| key \} : null \}\)[\s\S]{0,3000}session\.pty\.write\(JSON\.stringify\(\{ type: 'codex-reset-credit' \}\)[\s\S]{0,300}spendGuard\.note\(\{ reason: 'codex-reset-credit', session, identity: av && av\.identity/.test(eng));
  ok('ASK files ONE For-you action item with an i18n structure and a reset-credit action payload',
    /if \(mode === 'ask'\) \{[\s\S]{0,300}if \(session\._resetCreditAsked === eventKey\) return 'skipped';\s*\n\s*session\._resetCreditAsked = eventKey;[\s\S]{0,900}todos\.add\(sessionKey, \{[\s\S]{0,600}kind: 'action'[\s\S]{0,300}i18n: \{ text: \{ key: i18nKey\('Use a stored reset credit on \{account\}\?'\)[\s\S]{0,200}action: \{ type: 'reset-credit', sessionId: session\._webuiId/.test(eng));
  ok('the pool alternative never counts a pay-per-use (usage credits) member', /return !!\(d && d\.to && !d\.toCredits\);/.test(eng));
  ok('the pool DEFAULT keeps the proactive warm hold but computes NO inTurn (the soft hold is dropped, §8 ③)',
    /const w = warmCache\(\{ lastActivityMs: s\._lastPtyDataAt, nowMs: now, model: cacheModelFor\(s\) \}\);\s*\n\s*if \(!w\.warm\) continue;/.test(eng)
    && !/inTurn: conversationInTurn\(\{ isStreaming: s\._isStreaming, turnState: s\._turnState \}\)/.test(eng)
    && !/':default:soft'/.test(eng) && /':default'\); return; \}/.test(eng));
  for (const f of ['src/message-manager.js', 'src/codex-message-manager.js']) {
    const m = strip(f);
    ok(`${f}: injectPeerCard carries a sanitized resetCredit offer (offerOf)`, /injectPeerCard\(\{[^}]*resetCredit = null \}\)/.test(m) && /const rc = offerOf\(resetCredit\);\s*\n\s*if \(rc\) msg\.resetCredit = rc;/.test(m));
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
    /notify: \(id, s, text, extra\) => \{ try \{ feedPeerCard\(s, \{ fromName: 'VibeSpace', text, \.\.\.\(extra && extra\.resetCredit \? \{ resetCredit: extra\.resetCredit \} : \{\}\) \}\); \} catch \{ \} \}, resetCreditOffer: \(id, s\) => \{ try \{ return resetCreditOffer\(s\); \}/.test(srv)
    && /usageCacheKeyFor, resetCreditOffer,/.test(srv));
  const cq = require(path.join(REPO, 'src/harnesses/codex-quota.js'));
  const clq = require(path.join(REPO, 'src/harnesses/claude-quota.js'));
  ok('the harness quota sources declare the credit semantics (codex re-opens = openai; claude refills = anthropic)', cq.resetCreditVendor === 'openai' && clq.resetCreditVendor === 'anthropic' && RC.VENDORS.includes(cq.resetCreditVendor));
  const { capsOf } = require(path.join(REPO, 'src/backend-caps.js'));
  ok('…while only codex has the capability to spend one (claude: interactive /limit-reset only)', capsOf('codex').resetCredit === true && capsOf('claude').resetCredit === false);
}

console.log(`\n${fail ? fail + ' FAILED' : 'ALL PASS'} (${pass})`);
process.exit(fail ? 1 : 0);
