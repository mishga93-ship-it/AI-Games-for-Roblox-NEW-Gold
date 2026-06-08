// Session 429 (Release 4 / Phase 3): advisors that sit ON TOP of the structure
// dump produced by analyze_roblox.luau (Phases 1-2). Three features:
//   1. Starter Template Library  — curated starting points the user then refines.
//   2. AI Game Analyst           — retention/economy/social/monetization review.
//   3. AI Monetization Advisor   — gamepass / dev-product / pricing plan.
//
// Each feature is a HYBRID: a deterministic heuristic baseline (fully testable,
// useful even with no LLM) plus a prompt that lets an LLM expand it. The module
// is SELF-CONTAINED (no project imports) so it ships independently of the routes,
// which are still under parallel edits (see changelog-427/428/429).
//
// Monetization numbers are grounded in 2026 Roblox best practice:
//   - Game Pass = permanent one-time unlock; Developer Product = repeatable buy.
//   - Sweet spot 49-199 R$ for volume; impulse 50-100; premium VIP 500-1500.
//   - Never below 25 R$.

// ── Minimal input shape (subset of analyze --deep / --outline output) ─────────
export interface AnalyzedInstance {
  className: string;
  name?: string;
  source?: string;
}

export interface StructureAnalysisLike {
  target?: string;
  totalInstances?: number;
  classCounts?: Record<string, number>;
  tree?: AnalyzedInstance[]; // deep: carries `source`
  outline?: AnalyzedInstance[]; // outline: no source
}

// ── Structure summary (the bridge from raw dump -> actionable signals) ────────
export interface GameStructureSignals {
  hasScripts: boolean;
  hasSpawnLocation: boolean;
  hasLeaderstats: boolean;
  hasDataStore: boolean;
  hasMarketplace: boolean;
  hasGamepassCheck: boolean;
  hasDevProduct: boolean;
  hasBadgeService: boolean;
  hasTeleport: boolean;
  hasRemoteEvents: boolean;
  hasProximityPrompt: boolean;
  hasShop: boolean;
  hasKillBrick: boolean;
}

export interface GameStructureSummary {
  totalInstances: number;
  classCounts: Record<string, number>;
  scriptCount: number;
  npcCount: number;
  signals: GameStructureSignals;
}

function collectInstances(analysis: StructureAnalysisLike): AnalyzedInstance[] {
  if (Array.isArray(analysis.tree) && analysis.tree.length > 0) {
    return analysis.tree;
  }
  if (Array.isArray(analysis.outline)) {
    return analysis.outline;
  }
  return [];
}

/** Turn a raw analyze dump into monetization/retention signals. */
export function summarizeGameStructure(analysis: StructureAnalysisLike): GameStructureSummary {
  const classCounts = analysis.classCounts ?? {};
  const instances = collectInstances(analysis);

  let scriptCount = 0;
  const sources: string[] = [];
  const names: string[] = [];
  for (const inst of instances) {
    if (typeof inst.name === 'string') {
      names.push(inst.name.toLowerCase());
    }
    if (inst.className === 'Script' || inst.className === 'LocalScript' || inst.className === 'ModuleScript') {
      scriptCount += 1;
    }
    if (typeof inst.source === 'string') {
      sources.push(inst.source);
    }
  }
  // Fall back to classCounts for script count when only an outline was given.
  if (scriptCount === 0) {
    scriptCount = (classCounts.Script ?? 0) + (classCounts.LocalScript ?? 0) + (classCounts.ModuleScript ?? 0);
  }

  const src = sources.join('\n').toLowerCase();
  const nameBlob = names.join(' ');
  const has = (needle: string) => src.includes(needle.toLowerCase());

  const classPresent = (cls: string) => (classCounts[cls] ?? 0) > 0 || instances.some((i) => i.className === cls);

  const signals: GameStructureSignals = {
    hasScripts: scriptCount > 0,
    hasSpawnLocation: classPresent('SpawnLocation'),
    hasLeaderstats: nameBlob.includes('leaderstats') || has('leaderstats'),
    hasDataStore: has('datastoreservice') || has('getdatastore'),
    hasMarketplace: has('marketplaceservice') || has('promptgamepasspurchase') || has('promptpurchase'),
    hasGamepassCheck: has('userownsgamepassasync') || has('userownsgamepass'),
    hasDevProduct: has('processreceipt') || has('promptproductpurchase'),
    hasBadgeService: has('badgeservice') || has('awardbadge'),
    hasTeleport: has('teleportservice') || classPresent('TeleportData'),
    hasRemoteEvents: classPresent('RemoteEvent') || classPresent('RemoteFunction') || has('remoteevent'),
    hasProximityPrompt: classPresent('ProximityPrompt') || has('proximityprompt'),
    hasShop: nameBlob.includes('shop') || nameBlob.includes('store') || has('shop'),
    hasKillBrick: has('humanoid.health = 0') || has('humanoid.health=0') || has(':takedamage') || has('.died'),
  };

  // Humanoid count ≈ NPCs (no live players in a static place file).
  const npcCount = classCounts.Humanoid ?? instances.filter((i) => i.className === 'Humanoid').length;

  return {
    totalInstances: analysis.totalInstances ?? instances.length,
    classCounts,
    scriptCount,
    npcCount,
    signals,
  };
}

// ── 1. Starter Template Library ───────────────────────────────────────────────
export interface StarterTemplate {
  id: string;
  title: string;
  genre: string;
  summary: string;
  tags: string[];
  /** Suggested starting monetization (names only; advisor fills pricing). */
  suggestedGamepasses: string[];
  suggestedDevProducts: string[];
}

export const STARTER_TEMPLATES: StarterTemplate[] = [
  {
    id: 'obby_starter',
    title: 'Obby Starter',
    genre: 'obby',
    summary: 'Linear obstacle course with checkpoints, a spawn, and a win pad. Refine stages and theme via AI.',
    tags: ['obby', 'parkour', 'checkpoints', 'beginner'],
    suggestedGamepasses: ['VIP Trail', 'Double Coins'],
    suggestedDevProducts: ['Skip Stage'],
  },
  {
    id: 'tycoon_starter',
    title: 'Tycoon Starter',
    genre: 'tycoon',
    summary: 'Claimable plot with droppers, a cash collector, and a buy-button progression loop.',
    tags: ['tycoon', 'economy', 'progression'],
    suggestedGamepasses: ['2x Money', 'Auto-Builder'],
    suggestedDevProducts: ['Cash Boost'],
  },
  {
    id: 'rpg_starter',
    title: 'RPG Starter',
    genre: 'rpg',
    summary: 'Hub town with a quest giver NPC, a shop, leaderstats (Gold/Level), and basic combat.',
    tags: ['rpg', 'quests', 'npc', 'combat'],
    suggestedGamepasses: ['VIP', '+Inventory Slots'],
    suggestedDevProducts: ['Gold Pack', 'Revive'],
  },
  {
    id: 'simulator_starter',
    title: 'Simulator Starter',
    genre: 'simulator',
    summary: 'Click/collect loop with leaderstats currency, a rebirth system, and a pet/upgrade shop.',
    tags: ['simulator', 'grind', 'rebirth', 'pets'],
    suggestedGamepasses: ['VIP', '2x Currency'],
    suggestedDevProducts: ['Currency Pack', 'Auto-Collect'],
  },
];

export function listStarterTemplates(genre?: string): StarterTemplate[] {
  if (!genre) {
    return STARTER_TEMPLATES;
  }
  const g = genre.toLowerCase();
  return STARTER_TEMPLATES.filter((t) => t.genre === g || t.tags.includes(g));
}

export function getStarterTemplate(id: string): StarterTemplate | undefined {
  return STARTER_TEMPLATES.find((t) => t.id === id);
}

// ── 2. AI Game Analyst ────────────────────────────────────────────────────────
export type SuggestionCategory = 'retention' | 'economy' | 'social' | 'monetization' | 'content' | 'structure';
export type Severity = 'high' | 'medium' | 'low';

export interface Suggestion {
  category: SuggestionCategory;
  severity: Severity;
  title: string;
  detail: string;
}

const SUGGESTION_CATEGORIES: SuggestionCategory[] = ['retention', 'economy', 'social', 'monetization', 'content', 'structure'];
const SEVERITIES: Severity[] = ['high', 'medium', 'low'];

/** Deterministic review of a game's structure. Useful with or without an LLM. */
export function analyzeGameHeuristics(summary: GameStructureSummary): Suggestion[] {
  const s = summary.signals;
  const out: Suggestion[] = [];
  const add = (category: SuggestionCategory, severity: Severity, title: string, detail: string) =>
    out.push({ category, severity, title, detail });

  if (!s.hasScripts) {
    add('structure', 'high', 'No scripts found', 'The place has no Script/LocalScript/ModuleScript — it has no behavior. Add core gameplay scripts.');
  }
  if (!s.hasSpawnLocation) {
    add('structure', 'high', 'No SpawnLocation', 'Players may not spawn reliably. Add a SpawnLocation (and a Lobby/respawn flow).');
  }
  if (!s.hasDataStore) {
    add('retention', 'high', 'No data persistence', 'No DataStoreService usage detected — player progress resets every session. Persist leaderstats/inventory with DataStore (and a session-lock to avoid data loss).');
  }
  if (!s.hasLeaderstats) {
    add('economy', 'medium', 'No leaderstats', 'No leaderstats detected. Add a leaderstats Folder (e.g., Cash/Wins/Level) to give players visible, comparable progression.');
  }
  if (!s.hasMarketplace && !s.hasGamepassCheck && !s.hasDevProduct) {
    add('monetization', 'high', 'No monetization surface', 'No GamePass or DeveloperProduct calls found. Add at least one permanent gamepass and one repeatable developer product (see the Monetization Advisor).');
  } else if (!s.hasDevProduct) {
    add('monetization', 'medium', 'No repeatable purchases', 'Gamepasses give one-time revenue. Add a developer product (currency pack / boost) for recurring spend.');
  }
  if (s.hasKillBrick && !s.hasDataStore) {
    add('retention', 'medium', 'Death without checkpoints/saves', 'Kill mechanics found but no persistence — players lose progress and churn. Pair with checkpoints and DataStore saves.');
  }
  if (summary.npcCount === 0) {
    add('content', 'low', 'No NPCs', 'No Humanoid NPCs. Quest givers / shopkeepers add life and a natural monetization surface.');
  }
  if (!s.hasBadgeService) {
    add('social', 'low', 'No badges', 'No BadgeService usage. Award a "first join" and milestone badges — badges boost retention and shareability.');
  }
  if (!s.hasTeleport && summary.totalInstances > 400) {
    add('structure', 'low', 'Single-place world', 'Large single place and no TeleportService. Consider splitting hubs/levels into teleport-linked places for performance and matchmaking.');
  }
  return out;
}

export const GAME_ANALYST_SYSTEM_PROMPT = [
  'You are a senior Roblox game designer reviewing an existing experience.',
  'You are given a structure summary + a deterministic heuristic findings list.',
  'Expand into concrete, prioritized improvements across: retention, economy, social, monetization, content, structure.',
  'Each suggestion must be ACTIONABLE (what to add/change), not generic advice.',
  'Output ONLY JSON: {"suggestions":[{"category","severity","title","detail"}]}.',
  '  category ∈ retention|economy|social|monetization|content|structure',
  '  severity ∈ high|medium|low',
  'Keep titles short; put the "how" in detail. Do not repeat identical heuristic items verbatim — refine them.',
].join('\n');

function formatSignals(summary: GameStructureSummary): string {
  const s = summary.signals;
  const yn = (b: boolean) => (b ? 'yes' : 'NO');
  return [
    `instances=${summary.totalInstances} scripts=${summary.scriptCount} npcs=${summary.npcCount}`,
    `spawn=${yn(s.hasSpawnLocation)} leaderstats=${yn(s.hasLeaderstats)} dataStore=${yn(s.hasDataStore)}`,
    `marketplace=${yn(s.hasMarketplace)} gamepassCheck=${yn(s.hasGamepassCheck)} devProduct=${yn(s.hasDevProduct)}`,
    `badges=${yn(s.hasBadgeService)} teleport=${yn(s.hasTeleport)} remotes=${yn(s.hasRemoteEvents)}`,
    `proximityPrompt=${yn(s.hasProximityPrompt)} shop=${yn(s.hasShop)} killBrick=${yn(s.hasKillBrick)}`,
  ].join('\n');
}

export function buildGameAnalystPrompt(summary: GameStructureSummary, userDescription?: string): string {
  const heuristics = analyzeGameHeuristics(summary)
    .map((h) => `- [${h.severity}/${h.category}] ${h.title}: ${h.detail}`)
    .join('\n');
  return [
    'STRUCTURE SUMMARY:',
    formatSignals(summary),
    '',
    'HEURISTIC FINDINGS (baseline — refine & extend these):',
    heuristics || '(none)',
    ...(userDescription && userDescription.trim()
      ? ['', 'CREATOR DESCRIPTION / GOALS:', userDescription.trim()]
      : []),
    '',
    'Return {"suggestions":[...]} now.',
  ].join('\n');
}

// ── 3. AI Monetization Advisor ────────────────────────────────────────────────
export type MonetizationKind = 'gamepass' | 'devproduct';

export interface MonetizationItem {
  kind: MonetizationKind;
  name: string;
  priceRobux: number;
  rationale: string;
}

export interface MonetizationPlan {
  items: MonetizationItem[];
  notes: string[];
}

const PRICE_MIN = 25;
const PRICE_MAX = 1500;
function clampPrice(n: number): number {
  if (!Number.isFinite(n)) {
    return PRICE_MIN;
  }
  return Math.max(PRICE_MIN, Math.min(PRICE_MAX, Math.round(n)));
}

interface GenreMonetization {
  gamepasses: Array<{ name: string; price: number; rationale: string }>;
  devproducts: Array<{ name: string; price: number; rationale: string }>;
}

const GENRE_MONETIZATION: Record<string, GenreMonetization> = {
  simulator: {
    gamepasses: [
      { name: 'VIP', price: 499, rationale: 'Permanent perks (2x luck, exclusive area) — long-term value drives retention.' },
      { name: '2x Currency', price: 199, rationale: 'Core grind accelerator; sweet-spot price for high-volume sales.' },
    ],
    devproducts: [
      { name: 'Currency Pack (Small)', price: 49, rationale: 'Repeatable currency top-up; impulse priced.' },
      { name: 'Auto-Collect (1h)', price: 35, rationale: 'Consumable convenience for active sessions.' },
    ],
  },
  tycoon: {
    gamepasses: [
      { name: '2x Money', price: 199, rationale: 'Speeds the core dropper loop; classic tycoon best-seller.' },
      { name: 'Auto-Builder', price: 299, rationale: 'Removes tedium for engaged players willing to pay more.' },
    ],
    devproducts: [
      { name: 'Cash Boost', price: 49, rationale: 'Repeatable cash injection to unblock the next purchase.' },
    ],
  },
  obby: {
    gamepasses: [
      { name: 'VIP Trail', price: 99, rationale: 'Cosmetic flex, impulse-priced; visible to others = social proof.' },
      { name: 'Double Coins', price: 149, rationale: 'Rewards the coin loop without pay-to-win.' },
    ],
    devproducts: [
      { name: 'Skip Stage', price: 35, rationale: 'Repeatable rescue on hard stages; reduces rage-quit churn.' },
    ],
  },
  rpg: {
    gamepasses: [
      { name: 'VIP', price: 499, rationale: 'Permanent XP/loot boost + zone access; premium long-term value.' },
      { name: '+Inventory Slots', price: 149, rationale: 'Quality-of-life unlock that scales with playtime.' },
    ],
    devproducts: [
      { name: 'Gold Pack', price: 99, rationale: 'Repeatable currency for gear/consumables.' },
      { name: 'Revive', price: 35, rationale: 'Consumable in combat; recurring spend during boss fights.' },
    ],
  },
  'tower defense': {
    gamepasses: [
      { name: '2x Coins', price: 199, rationale: 'Accelerates tower unlocks; core economy multiplier.' },
      { name: 'Premium Towers', price: 399, rationale: 'Permanent access to exclusive towers; collector appeal.' },
    ],
    devproducts: [
      { name: 'Extra Lives', price: 35, rationale: 'Consumable to survive a wave; recurring spend on hard maps.' },
    ],
  },
};

const DEFAULT_MONETIZATION: GenreMonetization = {
  gamepasses: [{ name: 'VIP', price: 199, rationale: 'Permanent perks bundle; sweet-spot price for broad appeal.' }],
  devproducts: [{ name: 'Currency Pack', price: 49, rationale: 'Repeatable soft-currency top-up; impulse priced.' }],
};

/** Deterministic monetization plan by genre + structure signals. */
export function adviseMonetizationHeuristic(summary: GameStructureSummary, genre?: string): MonetizationPlan {
  const key = (genre ?? '').toLowerCase().trim();
  const base = GENRE_MONETIZATION[key] ?? DEFAULT_MONETIZATION;
  const items: MonetizationItem[] = [];
  for (const g of base.gamepasses) {
    items.push({ kind: 'gamepass', name: g.name, priceRobux: clampPrice(g.price), rationale: g.rationale });
  }
  for (const d of base.devproducts) {
    items.push({ kind: 'devproduct', name: d.name, priceRobux: clampPrice(d.price), rationale: d.rationale });
  }

  const notes: string[] = [];
  notes.push('Pricing: gamepass sweet spot 49–199 R$ for volume; premium/VIP 500–1500 R$; never below 25 R$.');
  notes.push('Game Pass = permanent one-time unlock. Developer Product = repeatable purchase (currency/boosts).');
  if (!summary.signals.hasLeaderstats) {
    notes.push('Add a leaderstats currency BEFORE selling currency packs — players need to see what they are buying.');
  }
  if (!summary.signals.hasDataStore) {
    notes.push('CRITICAL: persist purchases with DataStore — without it, gamepass perks/currency reset each session and players will refund/churn.');
  }
  if (summary.signals.hasShop) {
    notes.push('You already have a shop surface — wire these developer products into the existing shop UI.');
  }
  notes.push('Consider a recurring subscription (70% first month / 100% renewals) once you have a stable engaged base.');
  return { items, notes };
}

export const MONETIZATION_SYSTEM_PROMPT = [
  'You are a Roblox monetization strategist.',
  'Given a structure summary + genre + a heuristic baseline plan, produce a concrete monetization plan.',
  'Rules grounded in 2026 best practice:',
  '  - Game Pass = permanent one-time unlock. Developer Product = repeatable purchase.',
  '  - Prices in Robux: sweet spot 49–199 for volume, premium/VIP 500–1500, NEVER below 25.',
  '  - Avoid pay-to-win that breaks competitive fairness; prefer convenience + cosmetics + boosts.',
  'Output ONLY JSON: {"items":[{"kind","name","priceRobux","rationale"}],"notes":[string]}.',
  '  kind ∈ gamepass|devproduct',
].join('\n');

export function buildMonetizationPrompt(summary: GameStructureSummary, genre?: string): string {
  const plan = adviseMonetizationHeuristic(summary, genre);
  const baseline = plan.items
    .map((i) => `- [${i.kind}] ${i.name} @ ${i.priceRobux} R$ — ${i.rationale}`)
    .join('\n');
  return [
    `GENRE: ${genre || 'unknown'}`,
    '',
    'STRUCTURE SUMMARY:',
    formatSignals(summary),
    '',
    'HEURISTIC BASELINE PLAN (refine & extend):',
    baseline,
    '',
    'Return {"items":[...],"notes":[...]} now.',
  ].join('\n');
}

// ── Shared response parsing ──────────────────────────────────────────────────
function stripFences(raw: string): string {
  const trimmed = raw.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (fence ? fence[1] : trimmed).trim();
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function parseSuggestionsResponse(raw: string): { suggestions: Suggestion[]; dropped: string[] } {
  const text = stripFences(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new Error(`analyst response is not valid JSON: ${err instanceof Error ? err.message : String(err)}`);
  }
  const rawList: unknown = Array.isArray(parsed)
    ? parsed
    : isRecord(parsed) && Array.isArray(parsed.suggestions)
      ? parsed.suggestions
      : null;
  if (!Array.isArray(rawList)) {
    throw new Error('analyst response has no suggestions[] array');
  }
  const suggestions: Suggestion[] = [];
  const dropped: string[] = [];
  for (let i = 0; i < rawList.length; i++) {
    const o = rawList[i];
    if (
      isRecord(o) &&
      typeof o.category === 'string' &&
      (SUGGESTION_CATEGORIES as string[]).includes(o.category) &&
      typeof o.severity === 'string' &&
      (SEVERITIES as string[]).includes(o.severity) &&
      typeof o.title === 'string' &&
      o.title.trim() &&
      typeof o.detail === 'string'
    ) {
      suggestions.push({
        category: o.category as SuggestionCategory,
        severity: o.severity as Severity,
        title: o.title,
        detail: o.detail,
      });
    } else {
      dropped.push(`#${i}: invalid suggestion (need category/severity/title/detail)`);
    }
  }
  return { suggestions, dropped };
}

export function parseMonetizationResponse(raw: string): MonetizationPlan {
  const text = stripFences(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new Error(`monetization response is not valid JSON: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (!isRecord(parsed)) {
    throw new Error('monetization response is not an object');
  }
  const rawItems = Array.isArray(parsed.items) ? parsed.items : [];
  const items: MonetizationItem[] = [];
  for (const o of rawItems) {
    if (
      isRecord(o) &&
      (o.kind === 'gamepass' || o.kind === 'devproduct') &&
      typeof o.name === 'string' &&
      o.name.trim()
    ) {
      const price = typeof o.priceRobux === 'number' ? o.priceRobux : Number(o.priceRobux);
      items.push({
        kind: o.kind,
        name: o.name,
        priceRobux: clampPrice(price),
        rationale: typeof o.rationale === 'string' ? o.rationale : '',
      });
    }
  }
  const notes = Array.isArray(parsed.notes)
    ? parsed.notes.filter((n): n is string => typeof n === 'string')
    : [];
  return { items, notes };
}
