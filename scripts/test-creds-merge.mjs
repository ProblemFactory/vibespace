#!/usr/bin/env node
// THE MERGE KEEPS THE SURVIVOR'S OTHER KEYS (lane creds-merge-keep-rest, B-5fc0 — oat-census-closure's LEFT item 4;
// CREDENTIAL CLASS). accounts.mergeSubscription folds a duplicate row's .credentials.json into the survivor's. The
// CLI's store is a bag of top-level keys (claudeAiOauth, mcpOAuth, designOauth …): before this lane only a survivor
// holding OUR long-lived-token file kept its other keys (verify r2 F3); a survivor holding a REAL CLI login file (a
// dead login with mcpOAuth beside it) was overwritten whole and archived nowhere. Now the merge asks account-material's
// PURE credsMergeVerdict and acts on it:
//   §1 PURE: the verdict, every branch a row
//   §2 THE TABLE over the real AccountManager (scratch data dirs): per row the survivor's file, its archive, the
//      folded login, the .claude.json; a RED control per row on a scratch copy (the pre-fix branch condition restored
//      for the rows this lane changed: the survivor's mcpOAuth is gone and no archive exists)
//   §3 THE SPIES: no token byte on any outbound path of a merge — console, stdout/stderr, the roster broadcast, the
//      merge's answer, the archive's name — and OUR token in no file; a planted leak per path is caught
// In-process, no network, no real CLI; token shapes built at runtime (never a literal).
import './scratch.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const Module = require('node:module');
const MAT = require(path.join(REPO, 'src/account-material.js'));
const LE = require(path.join(REPO, 'src/login-expiry.js'));
const { AccountManager } = require(path.join(REPO, 'src/accounts.js'));
let pass = 0, fail = 0;
const ok = (c, msg, extra) => { if (typeof c !== 'boolean') throw new TypeError(`ok: its condition is a ${typeof c}, not a boolean — the arguments are swapped, or a value stands where a comparison belongs`); if (c) { pass++; console.log('  ✓ ' + msg); } else { fail++; console.log('  ✗ ' + msg + (extra !== undefined ? ' — ' + JSON.stringify(extra).slice(0, 500) : '')); } };
const t0 = Date.now();
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-creds-merge-'));
const H = 3600e3, DAY = 24 * H, NOW = Date.now();

// ── fixtures: every secret is minted here and remembered (the spies look for each); a per-PROCESS part keeps a
// parallel copy's files out of this run's scans (lane oat-census-closure: a shared constant + a shared dir = a false red)
const RUN = crypto.randomBytes(4).toString('hex');
const SECRETS = [];
const secret = (s) => { SECRETS.push(s); return s; };
const tok = (kind, tag) => secret(['sk', '-ant-', kind, '01-'].join('') + tag + RUN + crypto.randomBytes(8).toString('hex'));
const OAT = tok('oat', 'CMoat_');
const SHAPE = { scopes: ['user:inference', 'user:profile', 'user:sessions:claude_code', 'user:mcp_servers'], subscriptionType: 'max' };
const login = ({ dead = false } = {}) => ({ claudeAiOauth: { accessToken: tok('oat', 'CMacc_'), refreshToken: tok('ort', 'CMref_'), expiresAt: NOW + (dead ? -2 * H : H), refreshTokenExpiresAt: NOW + (dead ? -H : 20 * DAY), ...SHAPE } });
const mcp = (tag) => ({ ['srv|' + tag]: { accessToken: secret('mcp-' + tag + '-' + RUN + crypto.randomBytes(6).toString('hex')), refreshToken: secret('mcpr-' + tag + '-' + RUN + crypto.randomBytes(6).toString('hex')) } });
const oursFor = (id) => ({ claudeAiOauth: { accessToken: OAT, expiresAt: NOW + 300 * DAY, ...SHAPE }, vibespaceOat: { v: 1, account: id, mintedAt: NOW } });
const tailOf = (s) => s.slice(-16); // the token's own random part (a prefix is shared by every token of a kind)
const has = (text, s) => text.includes(s) || text.includes(tailOf(s));
const J = (o) => Buffer.from(JSON.stringify(o));

// a scratch copy: account-material (and accounts) mutated in a tmp dir, accounts.js compiled with its requires repointed
const mutant = ({ mat = [], acc = [] } = {}) => {
  const patch = (rel, reps) => { let s = fs.readFileSync(path.join(REPO, rel), 'utf8'); for (const [a, b] of reps) { if (!s.includes(a)) return null; s = s.replace(a, b); } return s; };
  const matSrc = patch('src/account-material.js', mat), accSrc = patch('src/accounts.js', acc);
  if (matSrc == null || accSrc == null) return null;
  const dir = fs.mkdtempSync(path.join(tmp, 'mut-')), matP = path.join(dir, 'account-material.js');
  fs.writeFileSync(matP, matSrc);
  const file = path.join(REPO, 'src/accounts.js');
  const m = new Module(file, null); m.filename = file; m.paths = Module._nodeModulePaths(path.dirname(file));
  m._compile(accSrc.split("require('./account-material.js')").join(`require(${JSON.stringify(matP)})`), file);
  const mm = new Module(matP, null); mm.filename = matP; mm.paths = Module._nodeModulePaths(dir); mm._compile(matSrc, matP);
  return { AccountManager: m.exports.AccountManager, credsMergeVerdict: mm.exports.credsMergeVerdict };
};
const captureStd = () => {
  const got = [], keep = {};
  for (const k of ['log', 'error', 'warn', 'info', 'debug']) { keep[k] = console[k]; console[k] = (...a) => { got.push(a.map(String).join(' ')); }; }
  const w1 = process.stdout.write, w2 = process.stderr.write;
  process.stdout.write = (c) => { got.push(String(c)); return true; }; process.stderr.write = (c) => { got.push(String(c)); return true; };
  return () => { for (const k of Object.keys(keep)) console[k] = keep[k]; process.stdout.write = w1; process.stderr.write = w2; return got; };
};

console.log('§1 PURE — credsMergeVerdict, every branch a row');
{
  const V = (o) => MAT.credsMergeVerdict({ rest: LE.credsRestOf, ...o });
  const dead = login({ dead: true }), live = login(), fresh = login();
  const deadMcp = { ...dead, mcpOAuth: mcp('pd'), designOauth: { t: 'd' } };
  const oursMcp = { ...oursFor('sub-into'), mcpOAuth: mcp('po') };
  const rows = [
    ['no-fold-file', V({ intoFile: J(dead), fromFile: null }), (v) => !v.fold && !v.write && !v.archive],
    ['survivor-login (c)', V({ intoFile: J(live), intoLogged: true, fromFile: J(fresh) }), (v) => !v.fold && !v.write && !v.archive],
    ['fold-unparsed', V({ intoFile: J(dead), fromFile: Buffer.from('{"claudeAiOauth":') }), (v) => v.fold && !v.write && !v.archive],
    ['fold-ours-bare (a)', V({ intoFile: null, fromFile: J(oursFor('sub-from')), fromOurs: true }), (v) => v.fold && !v.write && !v.archive],
    ['fold-empty', V({ intoFile: J(deadMcp), intoLogged: true, preferFrom: true, fromFile: J({}) }), (v) => v.fold && !v.write && !v.archive],
    ['survivor-absent', V({ intoFile: null, fromFile: J(fresh) }), (v) => v.fold && JSON.stringify(v.write) === JSON.stringify(fresh) && !v.archive],
    ['fold-ours-rest (a)', V({ intoFile: null, fromFile: J({ ...oursFor('sub-from'), mcpOAuth: { a: 1 } }), fromOurs: true }), (v) => JSON.stringify(v.write) === '{"mcpOAuth":{"a":1}}'],
    ['survivor-unparsed (d)', V({ intoFile: Buffer.from([0x7b, 0xff, 0x00, 0x22]), fromFile: J(fresh) }), (v) => v.fold && JSON.stringify(v.write) === JSON.stringify(fresh) && v.archive && Buffer.compare(v.aside, Buffer.from([0x7b, 0xff, 0x00, 0x22])) === 0],
    ['survivor-ours (b)', V({ intoFile: J(oursMcp), intoOurs: true, fromFile: J(fresh) }), (v) => v.write.claudeAiOauth.accessToken === fresh.claudeAiOauth.accessToken && JSON.stringify(v.write.mcpOAuth) === JSON.stringify(oursMcp.mcpOAuth) && !('vibespaceOat' in v.write) && v.archive && !v.aside.includes(OAT) && JSON.parse(v.aside).mcpOAuth && v.keep.join() === 'mcpOAuth'],
    ['survivor-ours bare (b)', V({ intoFile: J(oursFor('sub-into')), intoOurs: true, fromFile: J(fresh) }), (v) => !v.archive && v.aside === null && v.keep.length === 0 && v.write.claudeAiOauth.refreshToken === fresh.claudeAiOauth.refreshToken],
    ['survivor-file (b, B-5fc0)', V({ intoFile: J(deadMcp), intoLogged: true, preferFrom: true, fromFile: J(fresh) }), (v) => v.write.claudeAiOauth.refreshToken === fresh.claudeAiOauth.refreshToken && JSON.stringify(v.write.mcpOAuth) === JSON.stringify(deadMcp.mcpOAuth) && v.write.designOauth.t === 'd' && v.archive && Buffer.compare(v.aside, J(deadMcp)) === 0 && v.keep.join() === 'mcpOAuth,designOauth'],
    ['survivor-file, no login (b)', V({ intoFile: J({ mcpOAuth: { k: 1 } }), fromFile: J(fresh) }), (v) => v.write.mcpOAuth.k === 1 && v.write.claudeAiOauth && v.archive],
    ['survivor-file, the fold\'s own key wins (b)', V({ intoFile: J(deadMcp), intoLogged: true, preferFrom: true, fromFile: J({ ...fresh, mcpOAuth: { mine: 1 } }) }), (v) => v.write.mcpOAuth.mine === 1 && v.archive && JSON.parse(String(v.aside)).mcpOAuth],
    ['survivor-file, another row\'s token file (b: archived whole, as the store archives a foreign mark)', V({ intoFile: J(oursFor('sub-other')), intoOurs: false, fromFile: J(fresh) }), (v) => v.archive && String(v.aside).includes(OAT) && v.why === 'survivor-file'],
  ];
  for (const [name, v, want] of rows) ok(verdictOf(want(v)), `${name} ⇒ ${v.why} · fold ${v.fold} · write ${v.write ? Object.keys(v.write).join('+') : 'none'} · archive ${v.archive ? (Buffer.isBuffer(v.aside) ? 'the file as read' : 'its other keys') : 'none'}`, { fold: v.fold, write: v.write && Object.keys(v.write), archive: v.archive, keep: v.keep });
  let threw = null; try { MAT.credsMergeVerdict({ intoFile: null, fromFile: J(fresh) }); } catch (e) { threw = e.code; }
  ok(threw === 'no-rest', 'no "other keys" question ⇒ refused by name (no-rest), never a guess', threw);
  const proto = MAT.credsMergeVerdict({ intoFile: Buffer.from('{"__proto__":{"p":1},"mcpOAuth":{"a":1},"claudeAiOauth":{"accessToken":"x","refreshToken":"y"}}'), intoLogged: true, preferFrom: true, fromFile: J(fresh), rest: LE.credsRestOf });
  ok(gateOf(Object.prototype.hasOwnProperty.call(proto.write, '__proto__')) && Object.getPrototypeOf(proto.write) === Object.prototype && gateOf(JSON.stringify(proto.write).startsWith('{"__proto__":{"p":1},"mcpOAuth"')) && ({}).p === undefined, 'a survivor\'s top-level "__proto__" key (JSON.parse makes it OWN) is kept as an own data key — no prototype set, nothing polluted', JSON.stringify(proto.write).slice(0, 60));
}

console.log('§2 THE TABLE — the real AccountManager, a RED control per row on a scratch copy');
let k = 0;
const credsOf = (am, id) => path.join(am.subDir(id), '.credentials.json');
const cfgOf = (am, id) => path.join(am.subDir(id), '.claude.json');
const readB = (p) => { try { return fs.readFileSync(p); } catch { return null; } };
const readJ = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } };
const archivesOf = (dir) => { let n = []; try { n = fs.readdirSync(dir); } catch { } return n.filter((f) => /^\.credentials\.json\.dead-/.test(f)).map((f) => ({ name: f, bytes: fs.readFileSync(path.join(dir, f)), mode: fs.statSync(path.join(dir, f)).mode & 0o777 })); };
const filesUnder = (d) => { const out = []; (function scan(x) { let n = []; try { n = fs.readdirSync(x); } catch { } for (const f of n) { const p = path.join(x, f); let st; try { st = fs.lstatSync(p); } catch { continue; } if (st.isDirectory()) scan(p); else if (st.isFile()) out.push(p); } })(d); return out; };
// one merge: the fixtures written, the merge run under the spies, every fact the legs judge returned
const runMerge = (M, row) => {
  const dataDir = path.join(tmp, 'r' + (++k), 'data');
  const casts = [];
  const am = new M.AccountManager({ dataDir, onChange: (l) => casts.push(JSON.stringify(l)) });
  const into = am.createSubscription({ name: 'Into' }).id, from = am.createSubscription({ name: 'From' }).id;
  am.setEmail(into, 's@example.com'); am.setEmail(from, 's@example.com');
  const put = (p, b) => { if (b != null) fs.writeFileSync(p, Buffer.isBuffer(b) ? b : J(b), { mode: 0o600 }); };
  const intoB = typeof row.into === 'function' ? row.into(into) : row.into, fromB = typeof row.from === 'function' ? row.from(from) : row.from;
  put(credsOf(am, into), intoB); put(credsOf(am, from), fromB);
  fs.writeFileSync(cfgOf(am, into), JSON.stringify({ oauthAccount: { emailAddress: 's@example.com', tag: 'into' } })); fs.writeFileSync(cfgOf(am, from), JSON.stringify({ oauthAccount: { emailAddress: 's@example.com', tag: 'from' } }));
  const before = readB(credsOf(am, into));
  casts.length = 0;
  const std = captureStd(); let ret = null, err = null, out; const un = row.at ? row.at(am, into, from) : null;   // r2822: a write placed AT a point of the merge
  const facts = {};   // r2928 (4): the merge's own facts (the login route's reply)
  try { ret = am.mergeSubscription(from, into, { preferFromCreds: !!row.preferFrom, liveAccountIds: new Set(row.live ? [into] : []), facts }); } catch (e) { err = e; } finally { if (un) un(); out = std(); }
  const file = readB(credsOf(am, into));
  return { am, into, from, before, file, fileJ: readJ(credsOf(am, into)), arch: archivesOf(am.subDir(into)), cfgTag: readJ(cfgOf(am, into))?.oauthAccount?.tag, fromGone: !fs.existsSync(am.subDir(from)), rowGone: !am.list().accounts.some((a) => a.id === from), casts, out, ret, err, intoB, fromB, dataDir, facts, fromDir: am.subDir(from) };
};
const same = (a, b) => a != null && b != null && Buffer.compare(a, b) === 0;
const mcpOf = (o) => JSON.stringify(o && o.mcpOAuth);
// THE ROWS: the fixtures, what the leg asks, the RED control (a scratch copy) and what the control must break
const PREFIX = [['  const keeps = intoFile != null;', '  const keeps = intoFile != null && intoOurs;']]; // the pre-fix branch condition: kept + archived only when OURS
const ROWS = [
  { name: 'survivor-file (B-5fc0): a re-login folded onto a survivor holding a DEAD real login + mcpOAuth', fixed: true,
    into: () => ({ ...login({ dead: true }), mcpOAuth: mcp('s1'), designOauth: { t: 'd1' } }), from: () => login(), preferFrom: true,
    want: (r) => r.fileJ?.claudeAiOauth?.refreshToken === r.fromB.claudeAiOauth.refreshToken && mcpOf(r.fileJ) === mcpOf(r.intoB) && r.fileJ?.designOauth?.t === 'd1' && r.arch.length === 1 && same(r.arch[0].bytes, r.before),
    after: 'the folded login over mcpOAuth + designOauth; the old file archived as read', control: PREFIX },
  { name: 'survivor-file, no login in it (a logged-out CLI file: mcpOAuth only) — the auto-merge', fixed: true,
    into: () => ({ mcpOAuth: mcp('s2') }), from: () => login(), preferFrom: false,
    want: (r) => !!r.fileJ?.claudeAiOauth?.refreshToken && mcpOf(r.fileJ) === mcpOf(r.intoB) && r.arch.length === 1 && same(r.arch[0].bytes, r.before),
    after: 'the folded login over mcpOAuth; the old file archived as read', control: PREFIX },
  { name: 'survivor-file, the fold brings its OWN mcpOAuth', fixed: true,
    into: () => ({ ...login({ dead: true }), mcpOAuth: mcp('s3') }), from: () => ({ ...login(), mcpOAuth: mcp('f3') }), preferFrom: true,
    want: (r) => mcpOf(r.fileJ) === mcpOf(r.fromB) && r.arch.length === 1 && mcpOf(JSON.parse(r.arch[0].bytes)) === mcpOf(r.intoB),
    after: 'the fold\'s mcpOAuth wins the key; the survivor\'s rests in the archive', control: PREFIX },
  { name: 'survivor-unparsed (d): a survivor file that does not parse', fixed: true,
    into: Buffer.concat([Buffer.from('{"mcpOAuth":'), Buffer.from([0xff, 0xfe, 0x00]), Buffer.from(' half')]), from: () => login(), preferFrom: false,
    want: (r) => !!r.fileJ?.claudeAiOauth?.refreshToken && r.arch.length === 1 && same(r.arch[0].bytes, r.before),
    after: 'archived byte-for-byte as it was, the fold goes on', control: PREFIX },
  { name: 'survivor-ours (b, verify r2 F3): a survivor holding OUR token file + mcpOAuth',
    into: (id) => ({ ...oursFor(id), mcpOAuth: mcp('s5'), designOauth: { t: 'd5' } }), from: () => login(), preferFrom: false,
    want: (r) => !!r.fileJ?.claudeAiOauth?.refreshToken && mcpOf(r.fileJ) === mcpOf(r.intoB) && !('vibespaceOat' in (r.fileJ || {})) && r.arch.length === 1 && !r.arch[0].bytes.toString('latin1').includes(OAT) && mcpOf(JSON.parse(r.arch[0].bytes)) === mcpOf(r.intoB) && !JSON.parse(r.arch[0].bytes).claudeAiOauth,
    after: 'the folded login over the CLI\'s keys; ONLY those keys archived (our token in no archive)',
    control: [['  const keeps = intoFile != null;', '  const keeps = false;']], also: [['  const aside = intoOurs ? (keep.length ? JSON.stringify(kept) : null) : intoFile;', '  const aside = intoFile;']] },
  { name: 'survivor-login (c): a LIVE real login on the survivor, the auto-merge',
    into: () => ({ ...login(), mcpOAuth: mcp('s6') }), from: () => login(), preferFrom: false,
    want: (r) => same(r.file, r.before) && r.arch.length === 0 && r.cfgTag === 'into' && r.fromGone,
    after: 'nothing written, nothing archived (the folded row\'s dir goes)', control: [["  if (intoLogged && !preferFrom) return none(false, 'survivor-login');", '']] },
  { name: 'fold-ours-bare (a): the merged-away row holds OUR token file, nothing else',
    into: null, from: (id) => oursFor(id), preferFrom: false,
    want: (r) => r.file === null && !filesUnder(r.dataDir).some((p) => fs.readFileSync(p, 'latin1').includes(OAT)) && r.cfgTag === 'from',
    after: 'our file never copied (the survivor\'s sync re-derives it from the moved token)', control: [['  const folded = fromOurs ? rest(fromObj) : fromObj;', '  const folded = fromObj;']] },
  { name: 'fold-ours-rest (a): OUR token file + mcpOAuth on the merged-away row',
    into: null, from: (id) => ({ ...oursFor(id), mcpOAuth: mcp('f8') }), preferFrom: false,
    want: (r) => r.fileJ && JSON.stringify(Object.keys(r.fileJ)) === '["mcpOAuth"]' && mcpOf(r.fileJ) === mcpOf(r.fromB) && !filesUnder(r.dataDir).some((p) => fs.readFileSync(p, 'latin1').includes(OAT)),
    after: 'only the CLI\'s keys travel', control: [['  const folded = fromOurs ? rest(fromObj) : fromObj;', '  const folded = fromObj;']] },
  { name: 'survivor-absent: the survivor has no file',
    into: null, from: () => login(), preferFrom: false,
    want: (r) => r.fileJ?.claudeAiOauth?.refreshToken === r.fromB.claudeAiOauth.refreshToken && r.arch.length === 0 && r.cfgTag === 'from' && r.fromGone,
    after: 'the folded login written, nothing to archive', control: [["  if (!keeps) return { fold: true, write: folded, archive: false, aside: null, keep: [], why: 'survivor-absent' };", "  if (!keeps) return none(true, 'survivor-absent');"]] },   // r2928: the rule broken (an absent survivor gets nothing) — the old cut was red only by the pre-swap archive's crash on null bytes
  { name: 'fold-unparsed: the merged-away row\'s file does not parse',
    into: () => ({ ...login({ dead: true }), mcpOAuth: mcp('s10') }), from: Buffer.from('{"claudeAiOauth":{"acc'), preferFrom: true,
    want: (r) => same(r.file, r.before) && r.arch.length === 0 && r.cfgTag === 'from' && r.fromGone,
    after: 'the survivor\'s file stays (bytes that are no credentials object replace nothing); the .claude.json still comes',
    control: [["  if (!fromObj) return none(true, 'fold-unparsed');", "  if (!fromObj) return { fold: true, write: {}, archive: false, aside: null, keep: [], why: 'pre-fix copy' };"]] },
  { name: 'fold-empty: the merged-away row\'s file is an empty object (a re-login)',
    into: () => ({ ...login({ dead: true }), mcpOAuth: mcp('s11') }), from: {}, preferFrom: true,
    want: (r) => same(r.file, r.before) && r.arch.length === 0,
    after: 'nothing written over the survivor', control: [["  if (!Object.keys(folded).length) return none(true, fromOurs ? 'fold-ours-bare' : 'fold-empty');", '']] },
  { name: 'no-fold-file: the merged-away row has no credentials file',
    into: () => ({ ...login({ dead: true }), mcpOAuth: mcp('s12') }), from: null, preferFrom: true,
    want: (r) => same(r.file, r.before) && r.arch.length === 0 && r.cfgTag === 'into' && r.fromGone,
    after: 'nothing folded — not the .claude.json either', control: [["  if (fromFile == null) return none(false, 'no-fold-file');", '']] },
];
const TABLE = [];
for (const row of ROWS) {
  const r = runMerge({ AccountManager }, row);
  const good = !r.err && row.want(r);
  ok(verdictOf(good), `${row.name} ⇒ ${row.after}`, { err: r.err && r.err.message, file: r.fileJ && Object.keys(r.fileJ), arch: r.arch.map((a) => a.name.replace(/\d{13}/, '<ms>')), cfg: r.cfgTag, fromGone: r.fromGone });
  const M = mutant({ mat: row.control });
  const rc = M ? runMerge(M, row) : null;
  const red = !!rc && !(!rc.err && row.want(rc));
  // what the control LOST: the survivor's old bytes (its mcpOAuth's token — or the unparsed file itself) in no file and no archive
  const survivorIn = (x) => { const bufs = [x.file, ...x.arch.map((a) => a.bytes)].filter(Boolean); if (Buffer.isBuffer(x.intoB)) return bufs.some((b) => same(b, x.before)); const t = Object.values(x.intoB.mcpOAuth)[0].accessToken; return bufs.some((b) => b.toString('latin1').includes(t)); };
  const lost = rc && row.fixed ? { mcpGone: !survivorIn(rc), archives: rc.arch.length } : null;
  ok(gateOf(red) && (!row.fixed || (gateOf(lost.mcpGone) && lost.archives === 0)), `RED control (${row.fixed ? 'the pre-fix branch condition restored' : 'the row\'s rule cut'} on a scratch copy) ⇒ ${row.fixed ? (Buffer.isBuffer(row.into) ? 'the unparsed file is gone and no archive exists' : 'the survivor\'s mcpOAuth is gone and no archive exists') : 'the leg above goes red'}`, rc && { file: rc.fileJ && Object.keys(rc.fileJ), arch: rc.arch.length, cfg: rc.cfgTag, err: rc.err && rc.err.message, lost });
  if (row.also) {
    const M2 = mutant({ mat: row.also }), r2 = M2 ? runMerge(M2, row) : null;
    ok(!!r2 && !row.want(r2) && verdictOf(r2.arch.some((a) => a.bytes.toString('latin1').includes(OAT))), 'RED control (the archive takes OUR file as read) ⇒ our token rests in the archive — the leg above catches it', r2 && r2.arch.length);
  }
  TABLE.push({ row: row.name.split(':')[0], after: good ? 'ok' : 'RED', control: red ? 'RED' : 'green(!)' , archive: r.arch.map((a) => a.name.replace(/\d{13}/, '<ms>').replace(/m[0-9a-f]{6}$/, 'm<hex>') + ' ' + a.mode.toString(8)).join(' ') || '—' });
}
for (const t of TABLE) console.log(`    · ${t.row} · after ${t.after} · control ${t.control} · archive ${t.archive}`);
{
  const r = runMerge({ AccountManager }, ROWS[0]);
  ok(r.arch.length === 1 && gateOf(/^\.credentials\.json\.dead-\d{13}-a[0-9a-f]{8}$/.test(r.arch[0].name)) && r.arch[0].mode === 0o600 && (fs.statSync(credsOf(r.am, r.into)).mode & 0o777) === 0o600, 'the archive: `.credentials.json.dead-<ms>-a<8 hex>` beside the file, 0600 — the swap\'s own aside, settled as the verdict says (r2928: nothing is archived before the verdict); the new file 0600', r.arch.map((a) => [a.name, a.mode.toString(8)]));
  ok(gateOf(r.rowGone) && verdictOf(r.fromGone), 'the merged-away row and its dir are gone after the fold', { rowGone: r.rowGone, fromGone: r.fromGone });
}
{
  const r = runMerge({ AccountManager }, { ...ROWS[0], live: true });
  ok(gateOf(r.err) && r.err.code === 'merge-account-live' && gateOf(same(r.file, r.before)) && r.arch.length === 0 && !r.fromGone, 'the live guard (B-3f8a) is unchanged: a running session on either side ⇒ refused (merge-account-live), not one byte moved', { code: r.err && r.err.code, arch: r.arch.length });
}

console.log('§2b r2822 — THE SURVIVOR REFRESHED AT THE POINT: its fresh file stands, the folded row\'s file archived beside it, said once');
{
  // the vendor's program writes the survivor's file AT a point of the merge's swap (a hook on the very call, never a race): right
  // before the guard moves the name aside (a refresh in place), or right before ours goes into the empty name (a sign-in landing)
  const hookOf = (k, test, act) => { const k0 = fs[k]; fs[k] = function (...a) { if (test(...a)) act(...a); return k0.apply(this, a); }; return () => { fs[k] = k0; }; };
  const scene = (M, row, { at, linkless = false, linkErr = linkless ? 'EPERM' : null, widen = false, foldRenameErr = null, foldRewrite = null, openErr = null }) => {
    const fresh = login(), freshB = J(fresh); let landed = false;
    const r = runMerge(M, { ...row, at: (am, into, from) => {
      const p = credsOf(am, into);
      const un = [at === 'aside'
        ? hookOf('renameSync', (s0, d) => !landed && String(s0) === p && /\.dead-\d+-a/.test(String(d)), (s0) => { landed = true; fs.writeFileSync(s0, freshB); if (widen) fs.chmodSync(s0, 0o644); })
        // r2928 (5): the survivor's file GONE right at the move aside (the hub's own take-back, off the loop)
        : at === 'gone' ? hookOf('renameSync', (s0, d) => !landed && String(s0) === p && /\.dead-\d+-a/.test(String(d)), (s0) => { landed = true; fs.unlinkSync(s0); })
        : at === 'link' ? hookOf('linkSync', (s0, d) => !landed && String(d) === p && /\.tmp$/.test(String(s0)), (s0, d) => { landed = true; fs.writeFileSync(d, freshB, { mode: 0o600 }); if (foldRewrite) fs.writeFileSync(path.join(am.subDir(from), '.credentials.json'), foldRewrite); })
        : () => { }];
      // …and the RELEASE's write point (its plain rename of the tmp onto the name), where a red control's copy writes: the same moment
      un.push(hookOf('renameSync', (s0, d) => !landed && String(d) === p && /\.tmp$/.test(String(s0)), (s0, d) => { landed = true; fs.writeFileSync(d, freshB, { mode: 0o600 }); }));
      if (linkErr) { const l0 = fs.linkSync; fs.linkSync = function () { throw Object.assign(new Error(linkErr + ': a stand-in'), { code: linkErr }); }; un.push(() => { fs.linkSync = l0; }); }
      // r3042: an open for write refused (a file's tmp, chosen by its path) — the settle's cut, the settings file's write
      if (openErr) { const o0 = fs.openSync; fs.openSync = function (q, ...a) { if (openErr.test(String(q)) && /\.tmp$/.test(String(q))) throw Object.assign(new Error('ENOSPC: a stand-in'), { code: 'ENOSPC' }); return o0.call(this, q, ...a); }; un.push(() => { fs.openSync = o0; }); }
      // r2928 (3): the rename of the FOLDED row's file aside fails (its own folder)
      if (foldRenameErr) { const fc = path.join(am.subDir(from), '.credentials.json'), r0 = fs.renameSync; fs.renameSync = function (s0, ...a) { if (String(s0) === fc) throw Object.assign(new Error(foldRenameErr + ': a stand-in'), { code: foldRenameErr }); return r0.call(this, s0, ...a); }; un.push(() => { fs.renameSync = r0; }); }
      return () => { for (const u of un.reverse()) u(); };
    } });
    const fromBytes = Buffer.isBuffer(r.fromB) ? r.fromB : J(r.fromB);
    return { landed, stands: same(r.file, freshB), dupArchived: r.arch.some((a) => same(a.bytes, fromBytes)), asideLeft: r.arch.filter((a) => /-a[0-9a-f]{8}$/.test(a.name)).length, cfg: r.cfgTag, fromGone: r.fromGone, rowGone: r.rowGone, err: r.err && r.err.message,
      mode: (() => { try { return fs.statSync(credsOf(r.am, r.into)).mode & 0o777; } catch { return null; } })(), restsSaid: r.out.filter((l) => l.includes('Into') && /could not go back to its name/.test(l)).length,
      said: r.out.filter((l) => l.includes('Into') && /changed or went since the merge read it/.test(l)).length, leaks: SECRETS.filter((x) => has(r.out.join('\n'), x)).length,
      oursInFile: filesUnder(r.dataDir).some((q) => fs.readFileSync(q, 'latin1').includes(OAT)), arch: r.arch.map((a) => ({ name: a.name, mcp: (() => { try { return mcpOf(JSON.parse(a.bytes)); } catch { return null; } })(), bytes: a.bytes })),
      fileB: r.file, before: r.before, intoB: r.intoB, fromB: r.fromB, facts: r.facts, fromLeft: fs.existsSync(path.join(r.fromDir, '.credentials.json')),
      keptSaid: r.out.filter((l) => l.includes('Into') && /could not be moved beside it/.test(l)).length, out: r.out };
  };
  const GUARD = "guard = creds ? { expectBytes: intoBytes, asideAs: v.archive ? v.aside : null } : {}";
  const mNoGuard = mutant({ acc: [[GUARD, 'guard = {}']] });
  const S1 = scene({ AccountManager }, ROWS[0], { at: 'aside' });
  ok(gateOf(S1.landed) && gateOf(S1.stands) && gateOf(S1.dupArchived) && S1.cfg === 'into' && gateOf(S1.fromGone) && gateOf(S1.rowGone) && S1.said === 1 && S1.leaks === 0 && !S1.err, 'r2822: the survivor\'s login REFRESHED right before the merge moves its file aside — the fresh file STANDS (and its .claude.json), the folded row\'s file is archived beside it, the rows still fold, said ONCE by the member\'s name with no token', S1);
  const S1X = mNoGuard ? scene(mNoGuard, ROWS[0], { at: 'aside' }) : null;
  ok(!!S1X && gateOf(S1X.landed) && !S1X.stands, 'RED control (the merge\'s guard cut: the plain rename it had) ⇒ the refreshed login is written over (red)', S1X);
  const S2 = scene({ AccountManager }, ROWS.find((r) => r.name.startsWith('survivor-absent')), { at: 'link' });
  ok(gateOf(S2.landed) && gateOf(S2.stands) && gateOf(S2.dupArchived) && S2.said === 1 && !S2.err, 'r2822: the survivor had NO file at the read and a sign-in lands in the empty name right before ours goes in — it stays, the folded row\'s file archived beside it, said once', S2);
  const S2X = mNoGuard ? scene(mNoGuard, ROWS.find((r) => r.name.startsWith('survivor-absent')), { at: 'link' }) : null;
  ok(!!S2X && gateOf(S2X.landed) && !S2X.stands, 'RED control (the guard cut) ⇒ the sign-in that landed is renamed over (red)', S2X);
  const S3 = scene({ AccountManager }, ROWS[0], { at: 'aside', linkless: true, widen: true });
  ok(gateOf(S3.landed) && gateOf(S3.stands) && S3.asideLeft === 0 && gateOf(S3.dupArchived) && S3.mode === 0o600 && !S3.err, 'r2822 with NO hard links (link EPERM): the put-back copies the refreshed file (0644) back into its empty name (an exclusive copy, then 0600) — it stands at its name, no aside left', S3);
  const PUT = "    else if (LINKLESS.includes(e && e.code)) { try { back = copyIntoSync(aside, p); taken = !back; } catch { } }\n";
  const mPut = mutant({ mat: [[PUT, '']] });
  const S3X = mPut ? scene(mPut, ROWS[0], { at: 'aside', linkless: true }) : null;
  ok(!!S3X && !S3X.stands && S3X.asideLeft === 1, 'RED control (the sync put-back\'s copy cut) ⇒ the refreshed file rests at a .dead name and its own name is empty (red)', S3X);
  const mMode = mutant({ mat: [['  try { fs.fchmodSync(fd, 0o600); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }', '  try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }']] });
  const S3M = mMode ? scene(mMode, ROWS[0], { at: 'aside', linkless: true, widen: true }) : null;
  ok(!!S3M && gateOf(S3M.stands) && S3M.mode === 0o644, 'RED control (the sync copy\'s mode line cut) ⇒ the copy back keeps the source\'s 0644 (red)', S3M);
  // r2824 (1): a put-back that FAILS (link EIO, outside the no-hard-link list): the fresher file rests archived, its name empty — said so
  const S4 = scene({ AccountManager }, ROWS[0], { at: 'aside', linkErr: 'EIO' });
  ok(gateOf(S4.landed) && !S4.stands && S4.asideLeft === 1 && gateOf(S4.dupArchived) && S4.restsSaid === 1 && S4.said === 0 && S4.leaks === 0 && !S4.err, 'r2824: the merge\'s put-back FAILS (link EIO) — the refreshed file rests archived, its name empty, the folded row\'s file archived beside it; said THAT by the member\'s name, not «what is there stands»', S4);
  const mKept = mutant({ mat: [["if (pb === 'kept') e.restsArchived = true; return e; };", 'return e; };']] });   // the refusal helper's own mark
  const S4X = mKept ? scene(mKept, ROWS[0], { at: 'aside', linkErr: 'EIO' }) : null;
  ok(!!S4X && S4X.restsSaid === 0 && S4X.said === 1, 'RED control (the kept put-back not marked) ⇒ «what is there stands» said over an empty name (red)', S4X);
  // ── r2928 ──
  const OURS_ROW = ROWS.find((r) => r.name.startsWith('survivor-ours')), FOLD_OURS = ROWS.find((r) => r.name.startsWith('fold-ours-rest'));
  // (5) a survivor that HAD a file, moved aside UNCHANGED, then a sign-in lands in its name before ours: it stays; the survivor's
  // old file is its archive (a sign-in, whole); the folded file archived beside it; said once
  const T1 = scene({ AccountManager }, ROWS[0], { at: 'link' });
  ok(gateOf(T1.landed) && gateOf(T1.stands) && gateOf(T1.arch.some((a) => same(a.bytes, T1.before))) && gateOf(T1.dupArchived) && T1.said === 1 && !T1.err, 'r2928: a survivor moved aside UNCHANGED, then a sign-in lands in its empty name before ours — the sign-in stays, the survivor\'s old file rests whole as its archive, the folded file archived beside it, said once', { ...T1, arch: T1.arch.map((a) => a.name) });
  const T1X = mNoGuard ? scene(mNoGuard, ROWS[0], { at: 'link' }) : null;
  ok(!!T1X && gateOf(T1X.landed) && !T1X.stands, 'RED control (the guard cut) ⇒ the sign-in that landed is written over (red)', T1X && { landed: T1X.landed, stands: T1X.stands });
  // (1) THE LAW on the merge's taken branch: the survivor's file was OURS — its aside keeps the CLI's keys alone, our token is not kept
  const T2 = scene({ AccountManager }, OURS_ROW, { at: 'link' });
  ok(gateOf(T2.landed) && gateOf(T2.stands) && !T2.oursInFile && gateOf(T2.arch.some((a) => a.mcp === mcpOf(T2.intoB))) && T2.said === 1 && !T2.err, 'r2928 THE LAW (the merge\'s taken branch): the survivor held OUR token file + its CLI keys and a sign-in took the name — the aside keeps the CLI keys alone; our token rests in NO file (the hub writes ours again)', { stands: T2.stands, ours: T2.oursInFile, arch: T2.arch.map((a) => a.name) });
  const mT2 = mutant({ acc: [[GUARD, 'guard = creds ? { expectBytes: intoBytes } : {}']] });
  const T2X = mT2 ? scene(mT2, OURS_ROW, { at: 'link' }) : null;
  ok(!!T2X && gateOf(T2X.landed) && verdictOf(T2X.oursInFile), 'RED control (the merge\'s verdict not handed to the swap: the aside kept whole) ⇒ our token rests in an archive (red)', T2X && { ours: T2X.oursInFile });
  // (1) THE LAW on the stood path: the FOLDED row's file is ours + its CLI keys — the archive beside the survivor keeps those keys alone
  const T3 = scene({ AccountManager }, FOLD_OURS, { at: 'link' });
  ok(gateOf(T3.landed) && gateOf(T3.stands) && !T3.oursInFile && gateOf(T3.arch.some((a) => a.mcp === mcpOf(T3.fromB))) && gateOf(T3.fromGone) && !T3.err, 'r2928 THE LAW (the stood path): the folded row held OUR token file + its CLI keys — beside the survivor only those keys rest; our token in no file', { stands: T3.stands, ours: T3.oursInFile, arch: T3.arch.map((a) => a.name) });
  const mT3 = mutant({ acc: [['try { if (!fromOurs) fs.renameSync(fc, arch);', 'try { if (true) fs.renameSync(fc, arch);']] });
  const T3X = mT3 ? scene(mT3, FOLD_OURS, { at: 'link' }) : null;
  ok(!!T3X && gateOf(T3X.landed) && verdictOf(T3X.oursInFile), 'RED control (the folded file archived whole whatever it holds) ⇒ our token rests in an archive (red)', T3X && { ours: T3X.oursInFile });
  // (2) THE SWAP's OWN LINK-IN ERROR (EIO, not the no-hard-link list), the put-back failing too: the survivor's name is EMPTY — said
  // by the member's name, the read file rests archived, the folded file beside it; the reply's fact says 'archived'
  const T4 = scene({ AccountManager }, ROWS[0], { at: 'none', linkErr: 'EIO' });
  ok(T4.fileB === null && gateOf(T4.arch.some((a) => same(a.bytes, T4.before))) && gateOf(T4.dupArchived) && T4.restsSaid === 1 && gateOf(T4.facts.stood) && T4.facts.stood.why === 'archived' && T4.facts.stood.code === 'EIO' && !T4.err, 'r2928: the swap\'s own link-in fails (EIO) and so does the put-back — its name is empty, said by the member\'s name; the read file rests archived, the folded file beside it; the reply\'s fact: archived (EIO)', { file: T4.fileB === null, restsSaid: T4.restsSaid, facts: T4.facts, arch: T4.arch.map((a) => a.name) });
  const mT4 = mutant({ mat: [["if (pb === 'kept') e.restsArchived = true; if (pb === 'taken') e.taken = true; return e; };", 'return e; };']] });
  const T4X = mT4 ? scene(mT4, ROWS[0], { at: 'none', linkErr: 'EIO' }) : null;
  ok(!!T4X && T4X.restsSaid === 0, 'RED control (the link-in road\'s put-back reply dropped) ⇒ nothing says the name is empty (red)', T4X && { restsSaid: T4X.restsSaid, facts: T4X.facts });
  // (3) THE FOLDED LOGIN NEVER LOST: on a stood merge the rename of the folded row's file aside fails — its folder is kept, said by name
  const T5 = scene({ AccountManager }, ROWS[0], { at: 'aside', foldRenameErr: 'EACCES' });
  ok(gateOf(T5.landed) && gateOf(T5.stands) && !T5.fromGone && gateOf(T5.fromLeft) && T5.keptSaid === 1 && !T5.err, 'r2928: on a stood merge the folded row\'s file cannot be moved aside (EACCES) — its folder is KEPT with its sign-in, said by the member\'s name', { fromGone: T5.fromGone, fromLeft: T5.fromLeft, keptSaid: T5.keptSaid });
  const mT5 = mutant({ acc: [['      if (foldKept || (moved && moved.left)) console.log(', '      if (false) console.log(']] });
  const T5X = mT5 ? scene(mT5, ROWS[0], { at: 'aside', foldRenameErr: 'EACCES' }) : null;
  ok(!!T5X && gateOf(T5X.fromGone) && !T5X.fromLeft, 'RED control (the folder removed anyway) ⇒ the folded sign-in is gone with its folder (red)', T5X && { fromGone: T5X.fromGone });
  // (5) THE SURVIVOR's FILE GONE at the move aside: the folded login goes into the EMPTY name (link(2) still refuses a sign-in there)
  const T6 = scene({ AccountManager }, ROWS[0], { at: 'gone' });
  ok(gateOf(T6.landed) && !!T6.fileB && JSON.parse(T6.fileB).claudeAiOauth?.refreshToken === T6.fromB.claudeAiOauth.refreshToken && T6.said === 0 && !T6.facts.stood && !T6.err, 'r2928: the survivor\'s file GONE right at the move aside — the folded login is placed in the empty name (nothing replaced), nothing refused', { file: !!T6.fileB, facts: T6.facts });
  const mT6 = mutant({ mat: [["    try { fs.renameSync(dest, aside); } catch (e) { if (e.code !== 'ENOENT') throw e; aside = null; }", "    try { fs.renameSync(dest, aside); } catch (e) { throw e.code === 'ENOENT' ? changed() : e; }"]] });
  const T6X = mT6 ? scene(mT6, ROWS[0], { at: 'gone' }) : null;
  ok(!!T6X && gateOf(T6X.landed) && T6X.fileB === null, 'RED control (a gone file refused «changed», as 28a80bead did) ⇒ the survivor\'s name stays EMPTY and the person\'s new sign-in rests archived (red)', T6X && { file: T6X.fileB === null });
  // (4) the reply's fact: a stood guard is in the merge's facts (the login route puts it in its answer; the dialog says it)
  ok(gateOf(S1.facts) && gateOf(S1.facts.stood) && S1.facts.stood.why === 'changed' && S1.facts.stood.code === 'changed', 'r2928: a guard that STOOD is a fact of the merge for the login route\'s reply (why changed)', S1.facts);
  const mF = mutant({ acc: [['          if (facts) facts.stood =', '          if (false) facts.stood =']] });
  const S1F = mF ? scene(mF, ROWS[0], { at: 'aside' }) : null;
  ok(!!S1F && gateOf(S1F.landed) && !S1F.facts.stood, 'RED control (the fact not set) ⇒ the reply would say «merged» alone (red)', S1F && S1F.facts);
  // ── r3042, the last smalls ──
  const said = (x, re) => x.out.filter((l) => l.includes('Into') && re.test(l)).length;
  // (1) the survivor held OUR token alone (no CLI keys): a failed link-in's aside is REMOVED — said as removed, never «rests archived»
  const OURS_ALONE = { name: 'survivor-ours-alone', into: (id) => oursFor(id), from: () => login(), preferFrom: false };
  const U1 = scene({ AccountManager }, OURS_ALONE, { at: 'none', linkErr: 'EIO' });
  ok(U1.restsSaid === 1 && said(U1, /it held our token alone, which is not kept/) === 1 && said(U1, /it rests archived in its folder/) === 0 && !U1.oursInFile && gateOf(U1.facts.stood) && U1.facts.stood.why === 'archived', 'r3042 (1): the survivor held OUR token alone and the link-in failed — the aside is removed and the journal says THAT (never «rests archived»); our token in no file', { out: U1.out, ours: U1.oursInFile });
  const mU1 = mutant({ acc: [["const rests = stood.asideSettled === 'removed' ?", 'const rests = false ?']] });
  const U1X = mU1 ? scene(mU1, OURS_ALONE, { at: 'none', linkErr: 'EIO' }) : null;
  ok(!!U1X && said(U1X, /it rests archived in its folder/) === 1, 'RED control (the words not picked by what became of it) ⇒ «rests archived» over a removed file (red)', U1X && U1X.out);
  // (2) the aside's cut to its CLI keys FAILS (ENOSPC on its rewrite): our token stays in the archive — said by the member's name
  const U2 = scene({ AccountManager }, OURS_ROW, { at: 'link', openErr: /\.dead-\d+-a[0-9a-f]{8}\./ });
  ok(gateOf(U2.landed) && gateOf(U2.stands) && said(U2, /could not be cut to the CLI's keys or removed — it still holds our token/) === 1, 'r3042 (2): the aside\'s cut to its CLI keys fails — our token still rests in it, and the journal says so by the member\'s name (never silent)', { out: U2.out });
  const mU2 = mutant({ acc: [["const oursLeft = () => { if (oursSaid) return; oursSaid = true; console.log(", "const oursLeft = () => { if (oursSaid) return; oursSaid = true; (() => { })("]] });
  const U2X = mU2 ? scene(mU2, OURS_ROW, { at: 'link', openErr: /\.dead-\d+-a[0-9a-f]{8}\./ }) : null;
  ok(!!U2X && gateOf(U2X.landed) && said(U2X, /still holds our token/) === 0, 'RED control (the cut\'s failure swallowed) ⇒ nothing says our token rests in an archive (red)', U2X && U2X.out);
  // (3) the folded file asked «ours?» AGAIN as it is now: a vendor sign-in written over our token file since the first read is KEPT whole
  const vendor = login(), vendorB = J(vendor);
  const U3 = scene({ AccountManager }, FOLD_OURS, { at: 'link', foldRewrite: vendorB });
  ok(gateOf(U3.landed) && gateOf(U3.stands) && gateOf(U3.arch.some((x) => same(x.bytes, vendorB))) && !U3.err, 'r3042 (3): the folded row\'s file became a vendor sign-in after the merge\'s first read — asked again, it is archived WHOLE beside the survivor (never removed with the folder)', { arch: U3.arch.map((x) => x.name) });
  const mU3 = mutant({ acc: [['let fromNow = fromObj; try { fromNow = parsed(fs.readFileSync(fc)); } catch { }', 'let fromNow = fromObj;']] });
  const U3X = mU3 ? scene(mU3, FOLD_OURS, { at: 'link', foldRewrite: vendorB }) : null;
  ok(!!U3X && gateOf(U3X.landed) && !U3X.arch.some((x) => same(x.bytes, vendorB)), 'RED control (the first read\'s «ours» kept) ⇒ the vendor sign-in is removed with the folded folder (red)', U3X && U3X.arch.map((x) => x.name));
  // (4) the folded folder KEPT: the reply's facts say where the new sign-in is
  const U4 = scene({ AccountManager }, ROWS[0], { at: 'aside', foldRenameErr: 'EACCES' });
  ok(U4.keptSaid === 1 && typeof U4.facts.foldKept === 'string' && gateOf(/^subs[\\/]/.test(U4.facts.foldKept)) && !U4.fromGone, 'r3042 (4): the folded folder kept — the reply\'s facts name WHERE the new sign-in is (subs/<the folded row>), for the dialog to say it', U4.facts);
  const mU4 = mutant({ acc: [['          if (foldedWhy && facts) facts.foldKept =', '          if (false) facts.foldKept =']] });
  const U4X = mU4 ? scene(mU4, ROWS[0], { at: 'aside', foldRenameErr: 'EACCES' }) : null;
  ok(!!U4X && !U4X.facts.foldKept, 'RED control (the place not in the facts) ⇒ the dialog would say «kept beside it» (red)', U4X && U4X.facts);
  // (6) the survivor's SETTINGS file write fails (EIO on its tmp): said by name, the folded folder kept, its place in the facts
  const U6 = scene({ AccountManager }, ROWS[0], { at: 'none', openErr: /\.claude\.json\./ });
  ok(said(U6, /could not move the folded row's files \(ENOSPC\)/) === 1 && !U6.fromGone && typeof U6.facts.foldKept === 'string', 'r3042 (6): the survivor\'s settings file cannot be written — said by the member\'s name (no longer the best-effort catch\'s silence), the folded folder kept, its place in the facts', { out: U6.out, facts: U6.facts });
  const mU6 = mutant({ acc: [["      console.log(`[accounts] ${who}: the merge could not move the folded row's files", "      (() => { })(`[accounts] ${who}: the merge could not move the folded row's files"]] });
  const U6X = mU6 ? scene(mU6, ROWS[0], { at: 'none', openErr: /\.claude\.json\./ }) : null;
  ok(!!U6X && said(U6X, /could not move the folded row's files/) === 0, 'RED control (the outer catch silent — the release) ⇒ nothing is said (red)', U6X && U6X.out);
}

console.log('§3 THE SPIES — no token byte on a merge\'s outbound paths, OUR token in no file');
const spyRows = ROWS.map((row) => ({ row, r: runMerge({ AccountManager }, row) }));
const leaksOf = (r) => {
  const out = [];
  const paths = { console: r.out.join('\n'), broadcast: r.casts.join('\n'), answer: JSON.stringify(r.ret) || '', 'archive name': r.arch.map((a) => a.name).join('\n') };
  for (const [where, text] of Object.entries(paths)) for (const s of SECRETS) if (has(text, s)) { out.push(where); break; }
  if (filesUnder(r.dataDir).some((p) => fs.readFileSync(p, 'latin1').includes(OAT))) out.push('our token in a file');
  return out;
};
const allLeaks = spyRows.flatMap(({ row, r }) => leaksOf(r).map((w) => `${row.name.split(':')[0]} → ${w}`));
const casts = spyRows.reduce((n, { r }) => n + r.casts.length, 0);
ok(allLeaks.length === 0 && casts >= ROWS.length, `THE SPY: ${ROWS.length} merges, ${SECRETS.length} secrets (logins, refresh tokens, our token, mcpOAuth) — none on console / stdout / stderr, the ${casts} roster broadcasts, the merge's answer or an archive's name; our token in no file`, allLeaks);
// a planted leak per path, each on a scratch copy — the spy must name it
const AFTER_V = "        intoLogged: !!(intoObj && intoObj.claudeAiOauth && intoObj.claudeAiOauth.accessToken) && !oatFileOf(intoObj), rest: credsRestOf });\n";
const PLANTS = [
  ['console', { acc: [[AFTER_V, AFTER_V + "      console.log('[merge] folded', JSON.stringify(v.write));\n"]] }],
  ['broadcast', { acc: [[AFTER_V, AFTER_V + "      into.note = JSON.stringify(v.write || {}).slice(0, 400);\n"]] }],
  ['archive name', { mat: [["`${dest}.dead-${Date.now()}-a${crypto.randomBytes(4).toString('hex')}`", "`${dest}.dead-${Date.now()}-a${String((String(was).match(/\"refreshToken\":\"([^\"]+)\"/) || [])[1] || 'x').slice(-16)}`"]] }],   // r2928: the survivor's archive is the swap's aside
  ['our token in a file', { mat: [['  const aside = intoOurs ? (keep.length ? JSON.stringify(kept) : null) : intoFile;', '  const aside = intoFile;']] }],
];
for (const [where, plant] of PLANTS) {
  const M = mutant(plant);
  const hits = M ? ROWS.filter((row) => !row.name.startsWith('survivor-login') && !row.name.startsWith('no-fold') && !row.name.startsWith('fold-')).flatMap((row) => leaksOf(runMerge(M, row))) : null;
  ok(!!hits && verdictOf(hits.includes(where)), `RED control (a planted ${where} leak on a scratch copy) ⇒ the spy names it`, hits && [...new Set(hits)]);
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\ntest-creds-merge: ${pass} passed, ${fail} failed · ${Date.now() - t0} ms`);
console.log(fail ? `${fail} FAILED (${pass} passed)` : `ALL PASS (${pass})`);
process.exit(fail ? 1 : 0); import { verdictOf, gateOf } from './lib/check.mjs';
