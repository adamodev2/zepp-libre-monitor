import test from "node:test";
import assert from "node:assert/strict";
import { sha256 } from "../app-side/sha256.js";

const vectors = [
  ["", "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"],
  ["abc", "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"],
  ["The quick brown fox jumps over the lazy dog", "d7a8fbb307d7809469ca9abcb0082e4f8d5651e46d3cdb762d02d0bf37c9e592"],
  ["😀", "f0443a342c5ef54783a111b51ba56c938e474c32324d90c3a60c9c8e3a37e2d9"],
];
for (const [input, expected] of vectors) {
  test("SHA-256 known-answer test for " + JSON.stringify(input), () => {
    assert.equal(sha256(input), expected);
  });
}

test("SHA-256 handles multiple 64-byte blocks", async () => {
  const { createHash } = await import("node:crypto");
  const input = "A".repeat(1000);
  assert.equal(sha256(input), createHash("sha256").update(input).digest("hex"));
});
