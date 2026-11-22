#!/usr/bin/env node
// THE MEDIATION WRAPPER's WORDS (fast, text only — lane text-legs, B-94d3). MOVED VERBATIM from the heavy
// scripts/test-browser-mediation.mjs (its mediated CDP legs and every mutant CONTROL stay there): data/bin/vibespace-browser's own
// words about a takeover — it INTERRUPTS the agent, says browser_interrupted, never «not script evaluation». It reads the file BY
// NAME, so ci.mjs's affected rule selects this suite on a change of it.
// Run: node scripts/test-browser-mediation-pins.mjs
import './scratch.mjs';
import fs from 'node:fs';
import path from 'node:path';
let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (typeof n !== 'string') throw new TypeError('a leg\'s name is not a string — its arguments are swapped (test-ci-gate-tiers §7b)'); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra ? '\n    ' + String(extra).slice(0, 500) : '')); } return !!c; };

console.log('— the wrapper says the takeover truthfully (source pin)');
  { const REPO_DIR = new URL('..', import.meta.url).pathname; const wrapperTxt = fs.readFileSync(path.join(REPO_DIR, 'data/bin/vibespace-browser'), 'utf8'); const manual = fs.readFileSync(path.join(REPO_DIR, 'docs/agent/browser-manual.md'), 'utf8');
    ok(/Taking over INTERRUPTS you/.test(wrapperTxt) && /browser_interrupted/.test(wrapperTxt) && !/not script evaluation/.test(wrapperTxt) && /Taking over interrupts you/.test(manual) && /browser_interrupted/.test(manual) && !/which is NOT fenced/.test(manual) && !/fenceScriptsWhileDriven/.test(wrapperTxt + manual), 'the CLI\'s `watch` and the manual say the same: a takeover interrupts (browser_interrupted) — no surface still says scripts pass or names the retired switch'); }

console.log('— B-19a9 (r1840 / r1846): THE ROAD VERDICT names each raw case by its own reason; a paired machine is a PARAMETER of the scope road (PURE + source pins)');
{
  const { createRequire } = await import('node:module');
  const require = createRequire(import.meta.url);
  const { anchored } = await import('./scratch.mjs');
  const M = require('../src/browser-mediation.js');
  const REPO_DIR = new URL('..', import.meta.url).pathname;
  const law = (fn) => {
    const r = (o) => fn({ proxy: true, agent: true, ...o });
    const paired = r({ paired: true }), local = r({}), ext = r({ external: true }), extPaired = r({ external: true, paired: true }), rs = r({ remoteSession: true }), rsPaired = r({ remoteSession: true, paired: true });
    const off = fn({ proxy: false, agent: true, paired: true }), med = fn({ mediated: true, proxy: true, paired: true }), human = fn({ proxy: true, agent: false, paired: true });
    return paired.mode === 'scope' && paired.why === 'shared' && paired.paired === true && local.mode === 'scope' && local.why === 'shared' && !('paired' in local)
      && ext.mode === null && ext.why === 'external' && extPaired.why === 'external' && rs.mode === null && rs.why === 'remote-session' && rsPaired.why === 'remote-session'
      && off.mode === null && off.why === 'no-proxy' && med.mode === 'mediated' && human.mode === null && human.why === 'human';
  };
  ok(law(M.leaseRoadVerdict), 'the verdict: a PAIRED machine\'s agent lease ⇒ scope (why shared, paired: true), as a local one; an outside endpoint ⇒ raw «external» and a remote conversation ⇒ raw «remote-session», each by its own reason, paired or not; mediation OFF ⇒ «no-proxy», today\'s road (r1846 (d)); mediated and the user\'s own session unchanged');
  const medSrc = fs.readFileSync(path.join(REPO_DIR, 'src/browser-mediation.js'), 'utf8');
  const fnSrc = /\nfunction leaseRoadVerdict\([\s\S]*?\n\}\n/.exec(medSrc);
  const compile = (src) => new Function('MEDIATED_MODE', 'SCOPE_MODE', src + '\nreturn leaseRoadVerdict;')(M.MEDIATED_MODE, M.SCOPE_MODE);
  const rel = fnSrc ? anchored(fnSrc[0], "  return paired ? { mode: SCOPE_MODE, why: 'shared', paired: true } : { mode: SCOPE_MODE, why: 'shared' };", "  return paired ? { mode: null, why: 'remote' } : { mode: SCOPE_MODE, why: 'shared' };", 'b19a9-release-remote') : '';
  ok(!!fnSrc && law(compile(fnSrc[0])) && !law(compile(rel)), 'CONTROL (RED): the verdict compiled from its own source holds the law; the release\'s road for a paired machine (raw «remote») in a copy fails it');
  // THE PARITY (r1846 (a)): ONE road — no keeper caller hands the verdict the lumped `remote`, two hand it the SAME facts (roadFactsOf),
  // and a lease's scope url is minted at ONE place (leaseUrlFor: the verdict's mode its only gate — no machine branch)
  const kp = fs.readFileSync(path.join(REPO_DIR, 'src/server/browser-keeper.js'), 'utf8');
  const calls = [...kp.matchAll(/M\.leaseRoadVerdict\(\{([\s\S]*?)\}\)/g)].map((m) => m[1]);
  const lu = /\n  async function leaseUrlFor\(p, browserKey, raw\) \{[\s\S]*?\n  \}\n/.exec(kp);
  const parity = (src, luSrc, cs) => cs.length >= 4 && cs.every((c) => !/\bremote:/.test(c)) && cs.filter((c) => /\.\.\.roadFactsOf\(p, rec\)/.test(c)).length === 2
    && !!luSrc && luSrc.includes('if (!raw || !p || leaseRoadOf(p, browserKey).mode !== M.SCOPE_MODE) return raw;') && !/\.host\b|paired|hostId/.test(luSrc)
    && (src.match(/mode: M\.SCOPE_MODE/g) || []).length === 1;
  ok(parity(kp, lu && lu[0], calls), `the PARITY: the keeper's ${calls.length} verdict callers pass no lumped \`remote\` (two hand it roadFactsOf), and leaseUrlFor mints the scope url by the verdict alone — no machine branch, ONE scope grant site`);
  const second = lu ? anchored(lu[0], '    if (!raw || !p || leaseRoadOf(p, browserKey).mode !== M.SCOPE_MODE) return raw;\n', '    if (!raw || !p || leaseRoadOf(p, browserKey).mode !== M.SCOPE_MODE) return raw;\n    if (p.host) return raw;\n', 'b19a9-second-road') : '';
  ok(!parity(kp, second, calls), 'CONTROL (RED): a second road in a copy (a paired machine handed the raw url) fails the parity');
  // r1846 (c), round wpdtugrv1 MUST 2: the grant follows the forward — the paired START and the PAIRED adoption (the re-forward that sets
  // the new url — never the outside-endpoint branch, which holds no scope grants) repoint, as the local starts do
  const rp = (src) => /rec\.remoteCdpUrl = r\.cdpUrl; rec\.cdpUrl = fwd\.url; rec\.forward = \{ remotePort: r\.cdpPort, localPort: fwd\.localPort \};\n\s+if \(mediator\) mediator\.repoint\(profileId, rec\.cdpUrl\);/.test(src)
    && /rec\.remoteCdpUrl = cdp\.url; rec\.cdpUrl = fwd\.url; rec\.forward = \{ remotePort: cdp\.port, localPort: fwd\.localPort \};\n\s+if \(mediator\) mediator\.repoint\(rec\.profileId, rec\.cdpUrl\);/.test(src);
  const noStartRepoint = anchored(kp, '        if (mediator) mediator.repoint(profileId, rec.cdpUrl); // B-19a9 (r1846 (c))', '        // (no repoint)', 'b19a9-no-start-repoint');
  const noAdoptRepoint = anchored(kp, '      if (mediator) mediator.repoint(rec.profileId, rec.cdpUrl); // B-19a9 (r1846 (c), round wpdtugrv1 MUST 2)', '      // (no repoint)', 'b19a9-no-adopt-repoint');
  ok(rp(kp) && !rp(noStartRepoint) && !rp(noAdoptRepoint), 'the paired START and the PAIRED ADOPTION (its re-forward line) repoint the leases\' grants at the new forward url (r1846 (c)); CONTROL (RED), each for one reason: the start without its repoint, the paired adoption without its repoint');
  // round wpdtugrv1 MUST 1: THE TAB FENCE follows the ROAD's verdict, never the machine — a paired scope lease is fenced like a local one
  const fence = (src) => src.includes("    if (leaseRoadOf(p, bk).mode !== M.SCOPE_MODE && (p.host || !isLocalRec(rec))) return { ok: true, passthrough: true, why: 'a browser on another machine' };")
    && !src.includes("    if (p.host || !isLocalRec(rec)) return { ok: true, passthrough: true, why: 'a browser on another machine' };"); /* stale-pins: kept — the release's machine branch must be ABSENT */
  const machineFence = anchored(kp, "    if (leaseRoadOf(p, bk).mode !== M.SCOPE_MODE && (p.host || !isLocalRec(rec))) return { ok: true, passthrough: true", "    if (p.host || !isLocalRec(rec)) return { ok: true, passthrough: true", 'b19a9-machine-fence'); /* stale-pins: kept — the RED copy restores the release's machine branch */
  ok(fence(kp) && !fence(machineFence), 'THE TAB FENCE passes a browser through only on a RAW road (the verdict) — a paired machine\'s scope lease goes through the same fence (another holder\'s tab refused not_your_tab); CONTROL (RED): the release\'s machine branch in a copy (a paired scope lease waved through)');
  // round wpdtugrv1: roadFactsOf's CONTENT, compiled from its own source (the ONE fact helper every road verdict reads)
  const rf = /\n  const roadFactsOf = (\(p, rec\) => \{[^\n]*\});\n/.exec(kp);
  const compileRF = (src) => new Function('isEph', 'rowOf', 'return ' + src)((p) => !!(p && p.ephemeral), (id) => (id === 'agent-browser' ? { starts: true, cdp: true } : id === 'cdp' ? { starts: false, cdp: true } : id === 'local-window' ? { starts: false, cdp: false } : null));
  const factsLaw = (fn) => { const a = fn({ host: 'h1', provider: 'agent-browser' }, { hostId: 'h1' }), b = fn({ host: 'h1', provider: 'cdp' }, null), c = fn({ provider: 'agent-browser' }, { external: true }), d = fn({ provider: 'agent-browser' }, {}), e = fn({ provider: 'local-window' }, null);
    return a.paired === true && a.external === false && b.external === true && b.paired === false && c.external === true && d.external === false && d.paired === false && e.external === true; };
  const rfBad = rf ? anchored(rf[1], "return { external, paired: !external && !!((p && p.host) || (rec && rec.hostId)) };", "return { external: external || !!(p && p.host), paired: false };", 'b19a9-paired-as-external') : '';
  ok(!!rf && factsLaw(compileRF(rf[1])) && !factsLaw(compileRF(rfBad)), 'roadFactsOf (compiled from the keeper): a paired machine\'s started profile ⇒ paired; an outside endpoint (a `cdp` profile, a record not started here, a provider that does not start) ⇒ external; a local one ⇒ neither; CONTROL (RED): a copy that calls a paired profile external');
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
