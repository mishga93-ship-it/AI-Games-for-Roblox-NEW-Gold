// Smoke for vehicle color inference: feed brief-style titles/prompts and verify
// that inferred primary/accent flows through to the manifest body parts.
import { buildRobloxManifest } from './apps/functions/dist/robloxWorker.js';

function hexToRgb(hex) {
  const m = /^#?([a-f0-9]{6})$/i.exec(hex);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
}

function colorOf(manifest, name) {
  const p = manifest.scene.find((n) => n.name === name);
  return p?.properties?.Color ?? null;
}

function buildWithMetadata(meta) {
  return buildRobloxManifest({
    title: meta.title || 'Smoke Car',
    summary: 'color smoke',
    target: 'model',
    prompt: meta.prompt || meta.title || '',
    starterScript: '-- s',
    metadata: {
      requestedKind: 'vehicle_3d',
      vehicleType: 'car',
      contentCategory: 'vehicle',
      contentSubcategory: 'vehicles',
      ...meta,
    },
  });
}

function approx(a, b, eps = 0.04) {
  return a !== null && b !== null && Math.abs(a.r - b.r) < eps && Math.abs(a.g - b.g) < eps && Math.abs(a.b - b.b) < eps;
}

let fails = 0;

// Test 1: explicit primaryColor/accentColor in metadata bypass inference
const t1 = buildWithMetadata({ title: 'Whatever', primaryColor: '#2E7DD7', accentColor: '#F2F4F7' });
const body1 = colorOf(t1, 'FamilyCarBodyShell');
const cabin1 = colorOf(t1, 'FamilyCarCabinShell');
const blueExp = hexToRgb('#2E7DD7');
const whiteExp = hexToRgb('#F2F4F7');
console.log(`T1 explicit metadata blue+white:`);
console.log(`  body  = ${JSON.stringify(body1)} expected ~blue ${JSON.stringify(blueExp)}`);
console.log(`  cabin = ${JSON.stringify(cabin1)} expected ~white ${JSON.stringify(whiteExp)}`);
if (!approx(body1, blueExp))  { console.log('  FAIL — body not blue'); fails++; } else console.log('  PASS body blue');
if (!approx(cabin1, whiteExp)) { console.log('  FAIL — cabin not white'); fails++; } else console.log('  PASS cabin white');

// Test 2: default (no color metadata) → red+dark default car palette (existing)
const t2 = buildWithMetadata({ title: 'Plain Car' });
const body2 = colorOf(t2, 'FamilyCarBodyShell');
const cabin2 = colorOf(t2, 'FamilyCarCabinShell');
console.log(`\nT2 plain (no colors) default car palette:`);
console.log(`  body  = ${JSON.stringify(body2)} (expected red 0.88,0.10,0.12)`);
console.log(`  cabin = ${JSON.stringify(cabin2)} (expected dark)`);
const redDef = { r: 0.88, g: 0.10, b: 0.12 };
const darkDef = { r: 0.04, g: 0.045, b: 0.05 };
if (!approx(body2, redDef))  { console.log('  FAIL — default body not red'); fails++; } else console.log('  PASS default body red');
if (!approx(cabin2, darkDef)) { console.log('  FAIL — default cabin not dark'); fails++; } else console.log('  PASS default cabin dark');

if (fails === 0) { console.log('\nSMOKE manifest-color-flow: PASS'); }
else { console.log(`\nSMOKE: ${fails} FAILURE(S)`); process.exit(1); }

// Test 3: inference smoke — but this requires the index.ts code path that lives
// in the worker pipeline. We can't easily call it from here without bootstrapping
// the full job system. Instead, port the inference logic in JS and verify it
// returns the expected hexes.

const vrx = (en, ru) => {
  const enPart = `(?<![A-Za-z0-9])(?:${en})(?![A-Za-z0-9])`;
  const ruPart = ru ? `(?<![\\u0400-\\u04FF])(?:${ru})` : '';
  return new RegExp(ruPart ? `${enPart}|${ruPart}` : enPart, 'iu');
};

const VEHICLE_COLOR_HEX = [
  { rx: vrx('white',          'бел'),                                      hex: '#F2F4F7', isWhite: true },
  { rx: vrx('black',          'ч[её]рн|темн|тёмн(?!о[\\s-]*син)'),         hex: '#15161A', isBlack: true },
  { rx: vrx('silver|chrome|metallic', 'серебр|хром|металлик'),             hex: '#B8BCC2' },
  { rx: vrx('grey|gray',      'сер[аоыйыую]'),                             hex: '#5A5F66' },
  { rx: vrx('red',            'красн|алый|алая'),                          hex: '#E03A2E' },
  { rx: vrx('orange',         'оранж'),                                    hex: '#F08A1C' },
  { rx: vrx('yellow',         'ж[её]лт'),                                  hex: '#F5C32C' },
  { rx: vrx('green',          'зел[её]н'),                                 hex: '#3CB561' },
  { rx: vrx('blue',           'син[ийяьее]|голуб'),                        hex: '#2E7DD7' },
  { rx: vrx('navy',           'т[её]мно[\\s-]*син'),                       hex: '#1B3A6B' },
  { rx: vrx('cyan|teal',      'бирюзов'),                                  hex: '#26B0B0' },
  { rx: vrx('purple|violet',  'фиолет|сирен'),                             hex: '#8E44C2' },
  { rx: vrx('pink|magenta',   'розов'),                                    hex: '#E84CA8' },
  { rx: vrx('brown|tan',      'коричнев'),                                 hex: '#7A4A2B' },
  { rx: vrx('gold|golden',    'золот'),                                    hex: '#D4AF37' },
];

function inferVehicleColors(prompt) {
  const p = (prompt || '').toLowerCase();
  if (vrx('police|cop[\\s-]?car', 'полицейск|полиция').test(p))            return { primary: '#2E7DD7', accent: '#F2F4F7' };
  if (vrx('taxi', 'такси').test(p))                                        return { primary: '#F5C32C', accent: '#15161A' };
  if (vrx('school[\\s-]?bus', 'школьн').test(p) && /bus|автобус/iu.test(p)) return { primary: '#F5C32C', accent: '#15161A' };
  if (vrx('fire[\\s-]?truck', 'пожарн').test(p))                           return { primary: '#E03A2E', accent: '#F2F4F7' };
  const hits = [];
  for (const e of VEHICLE_COLOR_HEX) {
    const m = e.rx.exec(p);
    if (m) hits.push({ ...e, index: m.index });
  }
  hits.sort((a, b) => a.index - b.index);
  const distinct = [];
  for (const h of hits) {
    if (!distinct.some((x) => x.hex === h.hex)) distinct.push(h);
    if (distinct.length === 2) break;
  }
  if (distinct.length === 0) return {};
  const pri = distinct[0]; const acc = distinct[1];
  let accent = acc?.hex ?? (pri.isWhite ? '#15161A' : pri.isBlack ? '#B8BCC2' : '#15161A');
  return { primary: pri.hex, accent };
}

const cases = [
  { input: 'Blue and White Cartoon Low-Poly 4-Seat Arcade Car', expect: { primary: '#2E7DD7', accent: '#F2F4F7' } },
  { input: 'красная машина', expect: { primary: '#E03A2E', accent: '#15161A' } },
  { input: 'green pickup with black wheels', expect: { primary: '#3CB561', accent: '#15161A' } },
  { input: 'police car', expect: { primary: '#2E7DD7', accent: '#F2F4F7' } },
  { input: 'yellow taxi', expect: { primary: '#F5C32C', accent: '#15161A' } },
  { input: 'жёлтый школьный автобус', expect: { primary: '#F5C32C', accent: '#15161A' } },
  { input: 'fire truck', expect: { primary: '#E03A2E', accent: '#F2F4F7' } },
  { input: 'sport car', expect: {} },
  { input: 'pink sedan with white roof', expect: { primary: '#E84CA8', accent: '#F2F4F7' } },
];

console.log('\n--- Inference unit tests ---');
let infFails = 0;
for (const c of cases) {
  const r = inferVehicleColors(c.input);
  const ok = (r.primary === c.expect.primary) && ((c.expect.accent === undefined && r.accent === undefined) || (r.accent === c.expect.accent));
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  '${c.input}' -> ${JSON.stringify(r)} (expect ${JSON.stringify(c.expect)})`);
  if (!ok) infFails++;
}
if (infFails > 0) { console.log(`\nINFERENCE: ${infFails} FAILURES`); process.exit(1); }
console.log('\nSMOKE colors: PASS');
