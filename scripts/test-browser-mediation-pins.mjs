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
  // r1846 (c): the grant follows the forward — the paired START and the paired ADOPTION repoint, as the local starts do (the heavy
  // paired leg proves the effect: a restarted paired browser is reached by the SAME grant url)
  const rp = (src) => /rec\.remoteCdpUrl = r\.cdpUrl; rec\.cdpUrl = fwd\.url; rec\.forward = \{ remotePort: r\.cdpPort, localPort: fwd\.localPort \};\n\s+if \(mediator\) mediator\.repoint\(profileId, rec\.cdpUrl\);/.test(src)
    && /rec\.state = 'ready'; rec\.adoptedAt = now\(\);\n\s+if \(mediator\) mediator\.repoint\(rec\.profileId, rec\.cdpUrl\);/.test(src);
  const noRepoint = anchored(kp, '        if (mediator) mediator.repoint(profileId, rec.cdpUrl); // B-19a9 (r1846 (c))', '        // (no repoint)', 'b19a9-no-repoint');
  ok(rp(kp) && !rp(noRepoint), 'the paired START and the paired ADOPTION repoint the leases\' grants at the new forward url (r1846 (c)); CONTROL (RED): the start without its repoint fails it');
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
