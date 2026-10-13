#!/usr/bin/env node
// A STORED MESSAGE KEEPS LEARNING — PURE (lane channel-record-revisions, owner 2026-10-13: userW recalled a Lark message
// and VibeSpace never marked it). The fold, the record's `rv` line, the recheck PLAN (cadence, budget, the 24 h / 7 d
// windows, woken-for first), the capability row per adapter (`how: none` legs), the registry's normalizing wrapper,
// the agent's words — each with a RED control. The chrome legs: scripts/test-channel-revisions-ui.mjs (heavy).
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const Rev = require(path.join(REPO, 'src/channel-revisions.js'));
const R = require(path.join(REPO, 'src/channel-record.js'));
const CH = require(path.join(REPO, 'src/channels/index.js'));
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? '\n    ' + e : '')); } };
const J = (x) => JSON.stringify(x);
const H = 3600e3, T = 1_800_000_000_000;

console.log('① the fold: the record is the ORIGINAL, every version kept');
const rec = { vendorId: 'm1', at: T - 5 * 60e3, text: 'first words' };
const rv = (editedAt, text, extra = {}) => R.validateSide({ k: 'rv', msg: 'm1', at: editedAt + 10, src: 'recheck', editedAt, text, ...extra }).side;
const vs = Rev.foldVersions(rec, [rv(T - 60e3, 'third words'), rv(T - 120e3, 'second words'), rv(T - 90e3, 'second words')]);
ok(vs.map((v) => v.text).join('|') === 'first words|second words|third words' && vs[0].original === true && rec.text === 'first words', 'oldest → newest, the original first (a repeat of the previous text dropped); the record object is never touched', J(vs));
ok(Rev.foldVersions(rec, []).length === 1 && Rev.foldVersions(rec, [{ k: 'fx', msg: 'm1' }]).length === 1, 'no rv line = one version (the original)');
const fx = (at, facts) => R.validateSide({ k: 'fx', msg: 'm1', at, src: 'recheck', facts }).side;
ok(Rev.recalledAtOf([fx(T - 30e3, Rev.recallFacts()), fx(T - 10e3, Rev.recallFacts()), fx(T - 50e3, Rev.editFacts(T - 60e3))]) === T - 30e3 && Rev.recalledAtOf([fx(T, Rev.editFacts(T))]) === null, 'recalledAt = the EARLIEST recall learned; an edit is no recall');
ok(Rev.editedAtOf(Rev.editFacts(T - 5)) === T - 5 && Rev.editedAtOf([]) === 0, 'editedAtOf reads the folded edit instant');
// RED control: a fold that overwrote the original (the newest text in place of the record's) is caught by the same check
const overwrite = (r, xs) => [{ at: r.at, text: xs.length ? xs[xs.length - 1].text : r.text, original: true }];
ok(overwrite(rec, [rv(T - 60e3, 'third words')])[0].text !== 'first words', 'RED CONTROL: an overwriting fold loses the original — the leg above would be red on it');

console.log('② the record\'s rv line');
const big = 'x'.repeat(9000);
const vb = R.validateSide({ k: 'rv', msg: 'm1', at: T, src: 'recheck', editedAt: T, text: big, blocks: [{ k: 'p', runs: [{ k: 't', text: big }] }] });
ok(vb.ok && !vb.side.blocks && vb.side.truncated === true && Buffer.byteLength(JSON.stringify(vb.side)) <= R.SIDE_LINE_MAX_BYTES, 'a version past the line bound drops its tree first, then cuts the text (truncated) — the line stays ≤ 8 KiB', J({ ok: vb.ok, bytes: vb.ok && Buffer.byteLength(JSON.stringify(vb.side)) }));
ok(!R.validateSide({ k: 'rv', msg: 'm1', at: T, src: 'recheck', text: 'x' }).ok && !R.validateSide({ k: 'rv', msg: 'm1', at: T, src: 'recheck', editedAt: T }).ok, 'a version without its instant or its text is refused by name', J([R.validateSide({ k: 'rv', msg: 'm1', at: T, src: 'recheck', text: 'x' }).code]));
ok(R.sideKey(rv(T - 60e3, 'a')) === R.sideKey(rv(T - 60e3, 'a')) && R.sideKey(rv(T - 60e3, 'a')) !== R.sideKey(rv(T - 61e3, 'a')), 'one version per instant (a re-learned edit is a no-op by its key)');
ok(R.SIDE_KINDS.includes('rv') && Rev.compactVersionLines(Array.from({ length: 30 }, (_, i) => rv(T - (30 - i) * 1000, `v${i}`))).length === Rev.VERSIONS_KEPT, `the store's trim keeps the newest ${Rev.VERSIONS_KEPT} versions`);

console.log('③ the recheck plan');
const it = (key, at, o = {}) => ({ key, at, ...o });
const items = [it('c\na', T - 2 * H), it('c\nb', T - 23 * H), it('c\nold', T - 25 * H), it('c\nwoke', T - 3 * 24 * H, { wokeAt: T - 2 * 24 * H }), it('c\nwokeOld', T - 9 * 24 * H, { wokeAt: T - 8 * 24 * H }), it('c\ngone', T - H, { recalled: true })];
const p1 = Rev.planRecheck({ now: T, items });
ok(p1.join() === 'c\nwoke,c\na,c\nb'.replace(/\\n/g, '\n'), 'windows: < 24 h fresh, a woken-for message for 7 d (first), never past them; a recalled message is done', J(p1));
ok(Rev.planRecheck({ now: T, items, last: new Map([['c\na', T - 30 * 60e3]]) }).join() === ['c\nwoke', 'c\nb'].join(), 'cadence: at most one request per message per hour');
ok(Rev.planRecheck({ now: T, items, last: new Map([['c\na', T - 30e3]]), forced: true }).includes('c\na') && !Rev.planRecheck({ now: T, items, last: new Map([['c\na', T - 2e3]]), forced: true }).includes('c\na'), `the owner's Refresh re-asks after ${Rev.RECHECK_FORCED_MS / 1000} s (never a flood)`);
const many = Array.from({ length: 50 }, (_, i) => it(`c\nm${i}`, T - i * 60e3));
ok(Rev.planRecheck({ now: T, items: many }).length === Rev.RECHECK_PER_PASS && Rev.planRecheck({ now: T, items: many, spent: Array(Rev.RECHECK_PER_HOUR - 3).fill(T - 60e3) }).length === 3 && Rev.planRecheck({ now: T, items: many, spent: Array(Rev.RECHECK_PER_HOUR).fill(T - 60e3) }).length === 0, `budget: ≤ ${Rev.RECHECK_PER_PASS} a pass, ≤ ${Rev.RECHECK_PER_HOUR} an account-hour (the sliding hour)`);
ok(Rev.planRecheck({ now: T, items: many, spent: Array(Rev.RECHECK_PER_HOUR).fill(T - H - 1) }).length === Rev.RECHECK_PER_PASS, 'spent instants older than the hour free their room');
// RED control: a plan without the hour gap asks the same message every pass
const noGap = (o) => Rev.planRecheck({ ...o, last: new Map() });
ok(noGap({ now: T, items, last: new Map([['c\na', T - 60e3]]) }).includes('c\na'), 'RED CONTROL: a plan that ignores `last` re-asks a message a minute later — the cadence leg is red on it');

console.log('④ the capability row per adapter');
const mods = { lark: require(path.join(REPO, 'src/channels/lark.js')), slack: require(path.join(REPO, 'src/channels/slack.js')), gmail: require(path.join(REPO, 'src/channels/gmail.js')), webhook: require(path.join(REPO, 'src/channels/webhook.js')), agents: require(path.join(REPO, 'src/channels/agents.js')) };
const rowOf = (m) => CH.revisionsOf((m.adapter || m).caps);
ok(J(rowOf(mods.lark)) === J({ recall: true, edit: true, how: 'byid' }) && J(rowOf(mods.slack)) === J({ recall: true, edit: true, how: 'absent' }), 'Lark answers by id; Slack by absence (a deleted message vanishes)');
ok(['gmail', 'webhook', 'agents'].every((k) => rowOf(mods[k]).how === 'none' && !rowOf(mods[k]).recall && !rowOf(mods[k]).edit), 'Gmail / webhook / agents: revisions none — nothing is rechecked');
ok(CH.revisionsOf({}).how === 'none' && !CH.METHOD_GATES.revisionOf({}) && CH.METHOD_GATES.revisionOf({ revisions: { recall: true, edit: false, how: 'absent' } }), 'a missing row fails closed (none); the method is declared by the row');
const bad = (rv2) => { try { CH.validateCaps('webhook', { ...(mods.webhook.adapter || mods.webhook).caps, revisions: rv2 }); return null; } catch (e) { return e.message; } };
ok(/how must be/.test(bad({ recall: true, edit: true, how: 'poll' }) || '') && /never be learned/.test(bad({ recall: true, edit: false, how: 'none' }) || '') && /learns nothing/.test(bad({ recall: false, edit: false, how: 'byid' }) || ''), 'a broken row is refused by name at load', J([bad({ how: 'poll', recall: true, edit: true })]));

console.log('⑤ the registry wrapper normalizes the answer');
const mkMod = (answer, revisions = { recall: true, edit: true, how: 'byid' }) => {
  const base = (mods.webhook.adapter || mods.webhook);
  return { ...base, kind: 'rv-test', caps: { ...base.caps, kind: 'rv-test', revisions }, create: (rec, deps) => ({ ...base.create(rec, deps), revisionOf: async () => answer }) };
};
const wrap = async (answer, revisions) => { const reg = CH.createChannelRegistry(); const m = mkMod(answer, revisions); reg.register(m); const a = reg.create('rv-test', { id: 'rv-test', options: {} }, { now: () => T, log: { warn() {}, log() {} } }); return a.revisionOf('c', { messageId: 'm1' }); };
const w1 = await wrap({ state: 'edited', editedAt: T, text: 'new', blocks: 'nope', extra: 'x' });
const w2 = await wrap({ state: 'edited', editedAt: 'soon', text: 'new' });
const w3 = await wrap({ state: 'bogus' });
const w4 = await wrap({ state: 'recalled' }, { recall: false, edit: true, how: 'byid' });
ok(J(w1) === J({ state: 'edited', editedAt: T, text: 'new', blocks: null }) && w2.state === 'unknown' && w3.state === 'unknown' && w4.state === 'unknown', 'closed states, a finite time or no edit, no stray field, a recall the row does not declare is unknown', J([w1, w2, w3, w4]));

console.log('⑥ the agent\'s words');
const line = Rev.agentRevisionLine({ recalledAt: T, versions: [{}, {}, {}] }, { iso: () => 'T' });
ok(line === '[recalled at T — the content below is the kept copy] [edited: v3 of 3; --versions shows all]' && Rev.agentRevisionLine({}) === '', 'recalled over the kept content; edited with the --versions hint; nothing learned = no line', line);
const note = Rev.recallNoteText({ account: 'Lark', conversation: 'Ops', at: T }, { iso: () => 'T' });
ok(/woken for at T \(Lark \/ Ops\) was recalled/.test(note) && !/\n/.test(note), 'the ONE next-turn note: our words, the time, the place — one line', note);

console.log(fail ? `\nFAILED (${pass} passed, ${fail} failed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
