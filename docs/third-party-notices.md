# Third-party notices

Components VibeSpace serves or bundles that carry their own licence. This file names them and where their licence text lives; it is updated in the same commit as the code that starts (or stops) using one.

| Component | Licence | How VibeSpace uses it | Where the licence text is |
|---|---|---|---|
| **xpra-html5** (the upstream Xpra HTML5 client; `Protocol.js`, `Utilities.js`, `lib/rencode.js`, `lib/lz4.js`, `lib/brotli_decode.js`) — Copyright (C) Antoine Martin and the Xpra project | MPL-2.0 | NOT redistributed in this repository. At runtime the desktop-app window loads the client's protocol worker UNMODIFIED from the xpra-html5 package installed on that machine (`/usr/share/xpra/www/js/`, found by `hostFacts().xpra.www`) through the cookie-authed route `/api/desktop/:id/xpra-ui/*` (src/routes/desktop-apps.js); the whole html5 page is served the same way as the D21 (c) (a) validation slice. Everything above the packets — src/lib/xpra-proto.js, xpra-client.js, xpra-view.js — is VibeSpace's own. | The installed package's copyright file (Debian: `/usr/share/doc/xpra-html5/copyright`) and https://github.com/Xpra-org/xpra-html5/blob/master/LICENSE |
| **noVNC** (`@novnc/novnc`) | MPL-2.0 | Bundled from node_modules into `public/novnc.js` (a separate ESM chunk, dynamic-imported by src/lib/vnc-view.js). | `node_modules/@novnc/novnc/LICENSE.txt` |

Vetted and NOT used: the npm package `xpra-html5-client` 2.3.0 — its README declares "Mozilla Public License Version 2.0 … based on the official Xpra HTML5 client sources" while its package.json says Apache-2.0; last published 2022-05-25 (xpra 4.x era); 10.7 MB unpacked. See src/lib/xpra-proto.js's header and docs/design-desktop-apps.md §7 P8-2.

The heavy gate scripts/test-desktop-xpra.mjs speaks to the relay from node by loading that same installed package's `lib/rencode.js`, `lib/lz4.js` and `lib/brotli_decode.js` into the suite's own realm at run time (found through `xpraWwwDir`) — read from the machine, never copied into this repository; without them the protocol legs SKIP with the reason.
