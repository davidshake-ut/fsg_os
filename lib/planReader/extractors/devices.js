// Ported from PlanScope's src/lib/extractors/devices.ts.
import { DEFAULT_MODEL, estimateCostUsd, extractJson, getAnthropic, imageBlock, firstTextBlock } from '../anthropic';

const SYSTEM_BY_TRADE = {
  access_control: `You are the device extractor for the Access Control trade. Examine the attached plan page and count every Access Control device on it: card readers, REX sensors, electric strikes/maglocks, door contacts, intercom stations, ACS panels, and any IDF/MDF locations relevant to ACS. Use the legend's symbol abbreviations to identify devices. Group identical devices into one finding with a count. Add a location_hint when room/zone is visible. confidence is 0.0-1.0 based on how clearly the symbol/label is visible. Never invent devices not on the page. Never count the same device twice.`,
  managed_wifi: `You are the device extractor for the Managed Wi-Fi trade. Count every wireless access point (indoor + outdoor), antenna, PoE injector, and managed switch on the attached plan page. Use the legend's symbol abbreviations. Group identical devices into one finding with a count. Add location_hint when visible. Never invent devices.`,
  low_voltage: `You are the device extractor for the Low Voltage Wiring trade. Count every data jack (with port count from the symbol qualifier when shown, e.g. "4-CAT6"), voice jack, fiber patch panel, copper patch panel, cable tray segment, J-hook callout, and any MDF/IDF/TE on the attached plan page. Group identical items into one finding with a count. Use the legend's symbol abbreviations. Never invent items.`,
};

const SCHEMA = `{
  "findings": [
    {
      "symbol": string|null,
      "description": string,
      "category": "device"|"mdf_idf"|"pathway"|"cable"|"note",
      "count": number,
      "location_hint": string|null,
      "confidence": number
    }
  ],
  "notes": string[]
}`;

function legendBlock(symbols) {
  if (!symbols || symbols.length === 0) return '(no legend found in this plan set — extract by visible label only)';
  return symbols
    .slice(0, 80)
    .map((s) => `${s.symbol} = ${s.description}${s.category ? ` [${s.category}]` : ''}`)
    .join('\n');
}

export async function extractDevicesForPage({ trade, pageNumber, pageImage, legendSymbols, model }) {
  const system = SYSTEM_BY_TRADE[trade];
  if (!system) throw new Error(`Unknown trade: ${trade}`);

  const client = getAnthropic();
  const resolvedModel = model ?? DEFAULT_MODEL;
  const legendText = `LEGEND for the ${trade} trade (use these exact symbols when describing extracted devices):\n${legendBlock(legendSymbols)}`;
  const perPagePrompt = `Plan page ${pageNumber} attached.\n\nReturn JSON conforming exactly to this shape:\n${SCHEMA}\nReturn only the JSON object.`;

  const response = await client.messages.create({
    model: resolvedModel,
    max_tokens: 2048,
    system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: legendText, cache_control: { type: 'ephemeral' } },
          imageBlock(pageImage),
          { type: 'text', text: perPagePrompt },
        ],
      },
    ],
  });

  const raw = extractJson(firstTextBlock(response));
  return {
    findings: (raw.findings ?? []).map((f) => ({
      symbol: f.symbol,
      description: f.description,
      category: f.category,
      count: f.count,
      locationHint: f.location_hint,
      confidence: f.confidence,
    })),
    notes: raw.notes ?? [],
    costUsd: estimateCostUsd(resolvedModel, response.usage),
  };
}

const KEYWORDS_BY_TRADE = {
  access_control: /\b(CARD READER|CR\b|REX|STRIKE|MAGLOCK|DOOR CONTACT|INTERCOM|ACS|ACCESS CONTROL)\b/i,
  managed_wifi: /\b(WAP\b|WIRELESS ACCESS POINT|ACCESS POINT|WLAN|PoE|CAT6A?)\b/i,
  low_voltage: /\b(DATA JACK|CAT6|FOPP|COPP|FIBER|CABLE TRAY|J-HOOK|JACK|TELECOM|LOW VOLTAGE)\b/i,
};

export function pickDeviceCandidatePages(sheets, trade) {
  const re = KEYWORDS_BY_TRADE[trade];
  const tSheets = sheets.filter((s) => s.discipline === 'T');
  const candidates = tSheets.length > 0 ? tSheets : sheets.filter((s) => s.discipline === 'E' || s.discipline === 'A');

  const scored = candidates
    .map((s) => {
      let score = 0;
      const sn = s.sheetNumber ?? '';
      if (/^T-?1\d{2}/i.test(sn)) score += 5;
      if (/^T-?4\d{2}/i.test(sn)) score += 3;
      if (/^T-?0\d{2}/i.test(sn)) score -= 2;
      if (/^T-?5\d{2}/i.test(sn)) score -= 2;
      if (/^T-?6\d{2}/i.test(sn)) score -= 2;
      if (/^T-?7\d{2}/i.test(sn)) score -= 2;
      if (s.textLayer && re && re.test(s.textLayer)) score += 2;
      if (!s.textLayer || s.textLayer.length < 50) score += 1;
      return { pageNumber: s.pageNumber, score };
    })
    .filter((s) => s.score >= 1)
    .sort((a, b) => b.score - a.score);

  return scored.map((s) => s.pageNumber);
}
