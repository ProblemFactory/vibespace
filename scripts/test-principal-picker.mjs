#!/usr/bin/env node
// THE PRINCIPAL PICKER (fast, PURE + source censuses; 2026-09-27, lane
// channel-polish — the owner: "如果 session 特别多的话，你现在的那个选择
// session/group 的 dropdown 交互会很不友好").
//
//   ① the model's tables over a 14-row fixture roster: the accent / case
//     fold, the FILTER (every token must match: name / folder / Task Group /
//     backend substring, or an id prefix; CJK by substring) and its RANK
//     (name prefix < word start < substring < Task Group < folder < backend
//     < id; ties keep the roster's order), the SECTIONS (Task Groups, then
//     sessions under their Task Group by title, then Other), RECENT pinning,
//     the recent list's arithmetic, the keyboard walk, a folder's tail, the
//     identity, the ONE initials implementation
//   ② the CENSUS: every former principal <select> / checkbox roster site now
//     calls the picker, and no `<select>` built from a principal roster is
//     left anywhere in src/lib — the pre-picker reach editor as the control
//   ③ patched-copy controls: a fold without NFKD, a grouping without its
//     sort, a filter that ORs its tokens — each turns its own leg red
// Run: node scripts/test-principal-picker.mjs
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
import { anchored } from './scratch.mjs';   // lane lg-group-parents (restack 415): the chain's controls by anchor (mutant-copy already loads scratch.mjs)

const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const t0 = Date.now();
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? '\n    ' + e : '')); } };
// B-0d3e: a red control's product edit, its anchor judged BY NAME — any count but one (for 'all' / 'join' / 'first' or a /g
// anchor: none) is a red row of this suite's own check naming the anchor and the file; the copy is then built as before (nothing
// crashes). 'first' = an anchor the product holds more than once today: the first one is patched, as it always was
function editAnchor(text, from, to, file, mode = 'one') {
  const t = String(text), re = from instanceof RegExp, many = mode !== 'one' || (re && from.global);
  const n = re ? [...t.matchAll(new RegExp(from.source, from.flags.replace(/[gy]/g, '') + 'g'))].length : t.split(String(from)).length - 1;
  if (many ? n === 0 : n !== 1) { const shown = re ? String(from) : JSON.stringify(String(from)).slice(0, 100); ok(false, `ANCHOR (${file}): ${shown} — found ${n} times, ${many ? 'at least one' : 'one'} meant: the copy is not the control it says`); }
  return mode === 'join' ? t.split(from).join(to) : mode === 'all' ? t.replaceAll(from, to) : t.replace(from, to);
}
const J = (x) => JSON.stringify(x);
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf-8');
const PM = await import(pathToFileURL(path.join(REPO, 'src/lib/principal-picker-model.js')).href);
const AV = await import(pathToFileURL(path.join(REPO, 'src/lib/channel-avatar.js')).href);

const agent = (id, name, { folder = '', backend = 'claude', g = [] } = {}) => ({ key: `agent:${id}`, kind: 'agent', id, name, folder, backend, live: true, groupIds: g.map((x) => x[0]), groupNames: g.map((x) => x[1]) });
const group = (id, name) => ({ key: `group:${id}`, kind: 'group', id, name, groupIds: [], groupNames: [] });
const OPS = ['t-ops', 'Ops triage'], FE = ['t-fe', 'Frontend'], BILL = ['t-bill', 'Billing'];
const ROSTER = [
  group('t-ops', 'Ops triage'), group('t-fe', 'Frontend'), group('t-bill', 'Billing'),
  agent('7f3a91c2', 'api lane', { folder: 'api', g: [OPS] }),
  agent('b0c1', 'API docs', { folder: 'docs', g: [FE] }),
  agent('c2d3', 'Élodie review', { folder: 'review', g: [FE] }),
  agent('d4e5', '部署助手', { folder: 'deploy', g: [OPS] }),
  agent('e6f7', 'Deploy bot', { folder: 'infra', backend: 'codex', g: [OPS] }),
  agent('f8a9', 'scratch', { folder: 'tmp' }),
  agent('a1b2', 'rapid prototype', { folder: 'proto' }),
  agent('c3d4', 'invoice sync', { folder: 'billing-sync', g: [BILL] }),
  agent('e5f6', 'report writer', { folder: 'reports', backend: 'codex', g: [BILL] }),
  agent('0a0b', 'ops pager', { folder: 'pager' }),
  agent('9c9d', 'notes', { folder: 'notes', backend: 'opencode' }),
];
const names = (rows) => rows.map((r) => r.name);

// ═══ ① the model ═══
console.log('① the model: fold, filter + rank, sections, recent, keyboard, tail, identity');
{
  ok(PM.foldText('Élodie ÅSA Crème') === 'elodie asa creme' && PM.foldText(null) === '', 'the fold: case- and accent-insensitive (NFKD, marks dropped)');
  const TABLE = [
    ['', names(ROSTER)],
    ['api', ['api lane', 'API docs', 'rapid prototype']],
    ['elo', ['Élodie review']],
    ['ÉLO', ['Élodie review']],
    ['部署', ['部署助手']],
    ['署助', ['部署助手']],
    ['fron', ['Frontend', 'API docs', 'Élodie review']],
    ['ops', ['Ops triage', 'ops pager', 'api lane', '部署助手', 'Deploy bot']],
    ['codex', ['Deploy bot', 'report writer']],
    ['7f3a', ['api lane']],
    ['api ops', ['api lane']],
    ['deploy', ['Deploy bot', '部署助手']],
    ['zzz', []],
  ];
  const bad = TABLE.map(([q, want]) => [q, want, names(PM.filterPrincipals(ROSTER, q))]).filter(([, want, got]) => J(want) !== J(got));
  ok(!bad.length, `the filter + rank table (${TABLE.length} queries: prefix < word start < substring < Task Group < folder < backend < id prefix; every token must match; CJK by substring; ties keep the roster's order)`, J(bad));
  const secs = PM.groupPrincipals(ROSTER);
  ok(J(secs.map((s) => [s.kind, s.title || null, names(s.rows)])) === J([
    ['groups', null, ['Ops triage', 'Frontend', 'Billing']],
    ['sessions-group', 'Billing', ['invoice sync', 'report writer']],
    ['sessions-group', 'Frontend', ['API docs', 'Élodie review']],
    ['sessions-group', 'Ops triage', ['api lane', '部署助手', 'Deploy bot']],
    ['sessions-other', null, ['scratch', 'rapid prototype', 'ops pager', 'notes']],
  ]), 'the SECTIONS: Task Groups, then each session under its Task Group (sorted by title), then Other', J(secs.map((s) => [s.kind, s.title, names(s.rows)])));
  ok(J(PM.groupPrincipals(PM.filterPrincipals(ROSTER, 'zzz'))) === '[]' && PM.groupPrincipals(PM.filterPrincipals(ROSTER, 'elo')).length === 1, 'an empty section is dropped');
  const rr = PM.rankRecent(ROSTER, ['agent:e6f7', 'group:t-fe', 'agent:gone']);
  ok(J(names(rr.recent)) === J(['Deploy bot', 'Frontend']) && rr.rest.length === ROSTER.length - 2 && rr.rest[0].name === 'Ops triage', 'RECENT: the recent keys that are in the list, newest first; the rest keeps its order; an unknown key is ignored', J(names(rr.recent)));
  let rec = [];
  for (const k of ['a', 'b', 'c', 'b', 'd', 'e', 'f', 'g', 'h', 'i']) rec = PM.pushRecent(rec, k);
  ok(J(rec) === J(['i', 'h', 'g', 'f', 'e', 'd', 'b', 'c']) && rec.length === PM.RECENT_MAX, `the recent list: a pick moves to the front, no duplicates, ≤ ${PM.RECENT_MAX}`, J(rec));
  const K = ['a', 'b', 'c'];
  ok(PM.moveActive(K, null, 1) === 'a' && PM.moveActive(K, null, -1) === 'c' && PM.moveActive(K, 'a', -1) === 'a' && PM.moveActive(K, 'c', 1) === 'c' && PM.moveActive(K, 'b', 1) === 'c' && PM.moveActive(K, 'zz', 1) === 'a' && PM.moveActive([], null, 1) === null, 'the keyboard walk: none active ⇒ first / last, clamped at both ends, an unknown active ⇒ the first');
  // verify round 3: WHAT ENTER PICKS — the highlighted row wherever a patch left it; else the first row ONLY while it is
  // the one the person's own act put there (a roster patch that moved another row to the top disarms Enter)
  const ET = [
    [{ active: null, visibleKeys: ['a', 'b'], armedFirst: 'a' }, 'a'],        // the person typed and sees a first
    [{ active: null, visibleKeys: ['b', 'c'], armedFirst: 'a' }, null],       // a's session died, b moved up: nothing
    [{ active: null, visibleKeys: ['a', 'b'], armedFirst: null }, null],      // never armed (a highlight vanished)
    [{ active: 'b', visibleKeys: ['a', 'b'], armedFirst: 'a' }, 'b'],         // ↓ chose b
    [{ active: 'b', visibleKeys: ['b', 'c'], armedFirst: 'a' }, 'b'],         // b kept by KEY through a patch
    [{ active: 'b', visibleKeys: ['c'], armedFirst: 'c' }, 'c'],              // (the picker clears both when b vanishes; the pure rule alone reads the armed first)
    [{ active: 'b', visibleKeys: [], armedFirst: null }, null],
    [{}, null],
  ];
  const badET = ET.filter(([f, want]) => PM.enterTarget(f) !== want).map(([f, want]) => [f, want, PM.enterTarget(f)]);
  ok(!badET.length, `enterTarget: ${ET.length} rows — the highlighted row by key, else the armed first row while still first, else nothing`, J(badET));
  const PK = read('src/lib/principal-picker.js');
  ok(/const k = PM\.enterTarget\(\{ active, visibleKeys, armedFirst, skip: everyoneKeys\(\) \}\);/.test(PK) && !/active \|\| visibleKeys\[0\]/.test(PK) && /if \(byPerson\) armedFirst = PM\.armableFirst\(visibleKeys, everyoneKeys\(\)\);[^\n]*\n\s*else if \(gone\) armedFirst = null;/.test(PK) && /refresh: \(\) => \{ rows = source\(\) \|\| \[\]; noteRows\(\); drawChips\(\); drawList\(\{ byPerson: false \}\);( syncExcept\(\);)? \}/.test(PK), 'PIN: Enter asks the PURE rule; the person\'s redraw arms the first row, a roster patch never does (and disarms when the highlight vanished)');
  // verify round 4: a refused Enter is SHOWN (the first row highlighted, picked by the next Enter through the highlighted-row
  // rule), and a redraw touches only the nodes that MOVED — `replaceChildren` detached every row and Chrome dropped the
  // click in flight on one (a trusted click across an `active-sessions` broadcast that changed nothing was lost)
  ok(/else if \(!k && !active && visibleKeys\.length\) \{[\s\S]{0,1100}?active = PM\.armableFirst\(visibleKeys, everyoneKeys\(\)\);\n\s*if \(!active\) return;\n\s*drawList\(\{ byPerson: false \}\);/.test(PK), 'PIN: a refused Enter (nothing armed, nothing highlighted) highlights the first row and picks nothing — the next Enter takes the HIGHLIGHTED row by key (lane everyone-principal: the first row that is not ALL AGENTS)');
  ok(!/\.replaceChildren\(/.test(PK) && /reconcile\(list, out\);/.test(PK) && /reconcile\(chips, out\);/.test(PK) && /for \(let i = 0; i < out\.length; i\+\+\) if \(kids\[i\] !== out\[i\]\) parent\.insertBefore\(out\[i\], kids\[i\] \|\| null\);/.test(PK), 'PIN: the list and the chips are reconciled in place (a node already at its place is never detached) — never replaceChildren');
  // verify round 5: a HELD Enter is one Enter — the OS auto-repeat (~30 Hz after its delay) toggled the first row of a
  // multi picker on and off per repeat (measured with trusted CDP `autoRepeat: true`: ∅ / picked / ∅ / picked …), the
  // final pick the parity of the hold; a repeat picks nothing, the highlight / arm rules are asked only by a new press
  ok(/\} else if \(enterSubmits\(e\)\) \{\n\s*e\.preventDefault\(\); e\.stopPropagation\(\);\n(?:\s*\/\/[^\n]*\n)*\s*if \(e\.repeat\) return;/.test(PK), 'PIN (round 5): an Enter auto-repeat (`e.repeat`) is consumed and picks NOTHING — a held Enter is one Enter, never a 30 Hz toggle of the first row');
  ok(PM.folderTail('/home/a/work/api') === 'api' && PM.folderTail('/home/a/work/api/') === 'api' && PM.folderTail('box: /srv/x/') === 'box: x' && PM.folderTail('/') === '/' && PM.folderTail('') === '', 'a folder\'s tail (a host label kept)');
  ok(PM.identityOf(ROSTER[0]) === 'group:t-ops' && PM.identityOf(ROSTER[3]) === 'agent:7f3a91c2', 'the identity every dialog remembers a pick by (never a caller\'s own key)');
  ok(PM.initialsOf === AV.initialsOf && PM.initialsOf('Ops triage') === 'OT', 'ONE initials implementation (the avatar rule\'s, re-exported)');
}

// ═══ ①b ALL AGENTS (lane everyone-principal, 2026-10-02) ═══
console.log('①b ALL AGENTS: first, never hidden by a search, never a recent pick, never Enter\'s fallback, its chip first');
{
  const ALL = PM.everyoneRow({ key: 'everyone:*', name: 'All agents', hint: 'every conversation, now and later' });
  ok(ALL.kind === 'everyone' && ALL.id === PM.EVERYONE_ID && PM.EVERYONE_ID === '*' && PM.isEveryone(ALL) && !ALL.disabled && J(PM.PRINCIPAL_KINDS) === J(['everyone', 'group', 'agent']), 'the model answers `everyone` as a principal kind — one id (*), never disabled');
  ok(PM.identityOf(ALL) === 'everyone:*', 'its identity is everyone:* (one row in every dialog)');
  const R2 = [...ROSTER, ALL];   // the caller may hand it anywhere — it is drawn first
  const FIRST = [['', 'All agents'], ['api', 'All agents'], ['zzz', 'All agents'], ['部署', 'All agents'], ['7f3a', 'All agents']];
  const badF = FIRST.map(([q, want]) => [q, want, names(PM.filterPrincipals(R2, q))]).filter(([, want, got]) => got[0] !== want);
  ok(!badF.length, `a search never hides it and it is always first (${FIRST.length} queries, one matching nothing)`, J(badF));
  ok(J(names(PM.filterPrincipals(R2, 'api'))) === J(['All agents', 'api lane', 'API docs', 'rapid prototype']) && J(names(PM.filterPrincipals(R2, 'zzz'))) === J(['All agents']), 'the named rows keep their own filter + rank behind it');
  const secs = PM.groupPrincipals(PM.filterPrincipals(R2, ''));
  ok(secs[0].kind === 'everyone' && secs[0].rows.length === 1 && secs[1].kind === 'groups', 'the sections: ALL AGENTS first (its own), then Task Groups, then sessions');
  const rr = PM.rankRecent(R2, ['everyone:*', 'agent:e6f7']);
  ok(J(names(rr.recent)) === J(['Deploy bot']) && rr.rest.includes(ALL), 'it is never a recent pick (always first already)');
  ok(PM.armableFirst(['everyone:*', 'agent:a', 'agent:b'], ['everyone:*']) === 'agent:a' && PM.armableFirst(['everyone:*'], ['everyone:*']) === null && PM.armableFirst(['agent:a'], []) === 'agent:a', 'Enter\'s fallback never lands on it: the first visible row that is not ALL AGENTS (none ⇒ nothing)');
  ok(PM.enterTarget({ active: 'everyone:*', visibleKeys: ['everyone:*', 'agent:a'], armedFirst: 'agent:a' }) === 'everyone:*', 'highlighted with ↑ / ↓, Enter takes it (the highlighted-row rule)');
  // the armed row is "still first" when it is the first ARMABLE row — All sits above it in every list (the heavy exit
  // dialog leg caught the first spelling: `keys[0] === armed` never held again, and "运维" + Enter picked nothing)
  const ET2 = [
    [{ active: null, visibleKeys: ['everyone:*', 'group:ops', 'agent:a'], armedFirst: 'group:ops', skip: ['everyone:*'] }, 'group:ops'],
    [{ active: null, visibleKeys: ['everyone:*', 'agent:b', 'group:ops'], armedFirst: 'group:ops', skip: ['everyone:*'] }, null],
    [{ active: null, visibleKeys: ['everyone:*'], armedFirst: null, skip: ['everyone:*'] }, null],
    [{ active: 'everyone:*', visibleKeys: ['everyone:*', 'agent:a'], armedFirst: 'agent:a', skip: ['everyone:*'] }, 'everyone:*'],
  ];
  const badET2 = ET2.filter(([f, want]) => PM.enterTarget(f) !== want).map(([f, want]) => [f, want, PM.enterTarget(f)]);
  ok(!badET2.length, `enterTarget with ALL AGENTS above the list: the armed row is taken while it is the first ARMABLE row (${ET2.length} rows)`, J(badET2));
  const KS = ['everyone:*', 'agent:a', 'agent:b'], SK = { skip: ['everyone:*'] };
  ok(PM.moveActive(KS, null, 1, SK) === 'agent:a' && PM.moveActive(KS, 'agent:a', -1, SK) === 'everyone:*' && PM.moveActive(KS, null, -1, SK) === 'agent:b' && PM.moveActive(['everyone:*'], null, 1, SK) === 'everyone:*' && PM.moveActive(KS, null, 1) === 'everyone:*', 'the keyboard: the FIRST ↓ lands on the first named row (typing then ↓ highlights a match), All is one ↑ above it; only All visible ⇒ ↓ reaches it');
  ok(J(PM.chipOrder(['agent:a', 'group:g', 'everyone:*'], ['everyone:*'])) === J(['everyone:*', 'agent:a', 'group:g']), 'its chip is drawn first, the picks after it in the order they were made');
  const PK = read('src/lib/principal-picker.js');
  ok(/const allRow = everyone && typeof everyone === 'object' \? PM\.everyoneRow\(/.test(PK) && /for \(const s of secs\) if \(s\.kind === 'everyone'\) s\.rows\.forEach\(add\);\n\s*if \(recent\.length\)/.test(PK) && /if \(PM\.isEveryone\(row\)\) return;/.test(PK) && /PM\.chipOrder\(sel, everyoneKeys\(\)\)/.test(PK), 'PIN: the DOM half injects the row (an object option), draws it ABOVE Recent, never remembers it, orders the chips through the model');
  ok(!/pp-row-everyone[^\n]*disabled/.test(PK) && /never disabled|Never disabled/.test(read('src/lib/principal-picker-model.js')), 'PIN: the All row is never a greyed hint (no disabled path names it)');
}

// ═══ ② the census ═══
console.log('①c A STORED ROW DRAWN — rowToPick / pickToRow (the grant model\'s spelling); r11: an entry with its principal\'s key is drawn BY it');
{
  const g = ROSTER.find((r) => r.kind === 'group'), a = ROSTER.find((r) => r.kind === 'agent');
  const plain = PM.rowToPick({ to: [{ kind: 'group', id: g.id }, { kind: 'conversation', key: a.id }], except: [] }, ROSTER);
  ok(J(plain.selected) === J([g.key, a.key]) && !plain.extra.length, '①c a stored {kind, id|key} entry is drawn as the roster\'s own row (control)', J(plain));
  // lane vault-standing-request r11 (主开发's acceptance of r10, MAJOR): a published vault-use member carried the GRANT id in a Task
  // Group's `id` — the dialog drew an extra `group:vg-…` row and saved a group that does not exist; its `principal` key is the truth
  const pub = PM.rowToPick({ to: [{ kind: 'group', id: 'vg-1a2b3c4d', grant: 'vg-1a2b3c4d', principal: `group:${g.id}`, name: g.name }, { kind: 'conversation', key: a.id, principal: `conversation:${a.id}` }], except: [{ kind: 'conversation', key: 'gone-1', principal: 'conversation:gone-1', name: 'Gone' }] }, ROSTER, { notRunning: 'not running now' });
  const back = PM.pickToRow([...ROSTER, ...pub.extra], pub.selected, []);
  ok(J(pub.selected) === J([g.key, a.key]) && J(pub.except) === J(['agent:gone-1']) && J(pub.extra.map((x) => x.key)) === J(['agent:gone-1']) && J(back.to) === J([{ kind: 'group', id: g.id }, { kind: 'conversation', key: a.id }]), '①c r11: an entry carrying its principal\'s KEY (`principal`) is drawn by it — the roster\'s Task Group row whatever its `id` says, and saved back as `group:<its id>` (7e99ef689: an extra `group:vg-…` row, saved as that)', J({ pub, back }));
}

console.log('② the census: every principal pick is the picker; no <select> of a roster is left');
{
  const SITES = {
    'src/lib/channel-reach-editor.js': /principalPicker\(\{/,
    'src/lib/channel-filter-editor.js': /principalPicker\(\{/,
    'src/lib/channel-group-dialogs.js': /principalPicker\(\{/,
    'src/lib/window-share.js': /principalPicker\(\{/,
    'src/lib/exit-access-dialog.js': /principalPicker\(\{ items, app, multi: true/, // lane-pairing ⑥: "Who can use <machine>?" — two lists, each the ONE picker (multi)
  };
  for (const [f, re] of Object.entries(SITES)) ok(re.test(read(f)) && /from '\.\/principal-picker\.js'/.test(read(f)), `${f} picks its principals with the ONE picker`);
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const ROSTER_WORDS = /\b(roster|principals?|choices|agents|sessions|_webuiSessions|_tasks|members)\b/;
  /** every `<select>` whose OPTIONS come from a roster of sessions / groups: a select variable filled by a
   *  loop over a roster, or `selectBox(<a roster>…)` */
  const judge = (src) => {
    const s = strip(src), hits = [];
    for (const m of s.matchAll(/(?:const|let)\s+(\w+)\s*=\s*(?:el\('select'[^)]*\)|document\.createElement\('select'\))/g)) {
      const v = m[1], after = s.slice(m.index, m.index + 1500);
      for (const l of after.matchAll(/for \(const \w+ of ([^)]+)\)/g)) {
        const body = after.slice(l.index, l.index + 320);
        if (ROSTER_WORDS.test(l[1]) && new RegExp(`\\b${v}\\.appendChild\\(`).test(body)) { hits.push(`${v} ← ${l[1].trim()}`); break; }
      }
    }
    for (const m of s.matchAll(/selectBox\(([^\n]{0,160})/g)) if (ROSTER_WORDS.test(m[1].split(/\)\s*,/)[0])) hits.push('selectBox(' + m[1].slice(0, 60));
    return hits;
  };
  const files = fs.readdirSync(path.join(REPO, 'src/lib')).filter((f) => f.endsWith('.js'));
  const found = {};
  for (const f of files) { const h = judge(read(`src/lib/${f}`)); if (h.length) found[f] = h; }
  ok(!Object.keys(found).length, `no <select> built from a principal roster is left in src/lib (${files.length} files)`, J(found));
  let pre = null;
  // r5051 (d): HEAD~1 stopped holding the pre-picker editor long ago (the control was dead even on a full clone); the base is PINNED at
  // 3f1a6cd9d — the reach editor's last commit before the picker (8d9f94b42, 2026-09-28): it still builds `whoSel = el('select'…)`
  const PRE_PICKER = '3f1a6cd9d';
  try { pre = execFileSync('git', ['show', `${PRE_PICKER}:src/lib/channel-reach-editor.js`], { cwd: REPO, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch { pre = null; }
  const planted = "const whoSel = el('select', 'chan-opt-input');\nfor (const p of roster) { const op = el('option', '', p.name); whoSel.appendChild(op); }\n";
  ok(judge(planted).length === 1, 'CONTROL: a planted `<select>` filled from `roster` IS flagged by the same judge');
  // lane-pairing ⑥: a <select> planted into the exit dialog (its rows are the picker's shape) is red
  const exitSrc = read('src/lib/exit-access-dialog.js');
  const plantedExit = exitSrc.replace("const pickerWrap = el('div', 'exit-access-picker');", "const pickerWrap = el('div', 'exit-access-picker');\n      const whoSel = el('select', 'exit-who');\n      for (const r of roster()) { const op = el('option', '', r.name); whoSel.appendChild(op); }");
  ok(plantedExit !== exitSrc && judge(plantedExit).length === 1 && judge(exitSrc).length === 0, 'CONTROL: a `<select>` planted into exit-access-dialog.js (filled from its roster) is flagged; the real dialog is clean');
  if (pre) ok(/whoSel = el\('select'/.test(pre) && judge(pre).length >= 1, `CONTROL: the pre-picker reach editor (git ${PRE_PICKER}) is flagged — the census has teeth on the real shape`);
  else console.log(`  SKIP CONTROL: the pre-picker reach editor (${PRE_PICKER}) is not in this checkout (a depth-1 clone) — the planted control stands alone`);
}

// ═══ ③ patched-copy controls ═══
console.log('③ controls: a patched copy per rule turns its own leg red');
{
  const M = mutantCopies('principal-picker', REPO);
  const src = read('src/lib/principal-picker-model.js');
  const load = async (from, to, tag) => { if (!src.includes(from)) throw new Error(`ANCHOR GONE ${JSON.stringify(String(from).slice(0, 80))} — the control's anchor is not in the source — move it with the product line (B-0d3e)`); return import(pathToFileURL(M.write('src/lib/principal-picker-model.js', editAnchor(src, from, to, "src/lib/principal-picker-model.js"), tag, { esm: true })).href); };
  const a = await load(".normalize('NFKD').replace(/[\\u0300-\\u036f]/g, '')", '', 'nofold');
  ok(!!a && names(a.filterPrincipals(ROSTER, 'elo')).length === 0, 'CONTROL (a): a fold without NFKD misses "Élodie" for "elo" — ① reddens');
  const b = await load('const tgs = [...byTg.values()].sort((a, b) => String(a.title).localeCompare(String(b.title)));', 'const tgs = [...byTg.values()];', 'nosort');
  ok(!!b && b.groupPrincipals(ROSTER)[1].title === 'Ops triage', 'CONTROL (b): a grouping without its sort puts "Ops triage" before "Billing" — ① reddens');
  const c = await load('for (const tok of toks) { const r = tokenRank(row, tok); if (r < 0) return; score += r; }', 'let any = false; for (const tok of toks) { const r = tokenRank(row, tok); if (r >= 0) { any = true; score += r; } } if (!any) return;', 'or');
  ok(!!c && names(c.filterPrincipals(ROSTER, 'api ops')).length > 1, 'CONTROL (c): a filter that ORs its tokens keeps more than "api lane" for "api ops" — ① reddens');
  // (d) verify round 3: Enter with the first-row fallback UNARMED (the pre-fix rule) — the row that moved up is picked
  const d = await load("  if (armedFirst != null && first != null && first === String(armedFirst)) return first;", '  if (first != null) return first;', 'unarmed');
  ok(!!d && d.enterTarget({ active: null, visibleKeys: ['b', 'c'], armedFirst: 'a' }) === 'b', 'CONTROL (d): without the arm, Enter after a roster patch picks the row that moved to the top — the person never saw it first (① reddens)');
  for (const x of copiesCensus(M.files, M.dir, REPO, { minCopies: 4 })) ok(x.pass, 'tree: ' + x.name, x.detail);
}

// lane lg-group-parents U5b: «仅本组» rides the pick ↔ row mapping
console.log('⑭ lane lg-group-parents U5b: «仅本组» (only) on a picked Task Group — the pick writes it, a stored row draws it');
{
  const G = ROSTER.find((r) => r.kind === 'group');
  if (G) {
    const on = PM.pickToRow(ROSTER, [G.key], [], { only: [G.key] }).to[0];
    const off = PM.pickToRow(ROSTER, [G.key], [], { only: [], onlyWas: [G.key] }).to[0];
    const silent = PM.pickToRow(ROSTER, [G.key], []).to[0];
    ok(on.only === true && off.only === false && !('only' in silent), 'pickToRow: switched on ⇒ only:true; stored on and switched off ⇒ only:false (the writer widens only then); a door that does not offer it says nothing');
    const drawn = PM.rowToPick({ to: [{ kind: 'group', id: G.id, only: true }], except: [] }, ROSTER);
    ok(JSON.stringify(drawn.only) === JSON.stringify([G.key]) && JSON.stringify(PM.rowToPick({ to: [{ kind: 'group', id: G.id }] }, ROSTER).only) === '[]', 'rowToPick: a stored «仅本组» group entry is drawn into `only` by its picker key');
  } else ok(false, 'the roster fixture holds a Task Group row');
  const ppSrc = fs.readFileSync(path.join(REPO, 'src/lib/principal-picker.js'), 'utf-8');
  ok(/const onlyOffered = !!\(only && typeof only === 'object'\);/.test(ppSrc) && /if \(onlyOffered && r\.kind === 'group' && !exceptChips\)/.test(ppSrc) && /onlyKeys: \(\) => \(onlyOffered \? sel\.filter\(\(k\) => onlySet\.has\(k\)\) : null\)/.test(ppSrc), 'the picker: the switch only on a door that offers it, only on group chips; onlyKeys() answers the picked groups switched on (null when not offered)');
}

console.log('⑮ the chain\'s cure (B1): what a chip SAYS a Task Group entry admits is what the grant model admits — every state walked');
{
  const req = (await import('node:module')).createRequire(import.meta.url);
  const GM = req(path.join(REPO, 'src/grant-model.js'));
  const P = { kind: 'group', id: 'tg-p' };
  const child = { conversationKeys: ['k1'], groupIds: ['tg-c'], inheritedGroupIds: ['tg-p'] }, inP = { conversationKeys: ['k2'], groupIds: ['tg-p'] };
  // each state: how the door draws the entry (entryReach's options) and the row it writes
  const STATES = [
    { name: 'a group picked (the default)', opts: {}, row: { door: 'exit', resource: 'm1', to: [P], except: [] } },
    { name: 'a group marked «仅本组»', opts: { only: true }, row: { door: 'exit', resource: 'm1', to: [{ ...P, only: true }], except: [] } },
    { name: 'an exception on a group', opts: { except: true }, row: { door: 'exit', resource: 'm1', to: [{ kind: 'everyone' }], except: [P] } },
    { name: 'a group on the visibility door', opts: { own: true }, row: { door: 'group-visibility', resource: 'tg-x', to: [P], except: [] } },
  ];
  // what each word CLAIMS of a conversation in a CHILD group and of one in the group itself
  const CLAIM = { children: { child: 'ok', own: 'ok' }, only: { child: 'no', own: 'ok' }, always: { child: 'excepted', own: 'excepted' }, own: { child: 'no', own: 'ok' } };
  const said = (v) => (v.ok ? 'ok' : v.code === 'excepted' ? 'excepted' : 'no');
  const walk = (Model, Pick) => STATES.map((s) => { const reach = Pick.entryReach({ kind: 'group', key: 'group:tg-p', id: 'tg-p' }, s.opts); return { name: s.name, reach, child: said(Model.admits([s.row], child)), own: said(Model.admits([s.row], inP)), claim: CLAIM[reach] || null }; });
  const bad = (rows) => rows.filter((r) => !r.claim || r.child !== r.claim.child || r.own !== r.claim.own);
  const real = walk(GM, PM);
  ok(real.length === 4 && new Set(real.map((r) => r.reach)).size === 4 && bad(real).length === 0, 'every state: the chip\'s words (entryReach) claim exactly what the grant model admits — of a child group\'s conversation and of the group\'s own', J(real));
  // CONTROLS (each must go red): a model that ignores «仅本组»; a picker model that calls every group entry «and its child groups»
  const M2 = mutantCopies('picker-reach', REPO);
  try {
    const gsrc = read('src/grant-model.js');
    const HIT = '(!e.only && toInherited && toInherited.has(e.id))';
    ok(gsrc.split(HIT).length === 2, 'CONTROL setup: the model\'s «仅本组» check is found exactly once');
    const GMx = M2.load('src/grant-model.js', anchored(gsrc, HIT, '(toInherited && toInherited.has(e.id))', 'ignores-only'), 'ignores-only');
    ok(bad(walk(GMx, PM)).length > 0, 'CONTROL: a model that ignores «仅本组» admits the child the chip says is left out — the leg above would be red');
    const psrc = read('src/lib/principal-picker-model.js');
    const RCH = "  return only ? 'only' : 'children';";
    ok(psrc.split(RCH).length === 2, 'CONTROL setup: entryReach\'s «仅本组» answer is found exactly once');
    const PMx = await import(pathToFileURL(M2.write('src/lib/principal-picker-model.js', anchored(psrc, RCH, "  return 'children';", 'reach-always-children'), 'reach-always-children', { esm: true })).href);
    ok(bad(walk(GM, PMx)).length > 0, 'CONTROL: a chip that says «and its child groups» on a «仅本组» entry claims a child the model refuses — the leg above would be red');
  } finally { try { fs.rmSync(M2.dir, { recursive: true, force: true }); } catch { } }
  // the chips draw THESE words (the switch's face is the entry's reach; an exception chip says «…, always»)
  const ppSrc2 = read('src/lib/principal-picker.js');
  ok(/const reach = PM\.entryReach\(r, \{ except: exceptChips, only: onlyOffered && onlySet\.has\(String\(r\.key\)\) \}\);/.test(ppSrc2) && /o\.textContent = reachWords\(reach\);/.test(ppSrc2) && /\} else if \(reach\) c\.appendChild\(el\('span', 'pp-chip-reach', reachWords\(reach\)\)\);/.test(ppSrc2) && /chipPrefix: t\('Except: '\), exceptChips: true,/.test(ppSrc2), 'the picker draws the reach words on every Task Group chip (the switch\'s face; an exception chip «and its child groups, always»)');
}

// r600 (3) — THE OWNER'S FINGER RULE (lane lg-group-parents, row B-91a7 U5b / cure C2; the hosted run 44818862371 placed test-channels-i18n's
// THE LOOK on it: «button.pp-chip-only» 13–17 px tall in the channel access dialog's phone shot, zh / ja / en). On a finger device every
// control the grant picker draws is a 44 px touch target that does not overlap its neighbours, written ONCE on the picker's own classes
// (every surface that draws the picker) — never a dialog's own rule that undercuts it, never an exemption in the suite. A CSS census:
// each control's coarse-pointer rule gives ≥ 44 px; no rule after it (and no higher-specificity rule anywhere) sets a picker control
// below 44; the suite exempts no picker class. RED (anchored): the finger rule removed; a dialog's own 36 px copy planted back.
{
  const FINGER = ['.pp-chip-only', '.pp-chip-x', '.pp-kept-x', '.pp-input', '.pp-trigger', '.pp-except-toggle', '.pp-chip-door', '.pp-row', '.pp-chip', '.pp-kept-chip'];
  const px = (v) => { const m = /^(\d+(?:\.\d+)?)px$/.exec(String(v || '').trim()); return m ? Number(m[1]) : null; };
  const rulesOf = (css) => {
    const s = css.replace(/\/\*[\s\S]*?\*\//g, ''), out = [];
    const walk = (txt, media, base) => {
      let i = 0;
      while (i < txt.length) {
        const ob = txt.indexOf('{', i); if (ob < 0) break;
        const head = txt.slice(i, ob).trim();
        let d = 1, j = ob + 1; while (j < txt.length && d) { if (txt[j] === '{') d++; else if (txt[j] === '}') d--; j++; }
        const body = txt.slice(ob + 1, j - 1);
        if (head.startsWith('@media')) walk(body, head, base + ob + 1);
        else if (!head.startsWith('@')) out.push({ at: base + i, media, sels: head.split(',').map((x) => x.trim()), decl: Object.fromEntries(body.split(';').map((x) => x.split(':')).filter((p) => p.length >= 2).map(([k, ...v]) => [k.trim(), v.join(':').trim()])) });
        i = j;
      }
    };
    walk(s, null, 0);
    return out;
  };
  const fingerFailures = (css, i18nSuite) => {
    const R = rulesOf(css), bad = [];
    const coarse = R.filter((r) => r.media && /pointer:\s*coarse/.test(r.media) && /max-width:\s*480px/.test(r.media));   // a finger device AND a phone-width window (an emulated phone has no touch)
    let lastAt = -1;
    for (const cls of FINGER) {
      const own = coarse.filter((r) => r.sels.includes(cls));
      const hit = own.find((r) => (px(r.decl['min-height']) || px(r.decl.height) || 0) >= 44);
      if (!hit) { bad.push(`${cls}: no coarse-pointer rule of its own gives a 44 px target`); continue; }   // (the rule's media: a finger device or a phone-width window)
      lastAt = Math.max(lastAt, hit.at);
      if (cls === '.pp-chip-only' && !((px(hit.decl['min-width']) || 0) >= 44)) bad.push('.pp-chip-only: its coarse-pointer rule gives no 44 px width');
      if ((cls === '.pp-chip-x' || cls === '.pp-kept-x') && !((px(hit.decl.width) || 0) >= 44)) bad.push(`${cls}: its coarse-pointer rule gives no 44 px width`);
    }
    for (const r of R) for (const sel of r.sels) {
      const last = (sel.split(/[\s>+~]+/).pop() || '');
      const cls = FINGER.find((c) => last === c);
      if (!cls) continue;
      const h = px(r.decl['min-height']) ?? px(r.decl.height);
      const compound = sel !== cls;
      if (h !== null && h < 44 && (compound || r.at > lastAt)) bad.push(`«${sel}» sets ${cls} to ${h} px${compound ? ' (a dialog\'s own rule outranks the picker\'s)' : ' (after the finger rule)'}`);
    }
    // the option list on a finger device: three 44 px rows (it scrolls) — the bigger targets never push a dialog's parts past its box
    const listRule = coarse.find((r) => r.sels.includes('.pp-list') && r.sels.includes('.bwho-dialog .pp-list') && (px(r.decl['max-height']) || 999) <= 140);
    if (!listRule) bad.push('the picker\'s option list keeps its desktop height on a finger device (its bigger rows push a dialog\'s parts past its box)');
    // r767: THE BOUND FOLLOWS THE ROOM — a phone-width window or a SHORT finger window; never every finger device (a tall tablet keeps its list)
    else if (/(^@media|,)\s*\(pointer:\s*coarse\)\s*(,|$)/.test(listRule.media) || !/\(max-height:\s*\d+px\)/.test(listRule.media)) bad.push('the option list\'s three-row bound follows the finger, not the room (a tall finger window gets it too)');
    else for (const r of R) if (r.at > listRule.at && r.sels.some((x) => /(^|\s)\.pp-list$/.test(x)) && (px(r.decl['max-height']) || 0) > 140) bad.push(`«${r.sels.join(', ')}» raises the option list past three rows after the finger rule`);
    const ex = (/IM_TARGET_EXEMPT\s*=\s*([^;]+);/.exec(i18nSuite) || [])[1] || '';
    if (/pp-chip|pp-row|pp-input|pp-trigger/.test(ex)) bad.push('test-channels-i18n exempts a picker control from the target census');
    return bad;
  };
  const css = read('public/style.css'), i18n = read('scripts/test-channels-i18n.mjs');
  const fb = fingerFailures(css, i18n);
  console.log(`    judged (the finger rule over public/style.css): ${JSON.stringify(fb)}`);
  ok(fb.length === 0, 'r600 (3): on a finger device every control the grant picker draws (the «仅本组» switch, the chip and its ×, the kept ×, the input, the trigger, the rows, the doors) is a 44 px target, written ONCE on the picker\'s own classes and never undercut by a dialog', fb);
  const fr0 = css.indexOf('@media (pointer: coarse), (max-width: 480px) {\n  .pp-input, .pp-trigger, .pp-except-toggle, .pp-chip-door, .pp-row { min-height: 44px; }'), fr1 = css.indexOf('\n}\n', fr0) + 3;
  const noRule = fr0 > 0 ? anchored(css, css.slice(fr0, fr1), '', 'finger-rule-gone') : css;
  const dlg = anchored(css, "  /* r600 (3): the exit dialog's own copies of the picker's phone targets are gone", "  .exit-access-dialog .pp-chip { min-height: 36px; }\n  /* r600 (3): the exit dialog's own copies of the picker's phone targets are gone", 'dialog-undercut');   // stale-pins: kept (the RED plants the dialog's old 36 px copy back)
  const LM = '@media (max-width: 480px), (pointer: coarse) and (max-height: 800px) {\n  .pp-list, .pp-pop .pp-list';
  const rC = fingerFailures(anchored(css, LM, '@media (pointer: coarse), (max-width: 480px) {\n  .pp-list, .pp-pop .pp-list', 'list-bound-by-finger'), i18n);   // stale-pins: kept (the RED plants the finger-only media back)
  const rA = fingerFailures(noRule, i18n), rB = fingerFailures(dlg, i18n);
  console.log(`    judged (RED: the finger rule removed): ${JSON.stringify(rA.slice(0, 3))} · (RED: a dialog's 36 px copy planted back): ${JSON.stringify(rB)}`);
  ok(fr0 > 0 && rA.some((b) => /^\.pp-chip-only: no coarse-pointer rule/.test(b)), 'NEGATIVE CONTROL: the stylesheet without the finger rule fails — the «仅本组» switch has no 44 px target', rA);
  console.log(`    judged (RED r767: the list's bound by the finger): ${JSON.stringify(rC)}`);
  ok(rC.some((b) => /follows the finger, not the room/.test(b)), 'NEGATIVE CONTROL (r767): the option list bounded for EVERY finger device fails — a tall tablet would get a three-row list', rC);
  ok(rB.some((b) => /exit-access-dialog \.pp-chip/.test(b)), 'NEGATIVE CONTROL: a dialog\'s own 36 px copy of the chip planted back fails — it outranks the picker\'s rule', rB);   // stale-pins: kept (the RED plants the dialog's old 36 px copy back)
}

console.log(`\n(${Date.now() - t0} ms)`);
console.log(fail ? `\nFAILED (${pass} passed, ${fail} failed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
