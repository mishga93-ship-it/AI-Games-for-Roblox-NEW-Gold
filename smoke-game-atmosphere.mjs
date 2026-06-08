// Session 414b smoke: verify atmosphere (night/dusk/day) + 99 Nights campfire.
import { deriveGameVisualSpec } from './apps/functions/dist/gameThemeSpec.js';
import { buildGameplayScript } from './apps/functions/dist/gameTemplates.js';
const srv = (r) => (typeof r === 'string' ? r : r.serverScript || '');
const build = (gameKind, title) => {
  const spec = deriveGameVisualSpec(gameKind, title, title);
  return { spec, src: srv(buildGameplayScript({ title, genre: gameKind, gameKind, systems: ['leaderstats'], jobId: 'x', gameVisualSpec: spec })) };
};
let fails = 0;

{
  const { spec, src } = build('tower_defense', 'Generate a 99 Nights Defense');
  const night = src.includes('clockTime = 0,') && src.includes('brightness = 0.55');
  const campfire = src.includes('CampEmbers') && src.includes('Instance.new("Fire")');
  const pine = src.includes('makeTree(world, p, 0.9, "pine"');
  const ok = spec.vibe === 'night' && night && campfire && pine;
  if (!ok) fails++;
  console.log(`TD "99 Nights": vibe=${spec.vibe} night=${night} campfire=${campfire} pine=${pine} ${ok ? 'OK' : '*** FAIL'}`);
}

for (const [gk, title, mood] of [['racing', 'Race Across Lava City', 'dusk'], ['parkour', 'Climb the Giant Titan', 'night'], ['fighting_arena', 'Titan Arena', 'night'], ['minigame_hub', 'MrBeast Challenge Hub', 'day'], ['roleplay_town', 'Spawn a Monster Neighborhood', 'night']]) {
  const { spec, src } = build(gk, title);
  const hasAtmo = /clockTime = /.test(src);
  const moodOk = spec.atmosphere.mood === mood;
  const ok = hasAtmo && moodOk;
  if (!ok) fails++;
  console.log(`${gk.padEnd(15)} "${title}" vibe=${spec.vibe} mood=${spec.atmosphere.mood}(exp ${mood}) clock=${spec.atmosphere.clockTime} ${ok ? 'OK' : '*** FAIL'}`);
}

{
  const src = srv(buildGameplayScript({ title: 'Plain TD', genre: 'tower_defense', gameKind: 'tower_defense', systems: ['leaderstats'], jobId: 'x' }));
  const ok = src.includes('theme.accent:Lerp(Color3.fromRGB(205, 205, 210), 0.6)') && !src.includes('CampEmbers');
  if (!ok) fails++;
  console.log(`NO-SPEC TD regression: ${ok ? 'OK (original atmosphere, no campfire)' : '*** FAIL'}`);
}

console.log(fails === 0 ? '=== ALL PASSED ===' : `=== ${fails} FAILED ===`);
process.exit(fails === 0 ? 0 : 1);
