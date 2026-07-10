import 'server-only';
import Anthropic from '@anthropic-ai/sdk';

// Mirrors the getServiceClient() null-safety pattern in lib/supabase/server.js
// — callers check for null rather than the SDK throwing on a missing key, so
// routes can return a clean 503 instead of a stack trace when the key isn't
// configured yet.
const apiKey = process.env.ANTHROPIC_API_KEY;

export const isAiConfigured = Boolean(apiKey);

export const AI_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5';

export function getAnthropicClient() {
  if (!apiKey) return null;
  return new Anthropic({ apiKey });
}
