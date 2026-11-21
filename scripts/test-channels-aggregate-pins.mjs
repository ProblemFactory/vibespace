#!/usr/bin/env node
// THE AGGREGATED IM — THE SOURCE-TEXT LEGS (fast, text only — lane lg-text-legs-3, B-94d3 part three). MOVED VERBATIM from the
// heavy scripts/test-channels-aggregate.mjs, whose engine, scheduler, budgets, drains and every patched-copy CONTROL stay there:
// ③b the card's line builder wiring, ③c the Settings number branch, ⑥d the owner's back-off words + the route maps, the CLI and
// the panel/window contracts, ⑨d the R4 UI wiring (the picker, the menu order, the retired words, the clamps, no innerHTML —
// each checker with its planted control), ⑩ the migration's registration. Each reads the file it pins BY NAME, so ci.mjs's
// affected rule selects this suite on a change of that file.
// Run: node scripts/test-channels-aggregate-pins.mjs
import './scratch.mjs';   // FIRST (B-ba47): a suite that reads a home or loads a module that does takes the re-home before any of its code (§113 THE ROW: a NEW one takes the import)
import fs from 'node:fs';
import path from 'node:path';
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (typeof n !== 'string') throw new TypeError(`ok(): the name is a ${typeof n} — swapped arguments (B-1747: a swap is a crash, never a green leg)`); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? '\n    ' + e : '')); } };

console.log('③b a failed pass is said at once: the retry instant, no "last sync" from a failure');
{
  const panelSrc = fs.readFileSync(path.join(REPO, 'src/lib/channels-panel.js'), 'utf-8');
  ok(/chanCaps\.passStateText\(a, /.test(panelSrc) && !/last sync \{ago\}', \{ ago: agoText\(a\.lastPass\.at\)/.test(panelSrc), 'the panel words its sync + retry through that builder (never "last sync" from lastPass.at, which a failure stamps)');
}

console.log('③c channel settings: the input clamps to the schema and says so; the engine\'s bounds ARE the schema\'s');
{
  const ui = fs.readFileSync(path.join(REPO, 'src/lib/settings-ui.js'), 'utf-8');
  const numBranch = ui.slice(ui.indexOf("if (schema.type === 'number') {"), ui.indexOf("if (schema.type === 'enum') {"));
  ok(/clampToSchema\(schema, num\)/.test(numBranch) && /showToast\(/.test(numBranch) && /input\.value = /.test(numBranch), 'the Settings number input clamps through clampToSchema, writes the clamped value back into the field and TOASTS it');
}

console.log('⑥d a vendor back-off: agent refreshes and window opens make NO call and say the wait; the owner\'s own press still runs');
{
  const words = fs.readFileSync(path.join(REPO, 'src/lib/channel-words.js'), 'utf-8');
  ok(/case 'rate-limited': case 'transport': case 'backoff': \{/.test(words) && /retrying in \{s\} s/.test(words), 'the owner\'s toast words a refused fetch with its code and the wait (channel-words: rate-limited / transport / backoff), never the bare English sentence');

  // the two route maps, the CLI and the panel/window contracts around the new code
  const rsrc = fs.readFileSync(path.join(REPO, 'src/routes/channels.js'), 'utf-8');
  const asrc = fs.readFileSync(path.join(REPO, 'src/agent-routes.js'), 'utf-8');
  const cli = fs.readFileSync(path.join(REPO, 'data/bin/vibespace-channels'), 'utf-8');
  ok(/code === 'refresh-floor' \|\| code === 'backoff' \? 429/.test(rsrc) && /code === 'vendor-budget' \|\| code === 'backoff' \? 429/.test(asrc), 'both route maps answer `backoff` as 429 (+ Retry-After from retryAfterSec)');
  ok(/const REFRESH_REFUSED = \[[^\]]*'backoff'[^\]]*\]/.test(cli) && /REFRESH_REFUSED\.includes\(j\.code\)\) return \{ refused: true/.test(cli), 'the CLI treats `backoff` as a refusal (exit 4, "not refreshed: … (retry in N s)"), never an error — through the ONE refused set test-channels-agent-cli\'s census keeps equal to the route\'s (r7)');
  const panel = fs.readFileSync(path.join(REPO, 'src/lib/channels-panel.js'), 'utf-8');
  const win = fs.readFileSync(path.join(REPO, 'src/lib/channel-window.js'), 'utf-8');
  ok(/app\.ws\.onStateChange\?\.\(onState\)/.test(panel) && /app\.ws\.offStateChange\?\.\(onState\)/.test(panel) && /app\.ws\.onStateChange\?\.\(onState\)/.test(win) && /app\.ws\.offStateChange\?\.\(onState\)/.test(win), 'the panel and the window re-read on every ws reconnect (a broadcast sent while the socket was down never arrives) and remove that listener by name on teardown');
}

console.log('⑨d R4 UI wiring: two operations, the picker = the access list, visible clamps, no innerHTML');
{
  const ED = fs.readFileSync(path.join(REPO, 'src/lib/channel-filter-editor.js'), 'utf-8');
  const PANEL = fs.readFileSync(path.join(REPO, 'src/lib/channels-panel.js'), 'utf-8');
  const notifyBody = ED.slice(ED.indexOf('export async function showNotifyDialog('), ED.indexOf('export function showGrainMenu('));
  ok(/const principals = st\.access\.map\(/.test(notifyBody) && (notifyBody.match(/principals\s*=/g) || []).length === 1 && /watcherRow\(list, \{ w, f: filter, st, principals,/.test(notifyBody), 'the Notify picker is built from the grain\'s ACCESS list — one assignment, handed to every watcher row, nothing else');
  ok(/if \(!principals\.length\) \{[\s\S]*?Grant access first — use "Grant access…"[\s\S]*?showGrantAccessDialog\(app, target\)/.test(notifyBody), 'an EMPTY picker says "Grant access first" and its button opens Grant access… (access is the prerequisite)');
  const mutated = notifyBody.replace('const principals = st.access.map(', 'const principals = principalChoices(app, st.access).map(');
  ok(mutated !== notifyBody && !/const principals = st\.access\.map\(/.test(mutated), 'CONTROL: a picker built from every live principal is caught by the same pin');
  const acctOrder = [...PANEL.matchAll(/registerMenuItem\(\{ menu: M, group: '1_rows', order: (\d+), when: \(c\) => !A\(c\)\.builtin, label: \(\) => t\('([^']+)'\)/g)].map((m) => `${m[1]}:${m[2]}`);
  ok(acctOrder.join() === '9:Reach & policy…,10:Grant access…,11:Notify…,12:Conversations matching a rule…', 'the account ⋯: Reach & policy… (9 — lane account-policy-door: the whole account\'s policy + access + Notify door), Grant access… (10), Notify… (11), then the rule grain (12)', acctOrder.join());
  ok(/label: \(\) => t\('Grant access…'\),\s*\n\s*run: \(c\) => showGrantAccessDialog\(c\.app, \{ kind: 'conversation', conv: c\.conv \}\)/.test(PANEL) && /label: \(\) => t\('Notify…'\),\s*\n\s*run: \(c\) => showNotifyDialog\(c\.app, \{ kind: 'conversation', conv: c\.conv \}\)/.test(PANEL), 'the conversation row menu offers the same two operations');
  const zh = (await import(path.join(REPO, 'src/lib/i18n-zh.js'))).default, ja = (await import(path.join(REPO, 'src/lib/i18n-ja.js'))).default;
  const RETIRED = ['Hand to an agent…', 'Handed to an agent — edit…', 'Handed to {who}', 'Hand the whole account to an agent — {label}', 'Assign to an agent…', 'Unassign', 'by assignment'];
  const srcAll = ['src/lib/channels-panel.js', 'src/lib/channel-filter-editor.js', 'src/lib/channel-window.js', 'src/lib/channel-words.js', 'src/lib/channel-reach-editor.js'].map((f) => fs.readFileSync(path.join(REPO, f), 'utf-8')).join('\n');
  const alive = RETIRED.filter((k) => srcAll.includes(`t('${k}')`) || k in zh || k in ja);
  ok(!alive.length, `the retired single-assignment verb and its words are gone from the code AND both dictionaries (${RETIRED.length} keys)`, alive.join(' | '));
  // channel-polish: the three plain questions — each clamp is said under ITS answer's field while that answer is chosen
  // (channel-render verify round 2 made the cap ITS OWN line under both answers — its note is drawn whatever the `how`;
  //  round 4 found this pin still spelling the pre-round-2 third-answer form: the heavy row was red on the lane)
  ok(/digestClamp\.textContent = howNow\(\) === 'digest' \? d\.note : ''/.test(ED) && /capClamp\.textContent = c\.note;/.test(ED) && /clampNoteText\(max, 'max'\)/.test(ED), 'a number past its bound is CLAMPED VISIBLY in the Notify dialog (the digest window and the daily cap each say "kept at the maximum, N" under their own field)');
  // block comments FIRST, then whole-line // comments (the other order drops a JSDoc's closing
  // `*/` line and lets the block pattern swallow the code up to the NEXT comment's end)
  const strip = (x) => x.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const judge = (x) => [...strip(x).matchAll(/\.(innerHTML|outerHTML)\s*=\s*([^;\n]+)|insertAdjacentHTML\(([^;\n]+)/g)].map((m) => (m[2] || m[3] || '').trim()).filter((r) => !/^UI_ICONS\[|^''$|^""$/.test(r));
  ok(judge(ED).length === 0, 'XSS: the access / notify editor writes no innerHTML — every principal name, rule and estimate is textContent', JSON.stringify(judge(ED)));
  ok(judge(ED.replace("row.dataset.principal = r.key;", "row.innerHTML = r.key;")).length === 1, 'CONTROL: a planted `row.innerHTML = r.key` in the editor is flagged by the same judge');
}

console.log('⑩ a restart keeps everything; the migration turns tracked into hot');
{
  const src = fs.readFileSync(path.join(REPO, 'src/server/migrations.js'), 'utf-8');
  ok(/id: '2026-09-channels-aggregated-im'/.test(src) && /migrateAggregated\(\)/.test(src), 'the migration is REGISTERED in src/server/migrations.js through the engine\'s serialized door');
}

console.log(fail ? `\nFAILED (${pass} passed, ${fail} failed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
