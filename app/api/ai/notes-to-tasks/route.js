import { getCaller } from '@/lib/supabase/server';
import { getAnthropicClient, isAiConfigured, AI_MODEL } from '@/lib/ai/client';

const json = (body, status = 200) => Response.json(body, { status });

const MAX_NOTES_CHARS = 6000;
const MAX_TASKS = 20;

const PROPOSE_TASKS_TOOL = {
  name: 'propose_tasks',
  description: 'Propose a reviewable list of project tasks extracted from raw field/meeting notes.',
  input_schema: {
    type: 'object',
    properties: {
      tasks: {
        type: 'array',
        maxItems: MAX_TASKS,
        items: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Short, actionable task title (imperative mood)' },
            description: { type: 'string', description: 'One or two sentences of relevant detail from the notes, or empty string' },
            role: { type: 'string', description: 'Best-guess role/trade responsible (e.g. "Installer", "PM", "Network Engineer"), or empty string if unclear' },
            estimated_hours: { type: 'number', description: 'Rough effort estimate in hours, or 0 if not inferable' },
          },
          required: ['title', 'description', 'role', 'estimated_hours'],
        },
      },
    },
    required: ['tasks'],
  },
};

export async function POST(request) {
  if (!isAiConfigured) return json({ error: 'AI Assistant is not configured on this server.' }, 503);

  const caller = await getCaller(request);
  if (!caller) return json({ error: 'Unauthorized' }, 401);
  if (!caller.company_id) return json({ error: 'You must be on a team to use the AI Assistant' }, 403);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const notes = String(body.notes ?? '').trim();
  if (!notes) return json({ error: 'Notes are required' }, 400);
  if (notes.length > MAX_NOTES_CHARS) {
    return json({ error: `Notes must be under ${MAX_NOTES_CHARS} characters` }, 400);
  }

  const client = getAnthropicClient();
  let message;
  try {
    message = await client.messages.create({
      model: AI_MODEL,
      max_tokens: 2048,
      tools: [PROPOSE_TASKS_TOOL],
      tool_choice: { type: 'tool', name: 'propose_tasks' },
      messages: [{
        role: 'user',
        content:
          'You are helping a systems integrator PM turn raw field/meeting notes into a reviewable project task list. ' +
          'Extract concrete, actionable tasks only — skip small talk, scheduling logistics already handled, and vague statements with no action. ' +
          'Every task will be shown to a human for review before creation, so it is fine to propose fewer, higher-confidence tasks rather than padding the list.\n\n' +
          `Notes:\n${notes}`,
      }],
    });
  } catch (err) {
    return json({ error: `AI request failed: ${err.message}` }, 502);
  }

  const toolUse = message.content.find((b) => b.type === 'tool_use' && b.name === 'propose_tasks');
  const rawTasks = Array.isArray(toolUse?.input?.tasks) ? toolUse.input.tasks : [];

  const tasks = rawTasks.slice(0, MAX_TASKS).map((t) => ({
    title: String(t.title ?? '').slice(0, 300).trim(),
    description: String(t.description ?? '').slice(0, 1000).trim(),
    role: String(t.role ?? '').slice(0, 100).trim(),
    estimated_hours: Number.isFinite(Number(t.estimated_hours)) ? Math.max(0, Math.min(999, Number(t.estimated_hours))) : 0,
  })).filter((t) => t.title);

  return json({ tasks });
}
