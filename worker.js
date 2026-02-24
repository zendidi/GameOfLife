'use strict';
/* ================================================================
   Conway's Game of Life — Computation Worker
   Runs in a dedicated thread to keep the UI responsive.

   Protocol (main → worker):
     { type:'init',    cols, rows, state:Uint8Array }
     { type:'resize',  cols, rows }
     { type:'setState',state:Uint8Array }
     { type:'setCell', idx, value }
     { type:'step' }

   Protocol (worker → main):
     { type:'ready' }
     { type:'resized', state:Uint8Array }
     { type:'result',  state:Uint8Array, changes:Uint32Array }
   ================================================================ */

let cols = 0, rows = 0, size = 0;
let cur = null;        // Uint8Array – current generation
let nxt = null;        // Uint8Array – next generation (reusable buffer)
let changeBuf = null;  // Uint32Array – reusable change-index buffer

/* ── Helpers ──────────────────────────────────────────────────── */

function _allocate(c, r) {
  cols = c; rows = r; size = c * r;
  nxt = new Uint8Array(size);
  changeBuf = new Uint32Array(size);
}

function _step() {
  let cc = 0;
  for (let y = 0; y < rows; y++) {
    const ym = y - 1, yp = y + 1;
    const hasYm = ym >= 0, hasYp = yp < rows;
    for (let x = 0; x < cols; x++) {
      const idx = y * cols + x;
      const xm = x - 1, xp = x + 1;
      const hasXm = xm >= 0, hasXp = xp < cols;
      let n = 0;
      if (hasYm) {
        const row = ym * cols;
        if (hasXm) n += cur[row + xm];
        n += cur[row + x];
        if (hasXp) n += cur[row + xp];
      }
      if (hasXm) n += cur[idx - 1];
      if (hasXp) n += cur[idx + 1];
      if (hasYp) {
        const row = yp * cols;
        if (hasXm) n += cur[row + xm];
        n += cur[row + x];
        if (hasXp) n += cur[row + xp];
      }
      const alive = cur[idx];
      const next  = alive ? (n === 2 || n === 3 ? 1 : 0) : (n === 3 ? 1 : 0);
      nxt[idx] = next;
      if (next !== alive) changeBuf[cc++] = idx;
    }
  }
  // Swap double-buffer
  const tmp = cur; cur = nxt; nxt = tmp;
  return cc;
}

/* ── Message handler ──────────────────────────────────────────── */

self.onmessage = function ({ data }) {
  switch (data.type) {

    case 'init':
      _allocate(data.cols, data.rows);
      cur = new Uint8Array(data.state);
      self.postMessage({ type: 'ready' });
      break;

    case 'resize': {
      const nc = data.cols, nr = data.rows;
      const newCur = new Uint8Array(nc * nr);
      if (cur) {
        const mc = Math.min(cols, nc), mr = Math.min(rows, nr);
        for (let y = 0; y < mr; y++)
          for (let x = 0; x < mc; x++)
            newCur[y * nc + x] = cur[y * cols + x];
      }
      _allocate(nc, nr);
      cur = newCur;
      const snapshot = cur.slice();
      self.postMessage({ type: 'resized', state: snapshot }, [snapshot.buffer]);
      break;
    }

    case 'setState':
      cur.set(new Uint8Array(data.state));
      break;

    case 'setCell':
      if (data.idx >= 0 && data.idx < size) cur[data.idx] = data.value;
      break;

    case 'step': {
      const cc = _step();
      const stateCopy   = cur.slice();
      const changesCopy = changeBuf.slice(0, cc);
      self.postMessage(
        { type: 'result', state: stateCopy, changes: changesCopy },
        [stateCopy.buffer, changesCopy.buffer]
      );
      break;
    }
  }
};
