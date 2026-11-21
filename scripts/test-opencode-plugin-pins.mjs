#!/usr/bin/env node
// THE OPENCODE SERVICE PLUGIN — THE SOURCE-TEXT LEGS (fast, text only — lane lg-text-legs-3, B-94d3 part three). MOVED VERBATIM
// from the heavy scripts/test-opencode-plugin.mjs, whose plugin def, decideAutostart, real keeper / server / browser legs stay
// there (with its own release-gate row pin): ①b ONE broken-store predicate, ⑥ the wiring pins (the create funnel, the dialog,
// app.js, the sidebar row, the route, the kill switch, the control plugin, the strings' zh / ja, the docs). Each reads the file
// it pins BY NAME, so ci.mjs's affected rule selects this suite on a change of that file.
// Run: node scripts/test-opencode-plugin-pins.mjs
import './scratch.mjs';   // FIRST (B-ba47): a suite that reads a home or loads a module that does takes the re-home before any of its code (§113 THE ROW: a NEW one takes the import)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let pass = 0, fail = 0;
const ok = (n, c, e) => { if (typeof n !== 'string') throw new TypeError(`ok(): the name is a ${typeof n} — swapped arguments (B-1747: a swap is a crash, never a green leg)`); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? ' — ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 600) : '')); } };
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');

console.log('— ①b the /api/home "broken store" predicate (a deliberately-off service is NOT broken)');
{
  const ce = read('src/server/cli-env.js');
  ok('ONE predicate: /api/home AND the live harness-store-updated push both call it (they were twins that disagreed — and the loud half was /api/home)', /const failed = storeFailureReason\(h\);/.test(ce) && /const reason = storeFailureReason\(harnessOf\('opencode'\), st\);/.test(ce) && !/autostart === false/.test(ce));
}

console.log('— ⑥ wiring pins');
{
  const sl = read('src/lib/session-lifecycle.js');
  ok('createSession (the ONE create/resume/fork funnel) offers the service without BLOCKING the spawn, and never as an unhandled rejection', /this\.maybeOfferHarnessService\?\.\(backend, \{ needsService: false \}\)/.test(sl) && /if \(!fork\) \{ try \{ Promise\.resolve\(this\.maybeOfferHarnessService/.test(sl) && (sl.match(/\)\.catch\(\(\) => \{\}\);/g) || []).length >= 2);
  ok('a FORK awaits it — a fork is minted THROUGH the service, so it genuinely cannot proceed without it', /async _doForkSession\(/.test(sl) && /await this\.maybeOfferHarnessService\?\.\(backend, \{ needsService: true \}\)/.test(sl));
  ok('viewSession (opening stopped history) offers it and RE-OPENS the window after an enable', /if \(offerService\) try \{[\s\S]{0,400}maybeOfferHarnessService\?\.\(backend, \{[\s\S]{0,200}retry: \(\) => \{/.test(sl) && /this\.viewSession\(sessionId, cwd, sessionName, \{ syncId, backend/.test(sl));
  ok('a layout REPLAY (and the retry\'s own re-open) is not a user action — those call sites pass offerService:false, so the dialog never fires on boot or twice', (sl.match(/offerService: false/g) || []).length === 3 && /viewSession\(sessionId, cwd, sessionName, \{ syncId, backend = 'claude'[^)]*offerService = true/.test(sl));
  ok('the re-opened history window keeps its geometry AND its home desktop (the 2.295.0 class: a rebuilt window must not land on whatever desktop is active)', /const dm = this\.desktopManager, home = bounds\?\.desktopId;/.test(sl) && /dm\.moveWindowToDesktop\(again\.id, home\)/.test(sl));
  const pu = read('src/lib/plugins-ui.js');
  ok('the dialog is createModalShell (never prompt/alert/confirm) with Enable & start / Not now', /_harnessServiceDialog\(meta, st\)/.test(pu) && /createModalShell\(\{[\s\S]{0,200}id: 'harness-service-dialog'/.test(pu) && /t\('Not now'\)/.test(pu) && /t\('Enable & start'\)/.test(pu) && !/\b(confirm|alert|prompt)\(/.test(pu));
  ok('ONE offer at a time (a layout restore can open five history windows in a tick)', /this\._svcOffers \|\|= new Map\(\)/.test(pu) && /if \(inFlight\) return inFlight\.then/.test(pu));
  ok('"Not now" POSTs the instance-wide flag; Enable POSTs enabled+start and then WAITS bounded for the serve', /\/prompted`, \{ method: 'POST'/.test(pu) && /post\('enabled', \{ enabled: true \}\)/.test(pu) && /post\('start'\)/.test(pu) && /SERVICE_START_WAIT_MS/.test(pu));
  ok('every failure on that path reaches the user (no silent failure)', /showToast\(e\.message \|\| t\('Failed'\), \{ type: 'error' \}\); return false;/.test(pu) && /has not answered yet/.test(pu));
  ok('the ⚙ → Plugins row renders the service (state chip, env-forced notice, ONE on-switch — lane plugin-settings-p0) without a config box', /const isServe = provides\(p, 'serve'\)/.test(pu) && /Forced OFF by the environment/.test(pu) && /t\('Enable & start'\)/.test(pu) && /onSwitch = \(on\) => act\(\(\) => api\('enabled', \{ body: JSON\.stringify\(\{ enabled: on \}\) \}\)\);/.test(pu));
  const app = read('src/lib/app.js');
  ok('app.js fills BACKEND_META.service from /api/home AND keeps it live from plugins-updated + harness-store-updated (multi-client law)', /BACKEND_META\[h\.id\]\.service = h\.service \|\| null;/.test(app) && /msg\.type !== 'plugins-updated' \|\| !msg\.services/.test(app) && /if \(msg\.service !== undefined\) BACKEND_META\[msg\.backend\]\.service = msg\.service \|\| null;/.test(app));
  ok('agent-meta declares the control plugin for opencode (the client mirror of store.servicePlugin)', /servicePlugin: 'opencode-serve'/.test(read('src/lib/agent-meta.js')));
  const sb = read('src/lib/sidebar.js');
  ok('the sidebar hint row is generic over BACKEND_META.servicePlugin (never a backend id) and only shows once the user has met the harness', /_renderServiceHintRows\(sessions\) \{/.test(sb) && /const svc = meta\.servicePlugin \? meta\.service : null;/.test(sb) && /svc\.prompted \|\| \(sessions \|\| \[\]\)\.some/.test(sb));
  ok('…and an OPS-forced-off service gets the same EXPLANATION with no Enable button (nothing the user clicks there could work) — it is the only in-product word left now that "off" is not an error toast', /if \(svc\.envForced !== false\) \{[\s\S]{0,400}sidebar-service-enable[\s\S]{0,300}row\.append\(enable\);/.test(sb) && !/svc\.envForced === false\) continue;/.test(sb));
  ok('…and it is rendered by the WORKBENCH, the one builder that owns the sessions list on desktop AND mobile (it wipes listEl, so a row added in _renderInner would be silently thrown away — how this shipped broken once)', /this\._renderServiceHintRows\?\.\(sessions\);/.test(read('src/lib/sidebar-workbench.js')) && (sb.match(/_renderServiceHintRows\?\.\(/g) || []).length === 1 && /_renderServiceHintRows\?\.\(sessions\);\s*\n\s*return;/.test(sb));
  // (the ONE call sidebar.js keeps is the empty-list branch's, and it must sit
  // immediately before that branch's `return` — nothing wipes listEl after it)
  const mw = read('src/server/mounts-plugins-wiring.js');
  ok('POST /api/plugins/:id/prompted exists next to the other plugin routes', /app\.post\('\/api\/plugins\/:id\/prompted'/.test(mw));
  const os_ = read('src/opencode-serve.js');
  ok('the ops kill switch is checked INSIDE the adoption rung (before the reuse is taken), not only at the spawn gate below it', /serveEnvOverride\(\) === false\s*\n?\s*\? 'VIBESPACE_OPENCODE_SERVE=0 is set on this instance/.test(os_) && /const bad = serveEnvOverride\(\) === false/.test(os_));
  ok('…and install() runs the ladder ONCE under the switch, so an instance nobody polls does not leave an inherited daemon indexing', /if \(serveEnvOverride\(\) === false && locator\?\.ensure\)/.test(os_) && /setImmediate\(\(\) => \{ Promise\.resolve\(locator\.ensure\(\)\)/.test(os_));
  const pl = read('src/plugins/opencode-serve.js');
  ok('the opencode-serve plugin (src/plugins/opencode-serve.js) is the CONTROL SURFACE only: it holds no keeper, no spawn of `opencode serve`, and reads every fact from the shared module', /const serve = h\.opts\.opencodeServe \|\| require\('\.\.\/opencode-serve'\)/.test(pl) && !/spawn\([^)]*serve/.test(pl) && /ocServeState\(\)/.test(pl) && /ocLocator\(\)\?\.stop\?\.\(\{ killRecorded: true \}\)/.test(pl));
  ok('cli-env puts the control plugin\'s state on the harness row (declaration-driven, not an id list)', /if \(h\.store\?\.servicePlugin\) \{ try \{ row\.service = getPlugins\(\)\?\.serviceState\?\.\(h\.store\.servicePlugin\)/.test(read('src/server/cli-env.js')));
  const zh = read('src/lib/i18n-zh.js'), ja = read('src/lib/i18n-ja.js');
  const keys = ['Not now', 'Enable & start', 'Turn {name} on or off'];
  ok('the new user-visible strings carry zh + ja entries (i18n-check parity)', keys.every((k) => zh.includes(`"${k}"`) && ja.includes(`"${k}"`)), keys.filter((k) => !zh.includes(`"${k}"`) || !ja.includes(`"${k}"`)));
  ok('docs updated: kb-file-structure (plugins.js + opencode-serve + plugins-ui), kb-features, the design S9 row, docs/settings.md', /opencode-serve.*PLUGIN|OpenCode background service/.test(read('docs/kb-file-structure.md')) && /OpenCode background service/.test(read('docs/kb-features.md')) && /OpenCode background service/.test(read('docs/design-harness-plugins.md')) && /Removed 2026-09-07/.test(read('docs/settings.md')) && /## Built-in plugins/.test(read('docs/plugins.md')) && /POST \/api\/plugins\/:id\/prompted/.test(read('docs/kb-api.md')));

}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
