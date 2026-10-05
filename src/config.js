/* Wipelight: the few settings a person might change. One place, so a rename is one edit. */
export const CONFIG = {
  version: '0.1.0',
  name: 'Wipelight',
  slug: 'wipelight',
  repoUrl: 'https://github.com/DreDarkroom/Wipelight',
  /** File markers. New files say Wipelight; files from its relatives (DreVelopDrop, DevelopDrop / SquidgySqueegee) still load. */
  app: 'Wipelight',
  legacyApps: ['DreVelopDrop', 'SquidgySqueegee', 'DevelopDrop'],
};

export const isOurs = (doc) => !!doc && (doc.app === CONFIG.app || CONFIG.legacyApps.includes(doc.app));
