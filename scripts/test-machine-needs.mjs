#!/usr/bin/env node
// THE MACHINE NEEDS CENSUS (lane machine-needs-at-pairing pick 2 — 主开发's law 1; the owner 2026-11-13: a line «设置一次：在 dev-… 上
// 安装 TightVNC Server» with no button). Fast, PURE + the tree's words:
//   ① THE CENSUS, derived and PRINTED: every sentence a person reads (each t() / tr() / i18nKey() literal in src/ — the same reader as
//      scripts/i18n-extract.mjs) that the net catches (it names a machine AND a need) is claimed by a row of src/machine-needs.js or
//      by a non-need with its reason — per need: its kind, platforms, sentences, the surfaces that state it, its door
//   ② A DOOR ON EVERY SURFACE THAT STATES IT: a need whose door is present — every file that states one of its sentences (a PURE
//      model's words count for the surface that draws them: `via`) carries the door's marker in its source
//   ③ CONTROLS: a new «needs X» sentence no row claims is RED by name; a surface stating a present-door need without its door is
//      RED by name (the base's machine-app.js, stripped of the door, is caught)
//   ⑤ EVERY NEED HAS ITS DOOR OR ITS WHY (B-bd27): no row deferred; THE OLD AGENT'S DOOR (src/lib/agent-update-door.js, «Update
//      its agent…») — every code an agent-version sentence is keyed on opens it, the pairing sheet for a paired dial device and
//      Manage agents › Machines otherwise, as a button and as a toast's action; CONTROLS: the door's code check emptied ⇒ the codes
//      leg RED; the runs dialog stripped of its door ⇒ the surface leg RED
import './scratch.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (typeof c !== 'boolean') throw new TypeError(`ok: its condition is a ${typeof c}, not a boolean — the arguments are swapped, or a value stands where a comparison belongs`); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra !== undefined ? ' — ' + JSON.stringify(extra).slice(0, 900) : '')); } };
if (!fs.existsSync(path.join(REPO, 'src/machine-needs.js'))) { ok(false, 'the census exists (src/machine-needs.js)'); console.log(`\n${fail} FAILED (${pass} passed)`); process.exit(1); }
const MN = require(path.join(REPO, 'src/machine-needs.js'));
const UI = fs.existsSync(path.join(REPO, 'src/ui-needs.js')) ? require(path.join(REPO, 'src/ui-needs.js')) : null; // the one runner's second table (lane ui-needs-a-button)

// ── the tree's words: every t() / tr() / i18nKey() literal in src/ (not the dictionaries), with the files that hold it ──
const tRe = /\b(?:t|tr|i18nKey)\(\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")/g;
const unescapeJs = (raw) => JSON.parse('"' + raw.replace(/\\.|"/g, (x) => (x === '"' ? '\\"' : x === "\\'" ? "'" : x)) + '"');
const sources = new Map(); // file → text
const walk = (dir) => { for (const e of fs.readdirSync(path.join(REPO, dir), { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) walk(p); else if (e.name.endsWith('.js') && !/^i18n/.test(e.name)) sources.set(p, fs.readFileSync(path.join(REPO, p), 'utf8')); } };
walk('src');
const words = new Map(); // sentence → Set(files)
for (const [file, text] of sources) for (const m of text.matchAll(tRe)) { let k; try { k = unescapeJs(m[1] != null ? m[1] : m[2]); } catch { continue; } if (!words.has(k)) words.set(k, new Set()); words.get(k).add(file); }

/** The census over a set of sentences → { rows: Map(id → {row, sentences, files}), non: [...], unclaimed: [...] } */
function census(ws) {
  const rows = new Map(MN.NEEDS.map((r) => [r.id, { row: r, sentences: [], files: new Set() }])), non = [], unclaimed = [], byUi = [];
  for (const [s, files] of ws) {
    if (!MN.inNet(s)) continue;
    const r = MN.needOf(s);
    if (r) { const e = rows.get(r.id); e.sentences.push(s); for (const f of files) e.files.add((r.door.via && r.door.via[f]) || f); continue; }
    const n = MN.notNeedOf(s);
    if (n) { non.push({ s, why: n.why }); continue; }
    // THE ONE RUNNER's rule (scripts/test-needs-doors.mjs — a sentence goes to the FIRST table that claims it, machine then ui):
    // a sentence the ui table claims is claimed here too (2.369.402: «That browser engine plugin is not running…» is its engine-plugin-off)
    if (UI && (UI.needOf(s) || UI.notNeedOf(s))) { byUi.push(s); continue; }
    unclaimed.push({ s, files: [...files] });
  }
  return { rows, non, unclaimed, byUi };
}
/** The surfaces of a present-door need whose source lacks the door's marker. */
const markerOf = (mk, f) => (mk instanceof RegExp ? mk : mk[f] || /(?!)/); // one regex, or one per surface (a surface the map does not name has no door)
const doorless = (e, src = (f) => sources.get(f) || '') => (e.row.door.present ? [...e.files].filter((f) => !markerOf(e.row.door.present.marker, f).test(src(f))) : []);

console.log('① THE CENSUS (derived from the tree)');
const C = census(words);
const caught = [...words.keys()].filter(MN.inNet).length;
for (const e of C.rows.values()) {
  const d = e.row.door;
  const door = d.present ? `door present (${[...e.files].sort().join(', ') || 'no surface'})` : d.none ? `NONE — ${d.none}` : `deferred «${d.deferred}»`;
  console.log(`  · ${e.row.id} [${e.row.kind}] ${e.row.platforms.join('/')} — ${e.row.need} — ${e.sentences.length} sentence(s) — ${door}`);
}
console.log(`  · not needs: ${C.non.length} (${[...new Set(C.non.map((x) => x.why))].length} reasons)`);
ok(caught > 50 && C.unclaimed.length === 0, `every one of the ${caught} sentences the net catches is claimed — by a need (${caught - C.non.length}) or a non-need with its reason (${C.non.length})`, C.unclaimed.slice(0, 8));
ok(verdictOf([...C.rows.values()].every((e) => e.sentences.length > 0)), 'every row claims at least one sentence of the tree (no dead row)', [...C.rows.values()].filter((e) => !e.sentences.length).map((e) => e.row.id));
ok(verdictOf(MN.NEEDS.every((r) => ['a', 'b', 'c', '-'].includes(r.kind) && Array.isArray(r.platforms) && r.platforms.length && (!!r.door.present + !!r.door.none + !!r.door.deferred) === 1)), 'every row has a kind, its platforms and exactly one door verdict (present / none / deferred)');
ok(verdictOf(MN.NEEDS.filter((r) => r.door.deferred).every((r) => r.door.deferred === MN.DEFERRED)), `every deferred door names the owner's backlog row («${MN.DEFERRED}»)`);

console.log('② A DOOR ON EVERY SURFACE THAT STATES IT');
for (const e of C.rows.values()) if (e.row.door.present) ok(doorless(e).length === 0 && e.files.size > 0, `${e.row.id}: every surface that states it draws its door (${[...e.files].sort().join(', ')})`, doorless(e));

console.log('③ CONTROLS');
const planted = new Map(words); planted.set('this machine needs the Frobnicator 3 runtime — install it there first', new Set(['src/lib/planted.js']));
const P = census(planted);
ok(P.unclaimed.length === 1 && verdictOf(/Frobnicator/.test(P.unclaimed[0].s)), 'CONTROL: a new «needs X» sentence that no row claims is RED by name', P.unclaimed);
const ff = C.rows.get('ffmpeg');
const stripped = (f) => (f === 'src/lib/machine-app.js' ? (sources.get(f) || '').replace(/ffmpegDoor\(|ffmpegNeedCode\(/g, 'gone(') : sources.get(f) || '');
ok(gateOf(ff) && JSON.stringify(doorless(ff, stripped)) === JSON.stringify(['src/lib/machine-app.js']), 'CONTROL: the app window stating «needs ffmpeg» with its door taken out is RED by name', ff && doorless(ff, stripped));

console.log('④ WHAT IT IS — a net, and what it cannot see (the reader\'s item 8)');
{
  const head = fs.readFileSync(path.join(REPO, 'src/machine-needs.js'), 'utf8').split('*/')[0];
  const kb = fs.readFileSync(path.join(REPO, 'docs/kb-features.md'), 'utf8');
  ok(gateOf(/A NET, NOT A PROOF/.test(head)) && gateOf(/a MACHINE word AND a NEED word/.test(head)) && gateOf(/IT CANNOT SEE/.test(head)) && verdictOf(/A DEVICE'S OWN REFUSAL STRINGS/.test(head)), 'the census\'s header says what it is (a net over sentences carrying a machine word and a need word) and what it cannot see (a need worded past them, a device\'s own refusal strings, a log line)');
  ok(gateOf(/It is a NET, not a proof/.test(kb)) && verdictOf(/a device's own refusal strings/.test(kb)), 'the kb says the same where a person reads about the census');
}

console.log('⑤ EVERY NEED HAS ITS DOOR OR ITS WHY — and the old agent\'s door (B-bd27)');
{
  const deferred = MN.NEEDS.filter((r) => r.door.deferred).map((r) => r.id);
  ok(deferred.length === 0, 'no row is deferred any more: every machine need has its door, or a NONE that says why (B-bd27 — X1 the agent\'s version, X2 Node, X3 agent-browser, H the hub machine)', deferred);
  const DOOR = 'src/lib/agent-update-door.js', src = sources.get(DOOR);
  if (!src) ok(false, `the old agent's door exists (${DOOR})`);
  else {
    // the client module, read as it is: its one import (the words) stood in, its exports returned — no bundler, no DOM library
    const loadDoor = (text) => {
      const body = text.replace("import { t } from './i18n.js';", 'const t = (s, p) => String(s).replace(/\\{(\\w+)\\}/g, (m, k) => (p && k in p ? String(p[k]) : m));').replace(/^export (const|function) /gm, '$1 ');
      if (/^import /m.test(body)) throw new Error('the door imports more than its words');
      const names = [...text.matchAll(/^export (?:const|function) ([A-Za-z_]+)/gm)].map((m) => m[1]);
      return new Function(`${body}\nreturn { ${names.join(', ')} };`)();
    };
    const D = loadDoor(src);
    // every code an agent-version sentence is keyed on (the comparison on the sentence's own line) opens the door
    const av = C.rows.get('agent-version');
    const keyed = [];
    for (const sn of av.sentences) for (const f of words.get(sn)) for (const line of (sources.get(f) || '').split('\n').filter((l) => l.includes(sn.slice(0, 36)))) for (const m of line.matchAll(/\b(?:code|refusal|c)\s*===\s*'([a-z_]+)'|\bcase '([a-z_]+)'/g)) keyed.push([f, m[1] || m[2]]);
    const missing = (Dm) => keyed.filter(([, c]) => !Dm.isAgentOld(c));
    ok(keyed.length >= 8 && missing(D).length === 0, `every code an «agent too old» sentence is keyed on opens the door (${[...new Set(keyed.map(([, c]) => c))].sort().join(', ')} — ${keyed.length} sites)`, missing(D));
    ok(!D.isAgentOld('no_codename') && verdictOf((sources.get('src/app-system-serve.js') || '').includes("no(kind, 'no_codename', 'this machine does not name its release")), 'a machine that does not name its release has its OWN code (an OS fact) — the old agent\'s door is not drawn for it');
  ok(!/regEl\.firstElementChild\.append\(' ', agentUpdateDoor/.test(sources.get('src/lib/desktop-app-launcher.js') || ''), 'no door under the guess «may be too old» (an empty office list: the words say what is known)'); // stale-pins: kept — the deliberate absence check: no door under «may be too old»
  ok(['pairing', 'machines', 'machines', 'machines'].join() === [{ id: 'd1', transport: 'dial', deviceId: 'dev-1' }, { id: 's1', transport: 'ssh' }, { id: 'd2', transport: 'dial' }, null].map(D.agentDoorTarget).join(), 'the door leads to the machine\'s PAIRING SHEET for a paired dial device (its command, run again, installs the agent anew), to Manage agents › Machines for any other machine or none');
    const HOSTS = [{ id: 'd1', name: 'WIN-DESK1', transport: 'dial', deviceId: 'dev-1' }, { id: 's1', name: 'box', transport: 'ssh' }];
    ok(D.hostRowOf('d1', HOSTS) === HOSTS[0] && D.hostRowOf({ hostId: 's1' }, HOSTS) === HOSTS[1] && D.hostRowOf('WIN-DESK1', HOSTS) === null && D.hostRowOf(HOSTS[1], []) === HOSTS[1] && D.hostRowOf('nope', HOSTS) === null && D.hostRowOf(null, HOSTS) === null, 'a surface names its machine as it holds it — an id, {hostId}, the row — and the door finds THAT row by id; never «the first with that name» (two machines may share one)');
    const opened = [], store = {};
    const app = { sidebar: { _hostsData: { hosts: HOSTS }, _showDevicePairDialog: (h) => opened.push(['pairing', h && h.id]) }, _showAgentsDialog: () => opened.push(['machines', store['vibespace.agentsTab']]) };
    const hadLS = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', { value: { setItem: (k, v) => { store[k] = v; } }, configurable: true, writable: true });
    const hadDoc = globalThis.document;
    globalThis.document = { createElement: (tag) => ({ tagName: String(tag).toUpperCase(), dataset: {}, className: '', textContent: '', title: '', type: '', onclick: null }) };
    try {
      const r1 = D.openAgentUpdate({ hostId: 'd1' }, { app }), r2 = D.openAgentUpdate('s1', { app }), r3 = D.openAgentUpdate('d1', { app: null });
      ok(r1 === 'pairing' && r2 === 'machines' && r3 === 'machines' && JSON.stringify(opened) === JSON.stringify([['pairing', 'd1'], ['machines', 'machines']]), 'opening it: the dial device\'s pairing sheet with ITS row; an ssh host ⇒ Manage agents on the Machines tab; no page app ⇒ nothing thrown', opened);
      opened.length = 0;
      const order = [];
      const b = D.agentUpdateDoor('d1', { app, before: () => order.push('before') });
      b.onclick({ preventDefault() { }, stopPropagation() { } });
      ok(b.tagName === 'BUTTON' && b.type === 'button' && b.textContent === 'Update its agent…' && gateOf(/pairing command on that machine again/.test(b.title)) && b.dataset.agentDoor === '1' && order.join() === 'before' && JSON.stringify(opened) === JSON.stringify([['pairing', 'd1']]), 'THE BUTTON «Update its agent…» says in its title what lands (the update at each connection; else the pairing command again) and a press closes its surface first, then opens the sheet', { text: b.textContent, title: b.title, opened });
      opened.length = 0;
      const a = D.agentUpdateAction('s1', { app });
      a.run();
      ok(a.label === 'Update its agent…' && JSON.stringify(opened) === JSON.stringify([['machines', 'machines']]), 'the same door as a toast\'s action (a refusal said in a toast)', opened);
    } finally {
      if (hadLS) Object.defineProperty(globalThis, 'localStorage', hadLS); else delete globalThis.localStorage;
      if (hadDoc === undefined) delete globalThis.document; else globalThis.document = hadDoc;
    }
    // CONTROLS
    const mut = loadDoor(src.replace("export const isAgentOld = (code) => AGENT_OLD_CODES.includes(String(code || ''));", 'export const isAgentOld = () => false;'));
    ok(gateOf(src.includes("export const isAgentOld = (code) => AGENT_OLD_CODES.includes(String(code || ''));")) && missing(mut).length === keyed.length, `CONTROL: the door's code check emptied ⇒ the codes leg is RED (${missing(mut).length} of ${keyed.length} sites unopened)`);
    const strippedRuns = (f) => (f === 'src/lib/exit-runs-dialog.js' ? (sources.get(f) || '').replace(/agentUpdateDoor\(/g, 'gone(') : sources.get(f) || '');
    ok(JSON.stringify(doorless(av, strippedRuns)) === JSON.stringify(['src/lib/exit-runs-dialog.js']), 'CONTROL: the runs dialog stating «too old to run commands» with its door taken out is RED by name', doorless(av, strippedRuns));
  }
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0); import { verdictOf, gateOf } from './lib/check.mjs';
