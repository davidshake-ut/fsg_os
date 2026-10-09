import { requirePlanSet } from '@/lib/planReader/guard';
import { downloadPlanFile, uploadPlanFile } from '@/lib/planReader/storage';
import { rasterizePages } from '@/lib/planReader/rasterize';
import { extractTextLayer } from '@/lib/planReader/pdfText';

export const runtime = 'nodejs';
export const maxDuration = 300;

const json = (body, status = 200) => Response.json(body, { status });

// POST /api/plan-sets/[id]/ingest — ported from PlanScope's ingest Inngest
// function, but as one bounded request instead of a background job: download
// the PDF the browser already put in storage, rasterize every page to a
// thumbnail + detail PNG, pull the text layer for the candidate-page
// pickers, and persist one plan_sheets row per page. No background queue
// here (that was the explicit choice for this port), so this is the step
// most likely to need a bigger plan set split into page ranges later if a
// 500+ page PDF ever runs past Vercel's function time limit.
export async function POST(request, { params }) {
  const { id } = await params;
  const guard = await requirePlanSet(request, id);
  if (guard.error) return json({ error: guard.error }, guard.status);
  const { svc, planSet } = guard;

  if (planSet.status === 'ingesting') return json({ error: 'Already ingesting' }, 409);

  await svc.from('plan_sets').update({ status: 'ingesting', error: null }).eq('id', id);

  try {
    const pdfBuffer = await downloadPlanFile(planSet.storage_path);
    const textPages = await extractTextLayer(pdfBuffer);
    const textByPage = new Map(textPages.map((t) => [t.pageNumber, t.text]));

    let pageCount = 0;
    for await (const page of rasterizePages(pdfBuffer)) {
      pageCount = page.pageNumber;
      const thumbnailPath = `${planSet.company_id}/${id}/pages/${page.pageNumber}/thumbnail.png`;
      const detailPath = `${planSet.company_id}/${id}/pages/${page.pageNumber}/detail.png`;
      await Promise.all([
        uploadPlanFile(thumbnailPath, page.thumbnail, 'image/png'),
        uploadPlanFile(detailPath, page.detail, 'image/png'),
      ]);
      const { error: upsertError } = await svc.from('plan_sheets').upsert(
        {
          plan_set_id: id,
          page_number: page.pageNumber,
          thumbnail_path: thumbnailPath,
          detail_path: detailPath,
          text_layer: textByPage.get(page.pageNumber) ?? null,
        },
        { onConflict: 'plan_set_id,page_number' },
      );
      if (upsertError) throw new Error(`Failed to persist page ${page.pageNumber}: ${upsertError.message}`);
    }

    await svc.from('plan_sets').update({ status: 'ready', page_count: pageCount }).eq('id', id);
    return json({ planSetId: id, pageCount, status: 'ready' });
  } catch (err) {
    await svc.from('plan_sets').update({ status: 'failed', error: err.message ?? String(err) }).eq('id', id);
    return json({ error: err.message ?? 'Ingest failed' }, 500);
  }
}
