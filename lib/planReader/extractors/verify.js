// Ported from PlanScope's src/lib/extractors/verify.ts.
import { DEFAULT_MODEL, estimateCostUsd, extractJson, getAnthropic, imageBlock, firstTextBlock } from '../anthropic';

const SYSTEM = `You are the self-verification reviewer for one trade. You receive: (a) the extracted Findings list with counts and confidence, (b) a sample of plan pages those findings came from. Re-read the pages. Flag any case where the visible symbols on a page do not match the reported count for that page, where a finding looks like a duplicate of another, or where confidence is overstated. Do NOT redo the extraction; only check it. Keep findings you cannot verify either way as 'ok'. Never invent new devices.`;

const SCHEMA = `{
  "ok": boolean,
  "discrepancies": [{ "description": string, "affected_finding_ids": string[], "severity": "low"|"medium"|"high" }],
  "review_queue_additions": string[]
}`;

export async function verifyTradeFindings({ trade, findings, samplePages, model }) {
  if (findings.length === 0 || samplePages.length === 0) {
    return { ok: true, discrepancies: [], reviewQueueAdditions: [], costUsd: 0 };
  }

  const client = getAnthropic();
  const resolvedModel = model ?? DEFAULT_MODEL;
  const findingsText = findings
    .map((f) => `- id=${f.id} symbol=${f.symbol ?? '—'} count=${f.count} conf=${f.confidence.toFixed(2)} page=${f.sourcePageNumber ?? '?'} desc="${f.description}"`)
    .join('\n');

  const prompt = `Trade: ${trade}\n\nFindings to verify:\n${findingsText}\n\nPages attached: ${samplePages.map((p) => p.pageNumber).join(', ')}\n\nReturn JSON conforming exactly to this shape:\n${SCHEMA}\nReturn only the JSON object.`;

  const response = await client.messages.create({
    model: resolvedModel,
    max_tokens: 2048,
    system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
    messages: [
      {
        role: 'user',
        content: [...samplePages.map((p) => imageBlock(p.image)), { type: 'text', text: prompt }],
      },
    ],
  });

  const raw = extractJson(firstTextBlock(response));
  return {
    ok: raw.ok,
    discrepancies: (raw.discrepancies ?? []).map((d) => ({ description: d.description, affectedFindingIds: d.affected_finding_ids ?? [], severity: d.severity })),
    reviewQueueAdditions: raw.review_queue_additions ?? [],
    costUsd: estimateCostUsd(resolvedModel, response.usage),
  };
}
