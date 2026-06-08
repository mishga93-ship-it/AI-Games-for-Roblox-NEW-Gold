#!/usr/bin/env node
/**
 * 02-downloader.mjs
 *
 * Downloads all 9 Roblox endorsed vehicle .rbxm files into
 * docs/vehicle-rebuild/templates/. Uses the existing ROBLOX_SERVICE_COOKIE
 * from apps/functions/.env (proven to work in session 373 night research).
 *
 * Output: 9 .rbxm files (~3 MB total). Open any in Studio to inspect.
 *
 * Run from repo root:
 *   node docs/vehicle-rebuild/02-downloader.mjs
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve as resolvePath, dirname, join as pathJoin } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolvePath(__dirname, '..', '..');

const ENDORSED = [
  { name: 'PoliceCar', assetId: 6418230807 },
  { name: 'DuneBuggy', assetId: 6433272094 },
  { name: 'LightUtilityVehicle', assetId: 6418221666 },
  { name: 'PickupTruck', assetId: 6418225759 },
  { name: 'SUV', assetId: 6418234850 },
  { name: 'Sedan', assetId: 6418239833 },
  { name: 'Van', assetId: 6433316269 },
  { name: 'SportsCar', assetId: 6433323089 },
  { name: 'Supercar', assetId: 6433330180 },
];

function loadEnvCookie() {
  const envPath = pathJoin(REPO_ROOT, 'apps/functions/.env.roblox-ai-generator-v2-2-ios');
  if (!existsSync(envPath)) throw new Error(`Env file not found: ${envPath}`);
  const text = readFileSync(envPath, 'utf8');
  const line = text.split('\n').find((l) => l.startsWith('ROBLOX_SERVICE_COOKIE='));
  if (!line) throw new Error('ROBLOX_SERVICE_COOKIE missing from env file');
  return line.slice('ROBLOX_SERVICE_COOKIE='.length).trim();
}

async function downloadOne(assetId, name, outDir, cookie) {
  const url = `https://assetdelivery.roblox.com/v1/asset/?id=${assetId}`;
  const resp = await fetch(url, {
    headers: { Cookie: `.ROBLOSECURITY=${cookie}` },
    redirect: 'follow',
  });
  if (!resp.ok) {
    console.error(`  ✗ ${name}: HTTP ${resp.status}`);
    return false;
  }
  const buf = Buffer.from(await resp.arrayBuffer());
  // assetdelivery returns gzip — Studio expects uncompressed when reading from disk
  // but we save BOTH so user can inspect either way.
  const isGzip = buf[0] === 0x1f && buf[1] === 0x8b;
  let raw = buf;
  if (isGzip) {
    try { raw = gunzipSync(buf); } catch (e) { console.warn(`  ! ${name}: gunzip failed, saving raw`); raw = buf; }
  }
  const outPath = pathJoin(outDir, `${name}-${assetId}.rbxm`);
  writeFileSync(outPath, raw);
  console.log(`  ✓ ${name.padEnd(22)} (${assetId}): ${raw.length} bytes → ${outPath}`);
  return true;
}

async function main() {
  console.log('=== Roblox Endorsed Vehicle Downloader ===\n');
  const cookie = loadEnvCookie();
  const outDir = pathJoin(__dirname, 'templates');
  mkdirSync(outDir, { recursive: true });
  console.log(`Saving to: ${outDir}\n`);
  let ok = 0;
  for (const { name, assetId } of ENDORSED) {
    const success = await downloadOne(assetId, name, outDir, cookie);
    if (success) ok += 1;
  }
  console.log(`\nDone. ${ok}/${ENDORSED.length} templates fetched.`);
  console.log('Open any .rbxm in Studio: File → Open → select file.');
}

main().catch((err) => {
  console.error('FAILED:', err.message);
  process.exit(1);
});
