// Ported from PlanScope's src/lib/extractors/low-voltage-spec.ts.
import { DEFAULT_MODEL, estimateCostUsd, extractJson, getAnthropic, imageBlock, firstTextBlock } from '../anthropic';

const SYSTEM = `You are the Low Voltage Wiring spec extractor. Examine the attached pages (typically T-001 general-notes, T-501/T-502 details, T-601 schedules, T-701 diagrams) and pull cabling specifications. Identify: cable types and quantities, conduit / cable tray / J-hook pathway specs, grounding / firestop / penetration requirements, owner-furnished vs contractor-furnished callouts, and notable general notes a human estimator must not miss. Cite source pages for every item. Never invent specs.`;

const SCHEMA = `{
  "cables": [{ "type": string, "quantity_feet": number|null, "pathway": string|null, "source_pages": number[] }],
  "pathways": [{ "kind": string, "size_or_spec": string|null, "source_pages": number[] }],
  "grounding_firestop": [{ "requirement": string, "source_pages": number[] }],
  "owner_furnished": [{ "item": string, "source_pages": number[] }],
  "general_notes": [{ "note": string, "source_pages": number[] }]
}`;

export async function extractLowVoltageSpec(pages, model = DEFAULT_MODEL) {
  if (pages.length === 0) {
    return { cables: [], pathways: [], groundingFirestop: [], ownerFurnished: [], generalNotes: [], costUsd: 0 };
  }
  const client = getAnthropic();
  const pageList = pages.map((p) => p.pageNumber).join(', ');
  const prompt = `Pages attached, in order: ${pageList}.\n\nReturn JSON conforming exactly to this shape:\n${SCHEMA}\nReturn only the JSON object.`;

  const response = await client.messages.create({
    model,
    max_tokens: 4096,
    system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
    messages: [
      {
        role: 'user',
        content: [...pages.map((p) => imageBlock(p.image)), { type: 'text', text: prompt }],
      },
    ],
  });

  const raw = extractJson(firstTextBlock(response));
  return {
    cables: raw.cables.map((c) => ({ type: c.type, quantityFeet: c.quantity_feet, pathway: c.pathway, sourcePages: c.source_pages ?? [] })),
    pathways: raw.pathways.map((p) => ({ kind: p.kind, sizeOrSpec: p.size_or_spec, sourcePages: p.source_pages ?? [] })),
    groundingFirestop: raw.grounding_firestop.map((g) => ({ requirement: g.requirement, sourcePages: g.source_pages ?? [] })),
    ownerFurnished: raw.owner_furnished.map((o) => ({ item: o.item, sourcePages: o.source_pages ?? [] })),
    generalNotes: raw.general_notes.map((n) => ({ note: n.note, sourcePages: n.source_pages ?? [] })),
    costUsd: estimateCostUsd(model, response.usage),
  };
}

export function pickLowVoltageSpecPages(sheets, maxPages = 6) {
  const scored = sheets
    .map((s) => {
      let score = 0;
      const sn = s.sheetNumber ?? '';
      const title = (s.title ?? '').toLowerCase();
      if (/^T-?0\d{2}/i.test(sn)) score += 4;
      if (/^T-?5\d{2}/i.test(sn)) score += 4;
      if (/^T-?6\d{2}/i.test(sn)) score += 5;
      if (/^T-?7\d{2}/i.test(sn)) score += 5;
      if (/notes|details|schedule|diagram|riser/i.test(title)) score += 3;
      if (s.discipline === 'T') score += 1;
      return { pageNumber: s.pageNumber, score };
    })
    .filter((s) => s.score >= 4)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxPages)
    .sort((a, b) => a.pageNumber - b.pageNumber);

  return scored.map((s) => s.pageNumber);
}
