import { getServiceClient, getCaller } from '@/lib/supabase/server';

const json = (body, status = 200) => Response.json(body, { status });

const STATUSES = ['draft', 'sent', 'paid', 'overdue', 'void'];
const round2 = (n) => Math.round(n * 100) / 100;

// Recompute all money fields from qty × unit_price. Client-supplied totals are
// ignored — the browser is not trusted with financial math.
function computeTotals(rawItems, rawTaxRate) {
  if (!Array.isArray(rawItems)) return { error: 'line_items must be an array' };
  if (rawItems.length > 200) return { error: 'Too many line items' };

  const line_items = [];
  for (const item of rawItems) {
    const qty = Number(item?.qty);
    const unit_price = Number(item?.unit_price);
    const description = String(item?.description ?? '').slice(0, 500);
    if (!Number.isFinite(qty) || qty < 0 || qty > 1_000_000) {
      return { error: `Invalid quantity on "${description || 'line item'}"` };
    }
    if (!Number.isFinite(unit_price) || unit_price < 0 || unit_price > 100_000_000) {
      return { error: `Invalid unit price on "${description || 'line item'}"` };
    }
    line_items.push({
      id: typeof item?.id === 'string' ? item.id : undefined,
      description,
      qty,
      unit_price: round2(unit_price),
      total: round2(qty * unit_price),
    });
  }

  const tax_rate = Number(rawTaxRate);
  if (!Number.isFinite(tax_rate) || tax_rate < 0 || tax_rate > 100) {
    return { error: 'Invalid tax rate' };
  }

  const subtotal = round2(line_items.reduce((s, i) => s + i.total, 0));
  const tax_amount = round2(subtotal * tax_rate / 100);
  const total = round2(subtotal + tax_amount);
  return { line_items, tax_rate, subtotal, tax_amount, total };
}

// Verify an optional FK belongs to the caller's company (service role bypasses
// RLS, so this must be checked explicitly).
async function checkOwned(svc, table, id, companyId) {
  if (!id) return true;
  const { data } = await svc.from(table).select('id').eq('id', id).eq('company_id', companyId).maybeSingle();
  return !!data;
}

async function nextInvoiceNumber(svc, companyId) {
  const year = new Date().getFullYear();
  const { data } = await svc
    .from('invoices')
    .select('invoice_number')
    .eq('company_id', companyId);
  const max = (data ?? []).reduce((n, inv) => {
    const m = inv.invoice_number?.match(/(\d+)$/);
    return m ? Math.max(n, parseInt(m[1], 10)) : n;
  }, 0);
  return `INV-${year}-${String(max + 1).padStart(4, '0')}`;
}

export async function POST(request) {
  const caller = await getCaller(request);
  if (!caller) return json({ error: 'Unauthorized' }, 401);
  if (!caller.company_id) return json({ error: 'You must be on a team to create invoices' }, 403);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const title = String(body.title ?? '').trim();
  if (!title) return json({ error: 'Title is required' }, 400);

  const status = body.status ?? 'draft';
  if (!STATUSES.includes(status)) return json({ error: 'Invalid status' }, 400);

  const totals = computeTotals(body.line_items ?? [], body.tax_rate ?? 0);
  if (totals.error) return json({ error: totals.error }, 400);

  const svc = getServiceClient();
  const companyId = caller.company_id;

  const [quoteOk, projectOk, accountOk] = await Promise.all([
    checkOwned(svc, 'saved_projects', body.quote_id, companyId),
    checkOwned(svc, 'psa_projects', body.project_id, companyId),
    checkOwned(svc, 'crm_accounts', body.crm_account_id, companyId),
  ]);
  if (!quoteOk) return json({ error: 'Quote not found' }, 400);
  if (!projectOk) return json({ error: 'Project not found' }, 400);
  if (!accountOk) return json({ error: 'Account not found' }, 400);

  const invoice_number = await nextInvoiceNumber(svc, companyId);

  const { data: inv, error } = await svc
    .from('invoices')
    .insert({
      company_id: companyId,
      created_by: caller.id,
      invoice_number,
      title: title.slice(0, 300),
      status,
      quote_id: body.quote_id ?? null,
      project_id: body.project_id ?? null,
      crm_account_id: body.crm_account_id ?? null,
      customer_name: body.customer_name ? String(body.customer_name).slice(0, 300) : null,
      invoice_date: body.invoice_date ?? undefined,
      due_date: body.due_date ?? null,
      notes: body.notes ? String(body.notes).slice(0, 5000) : null,
      line_items: totals.line_items,
      tax_rate: totals.tax_rate,
      subtotal: totals.subtotal,
      tax_amount: totals.tax_amount,
      total: totals.total,
    })
    .select()
    .single();
  if (error) return json({ error: error.message }, 400);
  return json({ invoice: inv });
}
