const round2 = (n) => Math.round(n * 100) / 100;

// Normalise line items and compute the CO subtotal from qty × unit_price.
// This subtotal is budget/planning data; billing still happens via invoices.
export function computeCoTotals(rawItems) {
  const line_items = (Array.isArray(rawItems) ? rawItems : [])
    .map((i) => ({
      id: i.id ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      description: String(i.description ?? ''),
      qty: Number(i.qty) || 0,
      unit_price: round2(Number(i.unit_price) || 0),
    }))
    .map((i) => ({ ...i, total: round2(i.qty * i.unit_price) }));
  const subtotal = round2(line_items.reduce((s, i) => s + i.total, 0));
  return { line_items, subtotal };
}
