#!/usr/bin/env node
// test-content-store-reads — THE CONTENT STORES a failed read emptied and a later write replaced (主开发 r3005, the store census
// of lane bl-machines-b, batch 2), each now under the store-read law through src/store-read-hold.js. Per store, its legs:
//   ①  KEPT: its file holds rows, its read is REFUSED once (a PLACED refusal of the read call: fs.readFileSync answers EIO for that
//      one path — never a real mount, never a mode change), then the store's ordinary next write: the rows are still on disk
//      (at the candidate d458fc27d every store read NOT KEPT — run bff3f3066-20261123064239-both, the legs alone, both zones)
//   ②  HELD: every change refused by name (its code), nothing written, where a person meets the store it says so
//   ③  A RESTART while held is held again, nothing written
//   ④  THE LIFT: the file reads again (the helper's read off the loop) ⇒ the rows are back, a change goes through and keeps them
//   ⑤  TORN BYTES: kept aside ONCE per content (a second start on the same bytes makes no second copy), then it starts empty;
//      the store's remover question answered on the leg (who deletes by this store's silence)
// Stand-ins only: a scratch data folder of this suite's own, made-up rows, no vendor call.
//   PP  published-pages.json — the share links a person gave out
//   SS  session-status.json — every task's state, urgency and reason, the history, the pending notices
// Run: node scripts/test-content-store-reads.mjs
import './scratch.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { scratchDir, anchored } from './scratch.mjs';
import { checker } from './lib/check.mjs';

const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = scratchDir('content-store-reads');
const { ok, report } = checker();
const quietly = async (fn) => { const l = console.log, w = console.warn, e = console.error; console.log = console.warn = console.error = () => { }; try { return await fn(); } finally { console.log = l; console.warn = w; console.error = e; } };
const EIO = () => Object.assign(new Error('EIO: i/o error, read (placed)'), { code: 'EIO' });
/** a PLACED refusal of the next `n` synchronous reads of `file` (EIO), then real reads */
const placeReads = (file, n = 1) => {
  const f = path.resolve(file), real = fs.readFileSync, seen = { n: 0 };
  fs.readFileSync = function (p, ...a) { if (typeof p === 'string' && path.resolve(p) === f && seen.n < n) { seen.n++; throw EIO(); } return real.call(this, p, ...a); };
  return { seen, restore: () => { fs.readFileSync = real; } };
};
const disk = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch { return null; } };
const json = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const world = (name) => { const d = path.join(ROOT, name); fs.mkdirSync(d, { recursive: true }); return d; };
const copiesOf = (F) => fs.readdirSync(path.dirname(F)).filter((n) => n.startsWith(path.basename(F) + '.corrupt-'));
/** a response stand-in for a route or a gate: its status, its body */
const resStub = () => { const r = { code: 200, body: null, headers: {} }; r.status = (c) => { r.code = c; return r; }; r.type = () => r; r.send = (b) => { r.body = b; return r; }; r.json = (b) => { r.body = b; return r; }; r.setHeader = (k, v) => { r.headers[k] = v; }; r.redirect = (u) => { r.code = 302; r.body = u; return r; }; return r; };

// ══ PP published-pages.json ══
console.log('PP [published-pages.json] the share links a person gave out');
{
  const P = require(path.join(REPO, 'src/server/published-pages.js'));
  const src = world('pages-src');
  const html = (n) => { const f = path.join(src, `${n}.html`); fs.writeFileSync(f, `<!doctype html><html><head><title>${n}</title></head><body>${n}</body></html>`); return f; };
  const idOf = (r) => (r && r.page && r.page.id) || null;
  const mk = (d) => P.create({ dataDir: d, log: () => { } });
  /** a world with two published pages (one public): → { d, F, ids } */
  const twoPages = (name) => {
    const d = world(name), p = mk(d);
    const ids = [idOf(p.publish({ srcPath: html(`${name}-first`), name: 'First page', makePublic: true })), idOf(p.publish({ srcPath: html(`${name}-second`), name: 'Second page' }))];
    return { d, F: path.join(d, 'published-pages.json'), ids };
  };
  const visit = (p, id) => { const res = resStub(); p.serve({ params: { id }, headers: { accept: 'text/html' }, method: 'GET' }, res); return res; };

  // ① KEPT
  {
    const { d, F, ids } = twoPages('pp1');
    ok(ids.every(Boolean) && (json(F) || {}).pages.length === 2, 'PP1 setup: two pages published, both on disk', { ids });
    const before = disk(F), pr = placeReads(F, 1);
    let next = null, startBytes = null;
    try { await quietly(() => { const p2 = mk(d); startBytes = disk(F); next = p2.publish({ srcPath: html('pp1-third'), name: 'Third page' }); }); } finally { pr.restore(); }
    const onDisk = ((json(F) || {}).pages || []).map((p) => p.id);
    ok(pr.seen.n === 1, 'PP1 setup: the placed refusal met the store\'s read once', pr.seen);
    ok(onDisk.length === 2 && ids.every((id) => onDisk.includes(id)) && startBytes === before && disk(F) === before, 'PP1 KEPT — a read that failed once is never written over by the next publish: the two pages (their share links) stay on disk, the file byte for byte', { onDisk, next: next && (next.code || next.error || 'published') });
    ok(!!next && next.code === 'pages_unread' && next.status === 503 && /cannot read its list of published pages/.test(next.error || ''), 'PP1 the publish itself is refused BY NAME (503 pages_unread) — never «published» into an empty list', next);
  }
  // ② HELD: the doors, the link, the lists
  {
    const { d, F, ids } = twoPages('pp2');
    const before = disk(F), pr = placeReads(F, 1);
    let p2 = null;
    try { await quietly(() => { p2 = mk(d); }); } finally { pr.restore(); }
    const flags = p2.setFlags(ids[0], { makePublic: false }), gone = p2.remove(ids[1]), content = p2.publishContent({ html: '<p>x</p>', name: 'x', srcKey: 'userfile:conv-madeup:/x.html' });
    ok([flags, gone, content].every((r) => r && r.code === 'pages_unread' && r.status === 503), 'PP2 every change while held is refused by name: a visibility flip, an unpublish, an agent\'s SendUserFile (503 pages_unread)', { flags, gone, content });
    const v = visit(p2, ids[0]);
    ok(v.code === 503 && /cannot be shown right now/.test(String(v.body)) && !!v.headers['Retry-After'], 'PP2 a share link given out answers 503 «cannot be shown right now» (Retry-After) — never 404 «not found», never 410 «unpublished»', { code: v.code, body: v.body });
    const by = p2.byId(ids[0]);
    ok(!!by && by.code === 'pages_unread' && !by.page && !by.gone, 'PP2 the artifact registry asks one id\'s fate: HELD (unknown), never «never here» nor «gone»', by);
    const REG = require(path.join(REPO, 'src/server/artifact-registry.js'));
    const row = { key: ':/p/' + ids[0], kind: 'page', presented: true, page: ids[0], name: 'First page', state: 'published', url: '/p/' + ids[0], public: true, origin: '', by: 'agent', firstAt: 1, lastAt: 1 };
    const sess = { _artifacts: { ['page:' + ids[0]]: row }, cwd: '/scratch-made-up', host: 'local' };
    REG.configure({ pages: () => p2, activeSessions: () => new Map([['sess-madeup', sess]]), log: { log() { }, warn() { }, error() { } } });
    const att = await REG.judgeAsk({ session: null, items: ['/p/' + ids[0]] });
    ok(/pages-unread/.test(JSON.stringify(att)) && !/no such page/.test(JSON.stringify(att)), 'PP2 an agent attaching a /p/<id> while held hears the list cannot be read — never «no such page on this server»', att);
    const healthy = mk(d);   // the CONTROL: the same row against the list as it reads (no refusal) — the row is one the view draws
    REG.configure({ pages: () => healthy });
    const lf0 = JSON.stringify(REG.listFor('sess-madeup'));
    REG.configure({ pages: () => p2 });
    const lf = JSON.stringify(REG.listFor('sess-madeup'));
    ok(lf0.includes('First page') && lf0.includes('published') && lf.includes('First page') && !/unpublished|Unpublished/.test(lf), 'PP2 a page another conversation presented keeps the row it last knew in the Artifacts list (never «Unpublished» on an unread list)', lf.slice(0, 600));
    const routes = {}; p2.registerRoutes({ get: (u, f) => { routes['GET ' + u] = f; }, post: (u, f) => { routes['POST ' + u] = f; }, delete: (u, f) => { routes['DELETE ' + u] = f; } });
    const lr = resStub(); routes['GET /api/pages']({ query: {}, headers: {} }, lr);
    const br = resStub(); routes['GET /api/pages/by-path']({ query: { path: html('pp2-first') }, headers: {} }, br);
    const pubR = resStub(); routes['POST /api/pages/publish']({ body: { path: html('pp2-new') }, headers: {} }, pubR);
    ok(!!lr.body && lr.body.code === 'pages_unread' && /cannot read its list of published pages/.test(lr.body.unread || '') && !!br.body && br.body.code === 'pages_unread' && br.body.page === null, 'PP2 the lists say it (the chips\' list and the Publish dialog\'s by-path read carry unread + pages_unread — the dialog words it, zh / ja)', { list: lr.body, byPath: br.body });
    ok(pubR.code === 503 && !!pubR.body && pubR.body.code === 'pages_unread', 'PP2 the Publish dialog\'s POST answers 503 pages_unread (the toast words it by its code)', { code: pubR.code, body: pubR.body });
    const flR = resStub(); routes['POST /api/pages/:id']({ params: { id: ids[0] }, body: { public: false }, headers: {} }, flR);
    const unR = resStub(); routes['DELETE /api/pages/:id']({ params: { id: ids[1] }, headers: {} }, unR);
    ok(flR.code === 503 && flR.body.code === 'pages_unread' && unR.code === 503 && unR.body.code === 'pages_unread', 'PP2 the chip\'s visibility flip and unpublish routes answer 503 pages_unread (never 404 «no such page»)', { flip: flR.code, unpublish: unR.code });
    const known = visit(p2, ids[0]), never = visit(p2, 'pgmadeup0000');
    ok(known.code === never.code && known.body === never.body && known.headers['Cache-Control'] === 'no-store' && never.headers['Cache-Control'] === 'no-store', 'PP2 no existence oracle: an id that never existed reads exactly like a real one while held (503, the same words, no-store)', { known: known.code, never: never.code });
    ok(disk(F) === before, 'PP2 nothing was written over the file while held', null);
    p2._hold.stop(); healthy._hold.stop();
  }
  // ③ a RESTART while held
  {
    const { d, F } = twoPages('pp3');
    const before = disk(F), pr = placeReads(F, 2);
    let a = null, b = null;
    try { await quietly(() => { a = mk(d); a._hold.stop(); b = mk(d); }); } finally { pr.restore(); }
    ok(pr.seen.n === 2 && !!b._hold.held() && b.publish({ srcPath: html('pp3-x') }).code === 'pages_unread' && disk(F) === before, 'PP3 a restart while held reads the same file again and is held again: refused, nothing written', { placed: pr.seen.n, held: b._hold.held() });
    b._hold.stop();
  }
  // ④ THE LIFT
  {
    const { d, F, ids } = twoPages('pp4');
    const pr = placeReads(F, 1);
    let p2 = null;
    try { await quietly(() => { p2 = mk(d); }); } finally { pr.restore(); }
    const lifted = await quietly(() => p2._hold.again());
    const listed = p2.list({}).map((p) => p.id);
    const third = p2.publish({ srcPath: html('pp4-third'), name: 'Third page' });
    const onDisk = ((json(F) || {}).pages || []).map((p) => p.id);
    ok(lifted === true && !p2._hold.held() && ids.every((id) => listed.includes(id)), 'PP4 the file reads again (the helper\'s read off the loop) ⇒ the hold lifts and both pages are listed again', { lifted, listed });
    ok(!!idOf(third) && onDisk.length === 3 && ids.every((id) => onDisk.includes(id)) && visit(p2, ids[0]).code === 200, 'PP4 after the lift a publish goes through and keeps both earlier pages; a share link serves again', { onDisk });
  }

  // ⑥ r3107 THE ROADS THAT LOOK A PAGE UP THROUGH THE LIST — each asks the hold FIRST (never «no page among yours» / «no published page»)
  {
    const express = require('express');
    const { setupAgentRoutes } = require(path.join(REPO, 'src/agent-routes.js'));
    const d = world('pp6');
    let cur = mk(d);
    const sessA = { agentToken: 'vsst_A', backend: 'claude', claudeSessionId: 'conv-A', cwd: '/scratch-made-up', name: 'a' };
    const app = express(); app.use(express.json());
    setupAgentRoutes({
      app, activeSessions: new Map([['sA', sessA]]), tasks: { get: () => null, groupsOfSession: () => [] },
      sessionStatus: { snapshot: () => ({}), get: () => null, consumeNotice: () => null, consumeNotices: () => [], pendingNotices: () => [], rekey: () => { }, clear: () => null, setByUser: () => { } },
      SessionStatusManager: { renderNotice: () => '', renderNotices: () => '' },
      userTodos: { rekey: () => { }, forSession: () => [], resolveByAgent: () => null, add: () => ({}) },
      sessionStatusKey: (s, sid) => `claude:${sid}`, serverSetting: () => undefined, scheduleCtxSync: () => { }, remoteCtxBaseFor: () => null,
      getPublishedPages: () => cur,
    });
    const srv = app.listen(0); await new Promise((r) => srv.on('listening', r));
    const base = `http://127.0.0.1:${srv.address().port}`;
    const post = (p, body) => fetch(base + p, { method: 'POST', headers: { Authorization: 'Bearer vsst_A', 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, j: await r.json().catch(() => ({})) }));
    const pub = () => fetch(`${base}/api/agent/pages/publish?path=${encodeURIComponent('/scratch-made-up/a.html')}&title=A&public=1`, { method: 'POST', headers: { Authorization: 'Bearer vsst_A', 'Content-Type': 'text/html' }, body: '<p>a made-up page</p>' }).then(async (r) => ({ status: r.status, j: await r.json().catch(() => ({})) }));
    const first = await pub(), id = first.j.page && first.j.page.id;
    ok(first.status === 200 && !!id && first.j.page.public === true, 'PP6 setup: the agent published a public page of its own (the list reads)', first.j);
    const F = path.join(d, 'published-pages.json'), before = disk(F), pr = placeReads(F, 1);
    try { await quietly(() => { cur = mk(d); }); } finally { pr.restore(); }
    const held = (r) => r.status === 503 && r.j.code === 'pages_unread' && /cannot read its list of published pages/.test(r.j.error || '') && !/among the pages this conversation published|no such page|published-pages\.json|data folder/.test(r.j.error || '');   // r3139 (c): the plain name
    // r3139 MUST 1: a refused CHANGE says first that it was NOT done — nothing changed, the page as it was (a public one served again at the read), ask again; then the cause
    const notDone = (r, what) => held(r) && /^Not done — /.test(r.j.error) && r.j.error.includes(what) && /nothing was changed/.test(r.j.error) && /served again as soon as VibeSpace reads its list/.test(r.j.error) && /Ask again in a few minutes/.test(r.j.error) && /Why: /.test(r.j.error) && r.j.error.indexOf('Not done') < r.j.error.indexOf('Why: ');
    const un = await post('/api/agent/pages/unpublish', { ref: id }), vis = await post('/api/agent/pages/visibility', { ref: id, visibility: 'private' });
    ok(notDone(un, 'the page was not taken down') && notDone(vis, 'its visibility was not changed to private'), 'PP6 the agent\'s `vibespace-page unpublish` and `visibility` on its own page while held: 503 whose words say FIRST it was NOT done (nothing changed; the page as it was, a public one served again at the read; ask again) and then why — never «no page … among yours», never only «cannot be shown right now»', { unpublish: un.j.error, visibility: vis.j.error });
    ok(!notDone({ status: 503, j: { code: 'pages_unread', error: cur.heldWords() } }, 'the page was not taken down'), 'PP6 RED: the store\'s one sentence (the answer at line 632) is not the take-down\'s words — it fails the leg', null);
    const ls = await fetch(base + '/api/agent/pages', { headers: { Authorization: 'Bearer vsst_A' } }).then(async (r) => ({ status: r.status, j: await r.json().catch(() => ({})) }));
    ok(held(ls) && ls.j.unread === ls.j.error, 'PP6 the agent\'s `vibespace-page list` while held: 503 with the words and the unread mark (the CLI prints a refusal\'s words) — never an empty list, never «no pages published yet»', ls);
    const again = await pub();
    ok(held(again), 'PP6 the agent\'s publish while held answers 503 (the hold\'s refusal), never 400 «bad request»', again);
    ok(disk(F) === before, 'PP6 nothing was written over the file by any agent road while held', null);
    // the design road: a page NAMED (`vibespace-design publish --page <id>`), and the Designs home's page fact
    const DE = require(path.join(REPO, 'src/server/design-engine.js'));
    const de = DE.create({ dataDir: world('pp6-design'), getPublishedPages: () => cur, timers: { setInterval: () => ({ unref() { } }), clearInterval: () => { }, setTimeout: () => ({ unref() { } }) }, log: () => { } });
    de.register({ dir: '/scratch-made-up/design-pp6', title: 'Made-up design', sessionId: 'sA' });   // the agent's own design (its list is scoped to its session)
    const dp = await quietly(() => de.publish({ dir: '/scratch-made-up/design-pp6', pageId: id, sessionId: 'sA' }));
    ok(!!dp && dp.code === 'pages_unread' && dp.status === 503 && /cannot read its list of published pages/.test(dp.error || ''), 'PP6 the design road with a page named while held: 503 pages_unread with the words — never «no published page <id>»', dp);
    { const { registerDesignRoutes } = require(path.join(REPO, 'src/routes/design.js'));
      const routes = {}, dapp = { get: (u, f) => { routes['GET ' + u] = f; }, post: (u, f) => { routes['POST ' + u] = f; }, put: () => { }, delete: () => { }, patch: () => { }, use: () => { } };
      registerDesignRoutes(dapp, { design: de, activeSessions: new Map([['sA', sessA]]) });
      const call = async (k, req) => { const r = resStub(); await routes[k]({ query: {}, params: {}, headers: {}, ...req }, r); return r; };
      const ap = await call('POST /api/agent/design/publish', { headers: { authorization: 'Bearer vsst_A' }, body: { dir: '/scratch-made-up/design-pp6', page: id } });
      const op = await call('POST /api/design/publish', { body: { dir: '/scratch-made-up/design-pp6' } });
      ok(ap.code === 503 && ap.body.code === 'pages_unread' && op.code === 503 && op.body.code === 'pages_unread', 'PP6 AT THE WIRE: the agent\'s design publish (a page named) and the owner\'s Publish design answer 503 pages_unread — the routes\' status table has its row (it said 400)', { agent: ap.code, owner: op.code });
      const al = await call('GET /api/agent/designs', { headers: { authorization: 'Bearer vsst_A' } });
      ok(al.code === 200 && al.body.pagesUnread === 'pages_unread' && Array.isArray(al.body.designs) && al.body.designs.some((d) => d.dir === '/scratch-made-up/design-pp6' && d.page === null), 'PP6 the agent\'s design list (vibespace-design list) while held carries the mark the home\'s has: its designs read with no page are UNREAD, said', al.body);
      const CLI = fs.readFileSync(path.join(REPO, 'data/bin/vibespace-design'), 'utf8'), NOTE = "    if (r.body.pagesUnread) console.log('note: VibeSpace cannot read its list of published pages right now — a design shown below with no page is NOT known to be unpublished (ask again in a few minutes)');";
      const cliSays = (c) => c.includes(NOTE) && c.indexOf(NOTE) > c.indexOf("if (verb === 'list') {") && c.indexOf(NOTE) < c.indexOf('for (const d of r.body.designs) console.log(');
      ok(cliSays(CLI) && !cliSays(anchored(CLI, NOTE + '   // r3139 MUST 2\n', '', 'pp6-cli-today')), 'PP6 the CLI prints one line before the list: the pages list cannot be read, a design with no page is not known to be unpublished (RED: today\'s list, the line taken out)', null);
      const DW = fs.readFileSync(path.join(REPO, 'src/lib/design-window.js'), 'utf8'), MARK = "    if (r && r.pagesUnread) { known = false; state.textContent = t('VibeSpace cannot read its list of published pages right now, so it is not known whether this design was published.";
      const dialog = (dw) => dw.includes(MARK) && dw.indexOf(MARK) < dw.indexOf("else state.textContent = known ? t('Not published yet.") && dw.includes("err: heldWordsOf(r) || (r && (r.why || r.error)) || t('server unreachable')");
      ok(dialog(DW) && !dialog(anchored(DW, MARK, '    if (false) {', 'pp6-dialog-today')), 'PP6 the design\'s Publish dialog reads the mark BEFORE «Not published yet» and says the held words; its refusal toast words a held refusal by its code (RED: today\'s dialog, the mark unread)', null);   // stale-pins: kept
    }
    ok(/cannot read its list of published pages/.test(de.pagesHeldWords() || ''), 'PP6 the design engine says the pages list is held (GET /api/designs carries pagesUnread; the Designs home words it, zh / ja)', null);
    cur._hold.stop(); srv.close();
  }
  // ⑦ r3107 THE PAGE: the chip and the Designs home say why a list is empty; the toasts word a refusal by its code
  {
    const src = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
    const CV = src('src/lib/chat-view.js'), SB = src('src/lib/chat-status-bar.js'), DH = src('src/lib/design-home.js'), RD = src('src/routes/design.js');
    const chip = (cv, sb) => cv.includes("setPages(r.pages, { unread: r.code === 'pages_unread' ? pagesListHeldWords() : null })") && sb.includes("this._pagesUnread = unread || null;") && sb.includes("h.className = 'empty-hint empty-hint-inline chat-pages-held'; h.textContent = this._pagesUnread;") && (sb.match(/err: heldWordsOf\(r\) \|\| \(r && r\.error\) \|\| 'network'/g) || []).length === 2;
    const home = (dh, rd) => dh.includes('held.hidden = !r.pagesUnread;') && rd.includes("pagesUnread: 'pages_unread'");
    ok(chip(CV, SB), 'PP7 the chat status bar\'s pages chip: the list read\'s unread reaches setPages, the open list draws the words (and the tooltip), its two buttons\' toasts word a refusal by its code', null);
    ok(home(DH, RD), 'PP7 the Designs home: GET /api/designs says the pages list is unread, the home draws the words above the list', null);
    // their REDS: a copy with the release's line (the unread dropped) — each reads red on exactly its road
    ok(!chip(anchored(CV, "setPages(r.pages, { unread: r.code === 'pages_unread' ? pagesListHeldWords() : null })", 'setPages(r.pages)', 'pp7-chip-today'), SB), 'PP7 RED: the chip read with today\'s line (setPages(r.pages), the unread dropped) fails the leg', null);   // stale-pins: kept
    ok(!home(DH, anchored(RD, ", ...(design.pagesHeldWords && design.pagesHeldWords() ? { pagesUnread: 'pages_unread' } : {})", '', 'pp7-home-today', { count: 2 })), 'PP7 RED: the designs route with today\'s answer (no pagesUnread) fails the leg', null);
  }
  // ⑤ TORN BYTES, kept aside once; the remover question
  {
    const { d, F } = twoPages('pp5');
    const snaps = () => fs.readdirSync(path.join(d, 'published-pages')).sort();
    const s0 = snaps(), torn = '{"pages": [{"id": "pgmadeup0001", "name": "First';
    fs.writeFileSync(F, torn);
    const p2 = await quietly(async () => { const p = mk(d); await p._hold.again(); return p; });
    const c1 = copiesOf(F);
    ok(c1.length === 1 && disk(path.join(d, c1[0])) === torn && !p2._hold.held() && p2.list({}).length === 0, 'PP5 torn bytes: kept aside beside the store (their copy holds them byte for byte), then it starts empty', { copies: c1 });
    fs.writeFileSync(F, torn);
    await quietly(async () => { const p = mk(d); await p._hold.again(); });
    ok(copiesOf(F).length === 1, 'PP5 a second start on the SAME torn bytes makes no second copy (kept aside once per content)', copiesOf(F));
    const after = p2.publish({ srcPath: html('pp5-new'), name: 'New' });
    ok(!!idOf(after) && s0.every((n) => snaps().includes(n)) && snaps().length === s0.length + 1, 'PP5 NO REMOVER reads its silence: the snapshots of the pages the empty list no longer names stay on disk after the start and the next publish (removed only by an unpublish of its record)', { before: s0, after: snaps() });
  }
}

// ══ SS session-status.json ══
console.log('SS [session-status.json] every task\'s state, urgency and reason, the history, the pending notices');
{
  const { SessionStatusManager } = require(path.join(REPO, 'src/session-status.js'));
  const STR = require(path.join(REPO, 'src/agent-routes/status.js'));
  const mk = (d) => new SessionStatusManager({ dataDir: d });
  const twoStatuses = (name) => {
    const d = world(name), m = mk(d);
    m.setByAgent('claude:aaaa0001', { state: 'blocked', reason: 'waiting on the made-up review', detail: 'a made-up detail' });
    m.setByUser('claude:aaaa0002', { state: 'review', reason: 'a made-up override' });
    m.flush();
    return { d, F: path.join(d, 'session-status.json') };
  };
  const codeOf = (fn) => { try { fn(); return null; } catch (e) { return (e && e.code) || 'thrown'; } };
  // ① KEPT
  {
    const { d, F } = twoStatuses('ss1');
    ok(Object.keys((json(F) || {}).statuses || {}).length === 2, 'SS1 setup: two statuses on disk', json(F));
    const before = disk(F), pr = placeReads(F, 1);
    let m2 = null, next = null;
    try { await quietly(() => { m2 = mk(d); next = codeOf(() => m2.setByAgent('claude:aaaa0003', { state: 'working' })); m2.flush(); }); } finally { pr.restore(); }
    ok(pr.seen.n === 1, 'SS1 setup: the placed refusal met the store\'s read once', pr.seen);
    ok(disk(F) === before && next === 'status_unread', 'SS1 KEPT — a read that failed once is never written over by the next agent\'s status: it is refused by name (status_unread) and the file stays byte for byte (the stop\'s flush included)', { next });
    m2._hold.stop();
  }
  // ② HELD: the doors, the server's own bookkeeping, the board's words
  {
    const { d, F } = twoStatuses('ss2');
    const before = disk(F), pr = placeReads(F, 1);
    let m2 = null;
    try { await quietly(() => { m2 = mk(d); }); } finally { pr.restore(); }
    const codes = [codeOf(() => m2.setByUser('claude:aaaa0001', { state: 'done' })), codeOf(() => m2.clear('claude:aaaa0002', 'user'))];
    const ch = m2.clearHistory('claude:aaaa0001', [1]);
    ok(codes.every((c) => c === 'status_unread') && ch.cleared.length === 0 && ch.refused.length === 1 && ch.refused[0].code === 'status_unread', 'SS2 the person\'s override, a clear and a «Clear content…» of an entry are refused by name (status_unread), nothing cleared', { codes, ch });
    const quietOnes = [m2.pushNotice('claude:aaaa0001', { kind: 'status-override', text: 'x' }), m2.dropNotices('claude:aaaa0001', () => true), m2.consumeNotices('claude:aaaa0001').length];
    m2.rekey('webui:madeup', 'claude:aaaa0009'); m2.noteEvent('claude:aaaa0001', { event: 'vcs', at: 1 }); m2.flush();
    ok(quietOnes.every((n) => n === 0) && disk(F) === before, 'SS2 the server\'s own bookkeeping while held (a queued notice, a rekey, an event, the flush) writes NOTHING over the file and throws into no caller (a chat send that consumes notices goes on)', { quietOnes });
    const routes = {}, app = { get: (u, f) => { routes['GET ' + u] = f; }, post: (u, f) => { routes['POST ' + u] = f; } };
    const sessions = new Map([['srv-madeup', { agentToken: 'vsst_s1' }]]);
    STR.register(app, { activeSessions: sessions, sessionStatus: m2, userTodos: {}, sessionStatusKey: () => 'claude:aaaa0003', clearAsAgent: () => { }, agentSession: () => null, toolOn: () => true, toolDisabled: () => { }, bookkept: () => { }, handoverItems: () => [] });
    const g = resStub(); routes['GET /api/session-status']({ query: {}, headers: {} }, g);
    const u = resStub(); routes['POST /api/session-status']({ body: { sessionKey: 'claude:aaaa0001', state: 'done' }, headers: {} }, u);
    const a = resStub(); routes['POST /api/agent/session-status']({ body: { state: 'working' }, headers: { authorization: 'Bearer vsst_s1' } }, a);
    ok(!!g.body && g.body.code === 'status_unread' && /cannot read /.test(g.body.unread || ''), 'SS2 the board\'s read carries unread + status_unread (the board says it once, zh / ja)', g.body);
    ok(u.code === 503 && u.body.code === 'status_unread' && a.code === 503 && a.body.code === 'status_unread' && /cannot read /.test(a.body.error || ''), 'SS2 the person\'s override and an agent\'s vibespace-status answer 503 status_unread with the words (the CLI prints them)', { user: u.body, agent: a.body });
    ok(disk(F) === before, 'SS2 nothing was written over the file while held', null);
    m2._hold.stop();
  }
  // ⑥ r3104 (a) THE ROADS THAT LOOK A STATUS UP while held — the hold's words, never «no status» / «needs --reason» / «no changes»
  {
    const { d, F } = twoStatuses('ss6');
    const pr = placeReads(F, 1);
    let m2 = null;
    try { await quietly(() => { m2 = mk(d); }); } finally { pr.restore(); }
    const routes = {}, app = { get: (u, f) => { routes['GET ' + u] = f; }, post: (u, f) => { routes['POST ' + u] = f; } };
    STR.register(app, { activeSessions: new Map([['srv-madeup', { agentToken: 'vsst_s1' }]]), sessionStatus: m2, userTodos: {}, sessionStatusKey: () => 'claude:aaaa0001', clearAsAgent: () => { }, agentSession: () => null, toolOn: () => true, toolDisabled: () => { }, bookkept: () => { }, handoverItems: () => [] });
    const agent = (body) => { const r = resStub(); routes['POST /api/agent/session-status']({ body, headers: { authorization: 'Bearer vsst_s1' } }, r); return r; };
    const show = agent({ show: true }), waiting = agent({ state: 'blocked', urgency: 'high' });
    ok(show.code === 503 && show.body.code === 'status_unread' && waiting.code === 503 && waiting.body.code === 'status_unread' && !/needs BOTH/.test(waiting.body.error || ''), 'SS6 the agent\'s `vibespace-status --show` and a waiting state with no words while held: 503 with the hold\'s words — never «no status» nor «needs --reason AND --detail»', { show: show.body, waiting: waiting.body });
    const h = resStub(); routes['GET /api/session-status/history']({ query: { sessionKey: 'claude:aaaa0001' }, headers: {} }, h);
    ok(!!h.body && h.body.code === 'status_unread' && /cannot read /.test(h.body.unread || '') && Array.isArray(h.body.history), 'SS6 the Properties timeline\'s read while held carries unread + status_unread (the timeline words it, never «No status changes recorded yet»)', h.body);
    const src = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
    const AR = src('src/agent-routes.js'), SP = src('src/lib/session-props.js');
    const NUDGE = "    if (typeof sessionStatus.isHeldUnread === 'function' && sessionStatus.isHeldUnread()) return res.json({ block: false, why: 'status-unread' });";
    const nudge = (ar) => ar.includes(NUDGE) && ar.indexOf(NUDGE) > ar.indexOf("app.get('/api/agent/stop-check'") && ar.indexOf(NUDGE) < ar.indexOf('const rec = sessionStatus.get(key) || sessionStatus.get(`webui:${id}`);');
    const props = (sp) => sp.includes("d?.code === 'status_unread' ? statusListHeldWords() : t('No status changes recorded yet')");
    ok(nudge(AR) && props(SP), 'SS6 the stop-check asks the hold before it reads «never reported» (no billed nudge for a status the store refuses); the Properties timeline words a held read', null);
    ok(!nudge(anchored(AR, NUDGE + '   // r3104 (a)', '', 'ss6-nudge-today')) && !props(anchored(SP, "d?.code === 'status_unread' ? statusListHeldWords() : t('No status changes recorded yet')", "t('No status changes recorded yet')", 'ss6-props-today')), 'SS6 RED: the stop-check and the timeline with today\'s lines fail the legs', null);   // stale-pins: kept
    m2._hold.stop();
  }
  // ③ a RESTART while held
  {
    const { d, F } = twoStatuses('ss3');
    const before = disk(F), pr = placeReads(F, 2);
    let b = null;
    try { await quietly(() => { const a = mk(d); a._hold.stop(); b = mk(d); }); } finally { pr.restore(); }
    ok(pr.seen.n === 2 && b.isHeldUnread() && codeOf(() => b.setByAgent('claude:aaaa0003', { state: 'working' })) === 'status_unread' && disk(F) === before, 'SS3 a restart while held reads the same file again and is held again: refused, nothing written', { placed: pr.seen.n });
    b._hold.stop();
  }
  // ④ THE LIFT
  {
    const { d, F } = twoStatuses('ss4');
    const pr = placeReads(F, 1);
    let m2 = null, told = [];
    try { await quietly(() => { m2 = new SessionStatusManager({ dataDir: d, onChange: (st) => { told.push(Object.keys(st || {}).length); } }); }); } finally { pr.restore(); }
    const lifted = await quietly(() => m2._hold.again());
    m2.setByAgent('claude:aaaa0003', { state: 'working' }); m2.flush();
    const keys = Object.keys((json(F) || {}).statuses || {});
    ok(lifted === true && !m2.isHeldUnread() && !!m2.get('claude:aaaa0001') && told.length >= 1, 'SS4 the file reads again ⇒ the hold lifts, the statuses are back and every board is told (one broadcast)', { lifted, told });
    ok(keys.length === 3 && keys.includes('claude:aaaa0001') && keys.includes('claude:aaaa0002'), 'SS4 after the lift the next status goes through and keeps both earlier ones on disk', keys);
  }
  // ⑤ TORN BYTES, kept aside once; no remover
  {
    const { d, F } = twoStatuses('ss5');
    const torn = '{"statuses": {"claude:aaaa0001": {"state": "blo';
    fs.writeFileSync(F, torn);
    const m2 = await quietly(async () => { const m = mk(d); await m._hold.again(); return m; });
    const c1 = copiesOf(F);
    ok(c1.length === 1 && disk(path.join(d, c1[0])) === torn && !m2.isHeldUnread() && Object.keys(m2.snapshot()).length === 0, 'SS5 torn bytes: kept aside beside the store (byte for byte), then it starts empty', { copies: c1 });
    fs.writeFileSync(F, torn);
    await quietly(async () => { const m = mk(d); await m._hold.again(); });
    ok(copiesOf(F).length === 1, 'SS5 a second start on the SAME torn bytes makes no second copy (kept aside once per content)', copiesOf(F));
  }
}

report();
