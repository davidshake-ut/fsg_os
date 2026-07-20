// Automation engine — trigger + conditions + actions.
//
// Scope: event-driven only. Every trigger below fires from a mutation this
// app already makes (task status change, ticket created, etc.) — there is
// no scheduled-job runner, so no time-based trigger ("due in 2 days", "SLA
// at risk") exists here. Conditions are simple AND-only equality checks
// against fields on the triggering entity — no OR groups, no operators
// beyond "equals". Actions are a small fixed set, not an open-ended
// framework — but they now include the two cross-stage moves the lifecycle
// flow runs on: create_project (proposal → project) and post_message
// (into the project's channel).

import { computeTemplateSchedule } from '@/lib/projectTemplateSchedule';
import { systemTemplatesForTech } from '@/lib/templates/index';
import { companyTechnologies, resolveEnabledTechnologies } from '@/lib/technologies';

// Trigger types this engine supports, with the fields available for
// condition-building in the UI.
export const TRIGGER_TYPES = {
  'task.status_changed': {
    label: 'Task status changed',
    fields: ['status', 'role'],
  },
  'change_order.status_changed': {
    label: 'Change order status changed',
    fields: ['status'],
  },
  'invoice.created': {
    label: 'Invoice created',
    fields: ['status'],
  },
  'invoice.status_changed': {
    label: 'Invoice status changed',
    fields: ['status'],
  },
  'ticket.status_changed': {
    label: 'Support case status changed',
    fields: ['status', 'priority'],
  },
  'ticket.created': {
    label: 'Support case created',
    fields: ['priority'],
  },
  'quote.status_changed': {
    label: 'Proposal status changed',
    fields: ['status'],
  },
  'project.created': {
    label: 'Project created',
    fields: ['status'],
  },
  'project.status_changed': {
    label: 'Project status changed',
    fields: ['status'],
  },
  'account.stage_changed': {
    label: 'Account pipeline stage changed',
    fields: ['stage', 'status'],
  },
};

export const ACTION_TYPES = {
  notify: { label: 'Send notification' },
  log_activity: { label: 'Log activity' },
  create_task: { label: 'Create task' },
  create_ticket: { label: 'Create support case' },
  create_project: { label: 'Create project from proposal' },
  post_message: { label: 'Post message to project channel' },
};

// Resolve the project/account/user context an action can use, per trigger
// type — the shape of the triggering entity differs by table, this is the
// one place that knowledge lives.
function resolveContext(triggerType, entity) {
  switch (triggerType) {
    case 'task.status_changed':
      return { projectId: entity.project_id ?? null, assigneeId: entity.assignee_id ?? null, creatorId: entity.created_by ?? null, accountId: null };
    case 'change_order.status_changed':
      return { projectId: entity.project_id ?? null, assigneeId: null, creatorId: entity.created_by ?? null, accountId: null };
    case 'invoice.created':
    case 'invoice.status_changed':
      return { projectId: entity.project_id ?? null, assigneeId: null, creatorId: entity.created_by ?? null, accountId: entity.crm_account_id ?? null };
    case 'ticket.status_changed':
    case 'ticket.created':
      return { projectId: entity.project_id ?? null, assigneeId: entity.assigned_to ?? null, creatorId: entity.created_by ?? null, accountId: entity.account_id ?? null };
    case 'quote.status_changed':
      return { projectId: null, assigneeId: null, creatorId: entity.created_by ?? null, accountId: entity.crm_account_id ?? null };
    case 'project.created':
    case 'project.status_changed':
      return { projectId: entity.id ?? null, assigneeId: null, creatorId: entity.created_by ?? null, accountId: entity.crm_account_id ?? null };
    case 'account.stage_changed':
      return { projectId: null, assigneeId: null, creatorId: entity.created_by ?? null, accountId: entity.id ?? null };
    default:
      return { projectId: null, assigneeId: null, creatorId: null, accountId: null };
  }
}

function entityLabel(entity) {
  return entity.title ?? entity.name ?? entity.project_name ?? 'Record';
}

// Company template for a technology if one exists, else the built-in system
// template — same preference order as the Builder's pickTemplateForTech.
async function templateForTech(supabase, companyId, technology) {
  const { data } = await supabase
    .from('project_templates')
    .select('*, template_phases(*, template_tasks(*))')
    .eq('company_id', companyId)
    .eq('technology', technology)
    .limit(1);
  const company = data?.[0];
  if (company) {
    return {
      ...company,
      phases: (company.template_phases ?? [])
        .sort((a, b) => a.order_index - b.order_index)
        .map((ph) => ({
          ...ph,
          order: ph.order_index,
          tasks: (ph.template_tasks ?? [])
            .sort((a, b) => a.order_index - b.order_index)
            .map((tk) => ({ ...tk, order: tk.order_index })),
        })),
    };
  }
  return systemTemplatesForTech(technology)[0] ?? null;
}

// Proposal (saved_projects row) → PSA project, carrying the full chain and
// auto-generating the template plan — the automated twin of the Builder's
// "Create Project from Proposal" modal.
async function createProjectFromQuote(supabase, action, { companyId, entity }) {
  if (!entity?.id) return;

  // One project per property / one per quote — skip if it already exists
  // (also covers the rule firing again on a later status change).
  const [{ data: byQuote }, { data: byProperty }] = await Promise.all([
    supabase.from('psa_projects').select('id').eq('quote_id', entity.id).limit(1),
    entity.property_id
      ? supabase.from('psa_projects').select('id').eq('property_id', entity.property_id).limit(1)
      : Promise.resolve({ data: [] }),
  ]);
  if ((byQuote ?? []).length > 0 || (byProperty ?? []).length > 0) return;

  let customerName = null;
  if (entity.crm_account_id) {
    const { data: account } = await supabase.from('crm_accounts').select('name').eq('id', entity.crm_account_id).maybeSingle();
    customerName = account?.name ?? null;
  }

  const { data: proj, error } = await supabase
    .from('psa_projects')
    .insert({
      company_id: companyId,
      created_by: entity.created_by ?? null,
      name: action.name || entity.project_name || entityLabel(entity),
      customer_name: customerName,
      budget: entity.total_price ?? null,
      // The stored quote total is equipment-only (labor lives in labor_roles
      // and is computed client-side), so the split's labor half stays null
      // here — the project owner fills it on the Overview.
      equipment_budget: entity.total_price ?? null,
      quote_id: entity.id,
      crm_account_id: entity.crm_account_id ?? null,
      property_id: entity.property_id ?? null,
      status: 'planning',
    })
    .select()
    .single();
  if (error) {
    if (error.code === '23505') return; // lost a race — project exists, done
    throw error;
  }

  // Technologies + template plan, mirroring usePSAProjects.createProject.
  // Registry-driven: the quote's enabled technologies (legacy quotes derive
  // from the two include flags), labeled via the company's registry so
  // custom technologies carry their names too.
  const inputs = entity.inputs ?? {};
  const { data: companyRow } = await supabase
    .from('companies').select('settings').eq('id', companyId).maybeSingle();
  const enabled = resolveEnabledTechnologies(inputs);
  const techs = companyTechnologies({ settings: companyRow?.settings ?? {} })
    .filter((t) => enabled[t.id])
    .map((t) => t.label);
  if (techs.length === 0) return;

  const { data: techRows } = await supabase
    .from('project_technologies')
    .insert(techs.map((technology, i) => ({ project_id: proj.id, company_id: companyId, technology, order_index: i })))
    .select();

  for (const tech of techRows ?? []) {
    const template = await templateForTech(supabase, companyId, tech.technology);
    if (!template?.phases?.length) continue;
    const schedule = computeTemplateSchedule(template.phases, null);
    for (const phase of schedule) {
      const { data: ms, error: msErr } = await supabase
        .from('psa_milestones')
        .insert({
          project_id: proj.id, technology_id: tech.id,
          name: phase.name, sort_order: phase.sort_order,
          start_date: phase.start_date, due_date: phase.due_date,
        })
        .select().single();
      if (msErr) throw msErr;
      if (phase.tasks.length > 0) {
        const { error: tErr } = await supabase.from('psa_tasks').insert(
          phase.tasks.map((t) => ({
            project_id: proj.id, milestone_id: ms.id, technology_id: tech.id,
            title: t.title, description: t.description, role: t.role,
            status: 'todo', estimated_hours: t.estimated_hours,
            start_date: t.start_date, due_date: t.due_date, sort_order: t.sort_order,
          }))
        );
        if (tErr) throw tErr;
      }
    }
  }
}

// Post into the project's channel (creating it if needed) — automations run
// client-side as the acting user, so channel creation follows the same
// bootstrap path the UI uses (creator seats self, then posts).
async function postProjectMessage(supabase, action, { companyId, entity, ctx }) {
  if (!ctx.projectId) return; // no project in context — skip silently

  const { data: existing } = await supabase
    .from('conversations')
    .select('id')
    .eq('project_id', ctx.projectId)
    .eq('type', 'project')
    .maybeSingle();

  let conversationId = existing?.id ?? null;
  if (!conversationId) {
    const { data: auth } = await supabase.auth.getUser();
    const actorId = auth?.user?.id;
    if (!actorId) return;
    const { data: proj } = await supabase.from('psa_projects').select('name').eq('id', ctx.projectId).maybeSingle();
    conversationId = crypto.randomUUID();
    const { error: convErr } = await supabase.from('conversations').insert({
      id: conversationId, company_id: companyId, type: 'project',
      name: proj?.name ?? entityLabel(entity), project_id: ctx.projectId, created_by: actorId,
    });
    if (convErr) {
      if (convErr.code !== '23505') throw convErr;
      const { data: raced } = await supabase.from('conversations').select('id').eq('project_id', ctx.projectId).eq('type', 'project').maybeSingle();
      conversationId = raced?.id ?? null;
      if (!conversationId) return;
    } else {
      await supabase.from('conversation_members').insert({ conversation_id: conversationId, user_id: actorId });
    }
  }

  const { data: auth } = await supabase.auth.getUser();
  const senderId = auth?.user?.id;
  if (!senderId) return;
  // Sender must be a member to pass the messages insert policy — join the
  // project channel if not already in it (self-join is allowed for project
  // channels, migration 0037).
  await supabase.from('conversation_members')
    .upsert({ conversation_id: conversationId, user_id: senderId }, { onConflict: 'conversation_id,user_id', ignoreDuplicates: true });

  const { error: msgErr } = await supabase.from('messages').insert({
    conversation_id: conversationId, company_id: companyId, sender_id: senderId,
    body: action.body || `Automation update: ${entityLabel(entity)}`,
  });
  if (msgErr) throw msgErr;
  await supabase.from('conversations').update({ updated_at: new Date().toISOString() }).eq('id', conversationId);
}

async function executeAction(supabase, action, { companyId, triggerType, entity }) {
  const ctx = resolveContext(triggerType, entity);

  if (action.type === 'log_activity') {
    await supabase.from('activity_log').insert({
      company_id: companyId, actor_id: null, verb: `automation.${triggerType}`,
      entity_type: 'automation', entity_id: null,
      label: action.label || `Automation ran on ${entityLabel(entity)}`,
    });
    return;
  }

  if (action.type === 'notify') {
    let targets = [];
    if (action.target === 'assignee' && ctx.assigneeId) targets = [ctx.assigneeId];
    else if (action.target === 'creator' && ctx.creatorId) targets = [ctx.creatorId];
    else if (action.target === 'company_admins') {
      const { data } = await supabase.from('users').select('id').eq('company_id', companyId).eq('role', 'company_admin');
      targets = (data ?? []).map((u) => u.id);
    }
    for (const userId of targets) {
      await supabase.from('notifications').insert({
        company_id: companyId, user_id: userId, verb: `automation.${triggerType}`,
        entity_type: 'automation', entity_id: null,
        label: action.label || `${entityLabel(entity)} — ${triggerType.replace(/_/g, ' ')}`,
      });
    }
    return;
  }

  if (action.type === 'create_task') {
    if (!ctx.projectId) return; // nothing to attach the task to — skip silently
    await supabase.from('psa_tasks').insert({
      project_id: ctx.projectId, milestone_id: null, title: action.title || 'Automated task',
      description: action.description || null, role: action.role || null, status: 'todo',
    });
    return;
  }

  if (action.type === 'create_ticket') {
    await supabase.from('support_tickets').insert({
      company_id: companyId, project_id: ctx.projectId, account_id: ctx.accountId,
      title: action.title || `Follow-up: ${entityLabel(entity)}`,
      priority: action.priority || 'medium', status: 'open',
    });
    return;
  }

  if (action.type === 'create_project') {
    await createProjectFromQuote(supabase, action, { companyId, entity });
    return;
  }

  if (action.type === 'post_message') {
    await postProjectMessage(supabase, action, { companyId, entity, ctx });
    return;
  }
}

function conditionsMatch(conditions, entity) {
  return (conditions ?? []).every((c) => String(entity?.[c.field] ?? '') === String(c.value));
}

// Best-effort — a broken automation rule must never break the mutation that
// triggered it. Every rule's outcome (success/error) is recorded to
// automation_runs regardless, for auditability.
export async function runAutomations(supabase, { companyId, triggerType, entity }) {
  if (!supabase || !companyId || !entity) return;
  try {
    const { data: rules } = await supabase
      .from('automation_rules')
      .select('*')
      .eq('company_id', companyId)
      .eq('trigger_type', triggerType)
      .eq('enabled', true);

    for (const rule of rules ?? []) {
      if (!conditionsMatch(rule.conditions, entity)) continue;
      try {
        for (const action of rule.actions ?? []) {
          await executeAction(supabase, action, { companyId, triggerType, entity });
        }
        await supabase.from('automation_runs').insert({
          rule_id: rule.id, company_id: companyId, trigger_type: triggerType, status: 'success',
        });
      } catch (err) {
        await supabase.from('automation_runs').insert({
          rule_id: rule.id, company_id: companyId, trigger_type: triggerType, status: 'error',
          detail: err.message?.slice(0, 500),
        });
      }
    }
  } catch {
    // no-op — automation lookup itself failed (e.g. table not reachable); never block the caller
  }
}
