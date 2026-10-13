'use strict';
// CONSENT LANDINGS OF NON-CHANNEL KINDS on THE parameterized door `GET /api/channels/oauth/cb/:kind` (design 018 /
// q-018; lane voice-p1-oauth-teach). A channel account type lands through the channels engine (its consent row); any
// other kind — today `dropline` (voice input's OAuth tier) — registers its door HERE: `landing({code, state, error})`
// judges the state itself (its own HMAC, age, kind) and answers `{ok, why, user, error}`; `page(r)` is its landing
// page. The route asks this map FIRST; a kind in neither answers 404 by name.
const doors = new Map();
function register(kind, door) {
  if (!/^[a-z][a-z0-9-]{1,19}$/.test(String(kind || ''))) throw new Error(`oauth-doors: a bad kind ${JSON.stringify(kind)}`);
  if (!door || typeof door.landing !== 'function' || typeof door.page !== 'function') throw new Error('oauth-doors: a door needs landing() and page()');
  doors.set(kind, door);
  return () => { if (doors.get(kind) === door) doors.delete(kind); };
}
const doorOf = (kind) => doors.get(String(kind || '')) || null;
module.exports = { register, doorOf };
