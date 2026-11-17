import test from "node:test";
import assert from "node:assert/strict";
import { createWatchLayout } from "../shared/watch-layout.js";

function validateSpacing(layout) {
  assert.ok(layout.heading.y + layout.heading.h <= layout.glucose.y);
  assert.ok(layout.glucose.y + layout.glucose.h <= layout.units.y);
  assert.ok(layout.units.y + layout.units.h <= layout.chartCaption.y);
  assert.ok(layout.chartCaption.y + layout.chartCaption.h <= layout.chart.y);
  assert.ok(layout.chart.y + layout.chart.h <= layout.status.y);
  assert.ok(layout.status.y + layout.status.h <= layout.controls.y);
}

test("round Active 2 shows 10% larger glucose with adjacent aligned trend", () => {
  const layout = createWatchLayout(466, 466, false);
  assert.equal(layout.glucose.size, Math.round(84 * 1.1));
  assert.equal(layout.arrow.x, layout.glucose.x + layout.glucose.w + 15);
  assert.ok(Math.abs(
    (layout.glucose.y + layout.glucose.h / 2) -
    (layout.arrow.y + layout.arrow.h / 2),
  ) <= 1);
  assert.ok(layout.arrow.x + layout.arrow.w <= 466 - 90);
  validateSpacing(layout);
});

test("all formerly small round-screen labels are large enough", () => {
  const layout = createWatchLayout(466, 466, false);
  for (const component of [layout.heading, layout.units, layout.chartCaption, layout.status]) {
    assert.ok(component.size >= 19);
  }
  assert.ok(layout.controls.size >= 19);
  assert.ok(layout.arrow.size >= 45);
  assert.ok(layout.chart.h >= 100);
});

test("round-screen buttons stay within the circular display boundary", () => {
  const width = 466, height = 466;
  const layout = createWatchLayout(width, height, false);
  const buttons = [
    { x: layout.controls.x, y: layout.controls.y },
    { x: layout.controls.x + layout.controls.w + layout.controls.gap, y: layout.controls.y },
  ];
  const cx = width / 2, cy = height / 2;
  const radius = width / 2;
  for (const button of buttons) {
    for (const x of [button.x, button.x + layout.controls.w]) {
      for (const y of [button.y, button.y + layout.controls.h]) {
        assert.ok((x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2);
      }
    }
  }
});

test("square Active 2 layout keeps the chart and controls separated", () => {
  const layout = createWatchLayout(390, 450, true);
  assert.equal(layout.glucose.size, Math.round(84 * 1.1));
  validateSpacing(layout);
  assert.equal(layout.arrow.x - (layout.glucose.x + layout.glucose.w), 15);
  assert.ok(layout.arrow.x + layout.arrow.w <= 390 - 55);
  assert.ok(layout.controls.x >= 0);
  assert.ok(layout.controls.x + 2 * layout.controls.w + layout.controls.gap <= 390);
  assert.ok(layout.controls.y + layout.controls.h <= 450);
});
