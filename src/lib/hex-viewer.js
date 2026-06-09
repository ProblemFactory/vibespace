import { formatSize, escHtml } from './utils.js';

const BYTES_PER_ROW = 16;
const CHUNK_SIZE = 65536; // 64KB chunks

class HexViewer {
  constructor(winInfo, filePath, fileInfo) {
    this.filePath = filePath;
    this.fileSize = fileInfo.size;
    this.baseOffset = 0; // file offset where this.data starts (non-zero after a jump)
    this.data = new Uint8Array(0);
    this._renderedBytes = 0;

    const container = document.createElement('div'); container.className = 'hex-viewer';

    // Toolbar
    const toolbar = document.createElement('div'); toolbar.className = 'hex-toolbar';
    toolbar.innerHTML = `
      <span class="file-path">${escHtml(filePath)}</span>
      <span class="hex-info">${formatSize(fileInfo.size)}</span>
    `;
    const jumpInput = document.createElement('input');
    jumpInput.className = 'toolbar-select'; jumpInput.placeholder = 'Jump to offset (hex)';
    jumpInput.style.cssText = 'width:140px;font-size:10px;font-family:monospace';
    jumpInput.onkeydown = (e) => { if (e.key === 'Enter') this._jumpTo(jumpInput.value); };
    const loadMoreBtn = document.createElement('button'); loadMoreBtn.className = 'file-tool-btn';
    loadMoreBtn.style.cssText = 'width:auto;padding:2px 8px;font-size:11px'; loadMoreBtn.textContent = 'Load more';
    loadMoreBtn.onclick = () => this._loadChunk();
    toolbar.append(jumpInput, loadMoreBtn);

    // Content
    this.contentEl = document.createElement('div'); this.contentEl.className = 'hex-content';
    this.statusEl = document.createElement('div'); this.statusEl.className = 'hex-status';

    container.append(toolbar, this.contentEl, this.statusEl);
    winInfo.content.appendChild(container);

    // Auto-load on scroll: a 10MB file needed ~160 manual "Load more" clicks
    this._sentinel = document.createElement('div');
    this._sentinel.style.height = '1px';
    this.contentEl.after(this._sentinel);
    this._io = new IntersectionObserver((entries) => {
      if (entries.some(e => e.isIntersecting) && !this._loading) this._loadChunk();
    }, { root: winInfo.content.querySelector('.hex-viewer'), rootMargin: '200px' });
    this._io.observe(this._sentinel);

    this._loadChunk();
  }

  async _loadChunk() {
    if (this._loading) return;
    this._loading = true;
    try {
      const fileOffset = this.baseOffset + this.data.length;
      if (fileOffset >= this.fileSize) { this.statusEl.textContent = 'End of file'; return; }
      const res = await fetch(`/api/file/binary?path=${encodeURIComponent(this.filePath)}&offset=${fileOffset}&length=${CHUNK_SIZE}`);
      if (!res.ok) throw new Error('Failed to load');
      const buf = await res.arrayBuffer();
      const newData = new Uint8Array(buf);
      if (newData.length === 0) { this.statusEl.textContent = 'End of file'; return; }

      // Append to existing data
      const combined = new Uint8Array(this.data.length + newData.length);
      combined.set(this.data);
      combined.set(newData, this.data.length);
      this.data = combined;

      this._render();
      const upTo = this.baseOffset + this.data.length;
      this.statusEl.textContent = this.baseOffset > 0
        ? `Showing 0x${this.baseOffset.toString(16)}–0x${upTo.toString(16)} / ${formatSize(this.fileSize)}`
        : `Loaded ${formatSize(upTo)} / ${formatSize(this.fileSize)}`;
    } catch (err) {
      this.statusEl.textContent = 'Error: ' + err.message;
    } finally {
      this._loading = false;
    }
  }

  _render() {
    const frag = document.createDocumentFragment();
    const totalRows = Math.ceil(this.data.length / BYTES_PER_ROW);
    const startRow = Math.floor(this._renderedBytes / BYTES_PER_ROW);

    for (let row = startRow; row < totalRows; row++) {
      const offset = row * BYTES_PER_ROW;
      const rowEl = document.createElement('div'); rowEl.className = 'hex-row';

      // Offset column
      const offsetEl = document.createElement('span'); offsetEl.className = 'hex-offset';
      offsetEl.textContent = (this.baseOffset + offset).toString(16).padStart(8, '0'); // real file offset, not buffer offset

      // Hex bytes column
      const bytesEl = document.createElement('span'); bytesEl.className = 'hex-bytes';
      let hexStr = '';
      for (let i = 0; i < BYTES_PER_ROW; i++) {
        const idx = offset + i;
        if (idx < this.data.length) {
          const byte = this.data[idx];
          hexStr += (byte === 0 ? '<span class="hex-null">00</span>' : byte.toString(16).padStart(2, '0'));
        } else {
          hexStr += '  ';
        }
        hexStr += i === 7 ? '  ' : ' ';
      }
      bytesEl.innerHTML = hexStr;

      // ASCII column
      const asciiEl = document.createElement('span'); asciiEl.className = 'hex-ascii';
      let asciiStr = '';
      for (let i = 0; i < BYTES_PER_ROW; i++) {
        const idx = offset + i;
        if (idx < this.data.length) {
          const byte = this.data[idx];
          asciiStr += (byte >= 32 && byte < 127) ? String.fromCharCode(byte) : '.';
        }
      }
      asciiEl.textContent = asciiStr;

      rowEl.append(offsetEl, bytesEl, asciiEl);
      frag.appendChild(rowEl);
    }
    this.contentEl.appendChild(frag);
    this._renderedBytes = this.data.length;
  }

  async _jumpTo(hexOffset) {
    const offset = parseInt(hexOffset, 16);
    if (isNaN(offset)) return;
    const relRow = Math.floor((offset - this.baseOffset) / BYTES_PER_ROW);
    const rowEl = relRow >= 0 ? this.contentEl.children[relRow] : null;
    if (rowEl) { rowEl.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
    // Outside the loaded view — reset the buffer to a row-aligned base at the
    // target, then scroll once it renders (offsets now show real file
    // positions; previously the gutter restarted at 00000000 after a jump and
    // never scrolled to the target)
    this.baseOffset = Math.max(0, Math.floor(offset / BYTES_PER_ROW) * BYTES_PER_ROW - CHUNK_SIZE / 2);
    this.baseOffset = Math.floor(this.baseOffset / BYTES_PER_ROW) * BYTES_PER_ROW;
    this.data = new Uint8Array(0);
    this._renderedBytes = 0;
    this.contentEl.innerHTML = '';
    await this._loadChunk();
    const newRow = Math.floor((offset - this.baseOffset) / BYTES_PER_ROW);
    const target = this.contentEl.children[newRow];
    if (target) target.scrollIntoView({ block: 'center' });
  }

}

export { HexViewer };
