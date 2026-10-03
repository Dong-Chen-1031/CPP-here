export const backgroundColor = '#0a0a0a';
export const foregroundColor = '#ffffff';

/**
 * The C++ Here logo (the Lucide "code" glyph the website uses) on a rounded square, as an SVG element.
 * `inverted` draws a light tile for use on dark backgrounds.
 */
export function iconSvg(x: number, y: number, size: number, inverted = false): string {
  const tileColor = inverted ? foregroundColor : backgroundColor;
  const glyphColor = inverted ? backgroundColor : foregroundColor;

  // Thin strokes blur into the background at toolbar sizes
  const strokeWidth = size <= 24 ? 3.25 : 2.75;

  return `
<svg viewBox="0 0 24 24" x="${x}" y="${y}" width="${size}" height="${size}">
  <rect width="24" height="24" rx="5.5" fill="${tileColor}" />
  <g
    transform="translate(12 12) scale(0.8) translate(-12 -12)"
    fill="none"
    stroke="${glyphColor}"
    stroke-width="${strokeWidth}"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <path d="m16 18 6-6-6-6" />
    <path d="m8 6-6 6 6 6" />
  </g>
</svg>
  `.trim();
}
