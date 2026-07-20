// Invoice downloads — CSV and branded PDF. Mirrors the proposal exporter
// (lib/exportPDF.js): same jsPDF stack, same branding logo treatment.

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { hexToRgb, lightTint, readableText, pickLogo } from './colors';
import { fmtDate } from './format';

const money = (n) =>
  `$${(Number.isFinite(Number(n)) ? Number(n) : 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

function safeFileBase(inv) {
  return (inv.invoice_number || 'invoice').replace(/[^\w.-]+/g, '_');
}

function triggerDownload(blobOrUrl, filename) {
  const url = typeof blobOrUrl === 'string' ? blobOrUrl : URL.createObjectURL(blobOrUrl);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  if (typeof blobOrUrl !== 'string') URL.revokeObjectURL(url);
}

// ── CSV ───────────────────────────────────────────────────────────────────
export function exportInvoiceCSV(inv) {
  const esc = (v) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lineItems = Array.isArray(inv.line_items) ? inv.line_items : [];
  const rows = [
    ['Invoice Number', inv.invoice_number ?? ''],
    ['Title', inv.title ?? ''],
    ['Customer', inv.customer_name ?? ''],
    ['Invoice Date', fmtDate(inv.invoice_date)],
    ['Due Date', fmtDate(inv.due_date)],
    ['Status', inv.status ?? ''],
    [],
    ['Description', 'Qty', 'Unit Price', 'Total'],
    ...lineItems.map((i) => [i.description, i.qty, Number(i.unit_price ?? 0).toFixed(2), Number(i.total ?? 0).toFixed(2)]),
    [],
    ['Subtotal', '', '', Number(inv.subtotal ?? 0).toFixed(2)],
    ...(Number(inv.tax_rate) > 0 ? [[`Tax (${inv.tax_rate}%)`, '', '', Number(inv.tax_amount ?? 0).toFixed(2)]] : []),
    ['Total', '', '', Number(inv.total ?? 0).toFixed(2)],
  ];
  const csv = rows.map((r) => r.map(esc).join(',')).join('\r\n');
  triggerDownload(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `${safeFileBase(inv)}.csv`);
}

// ── PDF ───────────────────────────────────────────────────────────────────
export function exportInvoicePDF(inv, branding = {}) {
  const primary = hexToRgb(branding.primaryColor, [37, 99, 235]);
  const lightFill = lightTint(primary);
  const headText = readableText(primary);
  const companyName = (branding.companyName || '').trim();
  const lineItems = Array.isArray(inv.line_items) ? inv.line_items : [];

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  const bannerLogo = pickLogo(branding, primary);

  // Header banner with the team logo (top-right, aspect-preserved).
  doc.setFillColor(...primary);
  doc.rect(0, 0, pageW, 30, 'F');
  if (bannerLogo?.dataUrl) {
    try {
      const lw = bannerLogo.w || 200;
      const lh = bannerLogo.h || 80;
      const scale = Math.min(50 / lw, 20 / lh);
      const drawW = lw * scale;
      const drawH = lh * scale;
      const fmt = /^data:image\/jpe?g/i.test(bannerLogo.dataUrl) ? 'JPEG' : 'PNG';
      doc.addImage(bannerLogo.dataUrl, fmt, pageW - 12 - drawW, (30 - drawH) / 2, drawW, drawH);
    } catch {
      /* ignore an unreadable logo */
    }
  }
  doc.setTextColor(...headText);
  doc.setFontSize(16);
  doc.text('INVOICE', 12, 12);
  doc.setFontSize(10);
  if (companyName) doc.text(companyName, 12, 19);
  doc.setFontSize(9);
  doc.text(inv.invoice_number || '', 12, 25);

  // Bill-to and dates.
  doc.setTextColor(30);
  doc.setFontSize(12);
  doc.text(inv.title || 'Invoice', 12, 40);
  doc.setFontSize(9);
  doc.setTextColor(90);
  let y = 47;
  const meta = [
    ['Bill To', inv.customer_name || '—'],
    ['Invoice Date', fmtDate(inv.invoice_date)],
    ['Due Date', fmtDate(inv.due_date)],
    ['Status', (inv.status || 'draft').toUpperCase()],
  ];
  for (const [k, v] of meta) {
    doc.setFont(undefined, 'bold');
    doc.text(`${k}:`, 12, y);
    doc.setFont(undefined, 'normal');
    doc.text(String(v), 42, y);
    y += 5.5;
  }

  // Line items.
  autoTable(doc, {
    startY: y + 4,
    head: [['Description', 'Qty', 'Unit Price', 'Total']],
    body: lineItems.map((i) => [i.description || '', String(i.qty ?? ''), money(i.unit_price), money(i.total)]),
    margin: { left: 12, right: 12 },
    styles: { fontSize: 9, cellPadding: 2.5 },
    headStyles: { fillColor: primary, textColor: headText },
    alternateRowStyles: { fillColor: lightFill },
    columnStyles: {
      1: { halign: 'right', cellWidth: 18 },
      2: { halign: 'right', cellWidth: 30 },
      3: { halign: 'right', cellWidth: 30 },
    },
  });

  // Totals.
  let ty = (doc.lastAutoTable?.finalY ?? y) + 8;
  const totalRows = [
    ['Subtotal', money(inv.subtotal)],
    ...(Number(inv.tax_rate) > 0 ? [[`Tax (${inv.tax_rate}%)`, money(inv.tax_amount)]] : []),
    ['Total', money(inv.total)],
  ];
  doc.setFontSize(10);
  for (const [label, val] of totalRows) {
    const isTotal = label === 'Total';
    if (ty > pageH - 20) { doc.addPage(); ty = 18; }
    doc.setFont(undefined, isTotal ? 'bold' : 'normal');
    doc.setTextColor(isTotal ? 20 : 90);
    doc.text(label, pageW - 60, ty);
    doc.text(val, pageW - 12, ty, { align: 'right' });
    ty += isTotal ? 0 : 6;
  }

  // Notes.
  if (inv.notes) {
    let ny = ty + 12;
    if (ny > pageH - 30) { doc.addPage(); ny = 18; }
    doc.setFont(undefined, 'bold');
    doc.setFontSize(9);
    doc.setTextColor(90);
    doc.text('Notes / Terms', 12, ny);
    doc.setFont(undefined, 'normal');
    const wrapped = doc.splitTextToSize(inv.notes, pageW - 24);
    doc.text(wrapped, 12, ny + 5);
  }

  doc.save(`${safeFileBase(inv)}.pdf`);
}
