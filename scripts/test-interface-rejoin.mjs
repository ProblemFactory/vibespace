#!/usr/bin/env node
// THE HUB OUTLIVES ITS INTERFACE, AND ITS START VALUE CROSSES NO LINK (the separation, M1 — lane B; 主开发 r1060 + r1087).
// A real interface (src/interface/) on a unix-socket link; today's hub's own wiring (src/server/hub-port.js wire, the real
// join of src/server/interface-party.js) over a real http.Server; every byte of the link captured by the suite:
//   ① THE GREETING, VERSION 2: the interface's first frame is a challenge; the hub answers with a proof; THE START VALUE IS ON
//     NO FRAME of the whole exchange (the join, pages, a re-join), and the digest neither. RED CONTROL: a party that says the
//     version-1 hello puts its start value on the link — and the interface refuses it by name ('v1-start-value'). The capture
//     reads each value in its common spellings (主开发 r1124 6: hex, HEX, bytes, base64, base64url, the hex text's base64).
//     RED CONTROL: a party that puts its start value in base64 on a frame — missed by the hex search, found by the spellings.
//   ② A WRONG PROOF IS REFUSED AND COUNTED; A STORM OF THEM NEVER DISPLACES THE HUB: 200 links naming the hub with wrong
//     proofs — each refused and counted, the joined hub's link never ended, pages answered through it all along. RED CONTROL:
//     the proof's check cut ⇒ the first wrong join is admitted and REPLACES the hub (its link ends).
//   ③ THE HUB OUTLIVES ITS INTERFACE: interface A dies; interface B starts on the same path with the hub's SAME admit written
//     first; the SAME hub process (its handler's own memory: its birth and its count) answers through B, its certificate
//     pushed again, its end never called. With no interface coming back it ends by name past its bound. An interface that
//     has not admitted the hub refuses it and the hub ends at once (the supervisor writes the admit first). RED CONTROLS: the
//     end put back (the hub ends at the link's death); the bound cut (with no interface back, the hub never ends).
//   ④ THE DIGEST IS NEVER LOGGED OR SENT BACK by the interface (a census over its log and reply sites, and the run's own
//     journal and capture). RED CONTROL: a planted log of the digest is found. AND THE ADMIT'S HOLDER, not only a word
//     (主开发 r1124 6): every name the admission binds the digest to, and every name an admit line is handed in by — no log
//     or reply call's whole argument carries one. RED CONTROLS: a log through a renamed holder across two lines, and the
//     whole admit line logged in main.js — each missed by the word census, found by the holder's.
// in-process; a scratch dir under os.tmpdir(); a throwaway self-signed pair made with openssl.
import './scratch.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import http from 'node:http';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import Module, { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (typeof n !== 'string') throw new TypeError('ok(…): its name must be a string — a swapped call is refused'); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra !== undefined ? '\n    ' + JSON.stringify(extra).slice(0, 900) : '')); } return !!c; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let lapAt = performance.now(), lapName = 'the start';
const lap = (name) => { const now = performance.now(); console.log(`    (${lapName}: ${Math.round(now - lapAt)} ms)`); lapAt = now; lapName = name; };   // printed for the row's time, never judged
const until = async (f, ms = 5000) => { const t0 = Date.now(); while (!f()) { if (Date.now() - t0 > ms) return false; await sleep(5); } return true; };
const T = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-iface-rejoin-'));
process.on('exit', () => { try { fs.rmSync(T, { recursive: true, force: true }); } catch { } });
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
function compileAt(rel, src) { const file = path.join(REPO, rel); const m = new Module(file, null); m.filename = file; m.paths = Module._nodeModulePaths(path.dirname(file)); m._compile(src, file); return m.exports; }
/** `rel`'s source with ONE piece swapped — the needle must occur exactly once, or the control is void (it throws) */
function mutant(rel, needle, into) { const src = read(rel); if (src.split(needle).length !== 2) throw new Error(`CONTROL needle not found exactly once in ${rel}: ${needle.slice(0, 80)}`); return compileAt(rel, src.replace(needle, into)); }
const { Mux } = require(path.join(REPO, 'src/agentd/mux.js'));
const LP = require(path.join(REPO, 'src/link-proof.js'));
const IP = require(path.join(REPO, 'src/server/interface-party.js'));
const startPair = () => { const s = crypto.randomBytes(32).toString('hex'); return { secret: s, digest: LP.digestOf(s) }; };
let nSock = 0;
const sockPath = () => path.join(T, `l${++nSock}.sock`);

/** an interface (index.js, an admission swapped in if asked) listening on a loopback port, its link on `link` */
async function anInterface(link, { admissionMod = null, journal = [] } = {}) {
  let idx = read('src/interface/index.js');
  if (admissionMod) { globalThis.__vsAdmRJ = admissionMod; idx = idx.replace("require('./admission.js')", 'globalThis.__vsAdmRJ'); }
  const I = compileAt('src/interface/index.js', idx).create({ helloMs: 2000 });
  const where = await I.listen(0, '127.0.0.1');
  try { fs.rmSync(link, { force: true }); } catch { }
  const srv = net.createServer((s) => I.attachLink(s)); await new Promise((r) => srv.listen(link, r));
  return { I, port: where.port, link, journal, close: async () => { srv.close(); await I.close(); try { fs.rmSync(link, { force: true }); } catch { } } };
}
/** every byte a hub's link carries, both ways (the suite's own capture) */
function capture() {
  const frames = [];
  const connect = (p) => { const s = net.connect(p); const w = s.write.bind(s); s.write = (d, ...rest) => { frames.push(Buffer.from(d)); return w(d, ...rest); }; s.on('data', (b) => frames.push(Buffer.from(b))); return s; };
  return { frames, connect, holds: (text) => Buffer.concat(frames).includes(Buffer.from(text)), holdsAny: (hex) => spellings(hex).some((b) => Buffer.concat(frames).includes(b)) };
}
/** a hex value in its common spellings (主开发 r1124 6): its hex text either case, its bytes, their base64 and base64url, and
 *  the base64 of the hex text itself */
const spellings = (hex) => { const raw = Buffer.from(hex, 'hex'); return [hex, hex.toUpperCase(), raw.toString('base64'), raw.toString('base64url'), Buffer.from(hex).toString('base64')].map((t) => Buffer.from(t)).concat([raw]); };
/** today's hub's own wiring (hub-port.js wire), its handler's memory telling the same process from a new one */
function aHub({ secret, link, hp = require(path.join(REPO, 'src/server/hub-port.js')), cap = capture(), rejoinMs = 3000 }) {
  const born = crypto.randomBytes(4).toString('hex'); let n = 0; const lines = []; let ended = 0, booted = 0;
  const server = http.createServer((req, res) => { n++; res.end(JSON.stringify({ born, n })); });
  const hubObj = { listen: () => hubObj };
  const join = (o) => IP.join({ ...o, connect: cap.connect, log: { error: (l) => lines.push(String(l)) } });
  const wired = hp.wire({ form: 'piped', start: { party: 'hub', secret, link } }, { hub: hubObj, server, join, end: () => { ended++; }, log: { log: (l) => lines.push(String(l)), error: (l) => lines.push(String(l)) }, rejoinMs });
  hubObj.listen(0, '127.0.0.1', () => { booted++; });
  return { born, cap, lines, wired, server, ended: () => ended, booted: () => booted };
}
const get = (port, p = '/') => new Promise((resolve) => { const q = http.get({ host: '127.0.0.1', port, path: p, agent: false }, (res) => { let b = ''; res.on('data', (c) => { b += c; }); res.on('end', () => { let j = null; try { j = JSON.parse(b); } catch { } resolve({ status: res.statusCode, json: j }); }); }); q.on('error', () => resolve({ status: 0 })); });

lap('① ');
console.log('— ① THE GREETING, VERSION 2: a challenge, a proof — the start value on no frame of the link');
{
  const k = startPair(), link = sockPath();
  const A = await anInterface(link); A.I.admit({ party: 'hub', digest: k.digest });
  const H = aHub({ secret: k.secret, link });
  await until(() => H.booted() === 1, 3000);
  const page = await get(A.port, '/one');
  const first = (() => { const b = Buffer.concat(H.cap.frames); const i = b.indexOf(Buffer.from('{')); const j = b.indexOf(0x0a, i); return i >= 0 && j > i ? b.subarray(i, j).toString() : ''; })();
  let firstOp = null; try { firstOp = JSON.parse(first).op; } catch { }
  ok(H.booted() === 1 && page.status === 200 && firstOp === 'challenge', `the hub joined and a page was answered through it (${page.status}); the link's first line is the interface's «${firstOp}»`, { first: first.slice(0, 120) });
  ok(!H.cap.holdsAny(k.secret) && !H.cap.holdsAny(k.digest) && H.cap.frames.length > 0, `the start value is on none of the link's ${H.cap.frames.length} frames in any of its ${spellings(k.secret).length} common spellings (hex, HEX, bytes, base64, base64url, the hex's base64), and the digest neither (the hub proved, never sent)`);
  await A.close();
  // RED CONTROL: a party that says the VERSION-1 hello — its start value IS on the link, and the interface refuses it by name
  const k1 = startPair(), link1 = sockPath(), B = await anInterface(link1); B.I.admit({ party: 'hub', digest: k1.digest });
  const cap1 = capture(); let refused = false;
  const s1 = cap1.connect(link1); const mx = new Mux(s1, { heartbeat: false, closeAfterQueue: true, onControl: (m) => { if (m && m.op === 'challenge') mx.control({ op: 'hello', protoVersion: 1, party: 'hub', secret: k1.secret }); if (m && m.op === 'auth-fail') refused = true; }, onData: (c, b) => mx.credit(c, b.length) });
  await until(() => refused, 2000);
  ok(cap1.holds(k1.secret) && refused && B.I.stats().lastRefused === 'v1-start-value', `RED CONTROL — the version-1 hello: its start value is on the link (${cap1.holds(k1.secret)}), and the interface refuses it by name («${B.I.stats().lastRefused}»)`);
  try { mx.destroy(); } catch { } await B.close();
  // RED CONTROL for the spellings: a party that puts its start value on the link in base64 — the hex search alone misses it
  const k2 = startPair(), link2 = sockPath(), C = await anInterface(link2); C.I.admit({ party: 'hub', digest: k2.digest });
  const cap2 = capture(); let refused2 = false;
  const s2 = cap2.connect(link2); const mx2 = new Mux(s2, { heartbeat: false, closeAfterQueue: true, onControl: (m) => { if (m && m.op === 'challenge') mx2.control({ op: 'hello', protoVersion: 2, party: 'hub', proof: LP.proofOf(LP.digestOf('another value'), m.nonce, 'hub'), note: Buffer.from(k2.secret, 'hex').toString('base64') }); if (m && m.op === 'auth-fail') refused2 = true; }, onData: (c, b) => mx2.credit(c, b.length) });
  await until(() => refused2, 2000);
  ok(refused2 && !cap2.holds(k2.secret) && cap2.holdsAny(k2.secret), `RED CONTROL — the start value in base64 on a frame: the hex search alone finds it ${cap2.holds(k2.secret)}, the spellings ${cap2.holdsAny(k2.secret)}`);
  try { mx2.destroy(); } catch { } await C.close();
}

lap('② ');
console.log('— ② A WRONG PROOF IS REFUSED AND COUNTED; A STORM OF THEM NEVER DISPLACES THE HUB');
{
  async function storm(admissionMod) {
    const k = startPair(), link = sockPath();
    const A = await anInterface(link, { admissionMod }); A.I.admit({ party: 'hub', digest: k.digest });
    const H = aHub({ secret: k.secret, link });
    await until(() => H.booted() === 1, 3000);
    const before = A.I.stats().refused;
    const N = 200; let answeredDuring = 0, tried = 0;
    const one = () => new Promise((resolve) => {
      const s = net.connect(link); s.on('error', () => resolve());
      const mx = new Mux(s, { heartbeat: false, closeAfterQueue: true, onControl: (m) => { if (m && m.op === 'challenge') { tried++; mx.control({ op: 'hello', protoVersion: 2, party: 'hub', proof: LP.proofOf(LP.digestOf('not-the-start-value'), m.nonce, 'hub') }); } }, onData: (c, b) => mx.credit(c, b.length), onDead: () => resolve() });
      setTimeout(() => { try { mx.destroy(); } catch { } resolve(); }, 1500);
    });
    const pages = (async () => { for (let i = 0; i < 20; i++) { if ((await get(A.port, `/during${i}`)).status === 200) answeredDuring++; } })();
    await Promise.all([...Array.from({ length: N }, one), pages]);
    await sleep(50);
    const after = await get(A.port, '/after');
    const st = A.I.stats();
    const r = { tried, refusedNow: st.refused - before, lastRefused: st.lastRefused, answeredDuring, after: after.status, hubLines: H.lines.filter((l) => l.includes('link ended')).length, ended: H.ended() };
    await A.close(); return r;
  }
  const law = await storm();
  ok(law.tried === 200 && law.refusedNow === 200 && law.lastRefused === 'proof', `200 links naming the hub with a wrong proof: ${law.refusedNow} refused and counted («${law.lastRefused}»)`, law);
  ok(law.answeredDuring === 20 && law.after === 200 && law.hubLines === 0 && law.ended === 0, `the joined hub was never displaced: ${law.answeredDuring} of 20 pages answered DURING the storm, ${law.after} after it, its link never ended (${law.hubLines})`, law);
  const CHECK = "    if (!proofMatches(hello.proof, digest, nonce, party)) return { ok: false, why: 'proof' };   // a wrong proof: another start value, or a previous generation's\n";
  const red = await storm(mutant('src/interface/admission.js', CHECK, ''));
  ok(red.hubLines >= 1, `RED CONTROL — the proof's check cut: a wrong join is admitted and replaces the hub — its link ends (${red.hubLines} «link ended» lines)`, red);
}

lap('③ ');
console.log('— ③ THE HUB OUTLIVES ITS INTERFACE: a new interface on the same path, the same hub process answers');
{
  const keyF = path.join(T, 'rj.key.pem'), certF = path.join(T, 'rj.cert.pem');
  execFileSync('openssl', ['req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1', '-nodes', '-keyout', keyF, '-out', certF, '-days', '2', '-subj', '/CN=rejoin'], { stdio: 'ignore' });
  const PEM = { key: fs.readFileSync(keyF), cert: fs.readFileSync(certF) };
  /** interface A, the hub joined, A dies; then (if asked) B on the same path, the admit written first (or after) */
  async function outlive({ hp, comesBack = true, admitFirst = true, rejoinMs = 3000, waitMs = 3000 } = {}) {
    const k = startPair(), link = sockPath();
    const A = await anInterface(link); A.I.admit({ party: 'hub', digest: k.digest });
    const H = aHub({ secret: k.secret, link, hp, rejoinMs });
    await until(() => H.booted() === 1, 3000);
    H.wired.pushCertificate(PEM);
    const one = await get(A.port, '/one');
    await A.close();   // THE INTERFACE DIES
    await until(() => H.lines.some((l) => l.includes('link ended')), 2000);
    let B = null, two = { status: 0 };
    if (comesBack) {
      B = await anInterface(link); if (admitFirst) B.I.admit({ party: 'hub', digest: k.digest });   // the supervisor's duty: the hub's SAME admit, before the hub can knock
      await until(() => B.I.stats().linked || H.ended() > 0, waitMs);
      if (!admitFirst) { await sleep(100); B.I.admit({ party: 'hub', digest: k.digest }); }
      await until(() => B.I.stats().tls || H.ended() > 0, 1000);
      two = await get(B.port, '/two');
    } else await until(() => H.ended() > 0, waitMs);
    const r = { one: one.json, two: two.json, twoStatus: two.status, tls: B ? B.I.stats().tls : null, ended: H.ended(), booted: H.booted(), lines: H.lines.filter((l) => l.startsWith('[hub-port]')).map((l) => l.slice(11, 90)), startOnLink: H.cap.holds(k.secret) };
    if (B) await B.close();
    return r;
  }
  const law = await outlive();
  ok(law.one && law.two && law.two.born === law.one.born && law.two.n === 2 && law.ended === 0 && law.booted === 1, `interface A dies, B starts on the same path with the hub's same admit: the SAME hub process answers through B (born ${law.two && law.two.born}, its 2nd page), never ended, never booted again`, law);
  ok(law.tls === true && !law.startOnLink, `the hub pushed its certificate to B again (B serves TLS: ${law.tls}), and its start value crossed no link at either join (${!law.startOnLink})`, law);
  const gone = await outlive({ comesBack: false, rejoinMs: 300, waitMs: 3000 });
  ok(gone.ended === 1 && gone.lines.some((l) => l.includes('no interface took this hub within 0.3 s')), `no interface comes back: the hub ends by name past its bound (${gone.ended})`, gone);
  const unadmitted = await outlive({ admitFirst: false });
  ok(unadmitted.ended === 1 && unadmitted.lines.some((l) => l.includes('the new interface refused this hub')), `a new interface that has NOT admitted the hub refuses it, and the hub ends at once by name — the supervisor writes the admit FIRST (${unadmitted.ended})`, unadmitted);
  // RED CONTROLS: the end put back (the hub ends at the link's death, as before r1060); the bound cut (it never ends)
  const ONDEAD = "      const onDead = () => {   // the interface's link ended: every channel with it; this hub waits for a NEW interface (r1060)\n";
  const ended = await outlive({ hp: mutant('src/server/hub-port.js', ONDEAD, ONDEAD + '        end(); return;\n'), waitMs: 1000 });
  ok(ended.ended === 1 && ended.twoStatus !== 200, `RED CONTROL — the end put back: the hub ends at its link's death (${ended.ended}) and B answers no page from it (${ended.twoStatus})`, ended);
  const BOUND = '            if (monoNow() + step > until) {';
  const endless = await outlive({ hp: mutant('src/server/hub-port.js', BOUND, '            if (false) {'), comesBack: false, rejoinMs: 300, waitMs: 1500 });
  ok(endless.ended === 0, `RED CONTROL — the bound cut: with no interface back, the hub still has not ended five times past its bound (${endless.ended})`, endless);
}

lap('④ ');
console.log('— ④ THE DIGEST IS NEVER LOGGED OR SENT BACK by the interface');
{
  const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  const census = (files) => files.flatMap((rel) => strip(rel.src).split('\n').map((l, i) => ({ rel: rel.rel, i: i + 1, l })).filter((x) => /digest/i.test(x.l) && /console\.|log\.|said\.lastRefused|\.control\(|\.write\(|\.end\(|\.json\(/.test(x.l)));
  const files = [...fs.readdirSync(path.join(REPO, 'src/interface')).filter((f) => f.endsWith('.js')).map((f) => `src/interface/${f}`), 'src/link-proof.js'].map((rel) => ({ rel, src: read(rel) }));
  const hits = census(files);
  ok(hits.length === 0, `a census of the interface's ${files.length} files (and the proof's module): no log, refusal or reply site names the digest (${hits.length})`, hits);
  const planted = files.map((f) => (f.rel === 'src/interface/admission.js' ? { ...f, src: f.src.replace("    if (!digest) return { ok: false, why: 'not-admitted' };", "    if (!digest) return { ok: false, why: 'not-admitted' };\n    console.error(`[admission] the admitted digest: ${digest}`);") } : f));
  const red = census(planted);
  ok(red.length === 1, `RED CONTROL — a log of the digest planted in the admission: the census finds it (${red.length})`, red.map((h) => `${h.rel}:${h.i}`));
  // THE ADMIT'S HOLDER, NOT ONLY A WORD (主开发 r1124 6): the names the admission binds the digest to — its Map, every name
  // taken from the Map or from an admit line, the admit's own parameter — and every name an admit line is handed in by
  // (main.js's `.admit(m)`). Every log or reply call's WHOLE argument (across lines) is read: one that carries a holder's
  // value is found, whatever it is called. A holder's name read only for a property that is no value (its party, its link,
  // its op, the Map's keys or size) is no leak.
  const NO_VALUE = new Set(['party', 'link', 'op', 'protoVersion', 'keys', 'size', 'has']);
  const holdersOf = (f) => {
    const src = strip(f.src), names = new Set();
    if (f.rel === 'src/interface/admission.js') {
      const map = /const (\w+) = new Map\(\);[^\n]*digest/.exec(f.src); if (map) names.add(map[1]);
      const param = /function admit\((\w+)/.exec(src); if (param) names.add(param[1]);
      for (const m of src.matchAll(/(\w+)\s*=\s*(?:\w+\s*&&\s*)?(\w+)\.(get\(|digest\b)/g)) if (m[3] === 'digest' || names.has(m[2])) names.add(m[1]);
    }
    for (const m of src.matchAll(/\.admit\((\w+)\)/g)) names.add(m[1]);
    return names;
  };
  const callArgs = (src) => {   // each log / reply call's argument, its parentheses balanced (it may span lines)
    const out = [], re = /(?:\bconsole\.\w+|\blog\.\w+(?:\?\.)?|\.control|\.write|\.end|\.json)\(/g; let m;
    while ((m = re.exec(src))) { let depth = 1, i = re.lastIndex; for (; i < src.length && depth; i++) { if (src[i] === '(') depth++; else if (src[i] === ')') depth--; } out.push({ at: src.slice(0, m.index).split('\n').length, arg: src.slice(re.lastIndex, i - 1) }); }
    for (const a of src.matchAll(/said\.\w+\s*=\s*([^;\n]+)/g)) out.push({ at: src.slice(0, a.index).split('\n').length, arg: a[1] });
    return out;
  };
  const carries = (arg, names) => [...names].filter((n) => [...arg.matchAll(new RegExp(`\\b${n}\\b(\\s*\\.\\s*(\\w+))?`, 'g'))].some((x) => !x[2] || !NO_VALUE.has(x[2])));
  const holderCensus = (fs_) => { const holders = new Map(fs_.map((f) => [f.rel, holdersOf(f)])); const all = new Set([...holders.values()].flatMap((h) => [...h])); return { all, hits: fs_.flatMap((f) => { const names = holders.get(f.rel); return names.size ? callArgs(strip(f.src)).filter((c) => carries(c.arg, names).length).map((c) => `${f.rel}:${c.at} ${carries(c.arg, names).join(',')}`) : []; }) }; };
  const real = holderCensus(files);
  ok(['digests', 'digest', 'line', 'm'].every((n) => real.all.has(n)) && real.hits.length === 0, `the admit's holders (${[...real.all].join(', ')}): no log or reply call of the interface carries one (${real.hits.length})`, real.hits);
  const RENAMED = "    const digest = digests.get(party);\n";
  const renamed = files.map((f) => (f.rel === 'src/interface/admission.js' ? { ...f, src: f.src.replace(RENAMED, RENAMED + "    const kept = digests.get(party);\n    console.error(\n      `[admission] ${kept}`);\n") } : f));
  const viaMain = files.map((f) => (f.rel === 'src/interface/main.js' ? { ...f, src: f.src.replace("    else if (m.op === 'admit') iface.admit(m);\n", "    else if (m.op === 'admit') { log.error?.(`[interface] the admit ${JSON.stringify(m)}`); iface.admit(m); }\n") } : f));
  const rn = holderCensus(renamed), vm = holderCensus(viaMain);
  ok(census(renamed).length === 0 && rn.hits.length === 1 && census(viaMain).length === 0 && vm.hits.length === 1, `RED CONTROLS — a log through a renamed holder across two lines (the word census finds ${census(renamed).length}, the holder census ${rn.hits.length}: ${rn.hits.join(' ')}); the whole admit line logged in main.js (${census(viaMain).length} / ${vm.hits.length}: ${vm.hits.join(' ')})`, { rn: rn.hits, vm: vm.hits });
}

lap('the end');
console.log(fail ? `\n${fail} FAILED, ${pass} passed` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
