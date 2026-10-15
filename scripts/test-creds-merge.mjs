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
const ok = (c, msg, extra) => { if (c) { pass++; console.log('  ✓ ' + msg); } else { fail++; console.log('  ✗ ' + msg + (extra !== undefined ? ' — ' + JSON.stringify(extra).slice(0, 500) : '')); } };
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
  for (const [name, v, want] of rows) ok(want(v), `${name} ⇒ ${v.why} · fold ${v.fold} · write ${v.write ? Object.keys(v.write).join('+') : 'none'} · archive ${v.archive ? (Buffer.isBuffer(v.aside) ? 'the file as read' : 'its other keys') : 'none'}`, { fold: v.fold, write: v.write && Object.keys(v.write), archive: v.archive, keep: v.keep });
  let threw = null; try { MAT.credsMergeVerdict({ intoFile: null, fromFile: J(fresh) }); } catch (e) { threw = e.code; }
  ok(threw === 'no-rest', 'no "other keys" question ⇒ refused by name (no-rest), never a guess', threw);
  const proto = MAT.credsMergeVerdict({ intoFile: Buffer.from('{"__proto__":{"p":1},"mcpOAuth":{"a":1},"claudeAiOauth":{"accessToken":"x","refreshToken":"y"}}'), intoLogged: true, preferFrom: true, fromFile: J(fresh), rest: LE.credsRestOf });
  ok(Object.prototype.hasOwnProperty.call(proto.write, '__proto__') && Object.getPrototypeOf(proto.write) === Object.prototype && JSON.stringify(proto.write).startsWith('{"__proto__":{"p":1},"mcpOAuth"') && ({}).p === undefined, 'a survivor\'s top-level "__proto__" key (JSON.parse makes it OWN) is kept as an own data key — no prototype set, nothing polluted', JSON.stringify(proto.write).slice(0, 60));
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
  const std = captureStd(); let ret = null, err = null, out;
  try { ret = am.mergeSubscription(from, into, { preferFromCreds: !!row.preferFrom, liveAccountIds: new Set(row.live ? [into] : []) }); } catch (e) { err = e; } finally { out = std(); }
  const file = readB(credsOf(am, into));
  return { am, into, from, before, file, fileJ: readJ(credsOf(am, into)), arch: archivesOf(am.subDir(into)), cfgTag: readJ(cfgOf(am, into))?.oauthAccount?.tag, fromGone: !fs.existsSync(am.subDir(from)), rowGone: !am.list().accounts.some((a) => a.id === from), casts, out, ret, err, intoB, fromB, dataDir };
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
    after: 'the folded login written, nothing to archive', control: [["  if (!keeps) return { fold: true, write: folded, archive: false, aside: null, keep: [], why: 'survivor-absent' };", '']] },
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
  ok(good, `${row.name} ⇒ ${row.after}`, { err: r.err && r.err.message, file: r.fileJ && Object.keys(r.fileJ), arch: r.arch.map((a) => a.name.replace(/\d{13}/, '<ms>')), cfg: r.cfgTag, fromGone: r.fromGone });
  const M = mutant({ mat: row.control });
  const rc = M ? runMerge(M, row) : null;
  const red = !!rc && !(!rc.err && row.want(rc));
  // what the control LOST: the survivor's old bytes (its mcpOAuth's token — or the unparsed file itself) in no file and no archive
  const survivorIn = (x) => { const bufs = [x.file, ...x.arch.map((a) => a.bytes)].filter(Boolean); if (Buffer.isBuffer(x.intoB)) return bufs.some((b) => same(b, x.before)); const t = Object.values(x.intoB.mcpOAuth)[0].accessToken; return bufs.some((b) => b.toString('latin1').includes(t)); };
  const lost = rc && row.fixed ? { mcpGone: !survivorIn(rc), archives: rc.arch.length } : null;
  ok(red && (!row.fixed || (lost.mcpGone && lost.archives === 0)), `RED control (${row.fixed ? 'the pre-fix branch condition restored' : 'the row\'s rule cut'} on a scratch copy) ⇒ ${row.fixed ? (Buffer.isBuffer(row.into) ? 'the unparsed file is gone and no archive exists' : 'the survivor\'s mcpOAuth is gone and no archive exists') : 'the leg above goes red'}`, rc && { file: rc.fileJ && Object.keys(rc.fileJ), arch: rc.arch.length, cfg: rc.cfgTag, err: rc.err && rc.err.message, lost });
  if (row.also) {
    const M2 = mutant({ mat: row.also }), r2 = M2 ? runMerge(M2, row) : null;
    ok(!!r2 && !row.want(r2) && r2.arch.some((a) => a.bytes.toString('latin1').includes(OAT)), 'RED control (the archive takes OUR file as read) ⇒ our token rests in the archive — the leg above catches it', r2 && r2.arch.length);
  }
  TABLE.push({ row: row.name.split(':')[0], after: good ? 'ok' : 'RED', control: red ? 'RED' : 'green(!)' , archive: r.arch.map((a) => a.name.replace(/\d{13}/, '<ms>').replace(/m[0-9a-f]{6}$/, 'm<hex>') + ' ' + a.mode.toString(8)).join(' ') || '—' });
}
for (const t of TABLE) console.log(`    · ${t.row} · after ${t.after} · control ${t.control} · archive ${t.archive}`);
{
  const r = runMerge({ AccountManager }, ROWS[0]);
  ok(r.arch.length === 1 && /^\.credentials\.json\.dead-\d{13}-m[0-9a-f]{6}$/.test(r.arch[0].name) && r.arch[0].mode === 0o600 && (fs.statSync(credsOf(r.am, r.into)).mode & 0o777) === 0o600, 'the archive: `.credentials.json.dead-<ms>-m<6 hex>` beside the file, 0600 (account-material\'s writePrivateFile — the one archive writer of a merge); the new file 0600', r.arch.map((a) => [a.name, a.mode.toString(8)]));
  ok(r.rowGone && r.fromGone, 'the merged-away row and its dir are gone after the fold', { rowGone: r.rowGone, fromGone: r.fromGone });
}
{
  const r = runMerge({ AccountManager }, { ...ROWS[0], live: true });
  ok(r.err && r.err.code === 'merge-account-live' && same(r.file, r.before) && r.arch.length === 0 && !r.fromGone, 'the live guard (B-3f8a) is unchanged: a running session on either side ⇒ refused (merge-account-live), not one byte moved', { code: r.err && r.err.code, arch: r.arch.length });
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
  ['archive name', { acc: [["`${intoCreds}.dead-${Date.now()}-m${crypto.randomBytes(3).toString('hex')}`", "`${intoCreds}.dead-${Date.now()}-m${String(v.write && v.write.claudeAiOauth && v.write.claudeAiOauth.refreshToken).slice(-16)}`"]] }],
  ['our token in a file', { mat: [['  const aside = intoOurs ? (keep.length ? JSON.stringify(kept) : null) : intoFile;', '  const aside = intoFile;']] }],
];
for (const [where, plant] of PLANTS) {
  const M = mutant(plant);
  const hits = M ? ROWS.filter((row) => !row.name.startsWith('survivor-login') && !row.name.startsWith('no-fold') && !row.name.startsWith('fold-')).flatMap((row) => leaksOf(runMerge(M, row))) : null;
  ok(!!hits && hits.includes(where), `RED control (a planted ${where} leak on a scratch copy) ⇒ the spy names it`, hits && [...new Set(hits)]);
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\ntest-creds-merge: ${pass} passed, ${fail} failed · ${Date.now() - t0} ms`);
console.log(fail ? `${fail} FAILED (${pass} passed)` : `ALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
