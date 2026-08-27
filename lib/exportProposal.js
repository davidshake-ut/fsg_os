import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { hexToRgb, readableText, pickLogo } from './colors';
import { buildScopeOfWork } from './scopeOfWork';
import { isAlternate, optionGroups, customerComparisonRows, signed } from './vendorComparison';
import { RECURRING_KIND_LABELS } from './recurring';
import { FINANCING_BASIS_LABELS } from './financing';

const money = (n) =>
  `$${(Number.isFinite(n) ? n : 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

// Customer-facing proposal: sell price ONLY (no cost/margin), grouped into
// Wi-Fi/Camera Hardware & Labor without per-line items, preceded by a plain
// language scope of work.
// recurring = computeRecurring(...) for the quote (customer lines print);
// financing = the quote summary's financing block (prints when offered).
export function exportProposalPDF({ inputs, cameraInputs, sections, term, branding = {}, recurring = null, financing = null }) {
  const primary = hexToRgb(branding.primaryColor, [37, 99, 235]);
  const accent = hexToRgb(branding.accentColor, [30, 64, 175]);
  const headText = readableText(primary);
  const accentText = readableText(accent);
  const company = (branding.companyName || '').trim();

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const M = 16;
  const contentW = pageW - 2 * M;

  const ensureSpace = (y, needed) => (y + needed > pageH - 16 ? (doc.addPage(), 20) : y);

  const bannerLogo = pickLogo(branding, primary);

  // ---- Header banner ----
  doc.setFillColor(...primary);
  doc.rect(0, 0, pageW, 32, 'F');
  if (bannerLogo?.dataUrl) {
    try {
      const lw = bannerLogo.w || 200;
      const lh = bannerLogo.h || 80;
      const scale = Math.min(45 / lw, 20 / lh);
      const drawW = lw * scale;
      const drawH = lh * scale;
      const fmt = /^data:image\/jpe?g/i.test(bannerLogo.dataUrl) ? 'JPEG' : 'PNG';
      doc.addImage(bannerLogo.dataUrl, fmt, pageW - M - drawW, (32 - drawH) / 2, drawW, drawH);
    } catch {
      /* ignore an unreadable logo */
    }
  }
  doc.setTextColor(...headText);
  doc.setFontSize(18);
  doc.text(company || 'System Proposal', M, 15);
  doc.setFontSize(11);
  doc.text('System Proposal', M, 23);
  doc.setFontSize(9.5);
  const sub = [inputs.propertyName, inputs.propertyAddress].filter(Boolean).join('  •  ');
  if (sub) doc.text(sub, M, 29);

  let y = 42;

  // ---- Scope of Work ----
  // The scope narrative describes the engineered design (AP / camera
  // counts), which only the legacy engine sections carry — an Option-B
  // alternate is that same design priced with another vendor, so the engine
  // section is the right source whichever vendor is primary. No positional
  // fallback: a quote without the engine gets no Wi-Fi paragraph rather
  // than some other section's numbers.
  const wifiBom = sections.find((s) => s.label === 'Wi-Fi')?.bom || { totalAPs: 0 };
  const cameraBom = sections.find((s) => s.label === 'Camera')?.bom || { totalCameras: 0 };
  const blocks = buildScopeOfWork({ inputs, cameraInputs, wifiBom, cameraBom, term });

  doc.setTextColor(20);
  doc.setFontSize(14);
  doc.setFont(undefined, 'bold');
  doc.text('Scope of Work', M, y);
  y += 7;
  doc.setFont(undefined, 'normal');

  for (const b of blocks) {
    y = ensureSpace(y, 24);
    doc.setTextColor(...primary);
    doc.setFontSize(11);
    doc.setFont(undefined, 'bold');
    doc.text(b.title, M, y);
    y += 5.5;
    doc.setFont(undefined, 'normal');
    doc.setTextColor(70);
    doc.setFontSize(9.5);
    const lines = doc.splitTextToSize(b.text, contentW);
    y = ensureSpace(y, lines.length * 4.7 + 4);
    doc.text(lines, M, y);
    y += lines.length * 4.7 + 5;
  }

  // ---- Investment Summary (sell price only, grouped) ----
  y = ensureSpace(y, 50);
  y += 2;
  doc.setTextColor(20);
  doc.setFontSize(14);
  doc.setFont(undefined, 'bold');
  doc.text('Investment Summary', M, y);
  doc.setFont(undefined, 'normal');
  y += 4;

  const rows = [];
  let total = 0;
  for (const s of sections) {
    if (isAlternate(s)) continue; // Option B is the same system priced again — never additive
    if (!s.bom.items.length && !(s.bom.serviceItems && s.bom.serviceItems.length)) continue;
    // Inside an option group the vendor is named so the customer can match
    // this line to the alternate table below.
    const label = s.optionGroup != null && s.vendorName ? `${s.label || s.title} (${s.vendorName})` : s.label || s.title;
    const hardware = s.bom.totalHardwarePrice + s.bom.shippingPrice; // shipping rolled in
    if (hardware > 0) {
      rows.push([`${label} Hardware & Equipment`, money(hardware)]);
      total += hardware;
    }
    if (s.bom.totalServicesPrice > 0) {
      // A dedicated labor section stands on its own; a hardware section's labor
      // is named relative to that system.
      rows.push([
        s.isLabor ? 'Professional Labor' : `${label} Installation & Labor`,
        money(s.bom.totalServicesPrice),
      ]);
      total += s.bom.totalServicesPrice;
    }
  }

  autoTable(doc, {
    startY: y,
    head: [['Description', 'Investment']],
    body: rows,
    foot: [['Total Investment', money(total)]],
    headStyles: { fillColor: primary, textColor: headText, fontSize: 11 },
    footStyles: { fillColor: accent, textColor: accentText, fontStyle: 'bold', fontSize: 12 },
    bodyStyles: { fontSize: 10.5, cellPadding: 3 },
    columnStyles: { 1: { halign: 'right', cellWidth: 45 } },
    margin: { left: M, right: M },
  });
  y = doc.lastAutoTable.finalY + 8;

  // ---- Alternate options (customer-safe: sell price only) ----
  for (const group of optionGroups(sections)) {
    const alternates = group.options.filter((o) => !o.isPrimary);
    const numericCols = Object.fromEntries(
      Array.from({ length: group.options.length + alternates.length }, (_, i) => [i + 1, { halign: 'right' }])
    );
    y = ensureSpace(y, 50);
    doc.setTextColor(20);
    doc.setFontSize(14);
    doc.setFont(undefined, 'bold');
    doc.text(`Alternate Option — ${alternates.map((o) => o.vendorName).join(' / ')}`, M, y);
    doc.setFont(undefined, 'normal');
    y += 4;
    autoTable(doc, {
      startY: y,
      head: [[
        'Description',
        ...group.options.map((o) => `Option ${o.letter} — ${o.vendorName}`),
        ...alternates.map((o) => (alternates.length > 1 ? `Difference (${o.letter})` : 'Difference')),
      ]],
      body: customerComparisonRows(group).map((row) => [
        row.label,
        ...row.values.map(money),
        ...alternates.map((o) => {
          const d = row.deltas[group.options.indexOf(o)];
          return d === null ? '' : signed(d, money);
        }),
      ]),
      headStyles: { fillColor: primary, textColor: headText, fontSize: 10 },
      bodyStyles: { fontSize: 10, cellPadding: 3 },
      columnStyles: numericCols,
      margin: { left: M, right: M },
    });
    y = doc.lastAutoTable.finalY + 3;
    doc.setTextColor(120);
    doc.setFontSize(8);
    doc.setFont(undefined, 'italic');
    doc.text(
      `Option A is the proposed ${group.label} investment reflected in the summary above. Alternates are offered for comparison only and are not included in the Total Investment.`,
      M,
      y + 3,
      { maxWidth: contentW }
    );
    doc.setFont(undefined, 'normal');
    y += 16;
  }

  // ---- Recurring services (monthly, customer lines only) ----
  const recurringLines = (recurring?.lines ?? []).filter((l) => l.customer !== false && l.monthlyPrice > 0);
  if (recurringLines.length) {
    y = ensureSpace(y, 50);
    doc.setTextColor(20);
    doc.setFontSize(14);
    doc.setFont(undefined, 'bold');
    doc.text('Recurring Services', M, y);
    doc.setFont(undefined, 'normal');
    y += 4;
    const monthlyTotal = recurring.totals?.monthlyPrice ?? recurringLines.reduce((s, l) => s + l.monthlyPrice, 0);
    const perUnit = recurring.units > 0 ? monthlyTotal / recurring.units : null;
    autoTable(doc, {
      startY: y,
      head: [['Service', 'Term', 'Monthly']],
      body: recurringLines.map((l) => [
        l.label || RECURRING_KIND_LABELS[l.kind] || 'Recurring service',
        l.termMonths ? `${l.termMonths} months` : l.period === 'year' ? 'Billed annually' : 'Month to month',
        money(l.monthlyPrice),
      ]),
      foot: [[perUnit !== null ? `Total monthly recurring  (${money(perUnit)} per unit per month)` : 'Total monthly recurring', '', money(monthlyTotal)]],
      headStyles: { fillColor: primary, textColor: headText, fontSize: 10 },
      footStyles: { fillColor: accent, textColor: accentText, fontStyle: 'bold', fontSize: 10.5 },
      bodyStyles: { fontSize: 10, cellPadding: 3 },
      columnStyles: { 1: { cellWidth: 40 }, 2: { halign: 'right', cellWidth: 40 } },
      margin: { left: M, right: M },
    });
    y = doc.lastAutoTable.finalY + 8;
  }

  // ---- Financing options (when the proposal offers them) ----
  const financeOptions = financing?.enabled ? financing.options ?? [] : [];
  if (financeOptions.length && (financing.principal ?? 0) > 0) {
    y = ensureSpace(y, 50);
    doc.setTextColor(20);
    doc.setFontSize(14);
    doc.setFont(undefined, 'bold');
    doc.text('Financing Options', M, y);
    doc.setFont(undefined, 'normal');
    y += 4;
    const perUnitCol = financeOptions.some((o) => (o.perUnitMonth ?? 0) > 0);
    autoTable(doc, {
      startY: y,
      head: [['Term', 'Monthly payment', ...(perUnitCol ? ['Per unit per month'] : []), 'Total of payments']],
      body: financeOptions.map((o) => [
        `${o.months} months`,
        money(o.monthly),
        ...(perUnitCol ? [money(o.perUnitMonth)] : []),
        money(o.total),
      ]),
      headStyles: { fillColor: primary, textColor: headText, fontSize: 10 },
      bodyStyles: { fontSize: 10, cellPadding: 3 },
      columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } },
      margin: { left: M, right: M },
    });
    y = doc.lastAutoTable.finalY + 3;
    doc.setTextColor(120);
    doc.setFontSize(8);
    doc.setFont(undefined, 'italic');
    const financed = (financing.principal ?? 0) + (financing.uplift ?? 0);
    doc.text(
      `Payments finance the ${(FINANCING_BASIS_LABELS[financing.basis] ?? 'total investment').toLowerCase()} of ${money(financed)} at ${financing.apr}% APR. Subject to credit approval; rates and terms are estimates.`,
      M,
      y + 3,
      { maxWidth: contentW }
    );
    doc.setFont(undefined, 'normal');
    y += 14;
  }

  // ---- Acceptance / terms ----
  y = ensureSpace(y, 40);
  doc.setTextColor(120);
  doc.setFontSize(8);
  doc.setFont(undefined, 'italic');
  doc.text(
    'Investment shown includes all hardware, software subscriptions, shipping & handling, and professional labor described above. Budgetary estimate, valid for 30 days.',
    M,
    y,
    { maxWidth: contentW }
  );
  doc.setFont(undefined, 'normal');
  y += 14;

  y = ensureSpace(y, 30);
  doc.setDrawColor(200);
  doc.setTextColor(60);
  doc.setFontSize(9.5);
  doc.line(M, y + 10, M + 75, y + 10);
  doc.text('Authorized Signature', M, y + 14);
  doc.line(pageW - M - 60, y + 10, pageW - M, y + 10);
  doc.text('Date', pageW - M - 60, y + 14);

  // ---- Footer on every page ----
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7.5);
    doc.setTextColor(120);
    doc.text(
      `${company || 'System Proposal'} | Page ${i} of ${pageCount}`,
      pageW / 2,
      pageH - 8,
      { align: 'center' }
    );
  }

  const safeName = (inputs.propertyName || 'Project').replace(/[^a-zA-Z0-9]/g, '_');
  doc.save(`${safeName}_Proposal.pdf`);
  // Callers that archive a copy read the bytes off the returned doc.
  return doc;
}
