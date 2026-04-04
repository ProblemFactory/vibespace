import { marked } from 'marked';
import { escHtml } from './utils.js';

/**
 * ChatView — renders a chat interface for stream-json mode sessions.
 * Displays structured messages from Claude Code's --output-format stream-json.
 * Input goes to the same PTY session via WebSocket.
 */
class ChatView {
  constructor(winInfo, wsManager, sessionId, app) {
    this.winInfo = winInfo;
    this.ws = wsManager;
    this.sessionId = sessionId;
    this.app = app;
    this._messages = []; // parsed message objects
    this._pinned = true; // auto-scroll to bottom

    // Build DOM
    const container = document.createElement('div');
    container.className = 'chat-view';
    winInfo.content.appendChild(container);

    // Message list
    this._messageList = document.createElement('div');
    this._messageList.className = 'chat-message-list';
    container.appendChild(this._messageList);

    // Scroll detection for pin-to-bottom
    this._messageList.addEventListener('scroll', () => {
      const { scrollTop, scrollHeight, clientHeight } = this._messageList;
      const atBottom = scrollHeight - scrollTop - clientHeight < 30;
      if (atBottom && !this._pinned) this._pinned = true;
      else if (!atBottom) this._pinned = false;
    });

    // Input area
    const inputArea = document.createElement('div');
    inputArea.className = 'chat-input-area';
    this._textarea = document.createElement('textarea');
    this._textarea.className = 'chat-input';
    this._textarea.placeholder = 'Type a message...';
    this._textarea.rows = 1;

    // Auto-grow textarea
    this._textarea.addEventListener('input', () => {
      this._textarea.style.height = 'auto';
      this._textarea.style.height = Math.min(this._textarea.scrollHeight, 200) + 'px';
    });

    // Send on Enter (Shift+Enter for newline)
    this._textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this._send();
      }
    });

    const sendBtn = document.createElement('button');
    sendBtn.className = 'chat-send-btn';
    sendBtn.textContent = '▶';
    sendBtn.title = 'Send';
    sendBtn.onclick = () => this._send();

    inputArea.append(this._textarea, sendBtn);
    container.appendChild(inputArea);

    // Listen for chat messages from server
    this._handler = (msg) => {
      if (msg.type === 'chat-message' && msg.sessionId === sessionId) {
        this._onMessage(msg.message);
      } else if (msg.type === 'exited' && msg.sessionId === sessionId) {
        this._appendSystem('Session ended.');
      }
    };
    this.ws.onGlobal(this._handler);
  }

  // Load history from attach response
  loadHistory(messages) {
    for (const msg of messages) {
      this._onMessage(msg, true);
    }
    this._scrollToBottom();
  }

  _send() {
    const text = this._textarea.value.trim();
    if (!text) return;
    this._textarea.value = '';
    this._textarea.style.height = 'auto';
    this.ws.send({ type: 'chat-input', sessionId: this.sessionId, text });
  }

  _onMessage(msg, isHistory = false) {
    this._messages.push(msg);

    switch (msg.type) {
      case 'user':
        this._appendUser(msg);
        break;
      case 'assistant':
        this._appendAssistant(msg);
        break;
      case 'system':
        if (msg.subtype === 'init') {
          this._appendSystem(`Session started (${msg.model || 'unknown model'})`);
        }
        // Skip hook events and other system noise
        break;
      case 'result':
        this._appendResult(msg);
        break;
      case 'rate_limit_event':
        // Skip silently
        break;
      default:
        // Unknown type — skip
        break;
    }

    if (!isHistory && this._pinned) {
      this._scrollToBottom();
    }
  }

  _appendUser(msg) {
    const content = msg.message?.content;
    if (!content) return;

    const el = document.createElement('div');
    el.className = 'chat-msg chat-msg-user';

    if (typeof content === 'string') {
      el.innerHTML = `<div class="chat-bubble chat-bubble-user">${escHtml(content)}</div>`;
    } else if (Array.isArray(content)) {
      const parts = [];
      for (const block of content) {
        if (block.type === 'text') {
          parts.push(escHtml(block.text));
        } else if (block.type === 'tool_result') {
          const status = block.is_error ? 'error' : 'ok';
          const resultText = typeof block.content === 'string' ? block.content : JSON.stringify(block.content, null, 2);
          parts.push(`<div class="chat-tool-result chat-tool-${status}"><span class="chat-tool-label">Tool Result (${status})</span><pre>${escHtml(resultText).substring(0, 2000)}</pre></div>`);
        }
      }
      el.innerHTML = `<div class="chat-bubble chat-bubble-user">${parts.join('')}</div>`;
    }
    this._messageList.appendChild(el);
  }

  _appendAssistant(msg) {
    const content = msg.message?.content;
    if (!content) return;

    const el = document.createElement('div');
    el.className = 'chat-msg chat-msg-assistant';

    if (Array.isArray(content)) {
      const parts = [];
      for (const block of content) {
        if (block.type === 'text') {
          parts.push(`<div class="chat-text">${this._renderMarkdown(block.text)}</div>`);
        } else if (block.type === 'thinking') {
          parts.push(`<details class="chat-thinking"><summary>Thinking...</summary><pre>${escHtml(block.text || '')}</pre></details>`);
        } else if (block.type === 'tool_use') {
          const inputStr = typeof block.input === 'string' ? block.input : JSON.stringify(block.input, null, 2);
          parts.push(`<div class="chat-tool-use"><span class="chat-tool-label">\uD83D\uDD27 ${escHtml(block.name || 'tool')}</span><details><summary>Input</summary><pre>${escHtml(inputStr).substring(0, 3000)}</pre></details></div>`);
        }
      }
      el.innerHTML = `<div class="chat-bubble chat-bubble-assistant">${parts.join('')}</div>`;
    } else if (typeof content === 'string') {
      el.innerHTML = `<div class="chat-bubble chat-bubble-assistant"><div class="chat-text">${this._renderMarkdown(content)}</div></div>`;
    }
    this._messageList.appendChild(el);
  }

  _appendResult(msg) {
    if (msg.subtype === 'success' && msg.result) {
      // Don't duplicate — the result text is usually already shown in the last assistant message
      return;
    }
    if (msg.is_error) {
      this._appendSystem(`Error: ${msg.result || 'Unknown error'}`);
    }
  }

  _appendSystem(text) {
    const el = document.createElement('div');
    el.className = 'chat-msg chat-msg-system';
    el.innerHTML = `<div class="chat-system">${escHtml(text)}</div>`;
    this._messageList.appendChild(el);
  }

  _renderMarkdown(text) {
    try {
      return marked.parse(text || '', { breaks: true });
    } catch {
      return escHtml(text || '');
    }
  }

  _scrollToBottom() {
    requestAnimationFrame(() => {
      this._messageList.scrollTop = this._messageList.scrollHeight;
    });
  }

  focus() {
    this._textarea.focus();
  }

  dispose() {
    this.ws.offGlobal(this._handler);
  }
}

export { ChatView };
