'use strict';
// THE CONTEXT TABLE'S READ (lane task-group-context) — mounted beside GET /api/tasks (server.js, no new line: the size
// ratchet). The Task Group window draws 「新对话会收到」 from the renderer's EXACT output, never a client-side imitation:
//   GET /api/tasks/:id/context → { text, block, bytes, budget, used, rows }   the preview + the plan behind it
// A new conversation's tools part is the instance's switches (agents.tool*); a conversation's own channel reach is not
// known before it exists, so the preview teaches none.

function mount(app, { tasks, serverSetting }) {
  const on = (name) => { try { return serverSetting('agents.tool' + name) !== false; } catch { return true; } };
  const notFound = (res, e) => res.status(e && e.message === 'task not found' ? 404 : 400).json({ error: (e && e.message) || 'failed' });

  app.get('/api/tasks/:id/context', (req, res) => {
    try {
      const tools = { status: on('Status'), ask: on('Ask'), task: on('Task'), jobs: on('Jobs'), channels: false };
      res.json(tasks.contextPreview(req.params.id, { tools }));
    } catch (e) { notFound(res, e); }
  });
}

module.exports = { mount };
