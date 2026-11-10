const TREND_DIRECTIONS = {
  1: [0, 1],
  2: [1, 1],
  3: [1, 0],
  4: [1, -1],
  5: [0, -1],
};

// Generate native Zepp rectangle locations rather than rendering Unicode arrows.
// Some Active 2 font sizes replace diagonal arrow glyphs with square placeholders.
export function trendArrowPixels(trend, width, height) {
  const direction = TREND_DIRECTIONS[Number(trend)];
  if (!direction || width < 32 || height < 32) return [];

  const magnitude = Math.hypot(direction[0], direction[1]);
  const ux = direction[0] / magnitude;
  const uy = direction[1] / magnitude;
  const px = -uy;
  const py = ux;
  const cx = (width - 1) / 2;
  const cy = (height - 1) / 2;
  const length = Math.min(width, height) - 23;
  const tipX = cx + ux * length / 2;
  const tipY = cy + uy * length / 2;
  const tailX = cx - ux * length / 2;
  const tailY = cy - uy * length / 2;
  const headLength = 13;
  const headWidth = 9;

  const strokes = [
    [tailX, tailY, tipX, tipY],
    [tipX, tipY,
      tipX - ux * headLength + px * headWidth,
      tipY - uy * headLength + py * headWidth],
    [tipX, tipY,
      tipX - ux * headLength - px * headWidth,
      tipY - uy * headLength - py * headWidth],
  ];

  const pixels = [];
  const seen = new Set();
  for (const [x1, y1, x2, y2] of strokes) {
    const distance = Math.hypot(x2 - x1, y2 - y1);
    const steps = Math.max(1, Math.ceil(distance / 2.5));
    for (let i = 0; i <= steps; i++) {
      const x = Math.round(x1 + (x2 - x1) * i / steps);
      const y = Math.round(y1 + (y2 - y1) * i / steps);
      const key = `${x}:${y}`;
      if (seen.has(key)) continue;
      seen.add(key);
      pixels.push({ x, y });
    }
  }
  return pixels;
}
