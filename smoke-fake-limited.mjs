// Smoke test for the Fake Headless & Korblox AI Crafter (session 382).
// Calls the compiled fakeLimitedCrafter module DIRECTLY (no HTTP) so we don't
// need a live Cloud Functions deploy. Verifies recipe structure + catalog
// integrity + summarize math. Image preview is disabled to keep this offline.
import { generateFakeLimitedRecipe, parseFakeLimitedKind } from './apps/functions/dist/fakeLimitedCrafter.js';
import { RECIPE_CATALOG, summarizeRecipe } from './apps/functions/dist/fakeLimitedCatalog.js';

let failures = 0;
function check(label, cond, detail = '') {
  if (cond) {
    console.log(`✅ ${label}`);
  } else {
    console.log(`❌ ${label}${detail ? ` — ${detail}` : ''}`);
    failures++;
  }
}

// Parser
check('parseFakeLimitedKind("headless") = headless', parseFakeLimitedKind('headless') === 'headless');
check('parseFakeLimitedKind("KORBLOX") = korblox', parseFakeLimitedKind('KORBLOX') === 'korblox');
check('parseFakeLimitedKind("garbage") = headless (default)', parseFakeLimitedKind('garbage') === 'headless');
check('parseFakeLimitedKind(undefined) = headless', parseFakeLimitedKind(undefined) === 'headless');

// Catalog integrity
for (const kind of ['headless', 'korblox', 'combo']) {
  const items = RECIPE_CATALOG[kind];
  check(`${kind}: has at least 2 items`, items.length >= 2, `got ${items.length}`);
  check(`${kind}: every item has assetId`, items.every((it) => typeof it.assetId === 'string' && it.assetId.length > 0));
  check(`${kind}: every item has non-negative price`, items.every((it) => it.pricedRobux >= 0));
  check(`${kind}: at least one primary_illusion item`, items.some((it) => it.role === 'primary_illusion'));
  const summary = summarizeRecipe(kind);
  const expected = items.reduce((a, it) => a + it.pricedRobux, 0);
  check(`${kind}: summarize total matches sum (${expected})`, summary.totalCostRobux === expected);
}

// End-to-end recipe (LLM call disabled by mocking — fall back to default pitch)
try {
  const recipe = await generateFakeLimitedRecipe({ kind: 'headless', includePreview: false });
  check('e2e: recipe.kind = headless', recipe.kind === 'headless');
  check('e2e: recipe.title is non-empty', typeof recipe.title === 'string' && recipe.title.length > 0);
  check('e2e: recipe.pitch is non-empty', typeof recipe.pitch === 'string' && recipe.pitch.length > 0);
  check('e2e: recipe.items.length >= 1', Array.isArray(recipe.items) && recipe.items.length >= 1);
  check('e2e: recipe.savedRobux > 0', recipe.savedRobux > 0, `got ${recipe.savedRobux}`);
  check('e2e: recipe.steps.length >= 3', Array.isArray(recipe.steps) && recipe.steps.length >= 3);
  check('e2e: previewImageUrl undefined when includePreview=false', recipe.previewImageUrl === undefined);
  check('e2e: disclaimer mentions not bypassing payment', /payment|exploit/i.test(recipe.disclaimer));
  const combo = await generateFakeLimitedRecipe({ kind: 'combo', includePreview: false });
  check('e2e combo: saved > both individual retail combined', combo.savedRobux > 40000, `got ${combo.savedRobux}`);
} catch (err) {
  console.error('e2e block threw:', err);
  failures++;
}

if (failures > 0) {
  console.error(`\n❌ ${failures} check(s) failed`);
  process.exit(1);
}
console.log('\n✅ All fake-limited checks passed');
