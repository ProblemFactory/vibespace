#!/usr/bin/env node
// THE NEEDS-DOORS CENSUS — ONE suite, two tables (主开发, 2026-11-13: lane machine-needs-at-pairing's «machine» rows in
// src/machine-needs.js, lane ui-needs-a-button's «ui» rows in src/ui-needs.js; ONE row vocabulary: a door present / none (why) /
// deferred «lane · B-id»). The runner is machine-needs-at-pairing's (scripts/test-machine-needs.mjs, landed first) over both tables:
//   ① THE CENSUS, derived and PRINTED: every sentence a person reads (each t() / tr() / i18nKey() literal in src/ — the same reader as
//      scripts/i18n-extract.mjs) that a table's net catches is claimed by a row of that table or by a non-need with its reason. A
//      sentence the MACHINE table claims is its (a machine's need); the UI table claims the rest
//   ② A DOOR ON EVERY SURFACE THAT STATES IT: a row whose door is present — every file that states one of its sentences (a PURE
//      model's words count for the surface that draws them: `via`) carries the door's marker in its source
//   ③ CONTROLS: a new sentence a net catches that no row claims is RED by name; a surface stating a present-door need without its
//      door is RED by name
// The machine table is read when it exists (it lands on its own lane's pick); the ui table always.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra !== undefined ? ' — ' + JSON.stringify(extra).slice(0, 1400) : '')); } };
const TABLES = [['machine', 'src/machine-needs.js'], ['ui', 'src/ui-needs.js']].filter(([, f]) => fs.existsSync(path.join(REPO, f))).map(([scope, f]) => ({ scope, file: f, T: require(path.join(REPO, f)) }));
ok(TABLES.some((x) => x.scope === 'ui'), 'the ui table exists (src/ui-needs.js)');
console.log(`tables: ${TABLES.map((x) => x.scope + ' (' + x.file + ')').join(' · ')}`);

// ── the tree's words: every t() / tr() / i18nKey() literal in src/ (not the dictionaries), with the files that hold it ──
const tRe = /\b(?:t|tr|i18nKey)\(\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")/g;
const unescapeJs = (raw) => JSON.parse('"' + raw.replace(/\\.|"/g, (x) => (x === '"' ? '\\"' : x === "\\'" ? "'" : x)) + '"');
const sources = new Map();
const walk = (dir) => { for (const e of fs.readdirSync(path.join(REPO, dir), { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) walk(p); else if (e.name.endsWith('.js') && !/^i18n/.test(e.name)) sources.set(p, fs.readFileSync(path.join(REPO, p), 'utf8')); } };
walk('src');
const words = new Map();
for (const [file, text] of sources) for (const m of text.matchAll(tRe)) { let k; try { k = unescapeJs(m[1] != null ? m[1] : m[2]); } catch { continue; } if (!words.has(k)) words.set(k, new Set()); words.get(k).add(file); }

/** The census of every table over a set of sentences: a sentence goes to the FIRST table that claims it (machine, then ui). */
function census(ws) {
  const out = TABLES.map(({ scope, T }) => ({ scope, T, rows: new Map(T.NEEDS.map((r) => [r.id, { row: r, sentences: [], files: new Set() }])), non: [], unclaimed: [] }));
  for (const [s, files] of ws) {
    let taken = false;
    for (const c of out) {
      if (!c.T.inNet(s)) continue;
      const r = c.T.needOf(s);
      if (r) { const e = c.rows.get(r.id); e.sentences.push(s); for (const f of files) e.files.add((r.door.via && r.door.via[f]) || f); taken = true; break; }
      const n = c.T.notNeedOf(s);
      if (n) { c.non.push({ s, why: n.why }); taken = true; break; }
    }
    if (taken) continue;
    const first = out.find((c) => c.T.inNet(s));
    if (first) first.unclaimed.push({ s, files: [...files] });
  }
  return out;
}
const markerOf = (mk, f) => (mk instanceof RegExp ? mk : mk[f] || /(?!)/);
const doorless = (e, src = (f) => sources.get(f) || '') => (e.row.door.present ? [...e.files].filter((f) => !markerOf(e.row.door.present.marker, f).test(src(f))) : []);

console.log('① THE CENSUS (derived from the tree)');
const C = census(words);
for (const c of C) {
  const caught = [...words.keys()].filter((s) => c.T.inNet(s)).length;
  console.log(`  [${c.scope}] the net catches ${caught} sentence(s)`);
  for (const e of c.rows.values()) {
    const d = e.row.door;
    const door = d.present ? `door present (${[...e.files].sort().join(', ') || 'no surface'})` : d.none ? `NONE — ${d.none}` : `deferred «${d.deferred}»`;
    console.log(`  · [${c.scope}] ${e.row.id} — ${e.row.need} — ${e.sentences.length} sentence(s) — ${door}`);
  }
  console.log(`  · [${c.scope}] not needs: ${c.non.length} (${[...new Set(c.non.map((x) => x.why))].length} reasons)`);
  ok(c.unclaimed.length === 0, `[${c.scope}] every sentence its net catches is claimed — by a row or a non-need with its reason (${caught})`, c.unclaimed.slice(0, 12));
  ok([...c.rows.values()].every((e) => e.sentences.length > 0), `[${c.scope}] every row claims at least one sentence of the tree (no dead row)`, [...c.rows.values()].filter((e) => !e.sentences.length).map((e) => e.row.id));
  ok(c.T.NEEDS.every((r) => (!!r.door.present + !!r.door.none + !!r.door.deferred) === 1), `[${c.scope}] every row has exactly one door verdict (present / none / deferred)`);
  ok(c.T.NEEDS.filter((r) => r.door.deferred).every((r) => r.door.deferred === c.T.DEFERRED), `[${c.scope}] every deferred door names its owner («${c.T.DEFERRED}»)`);
  if (c.scope === 'machine') ok(c.T.NEEDS.every((r) => ['a', 'b', 'c', '-'].includes(r.kind) && Array.isArray(r.platforms) && r.platforms.length), '[machine] every row has a kind and its platforms');
}

console.log('② A DOOR ON EVERY SURFACE THAT STATES IT');
for (const c of C) for (const e of c.rows.values()) if (e.row.door.present) ok(doorless(e).length === 0 && e.files.size > 0, `[${c.scope}] ${e.row.id}: every surface that states it draws its door (${[...e.files].sort().join(', ')})`, doorless(e));

console.log('③ CONTROLS');
const ui = C.find((c) => c.scope === 'ui');
const planted = new Map(words); planted.set('Turn it on in Settings → Frobnicate first', new Set(['src/lib/planted.js']));
const P = census(planted).find((c) => c.scope === 'ui');
ok(P && P.unclaimed.length === 1 && /Frobnicate/.test(P.unclaimed[0].s), 'CONTROL: a new «… in Settings → X» sentence that no row claims is RED by name', P && P.unclaimed);
const fc = ui && ui.rows.get('folder-create');
const stripped = (f) => (f === 'src/lib/path-field.js' ? (sources.get(f) || '').replace(/data-act="tick"/g, 'data-act="gone"') : sources.get(f) || '');
ok(fc && JSON.stringify(doorless(fc, stripped)) === JSON.stringify(['src/lib/path-field.js']), 'CONTROL: the folder field stating «create it?» with its create door taken out is RED by name', fc && doorless(fc, stripped));

console.log('④ THE DOORS DO THEIR ACT (lane ui-needs-a-button pick 1 — the walk\'s seven majors)');
{
  const os = await import('node:os');
  const { execFileSync } = await import('node:child_process');
  const { pathToFileURL } = await import('node:url');
  // for-you-2: a parked ask is a POINTER — its one closer says what stays true; the note's words name the conversation's card
  const FA = require(path.join(REPO, 'src/foryou-actions.js'));
  const parked = (type) => ({ id: 'x', status: 'open', action: { type } });
  ok(typeof FA.isParkedAsk === 'function' && FA.isParkedAsk(parked('main-ask')) && FA.isParkedAsk(parked('helper-ask')) && !FA.isParkedAsk(parked('exit-run-ask'))
    && JSON.stringify(FA.closersOf(parked('main-ask'))) === '["hide"]' && JSON.stringify(FA.closersOf(parked('helper-ask'))) === '["hide"]',
    'for-you-2: a parked ask (main-ask / helper-ask) is a pointer — its ONE closer is the hide («Stop reminding (the conversation stays paused)»), never «Mark done»', typeof FA.closersOf === 'function' ? FA.closersOf(parked('main-ask')) : null);
  const IR = require(path.join(REPO, 'src/inbox-reply.js'));
  // the WIRE: inbox-window draws the door off the VIEW (itemView) — a view that drops the verdict's code draws no door
  // (the pick-1 walk found exactly that: the marker was in the source, the door never on screen)
  const LAY = await import(pathToFileURL(path.join(REPO, 'src/lib/inbox-window-layout.js')).href);
  const pv = LAY.itemView({ id: 'h1', type: 'helper-ask', status: 'open', sessionKey: 'claude:x', createdAt: 1 }, { reply: { show: false, enabled: false, code: 'card_item', why: IR.REPLY_WHY.card_item } });
  ok(pv && pv.reply && !pv.reply.show && pv.reply.code === 'card_item', 'for-you-2: the window\'s VIEW of a parked ask keeps the code its door is drawn off (card_item) — the door reaches the screen', pv && pv.reply);
  ok(IR.REPLY_WHY.card_item === 'Answered on the conversation’s card — open the conversation to answer it', 'for-you-2: the note names the conversation\'s card (never «the helper\'s»); its door «Open the conversation and answer» is on its line', IR.REPLY_WHY.card_item);
  // desktop-apps-27: a .deb FILE that is not there is its own code, never «no such package» (and never handed to an agent)
  const DEB = require(path.join(REPO, 'src/app-kinds/deb.js'));
  const fspm = (await import('node:fs')).promises;
  const r27 = await DEB.planner({ p: { debPath: '/nonexistent-vs-' + process.pid + '/package.deb' }, kind: 'deb', ret: (x) => x, fsp: fspm, path, A: { fmtBytes: (n) => String(n) }, DEB_MAX: 1 << 30 }).catch((e) => ({ threw: String(e && e.message) }));
  const DAL = fs.readFileSync(path.join(REPO, 'src/lib/desktop-app-launcher.js'), 'utf8');
  ok(r27 && r27.ok === false && r27.code === 'file_missing' && /package\.deb$/.test(String(r27.path || '')) && !/'file_missing'/.test((/HAND_OFF_CODES = Object\.freeze\(\[[^\]]*\]/.exec(DAL) || [''])[0]),
    'desktop-apps-27: a .deb that is not there ⇒ code file_missing with its path (r.398: not_found — «no such package» and «let an agent find another way»); it is never a hand-off code', r27);
  // browser-live-1: the person's STOP — any conversation's own tab without a takeover; never another's / nobody's / a mediated one
  const TB = require(path.join(REPO, 'src/browser-tabs.js'));
  const V = (o) => TB.userTabVerdict({ act: 'stop', ...o });
  ok(TB.USER_TAB_ACTS.includes('stop') && V({ owner: 'agent' }).ok && V({ owner: 'you' }).ok && V({ owner: 'agent', mediated: true }).code === 'mediated_tabs' && V({ owner: 'other' }).code === 'not_your_tab' && V({ owner: 'orphan' }).code === 'not_your_tab'
    && TB.TAB_REFUSALS.includes('stop_failed') && /stopped .* loading/.test(TB.userActsSentence([{ kind: 'tab-stop', title: 'Shop', url: 'https://shop.example/' }])),
    'browser-live-1: a stop is the person\'s on the viewed conversation\'s own tab WITHOUT a takeover (nothing but the load stops), on the person\'s own; another\'s, nobody\'s, a mediated one refused by name; said to the agent at the handback while driving');
  const BS = require(path.join(REPO, 'src/browser-stream.js'));
  const vv = BS.viewerMessageVerdict({ type: 'tab-act', act: 'stop', targetId: 'A'.repeat(32), rid: 3 });
  ok(vv && vv.kind === 'tab-act' && vv.act === 'stop' && !vv.refusal, 'browser-live-1: the bridge takes a {type: tab-act, act: stop} from a viewer (then refuses a bearer\'s view by name — server/browser-stream.js)', vv);
  const SBS = fs.readFileSync(path.join(REPO, 'src/server/browser-stream.js'), 'utf8');
  ok(/v\.act === 'stop' && \(viewer\.bearer \|\| !isPress\(pressOf\(viewer\.page/.test(SBS) && /code: viewer\.bearer \? 'agent_forbidden' : 'not_a_press'/.test(SBS), 'browser-live-1: a stop from a view a BEARER opened (an agent\'s session token, a job token, an automation key) is refused agent_forbidden; one with no press from this page not_a_press');
  const LB = await import(pathToFileURL(path.join(REPO, 'src/lib/browser-loop-banner.js')).href);
  class Nd { constructor(tag) { this.tagName = tag; this.children = []; this._t = ''; this.className = ''; this.style = {}; } appendChild(n) { this.children.push(n); return n; } set textContent(v) { this._t = String(v); } get textContent() { return this._t; } }
  let stops = 0;
  const bn = LB.createLoopBanner({ createElement: (tg) => new Nd(tg) }, { stop: () => { stops++; } });
  const loop = { urls: ['https://shop.example/a', 'https://shop.example/b'], hops: 14, sinceMs: 9000 };
  bn.render(loop, null, { stop: true, close: false });
  const shown1 = bn.parts.stop && bn.parts.stop.style.display === '' && bn.parts.close.style.display === 'none' && bn.parts.stop.textContent === 'Stop loading';
  if (bn.parts.stop && typeof bn.parts.stop.onclick === 'function') bn.parts.stop.onclick({}); // the release: no door ⇒ red by name
  bn.render(loop, null, {});
  ok(shown1 && stops === 1 && !!bn.parts.doors && bn.parts.doors.style.display === 'none' && /may propose clearing the site’s stored login/.test(bn.parts.hint.textContent),
    'browser-live-1: the loop banner draws its ways out as DOORS on its line — «Stop loading» (pressed ⇒ the act runs) where this view may stop, «Close this tab» only where a close is the person\'s; no door, no row');
  // machines-1: an ssh machine that refused the key — the PUBLIC half of the key it signs in with, READ (never made), the person's only
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-needs-doors-'));
  try {
    const key = path.join(tmp, 'k');
    execFileSync('ssh-keygen', ['-t', 'ed25519', '-N', '', '-C', 'needs-doors', '-f', key, '-q']);
    const pub = fs.readFileSync(key + '.pub', 'utf8').trim();
    const { HostManager } = require(path.join(REPO, 'src/hosts.js'));
    fs.mkdirSync(path.join(tmp, 'data'), { recursive: true });
    const H = new HostManager({ dataDir: path.join(tmp, 'data') });
    const id = H.add({ name: 'gpu-01', user: 'ubuntu', host: '127.0.0.1', port: 22, keyPath: key });
    const before = fs.readdirSync(tmp).sort().join(',');
    const readPub = (x) => (typeof H.publicKeyOf === 'function' ? H.publicKeyOf(x) : { ok: false, code: 'no publicKeyOf (the release)' });
    const a = await readPub(id);
    fs.rmSync(key + '.pub');
    const b = await readPub(id);
    const after = fs.readdirSync(tmp).sort().join(',');
    ok(a.ok && a.keys[0].publicKey === pub && a.keys[0].source === 'file' && b.ok && b.keys[0].publicKey.split(' ').slice(0, 2).join(' ') === pub.split(' ').slice(0, 2).join(' ') && b.keys[0].source === 'derived' && after === before.replace('k.pub,', '').replace(',k.pub', '')
      && !/PRIVATE KEY/.test(JSON.stringify([a, b])) && !fs.existsSync(path.join(tmp, 'data', 'ssh', 'id_ed25519')),
      'machines-1: publicKeyOf reads the PUBLIC half of an existing machine\'s key — its .pub, else derived on the server (ssh-keygen -y); no key is made, no private byte is answered', { a, b });
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  const ER = fs.readFileSync(path.join(REPO, 'src/server/exit-routes.js'), 'utf8');
  const route = (/app\.get\('\/api\/hosts\/:id\/public-key'[\s\S]*?\n\}\);/.exec(ER) || [''])[0];
  ok(route && /\^vsst_/.test(ER) && /\^jbt_/.test(ER) && /ak-\|vsak_/.test(ER) && /status\(403\)[\s\S]{0,200}person_only/.test(route) && !/generateKey/.test(route),
    'machines-1: GET /api/hosts/:id/public-key is the PERSON\'s door — an agent\'s session token, a job token and an automation key refused by name (403 person_only); a read never makes a key');
  // plugins-integrations-19 (主开发 Q3, words only): the relay address ending /slack/ on a Lark / Google card is ONE page for every provider — said on the card's rows
  const OSU = fs.readFileSync(path.join(REPO, 'src/oauth-setup.js'), 'utf8');
  ok(/'row\.public': i18nKey\('[^']*one page for Lark, Slack and Google/.test(OSU) && /'row\.own\.tpl': i18nKey\('[^']*one page serves every provider/.test(OSU),
    'plugins-integrations-19: the relay rows say one page serves Lark, Slack and Google (the published path is not renamed)');
  // sidebar-sessions-4: the tick is drawn whether or not the parent exists (one row, its door on the line)
  const PF = fs.readFileSync(path.join(REPO, 'src/lib/path-field.js'), 'utf8');
  ok(/\+ `<label class="pf-tickrow"><input type="checkbox" data-act="tick"/.test(PF) && !/x\.parentOk \? `<label class="pf-tickrow">/.test(PF) && !/nor the folder above — pick another/.test(PF),
    'sidebar-sessions-4: «create it?» always carries its create on the line — a missing parent too (made with it at use: /api/mkdir is mkdir -p)');
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
