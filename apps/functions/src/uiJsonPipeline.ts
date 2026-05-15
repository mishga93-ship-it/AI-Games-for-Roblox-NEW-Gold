/**
 * UI JSON Pipeline — converts AI-generated JSON UI trees into Roblox instances.
 *
 * Flow: LLM JSON → parse & validate → RobloxBuildSceneNode[] → .rbxmx XML / .lua code
 */

import { v4 as uuidv4 } from 'uuid';
import type { RobloxBuildSceneNode } from './types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UiJsonNode {
  type: string;
  name: string;
  props?: Record<string, unknown>;
  children?: UiJsonNode[];
  bind?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ALLOWED_CLASSES = new Set([
  'ScreenGui', 'Frame', 'TextLabel', 'ImageLabel', 'TextButton', 'ImageButton',
  'ScrollingFrame', 'UIListLayout', 'UIGridLayout', 'UIPadding', 'UICorner',
  'UIStroke', 'UIAspectRatioConstraint', 'UIScale', 'UISizeConstraint',
  'UITextSizeConstraint', 'ViewportFrame', 'CanvasGroup', 'BillboardGui',
]);

/** camelCase JSON prop → PascalCase Roblox property */
const PROP_NAME_MAP: Record<string, string> = {
  size: 'Size',
  position: 'Position',
  anchorPoint: 'AnchorPoint',
  backgroundColor: 'BackgroundColor3',
  backgroundColor3: 'BackgroundColor3',
  backgroundTransparency: 'BackgroundTransparency',
  borderSizePixel: 'BorderSizePixel',
  borderColor: 'BorderColor3',
  borderColor3: 'BorderColor3',
  text: 'Text',
  textColor: 'TextColor3',
  textColor3: 'TextColor3',
  textSize: 'TextSize',
  textScaled: 'TextScaled',
  textWrapped: 'TextWrapped',
  textXAlignment: 'TextXAlignment',
  textYAlignment: 'TextYAlignment',
  font: 'Font',
  image: 'Image',
  imageColor: 'ImageColor3',
  imageColor3: 'ImageColor3',
  imageTransparency: 'ImageTransparency',
  scaleType: 'ScaleType',
  visible: 'Visible',
  zIndex: 'ZIndex',
  layoutOrder: 'LayoutOrder',
  clipDescendants: 'ClipDescendants',
  rotation: 'Rotation',
  name: 'Name',
  resetOnSpawn: 'ResetOnSpawn',
  ignoreGuiInset: 'IgnoreGuiInset',
  displayOrder: 'DisplayOrder',
  cornerRadius: 'CornerRadius',
  fillDirection: 'FillDirection',
  horizontalAlignment: 'HorizontalAlignment',
  verticalAlignment: 'VerticalAlignment',
  sortOrder: 'SortOrder',
  padding: 'Padding',
  paddingLeft: 'PaddingLeft',
  paddingRight: 'PaddingRight',
  paddingTop: 'PaddingTop',
  paddingBottom: 'PaddingBottom',
  cellSize: 'CellSize',
  cellPadding: 'CellPadding',
  thickness: 'Thickness',
  color: 'Color',
  transparency: 'Transparency',
  scrollBarThickness: 'ScrollBarThickness',
  canvasSize: 'CanvasSize',
  autoLocalize: 'AutoLocalize',
  richText: 'RichText',
  // PascalCase WITHOUT "3" suffix (LLM often omits the "3")
  BackgroundColor: 'BackgroundColor3',
  TextColor: 'TextColor3',
  BorderColor: 'BorderColor3',
  ImageColor: 'ImageColor3',
  // PascalCase passthrough (LLM may use Roblox names directly)
  Size: 'Size',
  Position: 'Position',
  AnchorPoint: 'AnchorPoint',
  BackgroundColor3: 'BackgroundColor3',
  BackgroundTransparency: 'BackgroundTransparency',
  BorderSizePixel: 'BorderSizePixel',
  Text: 'Text',
  TextColor3: 'TextColor3',
  TextSize: 'TextSize',
  TextScaled: 'TextScaled',
  Font: 'Font',
  Image: 'Image',
  Visible: 'Visible',
  ZIndex: 'ZIndex',
  LayoutOrder: 'LayoutOrder',
  ClipDescendants: 'ClipDescendants',
  Rotation: 'Rotation',
  ResetOnSpawn: 'ResetOnSpawn',
  IgnoreGuiInset: 'IgnoreGuiInset',
  DisplayOrder: 'DisplayOrder',
  CornerRadius: 'CornerRadius',
  FillDirection: 'FillDirection',
  HorizontalAlignment: 'HorizontalAlignment',
  VerticalAlignment: 'VerticalAlignment',
  SortOrder: 'SortOrder',
  Padding: 'Padding',
  PaddingLeft: 'PaddingLeft',
  PaddingRight: 'PaddingRight',
  PaddingTop: 'PaddingTop',
  PaddingBottom: 'PaddingBottom',
  CellSize: 'CellSize',
  CellPadding: 'CellPadding',
  Thickness: 'Thickness',
  Color: 'Color',
  Transparency: 'Transparency',
};

/** Properties that should be encoded as UDim2 */
const UDIM2_PROPS = new Set([
  'Size', 'Position', 'CellSize', 'CellPadding', 'CanvasSize',
]);

/** Properties that should be encoded as UDim */
const UDIM_PROPS = new Set([
  'CornerRadius', 'Padding', 'PaddingLeft', 'PaddingRight', 'PaddingTop', 'PaddingBottom',
]);

/** Properties that should be encoded as Color3 */
const COLOR3_PROPS = new Set([
  'BackgroundColor3', 'TextColor3', 'BorderColor3', 'ImageColor3', 'Color',
]);

/** Properties that should be encoded as Vector2 */
const VECTOR2_PROPS = new Set(['AnchorPoint']);

/** Properties that are Enum types */
const ENUM_PROPS: Record<string, string> = {
  Font: 'Font',
  TextXAlignment: 'TextXAlignment',
  TextYAlignment: 'TextYAlignment',
  FillDirection: 'FillDirection',
  HorizontalAlignment: 'HorizontalAlignment',
  VerticalAlignment: 'VerticalAlignment',
  SortOrder: 'SortOrder',
  ScaleType: 'ScaleType',
  ZIndexBehavior: 'ZIndexBehavior',
};

const MAX_DEPTH = 15;

/** Roblox enum token values for rbxmx serialization */
const ENUM_TOKEN_VALUES: Record<string, Record<string, number>> = {
  Font: {
    Legacy: 0, Arial: 1, ArialBold: 2, SourceSans: 3, SourceSansBold: 4,
    SourceSansSemibold: 16, SourceSansLight: 5, SourceSansItalic: 6,
    Bodoni: 7, Garamond: 8, Cartoon: 9, Code: 10, Highway: 11, SciFi: 12,
    Arcade: 13, Fantasy: 14, Antique: 15, Gotham: 17, GothamMedium: 18,
    GothamBold: 19, GothamBlack: 20, AmaticSC: 21, Bangers: 22,
    Creepster: 23, DenkOne: 24, Fondamento: 25, FredokaOne: 26,
    GrenzeGotisch: 27, IndieFlower: 28, JosefinSans: 29, Jura: 30,
    Kalam: 31, LuckiestGuy: 32, Merriweather: 33, Michroma: 34,
    Nunito: 35, Oswald: 36, PatrickHand: 37, PermanentMarker: 38,
    Roboto: 39, RobotoCondensed: 40, RobotoMono: 41, Sarpanch: 42,
    SpecialElite: 43, TitilliumWeb: 44, Ubuntu: 45, BuilderSans: 46,
    BuilderSansMedium: 47, BuilderSansBold: 48, BuilderSansExtraBold: 49,
  },
  TextXAlignment: { Left: 0, Center: 2, Right: 1 },
  TextYAlignment: { Top: 0, Center: 1, Bottom: 2 },
  FillDirection: { Horizontal: 0, Vertical: 1 },
  HorizontalAlignment: { Center: 0, Left: 1, Right: 2 },
  VerticalAlignment: { Center: 0, Top: 1, Bottom: 2 },
  SortOrder: { Name: 0, Custom: 1, LayoutOrder: 2 },
  ScaleType: { Stretch: 0, Slice: 1, Tile: 2, Fit: 3, Crop: 4 },
  ZIndexBehavior: { Global: 0, Sibling: 1 },
  AutomaticSize: { None: 0, X: 1, Y: 2, XY: 3 },
  ScrollingDirection: { X: 1, Y: 2, XY: 4 },
};

// ---------------------------------------------------------------------------
// 1a. Parse & Validate
// ---------------------------------------------------------------------------

export function parseAndValidateUiJson(text: string): UiJsonNode {
  // Strip markdown fences
  let cleaned = text
    .replace(/^```(?:json|JSON)?\s*\n?/i, '')
    .replace(/\n?\s*```\s*$/i, '')
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    // Try extracting JSON from text
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      try {
        parsed = JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
      } catch {
        throw new Error('Failed to parse UI JSON from LLM output');
      }
    } else {
      throw new Error('No JSON object found in LLM output');
    }
  }

  const root = validateNode(parsed as Record<string, unknown>, 0);

  // Ensure root is ScreenGui
  if (root.type !== 'ScreenGui') {
    return {
      type: 'ScreenGui',
      name: 'GeneratedUI',
      props: { ResetOnSpawn: false, IgnoreGuiInset: true },
      children: [root],
    };
  }

  return root;
}

function validateNode(raw: Record<string, unknown>, depth: number): UiJsonNode {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid node: expected object');
  }

  const type = typeof raw.type === 'string' ? raw.type : 'Frame';
  const name = typeof raw.name === 'string' ? raw.name : type;
  const props = raw.props && typeof raw.props === 'object' ? raw.props as Record<string, unknown> : {};

  // Validate className
  if (!ALLOWED_CLASSES.has(type)) {
    console.warn(`Unknown UI class "${type}", replacing with Frame`);
  }
  const safeType = ALLOWED_CLASSES.has(type) ? type : 'Frame';

  let children: UiJsonNode[] = [];
  if (Array.isArray(raw.children) && depth < MAX_DEPTH) {
    children = (raw.children as Record<string, unknown>[])
      .filter(c => c && typeof c === 'object')
      .map(c => validateNode(c, depth + 1));
  }

  const bind = typeof raw.bind === 'string' ? raw.bind : undefined;
  return { type: safeType, name, props, children, bind };
}

// ---------------------------------------------------------------------------
// 1b. Convert to RobloxBuildSceneNode[]
// ---------------------------------------------------------------------------

export function convertUiJsonToSceneNodes(root: UiJsonNode): RobloxBuildSceneNode[] {
  const nodes: RobloxBuildSceneNode[] = [];
  flattenNode(root, undefined, nodes);
  return nodes;
}

function flattenNode(
  jsonNode: UiJsonNode,
  parentId: string | undefined,
  out: RobloxBuildSceneNode[],
): void {
  const id = uuidv4();
  const properties = convertProps(jsonNode.type, jsonNode.props ?? {});

  // Apply defaults
  applyDefaults(jsonNode.type, properties);

  // Always set Name
  properties.Name = jsonNode.name;

  const node: RobloxBuildSceneNode = { id, className: jsonNode.type, name: jsonNode.name, properties };
  if (parentId) node.parentId = parentId;
  if (jsonNode.bind) node.bind = jsonNode.bind;
  out.push(node);

  // Handle cornerRadius prop → inject UICorner child
  const rawCornerRadius = jsonNode.props?.cornerRadius ?? jsonNode.props?.CornerRadius;
  if (rawCornerRadius != null && jsonNode.type !== 'UICorner') {
    const offset = typeof rawCornerRadius === 'number' ? rawCornerRadius : 8;
    const cornerId = uuidv4();
    out.push({
      id: cornerId,
      className: 'UICorner',
      name: 'UICorner',
      parentId: id,
      properties: {
        Name: 'UICorner',
        CornerRadius: { __type: 'UDim', scale: 0, offset },
      },
    });
  }

  for (const child of jsonNode.children ?? []) {
    flattenNode(child, id, out);
  }
}

function convertProps(className: string, props: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(props)) {
    if (value == null) continue;
    // Skip cornerRadius — handled as UICorner child
    if (key === 'cornerRadius' || key === 'CornerRadius') continue;

    let robloxName = PROP_NAME_MAP[key] ?? key;

    // Fallback: if key not in map, check if key+"3" is a Color3 prop (e.g. "BackgroundColor" → "BackgroundColor3")
    if (!PROP_NAME_MAP[key] && typeof value === 'string' && value.startsWith('#')) {
      const withSuffix = key + '3';
      if (COLOR3_PROPS.has(withSuffix)) {
        robloxName = withSuffix;
      }
    }

    try {
      if (UDIM2_PROPS.has(robloxName)) {
        result[robloxName] = toUDim2(value);
      } else if (UDIM_PROPS.has(robloxName)) {
        result[robloxName] = toUDim(value);
      } else if (COLOR3_PROPS.has(robloxName)) {
        result[robloxName] = toColor3(value);
      } else if (VECTOR2_PROPS.has(robloxName)) {
        result[robloxName] = toVector2(value);
      } else if (ENUM_PROPS[robloxName]) {
        result[robloxName] = toEnum(ENUM_PROPS[robloxName], value);
      } else {
        // Pass through strings, numbers, booleans
        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
          result[robloxName] = value;
        }
      }
    } catch (err) {
      console.warn(`Skipping prop "${key}" on ${className}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return result;
}

function applyDefaults(className: string, props: Record<string, unknown>): void {
  if (className === 'ScreenGui') {
    if (props.ResetOnSpawn == null) props.ResetOnSpawn = false;
    if (props.IgnoreGuiInset == null) props.IgnoreGuiInset = true;
    if (props.ZIndexBehavior == null) props.ZIndexBehavior = { __type: 'Enum', enumType: 'ZIndexBehavior', enumName: 'Sibling' };
  }
  if (className === 'Frame' || className === 'ScrollingFrame') {
    if (props.BorderSizePixel == null) props.BorderSizePixel = 0;
  }
  if (className === 'TextLabel') {
    if (props.BackgroundTransparency == null) props.BackgroundTransparency = 1;
    if (props.TextColor3 == null) props.TextColor3 = { __type: 'Color3', r: 1, g: 1, b: 1 };
    if (props.BorderSizePixel == null) props.BorderSizePixel = 0;
  }
  if (className === 'TextButton') {
    if (props.BorderSizePixel == null) props.BorderSizePixel = 0;
  }
  if (className === 'ImageLabel') {
    if (props.BackgroundTransparency == null) props.BackgroundTransparency = 1;
    if (props.BorderSizePixel == null) props.BorderSizePixel = 0;
  }
}

// ---------------------------------------------------------------------------
// Type converters
// ---------------------------------------------------------------------------

function toUDim2(value: unknown): Record<string, unknown> {
  if (Array.isArray(value) && value.length >= 4) {
    return { __type: 'UDim2', xScale: value[0], xOffset: value[1], yScale: value[2], yOffset: value[3] };
  }
  if (typeof value === 'object' && value !== null) {
    const v = value as Record<string, unknown>;
    if (v.__type === 'UDim2') return v;
    return {
      __type: 'UDim2',
      xScale: v.xScale ?? v.scaleX ?? 0,
      xOffset: v.xOffset ?? v.offsetX ?? 0,
      yScale: v.yScale ?? v.scaleY ?? 0,
      yOffset: v.yOffset ?? v.offsetY ?? 0,
    };
  }
  throw new Error(`Invalid UDim2 value: ${JSON.stringify(value)}`);
}

function toUDim(value: unknown): Record<string, unknown> {
  if (typeof value === 'number') {
    return { __type: 'UDim', scale: 0, offset: value };
  }
  if (Array.isArray(value) && value.length >= 2) {
    return { __type: 'UDim', scale: value[0], offset: value[1] };
  }
  if (typeof value === 'object' && value !== null) {
    const v = value as Record<string, unknown>;
    if (v.__type === 'UDim') return v;
    return { __type: 'UDim', scale: v.scale ?? 0, offset: v.offset ?? 0 };
  }
  throw new Error(`Invalid UDim value: ${JSON.stringify(value)}`);
}

function toColor3(value: unknown): Record<string, unknown> {
  if (typeof value === 'string') {
    return hexToColor3(value);
  }
  if (Array.isArray(value) && value.length >= 3) {
    // Detect 0-255 range vs 0-1
    const max = Math.max(value[0] as number, value[1] as number, value[2] as number);
    if (max > 1) {
      return { __type: 'Color3', r: (value[0] as number) / 255, g: (value[1] as number) / 255, b: (value[2] as number) / 255 };
    }
    return { __type: 'Color3', r: value[0], g: value[1], b: value[2] };
  }
  if (typeof value === 'object' && value !== null) {
    const v = value as Record<string, unknown>;
    if (v.__type === 'Color3') return v;
    return { __type: 'Color3', r: v.r ?? 0, g: v.g ?? 0, b: v.b ?? 0 };
  }
  throw new Error(`Invalid Color3 value: ${JSON.stringify(value)}`);
}

function hexToColor3(hex: string): Record<string, unknown> {
  let h = hex.replace(/^#/, '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const num = parseInt(h, 16);
  return {
    __type: 'Color3',
    r: ((num >> 16) & 255) / 255,
    g: ((num >> 8) & 255) / 255,
    b: (num & 255) / 255,
  };
}

function toVector2(value: unknown): Record<string, unknown> {
  if (Array.isArray(value) && value.length >= 2) {
    return { __type: 'Vector2', x: value[0], y: value[1] };
  }
  if (typeof value === 'object' && value !== null) {
    const v = value as Record<string, unknown>;
    if (v.__type === 'Vector2') return v;
    return { __type: 'Vector2', x: v.x ?? 0, y: v.y ?? 0 };
  }
  throw new Error(`Invalid Vector2 value: ${JSON.stringify(value)}`);
}

function toEnum(enumType: string, value: unknown): Record<string, unknown> {
  if (typeof value === 'string') {
    return { __type: 'Enum', enumType, enumName: value };
  }
  if (typeof value === 'object' && value !== null) {
    const v = value as Record<string, unknown>;
    if (v.__type === 'Enum') return v;
  }
  throw new Error(`Invalid Enum value for ${enumType}: ${JSON.stringify(value)}`);
}

// ---------------------------------------------------------------------------
// 1c. Build .rbxmx XML with real instances
// ---------------------------------------------------------------------------

export function buildUiInstanceRbxmx(nodes: RobloxBuildSceneNode[]): string {
  // Build parent→children map
  const childrenMap = new Map<string | undefined, RobloxBuildSceneNode[]>();
  const nodeById = new Map<string, RobloxBuildSceneNode>();

  for (const node of nodes) {
    nodeById.set(node.id, node);
    const pid = node.parentId ?? undefined;
    if (!childrenMap.has(pid)) childrenMap.set(pid, []);
    childrenMap.get(pid)!.push(node);
  }

  // Find root nodes (no parentId)
  const roots = childrenMap.get(undefined) ?? [];
  let refCounter = 1;

  function nextRef(): string {
    return `RBX${String(refCounter++).padStart(4, '0')}`;
  }

  // Generate binding script for real game data
  const bindingCode = generateBindingScript(nodes);

  function renderNode(node: RobloxBuildSceneNode): string {
    const children = childrenMap.get(node.id) ?? [];
    const propsXml = renderProperties(node);
    const childrenXml = children.map(c => renderNode(c)).join('\n');

    // Inject LocalScript inside ScreenGui
    let scriptXml = '';
    if (node.className === 'ScreenGui' && bindingCode) {
      scriptXml = `\t\t<Item class="LocalScript" referent="${nextRef()}">
\t\t\t<Properties>
\t\t\t\t<string name="Name">DataBindings</string>
\t\t\t\t<ProtectedString name="Source"><![CDATA[${bindingCode}]]></ProtectedString>
\t\t\t</Properties>
\t\t</Item>`;
    }

    return `\t<Item class="${escapeXml(node.className)}" referent="${nextRef()}">
\t\t<Properties>
${propsXml}
\t\t</Properties>
${childrenXml}
${scriptXml}
\t</Item>`;
  }

  const body = roots.map(r => renderNode(r)).join('\n');

  return `<roblox xmlns:xmime="http://www.w3.org/2005/05/xmlmime" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="http://www.roblox.com/roblox.xsd" version="4">
${body}
</roblox>`;
}

function renderProperties(node: RobloxBuildSceneNode): string {
  const props = node.properties ?? {};
  const lines: string[] = [];

  for (const [key, value] of Object.entries(props)) {
    if (value == null) continue;
    const xml = renderPropertyValue(key, value);
    if (xml) lines.push(xml);
  }

  return lines.join('\n');
}

function renderPropertyValue(name: string, value: unknown): string | null {
  if (value == null) return null;

  // Typed objects
  if (typeof value === 'object' && !Array.isArray(value)) {
    const v = value as Record<string, unknown>;
    if (v.__type === 'UDim2') {
      return `\t\t\t<UDim2 name="${escapeXml(name)}">
\t\t\t\t<XS>${v.xScale ?? 0}</XS>
\t\t\t\t<XO>${v.xOffset ?? 0}</XO>
\t\t\t\t<YS>${v.yScale ?? 0}</YS>
\t\t\t\t<YO>${v.yOffset ?? 0}</YO>
\t\t\t</UDim2>`;
    }
    if (v.__type === 'UDim') {
      return `\t\t\t<UDim name="${escapeXml(name)}">
\t\t\t\t<S>${v.scale ?? 0}</S>
\t\t\t\t<O>${v.offset ?? 0}</O>
\t\t\t</UDim>`;
    }
    if (v.__type === 'Color3') {
      return `\t\t\t<Color3 name="${escapeXml(name)}">
\t\t\t\t<R>${v.r ?? 0}</R>
\t\t\t\t<G>${v.g ?? 0}</G>
\t\t\t\t<B>${v.b ?? 0}</B>
\t\t\t</Color3>`;
    }
    if (v.__type === 'Vector2') {
      return `\t\t\t<Vector2 name="${escapeXml(name)}">
\t\t\t\t<X>${v.x ?? 0}</X>
\t\t\t\t<Y>${v.y ?? 0}</Y>
\t\t\t</Vector2>`;
    }
    if (v.__type === 'Enum') {
      const enumType = v.enumType as string;
      const enumName = v.enumName as string;
      const tokenMap = ENUM_TOKEN_VALUES[enumType];
      if (tokenMap && tokenMap[enumName] != null) {
        return `\t\t\t<token name="${escapeXml(name)}">${tokenMap[enumName]}</token>`;
      }
      // Fallback: skip unknown enums rather than output invalid XML
      console.warn(`Unknown enum value: Enum.${enumType}.${enumName}`);
      return null;
    }
    return null;
  }

  // Primitives
  if (typeof value === 'string') {
    return `\t\t\t<string name="${escapeXml(name)}">${escapeXml(value)}</string>`;
  }
  if (typeof value === 'number') {
    if (Number.isInteger(value)) {
      return `\t\t\t<int name="${escapeXml(name)}">${value}</int>`;
    }
    return `\t\t\t<float name="${escapeXml(name)}">${value}</float>`;
  }
  if (typeof value === 'boolean') {
    return `\t\t\t<bool name="${escapeXml(name)}">${value}</bool>`;
  }

  return null;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ---------------------------------------------------------------------------
// 1c-bis. Generate binding LocalScript for real game data
// ---------------------------------------------------------------------------

/**
 * Collects bindings from nodes: first from explicit `bind` field,
 * then falls back to regex on node names for backward compatibility.
 */
function collectBindings(nodes: RobloxBuildSceneNode[]): Array<{ nodeName: string; kind: string; statName?: string }> {
  const bindings: Array<{ nodeName: string; kind: string; statName?: string }> = [];
  const boundNames = new Set<string>();

  // 1. Explicit bind field (priority)
  for (const node of nodes) {
    if (!node.bind) continue;
    const b = node.bind;
    boundNames.add(node.name);

    if (b === 'health.fill') {
      bindings.push({ nodeName: node.name, kind: 'healthFill' });
    } else if (b === 'health.text') {
      bindings.push({ nodeName: node.name, kind: 'healthText' });
    } else if (b === 'player.name') {
      bindings.push({ nodeName: node.name, kind: 'playerName' });
    } else if (b === 'timer') {
      bindings.push({ nodeName: node.name, kind: 'timerText' });
    } else if (b === 'backpack') {
      bindings.push({ nodeName: node.name, kind: 'backpack' });
    } else if (b.startsWith('leaderstats.') && b.endsWith('.fill')) {
      // e.g. "leaderstats.XP.fill"
      const statName = b.replace('leaderstats.', '').replace('.fill', '');
      bindings.push({ nodeName: node.name, kind: 'statFill', statName });
    } else if (b.startsWith('leaderstats.')) {
      // e.g. "leaderstats.Coins"
      const statName = b.replace('leaderstats.', '');
      bindings.push({ nodeName: node.name, kind: 'statText', statName });
    }
  }

  // 2. Regex fallback for nodes without explicit bind
  const PATTERNS: Array<{ regex: RegExp; kind: string; statName?: string }> = [
    { regex: /health.*fill|hp.*fill|life.*fill/i, kind: 'healthFill' },
    { regex: /health.*text|health.*label|hp.*text|hp.*label|health.*value|hp.*value/i, kind: 'healthText' },
    { regex: /coin.*(?:count|text|label|value|amount)/i, kind: 'statText', statName: 'Coins' },
    { regex: /gold.*(?:count|text|label|value|amount)/i, kind: 'statText', statName: 'Gold' },
    { regex: /gem.*(?:count|text|label|value|amount)|diamond.*(?:count|text|label|value|amount)/i, kind: 'statText', statName: 'Gems' },
    { regex: /xp.*fill|exp.*fill|experience.*fill/i, kind: 'statFill', statName: 'XP' },
    { regex: /xp.*(?:text|label|value|amount)|exp.*(?:text|label|value|amount)/i, kind: 'statText', statName: 'XP' },
    { regex: /level.*(?:text|label|value|number)|lv.*(?:text|label|value)/i, kind: 'statText', statName: 'Level' },
    { regex: /player.*name|username/i, kind: 'playerName' },
    { regex: /timer.*(?:text|label|value)|countdown|time.*(?:text|label|value)/i, kind: 'timerText' },
  ];

  for (const node of nodes) {
    if (boundNames.has(node.name)) continue; // already bound explicitly
    for (const pat of PATTERNS) {
      if (pat.regex.test(node.name)) {
        bindings.push({ nodeName: node.name, kind: pat.kind, statName: pat.statName });
        boundNames.add(node.name);
        break;
      }
    }
  }

  return bindings;
}

/**
 * Generates a LocalScript that wires UI elements to real game data.
 * Uses explicit `bind` field first, falls back to regex on node names.
 */
export function generateBindingScript(nodes: RobloxBuildSceneNode[]): string | null {
  const bindings = collectBindings(nodes);
  if (bindings.length === 0) return null;

  const lines: string[] = [
    '-- Auto-generated binding script: connects UI to real game data',
    '-- Placed inside ScreenGui; finds elements by name',
    '',
    'local Players = game:GetService("Players")',
    'local player = Players.LocalPlayer',
    'local gui = script.Parent',
    '',
    '-- Helper: find a descendant by name',
    'local function find(name)',
    '\treturn gui:FindFirstChild(name, true)',
    'end',
    '',
    '-- Helper: format number with commas',
    'local function formatNumber(n)',
    '\tlocal s = tostring(math.floor(n))',
    '\tlocal result = ""',
    '\tfor i = #s, 1, -1 do',
    '\t\tresult = s:sub(i, i) .. result',
    '\t\tif (#s - i + 1) % 3 == 0 and i > 1 then',
    '\t\t\tresult = "," .. result',
    '\t\tend',
    '\tend',
    '\treturn result',
    'end',
    '',
  ];

  // Reset placeholder text immediately
  lines.push('-- Reset placeholder text to loading state');
  for (const b of bindings) {
    if (b.kind === 'healthText') {
      lines.push(`do local e = find("${b.nodeName}"); if e then e.Text = "--- / ---" end end`);
    } else if (b.kind === 'statText') {
      lines.push(`do local e = find("${b.nodeName}"); if e then e.Text = "0" end end`);
    } else if (b.kind === 'healthFill' || b.kind === 'statFill') {
      lines.push(`do local e = find("${b.nodeName}"); if e then e.Size = UDim2.new(0, 0, 1, 0) end end`);
    }
  }
  lines.push('');

  // Collect data sources needed
  const needsHealth = bindings.some(b => b.kind === 'healthFill' || b.kind === 'healthText');
  const statBindings = bindings.filter(b => b.kind === 'statText' || b.kind === 'statFill');
  const needsLeaderstats = statBindings.length > 0;
  const needsPlayerName = bindings.some(b => b.kind === 'playerName');

  // Humanoid helper
  if (needsHealth) {
    lines.push('-- Wait for character and humanoid');
    lines.push('local function getHumanoid()');
    lines.push('\tlocal char = player.Character or player.CharacterAdded:Wait()');
    lines.push('\treturn char:WaitForChild("Humanoid")');
    lines.push('end');
    lines.push('');
  }

  // Leaderstats
  if (needsLeaderstats) {
    lines.push('-- Wait for leaderstats');
    lines.push('local leaderstats = player:WaitForChild("leaderstats", 10)');
    lines.push('');
  }

  // Player name
  if (needsPlayerName) {
    const pn = bindings.find(b => b.kind === 'playerName')!;
    lines.push('-- Player name');
    lines.push(`local playerNameLabel = find("${pn.nodeName}")`);
    lines.push('if playerNameLabel then playerNameLabel.Text = player.DisplayName end');
    lines.push('');
  }

  // Health bindings
  if (needsHealth) {
    lines.push('-- Health binding');
    lines.push('task.spawn(function()');
    lines.push('\tlocal humanoid = getHumanoid()');

    const healthFill = bindings.find(b => b.kind === 'healthFill');
    const healthText = bindings.find(b => b.kind === 'healthText');

    if (healthFill) lines.push(`\tlocal healthFill = find("${healthFill.nodeName}")`);
    if (healthText) lines.push(`\tlocal healthText = find("${healthText.nodeName}")`);

    lines.push('');
    lines.push('\tlocal function updateHealth()');
    lines.push('\t\tlocal hp = humanoid.Health');
    lines.push('\t\tlocal maxHp = humanoid.MaxHealth');
    lines.push('\t\tlocal pct = math.clamp(hp / maxHp, 0, 1)');
    if (healthFill) {
      lines.push('\t\tif healthFill then healthFill.Size = UDim2.new(pct, 0, 1, 0) end');
    }
    if (healthText) {
      lines.push('\t\tif healthText then healthText.Text = math.floor(hp) .. " / " .. math.floor(maxHp) end');
    }
    lines.push('\tend');
    lines.push('');
    lines.push('\thumanoid.HealthChanged:Connect(updateHealth)');
    lines.push('\tupdateHealth()');
    lines.push('');
    lines.push('\tplayer.CharacterAdded:Connect(function(char)');
    lines.push('\t\thumanoid = char:WaitForChild("Humanoid")');
    lines.push('\t\thumanoid.HealthChanged:Connect(updateHealth)');
    lines.push('\t\tupdateHealth()');
    lines.push('\tend)');
    lines.push('end)');
    lines.push('');
  }

  // Leaderstats bindings
  if (needsLeaderstats) {
    lines.push('-- Leaderstats bindings');
    lines.push('if leaderstats then');

    let varIdx = 0;
    for (const sb of statBindings) {
      const varName = `el${varIdx++}`;
      const sn = sb.statName!;
      lines.push(`\tlocal ${varName} = find("${sb.nodeName}")`);
      lines.push(`\tlocal stat_${varName} = leaderstats:FindFirstChild("${sn}")`);
      lines.push(`\tif ${varName} and stat_${varName} then`);

      if (sb.kind === 'statFill') {
        lines.push(`\t\tlocal function upd_${varName}()`);
        lines.push(`\t\t\tlocal val = stat_${varName}.Value`);
        lines.push(`\t\t\tlocal levelStat = leaderstats:FindFirstChild("Level") or leaderstats:FindFirstChild("Lv")`);
        lines.push(`\t\t\tlocal maxVal = levelStat and (levelStat.Value * 100) or 100`);
        lines.push(`\t\t\t${varName}.Size = UDim2.new(math.clamp(val / math.max(maxVal, 1), 0, 1), 0, 1, 0)`);
        lines.push(`\t\tend`);
        lines.push(`\t\tstat_${varName}.Changed:Connect(upd_${varName})`);
        lines.push(`\t\tupd_${varName}()`);
      } else {
        lines.push(`\t\tlocal function upd_${varName}()`);
        lines.push(`\t\t\t${varName}.Text = formatNumber(stat_${varName}.Value)`);
        lines.push(`\t\tend`);
        lines.push(`\t\tstat_${varName}.Changed:Connect(upd_${varName})`);
        lines.push(`\t\tupd_${varName}()`);
      }

      lines.push('\tend');
      lines.push('');
    }

    lines.push('end');
    lines.push('');
  }

  // Timer
  const timerBind = bindings.find(b => b.kind === 'timerText');
  if (timerBind) {
    lines.push('-- Timer (counts up from 0)');
    lines.push(`local timerLabel = find("${timerBind.nodeName}")`);
    lines.push('if timerLabel then');
    lines.push('\tlocal startTime = tick()');
    lines.push('\ttask.spawn(function()');
    lines.push('\t\twhile timerLabel and timerLabel.Parent do');
    lines.push('\t\t\tlocal elapsed = math.floor(tick() - startTime)');
    lines.push('\t\t\ttimerLabel.Text = string.format("%02d:%02d", math.floor(elapsed / 60), elapsed % 60)');
    lines.push('\t\t\ttask.wait(1)');
    lines.push('\t\tend');
    lines.push('\tend)');
    lines.push('end');
    lines.push('');
  }

  // Backpack / Inventory binding
  const backpackBind = bindings.find(b => b.kind === 'backpack');
  if (backpackBind) {
    lines.push('-- Backpack / Inventory binding');
    lines.push(`local inventoryContainer = find("${backpackBind.nodeName}")`);
    lines.push('if inventoryContainer then');
    lines.push('\tlocal backpack = player:WaitForChild("Backpack")');
    lines.push('');
    lines.push('\tlocal function updateInventory()');
    lines.push('\t\t-- Clear existing slot content');
    lines.push('\t\tfor _, slot in ipairs(inventoryContainer:GetChildren()) do');
    lines.push('\t\t\tif slot:IsA("Frame") then');
    lines.push('\t\t\t\tlocal icon = slot:FindFirstChild("ItemIcon") or slot:FindFirstChildWhichIsA("ImageLabel")');
    lines.push('\t\t\t\tlocal qty = slot:FindFirstChild("Quantity") or slot:FindFirstChild("QtyBadge") or slot:FindFirstChild("Count")');
    lines.push('\t\t\t\tif icon then icon.Image = "" end');
    lines.push('\t\t\t\tif qty then qty.Text = "" end');
    lines.push('\t\t\tend');
    lines.push('\t\tend');
    lines.push('');
    lines.push('\t\t-- Fill slots with backpack tools');
    lines.push('\t\tlocal tools = backpack:GetChildren()');
    lines.push('\t\tlocal slots = {}');
    lines.push('\t\tfor _, child in ipairs(inventoryContainer:GetChildren()) do');
    lines.push('\t\t\tif child:IsA("Frame") then table.insert(slots, child) end');
    lines.push('\t\tend');
    lines.push('\t\ttable.sort(slots, function(a, b) return a.LayoutOrder < b.LayoutOrder end)');
    lines.push('');
    lines.push('\t\tfor i, tool in ipairs(tools) do');
    lines.push('\t\t\tif i > #slots then break end');
    lines.push('\t\t\tlocal slot = slots[i]');
    lines.push('\t\t\tlocal icon = slot:FindFirstChild("ItemIcon") or slot:FindFirstChildWhichIsA("ImageLabel")');
    lines.push('\t\t\tlocal nameLabel = slot:FindFirstChild("ItemName") or slot:FindFirstChildWhichIsA("TextLabel")');
    lines.push('\t\t\tif icon and tool.TextureId ~= "" then icon.Image = tool.TextureId end');
    lines.push('\t\t\tif nameLabel then nameLabel.Text = tool.Name end');
    lines.push('\t\tend');
    lines.push('\tend');
    lines.push('');
    lines.push('\tbackpack.ChildAdded:Connect(updateInventory)');
    lines.push('\tbackpack.ChildRemoved:Connect(updateInventory)');
    lines.push('\tupdateInventory()');
    lines.push('end');
    lines.push('');
  }

  // Close button binding — find any button named with "Close" or "X" pattern
  const closeButtons = nodes.filter(n =>
    /close|CloseBtn|closeButton/i.test(n.name) && (n.className === 'TextButton' || n.className === 'ImageButton'),
  );
  if (closeButtons.length > 0) {
    lines.push('-- Close button: hides the entire ScreenGui');
    for (const cb of closeButtons) {
      lines.push(`do local btn = find("${cb.name}"); if btn then btn.MouseButton1Click:Connect(function() gui.Enabled = false end) end end`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// 1c-ter. Generate server-side leaderstats Script
// ---------------------------------------------------------------------------

/**
 * Generates a server Script that creates leaderstats matching what the UI expects.
 * Uses collectBindings() to determine which stats are needed.
 */
export function generateLeaderstatsScript(nodes: RobloxBuildSceneNode[]): string | null {
  const bindings = collectBindings(nodes);

  // Collect unique stat names from bindings
  const DEFAULT_VALUES: Record<string, number> = { Level: 1 };
  const neededStats = new Map<string, number>();

  for (const b of bindings) {
    if ((b.kind === 'statText' || b.kind === 'statFill') && b.statName) {
      if (!neededStats.has(b.statName)) {
        neededStats.set(b.statName, DEFAULT_VALUES[b.statName] ?? 0);
      }
    }
  }

  if (neededStats.size === 0) return null;

  const lines: string[] = [
    '-- Server-side leaderstats script',
    '-- Place this Script in ServerScriptService',
    '-- It creates the stats that the HUD reads from',
    '',
    'local Players = game:GetService("Players")',
    '',
    'Players.PlayerAdded:Connect(function(player)',
    '\tlocal leaderstats = Instance.new("Folder")',
    '\tleaderstats.Name = "leaderstats"',
    '\tleaderstats.Parent = player',
    '',
  ];

  for (const [statName, defaultVal] of neededStats) {
    lines.push(`\tlocal ${statName.toLowerCase()} = Instance.new("IntValue")`);
    lines.push(`\t${statName.toLowerCase()}.Name = "${statName}"`);
    lines.push(`\t${statName.toLowerCase()}.Value = ${defaultVal}`);
    lines.push(`\t${statName.toLowerCase()}.Parent = leaderstats`);
    lines.push('');
  }

  lines.push('end)');
  lines.push('');
  lines.push('-- To change a stat from another server script:');
  lines.push('-- game.Players.SomePlayer.leaderstats.Coins.Value = 100');
  lines.push('-- The HUD will update automatically via .Changed events');

  return lines.join('\n');
}

/**
 * Wraps a server Script in .rbxmx format for ServerScriptService.
 */
export function wrapServerScriptAsRbxmx(luaCode: string, scriptName: string): string {
  return `<roblox xmlns:xmime="http://www.w3.org/2005/05/xmlmime" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="http://www.roblox.com/roblox.xsd" version="4">
\t<Item class="Script" referent="RBX0001">
\t\t<Properties>
\t\t\t<string name="Name">${escapeXml(scriptName)}</string>
\t\t\t<ProtectedString name="Source"><![CDATA[${luaCode}]]></ProtectedString>
\t\t\t<token name="RunContext">1</token>
\t\t</Properties>
\t</Item>
</roblox>`;
}

// ---------------------------------------------------------------------------
// 1d. Convert scene nodes to Lua code (for "Copy Code" feature)
// ---------------------------------------------------------------------------

export function convertSceneNodesToLua(nodes: RobloxBuildSceneNode[]): string {
  // Build tree from flat nodes
  const childrenMap = new Map<string | undefined, RobloxBuildSceneNode[]>();
  for (const node of nodes) {
    const pid = node.parentId ?? undefined;
    if (!childrenMap.has(pid)) childrenMap.set(pid, []);
    childrenMap.get(pid)!.push(node);
  }

  const roots = childrenMap.get(undefined) ?? [];
  const usedVars = new Map<string, number>();
  const lines: string[] = [
    '-- Auto-generated UI code',
    '-- Paste into a LocalScript under StarterGui or StarterPlayerScripts',
    '',
    'local Players = game:GetService("Players")',
    'local player = Players.LocalPlayer',
    '',
  ];

  function varName(name: string): string {
    // Convert to camelCase
    let v = name.replace(/[^a-zA-Z0-9]/g, '');
    if (!v) v = 'element';
    v = v[0].toLowerCase() + v.slice(1);
    const count = usedVars.get(v) ?? 0;
    usedVars.set(v, count + 1);
    return count === 0 ? v : `${v}_${count + 1}`;
  }

  function luaValue(propName: string, value: unknown): string | null {
    if (value == null) return null;

    if (typeof value === 'object' && !Array.isArray(value)) {
      const v = value as Record<string, unknown>;
      if (v.__type === 'UDim2') {
        return `UDim2.new(${v.xScale ?? 0}, ${v.xOffset ?? 0}, ${v.yScale ?? 0}, ${v.yOffset ?? 0})`;
      }
      if (v.__type === 'UDim') {
        return `UDim.new(${v.scale ?? 0}, ${v.offset ?? 0})`;
      }
      if (v.__type === 'Color3') {
        return `Color3.new(${v.r ?? 0}, ${v.g ?? 0}, ${v.b ?? 0})`;
      }
      if (v.__type === 'Vector2') {
        return `Vector2.new(${v.x ?? 0}, ${v.y ?? 0})`;
      }
      if (v.__type === 'Enum') {
        return `Enum.${v.enumType}.${v.enumName}`;
      }
      return null;
    }
    if (typeof value === 'string') {
      return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    return null;
  }

  function emitNode(node: RobloxBuildSceneNode, parentVar: string | null): void {
    const v = varName(node.name);
    const children = childrenMap.get(node.id) ?? [];

    if (node.className === 'ScreenGui' && !parentVar) {
      // Root ScreenGui
      lines.push(`local ${v} = Instance.new("ScreenGui")`);
      lines.push(`${v}.Name = "${node.name.replace(/"/g, '\\"')}"`);

      const props = node.properties ?? {};
      for (const [key, val] of Object.entries(props)) {
        if (key === 'Name') continue;
        const lua = luaValue(key, val);
        if (lua) lines.push(`${v}.${key} = ${lua}`);
      }

      lines.push(`${v}.Parent = player:WaitForChild("PlayerGui")`);
      lines.push('');

      for (const child of children) {
        emitNode(child, v);
      }
    } else {
      lines.push(`local ${v} = Instance.new("${node.className}")`);
      lines.push(`${v}.Name = "${node.name.replace(/"/g, '\\"')}"`);

      const props = node.properties ?? {};
      for (const [key, val] of Object.entries(props)) {
        if (key === 'Name') continue;
        const lua = luaValue(key, val);
        if (lua) lines.push(`${v}.${key} = ${lua}`);
      }

      if (parentVar) {
        lines.push(`${v}.Parent = ${parentVar}`);
      }
      lines.push('');

      for (const child of children) {
        emitNode(child, v);
      }
    }
  }

  for (const root of roots) {
    emitNode(root, null);
  }

  return lines.join('\n');
}
