// Ported from PlanScope's src/lib/chat/retrieve.ts + respond.ts, collapsed
// into one module and re-pointed at Supabase instead of Prisma. Same
// keyword-overlap retrieval (no vector DB) and same citation-grounded
// answer style.
import { DEFAULT_MODEL, estimateCostUsd, getAnthropic } from './anthropic';

const STOPWORDS = new Set([
  'the', 'a', 'an', 'of', 'and', 'or', 'is', 'are', 'in', 'on', 'for', 'to', 'with',
  'what', 'where', 'how', 'many', 'show', 'list', 'give', 'tell', 'me', 'this', 'that',
  'do', 'does', 'have', 'has', 'i', 'you', 'we',
]);

function tokenize(query) {
  return query
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

function scoreText(text, terms) {
  const lower = text.toLowerCase();
  let score = 0;
  let bestPos = -1;
  for (const term of terms) {
    let pos = -1;
    let count = 0;
    while ((pos = lower.indexOf(term, pos + 1)) !== -1) {
      count++;
      if (bestPos === -1) bestPos = pos;
    }
    if (count > 0) score += Math.min(count, 5) * (term.length >= 4 ? 2 : 1);
  }
  const start = Math.max(0, bestPos - 60);
  const end = Math.min(text.length, bestPos + 200);
  const excerpt = bestPos === -1 ? text.slice(0, 200) : (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '');
  return { score, excerpt };
}

// svc: a Supabase service-role client, already scoped by RLS/company checks
// upstream (the caller's company was verified before this runs).
export async function retrieveContext(svc, { planSetId, query, maxSheets = 5, maxFindings = 8 }) {
  const terms = tokenize(query);

  const [{ data: sheets }, { data: analyses }, { data: inventoryRows }] = await Promise.all([
    svc.from('plan_sheets').select('id, page_number, sheet_number, title, discipline, text_layer').eq('plan_set_id', planSetId),
    svc.from('plan_analyses').select('id').eq('plan_set_id', planSetId),
    svc.from('plan_site_inventory').select('buildings, common_areas, outdoor_spaces, elevators_count, analysis_id').limit(1),
  ]);

  const analysisIds = (analyses ?? []).map((a) => a.id);
  const { data: findings } = analysisIds.length
    ? await svc
        .from('plan_findings')
        .select('id, trade, symbol, description, count, confidence, source, source_sheet_id, plan_sheets(sheet_number)')
        .in('analysis_id', analysisIds)
    : { data: [] };

  const sheetCitations = (sheets ?? [])
    .map((s) => {
      const { score, excerpt } = scoreText(`${s.title ?? ''} ${s.sheet_number ?? ''} ${s.text_layer ?? ''}`, terms);
      return {
        kind: 'sheet',
        sheetId: s.id,
        pageNumber: s.page_number,
        sheetNumber: s.sheet_number,
        title: s.title,
        discipline: s.discipline,
        excerpt,
        score,
      };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxSheets);

  const findingCitations = (findings ?? [])
    .map((f) => {
      const { score } = scoreText(`${f.description} ${f.symbol ?? ''} ${f.trade}`, terms);
      return {
        kind: 'finding',
        findingId: f.id,
        trade: f.trade,
        symbol: f.symbol,
        description: f.description,
        count: f.count,
        confidence: Number(f.confidence ?? 0),
        source: f.source,
        sourceSheetNumber: f.plan_sheets?.sheet_number ?? null,
        score,
      };
    })
    .filter((f) => f.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxFindings);

  const inventory = (inventoryRows ?? [])[0] ?? null;
  const inventoryExcerpt = inventory
    ? JSON.stringify({ buildings: inventory.buildings, commonAreas: inventory.common_areas, outdoorSpaces: inventory.outdoor_spaces, elevatorsCount: inventory.elevators_count }, null, 2).slice(0, 2000)
    : null;

  return { citations: [...sheetCitations, ...findingCitations], inventoryExcerpt };
}

const SYSTEM = `You are the project assistant for a construction plan set and its AI takeoff. Answer questions about this single plan set and its findings. Ground every numeric claim in the provided context (sheets, findings, site inventory). When you cite a fact, refer to the sheet number (e.g., "T-101") or the finding number (#1, #2 …) so the user can trace it. If the context does not contain the answer, say so plainly — never invent counts, locations, or specs. Keep answers concise (under 200 words unless the user asks for detail). Use markdown for lists and tables.`;

function renderContextBlock(citations, inventoryExcerpt) {
  const sheets = citations.filter((c) => c.kind === 'sheet');
  const findings = citations.filter((c) => c.kind === 'finding');

  const parts = [];
  if (sheets.length > 0) {
    parts.push('## Relevant sheets');
    sheets.forEach((s, i) => parts.push(`[S${i + 1}] ${s.sheetNumber ?? '—'} (page ${s.pageNumber}, ${s.discipline}) — ${s.title ?? ''}\nExcerpt: ${s.excerpt}`));
  }
  if (findings.length > 0) {
    parts.push('\n## Relevant findings');
    findings.forEach((f, i) => parts.push(`[#${i + 1}] ${f.trade} · ${f.symbol ?? '—'} · ${f.description} · count=${f.count} · conf=${f.confidence.toFixed(2)} · source=${f.source}${f.sourceSheetNumber ? ` · on ${f.sourceSheetNumber}` : ''}`));
  }
  if (inventoryExcerpt) {
    parts.push('\n## Site inventory (JSON excerpt)');
    parts.push(inventoryExcerpt);
  }
  return parts.join('\n');
}

export async function respondToChat({ history, userMessage, citations, inventoryExcerpt, model }) {
  const client = getAnthropic();
  const resolvedModel = model ?? DEFAULT_MODEL;
  const contextBlock = renderContextBlock(citations, inventoryExcerpt);

  const messages = [
    ...history.map((m) => ({ role: m.role, content: m.content })),
    {
      role: 'user',
      content: contextBlock
        ? `${userMessage}\n\n---\nCONTEXT FOR THIS QUESTION (do not output verbatim — synthesize):\n${contextBlock}`
        : userMessage,
    },
  ];

  const response = await client.messages.create({
    model: resolvedModel,
    max_tokens: 1024,
    system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
    messages,
  });

  const textBlock = response.content.find((b) => b.type === 'text');
  const text = textBlock ? textBlock.text : '(no response)';

  const findingCitations = citations.filter((c) => c.kind === 'finding');
  const sheetMatches = new Set();
  const findingMatches = new Set();
  for (const c of citations) {
    if (c.kind === 'sheet' && c.sheetNumber && text.includes(c.sheetNumber)) sheetMatches.add(c.sheetId);
    if (c.kind === 'finding') {
      const idx = findingCitations.indexOf(c) + 1;
      if (new RegExp(`#${idx}\\b`).test(text)) findingMatches.add(c.findingId);
    }
  }

  const citationsUsed = [
    ...citations.filter((c) => c.kind === 'sheet' && sheetMatches.has(c.sheetId)).map((c) => ({ kind: 'sheet', sheetId: c.sheetId, sheetNumber: c.sheetNumber, pageNumber: c.pageNumber })),
    ...citations.filter((c) => c.kind === 'finding' && findingMatches.has(c.findingId)).map((c) => ({ kind: 'finding', findingId: c.findingId, description: c.description })),
  ];

  return { text, citationsUsed, costUsd: estimateCostUsd(resolvedModel, response.usage) };
}
