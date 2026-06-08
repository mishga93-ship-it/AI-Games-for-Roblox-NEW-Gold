#!/usr/bin/env node
/**
 * smoke-vehicle-batch-8types.mjs — Round 20H "all-types validation"
 *
 * Spawns 8 vehicle_3d jobs in parallel (one per non-taxi endorsed
 * template), runs the full Phase 1 + Phase 2 pipeline for each, then
 * downloads every resulting .rbxm into ~/Downloads/round-20H-<type>.rbxm
 * for the user to open and visually verify.
 *
 * Each generation costs ~$0.10-0.15 (4 Flux decals + Roblox uploads).
 * Total: ~$0.80-1.20.
 *
 * Auth: same gcloud + Firestore REST + worker token pattern as the
 * single-job smoke-vehicle-e2e.mjs.
 */

import { execSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve as resolvePath, join as pathJoin } from 'node:path';
import { homedir } from 'node:os';

const PROJECT_ID = 'roblox-ai-generator-v2-2-ios';
const API_BASE = 'https://api-z4yzt6dhjq-uc.a.run.app';
const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

const PROMPTS = [
  { id: 'police',    prompt: 'A police cruiser, black and white with sirens',                   title: 'City Police Cruiser',     primary: '#1A1A1A', accent: '#FFFFFF' },
  { id: 'firetruck', prompt: 'A red fire truck pickup with white stripes',                      title: 'Fire Truck',              primary: '#C8102E', accent: '#FFFFFF' },
  { id: 'sportscar', prompt: 'A red sports car with racing stripes and number 42',              title: 'Race Sports Car',          primary: '#E03A2E', accent: '#FFFFFF' },
  { id: 'supercar',  prompt: 'A green lamborghini supercar, exotic',                            title: 'Green Lambo',              primary: '#00FF00', accent: '#1A1A1A' },
  { id: 'suv',       prompt: 'A black SUV jeep with off-road tires',                            title: 'Black SUV',                primary: '#1A1A1A', accent: '#C4C3C6' },
  { id: 'pickup',    prompt: 'A blue pickup truck Ford F-150',                                  title: 'Blue Ford F-150',          primary: '#0989CF', accent: '#FFFFFF' },
  { id: 'van',       prompt: 'A white delivery van with company logo',                          title: 'Delivery Van',             primary: '#FFFFFF', accent: '#1A1A1A' },
  { id: 'dunebuggy', prompt: 'An orange dune buggy ATV for sand racing',                        title: 'Sand Buggy',               primary: '#FF6600', accent: '#1A1A1A' },
];

function gcloudToken() {
  return execSync('PATH=/Users/test/.gcloud-sdk/bin:$PATH gcloud auth print-access-token', { encoding: 'utf8' }).trim();
}
function workerToken() {
  return execSync(
    'PATH=/Users/test/.gcloud-sdk/bin:$PATH gcloud secrets versions access latest --secret=ROBLOX_WORKER_TOKEN --project ' + PROJECT_ID,
    { encoding: 'utf8' },
  ).trim();
}

function jsToFieldValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') {
    if (Number.isInteger(v)) return { integerValue: String(v) };
    return { doubleValue: v };
  }
  if (Array.isArray(v)) return { arrayValue: { values: v.map(jsToFieldValue) } };
  if (typeof v === 'object') return { mapValue: { fields: jsToFields(v) } };
  return { stringValue: String(v) };
}
function jsToFields(obj) {
  const fields = {};
  for (const [k, val] of Object.entries(obj)) fields[k] = jsToFieldValue(val);
  return fields;
}
function fieldValueToJs(fv) {
  if (!fv) return undefined;
  if ('stringValue' in fv) return fv.stringValue;
  if ('booleanValue' in fv) return fv.booleanValue;
  if ('integerValue' in fv) return Number(fv.integerValue);
  if ('doubleValue' in fv) return fv.doubleValue;
  if ('nullValue' in fv) return null;
  if ('timestampValue' in fv) return fv.timestampValue;
  if ('arrayValue' in fv) return (fv.arrayValue.values ?? []).map(fieldValueToJs);
  if ('mapValue' in fv) {
    const m = {};
    for (const [k, v] of Object.entries(fv.mapValue.fields ?? {})) m[k] = fieldValueToJs(v);
    return m;
  }
  return undefined;
}
function docToJs(doc) {
  const obj = {};
  for (const [k, v] of Object.entries(doc.fields ?? {})) obj[k] = fieldValueToJs(v);
  return obj;
}

async function firestoreGet(path) {
  const tok = gcloudToken();
  const resp = await fetch(`${FIRESTORE_BASE}/${path}`, { headers: { Authorization: `Bearer ${tok}` } });
  if (resp.status === 404) return null;
  if (!resp.ok) throw new Error(`firestoreGet ${path}: ${resp.status}`);
  return await resp.json();
}
async function firestoreCreate(collection, id, data) {
  const tok = gcloudToken();
  const resp = await fetch(`${FIRESTORE_BASE}/${collection}?documentId=${encodeURIComponent(id)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: jsToFields(data) }),
  });
  if (!resp.ok) throw new Error(`create ${id}: ${resp.status} ${await resp.text()}`);
  return await resp.json();
}
async function firestorePatch(path, partial) {
  const tok = gcloudToken();
  const mask = Object.keys(partial).map((n) => `updateMask.fieldPaths=${encodeURIComponent(n)}`).join('&');
  const resp = await fetch(`${FIRESTORE_BASE}/${path}?${mask}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: jsToFields(partial) }),
  });
  if (!resp.ok) throw new Error(`patch ${path}: ${resp.status}`);
  return await resp.json();
}
async function callInternalRun(jobId) {
  const tok = workerToken();
  const resp = await fetch(`${API_BASE}/api/internal/run-3d-pipeline`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-internal-token': tok },
    body: JSON.stringify({ jobId }),
  });
  if (!resp.ok) throw new Error(`run-3d: ${resp.status}`);
  return await resp.json();
}
async function callInternalContinue(jobId) {
  const resp = await fetch(`${API_BASE}/api/internal/continue-3d-pipeline`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-internal-secret': '' },
    body: JSON.stringify({ jobId }),
  });
  if (!resp.ok) throw new Error(`continue-3d: ${resp.status}`);
  return await resp.json();
}
async function pollUntil(jobId, predicate, label, timeoutMs = 8 * 60 * 1000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const doc = await firestoreGet(`generationJobs/${jobId}`);
    if (doc) {
      const job = docToJs(doc);
      if (predicate(job)) return job;
      if (job.status === 'failed') throw new Error(`${label} failed: ${job.errorMessage ?? '?'}`);
    }
    await new Promise((r) => setTimeout(r, 4000));
  }
  throw new Error(`${label} timed out`);
}
function predicateAwaitingReview(j) { return j.status === 'awaiting_review'; }
function predicateAllStagesDone(j) {
  const stages = j.stages ?? [];
  if (stages.length === 0) return false;
  return stages.every((s) => s.status === 'completed' || s.status === 'skipped' || s.status === 'failed');
}

async function runOneVehicle(spec) {
  const jobId = `batch-${spec.id}-${Date.now()}`;
  const now = new Date().toISOString();
  console.log(`[${spec.id}] creating job ${jobId}`);
  const stages = [
    { id: 'concept_image', title: 'Concept image', status: 'pending' },
    { id: 'concept_approval', title: 'Awaiting your approval', status: 'pending' },
    { id: 'generate_vehicle_scripts', title: 'Configuring vehicle controller', status: 'pending' },
    { id: 'pick_vehicle_template', title: 'Selecting Roblox vehicle template', status: 'pending' },
    { id: 'generate_vehicle_decals', title: 'Generating vehicle livery decals (Flux)', status: 'pending' },
    { id: 'generate_vehicle_mesh', title: 'Generating vehicle body (Meshy 6)', status: 'pending' },
    { id: 'generate_vehicle_scene', title: 'Designing vehicle body from brief (LLM)', status: 'pending' },
    { id: 'quality_review', title: 'AI vehicle QA before export', status: 'pending' },
    { id: 'export_rbxm', title: 'Export vehicle RBXM', status: 'pending' },
  ];
  const jobDoc = {
    id: jobId,
    userId: 'batch-claude-test',
    kind: 'vehicle_3d',
    status: 'queued',
    prompt: spec.prompt,
    provider: 'gemini',
    createdAt: now,
    updatedAt: now,
    artifacts: [],
    history: ['Queued batch vehicle gen'],
    stages,
    dispatchMode: 'async',
    metadata: {
      contentCategory: 'vehicle',
      contentSubcategory: 'vehicles',
      requestedKind: 'vehicle_3d',
      vehicleType: 'car',
      driveMode: 'land_wheels',
      title: spec.title,
      primaryColor: spec.primary,
      accentColor: spec.accent,
    },
  };
  await firestoreCreate('generationJobs', jobId, jobDoc);
  await callInternalRun(jobId);
  console.log(`[${spec.id}] phase 1 started`);
  const phase1 = await pollUntil(jobId, predicateAwaitingReview, `${spec.id} phase1`, 4 * 60 * 1000);
  console.log(`[${spec.id}] phase 1 done, approving + continuing`);
  const completedAt = new Date().toISOString();
  const approvedStages = (phase1.stages ?? []).map((s) =>
    s.id === 'concept_image' || s.id === 'concept_approval'
      ? { ...s, status: 'completed', completedAt }
      : s,
  );
  await firestorePatch(`generationJobs/${jobId}`, {
    status: 'processing',
    updatedAt: completedAt,
    stages: approvedStages,
    history: [...(phase1.history ?? []), 'batch auto-approved'],
  });
  await callInternalContinue(jobId);
  console.log(`[${spec.id}] phase 2 started`);
  const finalJob = await pollUntil(jobId, predicateAllStagesDone, `${spec.id} phase2`, 8 * 60 * 1000);
  const rbxm = (finalJob.artifacts ?? []).find((a) => String(a.url ?? '').toLowerCase().endsWith('.rbxm') || String(a.extension ?? '').toLowerCase() === 'rbxm');
  if (!rbxm) {
    console.error(`[${spec.id}] no rbxm artifact!`);
    return null;
  }
  const resp = await fetch(rbxm.url);
  const buf = Buffer.from(await resp.arrayBuffer());
  const outPath = pathJoin(homedir(), 'Downloads', `round-20H-${spec.id}.rbxm`);
  writeFileSync(outPath, buf);
  console.log(`[${spec.id}] ✓ ${buf.length} bytes → ${outPath}`);
  const m = finalJob.metadata ?? {};
  return {
    id: spec.id,
    file: outPath,
    template: m.vehicleTemplateName,
    decals: {
      door: m.vehicleDecalDoorAssetId,
      hood: m.vehicleDecalHoodAssetId,
      trunk: m.vehicleDecalTrunkAssetId,
      roofSign: m.vehicleDecalRoofSignAssetId,
    },
    roofSignText: m.vehicleTemplateRoofSignText,
  };
}

async function main() {
  console.log(`=== Batch ${PROMPTS.length} vehicle types ===\n`);
  const results = await Promise.allSettled(PROMPTS.map(runOneVehicle));
  console.log('\n=== Summary ===');
  for (const [i, r] of results.entries()) {
    const spec = PROMPTS[i];
    if (r.status === 'fulfilled' && r.value) {
      console.log(`  ${spec.id.padEnd(12)} OK template=${r.value.template} roofSign=${r.value.roofSignText ?? '-'} decals(door/hood/trunk/sign)=${r.value.decals.door ?? '-'}/${r.value.decals.hood ?? '-'}/${r.value.decals.trunk ?? '-'}/${r.value.decals.roofSign ?? '-'}`);
    } else {
      console.log(`  ${spec.id.padEnd(12)} FAIL ${r.reason ?? r.value}`);
    }
  }
}
main().catch((err) => { console.error(err); process.exit(1); });
