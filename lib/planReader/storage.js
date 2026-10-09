// File storage for the plan reader — the 'plan-sets' bucket added in
// migration 0069_plan_reader.sql. Paths are always <companyId>/<planSetId>/...
// (same folder-gated RLS pattern as proposal-files, see 0046).
import 'server-only';
import { getServiceClient } from '@/lib/supabase/server';

const BUCKET = 'plan-sets';

export function planSetFolder(companyId, planSetId) {
  return `${companyId}/${planSetId}`;
}

export async function uploadPlanFile(path, body, contentType) {
  const svc = getServiceClient();
  if (!svc) throw new Error('Supabase service client is not configured');
  const { error } = await svc.storage.from(BUCKET).upload(path, body, {
    contentType,
    upsert: true,
  });
  if (error) throw new Error(`Failed to upload ${path}: ${error.message}`);
  return path;
}

export async function downloadPlanFile(path) {
  const svc = getServiceClient();
  if (!svc) throw new Error('Supabase service client is not configured');
  const { data, error } = await svc.storage.from(BUCKET).download(path);
  if (error) throw new Error(`Failed to download ${path}: ${error.message}`);
  return Buffer.from(await data.arrayBuffer());
}

export async function signPlanFileUrl(path, expiresInSeconds = 300) {
  const svc = getServiceClient();
  if (!svc) throw new Error('Supabase service client is not configured');
  const { data, error } = await svc.storage.from(BUCKET).createSignedUrl(path, expiresInSeconds);
  if (error) throw new Error(`Failed to sign ${path}: ${error.message}`);
  return data.signedUrl;
}

export async function deletePlanFiles(paths) {
  if (!paths.length) return;
  const svc = getServiceClient();
  if (!svc) return;
  await svc.storage.from(BUCKET).remove(paths);
}
