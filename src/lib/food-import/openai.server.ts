import { env, requireEnv } from './env.server';

type Schema = { type?: string | string[]; enum?: unknown[]; properties?: Record<string, Schema>; required?: string[]; items?: Schema; maxItems?: number };
type Tool = { name: string; description: string; input_schema: Record<string, unknown> };

function matches(value: unknown, schema: Schema): boolean {
  if (schema.enum && !schema.enum.includes(value)) return false;
  const types = Array.isArray(schema.type) ? schema.type : [schema.type];
  if (!types.some(type => {
    if (!type) return true;
    if (type === 'null') return value === null;
    if (type === 'array') return Array.isArray(value);
    if (type === 'object') return value !== null && typeof value === 'object' && !Array.isArray(value);
    if (type === 'integer') return typeof value === 'number' && Number.isInteger(value);
    return typeof value === type;
  })) return false;
  if (Array.isArray(value)) return (schema.maxItems === undefined || value.length <= schema.maxItems) && (!schema.items || value.every(item => matches(item, schema.items!)));
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    return (schema.required || []).every(key => Object.hasOwn(obj, key)) && Object.entries(schema.properties || {}).every(([key, prop]) => !Object.hasOwn(obj, key) || matches(obj[key], prop));
  }
  return true;
}

export async function askOpenAI<T>({ system, prompt, tool, maxTokens = 1500 }: { system: string; prompt: string; tool: Tool; maxTokens?: number }): Promise<T> {
  const [base, model, key] = await Promise.all([requireEnv('OPENAI_BASE_URL'), requireEnv('OPENAI_MODEL'), env('OPENAI_API_KEY')]);
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (key) headers['authorization'] = `Bearer ${key}`;
  const res = await fetch(`${base.replace(/\/+$/, '')}/chat/completions`, {
    method: 'POST', headers,
    body: JSON.stringify({ model, max_tokens: maxTokens, messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }], tools: [{ type: 'function', function: { name: tool.name, description: tool.description, parameters: tool.input_schema } }], tool_choice: { type: 'function', function: { name: tool.name } } }),
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) throw new Error(res.status === 429 || res.status === 503 ? 'The AI assistant is busy. Try again in a moment.' : 'The AI assistant couldn’t process that request.');
  try {
    const body = await res.json() as { choices?: { message?: { tool_calls?: { type?: string; function?: { name?: string; arguments?: string } }[] } }[] };
    const call = body.choices?.[0]?.message?.tool_calls?.find(c => c.type === 'function' && c.function?.name === tool.name);
    const value: unknown = JSON.parse(call?.function?.arguments ?? '');
    if (matches(value, tool.input_schema as Schema)) return value as T;
  } catch {
    // Invalid model output is reported without echoing its contents.
  }
  throw new Error('The AI assistant returned an unexpected answer.');
}
