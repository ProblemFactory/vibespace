#!/usr/bin/env node
// LANE AGENT-WATCH-PARITY (the owner, 2026-10-07: "看一下这些通知功能有关的配置和参数是不是 agent 也能调用"; fast, PURE):
// src/channel-watch-spec.js — the agent's `vibespace-channels watch` flags = the Notify… dialog's grammar, judged by the
// dialog's own validators (channel-filter.js). ① every flag ⇒ the row; ② every refusal by name; ③ `--spec` round trip;
// ④ a regex refusal = regexVerdict's own code + words; ⑤ the dialog's verdict = the agent's (no second schema); ⑥ THE KIND
// CENSUS: every RULE_KINDS entry has a flag or a named "not offered" reason (a new kind in the dialog without a CLI flag
// is RED); ⑦ the manual names every flag. CONTROL (scripts/mutant-copy.mjs): a validateRule whose regex skips the judge
// lets `--regex "(a+)+"` through — ④ goes red.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { mutantCopies } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? '\n    ' + String(e).slice(0, 500) : '')); } };
const F = require(path.join(REPO, 'src/channel-filter.js'));
const WS = require(path.join(REPO, 'src/channel-watch-spec.js'));
const MUT = mutantCopies('chan-watch-spec', REPO);
const J = (x) => JSON.stringify(x);

console.log('① every flag ⇒ the row the dialog saves');
const ROWS = [
  [[], { delivery: 'next-turn', notify: 'wake', mode: 'all', dailyWakeCap: F.DEFAULT_DAILY_WAKE_CAP }],
  [['--mode', 'wake'], { delivery: 'wake', notify: 'wake', mode: 'all' }],
  [['--mode', 'digest', '--digest-minutes', '60'], { delivery: 'wake', notify: 'digest', digestMinutes: 60 }],
  [['--keyword', 'deploy, incident'], { mode: 'filtered', rules: [{ kind: 'keyword', value: 'deploy' }, { kind: 'keyword', value: 'incident' }] }],
  [['--regex', '^deploy v\\d+'], { rules: [{ kind: 'regex', value: '^deploy v\\d+' }] }],
  [['--mention', '@Worker'], { rules: [{ kind: 'mention', value: 'Worker' }] }],
  [['--from', 'a@x.io,b@x.io'], { rules: [{ kind: 'from-address', value: 'a@x.io' }, { kind: 'from-address', value: 'b@x.io' }] }],
  [['--subject', 'Invoice, March'], { rules: [{ kind: 'subject', value: 'Invoice, March' }] }],
  [['--sender-in-group', 'ou_1,ou_2'], { rules: [{ kind: 'sender-in-group', members: ['ou_1', 'ou_2'], label: null }] }],
  [['--has-attachment'], { rules: [{ kind: 'has-attachment' }] }],
  [['--not-contains', 'bot'], { rules: [{ kind: 'not-contains', value: 'bot' }] }],
  [['--time-window', '09:00-18:00', '--tz-offset', '480'], { rules: [{ kind: 'time-window', from: '09:00', to: '18:00', tzOffsetMinutes: 480 }] }],
  [['--reply-to-mine'], { rules: [{ kind: 'reply-to-mine' }] }],
  [['--in-thread-with-me'], { rules: [{ kind: 'in-thread-with-me' }] }],
  [['--has-attachment', '--from', 'a@x.io', '--match', 'every'], { match: 'every', rules: [{ kind: 'has-attachment' }, { kind: 'from-address', value: 'a@x.io' }] }],
  [['--cap', '5', '--why', 'on call'], { dailyWakeCap: 5, why: 'on call' }],
];
const OKS = [];
for (const [argv, want] of ROWS) {
  const r = WS.watchSpecFromArgs(argv);
  const s = r.spec || {};
  const bad = [];
  for (const [k, v] of Object.entries(want)) {
    if (k === 'rules') { if (J(s.filter && s.filter.rules) !== J(v)) bad.push(`rules ${J(s.filter && s.filter.rules)}`); }
    else if (k === 'match') { if (!s.filter || s.filter.match !== v) bad.push('match'); }
    else if (J(s[k]) !== J(v)) bad.push(`${k}=${J(s[k])}`);
  }
  if (want.rules && s.mode !== 'filtered') bad.push('mode');
  ok(r.ok && !bad.length, `${argv.join(' ') || '(no flag)'} ⇒ ${want.rules ? want.rules.map((x) => x.kind).join(' + ') : J(want)}`, J(r) + ' ' + bad.join(', '));
  if (r.ok) OKS.push(r.spec);
}
// the row passes the DIALOG's own watcher validator as the dialog sends it (an inline filter = filterId 'inline')
ok(OKS.length === ROWS.length && OKS.every((s) => F.validateWatchers([{ principal: { kind: 'agent', id: 'a1' }, ...s, ...(s.filter ? { filterId: 'inline' } : {}) }], [{ principal: { kind: 'agent', id: 'a1' } }]).ok && (!s.filter || F.validateFilter(s.filter).ok)),
  'every row the flags make passes validateWatchers + validateFilter exactly as the Notify dialog saves it');

console.log('② every refusal by name (the validator\'s own code + words where it is the validator\'s)');
const kindsNow = F.RULE_KINDS.includes('reply-to-sent');
const REFUSALS = [
  [['--bogus'], 'unknown-flag'], [['stray'], 'unknown-flag'], [['--mode', 'later'], 'bad-mode'], [['--digest-minutes', '9'], 'digest-minutes-without-digest'],
  [['--cap', '-1'], 'bad-watcher'], [['--cap', 'x'], 'bad-watcher'], [['--mention'], 'value-required'], [['--keyword', ''], 'value-required'],
  [['--regex', '(a+)+'], 'regex-nested-quantifier'], [['--regex', '(?=x)y'], 'regex-lookaround'], [['--time-window', '9-18'], 'time-format'],
  [['--time-window', '09:00-18:00,mon'], 'time-window-days'], [['--tz-offset', '60'], 'tz-without-window'], [['--time-window', '09:00-10:00', '--tz-offset', '9999'], 'tz-range'],
  [['--match', 'every'], 'match-without-rules'], [['--keyword', 'a', '--match', 'most'], 'bad-match'], [['--cap', '1', '--cap', '2'], 'flag-twice'],
  [['--spec', '{'], 'bad-spec'], [['--spec', '[1]'], 'bad-spec'], [['--spec', '{}', '--keyword', 'a'], 'spec-alone'],
  [['--spec', J({ filter: { rules: [{ kind: 'bogus' }] } })], 'bad-kind'], [['--spec', J({ notify: 'digest', delivery: 'next-turn' })], 'digest-is-a-wake'],
  [['--spec', J({ mode: 'filtered' })], 'not-an-object'], [['--spec', J({ notify: 'loud' })], 'bad-watcher'], [['--spec', J({ notify: 'digest', dailyWakeCap: 0 })], 'bad-watcher'],
  [['--spec', J({ filter: { rules: Array.from({ length: 51 }, () => ({ kind: 'has-attachment' })) } })], 'too-many-rules'],
  ...(kindsNow ? [] : [[['--reply-to-sent'], 'not-on-this-version']]),
];
for (const [argv, code] of REFUSALS) {
  const r = WS.watchSpecFromArgs(argv);
  ok(!r.ok && r.code === code && typeof r.error === 'string' && r.error.length > 8, `${argv.join(' ').slice(0, 70)} ⇒ refused ${code}`, J(r));
}
{ const r = WS.watchSpecFromArgs(['--keyword', '  ']); const d = F.validateRule({ kind: 'keyword', value: '  ' });
  ok(r.code === d.code && r.error === d.error && r.flag === '--keyword', 'a refusal of a rule = the dialog validator\'s code AND words, plus the flag that made it', J(r)); }

console.log('③ --spec carries the whole row and round-trips');
let rt = 0;
for (const s of OKS) { const back = WS.watchSpecFromArgs(['--spec', J(s)]); if (back.ok && J(back.spec) === J(s)) rt++; }
ok(rt === OKS.length, `every row of ① → --spec JSON → the same row (${rt}/${OKS.length})`);
ok(WS.watchSpecFromArgs(['--spec', J({ notify: 'digest' }), '--why', 'w']).spec.why === 'w' && WS.watchSpecFromArgs(['--spec', J({ notify: 'digest' })]).spec.delivery === 'wake', '--why may stand beside --spec; a digest row is a billed (wake) delivery');

console.log('④ a regex refusal is regexVerdict\'s own (the judge notify-rules-r2 built)');
const PATS = ['(a+)+', '(a|ab)*', '\\d+\\d*', '.*.*', '(?=x)y', '(?<!x)y', '(a)\\1', 'a*', '\\w+@x', '[', 'x'.repeat(300), '^ok$', 'deploy (v\\d+)'];
function regexLeg(W2) {
  let same = 0;
  for (const p of PATS) { const r = W2.watchSpecFromArgs(['--regex', p]); const v = F.regexVerdict(p); const d = F.validateRule({ kind: 'regex', value: p }); if (r.ok === v.ok && (v.ok || (r.code === v.code && r.error === d.error))) same++; }   // the words = the dialog's path (validateRule cuts at 257 first)
  return same;
}
const same = regexLeg(WS);
ok(same === PATS.length && PATS.filter((p) => !F.regexVerdict(p).ok).length >= 9, `--regex "p" ⇒ exactly regexVerdict(p) for ${same}/${PATS.length} patterns (${PATS.filter((p) => !F.regexVerdict(p).ok).length} refused by name)`);
{ const fsrc = fs.readFileSync(path.join(REPO, 'src/channel-filter.js'), 'utf8');
  const cut = fsrc.replace("      const rv = regexVerdict(v);\n      if (!rv.ok) return rv;", "      const rv = { ok: true, source: v };");
  const fAbs = MUT.write('src/channel-filter.js', cut, 'nojudge');
  const wsrc = fs.readFileSync(path.join(REPO, 'src/channel-watch-spec.js'), 'utf8');
  const W2 = MUT.load('src/channel-watch-spec.js', wsrc.replace("require('./channel-filter.js')", `require(${J(fAbs)})`), 'nojudge');
  const r = W2.watchSpecFromArgs(['--regex', '(a+)+']);
  ok(cut !== fsrc && r.ok && regexLeg(W2) < PATS.length, `CONTROL: --regex without the judge accepts "(a+)+" — ④ is red (${regexLeg(W2)}/${PATS.length})`, J(r)); }

console.log('⑤ the dialog\'s verdict = the agent\'s (one schema)');
const FILTERS = [
  { rules: [{ kind: 'keyword', value: 'x' }] }, { match: 'every', rules: [{ kind: 'regex', value: '^a' }, { kind: 'has-attachment' }] }, { rules: [] }, { match: 'some', rules: [{ kind: 'keyword', value: 'x' }] },
  { rules: [{ kind: 'mention', value: '@@' }] }, { rules: [{ kind: 'sender-in-group', members: [] }] }, { rules: [{ kind: 'time-window', from: '25:00', to: '01:00' }] },
  { rules: [{ kind: 'regex', value: '(a+)+' }] }, { rules: [{ kind: 'nope' }] }, ...F.RULE_KINDS.map((kind) => ({ rules: [{ kind, value: 'v', members: ['m'], from: '09:00', to: '10:00' }] })),
];
let agree = 0;
for (const f of FILTERS) { const d = F.validateFilter(f); const a = WS.specVerdict({ filter: f }); if (d.ok === a.ok && (d.ok ? J(a.spec.filter.rules) === J(d.filter.rules) : a.code === d.code && a.error === d.error)) agree++; }
ok(agree === FILTERS.length, `validateFilter and the agent's door agree on ${agree}/${FILTERS.length} filters (every kind, every refusal)`);
{ const src = fs.readFileSync(path.join(REPO, 'src/channel-watch-spec.js'), 'utf8').replace(/\/\/.*$/gm, '');
  const own = (src.match(/'(mention|keyword|regex|sender-in-group|from-address|subject|has-attachment|not-contains|time-window|reply-to-mine|in-thread-with-me)'/g) || []).length;
  ok(/F\.validateFilter\(/.test(src) && /F\.validateWatcher\(/.test(src) && !/RULE_KINDS\s*=/.test(src) && !/new RegExp/.test(src), `the grammar judges with channel-filter's validators and holds no kind list or regex of its own (${own} kind names = the flag table's own rows)`); }
{ const legacy = WS.watchSpecOfBody({ delivery: 'wake', keywords: ['outage'], dailyWakeCap: 5, why: 'w' });
  ok(legacy.ok && legacy.spec.delivery === 'wake' && J(legacy.spec.filter.rules) === J([{ kind: 'keyword', value: 'outage' }]) && legacy.spec.dailyWakeCap === 5 && WS.watchSpecOfBody({ delivery: 'bogus' }).code === 'bad-mode' && WS.watchSpecOfBody({}).spec.delivery === 'next-turn',
    'the pre-parity body (an older CLI on another machine: delivery + keywords) goes through the same judge; no flag = next-turn (free)'); }

console.log('⑥ THE KIND CENSUS: every rule kind the dialog offers has a CLI flag (or a named reason)');
const census = (kinds, flags, notOffered) => ({ missing: kinds.filter((k) => !flags.some((x) => x.kind === k) && !(notOffered[k] && String(notOffered[k]).length > 8)), stale: flags.filter((x) => !kinds.includes(x.kind) && !x.since).map((x) => x.kind) });
const c = census(F.RULE_KINDS, WS.RULE_FLAGS, WS.NOT_OFFERED);
ok(F.RULE_KINDS.length >= 11 && !c.missing.length && !c.stale.length, `${F.RULE_KINDS.length} kinds, each with a flag or a reason (missing: ${c.missing.join(',') || 'none'}; stale flags: ${c.stale.join(',') || 'none'})`);
ok(J(census([...F.RULE_KINDS, 'new-kind'], WS.RULE_FLAGS, WS.NOT_OFFERED).missing) === J(['new-kind']), 'CONTROL: a new kind in the dialog without a flag is named missing');
ok(new Set(WS.RULE_FLAGS.map((x) => x.flag)).size === WS.RULE_FLAGS.length && WS.RULE_FLAGS.every((x) => /^--[a-z-]+$/.test(x.flag)), 'one flag per kind, spelled --kebab');

console.log('⑦ the manual names every flag');
{ const man = fs.readFileSync(path.join(REPO, 'docs/agent/channels-manual.md'), 'utf8');
  const missing = [...WS.RULE_FLAGS.map((x) => x.flag), ...WS.OTHER_FLAGS, '--show'].filter((f) => !man.includes(f));
  ok(!missing.length && /vibespace-channels watches/.test(man), `docs/agent/channels-manual.md names every watch flag + watches${missing.length ? ' — missing ' + missing.join(' ') : ''}`); }

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
