// Ported from PlanScope's src/lib/extractors/legend.ts.
import { DEFAULT_MODEL, estimateCostUsd, extractJson, getAnthropic, imageBlock, firstTextBlock } from '../anthropic';

const SYSTEM_BY_TRADE = {
  access_control: `You are the legend extractor for the Access Control trade. Find symbols on the attached plan pages that represent: card readers, REX (request-to-exit), door contacts, electric strikes/maglocks, intercom stations, ACS panels, MDF/IDF locations relevant to ACS. Each unique graphic shape with a label/description belongs in the symbols array. Use the legend's exact symbol abbreviation (e.g. "CR", "REX") as the symbol field, never the icon shape itself. If a symbol's description is unclear, use null. Never invent symbols not present on the page.`,
  managed_wifi: `You are the legend extractor for the Managed Wi-Fi trade. Find symbols representing: wireless access points (WAP/AP, indoor + outdoor), antennas, network switches, PoE injectors, cable trays/J-hooks for AP cabling, MDF/IDF. Use the legend's exact abbreviation. Never invent symbols.`,
  low_voltage: `You are the legend extractor for the Low Voltage Wiring trade. Find symbols representing: data jacks, voice jacks, fiber optic patch panels (FOPP), copper patch panels, cable types (Cat6/6A, fiber strand counts), cable tray, conduit callouts, J-hooks, MDF/IDF/TE. Use the legend's exact abbreviation. Never invent symbols.`,
};

const SCHEMA = `{
  "source_pages": number[],
  "symbols": [
    { "symbol": string, "description": string, "category": string|null, "notes": string|null }
  ],
  "notes": string[]
}`;

export async function extractLegend(trade, candidatePages, model = DEFAULT_MODEL) {
  const system = SYSTEM_BY_TRADE[trade];
  if (!system) throw new Error(`Unknown trade for legend extraction: ${trade}`);
  if (candidatePages.length === 0) {
    return { trade, sourceSheetPages: [], symbols: [], notes: ['No candidate pages provided for legend extraction'], costUsd: 0 };
  }

  const client = getAnthropic();
  const pageList = candidatePages.map((p) => p.pageNumber).join(', ');
  const prompt = `Pages attached, in order: ${pageList}. Extract the symbol legend for the ${trade} trade. Use the page numbers in source_pages to indicate which attached pages the legend was pulled from.\n\nReturn JSON conforming exactly to this shape:\n${SCHEMA}\nReturn only the JSON object.`;

  const response = await client.messages.create({
    model,
    max_tokens: 4096,
    system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
    messages: [
      {
        role: 'user',
        content: [...candidatePages.map((p) => imageBlock(p.image)), { type: 'text', text: prompt }],
      },
    ],
  });

  const raw = extractJson(firstTextBlock(response));
  return {
    trade,
    sourceSheetPages: raw.source_pages ?? [],
    symbols: raw.symbols ?? [],
    notes: raw.notes ?? [],
    costUsd: estimateCostUsd(model, response.usage),
  };
}

export function pickLegendCandidatePages(sheets, trade, maxPages = 4) {
  const tradeKeywords = {
    access_control: /\b(SYMBOL|LEGEND|ACS|CARD READER|REX|STRIKE|INTERCOM)\b/i,
    managed_wifi: /\b(SYMBOL|LEGEND|WAP|ACCESS POINT|WIRELESS|PoE|CAT6)\b/i,
    low_voltage: /\b(SYMBOL|LEGEND|DATA|FIBER|FOPP|CAT6|CABLE TRAY|J-HOOK)\b/i,
  };
  const re = tradeKeywords[trade] ?? /LEGEND|SYMBOL/i;

  const scored = sheets
    .filter((s) => ['T', 'E', 'Cover'].includes(s.discipline ?? ''))
    .map((s) => {
      let score = 0;
      const title = s.title ?? '';
      if (/legend|symbol|notes|abbreviation/i.test(title)) score += 5;
      if (s.textLayer && re.test(s.textLayer)) score += 3;
      if (s.discipline === 'T') score += 2;
      if (s.sheetNumber && /001|0\.01|0\.1$/.test(s.sheetNumber)) score += 2;
      return { pageNumber: s.pageNumber, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxPages);

  return scored.map((s) => s.pageNumber);
}
