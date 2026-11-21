'use strict';
/**
 * A PATH WITH A DOT SEGMENT IS NEVER A DOOR (lane lg-remote-hardening, row B-7f0b — the coordinator's r1317). PURE.
 *
 * The auth layer lets a door's prefix (/dav/, /api/agent/, /svc/, /p/, /hook/, …) past the sign-in gate, each door judged by its
 * own credential; the public files' handler runs AFTER the gate and before the doors' routes, and it NORMALISES the path (it
 * decodes it once and resolves its dot segments): /dav/../index.html, /dav/%2e%2e/index.html or /dav/..%2findex.html reached
 * the app's own files with no sign-in at all, and through a push mount's door with that mount's pass. A browser never sends a
 * dot segment (it resolves them before the request) and no door's caller needs one, so a request whose path holds one is
 * refused BY NAME before any route runs — by the auth layer (src/auth.js, before its door list), by the push mount's door
 * (src/server/push-mount-door.js) and by the agent door (src/server/agent-listener.js `allowed`): ONE verdict, three askers.
 *   dotSegment(url) — the path (the query is not judged) has a `.` or `..` segment, read as the files' handler reads it once
 *     decoded — and ONLY what can spell one is read (the coordinator's r1382): the escapes of a dot, a slash and a backslash
 *     (%2e, %2f, %5c, either case), a backslash a separator too (a Windows hub's). Any other escape is not this verdict's
 *     business: a bare «%» («100%»), a Latin-1, GBK or Shift_JIS name (an older site through the browser's proxy, a served
 *     folder's file) goes on to its route exactly as on the release — no other byte decodes to a dot, a slash or a backslash.
 *   refusal() — { status: 400, body: { error, code: 'path_dot_segment' } }
 */
const SEGMENT = /(?:^|[\/\\])\.\.?(?:[\/\\]|$)/;
const SPELL = /%(2e|2f|5c)/gi;   // the only escapes that decode to a dot, a slash or a backslash
const SPELLED = { '2e': '.', '2f': '/', '5c': '\\' };

/** PURE: does this request path hold a dot segment (raw, or spelled with the escapes of a dot, a slash or a backslash)? */
function dotSegment(url) {
  const p = String(url == null ? '' : url).split('?')[0];
  return SEGMENT.test(p.replace(SPELL, (_, h) => SPELLED[h.toLowerCase()]));
}

const CODE = 'path_dot_segment';
const WORDS = 'a path with a dot segment (. or .., written raw or escaped) is never a door — refused';

/** the refusal by name, one shape for every asker */
function refusal() { return { status: 400, body: { error: WORDS, code: CODE } }; }

module.exports = { dotSegment, refusal, CODE, WORDS };
