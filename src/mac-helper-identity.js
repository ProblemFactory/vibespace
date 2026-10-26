'use strict';
/**
 * THE MAC SCREEN HELPER'S IDENTITY (lane apple-signing — docs/design-apple-signing.zh.md §2–§3; the owner 2026-10-26:
 * 「我受不了了，我们来做开发者签名吧」). PURE: imports nothing; the agent, the hub and the release scripts ask it.
 *
 * WHY: macOS keys the Screen Recording grant on the helper's code identity (src/stream-plan.js THE TCC LAW). An ad-hoc
 * signature's identity is its cdhash — every rebuilt helper is a new client and the owner re-grants (helper_changed_regrant).
 * A Developer ID signature's identity is its DESIGNATED REQUIREMENT: the identifier + the Team ID, no hash, no version — tccd
 * stores that requirement per client (the fixed path), so every later build keeps the grant. The ONE re-grant left is the
 * first signed build replacing the ad-hoc one (helper_signed_regrant — «the last time»).
 *
 * THE LAW this file extends: a device re-execs nothing unsigned (CLAUDE.md, design q-042 D2). A helper the hub pushes is
 * judged BEFORE it is put at the fixed path (= before any exec) by `codesign --verify --strict` + `codesign -dv --verbose=4`
 * read through parseCodesignInfo → identityVerdict → swapVerdict (the table in the design's §2.3):
 *   HELPER_TEAM_IDS empty (today)  ad-hoc taken as before · a Developer ID of ANY team / other / unsigned ⇒ helper_unsigned
 *   HELPER_TEAM_IDS pinned          Developer ID by a pinned team with THE identifier taken — also over an installed ad-hoc
 *                                   build of the same version · ad-hoc / other / unsigned ⇒ helper_unsigned (the local build
 *                                   stays the fallback: it is ad-hoc by construction and never pushed)
 * The release record (release/agentd/manifest.json, src/agentd-signature.js) carries the prebuilt's row — helperRow — inside
 * the signed message; the hub pushes only the prebuilt that row names.
 */

const HELPER_IDENTIFIER = 'com.problemfactory.vibespace.screen';
/** The Team ID(s) a device trusts for a pushed helper — EMPTY until the owner enrolls and reports it (one commit, design §6.7). */
const HELPER_TEAM_IDS = Object.freeze([]);
const KINDS = Object.freeze(['developer-id', 'adhoc', 'other', 'unsigned']);
const TEAM_RE = /^[A-Z0-9]{10}$/;
const IDENT_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/;
const SHA_RE = /^[0-9a-f]{64}$/;
const VERSION_RE = /^[A-Za-z0-9._-]{1,40}$/;
const CDHASH_RE = /^[0-9a-f]{40}$/;
const DEV_ID_RE = /^Developer ID Application: (.+) \(([A-Z0-9]{10})\)$/;
const MAC_CODESIGN = '/usr/bin/codesign';

/** The designated requirement codesign writes for a Developer ID signature of `identifier` by `teamId` — what tccd stores. */
function designatedRequirement({ teamId, identifier = HELPER_IDENTIFIER } = {}) {
  if (!TEAM_RE.test(String(teamId || ''))) throw new Error('mac-helper-identity: a Team ID is 10 capitals / digits');
  if (!IDENT_RE.test(String(identifier || ''))) throw new Error('mac-helper-identity: not a code identifier');
  return `identifier "${identifier}" and anchor apple generic and certificate 1[field.1.2.840.113635.100.6.2.6] /* exists */ and certificate leaf[field.1.2.840.113635.100.6.1.13] /* exists */ and certificate leaf[subject.OU] = "${teamId}"`;
}

/** The two codesign runs that judge a file (in this order): the strict verification, then the facts. → [{ file, args }] */
function verifyPlan(bin, codesign = MAC_CODESIGN) {
  return [{ file: codesign, args: ['--verify', '--strict', '--verbose=2', String(bin)] }, { file: codesign, args: ['-dv', '--verbose=4', String(bin)] }];
}

/** The release script's codesign argv: ad-hoc without an identity (today's cut), Developer ID with one (hardened runtime,
 *  a secure timestamp, THE identifier — never the file name's). */
function signArgs({ identity = null, identifier = HELPER_IDENTIFIER, out } = {}) {
  if (!out) throw new Error('mac-helper-identity: signArgs needs the file');
  return identity ? ['--sign', String(identity), '--options', 'runtime', '--timestamp', '--identifier', identifier, '--force', String(out)] : ['-s', '-', '-f', String(out)];
}

/** `codesign -dv --verbose=4` (its stderr) → the facts, or { signed: false } for «code object is not signed at all». */
function parseCodesignInfo(text) {
  const s = String(text || '');
  const info = { signed: false, identifier: null, teamId: null, authority: [], adhoc: false, cdhash: null, runtime: null, format: null, flags: null };
  if (/code object is not signed at all/.test(s)) return info;
  for (const raw of s.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith('CodeDirectory ')) { info.signed = true; const m = /flags=(0x[0-9a-f]+)(\(([^)]*)\))?/.exec(line); if (m) { info.flags = m[1]; if (/\badhoc\b/.test(m[3] || '')) info.adhoc = true; } continue; }
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const k = line.slice(0, eq).trim(), v = line.slice(eq + 1).trim();
    if (k === 'Identifier') info.identifier = v.slice(0, 200) || null;
    else if (k === 'TeamIdentifier') info.teamId = TEAM_RE.test(v) ? v : null;
    else if (k === 'Authority') { if (info.authority.length < 8) info.authority.push(v.slice(0, 200)); }
    else if (k === 'Signature') { if (v === 'adhoc') info.adhoc = true; }
    else if (k === 'CDHash') info.cdhash = CDHASH_RE.test(v) ? v : null;
    else if (k === 'Runtime Version') info.runtime = v.slice(0, 40) || null;
    else if (k === 'Format') info.format = v.slice(0, 120) || null;
  }
  if (info.identifier || info.cdhash) info.signed = true;
  return info;
}

/** The facts → who signed it: developer-id (by a pinned team, THE identifier) / adhoc / other (signed, not ours) / unsigned.
 *  → { kind, teamId, identifier, cdhash, authority, why } */
function identityVerdict(info, { teamIds = HELPER_TEAM_IDS, identifier = HELPER_IDENTIFIER } = {}) {
  const base = { teamId: null, identifier: info && info.identifier ? info.identifier : null, cdhash: info && info.cdhash ? info.cdhash : null, authority: info && Array.isArray(info.authority) ? info.authority.slice(0, 8) : [] };
  if (!info || !info.signed) return { kind: 'unsigned', ...base, why: 'the file is not signed at all' };
  if (info.adhoc) return { kind: 'adhoc', ...base, why: 'ad-hoc signed (its identity is its cdhash)' };
  const leaf = DEV_ID_RE.exec(base.authority[0] || '');
  if (!leaf) return { kind: 'other', ...base, teamId: info.teamId || null, why: `not a Developer ID Application signature (${base.authority[0] || 'no authority'})` };
  const team = leaf[2];
  if (info.teamId && info.teamId !== team) return { kind: 'other', ...base, teamId: team, why: `the certificate names team ${team} but the signature claims ${info.teamId}` };
  if (!base.authority.includes('Apple Root CA') || !base.authority.some((a) => /^Developer ID Certification Authority/.test(a))) return { kind: 'other', ...base, teamId: team, why: 'the certificate chain does not run Developer ID Certification Authority → Apple Root CA' };
  const pins = Array.isArray(teamIds) ? teamIds.filter((t) => TEAM_RE.test(String(t))) : [];
  if (!pins.includes(team)) return { kind: 'other', ...base, teamId: team, why: pins.length ? `signed by team ${team}, not the pinned ${pins.join(' / ')}` : `signed by team ${team}; this agent pins no Team ID yet` };
  if (base.identifier !== identifier) return { kind: 'other', ...base, teamId: team, why: `its identifier is ${base.identifier || 'missing'}, not ${identifier}` };
  return { kind: 'developer-id', ...base, teamId: team, why: `Developer ID by team ${team}` };
}

/** Does a pushed helper go to the fixed path? installed = { version, identity } | null (what is there now; identity null =
 *  put there by an agent that judged nothing), incoming = { version, identity } (identityVerdict's). → { take, code, why } —
 *  code 'helper_unsigned' = a REFUSAL (the file is removed, the state says so); take false with no code = nothing to do. */
function swapVerdict({ installed = null, incoming, teamIds = HELPER_TEAM_IDS } = {}) {
  const id = (incoming && incoming.identity) || { kind: 'unsigned', why: 'no verdict' };
  const pins = (Array.isArray(teamIds) ? teamIds : []).filter((t) => TEAM_RE.test(String(t)));
  const refuse = (why) => ({ take: false, code: 'helper_unsigned', why });
  const same = installed && incoming && installed.version === incoming.version;
  if (id.kind === 'unsigned') return refuse(id.why && id.why !== 'the file is not signed at all' ? `the pushed helper is not signed at all (${id.why})` : 'the pushed helper is not signed at all');
  if (id.kind === 'other') return refuse(`the pushed helper's signature is not ours — ${id.why}`);
  if (id.kind === 'adhoc') {
    if (pins.length) return refuse(`the pushed helper is ad-hoc signed; this agent pins Team ID ${pins.join(' / ')} and takes only a Developer ID build from the hub (a build made here stays the fallback)`);
    if (same) return { take: false, code: null, why: 'this version is installed already' };
    return { take: true, code: null, why: 'ad-hoc, as before (no Team ID pinned yet)' };
  }
  if (id.kind !== 'developer-id') return refuse(`the pushed helper's signature could not be judged (${id.kind})`);
  if (same && installed.identity && installed.identity.kind === 'developer-id') return { take: false, code: null, why: 'the signed helper of this version is installed already' };
  return { take: true, code: null, why: same ? 'the signed build replaces the ad-hoc one of the same version (the last re-grant)' : `the signed build (${id.why})` };
}

/** Does a replaced helper cost the owner a re-grant? Only when the old one held the grant AND the identity changes — a
 *  Developer ID build replacing another of the same team + identifier keeps tccd's requirement (the design's point). */
function regrantVerdict({ wasGranted, from = null, to = null } = {}) {
  if (!wasGranted) return false;
  const dev = (x) => x && x.kind === 'developer-id';
  if (dev(from) && dev(to) && from.teamId === to.teamId && (from.identifier || HELPER_IDENTIFIER) === (to.identifier || HELPER_IDENTIFIER)) return false;
  return true;
}
/** Should the hub push its signed prebuilt over what is installed? Only once a Team ID is pinned and the installed one is not
 *  a Developer ID build (unknown counts as not). */
const wantSigned = (identity, teamIds = HELPER_TEAM_IDS) => (Array.isArray(teamIds) ? teamIds : []).some((t) => TEAM_RE.test(String(t))) && !(identity && identity.kind === 'developer-id');

/** The release record's helper row (release/agentd/manifest.json `helper`, signed into the bundle message) → the row or
 *  null; `helperRowShape` says why a row is malformed (null = fine). */
function helperRow({ version, sha256, identity } = {}) {
  const id = identity && typeof identity === 'object' ? identity : {};
  return { version: String(version || ''), sha256: String(sha256 || '').toLowerCase(), identity: { kind: KINDS.includes(id.kind) ? id.kind : 'unsigned', teamId: TEAM_RE.test(String(id.teamId || '')) ? id.teamId : null, identifier: IDENT_RE.test(String(id.identifier || '')) ? id.identifier : null } };
}
function helperRowShape(row) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return 'the helper row is not an object';
  if (typeof row.version !== 'string' || !VERSION_RE.test(row.version)) return 'the helper row names no version';
  if (typeof row.sha256 !== 'string' || !SHA_RE.test(row.sha256)) return 'the helper row names no sha256';
  const id = row.identity;
  if (!id || typeof id !== 'object' || Array.isArray(id)) return 'the helper row names no identity';
  if (!KINDS.includes(id.kind)) return 'the helper row\'s identity kind is unknown';
  if (id.teamId != null && !TEAM_RE.test(String(id.teamId))) return 'the helper row\'s Team ID is not a Team ID';
  if (id.identifier != null && !IDENT_RE.test(String(id.identifier))) return 'the helper row\'s identifier is not an identifier';
  if (id.kind === 'developer-id' && (!id.teamId || !id.identifier)) return 'a Developer ID row needs its Team ID and identifier';
  return null;
}
/** The row's line inside the signed message (src/agentd-signature.js bundleMessage) — present iff the record carries it. */
const helperRowLine = (row) => `helper ${row.version} ${row.sha256} ${row.identity.kind} ${row.identity.teamId || '-'} ${row.identity.identifier || '-'}`;

module.exports = { HELPER_IDENTIFIER, HELPER_TEAM_IDS, KINDS, MAC_CODESIGN, designatedRequirement, verifyPlan, signArgs, parseCodesignInfo, identityVerdict, swapVerdict, regrantVerdict, wantSigned, helperRow, helperRowShape, helperRowLine };
