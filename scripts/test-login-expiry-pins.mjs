#!/usr/bin/env node
// THE LOGIN-EXPIRY SOURCE PINS (fast, text only — lane text-legs, B-94d3, 主开发 2026-11-17 22:33Z: «a leg that reads only product
// SOURCE TEXT belongs to the fast tier, where every lane's gate sees it in seconds — not in a hosted shard after the train is
// assembled»). MOVED VERBATIM from the heavy scripts/test-login-expiry.mjs (its browser legs and its in-process legs stay there):
// §5 the wiring pins (2.355.0: an unstaged call site keeps unit tests green), §6 ban-safety, and §10's source half — the
// loginStateOf census, the authFor pin, the quota refresh door's pins and the panel-probe census. Each leg reads the product file it
// pins BY NAME (src/accounts.js, src/server/usage-pool-engine.js, src/account-pool-auto.js, server.js, src/usage-routes.js, …), so
// ci.mjs's affected rule selects this suite on any change of one of them; the negative controls moved with their legs.
// Run: node scripts/test-login-expiry-pins.mjs
import './scratch.mjs';   // FIRST (B-ba47): a suite that reads a home or loads a module that does takes the re-home before any of its code (§113 THE ROW: a NEW one takes the import)
import fs from 'node:fs';
import path from 'node:path';
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ck = (n, c) => { if (typeof n !== 'string') throw new TypeError('a leg\'s name is not a string — its arguments are swapped (test-ci-gate-tiers §7b)'); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n); } };

// ── §5 wiring pins (2.355.0: an unstaged call site keeps unit tests green) ──
console.log('— §5 wiring');
{
  const acc = fs.readFileSync(path.join(REPO, 'src/accounts.js'), 'utf8');
  ck('accounts.js exposes loginStateOf through the DESCRIPTOR (never a backend-id branch)', /creds\.loginState|_credsOf\(be\)\?\.loginState/.test(acc) && !/backend === 'claude' \? loginState/.test(acc));
  // B-360d: the row's loginState is the DISPLAY twin — the harness's own reader over the KEPT facts (no file on the loop)
  ck('every subscription row in list() carries loginState (the display twin over the kept facts)', /loginState: this\._loginStateShown\(a\)/.test(acc));
  ck("a pool's row carries its MEMBERS' worst (the display twin)", /loginState: this\.poolLoginStateShown\(a\.id\)/.test(acc));
  // ROUND 2: membership is TWO questions. An explicit list is what the user
  // NAMED (a signed-out member of it IS the finding); an implicit pool's
  // membership is DEFINED as poolMembers(), so an account that is signed out
  // was never a member at all. Round 1 used one over-broad set for both and
  // put a permanent red chip on a healthy pool. §3c is the functional half.
  ck("the pool's login summary asks the EXPLICIT-list question and the IMPLICIT one separately", /_poolLoginCandidates\(poolId\)/.test(acc)
    && /const explicit = Array\.isArray\(a\?\.members\)/.test(acc)
    && /for \(const m of this\.poolMembers\(poolId\)\)/.test(acc));
  ck('...and the CURRENT link target is always in the set, whichever question was asked', /const cur = this\.poolCurrent\(poolId\);[\s\S]{0,240}out\.set\(cur,/.test(acc));

  const eng = fs.readFileSync(path.join(REPO, 'src/server/usage-pool-engine.js'), 'utf8');
  const decides = eng.match(/decidePoolSwitch\(\{[^}]*\}\)/g) || [];
  ck(`every decidePoolSwitch call in the engine passes readLogin (${decides.length} call sites)`, decides.length >= 3 && decides.every((c) => /readLogin/.test(c)));
  const ranks = eng.match(/rankPoolMembers\(\{[\s\S]*?\n?\s*\}\)/g) || [];
  ck(`every rankPoolMembers call in the engine passes readLogin (${ranks.length} call sites)`, ranks.length >= 2 && ranks.every((c) => /readLogin/.test(c)));
  ck('quotaVerdictFor cannot answer "usable" through a dead login', /loginUsable\(li\)/.test(eng) && /re-login needed/.test(eng));
  ck('the auth-failure notice branches on the login STATE (loginWallPhrase) and quotes the deadline only once it has passed (keeping the old wording otherwise)', /\$\{loginWallPhrase\(li\)\}/.test(eng) && /li\.msLeft <= 0 && li\.refreshExpiresAt\)/.test(eng) && /is failing authentication/.test(eng));
  ck('NEGATIVE CONTROL: the rung-branched sentence that narrated a future deadline as a past expiry is gone from the engine', !/login session expired \(refresh token expired at/.test(eng));
  ck('the switch notice names the current member\'s login STATE too (a signed-out login is not "expired")', /from: nameOf\(currentId\), reason: d\.reason,/.test(eng) && /wall: d\.reason === 'login-expired' \? \(\(\) => \{ try \{ const l = accounts\.loginStateOf\(currentId, Date\.now\(\), \{ slot: true \}\); return l \? loginWallPhrase\(l\)/.test(eng) && /'login is signed out': SWITCH_KEYS\.poolSignedOut/.test(eng)); // B-9369: the state rides the builder's `wall`, a key per phrase. The SLOT reading (2026-10-13): a pooled member's token never reaches the pool
  ck('the "nowhere to go" notice reaches the pool-blocked branch for the login wall too', /d\.reason === 'all-logins-expired'\) \{/.test(eng));
  // ROUND 3: the sentence itself moved into the PURE module so §3d can assert
  // the STRING (it was composed inline here, so no test ever read it — and it
  // rendered the current member's dead login as a spent quota bucket). The
  // engine must CALL it and must not have grown a second copy.
  ck('the engine composes the blocked notice through the PURE poolBlockedNotice', /poolBlockedNotice\(d, \{ poolName: a\.name, currentName: nameOf\(currentId\), when: \(ms\) => OF\.when\(ms, \{ now \}\) \}\)/.test(eng)
    && /poolBlockedNotice,? .*= require\('\.\.\/account-pool-auto\.js'\)/.test(eng));
  // INTEGRATION r2: the twin check reads EXECUTABLE lines only. A comment must
  // stay free to quote the retired sentence — this repo's rule is "the comments
  // keep the refutation on record", and the merge's own fix note explains that
  // pre-filtering the candidates degraded the notice back to "wait until a
  // window resets". Matching that quote as if it were a second copy would make
  // the pin punish the record of why it exists.
  const engCode = eng.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
  ck('...and no longer carries an inline twin of it (executable lines: a comment may quote the retired sentence)', !/spent: \$\{dead\}/.test(engCode) && !/Also needing a re-login/.test(engCode) && !/until a window resets/.test(engCode));
  ck('NEGATIVE CONTROL: the same predicate still fires on a real inline twin (an executable line composing the retired sentence)',
    (() => { const twin = engCode + "\n    serverNotice(k, `Pool: no member can serve it — spent: ${dead}. Conversations on it will hit a limit until a window resets.`);"; return /spent: \$\{dead\}/.test(twin) && /until a window resets/.test(twin); })());
  ck('NEGATIVE CONTROL: …and the stripper drops the phrase only on a COMMENT line, never on an executable one (so the pin narrows by line KIND, not by losing the phrase)',
    (() => {
      const strip = (s) => s.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
      return !/until a window resets/.test(strip('  // back into "wait until a window resets": the wall the user'))
        && /until a window resets/.test(strip('    serverNotice(k, `… until a window resets.`);'));
    })());
  ck('...while a switch onto a NEAR-expiry scrap tells the user the reprieve is short', /d\.toLoginNear/.test(eng) && /re-login it in Manage Agents now/.test(eng));
  // B-9369 (主开发 r5165): both surfaces hand their scrap to ONE clause (usage-pool-engine lastResortClause), worded in the page's language —
  // a key per duration unit (now / s / min / h / days), so the words stand five times, once per key, never beside a builder
  ck('...on BOTH switch surfaces — the per-session re-point (plan C) fires far more often than the pool-level one', /last: \{ toLoginNear: ds\.toLoginNear,/.test(engCode) && /last: \{ toLoginNear: d\.toLoginNear,/.test(engCode) && (engCode.match(/re-login it in Manage Agents now/g) || []).length === 5 && (engCode.match(/re-login it in Manage Agents now"\)/g) || []).length === 5);
  const apa = fs.readFileSync(path.join(REPO, 'src/account-pool-auto.js'), 'utf8');
  ck("the pure decision only claims 'all-logins-expired' when the login gate was the ONLY wall", /loginBlocked\.length && !quotaBlockedN\) \? 'all-logins-expired'/.test(apa) && /quotaBlockedN\+\+/.test(apa));
  // ROUND 2 phrasing + ROUND 3 placement, now both in the pure module.
  ck('each blocked member states its OWN state in the notice (never one "expired or is about to" over the whole list)', /loginBlockedText\((?:d\?\.loginBlocked|loginList\.slice\(0, NOTICE_NAMES_MAX\))\)/.test(apa) && !/login session has expired or is about to/.test(apa));
  ck('a MIXED wall (quota emptied the list AND someone needs a re-login) says both halves', /Also needing a re-login: \$\{loginNames\}/.test(apa) && /const also = !namedInWhy && loginNames/.test(apa));
  // ROUND 3: the current member's dead login is a named FIELD, and the quota
  // arrays never carry a login label again.
  ck("the current member's dead login is its own output, never an entry in deadBuckets", /fromLogin: loginWallPhrase\(login\(currentId\)\)/.test(apa)
    && !/deadBuckets: \[\s*\.\.\.\(readLogin/.test(apa));
  ck('...and the notice gives it the re-login remedy instead of the quota one', /Re-login \$\{currentName\} in Manage Agents\./.test(apa) && /const curLoginWall = !!d\?\.fromLogin/.test(apa));
  ck('...and a hard-dead current member may fall back to the NEAR list (the escape is not a voluntary move)', /const usingScraps = !ranked\.length && hardDead && nearRanked\.length > 0/.test(apa));

  ck('a login-expired escape is exempt from the 180s dwell belt (dead login = hard death, and its fromRemaining is null)',
    (eng.match(/ds\.reason !== 'login-expired' && !\(ds\.fromRemaining/g) || []).length === 1 && (eng.match(/d\.reason !== 'login-expired' && !\(d\.fromRemaining/g) || []).length === 1);
  const srv = fs.readFileSync(path.join(REPO, 'server.js'), 'utf8');
  ck('server.js STARTS the watcher (a module nobody starts is a feature nobody has)', /login-expiry-watch\.js'\)\.create\(\{[\s\S]*?\}\); loginExpiryWatch\.start\(\);/.test(srv));
  // 2026-09-07: the login routes must be able to sweep IMMEDIATELY. A watcher
  // whose handle is thrown away can only be polled — the user would keep
  // staring at the item about the login they just fixed for up to 5 minutes.
  ck('server.js KEEPS the handle and hands it to the accounts routes as a lazy getter',
    /const loginExpiryWatch = require\('\.\/src\/server\/login-expiry-watch\.js'\)/.test(srv)
    && /getLoginExpiryWatch: \(\) => \{ try \{ return loginExpiryWatch; \} catch \{ return null; \} \}/.test(srv));
  const aur = fs.readFileSync(path.join(REPO, 'src/server/account-usage-routes.js'), 'utf8');
  ck('the routes destructure it (an unread dep is the 2.355.0 unstaged-wiring class)', /getTelemetry, getUsageHistory, getLoginExpiryWatch(?:, getCliCmds = \(\) => null)?(?:, harnessSetting = null)? \}\) \{/.test(aur) /* int332: lane antigravity-card-fixes appends getCliCmds; 2.369.408: lane usage-predict appends harnessSetting (the vendor's own automatic-read row, one row per vendor) */);
  ck('every login FINALIZE route sweeps, gated on the login having actually succeeded', (() => {
    const calls = (aur.match(/sweepLoginExpiry\('[^']+'\)/g) || []).concat(aur.match(/sweepOnLoginTransition\([^)]*'[^']+'\)/g) || []);
    // B-87fd identity unit 3: the held sign-in's ANSWER is a login route too (a fifth sweep), gated on its account having signed in
    return calls.length === 5
      && /const r = accounts\.reloginAnswer\(req\.params\.id, req\.body && req\.body\.answer\);\n\s*if \(r\?\.account\?\.loggedIn\) \{\n\s*sweepOnLoginTransition\(req\.params\.id, r, 're-login'\);/.test(aur)
      // ROUND 2: gate on reloginResolve's REAL answer. `r.loggedIn` (round 1)
      // is a property that method returns on NONE of its four outcomes.
      // (the gate may now open a BLOCK — the 2026-09-08 login wake hangs on the
      // same `captured` verdict — so the adjacency is bounded, not literal)
      && /const captured = !!r\?\.account\?\.loggedIn \|\| r\?\.outcome === 'moved';\n\s*if \(captured\) \{?\s*\n?\s*sweepOnLoginTransition\(req\.params\.id, r, 're-login'\);/.test(aur)
      && !/if \(r\?\.loggedIn\) sweepLoginExpiry/.test(aur)
      && /const fin = accounts\.finalizeSubscription\(req\.params\.id\);\n\s*if \(fin\?\.loggedIn\) sweepLoginExpiry\('subscription login'\);/.test(aur)
      && /sweepLoginExpiry\('codex device-auth'\)/.test(aur);
  })());
  // ROUND 2: the merge branch's SECOND sweep. The one above `fin` runs while
  // the fresh credentials are still in the throwaway record's dir — it cannot
  // see the survivor's new deadline, which is the whole point.
  ck('...and the auto-merge branch sweeps AGAIN, after mergeSubscription moved the credentials',
    /const merged = accounts\.mergeSubscription\([\s\S]{0,900}?sweepLoginExpiry\('subscription login merge'\);[\s\S]{0,400}?return res\.json\(\{ success: true, \.\.\.fin, merged: true/.test(aur));
  // A route the client POLLS may not carry an unbounded per-call side effect.
  ck('the polled re-login route sweeps on the TRANSITION (a credential fingerprint), never per poll',
    /const lastLoginFingerprint = new Map\(\)/.test(aur)
    && /const loginFingerprint = \(r\) => \{/.test(aur)
    && /const sweepOnLoginTransition = \(id, r, why\) => \{[\s\S]*?if \(lastLoginFingerprint\.get\(id\) === fp\) return false;/.test(aur));
  ck('...and the sweep never throws into the login route (a follow-up must not fail the login)', /const sweepLoginExpiry = \(why\) => \{\n\s*try \{[\s\S]*?\} catch \(e\) \{ console\.log\('\[login-expiry\] immediate sweep failed:'/.test(aur));
  // ONE READER: the chip (roster row `loginState`) and the inbox item both come
  // from the account store — B-360d: the chip from its display twin, the watch
  // from its DECISION road, both the harness's own reader over the SAME kept
  // snapshot. The watch must never grow a credential reader of its own.
  ck('the watch asks the ACCOUNT STORE for the login state — its decision road over the facts the chip is built from',
    /accounts\.decisionLoginStateOf\(a\.id, t[,)]/.test(fs.readFileSync(path.join(REPO, 'src/server/login-expiry-watch.js'), 'utf8')));
  ck('the harness descriptor is the one place that touches the credential FILE (it also reports the last write)', (() => {
    const cl = fs.readFileSync(path.join(REPO, 'src/harnesses/claude.js'), 'utf8');
    return /writtenAt = fx && Number\.isFinite\(fx\.mtimeMs\) \? fx\.mtimeMs : null/.test(cl) && /fx = rd\.facts\(fp\)/.test(cl) && /function claudeLoginState\(dir, now = Date\.now\(\), rd = RR\)/.test(cl) && /return \{ \.\.\.loginState\(raw, now\), writtenAt \}/.test(cl);   // B-403e: the write time from the SAME open the read made (src/run-reads.js facts); B-360d: the reader is handed (default RR) — the accounts list's kept snapshot answers it the same
  })());

  const ma = fs.readFileSync(path.join(REPO, 'src/lib/manage-agents.js'), 'utf8');
  ck('the roster row renders the chip', /loginExpiryChipHtml\(a, \{ local: !selectedHost \}\)/.test(ma) && /<span class="acct-key-main">[^\n]*\$\{extrasTag\}(?:\$\{rowSnap && rowSnap\.u && rowSnap\.u\.windowUnknown \? windowUnknownHtml\(rowSnap\.u\.windowUnknown\) : ''\})?<\/span>/.test(ma));   // B-6a92: the row's «own window unknown» line may follow the extras inside the main cell
  // §5x THE EXTRAS ORDER (2.369.212, owner: "这个登陆过期提示会被备注抢占位置导致看不到" — the
  // extras line was ONE nowrap ellipsis line with the note first and the chip LAST,
  // so a note ate the warning and its re-login button). DOM-free: the REAL helper
  // (sliced out of the source and run) on a row with provenance + a note + an
  // expiring login, through the REAL call site's argument mapping.
  const extrasOrder = (src) => {
    const i = src.indexOf('export function acctExtrasHtml('); if (i < 0) return { ok: false, why: 'no acctExtrasHtml' };
    const body = src.slice(i, src.indexOf('\n}\n', i) + 2).replace(/^export /, '');
    const call = /const extrasTag = acctExtrasHtml\(\{ login: loginTag, oat: oatTag, oatWarn: [^}]*prov: provTag, note: noteTag \}\);/.test(src);
    const fn = new Function(body + '\nreturn acctExtrasHtml;')();
    const chip = ' <span class="acct-blocked-hint acct-login-chip" role="button" data-relogin="s1">login expires in 13 h</span>';
    const note = ' <span class="acct-blocked-hint" title="0248 08">· 0248 08</span>', prov = ' <span class="acct-linked-hint">· from box</span>';
    const warn = ' <span class="acct-blocked-hint" style="color:var(--red,#e55)">· long-lived token expired</span>';
    const h = fn({ login: chip, oat: '', prov, note }), w = fn({ login: chip, oat: warn, oatWarn: true, prov, note });
    const soft = (x) => (x.match(/<span class="acct-extra-soft">([\s\S]*)<\/span><\/span>$/) || [])[1] || '';
    return { ok: call && h.indexOf('acct-login-chip') >= 0 && h.indexOf('acct-login-chip') < h.indexOf('0248 08')
      && !soft(h).includes('acct-login-chip') && soft(h).endsWith(note) && soft(h).indexOf('from box') < soft(h).indexOf('0248 08')
      && w.indexOf('long-lived token expired') < w.indexOf('from box') && !soft(w).includes('long-lived token expired'), call, h };
  };
  const eo = extrasOrder(ma);
  ck('§5x the login chip PRECEDES the note, outside the ellipsis box; provenance then the note LAST inside it; an expiring token warning sits whole beside the chip', eo.ok);
  const oldOrder = ma.replace(/(export function acctExtrasHtml\([^)]*\) \{)[\s\S]*?\n\}\n/, '$1\n  if (!(login || oat || prov || note)) return \'\';\n  return `<span class="acct-key-extra">${prov}${note}${oat}${login}</span>`;\n}\n');
  ck('§5x CONTROL: a patched copy with the OLD order (prov, note, oat, chip on one ellipsis line) goes red', oldOrder !== ma && extrasOrder(oldOrder).ok === false);
  // lane oat-chip-icon r2 — A SEPARATOR STANDS BETWEEN WORDS: after a chip that is its clock alone (or no chip at all) the
  // soft box's first part starts at once; after a WORDED chip its «·» stays. CONTROL: the strip line cut.
  const sepLaw = (src) => {
    const i = src.indexOf('export function acctExtrasHtml('); if (i < 0) return { ok: false };
    const fn = new Function(src.slice(i, src.indexOf('\n}\n', i) + 2).replace(/^export /, '') + '\nreturn acctExtrasHtml;')();
    const quietChip = ' <span class="acct-blocked-hint acct-login-chip acct-login-oat acct-login-quiet" role="button" aria-label="long-lived token only"><svg width="14" height="14"><circle/></svg></span>';
    const worded = ' <span class="acct-blocked-hint acct-login-chip" role="button">login expires in 13 h</span>';
    const note = ' <span class="acct-blocked-hint" title="3548 09">· 3548 09</span>', prov = ' <span class="acct-linked-hint">・box から</span>';
    const soft = (x) => (x.match(/<span class="acct-extra-soft">([\s\S]*)<\/span><\/span>$/) || [])[1] || '';
    const q = soft(fn({ login: quietChip, note })), qp = soft(fn({ login: quietChip, prov, note })), none = soft(fn({ note })), w = soft(fn({ login: worded, prov, note }));
    return { ok: q === ' <span class="acct-blocked-hint" title="3548 09">3548 09</span>' && qp.startsWith(' <span class="acct-linked-hint">box から</span>') && qp.endsWith(note)
      && none === ' <span class="acct-blocked-hint" title="3548 09">3548 09</span>' && w === prov + note, q, qp, none, w };
  };
  const sl = sepLaw(ma);
  ck('§5x r2 (lane oat-chip-icon): after a quiet chip (its clock alone) or no chip, the soft box starts without its «·» (the note «3548 09»; provenance «box から», the note behind it keeps its «·»); after a worded chip every «·» stays', sl.ok, sl);
  const noStrip = ma.replace(/\n  if \(soft && !hard\.replace\([^\n]*\n/, '\n');
  ck('§5x r2 CONTROL: a copy without the strip line keeps the orphan «·» after the quiet chip (red)', noStrip !== ma && sepLaw(noStrip).ok === false);
  ck('the chip ACTION is the existing re-login flow (no second login path)', /acct-login-chip'\)/.test(ma) && /this\._reloginSubscription\(target, targetAcct, refresh\)/.test(ma));
  ck('the chip is an SVG icon, never emoji, and never a literal colour', /ROSTER_ICONS\.CLOCK/.test(ma) && /var\(--red/.test(ma) && !/[\u{1F300}-\u{1FAFF}]/u.test(ma.slice(ma.indexOf('loginExpiryChipHtml'), ma.indexOf('loginExpiryChipHtml') + 3000)));
  const css = fs.readFileSync(path.join(REPO, 'public/style.css'), 'utf8');
  ck('the chip SVG is explicitly sized (an unsized inline SVG swallows the row — 2.369.13)', /\.acct-login-chip svg \{[^}]*width: 10px[^}]*height: 10px/.test(css));
  // THE ROSTER-ICON SIZE CENSUS (lane lapsed-chip-size, 2026-10-09 — the THIRD unsized roster SVG: 2.369.13's
  // login chip, then the lapsed chip's column-wide clock): every ROSTER_ICONS use site in src/lib/*.js, by the class
  // of its nearest wrapping element. Each is sized by a `.<class> svg { width` rule OR by the svg's own width/height
  // (rosterSvg emits them). Every icon token in a file must land on a row — a site the census cannot place is RED.
  const rosterCensus = (files, cssText) => {
    const svgOf = (src) => { const m = src.match(/^const rosterSvg = (\([^\n]*);$/m); try { return m ? new Function('return ' + m[1])()('', 1) : ''; } catch { return ''; } };
    const own = files.map(([, src]) => svgOf(src)).filter(Boolean).every((x) => /\swidth="\d+"/.test(x) && /\sheight="\d+"/.test(x));
    const ruleFor = (c) => { const m = cssText.match(new RegExp('(?:^|[\\s,}])(\\.' + c + ' svg)\\s*(?:,[^{]*)?\\{[^}]*\\bwidth:\\s*([\\d.]+px)', 'm')); return m ? m[1] + ' ' + m[2] : ''; };
    const wrapperAt = (lines, j, at) => { // the statement's text up to the token: a `+ \`…` line continues the one above
      let line = lines[j]; for (let k = j; k > 0 && /^\s*\+ /.test(lines[k]); k--) { line = lines[k - 1] + line; at += lines[k - 1].length; }
      const stack = []; const re = /<(\/?)([a-z]+)\b([^<>]*)>/g; let m;
      while ((m = re.exec(line)) && m.index < at) { if (m[1]) stack.pop(); else if (!/\/$/.test(m[3])) stack.push(m); }
      const w = stack[stack.length - 1]; if (!w) return null;
      return { tag: w[2], cls: ((w[3].match(/class="([^"]*)"/) || [])[1] || '').split(/\s+/).filter((c) => /^[a-z][\w-]*$/.test(c)) };
    };
    const rows = []; let tokens = 0, placed = 0;
    for (const [rel, src] of files) {
      const lines = src.split('\n');
      const names = new Set([...src.matchAll(/const \{([^}]*)\} = ROSTER_ICONS;/g)].flatMap((m) => m[1].split(',').map((x) => x.trim()).filter(Boolean)));
      const iconRe = new RegExp('ROSTER_ICONS\\.[A-Z_]+' + (names.size ? '|\\b(?:' + [...names].join('|') + ')\\b' : ''), 'g');
      lines.forEach((line, i) => {
        if (/^\s+[A-Z_]+: rosterSvg\(|= ROSTER_ICONS;|^\s*\/\/|^\s*\*/.test(line)) return;
        const hits = line.match(iconRe) || []; tokens += hits.length;
        for (const ex of line.matchAll(/\$\{([^{}]*)\}/g)) {
          const icons = ex[1].match(iconRe); if (!icons) continue; placed += icons.length;
          let sites = [{ line: i + 1, w: wrapperAt(lines, i, ex.index) }];
          const v = !sites[0].w && line.match(/^\s*const (\w+) = `/);
          if (v) sites = lines.map((l, j) => [l, j]).slice(i + 1, i + 12).filter(([l]) => l.includes('${' + v[1] + '}'))
            .map(([l, j]) => ({ line: j + 1, via: v[1], w: wrapperAt(lines, j, l.indexOf('${' + v[1] + '}')) }));
          for (const st of sites) {
            const css = st.w ? st.w.cls.map(ruleFor).find(Boolean) || '' : '';
            rows.push({ at: rel + ':' + st.line, icons: [...new Set(icons.map((x) => x.replace('ROSTER_ICONS.', '')))].join('|'), via: st.via || '',
              wrapper: st.w ? '<' + st.w.tag + ' class="' + st.w.cls.join(' ') + '">' : '(none)', css, own, sized: !!st.w && (!!css || own) });
          }
        }
      });
    }
    return { rows, tokens, placed, own };
  };
  const libDir = path.join(REPO, 'src/lib');
  const libFiles = fs.readdirSync(libDir).filter((f) => f.endsWith('.js')).map((f) => ['src/lib/' + f, fs.readFileSync(path.join(libDir, f), 'utf8')]).filter(([, src]) => src.includes('ROSTER_ICONS'));
  const rc = rosterCensus(libFiles, css);
  for (const r of rc.rows) console.log('    ' + r.at + '  ' + r.icons + (r.via ? ' (via ' + r.via + ')' : '') + '  in ' + r.wrapper + '  → ' + (r.css || 'no svg rule') + (r.own ? ' · own 14 px' : '') + (r.sized ? '' : '  ✗ UNSIZED'));
  const wraps = new Set(rc.rows.flatMap((r) => r.wrapper.match(/class="([^"]*)"/)[1].split(' ')));
  ck('roster-icon census: rosterSvg carries its OWN width/height (a wrapper nobody styled gets 14 px, never the column)', rc.own);
  ck('roster-icon census: every ROSTER_ICONS token in src/lib lands on a row (' + rc.placed + '/' + rc.tokens + ' tokens, ' + rc.rows.length + ' rows) and the rows include the login chip and both lapsed-chip wrappers',
    rc.tokens > 0 && rc.placed === rc.tokens && rc.rows.length >= 12 && ['acct-login-chip', 'acct-serve-chip', 'acct-serve-chip-off', 'acct-type-icon', 'acct-icon'].every((c) => wraps.has(c)));
  ck('roster-icon census: every use site is sized (a container svg rule or the svg\'s own size)', rc.rows.length > 0 && rc.rows.every((r) => r.sized));
  ck('roster-icon census: the lapsed chip\'s wrappers carry their own 10 px rule (the login chip\'s size)', rc.rows.filter((r) => /acct-serve-chip/.test(r.wrapper)).every((r) => / 10px$/.test(r.css)));
  const unsizedSvg = libFiles.map(([rel, src]) => [rel, src.replace(/(const rosterSvg = [^\n]*?)<svg width="14" height="14" /, '$1<svg ')]);
  const baseCss = css.replace(/\n\.acct-serve-chip[^\n]*/g, '');
  const rcNoOwn = rosterCensus(unsizedSvg, css), rcBase = rosterCensus(unsizedSvg, baseCss);
  ck('roster-icon census CONTROL: a rosterSvg WITHOUT width/height reds the own-size check', unsizedSvg.some(([, s2], k) => s2 !== libFiles[k][1]) && rcNoOwn.own === false);
  ck('roster-icon census CONTROL: the BASE shape (no own size, no serve-chip rule) is RED for exactly the lapsed chip\'s two wrappers (' + rcBase.rows.filter((r) => !r.sized).map((r) => r.at).join(', ') + ')',
    baseCss !== css && rcBase.rows.filter((r) => !r.sized).length === 2 && rcBase.rows.filter((r) => !r.sized).every((r) => /acct-serve-chip/.test(r.wrapper)));
  const panel = fs.readFileSync(path.join(REPO, 'src/lib/user-todos-panel.js'), 'utf8');
  const inboxModelSrc = fs.readFileSync(path.join(REPO, 'src/lib/user-todos-actions.js'), 'utf8'); // §9 (2026-09-27): jump moved VERBATIM into THE client model the panel calls
  ck("the inbox item's click lands on Manage Agents instead of a dead end", /if \(key === 'accounts'\) \{ close\(\); app\._showAgentsDialog\?\.\(\); return; \}/.test(inboxModelSrc) && /model\.jump\(key, item, \{ close: \(\) => \{ hidePopup\('jump'\); hideHome\(\); \} \}\)/.test(panel)); // lane phone-first-screen: the close steps the phone's page aside too
  // An item that vanishes on its own must SAY it vanished on its own: the
  // resolved tail credits 'agent' for agent-resolved items, and the watch's
  // retraction is neither the user nor an agent.
  ck("the resolved tail labels a watch-retracted item 'automatically' (not the user, not an agent)",
    /by === 'system'\) return t\('automatically'\)/.test(fs.readFileSync(path.join(REPO, 'src/lib/user-todos-row.js'), 'utf8')) && /import \{ renderRow[^}]*\} from '\.\/user-todos-row\.js'/.test(panel)
    /* 2.369.169 (inbox chunk 2) moved every row string into THE row renderer src/lib/user-todos-row.js — its resolvedByText() says it, the panel imports it */);
  // ROUND 3: the item text asks the STATE what happened, not the rung how
  // urgent it is — warnStageFor collapses 'logged-out' onto 'expired'.
  const lew = fs.readFileSync(path.join(REPO, 'src/server/login-expiry-watch.js'), 'utf8');
  ck("the inbox item branches on the login STATE, so a wiped file is never reported as 'expired'", /if \(info\?\.state === 'logged-out'\)/.test(lew)
    && lew.indexOf("info?.state === 'logged-out'") < lew.indexOf("if (stage === 'expired'"));

  // i18n: every user-visible string in the chip has zh + ja
  const zh = fs.readFileSync(path.join(REPO, 'src/lib/i18n-zh.js'), 'utf8');
  const ja = fs.readFileSync(path.join(REPO, 'src/lib/i18n-ja.js'), 'utf8');
  const keys = ['login expires in {left}', 'login expired {when} — re-login', 'login signed out — re-login', '{n} min', '{n} h', '{n} d', 'automatically'];
  ck('every new chip string has a zh entry', keys.every((k) => zh.includes(JSON.stringify(k))));
  ck('every new chip string has a ja entry', keys.every((k) => ja.includes(JSON.stringify(k))));
}

// ── §6 §ban-safety ───────────────────────────────────────────────────────
console.log('— §6 ban-safety');
{
  const pure = fs.readFileSync(path.join(REPO, 'src/login-expiry.js'), 'utf8');
  ck('the pure module imports NOTHING (it is safe in the daemon and the browser)', !/require\(|^import /m.test(pure));
  const w = fs.readFileSync(path.join(REPO, 'src/server/login-expiry-watch.js'), 'utf8');
  // CODE only: the prose in this file legitimately explains refreshTokenExpiresAt,
  // and a census that reads comments would either be permanently red or force the
  // explanation out of the file that needs it.
  const wCode = w.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.replace(/(^|[^:])\/\/.*$/, '$1')).join('\n');
  ck('the watcher constructs no request of any kind (files only)', !/fetch\(|https?\.request|axios|got\(/.test(wCode));
  ck('...and never touches token MATERIAL: it reads verdicts through the account store', !/accessToken|refreshToken|credentials\.json/.test(wCode));
}

// ── §10's SOURCE half (moved from test-login-expiry.mjs §10 — its in-process and browser legs stay there) ─────
console.log('— §10 login × long-lived token: the source pins');
{
  const src = (p) => fs.readFileSync(path.join(REPO, p), 'utf8');
  // CENSUS: every loginStateOf( call in src/ is either a ROW reader (listed) or passes { slot: true }
  // B-360d (lane chrome-157): NONE — list()'s roster row reads its display twin over the KEPT facts, the For-you watch the decision
  // road (decisionLoginStateOf) over the same snapshot; the fresh reader without { slot: true } has no row reader left
  const ROW_READERS = {};
  const rows = [];
  const walk = (d) => { for (const e of fs.readdirSync(path.join(REPO, d), { withFileTypes: true })) { const p = d + '/' + e.name; if (e.isDirectory()) walk(p); else if (/\.(c?js|mjs)$/.test(e.name)) { const t = src(p); const re = /\.loginStateOf\(([^)]*)\)/g; let m; while ((m = re.exec(t))) { if (/^\s*id, now = Date\.now\(\), opts/.test(m[1])) continue; rows.push({ p, slot: /\{ slot: true \}/.test(t.slice(m.index, m.index + 120)) }); } } } };
  walk('src');
  const unslot = rows.filter((r) => !r.slot).reduce((o, r) => ((o[r.p] = (o[r.p] || 0) + 1), o), {});
  console.log('    loginStateOf sites: ' + rows.length + ' (slot ' + rows.filter((r) => r.slot).length + '); row readers ' + JSON.stringify(unslot));
  ck('CENSUS: loginStateOf without { slot: true } in NO row reader (the roster row and the For-you watch read the kept facts — B-360d); every pool reader passes it', JSON.stringify(unslot) === JSON.stringify(ROW_READERS) && rows.filter((r) => r.slot).length >= 6);

  ck('authFor (the no-host rung): a dead dir login with a valid token says how: oat', /const dirDead = loggedIn && hasOat && !loginUsable\(this\.loginStateOf\(a\.id, Date\.now\(\), \{ slot: true \}\)\);\n    if \(!hostFacts\) \{\n      if \(loggedIn && !dirDead\) return/.test(src('src/accounts.js')));

  // THE QUOTA REFRESH DOOR: an oat-only row is refused by name, before any probe spawn
  const ur = src('src/usage-routes.js');
  const fnAt = ur.indexOf('async function refreshViaCliPanel('), refuse = ur.indexOf("acctMeta.loginState.state === 'oat-only'", fnAt), spawnAt = ur.indexOf('spawnPanelProbe(bin', fnAt);
  ck('⟳ / auto-cli door: refreshViaCliPanel refuses an oat-only row (code login) BEFORE the probe spawn', fnAt > 0 && refuse > fnAt && spawnAt > refuse);
  // (lane pool-silent-members acceptance r2) the refusal no longer ENDS the route before its token ladder: the ladder's
  // same-account / identity-group fallbacks (never our long-lived token: usageToken refuses it) are tried first, and the
  // row is refused by name — loginNeeded, its own words — only when no fallback has a token either
  const ladderAt = ur.indexOf('IDENTITY-GROUP fallback (2.266.1'), namedAt = ur.indexOf("if (!token && refusedByName) return res.json(");
  // (acceptance r3: the words live in ONE `refusalAnswer(r)` — the lapsed row the door refused is told the same refusal)
  ck('...the route answers loginNeeded by name once its token ladder has nothing either (the ladder FIRST, acceptance r2); the probe env strips the token anyway', /const refusedByName = !cliOk && pv && pv\.at >= t0 && \(pv\.code === 'login' \|\| pv\.code === 'unprobeable' \|\| pv\.code === 'sign-in-unknown'\) \? pv : null;/.test(ur) && /: \{ error: 'needs re-login to refresh usage — ' \+ r\.why, loginNeeded: true/.test(ur) && /if \(!token && refusedByName\) return res\.json\(refusalAnswer\(refusedByName\)\);/.test(ur) && ladderAt > 0 && namedAt > ladderAt && /delete env\.CLAUDE_CODE_OAUTH_TOKEN;/.test(ur));
  const probeCallers = [];
  for (const p of ['src/usage-routes.js', 'src/server/account-usage-routes.js', 'src/server/auto-cli-loop.js', 'server.js']) { const n = (src(p).match(/spawnPanelProbe\(/g) || []).length; if (n) probeCallers.push(p + ':' + n); }
  console.log('    panel-probe sites: ' + probeCallers.join(' '));
  ck('CENSUS: the panel probe spawns from refreshViaCliPanel (row ⟳ + auto-cli) and the OAT mint flow only', probeCallers.join() === 'src/usage-routes.js:2,src/server/account-usage-routes.js:1');
  ck('...both client ⟳ doors say the words for loginNeeded', /r\?\.loginNeeded \? t\('Needs re-login to refresh usage'\)/.test(src('src/lib/manage-agents.js')) && /r\.loginNeeded \? t\('Needs re-login to refresh usage'\)/.test(src('src/lib/usage-meter.js')));
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
