#!/usr/bin/env node
/**
 * smoke-vehicle-template-router.mjs
 *
 * Deterministic Round 20 acceptance test for the static keyword router.
 * No LLM, no network — pure mapping check.
 */

import { pickVehicleTemplate, ROBLOX_ENDORSED_TEMPLATES, VEHICLE_TEMPLATE_CATALOG } from './apps/functions/dist/vehicleTemplateRouter.js';

const CASES = [
  // [prompt, expectedTemplate, expectedColorContains | null]
  ['yellow taxi cab',           'Sedan',       '#F2B807'],
  ['such a yellow taxi please', 'Sedan',       '#F2B807'],
  ['police car with siren',     'PoliceCar',   '#FFFFFF'],
  ['cop cruiser',               'PoliceCar',   '#FFFFFF'],
  ['fast race car',             'SportsCar',   null],
  ['mustang gt 1968',           'SportsCar',   null],
  ['lamborghini purple',        'Supercar',    null],
  ['ferrari supercar',          'Supercar',    null],
  ['dump truck red',            'PickupTruck', null],
  ['ford f-150 white',          'PickupTruck', null],
  ['minivan family',            'Van',         null],
  ['delivery van',              'Van',         null],
  ['jeep wrangler off-road',    'SUV',         null],
  ['suv black',                 'SUV',         null],
  ['military hummer',           'LightUtilityVehicle', null],
  ['dune buggy sand',           'DuneBuggy',   null],
  ['family sedan',              'Sedan',       null],
  ['just a generic car',        'Sedan',       null],
  ['автобус школьный жёлтый',   'Van',         null],  // bus → Van fallback
  ['какая-то машина',           'Sedan',       null],  // generic ru
];

console.log('=== Vehicle Template Router Smoke ===\n');
console.log(`Catalog: ${ROBLOX_ENDORSED_TEMPLATES.join(', ')}\n`);

let passes = 0, fails = 0;
for (const [prompt, expectedTemplate, expectedColor] of CASES) {
  const pick = pickVehicleTemplate({ prompt });
  const ok = pick.templateName === expectedTemplate
    && (!expectedColor || pick.primaryHex.toUpperCase() === expectedColor.toUpperCase());
  if (ok) {
    passes++;
    console.log(`  PASS  "${prompt}" → ${pick.templateName} (${pick.primaryHex}) [${pick.source}]`);
  } else {
    fails++;
    console.log(`  FAIL  "${prompt}" → expected ${expectedTemplate}${expectedColor ? '/' + expectedColor : ''}, got ${pick.templateName} / ${pick.primaryHex} [${pick.source}: ${pick.reason}]`);
  }
}

// Catalog integrity check
let catalogOk = true;
for (const name of ROBLOX_ENDORSED_TEMPLATES) {
  const cfg = VEHICLE_TEMPLATE_CATALOG[name];
  if (!cfg) { console.log(`  FAIL  catalog missing ${name}`); catalogOk = false; continue; }
  if (!cfg.assetId || cfg.assetId <= 0) { console.log(`  FAIL  ${name} has no assetId`); catalogOk = false; }
  if (!cfg.preferredVariant) { console.log(`  FAIL  ${name} has no preferredVariant`); catalogOk = false; }
  if (!/^#[0-9A-F]{6}$/i.test(cfg.bodyOriginalHex)) { console.log(`  FAIL  ${name} bodyOriginalHex invalid: ${cfg.bodyOriginalHex}`); catalogOk = false; }
}
if (catalogOk) {
  console.log('  PASS  catalog integrity (9 templates, all assetIds + variants + body hex set)');
}

console.log(`\nSMOKE: ${fails === 0 && catalogOk ? 'PASS' : 'FAIL'} (${passes}/${CASES.length} cases passed)`);
process.exit(fails === 0 && catalogOk ? 0 : 1);
