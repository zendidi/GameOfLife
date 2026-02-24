'use strict';
/* ================================================================
   GameOfLifeUI
   ─────────────
   Orchestrates rendering, viewport, UI controls, and the rules panel.
   Delegates computation to SimulationEngine + worker.
   ================================================================ */

class GameOfLifeUI {

  constructor(canvas) {
    this.canvas  = canvas;
    this.ctx     = canvas.getContext('2d');
    this.engine  = new SimulationEngine();

    /* Viewport */
    this.zoom      = 1;
    this.panX      = 0;
    this.panY      = 0;
    this._isPanning = false;
    this._panStart  = null;

    /* Drag-to-draw */
    this._dragValue = null;

    /* Rendering */
    this._offscreen  = null;
    this._octx       = null;
    this._imageData  = null;
    this._needsRender = false;

    /* Active preset names */
    this._activePresets = new Set();

    this.engine.addEventListener('ready', () => {
      this._setupOffscreen();
      this._resizeCanvas();
    });

    this.engine.addEventListener('step', () => {
      this._needsRender = true;
    });

    this._bindEvents();
    this._bindRulesPanel();
    this._startRenderLoop();

    /* Safety net: set up canvas immediately on first animation frame so
       the grid is visible even if the worker 'ready' event is delayed.
       This also covers browsers where the worker may fail silently. */
    requestAnimationFrame(() => {
      if (!this._imageData) this._setupOffscreen();
      this._resizeCanvas();
    });
  }

  /* ── Rendering ──────────────────────────────────────────────── */

  _setupOffscreen() {
    const { cols, rows } = this.engine;
    // Use a regular off-DOM canvas for maximum browser compatibility.
    // OffscreenCanvas.getContext('2d') can return null in some environments,
    // which would silently break all rendering.
    this._offscreen        = document.createElement('canvas');
    this._offscreen.width  = cols;
    this._offscreen.height = rows;
    this._octx             = this._offscreen.getContext('2d');
    this._imageData        = this._octx.createImageData(cols, rows);
  }

  _startRenderLoop() {
    const loop = () => {
      if (this._needsRender) {
        this._needsRender = false;
        try {
          this._render();
          this._updateStats();
        } catch (err) {
          console.error('[GameOfLife] render error:', err);
        }
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  _render() {
    const { engine, canvas, ctx } = this;
    const { cols, rows, state, channels, colorRule, colorAlive, colorDead, colorGrid } = engine;
    const cw = canvas.width, ch = canvas.height;

    if (!this._imageData || this._imageData.width !== cols || this._imageData.height !== rows) {
      this._setupOffscreen();
    }

    /* Fill ImageData – 1 pixel per cell */
    const pxData = this._imageData.data;
    for (let i = 0, n = cols * rows; i < n; i++) {
      const alive = state[i];
      let r, g, b;
      if (colorRule) {
        ([r, g, b] = colorRule(i, alive, channels, cols, rows));
      } else if (alive) {
        [r, g, b] = colorAlive;
      } else {
        [r, g, b] = colorDead;
      }
      const p = i << 2;
      pxData[p]     = r;
      pxData[p + 1] = g;
      pxData[p + 2] = b;
      pxData[p + 3] = 255;
    }
    this._octx.putImageData(this._imageData, 0, 0);

    /* ── Square-cell layout ──────────────────────────────────────
       cellSize = floor(min(cw/cols, ch/rows)) ensures integer-pixel
       square cells at zoom=1. The grid is centered in the canvas.
       Pan and zoom are incorporated into the origin/cellSize values.
    ────────────────────────────────────────────────────────────── */
    const rawCell   = Math.min(cw / cols, ch / rows);
    const baseCell  = Math.max(1, Math.floor(rawCell));   // integer, ≥ 1
    const cellSize  = baseCell * this.zoom;
    const gridW     = cellSize * cols;
    const gridH     = cellSize * rows;
    const originX   = (cw - gridW) / 2 + this.panX;
    const originY   = (ch - gridH) / 2 + this.panY;

    /* Safety: skip if grid has no area (canvas not yet sized) */
    if (gridW <= 0 || gridH <= 0) return;

    /* Background (dead-cell color fills the whole canvas) */
    ctx.fillStyle = `rgb(${colorDead[0]},${colorDead[1]},${colorDead[2]})`;
    ctx.fillRect(0, 0, cw, ch);

    /* Blit offscreen (scaled up to square cells) */
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this._offscreen, originX, originY, gridW, gridH);

    /* Grid lines when cells are large enough to see them (≥ 2 px) */
    if (cellSize >= 2) {
      const [gr, gg, gb] = colorGrid;
      ctx.strokeStyle = `rgb(${gr},${gg},${gb})`;
      ctx.lineWidth   = 1;
      ctx.beginPath();
      for (let x = 0; x <= cols; x++) {
        const px = Math.round(originX + x * cellSize);
        ctx.moveTo(px, originY);
        ctx.lineTo(px, originY + gridH);
      }
      for (let y = 0; y <= rows; y++) {
        const py = Math.round(originY + y * cellSize);
        ctx.moveTo(originX, py);
        ctx.lineTo(originX + gridW, py);
      }
      ctx.stroke();
    }
  }

  /* ── Canvas resize ──────────────────────────────────────────── */

  _resizeCanvas() {
    const rect = this.canvas.getBoundingClientRect();
    const w    = Math.floor(rect.width)  || 300;
    const h    = Math.floor(rect.height) || 300;
    this.canvas.width        = w;
    this.canvas.height       = h;
    this.canvas.style.width  = '100%';
    this.canvas.style.height = '100%';
    this.zoom = 1; this.panX = 0; this.panY = 0;
    this._needsRender = true;
  }

  /* ── Cell picking ───────────────────────────────────────────── */

  _pixelToCell(clientX, clientY) {
    const rect   = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width  / rect.width;
    const scaleY = this.canvas.height / rect.height;
    const cpx    = (clientX - rect.left) * scaleX;
    const cpy    = (clientY - rect.top)  * scaleY;
    const { cols, rows } = this.engine;
    const cw = this.canvas.width, ch = this.canvas.height;
    const baseCellSize = Math.min(cw / cols, ch / rows);
    const cellSize     = baseCellSize * this.zoom;
    const originX = (cw - cellSize * cols) / 2 + this.panX;
    const originY = (ch - cellSize * rows) / 2 + this.panY;
    return {
      x: Math.floor((cpx - originX) / cellSize),
      y: Math.floor((cpy - originY) / cellSize),
    };
  }

  _toggleCell(evt) {
    const { x, y } = this._pixelToCell(evt.clientX, evt.clientY);
    const { engine } = this;
    if (x < 0 || x >= engine.cols || y < 0 || y >= engine.rows) return;
    if (this._dragValue === null) {
      this._dragValue = engine.getCell(x, y) === 0 ? 1 : 0;
    }
    engine.setCell(x, y, this._dragValue);
    this._needsRender = true;
  }

  /* ── Stats ──────────────────────────────────────────────────── */

  _updateStats() {
    document.getElementById('generation').textContent = this.engine.generation;
    document.getElementById('aliveCount').textContent = this.engine.aliveCount;
  }

  /* ── Event binding ──────────────────────────────────────────── */

  _bindEvents() {
    const canvas = this.canvas;

    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 1 || (e.button === 0 && e.ctrlKey)) {
        e.preventDefault();
        this._isPanning = true;
        this._panStart  = { x: e.clientX - this.panX, y: e.clientY - this.panY };
        canvas.style.cursor = 'grab';
      } else if (e.button === 0) {
        this._dragValue = null;
        this._toggleCell(e);
      }
    });

    canvas.addEventListener('mousemove', (e) => {
      if (this._isPanning && (e.buttons === 4 || (e.buttons === 1 && e.ctrlKey))) {
        this.panX = e.clientX - this._panStart.x;
        this.panY = e.clientY - this._panStart.y;
        this._needsRender = true;
      } else if (e.buttons === 1 && !this._isPanning && !e.ctrlKey) {
        this._toggleCell(e);
      }
    });

    canvas.addEventListener('mouseup', (e) => {
      if (e.button === 1 || (e.button === 0 && this._isPanning)) {
        this._isPanning = false; this._panStart = null;
        canvas.style.cursor = 'crosshair';
      } else {
        this._dragValue = null;
      }
    });

    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const rect   = canvas.getBoundingClientRect();
      const scaleX = canvas.width  / rect.width;
      const scaleY = canvas.height / rect.height;
      const mx     = (e.clientX - rect.left) * scaleX;
      const my     = (e.clientY - rect.top)  * scaleY;
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      const nz     = Math.max(0.2, Math.min(40, this.zoom * factor));
      if (nz <= 1) {
        // Zoomed out to fit: center the grid
        this.zoom = nz;
        this.panX = 0;
        this.panY = 0;
      } else {
        // Zoom around the mouse position: keep the cell under the cursor fixed
        this.panX = mx - (mx - this.panX) * (nz / this.zoom);
        this.panY = my - (my - this.panY) * (nz / this.zoom);
        this.zoom = nz;
      }
      this._needsRender = true;
    }, { passive: false });

    canvas.addEventListener('dblclick', () => {
      this.zoom = 1; this.panX = 0; this.panY = 0;
      this._needsRender = true;
    });

    canvas.addEventListener('touchstart', (e) => {
      e.preventDefault(); this._dragValue = null; this._toggleCell(e.touches[0]);
    }, { passive: false });
    canvas.addEventListener('touchmove', (e) => {
      e.preventDefault(); this._toggleCell(e.touches[0]);
    }, { passive: false });
    canvas.addEventListener('touchend', () => { this._dragValue = null; });

    window.addEventListener('resize', () => this._resizeCanvas());

    const btnPlay  = document.getElementById('btnPlay');
    const setPlayUI = (playing) => {
      btnPlay.textContent = playing ? '⏸ Pause' : '▶ Play';
      btnPlay.classList.toggle('playing', playing);
    };
    btnPlay.addEventListener('click', () => {
      if (this.engine.isPlaying) { this.engine.pause(); setPlayUI(false); }
      else                        { this.engine.play();  setPlayUI(true);  }
    });

    document.getElementById('btnStep').addEventListener('click', () => this.engine.step());

    document.getElementById('btnReset').addEventListener('click', () => {
      this.engine.pause(); setPlayUI(false);
      this.engine.reset();
    });

    document.getElementById('btnRandom').addEventListener('click', () => {
      this.engine.pause(); setPlayUI(false);
      const density = parseFloat(document.getElementById('randomDensity').value) || 0.3;
      this.engine.randomize(density);
    });

    const slider        = document.getElementById('sliderInterval');
    const intervalInput = document.getElementById('intervalInput');
    const syncInterval  = (value) => {
      const ms = Math.max(0, Math.min(2000, parseInt(value, 10)));
      this.engine.updateInterval(isNaN(ms) ? 200 : ms);
      slider.value        = this.engine.interval;
      intervalInput.value = this.engine.interval;
    };
    slider.addEventListener('input',  () => syncInterval(slider.value));
    intervalInput.addEventListener('change', () => syncInterval(intervalInput.value));

    const parseColor = (hex) => {
      const n = parseInt(hex.slice(1), 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    };
    document.getElementById('colorAlive').addEventListener('input', (e) => {
      this.engine.colorAlive = parseColor(e.target.value); this._needsRender = true;
    });
    document.getElementById('colorDead').addEventListener('input', (e) => {
      this.engine.colorDead = parseColor(e.target.value); this._needsRender = true;
    });
    document.getElementById('colorGrid').addEventListener('input', (e) => {
      this.engine.colorGrid = parseColor(e.target.value); this._needsRender = true;
    });

    document.getElementById('btnApplyGrid').addEventListener('click', () => {
      let w = parseInt(document.getElementById('gridWidth').value,  10);
      let h = parseInt(document.getElementById('gridHeight').value, 10);
      w = Math.max(2, Math.min(2000, w || 50));
      h = Math.max(2, Math.min(2000, h || 50));
      document.getElementById('gridWidth').value  = w;
      document.getElementById('gridHeight').value = h;
      this.engine.pause(); setPlayUI(false);
      this.engine.resize(w, h);
      this.engine.addEventListener('ready', () => {
        this._resizeCanvas();
      }, { once: true });
    });

    document.getElementById('btnResetView').addEventListener('click', () => {
      this.zoom = 1; this.panX = 0; this.panY = 0; this._needsRender = true;
    });

    document.querySelectorAll('.btn-pattern').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.engine.pause(); setPlayUI(false);
        this._loadPattern(btn.dataset.pattern);
      });
    });
  }

  /* ── Predefined patterns ────────────────────────────────────── */

  _placePattern(cells) {
    this.engine.reset();
    const xs = cells.map(([x]) => x), ys = cells.map(([, y]) => y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const offX = Math.floor((this.engine.cols - (maxX - minX + 1)) / 2) - minX;
    const offY = Math.floor((this.engine.rows - (maxY - minY + 1)) / 2) - minY;
    for (const [cx, cy] of cells) {
      const gx = cx + offX, gy = cy + offY;
      if (gx >= 0 && gx < this.engine.cols && gy >= 0 && gy < this.engine.rows) {
        this.engine.setCell(gx, gy, 1);
      }
    }
    this._needsRender = true;
  }

  _loadPattern(name) {
    const patterns = {
      glider:  [[1,0],[2,1],[0,2],[1,2],[2,2]],
      blinker: [[0,0],[1,0],[2,0]],
      pulsar: (() => {
        const cells = [], offsets = [2,3,4,8,9,10], rs = [0,5,7,12];
        for (const r of rs) for (const c of offsets) { cells.push([c,r]); cells.push([r,c]); }
        return cells;
      })(),
      gosper: [
        [0,4],[0,5],[1,4],[1,5],[10,4],[10,5],[10,6],[11,3],[11,7],[12,2],[12,8],
        [13,2],[13,8],[14,5],[15,3],[15,7],[16,4],[16,5],[16,6],[17,5],
        [20,2],[20,3],[20,4],[21,2],[21,3],[21,4],[22,1],[22,5],[24,0],[24,1],[24,5],[24,6],
        [34,2],[34,3],[35,2],[35,3],
      ],
    };
    if (patterns[name]) this._placePattern(patterns[name]);
  }

  /* ── Rules panel ─────────────────────────────────────────────── */

  _bindRulesPanel() {
    document.querySelectorAll('[data-preset]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const name = btn.dataset.preset;
        if (this._activePresets.has(name)) {
          this._deactivatePreset(name);
        } else {
          this._activatePreset(name);
        }
        btn.classList.toggle('preset-active', this._activePresets.has(name));
        this._refreshRulesList();
      });
    });

    document.getElementById('btnAddRule').addEventListener('click', () => this._addCustomRule());
    document.getElementById('btnClearRules').addEventListener('click', () => this._clearAllRules());

    this._updateRuleCodeHint();
    document.getElementById('ruleType').addEventListener('change', () => this._updateRuleCodeHint());
  }

  _activatePreset(name) {
    const preset = BUILTIN_RULES[name];
    if (!preset) return;
    for (const ch of preset.channels) this.engine.addChannel(ch);
    if (preset.transition) this.engine.addTransitionRule(preset.transition.name, preset.transition.fn);
    if (preset.step)       this.engine.addStepRule(preset.step.name, preset.step.fn);
    if (preset.color)      this.engine.setColorRule(preset.color.name, preset.color.fn);
    this._activePresets.add(name);
    this._needsRender = true;
  }

  _deactivatePreset(name) {
    const preset = BUILTIN_RULES[name];
    if (!preset) return;
    if (preset.transition) this.engine.removeTransitionRule(preset.transition.name);
    if (preset.step)       this.engine.removeStepRule(preset.step.name);
    if (preset.color && this.engine.colorRuleName === preset.color.name) this.engine.clearColorRule();
    this._activePresets.delete(name);
    this._needsRender = true;
  }

  _showError(msg) {
    const el = document.getElementById('rule-error');
    el.textContent = msg;
    el.style.display = 'block';
    clearTimeout(this._errorTimer);
    this._errorTimer = setTimeout(() => { el.style.display = 'none'; }, 5000);
  }

  _addCustomRule() {
    const type = document.getElementById('ruleType').value;
    const name = document.getElementById('ruleName').value.trim() || `custom_${Date.now()}`;
    const code = document.getElementById('ruleCode').value.trim();
    if (!code) { this._showError('Veuillez entrer le code de la règle.'); return; }
    try {
      let fn;
      if (type === 'transition') {
        fn = new Function('idx', 'x', 'y', 'newAlive', 'channels', 'cols', 'rows', code);
        this.engine.addTransitionRule(name, fn);
      } else if (type === 'step') {
        fn = new Function('state', 'channels', 'cols', 'rows', code);
        this.engine.addStepRule(name, fn);
      } else {
        fn = new Function('idx', 'alive', 'channels', 'cols', 'rows', code);
        this.engine.setColorRule(name, fn);
      }
      document.getElementById('ruleName').value = '';
      document.getElementById('ruleCode').value = '';
      this._refreshRulesList();
      this._needsRender = true;
    } catch (err) {
      this._showError(`Erreur : ${err.message}`);
    }
  }

  _clearAllRules() {
    this.engine.transitionRules.clear();
    this.engine.stepRules.clear();
    this.engine.clearColorRule();
    this._activePresets.clear();
    document.querySelectorAll('[data-preset]').forEach((b) => b.classList.remove('preset-active'));
    this._refreshRulesList();
    this._needsRender = true;
  }

  _refreshRulesList() {
    const list = document.getElementById('rules-list');
    list.innerHTML = '';
    const addEntry = (label, onRemove) => {
      const row = document.createElement('div');
      row.className = 'rule-entry';
      const btn = document.createElement('button');
      btn.textContent = '✕'; btn.className = 'btn-rule-remove';
      btn.addEventListener('click', onRemove);
      const span = document.createElement('span');
      span.textContent = label;
      row.appendChild(btn); row.appendChild(span);
      list.appendChild(row);
    };
    for (const name of this.engine.transitionRules.keys()) {
      addEntry(`[T] ${name}`, () => { this.engine.removeTransitionRule(name); this._refreshRulesList(); });
    }
    for (const name of this.engine.stepRules.keys()) {
      addEntry(`[S] ${name}`, () => { this.engine.removeStepRule(name); this._refreshRulesList(); });
    }
    if (this.engine.colorRuleName) {
      addEntry(`[C] ${this.engine.colorRuleName}`, () => {
        this.engine.clearColorRule(); this._refreshRulesList(); this._needsRender = true;
      });
    }
    if (list.children.length === 0) {
      const hint = document.createElement('span');
      hint.className = 'hint'; hint.textContent = 'Aucune règle active';
      list.appendChild(hint);
    }
  }

  _updateRuleCodeHint() {
    const type  = document.getElementById('ruleType').value;
    const area  = document.getElementById('ruleCode');
    const hints = {
      transition: '// idx, x, y, newAlive, channels, cols, rows\nif (newAlive) {\n  const h = channels.get(\'heat\');\n  if (h) h[idx] = Math.min(255, h[idx] + 50);\n}',
      step:       '// state, channels, cols, rows\nconst h = channels.get(\'heat\');\nif (h) for (let i = 0; i < h.length; i++) h[i] *= 0.95;',
      color:      '// idx, alive, channels, cols, rows → return [r, g, b]\nconst h = (channels.get(\'heat\') || [])[idx] || 0;\nif (alive) return [255, h * 0.5 | 0, 0];\nreturn [h * 0.5 | 0, 0, 0];',
    };
    area.placeholder = hints[type] || '';
  }
}

/* ── Bootstrap ─────────────────────────────────────────────────── */
window.addEventListener('DOMContentLoaded', () => {
  window._game = new GameOfLifeUI(document.getElementById('canvas'));
});
