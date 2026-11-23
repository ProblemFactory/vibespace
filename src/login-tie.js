'use strict';
/**
 * THE TIE's FINGERPRINT (row B-87fd identity unit 3, 主开发 r2779). AccountManager ties a row's config to the credentials beside it by
 * the login session its OWN sign-in saw: that session's deadline (kept on the row: a deadline, no identity) or, for credentials with
 * no deadline, this fingerprint of the refresh token it saw — kept in MEMORY only, never written, never logged, never answered. This
 * module persists nothing (test-key-file-law rule 5′: a sha256 never lives beside a persistence writer unclassified). node `crypto` only.
 *   tokenTieOf(token) → sha256 hex, or null for no token
 */
const crypto = require('crypto');

function tokenTieOf(token) {
  return typeof token === 'string' && token ? crypto.createHash('sha256').update(token).digest('hex') : null;
}

module.exports = { tokenTieOf };
