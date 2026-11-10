import test from "node:test";
import assert from "node:assert/strict";
import { trendArrowPixels } from "../shared/trend-icon.js";

const WIDTH = 65;
const HEIGHT = 68;

test("all five Libre trend directions have a visible native arrow", () => {
  for (let trend = 1; trend <= 5; trend++) {
    const pixels = trendArrowPixels(trend, WIDTH, HEIGHT);
    assert.ok(pixels.length >= 15, `trend ${trend} should be visible`);
    assert.ok(pixels.length <= 65, `trend ${trend} should be resource-bounded`);
    assert.equal(
      new Set(pixels.map((point) => `${point.x}:${point.y}`)).size,
      pixels.length,
      "rendered pixels must be unique",
    );
    for (const pixel of pixels) {
      assert.ok(pixel.x >= 2 && pixel.x < WIDTH - 2, "keep stroke inside arrow frame");
      assert.ok(pixel.y >= 2 && pixel.y < HEIGHT - 2, "keep stroke inside arrow frame");
    }
  }
});

test("native arrow directions match Abbott trend codes", () => {
  const average = (xs) => xs.reduce((sum, x) => sum + x, 0) / xs.length;
  const down = trendArrowPixels(1, WIDTH, HEIGHT);
  const downRight = trendArrowPixels(2, WIDTH, HEIGHT);
  const right = trendArrowPixels(3, WIDTH, HEIGHT);
  const upRight = trendArrowPixels(4, WIDTH, HEIGHT);
  const up = trendArrowPixels(5, WIDTH, HEIGHT);

  assert.ok(down[0].y < down[down.length - 1].y || average(down.map(p => p.y)) > 20);
  assert.ok(down[0].y < down[1].y);
  assert.ok(downRight[0].x < downRight[1].x && downRight[0].y < downRight[1].y);
  assert.ok(right[0].x < right[1].x && right[0].y === right[1].y);
  assert.ok(upRight[0].x < upRight[1].x && upRight[0].y > upRight[1].y);
  assert.ok(up[0].y > up[1].y && up[0].x === up[1].x);
});

test("unknown and invalid trends produce no arrow glyphs", () => {
  for (const trend of [0, -1, 6, null, undefined, NaN, "bad"]) {
    assert.deepEqual(trendArrowPixels(trend, WIDTH, HEIGHT), []);
  }
  assert.deepEqual(trendArrowPixels(2, 20, HEIGHT), []);
  assert.deepEqual(trendArrowPixels(2, WIDTH, 20), []);
});

test("same trend produces stable pixels across refreshes", () => {
  assert.deepEqual(
    trendArrowPixels(2, WIDTH, HEIGHT),
    trendArrowPixels(2, WIDTH, HEIGHT),
  );
});
