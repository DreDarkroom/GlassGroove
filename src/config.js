/* Glass Groove: the few settings a person might change. One place, so a rename is one edit. */
export const CONFIG = {
  version: '0.2.1',
  name: 'Glass Groove',
  slug: 'wipelight',                                       // stays 'wipelight': it is the storage and database prefix, and changing it would strand people's saved beats and takes
  repoUrl: 'https://github.com/DreDarkroom/GlassGroove',
  pagesUrl: 'https://dredarkroom.github.io/GlassGroove/',
  /** Feedback goes to this ntfy topic (a push to the owner's phone). Anyone who reads this file could post to it, so nothing here may be treated as trusted. */
  feedbackTopic: 'glassgroove-fb-kw0ofz6geo83rn',
  /** File markers. New files say GlassGroove; files from its relatives (DreVelopDrop, DevelopDrop / SquidgySqueegee) still load. */
  app: 'GlassGroove',
  legacyApps: ['Wipelight', 'DreVelopDrop', 'SquidgySqueegee', 'DevelopDrop'],
};

export const isOurs = (doc) => !!doc && (doc.app === CONFIG.app || CONFIG.legacyApps.includes(doc.app));
