#!/usr/bin/env node
// ORIGIN — the ledger's answer to "who spent this" (2026-09-10).
//
// A request's usage is mined from three kinds of transcript and until this
// release the event could not say which: the conversation's own file, a
// subagent's, or a workflow agent's. All three attribute to the PARENT session
// id, so the Usage window could not separate what a conversation spent ITSELF
// from what its agents spent on its behalf — and because an agent record
// carries the agent's OWN cwd, every agent that ran in a git worktree was its
// own row in "By project" (272 of this instance's 3,155 agent transcripts,
// measured 2026-09-10).
//
// The WALK half is pinned by test-usage-walk-parity (both spellings, one
// fixture). This suite pins the QUERY half (the aggregate's origin dimension,
// the session×origin pivot, the session dim's project label) and CENSUSES the
// UI: the three columns, the By-origin group and the project tooltip are read
// out of the shipped source, because a dimension nobody renders is a column in
// a JSON blob.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { scratch } from './scratch.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const { UsageHistory } = require(path.join(REPO, 'src/usage-history.js'));

let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? ' — ' + JSON.stringify(e) : '')); } };

// A scratch HOME (never the developer's real ~/.claude — src/fixture-guard.js)
// and a scratch data dir, both per-pid.
const home = scratch('usage-origin-home');
const dataDir = scratch('usage-origin-data');
const rm = () => { for (const d of [home, dataDir]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { } } };
process.on('exit', rm);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { rm(); process.exit(1); });

const SID_A = 'aaaaaaaa-1111-4222-8333-444444444444';
const SID_B = 'bbbbbbbb-1111-4222-8333-444444444444';
const REPO_CWD = '/home/u/repo';
const TREE_CWD = '/home/u/repo/.claude/worktrees/agent-w1';
const PROJ = path.join(home, '.claude', 'projects', REPO_CWD.replace(/[/._]/g, '-'));

let ts = Date.UTC(2026, 7, 9, 8, 0, 0);
const rec = (rid, cwd, out = 100) => JSON.stringify({
  type: 'assistant', requestId: rid, timestamp: new Date((ts += 60000)).toISOString(), cwd,
  message: { id: 'msg_' + rid, model: 'claude-fable-5', usage: { input_tokens: 1000, output_tokens: out, cache_read_input_tokens: 10 } },
}) + '\n';
const w = (p, body) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body); };

// Session A: its own turn + a subagent + two workflow agents (one of them in a
// worktree — the shape "By project" used to list as its own project).
w(path.join(PROJ, SID_A + '.jsonl'), rec('req_a_main', REPO_CWD, 10));
w(path.join(PROJ, SID_A, 'subagents', 'agent-s1.jsonl'), rec('req_a_sub', REPO_CWD, 20));
w(path.join(PROJ, SID_A, 'subagents', 'workflows', 'wf_r1', 'agent-w1.jsonl'), rec('req_a_wf1', TREE_CWD, 40));
w(path.join(PROJ, SID_A, 'subagents', 'workflows', 'wf_r1', 'agent-w2.jsonl'), rec('req_a_wf2', TREE_CWD, 30));
// Session B: a plain conversation, no agents at all (the negative control for
// every "the split is real" assertion below).
w(path.join(PROJ, SID_B + '.jsonl'), rec('req_b_main', REPO_CWD, 5));

const uh = new UsageHistory({ dataDir, homeDir: home });
uh.scan({ force: true });
const agg = uh.aggregate({ pivots: [['session', 'origin'], ['project', 'origin']] });

// ── ① the origin DIMENSION ────────────────────────────────────────────────
const byOrigin = Object.fromEntries((agg.groups.origin || []).map((r) => [r.key, r]));
ok(Object.keys(byOrigin).sort().join(',') === 'main,subagent,workflow',
  `the aggregate has an origin dimension with all three kinds (${Object.keys(byOrigin).sort().join(',') || 'none'})`);
ok(byOrigin.main?.requests === 2 && byOrigin.subagent?.requests === 1 && byOrigin.workflow?.requests === 2,
  'every request lands in exactly one origin bucket (2 main / 1 subagent / 2 workflow)',
  Object.fromEntries(Object.entries(byOrigin).map(([k, v]) => [k, v.requests])));
const sumOrigin = Object.values(byOrigin).reduce((s, r) => s + r.cost, 0);
ok(Math.abs(sumOrigin - agg.totals.cost) < 1e-12,
  'the origin rows sum to the grand total (a dimension that drops spend is worse than none)');
ok(byOrigin.workflow.output === 70 && byOrigin.subagent.output === 20,
  'the buckets carry the tokens, not just the counts', { wf: byOrigin.workflow.output, sub: byOrigin.subagent.output });

// ── ② the session×origin PIVOT (the window's session table) ───────────────
const piv = Object.fromEntries((agg.pivots?.['session:origin'] || []).map((r) => [r.key, r.cells]));
ok(!!piv[SID_A] && !!piv[SID_B], 'session:origin is an ordinary pivot (no special-casing needed)');
ok(Object.keys(piv[SID_A] || {}).sort().join(',') === 'main,subagent,workflow',
  `a session that delegated shows all three columns (${Object.keys(piv[SID_A] || {}).sort().join(',')})`);
ok(Object.keys(piv[SID_B] || {}).join(',') === 'main',
  'NEGATIVE CONTROL: a conversation with no agents has ONE column — the split is data, not decoration');
ok(piv[SID_A].workflow.requests === 2 && piv[SID_A].main.requests === 1,
  'the cells count the right requests per session', { wf: piv[SID_A].workflow.requests, main: piv[SID_A].main.requests });
const cellSum = Object.values(piv[SID_A]).reduce((s, c) => s + c.cost, 0);
const rowA = (agg.groups.session || []).find((r) => r.key === SID_A);
ok(Math.abs(cellSum - rowA.cost) < 1e-12, 'a session row equals the sum of its origin cells (the table footer can be trusted)');

// ── ③ "By project" is the PARENT project, and the session dim says where ──
const projKeys = (agg.groups.project || []).map((r) => r.key);
ok(projKeys.length === 1 && projKeys[0] === REPO_CWD,
  `the worktree is NOT its own project row — every request is attributed to the repo it worked for (${projKeys.join(' | ')})`);
const pivProj = Object.fromEntries((agg.pivots?.['project:origin'] || []).map((r) => [r.key, r.cells]));
ok(Object.keys(pivProj[REPO_CWD] || {}).sort().join(',') === 'main,subagent,workflow',
  'the project row can still say WHICH of its spend was agents (the tooltip split)');
ok(rowA?.project === REPO_CWD && (agg.groups.session || []).find((r) => r.key === SID_B)?.project === REPO_CWD,
  'the session dimension carries name + project so the table needs no second lookup', rowA?.project);

// ── ④ the event rows themselves (what the backfill has to match) ──────────
const evs = Object.fromEntries([...uh._events(0, Date.now() + 1e9)].map((e) => [e.rid, e]));
ok(evs.req_a_wf1.origin === 'workflow' && evs.req_a_wf1.wf === 'wf_r1' && evs.req_a_wf1.agent === 'agent-w1'
  && evs.req_a_wf1.cwd === REPO_CWD && evs.req_a_wf1.wcwd === TREE_CWD,
  'a ledger row names its workflow run and agent file, and keeps the agent\'s own dir as wcwd');
ok(evs.req_a_main.origin === 'main' && !('wcwd' in evs.req_a_main) && !('wf' in evs.req_a_main),
  'a main row carries origin and nothing else');

// ── ⑤ SOURCE CENSUS — a dimension nobody renders is a column in a blob ────
// The UI has no headless leg here (the window needs a real server + chrome, and
// the heavy tier already pays for one); what CAN go stale silently is the
// wiring, so it is read out of the shipped source.
const win = fs.readFileSync(path.join(REPO, 'src/lib/usage-window.js'), 'utf-8');
const dash = fs.readFileSync(path.join(REPO, 'src/lib/usage-dashboard.js'), 'utf-8');
const route = fs.readFileSync(path.join(REPO, 'src/server/account-usage-routes.js'), 'utf-8');

ok(/export const ORIGIN_COLS = \['main', 'subagent', 'workflow'\]/.test(dash),
  'the three columns are declared ONCE (usage-dashboard), so the legend and the headers cannot disagree');
ok(/ORIGIN_META = \(\) => \(\{[\s\S]*?main:[\s\S]*?subagent:[\s\S]*?workflow:[\s\S]*?unknown:/.test(dash),
  'the vocabulary names all four origins including the honest "unknown"');
ok(/\{ key: 'origin', label: t\('Origin'\) \}/.test(dash), "the panel dashboard offers 'origin' as a dimension");
ok(/dim: 'origin'/.test(dash) && /splitBy: 'origin'/.test(dash),
  'the default preset actually USES it (a dimension only an editor can reach is a dimension nobody sees)');
ok(/ORIGIN_COLS, ORIGIN_ORDER, ORIGIN_META \} from '\.\/usage-dashboard\.js'/.test(win),
  'the window imports that one vocabulary instead of keeping a second copy');
ok(/function renderSessions\(/.test(win) && /ORIGIN_COLS\.map\(k => `<th/.test(win),
  'the "By session" table renders one column per origin');
ok(/renderSessions\(d, state, \{ limit: 12 \}\)/.test(win),
  'and it REPLACED the old plain session group (a renderer nobody calls is not a feature)');
ok(/function originStack\(/.test(win) && /td\.appendChild\(originStack\(cells, metric\)\)/.test(win),
  'every session row carries the stacked share bar');
ok(/renderOrigin\(d, state\),\n\s*renderBilling\(d\)/.test(win),
  'the "By origin" group is FIRST in the cost section');
ok(/originSplit: pivotMap\(d, 'project:origin'\)/.test(win),
  'the project rows are handed their origin split');
ok(/const split = opts\.originSplit \? originSplitText\(opts\.originSplit\[r\.key\], metric\) : '';/.test(win)
  && /title2 \+= '\\n' \+ split/.test(win),
  'and the split reaches the row TITLE (the hover answer the row itself cannot give)');
ok(/const ORIGIN_PIVOTS = \['session:origin', 'project:origin'\]/.test(win)
  && /\[\.\.\.new Set\(\[\.\.\.ORIGIN_PIVOTS, \.\.\.panelPivots\(currentPanels\(\)\)\]\)\]/.test(win),
  'the window asks for its own two crosses BESIDE the dashboard\'s, never instead of them');

// The route caps the pivot list; the window now always asks for two of its own
// on top of whatever the biggest preset needs, so the cap must cover both.
const capM = /\.slice\(0, (\d+)\)/.exec(route.slice(route.indexOf("req.query.pivot")));
const cap = capM ? Number(capM[1]) : 0;
const { PRESETS, panelPivots } = await import(path.join(REPO, 'src/lib/usage-dashboard.js'))
  .then((m) => m).catch(() => ({}));
let worstPreset = 0;
if (PRESETS && panelPivots) {
  // PRESETS() calls t(); the i18n runtime is DOM-free at import, so this is a
  // plain function call — if that ever changes the count falls back to 0 and
  // the assertion below still holds against the shipped numbers.
  try { for (const p of Object.values(PRESETS())) worstPreset = Math.max(worstPreset, panelPivots(p.panels).length); } catch { }
}
ok(cap >= 2 + worstPreset,
  `the route's pivot cap (${cap}) covers the window's two crosses plus the widest preset's (${worstPreset})`);

// ── ⑥ the shipped scanner stamps it too (remote hosts run workflows) ──────
const scan = fs.readFileSync(path.join(REPO, 'data/bin/vibespace-usage-scan'), 'utf-8');
ok(/origin: \(info && info\.origin\) \|\| 'main'/.test(scan) && /wf: \(info && info\.wf\) \|\| undefined/.test(scan),
  'the checkout-less scanner stamps origin/wf too (behaviour pinned by test-usage-walk-parity; this is the drift tripwire)');
const hist = fs.readFileSync(path.join(REPO, 'src/usage-history.js'), 'utf-8');
ok(/origin: e\.origin \|\| undefined/.test(hist),
  'a remote event with NO origin stays unnamed rather than being claimed as "main"');

console.log(fail ? `FAIL (${fail})` : `ALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
