# Project instructions

## Name

The project is **Glass Groove** (renamed from Wipelight on 2026-10-05; the file marker is `GlassGroove`, repo `DreDarkroom/GlassGroove`). `src/config.js` holds the name, the slug (still `wipelight`: it is the localStorage and IndexedDB prefix, and changing it would strand saved beats and takes) and the version.
It is a mobile-first rebuild of DreVelopDrop (which grew from DevelopDrop): the audio, sequencer, picture and file-format code is shared in spirit, so a fix there is worth making in all three.
Files from the relatives (`app: "Wipelight"`, `"DreVelopDrop"`, `"SquidgySqueegee"`, `"DevelopDrop"`) must keep loading: `isOurs()` in `src/config.js` decides.
The DJ aliases DreDarkroom, SafeLight and SquidgySqueegee stay separate from the project name. No real names anywhere in the repository.

## Licensing (owner's stance)

Everything is closed (all rights reserved) for now. Welcome feedback, suggestions and requests, and say plainly that reuse and commercial licences are not defined yet while the project is still being tinkered with. Keep the notice subtle (README bottom, small line in Settings > About), never a wall of legalese. Do not add a licence file without the owner's go-ahead.

## Working rules

- Mobile first: design for a 375 px wide screen held in one hand, then add room for wider screens. Nothing tappable under 44 px. Test every change in a phone-sized viewport before a desktop one.
- Words say what a thing does. If a label needs the manual, rename it.
- No build step, no framework: plain ES modules. Engines are factories, never globals; pure logic (`perf/format.js`, `takes/edit.js`, `engine/loopfile.js`, `share.js`) takes no browser APIs so tests can run it.
- Every file or link that comes in is validated before anything changes; a bad one must never half-load.
- A speed-up has to be measured, and the numbers go in the README, including when a measurement was noisy or did not show an effect.
- Keep public files free of private notes. No invented branding, lore or taglines.
- Deploying (push to `main`) needs the owner's go-ahead once the project has users.
- Release routine: bump `version` in `src/config.js`, run `npm run sw` (regenerates `sw.js` with the file list and cache name), run the tests (`npm test`), commit, push, check the live page on a phone-sized viewport.
- Commit messages end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
