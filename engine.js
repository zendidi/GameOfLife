'use strict';
/* ================================================================
   SimulationEngine
   ─────────────────
   • Owns the canonical grid state (Uint8Array, flat row-major)
   • Delegates GoL computation to a Web Worker
   • Maintains per-cell data channels (Float32Array)
   • Hosts pluggable rule registries:
       transitionRules : called per cell that changed state
       stepRules       : called once per generation (all cells)
       colorRule       : determines RGBA color per cell for rendering
   ================================================================ */

class SimulationEngine extends EventTarget {

  constructor() {
    super();

    this.cols = 50;
    this.rows = 50;

    /* Latest state snapshot from the worker */
    this.state = new Uint8Array(this.cols * this.rows);

    /* Per-cell data channels: name → Float32Array(cols*rows) */
    this.channels = new Map();

    /* Rule registries */
    // fn(idx, x, y, newAlive, channels, cols, rows) → void
    this.transitionRules = new Map();
    // fn(state, channels, cols, rows) → void
    this.stepRules = new Map();
    // fn(idx, alive, channels, cols, rows) → [r, g, b]
    this.colorRule     = null;
    this.colorRuleName = null;

    /* Default display colours ([r,g,b]) */
    this.colorAlive = [74, 222, 128];
    this.colorDead  = [30,  30,  46];
    this.colorGrid  = [45,  45,  68];

    /* Stats */
    this.generation = 0;
    this.aliveCount = 0;

    /* Timing */
    this.interval = 200; // ms; 0 = max speed
    this._running   = false;
    this._timerId   = null;
    this._workerBusy  = false;
    this._pendingStep = false;

    /* Worker */
    this._worker      = null;
    this._workerReady = false;
    this._initWorker();
  }

  /* ── Worker ─────────────────────────────────────────────────── */

  _initWorker() {
    this._worker = new Worker('worker.js');
    this._worker.onmessage = (e) => this._onWorkerMessage(e.data);
    this._worker.postMessage({
      type: 'init',
      cols: this.cols,
      rows: this.rows,
      state: this.state.slice(),
    });
  }

  _onWorkerMessage(data) {
    if (data.type === 'ready') {
      this._workerReady = true;
      this._workerBusy  = false;
      this._resumeIfPending();
      this.dispatchEvent(new CustomEvent('ready'));
      return;
    }

    if (data.type === 'resized') {
      this.state = new Uint8Array(data.state);
      this._ensureChannelSize();
      this._workerBusy  = false;
      this._workerReady = true;
      this._resumeIfPending();
      this.dispatchEvent(new CustomEvent('ready'));
      return;
    }

    if (data.type === 'result') {
      const { state, changes } = data;
      this.state = state;

      /* Apply transition rules (only for changed cells) */
      if (this.transitionRules.size > 0 && changes.length > 0) {
        for (let i = 0; i < changes.length; i++) {
          const idx      = changes[i];
          const x        = idx % this.cols;
          const y        = (idx / this.cols) | 0;
          const newAlive = state[idx];
          for (const fn of this.transitionRules.values()) {
            fn(idx, x, y, newAlive, this.channels, this.cols, this.rows);
          }
        }
      }

      /* Apply step rules (all cells) */
      for (const fn of this.stepRules.values()) {
        fn(this.state, this.channels, this.cols, this.rows);
      }

      /* Update counters */
      this.generation++;
      let alive = 0;
      for (let i = 0, n = state.length; i < n; i++) alive += state[i];
      this.aliveCount = alive;

      this._workerBusy = false;

      this.dispatchEvent(new CustomEvent('step'));

      /* Schedule next step if playing */
      if (this._running) {
        if (this.interval === 0) {
          /* Max speed: chain immediately */
          this._requestStep();
        } else {
          this._timerId = setTimeout(() => this._requestStep(), this.interval);
        }
      }
    }
  }

  _requestStep() {
    if (this._workerBusy || !this._workerReady) {
      this._pendingStep = true;
      return;
    }
    this._pendingStep = false;
    this._workerBusy  = true;
    this._worker.postMessage({ type: 'step' });
  }

  /** Called when worker becomes available – resume any pending step. */
  _resumeIfPending() {
    if (!this._pendingStep) return;
    this._pendingStep = false;
    if (this._running) {
      /* Resume the play loop with the configured interval */
      if (this.interval === 0) {
        this._requestStep();
      } else {
        this._timerId = setTimeout(() => this._requestStep(), this.interval);
      }
    } else {
      /* A manual step was deferred while the worker was busy/not ready */
      this._requestStep();
    }
  }

  /* ── Grid management ─────────────────────────────────────────── */

  resize(newCols, newRows) {
    /* Resize channels preserving existing data */
    for (const [name, ch] of this.channels) {
      const oldCols = this.cols, oldRows = this.rows;
      const newCh = new Float32Array(newCols * newRows);
      const mc = Math.min(oldCols, newCols), mr = Math.min(oldRows, newRows);
      for (let y = 0; y < mr; y++)
        for (let x = 0; x < mc; x++)
          newCh[y * newCols + x] = ch[y * oldCols + x];
      this.channels.set(name, newCh);
    }

    this.cols = newCols;
    this.rows = newRows;
    this.generation = 0;
    this.aliveCount = 0;

    this._workerBusy  = true;
    this._workerReady = false;
    this._worker.postMessage({ type: 'resize', cols: newCols, rows: newRows });
  }

  reset() {
    this.generation = 0;
    this.aliveCount = 0;
    this.state = new Uint8Array(this.cols * this.rows);
    this._clearChannels();
    this._worker.postMessage({ type: 'setState', state: this.state });
    this.dispatchEvent(new CustomEvent('step'));
  }

  randomize(density = 0.3) {
    const n = this.cols * this.rows;
    this.state = new Uint8Array(n);
    for (let i = 0; i < n; i++) this.state[i] = Math.random() < density ? 1 : 0;
    this._clearChannels();
    this.generation = 0;
    this.aliveCount = 0;
    for (let i = 0; i < n; i++) this.aliveCount += this.state[i];
    this._worker.postMessage({ type: 'setState', state: this.state });
    this.dispatchEvent(new CustomEvent('step'));
  }

  _ensureChannelSize() {
    const size = this.cols * this.rows;
    for (const [name, ch] of this.channels) {
      if (ch.length !== size) this.channels.set(name, new Float32Array(size));
    }
  }

  _clearChannels() {
    const size = this.cols * this.rows;
    for (const [name] of this.channels) {
      this.channels.set(name, new Float32Array(size));
    }
  }

  /* ── Channels ───────────────────────────────────────────────── */

  addChannel(name) {
    if (!this.channels.has(name)) {
      this.channels.set(name, new Float32Array(this.cols * this.rows));
    }
    return this.channels.get(name);
  }

  removeChannel(name) { this.channels.delete(name); }

  /* ── Rule management ─────────────────────────────────────────── */

  addTransitionRule(name, fn) { this.transitionRules.set(name, fn); }
  removeTransitionRule(name)  { this.transitionRules.delete(name); }

  addStepRule(name, fn) { this.stepRules.set(name, fn); }
  removeStepRule(name)  { this.stepRules.delete(name); }

  setColorRule(name, fn) {
    this.colorRule     = fn;
    this.colorRuleName = name;
  }
  clearColorRule() {
    this.colorRule     = null;
    this.colorRuleName = null;
  }

  /* ── Cell access ─────────────────────────────────────────────── */

  getCell(x, y) { return this.state[y * this.cols + x]; }

  setCell(x, y, value) {
    const idx = y * this.cols + x;
    const prev = this.state[idx];
    this.state[idx] = value ? 1 : 0;
    this.aliveCount += this.state[idx] - prev;
    this._worker.postMessage({ type: 'setCell', idx, value: value ? 1 : 0 });
  }

  /* ── Playback ────────────────────────────────────────────────── */

  play() {
    if (this._running) return;
    this._running = true;
    if (this.interval === 0) {
      this._requestStep();
    } else {
      this._timerId = setTimeout(() => this._requestStep(), this.interval);
    }
  }

  pause() {
    this._running = false;
    if (this._timerId !== null) { clearTimeout(this._timerId); this._timerId = null; }
  }

  step() { this._requestStep(); }

  updateInterval(ms) {
    const wasRunning = this._running;
    if (wasRunning) this.pause();
    this.interval = ms;
    if (wasRunning) this.play();
  }

  get isPlaying() { return this._running; }
}
