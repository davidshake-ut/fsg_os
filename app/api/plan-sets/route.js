import { getCaller, getServiceClient } from '@/lib/supabase/server';
import { createHash } from 'node:crypto';

export const runtime = 'nodejs';

const json = (body, status = 200) => Response.json(body, { status });

// GET /api/plan-sets?savedProjectId=... — list plan sets on one Builder quote.
export async function GET(request) {
  const caller = await getCaller(request);
  if (!caller) return json({ error: 'Unauthorized' }, 401);
  if (!caller.company_id) return json({ error: 'You must be on a team to use the plan reader' }, 403);

  const savedProjectId = new URL(request.url).searchParams.get('savedProjectId');
  if (!savedProjectId) return json({ error: 'savedProjectId is required' }, 400);

  const svc = getServiceClient();
  const { data: quote } = await svc.from('saved_projects').select('id, company_id').eq('id', savedProjectId).single();
  if (!quote || (quote.company_id !== caller.company_id && caller.role !== 'super_admin')) {
    return json({ error: 'Quote not found' }, 404);
  }

  const { data, error } = await svc
    .from('plan_sets')
    .select('id, file_name, status, page_count, error, uploaded_at')
    .eq('saved_project_id', savedProjectId)
    .order('uploaded_at', { ascending: false });
  if (error) return json({ error: error.message }, 500);
  return json({ planSets: data ?? [] });
}

// POST /api/plan-sets — register a new plan set and hand back a signed
// upload URL. The actual PDF bytes never pass through this function: the
// browser uploads straight to Supabase Storage with the signed URL, which
// avoids this route's request-body limit entirely (plan sets routinely run
// 50-150 MB).
export async function POST(request) {
  const caller = await getCaller(request);
  if (!caller) return json({ error: 'Unauthorized' }, 401);
  if (!caller.company_id) return json({ error: 'You must be on a team to use the plan reader' }, 403);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const savedProjectId = String(body.savedProjectId ?? '');
  const fileName = String(body.fileName ?? '').trim();
  if (!savedProjectId) return json({ error: 'savedProjectId is required' }, 400);
  if (!fileName.toLowerCase().endsWith('.pdf')) return json({ error: 'File must be a PDF' }, 400);

  const svc = getServiceClient();
  const { data: quote } = await svc.from('saved_projects').select('id, company_id').eq('id', savedProjectId).single();
  if (!quote || (quote.company_id !== caller.company_id && caller.role !== 'super_admin')) {
    return json({ error: 'Quote not found' }, 404);
  }

  const storagePathSeed = createHash('sha256').update(`${savedProjectId}:${fileName}:${Date.now()}`).digest('hex').slice(0, 12);
  const { data: planSet, error: insertError } = await svc
    .from('plan_sets')
    .insert({
      company_id: quote.company_id,
      saved_project_id: savedProjectId,
      file_name: fileName,
      storage_path: '', // filled in below once we know the plan set's own id
      status: 'uploaded',
      uploaded_by: caller.id,
    })
    .select('id')
    .single();
  if (insertError) return json({ error: insertError.message }, 500);

  const storagePath = `${quote.company_id}/${planSet.id}/original-${storagePathSeed}.pdf`;
  await svc.from('plan_sets').update({ storage_path: storagePath }).eq('id', planSet.id);

  const { data: signed, error: signError } = await svc.storage.from('plan-sets').createSignedUploadUrl(storagePath);
  if (signError) {
    await svc.from('plan_sets').delete().eq('id', planSet.id);
    return json({ error: `Failed to create upload URL: ${signError.message}` }, 500);
  }

  return json({
    planSetId: planSet.id,
    storagePath,
    upload: { signedUrl: signed.signedUrl, token: signed.token, path: signed.path },
  });
}
