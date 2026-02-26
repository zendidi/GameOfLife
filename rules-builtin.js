'use strict';
/* ================================================================
   Built-in rule presets for Game of Life
   Each preset is an object with:
     label         : display name
     description   : short description
     channels      : string[] – channel names to create
     transition?   : { name, fn }  – transition rule (per changed cell)
     step?         : { name, fn }  – step rule (once per generation)
     color?        : { name, fn }  – color rule (per cell for rendering)
     onActivate?   : fn(engine) – called when preset is activated
     onDeactivate? : fn(engine) – called when preset is deactivated
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
          r[idx] = Math.max(0, Math.min(255, r[idx] + (Math.random() * 40 - 10)));
          g[idx] = Math.max(0, Math.min(255, g[idx] + (Math.random() * 40 - 10)));
          b[idx] = Math.max(0, Math.min(255, b[idx] + (Math.random() * 40 - 10)));
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

  /* ── 🎨 Chrono-RGB ──────────────────────────────────────────── */
  /* Each time a cell is born it permanently accumulates a colour
     offset.  Which channel (R, G or B) is boosted rotates every
     generation: gen%3==0 → R, gen%3==1 → G, gen%3==2 → B.
     The colour adds on top of the default alive colour so cells
     gradually drift from green toward white as they accumulate
     history across all three channels.                           */
  chronoRgb: (() => {
    let gen = 0;
    return {
      label: '🎨 Chrono-RGB',
      description: 'Les naissances accumulent une teinte permanente (R→G→B) qui tourne à chaque génération.',
      channels: ['cR', 'cG', 'cB'],

      transition: {
        name: 'chronoRgb:transition',
        fn(idx, x, y, newAlive, channels, cols, rows) {
          if (!newAlive) return;
          const keys = ['cR', 'cG', 'cB'];
          const ch = channels.get(keys[gen % 3]);
          if (ch) ch[idx] = Math.min(255, ch[idx] + 20);
        },
      },

      step: {
        name: 'chronoRgb:step',
        fn(state, channels, cols, rows) {
          gen++;
        },
      },

      color: {
        name: 'chronoRgb:color',
        fn(idx, alive, channels, cols, rows) {
          if (!alive) return [30, 30, 46];
          // Base alive colour (74, 222, 128) + permanent accumulated offsets
          return [
            Math.min(255, 74  + channels.get('cR')[idx]),
            Math.min(255, 222 + channels.get('cG')[idx]),
            Math.min(255, 128 + channels.get('cB')[idx]),
          ];
        },
      },
    };
  })(),

  /* ── 🌐 Carte infinie ───────────────────────────────────────── */
  /* Enables toroidal (wrap-around) topology: cells at the right
     edge see cells on the left edge as neighbours, and likewise
     for top/bottom.  Toggled via engine.setWrapEdges().          */
  infinite: {
    label: '🌐 Carte infinie',
    description: 'Les bords se rejoignent : la grille est un tore (topologie toroïdale).',
    channels: [],

    onActivate(engine)   { engine.setWrapEdges(true);  },
    onDeactivate(engine) { engine.setWrapEdges(false); },
  },
};

