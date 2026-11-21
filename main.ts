// news-image-20261120 — round 5 entry.
//
// The entry image (a newspaper front page summing up Friday 20 November
// 2026: the Trump–Xi–Putin summit in Shenzhen, Russia's strikes on Kyiv's
// bridges and the missiles that fell in Poland, the ICJ's Rohingya genocide
// ruling against Myanmar, the Houthi missile strike on Riyadh's PIF Tower,
// Cyclone Akvan's landfall in India, and Anthropic's record IPO) ships in
// this repository as entry.png. This program copies it, byte for byte, to
// <output>/entry.png, after proving the file is a whole, well-formed PNG.
//
// It uses only the Node standard library, reads no network, and is fully
// deterministic: two runs write identical bytes.

import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const MAX_BYTES = 1_048_576; // 1 MiB, the competition's size cap.
const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

// CRC-32 (IEEE 802.3) table, built once at startup. PNG stores a CRC-32
// over each chunk's type + data, so validating a chunk means recomputing
// it and comparing with the 4 bytes stored after the data.
const CRC_TABLE: Uint32Array = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buf) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

interface PngInfo {
  width: number;
  height: number;
  chunkCount: number;
}

// Walk the PNG chunk stream, checking every chunk's length, type and
// CRC-32, and require the stream to start with IHDR and end with IEND
// and nothing after it. Returns the image dimensions from IHDR.
function validatePng(bytes: Buffer): PngInfo {
  if (bytes.length < PNG_SIGNATURE.length) {
    throw new Error(`file too short to be a PNG (${bytes.length} bytes)`);
  }
  if (!bytes.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error("not a PNG: bad 8-byte signature");
  }

  let offset = 8;
  let chunkCount = 0;
  let seenIhdr = false;
  let seenIend = false;
  let width = 0;
  let height = 0;

  while (offset + 8 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString("latin1", offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const crcEnd = dataEnd + 4;
    if (crcEnd > bytes.length) {
      throw new Error(`chunk ${type} at offset ${offset} is truncated`);
    }

    const storedCrc = bytes.readUInt32BE(dataEnd);
    const computedCrc = crc32(
      Buffer.concat([bytes.subarray(offset + 4, offset + 8), bytes.subarray(dataStart, dataEnd)]),
    );
    if (storedCrc !== computedCrc) {
      throw new Error(
        `chunk ${type} at offset ${offset} has a bad CRC (stored ${storedCrc.toString(16)}, computed ${computedCrc.toString(16)})`,
      );
    }

    if (chunkCount === 0 && type !== "IHDR") {
      throw new Error(`first chunk is ${type}, expected IHDR`);
    }
    if (type === "IHDR") {
      if (seenIhdr) {
        throw new Error("duplicate IHDR chunk");
      }
      seenIhdr = true;
      if (length !== 13) {
        throw new Error(`IHDR length is ${length}, expected 13`);
      }
      width = bytes.readUInt32BE(dataStart);
      height = bytes.readUInt32BE(dataStart + 4);
    }
    if (type === "IEND") {
      if (length !== 0) {
        throw new Error(`IEND length is ${length}, expected 0`);
      }
      seenIend = true;
      offset = crcEnd;
      break;
    }

    chunkCount += 1;
    offset = crcEnd;
  }

  if (!seenIhdr) {
    throw new Error("no IHDR chunk found");
  }
  if (!seenIend) {
    throw new Error("no IEND chunk found: PNG is truncated");
  }
  if (offset !== bytes.length) {
    throw new Error(`${bytes.length - offset} trailing bytes after IEND`);
  }

  return { width, height, chunkCount };
}

function main(): void {
  const here = dirname(fileURLToPath(import.meta.url));
  const sourcePath = join(here, "entry.png");

  if (!existsSync(sourcePath)) {
    throw new Error(`entry image not found next to this program: ${sourcePath}`);
  }

  const bytes = readFileSync(sourcePath);
  if (bytes.length > MAX_BYTES) {
    throw new Error(
      `entry.png is ${bytes.length} bytes, over the 1 MiB cap (${MAX_BYTES})`,
    );
  }

  const info = validatePng(bytes);
  if (info.width > 1024 || info.height > 1024) {
    throw new Error(
      `entry.png is ${info.width}x${info.height}, over the 1024x1024 cap`,
    );
  }
  if (info.width === 0 || info.height === 0) {
    throw new Error("entry.png has a zero dimension");
  }
  const sha256 = createHash("sha256").update(bytes).digest("hex");

  const outputDir = resolve(process.env.MAKEFUN_OUTPUT_DIR ?? "/output");
  mkdirSync(outputDir, { recursive: true });
  const outputPath = join(outputDir, "entry.png");
  writeFileSync(outputPath, bytes);

  console.log(`wrote ${outputPath}`);
  console.log(`bytes: ${bytes.length}`);
  console.log(`sha256: ${sha256}`);
  console.log(`dimensions: ${info.width}x${info.height}`);
  console.log(`png chunks validated: ${info.chunkCount}`);
}

main();
