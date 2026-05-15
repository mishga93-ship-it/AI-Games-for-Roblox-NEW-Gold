import { logger } from 'firebase-functions';
import type { GenerationKind, RobloxBuildManifest, RobloxBuildSceneNode } from './types.js';
import { runChatProvider } from './providers.js';

type AcceptanceTarget = 'npc' | 'game' | 'asset' | 'script' | 'unknown';
type AcceptanceSeverity = 'pass' | 'warning' | 'fail';

export interface GenerationAcceptanceCriteria {
  version: 1;
  target: AcceptanceTarget;
  mustHave: string[];
  requiredVisualCues: string[];
  requiredAccessoryKeys: string[];
  requiredBehaviorCues: string[];
  rejectIf: string[];
  apifySignals: string[];
  source: 'deterministic_v1';
}

export interface GenerationAcceptanceIssue {
  code: string;
  message: string;
  severity: AcceptanceSeverity;
  expected?: string;
  actual?: string;
}

export interface GenerationAcceptanceAnalysis {
  version: 1;
  passed: boolean;
  target: AcceptanceTarget;
  summary: string;
  issues: GenerationAcceptanceIssue[];
  facts: {
    sceneCount: number;
    scriptCount: number;
    classNames: Record<string, number>;
    matched: string[];
    missing: string[];
    apifySignals: string[];
  };
}

export interface AcceptanceRepairResult {
  metadata: Record<string, unknown>;
  addedAccessoryKeys: string[];
}

interface BuildCriteriaArgs {
  prompt: string;
  kind?: GenerationKind;
  metadata?: Record<string, unknown>;
}

interface AnalyzeArgs {
  manifest: RobloxBuildManifest;
  prompt: string;
  metadata?: Record<string, unknown>;
  criteria?: unknown;
}

interface AccessoryRule {
  key: string;
  aliases: string[];
  patterns: RegExp[];
  bodyPartName: string;
  attachmentName: string;
  accessoryType: string;
  offset: [number, number, number];
  targetLongestAxis: number;
  displayName: string;
  prompt: string;
}

interface VisualCueRule {
  key: string;
  patterns: RegExp[];
  present: RegExp;
  description?: string;
}

const ACCESSORY_RULES: AccessoryRule[] = [
  {
    key: 'smartphone_glow',
    aliases: ['phone', 'smartphone', 'screen'],
    patterns: [/smart\s*phone|smartphone|\bphone\b|телефон|смартфон/i],
    bodyPartName: 'RightHand',
    attachmentName: 'RightGripAttachment',
    accessoryType: 'Unknown',
    offset: [0.18, 0.02, -0.28],
    targetLongestAxis: 0.74,
    displayName: 'Generated Smartphone Glow',
    prompt: 'modern smartphone prop with glowing screen and chunky Roblox silhouette',
  },
  {
    key: 'broccoli_hair_mesh',
    aliases: ['broccoli hair', 'broccoli'],
    patterns: [/broccoli\s*(?:hair|cut|hairstyle)|broccoli[-\s]*head|брокколи/i],
    bodyPartName: 'Head',
    attachmentName: 'HairAttachment',
    accessoryType: 'Hair',
    offset: [0, 0.56, 0.02],
    targetLongestAxis: 1.65,
    displayName: 'Generated Broccoli Hair',
    prompt: 'rounded broccoli green hair cap with clustered soft Roblox hair shape',
  },
  {
    key: 'royal_crown',
    aliases: ['crown', 'tiara'],
    patterns: [/crown|tiara|корон|диадем/i],
    bodyPartName: 'Head',
    attachmentName: 'HatAttachment',
    accessoryType: 'Hat',
    offset: [0, 0.72, 0.02],
    targetLongestAxis: 1.2,
    displayName: 'Generated Royal Crown',
    prompt: 'chunky golden toy crown with readable points and gem accents',
  },
  {
    key: 'arcane_staff',
    aliases: ['staff', 'wand', 'scepter'],
    patterns: [/magic\s+staff|wizard\s+staff|arcane\s+staff|crystal\s+staff|\bstaff\b|\bwand\b|scepter|жезл|посох|волшебн/i],
    bodyPartName: 'RightHand',
    attachmentName: 'RightGripAttachment',
    accessoryType: 'Unknown',
    offset: [0.34, 0.16, -0.08],
    targetLongestAxis: 1.5,
    displayName: 'Generated Arcane Staff',
    prompt: 'short wizard staff with wooden shaft and glowing orb top',
  },
  {
    key: 'spell_book',
    aliases: ['book', 'grimoire', 'tome'],
    patterns: [/spell\s*book|grimoire|tome|codex|\bbook\b|книг|гримуар/i],
    bodyPartName: 'LeftHand',
    attachmentName: 'LeftGripAttachment',
    accessoryType: 'Unknown',
    offset: [-0.22, -0.02, -0.22],
    targetLongestAxis: 0.86,
    displayName: 'Generated Spell Book',
    prompt: 'compact fantasy book prop with visible pages and glowing clasp',
  },
  {
    key: 'scroll_map',
    aliases: ['scroll', 'map'],
    patterns: [/scroll|rolled\s+map|treasure\s+map|свиток|карта/i],
    bodyPartName: 'LeftHand',
    attachmentName: 'LeftGripAttachment',
    accessoryType: 'Unknown',
    offset: [-0.18, -0.02, -0.18],
    targetLongestAxis: 0.92,
    displayName: 'Generated Scroll Map',
    prompt: 'rolled parchment map with ribbon and chunky silhouette',
  },
  {
    key: 'glow_lantern',
    aliases: ['lantern', 'lamp'],
    patterns: [/lantern|lamp|фонар|ламп/i],
    bodyPartName: 'LeftHand',
    attachmentName: 'LeftGripAttachment',
    accessoryType: 'Unknown',
    offset: [-0.22, -0.08, -0.2],
    targetLongestAxis: 0.88,
    displayName: 'Generated Glow Lantern',
    prompt: 'small lantern with warm glowing core and metal frame',
  },
  {
    key: 'hero_shield',
    aliases: ['shield'],
    patterns: [/shield|щит/i],
    bodyPartName: 'LeftLowerArm',
    attachmentName: 'LeftGripAttachment',
    accessoryType: 'Unknown',
    offset: [-0.46, -0.04, -0.2],
    targetLongestAxis: 1.08,
    displayName: 'Generated Hero Shield',
    prompt: 'compact stylized shield with bold emblem and metal rim',
  },
  {
    key: 'short_sword',
    aliases: ['sword', 'blade', 'katana'],
    patterns: [/sword|blade|katana|меч|клинок|катан/i],
    bodyPartName: 'RightHand',
    attachmentName: 'RightGripAttachment',
    accessoryType: 'Unknown',
    offset: [0.24, 0.1, -0.1],
    targetLongestAxis: 1.18,
    displayName: 'Generated Short Sword',
    prompt: 'short toy-like sword with safe chunky blade and simple guard',
  },
  {
    key: 'cape_cloak',
    aliases: ['cape', 'cloak'],
    patterns: [/cape|cloak|плащ|мантия/i],
    bodyPartName: 'UpperTorso',
    attachmentName: 'BodyBackAttachment',
    accessoryType: 'Back',
    offset: [0, -0.28, 0.72],
    targetLongestAxis: 1.42,
    displayName: 'Generated Cape Cloak',
    prompt: 'short stylized fabric cape with chunky folded collar',
  },
  {
    key: 'backpack_prop',
    aliases: ['backpack', 'bag', 'satchel'],
    patterns: [/\bbackpack\b|back\s*pack|\bbag\b|satchel|рюкзак|ранец|сумк/i],
    bodyPartName: 'UpperTorso',
    attachmentName: 'BodyBackAttachment',
    accessoryType: 'Back',
    offset: [0, 0.12, 0.62],
    targetLongestAxis: 1.22,
    displayName: 'Generated Backpack',
    prompt: 'compact stylized backpack with zipper pulls and two straps',
  },
  {
    key: 'roast_microphone',
    aliases: ['microphone', 'mic'],
    patterns: [/microphone|\bmic\b|майк|микрофон/i],
    bodyPartName: 'RightHand',
    attachmentName: 'RightGripAttachment',
    accessoryType: 'Unknown',
    offset: [0.22, 0.1, -0.18],
    targetLongestAxis: 0.86,
    displayName: 'Generated Roast Mic',
    prompt: 'standup comedy microphone with chrome grille and black handle',
  },
  {
    key: 'gym_dumbbell',
    aliases: ['dumbbell', 'weight'],
    patterns: [/dumbbell|weight|гантел|штанг/i],
    bodyPartName: 'RightHand',
    attachmentName: 'RightGripAttachment',
    accessoryType: 'Unknown',
    offset: [0.56, 0.1, -0.54],
    targetLongestAxis: 1.35,
    displayName: 'Generated Gym Dumbbell',
    prompt: 'chunky black rubber dumbbell with chrome grip',
  },
];

const STYLE_RULES: VisualCueRule[] = [
  {
    key: 'gen_alpha',
    patterns: [/gen[-\s]*alpha|ген\s*альфа|broccoli|брокколи/i],
    present: /\b(?:genalpha(?:blacktee|bluecargo|broccoli|smartphone|chunky|hoodie|graphic|smug|drip|variant|face)|alpha(?:hoodie|headphone|cap|phone|shades|variant|smug)|generated(?:mesh|fallback)_broccoli_hair_mesh)\b/i,
    description: 'Gen-Alpha visual marker family',
  },
  { key: 'gym_bro', patterns: [/gym\s*bro|качал|fitness|muscle|dumbbell/i], present: /Gym|Dumbbell|ProteinShaker/i },
  { key: 'sigma_chad', patterns: [/sigma|сигма|chad|shades/i], present: /Sigma|Shades|StatementWatch/i },
  { key: 'skibidi', patterns: [/skibidi|toilet|скибиди|унитаз/i], present: /Skibidi|Toilet/i },
  { key: 'mom_friend', patterns: [/mom\s*friend|clipboard|tote|cardigan|мам[аы]|клипборд/i], present: /Mom|Clipboard|Tote/i },
  { key: 'superhero', patterns: [/super\s*hero|superhero|heroic|супергер/i], present: /Hero|Superhero|Cape/i },
  { key: 'robot', patterns: [/robot|android|cyborg|робот|кибер/i], present: /Robot|Mechanical|Core/i },
  { key: 'ninja', patterns: [/ninja|shinobi|ниндзя/i], present: /Ninja|Kunai|Scabbard/i },
  { key: 'pirate', patterns: [/pirate|пират|captain/i], present: /Pirate|Cutlass|Captain/i },
];

const VISUAL_CUE_RULES: VisualCueRule[] = [
  {
    key: 'oversized_head',
    patterns: [/goofy\s+big\s+head|oversized\s+head|big\s+head|large\s+head|huge\s+head|больш[а-яё\s-]*голов/i],
    present: /(?:goofybighead|oversizedhead|bighead|headscale)/i,
    description: 'goofy oversized head silhouette',
  },
  {
    key: 'pastel_palette',
    patterns: [/pastel|пастел/i],
    present: /(?:alphahoodie|genalphabluecargo|genalphablacktee|genalphagraphic|genalphadrip|alphavariant|genalphavariant)/i,
    description: 'pastel palette or pastel clothing markers',
  },
  {
    key: 'trendy_fashion',
    patterns: [/trendy\s+fashion|soft\s+trendy|streetwear|hoodie|fashion|модн|стильн/i],
    present: /(?:alphahoodie|alphaheadphone|alphacap|alphashades|genalphablacktee|genalphabluecargo|genalphachunky|genalphagraphic|crossbody|minibackpack|earbud|wristband)/i,
    description: 'trend/fashion outfit markers',
  },
  {
    key: 'smug_expression',
    patterns: [/smug|smirk|саркастич|самодоволь|ухмыл/i],
    present: /(?:smugmouth|smirk|alphasmug|genalphasmug|facebrow|facemouth)/i,
    description: 'smug or playful face expression marker',
  },
  {
    key: 'meme_identity',
    patterns: [/meme|brainrot|internet\s+slang|roast|мем|мемн/i],
    present: /(?:genalpha(?:blacktee|bluecargo|broccoli|smartphone|chunky|graphic|drip|smug)|alpha(?:hoodie|phone|shades)|roast(?:mic|speech|shades|stage)|memeteen|aichatbadge)/i,
    description: 'meme/roast identity markers',
  },
  {
    key: 'full_body_styled',
    patterns: [/full[-\s]*body|head.*torso|outfit|npc\s+full/i],
    present: /(?:hoodie|tee|cargo|pants|joggers|sneaker|boot|cuff|sleeve|drawstring|pocket)/i,
    description: 'full-body outfit coverage markers',
  },
];

const ACCESSORY_PRESENT_MARKERS: Record<string, RegExp> = {
  smartphone_glow: /(?:smartphone(?:screenglow)?|phone(?:screen)?glow|alphaphone|genalphasmartphone|generated(?:mesh|fallback)_smartphone_glow)/i,
  backpack_prop: /(?:backpack|minibackpack|sidepouch|generated(?:mesh|fallback)_backpack_prop)/i,
  roast_microphone: /(?:roastmic|microphone|generated(?:mesh|fallback)_roast_microphone)/i,
  gym_dumbbell: /(?:gymdumbbell|dumbbell|generated(?:mesh|fallback)_gym_dumbbell)/i,
  cape_cloak: /(?:(?:avatar|hero|guard|boss|villain|spectral|mage|ranger|gnomemage|fireelemental)[a-z0-9_]*(?:cape|cloak)|(?:cape|cloak)[a-z0-9_]*(?:accessory|back|fold|collar|clasp)|generated(?:mesh|fallback)_cape_cloak)/i,
};

const ROBOT_STYLE_CUE = /\b(?:robot|android|cyber|cyborg|mech|mecha|droid)\b|робот|андроид|кибер|киборг|механическ|меха?\b/i;
const GENERATED_RETRY_NOISE = /npc_visual_quality_failed|missing_requested_visual_cue|conflicting_robot_visual|acceptance gate|quality gate|generated npc behavior|config\.personality|previous generated brief/i;

function textFromMetadata(metadata?: Record<string, unknown>): string {
  if (!metadata) return '';
  const dna = metadata.npcVisualDNA && typeof metadata.npcVisualDNA === 'object'
    ? metadata.npcVisualDNA as Record<string, unknown>
    : {};
  const visualRepairNotes = Array.isArray(metadata.npcVisualRepairNotes)
    ? metadata.npcVisualRepairNotes.join(' ')
    : '';
  return [
    metadata.title,
    metadata.contentCategory,
    metadata.contentSubcategory,
    metadata.npcMode,
    metadata.npcRole,
    metadata.roastPersonality,
    metadata.visualDescription,
    metadata.appearance,
    metadata.npcVisualHooks,
    metadata.theme,
    Array.isArray(dna.styleArchetypes) ? dna.styleArchetypes.join(' ') : '',
    Array.isArray(dna.props) ? dna.props.join(' ') : '',
    Array.isArray(dna.accessorySlots) ? dna.accessorySlots.join(' ') : '',
    Array.isArray(dna.sourceCues) ? dna.sourceCues.join(' ') : '',
    Array.isArray(dna.repairNotes) ? dna.repairNotes.join(' ') : '',
    visualRepairNotes,
    Array.isArray(metadata.npcMechanics) ? metadata.npcMechanics.join(' ') : metadata.npcMechanics,
    Array.isArray(metadata.npcSystems) ? metadata.npcSystems.join(' ') : metadata.npcSystems,
  ]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .join(' ');
}

function promptWithoutGeneratedRetryNoise(prompt: string): string {
  return prompt
    .split(/\n+/)
    .filter((line) => !GENERATED_RETRY_NOISE.test(line))
    .join('\n');
}

function metadataHasRobotToHumanoidRepair(metadata: Record<string, unknown>): boolean {
  const dna = metadata.npcVisualDNA && typeof metadata.npcVisualDNA === 'object'
    ? metadata.npcVisualDNA as Record<string, unknown>
    : {};
  const values = [
    Array.isArray(metadata.npcVisualRepairNotes) ? metadata.npcVisualRepairNotes.join(' ') : '',
    Array.isArray(dna.repairNotes) ? dna.repairNotes.join(' ') : '',
  ].join(' ');
  return /robot[_-]?to[_-]?humanoid|from_robot_to_humanoid/i.test(values);
}

function dedupe(values: string[], limit = 12): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const cleaned = value.trim();
    const key = cleaned.toLowerCase();
    if (!cleaned || seen.has(key)) continue;
    seen.add(key);
    out.push(cleaned);
    if (out.length >= limit) break;
  }
  return out;
}

function targetFromArgs(kind?: GenerationKind, metadata?: Record<string, unknown>): AcceptanceTarget {
  const category = typeof metadata?.contentCategory === 'string' ? metadata.contentCategory.toLowerCase() : '';
  const subcategory = typeof metadata?.contentSubcategory === 'string' ? metadata.contentSubcategory.toLowerCase() : '';
  if (category === 'npc_ai' || subcategory === 'npcs' || subcategory === 'roast_npc') return 'npc';
  if (kind === 'game_package' || kind === 'rbxl_build') return 'game';
  if (kind === 'code' || category === 'script' || category === 'game_system') return 'script';
  if (kind === 'character_3d' || kind === 'rbxm_build' || kind === 'image' || kind === 'animation') return 'asset';
  return 'unknown';
}

function extractApifySignals(metadata?: Record<string, unknown>): string[] {
  const out: string[] = [];
  const sources = metadata?.generationEnrichmentSources;
  if (Array.isArray(sources)) {
    out.push(...sources.filter((value): value is string => typeof value === 'string').slice(0, 6));
  }
  if (typeof metadata?.trendingShowcaseKeyword === 'string') {
    out.push(`keyword:${metadata.trendingShowcaseKeyword}`);
  }
  const showcase = metadata?.trendingShowcaseItems;
  if (Array.isArray(showcase)) {
    for (const item of showcase.slice(0, 4)) {
      if (item && typeof item === 'object' && typeof (item as Record<string, unknown>).name === 'string') {
        out.push(`catalog:${(item as Record<string, unknown>).name}`);
      }
    }
  }
  const context = typeof metadata?.generationEnrichmentContext === 'string' ? metadata.generationEnrichmentContext : '';
  const itemMatches = Array.from(context.matchAll(/^\d+\.\s+(.+?)\s+—/gm))
    .map((match) => `catalog:${match[1].slice(0, 80)}`)
    .slice(0, 6);
  out.push(...itemMatches);
  return dedupe(out, 12);
}

export function buildGenerationAcceptanceCriteria(args: BuildCriteriaArgs): GenerationAcceptanceCriteria {
  const metadata = args.metadata ?? {};
  const target = targetFromArgs(args.kind, metadata);
  const haystack = `${args.prompt} ${textFromMetadata(metadata)}`;
  const requiredAccessoryKeys = ACCESSORY_RULES
    .filter((rule) => rule.patterns.some((pattern) => pattern.test(haystack)))
    .map((rule) => rule.key);
  const requiredVisualCues = STYLE_RULES
    .filter((rule) => rule.patterns.some((pattern) => pattern.test(haystack)))
    .map((rule) => rule.key);
  requiredVisualCues.push(...VISUAL_CUE_RULES
    .filter((rule) => rule.patterns.some((pattern) => pattern.test(haystack)))
    .map((rule) => rule.key));
  const cleanedPrompt = promptWithoutGeneratedRetryNoise(args.prompt);
  const explicitRobotInUserPrompt = ROBOT_STYLE_CUE.test(cleanedPrompt);
  const hasGenAlphaCue = requiredVisualCues.includes('gen_alpha');
  const hasDominantGenAlphaBrief = hasGenAlphaCue
    && /pastel|trendy|streetwear|smug|meme|goofy\s+big\s+head|oversized\s+head/i.test(cleanedPrompt);
  const repairedRobotToHumanoid = metadataHasRobotToHumanoidRepair(metadata);
  const filteredVisualCues = requiredVisualCues.filter((cue) => (
    cue !== 'robot'
    || !hasGenAlphaCue
    || (explicitRobotInUserPrompt && !repairedRobotToHumanoid && !hasDominantGenAlphaBrief)
  ));
  const requiredBehaviorCues: string[] = [];
  if (/roast|подъ[её]б|подкол|ст[её]б|жарит/i.test(haystack) || metadata.npcMode === 'roast') requiredBehaviorCues.push('roast');
  if (/patrol|route|маршрут|патрул/i.test(haystack)) requiredBehaviorCues.push('patrol');
  if (/\bquests?\b|quest[-\s]*giver|задан/i.test(haystack)) requiredBehaviorCues.push('quest');
  if (/trade|merchant|shop|торгов/i.test(haystack)) requiredBehaviorCues.push('trade');
  if (/attack|enemy|boss|атак|враг|босс/i.test(haystack)) requiredBehaviorCues.push('combat');
  if (/follow|companion|спутник|след/i.test(haystack)) requiredBehaviorCues.push('follow');

  const mustHave = target === 'npc'
    ? ['r15_humanoid', 'talk_prompt', 'npc_behavior_script', 'npc_visual_config']
    : target === 'game'
      ? ['playable_spawn', 'gameplay_script']
      : target === 'script'
        ? ['luau_script']
        : [];

  return {
    version: 1,
    target,
    mustHave,
    requiredVisualCues: dedupe(filteredVisualCues),
    requiredAccessoryKeys: dedupe(requiredAccessoryKeys),
    requiredBehaviorCues: dedupe(requiredBehaviorCues),
    rejectIf: target === 'npc'
      ? ['missing_talk_prompt', 'missing_behavior_script', 'requested_accessory_absent', 'default_only_visual']
      : ['missing_core_artifact'],
    apifySignals: extractApifySignals(metadata),
    source: 'deterministic_v1',
  };
}

function parseCriteria(value: unknown, fallback: GenerationAcceptanceCriteria): GenerationAcceptanceCriteria {
  if (!value || typeof value !== 'object') return fallback;
  const obj = value as Record<string, unknown>;
  if (obj.version !== 1) return fallback;
  return {
    ...fallback,
    target: obj.target === 'npc' || obj.target === 'game' || obj.target === 'asset' || obj.target === 'script' || obj.target === 'unknown'
      ? obj.target
      : fallback.target,
    mustHave: Array.isArray(obj.mustHave) ? obj.mustHave.filter((v): v is string => typeof v === 'string') : fallback.mustHave,
    requiredVisualCues: Array.isArray(obj.requiredVisualCues) ? obj.requiredVisualCues.filter((v): v is string => typeof v === 'string') : fallback.requiredVisualCues,
    requiredAccessoryKeys: Array.isArray(obj.requiredAccessoryKeys) ? obj.requiredAccessoryKeys.filter((v): v is string => typeof v === 'string') : fallback.requiredAccessoryKeys,
    requiredBehaviorCues: Array.isArray(obj.requiredBehaviorCues) ? obj.requiredBehaviorCues.filter((v): v is string => typeof v === 'string') : fallback.requiredBehaviorCues,
    rejectIf: Array.isArray(obj.rejectIf) ? obj.rejectIf.filter((v): v is string => typeof v === 'string') : fallback.rejectIf,
    apifySignals: Array.isArray(obj.apifySignals) ? obj.apifySignals.filter((v): v is string => typeof v === 'string') : fallback.apifySignals,
  };
}

function classCounts(scene: RobloxBuildSceneNode[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const node of scene) {
    counts[node.className] = (counts[node.className] ?? 0) + 1;
  }
  return counts;
}

function nodeValue(node: RobloxBuildSceneNode | undefined): string {
  const value = node?.properties?.Value;
  return typeof value === 'string' ? value : '';
}

function manifestSearchText(manifest: RobloxBuildManifest): string {
  const sceneText = manifest.scene.map((node) => {
    const props = node.properties ? JSON.stringify(node.properties).slice(0, 1200) : '';
    return `${node.className} ${node.name} ${props}`;
  }).join('\n');
  const scriptText = manifest.scripts.map((script) => `${script.name} ${script.scriptType} ${script.container}`).join('\n');
  return `${sceneText}\n${scriptText}`.toLowerCase();
}

function hasAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

function accessoryRuleByKey(key: string): AccessoryRule | undefined {
  return ACCESSORY_RULES.find((rule) => rule.key === key);
}

function accessoryPresent(text: string, key: string): boolean {
  const rule = accessoryRuleByKey(key);
  if (!rule) return text.includes(key.toLowerCase());
  const keyPattern = new RegExp(rule.key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  return keyPattern.test(text) || ACCESSORY_PRESENT_MARKERS[key]?.test(text) === true;
}

function addIssue(issues: GenerationAcceptanceIssue[], issue: GenerationAcceptanceIssue): void {
  issues.push(issue);
}

function numberProp(obj: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return null;
}

function vectorSize(node: RobloxBuildSceneNode | undefined): { x: number; y: number; z: number } | null {
  const raw = node?.properties?.Size;
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const x = numberProp(obj, ['x', 'X']);
  const y = numberProp(obj, ['y', 'Y']);
  const z = numberProp(obj, ['z', 'Z']);
  return x !== null && y !== null && z !== null ? { x, y, z } : null;
}

function visualCuePresent(args: {
  cueKey: string;
  text: string;
  manifest: RobloxBuildManifest;
  visualConfig: Record<string, unknown> | null;
}): boolean {
  const style = STYLE_RULES.find((rule) => rule.key === args.cueKey);
  if (style) return style.present.test(args.text);
  const cue = VISUAL_CUE_RULES.find((rule) => rule.key === args.cueKey);
  if (!cue) return args.text.includes(args.cueKey.toLowerCase());
  if (args.cueKey === 'oversized_head') {
    const headSize = vectorSize(args.manifest.scene.find((node) => /^(?:Part|MeshPart)$/.test(node.className) && node.name === 'Head'));
    if (headSize && (headSize.x >= 2.35 || headSize.y >= 1.22 || headSize.z >= 1.18)) return true;
  }
  if (args.cueKey === 'full_body_styled') {
    const quality = args.visualConfig?.visualQualityGate;
    if (quality && typeof quality === 'object') {
      const slotCoverage = (quality as Record<string, unknown>).slotCoverage;
      if (Array.isArray(slotCoverage)) {
        const slots = new Set(slotCoverage.filter((slot): slot is string => typeof slot === 'string'));
        if (slots.has('torso_outfit') && slots.has('legs_feet') && slots.has('head_identity')) return true;
      }
    }
  }
  return cue.present.test(args.text);
}

export function analyzeRobloxManifestAcceptance(args: AnalyzeArgs): GenerationAcceptanceAnalysis {
  const fallback = buildGenerationAcceptanceCriteria({
    prompt: args.prompt,
    kind: args.metadata?.requestedKind as GenerationKind | undefined,
    metadata: args.metadata,
  });
  const criteria = parseCriteria(args.criteria ?? args.metadata?.generationAcceptanceCriteria, fallback);
  const text = manifestSearchText(args.manifest);
  const issues: GenerationAcceptanceIssue[] = [];
  const matched: string[] = [];
  const missing: string[] = [];

  if (criteria.target === 'npc') {
    const hasHumanoid = args.manifest.scene.some((node) => node.className === 'Humanoid');
    const hasTalkPrompt = args.manifest.scene.some((node) => node.className === 'ProximityPrompt' && /talkprompt/i.test(node.name));
    const hasNpcServer = args.manifest.scene.some((node) => node.className === 'Script' && /npcserver|npcbehavior|npc_client_replicator|npcclientreplicator/i.test(node.name))
      || args.manifest.scripts.some((script) => /npcserver|npcbehavior/i.test(script.name));
    const visualConfigNode = args.manifest.scene.find((node) => node.name === 'NPCVisualConfig');
    const visualConfigText = nodeValue(visualConfigNode);
    const visualConfig = (() => {
      try {
        return visualConfigText ? JSON.parse(visualConfigText) as Record<string, unknown> : null;
      } catch {
        return null;
      }
    })();

    if (hasHumanoid) matched.push('r15_humanoid'); else {
      missing.push('r15_humanoid');
      addIssue(issues, { code: 'missing_r15_humanoid', severity: 'fail', message: 'NPC export has no Humanoid instance.' });
    }
    if (hasTalkPrompt) matched.push('talk_prompt'); else {
      missing.push('talk_prompt');
      addIssue(issues, { code: 'missing_talk_prompt', severity: 'fail', message: 'NPC export has no TalkPrompt ProximityPrompt.' });
    }
    if (hasNpcServer) matched.push('npc_behavior_script'); else {
      missing.push('npc_behavior_script');
      addIssue(issues, { code: 'missing_behavior_script', severity: 'fail', message: 'NPC export has no behavior server script marker.' });
    }
    if (visualConfig) {
      matched.push('npc_visual_config');
      const gate = visualConfig.visualQualityGate;
      if (gate && typeof gate === 'object' && (gate as Record<string, unknown>).passed === false) {
        const gateObj = gate as Record<string, unknown>;
        const promptFidelity = gateObj.promptFidelity;
        const rawMissingPromptCues = promptFidelity && typeof promptFidelity === 'object'
          ? (promptFidelity as Record<string, unknown>).missingRequiredCues
          : null;
        const missingPromptCues = Array.isArray(rawMissingPromptCues)
          ? rawMissingPromptCues
            .filter((cue): cue is string => typeof cue === 'string' && cue.trim().length > 0)
            .slice(0, 8)
          : [];
        missing.push('npc_visual_quality_gate');
        addIssue(issues, {
          code: 'npc_visual_quality_failed',
          severity: 'fail',
          message: missingPromptCues.length > 0
            ? `NPC visual quality gate failed; missing prompt cues: ${missingPromptCues.join(', ')}.`
            : 'NPC visual quality gate failed inside the exported manifest.',
          actual: JSON.stringify(gate).slice(0, 600),
        });
      }
    } else {
      missing.push('npc_visual_config');
      addIssue(issues, { code: 'missing_npc_visual_config', severity: 'fail', message: 'NPC export has no NPCVisualConfig marker.' });
    }

    for (const cueKey of criteria.requiredVisualCues) {
      const present = visualCuePresent({
        cueKey,
        text,
        manifest: args.manifest,
        visualConfig,
      });
      if (present) matched.push(`visual:${cueKey}`);
      else {
        missing.push(`visual:${cueKey}`);
        addIssue(issues, {
          code: 'missing_requested_visual_cue',
          severity: 'fail',
          message: `Requested NPC visual cue "${cueKey}" is not visible in the manifest.`,
          expected: cueKey,
        });
      }
    }

    const wantsGenAlpha = criteria.requiredVisualCues.includes('gen_alpha');
    const hasRobotTemplate = /robot(?:helmet|chest|asset|identity|antenna|visor|core|wrist|shoulder|torso)/i.test(text);
    const hasStrictGenAlpha = visualCuePresent({
      cueKey: 'gen_alpha',
      text,
      manifest: args.manifest,
      visualConfig,
    });
    if (wantsGenAlpha && hasRobotTemplate && !hasStrictGenAlpha) {
      missing.push('visual:gen_alpha_robot_conflict');
      addIssue(issues, {
        code: 'conflicting_robot_visual',
        severity: 'fail',
        message: 'Requested Gen-Alpha NPC was exported with robot visual markers and no strict Gen-Alpha visual marker.',
        expected: 'gen_alpha',
        actual: 'robot visual marker family',
      });
    }

    for (const key of criteria.requiredAccessoryKeys) {
      if (accessoryPresent(text, key)) matched.push(`accessory:${key}`);
      else {
        missing.push(`accessory:${key}`);
        addIssue(issues, {
          code: 'missing_requested_accessory',
          severity: 'fail',
          message: `Requested NPC accessory "${key}" is not visible in the manifest.`,
          expected: key,
        });
      }
    }

    for (const cue of criteria.requiredBehaviorCues) {
      const present = cue === 'roast'
        ? /roast|universal_roast_kit|npcmode[":\s]+roast/i.test(text)
        : new RegExp(cue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(text);
      if (present) matched.push(`behavior:${cue}`);
      else {
        missing.push(`behavior:${cue}`);
        addIssue(issues, {
          code: 'missing_behavior_cue',
          severity: cue === 'roast' ? 'fail' : 'warning',
          message: `Requested NPC behavior cue "${cue}" was not found in manifest facts.`,
          expected: cue,
        });
      }
    }
  }

  const blocking = issues.some((issue) => issue.severity === 'fail');
  return {
    version: 1,
    passed: !blocking,
    target: criteria.target,
    summary: blocking
      ? `Acceptance gate failed with ${issues.filter((issue) => issue.severity === 'fail').length} blocking issue(s).`
      : issues.length > 0
        ? `Acceptance gate passed with ${issues.length} warning(s).`
        : 'Acceptance gate passed.',
    issues,
    facts: {
      sceneCount: args.manifest.scene.length,
      scriptCount: args.manifest.scripts.length,
      classNames: classCounts(args.manifest.scene),
      matched: dedupe(matched, 40),
      missing: dedupe(missing, 40),
      apifySignals: criteria.apifySignals,
    },
  };
}

function existingNpcAccessoryKeys(metadata: Record<string, unknown>): Set<string> {
  const keys = new Set<string>();
  const raw = metadata.npcGeneratedAccessoryAssets;
  if (!Array.isArray(raw)) return keys;
  for (const item of raw) {
    if (item && typeof item === 'object') {
      const key = (item as Record<string, unknown>).key;
      if (typeof key === 'string') keys.add(key);
    }
  }
  return keys;
}

export function augmentNpcMetadataWithAcceptanceFallbacks(
  metadata: Record<string, unknown>,
  criteria: GenerationAcceptanceCriteria,
): AcceptanceRepairResult {
  if (criteria.target !== 'npc' || criteria.requiredAccessoryKeys.length === 0) {
    return { metadata, addedAccessoryKeys: [] };
  }
  const existing = existingNpcAccessoryKeys(metadata);
  const currentAssets = Array.isArray(metadata.npcGeneratedAccessoryAssets)
    ? [...metadata.npcGeneratedAccessoryAssets]
    : [];
  const currentPlan = Array.isArray(metadata.npcGeneratedAccessoryPlan)
    ? [...metadata.npcGeneratedAccessoryPlan]
    : [];
  const addedAccessoryKeys: string[] = [];

  for (const key of criteria.requiredAccessoryKeys) {
    if (existing.has(key)) continue;
    const rule = accessoryRuleByKey(key);
    if (!rule) continue;
    const spec = {
      key: rule.key,
      displayName: rule.displayName,
      prompt: rule.prompt,
      bodyPartName: rule.bodyPartName,
      attachmentName: rule.attachmentName,
      accessoryType: rule.accessoryType,
      offset: rule.offset,
      targetLongestAxis: rule.targetLongestAxis,
      priority: 110,
      status: 'planned',
      provider: 'acceptance_gate',
      note: 'Inserted by acceptance pre-export repair so requested accessory has a visible RBXM fallback.',
    };
    currentAssets.push(spec);
    currentPlan.push(spec);
    existing.add(key);
    addedAccessoryKeys.push(key);
  }

  if (addedAccessoryKeys.length === 0) return { metadata, addedAccessoryKeys };
  return {
    metadata: {
      ...metadata,
      npcGeneratedAccessoryAssets: currentAssets,
      npcGeneratedAccessoryPlan: currentPlan,
      generationAcceptanceRepair: {
        version: 1,
        type: 'npc_accessory_fallback_injection',
        addedAccessoryKeys,
      },
    },
    addedAccessoryKeys,
  };
}

function parseJudgeJson(text: string): Record<string, unknown> | null {
  const cleaned = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function runAcceptanceJudgeOnFailure(args: {
  prompt: string;
  criteria: GenerationAcceptanceCriteria;
  analysis: GenerationAcceptanceAnalysis;
  metadata?: Record<string, unknown>;
}): Promise<Record<string, unknown> | null> {
  if (args.analysis.passed) return null;
  const prompt = {
    system: 'You are a strict Roblox generation QA judge. You never override deterministic missing-artifact facts. Return compact JSON only.',
    user: [
      'Decide whether this generated artifact should be blocked or can be accepted.',
      'Rules:',
      '- If deterministic facts say a requested accessory, TalkPrompt, behavior script, or NPCVisualConfig is missing, decision must be "block".',
      '- If deterministic facts say requested visual cues or the NPC visual quality gate failed, decision must be "block".',
      '- If only warnings exist, decision can be "accept_with_warnings".',
      '- Suggest a concise repair instruction.',
      '',
      `User prompt: ${args.prompt}`,
      `Criteria: ${JSON.stringify(args.criteria).slice(0, 3000)}`,
      `Analysis facts: ${JSON.stringify(args.analysis).slice(0, 5000)}`,
      'Return JSON: {"decision":"block|accept_with_warnings","reason":"...","repairPrompt":"..."}',
    ].join('\n'),
  };
  try {
    const result = await runChatProvider('gemini', prompt, undefined, {
      timeoutMs: 12_000,
      providerModels: { gemini: 'gemini-2.5-flash' },
    });
    const resultText = result.text ?? '';
    const parsed = parseJudgeJson(resultText);
    return parsed ?? {
      decision: 'block',
      reason: 'LLM judge returned unparseable output after deterministic acceptance failure.',
      raw: resultText.slice(0, 500),
    };
  } catch (err) {
    logger.warn('[GenerationQualityGate] LLM judge failed; deterministic failure remains blocking', {
      error: err instanceof Error ? err.message : String(err),
    });
    return {
      decision: 'block',
      reason: 'LLM judge unavailable; deterministic acceptance failure remains blocking.',
    };
  }
}

export function summarizeAcceptanceIssues(analysis: GenerationAcceptanceAnalysis): string {
  const blocking = analysis.issues.filter((issue) => issue.severity === 'fail');
  const chosen = (blocking.length > 0 ? blocking : analysis.issues).slice(0, 4);
  return chosen.map((issue) => `${issue.code}: ${issue.message}`).join(' | ') || analysis.summary;
}
