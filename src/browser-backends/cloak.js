'use strict';
/**
 * CLOAKBROWSER — ONE browser backend, ONE file (lane dc-browser-backends, decoupling wave 2b). PURE: requires
 * nothing (the core requires IT, through the one registration line in src/browser-backends/index.js). What the
 * core knows of this backend is declared here, and nowhere else:
 *   row          its capability cells — src/browser-profiles.js PROVIDERS is DERIVED from the list (its `wired`
 *                cell is read against `egressProof` by the discipline there: no record it accepts ⇒ not wired)
 *   words        its name / chip / blurb, as i18n keys the client words through t() off the /providers rows
 *   keyRow       its key row — src/browser-switch.js KEY_ROWS is derived (src/server/browser-backend.js resolves
 *                every declared key row with one generic call)
 *   tiers        the vendor's two tiers (the free tier's Chromium major READ from the record, never respelled)
 *   egressProof  the §7.2.1 measurement (moved VERBATIM from src/browser-profiles.js — never re-measured here)
 *   install      the pinned install spec: the package, where its build unpacks, the install env (the keeper's ONE
 *                install slot, src/server/browser-installs.js, runs it)
 */
const i18nKey = (s) => s; // extraction marker (scripts/i18n-extract.mjs) — the client words it through t()

/**
 * §7.2.1 — THE EGRESS PRECONDITION, AS A RECORDED RESULT. Modelled on
 * src/local-oracles.js: a record carries `tool`, `date`, `version` and
 * per-run INET connect counts, or it is not a record. CloakBrowser is a
 * network tool by definition, so it can never be an ORACLE — this record
 * contributes the proof's SHAPE, not a zero-network verdict; it lives beside
 * the provider row so the UI can show what was measured and when.
 *
 * MEASURED 2026-09-28 (lane-cloak, the owner's 「下载吧」): npm `cloakbrowser`
 * 0.5.10 into a scratch prefix, its Chromium 146.0.7680.177.5 for linux-x64
 * downloaded ONCE into a VibeSpace-owned cache (never ~/.cloakbrowser), every
 * run under `env -i HOME=<empty dir>` + strace, launched the way the product
 * launches it (agent-browser 0.38.1, the binary + arguments in agent-browser's
 * own env names). What it says, in words:
 *   · the download reaches cloakbrowser.dev, which serves the archive through
 *     GitHub's release storage (github.com + release-assets.githubusercontent.com);
 *     the wrapper checks an Ed25519 signature over SHA256SUMS against a key
 *     pinned in its own code, locally, then the archive's SHA-256;
 *   · the BROWSER never connected anywhere but the loopback CDP port
 *     agent-browser drives it through — not at its first start, not from
 *     cache, not with a key in its environment, not idle for 10 minutes;
 *   · the free tier needs NO key and NO sign-in (the "gated by login" of the
 *     design's §7.2 is the vendor's upsell for its newer build, see `freeTier`).
 * Every target is named (a DNS answer in the trace names each address; a
 * loopback / resolver address is named by what it is) and tagged with the
 * PHASE it belongs to — `egressHostsOf` derives the two allowlists from those
 * tags, so the proxy admits exactly what the record implies and nothing is
 * written twice. `CLOAK_WIRED` (the row's `wired` cell) is DERIVED from this
 * record: a row cannot be re-enabled without a record the discipline accepts.
 *
 * Re-measure with scripts/measure-cloak-egress.mjs (its header lists what the
 * real package taught it); the version it names is the version the counts
 * describe, and the install pins exactly that version AND that Chromium.
 */
const CLOAK_EGRESS_RUNS = Object.freeze(['first launch (download expected)', 'second launch from cache', 'launch with a license key present', '10-minute idle browser']);
const tgt = (host, addr, port, by, n, phase) => Object.freeze({ host, addr, port, by, n, phase });
const LOOPBACK_CDP = (port) => tgt('loopback', '127.0.0.1', port, 'browser driver', 1, 'launch'); // the driver → the browser's own CDP port
const CLOAK_EGRESS_PROOF = Object.freeze({
  provider: 'cloak',
  tool: 'strace -f -qq -e trace=%network,execve,clone,clone3,fork,vfork -s 1024 -xx',
  date: '2026-09-28',
  version: '0.5.10',
  package: 'cloakbrowser@0.5.10',
  chromium: '146.0.7680.177.5',
  platform: 'linux-x64',
  status: 'measured',
  measuredWith: 'scripts/measure-cloak-egress.mjs',
  launchedVia: 'the browser driver VibeSpace runs (0.38.1), its executable path set to <chrome> and its browser arguments to --no-sandbox,--fingerprint=<seed>, both in its environment',
  pins: Object.freeze({ CLOAKBROWSER_VERSION: '146.0.7680.177.5', CLOAKBROWSER_AUTO_UPDATE: 'false' }),
  download: Object.freeze({
    url: 'https://cloakbrowser.dev/chromium-v146.0.7680.177.5/cloakbrowser-linux-x64.tar.gz',
    bytes: 216890134,
    sha256: '4a12bcde95fa1bb1beef2b41ab5e5c27c36be78e3be3d0dac8c64d705216670e',
    signature: 'Ed25519 over SHA256SUMS, checked locally against the one key pinned in the wrapper (dist/config.js BINARY_SIGNING_PUBKEYS); the manifest must name the pinned version; then the archive\'s SHA-256',
  }),
  binary: Object.freeze({ path: 'chromium-146.0.7680.177.5/chrome', sha256: '715722e8605ae3ce81523c1218aba1ec89425786ab33ceaf99f8a6cb5e70e6e8', dirBytes: 729336146, lastVersion: '146.0.7680.177' }),
  // measured with the same strace method BEFORE the four runs: the package manager, and the vendor's own offline probe
  install: Object.freeze([
    Object.freeze({ what: 'npm install --prefix <scratch> --no-save cloakbrowser@0.5.10 (the wrapper + its one dependency, tar)', inetConnects: 57, addrProbes: 48, targets: Object.freeze([tgt('dns resolver', '127.0.0.53', 53, 'npm', 2, 'npm'), tgt('registry.npmjs.org', '104.16.4.34', 443, 'npm', 7, 'npm')]) }),
    Object.freeze({ what: 'cloakbrowser info --quick --json (the vendor\'s network-free mode — the pin and the path are read from it)', inetConnects: 0, addrProbes: 0, targets: Object.freeze([]) }),
  ]),
  runs: Object.freeze([
    Object.freeze({
      what: CLOAK_EGRESS_RUNS[0], inetConnects: 21, addrProbes: 12, browserStarts: 10,
      targets: Object.freeze([tgt('dns resolver', '127.0.0.53', 53, 'wrapper', 4, 'download'), tgt('cloakbrowser.dev', '172.67.208.193', 443, 'wrapper', 2, 'download'), tgt('github.com', '140.82.116.3', 443, 'wrapper', 1, 'download'), tgt('release-assets.githubusercontent.com', '185.199.110.133', 443, 'wrapper', 1, 'download'), LOOPBACK_CDP(33851)]),
      note: 'the download: `cloakbrowser install` (pinned, auto-update off) fetched 216 890 134 bytes and printed "SHA256SUMS signature verified: Ed25519 OK" + "Checksum verified: SHA-256 OK". The binary\'s first start then came up (zygote + network service, one loopback CDP connect) and about a second later was replaced by a relaunch that the measurement\'s own flag-less `get cdp-url` caused (the 0.38.1 driver relaunches the browser when a call\'s launch view differs — the product carries the flags in the env of every call since); the relaunches, without --no-sandbox, died on the sandbox. The first-start trace spans about 60 s. No DNS query and no non-loopback connect from any browser process.',
    }),
    Object.freeze({ what: CLOAK_EGRESS_RUNS[1], inetConnects: 1, addrProbes: 0, browserStarts: 1, heldMs: 30000, targets: Object.freeze([LOOPBACK_CDP(33149)]), note: 'a second `cloakbrowser install` found the pinned build in the cache and made 0 connects; the browser then ran 30 s on about:blank' }),
    Object.freeze({ what: CLOAK_EGRESS_RUNS[2], inetConnects: 1, addrProbes: 0, browserStarts: 1, heldMs: 30000, targets: Object.freeze([LOOPBACK_CDP(42783)]), key: 'a dummy value in CLOAKBROWSER_LICENSE_KEY — not a license (no CloakBrowser account exists); the browser driver hands its environment to the browser it starts (checked with a stub browser that wrote its env)', note: 'the build received a key and sent it nowhere — it neither checks nor uses one' }),
    Object.freeze({ what: CLOAK_EGRESS_RUNS[3], inetConnects: 1, addrProbes: 0, browserStarts: 1, heldMs: 600000, targets: Object.freeze([LOOPBACK_CDP(33589)]), note: '10 minutes idle on about:blank: nothing but the loopback CDP connect it was opened with' }),
  ]),
  // what the free tier needs — measured where it could be, read in the vendor's own code (dist/*.js) where it could not
  freeTier: Object.freeze({
    key: 'none', login: 'none', chromiumMajor: 146,
    measured: 'the keyless build (Chromium 146) installed, started and ran with no key and no sign-in; its only output about keys is the wrapper\'s banner "Running the free binary (v146). The latest binary (v151) is free too, with 1 concurrent session. Get your key: run cloakbrowser login or visit https://cloakbrowser.dev/free"',
    withAKey: 'NOT measured (no key is authorized): with a key the wrapper validates it at cloakbrowser.dev/api/license/validate (a 24 h local cache) and downloads a DIFFERENT build (Chromium 151, cloakbrowser.dev/api/download/<v> with the key as a Bearer token), which checks the key with cloakbrowser.dev when it starts (exit 76 seat limit / 77 invalid key / 78 server unreachable). VibeSpace installs only the measured keyless build.',
  }),
  // the vendor's code names these; the pinned install never reached them, and the proxy refuses them (not in either allowlist)
  notReached: Object.freeze([
    Object.freeze({ host: 'api.github.com', why: 'the wrapper\'s hourly update check (then a silent download of a newer build) — off: CLOAKBROWSER_AUTO_UPDATE=false and a pinned CLOAKBROWSER_VERSION' }),
    Object.freeze({ host: 'registry.npmjs.org', why: 'the wrapper\'s own "update available" check — off with the same switch (npm reaching it to install the wrapper is the `npm` phase)' }),
    Object.freeze({ host: 'cloakbrowser.dev/api/license/*, /api/download/*', why: 'only with a key (see freeTier.withAKey)' }),
  ]),
  expectedRuns: CLOAK_EGRESS_RUNS,
});

/** Repository docs, verbatim in the design (§7.2/§7.4): the free tier ships
 *  Chromium 146 with ONE concurrent session; Pro ships 151 with 5/20/200/2000. */
// lane dc-browser-backends (F4): the free tier's major is READ from the measured record (it was respelled here as 146)
const CLOAK_TIERS = Object.freeze({
  free: Object.freeze({ total: 1, chromiumMajor: CLOAK_EGRESS_PROOF.freeTier.chromiumMajor }),
  pro: Object.freeze({ total: null, chromiumMajor: 151 }),
});
const CLOAK_PRO_TOTALS = Object.freeze([5, 20, 200, 2000]);

// lane-cloak (MEASURED 2026-09-28): `keyRequired: false` — the free CloakBrowser build runs with no key and no sign-in,
// and a key in its environment was sent nowhere (the §7.2.1 record's run 3). A key only matters for the vendor's
// NEWER build, which the wrapper downloads with the key (unmeasured — VibeSpace installs only the measured one).
// Every other key row needs its key (the vendor's API refuses without one).
const KEY_ROW = Object.freeze({ env: Object.freeze({ licenseKey: 'CLOAKBROWSER_LICENSE_KEY' }), host: null, keyRequired: false });

/** The npm package the §7.2.1 proof record describes. The install PINS the
 *  version that record names ("version pinning is part of this control": an
 *  unpinned download silently invalidates the measurement). */
const CLOAK_PACKAGE = 'cloakbrowser';
/** WHERE the wrapper unpacks the pinned Chromium (its getBinaryPath, mirrored): `<cache>/chromium-<v>/chrome` on Linux. */
function cloakBinaryPath({ cacheDir, chromium, platform = 'linux-x64' } = {}) {
  if (!cacheDir || !chromium) return null;
  const dir = `${String(cacheDir).replace(/\/+$/, '')}/chromium-${String(chromium)}`;
  if (/^darwin/.test(String(platform))) return `${dir}/Chromium.app/Contents/MacOS/Chromium`;
  if (/^windows/.test(String(platform))) return `${dir}/chrome.exe`;
  return `${dir}/chrome`;
}
/** Every CLOAKBROWSER_* name the wrapper reads (dist/config.js + license.js + download.js, 0.5.10) — the install env
 *  sets the three it needs and DROPS the rest: a key there would route the wrapper to the vendor's other, unmeasured
 *  build; a download URL / binary path / skip-checksum would bypass the pinned, signature-checked download. */
const CLOAK_ENV_NAMES = Object.freeze(['CLOAKBROWSER_CACHE_DIR', 'CLOAKBROWSER_VERSION', 'CLOAKBROWSER_AUTO_UPDATE', 'CLOAKBROWSER_LICENSE_KEY', 'CLOAKBROWSER_DOWNLOAD_URL', 'CLOAKBROWSER_BINARY_PATH', 'CLOAKBROWSER_SKIP_CHECKSUM', 'CLOAKBROWSER_RELEASE_CHANNEL', 'CLOAKBROWSER_LICENSE_STATUS_FILE']);
/** THE ENVIRONMENT of the binary step (`cloakbrowser install`): the caller's env minus every CLOAKBROWSER_* and proxy
 *  name, plus the cache dir, the PINNED Chromium, auto-update off and — when given — the install egress proxy (Node's
 *  fetch honours it under NODE_USE_ENV_PROXY=1, measured on Node 24). */
function cloakInstallEnv(base = {}, { cacheDir, chromium, proxyUrl = null } = {}) {
  const out = {};
  for (const [k, v] of Object.entries(base || {})) {
    if (v == null || /^CLOAKBROWSER_/.test(k) || /^(https?|no|all)_proxy$/i.test(k) || k === 'NODE_USE_ENV_PROXY') continue;
    out[k] = String(v);
  }
  out.CLOAKBROWSER_CACHE_DIR = String(cacheDir);
  out.CLOAKBROWSER_VERSION = String(chromium);
  out.CLOAKBROWSER_AUTO_UPDATE = 'false';
  if (proxyUrl) { out.HTTPS_PROXY = String(proxyUrl); out.HTTP_PROXY = String(proxyUrl); out.NODE_USE_ENV_PROXY = '1'; }
  return out;
}

module.exports = Object.freeze({
  id: 'cloak',
  row: Object.freeze({ launchArgs: Object.freeze(['--no-sandbox']), seeded: true, launchFlags: true, executable: 'installed', exeSetting: 'browser.cloak.executablePath', egressProxy: true, integrationId: 'cloak', tier: 2, wired: true, label: 'CloakBrowser (the same profile directory opened by the cloakbrowser binary, seeded)', keyScope: 'local-only', canSwitchTo: 'in-place', ownsDir: true, leaseKind: 'tab', remote: null, starts: true, headed: false, binary: 'cloakbrowser', cdp: true, allowedDomains: true, pinTab: true, consent: null,
    // lane dc-browser-backends: F6 — the backend a site's bot check is answered with (the propose runner's target);
    // F5 — it is installed by the user's act (the New profile… row offers Install while it is absent here)
    antiBot: true, install: true }),
  words: Object.freeze({ brand: true, name: 'CloakBrowser', chip: 'CloakBrowser', blurb: i18nKey('A browser that sites are less likely to block as a bot.') }),
  keyRow: KEY_ROW,
  tiers: CLOAK_TIERS,
  proTotals: CLOAK_PRO_TOTALS,
  egressProof: CLOAK_EGRESS_PROOF,
  egressRuns: CLOAK_EGRESS_RUNS,
  install: Object.freeze({ package: CLOAK_PACKAGE, binaryPath: cloakBinaryPath, envNames: CLOAK_ENV_NAMES, env: cloakInstallEnv }),
});
