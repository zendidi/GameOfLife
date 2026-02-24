/**
 * Conway's Game of Life
 * ----------------------
 * Rules:
 *  - A live cell with 2 or 3 live neighbours survives.
 *  - A dead cell with exactly 3 live neighbours becomes alive.
 *  - All other cells die or stay dead.
 */

class GameOfLife {
  /**
   * @param {HTMLCanvasElement} canvas
   */
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');

    // Grid dimensions (in cells)
    this.cols = 50;
    this.rows = 50;

    // Colors
    this.colorAlive = '#4ade80';
    this.colorDead  = '#1e1e2e';
    this.colorGrid  = '#2d2d44';

    // Simulation state
    this.grid = this._createGrid();
    this.generation = 0;
    this.animationId = null;
    this.interval = 200; // ms

    // Viewport (zoom & pan)
    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;
    this._isPanning = false;
    this._panStart = null;

    // Mouse drag state for cell toggling
    this._dragValue = null; // true = activate, false = deactivate

    this._bindEvents();
    this._resizeCanvas();
    this._render();
  }

  // ─── Grid helpers ────────────────────────────────────────────────────────────

  /** Create a cols×rows grid filled with `false`. */
  _createGrid() {
    return Array.from({ length: this.cols }, () =>
      new Array(this.rows).fill(false)
    );
  }

  /** Resize grid to new dimensions, preserving existing cells where possible. */
  _resizeGrid(newCols, newRows) {
    const oldGrid = this.grid;
    const oldCols = this.cols;
    const oldRows = this.rows;

    this.cols = newCols;
    this.rows = newRows;
    this.grid = this._createGrid();

    for (let x = 0; x < Math.min(newCols, oldCols); x++) {
      for (let y = 0; y < Math.min(newRows, oldRows); y++) {
        this.grid[x][y] = oldGrid[x][y];
      }
    }
  }

  /** Count the number of live neighbours of cell (x, y). */
  _countNeighbours(grid, x, y) {
    let count = 0;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && nx < this.cols && ny >= 0 && ny < this.rows) {
          if (grid[nx][ny]) count++;
        }
      }
    }
    return count;
  }

  // ─── Simulation ──────────────────────────────────────────────────────────────

  /** Advance the simulation by one generation. */
  step() {
    const next = this._createGrid();
    for (let x = 0; x < this.cols; x++) {
      for (let y = 0; y < this.rows; y++) {
        const neighbours = this._countNeighbours(this.grid, x, y);
        if (this.grid[x][y]) {
          next[x][y] = neighbours === 2 || neighbours === 3;
        } else {
          next[x][y] = neighbours === 3;
        }
      }
    }
    this.grid = next;
    this.generation++;
    this._updateStats();
    this._render();
  }

  /** Clear the grid and reset generation counter. */
  reset() {
    this.grid = this._createGrid();
    this.generation = 0;
    this._updateStats();
    this._render();
  }

  /** Start automatic play. */
  play() {
    if (this.animationId !== null) return;
    const tick = () => {
      this.step();
      this.animationId = setTimeout(tick, this.interval);
    };
    this.animationId = setTimeout(tick, this.interval);
  }

  /** Stop automatic play. */
  pause() {
    if (this.animationId !== null) {
      clearTimeout(this.animationId);
      this.animationId = null;
    }
  }

  get isPlaying() {
    return this.animationId !== null;
  }

  // ─── Rendering ───────────────────────────────────────────────────────────────

  /** Fit canvas to its parent container and re-render. */
  _resizeCanvas() {
    // Read the CSS-allocated size BEFORE changing the canvas width/height attributes
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.floor(rect.width)  || 300;
    const h = Math.floor(rect.height) || 300;
    this.canvas.width  = w;
    this.canvas.height = h;
    // Re-apply CSS so the attribute change doesn't push the element wider
    this.canvas.style.width  = '100%';
    this.canvas.style.height = '100%';
    // Reset viewport on resize
    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;
    this._render();
  }

  /** Draw the current grid state. */
  _render() {
    const { ctx, canvas, cols, rows } = this;
    const cellW = canvas.width  / cols;
    const cellH = canvas.height / rows;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(this.panX, this.panY);
    ctx.scale(this.zoom, this.zoom);

    // Background (dead cells)
    ctx.fillStyle = this.colorDead;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Live cells
    ctx.fillStyle = this.colorAlive;
    for (let x = 0; x < cols; x++) {
      for (let y = 0; y < rows; y++) {
        if (this.grid[x][y]) {
          ctx.fillRect(
            Math.floor(x * cellW),
            Math.floor(y * cellH),
            Math.ceil(cellW),
            Math.ceil(cellH)
          );
        }
      }
    }

    // Grid lines
    ctx.strokeStyle = this.colorGrid;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    for (let x = 0; x <= cols; x++) {
      const px = Math.round(x * cellW);
      ctx.moveTo(px, 0);
      ctx.lineTo(px, canvas.height);
    }
    for (let y = 0; y <= rows; y++) {
      const py = Math.round(y * cellH);
      ctx.moveTo(0, py);
      ctx.lineTo(canvas.width, py);
    }
    ctx.stroke();

    ctx.restore();
  }

  // ─── Stats ───────────────────────────────────────────────────────────────────

  _updateStats() {
    let alive = 0;
    for (let x = 0; x < this.cols; x++) {
      for (let y = 0; y < this.rows; y++) {
        if (this.grid[x][y]) alive++;
      }
    }
    document.getElementById('generation').textContent = this.generation;
    document.getElementById('aliveCount').textContent = alive;
  }

  // ─── Cell interaction ────────────────────────────────────────────────────────

  /** Convert canvas pixel coordinates to grid cell coordinates. */
  _pixelToCell(px, py) {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width  / rect.width;
    const scaleY = this.canvas.height / rect.height;
    // Canvas-space pixel coords
    const cpx = (px - rect.left) * scaleX;
    const cpy = (py - rect.top)  * scaleY;
    // Undo pan and zoom to get world (unscaled canvas) coords
    const worldX = (cpx - this.panX) / this.zoom;
    const worldY = (cpy - this.panY) / this.zoom;
    const x = Math.floor(worldX / (this.canvas.width  / this.cols));
    const y = Math.floor(worldY / (this.canvas.height / this.rows));
    return { x, y };
  }

  /** Toggle (or force) a cell from a mouse event. */
  _toggleCell(evt) {
    const { x, y } = this._pixelToCell(evt.clientX, evt.clientY);
    if (x < 0 || x >= this.cols || y < 0 || y >= this.rows) return;
    if (this._dragValue === null) {
      this._dragValue = !this.grid[x][y];
    }
    this.grid[x][y] = this._dragValue;
    this._updateStats();
    this._render();
  }

  // ─── Predefined patterns ─────────────────────────────────────────────────────

  /**
   * Place a pattern centred on the grid.
   * @param {Array<[number, number]>} cells  relative [col, row] offsets of live cells
   */
  _placePattern(cells) {
    this.reset();
    const minX = Math.min(...cells.map(([x]) => x));
    const maxX = Math.max(...cells.map(([x]) => x));
    const minY = Math.min(...cells.map(([, y]) => y));
    const maxY = Math.max(...cells.map(([, y]) => y));
    const offsetX = Math.floor((this.cols - (maxX - minX + 1)) / 2) - minX;
    const offsetY = Math.floor((this.rows - (maxY - minY + 1)) / 2) - minY;
    for (const [cx, cy] of cells) {
      const gx = cx + offsetX;
      const gy = cy + offsetY;
      if (gx >= 0 && gx < this.cols && gy >= 0 && gy < this.rows) {
        this.grid[gx][gy] = true;
      }
    }
    this._updateStats();
    this._render();
  }

  loadPattern(name) {
    const patterns = {
      glider: [
        [1, 0], [2, 1], [0, 2], [1, 2], [2, 2]
      ],
      blinker: [
        [0, 0], [1, 0], [2, 0]
      ],
      pulsar: (() => {
        const cells = [];
        const offsets = [2, 3, 4, 8, 9, 10];
        const rows    = [0, 5, 7, 12];
        for (const r of rows) {
          for (const c of offsets) {
            cells.push([c, r]);
            cells.push([r, c]);
          }
        }
        return cells;
      })(),
      gosper: [
        // Gosper Glider Gun
        [0, 4],[0, 5],[1, 4],[1, 5],
        [10,4],[10,5],[10,6],
        [11,3],[11,7],
        [12,2],[12,8],
        [13,2],[13,8],
        [14,5],
        [15,3],[15,7],
        [16,4],[16,5],[16,6],
        [17,5],
        [20,2],[20,3],[20,4],
        [21,2],[21,3],[21,4],
        [22,1],[22,5],
        [24,0],[24,1],[24,5],[24,6],
        [34,2],[34,3],
        [35,2],[35,3]
      ]
    };

    if (patterns[name]) {
      this._placePattern(patterns[name]);
    }
  }

  // ─── Event binding ───────────────────────────────────────────────────────────

  _bindEvents() {
    // Canvas – click / drag to toggle cells; middle-mouse or Ctrl+drag to pan
    this.canvas.addEventListener('mousedown', (e) => {
      if (e.button === 1 || (e.button === 0 && e.ctrlKey)) {
        e.preventDefault();
        this._isPanning = true;
        this._panStart = { x: e.clientX - this.panX, y: e.clientY - this.panY };
        this.canvas.style.cursor = 'grab';
      } else if (e.button === 0) {
        this._dragValue = null;
        this._toggleCell(e);
      }
    });
    this.canvas.addEventListener('mousemove', (e) => {
      if (this._isPanning && (e.buttons === 4 || (e.buttons === 1 && e.ctrlKey))) {
        this.panX = e.clientX - this._panStart.x;
        this.panY = e.clientY - this._panStart.y;
        this._render();
      } else if (e.buttons === 1 && !e.ctrlKey) {
        this._toggleCell(e);
      }
    });
    this.canvas.addEventListener('mouseup', (e) => {
      if (e.button === 1 || (e.button === 0 && this._isPanning)) {
        this._isPanning = false;
        this._panStart = null;
        this.canvas.style.cursor = 'crosshair';
      } else {
        this._dragValue = null;
      }
    });

    // Zoom – mouse wheel
    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const rect = this.canvas.getBoundingClientRect();
      const scaleX = this.canvas.width  / rect.width;
      const scaleY = this.canvas.height / rect.height;
      const mouseX = (e.clientX - rect.left) * scaleX;
      const mouseY = (e.clientY - rect.top)  * scaleY;
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      const newZoom = Math.max(0.5, Math.min(20, this.zoom * factor));
      this.panX = mouseX - (mouseX - this.panX) * (newZoom / this.zoom);
      this.panY = mouseY - (mouseY - this.panY) * (newZoom / this.zoom);
      this.zoom = newZoom;
      this._render();
    }, { passive: false });

    // Reset view – double-click
    this.canvas.addEventListener('dblclick', () => {
      this.zoom = 1;
      this.panX = 0;
      this.panY = 0;
      this._render();
    });

    // Touch support
    this.canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this._dragValue = null;
      this._toggleCell(e.touches[0]);
    }, { passive: false });
    this.canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      this._toggleCell(e.touches[0]);
    }, { passive: false });
    this.canvas.addEventListener('touchend', () => {
      this._dragValue = null;
    });

    // Resize
    window.addEventListener('resize', () => this._resizeCanvas());

    // Play / Pause
    const btnPlay = document.getElementById('btnPlay');
    btnPlay.addEventListener('click', () => {
      if (this.isPlaying) {
        this.pause();
        btnPlay.textContent = '▶ Play';
        btnPlay.classList.remove('playing');
      } else {
        this.play();
        btnPlay.textContent = '⏸ Pause';
        btnPlay.classList.add('playing');
      }
    });

    // Step
    document.getElementById('btnStep').addEventListener('click', () => this.step());

    // Reset
    document.getElementById('btnReset').addEventListener('click', () => {
      this.pause();
      document.getElementById('btnPlay').textContent = '▶ Play';
      document.getElementById('btnPlay').classList.remove('playing');
      this.reset();
    });

    // Interval slider + number input
    const slider = document.getElementById('sliderInterval');
    const intervalInput = document.getElementById('intervalInput');
    const syncInterval = (value) => {
      this.interval = Math.max(50, Math.min(2000, parseInt(value, 10) || 200));
      slider.value = this.interval;
      intervalInput.value = this.interval;
      if (this.isPlaying) {
        this.pause();
        this.play();
      }
    };
    slider.addEventListener('input', () => syncInterval(slider.value));
    intervalInput.addEventListener('change', () => syncInterval(intervalInput.value));

    // Color pickers
    document.getElementById('colorAlive').addEventListener('input', (e) => {
      this.colorAlive = e.target.value;
      this._render();
    });
    document.getElementById('colorDead').addEventListener('input', (e) => {
      this.colorDead = e.target.value;
      this._render();
    });
    document.getElementById('colorGrid').addEventListener('input', (e) => {
      this.colorGrid = e.target.value;
      this._render();
    });

    // Grid size
    document.getElementById('btnApplyGrid').addEventListener('click', () => {
      let w = parseInt(document.getElementById('gridWidth').value,  10);
      let h = parseInt(document.getElementById('gridHeight').value, 10);
      w = Math.max(2, Math.min(250, w || 50));
      h = Math.max(2, Math.min(250, h || 50));
      document.getElementById('gridWidth').value  = w;
      document.getElementById('gridHeight').value = h;
      this._resizeGrid(w, h);
      this._resizeCanvas();
      this._updateStats();
    });

    // Reset view button
    document.getElementById('btnResetView').addEventListener('click', () => {
      this.zoom = 1;
      this.panX = 0;
      this.panY = 0;
      this._render();
    });

    // Predefined patterns
    document.querySelectorAll('.btn-pattern').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.pause();
        document.getElementById('btnPlay').textContent = '▶ Play';
        document.getElementById('btnPlay').classList.remove('playing');
        this.loadPattern(btn.dataset.pattern);
      });
    });
  }
}

// ─── Bootstrap ───────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('canvas');
  const game = new GameOfLife(canvas);
  // Initialise stats display
  game._updateStats();
});
