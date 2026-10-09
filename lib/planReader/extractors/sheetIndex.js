// Ported from PlanScope's src/lib/extractors/sheet-index.ts.
import { DEFAULT_MODEL, estimateCostUsd, extractJson, getAnthropic, imageBlock, firstTextBlock } from '../anthropic';

const SYSTEM = `You are the sheet-index extractor for construction drawing sets. Read the cover and first few pages of a plan set, find the sheet index table and title block, and return strict JSON. Map every page in the set (1..N) to a discipline using these rules:
- T = telecom / low-voltage / technology
- E = electrical
- A = architectural
- M = mechanical / plumbing
- S = structural
- Site = civil / site / landscape / utility / hardscape
- Cover = cover / index / general notes
- Other = anything that doesn't fit
Use the sheet-number prefix (T-101, E-002, A-1.01, etc.) and the sheet title. If a page is not listed in any visible sheet index, infer from the title block. Never invent fields. If a field is not visible, use null.`;

const SCHEMA = `{
  "project": {
    "name": string|null,
    "plant_name": string|null,
    "address": string|null,
    "issue_date": string|null,
    "issue_status": string|null
  },
  "sheets": [
    { "page": number, "sheet_number": string|null, "title": string|null, "discipline": "T"|"E"|"A"|"M"|"S"|"Site"|"Cover"|"Other" }
  ]
}`;

export async function extractSheetIndex(pageImages, totalPages, model = DEFAULT_MODEL) {
  const client = getAnthropic();
  const prompt = `This plan set has ${totalPages} pages total. The first ${pageImages.length} are attached. Return the sheet index for ALL ${totalPages} pages, classifying each page's discipline.\n\nReturn JSON conforming exactly to this shape:\n${SCHEMA}\nReturn only the JSON object.`;

  const response = await client.messages.create({
    model,
    max_tokens: 8192,
    system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
    messages: [
      {
        role: 'user',
        content: [...pageImages.map(imageBlock), { type: 'text', text: prompt }],
      },
    ],
  });

  const raw = extractJson(firstTextBlock(response));
  return {
    project: {
      name: raw.project.name,
      plantName: raw.project.plant_name,
      address: raw.project.address,
      issueDate: raw.project.issue_date,
      issueStatus: raw.project.issue_status,
    },
    sheets: raw.sheets.map((s) => ({
      page: s.page,
      sheetNumber: s.sheet_number,
      title: s.title,
      discipline: s.discipline,
    })),
    costUsd: estimateCostUsd(model, response.usage),
  };
}
