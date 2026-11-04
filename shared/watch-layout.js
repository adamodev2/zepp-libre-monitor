const BASE_GLUCOSE_SIZE = 84;

export function createWatchLayout(width, height, isSquare) {
  const centerX = Math.round(width / 2);
  const glucoseSize = Math.round(BASE_GLUCOSE_SIZE * 1.1);
  const numberWidth = isSquare ? 195 : 203;
  const numberRight = centerX + (isSquare ? 49 : 50);
  const numberX = numberRight - numberWidth;
  const arrowX = numberRight + 5;
  const chartWidth = Math.min(width - 92, isSquare ? 260 : 266);
  const buttonWidth = isSquare ? 105 : 108;
  const buttonGap = 10;
  const buttonX = Math.round((width - 2 * buttonWidth - buttonGap) / 2);

  return {
    heading: { y: isSquare ? 16 : 28, h: 35, size: 27 },
    glucose: {
      x: numberX, y: isSquare ? 57 : 70,
      w: numberWidth, h: isSquare ? 106 : 110,
      size: glucoseSize,
    },
    arrow: {
      x: arrowX, y: isSquare ? 79 : 91,
      w: 65, h: isSquare ? 63 : 68, size: 52,
    },
    units: { y: isSquare ? 164 : 182, h: 32, size: 26 },
    chartCaption: { y: isSquare ? 201 : 218, h: 28, size: 21 },
    chart: {
      x: Math.round((width - chartWidth) / 2),
      y: isSquare ? 232 : 249,
      w: chartWidth,
      h: isSquare ? 112 : 109,
    },
    status: { y: isSquare ? 352 : 360, h: 30, size: 19 },
    controls: {
      x: buttonX,
      y: isSquare ? height - 60 : height - 75,
      w: buttonWidth,
      h: 44,
      gap: buttonGap,
      size: 19,
    },
  };
}
