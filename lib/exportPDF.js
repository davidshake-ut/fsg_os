import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { CATEGORY_ORDER } from './catalog';
import { hexToRgb, lightTint, readableText, pickLogo } from './colors';
import { fmtDate } from './format';

const money = (n) =>
  `$${(Number.isFinite(n) ? n : 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

function categorySort(items) {
  return [...items].sort((a, b) => {
    const ai = CATEGORY_ORDER.indexOf(a.category);
    const bi = CATEGORY_ORDER.indexOf(b.category);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });
}

// Wi-Fi KPI row builder — kept here so callers stay terse.
export function wifiKpis(bom, term) {
  return [
    ['Total APs', String(bom.totalAPs)],
    [`${term.summaryUnit} APs`, String(bom.guestRoomAPs)],
    ['IDF Switches', String(bom.totalIdfSwitches + (bom.needsAggSwitch ? 1 : 0))],
    ['Total Cost', money(bom.grandTotalCost)],
    ['Sell Price', money(bom.grandTotalPrice)],
    ['Margin', `${bom.overallMargin.toFixed(1)}%`],
  ];
}

// Camera KPI row builder.
export function cameraKpis(bom) {
  return [
    ['Total Cameras', String(bom.totalCameras)],
    ['NVRs (8-ch)', String(bom.nvrCount)],
    ['Total Cost', money(bom.grandTotalCost)],
    ['Sell Price', money(bom.grandTotalPrice)],
    ['Margin', `${bom.overallMargin.toFixed(1)}%`],
  ];
}

// Multi-section quote. `sections` is [{ title, bom, kpis }, …] — each system
// renders its own KPI strip, hardware table, services table, and subtotal;
// a combined project total + gross-profit banner closes it out.
export function exportPDF(inputs, sections, opts = {}) {
  const {
    title = 'Managed Systems — Budgetary Quote',
    footerLabel = 'Managed Systems',
    fileSuffix = 'Quote',
    branding = {},
  } = opts;

  const primary = hexToRgb(branding.primaryColor, [37, 99, 235]);
  const accent = hexToRgb(branding.accentColor, [30, 64, 175]);
  const lightFill = lightTint(primary);
  const headText = readableText(primary); // readable on the primary fill
  const accentText = readableText(accent);
  const companyName = (branding.companyName || '').trim();
  const brandFooter = companyName || footerLabel;

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'letter' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  const bannerLogo = pickLogo(branding, primary);

  // ---- Header banner ----
  doc.setFillColor(...primary);
  doc.rect(0, 0, pageW, 28, 'F');

  // Logo (top-right, aspect-preserved within an 18×60mm box)
  if (bannerLogo?.dataUrl) {
    try {
      const lw = bannerLogo.w || 200;
      const lh = bannerLogo.h || 80;
      const scale = Math.min(60 / lw, 18 / lh);
      const drawW = lw * scale;
      const drawH = lh * scale;
      const fmt = /^data:image\/jpe?g/i.test(bannerLogo.dataUrl) ? 'JPEG' : 'PNG';
      doc.addImage(bannerLogo.dataUrl, fmt, pageW - 10 - drawW, (28 - drawH) / 2, drawW, drawH);
    } catch {
      /* ignore an unreadable logo */
    }
  }

  doc.setTextColor(...headText);
  doc.setFontSize(15);
  doc.text(companyName || 'Managed Systems', 10, 11);
  doc.setFontSize(10);
  doc.text(title, 10, 18);
  doc.setFontSize(8.5);
  const sub = [inputs.propertyName, inputs.propertyAddress].filter(Boolean).join('  •  ');
  if (sub) doc.text(sub, 10, 24);

  doc.setTextColor(120);
  doc.setFontSize(8);
  doc.text(`Generated: ${fmtDate(new Date())}`, pageW - 10, 33, { align: 'right' });

  const ensureSpace = (y, needed) => (y + needed > pageH - 12 ? (doc.addPage(), 18) : y);

  const sectionBar = (label, y) => {
    doc.setFillColor(...primary);
    doc.rect(10, y, pageW - 20, 8, 'F');
    doc.setTextColor(...headText);
    doc.setFontSize(12);
    doc.text(label, 13, y + 5.5);
    return y + 10;
  };

  let y = 37;
  let grandCost = 0;
  let grandPrice = 0;

  for (const section of sections) {
    const bom = section.bom;
    if (!bom.items.length && !(bom.serviceItems && bom.serviceItems.length)) continue;

    y = ensureSpace(y, 40);
    y = sectionBar(section.title, y);

    // KPI strip for this section
    const kpis = section.kpis || [];
    if (kpis.length) {
      const boxW = (pageW - 20) / kpis.length;
      let x = 10;
      doc.setDrawColor(220);
      kpis.forEach(([label, value]) => {
        doc.setFillColor(245, 247, 250);
        doc.rect(x, y, boxW - 2, 14, 'F');
        doc.setTextColor(120);
        doc.setFontSize(7);
        doc.text(String(label).toUpperCase(), x + 2, y + 5);
        doc.setTextColor(20);
        doc.setFontSize(10);
        doc.text(String(value), x + 2, y + 11);
        x += boxW;
      });
      y += 18;
    }

    // Hardware BOM (labor sections have none)
    if (bom.items.length) {
      autoTable(doc, {
        startY: y,
        head: [['Category', 'SKU', 'Description', 'Qty', 'Unit Price', 'Total']],
        body: categorySort(bom.items).map((i) => [
          i.category,
          i.sku,
          i.note ? `${i.description}\n${i.note}` : i.description,
          i.qty,
          money(i.unitPrice),
          money(i.totalPrice),
        ]),
        headStyles: { fillColor: primary, textColor: headText, fontSize: 8 },
        bodyStyles: { fontSize: 7.5 },
        columnStyles: { 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' } },
        margin: { left: 10, right: 10 },
      });
      y = doc.lastAutoTable.finalY + 4;
    }

    // Professional services / labor for this section
    if (bom.serviceItems && bom.serviceItems.length > 0) {
      const svcTitle = bom.items.length ? 'Professional Services' : section.title;
      autoTable(doc, {
        startY: y,
        head: [[`${svcTitle}`, 'Price']],
        body: bom.serviceItems.map((s) => [
          s.note ? `${s.description} — ${s.note}` : s.description,
          money(s.totalPrice),
        ]),
        headStyles: { fillColor: primary, textColor: headText, fontSize: 8 },
        bodyStyles: { fontSize: 7.5 },
        columnStyles: { 1: { halign: 'right' } },
        margin: { left: 10, right: 10 },
      });
      y = doc.lastAutoTable.finalY + 4;
    }

    // Section subtotal
    autoTable(doc, {
      startY: y,
      head: [[`${section.title} Summary`, 'Client Price']],
      body: [
        ...(bom.items.length ? [['Hardware & Software', money(bom.totalHardwarePrice)]] : []),
        ...(bom.totalServicesPrice > 0
          ? [[bom.items.length ? 'Professional Services' : 'Professional Labor', money(bom.totalServicesPrice)]]
          : []),
        ...(bom.shippingPrice > 0
          ? [[`Estimated Shipping (${bom.shippingPercent ?? 7}%)`, money(bom.shippingPrice)]]
          : []),
      ],
      foot: [[`${section.title} Subtotal`, money(bom.grandTotalPrice)]],
      headStyles: { fillColor: primary, textColor: headText, fontSize: 8 },
      footStyles: { fillColor: lightFill, textColor: 20, fontStyle: 'bold' },
      bodyStyles: { fontSize: 8 },
      columnStyles: { 1: { halign: 'right' } },
      margin: { left: 10, right: 10 },
      tableWidth: 120,
    });
    y = doc.lastAutoTable.finalY + 8;

    grandCost += bom.grandTotalCost;
    grandPrice += bom.grandTotalPrice;
  }

  // ---- Combined project total + gross profit ----
  y = ensureSpace(y, 30);
  autoTable(doc, {
    startY: y,
    head: [['Project Total', 'Client Price']],
    body: sections
      .filter((s) => s.bom.items.length || (s.bom.serviceItems && s.bom.serviceItems.length))
      .map((s) => [`${s.title} Subtotal`, money(s.bom.grandTotalPrice)]),
    foot: [['Total Project Estimate', money(grandPrice)]],
    headStyles: { fillColor: primary, textColor: headText, fontSize: 8 },
    footStyles: { fillColor: lightFill, textColor: 20, fontStyle: 'bold' },
    bodyStyles: { fontSize: 8 },
    columnStyles: { 1: { halign: 'right' } },
    margin: { left: 10, right: 10 },
    tableWidth: 120,
  });
  y = doc.lastAutoTable.finalY + 6;

  const margin = grandPrice > 0 ? ((grandPrice - grandCost) / grandPrice) * 100 : 0;
  y = ensureSpace(y, 20);
  doc.setFillColor(...accent);
  doc.rect(10, y, 120, 10, 'F');
  doc.setTextColor(...accentText);
  doc.setFontSize(9);
  doc.text(`Gross Profit: ${money(grandPrice - grandCost)}  (${margin.toFixed(1)}% margin)`, 13, y + 6.5);

  doc.setTextColor(130);
  doc.setFontSize(6.5);
  doc.setFont(undefined, 'italic');
  doc.text('* Budgetary estimate only. Final pricing may vary. Valid for 30 days.', 10, y + 16);
  doc.setFont(undefined, 'normal');

  // ---- Footer on every page ----
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(120);
    doc.text(
      `${brandFooter} — Confidential Budgetary Quote | Page ${i} of ${pageCount}`,
      pageW / 2,
      pageH - 5,
      { align: 'center' }
    );
  }

  const safeName = (inputs.propertyName || 'Project').replace(/[^a-zA-Z0-9]/g, '_');
  doc.save(`${safeName}_${fileSuffix}.pdf`);
}
