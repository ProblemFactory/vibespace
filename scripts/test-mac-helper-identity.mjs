#!/usr/bin/env node
// THE MAC SCREEN HELPER'S IDENTITY (lane apple-signing — docs/design-apple-signing.zh.md §2–§3, §7; fast, PURE, in-process):
//   ① the designated requirement codesign writes for a Developer ID signature — identifier + Team ID, no hash, no version
//      (what tccd stores: the reason a signed helper keeps its Screen Recording grant across versions);
//   ② parseCodesignInfo over `codesign -dv --verbose=4` outputs (scripts/fixtures/stream/codesign-outputs.mjs: ad-hoc, Developer
//      ID, Apple Development, unsigned; CRLF, indentation and unknown keys tolerated);
//   ③ identityVerdict: developer-id only by a PINNED team with THE identifier; adhoc; other (another team, a non-Developer-ID
//      chain, a mismatched Team ID, a foreign identifier); unsigned;
//   ④ swapVerdict — the design's §2.3 table row by row (no pin: ad-hoc as before, anything signed refused; pinned: a Developer ID
//      build taken even over the same-version ad-hoc install, ad-hoc / other / unsigned refused by name helper_unsigned);
//   ⑤ regrantVerdict (Developer ID → Developer ID of the same team keeps the grant), the re-grant's name, wantSigned;
//   ⑥ the release record's helper row: helperRow / helperRowShape / helperRowLine ≡ src/agentd-signature.js helperLine + helperShape;
//   ⑦ the argvs: verifyPlan (--verify --strict first, then -dv), signArgs (ad-hoc without an identity; Developer ID = hardened
//      runtime + timestamp + THE identifier), and scripts/build-mac-helper.sh's text carries those switches + the identity record;
//   ⑧ RED controls over patched copies of the module (in memory): the team check dropped ⇒ another team's signature passes; the
//      pinned-adhoc refusal dropped ⇒ an ad-hoc push passes under a pin — each proves the rule above is what bites;
//   ⑨ ROUND 2 (2026-10-26, the captures 主开发 took on the owner's Mac — codesign-outputs.mjs HELPER_* / CHROME_*): the real ad-hoc
//      helper reads `adhoc`, the real Developer ID app (Google Chrome) reads `developer-id` by its team; a copy of the module with
//      HELPER_TEAM_IDS = [that team] takes Chrome's shape with our identifier and still refuses the real ad-hoc helper;
//   ⑩ ROUND 2: `codesign -dr -` parsed as its own shape (parseDesignatedRequirement: the `designated =>` line — implicit `#`, cdhash
//      per slice vs identifier + anchor apple generic + the two Developer ID OIDs + the leaf's OU), our DR = Chrome's field for field
//      with the identifier group and the Team ID substituted, requirementVerdict (the agent's question after a developer-id verdict:
//      a cdhash / another team's / an extra clause ⇒ refused) + a RED control, the agent's third run;
//   ⑪ ROUND 3 (acceptance r1 M2): a DIGIT-FIRST Team ID — codesign's dumper quotes it (SYNTHETIC from the rule: no such capture
//      yet), the agent compares MEANING (requirementTokens), designatedRequirement emits the dumper's form, the release script's
//      own check too (both evaluated in bash); two RED controls (bytes-only compare; round 2's bare emission = a0d876c5f).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import * as CS from './fixtures/stream/codesign-outputs.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? ' — ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 600) : '')); } };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const MI = require(path.join(REPO, 'src/mac-helper-identity.js'));
const SIG = require(path.join(REPO, 'src/agentd-signature.js'));
const SP = require(path.join(REPO, 'src/stream-plan.js'));
const SRC_TEXT = fs.readFileSync(path.join(REPO, 'src/mac-helper-identity.js'), 'utf8');
const PIN = [CS.TEAM];
/** A patched copy of the module, loaded in memory (it imports nothing — the patch is a text replace). */
const load = (text) => { const m = { exports: {} }; new Function('module', 'exports', 'require', text)(m, m.exports, () => { throw new Error('imports nothing'); }); return m.exports; };

console.log('— ① the designated requirement —');
{
  const dr = MI.designatedRequirement({ teamId: CS.TEAM });
  ok(dr === `identifier "com.problemfactory.vibespace.screen" and anchor apple generic and certificate 1[field.1.2.840.113635.100.6.2.6] /* exists */ and certificate leaf[field.1.2.840.113635.100.6.1.13] /* exists */ and certificate leaf[subject.OU] = ${CS.TEAM}`, 'the DR = THE identifier + anchor apple generic + the Developer ID OIDs + the Team ID as the leaf\'s OU (unquoted, as codesign prints it) — no cdhash, no version, no name', dr);
  ok(!/cdhash/i.test(dr) && !/\bvs-/.test(dr), 'nothing in it moves with a rebuild (no cdhash, no helper version)');
  const chrome = MI.parseDesignatedRequirement(CS.CHROME_DR);
  const substituted = chrome.designated.replace(/^\(identifier "com\.google\.Chrome"[^)]*\) and /, `identifier "${CS.IDENTIFIER}" and `).replace(/ = EQHXZ8M8AV$/, ` = ${CS.TEAM}`);
  ok(substituted !== chrome.designated && substituted === dr && CS.designated({ team: CS.TEAM }) === `Executable=${CS.HELPER_FILE}\ndesignated => ${dr}\n`, 'ROUND 2: the DR equals a REAL Developer ID requirement (Google Chrome\'s `codesign -dr -`, captured on the owner\'s Mac) with its identifier group and its Team ID substituted — nothing else differs', { substituted, dr });
  const fields = dr.split(' and '), cf = chrome.designated.split(' and ');
  ok(fields.length === 5 && cf.length === 5 && same(fields.slice(1, 4), cf.slice(1, 4)) && fields[1] === 'anchor apple generic' && fields[2] === 'certificate 1[field.1.2.840.113635.100.6.2.6] /* exists */' && fields[3] === 'certificate leaf[field.1.2.840.113635.100.6.1.13] /* exists */' && fields[4] === `certificate leaf[subject.OU] = ${CS.TEAM}` && cf[4] === 'certificate leaf[subject.OU] = EQHXZ8M8AV', 'field for field: the identifier · anchor apple generic · certificate 1 OID 1.2.840.113635.100.6.2.6 · leaf OID 1.2.840.113635.100.6.1.13 · the leaf\'s OU = the Team ID — fields 2–4 byte-equal to Chrome\'s', { fields, cf });
  let threw = 0; for (const bad of [{ teamId: 'short' }, { teamId: CS.TEAM, identifier: 'bad id!' }, {}]) { try { MI.designatedRequirement(bad); } catch { threw++; } }
  ok(threw === 3 && MI.HELPER_IDENTIFIER === CS.IDENTIFIER, 'a Team ID is 10 capitals / digits, an identifier is a bundle-id shape; HELPER_IDENTIFIER is the design\'s', { threw });
  ok(Array.isArray(MI.HELPER_TEAM_IDS) && Object.isFrozen(MI.HELPER_TEAM_IDS) && /HELPER_TEAM_IDS = Object\.freeze\(\[\]\)/.test(SRC_TEXT), 'HELPER_TEAM_IDS is a frozen list — EMPTY today (the owner has not enrolled; one commit fills it, design §6.7)', MI.HELPER_TEAM_IDS);
  ok(!/require\(/.test(SRC_TEXT), 'the module imports nothing (PURE)');
}

console.log('— ② parseCodesignInfo over codesign -dv --verbose=4 —');
{
  const a = MI.parseCodesignInfo(CS.HELPER_DV);
  ok(a.signed && a.adhoc && a.teamId === null && a.authority.length === 0 && a.identifier === CS.HELPER_ADHOC_IDENTIFIER && /^vibespace-screen-[0-9a-f]{40}$/.test(a.identifier) && a.cdhash === CS.HELPER_CDHASH && a.runtime === null && a.flags === '0x2' && a.format === 'Mach-O universal (x86_64 arm64)' && a.timestamp === null, 'ROUND 2, the REAL helper (captured on the owner\'s Mac): ad-hoc (Signature=adhoc, flags 0x2(adhoc), TeamIdentifier=not set, no Authority), the linker\'s per-build identifier (name + UUID + hash), the universal format, the cdhash kept', a);
  const rc = MI.parseCodesignInfo(CS.CHROME_DV);
  ok(rc.signed && !rc.adhoc && rc.teamId === CS.CHROME_TEAM && rc.identifier === CS.CHROME_IDENTIFIER && same(rc.authority, ['Developer ID Application: Google LLC (EQHXZ8M8AV)', 'Developer ID Certification Authority', 'Apple Root CA']) && rc.timestamp === 'Oct 19, 2026 at 7:23:41 PM' && rc.cdhash === null && rc.flags === null, 'ROUND 2, a REAL Developer ID app (Google Chrome, notarized): the three-authority chain verbatim, TeamIdentifier, a secure timestamp (the signature outlives the certificate) — signed even though the capture kept no CodeDirectory line', rc);
  ok(CS.adhoc() === CS.HELPER_DV && CS.adhocDr() === CS.HELPER_DR && MI.parseCodesignInfo(CS.IDENTITIES_NONE).signed === false && MI.parseCodesignInfo(CS.CHROME_ASSESS).signed === false, 'the generators with no argument ARE the captures; `0 valid identities found` (the owner before enrollment) and spctl\'s text parse as unsigned, not a crash');
  const d = MI.parseCodesignInfo(CS.developerId());
  ok(d.signed && !d.adhoc && d.teamId === CS.TEAM && d.identifier === CS.IDENTIFIER && same(d.authority, [`Developer ID Application: Helper Publisher (${CS.TEAM})`, 'Developer ID Certification Authority', 'Apple Root CA']) && d.runtime === '26.0.0' && d.flags === '0x10000' && d.cdhash === '0fedcba987654321fedcba987654321fedcba987', 'a Developer ID signature: the three-authority chain in order, TeamIdentifier, the hardened runtime version, the flags', d);
  const x = MI.parseCodesignInfo(CS.appleDevelopment());
  ok(x.signed && !x.adhoc && /^Apple Development:/.test(x.authority[0]) && x.teamId === CS.TEAM, 'an Apple Development signature parses as signed, not ad-hoc, with its own leaf', x);
  const u = MI.parseCodesignInfo(CS.unsigned());
  ok(u.signed === false && u.identifier === null && u.cdhash === null, '«code object is not signed at all» ⇒ signed: false', u);
  const crlf = MI.parseCodesignInfo(CS.developerId().replace(/\n/g, '\r\n').replace(/^/gm, '  ') + 'Strange Key=with=equals\r\n');
  ok(crlf.teamId === CS.TEAM && crlf.authority.length === 3 && crlf.identifier === CS.IDENTIFIER, 'CRLF, indentation and unknown keys change nothing (keys, not positions)', crlf);
  ok(MI.parseCodesignInfo('').signed === false && MI.parseCodesignInfo(null).signed === false && MI.parseCodesignInfo('TeamIdentifier=lowercase1\nAuthority=' + 'x'.repeat(400)).teamId === null, 'empty / null / a malformed Team ID ⇒ unsigned or no team (bounded fields)');
}

console.log('— ③ identityVerdict —');
{
  const V = (text, o) => MI.identityVerdict(MI.parseCodesignInfo(text), o);
  const dev = V(CS.developerId(), { teamIds: PIN });
  ok(dev.kind === 'developer-id' && dev.teamId === CS.TEAM && dev.identifier === CS.IDENTIFIER && dev.cdhash && dev.authority.length === 3, 'a Developer ID signature by the PINNED team with THE identifier ⇒ developer-id', dev);
  const nopin = V(CS.developerId(), { teamIds: [] });
  ok(nopin.kind === 'other' && /pins no Team ID yet/.test(nopin.why) && nopin.teamId === CS.TEAM, 'no pin (today): a Developer ID signature of ANY team is `other` — the agent trusts nobody yet', nopin);
  const other = V(CS.developerId({ team: CS.OTHER_TEAM }), { teamIds: PIN });
  ok(other.kind === 'other' && /signed by team ZZOTHER002, not the pinned VSTEAM0001/.test(other.why), 'another team ⇒ other, naming both', other);
  const ident = V(CS.developerId({ identifier: 'com.example.other' }), { teamIds: PIN });
  ok(ident.kind === 'other' && /identifier is com\.example\.other, not com\.problemfactory\.vibespace\.screen/.test(ident.why), 'the pinned team but a foreign identifier ⇒ other (the DR names the identifier)', ident);
  const appdev = V(CS.appleDevelopment(), { teamIds: PIN });
  ok(appdev.kind === 'other' && /not a Developer ID Application signature \(Apple Development/.test(appdev.why), 'an Apple Development signature (even by our team) ⇒ other: only Developer ID Application counts', appdev);
  const mismatch = V(CS.developerId().replace(`TeamIdentifier=${CS.TEAM}`, `TeamIdentifier=${CS.OTHER_TEAM}`), { teamIds: PIN });
  ok(mismatch.kind === 'other' && /names team VSTEAM0001 but the signature claims ZZOTHER002/.test(mismatch.why), 'the leaf\'s OU and TeamIdentifier disagree ⇒ other', mismatch);
  const chain = V(CS.developerId().replace('Authority=Apple Root CA\n', ''), { teamIds: PIN });
  ok(chain.kind === 'other' && /does not run Developer ID Certification Authority → Apple Root CA/.test(chain.why), 'a chain that does not end at Apple Root CA ⇒ other', chain);
  ok(V(CS.adhoc(), { teamIds: PIN }).kind === 'adhoc' && V(CS.adhoc(), { teamIds: [] }).kind === 'adhoc', 'ad-hoc is ad-hoc, pin or no pin');
  const realHelper = V(CS.HELPER_DV, { teamIds: PIN }), realHelper0 = V(CS.HELPER_DV, { teamIds: [] });
  ok(realHelper.kind === 'adhoc' && realHelper0.kind === 'adhoc' && realHelper.identifier === CS.HELPER_ADHOC_IDENTIFIER && realHelper.cdhash === CS.HELPER_CDHASH, 'ROUND 2: the REAL ad-hoc helper reads `adhoc` (pin or no pin) — its linker identifier is no objection (an ad-hoc identity is the cdhash, not the name)', realHelper);
  const chromeAs = V(CS.CHROME_DV, { teamIds: [CS.CHROME_TEAM], identifier: CS.CHROME_IDENTIFIER });
  ok(chromeAs.kind === 'developer-id' && chromeAs.teamId === CS.CHROME_TEAM && chromeAs.identifier === CS.CHROME_IDENTIFIER && /Developer ID by team EQHXZ8M8AV/.test(chromeAs.why), 'ROUND 2: the REAL Chrome capture reads `developer-id` by team EQHXZ8M8AV when that team is pinned and its identifier is the one asked', chromeAs);
  const chromeOurs = V(CS.CHROME_DV, { teamIds: [CS.CHROME_TEAM] }), chromeNoPin = V(CS.CHROME_DV, { teamIds: [] });
  ok(chromeOurs.kind === 'other' && /identifier is com\.google\.Chrome, not com\.problemfactory\.vibespace\.screen/.test(chromeOurs.why) && chromeNoPin.kind === 'other' && /signed by team EQHXZ8M8AV; this agent pins no Team ID yet/.test(chromeNoPin.why), 'Chrome itself is never our helper: with its team pinned it fails THE identifier; with no pin (today) it is `other` like any Developer ID build', { chromeOurs, chromeNoPin });
  ok(V(CS.unsigned(), { teamIds: PIN }).kind === 'unsigned' && MI.identityVerdict(null).kind === 'unsigned', 'unsigned / no facts ⇒ unsigned');
  ok(V(CS.developerId(), { teamIds: ['bad', CS.TEAM] }).kind === 'developer-id' && V(CS.developerId(), { teamIds: ['vsteam0001'] }).kind === 'other', 'a malformed pin row is ignored; the pin is case-exact');
}

console.log('— ④ swapVerdict: the design\'s §2.3 table —');
{
  const id = (kind, extra = {}) => ({ kind, teamId: null, identifier: null, cdhash: null, authority: [], why: kind, ...extra });
  const DEV = id('developer-id', { teamId: CS.TEAM, identifier: CS.IDENTIFIER });
  const S = (installed, incoming, teamIds) => MI.swapVerdict({ installed, incoming: { version: 'vs-new', identity: incoming }, teamIds });
  // no pin (today)
  ok(S(null, id('adhoc'), []).take === true && S({ version: 'vs-old', identity: null }, id('adhoc'), []).take === true, 'no pin: an ad-hoc prebuilt is taken as before (nothing or an older version installed)');
  const sameAdhoc = S({ version: 'vs-new', identity: id('adhoc') }, id('adhoc'), []);
  ok(sameAdhoc.take === false && sameAdhoc.code === null, 'no pin: ad-hoc over the same-version ad-hoc = nothing to do (no refusal)', sameAdhoc);
  for (const [k, re] of [['other', /not ours/], ['unsigned', /not signed at all/]]) { const r = S(null, id(k, { why: 'x' }), []); ok(r.take === false && r.code === 'helper_unsigned' && re.test(r.why), `no pin: ${k} ⇒ refused helper_unsigned`, r); }
  // pinned
  ok(S(null, DEV, PIN).take === true && S({ version: 'vs-old', identity: id('adhoc') }, DEV, PIN).take === true, 'pinned: a Developer ID build is taken (nothing / an older ad-hoc installed)');
  const last = S({ version: 'vs-new', identity: id('adhoc') }, DEV, PIN);
  ok(last.take === true && /replaces the ad-hoc one of the same version \(the last re-grant\)/.test(last.why), 'pinned: a Developer ID build REPLACES the installed ad-hoc build of the SAME version — the last re-grant', last);
  ok(S({ version: 'vs-new', identity: null }, DEV, PIN).take === true, 'pinned: an installed helper of unknown identity (an older agent judged nothing) is replaced too');
  const dd = S({ version: 'vs-new', identity: DEV }, DEV, PIN);
  ok(dd.take === false && dd.code === null && /installed already/.test(dd.why), 'pinned: the signed build of this version is installed ⇒ nothing to do', dd);
  const adhocPinned = S(null, id('adhoc'), PIN);
  ok(adhocPinned.take === false && adhocPinned.code === 'helper_unsigned' && /ad-hoc signed; this agent pins Team ID VSTEAM0001/.test(adhocPinned.why) && /a build made here stays the fallback/.test(adhocPinned.why), 'pinned: an ad-hoc push is refused by name — the local build stays the fallback', adhocPinned);
  for (const k of ['other', 'unsigned']) ok(S(null, id(k, { why: 'x' }), PIN).code === 'helper_unsigned', `pinned: ${k} ⇒ refused helper_unsigned`);
  ok(MI.swapVerdict({ incoming: { version: 'v' } }).code === 'helper_unsigned' && MI.swapVerdict({}).code === 'helper_unsigned', 'no verdict at all ⇒ refused (fail closed)');
  const devNoPin = S(null, DEV, []), devOther = S(null, DEV, [CS.OTHER_TEAM]);
  ok(devNoPin.take === false && devNoPin.code === 'helper_unsigned' && /signed by team VSTEAM0001; this agent pins no Team ID yet/.test(devNoPin.why) && devOther.take === false && /signed by team VSTEAM0001, not the pinned ZZOTHER002/.test(devOther.why), 'ROUND 3 (acceptance r1 minor): the table itself refuses a developer-id identity under an EMPTY or non-matching pin set — never only identityVerdict upstream');
}

console.log('— ⑤ the re-grant and wantSigned —');
{
  const DEV = { kind: 'developer-id', teamId: CS.TEAM, identifier: CS.IDENTIFIER }, DEV2 = { ...DEV, teamId: CS.OTHER_TEAM }, AD = { kind: 'adhoc' };
  ok(MI.regrantVerdict({ wasGranted: true, from: AD, to: AD }) === true && MI.regrantVerdict({ wasGranted: true, from: null, to: AD }) === true, 'ad-hoc → ad-hoc: a re-grant (today\'s cost)');
  ok(MI.regrantVerdict({ wasGranted: true, from: AD, to: DEV }) === true && MI.regrantVerdict({ wasGranted: true, from: null, to: DEV }) === true, 'ad-hoc (or unknown) → Developer ID: ONE re-grant — the last');
  ok(MI.regrantVerdict({ wasGranted: true, from: DEV, to: DEV }) === false && MI.regrantVerdict({ wasGranted: true, from: DEV, to: { ...DEV, cdhash: 'other' } }) === false, 'Developer ID → Developer ID of the same team + identifier: NO re-grant (tccd keeps the requirement) — the design\'s point');
  ok(MI.regrantVerdict({ wasGranted: true, from: DEV, to: DEV2 }) === true && MI.regrantVerdict({ wasGranted: true, from: DEV, to: AD }) === true, 'another team, or back to ad-hoc: a re-grant');
  ok(MI.regrantVerdict({ wasGranted: false, from: AD, to: DEV }) === false, 'never granted ⇒ a first grant, not a re-grant');
  ok(SP.macRegrantCode({ identity: DEV }) === 'helper_signed_regrant' && SP.macRegrantCode({ identity: AD }) === 'helper_changed_regrant' && SP.macRegrantCode({}) === 'helper_changed_regrant', 'the re-grant\'s name: the signed helper\'s is helper_signed_regrant («the last time»), else helper_changed_regrant');
  ok(/ONE LAST time/.test(SP.MAC_WHY.helper_signed_regrant) && /keeps the grant from now on/.test(SP.MAC_WHY.helper_signed_regrant) && /not signed by the VibeSpace release team/.test(SP.MAC_WHY.helper_unsigned) && /Command Line Tools/.test(SP.MAC_WHY.helper_unsigned), 'the two words exist in stream-plan\'s MAC_WHY and say the last time / the fallback');
  ok(MI.wantSigned(AD, PIN) === true && MI.wantSigned(null, PIN) === true && MI.wantSigned(DEV, PIN) === false && MI.wantSigned(AD, []) === false && MI.wantSigned(null, []) === false, 'wantSigned: only with a pin, and only while the installed helper is not a Developer ID build (unknown counts as not)');
  const plan = SP.planMacScreen({ platform: 'darwin', helper: { state: 'ready', bin: '/x', regrant: true, identity: DEV }, tcc: { screen: 'denied' }, displays: [], windows: [] });
  ok(plan.ok === false && plan.code === 'helper_signed_regrant' && plan.error === SP.MAC_WHY.helper_signed_regrant && plan.settings === SP.MAC_SETTINGS.screen, 'planMacScreen refuses the signed helper\'s re-grant by its own name, with the Settings pane', plan);
}

console.log('— ⑥ the release record\'s helper row —');
{
  const row = MI.helperRow({ version: 'vs-11f32156ba0a', sha256: 'A'.repeat(64), identity: { kind: 'developer-id', teamId: CS.TEAM, identifier: CS.IDENTIFIER } });
  ok(same(row, { version: 'vs-11f32156ba0a', sha256: 'a'.repeat(64), identity: { kind: 'developer-id', teamId: CS.TEAM, identifier: CS.IDENTIFIER } }) && MI.helperRowShape(row) === null, 'helperRow normalizes (lowercase sha); a Developer ID row with its team + identifier is well-formed', row);
  ok(MI.helperRowLine(row) === `helper vs-11f32156ba0a ${'a'.repeat(64)} developer-id ${CS.TEAM} ${CS.IDENTIFIER}` && SIG.helperLine(row) === MI.helperRowLine(row), 'the signed message line — identical in src/agentd-signature.js (pinned here, so the two never drift)');
  const ad = MI.helperRow({ version: 'vs-x', sha256: 'b'.repeat(64), identity: { kind: 'adhoc' } });
  ok(MI.helperRowShape(ad) === null && MI.helperRowLine(ad) === `helper vs-x ${'b'.repeat(64)} adhoc - -` && SIG.helperShape(ad) === null, 'an ad-hoc row has no team / identifier (dashes in the line)');
  const bads = [[{ ...row, version: 'bad version!' }, /no version/], [{ ...row, sha256: 'xyz' }, /no sha256/], [{ ...row, identity: null }, /no identity/], [{ ...row, identity: { ...row.identity, kind: 'nope' } }, /kind is unknown/], [{ ...row, identity: { ...row.identity, teamId: 'short' } }, /not a Team ID/], [{ ...row, identity: { ...row.identity, identifier: 'bad id!' } }, /not an identifier/], [{ ...row, identity: { kind: 'developer-id', teamId: null, identifier: null } }, /needs its Team ID and identifier/], ['x', /not an object/]];
  ok(bads.every(([r, re]) => re.test(MI.helperRowShape(r) || '') && re.test(SIG.helperShape(r) || '')), 'eight malformed rows are named the same way by both modules', bads.map(([r]) => [MI.helperRowShape(r), SIG.helperShape(r)]));
  ok(MI.helperRow({}).identity.kind === 'unsigned' && MI.helperRowShape(MI.helperRow({})) !== null, 'an empty row normalizes to unsigned and is malformed (no version / sha)');
}

console.log('— ⑦ the argvs and the release script —');
{
  const vp = MI.verifyPlan('/Users/u/.vibespace/helpers/vibespace-screen-vs-1');
  ok(same(vp.map((x) => [x.file, x.args]), [['/usr/bin/codesign', ['--verify', '--strict', '--verbose=2', '/Users/u/.vibespace/helpers/vibespace-screen-vs-1']], ['/usr/bin/codesign', ['-dv', '--verbose=4', '/Users/u/.vibespace/helpers/vibespace-screen-vs-1']], ['/usr/bin/codesign', ['-dr', '-', '/Users/u/.vibespace/helpers/vibespace-screen-vs-1']]]) && MI.MAC_CODESIGN === '/usr/bin/codesign', 'verifyPlan: the strict verification FIRST, then the facts, then (round 2) the designated requirement — all /usr/bin/codesign (every Mac has it, no CLT needed)', vp);
  ok(same(MI.signArgs({ out: '/w/x' }), ['-s', '-', '-f', '/w/x']) && same(MI.signArgs({ identity: `Developer ID Application: Helper Publisher (${CS.TEAM})`, out: '/w/x' }), ['--sign', `Developer ID Application: Helper Publisher (${CS.TEAM})`, '--options', 'runtime', '--timestamp', '--identifier', CS.IDENTIFIER, '--force', '/w/x']), 'signArgs: ad-hoc without an identity (the cut before any certificate); Developer ID = hardened runtime + a secure timestamp + THE identifier');
  const sh = fs.readFileSync(path.join(REPO, 'scripts/build-mac-helper.sh'), 'utf8');
  ok(/--sign\) SIGN=/.test(sh) && /--identifier\) IDENTIFIER=/.test(sh) && /--notarize\) NOTARIZE=/.test(sh) && /IDENTIFIER="com\.problemfactory\.vibespace\.screen"/.test(sh), 'build-mac-helper.sh takes --sign / --identifier / --notarize; the identifier defaults to the design\'s');
  ok(/codesign --sign "\$SIGN" --options runtime --timestamp --identifier "\$IDENTIFIER" --force/.test(sh) && /codesign --verify --strict --verbose=2/.test(sh) && /codesign -s - -f/.test(sh), 'its signed branch is signArgs\'s argv and verifies strictly; its default branch is the ad-hoc one (unchanged)');
  ok(/vibespace-screen\.identity\.json/.test(sh) && /notarized: notarized === 'true'/.test(sh) && /xcrun notarytool submit .* --keychain-profile "\$NOTARIZE" --wait/.test(sh) && /notarization did not succeed — the signed helper ships without it/.test(sh), 'it writes the identity record (version, sha256, kind, teamId, identifier, notarized) and a failed notarization never fails the build');
  ok(/Authority=Developer ID Application:/.test(sh) && /the signature names no Team ID/.test(sh) && /--notarize needs --sign/.test(sh), 'it refuses by name: a --sign identity that is not Developer ID Application, a signature without a Team ID, --notarize without --sign');
  const want = /\n\s*(WANT="[^\n]*")\n/.exec(sh), ouCase = /\n\s*(case "\$TEAM" in \[0-9\]\*\) OU=[^\n]*esac)\n/.exec(sh);
  const wantOf = (team) => execFileSync('bash', ['-c', `IDENTIFIER=${JSON.stringify(MI.HELPER_IDENTIFIER)}; TEAM=${JSON.stringify(team)}; ${ouCase[1]}; ${want[1]}; printf '%s' "$WANT"`]).toString();
  ok(/codesign -dr - "\$WORK\/vibespace-screen"/.test(sh) && want && ouCase && wantOf(CS.TEAM) === MI.designatedRequirement({ teamId: CS.TEAM }) && wantOf(CS.DIGIT_TEAM) === MI.designatedRequirement({ teamId: CS.DIGIT_TEAM }) && / = "0VSTEAM002"$/.test(wantOf(CS.DIGIT_TEAM)) && /the designated requirement is not the Developer ID one the agent keys the grant on/.test(sh), 'ROUND 2 + 3: the release script reads the signed prebuilt\'s requirement back (`codesign -dr -`) and refuses by name unless it is designatedRequirement\'s text — evaluated in bash for a letter-first AND a digit-first team (the OU quoted, as the dumper prints it)', { want: want && want[1], digit: want && ouCase ? wantOf(CS.DIGIT_TEAM) : null });
  const mode = fs.statSync(path.join(REPO, 'scripts/build-mac-helper.sh')).mode & 0o111;
  ok(mode !== 0, 'build-mac-helper.sh is executable (round 3: the rewrite had dropped its bit; no census leg over scripts/*.sh exists — this one stands for it)');
  const sm = fs.readFileSync(path.join(REPO, 'src/agentd/stream-mac.js'), 'utf8');
  const ensure = sm.slice(sm.indexOf('function ensure()'), sm.indexOf('/** What the facts saw'));
  const iJudge = ensure.indexOf('await identityOf(pushed)'), iPlace = ensure.indexOf('fs.renameSync(pushed, P.bin)');
  ok(iJudge > 0 && iPlace > iJudge && /MI\.swapVerdict\(/.test(ensure) && /fs\.unlinkSync\(pushed\)/.test(ensure) && /code: 'helper_unsigned'/.test(ensure), 'the agent\'s ensure(): the pushed file is JUDGED (identityOf → swapVerdict) before it is renamed to the fixed path; a refusal removes it and is named helper_unsigned — the census of the design\'s §2.3');
  ok(/if \(have === version && isFile\(P\.bin\) && !hasPushed\) return Promise\.resolve\(view\(\)\);/.test(ensure), 'the fast path (the version file + the binary, nothing pushed) still runs nothing');
}

console.log('— ⑧ RED controls: patched copies of the module —');
{
  ok(load(SRC_TEXT).identityVerdict(MI.parseCodesignInfo(CS.developerId({ team: CS.OTHER_TEAM })), { teamIds: PIN }).kind === 'other', 'the clean copy refuses another team (the control\'s baseline)');
  const noTeam = SRC_TEXT.replace("if (!pins.includes(team)) return { kind: 'other'", "if (false) return { kind: 'other'");
  ok(noTeam !== SRC_TEXT && load(noTeam).identityVerdict(MI.parseCodesignInfo(CS.developerId({ team: CS.OTHER_TEAM })), { teamIds: PIN }).kind === 'developer-id', 'RED: with the Team ID check dropped, ANOTHER team\'s Developer ID signature passes as ours — the check is what bites');
  const noAdhoc = SRC_TEXT.replace("if (pins.length) return refuse(`the pushed helper is ad-hoc signed", "if (false) return refuse(`the pushed helper is ad-hoc signed");
  ok(noAdhoc !== SRC_TEXT && load(noAdhoc).swapVerdict({ incoming: { version: 'v', identity: { kind: 'adhoc' } }, teamIds: PIN }).take === true, 'RED: with the pinned-adhoc refusal dropped, an ad-hoc push is taken under a pin — the refusal is what bites');
  const noIdent = SRC_TEXT.replace("if (base.identifier !== identifier) return { kind: 'other'", "if (false) return { kind: 'other'");
  ok(noIdent !== SRC_TEXT && load(noIdent).identityVerdict(MI.parseCodesignInfo(CS.developerId({ identifier: 'com.example.other' })), { teamIds: PIN }).kind === 'developer-id', 'RED: with the identifier check dropped, a foreign identifier by our team passes — the check is what bites');
}

console.log('— ⑨ ROUND 2: the pin mutant over the REAL shapes —');
{
  const pinned = SRC_TEXT.replace('HELPER_TEAM_IDS = Object.freeze([])', `HELPER_TEAM_IDS = Object.freeze([${JSON.stringify(CS.CHROME_TEAM)}])`);
  const P = load(pinned);
  ok(pinned !== SRC_TEXT && same([...P.HELPER_TEAM_IDS], [CS.CHROME_TEAM]) && Object.isFrozen(P.HELPER_TEAM_IDS), 'a copy of the module with HELPER_TEAM_IDS = [EQHXZ8M8AV] — the shape of the pin commit (the owner\'s Team ID will stand there)');
  const chromeShape = P.identityVerdict(P.parseCodesignInfo(CS.developerId({ team: CS.CHROME_TEAM, name: 'Google LLC' })));
  ok(chromeShape.kind === 'developer-id' && chromeShape.teamId === CS.CHROME_TEAM && chromeShape.identifier === CS.IDENTIFIER, 'the pinned copy accepts Chrome\'s signer shape with OUR identifier (its defaults: that pin, HELPER_IDENTIFIER)', chromeShape);
  const chromeItself = P.identityVerdict(P.parseCodesignInfo(CS.CHROME_DV), { identifier: CS.CHROME_IDENTIFIER });
  ok(chromeItself.kind === 'developer-id' && chromeItself.teamId === CS.CHROME_TEAM, '…and the verbatim Chrome capture by its own identifier (the pin is the only thing that changed)', chromeItself);
  const takes = P.swapVerdict({ incoming: { version: 'vs-new', identity: chromeShape } }), refuses = P.swapVerdict({ incoming: { version: 'vs-new', identity: P.identityVerdict(P.parseCodesignInfo(CS.HELPER_DV)) } });
  ok(takes.take === true && refuses.take === false && refuses.code === 'helper_unsigned' && /ad-hoc signed; this agent pins Team ID EQHXZ8M8AV/.test(refuses.why), 'the pinned copy TAKES the Developer ID shape and still REFUSES the real ad-hoc helper by name (helper_unsigned — the local build stays the fallback)', { takes, refuses });
  const clean = MI.swapVerdict({ incoming: { version: 'vs-new', identity: MI.identityVerdict(MI.parseCodesignInfo(CS.developerId({ team: CS.CHROME_TEAM, name: 'Google LLC' }))) } });
  ok(clean.take === false && clean.code === 'helper_unsigned' && /pins no Team ID yet/.test(clean.why) && MI.swapVerdict({ incoming: { version: 'vs-new', identity: MI.identityVerdict(MI.parseCodesignInfo(CS.HELPER_DV)) } }).take === true, 'the UNPATCHED module (no pin today) refuses that same shape and takes the real ad-hoc helper — the pin commit is what flips both');
  ok(P.wantSigned({ kind: 'adhoc' }) === true && MI.wantSigned({ kind: 'adhoc' }) === false && P.wantSigned(chromeShape) === false, 'the pinned copy wants the signed prebuilt over an ad-hoc install (and nothing over a signed one); the unpinned one wants nothing');
}

console.log('— ⑩ ROUND 2: codesign -dr - parsed as its own shape —');
{
  const h = MI.parseDesignatedRequirement(CS.HELPER_DR);
  ok(h.executable === CS.HELPER_FILE && h.implicit === true && h.kind === 'cdhash' && same(h.cdhashes, [...CS.HELPER_CDHASHES]) && h.identifiers.length === 0 && h.teamId === null && h.oids.length === 0 && h.designated === 'cdhash H"d18ecc296a649af2546060b5a4c68fcf04c1fcc4" or cdhash H"cddfb0e2117db0e6c05d6b9803c5c3e1318505b4"', 'the REAL ad-hoc helper: `# designated =>` (implicit — codesign computed it: Internal requirements count=0) = one cdhash PER SLICE of the universal binary — why every rebuild is a new client to tccd', h);
  const c = MI.parseDesignatedRequirement(CS.CHROME_DR);
  ok(c.executable === CS.CHROME_FILE && c.implicit === false && c.kind === 'developer-id' && same(c.identifiers, ['com.google.Chrome', 'com.google.Chrome.beta', 'com.google.Chrome.dev', 'com.google.Chrome.canary']) && c.teamId === CS.CHROME_TEAM && same(c.oids, ['1.2.840.113635.100.6.2.6', '1.2.840.113635.100.6.1.13']) && c.anchorAppleGeneric === true && c.cdhashes.length === 0, 'the REAL Chrome: `designated =>` (embedded) = four identifiers, anchor apple generic, EXACTLY the OIDs 1.2.840.113635.100.6.2.6 (certificate 1) and 1.2.840.113635.100.6.1.13 (the leaf), the leaf\'s OU = EQHXZ8M8AV — the developer-id shape', c);
  const ours = MI.parseDesignatedRequirement(CS.designated({ team: CS.TEAM }));
  ok(ours.kind === 'developer-id' && same(ours.identifiers, [CS.IDENTIFIER]) && ours.teamId === CS.TEAM && ours.implicit === false && ours.designated === MI.designatedRequirement({ teamId: CS.TEAM }), 'our own requirement parses back to ONE identifier + the team and equals designatedRequirement\'s text', ours);
  const sp = CS.drSplit(CS.CHROME_DR);
  ok(sp.stderr === `Executable=${CS.CHROME_FILE}\n` && sp.stdout === `designated => ${c.designated}\n` && same(MI.parseDesignatedRequirement(sp.stdout + sp.stderr), c) && MI.parseDesignatedRequirement(CS.CHROME_DR.replace(' = EQHXZ8M8AV', ' = "EQHXZ8M8AV"')).teamId === CS.CHROME_TEAM, 'the Executable line is stderr, the requirement stdout — read in either order; a quoted OU reads the same team', sp);
  ok(MI.parseDesignatedRequirement(CS.CHROME_ASSESS).kind === null && MI.parseDesignatedRequirement('').designated === null && MI.parseDesignatedRequirement(null).kind === null && MI.parseDesignatedRequirement(CS.HELPER_DV).kind === null, 'no designated line (spctl\'s text, a -dv output, empty, null) ⇒ kind null, nothing invented');
  const odd = MI.parseDesignatedRequirement(`designated => identifier "x" and anchor apple generic and certificate leaf[subject.OU] = ${CS.TEAM}`);
  ok(odd.kind === 'other' && same(odd.identifiers, ['x']) && odd.teamId === CS.TEAM && odd.oids.length === 0, 'identifier + team WITHOUT the two Developer ID OIDs is `other` — not a requirement tccd would keep across certificates');
  // requirementVerdict — the agent's question after a developer-id verdict (src/agentd/stream-mac.js identityOf)
  const RV = (req, o) => MI.requirementVerdict(req, o) || '';
  ok(MI.requirementVerdict(ours, { teamId: CS.TEAM }) === null && /a cdhash requirement \(implicit — the grant would die with the next build\)/.test(RV(h, { teamId: CS.TEAM })), 'ours passes; the real ad-hoc helper\'s cdhash requirement is refused by name (implicit, per-build)');
  ok(/it names com\.google\.Chrome \/ com\.google\.Chrome\.beta \/ com\.google\.Chrome\.dev \/ com\.google\.Chrome\.canary by team EQHXZ8M8AV, not com\.google\.Chrome by team EQHXZ8M8AV/.test(RV(c, { teamId: CS.CHROME_TEAM, identifier: CS.CHROME_IDENTIFIER })), 'Chrome\'s four-identifier requirement is not the plain one-identifier requirement a helper must carry — named: what it has, what was asked');
  ok(/it names com\.problemfactory\.vibespace\.screen by team VSTEAM0001, not com\.problemfactory\.vibespace\.screen by team ZZOTHER002/.test(RV(ours, { teamId: CS.OTHER_TEAM })) && /printed no designated requirement/.test(RV(MI.parseDesignatedRequirement(''), { teamId: CS.TEAM })) && /not the Developer ID shape \(identifier "x"/.test(RV(odd, { teamId: CS.TEAM, identifier: 'x' })) && /10 capitals/.test(RV(ours, { teamId: 'bad' })), 'another team, no requirement, a requirement without the OIDs, a malformed team — each refused by name');
  const extra = MI.parseDesignatedRequirement(CS.designated({ team: CS.TEAM }).replace(/\n$/, ' and certificate leaf[subject.CN] = "x"\n'));
  ok(extra.kind === 'developer-id' && /extra clauses: not the plain Developer ID requirement/.test(RV(extra, { teamId: CS.TEAM })), 'the right identifier + team WITH an extra clause (a custom -r) is refused: only THE plain requirement');
  // the agent's third run (src/agentd/stream-mac.js identityOf): only after a developer-id verdict; the requirement READ, not assumed
  const sm = fs.readFileSync(path.join(REPO, 'src/agentd/stream-mac.js'), 'utf8');
  const idf = sm.slice(sm.indexOf('async function identityOf('), sm.indexOf('async function build('));
  const iGate = idf.indexOf("if (id.kind !== 'developer-id') return id;"), iParse = idf.indexOf('MI.parseDesignatedRequirement('), iJudge = idf.indexOf('MI.requirementVerdict(');
  ok(iGate > 0 && iParse > iGate && iJudge > iParse && /requirement: req\.designated/.test(idf) && /kind: 'other'/.test(idf) && !/MI\.designatedRequirement\(/.test(sm.slice(sm.indexOf('function ensure()'))), 'the agent asks `-dr -` only after a developer-id verdict, judges it with requirementVerdict (a refusal is `other` ⇒ helper_unsigned) and records the requirement it READ — ensure() no longer assumes one');
  // RED control: the equality dropped ⇒ another team's requirement passes as ours
  const noEq = SRC_TEXT.replace('if (sameRequirement(req.designated, expect)) return null; // by meaning: the dumper\'s quoting is not a difference', 'return null;');
  ok(noEq !== SRC_TEXT && load(noEq).requirementVerdict(ours, { teamId: CS.OTHER_TEAM }) === null && MI.requirementVerdict(ours, { teamId: CS.OTHER_TEAM }) !== null, 'RED: with the text equality dropped, a requirement naming ANOTHER team passes as ours — the comparison is what bites');
}

console.log('— ⑪ ROUND 3: a digit-first Team ID — the dumper quotes it; the agent compares meaning —');
{
  const RV = (req, o) => MI.requirementVerdict(req, o) || '';
  const dq = MI.parseDesignatedRequirement(CS.designatedDumped({ team: CS.DIGIT_TEAM })), db = MI.parseDesignatedRequirement(CS.designated({ team: CS.DIGIT_TEAM }));
  ok(/^[0-9]/.test(CS.DIGIT_TEAM) && / = "0VSTEAM002"$/.test(dq.designated) && / = 0VSTEAM002$/.test(db.designated) && dq.kind === 'developer-id' && db.kind === 'developer-id' && dq.teamId === CS.DIGIT_TEAM && db.teamId === CS.DIGIT_TEAM && CS.designatedDumped({ team: CS.TEAM }) === CS.designated({ team: CS.TEAM }), 'SYNTHETIC from the dumper\'s rule (no digit-first capture exists yet): a digit-first team\'s requirement in BOTH forms — the OU quoted (what `codesign -dr -` prints) and bare — parses to developer-id by that team; a letter-first team\'s dumped form IS the capture\'s', { dq: dq.designated, db: db.designated });
  ok(MI.requirementVerdict(dq, { teamId: CS.DIGIT_TEAM }) === null, 'the QUOTED form (the dumper\'s) is THE requirement for that team — accepted (a0d876c5f refused it as «extra clauses»)');
  ok(MI.requirementVerdict(db, { teamId: CS.DIGIT_TEAM }) === null && MI.requirementVerdict(MI.parseDesignatedRequirement(CS.designated({ team: CS.TEAM }).replace(` = ${CS.TEAM}\n`, ` = "${CS.TEAM}"\n`)), { teamId: CS.TEAM }) === null, 'the BARE form means the same — accepted; a letter-first team quoted (a dumper that quoted everything) means the same too');
  ok(/ = "0VSTEAM002"$/.test(MI.designatedRequirement({ teamId: CS.DIGIT_TEAM })) && / = VSTEAM0001$/.test(MI.designatedRequirement({ teamId: CS.TEAM })) && same(MI.requirementTokens(dq.designated), MI.requirementTokens(db.designated)) && MI.requirementTokens('identifier "a b" and cdhash H"ab" and certificate 1[field.1.2] /* exists */').join('|') === 'identifier|a b|and|cdhash|H"ab"|and|certificate|1|[field.1.2]|/* exists */' && MI.requirementTokens('').length === 0, 'designatedRequirement EMITS the dumper\'s form (quoted for a digit-first team, bare otherwise — so the release script\'s check passes); requirementTokens: a quoted value equals its bare value, H"…" / [selectors] / comments stay whole; empty ⇒ no tokens (never equal)');
  ok(/it names com\.problemfactory\.vibespace\.screen by team 0VSTEAM002, not com\.problemfactory\.vibespace\.screen by team VSTEAM0001/.test(RV(dq, { teamId: CS.TEAM })) && /extra clauses/.test(RV(MI.parseDesignatedRequirement(CS.designatedDumped({ team: CS.DIGIT_TEAM }).replace(/\n$/, ' and certificate leaf[subject.CN] = "x"\n')), { teamId: CS.DIGIT_TEAM })) && /it names x by team 0VSTEAM002/.test(RV(MI.parseDesignatedRequirement(CS.designatedDumped({ team: CS.DIGIT_TEAM, identifier: 'x' })), { teamId: CS.DIGIT_TEAM })), 'the quoted form still refuses by name: another team, an extra clause, another identifier');
  // RED controls — a bytes-only compare refuses the bare form of a digit-first team as «extra clauses»; round 2's bare emission + bytes-only
  // compare refuses what codesign actually prints for such a team: a0d876c5f's defect, by name
  const EQ = 'if (sameRequirement(req.designated, expect)) return null; // by meaning: the dumper\'s quoting is not a difference';
  const bytesOnly = SRC_TEXT.replace(EQ, 'if (req.designated === expect) return null;');
  const round2 = bytesOnly.replace('certificate leaf[subject.OU] = ${ouText(teamId)}`;', 'certificate leaf[subject.OU] = ${teamId}`;');
  ok(SRC_TEXT.includes(EQ) && bytesOnly !== SRC_TEXT && /extra clauses/.test(load(bytesOnly).requirementVerdict(db, { teamId: CS.DIGIT_TEAM }) || '') && load(bytesOnly).requirementVerdict(dq, { teamId: CS.DIGIT_TEAM }) === null, 'RED: a bytes-only compare refuses the BARE form of a digit-first team as «extra clauses» — the tokens are what bite');
  ok(round2 !== bytesOnly && /extra clauses/.test(load(round2).requirementVerdict(dq, { teamId: CS.DIGIT_TEAM }) || '') && / = 0VSTEAM002$/.test(load(round2).designatedRequirement({ teamId: CS.DIGIT_TEAM })) && load(round2).requirementVerdict(MI.parseDesignatedRequirement(CS.designated({ team: CS.TEAM })), { teamId: CS.TEAM }) === null, 'RED (a0d876c5f): round 2\'s bare emission + bytes-only compare refuses what the dumper prints for a digit-first team (and still passes a letter-first one — the one capture it generalised from)');
}

console.log(`\n${fail ? '✗' : '✓'} test-mac-helper-identity: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
