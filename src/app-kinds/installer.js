'use strict';
/** THE `installer` REQUEST (design 009) — a vendor's installer by ADDRESS (a recipe's official download, src/app-recipes.js)
 *  or FILE: fetched / copied first, then planned as the kind its bytes are (deb / appimage). PURE, imports nothing. */
module.exports = Object.freeze({ id: 'installer', request: true, agent: true, fetches: true });
