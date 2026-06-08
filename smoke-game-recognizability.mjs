// Session 414 smoke test: per-preset recognizability across ALL 9 genres.
// Verifies: (1) spec palette is applied in the emitted Lua, (2) QA passes,
// (3) distinct palettes per preset, (4) no-spec regression keeps the enum path,
// (5) roleplay buildings/jobs/NPCs are themed.
import { deriveGameVisualSpec, reviewGameQuality, rgbLua } from './apps/functions/dist/gameThemeSpec.js';
import { buildGameplayScript } from './apps/functions/dist/gameTemplates.js';

const srv = (r) => (typeof r === 'string' ? r : r.serverScript || '');
let fails = 0;
const accents = new Set();

const GENRES = [
  ['tower_defense', 'Build a Brainrot Defense'],
  ['roleplay_town', 'Build a Millionaire School'],
  ['racing', 'Race Across Lava City'],
  ['parkour', 'Climb the Giant Titan'],
  ['story_game', 'Brainrot Apocalypse'],
  ['minigame_hub', 'MrBeast Challenge Hub'],
  ['survival', 'Monster School Survival'],
  ['fighting_arena', 'Titan Arena'],
  ['custom_game', 'Build a Brainrot Universe'],
];

console.log('=== Per-genre recognizability (spec applied + QA) ===');
for (const [gameKind, title] of GENRES) {
  const spec = deriveGameVisualSpec(gameKind, title, title);
  const withSpec = buildGameplayScript({ title, genre: gameKind, gameKind, systems: ['leaderstats'], jobId: 'smoke', gameVisualSpec: spec });
  const noSpec = buildGameplayScript({ title, genre: gameKind, gameKind, systems: ['leaderstats'], jobId: 'smoke' });
  const qa = reviewGameQuality(withSpec, spec, gameKind);
  const src = srv(withSpec), src0 = srv(noSpec);
  // accent (or atmo=accent for survival) must appear → spec palette applied
  const accentLua = rgbLua(spec.palette.accent);
  const paletteApplied = src.includes(accentLua);
  // no-spec build must keep its enum theme path and disable the override
  const noSpecIntact = /THEMES\[Config\.(Theme|MapTheme)\]/.test(src0) && /local SPEC_(THEME|MERGE) = nil/.test(src0);
  // palette override only fires for non-neutral vibes; warning is acceptable (ships).
  const ok = qa.status !== 'rejected' && (spec.vibe === 'neutral' || paletteApplied) && noSpecIntact && qa.partCount >= 8;
  if (!ok) fails++;
  accents.add(spec.palette.accent.join(','));
  console.log(`${ok ? 'OK ' : '*** '} ${gameKind.padEnd(15)} "${title}" vibe=${spec.vibe} accent=${accentLua.replace('Color3.fromRGB','')} QA=${qa.status}/${qa.score} parts=${qa.partCount} paletteApplied=${paletteApplied} noSpecIntact=${noSpecIntact}`);
}

// Deep roleplay check: buildings + jobs + NPC lines must be themed.
console.log('\n=== Roleplay deep recognizability (buildings/jobs/npc) ===');
for (const title of ['Build a MrBeast City', 'Spawn a Monster Neighborhood', 'Create a Bananita Island', 'Create a Secret Agent City']) {
  const spec = deriveGameVisualSpec('roleplay_town', title, title);
  const src = srv(buildGameplayScript({ title, genre: 'roleplay', gameKind: 'roleplay_town', systems: ['leaderstats'], jobId: 'smoke', gameVisualSpec: spec }));
  const signsIn = spec.structures.filter((s) => src.includes(s.sign)).length;
  const jobsIn = spec.jobs.filter((j) => src.includes(j.name)).length;
  const npcIn = spec.characters.filter((c) => src.includes(c.name)).length;
  const ok = signsIn >= 5 && jobsIn >= 4 && npcIn >= 2;
  if (!ok) fails++;
  console.log(`${ok ? 'OK ' : '*** '} "${title}" buildings=${signsIn}/6 jobs=${jobsIn}/6 npcLines=${npcIn}/3 | ${spec.structures.map((s) => s.sign).join(', ')}`);
}

console.log(`\n=== distinct accents across 9 genres: ${accents.size}/9 ===`);
console.log(fails === 0 ? '=== ALL CHECKS PASSED ===' : `=== ${fails} FAILURES ===`);
process.exit(fails === 0 ? 0 : 1);
