'use strict';
/**
 * THE MATERIALIZED LONG-LIVED TOKEN'S CLOCK (lane pool-oat-materialize, design
 * q-035 A). accounts.syncOatFile writes a member's long-lived token into its
 * credential file only on a CLI version the measurement named (cli-caps
 * oatInFile over scripts/fixtures/oat-in-file.json). This module tells the
 * store which CLI the hub spawns — `claude --version` through machine-probes,
 * the read backend-status already makes — at boot and every RECHECK_MS (an
 * upgrade to an unmeasured version makes the store take its files back), and
 * runs the store's sweep on the same tick, so a login that dies AFTER its
 * row's token was minted gets the token in its folder without anyone pressing
 * anything. No vendor call: the probe runs the local binary's --version only.
 * The sweep runs off the loop's back (the store's ONE queue, one row per loop
 * turn — pool-oat-materialize verify r1 F13); a tick resolves when it is done.
 * This module never touches a credential file itself: the store is the actor.
 * The same tick tells `onCliVersion` the version it read (lane cli-2-1-308-records: src/server/cli-registration.js
 * says ONCE when that build is one the record oracle does not know) — one --version read serves both.
 */
const RECHECK_MS = 15 * 60e3;
const BOOT_DELAY_MS = 20e3;

function start({ accounts, machineProbes, claudeCmd, onCliVersion = null, log = (...a) => console.log(...a), recheckMs = RECHECK_MS, bootDelayMs = BOOT_DELAY_MS } = {}) {
  if (!accounts || typeof accounts.noteCliVersion !== 'function' || !machineProbes || typeof machineProbes.cliVersion !== 'function') return { stop() { }, tick: async () => null };
  let timer = null, stopped = false, said = undefined;
  async function tick() {
    let caps = null;
    try {
      const v = await machineProbes.cliVersion(claudeCmd || 'claude');
      // a probe that FAILED (a timeout on a loaded box, the binary mid-upgrade) is not an unmeasured CLI: the
      // last known version stands — taking credential files back from running sessions on a hiccup is the bug
      if (!v) { caps = { ...accounts.oatFileCaps(), changed: false }; if (said !== 'probe-failed') { said = 'probe-failed'; log(`[oat-file] claude --version gave no answer — keeping CLI ${caps.cli || '(unknown)'}`); } await accounts.syncOatFiles(); return caps; }
      caps = accounts.noteCliVersion(v);      // a changed verdict re-syncs every row itself
      if (onCliVersion) { try { onCliVersion(caps.cli || v); } catch { } }
      if (!caps.changed) await accounts.syncOatFiles(); // else: a login that died since the last tick
      else await accounts.oatFileSettled();
      const words = `${caps.cli || 'unknown'}:${caps.ok}`;
      if (words !== said) { said = words; log(`[oat-file] claude CLI ${caps.cli || '(unknown)'} — ${caps.ok ? 'measured: a member with no usable login gets its long-lived token in its folder' : `not measured (fixture: ${caps.measured || 'none'}): no long-lived token goes into a member folder, nothing new is placed on one already there, and those stay while a session's link names their member`}`); }
    } catch (e) { log('[oat-file] sweep failed:', (e && e.message) || e); }
    return caps;
  }
  function loop() {
    timer = setTimeout(async () => { await tick(); if (!stopped) loop(); }, timer === null ? bootDelayMs : recheckMs);
    if (timer.unref) timer.unref();
  }
  loop();
  return { stop() { stopped = true; if (timer) clearTimeout(timer); }, tick };
}

module.exports = { start, RECHECK_MS, BOOT_DELAY_MS };
