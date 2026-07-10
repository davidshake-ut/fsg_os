// Automation engine v1 — trigger + conditions + actions.
//
// Scope: event-driven only. Every trigger below fires from a mutation this
// app already makes (task status change, ticket created, etc.) — there is
// no scheduled-job runner, so no time-based trigger ("due in 2 days", "SLA
// at risk") exists here. Conditions are simple AND-only equality checks
// against fields on the triggering entity — no OR groups, no operators
// beyond "equals". Actions are a small fixed set (notify, log activity,
// create task, create ticket), not an open-ended action framework.

// Trigger types this engine supports, with the fields available for
// condition-building in the UI and for {{field}} lookups.
export const TRIGGER_TYPES = {
  'task.status_changed': {
    label: 'Task status changed',
    fields: ['status', 'role'],
  },
  'change_order.status_changed': {
    label: 'Change order status changed',
    fields: ['status'],
  },
  'invoice.status_changed': {
    label: 'Invoice status changed',
    fields: ['status'],
  },
  'ticket.status_changed': {
    label: 'Support ticket status changed',
    fields: ['status', 'priority'],
  },
  'ticket.created': {
    label: 'Support ticket created',
    fields: ['priority'],
  },
  'quote.status_changed': {
    label: 'Quote status changed',
    fields: ['status'],
  },
  'project.created': {
    label: 'Project created',
    fields: ['status'],
  },
};

export const ACTION_TYPES = {
  notify: { label: 'Send notification' },
  log_activity: { label: 'Log activity' },
  create_task: { label: 'Create task' },
  create_ticket: { label: 'Create support ticket' },
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
    case 'invoice.status_changed':
      return { projectId: entity.project_id ?? null, assigneeId: null, creatorId: entity.created_by ?? null, accountId: entity.crm_account_id ?? null };
    case 'ticket.status_changed':
    case 'ticket.created':
      return { projectId: entity.project_id ?? null, assigneeId: entity.assigned_to ?? null, creatorId: entity.created_by ?? null, accountId: entity.account_id ?? null };
    case 'quote.status_changed':
      return { projectId: null, assigneeId: null, creatorId: entity.created_by ?? null, accountId: entity.crm_account_id ?? null };
    case 'project.created':
      return { projectId: entity.id ?? null, assigneeId: null, creatorId: entity.created_by ?? null, accountId: null };
    default:
      return { projectId: null, assigneeId: null, creatorId: null, accountId: null };
  }
}

function entityLabel(entity) {
  return entity.title ?? entity.name ?? entity.project_name ?? 'Record';
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
