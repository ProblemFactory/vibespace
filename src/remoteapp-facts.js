'use strict';
/**
 * A PAIRED WINDOWS MACHINE'S REMOTE DESKTOP FACTS, READ WHERE THEY ARE (design q-024 r1 §1.4, lane remoteapp-r1b) — the
 * `remoteapp-facts` device op's runner. SHARED: the daemon bundles it and runs `readRemoteappFacts` on the paired machine
 * (src/agentd/agentd.js, the op's handler); the hub asks through the client's gated method (src/agentd/client.js
 * remoteappFacts) and the settings card shows the table (src/server/desktop-access.js remoteappFacts).
 * Node's execFile (handed in by the daemon) + the PURE src/remoteapp.js (the script, its parser) + the PURE
 * src/machine-desktop-model.js (the -EncodedCommand transport) only.
 *
 *   win32   ONE bounded PowerShell (REMOTEAPP_FACTS_SCRIPT, -EncodedCommand): READ-ONLY — the edition, fDenyTSConnections, a
 *           loopback connect to 3389, TSAppAllowList fDisabledAllowList, the GPU policy value — one JSON line → parseRemoteappFacts
 *   else    refused by name (RemoteApp is a Windows server feature) — no process is started
 */
const RA = require('./remoteapp.js');
const MD = require('./machine-desktop-model.js');

/** The look's bound on the machine (the script answers in well under a second; its loopback connect waits ≤ 2 s). */
const FACTS_MS = 15000;
/** The op's argv for this platform. → { ok, argv } | refusal */
function factsArgv(platform) {
  if (platform === RA.RDP_PLATFORM) return { ok: true, argv: [...MD.PS_ARGV, MD.psEncoded(RA.REMOTEAPP_FACTS_SCRIPT)] };
  return { ok: false, code: 'remoteapp_not_windows', error: `RemoteApp's facts are read on a Windows machine (this one runs ${platform || 'an unknown system'})` };
}
/** RUN the look where the facts are (the daemon hands its execFile + spawn env). → parseRemoteappFacts' answer (+ platform)
 *  | { ok:false, code, error } — never throws. */
function readRemoteappFacts({ platform, execFile, env }) {
  const how = factsArgv(platform);
  if (!how.ok) return Promise.resolve(how);
  return new Promise((resolve) => {
    execFile(how.argv[0], how.argv.slice(1), { env, windowsHide: true, timeout: FACTS_MS, maxBuffer: 64 * 1024, encoding: 'utf8' }, (err, stdout, stderr) => {
      const r = RA.parseRemoteappFacts(stdout);
      if (r.ok) return resolve({ ...r, platform });
      resolve({ ok: false, code: err ? 'facts_failed' : r.code, error: (String(stderr || '').trim().split('\n')[0] || (err && err.message) || r.error).slice(0, 200) });
    });
  });
}

module.exports = { FACTS_MS, factsArgv, readRemoteappFacts };
