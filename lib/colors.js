// Color helpers for the branded PDF (jsPDF wants [r,g,b] arrays).

export function hexToRgb(hex, fallback = [37, 99, 235]) {
  if (typeof hex !== 'string') return fallback;
  let h = hex.trim().replace(/^#/, '');
  if (h.length === 3) {
    h = h
      .split('')
      .map((c) => c + c)
      .join('');
  }
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return fallback;
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

// Mix an [r,g,b] toward white (amount 0..1) — for subtle table/footer fills.
export function lightTint(rgb, amount = 0.88) {
  return rgb.map((c) => Math.round(c + (255 - c) * amount));
}

// WCAG relative luminance of an [r,g,b].
export function luminance(rgb) {
  const [r, g, b] = rgb.map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// Pick readable text ([r,g,b]) for a colored fill: dark slate on light fills,
// white on dark fills. Fixes white-on-light-brand-color being invisible.
export function readableText(rgb) {
  return luminance(rgb) > 0.5 ? [15, 23, 42] : [255, 255, 255];
}

export function readableTextHex(hex) {
  return readableText(hexToRgb(hex))[0] === 255 ? '#ffffff' : '#0f172a';
}

// Choose the logo variant that reads on a given background fill: the light
// (white-artwork) logo on dark fills, the standard dark-artwork logo on light
// fills. Falls back to whichever variant exists. `bg` is a hex string or an
// [r,g,b] array.
export function pickLogo(branding = {}, bg = '#ffffff') {
  const rgb = Array.isArray(bg) ? bg : hexToRgb(bg, [255, 255, 255]);
  const preferred = luminance(rgb) > 0.5 ? branding.logo : branding.logoLight;
  return preferred || branding.logo || branding.logoLight || null;
}
