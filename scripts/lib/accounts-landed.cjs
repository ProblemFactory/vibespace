'use strict';
// B-574d unit 1 (a) (lane lg-store-writes, 主开发 r3455 / r3486): accounts.json is written by THE STORE WRITER (src/accounts.js
// _save: dirty + durable, on the writer's thread). A SUITE that reads the file right after an act, or opens a second manager over the
// same folder (a restart), waits for each save here: the store writer's synchronous flush of that one file, on the SUITE's thread —
// never the hub's loop (the hub's door is src/server/account-usage-routes.js answerAfterLanding). The bytes on disk are the
// product's own write. `waitEverySave(AccountManager)` patches the class ONCE (a mutant copy's class is patched by its own call).
const path = require('path');
const SW = require(path.join(__dirname, '..', '..', 'src', 'store-writer.js'));

function waitEverySave(AM) {
  if (!AM || !AM.prototype || typeof AM.prototype._save !== 'function' || AM.prototype._saveWaited) return AM;
  const save0 = AM.prototype._save;
  AM.prototype._save = function (...a) {
    const r = save0.apply(this, a);
    try {
      const W = typeof this._writer === 'function' ? this._writer() : SW.storeWriter();
      W.flushSync([this._file], { waitedBy: 'a suite: accounts.json read right after an act' });
    } catch { /* a held list writes nothing: nothing to wait for */ }
    return r;
  };
  Object.defineProperty(AM.prototype, '_saveWaited', { value: true });
  return AM;
}

module.exports = { waitEverySave };
