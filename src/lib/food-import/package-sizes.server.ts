// AI step for package sizes (see package-sizes.ts). Server-only. Never throws: no candidates = no sizes (the food
// counts servings), and an AI error or a slow answer falls back to fixed rules so adding a food never waits on it.
import { askClaude } from './claude.server';
import { SIZES_SYSTEM, SIZES_TOOL, fallbackRows, forStyle, packageRows, sizesPrompt, type AiSize, type PackageRow, type SizeCandidate } from './package-sizes';

const SIZES_TIMEOUT_MS = 15_000;

export async function chooseSizes(foodName: string, optionLabel: string | null, servingText: string, all: SizeCandidate[], form?: string | null): Promise<PackageRow[]> {
  const cands = forStyle(all ?? [], form);
  if (!cands.length) return [];
  if (cands.length === 1) return fallbackRows(cands);
  try {
    const ask = askClaude<{ sizes?: AiSize[] }>({ system: SIZES_SYSTEM, prompt: sizesPrompt(foodName, optionLabel, servingText, cands), tool: SIZES_TOOL as never, maxTokens: 400 });
    const timeout = new Promise<'timeout'>(resolve => setTimeout(() => resolve('timeout'), SIZES_TIMEOUT_MS));
    const answer = await Promise.race([ask, timeout]);
    if (answer === 'timeout') return fallbackRows(cands);
    const rows = packageRows(answer.sizes, cands);
    return rows.length ? rows : fallbackRows(cands);
  } catch (e) {
    console.error('[food-import] package sizes', e);
    return fallbackRows(cands);
  }
}
