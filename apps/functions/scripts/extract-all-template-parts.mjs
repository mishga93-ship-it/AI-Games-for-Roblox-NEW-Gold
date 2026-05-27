#!/usr/bin/env node
// Session 383: pre-extract visible body parts from every bundled vehicle
// template .rbxm so the backend can attach an interactive 3D preview to
// each vehicle job without spawning Lune at request time.
//
// Output: apps/functions/templates/<name>.parts.json next to each .rbxm.
//
// Run once locally (or when a template .rbxm changes):
//   node apps/functions/scripts/extract-all-template-parts.mjs
//
// Requires: .local-tools/lune/lune (already installed for build_roblox).
import { execSync } from 'node:child_process';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, statSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../../..'); // → repo root
const LUNE = resolve(ROOT, '.local-tools/lune/lune');
const EXTRACTOR = resolve(ROOT, 'apps/worker-service/runtime/lune/extract_template_visual_parts.luau');
const TEMPLATES_DIR = resolve(ROOT, 'apps/functions/templates');

// Catalog mirrors vehicleTemplateRouter.ts.
// Keeping it inlined here avoids needing to import compiled .js from this script.
const CATALOG = [
  { file: 'Sedan-6418239833.rbxm',                variant: 'Sedan (white)' },
  { file: 'SportsCar-6433323089.rbxm',            variant: 'Sports Car (white)' },
  { file: 'Supercar-6433330180.rbxm',             variant: 'Supercar (yellow)' },
  { file: 'SUV-6418234850.rbxm',                  variant: 'SUV (white)' },
  { file: 'PickupTruck-6418225759.rbxm',          variant: 'Pickup Truck (white)' },
  { file: 'Van-6433316269.rbxm',                  variant: 'Van (white)' },
  { file: 'DuneBuggy-6433272094.rbxm',            variant: 'Dune Buggy (beige)' },
  { file: 'LightUtilityVehicle-6418221666.rbxm',  variant: 'Light Utility Vehicle (black)' },
  { file: 'PoliceCar-6418230807.rbxm',            variant: 'Police Car' },
  { file: 'Motorcycle-17388481396.rbxm',          variant: 'Dirt bike.' },
  { file: 'Boat-30309891.rbxm',                   variant: 'Model' },
  { file: 'Phenom100-PlaneKit.rbxm',              variant: 'Embraer Phenom 100' },
  { file: 'Tank-101512952.rbxm',                  variant: 'DrivableTank' },
];

if (!existsSync(LUNE)) {
  console.error(`Lune not found at ${LUNE}. Install via: bash scripts/install-lune.sh`);
  process.exit(1);
}

let ok = 0, fail = 0;
for (const { file, variant } of CATALOG) {
  const rbxmPath = resolve(TEMPLATES_DIR, file);
  const jsonPath = resolve(TEMPLATES_DIR, `${file}.parts.json`);
  if (!existsSync(rbxmPath)) {
    console.warn(`  ✗ template missing: ${file}`);
    fail++;
    continue;
  }
  try {
    execSync(`"${LUNE}" run "${EXTRACTOR}" "${rbxmPath}" "${variant}" "${jsonPath}" 80`, {
      stdio: 'inherit',
    });
    const stat = statSync(jsonPath);
    console.log(`  ✓ ${file} → ${basename(jsonPath)} (${stat.size} bytes)`);
    ok++;
  } catch (err) {
    console.error(`  ✗ ${file} (variant "${variant}"): ${err.message ?? err}`);
    fail++;
  }
}
console.log(`\nDone: ${ok} ok, ${fail} failed (of ${CATALOG.length} templates).`);
