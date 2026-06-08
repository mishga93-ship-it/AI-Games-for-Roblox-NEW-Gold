// Session 427 (Release 4 / Phase 1): edit-ops contract + LLM prompt + worker
// glue for editing an EXISTING Roblox model/place (.rbxm/.rbxl) by natural
// language. Pairs with the worker Lune scripts:
//   - analyze_roblox.luau --deep  -> DeepAnalysis (stable `ref` per instance)
//   - apply_edits.luau            -> consumes EditOp[] addressed by `ref`
//
// This module is intentionally SELF-CONTAINED (no imports from index.ts /
// robloxWorker.ts) so it compiles and ships independently while those files are
// under parallel edits. Route wiring is the next step (see changelog-427).

// ── Edit-op contract (must match apply_edits.luau op shapes) ─────────────────
export type EditOp =
  | { op: 'setProperties'; ref: number; properties: Record<string, unknown> }
  | { op: 'setScriptSource'; ref: number; source: string }
  | { op: 'rename'; ref: number; name: string }
  | { op: 'delete'; ref: number }
  | {
      op: 'addInstance';
      parentRef: number;
      className: string;
      name: string;
      properties?: Record<string, unknown>;
    };

export interface EditOpsDoc {
  ops: EditOp[];
}

// ── Deep-analysis shape (subset of analyze_roblox.luau --deep output) ────────
export interface DeepAnalysisNode {
  ref: number;
  parentRef?: number | null;
  name: string;
  className: string;
  path: string;
  childCount?: number;
  props?: Record<string, unknown>;
  source?: string;
  sourceTruncated?: boolean;
}

export interface DeepAnalysis {
  target: 'place' | 'model';
  totalInstances: number;
  mode?: string;
  tree?: DeepAnalysisNode[];
  classCounts?: Record<string, number>;
  truncated?: { tree?: boolean; source?: boolean };
}

// ── Property JSON convention (mirror of build_roblox/apply_edits coercion) ────
// These helpers let callers/tests construct property values without hand-writing
// the __type tags the Lune side expects.
export const prop = {
  vector3: (x: number, y: number, z: number) => ({ __type: 'Vector3', x, y, z }),
  color3: (r: number, g: number, b: number) => ({ __type: 'Color3', r, g, b }),
  /** rgb is 0-255; converted to Color3's 0-1 floats. */
  rgb255: (r: number, g: number, b: number) => ({ __type: 'Color3', r: r / 255, g: g / 255, b: b / 255 }),
  enumValue: (enumType: string, enumName: string) => ({ __type: 'Enum', enumType, enumName }),
  cframe: (x: number, y: number, z: number, rotation?: number[]) => ({
    __type: 'CFrame',
    position: { x, y, z },
    ...(rotation ? { rotation } : {}),
  }),
} as const;

// ── Compact structure view for the model (token-bounded) ─────────────────────
const DEFAULT_MAX_NODES = 400;
const DEFAULT_MAX_SOURCE_CHARS = 1200;

function shortJson(value: unknown, max = 240): string {
  let s: string;
  try {
    s = JSON.stringify(value);
  } catch {
    s = String(value);
  }
  if (s.length > max) {
    s = `${s.slice(0, max)}…`;
  }
  return s;
}

/**
 * Render a compact, line-per-instance view the LLM can target by `ref`.
 * Long script sources are excerpted; props are stringified+capped. This is the
 * grounding the model reads before it proposes edit-ops.
 */
export function summarizeForPrompt(
  analysis: DeepAnalysis,
  opts?: { maxNodes?: number; maxSourceChars?: number },
): string {
  const maxNodes = opts?.maxNodes ?? DEFAULT_MAX_NODES;
  const maxSourceChars = opts?.maxSourceChars ?? DEFAULT_MAX_SOURCE_CHARS;
  const tree = analysis.tree ?? [];
  const lines: string[] = [];

  lines.push(`# Target: ${analysis.target} — ${analysis.totalInstances} instances`);
  if (analysis.classCounts) {
    const top = Object.entries(analysis.classCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([k, v]) => `${k}×${v}`)
      .join(', ');
    lines.push(`# Class counts: ${top}`);
  }
  if (analysis.truncated?.tree) {
    lines.push('# NOTE: instance tree truncated — only the first slice is shown.');
  }
  lines.push('# Instances (ref | path [ClassName] :: props/source):');

  for (const node of tree.slice(0, maxNodes)) {
    let line = `${node.ref} | ${node.path} [${node.className}]`;
    if (node.props && Object.keys(node.props).length > 0) {
      line += ` :: ${shortJson(node.props)}`;
    }
    if (typeof node.source === 'string') {
      const src = node.source.length > maxSourceChars
        ? `${node.source.slice(0, maxSourceChars)}… (${node.source.length} chars)`
        : node.source;
      line += `\n    <source>\n${src}\n    </source>`;
    }
    lines.push(line);
  }
  if (tree.length > maxNodes) {
    lines.push(`# … ${tree.length - maxNodes} more instances omitted.`);
  }
  return lines.join('\n');
}

// ── Prompt ───────────────────────────────────────────────────────────────────
export const EDIT_OPS_SYSTEM_PROMPT = [
  'You edit an EXISTING Roblox model/place by emitting a JSON list of edit-ops.',
  'You are given the current instance tree, each line prefixed by a numeric `ref`.',
  'Address every edit by that exact `ref`. Never invent refs that are not listed.',
  '',
  'Output ONLY a JSON object: {"ops":[ ... ]} — no prose, no markdown fences.',
  'Allowed ops:',
  '  {"op":"setProperties","ref":N,"properties":{...}}',
  '  {"op":"setScriptSource","ref":N,"source":"<full new Lua source>"}',
  '  {"op":"rename","ref":N,"name":"NewName"}',
  '  {"op":"delete","ref":N}',
  '  {"op":"addInstance","parentRef":N,"className":"Part","name":"X","properties":{...}}',
  '',
  'Property values use these tagged forms:',
  '  Vector3: {"__type":"Vector3","x":..,"y":..,"z":..}',
  '  Color3 : {"__type":"Color3","r":0..1,"g":0..1,"b":0..1}',
  '  CFrame : {"__type":"CFrame","position":{"x":..,"y":..,"z":..},"rotation":[9 numbers]}',
  '  Enum   : {"__type":"Enum","enumType":"Material","enumName":"Neon"}',
  '  Content (MeshId/TextureID/Texture/Image/SoundId): a plain string.',
  '  Plain numbers/booleans/strings are passed through as-is.',
  '',
  'Rules:',
  '  - Make the SMALLEST set of ops that satisfies the request. Do not touch unrelated instances.',
  '  - For setScriptSource, return the COMPLETE rewritten script, not a diff.',
  '  - Prefer setProperties over delete+addInstance when an instance already exists.',
  '  - If the request cannot be done with the listed instances, return {"ops":[]}.',
].join('\n');

export function buildEditOpsUserPrompt(analysis: DeepAnalysis, userRequest: string): string {
  return [
    'CURRENT STRUCTURE:',
    summarizeForPrompt(analysis),
    '',
    'USER REQUEST:',
    userRequest.trim(),
    '',
    'Return {"ops":[...]} now.',
  ].join('\n');
}

// ── Response parsing / validation ────────────────────────────────────────────
function stripFences(raw: string): string {
  const trimmed = raw.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (fence ? fence[1] : trimmed).trim();
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Parse + validate an LLM response into a clean EditOp[]. Invalid ops are
 * dropped (collected in `dropped`) rather than throwing, so one malformed op
 * does not sink the whole batch. Throws only if no array can be found at all.
 */
export function parseEditOpsResponse(raw: string): { ops: EditOp[]; dropped: string[] } {
  const text = stripFences(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new Error(`edit-ops response is not valid JSON: ${err instanceof Error ? err.message : String(err)}`);
  }

  const rawOps: unknown = Array.isArray(parsed)
    ? parsed
    : isRecord(parsed) && Array.isArray(parsed.ops)
      ? parsed.ops
      : null;
  if (!Array.isArray(rawOps)) {
    throw new Error('edit-ops response has no ops[] array');
  }

  const ops: EditOp[] = [];
  const dropped: string[] = [];

  for (let i = 0; i < rawOps.length; i++) {
    const o = rawOps[i];
    if (!isRecord(o) || typeof o.op !== 'string') {
      dropped.push(`#${i}: not an op object`);
      continue;
    }
    const refOk = typeof o.ref === 'number' && Number.isFinite(o.ref);
    switch (o.op) {
      case 'setProperties':
        if (refOk && isRecord(o.properties)) {
          ops.push({ op: 'setProperties', ref: o.ref as number, properties: o.properties });
        } else {
          dropped.push(`#${i}: setProperties needs ref + properties{}`);
        }
        break;
      case 'setScriptSource':
        if (refOk && typeof o.source === 'string') {
          ops.push({ op: 'setScriptSource', ref: o.ref as number, source: o.source });
        } else {
          dropped.push(`#${i}: setScriptSource needs ref + source`);
        }
        break;
      case 'rename':
        if (refOk && typeof o.name === 'string' && o.name.trim()) {
          ops.push({ op: 'rename', ref: o.ref as number, name: o.name });
        } else {
          dropped.push(`#${i}: rename needs ref + name`);
        }
        break;
      case 'delete':
        if (refOk) {
          ops.push({ op: 'delete', ref: o.ref as number });
        } else {
          dropped.push(`#${i}: delete needs ref`);
        }
        break;
      case 'addInstance':
        if (
          typeof o.parentRef === 'number' &&
          Number.isFinite(o.parentRef) &&
          typeof o.className === 'string' &&
          o.className.trim() &&
          typeof o.name === 'string' &&
          o.name.trim()
        ) {
          ops.push({
            op: 'addInstance',
            parentRef: o.parentRef,
            className: o.className,
            name: o.name,
            ...(isRecord(o.properties) ? { properties: o.properties } : {}),
          });
        } else {
          dropped.push(`#${i}: addInstance needs parentRef + className + name`);
        }
        break;
      default:
        dropped.push(`#${i}: unknown op "${o.op}"`);
    }
  }

  return { ops, dropped };
}

// ── Worker glue (self-contained; uses global fetch) ──────────────────────────
export interface ApplyEditsWorkerResult {
  outputBase64: string;
  target: 'place' | 'model';
  results: { applied?: number; failed?: number; total?: number; results?: unknown[] };
}

/**
 * Call the worker /apply-edits endpoint. Kept dependency-free so this module can
 * be imported before the rest of the backend is wired up.
 */
export async function applyEditsViaWorker(args: {
  workerUrl: string;
  workerToken?: string;
  inputBase64: string;
  ops: EditOp[];
  target: 'place' | 'model';
}): Promise<ApplyEditsWorkerResult> {
  const url = `${args.workerUrl.replace(/\/$/, '')}/apply-edits`;
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (args.workerToken) {
    headers.authorization = `Bearer ${args.workerToken}`;
  }
  const resp = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ inputBase64: args.inputBase64, ops: args.ops, target: args.target }),
  });
  if (!resp.ok) {
    const detail = await resp.text().catch(() => '');
    throw new Error(`apply-edits worker call failed (${resp.status}): ${detail.slice(0, 300)}`);
  }
  return (await resp.json()) as ApplyEditsWorkerResult;
}
