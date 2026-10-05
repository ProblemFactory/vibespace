'use strict';
// THE FAKE VENDOR's message-shape reader (its own blocks module, the src/channels/lark/blocks.js precedent)
const acmeStoredBlocks = (record) => [{ k: 'card', title: String((record && record.raw && record.raw.title) || ''), rows: [] }];
module.exports = { acmeStoredBlocks };
