#!/usr/bin/env node
// ONE interpretation of discovery facts, any machine (CS separation, 2.278.0).
//
// The collectors legitimately differ (local rich sweep / daemon snapshot /
// ssh script fallback); the INTERPRETATION of the same bytes must not. It
// did: local named a session from the FIRST LINE of the first real user
// message while the remote parser whitespace-collapsed the WHOLE message
// (same session, two names); tail-ids had three implementations feeding one
// consumer; the daemon's lock scan missed the PID-reuse guard local has had
// for years. This test pins the now-single rules.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { scratch, anchored } from './scratch.mjs';
const require = createRequire(import.meta.url);
const { extractTailIds, nameFromUserRecord, nameFromUserLine, pidLooksClaude } = require('../src/discovery-facts.js');
const { readJsonlTailIds } = require('../src/session-store.js');

let pass = 0, fail = 0;
const ok = (c, n) => { if (typeof c !== 'boolean') throw new TypeError(`ok: its condition is a ${typeof c}, not a boolean — the arguments are swapped, or a value stands where a comparison belongs`); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n); } };
// B-0d3e: a red control's product edit, its anchor judged BY NAME — any count but one (for 'all' / 'join' / 'first' or a /g
// anchor: none) is a red row of this suite's own check naming the anchor and the file; the copy is then built as before (nothing
// crashes). 'first' = an anchor the product holds more than once today: the first one is patched, as it always was
function editAnchor(text, from, to, file, mode = 'one') {
  const t = String(text), re = from instanceof RegExp, many = mode !== 'one' || (re && from.global);
  const n = re ? [...t.matchAll(new RegExp(from.source, from.flags.replace(/[gy]/g, '') + 'g'))].length : t.split(String(from)).length - 1;
  if (many ? n === 0 : n !== 1) { const shown = re ? String(from) : JSON.stringify(String(from)).slice(0, 100); ok(false, `ANCHOR (${file}): ${shown} — found ${n} times, ${many ? 'at least one' : 'one'} meant: the copy is not the control it says`); }
  return mode === 'join' ? t.split(from).join(to) : mode === 'all' ? t.replaceAll(from, to) : t.replace(from, to);
}

// ── naming: the drift case that motivated this ──
const multiline = { type: 'user', message: { role: 'user', content: '帮我修这个bug\n下面是详细的日志\nERROR at foo.js:12' } };
ok(nameFromUserRecord(multiline) === '帮我修这个bug', 'multi-line message names from its FIRST LINE (local rule; the remote collapse appended the log)');
const arr = { type: 'user', message: { content: [{ type: 'text', text: '  spaced   name here  ' }] } };
ok(nameFromUserRecord(arr) === 'spaced   name here', 'array-content records extract the text block');
ok(nameFromUserRecord({ type: 'user', message: { content: '<vibespace-task-context>\nreal question' } }) === null, 'injected <tag> context is never a name');
ok(nameFromUserRecord({ type: 'user', message: { content: '/model claude-fable-5' } }) === null, 'slash-command echo is never a name');
ok(nameFromUserRecord({ type: 'user', message: { content: '\n\n  actual ask' } }) === 'actual ask', 'leading blank lines are skipped (first NON-EMPTY line)');
ok((nameFromUserRecord({ type: 'user', message: { content: 'x'.repeat(200) } }) || '').length === 80, '80-char cap');

// raw-line path (the ssh script truncates N lines — JSON.parse fails)
const fullLine = JSON.stringify(multiline);
ok(nameFromUserLine(fullLine) === '帮我修这个bug', 'raw full line parses to the same name as the record path');
const truncated = fullLine.slice(0, fullLine.indexOf('详细')); // cut mid-string: unparseable
ok(nameFromUserLine(truncated) === '帮我修这个bug', 'TRUNCATED line (regex fallback) still yields the identical first-line name');
ok(nameFromUserLine('J 123 456 /path') === null, 'non-user noise yields null');

// ── tail ids: one rule, and session-store now delegates to it ──
const tail = Array(5).fill('{"sessionId":"aaa"}').concat(['{"sessionId":"bbb"}', '{"sessionId":"aaa"}']).join('\n');
ok(JSON.stringify(extractTailIds(tail)) === '["aaa","bbb","aaa"]', 'runs uniq-collapse; re-appearance is a NEW run (last = current writer)');
const many = Array.from({ length: 12 }, (_, i) => `{"sessionId":"s${i}"}`).join('\n');
ok(extractTailIds(many).length === 8 && extractTailIds(many)[7] === 's11', 'last-8 cap keeps the newest runs (ssh script semantics)');
const tmp = scratch('df-tail') + '.jsonl';
fs.writeFileSync(tmp, tail + '\n');
ok(JSON.stringify(readJsonlTailIds(tmp)) === '["aaa","bbb","aaa"]', 'session-store readJsonlTailIds delegates to the SAME rule');
fs.rmSync(tmp);
ok(readJsonlTailIds('/nonexistent/x.jsonl') === null, "null-on-unreadable contract preserved (claimJsonls' no-tail-evidence class)");

// ── PID verification: the guard the daemon snapshot was missing ──
ok(pidLooksClaude(process.pid) === false, 'this node process is not claude (liveness alone would have said yes)');
ok(pidLooksClaude(999999999) === false, 'dead pid is false, never throws');

// ── the wiring is real: agentd bundle + hosts + session-store all import it ──
const agentdSrc = fs.readFileSync(new URL('../src/agentd/agentd.js', import.meta.url), 'utf-8');
ok(gateOf(agentdSrc.includes("require('./../discovery-facts.js')")) && verdictOf(agentdSrc.includes('pidLooksClaude(pid)')), 'daemon snapshot uses the shared module (bundled by esbuild — code sharing IS possible here)');
const hostsSrc = fs.readFileSync(new URL('../src/hosts.js', import.meta.url), 'utf-8');
ok(verdictOf(hostsSrc.includes("require('./discovery-facts')")), 'hosts N-line parser uses the shared naming');
const bundle = fs.readFileSync(new URL('../data/bin/vibespace-agentd.js', import.meta.url), 'utf-8');
ok(verdictOf(bundle.includes('pidLooksClaude')) || verdictOf(bundle.includes('PID-reuse guard')), 'built daemon bundle actually carries the shared code');

// ── lane peer-card-sender (the coordinator 2026-10-03, an owner screenshot: EVERY worker of the lanes' Task Group was
// called "Another Claude session sent a message:" in the sidebar). A conversation is named after its first REAL user
// message; a worker's first user record is a DELIVERY (a wake VibeSpace posted — origin.kind 'peer'), so the CLI's frame
// became its name. ① a delivery never names (its origin stamp, notification-senders deliveredRecordKind); ② a name GIVEN
// to the live session (creation / rename) outranks the first message on the card; ③ ws rename-session lands in
// user-state customNames (the sidebar rename's store) on every client. Invented real-shape records below.
{
  const path = await import('node:path');
  const { mutantCopies } = await import('./mutant-copy.mjs');
  const REPO = path.resolve(new URL('..', import.meta.url).pathname);
  const NS = require('../src/notification-senders.js');
  const { extractSessionMeta } = require('../src/session-store.js');
  const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf-8');
  const CWD = '/var/tmp/lanes-x';
  const WAKE = { type: 'user', isMeta: true, uuid: 'w1', message: { role: 'user', content: 'Another Claude session sent a message:\nYou were @mentioned — group messages (vibespace-msg):\n#### Group "crew" (g-0a1b2c3d) — 1 new since your last report\n- [10-03T03:50Z] coordinator: @lane-x go\n\nThis came from another Claude session — not typed by your user.' }, origin: { kind: 'peer', from: 'unknown', verifiedPeerPid: 4035 }, promptSource: 'system', cwd: CWD };
  const NOTIF = { type: 'user', message: { role: 'user', content: 'Background task done: gate-201 exited 0' }, origin: { kind: 'task-notification' }, cwd: CWD };
  const TYPED = (t) => ({ type: 'user', message: { role: 'user', content: t }, promptSource: 'sdk', cwd: CWD });
  const ASSIST = { type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'on it' }] }, cwd: CWD };
  const L = (o) => JSON.stringify(o) + '\n';
  console.log('lane peer-card-sender ① a delivery never names a session');
  ok(nameFromUserRecord(WAKE) === null && nameFromUserRecord(NOTIF) === null, 'a server-posted wake (origin peer) and a job notification (origin task-notification) name nothing — by their origin stamp');
  ok(nameFromUserRecord({ ...WAKE, origin: undefined, isMeta: undefined }) === 'Another Claude session sent a message:', '…the same words WITHOUT the stamp still name (the judgement is the stamp, never the words)');
  ok(nameFromUserLine(L(WAKE).trim()) === null, 'a whole raw wake line names nothing');
  const HOOK = { type: 'user', isMeta: true, message: { role: 'user', content: 'Stop hook feedback:\nremember to update the docs' }, cwd: CWD };
  const IMG = { type: 'user', isMeta: true, turnCompanion: true, message: { role: 'user', content: [{ type: 'text', text: '[Image: original 2112x1212, displayed at 2000x1148.]' }] }, cwd: CWD };
  ok(nameFromUserRecord(HOOK) === null && nameFromUserRecord(IMG) === null, 'a record the CLI wrote itself (isMeta — a Stop hook\'s feedback, an image\'s size note) names nothing (seen on 3 of 14 real worker transcripts once the wake stopped naming them)');
  const long = L({ ...WAKE, message: { role: 'user', content: WAKE.message.content + ' ' + 'x'.repeat(3000) } }).trim();
  ok(long.indexOf('"origin"') > 1500 && nameFromUserLine(long.slice(0, 1500)) === null, 'a wake line CUT before its stamp (the ssh script\'s cap; origin is written after message) names nothing — the CLI\'s own frame is the witness left');
  ok(NS.deliveredRecordKind(WAKE) === 'peer' && NS.deliveredRecordKind(TYPED('x')) === null && NS.deliveredRecordKind(null) === null, 'deliveredRecordKind: the stamp, or null');
  const dir = scratch('df-names');
  fs.mkdirSync(dir, { recursive: true });
  const f1 = path.join(dir, 'a.jsonl');
  fs.writeFileSync(f1, L(WAKE) + L(ASSIST) + L(NOTIF) + L(HOOK) + L(IMG) + L(TYPED('fix the sidebar names\nsecond line')));
  const m1 = extractSessionMeta(f1);
  ok(m1.name === 'fix the sidebar names' && m1.cwd === CWD, 'a worker\'s transcript: named by its first TYPED message, past the wake, the notification, the hook feedback and the image note', m1);
  const f2 = path.join(dir, 'b.jsonl');
  fs.writeFileSync(f2, L(WAKE) + L(ASSIST));
  ok(extractSessionMeta(f2).name === '', 'only deliveries: NO name (the card falls back to the session\'s own name)');
  // THE RESUME: the head already read is not read again — the wake's bytes are overwritten IN PLACE with a typed record
  // of the same length (a full re-read would now name it), then a second typed record is appended
  const head = L(WAKE);
  const fake = JSON.stringify(TYPED('REREAD the head'));
  fs.writeSync((() => { const fd = fs.openSync(f2, 'r+'); return fd; })(), Buffer.from(fake + ' '.repeat(Buffer.byteLength(head) - 1 - Buffer.byteLength(fake))), 0, Buffer.byteLength(head) - 1, 0);
  fs.appendFileSync(f2, L(TYPED('appended later')));
  const t = new Date(Date.now() + 5000); fs.utimesSync(f2, t, t);
  ok(extractSessionMeta(f2).name === 'appended later', 'a grown, still-unnamed head is RESUMED where the scan stopped (the 2 MB head is never re-read on every write of a live worker)');
  fs.rmSync(dir, { recursive: true, force: true });

  console.log('lane peer-card-sender ② a name given to the live session outranks the first message');
  const wc = read('src/ws-create.js'), br = read('src/server/boot-restore.js'), srv = read('server.js'), sb = read('src/lib/sidebar.js'), card = read('src/lib/session-card.js');
  ok(gateOf(/_nameExplicit: typeof data\.sessionName === 'string' && !!data\.sessionName\.trim\(\),/.test(wc)) && verdictOf(/nameExplicit: session\._nameExplicit \|\| undefined, \/\/ lane peer-card-sender/.test(wc)), 'ws-create: a name GIVEN at creation is explicit (`sessionName` — the client\'s "Session N" default never travels) and persisted in the meta');
  ok(verdictOf(((s, r) => (s.match(new RegExp(r.source, 'g')) || []).length === 1 && r.test((s.match(/\nfunction sessionFromMeta\(meta, transportFacts\) \{[\s\S]*?\n\}\n/) || [''])[0]) && (s.match(/= sessionFromMeta\(meta, \{/g) || []).length === 3)(br, /_nameExplicit: meta\.nameExplicit === true/)), 'boot-restore: every restore path (dtach, chat, remote keeper) restores it');
  ok(gateOf(/\n      (?:name: s\.name, )?nameExplicit: !!s\._nameExplicit, /.test(srv)) && verdictOf(/nameExplicit: \{ digest: \(v\) => \(v \? '1' : ''\) \},/.test(sb)), 'the live payload carries it and LIVE_SESSION_FACTS carries + gates it (a rename re-renders the card)');
  // lane session-title-record moved the chain into THE name ladder (src/session-name.js — its PURE table below)
  const CHAIN = "const originalName = sessionDisplayName(s, '');";
  ok(gateOf(card.includes(CHAIN)) && verdictOf(card.includes("import { sessionDisplayName } from '../session-name.js';")), 'the card: a custom name, else THE ladder (the GIVEN live name, the CLI title, the first message, the live default)');

  console.log('lane session-title-record: THE name ladder (src/session-name.js) — PURE table');
  const NM = require('../src/session-name.js'), D = require('../src/discovery-facts.js');
  const ladderRows = (L) => {
    const row = { sessionId: 'abcdef0123456789', cwd: '/w/proj/', name: 'first message', webuiName: 'live default' };
    return [
      [{ ...row }, '', 'first message', 'no title: the first message'],
      [{ ...row, cliTitle: 'Fix the login' }, '', 'Fix the login', 'the CLI title outranks the first message'],
      [{ ...row, cliTitle: 'Fix the login', nameExplicit: true, webuiName: 'given' }, '', 'given', 'a GIVEN live name outranks the CLI title (peer-card-sender)'],
      [{ ...row, cliTitle: 'Fix the login' }, 'my rename', 'my rename', 'a rename (customName) outranks the CLI title — before or after it arrived'],
      [{ ...row, name: '' }, '', 'live default', 'no first message: the live default'],
      [{ sessionId: 'abcdef0123456789', cwd: '/w/proj/' }, '', 'proj', 'then the folder'],
      [{ sessionId: 'abcdef0123456789' }, '', 'abcdef012345...', 'then the id'],
    ].map(([s0, c, want, what]) => ({ got: L.sessionDisplayName(s0, c), want, what }));
  };
  for (const r of ladderRows(NM)) ok(r.got === r.want, `ladder: ${r.what} → ${JSON.stringify(r.got)}`);
  ok(NM.sessionGivenName({ name: 'first message' }, '') === '' && NM.sessionGivenName({ name: 'm', cliTitle: 'X' }, '') === 'X', 'sessionGivenName: rungs ①–③ only (a window title keeps its own fallbacks)');
  const titleRow = (t, extra = {}) => JSON.stringify({ parentUuid: null, sessionId: 's1', type: 'system', subtype: 'session_title_changed', title: t, uuid: 'u-' + t, ...extra });
  ok(D.titleFromText([titleRow('Older'), titleRow('Newer')].join('\n')) === 'Newer', 'a LATER title wins (the newest record in the windows)');
  ok(D.titleFromText(titleRow('  Fix\n  the   login ')) === 'Fix the login' && D.titleFromText(titleRow('   ')) === null && D.titleFromText(titleRow('x', { subtype: 'other' })) === null, 'a title is whitespace-collapsed; a blank title / another subtype names nothing');
  // ONE rule local vs remote: the same transcript through extractSessionMeta AND synthesize → interpret (TT lines)
  const tdir = scratch('df-title'); const tproj = path.join(tdir, 'p'); fs.mkdirSync(tproj, { recursive: true });
  const tfp = path.join(tproj, '7d1e0000-0000-4000-8000-00000000t001.jsonl'.replace('t', 'a'));
  const firstU = JSON.stringify({ type: 'user', cwd: '/w/proj', sessionId: 's1', message: { role: 'user', content: 'please fix login' } });
  fs.writeFileSync(tfp, [firstU, titleRow('Head title'), JSON.stringify({ type: 'assistant', pad: 'x'.repeat(400000) }), titleRow('Tail title')].join('\n') + '\n');
  const { extractSessionMeta: esm } = require('../src/session-store.js');
  const tbuf = fs.readFileSync(tfp);
  const winText = tbuf.subarray(0, D.TITLE_HEAD_BYTES).toString('utf-8') + '\n' + tbuf.subarray(Math.max(0, tbuf.length - D.TITLE_TAIL_BYTES)).toString('utf-8');
  const remote = D.interpretDiscoveryLines(D.synthesizeDiscoveryLines({ jsonls: [{ projDir: 'p', file: path.basename(tfp), mtimeMs: 1, size: tbuf.length, headCwd: '/w/proj', userLines: [firstU], titleLines: D.titleLinesOf(winText) }] }), { hostId: 'h', hostName: 'h', claimJsonls: () => new Map() });
  const rs = (remote.sessions || remote).find?.((x) => x.cliTitle) || null;
  ok(esm(tfp).cliTitle === 'Tail title' && gateOf(rs) && rs.cliTitle === 'Tail title' && rs.name === 'please fix login', `local discovery and the remote TT lines read the SAME newest title (local ${JSON.stringify(esm(tfp).cliTitle)}, remote ${JSON.stringify(rs && rs.cliTitle)})`);
  fs.rmSync(tdir, { recursive: true, force: true });

  console.log('lane peer-card-sender ③ ws rename-session → customNames, on every client');
  const wh = read('src/ws-handler.js'), ops = read('src/server/conversation-ops.js');   // design q-046: the ws rename case's body lives in conversation-ops.js (the automation door renames through it too)
  ok(gateOf(/ConversationOps\.renameSession\(/.test(wh)) && verdictOf(/if \(trimmedName\) \{ session\._nameExplicit = true; const key = getSessionKey\(session\); if \(key && typeof setCustomName === 'function'\) \{ try \{ setCustomName\(key, trimmedName\);/.test(ops)), 'rename-session: the name is explicit AND stored as the custom name of `<backend>:<id>` (the sidebar rename\'s key)');
  ok(gateOf(/'setCustomName', \/\/ lane peer-card-sender/.test(wh)) && gateOf(/getDesign = \(\) => null, setCustomName = null,\n  \} = ctx;/.test(wh)) && verdictOf(/setCustomName: \(k, n\) => persistenceRouter\.setCustomName\(k, n\)/.test(srv)), '…through the ws ctx contract (list ⇄ destructure ⇄ server.js) to the persistence door');
  // the door itself, for real: a scratch data dir, a fake wss that records the broadcast
  const sent = [];
  const fakeWss = { clients: new Set([{ readyState: 1, send: (m) => sent.push(JSON.parse(m)) }]) };
  const P = require('../src/routes/persistence.js');
  const pdir = scratch('df-userstate');
  fs.mkdirSync(pdir, { recursive: true });
  try { P.setup({ dataDir: pdir, wss: fakeWss, WS_OPEN: 1, getSyncStore: () => null, activeSessions: new Map(), auth: null, getHosts: () => null, getMounts: () => null, getTasks: () => null, getAccounts: () => null, getUsageHistory: () => null, onSettingsWrite: () => {} }); } catch (e) { ok(false, 'persistence setup in a scratch dir: ' + e.message); }
  const r1 = P.router.setCustomName('claude:5c3a0000-0000-4000-8000-0000000000c1', '车道 · lane-x 建设 (Opus)');
  const us = JSON.parse(fs.readFileSync(path.join(pdir, 'user-state.json'), 'utf-8'));
  const b = sent.filter((m) => m.type === 'user-state-updated');
  ok(r1 === true && us.customNames['claude:5c3a0000-0000-4000-8000-0000000000c1'] === '车道 · lane-x 建设 (Opus)' && b.length === 1 && b[0].state.customNames['claude:5c3a0000-0000-4000-8000-0000000000c1'] === '车道 · lane-x 建设 (Opus)', 'setCustomName writes user-state.json and BROADCASTS user-state-updated (every client\'s sidebar applies it)', { r1, us: us.customNames, b: b.length });
  ok(P.router.setCustomName('claude:5c3a0000-0000-4000-8000-0000000000c1', ' 车道 · lane-x 建设 (Opus) ') === false && sent.length === 1, '…the same name again writes nothing, broadcasts nothing');
  ok(P.router.setCustomName('', 'x') === false && P.router.setCustomName('no-backend', 'x') === false, '…a key that is not `<backend>:<id>` is refused');
  fs.rmSync(pdir, { recursive: true, force: true });

  console.log('lane peer-card-sender CONTROLS (scratch mutant copies — the tree is never written)');
  const MUT = mutantCopies('df-names', REPO);
  const dfSrc = read('src/discovery-facts.js');
  const anchor = '  if (d.isMeta === true || deliveredRecordKind(d)) return null;\n';
  ok(verdictOf(dfSrc.includes(anchor)), 'control anchor present');
  const D0 = require(MUT.write('src/discovery-facts.js', editAnchor(dfSrc, anchor, '', "src/discovery-facts.js"), 'old-rule'));
  ok(D0.nameFromUserRecord(WAKE) === 'Another Claude session sent a message:', 'CONTROL the pre-fix rule: a worker is named "Another Claude session sent a message:" (① can go red)');
  const oldCard = card.replace(CHAIN, "const originalName = s.name || s.webuiName || cwdFolder || s.sessionId.substring(0, 12) + '...';");
  ok(oldCard !== card && !oldCard.includes(CHAIN), 'CONTROL the pre-fix card chain fails the ② pin (the first message beats the given name)');
  const nmSrc = read('src/session-name.js'), nmAnchor = '  if (s.nameExplicit && s.webuiName) return s.webuiName;\n  return s.cliTitle || \'\';\n';
  ok(verdictOf(nmSrc.includes(nmAnchor)), 'control anchor present (the ladder\'s ② ③ rungs)');
  const NM0 = require(MUT.write('src/session-name.js', editAnchor(nmSrc, nmAnchor, "  if (s.cliTitle) return s.cliTitle;\n  if (s.nameExplicit && s.webuiName) return s.webuiName;\n  return '';\n", "src/session-name.js"), 'title-over-given'));
  ok(verdictOf(ladderRows(NM0).some((r) => r.got !== r.want)), 'CONTROL a ladder whose CLI title outranks the given name fails the PURE table');
  const NM1 = require(MUT.write('src/session-name.js', editAnchor(nmSrc, nmAnchor, "  if (s.nameExplicit && s.webuiName) return s.webuiName;\n  return '';\n", "src/session-name.js"), 'no-title-rung'));
  ok(verdictOf(ladderRows(NM1).some((r) => r.got !== r.want)), 'CONTROL a ladder without the CLI-title rung fails the PURE table');
}

console.log('B-16d7 a remote conversation\'s real folder resolved by ITS OWN machine (the R fact → hostRealCwd → the page\'s rule)');
{
  const DFx = require('../src/discovery-facts.js'), TM = require('../src/task-membership.js');
  const { mutantCopies: mc16 } = await import('./mutant-copy.mjs');
  const MUT = mc16('df-16d7', new URL('..', import.meta.url).pathname.replace(/\/$/, ''));
  const claimJsonls = require('../src/session-store.js').claimJsonls;
  const fp = '/HOME/.claude/projects/-home-u-link/0f0e0d0c-0b0a-4908-8706-050403020100.jsonl';
  const base = `J 1795000000.0000 10 ${fp}\nH ${fp}\t"cwd":"/home/u/link"`;
  const rowOf = (out) => (DFx.interpretDiscoveryLines(out, { hostId: 'h-2', hostName: 'box', claimJsonls }) || [])[0] || {};
  const withR = rowOf(base + '\nR /home/u/link\t/srv/nfs/proj');
  ok(withR.cwd === '/home/u/link' && withR.hostRealCwd === '/srv/nfs/proj' && withR.realCwd === undefined, 'an R fact gives the row the path ITS machine resolved — as `hostRealCwd`, never the hub\'s `realCwd`');
  ok(rowOf(base).hostRealCwd === undefined && rowOf(base + '\nR /home/u/link\trel/x').hostRealCwd === undefined && rowOf(base + '\nR /other\t/srv/x').hostRealCwd === undefined,
    'no R, a relative one, or one for another folder: no hostRealCwd');
  ok(rowOf(base + '\nR /home/u/link\t/home/u/link').hostRealCwd === '/home/u/link', 'an R equal to the cwd: a RESOLVED folder that is no link — the row says its own path (a link replaced by a folder leaves the hub\'s map)');
  const synth = DFx.synthesizeDiscoveryLines({ locks: [], jsonls: [{ projDir: '-home-u-link', file: '0f0e0d0c-0b0a-4908-8706-050403020100.jsonl', size: 10, mtimeMs: 1795000000000, headCwd: '/home/u/link' }], codexRollouts: [], codexOpen: [], realCwds: [['/home/u/link', '/srv/nfs/proj'], ['/x\ty', '/z']] });
  ok(gateOf(synth.includes('R /home/u/link\t/srv/nfs/proj')) && !synth.includes('/x\ty') && rowOf(synth).hostRealCwd === '/srv/nfs/proj', 'the device road: the snapshot\'s realCwds become R lines (a tab or a newline in a path never forges a line), the same interpreter reads them');
  // the page's rule: another machine's conversation is matched by ITS machine's real path, the hub's by the hub's
  ok(JSON.stringify(TM.membershipCwds({ cwd: '/home/u/link', hostRealCwd: '/srv/nfs/proj', realCwd: '/hub/real', host: 'h-2' })) === JSON.stringify(['/home/u/link', '/srv/nfs/proj'])
    && JSON.stringify(TM.membershipCwds({ cwd: '/a', realCwd: '/b', hostRealCwd: '/c', host: 'local' })) === JSON.stringify(['/a', '/b'])
    && JSON.stringify(TM.membershipCwds({ cwd: '/a', realCwd: '/b', host: 'h-2' })) === JSON.stringify(['/a']),
    'membershipCwds: another machine → its cwd and ITS real path (never the hub\'s stamp); the hub → its cwd and the hub\'s real path');
  const groupFolder = { path: '/srv/nfs/proj', recursive: true };
  ok(verdictOf(TM.membershipCwds({ cwd: withR.cwd, hostRealCwd: withR.hostRealCwd, host: 'h-2' }).some((c) => TM.insideFolder(c, groupFolder))), 'the row\'s scene: a remote conversation at a symlink whose target is the group\'s folder is its member again (by its machine\'s own path)');
  // RED CONTROL: the page's rule as B-df5f left it (no machine-resolved field) — the same row is no member
  const tmSrc = fs.readFileSync(new URL('../src/task-membership.js', import.meta.url), 'utf8');
  const TM0 = require(MUT.write('src/task-membership.js', anchored(tmSrc, 'onOtherMachine(host) ? hostRealCwd : realCwd', 'onOtherMachine(host) ? null : realCwd', 'no-host-real'), 'no-host-real'));   // stale-pins: kept — the control plants the page's rule as released
  ok(!TM0.membershipCwds({ cwd: withR.cwd, hostRealCwd: withR.hostRealCwd, host: 'h-2' }).some((c) => TM0.insideFolder(c, groupFolder)), 'CONTROL (the page\'s rule without the machine\'s own path, as released): the remote conversation is no member ⇒ RED');
  // THE SSH ROAD: the script's own vs_real, in every shell here, over a scratch tree with a symlink
  const HS = fs.readFileSync(new URL('../src/hosts.js', import.meta.url), 'utf8');
  const i00 = HS.indexOf('      vs_t0=$(date +%s);'), i0 = HS.indexOf('      vs_real() {'), i1 = HS.indexOf('\n', i0);
  ok(i00 > 0 && i0 > i00, 'the ssh discovery script defines vs_real after its budget line');
  const fnText = HS.slice(i00, i1).replace(/\\\\/g, '\\');   // (the template literal's escapes, as the shell receives them)
  const { spawnSync } = require('node:child_process');
  const T16 = scratch('disc-16d7'); fs.mkdirSync(T16 + '/real dir', { recursive: true }); fs.symlinkSync(T16 + '/real dir', T16 + '/link');
  const shells = ['sh', 'bash', 'zsh'].filter((sh) => spawnSync('sh', ['-c', `command -v ${sh}`], { encoding: 'utf8' }).status === 0);
  const said = shells.map((sh) => spawnSync(sh, ['-c', `${fnText}\nvs_real "$1"; vs_real "$2"; vs_real "$1"`, 'x', T16 + '/link', fs.realpathSync(T16) + '/real dir'], { encoding: 'utf8', env: { PATH: '/usr/bin:/bin' } }).stdout);
  const T16r = fs.realpathSync(T16);   // (a scratch root under a symlinked TMPDIR resolves too)
  ok(shells.length >= 2 && verdictOf(said.every((o) => o === `R ${T16}/link\t${T16r}/real dir\nR ${T16r}/real dir\t${T16r}/real dir\n`)), `the ssh road: every resolved cwd prints ONE R line (asked twice: once) — a link its real path, a folder itself — in every shell here (${shells.join(', ')})`, said);
  const noTo = spawnSync('sh', ['-c', `${fnText}\nvs_to=; vs_real "$1"`, 'x', T16 + '/link'], { encoding: 'utf8', env: { PATH: '/usr/bin:/bin' } }).stdout, ctl = spawnSync('sh', ['-c', `${fnText}\nvs_real "$1"`, 'x', T16 + '/link\nLOCK {}'], { encoding: 'utf8', env: { PATH: '/usr/bin:/bin' } }).stdout;
  ok(noTo === '' && ctl === '', 'a host with no timeout resolves nothing (an unbounded cd into a dead mount would hold the list); a path with a control character never prints (no forged LOCK line)', { noTo, ctl });
  ok(gateOf(HS.includes('kill -0 "$pid" 2>/dev/null && { echo "LOCK $(cat "$f")"; vs_real ')) && verdictOf(HS.includes('        vs_real "$(printf \'%s\' "$vs_hc" | cut -d\'"\' -f4)"')), 'the script asks it for every live lock\'s cwd and every listed head cwd');
  // THE DEVICE ROAD: the snapshot resolves its folders in its child, at most 200, and hands them on the result
  const AG = fs.readFileSync(new URL('../src/agentd/agentd.js', import.meta.url), 'utf8');
  const cds = AG.slice(AG.indexOf('function computeDiscoverySnapshot()'), AG.indexOf("if (process.argv.includes('--discovery-snapshot-child')) {"));
  ok(gateOf(AG.includes("      snap.realCwds = await require('../discovery-facts').realCwdsOf(snap);")) && !/realpath/.test(cds) && verdictOf(AG.includes('codexOpen: snap.codexOpen || [], realCwds: snap.realCwds || [] });')), 'the device: the real folders are resolved ONLY in the snapshot\'s child, off the loop and bounded (the snapshot itself — the inline fallback — resolves none), and ride the discovery result');
  // THE PARITY LAW (主开发's round wz421di05): ONE tree, BOTH roads — the real script's vs_real and the real device resolver
  // (discovery-facts realCwdsOf, what the snapshot's child runs) — say the same R lines. The tree: a link, a folder, a link into
  // a nested folder, a missing folder, a file, a relative path, an escaped JSON spelling, and a codex head that is a link
  const TP = scratch('disc-16d7-parity');
  fs.mkdirSync(TP + '/a', { recursive: true }); fs.mkdirSync(TP + '/b/sub', { recursive: true }); fs.writeFileSync(TP + '/f', 'x');
  fs.symlinkSync(TP + '/a', TP + '/l'); fs.symlinkSync(TP + '/b/sub', TP + '/l2'); fs.symlinkSync(TP + '/b', TP + '/lc');
  const snapP = { locks: [{ cwd: TP + '/l' }], jsonls: [{ headCwd: TP + '/a' }, { headCwd: TP + '/n' }, { headCwd: TP + '/l2' }, { headCwd: TP + '/f' }, { headCwd: 'rel/x' }, { headCwd: TP + '/esc\\u00e9' }, { headCwd: TP + '/l' }], codexRollouts: [{ headCwd: TP + '/lc' }] };
  const scriptLines = (cwds) => spawnSync('sh', ['-c', `${fnText}\nfor c in "$@"; do vs_real "$c"; done`, 'x', ...cwds], { encoding: 'utf8', env: { PATH: '/usr/bin:/bin' } }).stdout.split('\n').filter(Boolean).sort();
  const asScript = [...snapP.locks.map((l) => l.cwd), ...snapP.jsonls.map((j) => j.headCwd)];   // what the script reads: the live locks' and the listed heads' cwds
  const deviceLines = async (DFm) => DFm.synthesizeDiscoveryLines({ realCwds: await DFm.realCwdsOf(snapP) }).split('\n').filter((l) => l.startsWith('R ')).sort();
  const devP = await deviceLines(DFx), scrP = scriptLines(asScript);
  ok(devP.length === 3 && JSON.stringify(devP) === JSON.stringify(scrP), `ONE tree, both roads, the same R lines (${devP.length}: the link (a lock's and a head's: once), the folder, the nested link; never the missing folder, the file, the relative path, the escaped spelling, the codex head)`, { device: devP, script: scrP });
  // RED CONTROL: the device road resolving codex heads too (as 60b02509b did) — a codex conversation's membership would flip with the transport
  const dfSrc = fs.readFileSync(new URL('../src/discovery-facts.js', import.meta.url), 'utf8');
  const DFc = require(MUT.write('src/discovery-facts.js', anchored(dfSrc, "...(snap?.jsonls || []).map((j) => j && j.headCwd)]) {", "...(snap?.jsonls || []).map((j) => j && j.headCwd), ...(snap?.codexRollouts || []).map((r) => r && r.headCwd)]) {", 'codex-on-device'), 'codex-on-device'));   // stale-pins: kept — the control plants the device road with codex heads (60b02509b)
  const devC = await deviceLines(DFc);
  ok(JSON.stringify(devC) !== JSON.stringify(scrP) && verdictOf(devC.some((l) => l.startsWith(`R ${TP}/lc\t`))), 'CONTROL (the device road resolving codex heads, as 60b02509b did): the two roads disagree on one tree ⇒ RED', devC);
  fs.rmSync(TP, { recursive: true, force: true });
  // the hub: ONE map per host from its discovery answer, read by the store and the live row
  const { HostManager } = require('../src/hosts.js');
  const HM = new HostManager({ dataDir: scratch('disc-16d7-hosts') });
  HM._noteRealCwds('h-2', [withR, { cwd: '/x', sessionId: 'b' }]);
  ok(HM.realCwdOf('h-2', '/home/u/link') === '/srv/nfs/proj' && HM.realCwdOf('h-2', '/x') === null && HM.realCwdOf('h-3', '/home/u/link') === null && JSON.stringify(HM.hostRealFieldsOf({ host: 'h-2', cwd: '/home/u/link' })) === JSON.stringify({ hostRealCwd: '/srv/nfs/proj' }) && JSON.stringify(HM.hostRealFieldsOf({ host: null, cwd: '/home/u/link' })) === '{}',
    'the hub keeps ONE map per host from its discovery answer: the store and the live row read a machine\'s own folder for ITS conversations only');
  const movedSaid = []; HM.onRealCwdsMoved = (pairs) => movedSaid.push(pairs.map((p) => p.join('→')).join(','));
  HM._noteRealCwds('h-2', [{ cwd: '/home/u/link', sessionId: 'a' }]);   // an answer from a rung that says no real folder at all
  const kept = HM.realCwdOf('h-2', '/home/u/link');
  HM._noteRealCwds('h-2', [{ cwd: '/home/u/link', sessionId: 'a' }, { cwd: '/y', hostRealCwd: '/srv/y', sessionId: 'c' }]);   // an answer WITH facts that omits it
  ok(kept === '/srv/nfs/proj' && HM.realCwdOf('h-2', '/home/u/link') === null && HM.realCwdOf('h-2', '/y') === '/srv/y' && movedSaid.length === 1 && gateOf(movedSaid[0].includes('/y→/srv/y')) && verdictOf(movedSaid[0].includes('/home/u/link→/srv/nfs/proj')),
    'an answer that says no real folder keeps the last one (no membership flap between sweeps); one with facts that omits it drops it; what moved is told to the store (both the added and the dropped)', { kept, movedSaid });
  ok(verdictOf(fs.readFileSync(new URL('../src/hosts.js', import.meta.url), 'utf8').includes("    try { if (this._realCwds) this._realCwds.delete(id); } catch { }")), 'a removed machine\'s real folders go with it');
  HM._noteRealCwds('h-2', [{ cwd: '/y', hostRealCwd: '/y', sessionId: 'c' }]);   // the link at /y replaced by a folder: the answer says it as itself
  ok(HM.realCwdOf('h-2', '/y') === '/y', 'a link replaced by a folder: the answer says the folder as itself, the old real folder leaves (never kept for good)');
  let threw = null; try { HM.realCwdOf('h-gone', '/a'); HM.hostRealFieldsOf({ host: 'h-gone', cwd: '/a' }); } catch (e) { threw = e.message; }
  ok(threw === null, 'an unknown or removed machine: the reader answers none, never throws (the live payload calls it for every remote row)', threw);
  ok(gateOf(fs.readFileSync(new URL('../src/lib/sidebar.js', import.meta.url), 'utf8').includes("  hostRealCwd: { digest: (v) => v || '' },")) && verdictOf(fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8').includes('      host: s.host || null, hostRealCwd: hosts.hostRealFieldsOf(s).hostRealCwd,')),
    'the live row carries the field by its own key, and the page\'s merge keeps it (LIVE_SESSION_FACTS — the drift guard reads both)');
  fs.rmSync(T16, { recursive: true, force: true });
}

console.log(fail ? `FAIL (${fail})` : `ALL PASS (${pass})`);
process.exit(fail ? 1 : 0); import { verdictOf, gateOf } from './lib/check.mjs';
