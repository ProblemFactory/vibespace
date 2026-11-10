#!/usr/bin/env node
// test-agy-models-door — FAST (in-process; a /bin/sh STAND-IN `agy`, never the real binary — no vendor, no sign-in read).
// Lane agy-models-report (the owner 2026-11-10: «Antigravity 支持的模型为什么是写死的呀？不应该从 Antigravity 自己汇报吗？»):
// the models an Antigravity chat offers are what `agy models` reported FOR THAT ACCOUNT, asked only on a person's act.
//   ① THE PARSE (src/harnesses/antigravity-models.js): the measured 1.5.5 shape («Fetching available models...» + `<id>\t<label>`,
//      Gemini and non-Gemini, agy's order); the «Please sign in» line and an empty answer = signed-out; garbage = unreadable with
//      its first line, bounded; ids by ID_RE, labels ≤ 60 with no control character or markup, ≤ 200 rows, each once
//   ② THE DOOR (src/server/cli-models-door.js) with a fake clock: one call per opening, then the 6 h FLOOR; a FAILURE pauses
//      15 min (persisted across a restart); the explicit row sets both aside but keeps one a minute; a listing in flight is
//      shared; the CLI file changed (an update) ⇒ read again; a failure KEEPS the last good rows; the call runs in the
//      account's own HOME root (its empty login dir as cwd; the machine's own login: the hub's home), the ambient Gemini key
//      dropped; a HANG never holds a person's menu (it answers at once with the last rows) nor the floor (killed at the
//      timeout, the slot freed, paced like any failure); a 10 MB answer cut at 64 KiB; the cache (data/cli-models.json, 0600) never holds
//      a value of the sign-in — STDOUT ONLY (a row printed on stderr is never read); an account removed takes its entry
//   ③ E1 — THE ROUTES (src/routes/provider-models.js on a loopback express app): a GET NEVER lists (a plain GET, a stale
//      `list=open` GET, a page reload, the re-read after the door's own dirty push — in a loop); the OPENING is
//      POST /api/cli-models/open from a person's page; 10 openings against a signed-out account ⇒ ONE call; an agent's bearer
//      and another site ⇒ 403 with nothing asked; a harness that does not report ⇒ 400, nothing asked; another machine ⇒ the
//      shipped list and says so; the menu = exactly the reported rows (agy's order and labels) under the Default row, per
//      account; before any report the shipped rows; the explicit row 429 + Retry-After inside the minute
//   ④ THE WORDS (src/lib/cli-models-words.js): every state's one line + its door, en / zh / ja keys present
//   ⑤ E2 + THE CALLERS' CENSUS: the cache is in no export section and no sync; the door is created once; `modelsDoor.ask(` is
//      reached only from the person-gated POST doors — a call PLANTED on a timer, at boot, per spawn, from a GET, without
//      the person gate, or in a brand-new file is RED by its name (the census reads EVERY file of src/)
//   ⑥ NEGATIVE CONTROLS (patched copies outside the tree): no floor / no failure floor / stderr read / no timeout kill — each RED
//      by its leg's name
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { spawn as spawnChild } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { PassThrough, Writable } from 'node:stream';
import { scratchDir } from './scratch.mjs';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (n, c, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (e !== undefined ? ' — ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 600) : '')); } };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
const TMP = scratchDir('agy-models-door');
process.on('exit', () => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { } });

const H = require(path.join(REPO, 'src/harnesses/index.js'));
const AGY = H.get('antigravity');
const P = require(path.join(REPO, 'src/harnesses/antigravity-models.js'));
const DOOR = require(path.join(REPO, 'src/server/cli-models-door.js'));

// ── the stand-in agy: every call logged (argv | cwd | HOME | the ambient key); the account's planted sign-in printed on STDERR ──
const BIN = path.join(TMP, 'bin');
fs.mkdirSync(BIN, { recursive: true });
const STUB = path.join(BIN, 'agy');
const STUB_SRC = `#!/bin/sh
D=${JSON.stringify(BIN)}
printf '%s|%s|%s|%s\\n' "$*" "$PWD" "$HOME" "\${GEMINI_API_KEY:-none}" >> "$D/calls.log"
cat "$HOME/.gemini/oauth_creds.json" >&2 2>/dev/null
mode=$(cat "$D/mode" 2>/dev/null)
case "$mode" in
  rows) cat "$D/rows.txt" ;;
  signed-out) printf 'Fetching available models...\\nError: Please sign in to view available models. Run agy to sign in.\\n' ;;
  empty) printf 'Fetching available models...\\n' ;;
  garbage) printf 'Fetching available models...\\n<html>oops</html>\\nmore\\n' ;;
  stderr-only) printf 'gemini-secret-row\\tSECRET-ROW\\n' >&2 ;;
  hang) exec sleep 30 ;;
  hang-short) exec sleep 0.6 ;;
  wait) while [ ! -e "$D/release" ]; do sleep 0.01; done; cat "$D/rows.txt" ;;
  big) awk 'BEGIN { for (i = 0; i < 600000; i++) printf "gemini-b-%d\\tB %d\\n", i, i }' ;;
  big-nonl) head -c 100000 /dev/zero | tr '\\000' 'a' ;;
  hang-fork) echo $$ > "$D/pid.sh"; sleep 30 & echo $! > "$D/pid.sleep"; wait ;;
  fork-rows) printf 'Fetching available models...\\nfk-1\\tForked One\\n'; (sleep 31) & echo $! > "$D/pid.bg"; exit 0 ;;
esac
`;
const writeStub = (extra = '') => { fs.writeFileSync(STUB, STUB_SRC + extra); fs.chmodSync(STUB, 0o755); };
writeStub();
// the answer agy 1.5.5 gave a signed-in account on 2026-11-10 — its SHAPE (16 rows, Gemini and non-Gemini, agy's order; the
// labels here are stand-ins: the drill pins what the door does with them, not Google's words)
const ROWS_155 = [
  ['gemini-4-carbon-medium', 'Gemini 4 Carbon (Medium)'], ['gemini-4-carbon-high', 'Gemini 4 Carbon (High)'], ['gemini-4-carbon-low', 'Gemini 4 Carbon (Low)'],
  ['gemini-4-argon-high', 'Gemini 4 Argon (High)'], ['gemini-4-argon-medium', 'Gemini 4 Argon (Medium)'], ['gemini-4-argon-low', 'Gemini 4 Argon (Low)'],
  ['gemini-3.8-flash-high', 'Gemini 3.8 Flash (High)'], ['gemini-3.8-flash-medium', 'Gemini 3.8 Flash (Medium)'], ['gemini-3.8-flash-low', 'Gemini 3.8 Flash (Low)'],
  ['claude-opus-5-5-high', 'Claude Opus 5.5 (High)'], ['claude-opus-5-5-medium', 'Claude Opus 5.5 (Medium)'], ['claude-opus-5-5-low', 'Claude Opus 5.5 (Low)'],
  ['claude-sonnet-5-5-high', 'Claude Sonnet 5.5 (High)'], ['claude-sonnet-5-5-medium', 'Claude Sonnet 5.5 (Medium)'], ['claude-sonnet-5-5-low', 'Claude Sonnet 5.5 (Low)'],
  ['gpt-oss-120b-medium', 'GPT-OSS 120B (Medium)'],
];
const ANSWER_155 = 'Fetching available models...\n' + ROWS_155.map(([i, l]) => `${i}\t${l}`).join('\n') + '\n';
fs.writeFileSync(path.join(BIN, 'rows.txt'), ANSWER_155);
const setMode = (m) => fs.writeFileSync(path.join(BIN, 'mode'), m);
const calls = () => { try { return fs.readFileSync(path.join(BIN, 'calls.log'), 'utf8').split('\n').filter(Boolean).map((l) => { const [argv, cwd, home, key] = l.split('|'); return { argv, cwd, home, key }; }); } catch { return []; } };

// ── the accounts: two named Antigravity accounts (each its HOME root, a planted sign-in), a Claude one; the machine's login ──
const SIGN_IN = ['ya', '29.PLANTED-SIGN-IN-VALUE-'].join('') + 'q'.repeat(24); // built at runtime: no token shape in the tree
const ACC = {};
const home = (id) => path.join(TMP, 'homes', id);
for (const id of ['agy-aaaaaaaaaaaa', 'agy-bbbbbbbbbbbb']) {
  ACC[id] = { id, backend: 'antigravity', type: 'subscription', name: id === 'agy-aaaaaaaaaaaa' ? 'Work' : 'Home' };
  fs.mkdirSync(path.join(home(id), '.vibespace-login'), { recursive: true });
  fs.mkdirSync(path.join(home(id), '.gemini'), { recursive: true });
  fs.writeFileSync(path.join(home(id), '.gemini', 'oauth_creds.json'), JSON.stringify({ access_token: SIGN_IN }));
}
ACC['acct-claude00001'] = { id: 'acct-claude00001', backend: 'claude', type: 'api', name: 'Console' };
const MACHINE_HOME = path.join(TMP, 'machine-home');
fs.mkdirSync(MACHINE_HOME, { recursive: true });
const accounts = {
  get: (id) => ACC[id] || null,
  resolveForSpawn: (id) => { if (!ACC[id]) throw new Error('unknown'); return { localEnv: { HOME: home(id), DBUS_SESSION_BUS_ADDRESS: 'disabled:' } }; },
  poolMemberOfSession: () => null,
};

let T = Date.parse('2026-11-10T12:00:00Z');
const MIN = 60000, HOUR = 3600000;
// a person's act at the DOOR level — the drill stands in for the person gate (an injected verdict that says yes); the routes'
// legs below go through the REAL gate (personVerdict). The old door (017693b83, the RED controls) took a caller's flag
// instead of a press: ASK hands both, so one drill judges either tree.
// round 3 law 2: the maker returns { door, mint } — the mint is kept OUT of the door (here: beside it, in MINTS); the old
// door (the red controls) carried press() itself.
const MINTS = new WeakMap();
const ASK = (d, be, key, { refresh = false } = {}) => {
  const kind = refresh ? 'refresh' : 'open';
  const m = MINTS.get(d);
  const press = m ? (m({}, { backend: be, account: key || 'machine', kind }) || {}).press : (typeof d.press === 'function' ? (d.press({}, kind) || {}).press : undefined);
  return d.ask(be, key, { press, kind, person: true, explicit: refresh });
};
const makeDoor = (D, dataDir, extra = {}) => {
  const listed = [], logs = [];
  const made = D.createCliModelsDoor({ accounts, harnessOf: (id) => H.get(id), cliCmds: { check: async () => STUB, current: () => STUB }, dataDir, verdict: () => ({ ok: true }),
    agentEnv: () => ({ PATH: '/usr/bin:/bin', ['GEMINI_API' + '_KEY']: ['planted', 'ambient'].join('-') }), onListed: (e) => listed.push(e), now: () => T,
    log: (l) => logs.push(l), homeDir: () => MACHINE_HOME, ...extra });
  const door = made && made.door ? made.door : made;
  const mint = made && typeof made.mint === 'function' ? made.mint : null;
  if (mint) MINTS.set(door, mint);
  return { door, mint, listed, logs };
};
const cacheOf = (dataDir) => { try { return fs.readFileSync(path.join(dataDir, 'cli-models.json'), 'utf8'); } catch { return ''; } };

// ── ① the parse ───────────────────────────────────────────────────────────────────────────────────────────────
console.log('① the parse (agy models, stdout only)');
{
  const r = P.parseModelsAnswer({ code: 0, stdout: ANSWER_155 });
  ok('the measured 1.5.5 shape ⇒ 16 rows in agy\'s order with agy\'s labels — Gemini and non-Gemini ids (claude-*, gpt-oss-*) admitted; the «Fetching…» line dropped',
    r.verdict === 'rows' && eq(r.rows.map((x) => [x.id, x.label]), ROWS_155), r);
  const so = P.parseModelsAnswer({ code: 0, stdout: 'Fetching available models...\nError: Please sign in to view available models. Run agy to sign in.\n' });
  const em = P.parseModelsAnswer({ code: 0, stdout: 'Fetching available models...\n' });
  ok('the «Please sign in» line ⇒ signed-out (its words, bounded); an answer with no row at all ⇒ signed-out', so.verdict === 'signed-out' && /Please sign in/.test(so.why) && em.verdict === 'signed-out', [so, em]);
  const gb = P.parseModelsAnswer({ code: 0, stdout: 'Fetching available models...\n<html>' + 'x'.repeat(500) + '\nmore\n' });
  const ex = P.parseModelsAnswer({ code: 3, stdout: '' });
  ok('garbage ⇒ unreadable with its FIRST line, bounded (≤ 160); a failing exit with nothing ⇒ unreadable «exit 3»', gb.verdict === 'unreadable' && gb.why.startsWith('<html>') && gb.why.length <= P.WORDS_MAX && ex.verdict === 'unreadable' && ex.why === 'exit 3', [gb.why.length, ex]);
  const odd = P.parseModelsAnswer({ code: 0, stdout: ['Fetching available models...', 'Gemini Nice\tno id here', 'UPPER-id\tX', 'gemini-ok\t<b>bold</b>', 'gemini-ctl\tbad\u0007bell',
    'gemini-long\t' + 'L'.repeat(70), 'gemini-ok\tdup', '-leading-dash\tX', 'gemini-tab-less', 'gemini-fine\t  Fine  '].join('\n') });
  ok('the bounds: an id outside ID_RE skipped (spaces, upper case, a leading dash, no tab); markup / a control character ⇒ the row keeps its id as its label; a 70-character label cut to 60; a repeated id once',
    odd.verdict === 'rows' && eq(odd.rows.map((x) => [x.id, x.label]), [['gemini-ok', 'gemini-ok'], ['gemini-ctl', 'gemini-ctl'], ['gemini-long', 'L'.repeat(59) + '…'], ['gemini-fine', 'Fine']]), odd.rows);
  const many = P.parseModelsAnswer({ code: 0, stdout: Array.from({ length: 250 }, (_, i) => `gemini-m-${i}\tM ${i}`).join('\n') });
  ok('at most 200 rows (agy\'s first 200)', many.rows.length === 200 && many.rows[199].id === 'gemini-m-199');
  const bidi = P.parseModelsAnswer({ code: 0, stdout: 'gemini-x\t\u202Eevil\u202C label\ngemini-y\t\u2067\u200F\u061C\u2069\n' });
  ok('round 2 (smaller 2): a reported label DROPS the Unicode direction controls (U+202A–202E, U+2066–2069, U+200E/F, U+061C) — a vendor label never reorders what is drawn; one made of nothing else keeps its id',
    bidi.verdict === 'rows' && bidi.rows[0].label === 'evil label' && bidi.rows[1].label === 'gemini-y', bidi.rows);
  const SB = require(path.join(REPO, 'src/status-bar-facts.js'));
  const row = SB.statusBarOf(AGY.ui);
  ok('the WINDOW table is unchanged by a report (the CLI names no window): a reported Gemini row reads its documented window, a reported non-Gemini row «window unknown» (0) — never a guess',
    SB.windowOf(row, 'gemini-4-carbon-medium') === 1048576 && SB.windowOf(row, 'claude-opus-5-5-low') === 0 && SB.windowOf(row, 'gpt-oss-120b-medium') === 0 && !('windows' in (r.rows[0] || {})), [SB.windowOf(row, 'gemini-4-carbon-medium'), SB.windowOf(row, 'claude-opus-5-5-low')]);
}

// ── ② the door ────────────────────────────────────────────────────────────────────────────────────────────────
console.log('② the door (a fake clock; the stand-in agy)');
async function doorLegs(D, tag) {
  const res = [];
  const leg = (name, pass, detail) => res.push({ name, pass: !!pass, detail });
  const data = path.join(TMP, `data-${tag}`);
  fs.mkdirSync(data, { recursive: true });
  fs.rmSync(path.join(BIN, 'calls.log'), { force: true });
  writeStub();
  T = Date.parse('2026-11-10T12:00:00Z');
  const A = 'agy-aaaaaaaaaaaa', B = 'agy-bbbbbbbbbbbb';
  let { door, listed, logs } = makeDoor(D, data);
  const n0 = calls().length;
  leg('nothing runs when the door is made (never at boot)', calls().length === 0 && listed.length === 0);
  setMode('rows');
  const a1 = await ASK(door, 'antigravity', A);
  await door.pending('antigravity', A);
  const c1 = calls();
  leg('an opening ⇒ ONE `agy models` in the account\'s own HOME root (cwd = its empty login dir), the ambient Gemini key dropped; the completion said once (onListed)',
    a1.ok && a1.listing && a1.code === 'started' && c1.length === n0 + 1 && c1[0].argv === 'models' && c1[0].home === home(A) && c1[0].cwd === path.join(home(A), '.vibespace-login') && c1[0].key === 'none' && eq(listed, [{ backend: 'antigravity', account: A }]), [a1, c1, listed]);
  const r1 = door.report('antigravity', A), rB = door.report('antigravity', B);
  leg('the report = exactly agy\'s rows for THAT account (its order, its labels), listedAt the clock; another account has none', eq((r1.rows || []).map((x) => [x.id, x.label]), ROWS_155) && r1.listedAt === T && !r1.lastError && r1.by === 'Antigravity' && rB.rows === null, [r1, rB]);
  await door._flush();
  const disk = cacheOf(data);
  const st = fs.statSync(path.join(data, 'cli-models.json'));
  leg('the cache = data/cli-models.json, 0600, schema 1 by harness and account — and NO value of the sign-in anywhere in it (stdout only)', (st.mode & 0o777) === 0o600 && JSON.parse(disk).schema === 1 && JSON.parse(disk).harnesses.antigravity[A].rows.length === 16 && !disk.includes('PLANTED') && !disk.includes('ya29'), (st.mode & 0o777).toString(8));
  leg('the journal names the account and the row count only — never a row, never the sign-in', logs.some((l) => l === `[cli-models] antigravity ${A}: 16 rows`) && !logs.join('\n').match(/gemini-4|Carbon|PLANTED|ya29/), logs);
  // the floor
  T += 1 * HOUR;
  const f1 = await ASK(door, 'antigravity', A);
  T += 5 * HOUR - 1;
  const f2 = await ASK(door, 'antigravity', A);
  leg('the FLOOR: openings inside 6 h ask nothing (code floor, nextAt named)', !f1.listing && f1.code === 'floor' && !f2.listing && f2.code === 'floor' && f2.nextAt === Date.parse('2026-11-10T18:00:00Z') && calls().length === n0 + 1, [f1, f2]);
  T += 2;
  const f3 = await ASK(door, 'antigravity', A);
  await door.pending('antigravity', A);
  leg('…past 6 h the next opening lists again', f3.listing && calls().length === n0 + 2, f3);
  // a version move
  writeStub('# another build\n');
  T += 1 * MIN;
  const v1 = await ASK(door, 'antigravity', A);
  await door.pending('antigravity', A);
  leg('the CLI file changed since (an update: size / mtime) ⇒ the next opening reads again whatever the floor says', v1.listing && calls().length === n0 + 3, v1);
  // the explicit row
  T += 1 * MIN;
  const e1 = await ASK(door, 'antigravity', A, { refresh: true });
  await door.pending('antigravity', A);
  const e2 = await ASK(door, 'antigravity', A, { refresh: true });
  T += 61 * 1000;
  const e3 = await ASK(door, 'antigravity', A, { refresh: true });
  await door.pending('antigravity', A);
  leg('the explicit row sets the floor aside but keeps one a minute (429 throttled, retryInMs named), then lists again', e1.listing && e2.status === 429 && e2.code === 'throttled' && e2.retryInMs === MIN && e3.listing && calls().length === n0 + 5, [e1, e2, e3]);
  // in flight
  setMode('wait');
  T += 7 * HOUR;
  fs.rmSync(path.join(BIN, 'release'), { force: true });
  const w = await Promise.all([ASK(door, 'antigravity', A), ASK(door, 'antigravity', A), ASK(door, 'antigravity', A, { refresh: true })]);
  fs.writeFileSync(path.join(BIN, 'release'), '');
  await door.pending('antigravity', A);
  leg('a listing in flight is SHARED: three acts at once ⇒ one call', w.every((x) => x.listing) && w.filter((x) => x.code === 'started').length === 1 && calls().length === n0 + 6, w);
  // a failure keeps the last good rows; the failure floor
  setMode('signed-out');
  T += 7 * HOUR;
  const s1 = await ASK(door, 'antigravity', A);
  await door.pending('antigravity', A);
  const rs = door.report('antigravity', A);
  leg('signed out ⇒ the last good rows KEPT, lastError signed-out with its words', s1.listing && (rs.rows || []).length === 16 && rs.lastError && rs.lastError.code === 'signed-out' && /Please sign in/.test(rs.lastError.words), rs);
  let tens = 0;
  for (let i = 0; i < 10; i++) { T += 1 * MIN; const x = await ASK(door, 'antigravity', A); if (x.listing) { tens++; await door.pending('antigravity', A); } }
  leg('10 openings against a signed-out account inside 15 min ⇒ ONE call (the failure floor)', tens === 0 && calls().length === n0 + 7, { tens, calls: calls().length - n0 });
  // a restart keeps the failure floor
  await door._flush();
  ({ door, listed, logs } = makeDoor(D, data));
  T += 1 * MIN;
  const rr = await ASK(door, 'antigravity', A);
  const rp = door.report('antigravity', A);
  leg('a RESTART keeps it: the cache read back (rows + lastError) and the failure floor still holds', !rr.listing && rr.code === 'failed-recently' && (rp.rows || []).length === 16 && rp.lastError.code === 'signed-out' && calls().length === n0 + 7, [rr, rp]);
  T += 15 * MIN;
  setMode('rows');
  const rb = await ASK(door, 'antigravity', A);
  await door.pending('antigravity', A);
  leg('…15 min after the failure an opening lists again; an answer clears lastError', rb.listing && !door.report('antigravity', A).lastError && calls().length === n0 + 8, rb);
  // stdout only
  setMode('stderr-only');
  T += 7 * HOUR;
  await ASK(door, 'antigravity', B);
  await door.pending('antigravity', B);
  await door._flush();
  const so = door.report('antigravity', B);
  leg('STDOUT ONLY: a row printed on stderr is never read (⇒ no row: signed-out) and nothing of stderr — the planted sign-in — reaches the cache', so.rows === null && so.lastError && so.lastError.code === 'signed-out' && !cacheOf(data).includes('SECRET') && !cacheOf(data).includes('PLANTED'), so);
  // the machine's own login
  setMode('rows');
  const m1 = await ASK(door, 'antigravity', '');
  await door.pending('antigravity', 'machine');
  const cm = calls().at(-1);
  leg('the machine\'s own login = the key «machine»: the agents\' env and the hub\'s home as cwd', m1.listing && cm.cwd === MACHINE_HOME && cm.key === 'none' && (door.report('antigravity', 'machine').rows || []).length === 16, [m1, cm]);
  // refusals
  const g1 = await door.ask('antigravity', A, {});
  const g2 = await ASK(door, 'claude', 'acct-claude00001');
  const g3 = await ASK(door, 'antigravity', 'acct-claude00001');
  const g4 = await ASK(door, 'antigravity', 'agy-nobody00000');
  leg('refused before anything runs: not a person (403), a harness that reports nothing (400), another harness\'s account / an unknown one (404)', g1.status === 403 && g2.status === 400 && g3.status === 404 && g4.status === 404 && calls().length === n0 + 10, [g1, g2, g3, g4]);
  // removal
  await door.forget(A);
  await door._flush();
  leg('an account removed takes its entry NOW (forget) — the cache no longer names it', !cacheOf(data).includes(A) && cacheOf(data).includes('machine'));
  delete ACC[B];
  T += 7 * HOUR;
  await ASK(door, 'antigravity', '');
  await door.pending('antigravity', 'machine');
  await door._flush();
  ACC[B] = { id: B, backend: 'antigravity', type: 'subscription', name: 'Home' };
  leg('…and ANY write drops an entry whose account is gone', !cacheOf(data).includes(B));
  return res;
}
const real = await doorLegs(DOOR, 'real');
for (const r of real) ok(r.name, r.pass, r.detail);

console.log('② the door\'s bounds (a hang, a flood)');
// THE HANG (a person's menu and the floor are never held by it): a good listing first, then agy never answers
async function hangLegs(D, tag, hangMode) {
  const res = [];
  const leg = (name, pass, detail) => res.push({ name, pass: !!pass, detail });
  const data = path.join(TMP, `data-hang-${tag}`);
  fs.mkdirSync(data, { recursive: true });
  const A = 'agy-aaaaaaaaaaaa';
  T += 24 * HOUR;
  setMode('rows');
  const { door: d0 } = makeDoor(D, data);
  await ASK(d0, 'antigravity', A);
  await d0.pending('antigravity', A);
  await d0._flush();
  const { door } = makeDoor(D, data, { timeoutMs: 150 });
  const n0 = calls().length;
  setMode(hangMode);
  T += 7 * HOUR;
  const h1 = await ASK(door, 'antigravity', A);
  const during = door.report('antigravity', A);
  const h2 = await ASK(door, 'antigravity', A);
  leg('WHILE agy hangs the menu answers AT ONCE: the last good rows + «listing» (the GET serves report(), it never waits); a second opening shares the hanging call',
    h1.code === 'started' && (during.rows || []).length === 16 && during.listing === true && h2.code === 'shared', { h1, h2, listing: during.listing });
  await door.pending('antigravity', A);
  const h = door.report('antigravity', A);
  leg('a CLI that never answers is KILLED at the timeout ⇒ lastError timeout, the last good rows kept, the slot freed — ONE call for both openings', h.lastError && h.lastError.code === 'timeout' && (h.rows || []).length === 16 && !h.listing && door.pending('antigravity', A) === null && calls().length === n0 + 1, { lastError: h.lastError, calls: calls().length - n0 });
  T += 1 * MIN;
  const f1 = await ASK(door, 'antigravity', A);
  leg('…the hang PACES like any failure: an opening inside 15 min asks nothing (failed-recently) — never a call per opening against a hanging agy', !f1.listing && f1.code === 'failed-recently' && calls().length === n0 + 1, f1);
  setMode('rows');
  const e1 = await ASK(door, 'antigravity', A, { refresh: true });
  await door.pending('antigravity', A);
  leg('…the explicit row asks again at once, and its answer clears the timeout', e1.code === 'started' && !door.report('antigravity', A).lastError && calls().length === n0 + 2, e1);
  return res;
}
for (const r of await hangLegs(DOOR, 'real', 'hang')) ok(r.name, r.pass, r.detail);
{
  setMode('big');
  const { door: d2 } = makeDoor(DOOR, path.join(TMP, 'data-big'));
  await ASK(d2, 'antigravity', 'agy-aaaaaaaaaaaa');
  await d2.pending('antigravity', 'agy-aaaaaaaaaaaa');
  const b = d2.report('antigravity', 'agy-aaaaaaaaaaaa');
  ok('a 10 MB answer from the CLI\'s own CHILD (it keeps the pipe): read to 64 KiB, the CLI killed AND the pipe let go, the cut line dropped ⇒ 200 whole rows', (b.rows || []).length === 200 && b.rows.every((x, i) => x.id === `gemini-b-${i}` && x.label === `B ${i}`), b.lastError || (b.rows || []).length);
}

// ── ② round 2: the seven laws' door half ───────────────────────────────────────────────────────────────────────────
const alive = (pid) => { try { const st = fs.readFileSync(`/proc/${pid}/stat`, 'utf8'); return !/^\d+ \(.*\) Z/.test(st); } catch { return false; } };
const pidIn = (n) => { try { return Number(fs.readFileSync(path.join(BIN, n), 'utf8').trim()) || null; } catch { return null; } };
const settled = async (pids) => { for (let i = 0; i < 400 && pids.some((p) => p && alive(p)); i++) await new Promise((r) => setTimeout(r, 5)); return pids.filter((p) => p && alive(p)); };
console.log('② round 2 — A: a press the gate minted, never a flag a caller writes');
{
  const data = path.join(TMP, 'data-law-a');
  fs.mkdirSync(data, { recursive: true });
  T += 24 * HOUR;
  setMode('rows');
  const { door } = makeDoor(DOOR, data);
  const n0 = calls().length;
  const viaAlias = (d) => d.ask('antigravity', 'machine', { person: true });                 // a file handed the door under another name (its timer's body)
  const r1 = await viaAlias(door);
  const door2 = door; const r2 = await door2.ask('antigravity', 'machine', { person: true }); // `const door = modelsDoor; door.ask(…)` at boot
  const { ask } = door; const r3 = await ask('antigravity', 'machine', { person: true });    // a destructured ask
  const r4 = await door.ask('antigravity', 'machine', { press: { kind: 'open' } });          // a press object the gate never minted
  const rs = [r1, r2, r3, r4];
  ok('A: the verifier\'s planted callers — an alias on a timer, `const door = modelsDoor` at boot, a destructured ask — and a forged press object are each refused «no-press» with 0 starts, whoever holds the door',
    rs.every((r) => r && r.ok === false && r.status === 403 && r.code === 'no-press') && calls().length === n0 && door.pending('antigravity', 'machine') === null, rs.map((r) => r && r.code));
  const mintA = MINTS.get(door) || ((req, sc) => (typeof door.press === 'function' ? door.press(req, sc && sc.kind) : { ok: false }));
  const once = mintA({}, { backend: 'antigravity', account: 'machine', kind: 'open' });
  const u1 = once.ok ? await door.ask('antigravity', 'machine', { press: once.press, kind: 'open' }) : null;
  if (u1 && u1.listing) await door.pending('antigravity', 'machine');
  T += 7 * HOUR;
  const u2 = once.ok ? await door.ask('antigravity', 'machine', { press: once.press, kind: 'open' }) : null;
  ok('A: a minted press lists ONCE — the same press handed again is refused «no-press»', !!u1 && u1.code === 'started' && !!u2 && u2.code === 'no-press' && calls().length === n0 + 1, [u1, u2]);
  const { door: gated, mint: gatedMint } = makeDoor(DOOR, data, { verdict: undefined }); // THE REAL gate
  const gm = gatedMint || ((req, sc) => (typeof gated.press === 'function' ? gated.press(req, sc && sc.kind) : null));
  const g1 = gm({ headers: {} }, { backend: 'antigravity', account: 'machine', kind: 'open' });
  const g2 = gm({ headers: { authorization: 'Bearer vsst_planted', origin: 'http://127.0.0.1:1', host: '127.0.0.1:1' } }, { backend: 'antigravity', account: 'machine', kind: 'refresh' });
  ok('A: the real gate mints nothing for a request that is no person\'s page (no browser ⇒ cross_site) or that carries an agent\'s bearer (human_only)', !!g1 && g1.ok === false && g1.code === 'cross_site' && !!g2 && g2.ok === false && g2.code === 'human_only', [g1, g2]);
}
console.log('② round 3 — law 2: the mint does not travel with the door; a press is bound and short-lived');
{
  const data = path.join(TMP, 'data-law-2');
  fs.mkdirSync(data, { recursive: true });
  T += 24 * HOUR;
  setMode('rows');
  const { door, mint } = makeDoor(DOOR, data);
  ok('law 2: the door that is handed around CANNOT mint — the maker returns { door, mint } (the mint for the one route registrar) and the door has no press / mint of its own',
    typeof mint === 'function' && !('press' in door) && !('mint' in door) && !Object.keys(door).some((k) => /mint|press/i.test(k) && typeof door[k] === 'function'), Object.keys(door));
  if (typeof mint === 'function') {
    const n0 = calls().length;
    const pX = mint({}, { backend: 'antigravity', account: 'agy-aaaaaaaaaaaa', kind: 'open' }).press;
    const rY = await door.ask('antigravity', 'agy-bbbbbbbbbbbb', { press: pX, kind: 'open' });
    const pK = mint({}, { backend: 'antigravity', account: 'machine', kind: 'open' }).press;
    const rK = await door.ask('antigravity', 'machine', { press: pK, kind: 'refresh' });
    const pT = mint({}, { backend: 'antigravity', account: 'machine', kind: 'open' }).press;
    T += 6000;
    const rT = await door.ask('antigravity', 'machine', { press: pT, kind: 'open' });
    ok('law 2: a press is BOUND — minted for account X it is refused for Y, minted for an opening it is refused for the refresh row, 6 s old it is refused (it is spent in the request that minted it; the bound is 5 s) — 0 starts',
      rY.code === 'press-not-for-this' && rK.code === 'press-not-for-this' && rT.code === 'press-expired' && calls().length === n0 && DOOR.PRESS_TTL_MS === 5000, [rY.code, rK.code, rT.code]);
  } else ok('law 2: a press is BOUND to (backend, account, kind) and to its age', false, 'no separate mint: the door mints');
}
console.log('② round 3 — law 1: the door never signals a group it no longer holds');
{
  // every group signal the process sends, with the group's LIVE members at that instant (a fresh /proc read, here, in the test)
  const groupOf = (pgid) => { const out = []; for (const e of fs.readdirSync('/proc')) { if (!/^\d+$/.test(e)) continue; try { const st = fs.readFileSync(`/proc/${e}/stat`, 'utf8'); const r = st.slice(st.lastIndexOf(')') + 2).split(' '); if (Number(r[2]) === pgid && r[0] !== 'Z') out.push(Number(e)); } catch { } } return out; };
  const realKill = process.kill;
  const sent = [];
  process.kill = function (pid, sig) { if (typeof pid === 'number' && pid < 0) sent.push({ pgid: -pid, sig, members: groupOf(-pid) }); return realKill.call(process, pid, sig); };
  try {
    const scene = async (mode, extra = {}) => {
      setMode(mode); sent.length = 0;
      for (const n of ['pid.sh', 'pid.sleep', 'pid.bg']) fs.rmSync(path.join(BIN, n), { force: true });
      T += 24 * HOUR;
      const { door } = makeDoor(DOOR, path.join(TMP, 'data-law-1-' + mode), extra);
      await ASK(door, 'antigravity', 'machine');
      await door.pending('antigravity', 'machine');
      await settled([pidIn('pid.sh'), pidIn('pid.sleep'), pidIn('pid.bg')]);
      return sent.slice();
    };
    const plain = await scene('rows');
    ok('law 1: a plain listing that exits and closes signals NOBODY — no group signal at all (its group is empty: the number is free)', plain.length === 0, plain);
    const fork = await scene('fork-rows', { timeoutMs: 3000 });
    ok('law 1: AFTER the exit a group is signalled only on proof — a member of ours alive (the helper holding the pipe): every signal reached a live member', fork.length >= 1 && fork.every((x) => x.members.length > 0), fork);
    const hang = await scene('hang-fork', { timeoutMs: 150 });
    const cap = await scene('big');
    ok('law 1: BEFORE the exit (the timeout, the cap) the group is ours and ended — each signal reached its live members', hang.length === 1 && hang[0].members.length > 0 && cap.length === 1 && cap[0].members.length > 0, { hang, cap });
    // THE FOREIGN-GROUP STAND-IN: a handle whose number names an unrelated, live, detached group
    const foreign = spawnChild('sleep', ['30'], { detached: true, stdio: 'ignore' });
    const fake = () => { const c = new EventEmitter(); c.pid = foreign.pid; c.stdout = new PassThrough(); c.stdin = new Writable({ write(_, __, cb) { cb(); } }); setImmediate(() => { c.stdout.end(); c.emit('exit', 0, null); c.emit('close', 0, null); }); return c; };
    sent.length = 0;
    T += 24 * HOUR;
    const { door: fd } = makeDoor(DOOR, path.join(TMP, 'data-law-1-foreign'), { spawnImpl: fake });
    await ASK(fd, 'antigravity', 'machine');
    await fd.pending('antigravity', 'machine');
    const fAlive = alive(foreign.pid);
    ok('law 1: a handle whose number names a FOREIGN live group — after its «exit» the door sends NOTHING (a live process holds the number: not ours) and the foreign group lives', fAlive && !sent.some((x) => x.pgid === foreign.pid), { fAlive, sent });
    try { realKill.call(process, -foreign.pid, 'SIGKILL'); } catch { } // the drill's own stand-in, spawned and held here
  } finally { process.kill = realKill; }
}
console.log('② round 2 — B: the explicit row\'s pace and its daily bound, kept across a restart');
{
  ok('B: the bound is 24 explicit asks per account per rolling 24 h, the pace one a minute (the module\'s own numbers)', DOOR.DAILY_MAX === 24 && DOOR.PACE_MS === 60000 && DOOR.DAY_MS === 24 * HOUR, [DOOR.DAILY_MAX, DOOR.PACE_MS]);
  const data = path.join(TMP, 'data-law-b');
  fs.mkdirSync(data, { recursive: true });
  T += 48 * HOUR;
  setMode('rows');
  const A = 'agy-aaaaaaaaaaaa';
  let { door } = makeDoor(DOOR, data, { dailyMax: 3 });
  const n0 = calls().length, first = T + MIN;
  const ok3 = [];
  for (let i = 0; i < 3; i++) { T += MIN + 1000; const r = await ASK(door, 'antigravity', A, { refresh: true }); ok3.push(r.code); await door.pending('antigravity', A); }
  await door._flush();
  ({ door } = makeDoor(DOOR, data, { dailyMax: 3 })); // a RESTART
  T += 10 * 1000;
  const p1 = await ASK(door, 'antigravity', A, { refresh: true });
  ok('B: after a RESTART the minute\'s pace still holds (persisted beside the cache): «throttled», nothing asked', p1.code === 'throttled' && p1.status === 429 && calls().length === n0 + 3, [ok3, p1]);
  T += MIN;
  const b1 = await ASK(door, 'antigravity', A, { refresh: true });
  ok('B: the 4th explicit ask inside 24 h (bound 3 here) ⇒ 429 «daily-bound» with when it frees (the first ask + 24 h) — nothing asked, after a restart too', b1.code === 'daily-bound' && b1.status === 429 && b1.freesAt === first + 1000 + 24 * HOUR && b1.retryInMs === b1.freesAt - T && calls().length === n0 + 3, b1);
  T = first + 1000 + 24 * HOUR + 1;
  const f1 = await ASK(door, 'antigravity', A, { refresh: true });
  if (f1.listing) await door.pending('antigravity', A);
  ok('B: past the oldest ask\'s 24 h the row asks again', f1.code === 'started' && calls().length === n0 + 4, f1);
}
console.log('② round 2 — C: a listing leaves nothing running, and keeps an answer it was given');
{
  const data = path.join(TMP, 'data-law-c');
  fs.mkdirSync(data, { recursive: true });
  T += 72 * HOUR;
  for (const n of ['pid.sh', 'pid.sleep', 'pid.bg']) fs.rmSync(path.join(BIN, n), { force: true });
  setMode('hang-fork');
  const { door } = makeDoor(DOOR, data, { timeoutMs: 150 });
  await ASK(door, 'antigravity', 'machine');
  await door.pending('antigravity', 'machine');
  const left1 = await settled([pidIn('pid.sh'), pidIn('pid.sleep')]);
  const h = door.report('antigravity', 'machine');
  ok('C(i): a hang whose CLI forked a helper (`sleep 30 &; wait`) is ended as a GROUP at the timeout — nothing of the listing left alive (the helper too)', !!pidIn('pid.sleep') && left1.length === 0 && h.lastError && h.lastError.code === 'timeout', { left1, err: h.lastError });
  setMode('fork-rows');
  const { door: d2 } = makeDoor(DOOR, path.join(TMP, 'data-law-c2'), { timeoutMs: 3000 });
  await ASK(d2, 'antigravity', 'machine');
  await d2.pending('antigravity', 'machine');
  const left2 = await settled([pidIn('pid.bg')]);
  const r = d2.report('antigravity', 'machine');
  ok('C(ii): a CLI that printed its rows and EXITED while its own child kept the pipe — the listing settles on exit: the rows are KEPT, no «timeout»', !!r.rows && r.rows.length === 1 && r.rows[0].id === 'fk-1' && r.rows[0].label === 'Forked One' && !r.lastError, r);
  ok('C(i): …and that child, still holding the pipe, is ended with the group — nothing left running', !!pidIn('pid.bg') && left2.length === 0, left2);
  setMode('big-nonl');
  const { door: d3 } = makeDoor(DOOR, path.join(TMP, 'data-law-c3'));
  await ASK(d3, 'antigravity', 'machine');
  await d3.pending('antigravity', 'machine');
  const g = d3.report('antigravity', 'machine');
  ok('round 2 (smaller 1): an oversize answer with NO newline is «unreadable» — never «signed-out» (no sign-in door for garbage)', g.lastError && g.lastError.code === 'unreadable', g.lastError);
}
console.log('② round 2 — D: the cache\'s read is never a hold and never silent');
{
  ok('D: the door holds NO synchronous fs call (the read is async — a stat first, then the file); its bound is 2 MiB', !/Sync\(/.test(read('src/server/cli-models-door.js')) && DOOR.CACHE_MAX === 2 * 1024 * 1024, DOOR.CACHE_MAX);
  const dc = path.join(TMP, 'data-law-d1'); fs.mkdirSync(dc, { recursive: true });
  fs.writeFileSync(path.join(dc, 'cli-models.json'), '{not json');
  const { door: d1, logs: l1 } = makeDoor(DOOR, dc);
  if (d1.ready) { await d1.ready(); await d1.ready(); }
  const c1 = d1.report('antigravity', 'machine'), c2 = d1.report('antigravity', 'machine');
  ok('D: a corrupt cache is said ONCE (twice read, one line) and not read — nothing thrown, no row', l1.filter((x) => /cli-models\.json is not this door's JSON/.test(x)).length === 1 && c1.rows === null && c2.rows === null, l1);
  const db = path.join(TMP, 'data-law-d2'); fs.mkdirSync(db, { recursive: true });
  fs.writeFileSync(path.join(db, 'cli-models.json'), JSON.stringify({ schema: 1, harnesses: { antigravity: { machine: { rows: [{ id: 'gemini-x', label: 'X' }], listedAt: T, cli: null, lastError: null } } } }) + ' '.repeat(5000));
  const { door: d2, logs: l2 } = makeDoor(DOOR, db, { cacheMax: 1000 });
  if (d2.ready) await d2.ready();
  const o = d2.report('antigravity', 'machine');
  ok('D: a cache over its bound (1 000 bytes here) is said ONCE and NOT read — the size checked before the read', l2.filter((x) => /over the 1000-byte bound, not read/.test(x)).length === 1 && o.rows === null, { l2, rows: o.rows });
}

// ── ③ E1 — the routes ─────────────────────────────────────────────────────────────────────────────────────────
console.log('③ E1 — the routes: a GET never lists; the OPENING is a person\'s POST');
const express = require(path.join(REPO, 'node_modules/express'));
async function routeLegs(PMR, tag) {
  const res = [];
  const leg = (name, pass, detail) => res.push({ name, pass: !!pass, detail });
  const data = path.join(TMP, `data-route-${tag}`);
  fs.mkdirSync(data, { recursive: true });
  T += 48 * HOUR;
  const { door, mint, listed } = makeDoor(DOOR, data, { verdict: undefined }); // THE REAL person gate (routes/vault.js personVerdict)
  const app = express();
  app.use(express.json());
  const sessions = new Map([['s-agy', { backend: 'antigravity', _accountId: 'agy-aaaaaaaaaaaa' }], ['s-agy-machine', { backend: 'antigravity' }], ['s-agy-host', { backend: 'antigravity', host: 'devbox' }], ['s-claude', { backend: 'claude' }]]);
  PMR.registerProviderModelRoutes(app, { accounts, providers: { forAccount: () => null, get: () => null }, activeSessions: sessions,
    catalogOf: (h) => (h === 'antigravity' ? AGY.models() : [{ id: '', label: 'Default' }, { id: 'opus', label: 'opus' }]), refreshModels: () => { }, refresher: {}, modelsDoor: door, modelsMint: mint });
  app.get('/api/available-models', (req, r) => r.json({ whole: true }));
  const srv = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const base = `http://127.0.0.1:${srv.address().port}`;
  const get = async (q) => { const r = await fetch(`${base}/api/available-models${q}`); return [r.status, await r.json()]; };
  const post = async (p, body, headers = { Origin: base }) => { const r = await fetch(`${base}${p}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) }); return [r.status, await r.json(), r.headers.get('retry-after')]; };
  const A = 'agy-aaaaaaaaaaaa';
  try {
    setMode('rows');
    const n0 = calls().length;
    const [, g0] = await get(`?backend=antigravity&account=${A}`);
    const [, g1] = await get(`?backend=antigravity&account=${A}&list=open`);
    const [, g2] = await get('?session=s-agy');
    const [, g3] = await get('?session=s-agy&list=open');
    leg('a GET NEVER lists: a plain GET, a stale `list=open` GET, a running conversation\'s GET (an attach, a page load or reload) ⇒ nothing asked', calls().length === n0 && [g0, g1, g2, g3].every((g) => g.report && g.report.source === 'shipped' && !g.report.listing), calls().length - n0);
    const ship = AGY.models().map((m) => m.id);
    leg('before any report: the SHIPPED rows (Default first), Custom… open, and `report` says so (source shipped, by Antigravity, the account\'s key)', eq(g0.models.map((m) => m.id), ship) && g0.open === true && g0.report.by === 'Antigravity' && g0.report.account === A && g0.report.listedAt === null, g0.report);
    const [o1s, o1] = await post('/api/cli-models/open', { backend: 'antigravity', account: A });
    const [, g4] = await get(`?backend=antigravity&account=${A}`);
    await door.pending('antigravity', A);
    leg('THE OPENING (POST /api/cli-models/open, a person\'s page) ⇒ 202 listing; the menu read meanwhile says «listing» and still answers at once', o1s === 202 && o1.listing && g4.report.listing === true && calls().length === n0 + 1, [o1s, o1, g4.report]);
    // the dirty re-read loop: each completion → a re-read GET; none lists
    for (let i = 0; i < 5; i++) await get(`?backend=antigravity&account=${A}`);
    leg('the re-read after the door\'s own dirty push (five times over) never starts another listing', listed.length === 1 && calls().length === n0 + 1, { listed: listed.length, calls: calls().length - n0 });
    const [, g5] = await get(`?backend=antigravity&account=${A}`);
    const [, g6] = await get('?session=s-agy');
    const [, g7] = await get('?backend=antigravity&account=agy-bbbbbbbbbbbb');
    leg('the menu = EXACTLY the reported rows, agy\'s order and labels, under the Default row — for that account and its running conversation; Custom… stays (open)',
      eq(g5.models.map((m) => [m.id, m.label]), [['', 'Default'], ...ROWS_155]) && g5.open === true && g5.report.source === 'reported' && g5.report.listedAt === T && eq(g6.models, g5.models), g5.report);
    leg('…per account: the other account still answers the shipped rows', eq(g7.models.map((m) => m.id), ship) && g7.report.source === 'shipped');
    // 10 openings against a signed-out account ⇒ ONE call
    setMode('signed-out');
    const nS = calls().length;
    const outs = [];
    for (let i = 0; i < 10; i++) { T += 30 * 1000; const [s, b] = await post('/api/cli-models/open', { backend: 'antigravity', account: 'agy-bbbbbbbbbbbb' }); outs.push([s, b.code]); await door.pending('antigravity', 'agy-bbbbbbbbbbbb'); }
    const [, g8] = await get('?backend=antigravity&account=agy-bbbbbbbbbbbb');
    leg('10 openings against a signed-out account ⇒ ONE call; the menu keeps the shipped rows and names the failure (signed-out)', calls().length === nS + 1 && outs[0][1] === 'started' && outs.slice(1).every((o) => o[1] === 'failed-recently') && g8.report.lastError.code === 'signed-out' && eq(g8.models.map((m) => m.id), ship), outs);
    // the gates
    const nG = calls().length;
    const [b1s, b1] = await post('/api/cli-models/open', { backend: 'antigravity', account: A }, { Authorization: 'Bearer vsst_planted', Origin: base });
    const [b2s] = await post('/api/cli-models/open', { backend: 'antigravity', account: A }, { Authorization: 'Bearer jbt_planted', Origin: base });
    const [b3s, b3] = await post('/api/cli-models/open', { backend: 'antigravity', account: A }, { Origin: 'http://evil.test' });
    const [b4s, b4] = await post('/api/cli-models/refresh', { backend: 'antigravity', account: A }, {});
    leg('an agent\'s bearer (vsst_ / jbt_) ⇒ 403 human_only; another site / no page ⇒ 403 cross_site — on both doors, nothing asked', b1s === 403 && b1.code === 'human_only' && b2s === 403 && b3s === 403 && b3.code === 'cross_site' && b4s === 403 && b4.code === 'cross_site' && calls().length === nG, [b1s, b2s, b3s, b4s]);
    const [c1s, c1] = await post('/api/cli-models/open', { session: 's-claude' });
    const [c2s] = await post('/api/cli-models/open', { backend: 'claude', account: '' });
    const [c3s, c3] = await post('/api/cli-models/open', { session: 's-agy-host' });
    const [, g9] = await get('?session=s-agy-host');
    leg('a harness that does not report ⇒ 400 no-report; a conversation on ANOTHER machine ⇒ 409 and its menu = the shipped list saying so (report.host) — nothing asked', c1s === 400 && c1.code === 'no-report' && c2s === 400 && c3s === 409 && c3.code === 'other-machine' && g9.report.host === 'devbox' && g9.report.source === 'shipped' && calls().length === nG, [c1s, c2s, c3s, g9.report]);
    // the explicit row
    setMode('rows');
    const [r1s, r1] = await post('/api/cli-models/refresh', { session: 's-agy-machine' });
    await door.pending('antigravity', 'machine');
    const [r2s, r2, ra] = await post('/api/cli-models/refresh', { backend: 'antigravity', account: 'machine' });
    leg('the explicit row: a person\'s press lists now (the machine\'s own login for a conversation with no account), again inside the minute ⇒ 429 + Retry-After 60', r1s === 202 && r1.listing && r2s === 429 && r2.code === 'throttled' && ra === '60' && calls().length === nG + 1, [r1s, r2s, ra]);
  } finally { srv.close(); }
  return res;
}
const PMREAL = require(path.join(REPO, 'src/routes/provider-models.js'));
for (const r of await routeLegs(PMREAL, 'real')) ok(r.name, r.pass, r.detail);

// ── ④ the words ───────────────────────────────────────────────────────────────────────────────────────────────
console.log('④ the words (one line, its door — en / zh / ja)');
{
  const W = await import(pathToFileURL(path.join(REPO, 'src/lib/cli-models-words.js')).href);
  const t = (k, p = {}) => k.replace(/\{(\w+)\}/g, (_, n) => (p[n] !== undefined ? p[n] : `{${n}}`));
  const o = { t, ago: () => '5min ago', harness: 'Antigravity' };
  const L = (rep) => W.reportLine(rep, o);
  ok('a report ⇒ «As reported by Antigravity 5min ago»', L({ source: 'reported', listedAt: 1, lastError: null }).text === 'As reported by Antigravity 5min ago');
  ok('no report yet ⇒ «VibeSpace’s list — Antigravity has not reported yet»', L({ source: 'shipped', listedAt: null, lastError: null }).text === 'VibeSpace’s list — Antigravity has not reported yet');
  const f1 = L({ source: 'reported', listedAt: 1, lastError: { code: 'signed-out' } }), f2 = L({ source: 'shipped', listedAt: null, lastError: { code: 'timeout' } });
  ok('a failed listing ⇒ «Antigravity could not list its models (signed out) — showing the last list it reported (5min ago)» in amber with the door «Sign in to Antigravity»; a timeout with no report ⇒ «… (no answer in 20 s) — showing VibeSpace’s list», no door',
    f1.text === 'Antigravity could not list its models (signed out) — showing the last list it reported (5min ago)' && f1.tone === 'warn' && f1.door === 'sign-in' && W.signInLabel(t, 'Antigravity') === 'Sign in to Antigravity'
    && f2.text === 'Antigravity could not list its models (no answer in 20 s) — showing VibeSpace’s list' && f2.door === null, [f1, f2]);
  ok('listing ⇒ «Asking Antigravity for its models…»; another machine ⇒ «On devbox: VibeSpace’s list — that machine’s Antigravity is not read yet»; a harness that reports nothing ⇒ no line',
    L({ source: 'shipped', listing: true }).text === 'Asking Antigravity for its models…' && L({ source: 'shipped', host: 'devbox' }).text === 'On devbox: VibeSpace’s list — that machine’s Antigravity is not read yet' && L(undefined) === null);
  ok('the explicit row «Refresh from Antigravity»; its refusal inside the minute «Asked less than a minute ago — try again in 42 s»', W.refreshLabel(t, 'Antigravity') === 'Refresh from Antigravity' && W.refusalText({ code: 'throttled', retryInMs: 41200 }, t) === 'Asked less than a minute ago — try again in 42 s');
  // round 2 law F: every refusal and failure code its OWN sentence (zh / ja through t()), never the server's English
  const rt = (r) => W.refusalText(r, t, 'Antigravity');
  ok('F: the server\'s typed words never reach the person — human_only / cross_site / no-press, no-report, unknown-account, other-machine each have the client\'s own sentence',
    rt({ code: 'human_only', error: 'only a person on this page can ask a CLI for its models' }) === 'Only a person on this page can ask Antigravity for its models'
    && rt({ code: 'no-press', error: 'x' }) === rt({ code: 'cross_site', error: 'y' })
    && rt({ code: 'no-report', error: 'this menu is not a CLI’s own list' }) === 'This menu is not Antigravity’s own list'
    && rt({ code: 'unknown-account', error: 'unknown account' }) === 'That account is no longer here'
    && rt({ code: 'other-machine', error: 'that machine’s CLI is not read yet' }) === 'That machine’s Antigravity is not read yet',
    [rt({ code: 'human_only', error: 'only a person on this page can ask a CLI for its models' }), rt({ code: 'no-report', error: 'English' })]);
  ok('F: a code this client does not know is NAMED, never dressed as another — a refusal «Antigravity could not be asked (brand-new-code)», a failure «a failure VibeSpace does not know (brand-new-code)»',
    rt({ code: 'brand-new-code', error: 'English words' }) === 'Antigravity could not be asked (brand-new-code)'
    && W.whyText('brand-new-code', t) === 'a failure VibeSpace does not know (brand-new-code)' && W.whyText('unreadable', t) === 'an answer VibeSpace could not read',
    [rt({ code: 'brand-new-code', error: 'English words' }), W.whyText('brand-new-code', t)]);
  ok('B: the daily bound said with WHEN it frees — «Asked 24 times in 24 hours — the next ask is possible in 3 h» (in minutes under an hour)',
    rt({ code: 'daily-bound', retryInMs: 2.5 * 3600e3, asked: 24 }) === 'Asked 24 times in 24 hours — the next ask is possible in 3 h' && rt({ code: 'daily-bound', retryInMs: 125e3, asked: 24 }) === 'Asked 24 times in 24 hours — the next ask is possible in 3 min',
    rt({ code: 'daily-bound', retryInMs: 2.5 * 3600e3, asked: 24 }));
  ok('round 3 (small): no answer at all has its OWN sentence — «Antigravity did not answer» — never an English placeholder inside a zh / ja one', rt(null) === 'Antigravity did not answer' && rt({}) === 'Antigravity did not answer', [rt(null), rt({})]);
  ok('E / G: ONE rule and ONE sentence for both surfaces — opensFor (a report of THIS machine only) and «gemini-9 — not in Antigravity’s report»',
    typeof W.opensFor === 'function' && W.opensFor({ source: 'reported' }) === true && W.opensFor({ source: 'shipped', host: 'devbox' }) === false && W.opensFor(null) === false
    && typeof W.notInReport === 'function' && W.notInReport(t, 'Antigravity', 'gemini-9') === 'gemini-9 — not in Antigravity’s report');
  const appSrc = read('src/lib/app.js');
  ok('E (the New Session half, read; Chrome drives it in test-agy-status-bar-chrome ⑥): the field keeps the chosen model the report does not list — the pick once touched, else the saved default — with the shared words, under Default',
    /const touched = sel\.dataset\.touched === '1';/.test(appSrc) && /o\.textContent = notInReport\(t, ans\.report\.by \|\| be, chosen\);/.test(appSrc) && /modelSel\.dataset\.touched = '1';/.test(appSrc) && /sel\.value = chosen && !touched \? chosen/.test(appSrc));
  const keys = [...read('src/lib/cli-models-words.js').matchAll(/\bt\('([^']+)'/g)].map((m) => m[1]);
  const has = (file, k) => read(file).includes('\n  ' + JSON.stringify(k) + ':');
  const missing = keys.filter((k) => !has('src/lib/i18n-zh.js', k) || !has('src/lib/i18n-ja.js', k));
  ok(`every sentence in zh and ja (${keys.length} keys)`, keys.length >= 21 && !missing.length, missing);
  ok('the client reads the moment through ITS relative-time helper (user-todos-row agoText), in both menus', /import \{ agoText as agoWords \} from '\.\/user-todos-row\.js'/.test(read('src/lib/app.js')) && /import \{ agoText as agoWords \} from '\.\/user-todos-row\.js'/.test(read('src/lib/chat-status-bar.js')));
}

// ── ⑦ the chat's model menu, the REAL bar in a fake DOM (round 2 laws G and E, the chat's half) ─────────────────────
console.log('⑦ the chat\'s model menu (the real bar, a fake DOM): no request for another machine; an unchanged push rebuilds nothing; a held model said');
{
  class El {
    constructor(tag) { this.tagName = String(tag).toUpperCase(); this.attrs = new Map(); this.childNodes = []; this.parentNode = null; this._t = ''; this.style = {}; this.dataset = {}; this.onclick = null; }
    get children() { return this.childNodes.filter((n) => n instanceof El); }
    setAttribute(k, v) { this.attrs.set(k, String(v)); } getAttribute(k) { return this.attrs.has(k) ? this.attrs.get(k) : null; }
    hasAttribute(k) { return this.attrs.has(k); } removeAttribute(k) { this.attrs.delete(k); }
    get className() { return this.getAttribute('class') || ''; } set className(v) { this.setAttribute('class', v); }
    get classList() { const el = this; return { add: (c) => { if (!el.className.split(' ').includes(c)) el.className = (el.className + ' ' + c).trim(); }, remove: (c) => { el.className = el.className.split(' ').filter((x) => x !== c).join(' '); }, contains: (c) => el.className.split(' ').includes(c), toggle: () => { } }; }
    get title() { return this.getAttribute('title') || ''; } set title(v) { this.setAttribute('title', v); }
    get innerHTML() { return this._t; } set innerHTML(h) { this._t = String(h); this.childNodes = []; }
    get textContent() { return this._t.replace(/<[^>]*>/g, '') + this.children.map((c) => c.textContent).join(''); } set textContent(v) { this._t = String(v); this.childNodes = []; }
    appendChild(n) { return this.insertBefore(n, null); }
    insertBefore(n, ref) { if (n.parentNode) n.parentNode.removeChild(n); const i = ref ? this.childNodes.indexOf(ref) : -1; if (i < 0) this.childNodes.push(n); else this.childNodes.splice(i, 0, n); n.parentNode = this; return n; }
    removeChild(n) { const i = this.childNodes.indexOf(n); if (i >= 0) this.childNodes.splice(i, 1); n.parentNode = null; return n; }
    remove() { if (this.parentNode) this.parentNode.removeChild(this); }
    get isConnected() { let p = this; while (p.parentNode) p = p.parentNode; return p === ROOTBOX; }
    addEventListener() { } removeEventListener() { }
    querySelector(sel) { const want = sel.replace(/^\./, ''); const walk = (n) => { for (const c of n.children) { if (c.className.split(' ').includes(want)) return c; const x = walk(c); if (x) return x; } return null; }; return walk(this); }
    getBoundingClientRect() { return { left: 0, top: 0, right: 800, bottom: 40, width: 800, height: 40 }; }
  }
  let ROOTBOX = null;
  globalThis.document = { createElement: (t) => new El(t), addEventListener() { }, removeEventListener() { }, documentElement: new El('html'), body: new El('body') };
  globalThis.getComputedStyle = () => ({ position: 'relative', minWidth: '0', getPropertyValue: () => '' });
  globalThis.window = globalThis.window || new EventTarget();
  const reqs = [];
  let answer = null;
  globalThis.fetch = async (u, o) => { reqs.push(`${(o && o.method) || 'GET'} ${u}`); const body = /\/api\/cli-models\/open/.test(u) ? { ok: true, status: 200, listing: false, code: 'floor' } : answer; return { json: async () => JSON.parse(JSON.stringify(body)) }; };
  const tick = async () => { for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r)); };
  const mod = await import(pathToFileURL(path.join(REPO, 'src/lib/chat-status-bar.js')).href);
  const rows = ROWS_155.slice(0, 4).map(([id, label]) => ({ id, label }));
  const menuOf = (report, models = rows) => ({ session: 'sid-g', backend: 'antigravity', account: null, provider: null, models: [{ id: '', label: 'Default' }, ...models], empty: false, open: true, defaultId: '', refreshable: false, report });
  const openMenu = async (ans, status = { model: 'gemini-4-carbon-medium' }) => {
    answer = ans; reqs.length = 0;
    const bar = new mod.ChatStatusBar({ send() { } }, 'sid-g', { backend: 'antigravity', getToolMsg: () => null, openSubagentViewer() { }, openInTempEditor() { } });
    bar.applyStatus(status);
    ROOTBOX = new El('div');
    bar._popupContainer = ROOTBOX;
    const chip = bar.element.children.find((c) => c.getAttribute('data-chip') === 'model');
    bar._onClick({ target: { closest: (sel) => (sel === '.chat-status-model' ? chip : null) }, stopPropagation() { } });
    await tick();
    const dd = ROOTBOX.children.find((c) => c.className === 'chat-status-dropdown');
    return { bar, dd, items: () => (dd ? dd.children.map((c) => c.textContent) : []), rowNodes: () => (dd ? dd.children.filter((c) => /chat-status-dropdown-item/.test(c.className) && !/chat-status-dropdown-lock/.test(c.className)) : []) };
  };
  const here = { source: 'reported', host: undefined, listedAt: Date.now() - 5 * MIN, lastError: null, listing: false, account: 'machine', by: 'Antigravity' };
  const g1 = await openMenu(menuOf({ ...here, source: 'shipped', host: 'devbox', listedAt: null }));
  ok('G(i): a conversation on ANOTHER machine — the chat menu sends NO opening (only its GET), as the New Session field sends none', reqs.length === 1 && /^GET \/api\/available-models\?session=/.test(reqs[0]) && g1.items().some((x) => /On devbox: VibeSpace’s list/.test(x)), reqs);
  const g2 = await openMenu(menuOf(here));
  ok('…and on THIS machine the GET comes first, then ONE opening POST (the person\'s act)', reqs.length === 2 && /^GET /.test(reqs[0]) && /^POST \/api\/cli-models\/open/.test(reqs[1]), reqs);
  const before = g2.rowNodes();
  window.dispatchEvent(new CustomEvent('vs-available-models-dirty', { detail: { backend: 'antigravity', account: 'machine' } })); await tick();
  window.dispatchEvent(new CustomEvent('vs-available-models-dirty', { detail: { backend: 'antigravity', account: 'machine' } })); await tick();
  const after = g2.rowNodes();
  ok(`G(ii): two dirty pushes with an UNCHANGED answer rebuild nothing — every row node kept (${after.filter((n, i) => n === before[i]).length} of ${before.length}), one GET each`, before.length >= 5 && after.length === before.length && after.every((n, i) => n === before[i]) && reqs.filter((x) => /^GET /.test(x)).length === 3, { kept: after.filter((n, i) => n === before[i]).length, of: before.length, reqs });
  answer = menuOf(here, [...rows, { id: 'gemini-new-high', label: 'Gemini New (High)' }]);
  window.dispatchEvent(new CustomEvent('vs-available-models-dirty', { detail: { backend: 'antigravity', account: 'machine' } })); await tick();
  ok('…and a CHANGED answer redraws the rows (the new row there)', g2.items().some((x) => x === 'Gemini New (High)'), g2.items());
  const e1 = await openMenu(menuOf(here), { model: 'gemini-9-held-high' });
  const held = e1.dd ? e1.dd.children.find((c) => /chat-status-models-held/.test(c.className)) : null;
  ok('E (the chat\'s half): the conversation\'s model that the report does not list is KEPT as a marked row, said «gemini-9-held-high — not in Antigravity’s report» — the New Session field\'s words', !!held && held.textContent === 'gemini-9-held-high — not in Antigravity’s report' && /\bactive\b/.test(held.className), e1.items());
}

// ── ⑤ E2 + the callers' census ────────────────────────────────────────────────────────────────────────────────
console.log('⑤ E2 (a cache, never shared) + the door\'s callers');
{
  ok('E2: the cache is in no config export section and no import (persistence.js never names it)', !/cli-models/.test(read('src/routes/persistence.js')));
  const files = (dir) => fs.readdirSync(path.join(REPO, dir), { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? files(path.join(dir, d.name)) : /\.(js|mjs|cjs)$/.test(d.name) ? [path.join(dir, d.name)] : []));
  const TREE = Object.fromEntries([...files('src').filter((f) => !f.startsWith('src/lib/i18n')), 'server.js'].map((f) => [f, read(f)])); // EVERY file — the census reads the whole tree
  const namers = Object.keys(TREE).filter((f) => /cli-models\.json/.test(TREE[f]));
  ok('E2: only the door names data/cli-models.json — no export, import, sync, backup or device push reads it (a cache that stays on this hub)', eq(namers, ['src/server/cli-models-door.js']) && /const FILE = 'cli-models\.json';/.test(TREE['src/server/cli-models-door.js']), namers);
  // THE CENSUS (round 2 law A: the press is the construction, this reads its ONE site): the door made once; the press minted
  // ONCE — provider-models' cliDoor, its first statement — and handed to the one ask; `modelsReport` read by the door alone
  // (the descriptor declares it); no timer in the door but its child's two; no synchronous read in the door. Every
  // `modelsDoor.ask(` outside that one door is named by what reaches it.
  const DOORF = 'src/server/cli-models-door.js', AUR = 'src/server/account-usage-routes.js', PMF = 'src/routes/provider-models.js';
  const strip = (x) => String(x).replace(/^\s*(\/\/|\*).*$/gm, '');
  // each file's facts, computed ONCE per text (a plant changes one file: only that one is read again — the census still reads
  // EVERY file of src/, it just never reads the same text twice)
  const FACTS = new Map();
  const factsOf = (f, x) => {
    let byText = FACTS.get(f);
    if (!byText) FACTS.set(f, (byText = new Map()));
    if (byText.has(x)) return byText.get(x);
    const code = strip(x);
    // round 3 law 2: the mint is counted by EVERY reference to its identifier (whatever the argument is called); the door has
    // no press, so any `.press(` and any `press` destructured from something in server code is a second mint attempt
    const fx = { maker: /createCliModelsDoor\(/.test(x), mintRefs: [...code.matchAll(/\bmodelsMint\b/g)].length,
      pressCalls: f.startsWith('src/lib/') ? 0 : [...code.matchAll(/\.press\(|\{[^}\n]*\bpress\b[^}\n]*\}\s*=\s*[\w.]+/g)].length,
      reader: /\bmodelsReport\b/.test(code), asks: [] };
    let i = -1;
    while ((i = code.indexOf('modelsDoor.ask(', i + 1)) >= 0) {
      const before = code.slice(Math.max(0, i - 400), i);
      if (/setInterval\(|setTimeout\(|setImmediate\(|\.unref\(/.test(before.slice(-200))) { fx.asks.push('timer'); continue; }
      if (/spawn|ws-create|adapters\/|wrapper/.test(f)) { fx.asks.push('per-spawn'); continue; }
      if (f !== PMF) { fx.asks.push('boot'); continue; }
      const door = code.lastIndexOf('const cliDoor = ', i);
      if (door < 0) { const head = code.slice(0, i); fx.asks.push(head.lastIndexOf('app.get(') > head.lastIndexOf('app.post(') ? 'get' : 'outside-door'); continue; }
      const span = code.slice(door, i + 80);
      if (!/const m = modelsMint\(req, [^\n]*\);\s*\n\s*if \(!m\.ok\) return res\.status\(403\)/.test(span) || !/modelsDoor\.ask\([^\n]*\{ press: m\.press, kind \}\)/.test(span)) fx.asks.push('mint');
    }
    byText.set(x, fx);
    return fx;
  };
  const census = (texts) => {
    const bad = [], makers = [], mints = {};
    for (const [f, x] of Object.entries(texts)) {
      if (f === DOORF) continue;
      const fx = factsOf(f, x);
      if (fx.maker) makers.push(f);
      if (fx.mintRefs) mints[f] = fx.mintRefs;
      if (fx.pressCalls) bad.push(['mint', f]);
      if (fx.reader && f !== 'src/harnesses/antigravity.js') bad.push(['report-reader', f]);
      for (const k of fx.asks) bad.push([k, f]);
    }
    if (!eq(makers, [AUR])) bad.push(['second-door', makers.join(',')]);
    // the ONE holder: the maker's file takes it from the maker and hands it on (2), the registrar receives it and calls it (2)
    if (JSON.stringify(mints) !== JSON.stringify({ [PMF]: 2, [AUR]: 2 }) && JSON.stringify(mints) !== JSON.stringify({ [AUR]: 2, [PMF]: 2 })) bad.push(['mint', JSON.stringify(mints)]);
    if ((strip(texts[PMF] || '').match(/app\.post\('\/api\/cli-models\/(open|refresh)', cliDoor\('(open|refresh)'\)\)/g) || []).length !== 2) bad.push(['doors', PMF]);
    const d = strip(texts[DOORF] || '');
    if (/setInterval\(/.test(d) || (d.match(/setTimeout\(/g) || []).length !== 2) bad.push(['timer', DOORF]);
    if (/Sync\(/.test(d)) bad.push(['sync-read', DOORF]);
    return bad;
  };
  const clean = census(TREE);
  ok('the tree: ONE door (account-usage-routes); its mint referenced only by the maker\'s file (2) and the ONE route registrar (2: received, called before the one ask); no `.press(` anywhere; modelsReport read by the door alone; no timer in the door but its child\'s two; no synchronous read in it', !clean.length, clean);
  const plant = (f, from, to) => { const x = TREE[f]; if (!x || !x.includes(from)) return null; return { ...TREE, [f]: x.replace(from, to) }; };
  const hook = "  require('../routes/provider-models.js').registerProviderModelRoutes(";
  const planted = {
    timer: plant(AUR, hook, "  setInterval(() => { modelsDoor.ask('antigravity', 'machine', { person: true }); }, 6 * 3600e3);\n" + hook),
    boot: plant(AUR, hook, "  modelsDoor.ask('antigravity', 'machine', { person: true });\n" + hook),
    'per-spawn': { ...TREE, 'src/ws-create.js': TREE['src/ws-create.js'] + "\nfunction plantedSpawnHook(modelsDoor, backend, id) { return modelsDoor.ask(backend, id, { person: true }); }\n" },
    agent: plant(PMF, "    const m = modelsMint(req, t.error ? null : { backend: t.backend, account: keyOf(t.account), kind });\n", "    const m = { ok: true, press: { kind } };\n"),
    get: plant(PMF, "    if (q.session === undefined && q.account === undefined) return next();\n", "    if (q.session === undefined && q.account === undefined) return next();\n    if (q.list === 'open') modelsDoor.ask(String(q.backend), String(q.account || 'machine'), { press: modelsDoor.press(req).press });\n"),
    'new-file': { ...TREE, 'src/server/planted-models-poller.js': "'use strict';\nmodule.exports = (modelsDoor) => modelsDoor.ask('antigravity', 'machine', { person: true });\n" },
    'second-mint': { ...TREE, 'src/server/planted-press.js': "'use strict';\nmodule.exports = (modelsDoor, req) => modelsDoor.press(req, 'refresh');\n" },
    'alias-timer (1)': plant(AUR, hook, "  const doorA = modelsDoor; setInterval(() => doorA.ask('antigravity', 'machine', { press: doorA.press({ headers: { 'sec-fetch-site': 'same-origin' } }, 'refresh').press }), 61000);\n" + hook),
    'param-timer (2)': { ...TREE, 'src/server/planted-door-param.js': "'use strict';\nmodule.exports = (d) => setInterval(() => d.ask('antigravity', 'machine', { press: d.press({ headers: { 'sec-fetch-site': 'same-origin' } }, 'refresh').press }), 61000);\n" },
    'destructured (3)': plant(AUR, hook, "  const { ask: askA, press: pressA } = modelsDoor; setInterval(() => askA('antigravity', 'machine', { press: pressA({ headers: {} }, 'refresh').press }), 61000);\n" + hook),
    'mint-request (4)': { ...TREE, 'src/server/planted-mint-request.js': "'use strict';\nmodule.exports = (modelsDoor, request) => modelsDoor.press(request, 'refresh');\n" },
    'mint-headers (5)': { ...TREE, 'src/server/planted-mint-headers.js': "'use strict';\nmodule.exports = (modelsDoor) => modelsDoor.press({ headers: { 'sec-fetch-site': 'same-origin' } });\n" },
    'mint-travels': plant(AUR, hook, "  app.locals.modelsMint = modelsMint;\n" + hook),
    'report-reader': { ...TREE, 'src/server/planted-cli-lister.js': "'use strict';\nconst { spawn } = require('child_process');\nmodule.exports = (h, cmd) => setInterval(() => spawn(cmd, h.modelsReport.argv), 6 * 3600e3);\n" },
  };
  const WORDS = { timer: ['on a timer', 'timer'], boot: ['at boot (the routes\' create)', 'boot'], 'per-spawn': ['per spawn (ws-create)', 'per-spawn'], agent: ['through a door that no longer mints (the person gate removed)', 'mint'], get: ['from a GET (minting there)', 'mint'], 'new-file': ['from a brand-new file anywhere in src/ (the census reads every file)', 'boot'], 'second-mint': ['through a SECOND mint of a press', 'mint'], 'report-reader': ['by spawning the CLI with the descriptor\'s modelsReport.argv on a timer (bypassing the door)', 'report-reader'],
    'alias-timer (1)': ['through an ALIAS of the door on a timer, minting with a hand-built header object (the verifier\'s plant 1)', 'mint'], 'param-timer (2)': ['through a PARAMETER holding the door, on a timer (plant 2)', 'mint'],
    'destructured (3)': ['through a destructured { ask, press } of the door, on a timer (plant 3)', 'mint'], 'mint-request (4)': ['through a second mint whose argument is named `request` (plant 4)', 'mint'],
    'mint-headers (5)': ['through a mint handed a hand-built headers object in a new file (plant 5)', 'mint'], 'mint-travels': ['by handing the mint itself on (app.locals)', 'mint'] };
  for (const [name, texts] of Object.entries(planted)) {
    const v = texts ? census(texts) : [['plant-missed', name]];
    ok(`PLANTED: a listing ${WORDS[name][0]} is RED by its name «${WORDS[name][1]}»`, v.some((x) => x[0] === WORDS[name][1]), v);
  }
}

// ── ⑥ negative controls ───────────────────────────────────────────────────────────────────────────────────────
console.log('⑥ negative controls (patched copies outside the tree)');
{
  const M = mutantCopies('agy-models-door', REPO);
  const DSRC = read('src/server/cli-models-door.js');
  const FLOOR = "        if (e && e.listedAt && t - e.listedAt < floorMs && !moved(e.cli)) return";
  const FAILF = "        if (le && t - le.at < failFloorMs && !moved(le.cli)) return";
  const STDIO = "stdio: ['pipe', 'pipe', 'ignore']";
  ok('the controls\' lines exist', DSRC.includes(FLOOR) && DSRC.includes(FAILF) && DSRC.includes(STDIO));
  const noFloor = M.load('src/server/cli-models-door.js', DSRC.replace(FLOOR, '        if (false) return'), 'no-floor');
  const redF = (await doorLegs(noFloor, 'no-floor')).filter((r) => !r.pass).map((r) => r.name);
  ok(`control no-floor (every opening runs agy): «the FLOOR» is RED (${redF.length} red)`, redF.some((n) => /^the FLOOR/.test(n)), redF.join(' | ').slice(0, 300));
  const noFail = M.load('src/server/cli-models-door.js', DSRC.replace(FAILF, '        if (false) return'), 'no-fail-floor');
  const redN = (await doorLegs(noFail, 'no-fail-floor')).filter((r) => !r.pass).map((r) => r.name);
  ok(`control no-fail-floor: «10 openings against a signed-out account» is RED (${redN.length} red)`, redN.some((n) => /^10 openings/.test(n)), redN.join(' | ').slice(0, 300));
  const errRead = M.load('src/server/cli-models-door.js', DSRC.replace(STDIO, "stdio: ['pipe', 'pipe', 'pipe']").replace("    try { child.stdout.setEncoding('utf8'); child.stdout.on('error', () => { }); } catch { }", "    try { child.stdout.setEncoding('utf8'); child.stdout.on('error', () => { }); child.stderr.setEncoding('utf8'); child.stderr.on('data', (d) => { stdout += d; }); } catch { }"), 'reads-stderr');
  const redE = (await doorLegs(errRead, 'reads-stderr')).filter((r) => !r.pass).map((r) => r.name);
  ok(`control reads-stderr: «STDOUT ONLY» is RED (${redE.length} red)`, redE.some((n) => /^STDOUT ONLY/.test(n)), redE.join(' | ').slice(0, 300));
  const KILL = "    const timer = setTimeout(() => { timedOut = true; finish(null, 'timeout'); }, timeoutMs);";
  ok('the no-kill control\'s line exists', DSRC.includes(KILL));
  const noKill = M.load('src/server/cli-models-door.js', DSRC.replace(KILL, '    const timer = null;'), 'no-kill');
  const redK = (await hangLegs(noKill, 'no-kill', 'hang-short')).filter((r) => !r.pass).map((r) => r.name);
  ok(`control no-kill (a hanging agy is waited out): «a CLI that never answers is KILLED» is RED (${redK.length} red)`, redK.some((n) => /^a CLI that never answers is KILLED/.test(n)), redK.join(' | ').slice(0, 300));
  for (const r of copiesCensus(M.files, M.dir, REPO, { minCopies: 4 })) ok(r.name, r.pass, r.detail);
}

console.log(`\n${fail ? fail + ' FAILED (' + pass + ' passed)' : 'ALL PASS (' + pass + ')'}`);
process.exit(fail ? 1 : 0);
