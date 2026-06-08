// Session 417 smoke: Tower Defense deepening across ALL 10 TD presets.
// Verifies per preset: chosen map layout (разные карты), enemy silhouette kind,
// themed boss name, themed base landmark, the 4th Frost tower, co-op scaling,
// and — the user's key requirement — that the meme face is WRAPPED on the enemy
// body (SurfaceGui) and NOT a floating face billboard.
import { deriveGameVisualSpec } from './apps/functions/dist/gameThemeSpec.js';
import { buildGameplayScript } from './apps/functions/dist/gameTemplates.js';

const srv = (r) => (typeof r === 'string' ? r : r.serverScript || '');
const cli = (r) => (r && r.additionalScripts && r.additionalScripts[0] && r.additionalScripts[0].source) || '';
let fails = 0;
const mapKeys = new Set();

// title, expected kind, expected boss substring, a landmark part name, hasFaceDecal
const PRESETS = [
  ['Build a Brainrot Defense',     'meme',        'Bombardiro Crocodilo', 'Fountain',   true],
  ['Defend Against Prototype',     'toy',         'The Prototype',        'HandLogo',   false],
  ['Build a FNAF Defense',         'animatronic', 'Springtrap',           'Freddy',     false],
  ['Create a Titan War TD',        'titan',       'Titan Cameraman',      'HQTower',    false],
  ['Generate a 99 Nights Defense', 'wolf',        'Deer Monster',         'CampEmbers', false],
  ['Build a Tralalero Defense',    'meme',        'Tralalero Tralala',    'Surfboard',  true],
  ['Create a Bananita Defense',    'fruit',       'Bananita Dolfinita',   'HutRoof',    false],
  ['Generate an Orangutini TD',    'fruit',       'Orangutini',           'Throne',     false],
  ['Build a Monster School TD',    'voxel',       'Herobrine',            'Chalkboard', false],
  ['Defend MrBeast Island',        'challenger',  'Money Monster',        'VaultBox',   false],
];

console.log('=== TD per-preset deepening (map / kind / boss / landmark / face / frost / coop) ===');
for (const [title, expKind, expBoss, landmark, hasFace] of PRESETS) {
  const spec = deriveGameVisualSpec('tower_defense', title, title);
  const r = buildGameplayScript({ title, genre: 'tower_defense', gameKind: 'tower_defense', systems: ['leaderstats'], jobId: 'smoke', gameVisualSpec: spec });
  const s = srv(r), c = cli(r);

  const mapKey = (s.match(/local MAP_KEY = "([^"]+)"/) || [])[1] || '?';
  mapKeys.add(mapKey);
  const kind = (s.match(/local ENEMY_KIND = "([^"]+)"/) || [])[1] || '?';
  const lanes = s.includes('local LANES = {');
  const bossOk = s.includes(expBoss);
  const landmarkOk = s.includes(`"${landmark}`) || s.includes(landmark);
  const assembly = s.includes('spawnEnemyAssembly');
  // KEY: face wrapped on body (SurfaceGui) and NO floating enemy face billboard.
  const noFloatFace = !s.includes('efb') && !/BillboardGui[^\n]*efi/.test(s);
  // Face is wrapped on the body via SurfaceGui (_eFace), and the roster carries a
  // real non-zero decal id (emitted as `face=<id>` Lua, concatenated at runtime).
  const faceWrapped = !hasFace || (s.includes('SurfaceGui') && s.includes('_eFace') && /face=[1-9]\d{4,}/.test(s));
  const frostSrv = /frost = \{/.test(s);
  const frostCli = c.includes('Frost $160');
  const coop = s.includes('coopScale') && c.includes('Co-op');
  const bossBroadcast = s.includes('kind="boss"');
  const tiers = s.includes('TowerTier_') && s.includes('MAX_TOWER_LEVEL');

  const ok = kind === expKind && lanes && bossOk && landmarkOk && assembly && noFloatFace
    && faceWrapped && frostSrv && frostCli && coop && bossBroadcast && tiers;
  if (!ok) fails++;
  console.log(`${ok ? 'OK ' : '***'} ${title.padEnd(30)} map=${mapKey.padEnd(10)} kind=${kind.padEnd(11)}(exp ${expKind}) boss=${bossOk?'Y':'N'} landmark=${landmarkOk?'Y':'N'} face=${faceWrapped?'wrap':'FLOAT?'} noFloat=${noFloatFace?'Y':'N'} frost=${frostSrv&&frostCli?'Y':'N'} coop=${coop?'Y':'N'} tiers=${tiers?'Y':'N'}`);
}

// разные карты: assert the 10 presets are spread across multiple layouts.
console.log(`\n=== map variety: ${mapKeys.size} distinct layouts used: ${[...mapKeys].join(', ')} ===`);
if (mapKeys.size < 3) { fails++; console.log('*** too few distinct maps (<3)'); }

// no-spec regression: tower_defense still builds a valid playable.
const ns = srv(buildGameplayScript({ title: 'Plain TD', genre: 'tower_defense', gameKind: 'tower_defense', systems: ['leaderstats'], jobId: 'smoke' }));
const nsOk = ns.includes('local LANES = {') && ns.includes('spawnEnemyAssembly') && /frost = \{/.test(ns);
if (!nsOk) fails++;
console.log(`\n=== no-spec TD intact: ${nsOk ? 'OK' : '*** FAIL'} ===`);

console.log(fails === 0 ? '\n=== ALL CHECKS PASSED ===' : `\n=== ${fails} FAILURES ===`);
process.exit(fails === 0 ? 0 : 1);
