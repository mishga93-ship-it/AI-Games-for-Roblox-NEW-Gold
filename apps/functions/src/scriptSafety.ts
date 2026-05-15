import type { LuaScriptAnalysis, ModerationCheckResponse } from './types.js';

const servicePattern = /game:GetService\(\s*["']([^"']+)["']\s*\)/g;
const functionPattern = /\bfunction\s+([A-Za-z0-9_:.]+)\s*\(/g;

const blockedSignals = [
  { token: 'loadstring', reason: 'Dynamic code execution is not allowed.' },
  { token: 'getfenv', reason: 'Environment access is unsafe for Roblox export.' },
  { token: 'setfenv', reason: 'Environment mutation is unsafe for Roblox export.' },
  { token: 'HttpGet(', reason: 'Raw HttpGet usage must be reviewed before export.' },
  { token: 'require(0', reason: 'Untrusted asset requires are blocked.' },
];

const reviewSignals = [
  { token: 'FireServer(', reason: 'RemoteEvent fire should be validated for abuse resistance.' },
  { token: 'InvokeServer(', reason: 'RemoteFunction invoke should be validated for abuse resistance.' },
  { token: 'DataStoreService', reason: 'DataStore usage needs error handling and budget review.' },
  { token: 'MarketplaceService', reason: 'Monetization flow needs publishing review.' },
  { token: 'TeleportService', reason: 'Teleport flow should be validated in live environments.' },
];

export function analyzeLuauSource(source: string, path = 'script.lua'): LuaScriptAnalysis {
  const services = collectMatches(source, servicePattern);
  const functions = collectMatches(source, functionPattern);
  const warnings = [
    ...blockedSignals
      .filter((signal) => source.includes(signal.token))
      .map((signal) => signal.reason),
    ...reviewSignals
      .filter((signal) => source.includes(signal.token))
      .map((signal) => signal.reason),
  ];

  return {
    path,
    lineCount: source.split('\n').length,
    services,
    functions,
    warnings,
    suggestedFixes: buildSuggestedFixes(source),
  };
}

export function moderateLuaSource(source: string): ModerationCheckResponse | null {
  const blocked = blockedSignals.find((signal) => source.includes(signal.token));
  if (blocked) {
    return {
      allowed: false,
      reason: blocked.reason,
      provider: 'script-analyzer',
      severity: 'blocked',
      action: 'block',
      category: 'script_safety',
      flags: [blocked.token],
    };
  }

  const reviewMatches = reviewSignals
    .filter((signal) => source.includes(signal.token))
    .map((signal) => signal.token);
  if (reviewMatches.length > 0) {
    return {
      allowed: true,
      reason: 'Script contains behaviors that require manual or asynchronous review.',
      provider: 'script-analyzer',
      severity: 'review',
      action: 'review',
      category: 'script_safety',
      flags: reviewMatches,
    };
  }

  return null;
}

function collectMatches(source: string, pattern: RegExp): string[] {
  const values = new Set<string>();
  for (const match of source.matchAll(pattern)) {
    const value = typeof match[1] === 'string' ? match[1].trim() : '';
    if (value) {
      values.add(value);
    }
  }
  return [...values];
}

function buildSuggestedFixes(source: string): string[] {
  const fixes: string[] = [];
  if (!source.includes('pcall(') && source.includes('DataStoreService')) {
    fixes.push('Wrap DataStore calls with pcall and retry/backoff handling.');
  }
  if (!source.includes('task.wait(') && source.includes('while true do')) {
    fixes.push('Add yielding inside infinite loops to avoid frame starvation.');
  }
  if (source.includes('RemoteEvent') && !source.includes('Player')) {
    fixes.push('Validate the firing player and sanitize remote payloads.');
  }
  if (fixes.length === 0) {
    fixes.push('Script passed baseline static checks. Add gameplay-specific tests before publish.');
  }
  return fixes;
}
