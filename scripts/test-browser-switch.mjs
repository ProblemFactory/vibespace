#!/usr/bin/env node
// LANE BROWSER-PROPOSE — the PURE rows of src/browser-switch.js this lane adds (the rest of the switch model is
// test-browser-backend's): step 2's SIGN-IN REFUSAL HINT (SIGNIN_REFUSAL_ROWS / signinRefusalOf / navHint over the
// navigate result's final url + title) — a hint, never a detection (design §7.6 rule 5); a patched-copy control.
// Page shapes are the refusal page's URL / title only — every id in a URL here is invented.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = new URL('..', import.meta.url).pathname;
const SW = require('../src/browser-switch.js');

let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra !== undefined ? '\n    ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)) : '')); } return !!c; };

// ═══ step 2: the sign-in refusal hint ═════════════════════════════════════════
console.log('— the sign-in refusal HINT (PURE table, navigate result url + title)');
{
  ok(SW.SIGNIN_REFUSAL_ROWS.length >= 1 && SW.SIGNIN_REFUSAL_ROWS.every((r) => r.id && r.vendor && r.host && /^\d{4}-\d{2}-\d{2}$/.test(r.date) && r.source && r.paths.length && r.titles.length), 'every row is dated and names its source, its host, its path markers and its titles');
  ok(!SW.SIGNIN_REFUSAL_ROWS.some((r) => /microsoftonline|login\.live/.test(r.host)), 'Microsoft\'s "We couldn\'t sign you in" is NOT a refusal of the browser — no row for it');
  // the real page shapes (invented ids)
  const G = [
    ['https://accounts.google.com/v3/signin/rejected?continue=https%3A%2F%2Fmail.google.com&flowName=GlifWebSignIn&TL=AInv3nt3d00x', 'Sign in - Google Accounts', 'the v3 /signin/rejected path'],
    ['https://accounts.google.com/signin/v2/deniedsigninrejected?flowEntry=ServiceLogin&TL=AInv3nt3d01y', '', 'the v2 deniedsigninrejected path'],
    ['https://accounts.google.com/v3/signin/challenge/pwd?TL=AInv3nt3d02z', 'This browser or app may not be secure', 'another path, the refusal page\'s own English title'],
    ['https://accounts.google.com/v3/signin/identifier?TL=AInv3nt3d03w', '此浏览器或应用可能不安全 - Google 帐号', 'the Chinese title'],
    ['https://accounts.google.com/v3/signin/identifier?TL=AInv3nt3d04v', 'このブラウザまたはアプリは安全でない可能性があります', 'the Japanese title'],
    ['HTTPS://ACCOUNTS.GOOGLE.COM/V3/SIGNIN/REJECTED', '', 'host and path case-insensitively'],
  ];
  for (const [url, title, what] of G) {
    const h = SW.navHint({ url, title });
    ok(h && h.tier === 2 && h.why === 'sign-in-refused' && h.source === 'sign-in-page' && h.hint === 'may-need-cloak' && h.row === 'google-rejected' && h.host === 'accounts.google.com'
      && /not a detection/.test(h.text) && /ask the user to approve a switch to CloakBrowser/.test(h.text) && /vibespace-browser blocked --url <the sign-in page> --why sign-in-refused --tier 2/.test(h.text) && !/detected/.test(h.text),
    `Google: ${what} ⇒ the typed hint (tier 2, sign-in-refused, a hint from the page — never "detected"; the claim it asks for named)`, h);
  }
  const NOT = [
    ['https://accounts.google.com/v3/signin/identifier?TL=AInv3nt3d05u', 'Sign in - Google Accounts', 'the ordinary sign-in page'],
    ['https://accounts.google.com.evil.example/v3/signin/rejected', 'This browser or app may not be secure', 'a look-alike host (exact host only)'],
    ['https://example.com/signin/rejected', 'This browser or app may not be secure', 'another site with the same path and title'],
    ['https://login.microsoftonline.com/common/login', "We couldn't sign you in", "Microsoft's failed sign-in"],
    ['', 'This browser or app may not be secure', 'no url'],
    ['not a url at all', '', 'garbage'],
  ];
  for (const [url, title, what] of NOT) ok(SW.navHint({ url, title }) === null, `no hint: ${what}`);
  ok(SW.navHint({ url: 'https://example.com/x', status: 403 }).why === 'HTTP 403' && SW.navHint(429).source === 'http-status' && SW.navHint(200) === null, 'the 403/429 rung is unchanged (a number, or a status in the facts)');
  const long = 'https://accounts.google.com/v3/signin/identifier?x=' + 'a'.repeat(200000);
  const t0 = Date.now(); const hl = SW.navHint({ url: long, title: 'z'.repeat(200000) });
  ok(hl === null && Date.now() - t0 < 200, 'a 200 KB url + title is judged at its 4 KiB bound (no hint, fast)', Date.now() - t0);
}

// the CLI half: THE shipped CLI's reader of a navigation's result (the function itself, lifted out of the file — the
// end-to-end print is test-browser-propose's leg over the real routes)
console.log('— the shipped CLI reads the final url + title off the browser CLI\'s result, and prints the server\'s hint');
{
  const cli = fs.readFileSync(path.join(REPO, 'data/bin/vibespace-browser'), 'utf8');
  const m = /\nfunction navFacts\(outText\) \{[\s\S]*?\n\}\n/.exec(cli);
  ok(!!m, 'the CLI carries navFacts');
  const navFacts = m ? new Function(m[0] + '\nreturn navFacts;')() : () => null;
  ok(JSON.stringify(navFacts('✓ This browser or app may not be secure\n  https://accounts.google.com/v3/signin/rejected?TL=AInv3nt3d\n')) === JSON.stringify({ title: 'This browser or app may not be secure', url: 'https://accounts.google.com/v3/signin/rejected?TL=AInv3nt3d' }), 'the text form (0.38.1: "✓ <title>\\n  <url>")');
  ok(JSON.stringify(navFacts('✓ \n  http://127.0.0.1:1234/x\n')) === JSON.stringify({ title: '', url: 'http://127.0.0.1:1234/x' }), 'an empty title (the measured refused-navigation shape)');
  ok(JSON.stringify(navFacts('noise\n{"success":true,"data":{"url":"https://a.example/","title":"T"}}\n')) === JSON.stringify({ url: 'https://a.example/', title: 'T' }), 'the --json form');
  ok(navFacts('✗ navigation failed') === null, 'a failed navigation reads nothing');
  ok(/\.\.\.\(nav \? \{ nav \} : \{\}\)/.test(cli) && /au\.hint && au\.hint\.text\) console\.error\(`hint: \$\{au\.hint\.hint \|\| 'may-need-cloak'\} — \$\{au\.hint\.text\}`\)/.test(cli), 'WIRING: the audit call carries `nav` and the server\'s hint is printed like the 403/429 one');
  const routes = fs.readFileSync(path.join(REPO, 'src/routes/browser.js'), 'utf8');
  ok(/require\('\.\.\/browser-switch\.js'\)\.navHint\(\{ url: typeof nav\.url === 'string'/.test(routes) && /\.\.\.\(hint \? \{ hint \} : \{\}\)/.test(routes), 'WIRING: the audit route answers `hint` from the PURE table');
}

// ═══ step 3: the proposal — record, plan, transitions, what Approve runs ═══════════
console.log('— step 3: the PROPOSAL (PURE): install facts, the plan table, the frozen record + its digest, the transitions');
{
  // the install facts
  const I = SW.proposalInstall;
  ok(I({ exeOk: true }).install === 'installed', 'CloakBrowser answers ⇒ installed');
  const need = I({ exeOk: false, verdict: { ok: true, proof: { downloadBytes: 216890134, downloadHost: 'cloakbrowser.dev' } }, npm: true });
  ok(need.install === 'needed' && need.bytes === 216890134 && need.from === 'cloakbrowser.dev', 'the verdict would install it ⇒ needed, with the record\'s download size and host');
  ok(I({ exeOk: false, verdict: { ok: true }, npm: false }).installWhy === 'install_unavailable' && I({ exeOk: false, verdict: { ok: false, code: 'install_running' } }).install === 'needed' && I({ exeOk: false, verdict: { ok: false, code: 'install_unmeasured_platform', error: 'x' } }).installWhy === 'install_unmeasured_platform', 'npm missing ⇒ unavailable (install_unavailable); an install already running ⇒ needed (Approve waits for it); a refusal ⇒ unavailable by its code');
  // THE PLAN TABLE (first match wins)
  const installed = { install: 'installed' };
  const P = (o) => SW.proposalPlan({ install: installed, sessionName: 'Chat', ...o });
  const prof = (x) => ({ kind: 'profile', id: 'bp-0000aaaa', label: 'Work', provider: 'chromium', host: null, ownsDir: true, recordedMajor: null, dirMajor: null, others: 0, ...x });
  const rows = [
    [{ remote: true, target: prof() }, 'none', 'remote'],
    [{ target: prof(), siteAdmissible: false }, 'none', 'never-admitted'], // verify r1: a loopback / link-local site
    [{ install: { install: 'unavailable', installWhy: 'install_unavailable' }, target: prof() }, 'none', 'install-unavailable'],
    [{ target: prof({ host: 'dev-1' }) }, 'none', 'other-machine'],
    [{ target: prof({ provider: 'cloak' }), siteListed: true }, 'none', 'already-cloak'],
    [{ target: prof({ provider: 'cloak' }) }, 'site', null], // verify r1 V1: already CloakBrowser, the site not on its list ⇒ ask for the site
    [{ target: prof({ recordedMajor: 140 }) }, 'switch', null],
    [{ target: prof({ recordedMajor: 146, dirMajor: 146 }) }, 'switch', null],
    [{ target: prof() }, 'switch', null],
    [{ target: prof({ recordedMajor: 146, dirMajor: 151 }) }, 'new-profile', 'newer-profile'],
    [{ target: prof({ provider: 'cdp', ownsDir: false }) }, 'new-profile', 'not-switchable'],
    [{ target: { kind: 'ephemeral' } }, 'new-profile', 'ephemeral'],
    [{ target: null }, 'new-profile', 'ephemeral'],
  ];
  for (const [o, kind, why] of rows) { const p = P(o); ok(p.kind === kind && (why === null || p.why === why), `plan: ${JSON.stringify(o.target ? { ...o.target, kind: o.target.kind } : o.target).slice(0, 90)}${o.remote ? ' remote' : ''}${o.install ? ' ' + o.install.install : ''} ⇒ ${kind}${why ? ' (' + why + ')' : ''}`, p); }
  ok(P({ target: prof() }).confirm === true && P({ target: prof({ recordedMajor: 140 }) }).confirm === false, 'a directory nothing recorded ⇒ the switch needs its one confirmation (the Approve); a known older one does not');
  ok(P({ target: prof({ recordedMajor: 151 }) }).wrote === 151 && P({ target: prof({ recordedMajor: 151 }) }).profileLabel === 'Work', 'a NEWER profile names the major that wrote it and the profile (the card says why)');
  ok(SW.proposalLabel('Mail triage') === 'Mail triage · CloakBrowser' && SW.proposalLabel('') === 'CloakBrowser' && SW.proposalLabel('x', (l) => l === 'x · CloakBrowser') === 'x · CloakBrowser 2' && SW.proposalLabel('a\u0007b'.repeat(30)).length <= 40 + ' · CloakBrowser'.length, 'the new profile\'s label: the conversation\'s name · CloakBrowser, unique, bounded, control characters out');
  // THE RECORD + its digest over the FROZEN fields
  const claim = { id: 'bl-0000aaaa', host: 'accounts.google.com', url: 'https://accounts.google.com/v3/signin/identifier', why: 'sign-in-refused', tier: 2, browserKey: 'bk-0000aaaa', at: 5 };
  const plan0 = P({ target: { kind: 'ephemeral' } });
  const p0 = SW.proposalFor({ claim, plan: plan0, install: { install: 'needed', installWhy: null, bytes: 216890134, from: 'cloakbrowser.dev' }, at: 5 });
  ok(p0.state === 'open' && p0.backend === 'cloak' && p0.site === 'accounts.google.com' && p0.install === 'needed' && p0.installBytes === 216890134 && /^pd-[0-9a-f]{8}$/.test(p0.digest) && p0.digest === SW.proposalDigest(p0), 'the record: open, cloak, the claim\'s host, the install facts, its digest');
  ok(SW.proposalFor({ claim, plan: { kind: 'none', why: 'remote' }, install: { install: 'installed' } }).state === 'unavailable', 'a plan that offers nothing is UNAVAILABLE from birth (no Approve)');
  const flip = [['url', { ...p0, url: p0.url + 'x' }], ['site', { ...p0, site: 'other.example' }], ['install', { ...p0, install: 'installed' }], ['plan kind', { ...p0, plan: { ...p0.plan, kind: 'switch' } }], ['plan label', { ...p0, plan: { ...p0.plan, label: 'Other' } }], ['confirm', { ...p0, plan: { ...p0.plan, confirm: true } }]];
  ok(flip.every(([, q]) => SW.proposalDigest(q) !== p0.digest) && SW.proposalDigest({ ...p0, state: 'done', progress: { step: 'x' }, outcome: {} }) === p0.digest, 'the digest moves with EVERY frozen field (url, site, install, plan kind / label / confirm) and never with the live state — what Approve names is what runs', flip.map(([n]) => n));
  // a second claim
  const V = SW.claimVerdict;
  ok(V({ existing: { proposal: { ...p0, state: 'failed', outcome: { code: 'proposal_stale' } } } }) === 'new' && V({ existing: { proposal: { ...p0, state: 'failed', outcome: { code: 'install_failed' } } } }) === 'same', 'verify r1 V2: a run refused because the world no longer matched the card (proposal_stale) is not the card to keep — the next claim is new; any other failure keeps the same card (Approve again)');
  ok(V({ existing: null }) === 'new' && V({ existing: { proposal: p0 }, tier: 3 }) === 'claim-only' && ['open', 'approved', 'failed', 'unavailable'].every((s) => V({ existing: { proposal: { ...p0, state: s } } }) === 'same') && V({ existing: { proposal: { ...p0, state: 'rejected', told: false } } }) === 'rejected' && V({ existing: { proposal: { ...p0, state: 'rejected', told: true } } }) === 'new' && V({ existing: { proposal: { ...p0, state: 'done' } } }) === 'new',
    'a second claim: the SAME card while one stands (open / approved / failed / unavailable); an untold rejection is told instead; a told one or a finished switch opens a new one; only tier 2 files one');
  // THE TRANSITIONS
  const S = SW.proposalStep;
  ok(S(p0, { event: 'approve', by: 'agent', shown: p0.digest }).code === 'agent_forbidden' && S(p0, { event: 'reject', by: 'agent' }).code === 'agent_forbidden', 'an agent never approves or rejects (agent_forbidden)');
  ok(S(p0, { event: 'approve', by: 'user', shown: 'pd-00000000' }).code === 'proposal_changed', 'an Approve naming another digest ⇒ proposal_changed (nothing runs)');
  const a1 = S(p0, { event: 'approve', by: 'user', shown: p0.digest, at: 9 });
  ok(a1.ok && a1.next.state === 'approved' && a1.next.decided.action === 'approve' && a1.next.decided.at === 9 && a1.next.progress.step === 'starting', 'open --approve(user, the digest)--> approved');
  ok(S(a1.next, { event: 'approve', by: 'user', shown: p0.digest }).code === 'proposal_state' && S(a1.next, { event: 'reject', by: 'user' }).code === 'proposal_state', 'an approved proposal is not approved or rejected again');
  const pr1 = S(a1.next, { event: 'progress', progress: { step: 'install', percent: 34.4 } });
  ok(pr1.ok && pr1.next.progress.percent === 34 && pr1.next.state === 'approved', 'progress while approved (the percent rounded, bounded)');
  const prS = S(a1.next, { event: 'progress', progress: { step: 'install', percent: 34, stalledSec: 61.4 } });
  ok(prS.ok && prS.next.progress.stalledSec === 61 && !('stalledSec' in pr1.next.progress) && SW.proposalCardBlock({ id: 'bl-0000aaaa', proposal: prS.next }).progress.stalledSec === 61 && SW.proposalCardBlock({ id: 'bl-0000aaaa', proposal: pr1.next }).progress.stalledSec === null, 'verify r1 V3: a stalled download carries stalledSec onto the card block; a moving one none');
  const f1 = S(pr1.next, { event: 'fail', outcome: { code: 'install_failed', step: 'install', error: 'x' }, at: 11 });
  ok(f1.ok && f1.next.state === 'failed' && f1.next.outcome.step === 'install' && f1.next.progress === null, 'approved --fail--> failed (the step and the error kept)');
  const a2 = S(f1.next, { event: 'approve', by: 'user', shown: p0.digest });
  ok(a2.ok && a2.next.state === 'approved' && a2.next.outcome === null, 'failed --approve again--> approved (the same frozen fields)');
  const d1 = S(a2.next, { event: 'done', outcome: { code: 'switched' } });
  ok(d1.ok && d1.next.state === 'done' && S(d1.next, { event: 'approve', by: 'user', shown: p0.digest }).code === 'proposal_state', 'approved --done--> done (terminal)');
  const rj = S(p0, { event: 'reject', by: 'user', at: 3 });
  ok(rj.ok && rj.next.state === 'rejected' && rj.next.told === false && S(rj.next, { event: 'told' }).next.told === true && S(p0, { event: 'told' }).code === 'proposal_state', 'open --reject(user)--> rejected (untold) --told--> told; told on anything else refused');
  ok(S({ ...p0, state: 'unavailable' }, { event: 'approve', by: 'user', shown: p0.digest }).code === 'proposal_unavailable' && S(p0, { event: 'bogus' }).code === 'bad-request' && S(null, {}).code === 'not-found', 'unavailable ⇒ proposal_unavailable; an unknown event and a missing proposal refused by name');
  // ── verify r1 V1: THE SIGN-IN PAGE'S OWN SITES — frozen with the claimed host, named on the card, added on Approve ──
  const D = SW.SIGNIN_DEPENDENCIES;
  const allSignin = D.flatMap((r) => r.signin);
  ok(JSON.stringify(D.map((r) => r.id)) === JSON.stringify(['google', 'microsoft', 'github', 'apple']) && D.every((r) => /^2026-\d\d-\d\d$/.test(r.date) && /not measured/.test(r.source) && r.vendor && r.also.length && r.also.length <= 16 && [...r.signin, ...r.also].every((h) => SW.normalizeHost(h) === h)) && new Set(allSignin).size === allSignin.length,
    'SIGNIN_DEPENDENCIES: four vendor rows (Google, Microsoft, GitHub, Apple), each dated and saying it is NOT a measurement, every host a plain host, no sign-in host in two rows', D.map((r) => r.id));
  const gd = SW.signinDependenciesOf('https://accounts.google.com/v3/signin/x');
  ok(gd && gd.vendor === 'Google' && ['www.gstatic.com', 'ssl.gstatic.com', 'fonts.gstatic.com', 'apis.google.com', 'lh3.googleusercontent.com', 'accounts.youtube.com'].every((h) => gd.also.includes(h)) && !gd.also.includes('accounts.google.com') && SW.signinDependenciesOf('login.live.com').also.includes('login.microsoftonline.com') && !SW.signinDependenciesOf('login.live.com').also.includes('login.live.com') && SW.signinDependenciesOf('portal.example') === null && SW.signinDependenciesOf('accounts.google.com.evil.example') === null,
    'signinDependenciesOf: a row\'s sign-in host ⇒ its vendor + the other hosts (never itself); an unknown host or a look-alike ⇒ none', gd);
  const pg = SW.proposalFor({ claim, plan: plan0, install: { install: 'installed' } });
  const pu = SW.proposalFor({ claim: { ...claim, host: 'portal.example', url: 'https://portal.example/login' }, plan: plan0, install: { install: 'installed' } });
  ok(pg.alsoSites.join() === gd.also.join() && pg.vendor === 'Google' && !('alsoSites' in pu) && SW.proposalDigest({ ...pg, alsoSites: pg.alsoSites.slice(1) }) !== pg.digest, 'the record FREEZES the sign-in page\'s own sites (a vendor the table does not know: none) and the digest moves with them', { pg: pg.alsoSites, pu: pu.alsoSites });
  const bg = SW.proposalCardBlock({ ...claim, proposal: pg }), bu = SW.proposalCardBlock({ ...claim, host: 'portal.example', proposal: pu });
  const siteLine = (b) => SW.proposalLines(b).plan.find((l) => /CloakBrowser opens only the sites you list/.test(l.key));
  ok(bg.alsoSites.join() === gd.also.join() && siteLine(bg).params.also === gd.also.join(', ') && siteLine(bg).params.vendor === 'Google' && /the agent is told which one so it can ask you again/.test(siteLine(bg).key) && /\(only that host\)/.test(siteLine(bu).key) && !/live view|Settings/.test(siteLine(bu).key + siteLine(bg).key),
    'the card NAMES every site Approve adds ("also www.gstatic.com, …"); an unknown vendor stays one host and says a refused site reaches the agent — never "the live view says so" (it did not)', { g: SW.lineText(siteLine(bg)), u: SW.lineText(siteLine(bu)) });
  const aw = SW.allowlistWith('a.example,.gstatic.com', ['accounts.google.com', 'www.gstatic.com', 'apis.google.com', 'accounts.google.com']);
  ok(aw.list === 'a.example,.gstatic.com,accounts.google.com,apis.google.com' && JSON.stringify(aw.hosts) === '["accounts.google.com","apis.google.com"]' && aw.added === true && SW.allowlistWith('x.example', []).added === false,
    'allowlistWith over a LIST: each host not already admitted is added once, in order (a covering ".domain" keeps its hosts out); `hosts` = the ones added now', aw);
  const ps = SW.proposalFor({ claim: { ...claim, host: 'cdn.x.example', url: 'https://cdn.x.example/', why: 'egress-refused' }, plan: { kind: 'site', profileId: 'bp-0000aaaa', profileLabel: 'Work' }, install: { install: 'installed' } });
  const Ls = SW.proposalLines(SW.proposalCardBlock({ ...claim, host: 'cdn.x.example', why: 'egress-refused', proposal: ps }));
  ok(ps.state === 'open' && /its page needs \{host\}, which CloakBrowser's site list refused/.test(Ls.claim.key) && Ls.plan.length === 3 && /already is CloakBrowser — only its site list changes/.test(Ls.plan[0].key) && SW.proposalInboxItem({ ...claim, host: 'cdn.x.example', proposal: ps }).text === 'The agent asks you to let CloakBrowser open cdn.x.example' && /^Approved: CloakBrowser may now open cdn\.x\.example — a page refused any other site is named to you on your next page command\. Re-open https:\/\/cdn\.x\.example\//.test(SW.approvedText({ ...ps, outcome: { code: 'site-added', siteAdded: true } })) && /rejected letting CloakBrowser open cdn\.x\.example/.test(SW.rejectionText(ps)),
    'the SITE plan\'s words: the claim (a site the list refused), only the site list changes, the For-you text, approved / rejected', { lines: Ls.plan.map(SW.lineText) });
  const er = SW.egressRefusedText(['ssl.gstatic.com', 'SSL.gstatic.com', 'x.example', ...Array.from({ length: 12 }, (_, i) => `h${i}.example`)]);
  ok(/^CloakBrowser's site list refused ssl\.gstatic\.com, x\.example, h0\.example/.test(er) && !/h6\.example/.test(er) && /`vibespace-browser blocked --url https:\/\/ssl\.gstatic\.com\/ --why egress-refused --tier 2`/.test(er) && SW.egressRefusedText([]) === '' && SW.egressRefusedText(['http://']) === '',
    'egressRefusedText: the refused sites by name (deduplicated, at most 8) and the ONE command that asks for the first; nothing refused ⇒ nothing said', er);
  const cliSrc = fs.readFileSync(path.join(REPO, 'data/bin/vibespace-browser'), 'utf8'), rsSrc = fs.readFileSync(path.join(REPO, 'src/routes/browser.js'), 'utf8');
  ok(/if \(au && !au\._failed && au\.egressRefused && au\.egressRefused\.text\) console\.error\(`note: \$\{au\.egressRefused\.text\} \[egress_refused\]`\)/.test(cliSrc) && /k\.leasesFor\(f\.browserKey\)\.some\(\(l\) => l\.profileId === profileId\)\) \{\s*try \{ const hosts = k\.cloakRefusals\(profileId, since\)/.test(rsSrc) && /\.\.\.\(egressRefused \? \{ egressRefused \} : \{\}\)/.test(rsSrc),
    'WIRING: the audit answer carries `egressRefused` (its own profile\'s proxy, a lease this conversation holds, since the verb began) and the CLI prints it on every page verb [egress_refused]');
  // verify r1: THE CLAIM STORE'S BOUND drops the entries nobody waits on first
  const E = (id, state, extra = {}) => ({ id, ...(state ? { proposal: { state, ...extra } } : {}) });
  const full = [E('o1', 'open'), E('c1'), E('d1', 'done'), E('a1', 'approved'), E('f1', 'failed'), E('rt', 'rejected', { told: true }), E('ru', 'rejected', { told: false }), E('u1', 'unavailable'), E('c2')];
  const kk = (n) => SW.blockedKeep(full, n);
  ok(JSON.stringify(kk(9).dropped) === '[]' && kk(7).dropped.map((e) => e.id).join() === 'c1,c2' && kk(4).dropped.map((e) => e.id).join() === 'c1,d1,rt,u1,c2' && kk(3).dropped.map((e) => e.id).join() === 'c1,d1,f1,rt,u1,c2' && kk(1).keep.map((e) => e.id).join() === 'a1' && kk(4).keep.map((e) => e.id).join() === 'o1,a1,f1,ru' && SW.BLOCKED_KEEP_MAX === 50,
    'blockedKeep: a full store drops claims with no proposal first, then decided ones, then failed ones — an undecided proposal (open / a rejection not yet told) only when nothing else is left, a running one last; the order of the list kept', { k4: kk(4), k3: kk(3).dropped.map((e) => e.id) });
  // the site allowlist: ONLY the host
  ok(SW.allowlistWith('', 'https://accounts.google.com/x').list === 'accounts.google.com' && SW.allowlistWith('a.example', 'accounts.google.com').list === 'a.example,accounts.google.com' && SW.allowlistWith('accounts.google.com', 'accounts.google.com').added === false && SW.allowlistWith('.google.com', 'accounts.google.com').added === false && SW.allowlistWith('google.com', 'accounts.google.com').added === true,
    'allowlistWith adds ONLY the exact host (kept when an exact or a covering ".domain" entry admits it; a bare parent domain does not cover a sub-domain)');
  // the words: the For-you item says what the card says, line for line; the card block is structure
  const entry = { ...claim, proposal: p0 };
  const b = SW.proposalCardBlock(entry);
  const L = SW.proposalLines(b);
  const item = SW.proposalInboxItem(entry);
  ok(b.type === 'browser_proposal' && b.digest === p0.digest && !JSON.stringify(b).includes('<') && L.plan.length === 4 && item.action.shown === p0.digest && item.action.id === 'bl-0000aaaa' && item.i18n.detail.map((l) => l.key).join('|') === [L.claim, ...L.plan].map((l) => l.key).join('|') && item.kind === 'action' && item.origin === 'browser',
    'the card block is structure; the For-you item carries the card\'s claim + plan words line for line, its Approve the digest', { L, item });
  ok(SW.proposalInboxItem({ ...claim, proposal: SW.proposalFor({ claim, plan: { kind: 'none', why: 'remote' }, install: installed }) }).kind === 'notice' && !SW.proposalInboxItem({ ...claim, proposal: SW.proposalFor({ claim, plan: { kind: 'none', why: 'remote' }, install: installed }) }).action, 'an unavailable proposal is a NOTICE with no action (nothing greyed: a sentence)');
  const noneW = (why, installWhy) => SW.proposalLines(SW.proposalCardBlock({ ...claim, proposal: SW.proposalFor({ claim, plan: { kind: 'none', why }, install: { install: 'unavailable', installWhy } }) })).none.key;
  ok(/another machine/.test(noneW('remote')) && /paired machine/.test(noneW('other-machine')) && /already is CloakBrowser/.test(noneW('already-cloak')) && /never measured/.test(noneW('install-unavailable', 'install_unmeasured_platform')) && /npm is not on this machine/.test(noneW('install-unavailable', 'install_unavailable')) && /not available in this version/.test(noneW('install-unavailable', 'provider_unavailable')) && /never opens \{host\} — a loopback or link-local address/.test(noneW('never-admitted')), 'every "nothing to offer" reason is a whole sentence (never a sentence built from translated fragments)');
  ok(/Re-run the sign-in at https:\/\/accounts\.google\.com\/v3\/signin\/identifier/.test(SW.approvedText({ ...p0, outcome: { label: 'Chat · CloakBrowser', newProfile: true, siteAdded: true } })) && /do not work around the refusal/.test(SW.rejectionText(p0)), 'the words the agent is told: approved (re-run the sign-in at the claim\'s url) / rejected (do not work around it)');
}

// ═══ controls ═════════════════════════════════════════════════════════════════
console.log('— controls');
const M = mutantCopies('bprop-switch', REPO);
{
  const src = fs.readFileSync(path.join(REPO, 'src/browser-switch.js'), 'utf8');
  const cut = '    if (host !== row.host) continue;\n';
  ok(src.includes(cut), 'the exact-host rule is where the control cuts it');
  const m = M.load('src/browser-switch.js', src.replace(cut, ''), 'any-host');
  ok(m.navHint({ url: 'https://example.com/signin/rejected', title: '' }) !== null, 'CONTROL: a table that ignores the host hints on ANY site with the path — the look-alike rows above would be red');
}
{
  const src = fs.readFileSync(path.join(REPO, 'src/browser-switch.js'), 'utf8');
  const cut = "    ...(dep && dep.also.length ? { alsoSites: dep.also.slice(0, 16), vendor: dep.vendor } : {}),\n";
  ok(src.includes(cut), 'verify r1 V1: the record freezes the sign-in page\'s own sites where the control cuts it');
  const m = M.load('src/browser-switch.js', src.replace(cut, ''), 'no-also');
  const q = m.proposalFor({ claim: { id: 'bl-0000aaaa', host: 'accounts.google.com', url: 'https://accounts.google.com/' }, plan: { kind: 'new-profile', why: 'ephemeral', label: 'L' }, install: { install: 'installed' } });
  const line = m.proposalLines(m.proposalCardBlock({ id: 'bl-0000aaaa', host: 'accounts.google.com', proposal: q })).plan.find((l) => /opens only the sites/.test(l.key));
  ok(!q.alsoSites && /\(only that host\)/.test(line.key), 'CONTROL: a record that does not freeze them leaves the card saying "only that host" for Google — the V1 rows above would be red');
}
console.log('— lane dc-browser-providers: a FAKE provider (fakebrowser — headless only, no build choice) — since lane dc-browser-backends its OWN FILE + ONE registration line in a copy of src/browser-backends/index.js');
{
  // the closed world: the fake backend's own file, a copy of the registration list with ONE added line, copies of
  // browser-profiles.js / browser-switch.js / browser-builds.js whose requires reach those copies — nothing else is edited
  const rd = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
  const FAKE_FILE = "'use strict';\nconst i18nKey = (s) => s;\nmodule.exports = Object.freeze({\n  id: 'fakebrowser',\n  row: Object.freeze({ launchArgs: Object.freeze(['--headless=new']), seeded: true, launchFlags: true, tier: 2, wired: true, label: 'FakeBrowser (headless only)', keyScope: 'none', canSwitchTo: 'in-place', ownsDir: true, leaseKind: 'tab', remote: null, starts: true, headed: false, binary: 'fakebrowser', cdp: true, allowedDomains: true, pinTab: true, consent: null }),\n  words: Object.freeze({ name: i18nKey('FakeBrowser'), chip: i18nKey('Fake'), blurb: i18nKey('A browser that only exists in this test.') }),\n});\n";
  const fakePath = M.write('src/browser-backends/cdp.js', FAKE_FILE, 'fake', { name: 'fakebrowser-backend' });
  const LAST = "  require('./local-window.js'),\n";
  const isrc = rd('src/browser-backends/index.js'), at = isrc.indexOf(LAST), end = at + LAST.length;
  ok(at > 0, 'the registration point: the last line of src/browser-backends/index.js, then the list closes');
  const iPath = M.write('src/browser-backends/index.js', isrc.slice(0, end) + `  require(${JSON.stringify(fakePath)}),\n` + isrc.slice(end), 'fake', { name: 'backends-fake' });
  const IDX = "require('./browser-backends/index.js')";
  const pPath = M.write('src/browser-profiles.js', rd('src/browser-profiles.js').split(IDX).join(`require(${JSON.stringify(iPath)})`), 'fake', { name: 'profiles-fake' });
  const PROF = "require('./browser-profiles.js')";
  const swSrc = rd('src/browser-switch.js').split(IDX).join(`require(${JSON.stringify(iPath)})`);
  const swPath = M.write('src/browser-switch.js', swSrc.split(PROF).join(`require(${JSON.stringify(pPath)})`), 'fake', { name: 'switch-fake' });
  const bbPath = M.write('src/browser-builds.js', rd('src/browser-builds.js').split(PROF).join(`require(${JSON.stringify(pPath)})`).split("require('./browser-switch.js')").join(`require(${JSON.stringify(swPath)})`), 'fake', { name: 'builds-fake' });
  const P = require(pPath), S = require(swPath), BB = require(bbPath);
  ok(P.providerIds().includes('fakebrowser') && P.providerControl('fakebrowser').ok === true && P.capabilityRefusal('fakebrowser', 'headed').code === 'provider_lacks_capability' && P.capabilityRefusal('fakebrowser', 'start') === null, 'the row is a provider: listed, usable here, refused a window by its own `headed: false` cell');
  const env = S.launchEnvFor('fakebrowser', { seed: 7, executablePath: '/opt/fake/chrome' });
  ok(JSON.stringify(env) === JSON.stringify({ AGENT_BROWSER_ARGS: '--headless=new,--fingerprint=7', AGENT_BROWSER_EXECUTABLE_PATH: '/opt/fake/chrome' }) && S.providerNeedsSeed('fakebrowser') && S.integrationIdFor('fakebrowser') === null && S.seedForSwitch({ profile: { provider: 'chromium' }, target: 'fakebrowser', hex: '0000002a' }).minted === true, 'THE LAUNCH ENV from the row: its own arguments + its seed + the executable; a seed minted at the switch; no key row', env);
  const profile = { id: 'bp-0000fa4e', label: 'fake', provider: 'chromium', dir: '/tmp/x' };
  const rows = S.switcherRows({ profile, providerIds: P.providerIds(), rowOf: P.providerRow, controlOf: P.providerControl, capabilityRefusalOf: P.capabilityRefusal, now: 1 });
  const fr = rows.find((r) => r.id === 'fakebrowser');
  ok(fr && fr.switchKind === 'in-place' && fr.integrationId === null && fr.facts.binary === null && S.switchChoices({ profile, providerIds: P.providerIds(), rowOf: P.providerRow, controlOf: P.providerControl }).includes('fakebrowser'), 'THE SWITCH VERDICT: chromium → fakebrowser is an in-place target and one of the profile\'s choices', fr && { state: fr.state, code: fr.code, reason: fr.reason });
  const build = { kind: 'build', version: '151.0.7922.34' };
  ok(BB.browserChoiceVerdict({ choice: build, provider: 'fakebrowser' }).code === 'browser_choice_provider' && BB.browserChoiceVerdict({ choice: build, provider: 'chromium', builds: { ok: true, builds: [] } }).code !== 'browser_choice_provider', 'no build choice: a Chrome build for the fake profile is refused by its `buildChoice` cell (chromium is not)');
  // the client models, fed the rows the routes carry (GET /api/browser/providers = providerRows; the profile view stamps buildChoice)
  const NP = await import('../src/lib/browser-new-profile-model.js'), SWM = await import('../src/lib/browser-switcher-model.js'), BM = await import('../src/lib/browser-build-model.js'), PM = await import('../src/lib/browser-panel-model.js');
  const t = (k, p) => String(k).replace(/\{(\w+)\}/g, (_, n) => (p && p[n] != null ? String(p[n]) : ''));
  const ch = NP.providerChoices({ providers: P.providerRows(), t }).find((c) => c.id === 'fakebrowser');
  ok(ch && ch.state === 'ready' && ch.pickable === true, 'New profile…: the fake row is a pickable choice off the /providers rows', ch);
  // lane dc-browser-backends (F5): its WORDS are its file's — the New profile… row, the switch dialog's name, the pill and
  // the blurb read them off the rows (no ladder over ids learns its name)
  ok(ch.name === 'FakeBrowser' && ch.blurb === 'A browser that only exists in this test.' && SWM.backendName('fakebrowser', t) === 'FakeBrowser' && SWM.chipWords({ id: 'fakebrowser' }, t) === 'Fake', 'its words are its own file\'s: New profile… names it, the switch dialog / pill / blurb say it', { ch, chip: SWM.chipWords({ id: 'fakebrowser' }, t) });
  // CONTROL (F5): the old id ladder restored in backendName ⇒ the fake backend is "an unknown browser" — the words row above would be red
  const smSrc = rd('src/lib/browser-switcher-model.js'), nameBody = "  return said(wordsOf(id), 'name', t) || t(i18nKey('an unknown browser'));\n";
  ok(smSrc.includes(nameBody), 'the control cuts backendName where it reads the row');
  const SWL = await import(M.write('src/lib/browser-switcher-model.js', smSrc.replace(nameBody, "  const s = String(id || '');\n  if (s === 'chromium') return 'Chromium';\n  if (s === 'cloak') return 'CloakBrowser';\n  return t(i18nKey('an unknown browser'));\n"), 'ladder', { esm: true }));
  SWL.learnBackendRows(P.providerRows());
  ok(SWL.backendName('fakebrowser', t) === 'an unknown browser' && SWL.backendName('cloak', t) === 'CloakBrowser', 'CONTROL: with the id ladder restored the fake backend has no name ("an unknown browser") — its words row above would be red');
  const m = SWM.switcherModel({ profile, rows }, { t });
  ok(m.targets.some((x) => x.id === 'fakebrowser'), 'the switch dialog\'s model draws a card for it', m.targets.map((x) => x.id));
  const fv = { id: 'bp-0000fa4e', provider: 'fakebrowser', buildChoice: !!P.providerRow('fakebrowser').buildChoice, live: false };
  ok(BM.cardBuildLine({ buildChoice: fv.buildChoice, choice: build }, t) === null && !PM.rowMenu(fv, { t }).some((x) => x.id === 'build') && PM.rowMenu({ ...fv, provider: 'chromium', buildChoice: true }, { t }).some((x) => x.id === 'build'), 'the panel: no build line, no Change build… for it — the cell says so, not the id');
  // CONTROL: the id ladder restored in launchEnvFor (`=== 'chromium'` / `!== 'cloak'`) ⇒ the fake launches with NO arguments
  const head = "  const row = rowOf(provider);\n";
  ok(swSrc.includes(head), 'the control cuts launchEnvFor where it reads the row');
  const lad = M.load('src/browser-switch.js', swSrc.split(PROF).join(`require(${JSON.stringify(pPath)})`).replace(head, head + "  if (String(provider == null ? '' : provider) === 'chromium') return executablePath ? { AGENT_BROWSER_EXECUTABLE_PATH: String(executablePath) } : {};\n  if (String(provider == null ? '' : provider) !== 'cloak') return {};\n"), 'id-ladder');
  ok(JSON.stringify(lad.launchEnvFor('fakebrowser', { seed: 7, executablePath: '/opt/fake/chrome' })) === '{}', 'CONTROL: with the `=== \'chromium\'` ladder restored the fake browser starts with no arguments, no seed, no executable — the launch-env row above would be red');
}
for (const c of copiesCensus(M.files, M.dir, REPO, { minCopies: 6 })) ok(c.pass, c.name, c.detail);

console.log(`\n${fail ? 'FAILED' : 'ALL PASS'} (${pass}${fail ? ` passed, ${fail} failed` : ''})`);
process.exit(fail ? 1 : 0);
