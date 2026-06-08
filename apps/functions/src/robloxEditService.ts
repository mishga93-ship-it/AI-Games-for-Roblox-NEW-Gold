// Session 430 (Release 4 wiring): orchestration that ties together the Phase 1-3
// modules into three end-to-end flows. Dependency-INJECTED (analyze / applyEdits /
// runChat are passed in) so it stays decoupled from the worker + provider plumbing
// and is unit-testable with mock deps (see smoke-roblox-edit-service.mjs).
import {
  EDIT_OPS_SYSTEM_PROMPT,
  buildEditOpsUserPrompt,
  parseEditOpsResponse,
  pickScopeHeuristic,
  type DeepAnalysis,
  type PlaceOutline,
  type EditOp,
} from './rbxmEditPipeline.js';
import {
  summarizeGameStructure,
  analyzeGameHeuristics,
  buildGameAnalystPrompt,
  GAME_ANALYST_SYSTEM_PROMPT,
  parseSuggestionsResponse,
  adviseMonetizationHeuristic,
  buildMonetizationPrompt,
  MONETIZATION_SYSTEM_PROMPT,
  parseMonetizationResponse,
  type StructureAnalysisLike,
  type GameStructureSummary,
  type Suggestion,
  type MonetizationPlan,
} from './gameAdvisor.js';

export type EditTarget = 'place' | 'model';

export interface EditServiceDeps {
  analyze: (
    input: Buffer,
    target: EditTarget,
    mode: 'summary' | 'deep' | 'outline',
    scope: string,
  ) => Promise<Record<string, unknown> | null>;
  applyEdits: (
    input: Buffer,
    ops: EditOp[],
    target: EditTarget,
  ) => Promise<{ outputBase64: string; results: unknown } | null>;
  runChat: (system: string, user: string) => Promise<string>;
}

// ── Flow 1: natural-language edit of an existing model/place ──────────────────
export interface EditRequest {
  input: Buffer;
  target: EditTarget;
  request: string;
  /** Optional explicit scope ("ref:N" | "path:/..."); auto-picked for places. */
  scope?: string;
}

export interface EditOutcome {
  outputBase64: string;
  target: EditTarget;
  ops: EditOp[];
  dropped: string[];
  results: unknown;
  scopeUsed: string;
}

export async function orchestrateEdit(req: EditRequest, deps: EditServiceDeps): Promise<EditOutcome> {
  let scope = req.scope ?? '';

  // A whole place is too big for one deep dump: pick a subtree from the outline.
  if (req.target === 'place' && !scope) {
    const outlineRaw = await deps.analyze(req.input, 'place', 'outline', '');
    if (outlineRaw) {
      scope = pickScopeHeuristic(outlineRaw as unknown as PlaceOutline, req.request);
    }
  }

  const deepRaw = await deps.analyze(req.input, req.target, 'deep', scope);
  if (!deepRaw) {
    throw new Error('analyze failed (no Roblox worker available)');
  }
  const analysis = deepRaw as unknown as DeepAnalysis;

  const raw = await deps.runChat(EDIT_OPS_SYSTEM_PROMPT, buildEditOpsUserPrompt(analysis, req.request));
  const { ops, dropped } = parseEditOpsResponse(raw);
  if (ops.length === 0) {
    throw new Error(`No applicable edit-ops produced${dropped.length ? ` (${dropped.length} dropped)` : ''}`);
  }

  const applied = await deps.applyEdits(req.input, ops, req.target);
  if (!applied) {
    throw new Error('apply-edits failed (no Roblox worker available)');
  }

  return {
    outputBase64: applied.outputBase64,
    target: req.target,
    ops,
    dropped,
    results: applied.results,
    scopeUsed: scope,
  };
}

// ── Flow 2: AI Game Analyst ──────────────────────────────────────────────────
export interface AnalystOutcome {
  summary: GameStructureSummary;
  heuristics: Suggestion[];
  suggestions: Suggestion[];
  usedLlm: boolean;
}

export async function orchestrateAnalyst(
  req: { input: Buffer; target: EditTarget; description?: string },
  deps: EditServiceDeps,
): Promise<AnalystOutcome> {
  const deepRaw = await deps.analyze(req.input, req.target, 'deep', '');
  if (!deepRaw) {
    throw new Error('analyze failed (no Roblox worker available)');
  }
  const summary = summarizeGameStructure(deepRaw as StructureAnalysisLike);
  const heuristics = analyzeGameHeuristics(summary);

  let suggestions = heuristics;
  let usedLlm = false;
  try {
    const raw = await deps.runChat(GAME_ANALYST_SYSTEM_PROMPT, buildGameAnalystPrompt(summary, req.description));
    const parsed = parseSuggestionsResponse(raw);
    if (parsed.suggestions.length > 0) {
      suggestions = parsed.suggestions;
      usedLlm = true;
    }
  } catch {
    // LLM is an optional enhancer — heuristics already provide a useful baseline.
  }
  return { summary, heuristics, suggestions, usedLlm };
}

// ── Flow 3: AI Monetization Advisor ──────────────────────────────────────────
export interface MonetizeOutcome {
  summary: GameStructureSummary;
  heuristicPlan: MonetizationPlan;
  plan: MonetizationPlan;
  usedLlm: boolean;
}

export async function orchestrateMonetize(
  req: { input: Buffer; target: EditTarget; genre?: string },
  deps: EditServiceDeps,
): Promise<MonetizeOutcome> {
  const deepRaw = await deps.analyze(req.input, req.target, 'deep', '');
  if (!deepRaw) {
    throw new Error('analyze failed (no Roblox worker available)');
  }
  const summary = summarizeGameStructure(deepRaw as StructureAnalysisLike);
  const heuristicPlan = adviseMonetizationHeuristic(summary, req.genre);

  let plan = heuristicPlan;
  let usedLlm = false;
  try {
    const raw = await deps.runChat(MONETIZATION_SYSTEM_PROMPT, buildMonetizationPrompt(summary, req.genre));
    const parsed = parseMonetizationResponse(raw);
    if (parsed.items.length > 0) {
      plan = parsed;
      usedLlm = true;
    }
  } catch {
    // LLM optional — heuristic plan is a grounded fallback.
  }
  return { summary, heuristicPlan, plan, usedLlm };
}
