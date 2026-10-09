// Shared Anthropic call helpers for the plan reader (ported from PlanScope's
// src/lib/anthropic.ts). Reuses lib/ai/client.js for the actual client /
// model name so this feature follows the same null-safety + model-override
// convention as the rest of the app's AI features, instead of wiring up a
// second client.
import { getAnthropicClient, AI_MODEL } from '@/lib/ai/client';

export { AI_MODEL as DEFAULT_MODEL };

export function getAnthropic() {
  const client = getAnthropicClient();
  if (!client) throw new Error('ANTHROPIC_API_KEY is not set');
  return client;
}

// Per-million-token USD pricing, only for the models the plan reader is
// expected to run on. Unknown models just report $0 rather than throwing —
// cost tracking here is advisory (shown in the UI), never billed on.
const PRICE_PER_M_TOKENS = {
  'claude-sonnet-5': { input: 3, output: 15 },
  'claude-opus-5-5': { input: 15, output: 75 },
  'claude-haiku-4-5-20251001': { input: 1, output: 5 },
  // Older aliases some projects still pin to.
  'claude-sonnet-4-6': { input: 3, output: 15 },
  'claude-opus-4-7': { input: 15, output: 75 },
};

const CACHE_WRITE_MULTIPLIER = 1.25;
const CACHE_READ_MULTIPLIER = 0.1;

export function estimateCostUsd(model, usage) {
  const rate = PRICE_PER_M_TOKENS[model];
  if (!rate || !usage) return 0;
  const inputCost = (usage.input_tokens ?? 0) * rate.input;
  const writeCost = (usage.cache_creation_input_tokens ?? 0) * rate.input * CACHE_WRITE_MULTIPLIER;
  const readCost = (usage.cache_read_input_tokens ?? 0) * rate.input * CACHE_READ_MULTIPLIER;
  const outputCost = (usage.output_tokens ?? 0) * rate.output;
  return (inputCost + writeCost + readCost + outputCost) / 1_000_000;
}

export function imageBlock(bytes) {
  return {
    type: 'image',
    source: {
      type: 'base64',
      media_type: 'image/png',
      data: Buffer.isBuffer(bytes) ? bytes.toString('base64') : Buffer.from(bytes).toString('base64'),
    },
  };
}

export function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = (fenced ? fenced[1] : text).trim();
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1) {
    throw new Error(`No JSON object in response: ${text.slice(0, 200)}`);
  }
  return JSON.parse(raw.slice(start, end + 1));
}

export function firstTextBlock(response) {
  const block = response.content.find((b) => b.type === 'text');
  if (!block) throw new Error('No text block in LLM response');
  return block.text;
}
