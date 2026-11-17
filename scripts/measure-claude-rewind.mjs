#!/usr/bin/env node
// measure-claude-rewind.mjs — B-437e: what the installed claude CLI states about its `rewind_conversation` control
// request, READ FROM ITS PROGRAM FILE AS BYTES (never run: no process, no network, no sign-in), written to
// scripts/fixtures/claude-cli/<version>-rewind-conversation.json — the captured oracle src/rewind-door.js and
// scripts/test-checkpoints.mjs are judged against (the rule for everything a CLI states about itself: a capture with
// the version it was read from, never a hand copy).
//   node scripts/measure-claude-rewind.mjs <the pinned program file, e.g. ~/.local/share/claude/versions/2.1.322> [--out <file>]
// Every fact is found by a PATTERN over the minified bundle; a pattern that finds nothing STOPS the capture by name
// (a renamed field must be re-read by a person, never guessed). Each fact keeps a short excerpt of what it was read from.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bin = process.argv[2];
const outArg = process.argv.indexOf('--out');
if (!bin || !fs.statSync(bin).isFile()) { console.error('usage: node scripts/measure-claude-rewind.mjs <claude program file> [--out <file>]'); process.exit(2); }
const version = path.basename(fs.realpathSync(bin));
if (!/^\d+\.\d+\.\d+$/.test(version)) { console.error(`the program file's name is no version (${version}) — pass the versioned file itself`); process.exit(2); }
const buf = fs.readFileSync(bin);
const s = buf.toString('latin1');
const need = (cond, what) => { if (!cond) { console.error(`NOT FOUND: ${what} — the bundle moved; read it by hand before writing a capture`); process.exit(3); } };
const cut = (i, n = 160) => s.slice(Math.max(0, i), Math.max(0, i) + n).replace(/[^\x20-\x7e]/g, '·');
// an object literal bound to its OWN definition: `<name>={<first key><value form>` (a minified name can recur elsewhere)
const objAt = (name, valueForm) => {
  const m = new RegExp(`(?<![\\w$.])${name.replace(/\$/g, '\\$')}=\\{[a-z_]+:${valueForm}`).exec(s);
  need(m, `the object ${name} (${valueForm})`);
  return { at: m.index, body: s.slice(m.index + name.length + 2, s.indexOf('}', m.index)) };
};

// 1. the handler: the request's fields (every `<x>.request.<field>` it reads), the done reply
const h0 = s.indexOf('.request.subtype==="rewind_conversation"');
need(h0 >= 0, 'the rewind_conversation handler');
const h1 = s.indexOf('.request.subtype==="fork_conversation"', h0);
need(h1 > h0, 'the end of the handler (the fork_conversation branch after it)');
const win = s.slice(h0, h1);
// the request is read directly (`K.request.x`) and through an alias (`Nt=K.request` … `Nt.x`)
const aliases = [...new Set([...win.matchAll(/([\w$]+)=[\w$]+\.request[,;)]/g)].map((m) => m[1]))];
const fieldReads = [...win.matchAll(/\.request\.([a-z_]+)/g)].map((m) => m[1])
  .concat(...aliases.map((al) => [...win.matchAll(new RegExp(`(?<![\\w$.])${al.replace(/\$/g, '\\$')}\\.([a-z_]+)`, 'g'))].map((m) => m[1])));
const fields = [...new Set(fieldReads)].filter((f) => f !== 'subtype').sort();
need(fields.includes('target_message_uuid') && fields.includes('last_seen_user_message_uuid'), 'the request fields target_message_uuid + last_seen_user_message_uuid');
const done = /\{rewound:!0,targetMessageUuid:[\w$]+,prefillText:[\w$]+,precedingAssistantUuid:[\w$]+(,\.\.\.[\w$]+!==void 0&&\{resolution:[\w$]+\})?\}/.exec(win);
need(done, 'the done reply {rewound:!0, targetMessageUuid, prefillText, precedingAssistantUuid}');
const doneKeys = ['rewound', 'targetMessageUuid', 'prefillText', 'precedingAssistantUuid', ...(done[1] ? ['resolution'] : [])];
// the row is written BEFORE the last check, and healed when that check fails (the transcript's twin records)
const order = /!await [\w$]+\([\w$]+\.cut,[\w$]+,[\w$]+\)\)[\s\S]{0,60}"persist_failed"[\s\S]{0,240}await ([\w$]+)\([\w$]+,[\w$]+\),[\w$]+\([\w$]+,"state_changed"\)/.exec(win);
need(order, 'the persist-then-check order (persist_failed … state_changed)');

// 2. the refused reply, its words table and the may-be-sent-again table
const ref = /function ([\w$]+)\(e,n\)\{return\{rewound:!1,prefillText:null,precedingAssistantUuid:null,error:([\w$]+)\[e\],reason:e,\.\.\.n!==void 0&&\{isolation_latch:n\}\}\}/.exec(s);
need(ref, 'the refused reply builder {rewound:!1, … error:<words>[e], reason:e, isolation_latch?}');
const words = objAt(ref[2], '"');
const reasons = Object.fromEntries([...words.body.matchAll(/([a-z_]+):"([^"]*)"/g)].map((m) => [m[1], { text: m[2] }]));
need(Object.keys(reasons).length >= 10, `the words table ${ref[2]} (${Object.keys(reasons).length} rows)`);
const firstKey = Object.keys(reasons)[0];
const rt = new RegExp(`([\\w$]+)=\\{${firstKey}:![01]`).exec(s);
need(rt, 'the may-be-sent-again table');
const retry = objAt(rt[1], '![01]');
for (const m of retry.body.matchAll(/([a-z_]+):!([01])/g)) { need(reasons[m[1]], `the retry table names a reason the words table lacks (${m[1]})`); reasons[m[1]].retry = m[2] === '0'; }
need(Object.values(reasons).every((r) => typeof r.retry === 'boolean'), 'a retry value for every reason');

// 3. the transcript row: the persisted anchor, its cutUuid flag and its default, the heal row
const k7 = /async function ([\w$]+)\(e,n,r\)\{let s=[\w$]+\(\);s\.currentSessionLeafUuid=e\?\?void 0,s\.currentSessionLeafTs=[^,]+,await s\.appendEntry\(\{type:"last-prompt",\.\.\.s\.currentSessionLastPrompt&&\{lastPrompt:s\.currentSessionLastPrompt\},leafUuid:e,explicit:!0,\.\.\.n,sessionId:[\w$]+\(\)\}/.exec(s);
need(k7, 'the persisted anchor row (last-prompt, leafUuid, explicit, …)');
const anchor = /\{rewound:!0,\.\.\.[\w$]+!==void 0&&([\w$]+)\(\)&&\{cutUuid:[\w$]+\.uuid\}\}/.exec(s);
need(anchor, 'the anchor fields {rewound:true, cutUuid when a gate says so}');
const gate = new RegExp(`function ${anchor[1].replace(/\$/g, '\\$')}\\(\\)\\{return ([\\w$]+)\\("([a-z_]+)"\\)\\}`).exec(s);
need(gate, 'the cutUuid gate flag');
const dflt = new RegExp(`function ${gate[1].replace(/\$/g, '\\$')}\\(e\\)\\{let n=[\\w$.]+;if\\(!n\\)return!0;try\\{return n\\(e,!0\\)!==!1\\}catch\\{return!0\\}\\}`).exec(s);
need(dflt, 'the flag reader (on unless the vendor says off)');
// the heal is THE function the state_changed branch awaits: its body persists the uncut tip with no anchor fields
const healFn = new RegExp(`async function ${order[1].replace(/\$/g, '\\$')}\\([\\w$]+,[\\w$]+\\)\\{[\\s\\S]{0,500}?persistLocal\\(([\\w$]+)\\.uuid,void 0\\)`).exec(s);
need(healFn, `the heal row inside ${order[1]} (the state_changed branch's own callee)`);
const heal = healFn;
// every writer of a last-prompt row, and whether it writes `explicit` (an ordinary bookkeeping row does not)
const writers = [...s.matchAll(/type:"last-prompt",[\s\S]{0,260}?sessionId:/g)].map((m) => ({ explicit: /explicit:!0/.test(m[0]), leafUuid: /leafUuid:null/.test(m[0]) ? 'null' : /leafUuid:/.test(m[0]) || /currentSessionLeafUuid/.test(m[0]) ? 'a uuid' : 'none', excerpt: cut(m.index - 20, 200) }));
need(writers.some((w) => !w.explicit) && writers.some((w) => w.explicit), 'the last-prompt writers (an ordinary one without explicit, explicit ones)');

const capture = {
  _note: 'MEASURED by scripts/measure-claude-rewind.mjs — never edited by hand. Read from the program file as bytes; nothing was run.',
  cli: version, programSha256: crypto.createHash('sha256').update(buf).digest('hex'), programBytes: buf.length,
  how: 'patterns over the minified bundle (each fact keeps its excerpt); the CLI was never started',
  request: { type: 'control_request', subtype: 'rewind_conversation', fields },
  reply: { done: doneKeys, refused: ['rewound', 'prefillText', 'precedingAssistantUuid', 'error', 'reason', 'isolation_latch'] },
  reasons,
  persist: {
    row: 'last-prompt', fields: ['type', 'lastPrompt', 'leafUuid', 'explicit', 'sessionId'], anchorFields: ['rewound', 'cutUuid'],
    cutUuidFlag: gate[2], cutUuidFlagDefault: true,
    writtenBeforeTheLastCheck: true, healRow: { row: 'last-prompt', explicit: true, rewound: false, leafUuid: 'the uncut tip', writtenBy: order[1] },
    writers: writers.map((w) => ({ explicit: w.explicit, leafUuid: w.leafUuid })),
    ordinaryRowExplicit: !writers.filter((w) => !w.explicit).length ? null : false,
  },
  excerpts: { handler: cut(h0 - 20), done: cut(done.index + h0), order: cut(order.index + h0, 240), refused: cut(ref.index, 200), words: cut(words.at, 200), retry: cut(retry.at, 200), row: cut(k7.index, 240), anchor: cut(anchor.index), gate: cut(gate.index), flagReaderDefaultOn: cut(dflt.index, 140), heal: cut(heal.index, 260), writers: writers.map((w) => w.excerpt) },
};
const out = outArg > 0 ? process.argv[outArg + 1] : path.join(REPO, 'scripts', 'fixtures', 'claude-cli', `${version}-rewind-conversation.json`);
fs.writeFileSync(out, JSON.stringify(capture, null, 1) + '\n');
console.log(`${out}: ${version}, ${fields.length} request fields, ${Object.keys(reasons).length} reasons, cutUuid flag ${gate[2]}`);
