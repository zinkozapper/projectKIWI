import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./env.server', () => ({
  env: async (name: string) => ({ OPENAI_API_KEY: 'secret' } as Record<string, string>)[name],
  requireEnv: async (name: string) => ({ OPENAI_BASE_URL: 'http://localhost:1234/v1/', OPENAI_MODEL: 'local-model' } as Record<string, string>)[name],
}));

import { askOpenAI } from './openai.server';

const tool = { name: 'pick', description: 'Pick', input_schema: { type: 'object', properties: { ids: { type: 'array', items: { type: 'integer' } } }, required: ['ids'] } };
const answer = (args: string, name = 'pick') => new Response(JSON.stringify({ choices: [{ message: { tool_calls: [{ type: 'function', function: { name, arguments: args } }] } }] }), { status: 200 });

afterEach(() => vi.unstubAllGlobals());

describe('OpenAI-compatible tool calling', () => {
  it('sends a forced tool call and validates its result', async () => {
    const fetch = vi.fn().mockResolvedValue(answer('{"ids":[1,2]}'));
    vi.stubGlobal('fetch', fetch);
    await expect(askOpenAI({ system: 'system', prompt: 'prompt', tool })).resolves.toEqual({ ids: [1, 2] });
    expect(fetch.mock.calls[0]![0]).toBe('http://localhost:1234/v1/chat/completions');
    const init = fetch.mock.calls[0]![1];
    expect(init.headers.authorization).toBe('Bearer secret');
    expect(JSON.parse(init.body).tool_choice).toEqual({ type: 'function', function: { name: 'pick' } });
  });

  it.each([answer('bad json'), answer('{"ids":["1"]}'), answer('{"ids":[]}','other')])('rejects malformed or wrong tool output', async response => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
    await expect(askOpenAI({ system: '', prompt: '', tool })).rejects.toThrow('unexpected answer');
  });
});
