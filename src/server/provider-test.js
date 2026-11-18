'use strict';
// THE PROVIDER TEST RUNNER (lane lg-providers, B-d578 U4 — design q-045 §2.5 / D5 + the coordinator's five musts,
// 2026-11-17T23:24Z). ORCH: a PERSON's press (the route's personVerdict, `by: 'human'` here) → the harness's OWN CLI, once,
// non-interactive, says «ok» to the third party with that third party's key; its exit and words → a verdict (PURE
// src/provider-test-model.js). The hub builds no request. Spends one short request of the person's own key.
// THE ONE FORM THAT MUST NEVER MEET A SUBSCRIPTION — a one-shot print run (CLAUDE.md «Program-use billing», «§ban-safety»)
// — is made IMPOSSIBLE here, not unlikely:
//   1. the child's homes are its own: HOME, XDG_CONFIG_HOME and EVERY harness's config variable (each descriptor's
//      creds.homeEnvVar and creds.spawnEnvVar) are fresh EMPTY folders of one scratch dir made for this run and removed
//      after it — no sign-in file, no stored credential, no keychain entry (a keychain is keyed by the config dir);
//      the env is the sanitized agent env with EVERY credential name stripped (harness-env credentialEnvNames — the job
//      door's whole list), then the provider's plan (its address, its key) laid on;
//   2. it runs only on a THIRD PARTY's address: empty, not http(s), or on the vendor's own hosts ⇒ refused by name before
//      anything spawns (addressVerdict);
//   3. no key ⇒ no run: the vault locked, the entry gone, the reference foreign ⇒ refused by name (it never runs «without a
//      key to see what happens»);
//   4. a person's press only — `by: 'human'` (the one route asks personVerdict), one run per provider × harness at a time,
//      never a timer, never an agent's bearer; its spend-paths row (scripts/test-spend-paths.mjs) names this file and its
//      one caller.
// The key rides the child's ENV only (the plan's localEnv); argv carries the non-secret plan (codex's -c table) + the
// descriptor's creds.providerTest.argv. Output kept ≤ OUT_MAX, read by a person only through redact().
const fsp = require('fs').promises;   // the scratch dir is made and removed off the main thread (no *Sync call)
const os = require('os');
const { spawn } = require('child_process');
const path = require('path');
const MP = require('../model-providers.js');
const PT = require('../provider-test-model.js');

const VENDOR_FAMILY = /^(?:ANTHROPIC_|CLAUDE_|OPENAI_|CODEX_|AWS_|AZURE_|GOOGLE_|GEMINI_|VERTEX|BEDROCK|OPENROUTER_|DEEPSEEK_|MOONSHOT_|ZHIPU|MINIMAX_)/;
const EXIT_DRAIN_MS = 2000;   // after the leader exits, how long its pipes may stay open before the run settles

function create({ providers, harnessOf = (id) => require('../harnesses').get(id), harnesses = () => require('../harnesses').list(),
  cliFor = async () => null, agentEnv = () => ({}), credentialEnvNames = (ds) => require('../harness-env.js').credentialEnvNames(ds),
  redactSecrets = (s) => require('../secret-shapes.js').redactSecrets(s), spawnImpl = spawn,
  scratchRoot = os.tmpdir(), timeoutMs = PT.TIMEOUT_MS, now = () => Date.now(), log = (m) => console.log(m) } = {}) {
  const inFlight = new Set();
  /** the child's env: sanitized, every credential name gone, every harness home a fresh empty folder, the plan on top */
  async function childEnv(dir, sp) {
    const env = { ...agentEnv() };
    let ds = [];
    try { ds = harnesses() || []; } catch { ds = []; }
    for (const n of credentialEnvNames(ds)) delete env[n];
    // …and EVERY vendor-family name the env doors do not know (an ambient CLAUDE_CODE_USE_FOUNDRY, ANTHROPIC_CUSTOM_HEADERS,
    // AWS_* / AZURE_* / GOOGLE_* credentials would route the turn or carry a credential): a Test child needs none of them
    for (const n of Object.keys(env)) if (VENDOR_FAMILY.test(n)) delete env[n];
    const fresh = async (name) => { const d = path.join(dir, 'cfg', name); await fsp.mkdir(d, { recursive: true, mode: 0o700 }); return d; };
    for (const d of ds) {
      const c = (d && d.creds) || {};
      for (const v of [c.homeEnvVar, c.spawnEnvVar]) if (typeof v === 'string' && /^[A-Z_][A-Z0-9_]*$/.test(v)) env[v] = await fresh(v);
    }
    env.HOME = await fresh('HOME');
    env.XDG_CONFIG_HOME = await fresh('XDG_CONFIG_HOME');
    env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC = '1';   // the one request the test is for — no side traffic (q-045 §1.2, measured)
    Object.assign(env, sp.localEnv || {});
    return env;
  }
  /** ONE press → { ok: true, harness, verdict, detail, at } | { ok: false, code } (refused before anything spawned) */
  async function runProviderTest(id, harness, { by = null } = {}) {
    if (by !== 'human') return { ok: false, code: 'human_only' };
    const p = providers.thirdParty().find((r) => r.id === String(id || '')) || null;
    const a = PT.addressVerdict(p);
    if (!a.ok) return { ok: false, code: a.code };
    let h = null;
    try { h = harnessOf(harness); } catch { h = null; }
    if (!MP.fitsHarness(p, harness) || !h || !h.creds || typeof h.creds.providerSpawn !== 'function' || !h.creds.providerTest || typeof h.creds.providerTest.argv !== 'function') return { ok: false, code: 'unfit' };
    const slot = `${p.id}:${harness}`;
    if (inFlight.has(slot)) return { ok: false, code: 'in-flight' };
    const k = providers.keyOf(p.id);
    if (!k.ok || !k.value) return { ok: false, code: k.ok ? 'no-key' : k.code };
    const model = MP.resolveModel(p, '') || '';
    if (!model) return { ok: false, code: 'model-none' };   // never the CLI's own default id at a third party (as the spawn road)
    inFlight.add(slot);   // taken BEFORE the first await: a second press can never slip in while this one looks for its CLI
    let dir = null;
    try {
      let cmd = null;
      try { cmd = await cliFor(harness); } catch { cmd = null; }
      if (!cmd) return { ok: true, harness, verdict: 'cli-missing', detail: '', at: now() };
      dir = await fsp.mkdtemp(path.join(scratchRoot, 'vs-pvtest-'));
      const home = path.join(dir, 'cfg', 'PROVIDER_HOME');
      await fsp.mkdir(home, { recursive: true, mode: 0o700 });
      const sp = h.creds.providerSpawn({ provider: p, key: k.value, home });   // (named `sp`: test-architecture §69c reserves its word for the desktop install plans)
      const env = await childEnv(dir, sp);
      const work = path.join(dir, 'work');
      await fsp.mkdir(work, { mode: 0o700 });
      const argv = [...(sp.argv || []), ...h.creds.providerTest.argv(model)];
      const end = await new Promise((resolve) => {
        let out = '', dropped = 0, timedOut = false, exited = false, settled = false, child, drain = null;
        const settle = (x) => { if (settled) return; settled = true; clearTimeout(timer); clearTimeout(drain); resolve(x); };
        try { child = spawnImpl(cmd, argv, { cwd: work, env, stdio: ['ignore', 'pipe', 'pipe'], detached: true }); } catch (e) { resolve({ spawnError: e.code || e.message, out: '' }); return; }
        // the LAST OUT_MAX characters are kept (the CLIs put their error at the end)
        const take = (b) => { const s = String(b); out += s; if (out.length > PT.OUT_MAX) { dropped += out.length - PT.OUT_MAX; out = out.slice(-PT.OUT_MAX); } };
        child.stdout && child.stdout.on('data', take);
        child.stderr && child.stderr.on('data', take);
        // the group we spawned is signalled only while its leader is not yet seen to exit (never a reaped pid's group)
        var timer = setTimeout(() => { timedOut = true; if (!exited) { try { process.kill(-child.pid, 'SIGKILL'); } catch { try { child.kill('SIGKILL'); } catch { } } } settle({ code: null, signal: 'SIGKILL', timedOut, out, dropped }); }, timeoutMs);
        child.on('error', (e) => settle({ spawnError: e.code || e.message, out }));
        child.on('exit', (code, signal) => { exited = true; drain = setTimeout(() => settle({ code, signal, timedOut, out, dropped }), EXIT_DRAIN_MS); });
        child.on('close', (code, signal) => settle({ code, signal, timedOut, out, dropped }));
      });
      const verdict = PT.classify(end);
      const at = now();
      try { const w = await providers.noteTested(p.id, harness, verdict, at); if (w && w.ok === false) log(`[provider-test] ${p.id}: the result could not be kept (${w.code})`); } catch (e) { log(`[provider-test] ${p.id}: the result could not be kept (${e.message})`); }
      return { ok: true, harness, verdict, detail: verdict === 'ok' ? '' : PT.redact(end.out, k.value, redactSecrets), at };
    } finally {
      inFlight.delete(slot);
      if (dir) await fsp.rm(dir, { recursive: true, force: true }).catch(() => { });
    }
  }
  return { runProviderTest };
}

module.exports = { create };
