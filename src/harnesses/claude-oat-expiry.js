/**
 * THE LONG-LIVED SETUP-TOKEN EXPIRY SWEEP (B-211a) — the claude descriptor's `expirySweep` hook
 * (src/harnesses/claude.js). MOVED VERBATIM out of server.js (lane dc-seams-server, decoupling wave
 * 2b, review rv-server-core M9): server.js now asks every descriptor's expirySweep({accounts,
 * serverNotice}) on its boot timer + 6 h interval and names no harness.
 */
// Long-lived-token expiry sweep (B-211a): setup-token tokens live exactly 1
// year and a 401 has NO self-heal — warn while there's still time to re-mint.
// Once per boot, notice-deduped per account.
function checkOatExpiry({ accounts, serverNotice }) {
  try {
    for (const a of accounts.list().accounts) {
      if (!a.oat || typeof a.oatDaysLeft !== 'number') continue;
      if (a.oatDaysLeft <= 0) {
        serverNotice(`oat-expired-${a.id}`, `The long-lived token for "${a.name}" has EXPIRED — sessions using it will fail until you re-mint one (Manage agents → the account's ⋯ menu → Long-lived token).`, { level: 2 });
      } else if (a.oatDaysLeft <= 21) {
        serverNotice(`oat-expiring-${a.id}`, `The long-lived token for "${a.name}" expires in ${a.oatDaysLeft} days — re-mint it soon (Manage agents → ⋯ → Long-lived token).`, { level: 2 });
      }
    }
  } catch { }
}

module.exports = { checkOatExpiry };
