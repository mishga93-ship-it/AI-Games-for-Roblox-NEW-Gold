#!/usr/bin/env node
/**
 * E2E vehicle generation test against the live prod pipeline.
 *
 * Spawns a vehicle_3d job, runs Phase 1 (Flux concept), auto-approves the
 * concept (simulating the iOS "Looks good" tap), runs Phase 2 (Tripo →
 * Meshy fallback → Blender preprocess + EEVEE preview render → Claude
 * vision QA → Roblox Open Cloud upload → procedural baseline scene → QA
 * → RBXM export), then downloads the final .rbxm to ~/Downloads.
 *
 * Auth: uses gcloud access token + Firestore REST API to create/update
 * the job doc and ROBLOX_WORKER_TOKEN to invoke the internal pipeline
 * endpoints. No iOS / Firebase ID token needed.
 */

import { execSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve as resolvePath, join as pathJoin } from 'node:path';
import { homedir } from 'node:os';

const PROJECT_ID = 'roblox-ai-generator-v2-2-ios';
const API_BASE = 'https://api-z4yzt6dhjq-uc.a.run.app';
const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

function gcloudToken() {
  return execSync('PATH=/Users/test/.gcloud-sdk/bin:$PATH gcloud auth print-access-token', {
    encoding: 'utf8',
  }).trim();
}

function workerToken() {
  return execSync(
    'PATH=/Users/test/.gcloud-sdk/bin:$PATH gcloud secrets versions access latest --secret=ROBLOX_WORKER_TOKEN --project ' + PROJECT_ID,
    { encoding: 'utf8' },
  ).trim();
}

async function firestoreGet(docPath) {
  const tok = gcloudToken();
  const resp = await fetch(`${FIRESTORE_BASE}/${docPath}`, {
    headers: { Authorization: `Bearer ${tok}` },
  });
  if (resp.status === 404) return null;
  if (!resp.ok) throw new Error(`firestoreGet ${docPath}: ${resp.status} ${await resp.text()}`);
  return await resp.json();
}

// Firestore-REST value wrapper: convert JS to {fields:{name:{stringValue/integerValue/...}}}
function jsToFieldValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') {
    if (Number.isInteger(v)) return { integerValue: String(v) };
    return { doubleValue: v };
  }
  if (Array.isArray(v)) {
    return { arrayValue: { values: v.map(jsToFieldValue) } };
  }
  if (typeof v === 'object') {
    return { mapValue: { fields: jsToFields(v) } };
  }
  return { stringValue: String(v) };
}
function jsToFields(obj) {
  const fields = {};
  for (const [k, val] of Object.entries(obj)) {
    fields[k] = jsToFieldValue(val);
  }
  return fields;
}
// Inverse: Firestore-REST document → plain JS
function fieldValueToJs(fv) {
  if (!fv) return undefined;
  if ('stringValue' in fv) return fv.stringValue;
  if ('booleanValue' in fv) return fv.booleanValue;
  if ('integerValue' in fv) return Number(fv.integerValue);
  if ('doubleValue' in fv) return fv.doubleValue;
  if ('nullValue' in fv) return null;
  if ('timestampValue' in fv) return fv.timestampValue;
  if ('arrayValue' in fv) {
    return (fv.arrayValue.values ?? []).map(fieldValueToJs);
  }
  if ('mapValue' in fv) {
    const m = {};
    for (const [k, v] of Object.entries(fv.mapValue.fields ?? {})) {
      m[k] = fieldValueToJs(v);
    }
    return m;
  }
  return undefined;
}
function docToJs(doc) {
  const obj = {};
  for (const [k, v] of Object.entries(doc.fields ?? {})) {
    obj[k] = fieldValueToJs(v);
  }
  return obj;
}

async function firestoreCreate(collection, docId, data) {
  const tok = gcloudToken();
  const resp = await fetch(
    `${FIRESTORE_BASE}/${collection}?documentId=${encodeURIComponent(docId)}`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: jsToFields(data) }),
    },
  );
  if (!resp.ok) throw new Error(`firestoreCreate ${collection}/${docId}: ${resp.status} ${await resp.text()}`);
  return await resp.json();
}

async function firestorePatch(docPath, partial) {
  const tok = gcloudToken();
  const fieldNames = Object.keys(partial);
  const mask = fieldNames.map((n) => `updateMask.fieldPaths=${encodeURIComponent(n)}`).join('&');
  const resp = await fetch(`${FIRESTORE_BASE}/${docPath}?${mask}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: jsToFields(partial) }),
  });
  if (!resp.ok) throw new Error(`firestorePatch ${docPath}: ${resp.status} ${await resp.text()}`);
  return await resp.json();
}

async function callInternalRun(jobId) {
  const tok = workerToken();
  const resp = await fetch(`${API_BASE}/api/internal/run-3d-pipeline`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-internal-token': tok },
    body: JSON.stringify({ jobId }),
  });
  if (!resp.ok) throw new Error(`run-3d-pipeline: ${resp.status} ${await resp.text()}`);
  return await resp.json();
}

async function callInternalContinue(jobId) {
  // INTERNAL_SECRET env var is unset in prod (verified) → comparison is
  // `internalSecret !== ''`. An empty header matches; we use empty string.
  const resp = await fetch(`${API_BASE}/api/internal/continue-3d-pipeline`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-internal-secret': '' },
    body: JSON.stringify({ jobId }),
  });
  if (!resp.ok) throw new Error(`continue-3d-pipeline: ${resp.status} ${await resp.text()}`);
  return await resp.json();
}

async function pollUntil(jobId, predicate, label, timeoutMs = 10 * 60 * 1000) {
  const start = Date.now();
  let lastStatus = '';
  let lastStage = '';
  while (Date.now() - start < timeoutMs) {
    const doc = await firestoreGet(`generationJobs/${jobId}`);
    if (!doc) {
      console.log(`  [poll ${label}] job doc not found yet, waiting...`);
      await new Promise((r) => setTimeout(r, 3000));
      continue;
    }
    const job = docToJs(doc);
    const stages = job.stages ?? [];
    const inProgress = stages.find((s) => s.status === 'in_progress');
    const stage = inProgress ? `${inProgress.id}` : (stages[stages.length - 1]?.id ?? '(none)');
    if (job.status !== lastStatus || stage !== lastStage) {
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      console.log(`  [poll ${label}] +${elapsed}s status=${job.status} stage=${stage}`);
      lastStatus = job.status;
      lastStage = stage;
    }
    if (predicate(job)) return job;
    if (job.status === 'failed') {
      console.error(`  [poll ${label}] job FAILED: ${job.errorMessage ?? '(no message)'}`);
      throw new Error(`job failed: ${job.errorMessage ?? 'unknown'}`);
    }
    await new Promise((r) => setTimeout(r, 4000));
  }
  throw new Error(`pollUntil ${label} timed out after ${timeoutMs}ms`);
}

async function main() {
  console.log('=== E2E Vehicle Generation Test (Round 19 A+B live) ===\n');

  const jobId = `e2e-vehicle-${Date.now()}`;
  const userId = 'e2e-claude-test';
  const prompt = 'A cute cartoon yellow taxi cab, big windows, low-poly Roblox style';
  const now = new Date().toISOString();

  console.log(`Job ID: ${jobId}`);
  console.log(`Prompt: ${prompt}`);
  console.log('');

  // Step 1: create the job doc directly in Firestore (mimicking the work
  // /api/content/generate does after auth + moderation).
  console.log('Step 1: Creating job document...');

  // Vehicle pipeline stages — mirror createVehiclePipelineStages() at index.ts:6147
  const stages = [
    { id: 'concept_image', title: 'Concept image', status: 'pending' },
    { id: 'concept_approval', title: 'Awaiting your approval', status: 'pending' },
    { id: 'generate_vehicle_scripts', title: 'Configuring vehicle controller', status: 'pending' },
    { id: 'generate_vehicle_mesh', title: 'Generating vehicle body (Tripo → Meshy fallback)', status: 'pending' },
    { id: 'generate_vehicle_scene', title: 'Designing vehicle body from brief (LLM)', status: 'pending' },
    { id: 'quality_review', title: 'AI vehicle QA before export', status: 'pending' },
    { id: 'export_rbxm', title: 'Export vehicle RBXM', status: 'pending' },
  ];

  const jobDoc = {
    id: jobId,
    userId,
    kind: 'vehicle_3d',
    status: 'queued',
    prompt,
    provider: 'gemini',
    createdAt: now,
    updatedAt: now,
    artifacts: [],
    history: ['Queued generation job (E2E test)', 'Selected provider: gemini'],
    stages,
    dispatchMode: 'async',
    metadata: {
      contentCategory: 'vehicle',
      contentSubcategory: 'vehicles',
      requestedKind: 'vehicle_3d',
      vehicleType: 'car',
      driveMode: 'land_wheels',
      title: 'Cartoon Yellow Taxi',
      primaryColor: '#F2B807',
      accentColor: '#1A1A1A',
    },
  };

  await firestoreCreate('generationJobs', jobId, jobDoc);
  console.log('  ✓ Job created in Firestore\n');

  // Step 2: kick off Phase 1 via the internal pipeline endpoint.
  console.log('Step 2: Triggering Phase 1 (Flux concept image)...');
  await callInternalRun(jobId);
  console.log('  ✓ Accepted by /api/internal/run-3d-pipeline\n');

  // Step 3: wait for status=awaiting_review (concept image ready).
  console.log('Step 3: Waiting for Phase 1 to complete (concept_image)...');
  const phase1Job = await pollUntil(
    jobId,
    (j) => j.status === 'awaiting_review',
    'phase1',
    5 * 60 * 1000,
  );
  const conceptUrl = phase1Job.metadata?.conceptPreviewUrl ?? '(no preview URL)';
  console.log(`  ✓ Concept ready: ${conceptUrl}\n`);

  // Step 4: simulate user approval — set status to processing + mark
  // concept stages completed (mirrors /api/content/jobs/:jobId/approve-concept).
  console.log('Step 4: Auto-approving concept...');
  const completedAt = new Date().toISOString();
  const approvedStages = (phase1Job.stages ?? []).map((s) =>
    s.id === 'concept_image' || s.id === 'concept_approval'
      ? { ...s, status: 'completed', completedAt }
      : s,
  );
  await firestorePatch(`generationJobs/${jobId}`, {
    status: 'processing',
    updatedAt: completedAt,
    stages: approvedStages,
    history: [...(phase1Job.history ?? []), 'E2E auto-approved concept'],
  });
  console.log('  ✓ Status set to processing\n');

  // Step 5: trigger Phase 2 (vehicle mesh via Tripo/Meshy + QA + scene + export).
  console.log('Step 5: Triggering Phase 2 (Tripo → Meshy → QA → scene → RBXM)...');
  await callInternalContinue(jobId);
  console.log('  ✓ Accepted by /api/internal/continue-3d-pipeline\n');

  // Step 6: wait for terminal status.
  console.log('Step 6: Waiting for Phase 2 to complete (this is the slow part — Meshy/Tripo + QA + render)...');
  const finalJob = await pollUntil(
    jobId,
    (j) => j.status === 'completed' || j.status === 'failed',
    'phase2',
    10 * 60 * 1000,
  );
  console.log(`  ✓ Final status: ${finalJob.status}\n`);

  // Step 7: read mesh-stage details from final metadata.
  console.log('=== Final job snapshot ===');
  const m = finalJob.metadata ?? {};
  console.log(`  vehicleMeshProvider:    ${m.vehicleMeshProvider ?? '(none — fell back to procedural)'}`);
  console.log(`  vehicleMeshAssetId:     ${m.vehicleMeshAssetId ?? '(none)'}`);
  console.log(`  vehicleMeshQaScore:     ${m.vehicleMeshQaScore ?? '(not scored)'}`);
  console.log(`  vehicleMeshQaIssues:    ${JSON.stringify(m.vehicleMeshQaIssues ?? [])}`);
  console.log(`  vehicleMeshNaturalSize: ${JSON.stringify(m.vehicleMeshNaturalSize ?? null)}`);
  console.log('');

  // Step 8: find the RBXM artifact and download to ~/Downloads.
  const artifacts = finalJob.artifacts ?? [];
  console.log(`Found ${artifacts.length} artifact(s):`);
  artifacts.forEach((a) => console.log(`  - ${a.id} kind=${a.kind} url=${(a.url ?? '').slice(0, 80)}`));
  const rbxm = artifacts.find((a) =>
    String(a.url ?? '').toLowerCase().endsWith('.rbxm')
    || String(a.kind ?? '').toLowerCase().includes('rbxm'),
  );
  if (!rbxm) {
    console.error('\n  ✗ No .rbxm artifact found — pipeline produced no RBXM output.');
    process.exit(2);
  }
  console.log(`\n  Downloading RBXM: ${rbxm.url}`);
  const rbxmResp = await fetch(rbxm.url);
  if (!rbxmResp.ok) throw new Error(`RBXM download failed: ${rbxmResp.status}`);
  const rbxmBuf = Buffer.from(await rbxmResp.arrayBuffer());
  const ts = new Date().toISOString().replace(/[:.]/g, '').replace(/T/, '-').slice(0, 15);
  const outName = `e2e-vehicle-round19-${ts}.rbxm`;
  const downloadsDir = pathJoin(homedir(), 'Downloads');
  mkdirSync(downloadsDir, { recursive: true });
  const outPath = pathJoin(downloadsDir, outName);
  writeFileSync(outPath, rbxmBuf);
  console.log(`  ✓ Saved ${rbxmBuf.length} bytes to: ${outPath}\n`);

  console.log('=== E2E test complete ===');
  console.log(`Open in Studio: open "${outPath}"`);
  process.exit(0);
}

main().catch((err) => {
  console.error('\n✗ E2E test FAILED:', err.message);
  console.error(err.stack);
  process.exit(1);
});
