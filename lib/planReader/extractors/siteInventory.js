// Ported from PlanScope's src/lib/extractors/site-inventory.ts.
import { DEFAULT_MODEL, estimateCostUsd, extractJson, getAnthropic, imageBlock, firstTextBlock } from '../anthropic';

const SYSTEM = `You are the site-inventory extractor. Read the cover, site, and architectural sheets of a plan set and return structured JSON describing the buildings, units, common areas, elevators, and outdoor spaces. Cite the source page numbers you pulled each fact from. If something is not stated explicitly, use null and add a note. Never invent counts.`;

const SCHEMA = `{
  "buildings": [
    { "name": string, "floors": number|null, "units_total": number|null, "unit_mix": object|null, "source_pages": number[] }
  ],
  "common_areas": [
    { "name": string, "area_sf": number|null, "source_pages": number[] }
  ],
  "outdoor_spaces": [
    { "kind": string, "name": string|null, "area_sf": number|null, "source_pages": number[] }
  ],
  "elevators_count": number|null,
  "parking_stalls": number|null,
  "notes": string[]
}`;

export async function extractSiteInventory(pages, model = DEFAULT_MODEL) {
  if (pages.length === 0) {
    return { buildings: [], commonAreas: [], outdoorSpaces: [], elevatorsCount: null, parkingStalls: null, notes: ['No candidate pages provided for site inventory'], costUsd: 0 };
  }

  const client = getAnthropic();
  const pageList = pages.map((p) => p.pageNumber).join(', ');
  const prompt = `Pages attached, in order: ${pageList}. Return the site inventory.\n\nReturn JSON conforming exactly to this shape:\n${SCHEMA}\nReturn only the JSON object.`;

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
    buildings: raw.buildings.map((b) => ({
      name: b.name,
      floors: b.floors,
      unitsTotal: b.units_total,
      unitMix: b.unit_mix,
      sourcePages: b.source_pages ?? [],
    })),
    commonAreas: raw.common_areas.map((c) => ({ name: c.name, areaSf: c.area_sf, sourcePages: c.source_pages ?? [] })),
    outdoorSpaces: raw.outdoor_spaces.map((o) => ({ kind: o.kind, name: o.name, areaSf: o.area_sf, sourcePages: o.source_pages ?? [] })),
    elevatorsCount: raw.elevators_count,
    parkingStalls: raw.parking_stalls,
    notes: raw.notes ?? [],
    costUsd: estimateCostUsd(model, response.usage),
  };
}

export function pickSiteInventoryCandidatePages(sheets, maxPages = 8) {
  const scored = sheets
    .map((s) => {
      let score = 0;
      const title = (s.title ?? '').toLowerCase();
      if (s.discipline === 'Cover') score += 5;
      if (s.discipline === 'Site') score += 4;
      if (s.discipline === 'A') score += 3;
      if (/site plan|building analysis|unit mix|amenity|cover|index/i.test(title)) score += 4;
      if (/floor plan|level/i.test(title)) score += 2;
      if (/g-1|g-2|a-0|a-1|c-1|t-100/i.test(s.sheetNumber ?? '')) score += 1;
      return { pageNumber: s.pageNumber, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxPages);

  return scored.sort((a, b) => a.pageNumber - b.pageNumber).map((s) => s.pageNumber);
}
