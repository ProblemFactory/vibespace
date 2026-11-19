#!/usr/bin/env node
// THE ACP HARNESS — THE SOURCE-TEXT LEGS (fast, text only — lane lg-text-legs-3, B-94d3 part three). MOVED VERBATIM from the
// heavy scripts/test-acp-harness.mjs, whose real wrapper vs a mock ACP agent, the normalizer, the caps row (a fresh module with
// its control), the settings table and the executable contract stay there (with its own architecture + release-gate pin): the
// wiring pins — the acp-events consumer, server.js, cli-env, ws-create's one verdict, files.js, app.js, index.html, the
// renderer, the descriptor dispatch, the collision resolver, the billing law. Each reads the file it pins BY NAME, so ci.mjs's
// affected rule selects this suite on a change of that file.
// Run: node scripts/test-acp-harness-pins.mjs
import fs from 'node:fs';
import path from 'node:path';
const REPO = path.resolve(new URL('..', import.meta.url).pathname);

let pass = 0, fail = 0;
const ok = (n, c, e) => { if (typeof n !== 'string') throw new TypeError(`ok(): the name is a ${typeof n} — swapped arguments (B-1747: a swap is a crash, never a green leg)`); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? ' — ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 400) : '')); } };
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');

console.log('— wiring pins');
{
  // S5: the acp-events consumer is its own module behind the stdout registry (src/server/stdout/acp-events.js)
  const so = read('src/server/stdout/acp-events.js');
  ok('stdout/acp-events.js is the acp-events consumer: id adoption from the session record, streaming from prompt_start/prompt_end, todos from plan, feedLive gate', /^const protocol = 'acp-events';$/m.test(so) && /msg\.kind === 'session'/.test(so) && /msg\.kind === 'prompt_end'\) \{\s*\n\s*session\._isStreaming = false/.test(so) && /u\.sessionUpdate === 'plan'/.test(so) && /noteHarnessModels\?\.\(session\.backend, msg\.models\)/.test(so));
  ok('…registered under its protocol in the stdout registry, and every ACP record reaches the normalizer through feedLive (never processLive)', /'acp-events': require\('\.\/acp-events\.js'\)/.test(read('src/server/stdout/index.js')) && (so.match(/feedLive\(session, msg\)/g) || []).length === 3 /* the loop's two + B-299b A1's routeLate (the after-turn records read off the loop; met at 2.369.412's second checkpoint) */ && !/_normalizer\.processLive/.test(so));
  const sv = read('server.js');
  ok('server.js wires noteHarnessModels into the stdout engine and exposes harnessAvailability on app.locals', /noteHarnessModels: \(\.\.\.a\) => noteHarnessModels\(\.\.\.a\)/.test(sv) && /app\.locals\.harnessAvailability = harnessAvailability/.test(sv));
  const ce = read('src/server/cli-env.js');
  ok('cli-env resolves each ACP harness executable once (env <ID>_CMD override) and hands acpWrapper/acpCommands to the adapter registry', /ACP_COMMANDS\[h\.id\] = raw\.startsWith\('\/'\) \? raw : \(resolveCmd\(raw\) \|\| null\)/.test(ce) && /acpWrapper: path\.join\(rootDir, 'data', 'bin', 'acp-wrapper\.js'\)/.test(ce) && /acpCommands: ACP_COMMANDS/.test(ce) && /function harnessAvailability\(\)/.test(ce) && /function noteHarnessModels\(backend, models\)/.test(ce));
  const wc = read('src/ws-create.js');
  // lane cli-shell-truth: the boot-fact branch FOLDED into THE ONE verdict — cliCmds.forSpawn's cli-missing (the person's
  // login shell asked, refused by name before the local ladder, dtach or a file), one road for every harness
  ok('ws-create refuses an uninstalled ACP harness BEFORE any spawn — by THE ONE verdict (cli-missing, its facts named)', !/adapter\.installed === false/.test(wc) && /is refused by THE ONE verdict below/.test(wc) && /code: 'cli-missing', reqId: data\.reqId, backend, cli: e\.cli/.test(wc));
  ok('files.js /api/home carries harness availability for the picker', /harnesses = typeof req\.app\.locals\.harnessAvailability === 'function'/.test(read('src/routes/files.js')));
  const app = read('src/lib/app.js');
  ok('app.js: the picker unhides an ACP backend only when installed; opencode session options row (build/plan, no effort ladder); effort row hidden by the declared ui.effortLevels (hasEffortMenu — lane effort-menu-per-harness: caps.effort is gone)', /opt\.hidden = !h\.installed/.test(app) && /opencode: \{\n    models: \[\{ id: '', label: t\('Default'\) \}\],/.test(app) && /\['row-effort', isShell \|\| !hasEffortMenu\(backend\)\]/.test(app) && /!BACKEND_SESSION_OPTIONS\[be\] \|\| !data\[be\]\?\.length\) continue;/.test(app));
  ok('index.html lists the opencode option hidden by default', /<option value="opencode" hidden>OpenCode<\/option>/.test(read('public/index.html')));
  const cr = read('src/lib/chat-renderers.js');
  ok('chat-renderers renders ORDERED permission options (harness-neutral) and replies with the chosen optionId', /Array\.isArray\(msg\.permission\.options\) && msg\.permission\.options\.length/.test(cr) && /optionId: o\?\.optionId \|\| null/.test(cr) && /data-option-id="\$\{escHtml\(String\(o\.optionId\)\)\}"/.test(cr));

  ok('mounts-plugins-wiring dispatches SessionMessages through the descriptor for non-claude/codex harnesses', /h\?\.store\?\.SessionMessages\) return new h\.store\.SessionMessages/.test(read('src/server/mounts-plugins-wiring.js')));
  ok('wrapper-files recognises the ACP wrapper in the dtach master argv (collision resolver)', /\(chat\|acp\)-wrapper\\\.js/.test(read('src/server/wrapper-files.js')));

  ok('the wrapper never touches a vendor API and never puts a secret in argv (program-use billing law)', !/api\.anthropic\.com|api\.openai\.com|Authorization: 'Bearer sk-/.test(read('data/bin/acp-wrapper.js')) && /clientCapabilities: \{ fs: \{ readTextFile: false, writeTextFile: false \}, terminal: false \}/.test(read('data/bin/acp-wrapper.js')));
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
