import { requirePlanSet } from '@/lib/planReader/guard';
import { retrieveContext, respondToChat } from '@/lib/planReader/chat';

export const runtime = 'nodejs';
export const maxDuration = 60;

const json = (body, status = 200) => Response.json(body, { status });

// GET /api/plan-sets/[id]/chat — message history for this plan set.
export async function GET(request, { params }) {
  const { id } = await params;
  const guard = await requirePlanSet(request, id);
  if (guard.error) return json({ error: guard.error }, guard.status);
  const { svc } = guard;
  const { data } = await svc.from('plan_chat_messages').select('id, role, content, citations, created_at').eq('plan_set_id', id).order('created_at');
  return json({ messages: data ?? [] });
}

// POST /api/plan-sets/[id]/chat — ported from PlanScope's chat/retrieve.ts
// + respond.ts. Keyword-overlap retrieval over this plan set's sheets and
// findings (no vector DB), then one grounded, citation-checked answer.
export async function POST(request, { params }) {
  const { id } = await params;
  const guard = await requirePlanSet(request, id);
  if (guard.error) return json({ error: guard.error }, guard.status);
  const { svc, caller } = guard;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }
  const userMessage = String(body.message ?? '').trim();
  if (!userMessage) return json({ error: 'message is required' }, 400);

  const { data: history } = await svc.from('plan_chat_messages').select('role, content').eq('plan_set_id', id).order('created_at').limit(20);

  await svc.from('plan_chat_messages').insert({ plan_set_id: id, role: 'user', content: userMessage, created_by: caller.id });

  try {
    const { citations, inventoryExcerpt } = await retrieveContext(svc, { planSetId: id, query: userMessage });
    const result = await respondToChat({ history: history ?? [], userMessage, citations, inventoryExcerpt });

    await svc.from('plan_chat_messages').insert({ plan_set_id: id, role: 'assistant', content: result.text, citations: result.citationsUsed });

    return json({ text: result.text, citations: result.citationsUsed, costUsd: result.costUsd });
  } catch (err) {
    return json({ error: err.message ?? 'Chat failed' }, 500);
  }
}
