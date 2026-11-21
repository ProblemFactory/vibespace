#!/usr/bin/env node
// THE RESET CREDIT — THE SOURCE-TEXT LEGS (fast, text only — lane lg-text-legs-3, B-94d3 part three). MOVED VERBATIM from the
// heavy scripts/test-reset-credit-ui.mjs, whose PURE model, the roster chip renderers, the route over the real engine, the
// helper, the real wrapper and every patched-copy CONTROL (with its premise) stay there (with its own release-gate pin): §2 the
// rosters' wiring, R3 / R4 the client carriers (with R4's pre-fix control over the source), the ONE writer + server.js's
// wiring (with its mutant), §4 the three entry points open ONE dialog + the verb census beyond src/lib (with its controls),
// §5 the new keys' zh / ja. Each reads the file it pins BY NAME (the census walks src/ and data/bin), so ci.mjs's affected
// rule selects this suite on a change of that file.
// Run: node scripts/test-reset-credit-ui-pins.mjs
import './scratch.mjs';   // FIRST (B-ba47): a suite that reads a home or loads a module that does takes the re-home before any of its code (§113 THE ROW: a NEW one takes the import)
import fs from 'node:fs';
import path from 'node:path';
const REPO = path.resolve(new URL('..', import.meta.url).pathname);

let pass = 0, fail = 0;
const ok = (n, c, e) => { if (typeof n !== 'string') throw new TypeError(`ok(): the name is a ${typeof n} — swapped arguments (B-1747: a swap is a crash, never a green leg)`); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? ' — ' + e : '')); } };
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');

console.log('\n§2 the roster chip');
{
  const ma = read('src/lib/manage-agents.js');
  ok('the claude roster passes the CAPABILITY (resetCreditCapable), and the reason only where it cannot spend — never a harness-id branch on the rows', /const claudeCanReset = resetCreditCapable\('claude'\);/.test(ma) && /disabledWhy: claudeCanReset \? '' : CLAUDE_RESET_WHY\(\)/.test(ma));
  ok('the codex roster renders the slot only for local, logged-in, non-pool rows + the machine login, gated on resetCreditCapable', /const canReset = !selectedHost && resetCreditCapable\('codex'\);/.test(ma) && /\$\{!isPool && a\.loggedIn \? resetSlot\(a\.id\) : ''\}/.test(ma) && /resetSlot\('__global_codex__'\)/.test(ma));
  ok('the 8 s poll repaints the chip from the same maps (_repaintRosterUsage second pass)', /document\.querySelectorAll\('\.acct-reset-slot\[data-reset-src\]'\)/.test(ma) && /resetChipHtml\(rosterResetOffer\(snap\.u, \{ capable: true \}\), \{ key: slot\.dataset\.resetKey \}\)/.test(ma));
  ok('agent-meta reads the SERVER caps row (no client mirror to drift)', /export function resetCreditCapable\(backend\) \{\s*\n\s*return serverCapsOf\(backend\)\.resetCredit === true;/.test(read('src/lib/agent-meta.js')));
}

console.log('\n§3 the route over the real engine');
{
      ok('helper belts WIRING: the engine passes the witness from the attempt\'s origin, never a constant', /pressedBy: t\.origin === 'user' \? 'person' : 'auto' \}\)\)/.test(read('src/server/usage-pool-engine.js')));

    // the CLIENT carrier: the renderer reads the PURE view, the edit op patches the card IN PLACE
    const cr = read('src/lib/chat-renderers.js'), cv = read('src/lib/chat-view.js');
    ok('R3 client: the card renders the PURE view — the outcome line (textContent) instead of the button', /const view = resetCreditCardView\(rc, \{ fmtTime: fmtInstant \}\);/.test(cr) && /line\.textContent = t\(view\.line\.key, view\.line\.params \|\| \{\}\);/.test(cr) && /if \(view\.button\) \{/.test(cr));
    ok('R3 client: a `resetCredit` edit patches THAT card in place (patchResetCredit) before any re-render branch', /if \('resetCredit' in fields && !fields\.status\) \{\s*\n\s*const el = this\._elements\.get\(id\);\s*\n\s*if \(el\) this\._renderers\.patchResetCredit\(el, msg\);\s*\n\s*return;/.test(cv) && cv.indexOf("if ('resetCredit' in fields") < cv.indexOf("if (fields.status === 'complete' || fields.status === 'error'") && /patchResetCredit\(el, msg\) \{/.test(cr));

    // the CLIENT: the press posts the route, toasts the PURE sentence, repaints at the round trip
    const um = read('src/lib/usage-meter.js');
    const fn = um.slice(um.indexOf('async _refreshCodexQuota(btn) {'), um.indexOf('async _refreshQuotaOnDemand('));
    const answered = (src) => /fetchJson\('\/api\/usage\/codex-refresh'/.test(src) && /codexRefreshToast\(r, /.test(src) && /showToast\(toast\.text/.test(src) && /if \(r\) \{ clearTimeout\(fallback\); this\.refreshUsage\?\.\(\); \}/.test(src);
    ok('R4 client: the press POSTs the route, toasts the PURE sentence, repaints at the round trip (the 2.5 s refresh only as the fallback)', answered(fn) && !/this\.ws\.send\(\{ type: 'codex-read-limits'/.test(fn));
    const preFix = "  _refreshCodexQuota(btn) {\n    const live = (this.sidebar?._allSessions || []).find((s) => backendFeatureCaps(s.backend || 'claude').quotaRefresh === 'session-rpc' && s.status === 'live' && s.webuiId && !s.host);\n    if (!live) { showToast(t('Needs a running Codex chat session (the read rides its own app-server)'), { type: 'error' }); return; }\n    try { this.ws.send({ type: 'codex-read-limits', sessionId: live.webuiId }); } catch { }\n    if (btn) { btn.classList.add('spin'); setTimeout(() => btn.classList.remove('spin'), 1500); }\n    setTimeout(() => this.refreshUsage?.(), 2500);\n  },";
    ok('R4 CONTROL: the pre-fix press (the ws verb + a fixed 2.5 s timer, a toast only for the refusal) fails the same census — the owner\'s silent ⟳', !answered(preFix));
}

console.log('\n§4e the revived press — two pushes, a SENT press revived, the clocks, another conversation, the orphan, the items, the word a restart LOSES (verify r10 T1 ①–⑤ ⑦ + the buffer-file catch-up + the double charge)');
{
  const esrc10 = read('src/server/usage-pool-engine.js');

    ok('§4e ⑧ the catch-up is BOUNDED and keyed: nothing is read when no attempt of the session is open (null), a remote session is never read, and a reading older than LATE_MS is dropped by name (source pins)', /if \(!open\.size\) return null;/.test(esrc10) && /if \(!session \|\| !id \|\| session\.host\) return null;/.test(esrc10) && /const RESET_CATCHUP_TAIL_BYTES = 512 \* 1024;/.test(esrc10) && /Date\.now\(\) - at > recordLateness\.LATE_MS\)\) \{ dropped\.push/.test(esrc10) && /recordCodexQuotaSignal\(session, p, null, \{ asOf: at \}\)/.test(esrc10));

  const eng = read('src/server/usage-pool-engine.js');
  ok('ONE writer: the auto rung and the manual use both call writeResetCredit with the CREDIT\'S identity (the verb is spelled once in the engine; verify r8 T0: only the manual use asks for the read first)', /const wr = writeResetCredit\(session, \{ resetsAtSec: R, lane, origin: 'auto', now, key \}\);/.test(eng) && /const wr = writeResetCredit\(session, \{ resetsAtSec: p\.resetsAtSec \|\| 0, lane: null, origin: 'user', now, key: p\.key, readFirst: !afterRead \}\);/.test(eng) && (eng.match(/type: 'codex-reset-credit', idempotencyKey: idemKey, \.\.\.\(rf \? \{ readFirst: true \} : \{\}\) \}\)/g) || []).length === 1 && (eng.match(/type: 'codex-reset-credit'[,'\s]/g) || []).length === 1);
  ok('the carrier is picked by CAPABILITY (capsOf(s.backend).resetCredit), never a backend id', /capsOf\(s\.backend\)\.resetCredit === true && ids\.has\(liveQuotaKeyFor\(s\)\)/.test(eng) && !/function resetCreditCarriers[\s\S]{0,400}backend === 'codex'/.test(eng));
  // lane mirror-263-reds: ORDER-FREE — the setupUsage engine object (the one that hands clearSealedOrders) must NAME both
  // functions; oat-verify-fixes slotted establishedWindows in between and the old exact-sequence regex went red on a right wiring
  const engineKeys = (src) => { const objs = [...src.matchAll(/engine: \{ ([\w, ]+) \}/g)].map((m) => ({ text: m[0], keys: m[1].split(', ') })).filter((o) => o.keys.includes('clearSealedOrders')); return objs.length === 1 ? objs[0] : null; };
  const handsBoth = (src) => { const o = engineKeys(src); return !!o && o.keys.includes('resetCreditPreview') && o.keys.includes('consumeResetCreditFor'); };
  const srv = read('server.js'), eo = engineKeys(srv);
  ok('the route is wired where the accounts routes live, and server.js hands the engine both functions (by name, any order)', /require\('\.\.\/routes\/reset-credit\.js'\)\.registerResetCreditRoutes\(app, \{ engine \}\);/.test(read('src/server/account-usage-routes.js')) && handsBoth(srv), JSON.stringify(eo && eo.keys));
  const dropped = !eo ? [] : ['resetCreditPreview', 'consumeResetCreditFor'].map((k) => handsBoth(srv.replace(eo.text, eo.text.replace(new RegExp(`\\b${k}, |, ${k}\\b`), ''))));
  ok('MUTANT: server.js stops handing resetCreditPreview (or consumeResetCreditFor) ⇒ the wiring pin goes RED', eo && dropped.join() === 'false,false', JSON.stringify(dropped));
}

console.log('\n§4 THE three entry points open ONE dialog');
{
  const dlg = read('src/lib/reset-credit-dialog.js');
  ok('the dialog is ONE exported function, built on createModalShell, worded by the PURE dialogModel, POSTing the route', /export async function openResetCreditDialog\(app, \{ accountKey, sessionId = null, todoId = null \} = \{\}\)/.test(dlg) && /createModalShell\(\{ id: 'reset-credit-dialog'/.test(dlg) && /dialogModel\(p, \{/.test(dlg) && /\/api\/accounts\/\$\{encodeURIComponent\(p\.key\)\}\/reset-credit`, \{ method: 'POST'/.test(dlg));
  ok('…draws every string with textContent (a peer/account name is data), and a failure reaches the user (toast)', /el\.textContent = words\(l\);/.test(dlg) && /showToast\(t\('Reset credit not used — \{reason\}'/.test(dlg) && !/innerHTML = [^U]/.test(dlg));
  ok('…resolves the For-you item after the decision (Confirm ⇒ done, Not now ⇒ dismissed)', /await resolveTodo\('done'\);/.test(dlg) && /await resolveTodo\('dismissed'\);/.test(dlg));
  const callers = {
    'src/lib/manage-agents.js': /openResetCreditDialog\(this, \{ accountKey: useBtn\.dataset\.resetKey \}\)/g,
    'src/lib/chat-renderers.js': /openResetCreditDialog\(this\.app, \{ accountKey: rc\.accountKey, sessionId: this\.sessionId \|\| null \}\)/g,
    // §9 (2026-09-27): the For-you button's verb moved VERBATIM into THE client model (the popup and the For-you window both call it)
    'src/lib/user-todos-actions.js': /openResetCreditDialog\(app, \{ accountKey: rec\.action\.accountKey, sessionId: rec\.action\.sessionId \|\| null, todoId: rec\.id \}\)/g,
  };
  for (const [f, re] of Object.entries(callers)) {
    const s = read(f);
    ok(`${f} imports the ONE dialog and calls it`, /import \{ openResetCreditDialog(, fmtInstant)? \} from '\.\/reset-credit-dialog\.js';/.test(s) && (s.match(re) || []).length >= 1);
  }
  ok('manage-agents: BOTH rosters route the button to it (codex live, claude disabled until it can)', (read('src/lib/manage-agents.js').match(/openResetCreditDialog\(this, \{ accountKey: useBtn\.dataset\.resetKey \}\)/g) || []).length === 2);
  // lane reset-path R3: the rule moved into the PURE card view (a resolved card shows its outcome line instead)
  ok('chat-renderers: the button rides a peer card only when the offer names an account (and no later fact answered it)', /if \(view\.button\) \{/.test(read('src/lib/chat-renderers.js')) && /return \{ button: !!\(o\.accountKey && Number\(o\.available\) > 0\), line: null \};/.test(read('src/reset-credit.js')));
  // 2.369.169: the row markup moved to THE row renderer (src/lib/user-todos-row.js) the panel imports
  ok('user-todos-panel: the button only on a reset-credit action item (drawn by THE row renderer the panel imports)', /i\.action\.type === 'reset-credit' && i\.action\.accountKey/.test(read('src/lib/user-todos-row.js')) && /from '\.\/user-todos-row\.js'/.test(read('src/lib/user-todos-panel.js')));
  ok('…the popup\'s button and the For-you window\'s producer action both run THE model\'s verb (no second dialog call)', /model\.runAction\(todos\.open\.find\(\(i\) => i\.id === id\)\)/.test(read('src/lib/user-todos-panel.js')) && /if \(a === 'producer'\) \{ model\.runAction\(it\); return; \}/.test(read('src/lib/inbox-window.js'))
    && !/openResetCreditDialog/.test(read('src/lib/user-todos-panel.js')) && !/openResetCreditDialog/.test(read('src/lib/inbox-window.js')));
  const all = fs.readdirSync(path.join(REPO, 'src/lib')).filter((f) => f.endsWith('.js') && !/^i18n/.test(f)).map((f) => ['src/lib/' + f, read('src/lib/' + f)]);
  const definers = all.filter(([, s]) => /function openResetCreditDialog\b/.test(s)).map(([f]) => f);
  ok('exactly ONE client file defines the dialog', JSON.stringify(definers) === '["src/lib/reset-credit-dialog.js"]', JSON.stringify(definers));
  const senders = all.filter(([, s]) => /type: 'codex-reset-credit'/.test(s)).map(([f]) => f);
  ok('no client file sends the raw ws verb (every manual spend goes through the dialog → the route → the authorizer)', senders.length === 0, JSON.stringify(senders));
  // THE VERB CENSUS BEYOND src/lib (r2, reproduced: ws-handler's
  // `codex-reset-credit` case wrote the verb straight to the pty — no spend
  // ceiling, no per-identity floor, no origin, and its failure then walked the
  // switch/wait ladder as an AUTO attempt). Over EVERY tracked JS surface that
  // can reach a wrapper's stdin (server.js, src/**, data/bin/*.js): the verb is
  // WRITTEN in exactly one place (the engine's writer), no dispatcher spells it
  // as a case label (a relay of `{ type: data.type }` hides the literal from
  // the writer grep, which is exactly the shape the ws case had), and only the
  // wrapper READS it.
  {
    const walk = (d, out = []) => { for (const e of fs.readdirSync(path.join(REPO, d), { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) { if (!/node_modules|\.git/.test(f)) walk(f, out); } else if (/\.js$/.test(e.name) && !/^i18n-/.test(e.name) && !/^\./.test(e.name)) out.push(f); } return out; };
    const files = ['server.js', ...walk('src'), ...fs.readdirSync(path.join(REPO, 'data/bin')).filter((f) => /\.js$/.test(f)).map((f) => 'data/bin/' + f)];
    const WRITE = /type:\s*['"]codex-reset-credit['"]/;
    const CASE = /case\s*['"]codex-reset-credit['"]\s*:/;
    const READ = /===\s*['"]codex-reset-credit['"]/;
    const hits = (re) => files.filter((f) => re.test(read(f)));
    ok(`the census is non-vacuous (${files.length} files incl. the engine, ws-handler and the codex wrapper)`, files.length > 100 && ['src/server/usage-pool-engine.js', 'src/ws-handler.js', 'data/bin/codex-chat-wrapper.js'].every((f) => files.includes(f)));
    ok('the verb is WRITTEN by exactly one server-tier file: the engine (writeResetCredit)', JSON.stringify(hits(WRITE)) === '["src/server/usage-pool-engine.js"]', JSON.stringify(hits(WRITE)));
    ok('no dispatcher relays it (no `case \'codex-reset-credit\':` anywhere — the ws bypass is gone)', hits(CASE).length === 0, JSON.stringify(hits(CASE)));
    ok('only the codex wrapper READS it', JSON.stringify(hits(READ)) === '["data/bin/codex-chat-wrapper.js"]', JSON.stringify(hits(READ)));
    const preFix = "        case 'codex-reset-credit':\n        case 'codex-read-limits': {\n          if (session?.pty && served) session.pty.write(JSON.stringify({ type: data.type }) + '\\n');";
    ok('NEGATIVE CONTROL: the pre-r2 ws relay is what the case census reports, and the writer grep alone would have missed it', CASE.test(preFix) && !WRITE.test(preFix));
  }
  ok('NEGATIVE CONTROL: a caller that bypasses the dialog is what the census reports', /type: 'codex-reset-credit'/.test("app.ws.send({ type: 'codex-reset-credit', sessionId })") && !(/openResetCreditDialog\(app, \{ accountKey: rec\.action\.accountKey/.test('openResetCredit(app, rec)')));
  ok('the wall card and the arm card carry the account the credits belong to (offer.accountKey)', /return n !== null && n > 0 \? \{ available: n, mode, accountKey: key \} : null;/.test(read('src/server/usage-pool-engine.js')) && /resetCredit: \{ available: n, mode, accountKey: key, \.\.\.\(R \? \{ resetsAtSec: R \} : \{\}\) \}/.test(read('src/server/usage-pool-engine.js')));
}

console.log('\n§5 i18n');
{
  const zh = (await import(path.join(REPO, 'src/lib/i18n-zh.js'))).default;
  const ja = (await import(path.join(REPO, 'src/lib/i18n-ja.js'))).default;
  const re = /\b(?:t|i18nKey)\(\s*'((?:[^'\\]|\\.)*)'/g;
  const keys = new Set();
  for (const f of ['src/reset-credit.js', 'src/lib/reset-credit-dialog.js']) for (const m of read(f).matchAll(re)) keys.add(m[1].replace(/\\'/g, "'"));
  for (const k of ['Claude Code offers only the interactive /limit-reset — run it in a terminal session', '{n} reset credits', '1 reset credit', 'Use…', 'Use a reset credit…', '{n} stored reset credits on this account — opens the confirmation']) keys.add(k);
  const missing = [...keys].filter((k) => !(k in zh) || !(k in ja));
  ok(`every new key has zh + ja (${keys.size} keys)`, keys.size > 25 && missing.length === 0, missing.join(' | '));
}

console.log(`\n${fail ? fail + ' FAILED' : 'ALL PASS'} (${pass})`);
process.exit(fail ? 1 : 0);
