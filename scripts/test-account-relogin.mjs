#!/usr/bin/env node
// Re-login-on-this-machine (2.332.0): the route's building blocks — the login
// command must target the EXISTING account dir (identity/pool membership
// survive), and the attempt-baseline plumbing must never throw on accounts
// that have no login-status file yet.
import './scratch.mjs';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { anchored } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const { AccountManager } = require('../src/accounts.js');
const { waitEverySave } = require('./lib/accounts-landed.cjs');   // B-574d (line 832 on the 2.369.418 train): accounts.json is the store writer's — a second store over the same data (a restart) reads what the first one's saves wrote: each save waited for here (the suite's thread)
waitEverySave(AccountManager);
const { buildClaudeSubscriptionLoginCommand } = require('../src/claude-subscription-login.js');
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (typeof c !== 'boolean') throw new TypeError(`ok: its condition is a ${typeof c}, not a boolean — the arguments are swapped, or a value stands where a comparison belongs`); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? ' — ' + e : '')); } };

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-relogin-'));
try {
  const am = new AccountManager({ dataDir: tmp });
  const { id } = am.createSubscription({ name: 'ReloginMe' });
  const dir = am.subDir(id);
  const cmd = buildClaudeSubscriptionLoginCommand({ nodeCmd: 'node', helperPath: '/x/helper.mjs', claudeCmd: 'claude', configDir: dir });
  ok(verdictOf(cmd.includes(dir)), 'login command is scoped to the EXISTING account dir', cmd);
  ok(verdictOf(/--config-dir/.test(cmd)), 'dir travels as --config-dir argv — the HELPER sets both config envs itself (env isolation is its contract)');
  ok(am._subscriptionLoginStatus(id) == null || typeof am._subscriptionLoginStatus(id) === 'object',
    'login-status read never throws on a status-less account (baseline=null path)');
  // a token-less husk (the real trigger for this feature) still yields a
  // usable dir + command — re-login needs no remove/re-add
  fs.writeFileSync(path.join(dir, '.credentials.json'), JSON.stringify({ claudeAiOauth: { scopes: [] } }));
  ok(!am.readSubCreds(id).loggedIn, 'husk reads as signed out');
  const cmd2 = buildClaudeSubscriptionLoginCommand({ nodeCmd: 'node', helperPath: '/x/helper.mjs', claudeCmd: 'claude', configDir: am.subDir(id) });
  ok(verdictOf(cmd2.includes(dir)), 'signed-out account still gets a valid re-login command into the SAME dir');

  // ── THE RELOGIN DOOR ON THE ONE COMPARISON (row B-87fd identity unit 3, 主开发 r2533 / r2536): the scenes table, a leg each.
  // BEFORE = what the row's folder names at the «sign in again» press (reloginBegin); AFTER = what it names at the resolve. Every
  // folder here is a stand-in written as the CLI writes it; every address and id is made up.
  const am2 = new AccountManager({ dataDir: path.join(tmp, 'door') });
  const EXP = Date.now() + 29 * 86400e3, ORG = 'org-made-up-1';
  const personOf = (email) => 'p-' + email.split('@')[0] + '-made-up';
  const credsAt = (dir) => path.join(dir, '.credentials.json'), cfgAt = (dir) => path.join(dir, '.claude.json');
  let rteN = 0;   // each sign-in its own login session deadline (refreshTokenExpiresAt): a refresh keeps it, a new sign-in replaces it
  const live = (dir, email, { cfg = true, org = ORG } = {}) => {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(credsAt(dir), JSON.stringify({ claudeAiOauth: { accessToken: 'at-' + email, refreshToken: 'rt-' + email, expiresAt: Date.now() + 3600e3, refreshTokenExpiresAt: EXP + (++rteN), scopes: ['user:inference', 'user:profile'], subscriptionType: 'max' } }));
    if (cfg) fs.writeFileSync(cfgAt(dir), JSON.stringify({ oauthAccount: { emailAddress: email, accountUuid: personOf(email), organizationUuid: org, organizationName: 'Org' } }));
    else fs.rmSync(cfgAt(dir), { force: true });
  };
  const expired = (dir) => { const c = JSON.parse(fs.readFileSync(credsAt(dir), 'utf8')); c.claudeAiOauth.accessToken = 'at-old'; c.claudeAiOauth.refreshToken = 'rt-old'; c.claudeAiOauth.expiresAt = Date.now() - 3600e3; fs.writeFileSync(credsAt(dir), JSON.stringify(c)); };
  // THE CLI's OWN BLANKED RESIDUE (src/login-state.js, src/login-expiry.js): blank tokens, expiresAt 0, the deadline and scopes kept
  const rteOf = (dir) => { try { return JSON.parse(fs.readFileSync(credsAt(dir), 'utf8')).claudeAiOauth.refreshTokenExpiresAt; } catch { return EXP - 1000; } };
  const blank = (dir, o = {}) => fs.writeFileSync(credsAt(dir), JSON.stringify({ claudeAiOauth: { accessToken: '', refreshToken: '', expiresAt: 0, refreshTokenExpiresAt: rteOf(dir), scopes: ['user:inference', 'user:profile'], ...o } }));   // the CLI keeps its login's deadline
  const ours = (dir) => fs.writeFileSync(credsAt(dir), JSON.stringify({ claudeAiOauth: { accessToken: ['made-up', 'long-lived'].join('-'), expiresAt: Date.now() + 300 * 86400e3, scopes: ['user:inference'], subscriptionType: 'max' }, vibespaceOat: { id: 'made-up' } }));
  const row = (email) => { const id = am2.createSubscription({}).id; if (email) { live(am2.subDir(id), email); am2.finalizeSubscription(id); } return id; };
  // THE SIGN-IN HELPER's OWN STATUS (data/bin/vibespace-claude-subscription-login.mjs): «running» at its start, «success» after the vendor's
  // program wrote both files — each with the press's attempt id the login command carries
  const helper = (dir, state, attempt) => fs.writeFileSync(path.join(dir, '.vibespace-login-status.json'), JSON.stringify({ version: 1, state, ...(attempt ? { attempt } : {}), updatedAt: Date.now() }));
  const relogin = (id, as, opts, M = am2) => { const b = M.reloginBegin(id); if (as) { live(M.subDir(id), as, opts); helper(M.subDir(id), 'success', b && b.attempt); } return M.reloginResolve(id); };
  const n0 = () => am2.list().accounts.length;
  const held = (id) => fs.existsSync(path.join(am2.subDir(id), '.vibespace-relogin-held', '.credentials.json'));
  // 1. a refreshable sign-in that only EXPIRED (its tokens and config still there)
  { const s = row('a1@example.invalid'); expired(am2.subDir(s)); const r = relogin(s, 'a1@example.invalid');
    const s2 = row('a2@example.invalid'); expired(am2.subDir(s2)); const k = n0(); const r2 = relogin(s2, 'b2@example.invalid');
    ok(r.outcome === 'same' && r2.outcome === 'split' && n0() === k + 1 && !am2.readSubCreds(s2).loggedIn, 'scene 1 (an expired refreshable sign-in): the same person back ⇒ SAME, in place; another account ⇒ DIFFERENT, a new row, this row signed out', JSON.stringify([r.outcome, r2.outcome])); }
  // 2. signed out BY THE CLI (blanked; the config of that login kept) — BEFORE reads the folder's LAST login (R4)
  { const s = row('a3@example.invalid'); blank(am2.subDir(s)); const r = relogin(s, 'a3@example.invalid');
    const s2 = row('a4@example.invalid'); blank(am2.subDir(s2)); const r2 = relogin(s2, 'b4@example.invalid');
    ok(r.outcome === 'same' && r2.outcome === 'split', 'scene 2 (the CLI ended the sign-in, its config kept): the same person ⇒ SAME by the last login\'s seat; another ⇒ DIFFERENT (never in place: the release\'s name check kept, by the seat)', JSON.stringify([r.outcome, r2.outcome])); }
  // 2b. …and its config cleared too (unproven whether the vendor's sign-out does): the row's NAME (its login's address) checks the read
  { const s = row('a5@example.invalid'); blank(am2.subDir(s)); fs.rmSync(cfgAt(am2.subDir(s))); const r = relogin(s, 'a5@example.invalid');
    const s2 = row('a6@example.invalid'); blank(am2.subDir(s2)); fs.rmSync(cfgAt(am2.subDir(s2))); const r2 = relogin(s2, 'b6@example.invalid');
    ok(r.outcome === 'same' && r2.outcome === 'ask' && gateOf(held(s2)) && !am2.readSubCreds(s2).loggedIn, 'scene 2b (blanked, config cleared): the row\'s name checks the read — equal ⇒ SAME; different ⇒ ASK (the sign-in HELD, not adopted: the row stays signed out) — never a split on a word alone', JSON.stringify([r.outcome, r2.outcome]));
    const listed = am2.list().accounts.find((x) => x.id === s2);
    ok(gateOf(listed) && gateOf(listed.reloginAsk) && JSON.stringify(Object.keys(listed.reloginAsk)) === '["at"]', 'the asked row carries its question as a MARK (when), no identity — the list and its push', listed && listed.reloginAsk);
    const ans = am2.reloginAnswer(s2, 'same');
    ok(ans.outcome === 'same' && gateOf(am2.readSubCreds(s2).loggedIn) && !held(s2) && !am2.list().accounts.find((x) => x.id === s2).reloginAsk, '«the same account: keep this row» ⇒ the held sign-in returns into the row, in place; the question gone', ans.outcome);
    ok(am2.reloginAnswer(s2, 'same').outcome === 'none', 'a second answer ⇒ «none» (nothing asked any more), said by name'); }
  // (b) THE ROW's OWN WORD OUTRANKS THE CONFIG ALONE: a typed address that disagrees with the last login ⇒ a conflict ⇒ ASK
  { const s = row('a7@example.invalid'); am2.setEmail(s, 'c7@example.invalid'); blank(am2.subDir(s)); const r = relogin(s, 'a7@example.invalid');
    ok(r.outcome === 'ask', 'condition (b): blanked, the config names a7 but the row\'s typed address is c7 ⇒ ASK — never «same» on a config against the row\'s own word', r.outcome); }
  // 3. «wiped by the product»: the product never signs a row out — its overwrite of a dead login is the long-lived token: scene 5
  // 4. a row NEVER signed in: a first sign-in names it
  { const s = am2.createSubscription({}).id, s2 = am2.createSubscription({}).id;
    const r = relogin(s, 'a8@example.invalid'), r2 = relogin(s2, 'b8@example.invalid');
    ok(r.outcome === 'same' && r2.outcome === 'same', 'scene 4 (never signed in): any sign-in ⇒ IN PLACE, nothing asked (nothing to disagree with)', JSON.stringify([r.outcome, r2.outcome])); }
  // 5. a row on a LONG-LIVED token (ours), the mint's typed address, the config of an OLD login beside it
  const tokenRow = () => { const s = am2.createSubscription({}).id, d = am2.subDir(s); fs.mkdirSync(d, { recursive: true }); ours(d); fs.writeFileSync(cfgAt(d), JSON.stringify({ oauthAccount: { emailAddress: 'x9@example.invalid', accountUuid: personOf('x9@example.invalid'), organizationUuid: ORG } })); am2.setEmail(s, 'a9@example.invalid'); return s; };
  { const r = relogin(tokenRow(), 'a9@example.invalid'), s2 = tokenRow(), r2 = relogin(s2, 'b9@example.invalid'), r3 = relogin(tokenRow(), 'x9@example.invalid');
    ok(r.outcome === 'same' && r2.outcome === 'ask' && r3.outcome === 'ask', 'scene 5 (a long-lived token row): the same person (the mint\'s address) ⇒ SAME; another ⇒ ASK; the OLD login the config names ⇒ ASK, never «same» by the config beside a token (law 5)', JSON.stringify([r.outcome, r2.outcome, r3.outcome]));
    const k = n0(), ans = am2.reloginAnswer(s2, 'another'), made = am2.list().accounts.find((x) => ans.account && x.id === ans.account.id);
    ok(ans.outcome === 'split' && n0() === k + 1 && gateOf(made) && gateOf(am2.readSubCreds(made.id).loggedIn) && !am2.readSubCreds(s2).loggedIn, '«another account: make a new row» ⇒ a NEW row holds the sign-in; this row stays as it was (signed out)', ans.outcome); }
  // 6. a TYPED address only (a sign-in flow that writes no config)
  { const s = am2.createSubscription({}).id; live(am2.subDir(s), 'a10@example.invalid', { cfg: false }); am2.finalizeSubscription(s); am2.setEmail(s, 'a10@example.invalid');
    const r = relogin(s, 'a10@example.invalid', { cfg: false });
    const s2 = am2.createSubscription({}).id; live(am2.subDir(s2), 'a11@example.invalid', { cfg: false }); am2.finalizeSubscription(s2); am2.setEmail(s2, 'a11@example.invalid');
    const r2 = relogin(s2, 'a11@example.invalid'), s3 = am2.createSubscription({}).id; am2.setEmail(s3, 'a12@example.invalid'); const r3 = relogin(s3, 'b12@example.invalid');
    ok(r.outcome === 'same' && r2.outcome === 'same' && r3.outcome === 'ask', 'scene 6 (a typed address only): AFTER names nothing read ⇒ IN PLACE; AFTER names the typed address ⇒ SAME; another address ⇒ ASK', JSON.stringify([r.outcome, r2.outcome, r3.outcome])); }
  // MOVED: the sign-in is another row's — its record (read facts) is «same»
  { const o = row('m1@example.invalid'), s = row('a13@example.invalid'); const r = relogin(s, 'm1@example.invalid');
    ok(r.outcome === 'moved' && gateOf(r.movedTo) && r.movedTo.id === o && gateOf(am2.readSubCreds(o).loggedIn) && !am2.readSubCreds(s).loggedIn, 'another row whose record is «same» ⇒ MOVED into it (its read facts, never a word)', JSON.stringify(r)); }
  // ── r2734 MUST 1: THE RESOLVE JUDGES ONLY A SIGN-IN NEW SINCE THE PRESS — the page polls from the press ──
  const firstPolls = (M) => {
    const s = M.createSubscription({}).id; live(M.subDir(s), 'a30@example.invalid'); M.finalizeSubscription(s); expired(M.subDir(s));   // scene 1, the commonest
    const b = M.reloginBegin(s);
    const r0 = M.reloginResolve(s);                                                              // the first poll: nobody signed in yet
    const kept0 = !!(M._reloginBefore && M._reloginBefore.get(s));
    helper(M.subDir(s), 'running', b.attempt);
    fs.writeFileSync(credsAt(M.subDir(s)), JSON.stringify({ claudeAiOauth: { accessToken: 'at-b30', refreshToken: 'rt-b30', expiresAt: Date.now() + 3600e3, refreshTokenExpiresAt: EXP, scopes: ['user:inference'] } }));
    const r1 = M.reloginResolve(s);                                                              // between the two writes: new credentials, the old config
    live(M.subDir(s), 'b30@example.invalid'); helper(M.subDir(s), 'success', b.attempt);
    const r2 = M.reloginResolve(s);                                                              // the helper's success for THIS press
    return { s, r0: r0.outcome, kept0, r1: r1.outcome, r2: r2.outcome, signedIn: M.readSubCreds(s).loggedIn };
  };
  { const f = firstPolls(am2);
    ok(f.r0 === 'pending' && gateOf(f.kept0) && f.r1 === 'pending' && f.r2 === 'split' && !f.signedIn, 'MUST 1 (scene 1, the page polls from the press): the first poll before any sign-in ⇒ PENDING, BEFORE kept; a poll between the credentials\' write and the config\'s ⇒ PENDING; the helper\'s success for this press with ANOTHER account ⇒ DIFFERENT (a new row) — never in place', JSON.stringify(f));
    const s = row('a31@example.invalid'); expired(am2.subDir(s)); const b = am2.reloginBegin(s);
    const p0 = am2.reloginResolve(s).outcome; live(am2.subDir(s), 'a31@example.invalid'); helper(am2.subDir(s), 'success', b.attempt); const p1 = am2.reloginResolve(s).outcome;
    ok(p0 === 'pending' && p1 === 'same', '…the same person back: PENDING until the helper\'s success, then SAME (in place, no question)', JSON.stringify([p0, p1]));
    const s2 = row('a32@example.invalid'); expired(am2.subDir(s2)); am2.reloginBegin(s2); live(am2.subDir(s2), 'b32@example.invalid'); helper(am2.subDir(s2), 'success', 'rl-an-older-attempt');
    ok(am2.reloginResolve(s2).outcome === 'pending', '…a helper success of ANOTHER attempt (an earlier press) is not this press\'s ⇒ PENDING'); }
  const MUT = mutantCopies('relogin-door', REPO);
  const accSrc = fs.readFileSync(path.join(REPO, 'src/accounts.js'), 'utf8');
  const copyAM = (from, to, why) => { try { return waitEverySave(require(MUT.write('src/accounts.js', anchored(accSrc, from, to, why))).AccountManager); } catch (e) { return { err: e.message }; } };
  const copyAMs = (edits, why) => { try { return waitEverySave(require(MUT.write('src/accounts.js', edits.reduce((s, [from, to]) => anchored(s, from, to, why), accSrc))).AccountManager); } catch (e) { return { err: e.message }; } };
  { const Old = copyAM("    if (!lost ? !(st && st.state === 'success' && st.attempt === kept.attempt) : !!(st && st.state === 'running')) return { outcome: 'pending' };\n", '', 'the release\'s resolve: no new-since-the-press gate (RED)'); // stale-pins: kept — the RED takes the gate out
    ok(!Old.err, 'RED CONTROL built: the resolve without the new-since-the-press gate', Old.err || '');
    if (!Old.err) { const f = firstPolls(new Old({ dataDir: path.join(tmp, 'red-gate') })); ok(f.r0 === 'same' && !f.kept0, 'RED: in that copy the FIRST poll judges the untouched folder «same» and spends BEFORE — the other account then lands with no question', JSON.stringify(f)); } }
  // ── r2734 MUST 2: A ROW THAT ASKS HAS ONE OPEN QUESTION AND NOTHING ELSE MOVES ON IT ──
  const asking = (M) => {
    const s = M.createSubscription({ name: 'Work' }).id; live(M.subDir(s), 'a33@example.invalid'); M.finalizeSubscription(s); M.rename(s, 'Work');   // no word
    blank(M.subDir(s)); fs.rmSync(cfgAt(M.subDir(s)));                                         // nothing to compare ⇒ …
    const b0 = M.reloginBegin(s); live(M.subDir(s), 'b33@example.invalid'); helper(M.subDir(s), 'success', b0.attempt);
    M._reloginBefore.get(s).at = 0;                                                             // a lost before ⇒ ASK (held)
    const r0 = M.reloginResolve(s);
    const again = M.reloginBegin(s);                                                            // the person presses «sign in again» on the asking row
    live(M.subDir(s), 'c33@example.invalid'); helper(M.subDir(s), 'success', again && again.attempt);   // …and signs in as C anyway
    const r1 = M.reloginResolve(s);
    const heldAt = path.join(M.subDir(s), '.vibespace-relogin-held', '.credentials.json'), heldNow = fs.existsSync(heldAt);
    const heldIs = heldNow ? JSON.parse(fs.readFileSync(heldAt, 'utf8')).claudeAiOauth.accessToken : null;   // whose sign-in the question holds
    return { s, r0: r0.outcome, again: typeof again === 'string' ? again : again && 'kept', r1: r1.outcome, asks: !!(M.list().accounts.find((x) => x.id === s) || {}).reloginAsk, heldNow, heldIs };
  };
  { const g = asking(am2);
    ok(g.r0 === 'ask' && g.again === 'ask-open' && g.r1 === 'ask' && gateOf(g.asks) && g.heldIs === 'at-b33@example.invalid', 'MUST 2: on an asking row a sign-in press is REFUSED by name (ask-open), a resolve answers the SAME question and moves nothing — C is not adopted, the mark and the held sign-in stay', JSON.stringify(g));
    const ans = am2.reloginAnswer(g.s, 'same'), held = path.join(am2.subDir(g.s), '.vibespace-relogin-held', '.credentials.json');
    ok(ans.outcome === 'same' && !fs.existsSync(held), '…every road that clears the mark gives the held sign-in back (or a new row takes it): no held sign-in outlives its question', ans.outcome); }
  { const Old = copyAMs([["    if (a.reloginAsk) return { outcome: 'ask', keptName: a.name, ...(a.reloginAsk.lost ? { lost: true } : {}) };\n", ''], ['  _signInAnswer(a, read) { return a && a.reloginAsk ? { loggedIn: false } : read(); }', '  _signInAnswer(a, read) { return read(); }']], 'an asking row whose resolve moves on (RED) — and reads signed in: r4177\'s signed-out read is the check\'s second guard'); // stale-pins: kept — the RED takes the one-open-question check out
    const Old2 = !Old.err ? copyAM("    if (a.reloginAsk) return 'ask-open';\n", '', 'an asking row whose press is taken (RED)') : Old; // stale-pins: kept
    ok(!Old.err && !Old2.err, 'RED CONTROLS built: no ask check in the resolve; no ask check at the press', (Old.err || Old2.err) || '');
    if (!Old.err) { const g = asking(new Old({ dataDir: path.join(tmp, 'red-ask') })); ok(g.heldIs !== 'at-b33@example.invalid', 'RED: without the resolve\'s check the asking row moves on — the question\'s own sign-in is replaced by C\'s', JSON.stringify(g)); }
    if (!Old2.err) { const g = asking(new Old2({ dataDir: path.join(tmp, 'red-press') })); ok(g.again === 'kept', 'RED: without the press\'s check a new BEFORE is taken on an asking row', JSON.stringify(g)); } }
  // ── r2915: A ROW WITH NO TIE ON RECORD (signed in before the tie existed) — SEED IT at the press, never ask ──
  const untie = (M, id) => { const x = M.get(id); delete x.loginTie; if (M._loginTies) M._loginTies.delete(id); M._save(); };
  const preCure = (M, scene) => {
    const s = M.createSubscription({}).id; live(M.subDir(s), 'a40@example.invalid'); M.finalizeSubscription(s); untie(M, s);
    if (scene === 1) expired(M.subDir(s)); else blank(M.subDir(s));
    return relogin(s, 'a40@example.invalid', undefined, M).outcome;
  };
  ok(preCure(am2, 1) === 'same' && preCure(am2, 2) === 'same', 'r2915 MUST: a row with NO tie on record (signed in before the update) — scene 1 and scene 2 with the same person back ⇒ SAME, in place, no question (the press seeds the tie from its own folder)');
  { const NoSeed = copyAMs([["    if (!this._hasTie(id)) this._noteLoginTie(id, { seeded: true });\n", ''], ["      if (seed) { try { this._seedTieAt(id, o); } catch { } }   // a row's own landing seeds a row with no tie (r3022 (2))\n", '']], 'neither the press nor the landing seeds a missing tie (RED)'); // stale-pins: kept — the RED takes both seeds out (unit 4: the landing seeds too)
    ok(!NoSeed.err, 'RED CONTROL built: the press without the seed', NoSeed.err || '');
    if (!NoSeed.err) { const M = new NoSeed({ dataDir: path.join(tmp, 'red-seed') }); ok(preCure(M, 1) === 'ask', 'RED: in that copy the same person back on a pre-update row is ASKED (the commonest scene)'); } }
  const untiedMove = async (M) => {
    const o = M.createSubscription({}).id; live(M.subDir(o), 'm42@example.invalid'); M.finalizeSubscription(o); untie(M, o);
    // as a row signed in before the update is kept: its facts read UNTIED (its stamp moved, so the keeper reads it again)
    fs.utimesSync(credsAt(M.subDir(o)), new Date(), new Date(Date.now() + 5000)); await M.displayRefresh(o);
    const s = M.createSubscription({}).id; live(M.subDir(s), 'a43@example.invalid'); M.finalizeSubscription(s);
    const r = relogin(s, 'm42@example.invalid', undefined, M);
    return { r: r.outcome, to: r.movedTo && r.movedTo.id === o, oIn: M.readSubCreds(o).loggedIn };
  };
  { const u = await untiedMove(am2);
    ok(u.r === 'moved' && gateOf(u.to) && verdictOf(u.oIn), 'r2915 MUST: the OTHER account\'s row with no tie on record TAKES THE MOVE (seeded from its own credentials, read now) — never a duplicate row', JSON.stringify(u));
    const NoSeed2 = copyAMs([["      if (!this._hasTie(x.id)) {", "      if (false) {"], ["      if (seed) { try { this._seedTieAt(id, o); } catch { } }   // a row's own landing seeds a row with no tie (r3022 (2))\n", '']], 'a move target with no tie is seeded neither by the move nor by its landing (RED)'); // stale-pins: kept
    if (!NoSeed2.err) { const u2 = await untiedMove(new NoSeed2({ dataDir: path.join(tmp, 'red-move') })); ok(u2.r === 'split', 'RED: in that copy the untied row of the same account gets a DUPLICATE (a split)', JSON.stringify(u2)); } else ok(false, 'RED CONTROL built: the move without the seed', NoSeed2.err); }
  const mergeTie = (M) => {
    const into = M.createSubscription({}).id; live(M.subDir(into), 'a44@example.invalid'); M.finalizeSubscription(into); untie(M, into);
    const from = M.createSubscription({}).id; live(M.subDir(from), 'a44@example.invalid'); M._noteLoginTie(from); const hadFrom = !!(M._loginTies && M._loginTies.has(from));
    let err = null; try { M.mergeSubscription(from, into, { preferFromCreds: true }); } catch (e) { err = e.message; }
    const tie = M.get(into) && M.get(into).loginTie;
    return { err, carried: !!(tie && tie.rte === rteOf(M.subDir(into))), hadFrom, fromGone: !(M._loginTies && M._loginTies.has(from)) };
  };
  { const g = mergeTie(am2);
    ok(!g.err && gateOf(g.carried) && gateOf(g.hadFrom) && verdictOf(g.fromGone), 'r2915: the MERGE carries the tie onto the survivor (its folder now holds the folded sign-in: its deadline on the row); r2972 5: the folded row\'s fingerprint leaves with it', JSON.stringify(g));
    const NoCarry = copyAMs([["    this._noteLoginTie(intoId, { fresh: true });   // the MERGE carries the tie onto the survivor: its folder now holds the folded sign-in (r2915)\n", ''], ["      if (seed) { try { this._seedTieAt(id, o); } catch { } }   // a row's own landing seeds a row with no tie (r3022 (2))\n", '']], 'the merge carries no tie, nor does the landing (RED)'); // stale-pins: kept — unit 4: the landing seeds too
    if (!NoCarry.err) { const r = mergeTie(new NoCarry({ dataDir: path.join(tmp, 'red-merge') })); ok(!r.carried, 'r2972 2 RED: in a copy without the carry the survivor holds NO tie of its folded sign-in', JSON.stringify(r)); } else ok(false, 'RED CONTROL built: the merge without the carry', NoCarry.err); }
  // r2915 (a): a second press JOINS the run still out; an errored run starts afresh
  const joins = (M) => {
    const s = M.createSubscription({}).id; live(M.subDir(s), 'a45@example.invalid'); M.finalizeSubscription(s); expired(M.subDir(s)); const b1 = M.reloginBegin(s);
    helper(M.subDir(s), 'running', b1.attempt); const b2 = M.reloginBegin(s);
    helper(M.subDir(s), 'error', b1.attempt); const b3 = M.reloginBegin(s);
    return { joined: !!(b2 && b2.attempt === b1.attempt && b2.joined), fresh: !!(b3 && b3.attempt !== b1.attempt) };
  };
  { const j = joins(am2);
    ok(gateOf(j.joined) && verdictOf(j.fresh), 'r2915 (a): a second press while the first run still runs JOINS it (the same attempt, the same command); after an ERRORED run a press starts afresh', JSON.stringify(j));
    const Replace = copyAM("      if (!(st0 && st0.attempt === was.attempt && st0.state === 'error')) return { attempt: was.attempt, joined: true };\n", '', 'a second press replaces the attempt (RED)'); // stale-pins: kept
    if (!Replace.err) { const r = joins(new Replace({ dataDir: path.join(tmp, 'red-join') })); ok(!r.joined, 'r2972 2 RED: in a copy that replaces the attempt the first run is left unjudged (no join)', JSON.stringify(r)); } else ok(false, 'RED CONTROL built: the replaced attempt', Replace.err); }
  // r2972 3: a press that would join a run whose SUCCESS already sits unjudged judges it FIRST, then begins afresh
  const unjudged = (M) => {
    const s = M.createSubscription({}).id; live(M.subDir(s), 'a47@example.invalid'); M.finalizeSubscription(s); expired(M.subDir(s));
    const b1 = M.reloginBegin(s); live(M.subDir(s), 'b47@example.invalid'); helper(M.subDir(s), 'success', b1.attempt);   // the tab closed: nobody resolved it
    const k = M.list().accounts.length, b2 = M.reloginBegin(s);
    return { judged: M.list().accounts.length === k + 1 && !M.readSubCreds(s).loggedIn, fresh: !!(b2 && b2.attempt && b2.attempt !== b1.attempt && !b2.joined) };
  };
  { const u = unjudged(am2);
    ok(gateOf(u.judged) && verdictOf(u.fresh), 'r2972 3: the run\'s success sat unjudged — the second press JUDGES it first (another account ⇒ its own new row) and only then begins afresh: never a second command whose sign-in lands with no watcher', JSON.stringify(u));
    const NoJudge = copyAM("      if (st0 && st0.attempt === was.attempt && st0.state === 'success') { try { this.reloginResolve(id); } catch { } if (this._reloginBefore) this._reloginBefore.delete(id); return this.reloginBegin(id); }\n", '', 'a join onto an unjudged success (RED)'); // stale-pins: kept
    if (!NoJudge.err) { const r = unjudged(new NoJudge({ dataDir: path.join(tmp, 'red-unjudged') })); ok(!r.judged && !r.fresh, 'RED: in that copy the second press joins the run and the success stays unjudged', JSON.stringify(r)); } else ok(false, 'RED CONTROL built: the join onto an unjudged success', NoJudge.err); }
  { const s = row('a51@example.invalid'); blank(am2.subDir(s)); fs.rmSync(cfgAt(am2.subDir(s))); const b = am2.reloginBegin(s);   // scene 2b: the row's word decides
    live(am2.subDir(s), 'b51@example.invalid'); helper(am2.subDir(s), 'success', b.attempt);   // another address, its success left unjudged
    const again = am2.reloginBegin(s), asks = !!(am2.list().accounts.find((x) => x.id === s) || {}).reloginAsk;
    ok(again === 'ask-open' && verdictOf(asks), 'r2972 3: …and when that judgement ASKS, the second press is refused by name (ask-open): the question stands on the row', JSON.stringify({ again, asks })); }
  // r2915 (b): after a restart a status naming some attempt does not vouch — a stale success TIES NOTHING
  { const d = path.join(tmp, 'stale'), A3 = new AccountManager({ dataDir: d });
    const s = A3.createSubscription({}).id; live(A3.subDir(s), 'a46@example.invalid'); A3.finalizeSubscription(s);
    const tie0 = A3.get(s).loginTie.rte, b = A3.reloginBegin(s); live(A3.subDir(s), 'a46@example.invalid'); helper(A3.subDir(s), 'success', b.attempt);
    const B3 = new AccountManager({ dataDir: d }), r = B3.reloginResolve(s);
    ok(r.outcome === 'same' && !B3.get(s).loginTie && verdictOf(tie0), 'r2915 (b) + r2972 1: on the LOST road (a restart) a success naming an attempt this process never saw vouches nothing: the row\'s word settles it (SAME), NO tie is recorded from those credentials, and the row\'s OLD tie is dropped', JSON.stringify({ r: r.outcome, tie: B3.get(s).loginTie, tie0 }));
    const r2 = relogin(s, 'a46@example.invalid', undefined, B3);
    ok(r2.outcome === 'same', 'r2972 1: …so the NEXT press seeds from the folder and the same person back is SAME, never asked', r2.outcome); }
  { const AnyVouch = copyAM("    const vouched = !lost ? true : kept ? !!(st && st.state === 'success' && st.attempt === kept.attempt) : !(st && st.attempt);\n", "    const vouched = !!(st && st.state === 'success');\n", 'any success vouches (RED)'); // stale-pins: kept
    if (!AnyVouch.err) {
      const d = path.join(tmp, 'red-stale'), A4 = new AccountManager({ dataDir: d }); const s = A4.createSubscription({}).id; live(A4.subDir(s), 'a48@example.invalid'); A4.finalizeSubscription(s);
      const tie0 = A4.get(s).loginTie.rte, b = A4.reloginBegin(s); live(A4.subDir(s), 'a48@example.invalid'); helper(A4.subDir(s), 'success', b.attempt);
      const B4 = new AnyVouch({ dataDir: d }); B4.reloginResolve(s);
      ok(!!(B4.get(s).loginTie && B4.get(s).loginTie.rte !== tie0), 'r2972 2 RED: in a copy where ANY success vouches, a stale success records a tie from credentials nobody vouched for', JSON.stringify(B4.get(s).loginTie));
    } else ok(false, 'RED CONTROL built: any success vouches', AnyVouch.err); }
  { const KeepOld = copyAM("    if (!vouched && verdict !== 'ask') this._dropLoginTie(id);\n", '', 'an unvouched outcome keeps the old tie (RED)'); // stale-pins: kept
    if (!KeepOld.err) {
      const d = path.join(tmp, 'red-drop'), A5 = new AccountManager({ dataDir: d }); const s = A5.createSubscription({}).id; live(A5.subDir(s), 'a49@example.invalid'); A5.finalizeSubscription(s);
      const b = A5.reloginBegin(s); live(A5.subDir(s), 'a49@example.invalid'); helper(A5.subDir(s), 'success', b.attempt);
      const B5 = new KeepOld({ dataDir: d }); B5.reloginResolve(s);
      ok(relogin(s, 'a49@example.invalid', undefined, B5).outcome === 'ask', 'r2972 1 RED: in a copy that keeps the old tie the next press does not seed and the same person is ASKED');
    } else ok(false, 'RED CONTROL built: the old tie kept', KeepOld.err); }
  // r2972 1's edge: a REFUSED hold on the lost road keeps the old tie — the unproven sign-in it leaves live in the folder is never a seed.
  // A row with an address for a word is safe either way (the word conflicts with the other account's read); a RENAMED row has no word
  const refusedLost = (C) => {
    const d = path.join(tmp, 'refused-lost-' + C.name), A6 = new AccountManager({ dataDir: d }); const s = A6.createSubscription({}).id; live(A6.subDir(s), 'a50@example.invalid'); A6.finalizeSubscription(s); A6.rename(s, 'Work laptop');
    const tie0 = A6.get(s).loginTie.rte, b = A6.reloginBegin(s), hold = path.join(A6.subDir(s), '.vibespace-relogin-held');
    fs.writeFileSync(hold, 'a file where the hold would go'); live(A6.subDir(s), 'b50@example.invalid'); helper(A6.subDir(s), 'success', b.attempt);
    const B6 = new C({ dataDir: d }), r = B6.reloginResolve(s), kept = !!(B6.get(s).loginTie && B6.get(s).loginTie.rte === tie0);
    fs.rmSync(hold); return { r: r.outcome, kept, next: relogin(s, 'b50@example.invalid', undefined, B6).outcome };
  };
  { const f = refusedLost(AccountManager);
    ok(f.r === 'refused' && gateOf(f.kept) && f.next === 'ask', 'r2972 1: after a restart a RENAMED row (no word) whose other-account sign-in could not be held is REFUSED and KEEPS its old tie — so the next press, that same other account again, is ASKED (never seeded from the unproven sign-in and silently adopted)', JSON.stringify(f));
    const Unguarded = copyAM("    if (!vouched && verdict !== 'ask') this._dropLoginTie(id);", "    if (!vouched) this._dropLoginTie(id);", 'the drop also on a refused hold (RED)'); // stale-pins: kept
    if (!Unguarded.err) { const r = refusedLost(Unguarded); ok(r.r === 'refused' && !r.kept && r.next === 'same', 'RED: in a copy that drops the tie on the refusal too, the next press seeds from the unproven sign-in and adopts the other account SILENTLY', JSON.stringify(r)); } else ok(false, 'RED CONTROL built: the drop on a refused hold', Unguarded.err); }
  // r2915 (d): the two refusals reach the page in the person's language
  { const MAsrc = fs.readFileSync(path.join(REPO, 'src/lib/manage-agents.js'), 'utf8'), zh = fs.readFileSync(path.join(REPO, 'src/lib/i18n-zh.js'), 'utf8'), ja = fs.readFileSync(path.join(REPO, 'src/lib/i18n-ja.js'), 'utf8');
    const words = ['Answer the question on this row first — its two presses are right there.', 'The new sign-in could not be set aside to ask about it, so this row was not asked — sign in again.'];
    ok(gateOf(MAsrc.includes("r?.code === 'relogin_ask_open' ? t('" + words[0] + "')")) && gateOf(MAsrc.includes("fin?.outcome === 'refused'")) && gateOf(MAsrc.includes("t('" + words[1] + "')")) && verdictOf(words.every((w) => zh.includes(JSON.stringify(w) + ':') && ja.includes(JSON.stringify(w) + ':'))), 'r2915 (d): the press\'s refusal (by its code) and the hold\'s refusal go through t(), with zh and ja rows'); }
  // ── r2734's REQUIRED LINE and smalls ──
  { const R = fs.readFileSync(path.join(REPO, 'src/server/account-usage-routes.js'), 'utf8');
    const ans = R.slice(R.indexOf("app.post('/api/accounts/:id/relogin-answer'"), R.indexOf("app.post('/api/accounts/:id/relogin-answer'") + 400), start = R.slice(R.indexOf("app.post('/api/accounts/:id/relogin',"), R.indexOf("app.post('/api/accounts/:id/relogin-finalize'"));
    ok(verdictOf(/^app\.post\('\/api\/accounts\/:id\/relogin-answer', \(req, res\) => \{\n\s*try \{\n\s*if \(isAgentBearer\(req\)\) return res\.status\(403\)\.json\(\{ error: 'human-triggered only', code: 'agent_forbidden' \}\);/.test(ans)), 'REQUIRED LINE: the answer route refuses an agent\'s or a job\'s own sign-in by name, first, as its sibling routes do');
    ok(gateOf(start.includes("if (begun === 'ask-open') return res.status(409).json({ error: 'answer the question on this row first — its two presses are right there', code: 'relogin_ask_open' });")) && verdictOf(start.includes('attempt: begun && begun.attempt')), 'the press route refuses an asking row by name (the door named) and hands the login command the press\'s attempt'); }
  { const s = row('a34@example.invalid'); blank(am2.subDir(s)); fs.rmSync(cfgAt(am2.subDir(s))); const b = am2.reloginBegin(s);
    fs.writeFileSync(path.join(am2.subDir(s), '.vibespace-relogin-held'), 'a file where the hold would go');   // the move into the hold cannot happen
    live(am2.subDir(s), 'b34@example.invalid'); helper(am2.subDir(s), 'success', b.attempt);
    let threw = null, r = null; try { r = am2.reloginResolve(s); } catch (e) { threw = e.message; }
    ok(!threw && gateOf(r) && r.outcome === 'refused' && r.code === 'relogin_hold_failed' && !am2.list().accounts.find((x) => x.id === s).reloginAsk, '(a) + r2915 (c): a sign-in that could not be moved into the hold: REFUSED by name in an ANSWER the page shows and stops on (never a throw polled every 3 s), the row NOT asking', JSON.stringify({ threw, r })); }
  { const src = path.join(tmp, 'mv2-src'), dst = path.join(tmp, 'mv2-dst'); live(src, 'a35@example.invalid', { cfg: false }); fs.mkdirSync(cfgAt(src)); live(dst, 'old@example.invalid');
    const n = am2._moveLogin(src, dst);
    ok(n === 1 && gateOf(fs.existsSync(credsAt(dst))) && !fs.existsSync(cfgAt(dst)), '(b) the config\'s rename FAILS (not ENOENT) after the credentials moved ⇒ the destination\'s old config is removed — never new credentials beside an old record', n); }
  { const body = accSrc.slice(accSrc.indexOf('  reloginResolve(id) {'), accSrc.indexOf('  reloginAnswer(id, answer) {'));
    const mark = body.indexOf("a.reloginAsk = { at: Date.now()"), save = body.indexOf("this._save({ now: true, why: 'the question about the new sign-in' });", mark), move = body.indexOf("this._moveLogin(src, path.join(src, RELOGIN_HELD))");
    ok(mark > 0 && save > mark && move > save, '(c) the mark is on disk BEFORE the move into the hold (a crash between leaves a question that can be answered) — by the store writer\'s synchronous road (B-574d; the order itself: test-accounts-store-writer H1)', { mark, save, move }); }
  { const MAsrc = fs.readFileSync(path.join(REPO, 'src/lib/manage-agents.js'), 'utf8');
    ok(gateOf(MAsrc.includes('if (reloginAnswering.has(target)) return;')) && verdictOf(MAsrc.includes('.finally(() => reloginAnswering.delete(target));')), '(e) the two presses take one press at a time: a second press while the first is out does nothing'); }
  // A LOST BEFORE: a restart between the press and the resolve (a new store on the same data), and a before past its time
  { const d = path.join(tmp, 'restart'), A = new AccountManager({ dataDir: d });
    const att = {};
    const mk = (email, name) => { const id = A.createSubscription({}).id; live(A.subDir(id), email); A.finalizeSubscription(id); if (name) A.rename(id, name); att[id] = A.reloginBegin(id).attempt; return id; };
    const sWord = mk('a14@example.invalid'), sNone = mk('a15@example.invalid', 'Work laptop'), sEq = mk('a16@example.invalid');
    for (const [id, as] of [[sWord, 'b14@example.invalid'], [sNone, 'b15@example.invalid'], [sEq, 'a16@example.invalid']]) { live(A.subDir(id), as); helper(A.subDir(id), 'success', att[id]); }
    const B = new AccountManager({ dataDir: d });   // the hub restarted: the kept BEFOREs are gone
    const rW = B.reloginResolve(sWord), rN = B.reloginResolve(sNone), rE = B.reloginResolve(sEq);
    ok(rW.outcome === 'ask' && rW.lost === true && rN.outcome === 'ask' && rN.lost === true && rE.outcome === 'same', 'a LOST before (a restart; the helper\'s success landed): the row\'s own word checks the read (equal ⇒ SAME, else ASK); no word ⇒ ASK — and the question SAYS it could not be compared', JSON.stringify([rW, rN, rE].map((x) => [x.outcome, x.lost])));
    ok(B.list().accounts.find((x) => x.id === sWord).reloginAsk.lost === true, '…the row\'s question carries «lost» (its words say the sign-in finished across a restart)');
    const s = row('a17@example.invalid'); const b17 = am2.reloginBegin(s); am2._reloginBefore.get(s).at = 0; live(am2.subDir(s), 'b17@example.invalid'); helper(am2.subDir(s), 'success', b17.attempt);
    const rT = am2.reloginResolve(s);
    ok(rT.outcome === 'ask' && rT.lost === true, 'a before kept past its time (30 min) counts as LOST', JSON.stringify(rT)); }
  // THE ANSWER's edges: nothing held any more ⇒ «gone»; an answer that is neither ⇒ refused by name
  { const s = row('a18@example.invalid'); blank(am2.subDir(s)); fs.rmSync(cfgAt(am2.subDir(s))); relogin(s, 'b18@example.invalid');
    fs.rmSync(path.join(am2.subDir(s), '.vibespace-relogin-held'), { recursive: true, force: true });
    fs.writeFileSync(cfgAt(am2.subDir(s)), '{"marker":1}');   // a file of the row's own: a «gone» answer must not touch it
    let refused = null; try { am2.reloginAnswer(s, 'maybe'); } catch (e) { refused = e.message; }
    ok(am2.reloginAnswer(s, 'same').outcome === 'gone' && gateOf(/same.*another/.test(refused || '')) && fs.readFileSync(cfgAt(am2.subDir(s)), 'utf8') === '{"marker":1}', 'nothing held any more ⇒ «gone», the row\'s own files untouched; an answer that is neither press ⇒ refused by name', refused); }
  // MOVING A SIGN-IN moves both files; a file it lacks is REMOVED at the destination (else a config of the old login stays beside new credentials)
  { const src = path.join(tmp, 'mv-src'), dst = path.join(tmp, 'mv-dst'); live(src, 'a19@example.invalid', { cfg: false }); live(dst, 'old@example.invalid');
    const n = am2._moveLogin(src, dst);
    ok(n === 1 && gateOf(fs.existsSync(credsAt(dst))) && !fs.existsSync(cfgAt(dst)), 'a moved sign-in without a config REMOVES the destination\'s old config (law (5)\'s class: no stale record beside new credentials)', n); }
  // R4's READER — THE RESIDUE BY ITS EXACT SHAPE, nothing looser (condition (a)); it feeds nothing else (law 5 untouched)
  { const { get: harnessOf } = require('../src/harnesses');
    const CL = harnessOf('claude').creds;
    const rd = { facts: (f) => ({ text: fs.readFileSync(f, 'utf8') }), readText: (f) => fs.readFileSync(f, 'utf8') };
    const at = (name, write) => { const d = path.join(tmp, 'r4-' + name); live(d, 'a20@example.invalid'); if (write) write(d); return d; };
    const exact = at('exact', (d) => blank(d)), lst = CL.folderLastLoginOf(exact, rd);
    ok(gateOf(lst) && lst.email === 'a20@example.invalid' && lst.seat === personOf('a20@example.invalid') && lst.orgId === ORG, 'the CLI\'s exact blanked residue ⇒ the config\'s last login', lst);
    const not = {
      'a long-lived token (ours)': at('oat', (d) => ours(d)),
      'a long-lived token pasted (no mark, no refresh token)': at('pasted', (d) => fs.writeFileSync(credsAt(d), JSON.stringify({ claudeAiOauth: { accessToken: 'made-up', expiresAt: 0, scopes: ['user:inference'] } }))),
      'a live refreshable sign-in': at('live'),
      'an expired refreshable sign-in': at('expired', (d) => expired(d)),
      'a missing file': at('missing', (d) => fs.rmSync(credsAt(d))),
      'a malformed file': at('malformed', (d) => fs.writeFileSync(credsAt(d), '{not json')),
      'no scopes': at('noscopes', (d) => blank(d, { scopes: [] })),
      'a non-zero expiresAt': at('expiresat', (d) => blank(d, { expiresAt: 5 })),
      'a refresh token left': at('refresh', (d) => blank(d, { refreshToken: 'x' })),
      'no deadline': at('nodeadline', (d) => blank(d, { refreshTokenExpiresAt: undefined })),
      'tokens absent (not blank strings)': at('absent', (d) => blank(d, { accessToken: undefined, refreshToken: undefined })),
    };
    const wrong = Object.entries(not).filter(([, d]) => CL.folderLastLoginOf(d, rd) !== null).map(([k]) => k);
    ok(wrong.length === 0, `NOT the residue ⇒ null — ${Object.keys(not).length} shapes, a leg each (condition (a): the exact shape, nothing looser)`, wrong.join(' ; '));
    ok(CL.folderLastLoginOf(exact) === null, 'no default reader ⇒ null');
    ok(CL.folderIdentityOf(exact, rd) === null, 'it feeds nothing else: who the residue\'s folder IS stays nothing (claudeFolderIdentity, law 5 untouched)'); }
  // THE ROW's QUESTION, rendered by the real accounts dialog code (a fake DOM): one sentence, two presses named by what they do
  { let MA = null, why = null;
    try {
    const esbuild = require(path.join(REPO, 'node_modules/esbuild'));
    const stub = { name: 'stub', setup(b) { b.onResolve({ filter: /build-version\.js$/ }, () => ({ path: 'bv', namespace: 'stub' })); b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: "export const BUILD_VERSION = 'test';", loader: 'js' })); } };
    const out = await esbuild.build({ entryPoints: [path.join(REPO, 'src/lib/manage-agents.js')], bundle: true, write: false, format: 'iife', globalName: 'MA', platform: 'browser', target: 'es2022', logLevel: 'silent', loader: { '.css': 'text' }, plugins: [stub] });
    const vm = require('node:vm');
    const el = () => new Proxy(function () { }, { get: (t, k) => (k === Symbol.toPrimitive ? () => '' : el()), apply: () => el(), construct: () => el(), set: () => true });
    const g = { console, setTimeout, clearTimeout, setInterval, clearInterval, queueMicrotask, URL, URLSearchParams, TextEncoder, TextDecoder, Intl, Date, Math, JSON, Promise, Map, Set, WeakMap, WeakSet, Symbol, Proxy, Reflect, Error, TypeError, RangeError, Array, Object, String, Number, Boolean, RegExp, parseInt, parseFloat, isNaN, isFinite, encodeURIComponent, decodeURIComponent, structuredClone, localStorage: { getItem: () => null, setItem: () => { }, removeItem: () => { } }, navigator: { userAgent: 'node', language: 'en' }, location: { origin: 'http://x', href: 'http://x/', search: '' }, matchMedia: () => ({ matches: false, addEventListener() { }, removeEventListener() { } }), requestAnimationFrame: (f) => setTimeout(f, 0), fetch: async () => ({ ok: false, json: async () => ({}) }) };
    g.document = el(); g.window = g; g.self = g; g.globalThis = g; g.addEventListener = () => { }; g.removeEventListener = () => { }; g.dispatchEvent = () => true;
    vm.createContext(g); vm.runInContext(out.outputFiles[0].text, g, { timeout: 5000 }); MA = g.MA;
    } catch (e) { why = String((e && e.message) || e).slice(0, 200); }
    if (!MA || typeof MA.reloginAskHtml !== 'function') ok(false, 'the real manage-agents renders under a fake DOM', why);
    else {
      const h = MA.reloginAskHtml({ id: 'sub-made-up', reloginAsk: { at: 1 } }), hl = MA.reloginAskHtml({ id: 'sub-made-up', reloginAsk: { at: 1, lost: true } });
      ok(gateOf(h.includes('Is the new sign-in the same account as this row?')) && gateOf(h.includes('data-relogin-answer="same"')) && gateOf(h.includes('data-relogin-answer="another"')) && gateOf(h.includes('The same account: keep this row')) && gateOf(h.includes('Another account: make a new row')) && !/disabled/.test(h), 'the row asks in ONE sentence with TWO presses named by what they do — no greyed control', h);
      ok(gateOf(hl.includes('This sign-in could not be compared with what this row had')) && MA.reloginAskHtml({ id: 'x' }) === '', '(d) a lost before — a restart or its thirty minutes — says it could not be compared with what this row had; nothing asked ⇒ nothing rendered');
      ok(MA.loginExpiryChipHtml({ id: 'sub-made-up', type: 'subscription', reloginAsk: { at: 1 }, loginState: { state: 'logged-out' } }) === '', 'MUST 2: a row that asks offers NO sign-in press beside its question (the chip is not drawn)');
      ok(verdictOf(MA.subIdentHtml({ id: 'sub-made-up', loggedIn: false, facts: { state: 'read' }, reloginAsk: { at: 1 } }, {}).startsWith('<span class="acct-relogin-ask">')), 'the row\'s identity line shows the question first');
    } }
  // ── 主开发 r4177 (B-87fd unit 3's remainder): A STOP BETWEEN THE QUESTION's LANDING AND THE MOVE INTO THE HOLD (r2734 (c)) — the REAL
  // kill at that point (a child of this suite: scripts/fixtures/accounts-relogin-held-kill.cjs), then a FRESH start over the same data.
  // (1) WHILE A ROW ASKS IT READS SIGNED OUT: the move finishes at its first read after a start, before anything can start on it;
  // (2) «another account» takes that sign-in into its new row, never «gone» while it sits in this row; «the same account» puts it back.
  // The REDs are the release's order (no finish, no signed-out read, the answer looking only in the hold, a queued removal) ──
  { const { spawnSync } = require('node:child_process');
    const KILL = path.join(REPO, 'scripts/fixtures/accounts-relogin-held-kill.cjs'), ACCP = path.join(REPO, 'src/accounts.js');
    const who = (dir) => { try { const t = JSON.parse(fs.readFileSync(credsAt(dir), 'utf8')).claudeAiOauth.accessToken || ''; return t.startsWith('at-') ? t.slice(3) : null; } catch { return null; } };
    const inHold = (dir) => fs.existsSync(path.join(dir, '.vibespace-relogin-held', '.credentials.json'));
    let kn = 0;
    const killed = () => {
      const d = path.join(tmp, 'kill-' + (++kn)), out = d + '.json'; fs.mkdirSync(d, { recursive: true });
      const c = spawnSync(process.execPath, [KILL, ACCP, d, 'kill-at-move', out], { encoding: 'utf8', timeout: 60000 });
      let o = {}; try { o = JSON.parse(fs.readFileSync(out, 'utf8')); } catch { }
      return { d, row: o.row, signal: c.signal, notKilled: o.notKilled || null };
    };
    const started = (Cls, k) => {   // a FRESH start over the killed process's data
      const M = new Cls({ dataDir: k.d }), dir = M.subDir(k.row);
      let spawn = null; try { M.resolveForSpawn(k.row); spawn = 'started'; } catch (e) { spawn = String((e && e.message) || e).slice(0, 80); }
      return { M, dir, asks: !!(M.get(k.row) || {}).reloginAsk, signedIn: !!M.readSubCreds(k.row).loggedIn, held: inHold(dir), inRow: who(dir), spawn };
    };
    const tick = () => new Promise((r) => setImmediate(r));   // the run's reads end (src/run-reads.js: one ask per file per synchronous run) — the child wrote meanwhile
    const sameThenKill = (mod, k) => {
      const out = k.d + '-same.json';
      const c = spawnSync(process.execPath, [KILL, mod, k.d, 'same-then-kill', out, k.row], { encoding: 'utf8', timeout: 60000 });
      let o = {}; try { o = JSON.parse(fs.readFileSync(out, 'utf8')); } catch { }
      return { signal: c.signal, answered: o.answered || null };
    };
    const finishSet = (f) => f.asks && !f.signedIn && f.held && f.inRow === null && /not logged in/.test(f.spawn || '');
    // (1) + (2) «another account»
    { const k = killed(), f = started(AccountManager, k);
      ok(k.signal === 'SIGKILL' && !k.notKilled && verdictOf(f.asks), '(c) the REAL kill at the move into the hold (a child: the question on disk, the move never ran) — after a fresh start the row ASKS', JSON.stringify({ signal: k.signal, notKilled: k.notKilled, asks: f.asks }));
      ok(verdictOf(finishSet(f)), 'r4177 (1): WHILE IT ASKS IT READS SIGNED OUT — the store\'s start FINISHED THE MOVE (the sign-in in the hold, none in the row\'s folder) and a conversation on the row is refused by name', JSON.stringify({ signedIn: f.signedIn, held: f.held, inRow: f.inRow, spawn: f.spawn }));
      const n0 = f.M.list().accounts.length, r = f.M.reloginAnswer(k.row, 'another'), nw = r.account && r.account.id;
      ok(r.outcome === 'split' && !!nw && who(f.M.subDir(nw)) === 'b40@example.invalid' && who(f.dir) === null && f.M.list().accounts.length === n0 + 1 && !f.M.get(k.row).reloginAsk, 'r4177 (2): «another account» then takes that sign-in into its NEW row (this row keeps no sign-in, the question gone)', JSON.stringify({ outcome: r.outcome, inNew: nw ? who(f.M.subDir(nw)) : null, inRow: who(f.dir) })); }
    // «the same account»
    { const k = killed(), f = started(AccountManager, k), r = f.M.reloginAnswer(k.row, 'same');
      ok(r.outcome === 'same' && who(f.dir) === 'b40@example.invalid' && !inHold(f.dir) && gateOf(f.M.readSubCreds(k.row).loggedIn) && !f.M.get(k.row).reloginAsk, '«the same account» after that start puts the sign-in back into this row, as today (signed in, no question)', JSON.stringify({ outcome: r.outcome, inRow: who(f.dir), held: inHold(f.dir) })); }
    // a move that CANNOT finish (the hold's place is a file): still signed out while it asks; «another» takes it from the row's own folder
    { const k = killed(), hold = path.join(k.d, 'subs', String(k.row), '.vibespace-relogin-held');
      fs.rmSync(hold, { recursive: true, force: true }); fs.writeFileSync(hold, 'a file where the hold would be');
      const f = started(AccountManager, k);
      ok(gateOf(f.asks) && !f.signedIn && f.inRow === 'b40@example.invalid' && verdictOf(/not logged in/.test(f.spawn || '')), 'r4177 (1): a move that CANNOT finish (the hold\'s place is a file) — the row still asks and reads SIGNED OUT; a conversation on it is refused by name', JSON.stringify({ asks: f.asks, signedIn: f.signedIn, inRow: f.inRow, spawn: f.spawn }));
      const r = f.M.reloginAnswer(k.row, 'another'), nw = r.account && r.account.id;
      ok(r.outcome === 'split' && !!nw && who(f.M.subDir(nw)) === 'b40@example.invalid' && who(f.dir) === null, 'r4177 (2): …and «another account» takes it from the row\'s own folder into its new row — never «gone» while it sits in this row', JSON.stringify({ outcome: r.outcome, inNew: nw ? who(f.M.subDir(nw)) : null, inRow: who(f.dir) }));
      const k2 = killed(), hold2 = path.join(k2.d, 'subs', String(k2.row), '.vibespace-relogin-held');
      fs.rmSync(hold2, { recursive: true, force: true }); fs.writeFileSync(hold2, 'a file where the hold would be');
      const f2 = started(AccountManager, k2), r2 = f2.M.reloginAnswer(k2.row, 'same');
      ok(r2.outcome === 'same' && who(f2.dir) === 'b40@example.invalid' && verdictOf(f2.M.readSubCreds(k2.row).loggedIn), '…and «the same account» finds it in place (same, signed in)', JSON.stringify({ outcome: r2.outcome, inRow: who(f2.dir) })); }
    // ── 主开发 r4200: (1) ONE CHOKE POINT, (2) the signed-out shape only, (3) an answer's move that moved NOTHING — in the world where the
    // move into the hold cannot finish (the hold's place is a file), each with its red ──
    const noHold = () => { const k = killed(), hold = path.join(k.d, 'subs', String(k.row), '.vibespace-relogin-held'); fs.rmSync(hold, { recursive: true, force: true }); fs.writeFileSync(hold, 'a file where the hold would be'); return k; };
    const poolWorld = async (Cls) => {
      const k = noHold(), f = started(Cls, k), o = f.M.createSubscription({}).id; live(f.M.subDir(o), 'o41@example.invalid'); f.M.finalizeSubscription(o);
      let pool = null, err = null; try { pool = f.M.createPool({ name: 'Pool', members: [k.row, o] }).id; } catch (e) { err = String((e && e.message) || e).slice(0, 80); }
      const members = pool ? f.M.poolMembers(pool).map((x) => x.id) : [];
      try { await f.M.displaySettled(); } catch { }
      const listed = f.M.list().accounts.find((x) => x.id === k.row);
      return { k, f, o, members, err, placeable: f.M._placeable('claude', k.row), auth: f.M._readAuthFor('claude', k.row), token: f.M.usageToken(k.row), read: f.M.readSubCreds(k.row), listed: listed ? listed.loggedIn : 'no row' };
    };
    const named = (w, x) => (x === w.k.row ? 'the asking row' : x === w.o ? 'the other row' : x);
    { const w = await poolWorld(AccountManager);
      ok(gateOf(w.f.asks) && !w.members.includes(w.k.row) && gateOf(w.members.includes(w.o)) && w.placeable === false && w.auth.loggedIn === false, 'r4200 (1): ONE CHOKE POINT — an asking member whose move could not finish is NOT among the pool\'s placeable members (the pool\'s own read answers signed out)', JSON.stringify({ members: w.members.map((x) => named(w, x)), placeable: w.placeable, err: w.err }));
      ok(w.token === null && JSON.stringify(w.read) === '{"loggedIn":false}' && JSON.stringify(w.auth) === '{"loggedIn":false}', 'r4200 (2): the asking answer is the SIGNED-OUT SHAPE ONLY — no token (the usage read asks the vendor nothing for it), no identity of the sign-in in question', JSON.stringify({ token: w.token ? 'a token' : null, read: Object.keys(w.read), auth: Object.keys(w.auth) }));
      ok(w.listed === false, '…and the list\'s line of that row reads signed out (the same rule, over the kept display facts)', JSON.stringify({ listed: w.listed })); }
    const refusing = (test) => { const orig = fs.renameSync; fs.renameSync = function (a, b) { if (test(String(a), String(b))) throw Object.assign(new Error('EACCES: permission denied, rename (a placed refusal)'), { code: 'EACCES' }); return orig.call(this, a, b); }; return () => { fs.renameSync = orig; }; };
    const diskAsks = (k) => { try { return !!((JSON.parse(fs.readFileSync(path.join(k.d, 'accounts.json'), 'utf8')).accounts || []).find((x) => x.id === k.row) || {}).reloginAsk; } catch { return null; } };
    const moveFailed = (Cls, answer) => {   // «another»: the sign-in still in the row's own folder, its move OUT refused; «same»: in the hold, its move BACK refused
      const k = answer === 'another' ? noHold() : killed(), f = started(Cls, k), rowDir = f.dir + path.sep, holdDir = path.join(f.dir, '.vibespace-relogin-held') + path.sep;
      const undo = refusing(answer === 'another' ? (a, b) => a.startsWith(rowDir) && !b.startsWith(rowDir) : (a) => a.startsWith(holdDir));
      const n0 = f.M.list().accounts.length; let r = null, err = null;
      try { r = f.M.reloginAnswer(k.row, answer); } catch (e) { err = String((e && e.message) || e).slice(0, 80); } finally { undo(); }
      return { r, err, asks: !!(f.M.get(k.row) || {}).reloginAsk, disk: diskAsks(k), inRow: who(f.dir), held: inHold(f.dir), signedIn: !!f.M.readSubCreds(k.row).loggedIn, rows: [n0, f.M.list().accounts.length] };
    };
    for (const answer of ['another', 'same']) {
      const m = moveFailed(AccountManager, answer);
      ok(!!m.r && m.r.outcome === 'refused' && m.r.code === 'relogin_move_failed' && gateOf(m.asks) && m.disk === true && !m.signedIn && (answer === 'another' ? m.inRow === 'b40@example.invalid' && m.rows[1] === m.rows[0] : verdictOf(m.held)), `r4200 (3): «${answer === 'another' ? 'another account' : 'the same account'}» whose move moves NOTHING (a placed refusal of that rename) — refused BY NAME, the question PUT BACK in memory and on disk, the sign-in still where it sat, the row signed out${answer === 'another' ? ', the new row gone again' : ''}`, JSON.stringify({ outcome: m.r && m.r.outcome, code: m.r && m.r.code, err: m.err, asks: m.asks, disk: m.disk, inRow: m.inRow, held: m.held, signedIn: m.signedIn, rows: m.rows }));
    }
    const GONE = ["    if (!a || !this._heldSignInAt(id)) { this._notify(); return { outcome: 'gone' }; }", "    if (a || !a) { this._notify(); return { outcome: 'gone' }; }"];   // the release: a move that moved nothing answers «gone»
    { const R5 = copyAMs([["  _readAuthFor(be, id) { return this._signInAnswer(this.get(id), () => this._credsOf(be).parseAuth(this._acctDir(be, id))); }", "  _readAuthFor(be, id) { return this._credsOf(be).parseAuth(this._acctDir(be, id)); }"]], 'the pool\'s read around the choke point (31f0ccda6\'s form)');
      const R6 = copyAMs([['  _signInAnswer(a, read) { return a && a.reloginAsk ? { loggedIn: false } : read(); }', '  _signInAnswer(a, read) { return a && a.reloginAsk ? { ...read(), loggedIn: false } : read(); }']], 'the asking answer keeps the parse\'s fields (31f0ccda6\'s spread)');
      const R7 = copyAMs([GONE], 'a move that moved nothing answers «gone» (the release)');
      ok(!R5.err && !R6.err && !R7.err, 'RED CONTROLS built: the read around the choke point; the asking answer with the parse\'s fields; «gone» after a move that moved nothing', [R5.err, R6.err, R7.err].filter(Boolean).join(' ; '));
      if (!R5.err) { const w = await poolWorld(R5); ok(w.placeable === true && verdictOf(w.members.includes(w.k.row)), 'RED: with the pool\'s read around the choke point the asking member IS placeable — a pooled conversation could start on the unproven sign-in', JSON.stringify({ placeable: w.placeable, members: w.members.map((x) => named(w, x)) })); }
      if (!R6.err) { const w = await poolWorld(R6); ok(w.token === 'at-b40@example.invalid', 'RED: with the parse\'s fields kept, the usage read\'s token is the OTHER account\'s (a vendor ask under this row\'s name)', JSON.stringify({ token: w.token ? 'the other account\'s' : null })); }
      if (!R7.err) for (const answer of ['another', 'same']) { const m = moveFailed(R7, answer); ok(!!m.r && m.r.outcome === 'gone' && !m.asks, `RED (the release): «${answer === 'another' ? 'another account' : 'the same account'}» whose move moved nothing answers «gone» and the row no longer asks`, JSON.stringify({ outcome: m.r && m.r.outcome, asks: m.asks })); } }
    // r3782 (主开发 r4177): «the same account»'s removal of the question is ON DISK before the move back
    { const k = killed(); started(AccountManager, k);   // the start sets it aside (as above)
      const c = sameThenKill(ACCP, k); await tick(); const f = started(AccountManager, k);
      ok(c.signal === 'SIGKILL' && c.answered === 'same' && !f.asks && gateOf(f.signedIn) && f.inRow === 'b40@example.invalid', 'r3782 (r4177): a stop RIGHT AFTER «the same account» (the same turn) — the next start does NOT ask again: the question came off on disk before the sign-in moved back', JSON.stringify({ signal: c.signal, answered: c.answered, asks: f.asks, signedIn: f.signedIn, inRow: f.inRow })); }
    // REDS: the release's order
    const NOFIN = ["    this._finishHeldMoves();   // r4177 (1): an asking row whose sign-in never reached the hold — set aside before anything starts on it\n", ''];
    const NOBELT = ['  _signInAnswer(a, read) { return a && a.reloginAsk ? { loggedIn: false } : read(); }', '  _signInAnswer(a, read) { return read(); }'];
    const NOROW = ['    this._finishHeldMove(id);\n    const at = this._heldSignInAt(id);', '    const at = null;'];
    const QUEUED = ["      try { this._save({ now: true, why: 'the answer to the question about the new sign-in' }); }\n      catch (e) { if (e && e.signInSave) { a.reloginAsk = asked; this._save(); this._notify(); } throw e; }\n", '      this._save();\n'];
    { const R1 = copyAMs([NOFIN], 'no finish at the start'), R2 = copyAMs([NOFIN, NOBELT], 'the release: no finish, no signed-out read'), R3 = copyAMs([NOFIN, NOBELT, NOROW, GONE], 'the release\'s answer: only the hold, and «gone» after a move that moved nothing');
      ok(!R1.err && !R2.err && !R3.err, 'RED CONTROLS built: no finish at the start; …and no signed-out read; …and the answer looking only in the hold', [R1.err, R2.err, R3.err].filter(Boolean).join(' ; '));
      if (!R1.err) { const f = started(R1, killed()); ok(gateOf(f.asks) && !f.held && f.inRow === 'b40@example.invalid', 'RED: with no finish at the start the sign-in is still in the row\'s folder while it asks (the hold empty)', JSON.stringify({ held: f.held, inRow: f.inRow })); }
      if (!R2.err) { const f = started(R2, killed()); ok(gateOf(f.asks) && gateOf(f.signedIn) && f.spawn === 'started', 'RED (the release): the row ASKS and yet READS SIGNED IN — a conversation on it STARTS on the unproven sign-in', JSON.stringify({ signedIn: f.signedIn, spawn: f.spawn })); }
      if (!R3.err) { const k = killed(), f = started(R3, k), r = f.M.reloginAnswer(k.row, 'another'); ok(r.outcome === 'gone' && who(f.dir) === 'b40@example.invalid', 'RED (the release): «another account» answers «gone» and LEAVES the other account\'s sign-in in this row', JSON.stringify({ outcome: r.outcome, inRow: who(f.dir) })); } }
    { const P = (() => { try { return MUT.write('src/accounts.js', anchored(accSrc, QUEUED[0], QUEUED[1], 'the release\'s queued removal'), 'queued-same'); } catch (e) { return { err: e.message }; } })();
      ok(typeof P === 'string', 'RED CONTROL built: «the same account» with its removal queued (the release\'s `this._save()`)', P && P.err);
      if (typeof P === 'string') { const k = killed(); started(AccountManager, k); const c = sameThenKill(P, k); await tick(); const f = started(AccountManager, k); ok(c.signal === 'SIGKILL' && gateOf(f.asks) && !f.signedIn, 'RED: with the removal queued, a stop right after «the same account» ASKS AGAIN at the next start (the answered sign-in set aside once more)', JSON.stringify({ signal: c.signal, answered: c.answered, asks: f.asks, signedIn: f.signedIn })); } } }
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
console.log(fail ? `FAIL (${fail})` : `ALL PASS (${pass})`);
process.exit(fail ? 1 : 0); import { verdictOf, gateOf } from './lib/check.mjs';
