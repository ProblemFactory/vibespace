#!/usr/bin/env node
// THE ACCOUNT DOOR'S IDENTITY LAW, PURE (B-f4cb, 2026-09-27 — extracted from
// test-channels-accounts when THE TIER RULE in scripts/ci.mjs moved that suite
// to the heavy tier: its engine legs grew to 13 s with 2.369.192's verify
// rounds, over the fast tier's 10 s bound).
//
// The law is a CREDENTIAL law, so its push-blocking half stays in the fast
// tier: a linked account's sign-in can be replaced only by a consent naming
// the SAME person (email case-folded; Lark by open / union / user id), a
// consent naming nobody is refused, and the refusal names both identities.
// src/channel-identity.js is the PURE judge; src/server/channels-engine.js
// calls it at the token door (the connect write, inside the serialized store
// update) and at the rebind. This suite = the judge's table (moved verbatim
// from test-channels-accounts (d)) + the two WIRING pins that the door and the
// rebind really ask it and refuse on its answer. The door's behaviour over the
// real engine — the race matrix, the intruder, the patched-copy control that
// stores a stranger's consent without the check — stays in
// test-channels-accounts (heavy).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { engineSource } from './channels-engine-src.mjs';   // lane dc-channels-seams: the engine + its three family files as one text

const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra !== undefined ? `\n      ${typeof extra === 'string' ? extra : JSON.stringify(extra)}` : '')); } };

console.log('① the PURE identity table (src/channel-identity.js)');
{
  const ID = require(path.join(REPO, 'src/channel-identity.js'));
  const T = [
    [{ email: 'A@x.com' }, { email: 'a@x.com' }, null, 'the same email, case-folded'],
    [{ email: 'a@x.com' }, { email: 'b@x.com' }, 'email', 'another email'],
    [{ openId: 'ou1', unionId: 'on1', userId: 'u1' }, { openId: 'ou2', unionId: 'on2', userId: 'u1' }, null, 'lark: a new app, the same tenant user'],
    [{ openId: 'ou1', unionId: 'on1', userId: 'u1' }, { openId: 'ou2', unionId: 'on1', userId: 'u2' }, null, 'lark: the same developer union id'],
    [{ openId: 'ou1', unionId: 'on1', userId: 'u1' }, { openId: 'ou2', unionId: 'on2', userId: 'u2' }, 'openId', 'lark: another person'],
    [{ openId: 'ou1' }, { email: 'a@x.com' }, null, 'no common key: nothing to judge'],
    [{}, { email: 'a@x.com' }, null, 'a record with no identity accepts the first'],
    [{ email: 'a@x.com' }, {}, null, 'a token naming nobody: nothing for identityMismatch to judge (verify r6: the CONSENT rule refuses it upstream — (f))'],
  ];
  const bad = T.filter(([h, o, k]) => { const m = ID.identityMismatch(h, o); return k === null ? m !== null : !(m && m.key === k); });
  ok(bad.length === 0, `the PURE identity table: ${T.length} rows — ${bad.length} wrong`, JSON.stringify(bad.map((r) => r[3])));
  ok(ID.heldIdentity({ auth: { user: 'Legacy@X.com' } }).email === 'legacy@x.com' && Object.keys(ID.heldIdentity({ auth: { user: 'Member A' } })).length === 0 && ID.heldIdentity({ identity: { email: 'S@x.com' }, auth: { user: 'other@x.com' } }).email === 's@x.com', 'a legacy record (no stamp) is judged by its auth.user only when that is an email; a stamp outranks auth.user');
  ok(ID.heldIdentity({ auth: { user: 'Member A' } }, { openId: 'ou1', name: 'Member A' }).openId === 'ou1' && ID.heldIdentity({ identity: { email: 'S@x.com' } }, { email: 'o@x.com' }).email === 's@x.com' && ID.heldIdentity({ identity: {}, auth: { user: 'L@x.com' } }, null).email === 'l@x.com' && /did not say which account signed in \(profile: 500\)/.test(ID.namelessSentence('Google', 'profile: 500')), 'verify r6: the held identity is read off the token the record HOLDS when it carries no stamp (a legacy Lark record: its open_id; the display name is never an id); a stamp outranks the token; an empty stamp falls through; the nameless sentence');
  ok(/connected as a@x\.com; this sign-in is b@x\.com/.test(ID.mismatchSentence('Mail', { key: 'email', held: 'a@x.com', offered: 'b@x.com' })), 'the refusal sentence names both identities');
  // verify r7: an `email` is an identity only when it LOOKS LIKE AN ADDRESS — a Lark display name with an '@' in it was stamped at boot as an email (a guess), a whitespace / bare-word profile answer bound nothing
  ok(Object.keys(ID.heldIdentity({ auth: { user: 'Alice @ Sales' } })).length === 0 && Object.keys(ID.heldIdentity({ auth: { user: 'alice@corp' } })).length === 0 && Object.keys(ID.identityOf({ email: '   ' })).length === 0 && Object.keys(ID.identityOf({ email: 'not-an-email' })).length === 0 && ID.identityOf({ email: ' A@X.com ' }).email === 'a@x.com' && ID.looksLikeEmail('a@x.com') && !ID.looksLikeEmail('a @ x.com'), 'verify r7: a display name with an @ / a bare word / whitespace is NOBODY (never a guessed email); an address is trimmed + case-folded');
  ok(/was cancelled while it was being completed — nothing was connected/.test(ID.cancelledSentence('Gmail', 'cancelled')) && /replaced by a newer sign-in/.test(ID.cancelledSentence('Gmail', 'superseded')) && /past its time limit/.test(ID.cancelledSentence('Gmail', 'timeout')) && /ended to make room for newer sign-ins/.test(ID.cancelledSentence('Gmail', 'over-limit')) && !/cancelled while/.test(ID.cancelledSentence('Gmail', 'over-limit')), 'verify r7: the cancelled-consent sentence names the cause (client-from-mount verify r4: the consent machine\'s cap has its own words — never "cancelled")');
}

console.log('② the door and the rebind ask the judge and refuse on its answer (src/server/channels-engine.js)');
{
  const src = engineSource(REPO);
  ok(/const \{[^}]*\bidentityMismatch\b[^}]*\bheldIdentity\b[^}]*\} = require\('\.\.\/channel-identity\.js'\);/.test(src), 'the engine takes identityMismatch + heldIdentity from src/channel-identity.js (one judge)');
  // THE DOOR: inside the serialized store update, a consent naming nobody is refused, then the held identity (off the
  // token the record holds) is judged against the offered one and a mismatch writes nothing — then thrown as `forbidden`.
  const door = /await store\.adapters\.update\(\(\) => \{[\s\S]{0,900}?if \(!Object\.keys\(offered\)\.length\) \{ verdict = \{ written: false, nameless: true \}; return; \}[\s\S]{0,200}?const held = heldIdentity\(rec, read\(\)\.token\);\s*const mm = identityMismatch\(held, offered\);\s*if \(mm\) \{ verdict = \{ written: false, mismatch: mm \}; return; \}/;
  ok(door.test(src), 'THE DOOR: inside the serialized store update — a nameless consent refused, the held identity judged against the offered one, a mismatch writes nothing');
  ok(/if \(verdict\.mismatch\) throw new ChannelError\('forbidden', mismatchSentence\(/.test(src) && /if \(verdict\.nameless\) throw new ChannelError\('forbidden', namelessSentence\(/.test(src), '…and the refusal is a `forbidden` naming both identities (or the nameless cause)');
  const rebind = /const held = heldIdentity\(rec, tokensFor\(rec\)\.read\(\)\.token\);\s*const offered = p\.identity \|\| \{\};\s*const mm = identityMismatch\(held, offered\) \|\| \(Object\.keys\(held\)\.length && !Object\.keys\(offered\)\.length \? \{ nameless: true \} : null\);\s*if \(mm\) \{/;
  ok(rebind.test(src), 'THE REBIND: a re-authorize whose consent names another identity (or nobody, over a held one) keeps the account\'s client and token');
  // CONTROLS — the pins are not decorative: the same patterns over a source with the check removed fail.
  const noDoor = src.replace('            if (mm) { verdict = { written: false, mismatch: mm }; return; }\n', '');
  ok(noDoor !== src && !door.test(noDoor), 'CONTROL: the door\'s pin fails on a copy without the mismatch refusal');
  const noRebind = src.replace('const mm = identityMismatch(held, offered) || (Object.keys(held).length && !Object.keys(offered).length ? { nameless: true } : null);', 'const mm = null;');
  ok(noRebind !== src && !rebind.test(noRebind), 'CONTROL: the rebind\'s pin fails on a copy that never asks the judge');
}

console.log(fail ? `FAIL (${fail})` : `ALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
