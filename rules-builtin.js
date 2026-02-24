'use strict';
/* ================================================================
   Built-in rule presets for Game of Life
   Each preset is an object with:
     label         : display name
     description   : short description
     channels      : string[] – channel names to create
     transition?   : { name, fn }  – transition rule (per changed cell)
     step?         : { name, fn }  – step rule (once per generation)
     color         : { name, fn }  – color rule (per cell for rendering)
   ================================================================ */

const BUILTIN_RULES = {

  /* ── 🔥 Chaleur (Heat map) ─────────────────────────────────── */
  heat: {
    label: '🔥 Chaleur',
    description: 'Les naissances chauffent les cellules. La chaleur irradie et refroidit.',
    channels: ['heat'],

    transition: {
      name: 'heat:transition',
      fn(idx, x, y, newAlive, channels, cols, rows) {
        const heat = channels.get('heat');
        if (newAlive) {
          heat[idx] = Math.min(255, heat[idx] + 200);
        }
      },
    },

    step: {
      name: 'heat:step',
      fn(state, channels, cols, rows) {
        const heat = channels.get('heat');
        for (let i = 0, n = heat.length; i < n; i++) {
          heat[i] *= 0.95;
          if (heat[i] < 0.5) heat[i] = 0;
        }
      },
    },

    color: {
      name: 'heat:color',
      fn(idx, alive, channels, cols, rows) {
        const h = channels.get('heat')[idx];
        if (alive) {
          // White-hot core → orange glow
          return [255, Math.min(255, h * 0.55 + 80), Math.min(255, h * 0.15)];
        }
        // Dead cells show cooling embers
        return [Math.min(255, h * 0.7), Math.min(255, h * 0.1), 0];
      },
    },
  },

  /* ── 🌿 Âge (Age-based colour) ─────────────────────────────── */
  age: {
    label: '🌿 Âge',
    description: 'Les cellules vieillissent et changent de couleur avec le temps.',
    channels: ['age'],

    transition: {
      name: 'age:transition',
      fn(idx, x, y, newAlive, channels, cols, rows) {
        if (!newAlive) channels.get('age')[idx] = 0; // reset on death
      },
    },

    step: {
      name: 'age:step',
      fn(state, channels, cols, rows) {
        const age = channels.get('age');
        for (let i = 0, n = state.length; i < n; i++) {
          if (state[i]) age[i]++;
        }
      },
    },

    color: {
      name: 'age:color',
      fn(idx, alive, channels, cols, rows) {
        if (!alive) return [30, 30, 46];
        const a = Math.min(channels.get('age')[idx], 200);
        const t = a / 200; // 0 (young) → 1 (old)
        // young=green → middle=cyan → old=deep blue
        const r = Math.round(20  + t * 10);
        const g = Math.round(230 - t * 130);
        const b = Math.round(60  + t * 180);
        return [r, g, b];
      },
    },
  },

  /* ── 💡 Phosphore (Glowing trails) ─────────────────────────── */
  phosphor: {
    label: '💡 Phosphore',
    description: 'Les cellules mortes laissent une traînée lumineuse qui s\'estompe.',
    channels: ['glow'],

    transition: {
      name: 'phosphor:transition',
      fn(idx, x, y, newAlive, channels, cols, rows) {
        if (!newAlive) {
          channels.get('glow')[idx] = 255;
        }
      },
    },

    step: {
      name: 'phosphor:step',
      fn(state, channels, cols, rows) {
        const glow = channels.get('glow');
        for (let i = 0, n = glow.length; i < n; i++) {
          glow[i] *= 0.90;
          if (glow[i] < 0.5) glow[i] = 0;
        }
      },
    },

    color: {
      name: 'phosphor:color',
      fn(idx, alive, channels, cols, rows) {
        if (alive) return [180, 255, 180];
        const g = channels.get('glow')[idx];
        return [0, Math.min(255, g * 0.7), Math.min(255, g * 0.4)];
      },
    },
  },

  /* ── 🌈 Arc-en-ciel (Position rainbow) ──────────────────────── */
  rainbow: {
    label: '🌈 Arc-en-ciel',
    description: 'Couleur basée sur la position (x, y) dans la grille.',
    channels: [],

    color: {
      name: 'rainbow:color',
      fn: (() => {
        function hsl2rgb(h, s, l) {
          const a = s * Math.min(l, 1 - l);
          const f = (n) => {
            const k = (n + h / 30) % 12;
            return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
          };
          return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
        }
        return function(idx, alive, channels, cols, rows) {
          if (!alive) return [30, 30, 46];
          const x = idx % cols, y = (idx / cols) | 0;
          const hue = ((x / cols + y / rows) * 360) % 360;
          return hsl2rgb(hue, 1, 0.6);
        };
      })(),
    },
  },

  /* ── 🧬 ADN (Mutation DNA) ──────────────────────────────────── */
  dna: {
    label: '🧬 ADN',
    description: 'Chaque naissance mute légèrement les couleurs RGB de la cellule.',
    channels: ['dnaR', 'dnaG', 'dnaB'],

    transition: {
      name: 'dna:transition',
      fn(idx, x, y, newAlive, channels, cols, rows) {
        if (newAlive) {
          const r = channels.get('dnaR');
          const g = channels.get('dnaG');
          const b = channels.get('dnaB');
          r[idx] = Math.min(255, r[idx] + (Math.random() * 40 - 10));
          g[idx] = Math.min(255, g[idx] + (Math.random() * 40 - 10));
          b[idx] = Math.min(255, b[idx] + (Math.random() * 40 - 10));
        }
      },
    },

    step: {
      name: 'dna:step',
      fn(state, channels, cols, rows) {
        const r = channels.get('dnaR');
        const g = channels.get('dnaG');
        const b = channels.get('dnaB');
        for (let i = 0, n = state.length; i < n; i++) {
          if (!state[i]) {
            r[i] *= 0.98; g[i] *= 0.98; b[i] *= 0.98;
          }
        }
      },
    },

    color: {
      name: 'dna:color',
      fn(idx, alive, channels, cols, rows) {
        if (!alive) return [30, 30, 46];
        const rv = channels.get('dnaR')[idx];
        const gv = channels.get('dnaG')[idx];
        const bv = channels.get('dnaB')[idx];
        const total = rv + gv + bv || 1;
        // Normalize + boost for vivid colours
        return [
          Math.min(255, Math.round(50 + (rv / total) * 400)),
          Math.min(255, Math.round(50 + (gv / total) * 400)),
          Math.min(255, Math.round(50 + (bv / total) * 400)),
        ];
      },
    },
  },

  /* ── 🌊 Onde (Wave / energy pulse) ─────────────────────────── */
  wave: {
    label: '🌊 Onde',
    description: 'Les voisins actifs génèrent de l\'énergie qui se propage en vagues.',
    channels: ['energy'],

    transition: {
      name: 'wave:transition',
      fn(idx, x, y, newAlive, channels, cols, rows) {
        if (newAlive) {
          channels.get('energy')[idx] = 255;
        }
      },
    },

    step: {
      name: 'wave:step',
      fn(state, channels, cols, rows) {
        const energy = channels.get('energy');
        const tmp = energy.slice();
        for (let y = 0; y < rows; y++) {
          for (let x = 0; x < cols; x++) {
            const idx = y * cols + x;
            if (state[idx]) continue; // alive cells handled by transition rule
            // Spread from neighbours
            let sum = 0, cnt = 0;
            if (x > 0)        { sum += tmp[idx - 1];     cnt++; }
            if (x < cols - 1) { sum += tmp[idx + 1];     cnt++; }
            if (y > 0)        { sum += tmp[idx - cols];  cnt++; }
            if (y < rows - 1) { sum += tmp[idx + cols];  cnt++; }
            energy[idx] = Math.max(0, (sum / (cnt || 1)) * 0.75);
            if (energy[idx] < 0.5) energy[idx] = 0;
          }
        }
      },
    },

    color: {
      name: 'wave:color',
      fn(idx, alive, channels, cols, rows) {
        const e = channels.get('energy')[idx];
        if (alive) {
          const t = Math.min(1, e / 255);
          return [
            Math.round(40  + t * 215),
            Math.round(100 + t * 155),
            255,
          ];
        }
        return [0, Math.min(255, Math.round(e * 0.4)), Math.min(255, Math.round(e * 0.9))];
      },
    },
  },
};
