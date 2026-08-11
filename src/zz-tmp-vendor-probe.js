// temp file for guard verification — DELETE
function poll(token) {
  const req = require('https').request({
    host: 'api.anthropic.com', path: '/api/oauth/usage', method: 'GET',
    headers: { Authorization: 'Bearer ' + token, 'anthropic-beta': 'oauth-2025-04-20' },
  }, (res) => res.resume());
  req.end();
}
setInterval(() => poll(process.env.TOK), 300000); // scheduled, ungated — the banned pattern
module.exports = { poll };
