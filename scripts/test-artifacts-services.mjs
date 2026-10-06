#!/usr/bin/env node
// A SITE OR SERVICE A CONVERSATION RUNS (lane artifacts-services, owner 2026-10-06 "这个对话发布的最新页面也没有出现在下面").
// PURE src/artifacts.js service rows (the head after Docs, stopped greying, the 24 h window, a moved port, the lineage rule,
// no listener ⇒ no row); the registry over the REAL jobs engine in a scratch dir with a job that listens on an
// EPHEMERAL port (bound, then known — never a fixed port): the row within one read, the url through the instance URL,
// the card born then patched, stop ⇒ greyed, rm ⇒ gone; the never-block census of the listen path; patched-copy
// controls. lane artifacts-services-url (owner 2026-10-06 "你识别的这些服务怎么都是 raw tcp 链接，而不是用的转发后的地址"): THE LINK
// LADDER (PURE serviceLink table: published forward ⇒ its public URL, else this instance's /proxy/, the raw port only as
// the machine-local line), the registry over a REAL PortForwardManager (scratch store, a stub frp plugin): publish ⇒ the
// card patched to the public URL, unpublish ⇒ back to the proxy within ONE broadcast; the printing rule (the card's DOM
// through esbuild with stubbed imports + chat.css's cascade: LTR, no "/http" first); 3 patched-copy controls.
// Run: node scripts/test-artifacts-services.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { mutantCopies } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const AF = require(path.join(REPO, 'src/artifacts.js'));
const REG = require(path.join(REPO, 'src/server/artifact-registry.js'));
const { JobManager } = require(path.join(REPO, 'src/jobs.js'));
const { PortForwardManager } = require(path.join(REPO, 'src/port-forward.js'));
const M = mutantCopies('artifacts-services', REPO);
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? ' — ' + JSON.stringify(e) : '')); } return !!c; };
const H = 3600_000;
const job = (id, cid, extra = {}) => ({ id, name: 'site-' + id, kind: 'service', state: 'up', owner: { conversation: { backend: 'claude', id: cid } }, listen: { port: 8100, firstAt: 1000, at: 1000 }, runs: [{ startedAt: 900 }], ...extra });

console.log('① PURE rows');
const rows0 = AF.serviceRows([job('a', 'c-A')], { cid: 'c-A', now: 2000, base: 'https://inst.example.test' });
const ra = rows0['job:a'];
ok(ra && ra.kind === 'service' && ra.url === 'https://inst.example.test/proxy/http://127.0.0.1:8100/' && ra.via === 'proxy' && ra.state === 'running' && ra.since === 900 && ra.firstAt === 1000, 'a running job that listens = ONE service row: its url = this instance\'s proxy of its port (no forward), since = the job\'s start, firstAt = its first listen', ra);
const mixed = { ...AF.fold({}, { op: 'write', path: '/p/notes.md', at: 5 }), ...AF.fold({}, AF.pageOp({ id: 'pg', srcKey: 'local:/p/site/index.html', srcPath: '/p/site/index.html', path: '/p/pg', updatedAt: 9 })), ...AF.fold({}, { op: 'write', path: '/p/run.py', at: 7 }), ...rows0 };
const v = AF.view(mixed);
ok(v.items.map((b) => b.kind).join(',') === 'doc,service,page' && v.code.length === 1 && v.count === 3, 'placement: Services under their own head AFTER Docs and before the rest; code stays folded; the chip counts it', v.items.map((b) => b.kind));
const stopped = job('b', 'c-A', { state: 'down', runs: [{ startedAt: 900, endedAt: 5000 }] });
const rb = AF.serviceRow(stopped, { now: 5000 + 23 * H });
ok(rb && rb.state === 'stopped' && rb.stoppedAt === 5000 && AF.cardFacts(AF.cardBlock(rb)).stoppedAt === 5000, 'a stopped job\'s row stays (greyed) with its stop instant', rb);
ok(AF.serviceRow(stopped, { now: 5000 + AF.SERVICE_KEEP_MS + 1 }) === null && AF.SERVICE_KEEP_MS === 24 * H, 'the 24 h window: a day after the stop the row goes');
const moved = AF.serviceRows([job('a', 'c-A', { listen: { port: 8200, firstAt: 1000, at: 3000 } })], { cid: 'c-A', now: 4000 })['job:a'];
ok(moved && moved.key === ra.key && moved.url === '/proxy/http://127.0.0.1:8200/' && AF.cardBlock(moved).port === 8200, 'a port that moves ⇒ the SAME row (key) with the new url (no instance URL ⇒ the RELATIVE proxy url)', moved);
const two = AF.serviceRows([job('a', 'c-A'), job('c', 'c-A', { listen: { port: 8300, firstAt: 1, at: 1 } })], { cid: 'c-A', now: 2000 });
ok(Object.keys(two).length === 2, 'two jobs ⇒ two rows');
ok(Object.keys(AF.serviceRows([job('x', 'c-B')], { cid: 'c-A', now: 2000 })).length === 0, 'THE LINEAGE RULE: another conversation\'s job ⇒ no row');
ok(Object.keys(AF.serviceRows([job('n', 'c-A', { listen: null })], { cid: 'c-A', now: 2000 })).length === 0 && AF.serviceRow(job('z', 'c-A', { listen: { port: 0 } })) === null, 'a job with no listener ⇒ no row');
ok(Object.keys(AF.serviceRows([job('a', 'c-A')], { cid: null })).length === 0, 'no conversation id (a pending fork) ⇒ no rows');

console.log('①b THE LINK LADDER (PURE serviceLink / forwardFor) — a link the user clicks is an address the user can reach');
const INST = 'https://inst.example.test';
const PUB = { id: 'pf-__local__-8766', hostId: '__local__', remotePort: 8766, label: 'service: house3d-web2-2', proto: 'http', localPort: 41001, publicUrl: 'https://house3d.relay.example.test/', publicName: 'house3d', published: true };
const LINK_ROWS = [ // [why, input, want]
  ['published forward ⇒ its public URL', { port: 8766, host: '__local__', forward: PUB, instanceUrl: INST }, { url: 'https://house3d.relay.example.test/', via: 'published', localUrl: 'http://127.0.0.1:8766/', forwardId: PUB.id, publishedBy: 'service: house3d-web2-2' }],
  ['local job, no forward ⇒ this instance\'s proxy of its port', { port: 8766, host: '__local__', forward: null, instanceUrl: INST }, { url: INST + '/proxy/http://127.0.0.1:8766/', via: 'proxy', target: 'http://127.0.0.1:8766/', localUrl: 'http://127.0.0.1:8766/', forwardId: null }],
  ['local job, forwarded but NOT published ⇒ still the proxy of its own port', { port: 8766, host: '', forward: { ...PUB, publicUrl: null, published: false }, instanceUrl: INST }, { url: INST + '/proxy/http://127.0.0.1:8766/', via: 'proxy', target: 'http://127.0.0.1:8766/', forwardId: PUB.id }],
  ['paired machine + its forward\'s localPort ⇒ the proxy of the LOCAL port', { port: 3000, host: 'h-pi', forward: { id: 'pf-h-pi-3000', hostId: 'h-pi', remotePort: 3000, localPort: 41002, publicUrl: null }, instanceUrl: INST }, { url: INST + '/proxy/http://127.0.0.1:41002/', via: 'proxy', target: 'http://127.0.0.1:41002/', localUrl: 'http://127.0.0.1:3000/', forwardId: 'pf-h-pi-3000' }],
  ['paired machine, no forward ⇒ only its machine-local address (via local)', { port: 3000, host: 'h-pi', forward: null, instanceUrl: INST }, { url: 'http://127.0.0.1:3000/', via: 'local', localUrl: 'http://127.0.0.1:3000/' }],
  ['instance url absent ⇒ the proxy url is RELATIVE (the client\'s absUrl), via proxy', { port: 8100, instanceUrl: '' }, { url: '/proxy/http://127.0.0.1:8100/', via: 'proxy' }],
  ['an http instance with a trailing slash ⇒ its scheme, one slash', { port: 8100, instanceUrl: 'http://box.lan:7400/' }, { url: 'http://box.lan:7400/proxy/http://127.0.0.1:8100/', via: 'proxy' }],
  ['an https instance ⇒ the proxy url keeps https', { port: 8100, instanceUrl: 'https://someone-local-x.frp.example.test' }, { url: 'https://someone-local-x.frp.example.test/proxy/http://127.0.0.1:8100/', via: 'proxy' }],
];
/** The table's misses (empty = green) + THE INVARIANT on every row: never the instance URL's HOST with a raw port. */
const linkMisses = (mod) => {
  const miss = [];
  for (const [why, inp, want] of LINK_ROWS) {
    let got; try { got = mod.serviceLink(inp); } catch (e) { got = { error: e.message }; }
    for (const k of Object.keys(want)) if (got[k] !== want[k]) miss.push({ why, k, got: got[k], want: want[k] });
    let ih = ''; try { ih = new URL(inp.instanceUrl).hostname; } catch { }
    if (ih && new RegExp('^https?://' + ih.replace(/\./g, '\\.') + ':' + inp.port + '/').test(String(got.url))) miss.push({ why, k: 'raw host:port', got: got.url });
  }
  return miss;
};
ok(linkMisses(AF).length === 0, 'serviceLink: ' + LINK_ROWS.map((r) => r[0]).join(' · '), linkMisses(AF));
const FW = [{ id: 'lan', hostId: '__local__', remotePort: 8766, targetHost: '192.168.1.9', publicUrl: 'https://lan.example.test/' }, { id: 'other', hostId: 'h-pi', remotePort: 8766, publicUrl: 'https://pi.example.test/' }, { id: 'live', hostId: '__local__', remotePort: 8766, localPort: 41003 }, { id: 'pub', hostId: '__local__', remotePort: 8766, publicUrl: 'https://pub.example.test/' }];
ok(AF.forwardFor(FW, '__local__', 8766).id === 'pub' && AF.forwardFor(FW.slice(0, 3), '__local__', 8766).id === 'live' && AF.forwardFor(FW.slice(0, 2), '__local__', 8766) === null && AF.forwardFor(FW, 'h-pi', 8766).id === 'other', 'forwardFor: the port\'s record on ITS host — published first, then live; a LAN (targetHost) record or another machine\'s is never it');
const rowP = AF.serviceRow(job('p', 'c-A', { listen: { port: 8766, firstAt: 1, at: 1 } }), { now: 2000, base: INST, forwards: [PUB] });
const blkP = AF.cardBlock(rowP);
ok(rowP.url === PUB.publicUrl && rowP.via === 'published' && blkP.url === PUB.publicUrl && blkP.via === 'published' && blkP.localUrl === 'http://127.0.0.1:8766/' && blkP.forwardId === PUB.id && blkP.publishedBy === 'service: house3d-web2-2', 'the row and its card block carry {url, via, localUrl, forwardId, publishedBy} — the client only prints', blkP);

console.log('② the registry over the REAL jobs engine (scratch dir, an ephemeral-port job)');
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-svc-'));
fs.mkdirSync(path.join(D, 'bin'), { recursive: true });
fs.copyFileSync(path.join(REPO, 'data/bin/job-wrapper.js'), path.join(D, 'bin', 'job-wrapper.js')); // the engine spawns its own wrapper from <dataDir>/bin
const ops = [];
const mm = { sessionId: 's1', messages: [], messageIndex: new Map(), turnIndex: 0, _emit: (o) => ops.push(o) };
const session = { sockName: 's1', backend: 'claude', claudeSessionId: 'conv-T', cwd: D, host: '', _artifacts: {}, _normalizer: mm };
const sessions = new Map([['s1', session]]);
let jm = null;
REG.configure({ activeSessions: () => sessions, jobs: () => jm, instanceUrl: { url: () => 'https://inst.example.test' }, log: { log() { }, warn() { } } });
jm = new JobManager({ dataDir: D, broadcast() { }, notifyUser() { }, log() { }, apiBase: 'http://127.0.0.1:9', listenReadMs: 150, onService: (j) => REG.noteService(j) });
jm.init();
const caller = { conversationId: 'conv-T', sessionId: 'sess-T', sessionCreatedAt: 1, groups: new Set() };
const owner = (cid) => ({ conversation: { backend: 'claude', id: cid }, sessionId: 'sess-' + cid, sessionCreatedAt: 1, createdBy: 'agent', groupsSnapshot: [] });
const until = async (fn, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return true; await new Promise((r) => setTimeout(r, 100)); await jm._sweep(); } return false; };
// a node one-liner server: binds port 0, THEN writes the port the kernel gave it (bound-then-known)
const serve = (tag) => [process.execPath, '-e', `const s=require('http').createServer((q,r)=>r.end('hello ${tag}'));s.listen(0,'127.0.0.1',()=>require('fs').writeFileSync(${JSON.stringify(path.join(D, tag + '.port'))},String(s.address().port)))`];
const mine = jm.create({ kind: 'service', name: 'house-web', cmd: { argv: serve('mine') }, owner: owner('conv-T') }, caller);
const theirs = jm.create({ kind: 'service', name: 'their-web', cmd: { argv: serve('theirs') }, owner: owner('conv-X') }, { ...caller, conversationId: 'conv-X' });
const J = jm.jobs.get(mine.job && mine.job.id), JX = jm.jobs.get(theirs.job && theirs.job.id);
const portOf = (tag) => { try { return Number(fs.readFileSync(path.join(D, tag + '.port'), 'utf-8')); } catch { return 0; } };
const list = () => REG.listFor('s1');
const svc = () => list().items.filter((b) => b.kind === 'service');
const born = await until(() => svc().length === 1 && portOf('mine') > 0 && JX && JX.listen);
const P = portOf('mine');
const b1 = svc()[0];
ok(born && b1.jobId === J.id && b1.port === P && b1.url === `https://inst.example.test/proxy/http://127.0.0.1:${P}/` && b1.via === 'proxy' && b1.state === 'running' && b1.name === 'house-web', 'the job\'s row appears within one read: its ephemeral port, the link = this instance\'s proxy of it (no forward yet)', b1);
ok(J.listen && J.listen.port === P && JX.listen && JX.listen.port === portOf('theirs') && svc().every((b) => b.jobId !== JX.id), 'the engine read BOTH jobs\' ports off their pid trees — the other conversation\'s job is no row here (lineage)');
const cardId = N_cardId(J.id);
ok(mm.messageIndex.has(cardId) && ops.filter((o) => o.op === 'create').length === 1 && mm.messageIndex.get(cardId).content[0].kind === 'service', 'the card is born ONCE at the first listen (a live create on the conversation\'s normalizer)', ops.map((o) => o.op));

console.log('②b the link follows the port\'s forward record — a REAL PortForwardManager (scratch store, a stub frp plugin)');
const DP = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-svc-pf-'));
const relay = { pub: 0, unpub: 0 };
const plugins = { frpPublish: async (id, lp, o) => { relay.pub++; return { url: 'https://house-web.relay.example.test/', name: 'house-web', proto: o.proto || 'http', subdomain: 'house-web' }; }, frpUnpublish: async () => { relay.unpub++; } };
let toRegistry = (m) => REG.noteForwards(m); // the server.js wiring: every broadcast of the manager reaches the registry
const pf = new PortForwardManager({ hosts: {}, dataDir: DP, broadcast: (m) => toRegistry(m), log() { }, plugins });
clearInterval(pf._watch);
REG.configure({ ports: () => pf });
const card = () => mm.messageIndex.get(cardId).content[0];
const edits = () => ops.filter((o) => o.op === 'edit' && o.id === cardId).length;
const fwd = await pf.forward('__local__', P, { label: 'service: house-web' });
ok(fwd && fwd.localPort > 0 && svc()[0].via === 'proxy' && svc()[0].forwardId === fwd.id && card().forwardId === fwd.id && card().url === b1.url, 'a forward (not published) ⇒ still this instance\'s proxy; the card learned its forward id from the broadcast', { row: svc()[0], card: card() });
const e0 = edits();
const pub = await pf.publish(fwd.id);
ok(pub.publicUrl === 'https://house-web.relay.example.test/' && svc()[0].url === pub.publicUrl && svc()[0].via === 'published', 'publish ⇒ the row links the PUBLISHED address', svc()[0]);
ok(card().url === pub.publicUrl && card().via === 'published' && card().publishedBy === 'service: house-web' && edits() === e0 + 1 && ops.filter((o) => o.op === 'create').length === 1, 'publish ⇒ the card is PATCHED in place within ONE broadcast (no second card)', { card: card(), edits: edits() - e0 });
const e1 = edits();
await pf.unpublish(fwd.id);
ok(svc()[0].via === 'proxy' && card().via === 'proxy' && card().url === b1.url && edits() === e1 + 1 && relay.unpub === 1, 'unpublish ⇒ the card is patched back to the proxy within ONE broadcast', { card: card(), edits: edits() - e1 });
pf._emit();
ok(edits() === e1 + 1, 'an unchanged broadcast patches nothing (the normalizer compares the block)');
// CONTROL (patched copy): the registry without the ports door's re-feed ⇒ a publish leaves the card on the proxy
const rsrc = fs.readFileSync(path.join(REPO, 'src/server/artifact-registry.js'), 'utf-8');
const door = "  if (!msg || msg.type !== 'port-forwards-updated') return 0;\n";
const MR = rsrc.includes(door) ? M.load('src/server/artifact-registry.js', rsrc.replace(door, '  return 0;\n'), 'norepatch') : null;
if (MR) { MR.configure({ activeSessions: () => sessions, jobs: () => jm, ports: () => pf, instanceUrl: { url: () => 'https://inst.example.test' }, log: { log() { }, warn() { } } }); toRegistry = (m) => MR.noteForwards(m); }
const e2 = edits();
if (MR) await pf.publish(fwd.id);
ok(MR && svc()[0].via === 'published' && !(card().via === 'published' && edits() === e2 + 1), 'CONTROL: no re-feed on the forwards broadcast ⇒ the card stays on the proxy while the row says published (the publish assert sees it)', { card: card().via, row: svc()[0].via });
toRegistry = (m) => REG.noteForwards(m);
REG.configure({ activeSessions: () => sessions, jobs: () => jm, ports: () => pf, instanceUrl: { url: () => 'https://inst.example.test' }, log: { log() { }, warn() { } } }); // the copy's configure re-pointed the normalizers' service seam
await pf.unpublish(fwd.id);
await pf.unforward(fwd.id);
ok(svc()[0].via === 'proxy' && svc()[0].forwardId === null && card().forwardId === null, 'unforward ⇒ the link is the proxy, no forward id (the card patched)', card());
const before = Number(J._listenAt || 0);
await jm._sweep(); await jm._sweep();
ok(Number(J._listenAt || 0) === before || Date.now() - before >= 150, 'the read is throttled per job (the engine\'s knob; production = 30 s on the 5 s tick)');
jm.stop(J);
const greyed = await until(() => svc()[0] && svc()[0].state === 'stopped');
ok(greyed && svc()[0].stoppedAt > 0 && list().count === 1, 'stop ⇒ the row stays, greyed, with its stop instant', svc()[0]);
ok(ops.some((o) => o.op === 'edit' && o.id === cardId && o.fields.content[0].state === 'stopped') && ops.filter((o) => o.op === 'create').length === 1, 'the card is PATCHED in place to stopped (no second card)');
jm.rm(J, { stop: true });
ok(svc().length === 0 && list().count === 0, 'rm ⇒ the row is gone');
const sv = AF.serviceRows([{ ...JX }], { cid: 'conv-X', now: Date.now() });
ok(Object.keys(sv).length === 1, 'the other conversation sees ITS OWN job as a row (the rule cuts both ways)');
try { jm.stop(JX); jm.shutdown(); } catch { }

console.log('③ the never-block census: the listen path reads /proc through fs.promises — no exec, no *Sync');
const SPAWN = /\b(?:execFileSync|execFile|execSync|spawnSync|spawn)\s*\(|\b\w+Sync\s*\(/;
const listenPath = (jobsSrc, procSrc) => { const i = jobsSrc.indexOf('  _listenRead(job, stamp) {'), j = jobsSrc.indexOf('  _serviceDoor() {'); return i > 0 && j > i ? jobsSrc.slice(i, j) + '\n' + procSrc.replace(/^\s*\/\/.*$/gm, '') : null; };
const jobsSrc = fs.readFileSync(path.join(REPO, 'src/jobs.js'), 'utf-8'), procSrc = fs.readFileSync(path.join(REPO, 'src/proc-listen.js'), 'utf-8');
const census = (t) => (t == null ? 'no-scope' : (t.split('\n').filter((l) => SPAWN.test(l)).length ? 'red' : 'green'));
ok(census(listenPath(jobsSrc, procSrc)) === 'green' && /fs\.promises\.readlink/.test(procSrc) && /require\('\.\/proc-listen\.js'\)/.test(fs.readFileSync(path.join(REPO, 'src/port-forward.js'), 'utf-8')), 'the listen path (src/jobs.js _listenRead + src/proc-listen.js) holds no exec and no sync call; port-forward\'s local watch reads the SAME reader');

console.log('③b THE PRINTING RULE — the card\'s DOM (src/lib/artifact-card.js through esbuild, its imports stubbed) + chat.css\'s cascade');
const esbuild = (await import(path.join(REPO, 'node_modules/esbuild/lib/main.js'))).default;
const CARD_STUBS = {
  './i18n.js': "export const t = (s, v) => String(s).replace(/\\{(\\w+)\\}/g, (_, k) => (v && v[k] != null ? v[k] : '')); export const resolveLang = () => 'en';",
  './file-types.js': "export const getFileIcon = () => '';", './user-todos-row.js': "export const agoText = () => '1 min ago';", './icons.js': "export const UI_ICONS = { globe: '' };",
  './utils.js': "export const absUrl = (s) => (/^https?:\\/\\//i.test(String(s)) ? String(s) : String(s).startsWith('/') ? 'https://inst.example.test' + s : String(s)); export const showContextMenu = () => {}; export const copyText = () => {};",
  './window-types.js': 'export const replayOpenSpec = () => null;',
};
const cardSrc = fs.readFileSync(path.join(REPO, 'src/lib/artifact-card.js'), 'utf-8');
/** The card module from `src` (the real file or a patched copy), only its relative imports stubbed (../artifacts.js is real). */
async function cardModule(src) {
  const stub = { name: 'stub', setup(b) { b.onResolve({ filter: /^\.\/[\w-]+\.js$/ }, (a) => (CARD_STUBS[a.path] ? { path: a.path, namespace: 'stub' } : null)); b.onLoad({ filter: /.*/, namespace: 'stub' }, (a) => ({ contents: CARD_STUBS[a.path], loader: 'js' })); } };
  const r = await esbuild.build({ stdin: { contents: src, resolveDir: path.join(REPO, 'src/lib'), sourcefile: 'artifact-card.js', loader: 'js' }, bundle: true, write: false, format: 'esm', platform: 'neutral', plugins: [stub], logLevel: 'silent' });
  return import('data:text/javascript;base64,' + Buffer.from(r.outputFiles[0].text).toString('base64'));
}
class FakeNode { // the few DOM calls renderArtifactCard makes
  constructor(tag) { this.tagName = tag; this.children = []; this.className = ''; this.dataset = {}; this._t = ''; this.title = ''; }
  append(...c) { this.children.push(...c); } appendChild(c) { this.children.push(c); return c; } setAttribute() { } addEventListener() { }
  get textContent() { return this.children.length ? this.children.map((c) => c.textContent).join('') : this._t; } set textContent(v) { this.children = []; this._t = String(v); }
  set innerHTML(v) { this._h = v; } get innerHTML() { return this._h || ''; }
  querySelector(sel) { const cls = sel.replace(/^\./, ''); for (const c of this.children) { if (String(c.className).split(/\s+/).includes(cls)) return c; const d = c.querySelector(sel); if (d) return d; } return null; }
}
globalThis.document = { createElement: (t) => new FakeNode(t) };
const cssSrc = fs.readFileSync(path.join(REPO, 'public/chat.css'), 'utf-8');
/** chat.css's `direction` for an element with these classes (class-only compound selectors: specificity, then order). */
function directionOf(classes, css) {
  let best = { spec: -1, i: -1, v: 'ltr' }, i = 0;
  for (const m of css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    i++; const d = /(?:^|;)\s*direction\s*:\s*(\w+)/.exec(m[2]); if (!d) continue;
    for (const sel of m[1].split(',').map((x) => x.trim())) {
      if (!/^(\.[\w-]+)+$/.test(sel)) continue;
      const need = sel.slice(1).split('.'); if (!need.every((c) => classes.includes(c))) continue;
      if (need.length > best.spec || (need.length === best.spec && i > best.i)) best = { spec: need.length, i, v: d[1] };
    }
  }
  return best.v;
}
/** What the eye reads first: in an rtl box a url's trailing neutral run ("/") is painted at its START (the .223 "/http://…"). */
const painted = (text, dir) => { const t = String(text).replace(/^‎/, ''); const tail = /[^\p{L}\p{N}]+$/u.exec(t); return dir === 'rtl' && tail ? tail[0] + t.slice(0, -tail[0].length) : t; };
const SB = { type: 'artifact', key: 'job:j1', kind: 'service', name: 'house3d-web2-2', port: 8766, url: '/proxy/http://127.0.0.1:8766/', via: 'proxy', target: 'http://127.0.0.1:8766/', localUrl: 'http://127.0.0.1:8766/', forwardId: null, state: 'running', since: 1, lastAt: 1 };
async function printed(src, css) {
  const C = await cardModule(src);
  const el = C.renderArtifactCard({ content: [SB] }, {});
  const box = el.querySelector('.chat-artifact-path'), href = el.querySelector('.chat-artifact-href');
  const text = href ? href.textContent : box.textContent, dir = directionOf(String(box.className).split(/\s+/), css);
  return { text, dir, first: painted(text, dir), via: el.querySelector('.chat-artifact-via')?.textContent || '', open: C.serviceOpenSpec(SB), pub: C.serviceOpenSpec({ ...SB, url: 'https://h.relay.example.test/', via: 'published' }) };
}
const pr = await printed(cardSrc, cssSrc);
ok(pr.dir === 'ltr' && pr.text === 'https://inst.example.test/proxy/http://127.0.0.1:8766/' && pr.first.startsWith('https://') && !/‎/.test(pr.text), 'the card prints the row\'s url resolved through absUrl, LTR, end-truncated — the eye reads "https://…" first, never "/http"', pr);
ok(pr.via === 'Through this VibeSpace' && pr.open.url === SB.target && pr.open.proxy === true && pr.pub.url === 'https://h.relay.example.test/' && pr.pub.proxy === false, 'the small via word; a proxied row opens its target in the Web view\'s PROXY mode, a published one directly', pr);
ok(directionOf(['chat-artifact-path', 'chat-status-dim'], cssSrc) === 'rtl', 'a file PATH box stays rtl (front-truncation for paths — only the url is LTR)');

console.log('④ patched-copy controls');
const asrc = fs.readFileSync(path.join(REPO, 'src/artifacts.js'), 'utf-8');
const lineage = '    if (jobOwnerCid(j) !== cid) continue;\n';
const ML = asrc.includes(lineage) ? M.load('src/artifacts.js', asrc.replace(lineage, ''), 'nolineage') : null;
ok(ML && Object.keys(ML.serviceRows([job('x', 'c-B')], { cid: 'c-A', now: 2000 })).length === 1, 'CONTROL: without the lineage check a FOREIGN job\'s row appears (the ① lineage assert sees it)');
const syncExec = "    const PL = require('./proc-listen.js');\n";
ok(jobsSrc.includes(syncExec) && census(listenPath(jobsSrc.replace(syncExec, syncExec + "    require('child_process').execSync('ss -ltnp');\n"), procSrc)) === 'red', 'CONTROL: a sync exec restored on the listen path ⇒ the never-block census is red');
const expiry = '  if (!running && now - stoppedAt > SERVICE_KEEP_MS) return null;\n';
const ME = asrc.includes(expiry) ? M.load('src/artifacts.js', asrc.replace(expiry, ''), 'noexpiry') : null;
ok(ME && ME.serviceRow(stopped, { now: 5000 + AF.SERVICE_KEEP_MS + 1 }) !== null, 'CONTROL: without the expiry a day-old stopped row stays (the ① 24 h assert sees it)');
// CONTROL 1: the old link restored (the instance URL's HOST with the job's RAW port) ⇒ the ①b table is red
const proxyRet = 'return { url: `${base}/proxy/${target}`, via: \'proxy\', target, localUrl, forwardId };';
const MH = asrc.includes(proxyRet) ? M.load('src/artifacts.js', asrc.replace(proxyRet, "let h = '127.0.0.1'; try { if (instanceUrl) h = new URL(String(instanceUrl)).hostname || h; } catch { }\n  return { url: `http://${h}:${p}/`, via: 'proxy', target, localUrl, forwardId };"), 'rawhostport') : null;
const mh = MH ? linkMisses(MH) : [];
ok(MH && mh.some((x) => x.k === 'raw host:port') && mh.length > 0, 'CONTROL: the raw instance-host:port link restored ⇒ the link table is red (its never-raw-host:port invariant)', mh.slice(0, 2));
// CONTROL 2: the rtl path box restored for the url (the .223 card) ⇒ the eye reads "/https…" first ⇒ the printing assert is red
const urlBox = "div(service ? 'chat-artifact-path chat-artifact-url chat-status-dim' : 'chat-artifact-path chat-status-dim')";
const prM = cardSrc.includes(urlBox) ? await printed(cardSrc.replace(urlBox, "div('chat-artifact-path chat-status-dim')"), cssSrc) : null;
const prC = await printed(cardSrc, cssSrc.replace('.chat-artifact-path.chat-artifact-url { direction: ltr;', '.chat-artifact-path.chat-artifact-url {'));
ok(prM && prM.dir === 'rtl' && prM.first.startsWith('/https') && prC.dir === 'rtl' && prC.first.startsWith('/https'), 'CONTROL: the url back in the rtl path box (the card\'s class, or chat.css\'s ltr rule) ⇒ "/https://…" first ⇒ red', { card: prM && prM.first, css: prC.first });
try { fs.rmSync(D, { recursive: true, force: true }); } catch { }
try { fs.rmSync(DP, { recursive: true, force: true }); } catch { }

function N_cardId(jobId) { return require(path.join(REPO, 'src/normalizers.js')).artifactCardId(mm, 'job:' + jobId); }
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
