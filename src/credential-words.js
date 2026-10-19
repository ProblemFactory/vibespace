'use strict';
/**
 * PURE (imports nothing; CJS) — THE WORDS OF A CREDENTIAL'S NAME (moved verbatim out of src/browser-trace.js by lane
 * device-act-audit, 2026-10-19). browser-trace cuts a URL's query by them (`credentialKey`); secret-shapes hides a
 * secret-named value by them. Their own module so secret-shapes — which src/device-acts.js runs ON THE DEVICE — never
 * pulls browser-trace (and its browser CLI's words: test-architecture §52b) into the device agent's bundle.
 */
const CREDENTIAL_WORDS = new Set(['token', 'code', 'secret', 'password', 'passwd', 'pwd', 'pass', 'passcode', 'apikey', 'key', 'auth', 'authorization', 'session', 'sessionid', 'sid', 'sig', 'signature', 'credential', 'credentials', 'otp', 'ticket', 'jwt', 'assertion', 'samlresponse', 'samlrequest']);

module.exports = { CREDENTIAL_WORDS };
