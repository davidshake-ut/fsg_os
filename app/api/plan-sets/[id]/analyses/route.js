import { requirePlanSet } from '@/lib/planReader/guard';
import { downloadPlanFile } from '@/lib/planReader/storage';
import { pickSiteInventoryCandidatePages, extractSiteInventory } from '@/lib/planReader/extractors/siteInventory';
import { pickDeviceCandidatePages, extractDevicesForPage } from '@/lib/planReader/extractors/devices';
import { pickLowVoltageSpecPages, extractLowVoltageSpec } from '@/lib/planReader/extractors/lowVoltageSpec';
import { verifyTradeFindings } from '@/lib/planReader/extractors/verify';
import { DEFAULT_MODEL } from '@/lib/planReader/anthropic';

export const runtime = 'nodejs';
export const maxDuration = 300;

const json = (body, status = 200) => Response.json(body, { status });
const VALID_TRADES = ['access_control', 'managed_wifi', 'low_voltage'];
const PER_PAGE_CONCURRENCY = 4;

async function mapWithConcurrency(items, limit, fn) {
  const out = new Array(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const i = nextIndex++;
      if (i >= items.length) return;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

// GET /api/plan-sets/[id]/analyses — list this plan set's analysis runs.
export async function GET(request, { params }) {
  const { id } = await params;
  const guard = await requirePlanSet(request, id);
  if (guard.error) return json({ error: guard.error }, guard.status);
  const { svc } = guard;
  const { data } = await svc.from('plan_analyses').select('*').eq('plan_set_id', id).order('started_at', { ascending: false });
  return json({ analyses: data ?? [] });
}

// POST /api/plan-sets/[id]/analyses — ported from PlanScope's run-analysis
// Inngest function (extract.ts), run synchronously in one request instead
// of a step pipeline. That's only safe here because selectedPages already
// bounds the work to what the user picked in the page selector — this is
// the reason that feature exists on this side of the port too, not just
// for cost control.
//
// Left out of this port on purpose (see the plan-reader scoping decision):
// PlanScope's own parametric-estimate fallback (Builder has its own
// calculators for that) and PDF report generation (Builder has its own
// proposal PDF). Cross-page duplicate clustering (PlanScope's
// aggregation.ts) is also not ported yet — findings land one row per page,
// unclustered.
export async function POST(request, { params }) {
  const { id } = await params;
  const guard = await requirePlanSet(request, id);
  if (guard.error) return json({ error: guard.error }, guard.status);
  const { svc, planSet } = guard;

  if (planSet.status !== 'ready') return json({ error: `Plan set must be ready (status: ${planSet.status})` }, 409);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const trades = Array.isArray(body.trades) ? body.trades.filter((t) => VALID_TRADES.includes(t)) : [];
  const selectedPages = Array.isArray(body.selectedPages) ? body.selectedPages.map(Number).filter((n) => Number.isInteger(n) && n > 0) : [];
  if (trades.length === 0) return json({ error: 'Pick at least one trade' }, 400);
  if (selectedPages.length === 0) return json({ error: 'Pick at least one page to analyze' }, 400);

  const model = typeof body.model === 'string' && body.model ? body.model : DEFAULT_MODEL;

  const { data: analysis, error: insertError } = await svc
    .from('plan_analyses')
    .insert({ plan_set_id: id, trades, selected_pages: selectedPages, status: 'running', model })
    .select('id')
    .single();
  if (insertError) return json({ error: insertError.message }, 500);
  const analysisId = analysis.id;

  try {
    const { data: allSheets } = await svc
      .from('plan_sheets')
      .select('id, page_number, sheet_number, title, discipline, text_layer, detail_path')
      .eq('plan_set_id', id)
      .order('page_number');
    const selectedSet = new Set(selectedPages);
    const sheets = (allSheets ?? []).filter((s) => selectedSet.has(s.page_number));

    const { data: legends } = await svc.from('plan_legends').select('trade, symbols').eq('plan_set_id', id);
    const legendByTrade = new Map((legends ?? []).map((l) => [l.trade, Array.isArray(l.symbols) ? l.symbols : []]));

    let costUsd = 0;
    const byPage = new Map(sheets.map((s) => [s.page_number, s]));
    const downloadDetail = async (pageNumber) => {
      const sheet = byPage.get(pageNumber);
      if (!sheet?.detail_path) return null;
      return { pageNumber, image: await downloadPlanFile(sheet.detail_path) };
    };

    // 1. Site inventory (buildings / unit mix / common areas) off whichever
    // selected pages look like cover/site/architectural sheets.
    const sitePages = pickSiteInventoryCandidatePages(sheets.map((s) => ({ pageNumber: s.page_number, discipline: s.discipline, title: s.title, sheetNumber: s.sheet_number })));
    if (sitePages.length > 0) {
      const images = (await Promise.all(sitePages.map(downloadDetail))).filter((i) => i !== null);
      const result = await extractSiteInventory(images, model);
      costUsd += result.costUsd;
      await svc.from('plan_site_inventory').upsert({
        analysis_id: analysisId,
        buildings: result.buildings,
        common_areas: result.commonAreas,
        outdoor_spaces: result.outdoorSpaces,
        elevators_count: result.elevatorsCount ?? 0,
        notes: result.notes,
      });
    }

    // 2. Per-trade device extraction, one LLM call per candidate page.
    const perTradeSummary = {};
    for (const trade of trades) {
      const candidatePages = pickDeviceCandidatePages(
        sheets.map((s) => ({ pageNumber: s.page_number, discipline: s.discipline, sheetNumber: s.sheet_number, textLayer: s.text_layer })),
        trade,
      );
      if (candidatePages.length === 0) {
        perTradeSummary[trade] = { findings: 0, pages: 0 };
        continue;
      }

      const legendSymbols = legendByTrade.get(trade) ?? [];
      const perPage = await mapWithConcurrency(candidatePages, PER_PAGE_CONCURRENCY, async (pageNumber) => {
        const sheet = byPage.get(pageNumber);
        if (!sheet?.detail_path) return null;
        const image = await downloadPlanFile(sheet.detail_path);
        const result = await extractDevicesForPage({ trade, pageNumber, pageImage: image, legendSymbols, model });
        return { sheetId: sheet.id, result };
      });

      let totalFindings = 0;
      for (const entry of perPage) {
        if (!entry) continue;
        costUsd += entry.result.costUsd;
        for (const f of entry.result.findings) {
          const { error: findingError } = await svc.from('plan_findings').insert({
            analysis_id: analysisId,
            trade,
            category: f.category,
            symbol: f.symbol,
            description: f.description,
            count: f.count,
            location_hint: f.locationHint,
            source_sheet_id: entry.sheetId,
            confidence: f.confidence,
            source: 'extracted',
            status: 'pending_review',
          });
          if (!findingError) totalFindings++;
        }
      }
      perTradeSummary[trade] = { findings: totalFindings, pages: perPage.filter(Boolean).length };
    }

    // 3. Low-voltage cabling spec (cable types/pathways/notes) — only
    // meaningful when that trade is in scope.
    if (trades.includes('low_voltage')) {
      const lvPages = pickLowVoltageSpecPages(sheets.map((s) => ({ pageNumber: s.page_number, sheetNumber: s.sheet_number, title: s.title, discipline: s.discipline })));
      if (lvPages.length > 0) {
        const images = (await Promise.all(lvPages.map(downloadDetail))).filter((i) => i !== null);
        const result = await extractLowVoltageSpec(images, model);
        costUsd += result.costUsd;
        for (const note of result.generalNotes) {
          await svc.from('plan_findings').insert({ analysis_id: analysisId, trade: 'low_voltage', category: 'note', description: note.note, count: 1, confidence: 0.85, source: 'extracted', status: 'pending_review' });
        }
        for (const cable of result.cables) {
          await svc.from('plan_findings').insert({
            analysis_id: analysisId,
            trade: 'low_voltage',
            category: 'cable',
            description: `${cable.type}${cable.pathway ? ` via ${cable.pathway}` : ''}`,
            count: cable.quantityFeet ?? 1,
            confidence: 0.8,
            source: 'extracted',
            status: 'pending_review',
          });
        }
      }
    }

    // 4. Self-verification: re-check a sample of each trade's findings
    // against the pages they came from, flag discrepancies for review.
    let flaggedCount = 0;
    for (const trade of trades) {
      const { data: tradeFindings } = await svc
        .from('plan_findings')
        .select('id, symbol, description, count, confidence, source_sheet_id, plan_sheets(page_number)')
        .eq('analysis_id', analysisId)
        .eq('trade', trade)
        .eq('source', 'extracted')
        .limit(30);
      if (!tradeFindings || tradeFindings.length === 0) continue;

      const samplePageNumbers = Array.from(new Set(tradeFindings.map((f) => f.plan_sheets?.page_number).filter(Boolean))).slice(0, 4);
      const sampleImages = (await Promise.all(samplePageNumbers.map(downloadDetail))).filter((i) => i !== null);

      const result = await verifyTradeFindings({
        trade,
        findings: tradeFindings.map((f) => ({ id: f.id, symbol: f.symbol, description: f.description, count: f.count, confidence: Number(f.confidence ?? 0), sourceSheetId: f.source_sheet_id, sourcePageNumber: f.plan_sheets?.page_number ?? null })),
        samplePages: sampleImages,
        model,
      });
      costUsd += result.costUsd;

      for (const d of result.discrepancies) {
        if (d.affectedFindingIds.length === 0) continue;
        await svc.from('plan_findings').update({ status: 'pending_review', notes: `Verification flagged (${d.severity}): ${d.description}` }).in('id', d.affectedFindingIds);
        flaggedCount += d.affectedFindingIds.length;
      }
    }

    const { count: lowConfidenceCount } = await svc
      .from('plan_findings')
      .select('id', { count: 'exact', head: true })
      .eq('analysis_id', analysisId)
      .or('confidence.lt.0.8,status.eq.pending_review');

    const finalStatus = (lowConfidenceCount ?? 0) > 0 || flaggedCount > 0 ? 'review' : 'completed';
    await svc.from('plan_analyses').update({ status: finalStatus, cost_usd: costUsd, completed_at: new Date().toISOString() }).eq('id', analysisId);

    return json({ analysisId, status: finalStatus, costUsd, perTrade: perTradeSummary, reviewQueue: lowConfidenceCount ?? 0 });
  } catch (err) {
    await svc.from('plan_analyses').update({ status: 'failed', error: err.message ?? String(err) }).eq('id', analysisId);
    return json({ error: err.message ?? 'Analysis failed', analysisId }, 500);
  }
}
