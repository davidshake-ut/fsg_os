import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { hexToRgb, readableText, pickLogo } from './colors';
import { fmtDate } from './format';
import { customerRows, signedText } from './optionComparison';

const money = (n) =>
  `$${(Number.isFinite(n) ? n : 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Customer-facing design-options document (complex-project Builder,
// Phase 6): one column per option, the customer rows of the comparison
// (sell prices, per-unit-per-month, design facts — never cost or margin),
// each option's note, and a recommendation line. Returns the doc so a
// caller can archive the bytes.
export function exportOptionsPDF({ comparison, propertyName = '', accountName = '', recommendation = '', branding = {} }) {
  const primary = hexToRgb(branding.primaryColor, [37, 99, 235]);
  const accent = hexToRgb(branding.accentColor, [30, 64, 175]);
  const headText = readableText(primary);
  const accentText = readableText(accent);
  const company = (branding.companyName || '').trim();

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'letter' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const M = 12;
  const contentW = pageW - 2 * M;
  const ensureSpace = (y, needed) => (y + needed > pageH - 14 ? (doc.addPage(), 18) : y);

  // ---- Header banner ----
  doc.setFillColor(...primary);
  doc.rect(0, 0, pageW, 26, 'F');
  const logo = pickLogo(branding, primary);
  if (logo?.dataUrl) {
    try {
      const lw = logo.w || 200;
      const lh = logo.h || 80;
      const scale = Math.min(50 / lw, 16 / lh);
      const fmt = /^data:image\/jpe?g/i.test(logo.dataUrl) ? 'JPEG' : 'PNG';
      doc.addImage(logo.dataUrl, fmt, pageW - M - lw * scale, (26 - lh * scale) / 2, lw * scale, lh * scale);
    } catch {
      /* ignore an unreadable logo */
    }
  }
  doc.setTextColor(...headText);
  doc.setFontSize(15);
  doc.text(company || 'Design Options', M, 11);
  doc.setFontSize(10);
  doc.text('Design Options', M, 17);
  doc.setFontSize(8.5);
  const sub = [accountName, propertyName].filter(Boolean).join('  •  ');
  if (sub) doc.text(sub, M, 22.5);
  doc.setTextColor(120);
  doc.setFontSize(8);
  doc.text(`Prepared: ${fmtDate(new Date())}`, pageW - M, 31, { align: 'right' });

  let y = 36;
  const cols = comparison.columns;
  const rows = customerRows(comparison);
  const fmtVal = (row, v) => {
    if (v === null || v === undefined) return '-';
    if (row.kind === 'money') return row.precise ? `$${(Number(v) || 0).toFixed(2)}` : money(Number(v) || 0);
    if (row.kind === 'number') return String(Number(v) || 0);
    return String(v ?? '—');
  };

  // ---- Options table ----
  const head = [['', ...cols.map((c) => c.label)]];
  const body = rows.map((row) => [
    row.label,
    ...row.values.map((v, i) => {
      const base = fmtVal(row, v);
      if (i === 0 || row.kind === 'text' || row.deltas[i] === null || row.deltas[i] === 0) return base;
      const d = row.deltas[i];
      return `${base}\n(${signedText(d, (x) => (row.kind === 'money' ? (row.precise ? `$${x.toFixed(2)}` : money(x)) : String(x)))} vs ${cols[0].label})`;
    }),
  ]);
  autoTable(doc, {
    startY: y,
    head,
    body,
    headStyles: { fillColor: primary, textColor: headText, fontSize: 9 },
    bodyStyles: { fontSize: 8.5, cellPadding: 2.5 },
    columnStyles: Object.fromEntries(cols.map((_, i) => [i + 1, { halign: 'right' }])),
    didParseCell: (data) => {
      const r = rows[data.row.index];
      if (data.section === 'body' && r?.total) data.cell.styles.fontStyle = 'bold';
    },
    margin: { left: M, right: M },
  });
  y = doc.lastAutoTable.finalY + 6;

  // ---- Notes per option ----
  const notes = cols.filter((c) => (c.notes || '').trim());
  if (notes.length) {
    y = ensureSpace(y, 20);
    doc.setTextColor(20);
    doc.setFontSize(11);
    doc.setFont(undefined, 'bold');
    doc.text('About each option', M, y);
    doc.setFont(undefined, 'normal');
    y += 5;
    for (const c of notes) {
      const lines = doc.splitTextToSize(`${c.label}: ${c.notes.trim()}`, contentW);
      y = ensureSpace(y, lines.length * 4.5 + 3);
      doc.setFontSize(9);
      doc.setTextColor(70);
      doc.text(lines, M, y);
      y += lines.length * 4.5 + 2;
    }
    y += 2;
  }

  // ---- Recommendation ----
  if ((recommendation || '').trim()) {
    y = ensureSpace(y, 18);
    doc.setFillColor(...accent);
    const lines = doc.splitTextToSize(recommendation.trim(), contentW - 8);
    const h = lines.length * 4.5 + 7;
    doc.rect(M, y, contentW, h, 'F');
    doc.setTextColor(...accentText);
    doc.setFontSize(9.5);
    doc.setFont(undefined, 'bold');
    doc.text('Recommendation', M + 4, y + 5);
    doc.setFont(undefined, 'normal');
    doc.text(lines, M + 4, y + 10);
    y += h + 4;
  }

  doc.setTextColor(130);
  doc.setFontSize(6.5);
  doc.setFont(undefined, 'italic');
  doc.text(`* Budgetary estimates. Per-unit figures spread the managed Wi-Fi investment over ${comparison.termMonths} months. Valid for 30 days.`, M, ensureSpace(y, 6));
  doc.setFont(undefined, 'normal');

  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(120);
    doc.text(`${company || 'Design Options'} | Page ${i} of ${pageCount}`, pageW / 2, pageH - 5, { align: 'center' });
  }

  const safeName = (propertyName || 'Property').replace(/[^a-zA-Z0-9]/g, '_');
  doc.save(`${safeName}_Design_Options.pdf`);
  return doc;
}
