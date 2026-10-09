import { requirePlanSet } from '@/lib/planReader/guard';
import { downloadPlanFile } from '@/lib/planReader/storage';
import { extractSheetIndex } from '@/lib/planReader/extractors/sheetIndex';
import { extractLegend, pickLegendCandidatePages } from '@/lib/planReader/extractors/legend';

export const runtime = 'nodejs';
export const maxDuration = 120;

const json = (body, status = 200) => Response.json(body, { status });

const TRADES_WITH_LEGENDS = ['access_control', 'managed_wifi', 'low_voltage'];

// POST /api/plan-sets/[id]/classify — ported from PlanScope's classify
// Inngest function: read the first 6 pages to get a sheet index (title,
// sheet number, discipline per page across the WHOLE set), then discover
// a symbol legend per trade from whichever pages look like legend sheets.
// This is the step that makes the page-selector in the UI useful — without
// it every page would show as "p001 — —".
export async function POST(request, { params }) {
  const { id } = await params;
  const guard = await requirePlanSet(request, id);
  if (guard.error) return json({ error: guard.error }, guard.status);
  const { svc, planSet } = guard;

  if (planSet.status !== 'ready') return json({ error: `Plan set must be ready to classify (status: ${planSet.status})` }, 409);

  const { data: sheets } = await svc
    .from('plan_sheets')
    .select('id, page_number, thumbnail_path, detail_path, text_layer')
    .eq('plan_set_id', id)
    .order('page_number');
  if (!sheets || sheets.length === 0) return json({ error: 'No pages ingested yet' }, 409);

  await svc.from('plan_sets').update({ status: 'classifying', error: null }).eq('id', id);

  try {
    const head = sheets.slice(0, Math.min(6, sheets.length));
    const headImages = await Promise.all(head.map((s) => downloadPlanFile(s.thumbnail_path)));
    const indexResult = await extractSheetIndex(headImages, sheets.length);

    const byPage = new Map(sheets.map((s) => [s.page_number, s]));
    for (const item of indexResult.sheets) {
      const sheet = byPage.get(item.page);
      if (!sheet) continue;
      await svc
        .from('plan_sheets')
        .update({ sheet_number: item.sheetNumber, title: item.title, discipline: item.discipline })
        .eq('id', sheet.id);
      sheet.sheet_number = item.sheetNumber;
      sheet.title = item.title;
      sheet.discipline = item.discipline;
    }

    const pickerInput = sheets.map((s) => ({
      pageNumber: s.page_number,
      discipline: s.discipline,
      sheetNumber: s.sheet_number,
      title: s.title,
      textLayer: s.text_layer,
    }));

    let legendsCreated = 0;
    let legendCostUsd = 0;
    for (const trade of TRADES_WITH_LEGENDS) {
      const candidatePages = pickLegendCandidatePages(pickerInput, trade);
      if (candidatePages.length === 0) continue;

      const candidateImages = await Promise.all(
        candidatePages.map(async (pageNumber) => {
          const sheet = byPage.get(pageNumber);
          if (!sheet?.detail_path) return null;
          return { pageNumber, image: await downloadPlanFile(sheet.detail_path) };
        }),
      );
      const filtered = candidateImages.filter((c) => c !== null);
      const legend = await extractLegend(trade, filtered);
      legendCostUsd += legend.costUsd;

      await svc.from('plan_legends').upsert(
        {
          plan_set_id: id,
          trade,
          symbols: legend.symbols,
          source_page_numbers: legend.sourceSheetPages,
        },
        { onConflict: 'plan_set_id,trade' },
      );
      legendsCreated++;
    }

    await svc.from('plan_sets').update({ status: 'ready' }).eq('id', id);
    return json({
      planSetId: id,
      project: indexResult.project,
      sheetsClassified: indexResult.sheets.length,
      legendsCreated,
      costUsd: indexResult.costUsd + legendCostUsd,
    });
  } catch (err) {
    await svc.from('plan_sets').update({ status: 'failed', error: err.message ?? String(err) }).eq('id', id);
    return json({ error: err.message ?? 'Classify failed' }, 500);
  }
}
