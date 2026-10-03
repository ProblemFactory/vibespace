#!/usr/bin/env node
// test-app-card — THE ONE CARD OF AN APP INSTALL, DOM-free (design 009 §2 A / §4; src/app-card.js = the engine's view +
// the digest of what a card showed, PURE; src/lib/app-card-model.js = its words in the device's language, PURE).
//   §1 the VIEW: a stored proposal per kind (package · .deb · AppImage-shaped · remove · source) → the shared contract;
//      a download's host + recipe, localized names, first use, a failure's step, an install's rows
//   §2 the WORDS per kind and state in en / zh / ja — every line a person reads is a sentence of the dictionary
//   §3 THE WORD CENSUS: no card face (title, lines, buttons, progress) carries deb / AppImage / apt / root / sudo / sha /
//      dpkg in any language — Details may (and do); CONTROL: a planted "apt" in one face line is caught
//   §4 THE DIGEST: it moves with the name, the host, the sizes, the sha256, the plan, the proposer's why and the
//      proposal's id — and NOT with the state / progress / result (they move while the one click runs); the For-you
//      store keeps a card EXACTLY (the digest of the stored card is the digest of the view)
//   §5 the row renderer escapes every interpolated piece of a card (an app's name and an agent's why are peer text)
// Run: node scripts/test-app-card.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const AC = require('../src/app-card.js');
const M = await import('../src/lib/app-card-model.js');
const zh = (await import('../src/lib/i18n-zh.js')).default;
const ja = (await import('../src/lib/i18n-ja.js')).default;
const T0 = Date.now();
let pass = 0, fail = 0;
const ok = (c, name, extra) => { if (c) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.error(`  ✗ ${name}${extra !== undefined ? '\n    ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 1500) : ''}`); } };
const fill = (s, p) => String(s).replace(/\{(\w+)\}/g, (m, k) => (p && p[k] != null ? String(p[k]) : m));
const tFor = (dict, seen) => (s, p) => { if (seen) seen.add(s); return fill(dict ? (dict[s] ?? s) : s, p); };
const LANGS = { en: null, zh, ja };

// a real-shaped plan summary (the WeChat .deb walk: 231 MB, postinst/prerm/postrm) and a package plan (hello)
const WECHAT = { id: 'ap-7c1e00', host: 'local', state: 'proposed', request: { kind: 'deb', debPath: '/home/u/.vibespace/apps/staging/x.deb' }, label: 'wechat',
  app: { name: 'WeChat', labels: { zh: '微信', ja: 'WeChat' } }, fetch: { host: 'dldir1v6.qq.com', recipe: 'Tencent' },
  by: { kind: 'agent', conversation: 'c1', name: '装应用 · 微信' }, why: '你让我装微信', digest: 'd'.repeat(32),
  summary: AC.planSummary({ downloadBytes: 231359624, installedBytes: 760e6, origins: ['local-file'], packages: ['wechat'], closure: [{ package: 'wechat' }, { package: 'libatomic1' }],
    commands: ['sudo DEBIAN_FRONTEND=noninteractive apt-get install -y ./wechat.deb'], deb: { sha256: 'b1c9'.repeat(16), scripts: ['postinst', 'prerm', 'postrm'], name: 'WeChatLinux_x86_64.deb', size: 231359624 } }) };
const HELLO = { id: 'ap-00aa11', host: 'local', state: 'proposed', request: { kind: 'apt', packages: ['hello'] }, label: 'hello', by: { kind: 'agent', conversation: 'c1', name: 'Image work' }, why: 'a friendly greeting program', digest: 'e'.repeat(32),
  summary: AC.planSummary({ downloadBytes: 53000, installedBytes: 284000, origins: ['Debian:12.15/oldstable'], packages: ['hello'], closure: [{ package: 'hello' }], commands: ['sudo apt-get install -y hello'] }) };
const APPIMG = { ...WECHAT, id: 'ap-a1a1a1', request: { kind: 'appimage', file: '/x' }, fetch: { host: 'example.org' }, summary: AC.planSummary({ downloadBytes: 310e6, installedBytes: 750e6 }) };
const REMOVE = { id: 'ap-rm0001', host: 'local', state: 'proposed', request: { kind: 'remove', entryId: 'gimp' }, label: 'gimp', by: { name: 'Tidy up' }, why: 'you said you do not use it', digest: 'f'.repeat(32), summary: AC.planSummary({ removes: ['gimp', 'gimp-data'], commands: ['sudo apt-get remove -y gimp'] }) };
const SOURCE = { id: 'ap-src001', host: 'local', state: 'proposed', request: { kind: 'source', source: { id: 'vscode', uris: ['https://packages.microsoft.com/repos/code'] } }, label: 'vscode', by: { name: 'Editor' }, why: '', digest: 'a'.repeat(32),
  summary: AC.planSummary({ sourceSpec: { uris: ['https://packages.microsoft.com/repos/code'], fingerprints: ['BC528686B50D79E339D3721CEB3E94ADBE1229CF'] }, commands: ['sudo install -m 0644 key /etc/apt/keyrings/x.asc'] }) };

console.log('§1 the VIEW — a stored proposal → the contract both install lanes share');
{
  const v = AC.cardView(WECHAT);
  ok(v.kind === 'deb' && v.app.name === 'WeChat' && v.app.labels.zh === '微信' && v.by.name === '装应用 · 微信' && v.why === '你让我装微信', 'a .deb: its kind, its own name + localized labels, who asks and why', v);
  ok(v.from && v.from.kind === 'download' && v.from.host === 'dldir1v6.qq.com' && v.from.recipe === 'Tencent' && v.bytes.download === 231359624 && v.keeps === 'replay', 'a download: the host and the recipe that vouches for it, the sizes, comes back after a rebuild', v);
  ok(v.details.sha256 === 'b1c9'.repeat(16) && v.details.scripts.join() === 'postinst,prerm,postrm' && v.details.count === 2 && v.details.packages.join() === 'wechat,libatomic1' && v.digest === 'd'.repeat(32), 'Details: the sha256, the install scripts, every package, the commands; the plan digest', v.details);
  const h = AC.cardView(HELLO);
  ok(h.kind === 'package' && h.from.kind === 'sources' && h.from.origin === 'Debian:12.15/oldstable' && h.app.name === 'hello' && !h.details.sha256, 'a package: from the machine\'s sources (apt\'s own origin words, worded by the client)', h);
  ok(AC.cardView(APPIMG).keeps === 'home' && AC.cardView(SOURCE).kind === 'source' && AC.cardView(SOURCE).from.host === 'packages.microsoft.com' && AC.cardView(REMOVE).from === null, 'an AppImage is kept in the home folder; a source names its host; a removal has no origin');
  const done = AC.cardView({ ...HELLO, state: 'done', result: { entryId: 'hello', rows: [{ id: 'app.hello', label: 'Hello' }] } });
  const failed = AC.cardView({ ...HELLO, state: 'failed', result: { code: 'install_failed', error: 'exit 100', step: 'install' } });
  ok(done.result.rows[0].id === 'app.hello' && failed.result.step === 'install' && failed.result.code === 'install_failed', 'an install\'s rows; a failure\'s step and code', { done: done.result, failed: failed.result });
  ok(AC.stepOf('no_sudo') === 'prepare' && AC.stepOf('install_failed') === 'install' && AC.stepOf('not_recorded', { recorded: true }) === 'record', 'a failure\'s step by its code: before the slot ran, inside it, at the record');
  ok(AC.cardView({ ...HELLO, firstUse: true, keeps: 'system', planChanged: true }).firstUse === true && AC.cardView({ ...HELLO, keeps: 'system' }).keeps === 'system' && AC.cardView({ ...HELLO, planChanged: true }).planChanged === true, 'Layer 1\'s first use and "always there", a changed plan — carried as structure');
  const plan = AC.cardView({ host: 'local', request: { kind: 'apt', packages: ['gimp'] }, label: 'gimp', summary: AC.planSummary({ downloadBytes: 1 }), digest: 'x', state: 'plan' });
  ok(plan.id === null && plan.by === null && plan.state === 'plan' && plan.app.name === 'gimp', 'the user\'s own dialog: a plan with no proposer is the same view');
}

console.log('§2 the WORDS per kind and state, en / zh / ja');
const faces = []; // [lang, label, text]
{
  const views = { WECHAT, HELLO, APPIMG, REMOVE, SOURCE };
  const states = [{}, { state: 'installing' }, { state: 'done', result: { rows: [{ id: 'app.x', label: 'X' }] } }, { state: 'done', result: { rows: [] } },
    { state: 'failed', result: { step: 'prepare', code: 'no_sudo', error: 'no passwordless sudo' } }, { state: 'failed', result: { step: 'install', code: 'install_failed', error: 'exit 100' } }, { state: 'failed', result: { step: 'record', code: 'not_recorded', error: 'x' } },
    { firstUse: true }, { planChanged: true }, { keeps: 'system' }, { fetch: { host: 'example.org' } }, { fetch: { file: 'WeChatLinux_x86_64.deb' } } /* apps-joint: an installer that was a file */];
  const missing = new Set();
  for (const [lang, dict] of Object.entries(LANGS)) {
    const seen = new Set();
    const t = tFor(dict, seen);
    for (const [vn, base] of Object.entries(views)) for (const st of states) {
      const v = AC.cardView({ ...base, ...st });
      const w = M.cardWords(v, t, lang);
      const pg = M.progressWords(v, t);
      for (const k of ['title', 'by', 'from', 'fromNote', 'gives', 'firstUse', 'changed', 'go', 'later']) if (w[k]) faces.push([lang, `${vn}.${k}`, w[k]]);
      if (pg) { faces.push([lang, `${vn}.progress`, pg.text]); for (const a of pg.actions) faces.push([lang, `${vn}.${a}`, a === 'open' ? t('Open') : t('Try again')]); }
    }
    for (const b of ['Details', 'More', 'Not now']) faces.push([lang, b, t(b)]);
    if (dict) for (const s of seen) if (!(s in dict)) missing.add(`${lang}: ${s}`);
  }
  ok(missing.size === 0, 'every sentence a card says has its zh and ja entry', [...missing]);
  const tz = tFor(zh), tj = tFor(ja), te = tFor(null);
  const wz = M.cardWords(AC.cardView(WECHAT), tz, 'zh');
  ok(wz.title === '安装 微信？' && wz.by === '「装应用 · 微信」想装它：你让我装微信' && /^来自 dldir1v6\.qq\.com（官方下载地址） · 下载 231 MB · 装好后占用约 760 MB$/.test(wz.from) && wz.gives === '装好后出现在「应用」里；这台机器重建后会自动装回。' && wz.go === '安装' && wz.later === '暂不', 'zh: the design\'s card, line for line (the app\'s own name 微信, not the agent\'s word)', wz);
  ok(M.cardWords(AC.cardView(WECHAT), tj, 'ja').title === 'WeChat をインストールしますか？' && M.cardWords(AC.cardView(WECHAT), te, 'en').title === 'Install WeChat?', 'ja / en: the label of the reader\'s language, else the name');
  const unv = M.cardWords(AC.cardView({ ...WECHAT, fetch: { host: 'example.org' } }), tz, 'zh');
  ok(unv.from.startsWith('来自 example.org · ') && unv.fromNote === '这是从网上下载的安装包，VibeSpace 无法确认发布者。', 'a download no recipe vouches for: the domain, and ONE plain sentence under it', unv);
  ok(M.cardWords(AC.cardView(HELLO), tz, 'zh').from === '来自这台机器的软件源（Debian 12） · 下载 53 kB · 装好后占用约 284 kB', 'a package: "this machine\'s package sources (Debian 12)" — apt\'s origin worded', M.cardWords(AC.cardView(HELLO), tz, 'zh').from);
  ok(M.cardWords(AC.cardView({ ...HELLO, keeps: 'system', firstUse: true }), tz, 'zh').gives === '装好后出现在「应用」里，一直都在。' && M.cardWords(AC.cardView({ ...HELLO, firstUse: true }), tz, 'zh').firstUse === '第一次安装要先准备应用空间（约 1 分钟）。', 'Layer 1: "一直都在" on an app-system machine; the first install\'s line');
  ok(M.cardWords(AC.cardView({ ...HELLO, planChanged: true }), tz, 'zh').changed === '计划有变化，请再看一眼。', 'a changed plan says so on the card');
  const pz = (st) => M.progressWords(AC.cardView({ ...HELLO, ...st }), tz);
  ok(pz({ state: 'installing' }).text === zh['Installing…'] && /安装/.test(pz({ state: 'installing' }).text) && pz({ state: 'done', result: { rows: [{ id: 'app.hello' }] } }).text === '已安装' && pz({ state: 'done', result: { rows: [{ id: 'app.hello' }] } }).actions.join() === 'open' && pz({ state: 'failed', result: { step: 'install' } }).actions.join() === 'retry' && pz({}) === null,
    'progress in the card: 正在安装… → 已安装 · [打开]; a failure → [再试一次]; nothing pressed → the two buttons');
  ok(M.openRowOf(AC.cardView({ ...HELLO, state: 'done', result: { rows: [{ id: 'app.hello', label: 'Hello' }] } })) === 'app.hello' && M.openRowOf(AC.cardView(HELLO)) === null, 'Open starts the row the install added');
  const d1 = M.detailLines(AC.cardView(HELLO), te).map((l) => l.text);
  ok(d1[0] === '1 package: hello' && !d1.some((l) => /1 packages/.test(l)), '"1 packages" is gone (review I7)', d1);
  ok(M.originWords('Debian:12.15/oldstable') === 'Debian 12' && M.originWords('Ubuntu:24.04/noble') === 'Ubuntu 24' && M.originWords('local-file') === 'local-file', 'apt\'s origin words → "Debian 12"');
}

console.log('§3 THE WORD CENSUS — no card face says a package-system word, in any language (Details may)');
{
  const JARGON = /\bdebs?\b|\.deb\b|appimage|\bapt(-get)?\b|\bdpkg\b|\broot\b|\bsudo\b|\bsha(256)?\b|\bxpra\b/i;
  const census = (list) => list.filter(([, , s]) => JARGON.test(s));
  const hits = census(faces);
  ok(faces.length > 300 && hits.length === 0, `${faces.length} face lines (5 kinds × 12 states × 3 languages + the buttons) carry no deb / AppImage / apt / root / sudo / sha / dpkg / xpra`, hits.slice(0, 8));
  const det = [];
  for (const [lang, dict] of Object.entries(LANGS)) for (const v of [WECHAT, HELLO]) det.push(...M.detailLines(AC.cardView(v), tFor(dict)).map((l) => l.text));
  ok(det.some((s) => /sha256 b1c9/.test(s)) && det.some((s) => /apt-get install/.test(s)) && det.some((s) => /postinst/.test(s)), 'Details DO carry the commands, the sha256 and the install scripts (the census is on the face only)');
  // CONTROL: one face line made to say "apt" — the census must catch it, in every language
  const planted = (s, p) => (s === 'It appears in Apps, and comes back by itself if this machine is rebuilt.' ? 'Installed with apt; it comes back after a rebuild.' : fill(s, p));
  const wp = M.cardWords(AC.cardView(HELLO), planted, 'en');
  ok(census([['en', 'gives', wp.gives]]).length === 1, 'CONTROL: a planted "apt" on a card\'s face is caught by the census');
  ok(census([['en', 'title', M.cardWords(AC.cardView({ ...HELLO, app: { name: 'WeChat.AppImage' } }), tFor(null), 'en').title]]).length === 1, 'CONTROL: so is an AppImage file name used as the title (why the engine titles a card with the app\'s own name)');
}

console.log('§4 THE DIGEST — what the card showed, and only that');
{
  const base = AC.cardView(WECHAT);
  const d0 = AC.shownDigest(base);
  const moved = {
    'the name': { ...WECHAT, app: { ...WECHAT.app, name: 'WeChat2' } }, 'a localized name': { ...WECHAT, app: { ...WECHAT.app, labels: { zh: '微信2' } } },
    'the host': { ...WECHAT, fetch: { host: 'evil.example' } }, 'the recipe': { ...WECHAT, fetch: { host: 'dldir1v6.qq.com' } },
    'the download size': { ...WECHAT, summary: { ...WECHAT.summary, downloadBytes: 1 } }, 'the installed size': { ...WECHAT, summary: { ...WECHAT.summary, installedBytes: 1 } },
    'the sha256': { ...WECHAT, summary: { ...WECHAT.summary, deb: { ...WECHAT.summary.deb, sha256: 'c'.repeat(64) } } }, 'the plan': { ...WECHAT, digest: '9'.repeat(32) },
    'the commands': { ...WECHAT, summary: { ...WECHAT.summary, commands: ['sudo rm -rf /'] } }, 'the packages': { ...WECHAT, summary: { ...WECHAT.summary, closure: ['wechat', 'evil'] } },
    'the why': { ...WECHAT, why: 'trust me' }, 'the proposer': { ...WECHAT, by: { name: 'Other' } }, 'the proposal id': { ...WECHAT, id: 'ap-ffffff' }, 'the machine': { ...WECHAT, host: 'gpu-box' }, 'the kind': { ...WECHAT, request: { kind: 'apt', packages: ['wechat'] } },
  };
  const same = Object.entries(moved).filter(([, p]) => AC.shownDigest(AC.cardView(p)) === d0).map(([k]) => k);
  ok(same.length === 0, `the digest moves with each of ${Object.keys(moved).length} things a card shows`, same);
  const still = [{ state: 'installing' }, { state: 'failed', result: { step: 'install', error: 'x' } }, { planChanged: true }, { state: 'done', result: { rows: [{ id: 'app.wechat' }] } }];
  ok(still.every((st) => AC.shownDigest(AC.cardView({ ...WECHAT, ...st })) === d0), 'and NOT with the state, the progress, the result or the changed-plan note (they move while the click runs)');
  ok(M.shownDigest(base) === d0 && /^a1:[0-9a-f]{16}:\d+$/.test(d0), 'the browser computes the same digest as the engine (one PURE function)', d0);
  const { UserTodoManager } = (() => { const m = require('../src/user-todos.js'); return m.UserTodoManager ? m : { UserTodoManager: m }; })();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-app-card-'));
  try {
    const st = new UserTodoManager({ dataDir: dir, onChange: () => { }, expirySweepMs: 0 });
    const it = st.add('claude:x', { text: 'Install WeChat?', origin: 'apps', by: 'agent', action: { type: 'app-install', id: WECHAT.id, host: 'local', kind: 'deb' }, card: base });
    st.flush();
    const back = new UserTodoManager({ dataDir: dir, onChange: () => { }, expirySweepMs: 0 }).get(it.id);
    ok(AC.shownDigest(st.get(it.id).card) === d0 && back && AC.shownDigest(back.card) === d0, 'the For-you store keeps a card EXACTLY — in memory and across a restart (its digest is the view\'s)');
    ok(st.setCard(it.id, AC.cardView({ ...WECHAT, state: 'installing' })) === true && st.get(it.id).card.state === 'installing' && st.setCard(it.id, AC.cardView({ ...WECHAT, state: 'installing' })) === false, 'setCard moves the card (and an unchanged card is no broadcast)');
    let threw = null; try { st.add('claude:x', { text: 'x', origin: 'apps', by: 'agent', card: { a: { b: { c: { d: { e: 1 } } } } } }); } catch (e) { threw = e.message; }
    let threw2 = null; try { st.add('claude:x', { text: 'y', origin: 'apps', by: 'agent', card: { html: 'x'.repeat(2001) } }); } catch (e) { threw2 = e.message; }
    ok(/nested too deep/.test(threw || '') && /longer than 2000/.test(threw2 || ''), 'a card outside the bounds is refused by name (depth, string length)', [threw, threw2]);
    st.setStatus(it.id, 'done', 'apps');
    const snap = st.snapshot().resolved.find((x) => x.id === it.id);
    ok(snap && snap.card && snap.card.details === null && snap.card.app.name === 'WeChat' && st.get(it.id).card.details, 'a RESOLVED card rides the snapshot as its face only (its Details stay on the record)');
    const RC = require('../src/record-clear.js');
    const shapes = RC.SHAPES || (RC.fieldsOf && RC.fieldsOf('todo'));
    const todoShape = JSON.stringify(shapes && (shapes.todo || shapes));
    ok(/"card","drop"/.test(todoShape) || /\['card', 'drop'\]/.test(fs.readFileSync(path.join(repo, 'src/record-clear.js'), 'utf8')), 'Clear content… drops a card too (an app\'s name, the agent\'s why)');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

console.log('§5 the row renderer escapes every piece of a card');
{
  const src = fs.readFileSync(path.join(repo, 'src/lib/user-todos-row.js'), 'utf8');
  const i = src.indexOf('export function appCardHtml(');
  const body = src.slice(i, src.indexOf('\n}\n', i));
  const holes = [...body.matchAll(/\$\{([^}]*(?:\}[^$`]*?)?)\}/g)].map((m) => m[1].trim());
  const SAFE = /^(escHtml\(|icon$|html$|acts$|cls$|pg\.kind$|a$|d\.mono \? |pg\.kind === 'busy'|w\.details\.map\(\(d\) => `<div class="ut-app-dline\$\{d\.mono \? ' ut-app-mono' : '')/; // the Details map: its text is escHtml(d.text), its class one of two literals
  const bad = holes.filter((h) => !SAFE.test(h));
  ok(i > 0 && holes.length >= 8 && bad.length === 0 && body.includes('${escHtml(d.text)}'), `every \${…} in appCardHtml is escHtml(…) or one of our own closed values (${holes.length} holes)`, bad);
}

console.log('§6 apps-joint r1 — a download\'s icon on the card (F1); an installed row in the reader\'s language (F2)');
{
  const R = await import('../src/lib/user-todos-row.js');
  const card = (icon) => AC.cardView({ ...WECHAT, app: { ...WECHAT.app, icon } });
  const html = (icon) => R.appCardHtml({ card: card(icon), action: { type: 'app-install', id: WECHAT.id } }, tFor(zh), { lang: 'zh' });
  ok(/<img class="ut-app-icon" alt="" src="\/api\/apps\/proposals\/ap-7c1e00\/icon">/.test(html('/api/apps/proposals/ap-7c1e00/icon')), 'F1: the card draws the icon read out of a download (its proposal\'s icon route)');
  ok(!/<img/.test(html('https://evil.example/x.png')) && !/<img/.test(html('/api/apps/proposals/ap-7c1e00/icon?x=1')) && !/<img/.test(html('/api/apps/proposals/../icon')), 'F1 CONTROL: any other address draws no picture');
  const row = { id: 'app.wechat', label: 'wechat', labels: { zh: '微信' } };
  ok(M.rowName(row, 'zh') === '微信' && M.rowName(row, 'ja') === 'wechat' && M.rowName(row, 'en') === 'wechat' && M.rowName({ label: 'gimp' }, 'zh') === 'gimp', 'F2: an installed row reads 微信 in zh (its own Name[zh_CN]), its label elsewhere');
  const L = fs.readFileSync(path.join(repo, 'src/lib/desktop-app-launcher.js'), 'utf8');
  ok(/desktop-launch-card-label">\$\{escHtml\(catalogLabel\(row\)\)\}/.test(L) && /export function catalogLabel\(row, lang = resolveLang\(\)\)/.test(L) && /row\.labels\[lang\]/.test(L), 'F2: the Apps card\'s name goes through ONE rule in the reader\'s language — catalogLabel, labels[lang] › label (int203: lane apps-interface\'s rule, the same answer as rowName; a card that reads row.label shows "wechat" in zh)');
}

console.log(`\n${fail ? `${fail} FAILED` : 'ALL PASS'} (${pass}) in ${Date.now() - T0} ms`);
process.exit(fail ? 1 : 0);
