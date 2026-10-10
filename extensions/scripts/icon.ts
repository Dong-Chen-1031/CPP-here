export const backgroundColor = '#212121';
export const foregroundColor = '#ffffff';

// The C++ Here glyph, drawn in a 895.16 x 533.12 box
const glyphWidth = 895.16;
const glyphHeight = 533.12;
const glyphPaths = [
  'M176.05,266.56l172.53-172.53c4.69-4.69,4.69-12.28,0-16.97L275.04,3.51c-4.69-4.69-12.28-4.69-16.97,0L3.51,258.07c-4.69,4.69-4.69,12.28,0,16.97l254.56,254.56c4.69,4.69,12.28,4.69,16.97,0l73.54-73.54c4.69-4.69,4.69-12.28,0-16.97l-172.53-172.53Z',
  'M891.64,258.07l-73.54-73.54c-4.69-4.69-12.28-4.69-16.97,0l-70.71,70.71-90.51-90.51,70.71-70.71c4.69-4.69,4.69-12.28,0-16.97L637.08,3.51c-4.69-4.69-12.28-4.69-16.97,0l-254.56,254.56c-4.69,4.69-4.69,12.28,0,16.97l73.54,73.54c4.69,4.69,12.28,4.69,16.97,0l93.34-93.34,90.51,90.51-93.34,93.34c-4.69,4.69-4.69,12.28,0,16.97l73.54,73.54c4.69,4.69,12.28,4.69,16.97,0l101.82-101.82,73.54-73.54,79.2-79.2c4.69-4.69,4.69-12.28,0-16.97Z',
];

/**
 * The bare C++ Here glyph as an SVG element, `width` wide and vertically centered in a box `boxHeight` tall.
 */
export function glyphSvg(x: number, y: number, width: number, boxHeight: number, color: string): string {
  const height = (width * glyphHeight) / glyphWidth;

  return `
<svg viewBox="0 0 ${glyphWidth} ${glyphHeight}" x="${x}" y="${y + (boxHeight - height) / 2}" width="${width}" height="${height}">
  ${glyphPaths.map(d => `<path d="${d}" fill="${color}" />`).join('\n  ')}
</svg>
  `.trim();
}

/**
 * The C++ Here logo (the white glyph on a dark square), as an SVG element.
 */
export function iconSvg(x: number, y: number, size: number): string {
  return `
<svg viewBox="0 0 1024 1024" x="${x}" y="${y}" width="${size}" height="${size}">
  <rect width="1024" height="1024" fill="${backgroundColor}" />
  ${glyphSvg(64.42, 0, glyphWidth, 1024, foregroundColor)}
</svg>
  `.trim();
}
