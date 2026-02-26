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
  /* Each time a cell *dies* it permanently accumulates a colour
     offset on that cell's dead surface.  Which channel (R, G, B)
     rotates every generation: gen%3==0 → R, gen%3==1 → G,
     gen%3==2 → B.  The graveyard slowly fills with coloured
     records of every death event.  Alive cells are rendered with
     the plain alive colour so the history only shows on the dead
     background.                                                   */
  chronoRgb: (() => {
    let gen = 0;
    return {
      label: '🎨 Chrono-RGB',
      description: 'Les morts accumulent une teinte permanente (R→G→B cyclique) – le cimetière se colore génération après génération.',
      channels: ['cR', 'cG', 'cB'],

      transition: {
        name: 'chronoRgb:transition',
        fn(idx, x, y, newAlive, channels, cols, rows) {
          if (newAlive) return; // only on death
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
          if (alive) return [74, 222, 128]; // plain alive colour
          // Dead cell: show accumulated colour offsets on dark background
          const r = channels.get('cR')[idx];
          const g = channels.get('cG')[idx];
          const b = channels.get('cB')[idx];
          if (r + g + b < 1) return [30, 30, 46]; // untouched
          return [
            Math.min(255, Math.round(r)),
            Math.min(255, Math.round(g)),
            Math.min(255, Math.round(b)),
          ];
        },
      },
    };
  })(),

  /* ── 🗺️ Sédimentation ───────────────────────────────────────── */
  /* Every death permanently increments a cell's sediment counter.
     Dead cells are rendered on a cold→warm spectrum based on how
     many times they have ever died: rarely-visited → deep blue,
     frequently-toggled → bright orange/yellow.  Alive cells stay
     white to contrast against the heat-map background.           */
  sedimentation: {
    label: '🗺️ Sédimentation',
    description: 'Chaque mort laisse un dépôt permanent. Les zones actives chauffent du bleu au jaune.',
    channels: ['sediment'],

    transition: {
      name: 'sedimentation:transition',
      fn(idx, x, y, newAlive, channels, cols, rows) {
        if (!newAlive) channels.get('sediment')[idx]++;
      },
    },

    color: {
      name: 'sedimentation:color',
      fn(idx, alive, channels, cols, rows) {
        if (alive) return [230, 255, 230]; // bright white-green for living cells
        const t = Math.min(1, channels.get('sediment')[idx] / 40);
        // cold (deep blue) → warm (bright orange-yellow)
        return [
          Math.round(10  + t * 245),
          Math.round(10  + t * 165),
          Math.round(100 - t * 80),
        ];
      },
    },
  },

  /* ── 🔵 Contour ─────────────────────────────────────────────── */
  /* Each step detects cells that sit on the boundary between life
     and death.  An alive cell is "edge" if it has at least one
     dead neighbour; a dead cell is "edge" if it has at least one
     alive neighbour.  Edge-alive cells glow cyan; edge-dead cells
     glow violet; interior cells are nearly invisible.  The result
     looks like glowing circuit-board outlines.                   */
  contour: {
    label: '🔵 Contour',
    description: 'Illumine les frontières vie/mort en cyan et violet – rendu circuit imprimé.',
    channels: ['edge'],

    step: {
      name: 'contour:step',
      fn(state, channels, cols, rows) {
        const edge = channels.get('edge');
        for (let y = 0; y < rows; y++) {
          for (let x = 0; x < cols; x++) {
            const idx = y * cols + x;
            let aliveN = 0, totalN = 0;
            for (let dy = -1; dy <= 1; dy++) {
              for (let dx = -1; dx <= 1; dx++) {
                if (dx === 0 && dy === 0) continue;
                const ny = y + dy, nx = x + dx;
                if (ny >= 0 && ny < rows && nx >= 0 && nx < cols) {
                  totalN++;
                  aliveN += state[ny * cols + nx];
                }
              }
            }
            const alive = state[idx];
            edge[idx] = alive
              ? (aliveN < totalN ? 1 : 0)   // alive edge: at least 1 dead neighbour
              : (aliveN > 0     ? 1 : 0);    // dead  edge: at least 1 alive neighbour
          }
        }
      },
    },

    color: {
      name: 'contour:color',
      fn(idx, alive, channels, cols, rows) {
        const e = channels.get('edge')[idx];
        if (alive)  return e ? [100, 240, 255] : [15, 50, 15]; // cyan | dark green
        return      e ? [160,  40, 200] : [10, 10, 18];         // violet | near-black
      },
    },
  },

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

