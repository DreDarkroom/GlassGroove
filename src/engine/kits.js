/* Glass Groove: the character of the three drummers. Plain data. */
export const KIT_NAMES = ['safelight', 'electro', 'minimal', 'rave', 'dnb'];

export const KITS = {
  // soft and round: the default
  safelight: { kick: { f0: 150, f1: 46, sweep: 0.11, decay: 0.45, click: 0.18, sub: 0.25 }, snare: { nf: 1800, nq: 0.9, nd: 0.15, ng: 0.45, tf0: 185, tf1: 140, td: 0.1, tg: 0.35, clap: false, send: 0.18 }, hat: { hp: 7500, cd: 0.04, od: 0.2, g: 0.26, metal: false } },
  // punchy and gated, clap on the snare, metallic hats
  electro: { kick: { f0: 180, f1: 52, sweep: 0.07, decay: 0.32, click: 0.3, sub: 0.12 }, snare: { nf: 2100, nq: 0.8, nd: 0.17, ng: 0.4, tf0: 200, tf1: 160, td: 0.09, tg: 0.3, clap: true, send: 0.15 }, hat: { hp: 7000, cd: 0.035, od: 0.18, g: 0.2, metal: true } },
  // dry and clicky
  minimal: { kick: { f0: 120, f1: 58, sweep: 0.05, decay: 0.22, click: 0.35, sub: 0.1 }, snare: { nf: 3200, nq: 1.6, nd: 0.07, ng: 0.4, tf0: 320, tf1: 260, td: 0.05, tg: 0.25, clap: false, send: 0.08 }, hat: { hp: 9000, cd: 0.022, od: 0.12, g: 0.22, metal: false } },
  // big: long kick, wide snare, open metallic hats
  rave: { kick: { f0: 165, f1: 42, sweep: 0.13, decay: 0.55, click: 0.22, sub: 0.3 }, snare: { nf: 1500, nq: 0.7, nd: 0.26, ng: 0.5, tf0: 175, tf1: 130, td: 0.14, tg: 0.3, clap: true, send: 0.3 }, hat: { hp: 6500, cd: 0.05, od: 0.3, g: 0.24, metal: true } },
  // tight and cracking
  dnb: { kick: { f0: 160, f1: 50, sweep: 0.06, decay: 0.26, click: 0.28, sub: 0.2 }, snare: { nf: 2600, nq: 1, nd: 0.12, ng: 0.5, tf0: 240, tf1: 190, td: 0.08, tg: 0.35, clap: false, send: 0.15 }, hat: { hp: 8500, cd: 0.03, od: 0.12, g: 0.2, metal: false } },
};
