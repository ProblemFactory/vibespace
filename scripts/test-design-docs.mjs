#!/usr/bin/env node
// THE DESIGN WINDOW'S TEACHING, HELD TO THE CODE (lane design-docs-removal, L3 of docs/design-design-window.md §3.6 /
// §3.9; fast, in-process). The agent learns the Design window from two texts `vibespace-docs design` prints —
// docs/agent/design-manual.md (the CLI) and docs/agent/design-skill.md (OUR craft rules) — and from ONE line of the
// SessionStart tools intro. Prose drifts from a runtime silently (the cut table's risk row: "drift vs runtime ⇒ a
// census over the manifest keys named"), so this suite reads the texts against the modules they describe:
//   ① the manual vs the PURE model: its example design.json VALIDATES; every key of KEYS, every note colour, both
//      print modes and the bounds are named; every refusal code it lists is a code the model (or the hub) answers;
//   ② the manual vs the CLI: every verb data/bin/vibespace-design dispatches is documented as a command line and
//      the manual documents no verb the CLI lacks; every flag the CLI parses is named;
//   ③ the craft rules carry each rule the design names (§3.6), in our words;
//   ④ the topic: `design` serves BOTH files, in order, through the REAL route (setupAgentRoutes on a fake app), and
//      the ci-gate's parse of AGENT_DOC_TOPICS still sees both as gate inputs; an unknown / inherited topic is a 404;
//   ⑤ the tools intro: the design line teaches vibespace-design + its manual, and the whole intro (the largest
//      variant) stays under the 9600 B inline cap;
//   ⑥ the Claude CLI kit stays GONE (step 2): its module and suite do not exist, no verb / route / getter / symbol of
//      it is spelled anywhere in the tracked tree outside the history (changelogs, design records, the migration
//      that deletes data/design-kit/, the negative pins, one kb retirement paragraph) — so the donor rung's additions
//      (lane design-kit-287, shipped in .200) cannot survive the integration that deletes the kit;
//   ⑦ controls: planted variants of the real texts and planted hits (in memory — nothing is written) each go RED by
//      the rule they break, so every census above is what catches its plant.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { gitEnvFrom } from './git-env.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? ' — ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 600) : '')); } };
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');

const M = require(path.join(REPO, 'src/design-model.js'));
const MANUAL = read('docs/agent/design-manual.md');
const SKILL = read('docs/agent/design-skill.md');
const CLI = read('data/bin/vibespace-design');
const HUB_CODES = ['not_registered', 'bad_questions', 'not_yours', 'bad_file', 'not_previewable', 'no_system', 'ambiguous', 'no_tokens', 'bad_tokens'];   // + lane design-systems-home: new --system   // the engine's own refusals the manual names (src/server/design-engine.js; lane design-ask: ask / preview)
const DE_STATUS = require(path.join(REPO, 'src/server/design-engine.js')).STATUS;

// ── the censuses, as functions over a text (the controls run them over planted variants) ──
/** ① The manual's example manifest: the FIRST ```json block. */
function exampleOf(text) { const m = /```json\n([\s\S]*?)\n```/.exec(text); return m ? m[1] : null; }
function modelCensus(text) {
  const out = [];
  const ex = exampleOf(text);
  if (!ex) out.push('no ```json example');
  else { const v = M.validateManifest(ex); if (!v.ok) out.push('the example is refused: ' + v.refusals.map((r) => r.where + ' ' + r.code).join(', ')); }
  const keys = [...new Set(Object.values(M.KEYS).flat())];
  for (const k of keys) if (!text.includes(`"${k}"`)) out.push(`key "${k}" not named`);
  for (const c of M.NOTE_COLORS) if (!new RegExp(`\\b${c}\\b`).test(text)) out.push(`note colour ${c} not named`);
  for (const p of M.PRINT_MODES) if (!text.includes('`' + p + '`')) out.push(`print mode ${p} not named`);
  const L = M.LIMITS;
  const bounds = [
    [`${L.minSize}–${L.maxSize}`, 'w / h'], [`${L.artboards} rows`, 'artboards per design'], [`${L.pages}`, 'pages'],
    [`${L.notes} sticky notes`, 'notes'], [`${L.noteText} characters`, 'note text'], [`${L.noteMinW}–${L.noteMaxW}`, 'note w'],
    [`${L.coord}`, 'coordinates'], [`${L.title} characters`, 'title'], [`${L.artboardBytes / 1048576} MB`, 'artboard / image size'],
    [`${L.readBytes / 1048576} MB`, 'one read'], [`${L.refuseBytes / 1048576} MB`, 'publish refusal'], [`${L.warnBytes / 1048576} MB`, 'publish warning'],
    [`${L.defaultW} × ${L.defaultH}`, 'default size'], ['200 images', 'images per read'],
  ];
  for (const [s, what] of bounds) if (!text.includes(s)) out.push(`bound ${what} (${s}) not named`);
  // §5 of the manual: every backticked code it lists is one the model or the hub answers
  const sec = /## 5\. When something is refused([\s\S]*?)\n## /.exec(text);
  if (!sec) out.push('no "When something is refused" section');
  else {
    const named = [...sec[1].matchAll(/`([a-z_]+)`/g)].map((m) => m[1]);
    if (named.length < 10) out.push(`only ${named.length} codes named`);
    for (const c of named) if (!M.CODES.includes(c) && !HUB_CODES.includes(c)) out.push(`code ${c} is not a model / hub code`);
  }
  return out;
}
/** ② The CLI's verbs (each `if (verb === '…')`) and its flags vs the manual's command block. */
const cliVerbs = (src) => [...new Set([...src.matchAll(/if \(verb === '([a-z]+)'\)/g)].map((m) => m[1]))];
function cliCensus(text, src = CLI) {
  const out = [];
  const verbs = cliVerbs(src);
  if (verbs.length < 8) out.push(`only ${verbs.length} CLI verbs parsed`);
  const block = (/```\n(vibespace-design [\s\S]*?)\n```/.exec(text) || [])[1] || '';
  const documented = new Set([...block.matchAll(/^vibespace-design ([a-z]+)/gm)].map((m) => m[1]));
  for (const v of verbs) if (!documented.has(v)) out.push(`verb ${v} not in the command block`);
  for (const v of documented) if (!verbs.includes(v)) out.push(`the manual documents "${v}", the CLI has no such verb`);
  for (const v of verbs) if (!text.includes('**`' + v)) out.push(`verb ${v} has no paragraph`);
  const valueFlags = (/const VALUE_FLAGS = new Set\(\[([^\]]*)\]\)/.exec(src) || [])[1] || '';
  const flags = [...valueFlags.matchAll(/'(--[a-z]+)'/g)].map((m) => m[1]).concat(['--public']);
  if (flags.length < 7) out.push(`only ${flags.length} CLI flags parsed`);
  for (const f of flags) if (!block.includes(f)) out.push(`flag ${f} not in the command block`);
  // every `vibespace-design <word>` either text names is a real verb
  for (const t of [text, SKILL]) for (const m of t.matchAll(/vibespace-design ([a-z]+)\b/g)) if (!verbs.includes(m[1])) out.push(`"vibespace-design ${m[1]}" is not a verb`);
  return out;
}
/** ③ The craft rules (design §3.6): each one present, in our words. */
const RULES = [
  ['context first: search the project for tokens / components / fonts before drawing', /Look before you draw/, /design tokens/, /components/, /fonts/],
  ['…and SAY what was matched', /SAY what you matched/],
  ['static vs prototype: ask once, or infer and NAME the choice', /Static or prototype/, /ask once/, /NAME the choice/],
  ['2–4 low-fi directions only when no brand settles it', /two to four\s+low-fidelity directions/, /Only when nothing settles the look/],
  ['one complete HTML document per artboard, inline styles, images beside it', /One complete HTML document per artboard/, /Styles and\s+scripts inline/, /Images sit beside the artboard/],
  ['real copy, never lorem', /Never lorem ipsum/],
  ['mobile 390 wide, desktop 1280', /\*\*390\*\* wide/, /\*\*1280\*\*/],
  ['re-read before every edit, never rewrite from memory', /Before EVERY edit, re-read/, /never rewrite an artboard\s+from memory/],
  ['add / sync as the last step of every edit', /End EVERY edit with `vibespace-design add <file>`/, /`vibespace-design sync`/],
  ['say the directory at handover', /the design's folder \(its absolute path/],
];
function skillCensus(text) {
  const out = [];
  for (const [what, ...res] of RULES) if (!res.every((re) => re.test(text))) out.push(`rule missing: ${what}`);
  return out;
}

console.log('— ① the manual vs the PURE model');
{
  const p = modelCensus(MANUAL);
  ok(p.length === 0, `the example design.json validates; ${[...new Set(Object.values(M.KEYS).flat())].length} keys, ${M.NOTE_COLORS.length} colours, ${M.PRINT_MODES.length} print modes, the bounds and the §5 codes are the model's`, p);
  ok(HUB_CODES.every((c) => Object.prototype.hasOwnProperty.call(DE_STATUS, c)), 'every hub code the manual\'s §5 may name is one the engine answers (its STATUS table)', HUB_CODES.filter((c) => !(c in DE_STATUS)));
}
console.log('— ② the manual vs the CLI');
{
  const p = cliCensus(MANUAL);
  ok(p.length === 0, `every verb the CLI dispatches (${cliVerbs(CLI).join(' ')}) is documented, none extra, every flag named`, p);
}
console.log('— ③ the craft rules');
{
  const p = skillCensus(SKILL);
  ok(p.length === 0, `docs/agent/design-skill.md carries the ${RULES.length} rules the design names`, p);
  ok(/^# How to design here/.test(SKILL) && MANUAL.includes('**How to design here**'), 'the manual points at the rules by the heading they are printed under');
}

console.log('— ④ the topic serves both texts through the real route');
{
  const AR = require(path.join(REPO, 'src/agent-routes.js'));
  const routes = {};
  const app = { get: (p, h) => { routes[`GET ${p}`] = h; }, post: (p, h) => { routes[`POST ${p}`] = h; }, use: () => { }, put: () => { }, patch: () => { }, delete: () => { } };
  const activeSessions = new Map([['sess1', { agentToken: 'vsst_design', backend: 'claude', cwd: REPO, name: 't' }]]);
  AR.setupAgentRoutes({
    app, activeSessions,
    tasks: { groupsForSession: () => [], get: () => null, list: () => [] },
    sessionStatus: { snapshot: () => ({}), get: () => null, consumeNotice: () => null, consumeNotices: () => [], pendingNotices: () => [], rekey: () => { }, clear: () => null, setByUser: () => { } },
    SessionStatusManager: { renderNotice: () => '', renderNotices: () => '' },
    userTodos: { rekey: () => { }, forSession: () => [], resolveByAgent: () => null, add: () => ({}) },
    sessionStatusKey: (s, id) => `claude:${id}`, serverSetting: () => undefined, scheduleCtxSync: () => { }, remoteCtxBaseFor: () => null,
  });
  const get = (topic, token = 'vsst_design') => {
    let out = null, code = 200;
    const res = { status(c) { code = c; return res; }, json(o) { out = o; return res; } };
    routes['GET /api/agent/docs/:topic']({ headers: { authorization: 'Bearer ' + token }, params: { topic }, query: {}, body: {} }, res);
    return { code, out };
  };
  ok(typeof routes['GET /api/agent/docs/:topic'] === 'function', 'the docs route is registered');
  const r = get('design');
  const text = r.out && r.out.text || '';
  ok(r.code === 200 && text.startsWith(MANUAL) && text.endsWith(SKILL) && text.indexOf(SKILL) > text.indexOf(MANUAL) && text.length === MANUAL.length + SKILL.length + '\n---\n\n'.length,
    '`vibespace-docs design` = the manual, a rule line, then the craft rules — whole, in that order', { code: r.code, len: text.length });
  const pages = get('pages');
  ok(pages.code === 200 && pages.out.text === read('docs/agent/pages-manual.md'), 'a one-file topic is served exactly as before (pages)');
  ok(get('nope').code === 404 && get('constructor').code === 404 && get('__proto__').code === 404, 'an unknown topic — or a name every object inherits — is a 404 naming the topics, never a read of something else');
  ok(get('design', 'vsst_other').code === 401, 'an unknown session token reads nothing');
  // the ci-gate derives its gate inputs from AGENT_DOC_TOPICS with this exact parse (test-ci-gate §4) — both files must stay visible to it
  const src = read('src/agent-routes.js');
  const topics = /const AGENT_DOC_TOPICS = \{([^}]*)\}/.exec(src);
  const manuals = topics ? [...topics[1].matchAll(/'([^']+\.md)'/g)].map((m) => m[1]) : [];
  ok(manuals.includes('design-manual.md') && manuals.includes('design-skill.md'), 'the ci-gate\'s AGENT_DOC_TOPICS parse sees both design files (a docs-only push that edits them runs the gate)', manuals);
  // every file a topic names exists (a missing one is a 500 for every agent)
  const all = manuals;
  ok(all.length >= 12 && all.every((f) => fs.existsSync(path.join(REPO, 'docs/agent', f))), `every file AGENT_DOC_TOPICS names exists (${all.length})`, all.filter((f) => !fs.existsSync(path.join(REPO, 'docs/agent', f))));
}

console.log('— ⑤ the tools intro');
{
  const AR = require(path.join(REPO, 'src/agent-routes.js'));
  const T = { status: true, ask: true, task: true, jobs: true };
  const set2 = { attachments: [{ alias: 'work', isDefault: true, profileId: 'bp-00000001' }, { alias: 'personal', isDefault: false, profileId: 'bp-00000002' }] };
  const intros = [AR.sessionToolsIntro(T, {}), AR.sessionToolsIntro(T, { browserVariant: 'D' }), AR.sessionToolsIntro(T, { browserVariant: 'D', browserSet: set2 })];
  const line = intros[0].split('\n').find((l) => l.startsWith('Designs')) || '';
  ok(/`vibespace-docs design`/.test(line) && /`vibespace-design new <slug>`/.test(line) && /Design window/.test(line) && /`vibespace-design add <file\.html>`/.test(line) && /`sync`/.test(line) && /`publish`/.test(line) && /asks the user/.test(line), 'ONE design line: read the manual, new <slug>, one HTML file per screen, add / sync, publish asks', line);
  ok(intros.every((t) => (t.match(/^Designs/gm) || []).length === 1), 'exactly one design line in every variant');
  ok(Buffer.byteLength(line) <= 500, `the line is ${Buffer.byteLength(line)} B (≤ 500 — the kit line it replaced was 453)`);
  const max = Math.max(...intros.map((t) => Buffer.byteLength(t)));
  ok(max < AR.INLINE_CAP && AR.INLINE_CAP === 9600, `the largest intro is ${max} B, under the ${AR.INLINE_CAP} B inline cap`);
}

// ⑥ the kit census: the removed surfaces, by every spelling the kit (and the donor rung) used
const KIT_RE = /design[- ]kit|designKit|design canvas kit|vibespace-page kit|readKitFile|donorVersion|donorOrder|seed-canvas|payload\.template/i;
/** Whole files that may name the kit: the history and the guards — each with its reason. */
const KIT_HISTORY = [
  [/^CHANGELOG(\.zh|\.ja)?\.md$/, 'the user changelogs (history)'],
  [/^docs\/changelog-engineering\.md$/, 'the engineering log (history)'],
  [/^docs\/history-archive\.md$/, 'the ancient chronicle (history)'],
  [/^docs\/design-[^/]+\.md$/, 'design records (history — docs/design-design-window.md is the record of this removal)'],
  [/^src\/server\/migrations\.js$/, 'migration 2026-10-design-kit-removed names the directory it deletes'],
  [/^scripts\/test-migrations\.mjs$/, 'the migration\'s gate builds the kit\'s shape to delete it'],
  [/^scripts\/test-design-docs\.mjs$/, 'this census'],
  [/^scripts\/test-published-pages\.mjs$/, 'NEGATIVE pins: the server no longer creates / hands over / routes the kit (and the chip no longer fetches it)'],
  [/^scripts\/test-agent-tool-rules\.mjs$/, 'NEGATIVE pins: the retired verb is no longer pre-approved'],
];
/** Single lines that may: the kb records of this removal (the retirement, the migration, this census, the routing row's
 *  exception). Each must be live (a stale allowance is red). */
const KIT_LINES = [
  ['docs/kb-file-structure.md', "**Retired (lane design-docs, 2026-10-02): the Claude CLI's /design kit.**", 'the retirement record under data/bin/vibespace-page'],
  ['docs/kb-file-structure.md', '### Migration 2026-10-design-kit-removed (src/server/migrations.js', 'the migration essay\'s heading'],
  ['docs/kb-file-structure.md', "The Design window replaced the Claude CLI's /design kit, and `data/design-kit/<cliVersion>/`", 'the migration essay'],
  ['docs/kb-file-structure.md', '**⑥ (step 2) the kit stays gone:**', 'this census\'s own essay (it lists the spellings it looks for)'],
  ['docs/kb-design-lessons.md', 'ONE deliberate exception: `2026-10-design-kit-removed`', 'the migration routing row names its one exception'],
];
/** The client (src/lib, public) is lane design-window's in this lane's base: its chip still shows the kit line until
 *  that lane lands (it removes it). Once src/lib/design-window.js exists the client is judged like everything else. */
const CLIENT_JUDGED = fs.existsSync(path.join(REPO, 'src/lib/design-window.js'));
const isClient = (f) => f.startsWith('src/lib/') || f.startsWith('public/');
function kitVerdict(hits, { clientJudged = CLIENT_JUDGED } = {}) {
  const bad = [];
  const used = new Set();
  for (const h of hits) {
    if (KIT_HISTORY.some(([re]) => re.test(h.file))) continue;
    if (!clientJudged && isClient(h.file)) continue;
    const row = KIT_LINES.find(([f, mark]) => f === h.file && h.text.includes(mark));
    if (row) { used.add(row[1]); continue; }
    bad.push(`${h.file}:${h.line}: ${h.text.trim().slice(0, 140)}`);
  }
  const dead = KIT_LINES.filter(([, mark]) => !used.has(mark)).map(([f, , why]) => `${f} (${why})`);
  return { bad, dead };
}
function kitHits() {
  const r = spawnSync('git', ['-C', REPO, 'grep', '-n', '-I', '-i', '-E', KIT_RE.source.replace(/\\\./g, '[.]')], { encoding: 'utf8', env: gitEnvFrom(process.env), maxBuffer: 64 * 1024 * 1024 });
  if (r.error || (r.status !== 0 && r.status !== 1)) return null;   // 1 = no match
  return (r.stdout || '').split('\n').filter(Boolean).map((l) => { const m = /^([^:]+):(\d+):(.*)$/.exec(l); return m ? { file: m[1], line: Number(m[2]), text: m[3] } : null; }).filter(Boolean);
}

console.log('— ⑥ the Claude CLI kit stays gone');
{
  ok(!fs.existsSync(path.join(REPO, 'src/server/design-kit.js')) && !fs.existsSync(path.join(REPO, 'scripts/test-design-kit.mjs')), 'its module and its suite do not exist');
  const R = require(path.join(REPO, 'src/agent-tool-rules.js'));
  ok(Array.isArray(R.PAGE_VERBS) && !R.PAGE_VERBS.includes('kit') && !/if \(verb === 'kit'\)/.test(read('data/bin/vibespace-page')), 'vibespace-page has no kit verb, and none is pre-approved');
  const hits = kitHits();
  ok(Array.isArray(hits), 'git grep answered (the census reads the TRACKED tree)');
  if (hits) {
    const v = kitVerdict(hits);
    const scanned = hits.length;
    ok(v.bad.length === 0, `no surface of the kit is spelled outside the history (${scanned} hit line(s), every one in ${KIT_HISTORY.length} history / guard files${CLIENT_JUDGED ? '' : ' or the not-yet-judged client'} or the kb records of the removal)`, v.bad);
    ok(v.dead.length === 0, 'every single-line allowance is live (a stale one is removed, never kept)', v.dead);
    if (!CLIENT_JUDGED) console.log('     note: src/lib + public are lane design-window\'s until src/lib/design-window.js exists — the chip\'s kit line is theirs to remove; once that file lands the client is judged here too');
  }
}

console.log('— ⑦ controls: every census catches its plant');
{
  const cut = (t, from, to = '') => { const i = t.indexOf(from); if (i < 0) throw new Error('plant anchor missing: ' + from.slice(0, 60)); return t.slice(0, i) + to + t.slice(i + from.length); };
  const has = (problems, re) => problems.some((p) => re.test(p));
  // ① an example with a key the model does not take
  ok(has(modelCensus(cut(MANUAL, '"title": "Spring menu",', '"title": "Spring menu", "theme": "dark",')), /example is refused: theme unknown_key/), 'CONTROL an example design.json with an unknown key: RED (refused by the real validator)');
  ok(has(modelCensus(MANUAL.replace(/teal/g, 'cyan')), /colour teal not named/), 'CONTROL a colour list missing teal: RED');
  ok(has(modelCensus(MANUAL.replace(/"launch"/g, '"start"')), /key "launch" not named/), 'CONTROL a manual that never names "launch": RED');
  ok(has(modelCensus(cut(MANUAL, '`out_of_range`', '`out_of_bounds`')), /code out_of_bounds is not a model/), 'CONTROL a refusal code the model never answers: RED');
  ok(has(modelCensus(MANUAL.replace(/120–8000/g, '100–8000')), /bound w \/ h/), 'CONTROL a wrong size bound: RED');
  // ② a verb the CLI lacks / a verb left out / a flag left out
  ok(has(cliCensus(cut(MANUAL, 'vibespace-design list ', 'vibespace-design rename <slug>\nvibespace-design list ')), /documents "rename"/), 'CONTROL a documented verb the CLI does not have: RED');
  ok(has(cliCensus(MANUAL, CLI.replace("if (verb === 'list') {", "if (verb === 'list') {} if (verb === 'tidy') {")), /verb tidy not in the command block/), 'CONTROL a new CLI verb nobody documented: RED');
  ok(has(cliCensus(MANUAL.replace(/--page/g, '--pg')), /flag --page not in the command block/), 'CONTROL a flag the manual no longer names: RED');
  // ③ a rule removed
  ok(has(skillCensus(SKILL.replace('Never lorem ipsum', 'Avoid filler')), /real copy, never lorem/), 'CONTROL the craft rules without "never lorem": RED');
  ok(has(skillCensus(SKILL.replace(/\*\*390\*\*/g, '375')), /390 wide/), 'CONTROL the craft rules with another phone width: RED');
}

{
  // ⑥ planted hits through the same verdict
  const plant = (file, text, opts) => kitVerdict([{ file, line: 1, text }], opts);
  ok(plant('src/agent-routes.js', "app.get('/api/agent/design-kit', async (req, res) => {").bad.length === 1, 'CONTROL a kit route back in the agent routes: RED');
  ok(plant('docs/agent/pages-manual.md', 'vibespace-page kit').bad.length === 1, 'CONTROL the kit verb back in the teaching: RED');
  ok(plant('src/lib/i18n-zh.js', "'Design kit ready — taken from CLI {donor}; this CLI {v} does not ship it': '…',", { clientJudged: true }).bad.length === 1, 'CONTROL a donor-rung dictionary key left after the client lands: RED');
  ok(plant('src/lib/i18n-zh.js', "'Design kit ready (CLI {v})': '…',", { clientJudged: false }).bad.length === 0, '…and before the client lands that file is not judged (the chip is the other lane\'s)');
  ok(plant('docs/kb-file-structure.md', 'see the design-kit essay above').bad.length === 1, 'CONTROL a kb mention that is not the retirement record: RED');
  ok(kitVerdict([]).dead.length === KIT_LINES.length, 'CONTROL a retirement record that is gone: its allowance reads dead');
  ok(KIT_RE.test('const designKit = require(x)') && KIT_RE.test('readKitFile(name)') && KIT_RE.test('the design canvas kit') && !KIT_RE.test('designs/<slug>/ + design.json'), 'the census pattern sees every spelling and not the new canvas\'s words');
}

console.log(fail ? `FAILED (${pass} passed, ${fail} failed)` : `ALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
