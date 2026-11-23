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
// Run: node scripts/test-content-store-reads.mjs
import './scratch.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { scratchDir } from './scratch.mjs';
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
    ok(!!next && next.code === 'pages_unread' && next.status === 503 && /could not be read/.test(next.error || ''), 'PP1 the publish itself is refused BY NAME (503 pages_unread) — never «published» into an empty list', next);
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
    ok(!!lr.body && lr.body.code === 'pages_unread' && /could not be read/.test(lr.body.unread || '') && !!br.body && br.body.code === 'pages_unread' && br.body.page === null, 'PP2 the lists say it (the chips\' list and the Publish dialog\'s by-path read carry unread + pages_unread — the dialog words it, zh / ja)', { list: lr.body, byPath: br.body });
    ok(pubR.code === 503 && !!pubR.body && pubR.body.code === 'pages_unread', 'PP2 the Publish dialog\'s POST answers 503 pages_unread (the toast words it by its code)', { code: pubR.code, body: pubR.body });
    ok(disk(F) === before, 'PP2 nothing was written over the file while held', null);
    p2._hold.stop();
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

report();
