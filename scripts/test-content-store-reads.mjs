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
//   AP  channels/api-proposals.json — the pending proposals, the decided history, the always-allow shapes (its derived cards:
//       api-cards.json alone was KEPT at the candidate — the For-you store folds a re-filed card; their sync is AP's remover)
//   XP  app-proposals.json — the pending app installs
//   DS  designs.json — the design list, the names given by Rename, the agents' unanswered questions
//   DX  decision-examples.json — every Needs / Not label the person taught the attention judge
//   FB  feedback.json — every feedback report and its handled mark
//   FO  feedback-outbox.json — the origin key (the maintainers' hub sends its marks back to it) and the reports waiting
// Run: node scripts/test-content-store-reads.mjs
import './scratch.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
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

/** THE FIVE LEGS of one store through its own calls (①–⑤ above). `s`: tag, mk(d) → an instance (its `_hold` = the helper's),
 *  seed(d) → { F, ids } (two rows by the store's own calls), next(inst, n) → the ordinary next write's answer, code (its refusal
 *  while held), passed(a) (the write went through), onDisk(doc) → the row ids in the file, listed(inst) → the row ids it serves,
 *  after (the rows on disk after ④'s write), torn (bytes that do not parse), held2(inst, ctx) → ②'s store-own legs (the doors, the
 *  words), remover(ctx) → ⑤'s remover leg */
async function storeLegs(s) {
  const run = async (fn) => { try { return await fn(); } catch (e) { return { thrown: (e && e.code) || 'thrown', status: e && e.status, error: e && e.message }; } };
  const codeOf = (a) => (a && (a.thrown || a.code || a.why)) || null;
  const passed = s.passed || ((a) => !!a && !codeOf(a));
  // ① KEPT + ② HELD
  {
    const d = world(s.tag + '1'), { F, ids } = await s.seed(d);
    ok(ids.length === 2 && ids.every(Boolean) && s.onDisk(json(F)).length === 2, `${s.tag}1 setup: two rows by the store's own calls, both on disk`, { ids });
    const before = disk(F), pr = placeReads(F, 1);
    let inst = null, a = null;
    try { await quietly(async () => { inst = await s.mk(d); a = await run(() => s.next(inst, 3)); }); } finally { pr.restore(); }
    ok(pr.seen.n === 1, `${s.tag}1 setup: the placed refusal met the store's read once`, pr.seen);
    ok(disk(F) === before && codeOf(a) === s.code, `${s.tag}1 KEPT — a read that failed once is never written over by its ordinary next write: refused by name (${s.code}), the file byte for byte`, a);
    if (s.held2) await s.held2(inst, { d, F, ids, run, codeOf });
    ok(disk(F) === before, `${s.tag}2 nothing was written over the file while held`, null);
    if (s.afterHeld) await s.afterHeld(inst, { d, F, ids, run, codeOf });
    inst && inst._hold && inst._hold.stop();
  }
  // ③ a RESTART while held
  {
    const d = world(s.tag + '3'), { F } = await s.seed(d);
    const before = disk(F), pr = placeReads(F, 2);
    let b = null, a = null;
    try { await quietly(async () => { const x = await s.mk(d); x._hold.stop(); b = await s.mk(d); a = await run(() => s.next(b, 3)); }); } finally { pr.restore(); }
    ok(pr.seen.n === 2 && !!b._hold.held() && codeOf(a) === s.code && disk(F) === before, `${s.tag}3 a restart while held reads the same file again and is held again: refused, nothing written`, { placed: pr.seen.n, a });
    b._hold.stop();
  }
  // ④ THE LIFT
  {
    const d = world(s.tag + '4'), { F, ids } = await s.seed(d);
    const pr = placeReads(F, 1);
    let inst = null;
    try { await quietly(async () => { inst = await s.mk(d); }); } finally { pr.restore(); }
    const lifted = await quietly(() => inst._hold.again());
    const listed = await s.listed(inst);
    const a = await quietly(() => run(() => s.next(inst, 3)));
    if (s.settle) await s.settle(inst);
    const on = s.onDisk(json(F));
    ok(lifted === true && !inst._hold.held() && ids.every((id) => listed.includes(id)), `${s.tag}4 the file reads again (the helper's read off the loop) ⇒ the hold lifts and the rows are back`, { lifted, listed });
    ok(passed(a) && ids.every((id) => on.includes(id)) && on.length === (s.after || 3), `${s.tag}4 after the lift the next write goes through and keeps both earlier rows on disk`, { a, on });
    inst._hold.stop();
  }
  // ⑤ TORN BYTES, kept aside once; the remover question
  {
    const d = world(s.tag + '5'), seeded = await s.seed(d), F = seeded.F;
    fs.writeFileSync(F, s.torn);
    const settled = async (x) => { await x._hold.again(); for (let i = 0; i < 200 && x._hold.held(); i++) await new Promise((r) => setTimeout(r, 10)); return x; };   // the start's own read again may be the one in flight
    const inst = await quietly(async () => settled(s.mk(d)));
    const c1 = copiesOf(F);
    ok(c1.length === 1 && disk(path.join(path.dirname(F), c1[0])) === s.torn && !inst._hold.held() && (await s.listed(inst)).length === 0, `${s.tag}5 torn bytes: kept aside beside the store (byte for byte), then it starts empty`, { copies: c1 });
    fs.writeFileSync(F, s.torn);
    await quietly(async () => { const x = await settled(s.mk(d)); x._hold.stop(); });
    ok(copiesOf(F).length === 1, `${s.tag}5 a second start on the SAME torn bytes makes no second copy (kept aside once per content)`, copiesOf(F));
    if (s.remover) await s.remover({ d, F, inst, seeded });
    inst._hold.stop();
  }
}

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
    const flags = p2.setFlags(ids[0], { makePublic: false }), gone = p2.remove(ids[1]), content = await p2.publishContent({ html: '<p>x</p>', name: 'x', srcKey: 'userfile:conv-madeup:/x.html' });
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
      // r3170 (4): the design's Publish dialog DRAWN — its words module executed on a held reply and on a held refusal (never only pinned)
      const DPW = await import(pathToFileURL(path.join(REPO, 'src/lib/design-publish-words.js')).href);
      const { heldWordsOf, pagesHeldWords, pagesListHeldWords } = await import(pathToFileURL(path.join(REPO, 'src/lib/utils.js')).href);
      const tt = (x, prm) => String(x).replace(/\{(\w+)\}/g, (all, k) => (prm && k in prm ? String(prm[k]) : all));
      const drow = { dir: '/scratch-made-up/design-pp6', page: null };
      const heldState = DPW.publishStateWords({ designs: [drow], pagesUnread: 'pages_unread' }, drow, tt), todayState = DPW.publishStateWords({ designs: [drow] }, drow, tt);
      ok(heldState.known === false && /not known whether this design was published/.test(heldState.text) && /cannot be shown right now/.test(heldState.text) && /a publish pressed now is not taken — press it again/.test(heldState.text) && /^Not published yet/.test(todayState.text), 'PP6 the design\'s Publish dialog DRAWN on a held reply: «not known whether this design was published», the link answers «cannot be shown right now», a press now is not taken — RED: the reply as it was (no mark) draws «Not published yet»', { held: heldState.text, today: todayState.text });
      const failW = DPW.publishFailWords({ ok: false, code: 'pages_unread', error: 'the hub sentence in English' }, tt, heldWordsOf);
      ok(!/hub sentence in English/.test(failW) && /cannot read its list of published pages/.test(failW) && /Press again/.test(failW), 'PP6 the dialog\'s refusal toast DRAWN on a held refusal: the page\'s words by the code (heldWordsOf), never the hub\'s English', failW);
      const DW = fs.readFileSync(path.join(REPO, 'src/lib/design-window.js'), 'utf8');
      ok(DW.includes('const w = publishStateWords(r, row, t);') && DW.includes('showToast(publishFailWords(r, t, heldWordsOf)'), 'PP6 the dialog draws from that module (its state line and its toast)', null);
      // r3170 (1)-(3): the person's own take-down doors and the lists say what the agent's words say
      const S1 = pagesHeldWords(), S3 = pagesListHeldWords();
      ok(/nothing was changed/.test(S1) && /a public page is served again as soon as the list reads/.test(S1) && /Press again/.test(S1) && /cannot be shown right now/.test(S3) && !/publishing waits/.test(S1 + S3 + heldState.text), 'PP6 the person\'s own take-down / visibility / publish refusals say nothing changed, a public page is served again when the list reads, press again; the lists say a link answers «cannot be shown right now» (never «publishing waits»)', { S1, S3 });   // stale-pins: kept
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
    const atLift = told.length;   // r3193: the lift's OWN broadcast, before any write tells the boards itself
    m2.setByAgent('claude:aaaa0003', { state: 'working' }); m2.flush();
    const keys = Object.keys((json(F) || {}).statuses || {});
    ok(lifted === true && !m2.isHeldUnread() && !!m2.get('claude:aaaa0001') && atLift === 1, 'SS4 the file reads again ⇒ the hold lifts, the statuses are back and every board is told (one broadcast)', { lifted, told });
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

// ══ AP channels/api-proposals.json (+ its derived cards, api-cards.json) ══
console.log('AP [channels/api-proposals.json] the pending API proposals, the decided history, the always-allow shapes');
{
  const F_API = require(path.join(REPO, 'src/channel-api.js')); void F_API;
  const ACL = require(path.join(REPO, 'src/channel-acl.js'));
  const ORCH = require(path.join(REPO, 'src/server/channel-api.js'));
  const LARK = require(path.join(REPO, 'src/channels/lark.js'));
  const CARDS = require(path.join(REPO, 'src/server/channel-api-cards.js'));
  const { UserTodoManager } = require(path.join(REPO, 'src/user-todos.js'));
  const quiet = { log() { }, info() { }, warn() { }, error() { } };
  const noFetch = async () => { throw new Error('no network in this suite'); };
  // the channels engine's stand-in (as test-channel-api's own): one Lark credential, the tier rows in memory — one per world
  const engines = new Map(), todosOf = new Map();
  const engineOf = (d) => { if (!engines.has(d)) { const e = { rows: [] }; e.apiAccounts = () => [{ id: 'lark-1', kind: 'lark', label: 'Lark (made-up)' }]; e.apiGrants = () => e.rows; e.apiTierFor = (ctx, cred) => ACL.effectiveApi(ctx, cred, e.rows); e.setApiGrants = async (cred, rows) => { e.rows = [...e.rows.filter((g) => g.scope.id !== cred), ...rows]; return { ok: true, rows }; }; e.apiCredential = (id) => (id === 'lark-1' ? { id, kind: 'lark', api: LARK.API_ROW, label: 'Lark (made-up)', source: 'channels', bearer: async () => 'u-MADE-UP', gate: () => null, charge: () => { }, rateLimited: () => { } } : null); engines.set(d, e); } return engines.get(d); };
  const todos = (d) => { if (!todosOf.has(d)) todosOf.set(d, new UserTodoManager({ dataDir: path.join(d, 'todos'), onChange: () => { }, expirySweepMs: 0 })); return todosOf.get(d); };
  const openCards = (d) => todos(d).openItems().filter((i) => i.sessionKey === 'channels').length;
  const AGENT = { kind: 'agent', id: 'conv-A', name: 'Agent A', groups: [] };
  const propose = (api, n) => api.call(AGENT, { cred: 'lark-1', method: 'POST', path: `/open-apis/docx/v1/documents/doxMADEUP${n}/blocks`, body: `{"title":"made-up ${n}"}` });
  const mk = (d) => ORCH.create({ dataDir: d, engine: engineOf(d), fetchFn: noFetch, broadcast: () => { }, log: quiet });
  await storeLegs({
    tag: 'AP', mk, code: 'api_unread', torn: '{"proposals": {"api-madeup": {"id": "api-mad',
    seed: async (d) => {
      fs.mkdirSync(path.join(d, 'todos'), { recursive: true });
      const a = mk(d);
      await a.setTiers('lark-1', [{ principal: { kind: 'agent', id: 'conv-A' }, tier: 'write-ask' }]);
      const ids = [(await propose(a, 1)).proposal?.id, (await propose(a, 2)).proposal?.id];
      const c = CARDS.create({ dataDir: d, api: a, userTodos: todos(d), now: () => Date.now(), timer: false, log: quiet });
      await c.sync(); c.stop(); a.close();
      return { F: path.join(d, 'channels', 'api-proposals.json'), ids };
    },
    next: (a, n) => propose(a, n),
    passed: (r) => !!r && r.code === 'api_pending',
    onDisk: (doc) => Object.keys((doc && doc.proposals) || {}),
    listed: (a) => (a.ownerView().proposals || []).map((p) => p.id),
    held2: async (a, { d, ids, codeOf }) => {
      const r = [await a.approve(ids[0], { digest: 'x' }), a.reject(ids[1]), a.resubmit(ids[0], { digest: 'x' }), a.revokeShape('shape-madeup'), a.proposalFor(AGENT, ids[0])];
      ok(r.every((x) => codeOf(x) === 'api_unread'), 'AP2 an Approve, a Reject, a Resubmit, a shape\'s revoke and the agent\'s `api wait` are refused by name (api_unread) — never «no such API proposal»', r.map(codeOf));
      const v = a.ownerView();
      ok(v.code === 'api_unread' && /cannot read /.test(v.held || ''), 'AP2 the owner\'s view says it (the API access dialog and the Outbox read it)', { code: v.code });
      const CF = path.join(d, 'channels', 'api-cards.json'), cardsBefore = disk(CF), n0 = openCards(d);
      const c = CARDS.create({ dataDir: d, api: a, userTodos: todos(d), now: () => Date.now(), timer: false, log: quiet });
      await c.sync(); c.stop();
      ok(cardsBefore !== null && disk(CF) === cardsBefore && openCards(d) === n0 && n0 === 2, 'AP2 THE REMOVER (the cards\' sync drops its rows of proposals the view no longer names): while held it removes ZERO — its file byte for byte, both For-you items open', { n0, after: openCards(d) });
    },
    remover: async ({ d, inst }) => {
      const n0 = openCards(d);
      const c = CARDS.create({ dataDir: d, api: inst, userTodos: todos(d), now: () => Date.now(), timer: false, log: quiet });
      await c.sync(); c.stop();
      ok(n0 === 2 && openCards(d) === 2, 'AP5 after torn bytes (kept aside, the list empty) the cards\' sync drops only its DERIVED link rows: the person\'s For-you items stay, none closed', { n0, after: openCards(d) });
    },
  });
}

// ══ XP app-proposals.json ══
console.log('XP [app-proposals.json] the pending app installs');
{
  const AE = require(path.join(REPO, 'src/server/apps-engine.js'));
  const quiet = { log() { }, info() { }, warn() { }, error() { } };
  const mk = (d) => AE.create({ access: {}, dataDir: d, log: quiet });
  await storeLegs({
    tag: 'XP', mk, code: 'apps_unread', after: 2, torn: '{"proposals": [{"id": "ap-madeup1", "host": "lo',
    seed: async (d) => {
      const F = path.join(d, AE.STORE_FILE), t = Date.now();
      fs.writeFileSync(F, JSON.stringify({ proposals: [1, 2].map((n) => ({ id: `ap-madeup${n}`, host: 'local', state: 'proposed', createdAt: t, request: { kind: 'apt', name: `made-up-${n}` }, by: { kind: 'agent', conversation: 'conv-A' } })), helpers: [] }, null, 2));
      return { F, ids: ['ap-madeup1', 'ap-madeup2'] };
    },
    next: (e, n) => e.addHelper({ host: 'local', sessionId: `helper-madeup-${n}`, request: 'install a made-up app' }),
    passed: (r) => !!r && r.sessionId === 'helper-madeup-3',
    onDisk: (doc) => ((doc && doc.proposals) || []).map((p) => p.id),
    listed: (e) => e.proposalsOf('conv-A').map((p) => p.id),
    held2: async (e, { ids, run, codeOf }) => {
      const r = [await run(() => e.propose({ host: 'local', request: { kind: 'apt', name: 'x' }, by: { kind: 'agent', conversation: 'conv-A' } })), await run(() => e.approve(ids[0])), await run(() => e.reject(ids[1])), await run(() => e.wait(ids[0], { ms: 10 })), await run(() => e.run({ host: 'local', proposalId: ids[0] }))];
      ok(r.every((x) => codeOf(x) === 'apps_unread' && x.status === 503), 'XP2 a proposal, an Approve, a Decline, a wait and the Install of a proposal are refused by name (503 apps_unread) — never «no proposal»', r.map(codeOf));
      const ROUTES = fs.readFileSync(path.join(REPO, 'src/routes/apps.js'), 'utf8');
      ok(/const STATUS = \{ apps_unread: 503,/.test(ROUTES), 'XP2 the Apps routes answer it 503 by its code (the window\'s toast says the words)', null);
    },
  });
}

// ══ XP7 r3193 THE MUST: no removal by a held list — the start's replay (its staged-file sweep) waits and runs at the lift ══
console.log('XP7 [app-proposals.json] the start\'s replay while held: nothing unstaged; at the lift it runs on the list as read');
{
  const AE = require(path.join(REPO, 'src/server/apps-engine.js'));
  const d = world('xp7'), F = path.join(d, AE.STORE_FILE), t0 = Date.now(), STAGED = '0123456789abcdef.deb';
  fs.writeFileSync(F, JSON.stringify({ proposals: [{ id: 'ap-staged1', host: 'local', state: 'proposed', createdAt: t0, request: { kind: 'deb', staged: STAGED, sha256: 'a'.repeat(64), name: 'made-up' }, by: { kind: 'agent', conversation: 'conv-A' } }], helpers: [] }, null, 2));
  const calls = [];
  const access = { call: async (host, verb, args) => { calls.push({ verb, args }); if (verb === 'app-status') return { status: { entries: [], replay: { decision: { run: false, why: 'made-up: nothing to put back' } } } }; return {}; } };
  const before = disk(F), pr = placeReads(F, 1);
  let e = null;
  try { await quietly(() => { e = AE.create({ access, dataDir: d, log: { log() { }, warn() { } } }); }); } finally { pr.restore(); }
  const r = await quietly(() => e.afterListen());
  const unstagedWhileHeld = calls.filter((c) => c.verb === 'app-unstage');
  ok(pr.seen.n === 1 && r && r.why === 'apps_unread' && unstagedWhileHeld.length === 0 && disk(F) === before, 'XP7 the start\'s replay while held asks the machine NOTHING (no app-unstage with an empty keep list — the staged installer of a pending proposal stays) and writes nothing', { r, calls: calls.map((c) => c.verb) });
  const st = await quietly(() => e.status('local'));
  ok(st.code === 'apps_unread' && /cannot read its app proposals/.test(st.proposalsUnread || '') && st.proposals.length === 0, 'XP7 the Apps status read while held carries proposalsUnread + apps_unread (no «none pending»)', { code: st.code });
  await quietly(() => e._hold.again());
  for (let i = 0; i < 100 && !calls.some((c) => c.verb === 'app-unstage'); i++) await new Promise((res) => setTimeout(res, 10));
  const un = calls.find((c) => c.verb === 'app-unstage');
  ok(!!un && Array.isArray(un.args.keep) && un.args.keep.includes(STAGED), 'XP7 at the lift the owed replay runs on the list as read: its sweep KEEPS the pending proposal\'s staged installer', un && un.args);
  e._hold.stop();
}
// ══ XP8 r3193 the smaller roads of the first half, by their source lines (each with a red copy) ══
{
  const src = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
  const RA = src('src/routes/apps.js'), HLs = src('src/server/hooks-late.js'), MPW = src('src/server/mounts-plugins-wiring.js'), DLG = src('src/lib/channel-api-dialog.js');
  const L1 = "  if (typeof engine.isHeldUnread === 'function' && engine.isHeldUnread()) return fail(res, { code: 'apps_unread', message: engine.heldWords() });   // r3193: held — nothing dropped, said (never ok)\n";
  const del = (r) => r.includes(L1) && r.indexOf(L1) > r.indexOf("router.delete('/api/apps/helpers/:sessionId'");
  ok(del(RA) && !del(anchored(RA, L1, '', 'xp8-del-today')), 'XP8 a helper\'s end while held answers the hold (503 apps_unread), never { ok: true } over nothing dropped (RED: the route as it was)', null);
  // r3232 (5): the late-hooks note DRIVEN — the real announce over a statuses stand-in whose pushNotice queues nothing (held); its red the module as it was
  const Mod = require('node:module');
  const asModule = (rel, code) => { const abs = path.join(REPO, rel); const m = new Mod(abs, null); m.filename = abs; m.paths = Mod._nodeModulePaths(path.dirname(abs)); m._compile(code, abs); return m.exports; };
  const lateRun = (mod) => {
    const filed = [];
    const hl = mod.create({ activeSessions: new Map([['w-late1', { backend: 'claude', name: 'Made-up late' }]]), getSessionStatus: () => ({ pushNotice: () => 0 }), getUserTodos: () => ({ add: (...a) => { filed.push(a); } }), sessionStatusKey: (x, id) => 'claude:' + id, harnesses: { get: () => ({ label: 'Made-up CLI', inject: { hookFile: '.made-up/hooks.json', kind: 'settings' } }) }, log: () => { }, warn: () => { } });
    hl.ready();
    const out = hl.noteCreated({ harness: 'claude', file: '/scratch-made-up/.made-up/hooks.json', rel: '.made-up/hooks.json', at: Date.now() });
    return { r: Array.isArray(out) ? out[0] : null, filed: filed.length };
  };
  const L2 = 'if (k) { told.add(id); n++; } else warn(';
  const lateNow = lateRun(require(path.join(REPO, 'src/server/hooks-late.js')));
  const lateOld = HLs.includes(L2) ? lateRun(asModule('src/server/hooks-late.js', anchored(HLs, L2, '{ told.add(id); n++; } if (!k) warn(', 'xp8-late-today'))) : null;
  ok(!!lateNow.r && lateNow.r.told === 0 && lateNow.filed === 0 && !!lateOld && lateOld.r.told === 1 && lateOld.filed === 1, 'XP8 the late-hooks note while the statuses are held (pushNotice queues nothing): no session counted as told, no For-you line says it was — RED: the module as it was counts it told and files the line', { now: lateNow, old: lateOld });
  const L3 = "  if (st && typeof st.isHeldUnread === 'function' && st.isHeldUnread()) return null;";
  const board = (x) => x.includes(L3) && x.indexOf(L3) > x.indexOf('const inboxBoard = () => {') && x.indexOf(L3) < x.indexOf('const progressAt = new Map();');
  ok(board(MPW) && !board(anchored(MPW, L3, '', 'xp8-board-today')), 'XP8 the For-you judge\'s board while the statuses are held: no board (unknown), never null status and [] history as facts (RED: the wiring as it was; the board lives in the wiring, which no suite runs)', null);
  const L4 = "const apiHeld = !!view && view.code === 'api_unread';";
  const dlg = (x) => x.includes(L4) && (x.match(/apiHeld \? t\('VibeSpace cannot read its API proposals right now, so none is shown here\./g) || []).length === 2;
  ok(dlg(DLG) && !dlg(anchored(DLG, L4, "const apiHeld = false;", 'xp8-dialog-today')), 'XP8 the owner\'s API access dialog while held says why both lists are empty (the always-allowed shapes, the cards waiting), never «none» (RED: the dialog as it was, the mark unread)', null);
  const CV2 = src('src/lib/channel-api-card-view.js'), OB = src('src/lib/channel-outbox.js'), AID = src('src/lib/app-install-dialog.js');
  const outbox = (cv, ob) => cv.includes("if (r && r.code === 'api_unread') apiUnread = true; else if (r && Array.isArray(r.cards)) apiUnread = false;") && ob.includes("const apiUnread = apiCardsUnread();") && (ob.match(/t\('VibeSpace cannot read its API proposals right now, so a call waiting for your approval may not be shown here\./g) || []).length === 2;
  ok(outbox(CV2, OB) && !outbox(anchored(CV2, "if (r && r.code === 'api_unread') apiUnread = true; else if (r && Array.isArray(r.cards)) apiUnread = false;", 'apiUnread = false;', 'xp8-outbox-today'), OB), 'XP8 the Outbox while the API proposals are held: its card view keeps the mark, its empty section and its summary say why — never «Nothing is waiting for your approval» / «No proposals yet» (RED: the card view as it was, the mark dropped)', null);
  const apps = (x) => x.includes("if (st.proposalsUnread) props.appendChild(el('div', 'app-sec-row empty-hint app-sec-proposals-held',");
  ok(apps(AID) && !apps(anchored(AID, "if (st.proposalsUnread) props", 'if (false) props', 'xp8-apps-today')), 'XP8 the Apps window while app-proposals is held draws the held line above the agents\' proposals (RED: the window as it was)', null);
}

// ══ XP6 r3104 (a) the Apps routes that look a proposal up while held ══
{
  const R = fs.readFileSync(path.join(REPO, 'src/routes/apps.js'), 'utf8');
  const L1 = "  if (b.proposalId && typeof engine.isHeldUnread === 'function' && engine.isHeldUnread()) return fail(res, { code: 'apps_unread', message: engine.heldWords() });";
  const L2 = "  if (typeof g.engine.isHeldUnread === 'function' && g.engine.isHeldUnread()) return fail(res, { code: 'apps_unread', message: g.engine.heldWords() });";
  const L3 = "...(typeof g.engine.isHeldUnread === 'function' && g.engine.isHeldUnread() ? { proposalsUnread: g.engine.heldWords() } : {})";
  const roads = (r) => r.includes(L1) && r.indexOf(L1) < r.indexOf("if (b.proposalId && !engine.get(String(b.proposalId))) return fail(res, { code: 'not-found'") && r.includes(L2) && r.indexOf(L2) < r.indexOf("if (!p) return fail(res, { code: 'not-found', message: `no proposal ${id}` });") && r.includes(L3);
  ok(roads(R), 'XP6 by their source lines: the Install of a proposal and the agent\'s proposal wait ask the hold BEFORE «no proposal» (503 apps_unread, the routes\' table); the agent\'s apps list carries proposalsUnread', null);
  ok(!roads(anchored(R, L2 + '   // r3104 (a): held — the agent\'s wait hears why, never «no proposal»\n', '', 'xp6-wait-today')), 'XP6 RED: the agent\'s wait with today\'s line (no hold asked) fails the leg', null);
}

// ══ DS designs.json ══
console.log('DS [designs.json] the design list, the names given by Rename, the agents\' unanswered questions');
{
  const DE = require(path.join(REPO, 'src/server/design-engine.js'));
  const timers = { setInterval: () => ({ unref() { } }), clearInterval: () => { }, setTimeout: () => ({ unref() { } }) };
  const mk = (d) => DE.create({ dataDir: d, timers, log: () => { } });
  const dir = (n) => `/scratch-made-up/design-${n}`;
  await storeLegs({
    tag: 'DS', mk, code: 'designs_unread', torn: '{"designs": [{"id": "d-madeup", "dir": "/scr',
    seed: async (d) => {
      const e = mk(d);
      e.register({ dir: dir(1), title: 'One' }); e.register({ dir: dir(2), title: 'Two' });
      e.rename({ dir: dir(2), title: 'The name the person gave' });
      await e.flush();
      return { F: path.join(d, 'designs.json'), ids: [dir(1), dir(2)] };
    },
    next: (e, n) => e.register({ dir: dir(n), title: `Design ${n}` }),
    passed: (r) => !!r && r.ok === true,
    settle: (e) => e.flush(),
    onDisk: (doc) => ((doc && doc.designs) || []).map((r) => r.dir),
    listed: (e) => e.list({}).map((r) => r.dir),
    held2: async (e, { codeOf }) => {
      const r = [e.rename({ dir: dir(1), title: 'x' }), e.unlist({ dir: dir(1) }), e.ask({ dir: dir(1), questions: [{ q: 'made-up?' }] })];
      ok(r.every((x) => codeOf(x) === 'designs_unread' && x.status === 503) && /cannot read /.test(e.heldWords() || ''), 'DS2 a Rename, a Remove from the list and an agent\'s ask are refused by name (503 designs_unread); the Designs home\'s list carries the words', r.map(codeOf));
    },
    afterHeld: async (e) => {
      await quietly(() => e._hold.again());
      const two = e.list({}).find((r) => r.dir === dir(2));
      ok(!!two && two.title === 'The name the person gave', 'DS4 the lift brings back the name the person gave by Rename', two);
    },
  });
}

// ══ DX decision-examples.json ══
console.log('DX [decision-examples.json] every Needs / Not label the person taught the attention judge');
{
  const AT = require(path.join(REPO, 'src/server/channels-attention.js'));
  const quiet = { log() { }, info() { }, warn() { }, error() { } };
  const mk = (d) => AT.create({ dataDir: d, log: quiet });
  const view = (n) => ({ title: `made-up chat ${n}`, lastText: `a made-up line ${n}`, lastAt: 1000 * n });
  const key = (n) => `lark-1:oc_madeup${n}`;
  await storeLegs({
    tag: 'DX', mk, code: 'labels_unread', torn: '{"v": 1, "examples": [{"key": "lark-1:oc_ma',
    seed: async (d) => { const a = mk(d); a.label(key(1), 1000, 'needs', view(1)); a.label(key(2), 2000, 'not', view(2)); return { F: path.join(d, 'decision-examples.json'), ids: [key(1), key(2)] }; },
    next: (a, n) => a.label(key(n), 1000 * n, 'needs', view(n)),
    passed: (r) => !!r && r.ok === true,
    onDisk: (doc) => ((doc && doc.examples) || []).map((x) => x.key),
    listed: (a) => a.examples().map((x) => x.key),
    held2: async (a, { codeOf }) => {
      const l = a.learn(Date.now() + 7200e3), dr = await a.learnDraft();
      ok(l === 0 && codeOf(dr) === 'labels_unread', 'DX2 the hourly implicit pass adds nothing and the rule draft waits (labels_unread) — the judge runs with no examples, as on a first day', { learn: l, draft: dr });
    },
  });
}

// ══ DS6 r3104 (a) the design roads that look a design up while held ══
{
  const DE = require(path.join(REPO, 'src/server/design-engine.js'));
  const timers = { setInterval: () => ({ unref() { } }), clearInterval: () => { }, setTimeout: () => ({ unref() { } }) };
  const d = world('ds6');
  const e1 = DE.create({ dataDir: d, timers, log: () => { } }); e1.register({ dir: '/scratch-made-up/design-6', title: 'Six' }); await e1.flush();
  const F = path.join(d, 'designs.json'), pr = placeReads(F, 1);
  let e2 = null;
  try { await quietly(() => { e2 = DE.create({ dataDir: d, timers, log: () => { } }); }); } finally { pr.restore(); }
  const dir = '/scratch-made-up/design-6';
  const r = [await e2.readDesign(null, dir), e2.pendingAsk(null, dir), await e2.tweaks(null, dir), await e2.setTweaks({ dir, values: {} }), e2.answer({ dir, askId: 'a-madeup', skip: true })];
  ok(r.every((x) => x && x.code === 'designs_unread' && x.status === 503), 'DS6 a design\'s read, its pending ask, its tweaks (read and set) and an answer while held: 503 designs_unread with the words — never «not a registered design»', r.map((x) => x && x.code));
  const SRC = fs.readFileSync(path.join(REPO, 'src/server/design-engine.js'), 'utf8');
  ok(!/fail\('not_registered', /.test(SRC.replace("const unregistered = (msg) => (hold.held() ? heldFail() : fail('not_registered', msg));", '')), 'DS6 every «not registered» answer of the engine goes through the held-first helper (no bare fail(\'not_registered\') left)', null);
  e2._hold.stop();
}

// ══ FB feedback.json ══
console.log('FB [feedback.json] every feedback report and its handled mark');
{
  const FS = require(path.join(REPO, 'src/server/feedback-store.js'));
  const mk = (d) => FS.create({ dataDir: d });
  const rep = (s, n) => s.report({ text: `a made-up report ${n}`, about: 'vibespace-task' }, { session: { id: `sess-madeup-${n}`, name: `Made-up ${n}` } });
  await storeLegs({
    tag: 'FB', mk, code: 'feedback_unread', torn: '{"v": 1, "records": [{"id": "fb-madeup", "te',
    seed: async (d) => { const s = mk(d); const ids = [rep(s, 1), rep(s, 2)].map((r) => r && r.report && r.report.id); return { F: path.join(d, 'feedback.json'), ids }; },
    next: (s, n) => rep(s, n),
    passed: (r) => !!r && r.ok === true,
    onDisk: (doc) => ((doc && doc.records) || []).map((r) => r.id),
    listed: (s) => s.list().reports.map((r) => r.id),
    held2: async (s, { ids, codeOf }) => {
      const r = [s.setStatus(ids[0], 'handled'), s.receive({}, { key: 'k'.repeat(16) }), s.applyMarks([{ id: ids[0] }])];
      const l = s.list();
      ok(r.every((x) => codeOf(x) === 'feedback_unread') && l.code === 'feedback_unread' && /cannot read /.test(l.unread || ''), 'FB2 a handled mark, a forwarded report and the hub\'s marks are refused by name (feedback_unread); the owner\'s list says it', r.map(codeOf));
    },
  });
}

// ══ FO feedback-outbox.json ══
console.log('FO [feedback-outbox.json] the origin key (the hub\'s marks come back to it) and the reports waiting');
{
  const FFW = require(path.join(REPO, 'src/server/feedback-forward.js'));
  const noFetch = async () => { throw new Error('no network in this suite'); };
  const mk = (d) => FFW.create({ dataDir: d, target: () => ({ url: 'https://hub.example.test', token: 'made-up-token' }), instance: () => ({ name: 'made-up', version: '0' }), backlog: () => [], fetch: noFetch, setTimeout: () => ({ unref() { } }), clearTimeout: () => { }, log: () => { } });
  const row = (n) => ({ id: `fb-madeup${n}`, text: `a made-up report ${n}`, about: 'vibespace-task', kind: 'other', at: Date.now(), session: { id: `sess-${n}`, name: `Made-up ${n}` } });
  const keys = new Map();
  await storeLegs({
    tag: 'FO', mk, code: 'outbox_unread', torn: '{"v": 1, "key": "fk_madeup", "queue": [{"id": "fb-',
    seed: async (d) => { const o = mk(d); o.enqueue(row(1)); o.enqueue(row(2)); keys.set(d, o.keyId()); return { F: path.join(d, 'feedback-outbox.json'), ids: ['fb-madeup1', 'fb-madeup2'] }; },
    next: (o, n) => o.enqueue(row(n)),
    passed: (r) => !!r && r.queued === true,
    onDisk: (doc) => ((doc && doc.queue) || []).map((x) => x.id),
    listed: (o) => [1, 2, 3, 9].map((n) => `fb-madeup${n}`).filter((id) => o.forwardOf(id) === 'waiting'),
    held2: async (o, { d }) => {
      const p = await o.pump(), m = await o.pullMarks();
      ok(o.keyId() === null && !!(p && p.held) && !!(m && m.held), 'FO2 held: no origin key is minted over the unread one, nothing is sent, no mark is pulled', { keyId: o.keyId(), p, m });
      void d;
    },
    afterHeld: async (o, { d, F }) => {
      o.enqueue(row(9));
      await quietly(() => o._hold.again());
      const doc = json(F) || {};
      ok(o.keyId() === keys.get(d) && ((doc.queue || []).map((x) => x.id)).includes('fb-madeup9') && ((doc.queue || []).map((x) => x.id)).includes('fb-madeup1'), 'FO4 the lift keeps the SAME origin key, and a report filed while held is queued then (the earlier ones stay)', { keyKept: o.keyId() === keys.get(d), queue: (doc.queue || []).map((x) => x.id) });
    },
  });
}

// ══ FB6 r3104 (a) the agent's `vibespace-feedback list` while held ══
{
  const R = fs.readFileSync(path.join(REPO, 'src/routes/feedback.js'), 'utf8');
  const L = "    if (typeof store.isHeldUnread === 'function' && store.isHeldUnread()) { const w = store.list().unread; return res.status(503).json({ error: w, code: 'feedback_unread', unread: w, reports: [] }); }";
  const road = (r) => r.includes(L) && r.indexOf(L) > r.indexOf("app.get('/api/agent/feedback/mine'") && r.indexOf(L) < r.indexOf('res.json({ reports: store.mine(c.ids)');
  ok(road(R), 'FB6 by its source line: the agent\'s list asks the hold first — 503 with the words (the CLI prints a refusal\'s words), never «no reports filed»', null);
  ok(!road(anchored(R, L + '   // r3104 (a): held — never «no reports filed»\n', '', 'fb6-mine-today')), 'FB6 RED: the list with today\'s line fails the leg', null);
}

// ══ r3139 (a) for the family: every held code of the chain answers 503 ON THE WIRE (the routes' own status tables) ══
{
  const src = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
  const tables = [
    ['src/agent-routes.js', /const API_STATUS = Object\.freeze\(\{ api_unread: 503,/, 'the agent\'s API answers (api_unread)'],
    ['src/routes/channels.js', /r\.code === 'api_unread' \? 503 :/, 'the owner\'s proposal routes (api_unread)'],
    ['src/routes/apps.js', /const STATUS = \{ apps_unread: 503,/, 'the Apps routes (apps_unread)'],
    ['src/server/design-engine.js', /pages_unread: 503, designs_unread: 503,/, 'the design routes (pages_unread, designs_unread)'],
    ['src/routes/feedback.js', /const STATUS = \{ feedback_unread: 503,/, 'the feedback routes (feedback_unread)'],
    ['src/routes/channels.js', /r\.code === 'labels_unread' \? 503 :/, 'the label route (labels_unread)'],
  ];
  const miss = tables.filter(([f, re]) => !re.test(src(f))).map(([, , w]) => w);
  ok(!miss.length, `every held code answers 503 on the wire, by its routes' table: ${tables.map(([, , w]) => w).join('; ')}`, miss);
  const owner = (src('src/routes/channels.js').match(/r\.code === 'api_unread' \? 503 :/g) || []).length;
  ok(owner >= 4, `the owner's proposal routes (approve, resubmit, reject, revoke — and setTiers' shared answer) map api_unread to 503 (${owner})`, owner);
  const words = ['src/session-status.js', 'src/server/channel-api.js', 'src/server/apps-engine.js', 'src/server/design-engine.js', 'src/server/channels-attention.js', 'src/server/feedback-store.js', 'src/server/feedback-forward.js', 'src/server/published-pages.js'].filter((f) => /in VibeSpace's data folder could not be read/.test(src(f)));
  ok(!words.length, 'no held words of the chain name a file under the data folder (agents pass them on): «VibeSpace cannot read …», by the plain name', words);
}

// ══ r3193 cure 2 (the second half): every reader of a held list answers the hold — never «none», never a cursor past a refusal ══
console.log('FB7–FB9 / DS7 / DX7 [the second half] the readers of a held list');
{
  const FFW = require(path.join(REPO, 'src/server/feedback-forward.js'));
  const target = () => ({ url: 'https://hub.example.test', token: 'made-up-token' });
  const stubT = { setTimeout: () => ({ unref() { } }), clearTimeout: () => { } };
  const page = { marks: [{ id: 'fb-madeup1', status: 'handled', version: '0' }], next: 5, more: false };
  const fetchMarks = async () => ({ status: 200, headers: { get: () => null }, json: async () => page });
  // FB7 (MUST 1): the marks the HELD feedback store refused never move the cursor; the pull asks again
  {
    const d = world('fb7'), F = path.join(d, 'feedback-outbox.json');
    const o = FFW.create({ dataDir: d, target, instance: () => ({ name: 'made-up', version: '0' }), applyMarks: () => ({ ok: false, applied: 0, code: 'feedback_unread' }), backlog: () => null, fetch: fetchMarks, ...stubT, log: () => { } });
    const r = await quietly(() => o.pullMarks());
    ok(!!r && r.why === 'feedback_unread' && o.facts().marksSince === 0 && (json(F) || { marksSince: 0 }).marksSince === 0, 'FB7 a mark page the HELD feedback store refused leaves the cursor BEFORE it (marksSince 0) — never past marks it never applied (the report stays open, the filer told at the read)', { r, since: o.facts().marksSince });
    const o2 = FFW.create({ dataDir: world('fb7b'), target, instance: () => ({ name: 'made-up', version: '0' }), applyMarks: () => ({ ok: true, applied: 1 }), backlog: () => [], fetch: fetchMarks, ...stubT, log: () => { } });
    await quietly(() => o2.pullMarks());
    ok(o2.facts().marksSince === 5, 'FB7 CONTROL: the same page APPLIED moves the cursor to its next (5)', o2.facts().marksSince);
  }
  // FB8: the start-up backfill waits while the feedback list is held (never marked done over «no open reports»)
  {
    const d = world('fb8'), F = path.join(d, 'feedback-outbox.json');
    let heldList = true;
    const rep = { id: 'fb-madeup8', text: 'a made-up report', about: 'vibespace-task', kind: 'other', at: Date.now(), session: { id: 's8', name: 'Made-up 8' } };
    const o = FFW.create({ dataDir: d, target, instance: () => ({ name: 'made-up', version: '0' }), backlog: () => (heldList ? null : [rep]), fetch: async () => { throw new Error('no network'); }, ...stubT, log: () => { } });
    await quietly(() => o.enqueue({ ...rep, id: 'fb-madeup8b' }));
    const a1 = json(F) || {};
    heldList = false;
    await quietly(() => o.enqueue({ ...rep, id: 'fb-madeup8c' }));
    const a2 = json(F) || {};
    ok(a1.backfilled !== true && a2.backfilled === true && (a2.queue || []).some((x) => x.id === 'fb-madeup8'), 'FB8 the backfill waits while the feedback list is held (not marked done), and at the next report after it reads the open report is backfilled', { first: a1.backfilled, then: a2.backfilled, queue: (a2.queue || []).map((x) => x.id) });
  }
  // FB9: a report filed while the outbox was held, then a RESTART before the lift: derived again at the lift from the reports themselves
  {
    const d = world('fb9'), F = path.join(d, 'feedback-outbox.json');
    fs.writeFileSync(F, JSON.stringify({ v: 1, key: 'fk_' + 'A'.repeat(43), queue: [], backfilled: true, sent: 0, dropped: 0, refused: 0, fails: 0, holdUntil: 0, marksSince: 0, marksAt: 0, lost: [] }));
    const past = Date.now() - 60e3; fs.utimesSync(F, past / 1000, past / 1000);
    const rep = { id: 'fb-madeup9', text: 'filed while held, the hub restarted', about: 'vibespace-task', kind: 'other', at: Date.now(), session: { id: 's9', name: 'Made-up 9' } };
    const pr = placeReads(F, 1);
    let o = null;
    try { await quietly(() => { o = FFW.create({ dataDir: d, target, instance: () => ({ name: 'made-up', version: '0' }), backlog: () => [rep], fetch: async () => { throw new Error('no network'); }, ...stubT, log: () => { } }); }); } finally { pr.restore(); }
    await quietly(() => o._hold.again());
    ok(((json(F) || {}).queue || []).some((x) => x.id === 'fb-madeup9'), 'FB9 at the lift the reports owed are derived again from the reports themselves (open, filed after the file\'s last write) — a report filed while held survives a restart before the lift', ((json(F) || {}).queue || []).map((x) => x.id));
    o._hold.stop();
  }
  // FO7: the outbox held — `vibespace-feedback list` says a report owed WAITS, any other's forward is NOT KNOWN (never silence as «sent»)
  {
    const d = world('fo7'), F = path.join(d, 'feedback-outbox.json');
    fs.writeFileSync(F, JSON.stringify({ v: 1, key: 'fk_' + 'B'.repeat(43), queue: [], backfilled: true, sent: 0, dropped: 0, refused: 0, fails: 0, holdUntil: 0, marksSince: 0, marksAt: 0, lost: [] }));
    const pr = placeReads(F, 1);
    let o = null;
    try { await quietly(() => { o = FFW.create({ dataDir: d, target, instance: () => ({ name: 'made-up', version: '0' }), backlog: () => [], fetch: async () => { throw new Error('no network'); }, ...stubT, log: () => { } }); }); } finally { pr.restore(); }
    o.enqueue({ id: 'fb-madeup7', text: 'filed while held', about: 'vibespace-task', kind: 'other', at: Date.now(), session: { id: 's7', name: 'Made-up 7' } });
    ok(o.forwardOf('fb-madeup7') === 'waiting' && o.forwardOf('fb-madeup7x') === 'unread', 'FO7 the outbox held: a report owed reads «waiting», any other\'s forward «not known» — never nothing (read as sent) (RED: the outbox as it was answers null)', { owed: o.forwardOf('fb-madeup7'), other: o.forwardOf('fb-madeup7x') });
    const CLI = fs.readFileSync(path.join(REPO, 'data/bin/vibespace-feedback'), 'utf8');
    ok(CLI.includes("unread: 'forward not known right now: the outbox cannot be read; nothing is lost, it reads again by itself' };"), 'FO7 the agent\'s `vibespace-feedback list` words the unknown forward', null);
    o._hold.stop();
  }
  // DS7 (MUSTs 2 and 3): the designs list held — the agent's list and systems refused by name; the Publish dialog's held branch executed
  {
    const DE = require(path.join(REPO, 'src/server/design-engine.js'));
    const timers = { setInterval: () => ({ unref() { } }), clearInterval: () => { }, setTimeout: () => ({ unref() { } }) };
    const d = world('ds7');
    const e1 = DE.create({ dataDir: d, timers, log: () => { } }); e1.register({ dir: '/scratch-made-up/design-7', title: 'Seven', sessionId: 'sA', kind: 'system' }); await e1.flush();
    const F = path.join(d, 'designs.json'), pr = placeReads(F, 1);
    let de = null;
    try { await quietly(() => { de = DE.create({ dataDir: d, timers, log: () => { } }); }); } finally { pr.restore(); }
    const { registerDesignRoutes } = require(path.join(REPO, 'src/routes/design.js'));
    const routes = {}, dapp = { get: (u, f) => { routes['GET ' + u] = f; }, post: (u, f) => { routes['POST ' + u] = f; }, put: () => { }, delete: () => { }, patch: () => { }, use: () => { } };
    registerDesignRoutes(dapp, { design: de, activeSessions: new Map([['sA', { agentToken: 'vsst_A', backend: 'claude', claudeSessionId: 'conv-A', cwd: '/scratch-made-up', name: 'a' }]]) });
    const call = async (k, req) => { const r = resStub(); await routes[k]({ query: {}, params: {}, headers: {}, ...req }, r); return r; };
    const al = await call('GET /api/agent/designs', { headers: { authorization: 'Bearer vsst_A' } }), sy = await call('GET /api/agent/design/systems', { headers: { authorization: 'Bearer vsst_A' } });
    const tok = await de.agentSystemTokens('Seven');
    ok(al.code === 503 && al.body.code === 'designs_unread' && sy.code === 503 && sy.body.code === 'designs_unread' && tok.code === 'designs_unread', 'DS7 the agent\'s design list and its systems lookups while the designs list is held: refused by name (503 designs_unread) — never «no designs in this conversation yet» nor «no design system is named …»', { list: al.code, systems: sy.code, tokens: tok.code });
    const home = await call('GET /api/designs', {});
    ok(!!home.body && home.body.code === 'designs_unread', 'DS7 the Designs home\'s read carries designs_unread (the home draws the held words, never «No designs yet»)', home.body && home.body.code);
    const DPW = await import(pathToFileURL(path.join(REPO, 'src/lib/design-publish-words.js')).href);
    const tt = (x, prm) => String(x).replace(/\{(\w+)\}/g, (all, k) => (prm && k in prm ? String(prm[k]) : all));
    const hs = DPW.publishStateWords({ designs: [], code: 'designs_unread' }, null, tt), ts = DPW.publishStateWords({ designs: [] }, null, tt);
    ok(hs.known === false && /cannot read its list of designs/.test(hs.text) && /^Not published yet/.test(ts.text), 'DS7 the Publish dialog DRAWN on a held designs reply: «not known whether this design was published» — RED: the reply as it was draws «Not published yet»', { held: hs.text, today: ts.text });
    de._hold.stop();
  }
  // DX7 (MUST 4): the draft asks the hold first
  {
    const AT = require(path.join(REPO, 'src/server/channels-attention.js'));
    const d = world('dx7');
    const a1 = AT.create({ dataDir: d, log: { log() { }, warn() { }, error() { } } }); a1.label('lark-1:oc_x1', 1000, 'needs', { title: 'x', lastText: 'y', lastAt: 1000 });
    const F = path.join(d, 'decision-examples.json'), pr = placeReads(F, 1);
    let a2 = null;
    try { await quietly(() => { a2 = AT.create({ dataDir: d, log: { log() { }, warn() { }, error() { } } }); }); } finally { pr.restore(); }
    const dr = await a2.draft();
    ok(dr.why === 'labels-unread' && dr.code === 'labels_unread', 'DX7 «Draft from my recent decisions» while the labels are held: refused by name (labels-unread) — never «answer ✓ and ✗ on a few judged rows first»', dr);
    a2._hold.stop();
  }
  // FB11 / FB12: the feedback list held — the agents' verb and the hub's marks door refuse by name (never «0 open», never «no marks»)
  {
    const FS = require(path.join(REPO, 'src/server/feedback-store.js'));
    const d = world('fb11');
    const s1 = FS.create({ dataDir: d }); s1.report({ text: 'a made-up report 11', about: 'vibespace-task' }, { session: { id: 'sess-madeup-11', name: 'Made-up 11' } });
    const F = path.join(d, 'feedback.json'), pr = placeReads(F, 1);
    let s2 = null;
    try { await quietly(() => { s2 = FS.create({ dataDir: d }); }); } finally { pr.restore(); }
    const vl = FS.automationVerbs({ store: s2 })['feedback.list']();
    ok(!!vl && vl.ok === false && vl.code === 'feedback_unread' && /cannot read /.test(vl.why || ''), 'FB11 the agents\' feedback.list verb while the list is held: refused by name with the words — never «0 open» (RED: the verb as it was answers ok with no reports)', vl);
    const { registerFeedbackRoutes } = require(path.join(REPO, 'src/routes/feedback.js'));
    const routes = {}, last = (f) => f[f.length - 1], fapp = { get: (u, ...f) => { routes['GET ' + u] = last(f); }, post: (u, ...f) => { routes['POST ' + u] = last(f); }, patch: () => { }, put: () => { }, delete: () => { }, use: () => { } };
    registerFeedbackRoutes(fapp, { store: s2, activeSessions: new Map(), collectorToken: () => 'c1' });
    const r = resStub(); r.set = (k, v) => { r.headers[k] = v; return r; };
    await routes['GET /api/feedback/forward/marks']({ query: { since: '0' }, params: {}, headers: { authorization: 'Bearer c1', 'x-vibespace-feedback-origin': 'fk_' + 'A'.repeat(43) } }, r);
    ok(r.code === 503 && !!r.body && r.body.code === 'feedback_unread', 'FB12 AT THE WIRE: the hub\'s marks door while its feedback list is held answers 503 feedback_unread — never 200 «no marks» (RED: the door as it was)', { code: r.code, body: r.body });
    s2._hold.stop();
  }
  // the page's own roads by their lines (each with a red copy)
  {
    const src = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
    const DH = src('src/lib/design-home.js'), FS2 = src('src/lib/feedback-sheet.js'), SU = src('src/lib/settings-ui.js'), AR = src('src/server/artifact-registry.js');
    const home = (x) => x.includes("designsHeld = r.code === 'designs_unread';") && x.includes("status.textContent = designsHeld ? t('VibeSpace cannot read its list of designs right now, so none is shown here.");
    ok(home(DH) && !home(anchored(DH, "designsHeld = r.code === 'designs_unread';", 'designsHeld = false;', 'ds7-home-today')), 'DS7 the Designs home draws the held words where «No designs yet» stood (RED: the home as it was, the code unread)', null);
    const sheet = (x) => x.includes("feedbackHeld = !!r && r.code === 'feedback_unread';") && x.includes("(view.size === 0 ? feedbackHeld ? t('VibeSpace cannot read its feedback reports right now") && x.includes('  const heldNow = readHeld();\n  if (!(await ensureLoaded()))');
    ok(sheet(FS2) && !sheet(anchored(FS2, "feedbackHeld = !!r && r.code === 'feedback_unread';", 'feedbackHeld = false;', 'fb10-sheet-today')), 'FB10 (MUST 5) the owner\'s Agent feedback sheet reads the reply that carries the hold and draws its words where «No reports yet» stood (RED: the sheet as it was, the synced rows only)', null);
    ok(SU.includes("r && r.why === 'labels-unread' ? t('the labels you taught could not be read"), 'DX7 the draft\'s toast words labels-unread (its card sentence, zh / ja)', null);
    const ho = (x) => x.includes("why: 'designs-unread'") && x.indexOf("why: 'designs-unread'") < x.indexOf('const op = AF.handoverOp(row, { from: fromRef, at });');
    ok(ho(AR) && !ho(anchored(AR, "why: 'designs-unread'", "why: 'designs-unread-today'", 'ho-today')), 'DS7 a design hand-over while the designs list is held is REFUSED, said — never noted, registered nowhere and marked handed (RED: the hand-over as it was)', null);
  }
}

// ══ r3232: the round's smalls on the first half (round w0dobhfp1) ══
console.log('XP9 / XP10 [app-proposals.json, the API proposals] a torn lift keeps the staged installers; the Outbox\'s API section says the hold');
{
  // XP9 (1): TORN bytes — the list starts empty, its bytes kept aside; the start's replay deletes no staged installer (the copy may name them)
  const AE = require(path.join(REPO, 'src/server/apps-engine.js'));
  const Mod = require('node:module');
  const asModule = (rel, code) => { const abs = path.join(REPO, rel); const m = new Mod(abs, null); m.filename = abs; m.paths = Mod._nodeModulePaths(path.dirname(abs)); m._compile(code, abs); return m.exports; };
  const tornRun = async (mod, name) => {
    const d = world(name), F = path.join(d, mod.STORE_FILE);
    fs.writeFileSync(F, '{"proposals": [{"id": "ap-torn1", "host": "local", "state": "proposed", "request": {"staged": "0123456789abcdef.deb"');
    const calls = [];
    const access = { call: async (host, verb, args) => { calls.push({ verb, args }); if (verb === 'app-status') return { status: { entries: [], replay: { decision: { run: false, why: 'made-up: nothing to put back' } } } }; return {}; } };
    let e = null;
    await quietly(async () => { e = mod.create({ access, dataDir: d, log: { log() { }, warn() { } } }); for (let i = 0; i < 200 && e._hold.held(); i++) await new Promise((r) => setTimeout(r, 10)); await e.afterListen(); });
    e._hold.stop();
    return { held: e._hold.held(), copies: copiesOf(F).length, unstaged: calls.filter((c) => c.verb === 'app-unstage').length };
  };
  const SRC = fs.readFileSync(path.join(REPO, 'src/server/apps-engine.js'), 'utf8');
  const TL = '      if (facts && facts.setAside) tornKept = facts.setAside;';
  const now = await tornRun(AE, 'xp9'), old = SRC.includes(TL) ? await tornRun(asModule('src/server/apps-engine.js', anchored(SRC, TL, '', 'xp9-today')), 'xp9-old') : null;
  ok(!now.held && now.copies === 1 && now.unstaged === 0 && !!old && old.copies === 1 && old.unstaged === 1, 'XP9 a TORN app-proposals.json (kept aside, the list started empty): the start\'s replay asks the machine to unstage NOTHING — the staged installers of the proposals only the kept copy holds stay for a start whose list reads (RED: the engine as it was sweeps them with an empty keep list)', { now, old });
  // XP10 (2) (3): the Outbox's API section says the hold itself; a failed read keeps the last mark (each by its line, with a red copy)
  const src = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
  const CV = src('src/lib/channel-api-card-view.js'), OB = src('src/lib/channel-outbox.js');
  const A1 = "    root.hidden = !S.total && !apiUnread;\n    held.hidden = !apiUnread;\n";
  const sec = (x) => x.includes(A1) && x.includes("root.append(head, held, list);");
  ok(sec(CV) && !sec(anchored(CV, A1, '    root.hidden = !S.total;\n', 'xp10-sec-today')), 'XP10 the Outbox\'s API section while the API proposals are held: drawn with the held words in it, its «0 awaiting you · 0» head hidden (RED: the section as it was hides itself when empty)', null);   // stale-pins: kept (the red copy writes the line as it was)
  const A2 = "  if (apiUnread && apiSection && census.total && !vw.sections.some((s) => s.key === 'api')) { apiSection.draw(null); nodes.push(apiSection.el); }\n";
  const beside = (x) => x.includes(A2) && x.indexOf(A2) < x.indexOf('  return { nodes, view: vw.view, census, awaiting: msgs.waitingItems, proposals: msgs.items };');
  ok(beside(OB) && !beside(anchored(OB, A2, '', 'xp10-beside-today')), 'XP10 in the «all» view (and «awaiting») with message proposals present, a held API list is drawn as its section with the held words — never nothing (RED: the Outbox as it was)', null);
  const A3 = "if (!r.census.total && r.nodes[0] && !apiCardsUnread()) r.nodes[0].textContent = t('This conversation has no proposal in the Outbox list.');";
  ok(OB.includes(A3) && !anchored(OB, A3, "if (!r.census.total && r.nodes[0]) r.nodes[0].textContent = t('This conversation has no proposal in the Outbox list.');", 'xp10-filter-today').includes(A3), 'XP10 under a conversation filter the held line is never written over with «This conversation has no proposal in the Outbox list.» (RED: the filter as it was)', null);   // stale-pins: kept (the red copy writes the line as it was)
  const A4 = "if (r && r.code === 'api_unread') apiUnread = true; else if (r && Array.isArray(r.cards)) apiUnread = false;";
  ok(CV.includes(A4) && !CV.includes("apiUnread = !!r && r.code === 'api_unread';"), 'XP10 a read that FAILS after a held read keeps the held mark (only an answer sets it: the hold, or a list) — never «Nothing is waiting» again over a hold that may stand', null);   // stale-pins: kept (the red copy writes the line as it was)
  // XP10 (4): the agent's app list prints the hold
  const APP = src('data/bin/vibespace-app'), A5 = "    if (j.proposalsUnread) lines.push(`Your proposals: not known right now — ${j.proposalsUnread}`);";
  const says = (x) => x.includes(A5) && x.indexOf(A5) > x.indexOf("if (verb === 'list') {") && x.indexOf(A5) < x.indexOf("lines.push('Open an app: vibespace-window open <catalog id>');");
  ok(says(APP) && !says(anchored(APP, A5, '', 'xp10-cli-today')), 'XP10 vibespace-app list while the app proposals are held prints one line: the agent\'s proposals are not known right now, with the words (RED: the CLI as it was prints nothing of it)', null);
}
console.log('FB13 [feedback.json, the outbox] the held list through the automation verbs answers 503; a stopped forward pulls no more');
{
  const AU = fs.readFileSync(path.join(REPO, 'src/routes/automation.js'), 'utf8');
  ok(/automation_unread: 503, feedback_unread: 503,/.test(AU), 'FB13 the automation routes\' status table has the held feedback list\'s row: vibespace-feedback list --open (the feedback.list verb) reads 503 try-later, never 400 (a usage error)', null);
  const FFW = require(path.join(REPO, 'src/server/feedback-forward.js'));
  const timers = new Set();
  const page = { marks: [{ id: 'fb-madeup13', status: 'handled', version: '0' }], next: 5, more: false };
  const o = FFW.create({ dataDir: world('fb13'), target: () => ({ url: 'https://hub.example.test', token: 'made-up-token' }), instance: () => ({ name: 'made-up', version: '0' }), applyMarks: () => ({ ok: false, applied: 0, code: 'feedback_unread' }), backlog: () => [], fetch: async () => ({ status: 200, headers: { get: () => null }, json: async () => page }), setTimeout: (fn) => { const h = { fn, unref() { } }; timers.add(h); return h; }, clearTimeout: (h) => { timers.delete(h); }, log: () => { } });
  await quietly(() => o.pullMarks());
  const asked = timers.size;
  o.stop();
  ok(asked === 1 && timers.size === 0, 'FB13 a mark page the held feedback list refused schedules ONE pull again (the «asks again» half of the law), and stop() clears it — a stopped forward fires no pull', { asked, left: timers.size });
}

report();
