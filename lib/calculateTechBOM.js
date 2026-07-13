// BOM-shaped section for a technology page. Lines are the quote's entries
// for that technology (customLineItems with system === techId) plus, when a
// Tier-2 mini-calculator is registered, the lines its compute() derives from
// the design inputs (stamped fromCalculator by the Builder). The returned
// object matches the calculateBOM/calculateCameraBOM totals contract so
// CostSummary, exportPDF, exportProposal, and exportCSV consume it as-is.

const round2 = (n) => Math.round(n * 100) / 100;

export function calculateTechBOM(techId, lines = [], shipping = {}) {
  const { includeShipping = false, shippingPercent = 0 } = shipping;

  const items = [];
  const serviceItems = [];
  for (const line of lines) {
    if (line.system !== techId) continue;
    const qty = Number(line.qty) || 0;
    if (qty <= 0) continue;
    const unitCost = Number(line.cost) || 0;
    const unitPrice = Number(line.price) || 0;
    const totalCost = round2(qty * unitCost);
    const totalPrice = round2(qty * unitPrice);
    const entry = {
      sku: line.sku || '—',
      description: line.description || 'Untitled item',
      qty,
      unitCost,
      unitPrice,
      totalCost,
      totalPrice,
      total: totalPrice,
      margin: totalPrice > 0 ? round2(((totalPrice - totalCost) / totalPrice) * 100) : 0,
      category: line.category || 'Custom',
      note: line.note || '',
      isCustomLine: !line.fromCalculator,
      fromCalculator: !!line.fromCalculator,
      lineId: line.id,
    };
    if (line.isService || line.category === 'Service') serviceItems.push(entry);
    else items.push(entry);
  }

  const totalHardwareCost = round2(items.reduce((s, i) => s + i.totalCost, 0));
  const totalHardwarePrice = round2(items.reduce((s, i) => s + i.totalPrice, 0));
  const totalServicesCost = round2(serviceItems.reduce((s, i) => s + i.totalCost, 0));
  const totalServicesPrice = round2(serviceItems.reduce((s, i) => s + i.totalPrice, 0));

  const pct = includeShipping ? (Number(shippingPercent) || 0) / 100 : 0;
  const shippingCost = round2(totalHardwareCost * pct);
  const shippingPrice = round2(totalHardwarePrice * pct);

  const grandTotalCost = round2(totalHardwareCost + totalServicesCost + shippingCost);
  const grandTotalPrice = round2(totalHardwarePrice + totalServicesPrice + shippingPrice);

  return {
    items,
    serviceItems,
    totalHardwareCost,
    totalHardwarePrice,
    totalServicesCost,
    totalServicesPrice,
    shippingCost,
    shippingPrice,
    shippingPercent: includeShipping ? Number(shippingPercent) || 0 : 0,
    grandTotalCost,
    grandTotalPrice,
    overallMargin:
      grandTotalPrice > 0 ? round2(((grandTotalPrice - grandTotalCost) / grandTotalPrice) * 100) : 0,
  };
}
