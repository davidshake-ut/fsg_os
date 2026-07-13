import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { hexToRgb, readableText } from './colors';
import { buildScopeOfWork } from './scopeOfWork';

const money = (n) =>
  `$${(Number.isFinite(n) ? n : 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

// Customer-facing proposal: sell price ONLY (no cost/margin), grouped into
// Wi-Fi/Camera Hardware & Labor without per-line items, preceded by a plain
// language scope of work.
export function exportProposalPDF({ inputs, cameraInputs, sections, term, branding = {} }) {
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

  // ---- Header banner ----
  doc.setFillColor(...primary);
  doc.rect(0, 0, pageW, 32, 'F');
  if (branding.logo?.dataUrl) {
    try {
      const lw = branding.logo.w || 200;
      const lh = branding.logo.h || 80;
      const scale = Math.min(45 / lw, 20 / lh);
      const drawW = lw * scale;
      const drawH = lh * scale;
      const fmt = /^data:image\/jpe?g/i.test(branding.logo.dataUrl) ? 'JPEG' : 'PNG';
      doc.addImage(branding.logo.dataUrl, fmt, pageW - M - drawW, (32 - drawH) / 2, drawW, drawH);
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
  const wifiBom = sections.find((s) => s.label === 'Wi-Fi')?.bom || sections[0]?.bom;
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
    if (!s.bom.items.length && !(s.bom.serviceItems && s.bom.serviceItems.length)) continue;
    const label = s.label || s.title;
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
