// Generate a minimal valid 64x64 PNG without external image dependencies.
const fs = require("node:fs");
const zlib = require("node:zlib");

const width = 64;
const height = 64;
const pixels = Buffer.alloc(height * (1 + width * 4));
for (let y = 0; y < height; y += 1) {
  for (let x = 0; x < width; x += 1) {
    const offset = y * (1 + width * 4) + 1 + x * 4;
    const dx = x - 31.5;
    const dy = y - 31.5;
    const inside = dx * dx + dy * dy < 30 * 30;
    pixels[offset] = inside ? 20 : 0;
    pixels[offset + 1] = inside ? 49 : 0;
    pixels[offset + 2] = inside ? 58 : 0;
    pixels[offset + 3] = inside ? 255 : 0;
    if (inside && Math.abs(dy + Math.sin(x / 6) * 8) < 2) {
      pixels[offset] = 60;
      pixels[offset + 1] = 230;
      pixels[offset + 2] = 139;
    }
  }
}
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let i = 0; i < 8; i += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function chunk(type, data) {
  const tag = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const value = Buffer.concat([tag, data]);
  let crc = 0xffffffff;
  for (const byte of value) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([length, value, checksum]);
}
const header = Buffer.alloc(13);
header.writeUInt32BE(width, 0);
header.writeUInt32BE(height, 4);
header[8] = 8;
header[9] = 6;
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk("IHDR", header),
  chunk("IDAT", zlib.deflateSync(pixels)),
  chunk("IEND", Buffer.alloc(0)),
]);
fs.mkdirSync("assets", { recursive: true });
fs.writeFileSync("assets/icon.png", png);
console.log("Generated assets/icon.png");
