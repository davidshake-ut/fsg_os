// Shared formatting + margin color helpers used across tables, cards and PDF.

export function marginColor(margin) {
  if (margin >= 30) return 'text-green-600 bg-green-50';
  if (margin >= 15) return 'text-yellow-600 bg-yellow-50';
  return 'text-red-600 bg-red-50';
}

// Background-only variant for cards/banners.
export function marginBg(margin) {
  if (margin >= 30) return 'bg-green-50 border-green-200';
  if (margin >= 15) return 'bg-yellow-50 border-yellow-200';
  return 'bg-red-50 border-red-200';
}

const currencyFmt = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function currency(n) {
  return currencyFmt.format(Number.isFinite(n) ? n : 0);
}

export function percent(n, digits = 1) {
  return `${(Number.isFinite(n) ? n : 0).toFixed(digits)}%`;
}

// The app-wide date format: MM-DD-YYYY. Accepts a Date, an ISO timestamp,
// or a date-only string (parsed as local time so it doesn't shift a day).
export function fmtDate(value) {
  if (!value) return '—';
  const d = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(value + 'T00:00:00')
    : new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${mm}-${dd}-${d.getFullYear()}`;
}

export function fmtDateTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return `${fmtDate(d)} ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
}
