import { requirePlanSet } from '@/lib/planReader/guard';
import { deletePlanFiles } from '@/lib/planReader/storage';

export const runtime = 'nodejs';

const json = (body, status = 200) => Response.json(body, { status });

// GET /api/plan-sets/[id] — full state for the plan reader panel: the plan
// set itself, its sheets (for the page selector), discovered legends, and
// every analysis run with its findings + site inventory. The UI polls this
// while a pipeline step is in flight (status is 'ingesting'/'classifying'/
// an analysis is 'running') instead of a websocket/SSE channel.
export async function GET(request, { params }) {
  const { id } = await params;
  const guard = await requirePlanSet(request, id);
  if (guard.error) return json({ error: guard.error }, guard.status);
  const { svc, planSet } = guard;

  const [{ data: sheets }, { data: legends }, { data: analyses }] = await Promise.all([
    svc.from('plan_sheets').select('id, page_number, sheet_number, title, discipline').eq('plan_set_id', id).order('page_number'),
    svc.from('plan_legends').select('id, trade, symbols, source_page_numbers, created_at').eq('plan_set_id', id).order('created_at', { ascending: false }),
    svc.from('plan_analyses').select('id, trades, selected_pages, status, model, cost_usd, error, started_at, completed_at').eq('plan_set_id', id).order('started_at', { ascending: false }),
  ]);

  const analysisIds = (analyses ?? []).map((a) => a.id);
  const [{ data: findings }, { data: inventories }] = analysisIds.length
    ? await Promise.all([
        svc
          .from('plan_findings')
          .select('id, analysis_id, trade, category, symbol, description, count, confidence, location_hint, status, source, source_sheet_id')
          .in('analysis_id', analysisIds),
        svc.from('plan_site_inventory').select('*').in('analysis_id', analysisIds),
      ])
    : [{ data: [] }, { data: [] }];

  const findingsByAnalysis = new Map();
  for (const f of findings ?? []) {
    if (!findingsByAnalysis.has(f.analysis_id)) findingsByAnalysis.set(f.analysis_id, []);
    findingsByAnalysis.get(f.analysis_id).push(f);
  }
  const inventoryByAnalysis = new Map((inventories ?? []).map((i) => [i.analysis_id, i]));

  return json({
    planSet,
    sheets: sheets ?? [],
    legends: legends ?? [],
    analyses: (analyses ?? []).map((a) => ({
      ...a,
      findings: findingsByAnalysis.get(a.id) ?? [],
      siteInventory: inventoryByAnalysis.get(a.id) ?? null,
    })),
  });
}

// DELETE /api/plan-sets/[id] — remove the plan set, its DB rows (cascade)
// and its storage files (original PDF + every page's thumbnail/detail PNG).
export async function DELETE(request, { params }) {
  const { id } = await params;
  const guard = await requirePlanSet(request, id);
  if (guard.error) return json({ error: guard.error }, guard.status);
  const { svc, planSet } = guard;

  const { data: sheets } = await svc.from('plan_sheets').select('thumbnail_path, detail_path').eq('plan_set_id', id);
  const paths = [planSet.storage_path, ...(sheets ?? []).flatMap((s) => [s.thumbnail_path, s.detail_path])].filter(Boolean);
  await deletePlanFiles(paths);

  const { error } = await svc.from('plan_sets').delete().eq('id', id);
  if (error) return json({ error: error.message }, 500);
  return json({ ok: true });
}
