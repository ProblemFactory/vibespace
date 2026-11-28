#!/usr/bin/env node
// THE SHOWN COST OF A CONVERSATION (2.369.402, lane artifacts-by-intent — the owner's red «本次对话约 $63854.44»).
// A claude `result` record's total_cost_usd is its CLI PROCESS's running total; 2.369.400 and before ADDED the results up
// (the restore in session-store chatStatus, the bar's live `+=`), a process of n equal turns read n(n+1)/2 turns. THE LAW
// (src/cost-segments.js): the shown cost = Σ over the conversation's segments of each segment's LAST total; a segment begins
// where the total restarts (a total that IS its own since-last share, or a total lower than the one before). Every pin runs
// on RECORDED stdout of the real CLI (scripts/fixtures/claude-cli: 2.1.312 and 2.1.308 through the real chat-wrapper against
// a loopback mock API — the prices are the mock's, the arithmetic is the CLI's):
//   ① the law over the records — 540 µ$ not 945 (2.1.312-frames), 465 not 840 (2.1.312 / 2.1.308 stamped)
//   ② THE RESTORE (session-store chatStatus over the buffer) gives the same figures
//   ③ THE LIVE ROAD (message-manager's turn_complete) carries, after every result, what the restore reads up to it
//   ④ interrupted results change nothing; ⑤ a buffer whose HEAD was trimmed mid-line; ⑥ a resume (restarted / carried)
//   ⑦ the figure's thousands mark (the page's language's number format); ⑧ ONE fold — no source adds a total again.
// PURE + in-process (no server, no browser). RED on 66c6d99c0: ①–⑥ read 945 / 840 / the raw totals, ⑦ «$63854.44».
import './scratch.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (typeof c !== 'boolean') throw new TypeError(`ok: its condition is a ${typeof c}, not a boolean — the arguments are swapped, or a value stands where a comparison belongs`); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra !== undefined ? '\n    ' + extra : '')); } return !!c; };
const read = (f) => fs.readFileSync(path.join(repo, f), 'utf-8');
const near = (a, b) => typeof a === 'number' && Math.abs(a - b) < 1e-12;
const µ = (x) => (typeof x === 'number' ? Math.round(x * 1e9) / 1e3 : x); // dollars → µ$ for the messages
const FIX = 'scripts/fixtures/claude-cli/';
// the stamped buffers' kept-picture references are not results (their refusal is test-kept-copies'): left out, the output stays quiet
const noKept = (text) => text.split('\n').filter((l) => !/"type":"kept"/.test(l)).join('\n');
const FRAMES = read(FIX + '2.1.312-frames.jsonl'), ST312 = noKept(read(FIX + '2.1.312-stamped.jsonl')), ST308 = noKept(read(FIX + '2.1.308-stamped.jsonl'));
const recs = (text) => text.split('\n').map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
const resultTotals = (text) => recs(text).filter((r) => r.type === 'result').map((r) => r.total_cost_usd);
const sumOf = (a) => a.reduce((s, x) => s + x, 0);

let CS = null; try { CS = require(path.join(repo, 'src/cost-segments.js')); } catch { CS = null; }
const { SessionMessages } = require(path.join(repo, 'src/session-store.js'));
const { createMessageManager } = require(path.join(repo, 'src/normalizers.js'));
// the restore: the attach's chatStatus over a wrapper buffer (a fixture id + a /tmp/vs-* cwd: discovery never adopts it)
const restoreOf = (text) => new SessionMessages({ buffer: text, cwd: '/tmp/vs-cost-segments-fixture', backend: 'claude', claudeSessionId: 'e2e00000-0000-4000-8000-00000c057000' }, 'cost-seg', {}).chatStatus()?.total_cost_usd;
// the live road: every record through the normalizer as it lands; the figure each turn_complete carries
const liveOf = (text) => {
  const mm = createMessageManager('claude', 'cost-seg'); const out = [];
  mm.onOp((op) => { if (op && op.op === 'meta' && op.subtype === 'turn_complete') out.push(op.data && op.data.cost); });
  for (const l of text.split('\n')) { let r; try { r = JSON.parse(l); } catch { continue; } mm.processLive(r); }
  return out;
};

console.log('— ① the law over the recorded results (src/cost-segments.js)');
const totals = resultTotals(FRAMES);
ok(totals.length === 6 && verdictOf(near(sumOf(totals), 0.000945)), `① the fixture is what was measured: 2.1.312-frames carries 6 results, their totals summing to 945 µ$ (${totals.map(µ).join(' ')})`);
if (ok(!!CS && typeof CS.costOfResults === 'function', '① the fold exists: src/cost-segments.js exports costOfResults / costShown')) {
  const law = (text) => CS.costShown(CS.costOfResults(recs(text)));
  ok(verdictOf(near(law(FRAMES), 0.00054)), `① 2.1.312-frames: three processes, totals 150 | 195 240 | 105 105 150 µ$ ⇒ 540 µ$ (each segment's last), never the 945 a sum reads (got ${µ(law(FRAMES))})`);
  ok(verdictOf(near(law(ST312), 0.000465)), `① 2.1.312-stamped: 225 270 | 150 195 ⇒ 465 µ$, not 840 (got ${µ(law(ST312))})`);
  ok(!recs(ST308).some((r) => r.type === 'result' && r.model_usage_since_last_result) && verdictOf(near(law(ST308), 0.000465)), `① 2.1.308-stamped (no since-last field — the drop alone cuts the segments) ⇒ 465 µ$, not 840 (got ${µ(law(ST308))})`);
  ok(gateOf(near(CS.sinceLastCost({ model_usage_since_last_result: { a: { costUSD: 0.25 }, b: { costUSD: 0.5 } } }), 0.75)) && CS.sinceLastCost({}) === null && CS.costShown(CS.costStep(CS.COST_START, 'x')) === 0, '① a since-last share sums every model\'s costUSD; no field ⇒ null; a total that is not a number folds nothing');
}

console.log('— ② THE RESTORE (session-store chatStatus over the wrapper buffer)');
ok(verdictOf(near(restoreOf(FRAMES), 0.00054)), `② the attach's figure for 2.1.312-frames ⇒ 540 µ$ (got ${µ(restoreOf(FRAMES))}; the sum read 945)`);
ok(verdictOf(near(restoreOf(ST308), 0.000465)), `② …for 2.1.308-stamped ⇒ 465 µ$ (got ${µ(restoreOf(ST308))}; the sum read 840)`);

console.log('— ③ THE LIVE ROAD carries what the restore reads');
const live = liveOf(FRAMES);
const lines = FRAMES.split('\n'), resultAt = lines.map((l, i) => (/"type":"result"/.test(l) ? i : -1)).filter((i) => i >= 0);
const prefix = resultAt.map((i) => restoreOf(lines.slice(0, i + 1).join('\n') + '\n'));
ok(live.length === 6 && verdictOf(live.every((c, k) => near(c, prefix[k]))), `③ after EVERY result the turn_complete carries the restore's figure over the buffer up to it (live ${live.map(µ).join(' ')} · restore ${prefix.map(µ).join(' ')})`);
ok(verdictOf(near(live[live.length - 1], restoreOf(FRAMES))), `③ …and the last one IS the attach's figure — the bar shows it in place of its own (src/lib/chat-status-bar.js turnCost), so the two roads cannot part`);

console.log('— ④ interrupted results change nothing');
const fr = recs(FRAMES).filter((r) => r.type === 'result');
const k5 = fr.findIndex((r, k) => k > 0 && r.subtype === 'error_during_execution' && near(CS ? CS.sinceLastCost(r) : -1, 0));
ok(k5 > 0 && verdictOf(near(live[k5], live[k5 - 1])), `④ an interrupted result that spent nothing (since-last 0) leaves the figure where it was (${µ(live[k5 - 1])} → ${µ(live[k5])})`);
const noInterrupted = FRAMES.split('\n').filter((l) => !/"subtype":"error_during_execution"/.test(l)).join('\n');
ok(verdictOf(near(restoreOf(noInterrupted), 0.00054)), `④ the buffer WITHOUT its interrupted results reads the same 540 µ$ — a running total holds what they spent (got ${µ(restoreOf(noInterrupted))})`);

console.log('— ⑤ a buffer whose HEAD was trimmed');
const cut = FRAMES.slice(FRAMES.indexOf(lines[resultAt[2]]) - 40); // mid-line, inside the second process, before its second result
ok(!cut.startsWith('{') && verdictOf(near(restoreOf(cut), 0.00039)), `⑤ trimmed mid-line inside a process: the first total kept (240) already holds the share the trim took ⇒ 240 + 150 = 390 µ$ (got ${µ(restoreOf(cut))}; a sum reads 600, Σ since-last of what is kept would read 195)`);
const liveCut = liveOf(cut);
ok(verdictOf(near(liveCut[liveCut.length - 1], 0.00039)), `⑤ …the live road over the same trimmed buffer ends on the same 390 µ$ (got ${µ(liveCut[liveCut.length - 1])})`);

console.log('— ⑥ a resume: the same conversation in a new process');
const st = recs(ST312), sidA = st.find((r) => r.type === 'result').session_id;
const procB = st.findIndex((r, k) => r.type === 'result' && k > st.findIndex((x) => x.type === 'result') && r.session_id !== sidA);
const firstB = st.findIndex((r) => r.session_id && r.session_id !== sidA); // the second process's first record
const asResume = (carry) => st.map((r, k) => (k < firstB ? r : { ...r, ...(r.session_id ? { session_id: sidA } : {}), ...(r.type === 'result' && carry ? { total_cost_usd: r.total_cost_usd + 0.00027 } : {}) })).map((r) => JSON.stringify(r)).join('\n') + '\n';
ok(procB > 0 && verdictOf(near(restoreOf(asResume(false)), 0.000465)), `⑥ resumed, the new process restarting at zero (its first total IS its own share): 270 + 195 = 465 µ$ (got ${µ(restoreOf(asResume(false)))}; a sum reads 840)`);
ok(verdictOf(near(restoreOf(asResume(true)), 0.000465)), `⑥ resumed, the new process CARRYING the old total forward (420, 465 — its share unchanged): one segment, its last total 465 µ$ (got ${µ(restoreOf(asResume(true)))}; a sum reads 1380)`);
// the live road over the restarted resume, after EVERY result (the carried one is not a live pin: its raw totals already
// equal the law's figures turn by turn — only a bar that ADDS them parts, test-status-bar-chips ①)
const rs = asResume(false), rl = rs.split('\n'), rAt = rl.map((l, i) => (/"type":"result"/.test(l) ? i : -1)).filter((i) => i >= 0);
const liveR = liveOf(rs), prefR = rAt.map((i) => restoreOf(rl.slice(0, i + 1).join('\n') + '\n'));
ok(liveR.length === 4 && gateOf(liveR.every((c, k) => near(c, prefR[k]))) && verdictOf(near(liveR[3], 0.000465)), `⑥ …the live road over the restarted resume carries the restore's figure after every result (live ${liveR.map(µ).join(' ')} · restore ${prefR.map(µ).join(' ')})`);

console.log('— ⑦ the figure\'s thousands mark — through the page\'s own number formatter (ui-language page-time num)');
const BW = await import(pathToFileURL(path.join(repo, 'src/lib/chat-bar-words.js')).href);
const PT = await import(pathToFileURL(path.join(repo, 'src/lib/page-time.js')).href);
const fmt = (s, p) => (p ? s.replace(/\{(\w+)\}/g, (m, k) => (p[k] !== undefined ? String(p[k]) : m)) : s);
const two = (v) => PT.num(v, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const big = BW.costChipWords(63854.44, null, fmt, two), billed = BW.costChipWords(63854.44, 'api', fmt, two);
ok(big.text === 'This chat ≈ $63,854.44' && verdictOf(/\$63,854\.44/.test(billed.text)), `⑦ «$63,854.44» through page-time num, never «$63854.44» (${big.text} · ${billed.text})`);
ok(BW.costChipWords(0.24, 'subscription', fmt, two).text === 'This chat ≈ $0.24 · included in your subscription' && BW.costChipWords(0.24, null, fmt).text === 'This chat ≈ $0.24', '⑦ a small figure keeps its two decimals; with no formatter handed in the words module still says the amount (it formats nothing of its own)');
const bw = read('src/lib/chat-bar-words.js'), sb0 = read('src/lib/chat-status-bar.js');
ok(!/toLocale\w*String|Intl\.NumberFormat/.test(bw) && gateOf(/import \{[^}]*\bnum\b[^}]*\} from '\.\/page-time\.js'/.test(sb0)) && verdictOf(/costChipWords\(this\._statusCost, this\._costBasis \?\? null, t, \(v\) => num\(v, \{ minimumFractionDigits: 2, maximumFractionDigits: 2 \}\)\)/.test(sb0)), '⑦ the words module formats no number itself; the bar hands it page-time num (test-ui-language ⑦\'s one formatter)');

console.log('— ⑨ THE KEPT FACT: a conversation that outlived a process (its first trimmed away entirely)');
// process A then process B of one conversation (2.1.312-stamped, B resumed under A's id); the buffer keeps B only
const lnsR = asResume(false).split('\n'), firstBLine = lnsR.findIndex((l) => { try { const o = JSON.parse(l); return o.session_id === sidA && o.type !== 'result' && lnsR.slice(0, lnsR.indexOf(l)).some((x) => /"type":"result"/.test(x)) && lnsR.slice(0, lnsR.indexOf(l)).filter((x) => /"type":"result"/.test(x)).length === 2; } catch { return false; } });
const onlyB = lnsR.slice(firstBLine).join('\n'), aRecs = recs(lnsR.slice(0, firstBLine).join('\n'));
if (ok(!!CS && typeof CS.costResume === 'function', '⑨ the fold resumes a kept fact: src/cost-segments.js exports costResume / costFold / resultsIn')) {
  const kept = CS.costOfResults(aRecs);
  ok(gateOf(near(CS.costShown(kept), 0.00027)) && typeof kept.key === 'string' && resultTotals(onlyB).length === 2, `⑨ the kept fact after process A: 270 µ$ with its last result's key; the buffer holds process B's two results only (${resultTotals(onlyB).map(µ).join(' ')})`);
  ok(gateOf(near(CS.costShown(CS.costResume(kept, recs(onlyB))), 0.000465)) && verdictOf(near(CS.costShown(CS.costResume(null, recs(onlyB))), 0.000195)), `⑨ resumed: 270 kept + B's 195 = 465 µ$; the buffer alone reads 195 — the figure that SHRANK after a restart`);
  const keptA1 = CS.costOfResults(aRecs.filter((r) => r.type !== 'result' || r === aRecs.find((x) => x.type === 'result')));
  const fromA2 = lnsR.slice(lnsR.findIndex((l) => /"type":"result"/.test(l)) + 1).join('\n');
  ok(verdictOf(near(CS.costShown(CS.costResume(keptA1, recs(fromA2))), 0.000465)), '⑨ a kept fact one result behind (its write lagged; its own result trimmed away): every result the buffer holds is newer — 465 µ$');
  const r1 = recs(onlyB).find((r) => r.type === 'result'), once = CS.costFold(kept, r1);
  ok(CS.costFold(once, r1) === once, '⑨ the same result record twice folds once (a live repeat of a replayed one)');
  const r308 = recs(ST308), res308 = r308.filter((x) => x.type === 'result');
  const old = r308.map((r) => (res308.indexOf(r) >= 2 ? { ...r, total_cost_usd: r.total_cost_usd + 0.00015 } : r)); // process B's totals raised above A's last
  ok(verdictOf(near(CS.costShown(CS.costOfResults(old)), 0.000615)), `⑨ a CLI before 2.1.312 (no share): a new process whose first total is HIGHER (300 after 270) is still a restart by its result_index 0 — 270 + 345 = 615 µ$ (got ${µ(CS.costShown(CS.costOfResults(old)))})`);
}
// THE ROADS — they run on any tree (RED where nothing keeps the fold): a normalizer seeded as the boot seeds it
const keptA = CS && typeof CS.costOfResults === 'function' ? CS.costOfResults(aRecs) : null;
const seeded = () => { const m = createMessageManager('claude', 'cost-seg'); if (typeof m.seedCost === 'function' && CS && CS.costResume) m.seedCost(CS.costResume(keptA, CS.resultsIn(onlyB))); return m; };
const restoreWith = (text, m) => new SessionMessages({ buffer: text, cwd: '/tmp/vs-cost-segments-fixture', backend: 'claude', claudeSessionId: 'e2e00000-0000-4000-8000-00000c057000', _normalizer: m }, 'cost-seg', {}).chatStatus()?.total_cost_usd;
const m1 = seeded();
ok(verdictOf(near(restoreWith(onlyB, m1), 0.000465)), `⑨ THE RESTORE after a hub restart reads the conversation's fold before the buffer: 465 µ$ (got ${µ(restoreWith(onlyB, m1))}; the buffer alone 195)`);
const lastB = recs(onlyB).filter((r) => r.type === 'result').pop();
const next = { ...lastB, uuid: 'e2e00000-0000-4000-8000-00000c0570aa', result_index: 2, total_cost_usd: 0.00024, model_usage_since_last_result: { m: { costUSD: 0.000045 } } };
const ops = []; m1.onOp((op) => { if (op && op.op === 'meta' && op.subtype === 'turn_complete') ops.push(op.data.cost); });
m1.processLive(next);
ok(gateOf(near(ops[0], 0.00051)) && verdictOf(near(restoreWith(onlyB + JSON.stringify(next) + '\n', m1), 0.00051)), `⑨ THE LIVE ROAD after the restart: B's next turn (240) ⇒ 270 + 240 = 510 µ$ on the op, and the restore reads the same (op ${µ(ops[0])})`);
// a REBUILD (the first attach): the new normalizer takes the old one's fold and its replay passes over what it counted
const m2 = createMessageManager('claude', 'cost-seg'); if (typeof m2.seedCost === 'function') m2.seedCost(m1.costState(), { seek: true });
m2.convertHistory(recs(onlyB + JSON.stringify(next) + '\n'));
const opsR = []; m2.onOp((op) => { if (op && op.op === 'meta' && op.subtype === 'turn_complete') opsR.push(op.data.cost); });
const after = { ...next, uuid: 'e2e00000-0000-4000-8000-00000c0570ab', result_index: 3, total_cost_usd: 0.000285 };
m2.processLive(after);
ok(verdictOf(near(opsR[0], 0.000555)), `⑨ a REBUILD carries the fold: after replaying the same buffer, B's next turn (285) ⇒ 270 + 285 = 555 µ$ — the replay added nothing it had counted (got ${µ(opsR[0])})`);
const br = read('src/server/boot-restore.js'), nz = read('src/normalizers.js'), cj = read('src/server/stdout/claude-stream-json.js');
ok((br.match(/seedCost\(costSeedOf\(meta\.costKept, (savedBuffer|'')\)\)/g) || []).length === 2 && verdictOf(/const costSeedOf = \(kept, bufferText\) => costResume\(kept, resultsIn\(bufferText\)\)/.test(br)), '⑨ the boot seeds BOTH claude normalizers it makes with the kept fact resumed over the buffer it read (boot-restore costSeedOf)');
ok(gateOf(/const carriedCost = typeof session\._normalizer\?\.costState === 'function' \? session\._normalizer\.costState\(\) : null;/.test(nz)) && verdictOf(/mm\.seedCost\(carriedCost, \{ seek: true \}\)/.test(nz)), '⑨ a rebuild carries the old normalizer\'s fold into the new one, seeking past what it counted (normalizers rebuildHistory)');
ok(gateOf(/feedLive\(session, msg\);(?:\n[^\n]*){0,6}\n\s*if \(msg\.type === 'result'\) keepCost\(session\);/.test(cj)) && verdictOf(/writeSessionMeta\(s\.sockName, \{ \.\.\.\(readSessionMeta\(s\.sockName\) \|\| \{\}\), costKept: st \}\)/.test(cj)), '⑨ the claude stdout consumer keeps the fold on the conversation\'s meta (costKept) after each result it feeds');

console.log('— ⑧ ONE fold: no source adds a total again');
const SRC = path.join(repo, 'src'), adders = [];
const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else if (/\.(c|m)?js$/.test(e.name) && e.name !== 'cost-segments.js') fs.readFileSync(f, 'utf-8').split('\n').forEach((l, i) => { if (/\+=[^;\n]*total_cost_usd|total_cost_usd[^;\n]*\+=/.test(l)) adders.push(path.relative(repo, f) + ':' + (i + 1)); }); } };
walk(SRC);
ok(adders.length === 0, '⑧ no file under src/ adds a total_cost_usd (only src/cost-segments.js folds it)', adders.join(', '));
const ss = read('src/session-store.js'), mm = read('src/message-manager.js'), bar = read('src/lib/chat-status-bar.js'), cv = read('src/lib/chat-view.js');
ok(gateOf(/require\('\.\/cost-segments\.js'\)/.test(ss)) && verdictOf(/costShown\(costResume\(norm && typeof norm\.costState === 'function' \? norm\.costState\(\) : null, msgs\)\)/.test(ss)), '⑧ the restore folds through it — the conversation\'s fold (the kept fact resumed) BEFORE the buffer (session-store chatStatus: costShown(costResume(…costState(), msgs)))');
ok(gateOf(/require\('\.\/cost-segments\.js'\)/.test(mm)) && gateOf(/this\._cost = costFold\(this\._cost \|\| COST_START, raw\)/.test(mm)) && verdictOf(/subtype: 'turn_complete', data: \{ cost: costShown\(this\._cost\)/.test(mm)), '⑧ …and the live road through the SAME function (message-manager: costFold per result, the turn_complete carries costShown)');
ok(!/_statusCost \+=/.test(bar) && gateOf(/turnCost\(cost, modelUsage\) \{\n\s*if \(cost\) \{ this\._statusCost = cost; \}/.test(bar)) && verdictOf(/this\._statusBar\.turnCost\(op\.data\?\.cost, op\.data\?\.modelUsage\);/.test(cv)), '⑧ the bar REPLACES its figure with the carried one (turnCost), never `+=`');

console.log(fail ? `\n${fail} FAILED, ${pass} passed` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0); import { verdictOf, gateOf } from './lib/check.mjs';
