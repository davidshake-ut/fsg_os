import { getServiceClient, getCaller } from '@/lib/supabase/server';
import { getAnthropicClient, isAiConfigured, AI_MODEL } from '@/lib/ai/client';

const json = (body, status = 200) => Response.json(body, { status });

function buildContext({ project, milestones, tasks, changeOrders, activity }) {
  const tasksByStatus = tasks.reduce((acc, t) => {
    acc[t.status] = (acc[t.status] ?? 0) + 1;
    return acc;
  }, {});
  const overdue = tasks.filter((t) => t.due_date && t.status !== 'done' && t.due_date < new Date().toISOString().slice(0, 10));

  const lines = [
    `Project: ${project.name}`,
    project.customer_name ? `Customer: ${project.customer_name}` : null,
    `Status: ${project.status}`,
    project.start_date || project.end_date ? `Timeline: ${project.start_date ?? '?'} to ${project.end_date ?? '?'}` : null,
    project.budget ? `Budget: $${project.budget}` : null,
    '',
    `Milestones (${milestones.length}): ${milestones.map((m) => m.name).join(', ') || 'none'}`,
    `Tasks (${tasks.length}): ${Object.entries(tasksByStatus).map(([s, n]) => `${n} ${s}`).join(', ') || 'none'}`,
    overdue.length > 0 ? `Overdue tasks: ${overdue.map((t) => t.title).slice(0, 10).join('; ')}` : null,
    changeOrders.length > 0
      ? `Change orders (${changeOrders.length}): ${changeOrders.map((c) => `${c.title} [${c.status}]`).join('; ')}`
      : null,
    activity.length > 0
      ? `Recent activity:\n${activity.map((a) => `- ${a.label}`).join('\n')}`
      : null,
  ].filter(Boolean);

  return lines.join('\n');
}

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

  const projectId = String(body.projectId ?? '');
  if (!projectId) return json({ error: 'projectId is required' }, 400);

  const svc = getServiceClient();
  const { data: project } = await svc.from('psa_projects').select('*').eq('id', projectId).single();
  if (!project) return json({ error: 'Project not found' }, 404);
  if (project.company_id !== caller.company_id && caller.role !== 'super_admin') {
    return json({ error: 'Project not found' }, 404);
  }

  const [{ data: milestones }, { data: tasks }, { data: changeOrders }, { data: activity }] = await Promise.all([
    svc.from('psa_milestones').select('id, name').eq('project_id', projectId),
    svc.from('psa_tasks').select('id, title, status, due_date').eq('project_id', projectId),
    svc.from('change_orders').select('title, status').eq('project_id', projectId),
    svc.from('activity_log').select('label').eq('company_id', caller.company_id).eq('entity_type', 'project').eq('entity_id', projectId).order('created_at', { ascending: false }).limit(10),
  ]);

  const context = buildContext({
    project, milestones: milestones ?? [], tasks: tasks ?? [], changeOrders: changeOrders ?? [], activity: activity ?? [],
  });

  const client = getAnthropicClient();
  let message;
  try {
    message = await client.messages.create({
      model: AI_MODEL,
      max_tokens: 400,
      messages: [{
        role: 'user',
        content:
          'You are a project status digest generator for a systems integrator PM tool. ' +
          'Write a concise, plain-English status summary (3-5 sentences, no headers, no bullet points) of the project below, ' +
          'calling out risk (overdue tasks, stalled change orders) if present. Do not invent facts not present in the data.\n\n' +
          context,
      }],
    });
  } catch (err) {
    return json({ error: `AI request failed: ${err.message}` }, 502);
  }

  const summary = message.content.find((b) => b.type === 'text')?.text?.trim() ?? '';
  return json({ summary });
}
