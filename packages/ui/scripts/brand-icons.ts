import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { deflateSync } from "node:zlib";

/** Deterministic brand assets from one polygon, with no imaging dependency. */
const vertices = [
  [4, 5],
  [24, 5],
  [24, 10],
  [9, 10],
  [9, 13],
  [24, 13],
  [24, 23],
  [4, 23],
  [4, 18],
  [19, 18],
  [19, 15],
  [4, 15],
];
const destination = join(import.meta.dir, "../assets");
await mkdir(destination, { recursive: true });
await Bun.write(
  join(destination, "station.svg"),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28"><rect width="28" height="28" rx="5" fill="#141414"/><path fill="#ededed" d="M${vertices.map((point) => point.join(" ")).join("L")}Z"/></svg>`,
);
const sizes = [16, 24, 32, 48, 64, 128, 256];
const rgba = (size: number) => {
  const bytes = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      let ink = 0,
        alpha = 0;
      for (let sy = 0; sy < 4; sy++)
        for (let sx = 0; sx < 4; sx++) {
          const px = ((x + (sx + 0.5) / 4) * 28) / size,
            py = ((y + (sy + 0.5) / 4) * 28) / size;
          if (
            Math.hypot(
              Math.max(5 - px, 0, px - 23),
              Math.max(5 - py, 0, py - 23),
            ) > 5
          )
            continue;
          alpha++;
          let inside = false;
          for (
            let i = 0, j = vertices.length - 1;
            i < vertices.length;
            j = i++
          ) {
            const [ax, ay] = vertices[i],
              [bx, by] = vertices[j];
            if (
              ay > py !== by > py &&
              px < ((bx - ax) * (py - ay)) / (by - ay) + ax
            )
              inside = !inside;
          }
          if (inside) ink++;
        }
      const index = (y * size + x) * 4,
        value = Math.round(20 + (217 * ink) / Math.max(1, alpha));
      bytes.set([value, value, value, Math.round((255 * alpha) / 16)], index);
    }
  return bytes;
};
const dibs = sizes.map((size) => {
  const maskStride = Math.ceil(size / 32) * 4,
    data = rgba(size),
    dib = new Uint8Array(40 + size * size * 4 + maskStride * size),
    view = new DataView(dib.buffer);
  view.setUint32(0, 40, true);
  view.setInt32(4, size, true);
  view.setInt32(8, size * 2, true);
  view.setUint16(12, 1, true);
  view.setUint16(14, 32, true);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const source = (y * size + x) * 4,
        target = 40 + ((size - 1 - y) * size + x) * 4;
      dib.set(
        [data[source + 2], data[source + 1], data[source], data[source + 3]],
        target,
      );
      if (!data[source + 3])
        dib[40 + size * size * 4 + (size - 1 - y) * maskStride + (x >> 3)] |=
          128 >> (x % 8);
    }
  return dib;
});
const icon = new Uint8Array(
    6 + sizes.length * 16 + dibs.reduce((total, dib) => total + dib.length, 0),
  ),
  view = new DataView(icon.buffer);
view.setUint16(2, 1, true);
view.setUint16(4, sizes.length, true);
let offset = 6 + sizes.length * 16;
dibs.forEach((dib, index) => {
  const start = 6 + index * 16;
  icon[start] = icon[start + 1] = sizes[index] % 256;
  view.setUint16(start + 4, 1, true);
  view.setUint16(start + 6, 32, true);
  view.setUint32(start + 8, dib.length, true);
  view.setUint32(start + 12, offset, true);
  icon.set(dib, offset);
  offset += dib.length;
});
await Bun.write(join(destination, "station.ico"), icon);
// PNG is useful for tray implementations and Linux; CRC32 and zlib are standard PNG chunks.
const chunk = (type: string, bytes: Uint8Array) => {
  const encoded = new Uint8Array(12 + bytes.length),
    view = new DataView(encoded.buffer);
  view.setUint32(0, bytes.length);
  encoded.set(new TextEncoder().encode(type), 4);
  encoded.set(bytes, 8);
  let crc = 0xffffffff;
  for (const byte of encoded.subarray(4, 8 + bytes.length)) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  view.setUint32(8 + bytes.length, (crc ^ 0xffffffff) >>> 0);
  return encoded;
};
const size = 256,
  pixels = rgba(size),
  scan = new Uint8Array((size * 4 + 1) * size),
  header = new Uint8Array(13),
  hv = new DataView(header.buffer);
hv.setUint32(0, size);
hv.setUint32(4, size);
header[8] = 8;
header[9] = 6;
for (let y = 0; y < size; y++)
  scan.set(
    pixels.subarray(y * size * 4, (y + 1) * size * 4),
    y * (size * 4 + 1) + 1,
  );
await Bun.write(
  join(destination, "station.png"),
  Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(scan)),
    chunk("IEND", new Uint8Array()),
  ]),
);
