#!/usr/bin/env node
// THE STRIP'S ONE TABLE (gate row `test-strip-table`; lane mask-value-shape, the chat status strip step two — spec
// /var/tmp/vibespace-lanes/chat-status-strip/page.md §1 / §4, the owner's acceptance of 2026-11-14).
//   ① the table: one row per mark, a valid class and place; row 1 holds class I only; row 2 holds II, then III's one door
//   ② the arrangement with EVERY mark present at once: ONE row at 960 and above; the SAME two rows from 280 to 959; short
//      forms at 360 and below; nothing behind «show more» at any width
//   ③ a thing is always in the same place: its order does not move when its neighbours come and go
//   ④ THE CENSUS of src/lib/chat-status-bar.js: every mark it draws has a row (none unknown); the marks still drawn on the
//      strip that the table places elsewhere are the named debt the bar's rewrite (P2) brings to zero
//   ④a MOVED, NOT LOST: every mark off the strip names its home; only what the page removes is gone (red controls)
//   ⑤ RED CONTROLS: a planted mark the table does not know is red by name; a detail put back on the strip is red by name
//   ⑥ THE FACES (src/lib/strip-faces.js, the cure of 644a67ec2's MUST 4): a known value wears its label, a value its harness
//      does not declare wears its raw spelling — never a guessed face (the adversarial read's cases, each a row)
// PURE + source text only — no DOM, no clock.
import './scratch.mjs';
import fs from 'node:fs';
import path from 'node:path';
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
import { checker } from './lib/check.mjs';   // THE ONE assertion helper (B-1747): the condition FIRST, a boolean; a swap throws
const { ok, report } = checker();
const T = await import(path.join(REPO, 'src/lib/strip-table.js'));
const { STRIP_ROWS, ROW_OF, DOORS, HOMES, PAGE_REMOVES, arrange, censusOfBar, homesCensus, onStrip, insideOf, ONE_ROW_PX, SHORT_FORM_PX } = T;

console.log('① the table');
{
  const keys = STRIP_ROWS.map((r) => r.key);
  ok(new Set(keys).size === keys.length, `one row per mark (${keys.length} marks, no key twice)`);
  const PLACE = /^(row1|row2|in:[a-z-]+|home:[a-z-]+|gone)$/;
  const bad = STRIP_ROWS.filter((r) => !['I', 'II', 'III', 'IV'].includes(r.cls) || !PLACE.test(r.place));
  ok(!bad.length, 'every row has a class I–IV and a place (row1 · row2 · in:<door> · home:<where> · gone)', bad.map((r) => r.key).join(', '));
  const r1 = STRIP_ROWS.filter((r) => r.place === 'row1');
  ok(r1.length > 0 && r1.every((r) => r.cls === 'I'), `row 1 holds class I only (${r1.map((r) => r.key).join(', ')})`);
  const r2 = STRIP_ROWS.filter((r) => r.place === 'row2').sort((a, b) => a.order - b.order);
  const firstIII = r2.findIndex((r) => r.cls === 'III');
  ok(r2.every((r) => r.cls === 'II' || r.cls === 'III') && firstIII === r2.length - 1 && r2[firstIII].key === 'settings', `row 2 holds II, then ONE III door last (${r2.map((r) => `${r.key}:${r.cls}`).join(', ')})`);
  const doors = new Set(STRIP_ROWS.filter((r) => r.place.startsWith('in:')).map((r) => r.place.slice(3)));
  ok([...doors].every((d) => onStrip(d)), `every door a mark folds into is itself on the strip (${[...doors].join(', ')})`);
  ok(STRIP_ROWS.filter((r) => r.cls === 'IV').every((r) => !onStrip(r.key)), 'no class IV detail lives on the strip');
  ok(insideOf(DOORS.settings).join() === 'style,goal,review,held,billing', `«对话设置» holds the low-frequency things in a fixed order (${insideOf(DOORS.settings).join(', ')})`);
  ok(insideOf(DOORS.context).join() === 'cache,cache-k,odometer,turn-time,unreported,cost', `the context door holds the details (${insideOf(DOORS.context).join(', ')})`);
  ok(insideOf(DOORS.model).join() === 'effort' && insideOf(DOORS.artifacts).join() === 'design' && insideOf(DOORS.background).join() === 'wf', 'the merges: thinking into the model door, designs into 产出, workflows into «后台»');
  ok(ROW_OF.browser.title && ROW_OF.browser.title.maxCh > 0 && ROW_OF.channels.title && ROW_OF.channels.title.maxCh > 0, 'a LONG TITLE never takes a row: the browser and the channel carry a bounded title (cut inside their own chip)');
}

console.log('② the arrangement, every mark present at once');
{
  const ALL = Object.fromEntries(STRIP_ROWS.filter((r) => r.exists).map((r) => [r.key, true]));
  const at = (w) => arrange(ALL, w);
  const one = at(960);
  ok(one.oneRow && one.rows.length === 1, `ONE row at ${ONE_ROW_PX} (${one.rows[0].join(' · ')})`);
  ok(at(1200).rows.length === 1 && at(1440).rows.length === 1, 'one row at 1200 and 1440');
  const two = at(500);
  ok(two.rows.length === 2 && two.rows[0].join() === 'turnstate,remote,autoresume,fallback,model,perm,ctx' && two.rows[1].join() === 'artifacts,outbox,browser,channels,tasks,settings',
    `TWO rows at 500 — row 1 «${two.rows[0].join(' · ')}», row 2 «${two.rows[1].join(' · ')}»`);
  const ladder = [280, 320, 360, 420, 500, 720];
  ok(ladder.every((w) => JSON.stringify(at(w).rows) === JSON.stringify(two.rows)), `the SAME two rows at ${ladder.join(' / ')} (a thing never changes row with the width)`);
  ok(at(360).form === 'short' && at(SHORT_FORM_PX).form === 'short' && at(420).form === 'full' && at(500).form === 'full', 'the short forms at 360 and below, the full ones above');
  ok(one.rows[0].join() === [...two.rows[0], ...two.rows[1]].join(), 'the one row at 960 is row 1 then row 2, in the same order');
  ok(!STRIP_ROWS.some((r) => r.key === 'more' && onStrip('more')), 'nothing behind «show more»: the ⋯ mark is gone at every width');
}

console.log('③ a thing is always in the same place');
{
  const bare = arrange({}, 500);
  ok(bare.rows[0].join() === 'model,perm,ctx' && bare.rows[1].join() === 'artifacts,outbox,settings', `with nothing transient: row 1 «${bare.rows[0].join(' · ')}», row 2 «${bare.rows[1].join(' · ')}» (产出 even at zero)`);
  const someWait = arrange({ turnstate: true, channels: true }, 500);
  ok(someWait.rows[0][0] === 'turnstate' && someWait.rows[1].join() === 'artifacts,outbox,channels,settings', 'a waiting ask comes FIRST on row 1; a channel sits in its own place on row 2 with the browser absent');
  const unk = arrange({ ctxUnknown: true }, 500);
  ok(unk.rows[0].join() === 'model,perm,ctx-unknown', 'the context with an unknown window takes the context\'s own slot');
}

console.log('④a moved, not lost');
{
  const bad = homesCensus();
  ok(!bad.length, `every mark off the strip names its home (a door on the strip, or ${Object.values(HOMES).join(' / ')}); only what the page removes is gone (${PAGE_REMOVES.join(', ')})`, bad.join(' | '));
  const lost = STRIP_ROWS.map((r) => (r.key === 'health' ? { ...r, place: 'gone' } : r));
  const homeless = STRIP_ROWS.map((r) => (r.key === 'kinds' ? { ...r, place: 'home:nowhere' } : r));
  const orphan = STRIP_ROWS.map((r) => (r.key === 'style' ? { ...r, place: 'in:nodoor' } : r));
  const c1 = homesCensus(lost), c2 = homesCensus(homeless), c3 = homesCensus(orphan);
  ok(c1.some((x) => x.startsWith('health:')) && c2.some((x) => x.startsWith('kinds:')) && c3.some((x) => x.startsWith('style:')),
    'RED CONTROLS: a mark dropped as gone that the page does not remove, a home that is not named, a door that is not on the strip — each red by name', [c1, c2, c3].map((c) => c.join(' ; ')).join(' | '));
}

const BAR = fs.readFileSync(path.join(REPO, 'src/lib/chat-status-bar.js'), 'utf8');
console.log('④ the census of the bar');
{
  const c = censusOfBar(BAR);
  ok(c.drawn.length >= 12 && c.doors.length >= 5, `the census sees the bar's marks (${c.drawn.length} on the strip or still to move, ${c.doors.length} drawn inside a door)`);
  ok(c.doorWrong.length === 0, `every mark the bar draws INSIDE a door is a door row of the table${c.doorWrong.length ? ' — WRONG: ' + c.doorWrong.join(', ') : ''}`);
  ok(c.unknown.length === 0, `every mark the bar draws has a row in the table${c.unknown.length ? ' — UNKNOWN: ' + c.unknown.join(', ') : ''}`);
  // THE DEBT the bar's rewrite brought to zero (P2: the doors; P3: the homes — search, health, kinds): no mark the table places
  // elsewhere is drawn on the strip
  ok(c.offStrip.length === 0, `no mark the table places elsewhere is drawn on the strip — the debt is ZERO`, `now: ${c.offStrip.join(', ')}`);
  // MOVED, NOT LOST — each home READS the mark it took: Session Properties the health rows and the record kinds (from the bar's
  // own accessors), the phone's top bar the search
  const PROPS = fs.readFileSync(path.join(REPO, 'src/lib/session-props.js'), 'utf8');
  ok(/bar\?\.initHealthWords\?\.\(\)/.test(PROPS) && /v\._statusBar\.initHealthWords\?\.\(\)/.test(fs.readFileSync(path.join(REPO, 'src/lib/setup-flows.js'), 'utf8')) && /bar\?\.addedKindsWords\?\.\(\)/.test(PROPS) && /initHealthRows\(\) \{/.test(BAR) && /addedKindsWords\(\) \{/.test(BAR) && /window\.addEventListener\('vs-start-facts'/.test(PROPS),
    'moved, not lost: Session Properties reads the start facts (a tool that did not start — in plain words —, the record kinds) from the bar, and re-reads them when they change; ⚙ Diagnostics lists the tools that did not start');
  const NAV = fs.readFileSync(path.join(REPO, 'src/lib/mobile-nav.js'), 'utf8'), HTML = fs.readFileSync(path.join(REPO, 'public/index.html'), 'utf8');
  ok(/<button id="mobile-nav-search" [^>]*title="Search this conversation"/.test(HTML) && /this\._shownChat\(\)\?\._search\?\.open\?\.\(\)/.test(NAV) && !/chip\('search'/.test(BAR),
    'moved, not lost: the search is the phone\'s top-bar magnifier (where the conversation\'s name lives), opening the shown conversation\'s search — no strip mark');
  const STYLE = fs.readFileSync(path.join(REPO, 'public/style.css'), 'utf8');
  const shownIn = (css) => ['compact', 'regular'].filter((vc) => new RegExp(`html\\[data-vc="${vc}"\\] #mobile-nav-search\\.on \\{ display: (?:inline-)?flex;`).test(css));
  const noRegular = STYLE.replace(/\nhtml\[data-vc="regular"\] #mobile-nav-search\.on \{[^}]*\}/, '');
  ok(shownIn(STYLE).join() === 'compact,regular' && shownIn(noRegular).join() === 'compact',
    'moved, not lost: the magnifier is shown in the COMPACT and the REGULAR class (a tablet in portrait, a fold\'s inner screen) — RED CONTROL: the regular rule taken out is named', JSON.stringify({ now: shownIn(STYLE), control: shownIn(noRegular) }));
}

console.log('⑤ red controls');
{
  const planted = BAR.replace("chip('model',", "chip('planted', 'chat-status-planted', '', 'x');\n      chip('model',");
  const p = censusOfBar(planted);
  ok(planted !== BAR && p.unknown.includes('planted'), 'RED CONTROL: a planted mark the table does not know is named (unknown)');
  const back = censusOfBar("chip('model', 'm', '', 'x'); chip('cache', 'c', '', 'x');");
  const wrongDoor = censusOfBar("inDoor('model', 'm', '', 'x');");
  ok(wrongDoor.doorWrong.includes('model'), 'RED CONTROL: a strip mark put inside a door is named (doorWrong)');
  ok(back.offStrip.includes('cache') && !back.offStrip.includes('model'), 'RED CONTROL: a detail put back on the strip is named (off the strip by its row)');
  const beside = censusOfBar("chip('model', 'm', '', 'x'); inDoor('cache', '', '', 'x'); chip('cache', 'c', '', 'x');");
  ok(beside.offStrip.includes('cache'), 'RED CONTROL: a chip planted BESIDE a door row of the same name is named too (the census hole of 644a67ec2)');
  const ternary = censusOfBar("(a.armed ? chip : inDoor)('autoresume', 'x', '', 'x');");
  ok(!ternary.offStrip.length && ternary.doors.includes('autoresume') && ternary.drawn.includes('autoresume'), 'the either/or call (armed auto-continue: row 1 while armed, else a settings row) is read as both, and is not red');
}

console.log('⑥ the faces');
{
  const F = await import(path.join(REPO, 'src/lib/strip-faces.js'));
  const { BACKEND_META } = await import(path.join(REPO, 'src/lib/agent-meta.js'));
  const tc = (c, x) => c + '::' + x, t = (x) => x;
  const MODEL = [['claude-fable-5-1[1m]', 'Fable 5.1 1M'], ['fable[1m]', 'Fable 1M'], ['claude-opus-5-5', 'Opus 5.5'], ['opus', 'Opus'], ['sonnet[1m]', 'Sonnet 1M'],
    ['claude-opus-4-20250514', 'claude-opus-4-20250514'],   // a dated id is not «Opus 4.20250514»: raw
    ['gpt-5-codex', 'gpt-5-codex'], ['openrouter/anthropic/claude-opus-5-5', 'openrouter/anthropic/claude-opus-5-5'], ['my-opus-tune', 'my-opus-tune'],   // another harness's id, a token inside another id: raw
    ['⚠ claude-fable-5-1 · refusal (cyber)', '⚠ Fable 5.1 · refusal (cyber)'], ['claude-sonnet-5-5 → claude-opus-5-5', 'Sonnet 5.5 → Opus 5.5']];
  const badM = MODEL.filter(([v, want]) => F.modelFace(v) !== want).map(([v, want]) => `${v} → ${F.modelFace(v)} (want ${want})`);
  ok(badM.length === 0, `the model's face: ${MODEL.length} labels, a known token worded, every other spelling kept as it is`, badM);
  const EFF = [['high', 'effort::High'], ['xhigh', 'effort::Extra high'], ['ultracode', 'effort::Ultra'], ['minimal', 'effort::Minimal'], ['none', 'effort::None'], ['turbo', 'turbo'], ['', '']];
  const badE = EFF.filter(([v, want]) => F.effortFace(v, tc) !== want).map(([v, want]) => `${v} → ${F.effortFace(v, tc)} (want ${want})`);
  ok(badE.length === 0, `the thinking level's face: ${EFF.length} values (an unknown level is its raw word)`, badE);
  const face = (be, v) => F.permissionModeFace(BACKEND_META[be]?.permissionModeFaces, v, tc, t);
  const PERM = [['claude', 'default', 'perm::Ask each time'], ['claude', 'bypassPermissions', 'perm::Allow all'], ['claude', 'plan', 'perm::Plan only'],
    ['codex', 'default', 'Default'],                     // codex «default» is not claude's «ask each time» (the read's first catch)
    ['codex', 'yolo', 'perm::Allow all'], ['codex', 'read-only', 'perm::Read only'], ['opencode', 'build', 'perm::Make changes'], ['antigravity', 'accept-edits', 'perm::Accept edits'],
    ['claude', '', 'Default'], ['claude', 'brand-new-mode', 'brand-new-mode'], ['shell', 'default', 'default'], ['opencode', 'default', 'default']];
  const badP = PERM.filter(([be, v, want]) => face(be, v) !== want).map(([be, v, want]) => `${be}/${v} → ${face(be, v)} (want ${want})`);
  ok(badP.length === 0, `the permission mode's face is the HARNESS's own declared row: ${PERM.length} cases (an undeclared value, or a harness with none, is its raw spelling)`, badP);
  const undeclared = Object.entries(BACKEND_META).filter(([, m]) => Array.isArray(m.permissionModes) && m.permissionModes.some((v) => !(m.permissionModeFaces || {})[v])).map(([be]) => be);
  ok(undeclared.length === 0, 'every mode a harness lists has its face declared beside it', undeclared);
}

console.log('⑦ the thinking level on the model chip — read at the chip\'s own contrast (主开发 r1267)');
{
  // A GAUGE, pure arithmetic over the two style files: the words of the thinking level inside the model's chip, on the chip's own
  // fill, in each of style.css's six themes, at the contrast the tree states for words (WCAG AA 4.5 : 1 — test-channels-i18n's
  // census of names, docs/terminal.md). The colours are READ from the files: the chip's base rule (its fill and its words'
  // colour) and the strip's rule for the effort words; a theme without a variable takes the default theme's.
  const CHAT = fs.readFileSync(path.join(REPO, 'public/chat.css'), 'utf8'), STYLE = fs.readFileSync(path.join(REPO, 'public/style.css'), 'utf8');
  const decl = (body, prop) => { const m = new RegExp(`(?:^|[;{\\s])${prop}:\\s*([^;}]+)`).exec(body || ''); return m ? m[1].trim() : null; };
  const chipBody = (/\n\.chat-status-model \{([^}]*)\}/.exec(CHAT) || [])[1];
  const effortBody = (/\n\.chat-status-bar \.chat-status-model \.chat-status-effort, [^{]*\{([^}]*)\}/.exec(CHAT) || [])[1];
  const THEMES = [...STYLE.matchAll(/\n(?::root, )?\[data-theme="([a-z]+)"\] \{([^}]*)\}/g)].map((m) => ({ name: m[1], body: m[2] }));
  const base = THEMES.find((x) => x.name === 'dark');
  const val = (theme, v) => { const m = /^var\(--([a-z0-9-]+)\)$/.exec(v || ''); if (!m) return v; return decl(theme.body, `--${m[1]}`) || decl(base && base.body, `--${m[1]}`); };
  const rgb = (c) => { const h = /^#([0-9a-f]{6})$/i.exec(c || ''); return h ? [0, 2, 4].map((i) => parseInt(h[1].slice(i, i + 2), 16)) : null; };
  const lum = (c) => { const [r, g, b] = c.map((x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const ratio = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
  const gauge = (effortColour) => THEMES.map((th) => {
    const fill = rgb(val(th, decl(chipBody, 'background'))), chipWords = val(th, decl(chipBody, 'color'));
    const words = rgb(effortColour === 'inherit' ? chipWords : val(th, effortColour));
    return { theme: th.name, ratio: fill && words ? Math.round(ratio(words, fill) * 100) / 100 : null };
  });
  const effortColour = decl(effortBody, 'color');
  const now = gauge(effortColour);
  console.log(`  · the effort words' colour «${effortColour}» on the chip's fill «${decl(chipBody, 'background')}»: ${now.map((g) => `${g.theme} ${g.ratio} : 1`).join(' · ')}`);
  ok(THEMES.length === 6 && !!chipBody && !!effortBody, 'the gauge read its inputs: the chip\'s base rule, the effort words\' rule, six themes', { themes: THEMES.map((x) => x.name), chip: !!chipBody, effort: !!effortBody });
  ok(now.every((g) => g.ratio !== null && g.ratio >= 4.5), 'the thinking level\'s words on the model chip read at ≥ 4.5 : 1 in every theme (a mark is for knowing)', now);
  // CONTROL: the rule as P2 wrote it (--text-secondary, a colour for words on the page's dark surfaces, not on the accent fill) is RED by name
  const was = gauge('var(--text-secondary)');
  ok(was.some((g) => g.ratio !== null && g.ratio < 4.5), `CONTROL: the effort words in --text-secondary on the chip go RED (${was.map((g) => `${g.theme} ${g.ratio}`).join(' · ')})`, was);
}

report();
