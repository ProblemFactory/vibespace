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
//      pinned-adhoc refusal dropped ⇒ an ad-hoc push passes under a pin — each proves the rule above is what bites.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
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

console.log('— ① the designated requirement —');
{
  const dr = MI.designatedRequirement({ teamId: CS.TEAM });
  ok(dr === `identifier "com.problemfactory.vibespace.screen" and anchor apple generic and certificate 1[field.1.2.840.113635.100.6.2.6] /* exists */ and certificate leaf[field.1.2.840.113635.100.6.1.13] /* exists */ and certificate leaf[subject.OU] = "${CS.TEAM}"`, 'the DR = THE identifier + anchor apple generic + the Developer ID OIDs + the Team ID as the leaf\'s OU — no cdhash, no version, no name', dr);
  ok(!/cdhash/i.test(dr) && !/\bvs-/.test(dr), 'nothing in it moves with a rebuild (no cdhash, no helper version)');
  let threw = 0; for (const bad of [{ teamId: 'short' }, { teamId: CS.TEAM, identifier: 'bad id!' }, {}]) { try { MI.designatedRequirement(bad); } catch { threw++; } }
  ok(threw === 3 && MI.HELPER_IDENTIFIER === CS.IDENTIFIER, 'a Team ID is 10 capitals / digits, an identifier is a bundle-id shape; HELPER_IDENTIFIER is the design\'s', { threw });
  ok(Array.isArray(MI.HELPER_TEAM_IDS) && Object.isFrozen(MI.HELPER_TEAM_IDS) && /HELPER_TEAM_IDS = Object\.freeze\(\[\]\)/.test(SRC_TEXT), 'HELPER_TEAM_IDS is a frozen list — EMPTY today (the owner has not enrolled; one commit fills it, design §6.7)', MI.HELPER_TEAM_IDS);
  ok(!/require\(/.test(SRC_TEXT), 'the module imports nothing (PURE)');
}

console.log('— ② parseCodesignInfo over codesign -dv --verbose=4 —');
{
  const a = MI.parseCodesignInfo(CS.adhoc());
  ok(a.signed && a.adhoc && a.teamId === null && a.authority.length === 0 && /^vibespace-screen-[0-9a-f]{40}$/.test(a.identifier) && a.cdhash === 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678' && a.runtime === null && a.flags === '0x2', 'today\'s helper: ad-hoc (Signature=adhoc, flags adhoc, TeamIdentifier=not set), the linker\'s per-build identifier, its cdhash', a);
  const d = MI.parseCodesignInfo(CS.developerId({ notarized: true }));
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
  ok(same(vp.map((x) => [x.file, x.args]), [['/usr/bin/codesign', ['--verify', '--strict', '--verbose=2', '/Users/u/.vibespace/helpers/vibespace-screen-vs-1']], ['/usr/bin/codesign', ['-dv', '--verbose=4', '/Users/u/.vibespace/helpers/vibespace-screen-vs-1']]]) && MI.MAC_CODESIGN === '/usr/bin/codesign', 'verifyPlan: the strict verification FIRST, then the facts — both /usr/bin/codesign (every Mac has it, no CLT needed)', vp);
  ok(same(MI.signArgs({ out: '/w/x' }), ['-s', '-', '-f', '/w/x']) && same(MI.signArgs({ identity: `Developer ID Application: Helper Publisher (${CS.TEAM})`, out: '/w/x' }), ['--sign', `Developer ID Application: Helper Publisher (${CS.TEAM})`, '--options', 'runtime', '--timestamp', '--identifier', CS.IDENTIFIER, '--force', '/w/x']), 'signArgs: ad-hoc without an identity (the cut before any certificate); Developer ID = hardened runtime + a secure timestamp + THE identifier');
  const sh = fs.readFileSync(path.join(REPO, 'scripts/build-mac-helper.sh'), 'utf8');
  ok(/--sign\) SIGN=/.test(sh) && /--identifier\) IDENTIFIER=/.test(sh) && /--notarize\) NOTARIZE=/.test(sh) && /IDENTIFIER="com\.problemfactory\.vibespace\.screen"/.test(sh), 'build-mac-helper.sh takes --sign / --identifier / --notarize; the identifier defaults to the design\'s');
  ok(/codesign --sign "\$SIGN" --options runtime --timestamp --identifier "\$IDENTIFIER" --force/.test(sh) && /codesign --verify --strict --verbose=2/.test(sh) && /codesign -s - -f/.test(sh), 'its signed branch is signArgs\'s argv and verifies strictly; its default branch is the ad-hoc one (unchanged)');
  ok(/vibespace-screen\.identity\.json/.test(sh) && /notarized: notarized === 'true'/.test(sh) && /xcrun notarytool submit .* --keychain-profile "\$NOTARIZE" --wait/.test(sh) && /notarization did not succeed — the signed helper ships without it/.test(sh), 'it writes the identity record (version, sha256, kind, teamId, identifier, notarized) and a failed notarization never fails the build');
  ok(/Authority=Developer ID Application:/.test(sh) && /the signature names no Team ID/.test(sh) && /--notarize needs --sign/.test(sh), 'it refuses by name: a --sign identity that is not Developer ID Application, a signature without a Team ID, --notarize without --sign');
  const sm = fs.readFileSync(path.join(REPO, 'src/agentd/stream-mac.js'), 'utf8');
  const ensure = sm.slice(sm.indexOf('function ensure()'), sm.indexOf('/** What the facts saw'));
  const iJudge = ensure.indexOf('await identityOf(pushed)'), iPlace = ensure.indexOf('fs.renameSync(pushed, P.bin)');
  ok(iJudge > 0 && iPlace > iJudge && /MI\.swapVerdict\(/.test(ensure) && /fs\.unlinkSync\(pushed\)/.test(ensure) && /code: 'helper_unsigned'/.test(ensure), 'the agent\'s ensure(): the pushed file is JUDGED (identityOf → swapVerdict) before it is renamed to the fixed path; a refusal removes it and is named helper_unsigned — the census of the design\'s §2.3');
  ok(/if \(have === version && isFile\(P\.bin\) && !hasPushed\) return Promise\.resolve\(view\(\)\);/.test(ensure), 'the fast path (the version file + the binary, nothing pushed) still runs nothing');
}

console.log('— ⑧ RED controls: patched copies of the module —');
{
  const load = (text) => { const m = { exports: {} }; new Function('module', 'exports', 'require', text)(m, m.exports, () => { throw new Error('imports nothing'); }); return m.exports; };
  ok(load(SRC_TEXT).identityVerdict(MI.parseCodesignInfo(CS.developerId({ team: CS.OTHER_TEAM })), { teamIds: PIN }).kind === 'other', 'the clean copy refuses another team (the control\'s baseline)');
  const noTeam = SRC_TEXT.replace("if (!pins.includes(team)) return { kind: 'other'", "if (false) return { kind: 'other'");
  ok(noTeam !== SRC_TEXT && load(noTeam).identityVerdict(MI.parseCodesignInfo(CS.developerId({ team: CS.OTHER_TEAM })), { teamIds: PIN }).kind === 'developer-id', 'RED: with the Team ID check dropped, ANOTHER team\'s Developer ID signature passes as ours — the check is what bites');
  const noAdhoc = SRC_TEXT.replace("if (pins.length) return refuse(`the pushed helper is ad-hoc signed", "if (false) return refuse(`the pushed helper is ad-hoc signed");
  ok(noAdhoc !== SRC_TEXT && load(noAdhoc).swapVerdict({ incoming: { version: 'v', identity: { kind: 'adhoc' } }, teamIds: PIN }).take === true, 'RED: with the pinned-adhoc refusal dropped, an ad-hoc push is taken under a pin — the refusal is what bites');
  const noIdent = SRC_TEXT.replace("if (base.identifier !== identifier) return { kind: 'other'", "if (false) return { kind: 'other'");
  ok(noIdent !== SRC_TEXT && load(noIdent).identityVerdict(MI.parseCodesignInfo(CS.developerId({ identifier: 'com.example.other' })), { teamIds: PIN }).kind === 'developer-id', 'RED: with the identifier check dropped, a foreign identifier by our team passes — the check is what bites');
}

console.log(`\n${fail ? '✗' : '✓'} test-mac-helper-identity: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
