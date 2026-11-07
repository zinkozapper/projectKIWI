// The AI step: Claude (Anthropic Messages API) picks among USDA records and suggests categories,
// flavor tags and pairings. It never writes nutrient numbers; rules.ts computes those.
// Server-only: uses ANTHROPIC_API_KEY. Model can be changed with ANTHROPIC_MODEL.
import { env, requireEnv } from './env.server';

type Tool = { name: string; description: string; input_schema: Record<string, unknown> };

// Forced tool use gives structured JSON back instead of free text.
export async function askClaude<T>({ system, prompt, tool, maxTokens = 1500 }: { system: string; prompt: string; tool: Tool; maxTokens?: number }): Promise<T> {
  const key = await requireEnv('ANTHROPIC_API_KEY');
  const model = (await env('ANTHROPIC_MODEL')) || 'claude-haiku-5-5';
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system,
      tools: [tool],
      tool_choice: { type: 'tool', name: tool.name },
      messages: [{ role: 'user', content: prompt }],
    }),
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    console.error('[food-import] Claude error', res.status, detail.slice(0, 500));
    throw new Error(res.status === 429 || res.status === 529 ? 'The AI assistant is busy. Try again in a moment.' : 'The AI assistant couldn’t process that request.');
  }
  const body = (await res.json()) as { content?: { type: string; name?: string; input?: unknown }[] };
  const use = body.content?.find(c => c.type === 'tool_use' && c.name === tool.name);
  if (!use?.input) throw new Error('The AI assistant returned an unexpected answer.');
  return use.input as T;
}
