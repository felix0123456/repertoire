/**
 * Pure TypeScript ISO/IEC 18004 QR Code Generator (Model 2, Error Correction Level M)
 * Supports UTF-8 strings up to 362 bytes (Versions 1–14) with full 8-mask penalty evaluation.
 * Zero external runtime dependencies.
 */

interface VersionSpec {
  version: number;
  totalCodewords: number;
  ecCodewordsPerBlock: number;
  group1Blocks: number;
  group1DataCodewords: number;
  group2Blocks: number;
  group2DataCodewords: number;
  alignmentCoords: number[];
}

// ISO/IEC 18004 Table 9 (EC Level M) & Annex E Alignment Pattern Positions
const VERSION_SPECS_M: VersionSpec[] = [
  {
    version: 1,
    totalCodewords: 26,
    ecCodewordsPerBlock: 10,
    group1Blocks: 1,
    group1DataCodewords: 16,
    group2Blocks: 0,
    group2DataCodewords: 0,
    alignmentCoords: [],
  },
  {
    version: 2,
    totalCodewords: 44,
    ecCodewordsPerBlock: 16,
    group1Blocks: 1,
    group1DataCodewords: 28,
    group2Blocks: 0,
    group2DataCodewords: 0,
    alignmentCoords: [6, 18],
  },
  {
    version: 3,
    totalCodewords: 70,
    ecCodewordsPerBlock: 26,
    group1Blocks: 1,
    group1DataCodewords: 44,
    group2Blocks: 0,
    group2DataCodewords: 0,
    alignmentCoords: [6, 22],
  },
  {
    version: 4,
    totalCodewords: 100,
    ecCodewordsPerBlock: 18,
    group1Blocks: 2,
    group1DataCodewords: 32,
    group2Blocks: 0,
    group2DataCodewords: 0,
    alignmentCoords: [6, 26],
  },
  {
    version: 5,
    totalCodewords: 134,
    ecCodewordsPerBlock: 24,
    group1Blocks: 2,
    group1DataCodewords: 43,
    group2Blocks: 0,
    group2DataCodewords: 0,
    alignmentCoords: [6, 30],
  },
  {
    version: 6,
    totalCodewords: 172,
    ecCodewordsPerBlock: 16,
    group1Blocks: 4,
    group1DataCodewords: 27,
    group2Blocks: 0,
    group2DataCodewords: 0,
    alignmentCoords: [6, 34],
  },
  {
    version: 7,
    totalCodewords: 196,
    ecCodewordsPerBlock: 18,
    group1Blocks: 4,
    group1DataCodewords: 31,
    group2Blocks: 0,
    group2DataCodewords: 0,
    alignmentCoords: [6, 22, 38],
  },
  {
    version: 8,
    totalCodewords: 242,
    ecCodewordsPerBlock: 22,
    group1Blocks: 2,
    group1DataCodewords: 38,
    group2Blocks: 2,
    group2DataCodewords: 39,
    alignmentCoords: [6, 24, 42],
  },
  {
    version: 9,
    totalCodewords: 292,
    ecCodewordsPerBlock: 22,
    group1Blocks: 3,
    group1DataCodewords: 36,
    group2Blocks: 2,
    group2DataCodewords: 37,
    alignmentCoords: [6, 26, 46],
  },
  {
    version: 10,
    totalCodewords: 346,
    ecCodewordsPerBlock: 26,
    group1Blocks: 4,
    group1DataCodewords: 43,
    group2Blocks: 1,
    group2DataCodewords: 44,
    alignmentCoords: [6, 28, 50],
  },
  {
    version: 11,
    totalCodewords: 404,
    ecCodewordsPerBlock: 30,
    group1Blocks: 1,
    group1DataCodewords: 50,
    group2Blocks: 4,
    group2DataCodewords: 51,
    alignmentCoords: [6, 30, 54],
  },
  {
    version: 12,
    totalCodewords: 466,
    ecCodewordsPerBlock: 22,
    group1Blocks: 6,
    group1DataCodewords: 36,
    group2Blocks: 2,
    group2DataCodewords: 37,
    alignmentCoords: [6, 32, 58],
  },
  {
    version: 13,
    totalCodewords: 532,
    ecCodewordsPerBlock: 22,
    group1Blocks: 8,
    group1DataCodewords: 37,
    group2Blocks: 1,
    group2DataCodewords: 38,
    alignmentCoords: [6, 34, 62],
  },
  {
    version: 14,
    totalCodewords: 581,
    ecCodewordsPerBlock: 24,
    group1Blocks: 4,
    group1DataCodewords: 40,
    group2Blocks: 5,
    group2DataCodewords: 41,
    alignmentCoords: [6, 26, 46, 66],
  },
];

// GF(256) Log & Exp tables with primitive polynomial 0x11D (285)
const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);

(function initGaloisField() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) {
      x ^= 0x11d;
    }
  }
  for (let i = 255; i < 512; i++) {
    GF_EXP[i] = GF_EXP[i - 255];
  }
})();

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

function buildReedSolomonGenerator(degree: number): Uint8Array {
  let poly = new Uint8Array([1]);
  for (let i = 0; i < degree; i++) {
    const next = new Uint8Array(poly.length + 1);
    const root = GF_EXP[i];
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];
      next[j + 1] ^= gfMul(poly[j], root);
    }
    poly = next;
  }
  return poly;
}

function computeReedSolomonEc(
  data: Uint8Array,
  ecDegree: number
): Uint8Array {
  const gen = buildReedSolomonGenerator(ecDegree);
  const rem = new Uint8Array(ecDegree);
  for (let i = 0; i < data.length; i++) {
    const factor = data[i] ^ rem[0];
    rem.copyWithin(0, 1);
    rem[ecDegree - 1] = 0;
    if (factor !== 0) {
      for (let j = 0; j < ecDegree; j++) {
        rem[j] ^= gfMul(gen[j + 1], factor);
      }
    }
  }
  return rem;
}

function selectVersionSpec(byteLength: number): VersionSpec {
  for (const spec of VERSION_SPECS_M) {
    const totalDataCodewords =
      spec.group1Blocks * spec.group1DataCodewords +
      spec.group2Blocks * spec.group2DataCodewords;
    // Mode indicator = 4 bits (0100), char count = 8 bits (V1-9) or 16 bits (V10+)
    const headerBits = 4 + (spec.version <= 9 ? 8 : 16);
    const maxBytes = Math.floor((totalDataCodewords * 8 - headerBits) / 8);
    if (byteLength <= maxBytes) {
      return spec;
    }
  }
  throw new Error(
    `QR payload too long (${byteLength} bytes). Maximum supported is 362 bytes.`
  );
}

function encodeDataCodewords(
  utf8Bytes: Uint8Array,
  spec: VersionSpec
): Uint8Array {
  const totalDataCodewords =
    spec.group1Blocks * spec.group1DataCodewords +
    spec.group2Blocks * spec.group2DataCodewords;
  const totalDataBits = totalDataCodewords * 8;

  const bits: number[] = [];
  const pushBits = (val: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) {
      bits.push((val >>> i) & 1);
    }
  };

  // Byte mode indicator: 0100
  pushBits(0b0100, 4);
  // Character count indicator: 8 bits for V1-9, 16 bits for V10-40
  pushBits(utf8Bytes.length, spec.version <= 9 ? 8 : 16);

  for (let i = 0; i < utf8Bytes.length; i++) {
    pushBits(utf8Bytes[i], 8);
  }

  // Terminator: up to 4 zero bits
  const terminatorLen = Math.min(4, totalDataBits - bits.length);
  pushBits(0, terminatorLen);

  // Pad to byte boundary
  while (bits.length % 8 !== 0) {
    bits.push(0);
  }

  const codewords = new Uint8Array(totalDataCodewords);
  const filledBytes = bits.length / 8;
  for (let i = 0; i < filledBytes; i++) {
    let b = 0;
    for (let j = 0; j < 8; j++) {
      b = (b << 1) | bits[i * 8 + j];
    }
    codewords[i] = b;
  }

  // Pad bytes alternating 0xEC (236) and 0x11 (17)
  const padBytes = [0xec, 0x11];
  for (let i = filledBytes; i < totalDataCodewords; i++) {
    codewords[i] = padBytes[(i - filledBytes) % 2];
  }

  return codewords;
}

function interleaveCodewords(
  dataCodewords: Uint8Array,
  spec: VersionSpec
): Uint8Array {
  const dataBlocks: Uint8Array[] = [];
  const ecBlocks: Uint8Array[] = [];

  let offset = 0;
  for (let i = 0; i < spec.group1Blocks; i++) {
    const block = dataCodewords.subarray(
      offset,
      offset + spec.group1DataCodewords
    );
    offset += spec.group1DataCodewords;
    dataBlocks.push(block);
    ecBlocks.push(computeReedSolomonEc(block, spec.ecCodewordsPerBlock));
  }
  for (let i = 0; i < spec.group2Blocks; i++) {
    const block = dataCodewords.subarray(
      offset,
      offset + spec.group2DataCodewords
    );
    offset += spec.group2DataCodewords;
    dataBlocks.push(block);
    ecBlocks.push(computeReedSolomonEc(block, spec.ecCodewordsPerBlock));
  }

  const result = new Uint8Array(spec.totalCodewords);
  let outIdx = 0;
  const maxDataLen = Math.max(
    spec.group1DataCodewords,
    spec.group2DataCodewords
  );

  for (let col = 0; col < maxDataLen; col++) {
    for (let b = 0; b < dataBlocks.length; b++) {
      if (col < dataBlocks[b].length) {
        result[outIdx++] = dataBlocks[b][col];
      }
    }
  }

  for (let col = 0; col < spec.ecCodewordsPerBlock; col++) {
    for (let b = 0; b < ecBlocks.length; b++) {
      result[outIdx++] = ecBlocks[b][col];
    }
  }

  return result;
}

function drawFinderPattern(
  modules: boolean[][],
  isFunction: boolean[][],
  centerRow: number,
  centerCol: number
) {
  const size = modules.length;
  for (let dy = -4; dy <= 4; dy++) {
    for (let dx = -4; dx <= 4; dx++) {
      const r = centerRow + dy;
      const c = centerCol + dx;
      if (r >= 0 && r < size && c >= 0 && c < size) {
        const dist = Math.max(Math.abs(dx), Math.abs(dy));
        modules[r][c] = dist !== 2 && dist !== 4;
        isFunction[r][c] = true;
      }
    }
  }
}

function drawAlignmentPattern(
  modules: boolean[][],
  isFunction: boolean[][],
  centerRow: number,
  centerCol: number
) {
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const dist = Math.max(Math.abs(dx), Math.abs(dy));
      modules[centerRow + dy][centerCol + dx] = dist !== 1;
      isFunction[centerRow + dy][centerCol + dx] = true;
    }
  }
}

function drawFormatBits(
  modules: boolean[][],
  isFunction: boolean[][],
  maskPattern: number
) {
  const size = modules.length;
  // Error Correction Level M in ISO 18004 format info is 00
  const data = (0b00 << 3) | maskPattern;
  let rem = data;
  for (let i = 0; i < 10; i++) {
    rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  }
  const bits = ((data << 10) | rem) ^ 0x5412;

  const getBit = (idx: number) => ((bits >>> idx) & 1) !== 0;

  // Top-left format info (ISO/IEC 18004 Figure 25: bit 0 at [0][8] .. bit 14 at [8][0])
  for (let i = 0; i <= 5; i++) {
    modules[i][8] = getBit(i);
    isFunction[i][8] = true;
  }
  modules[7][8] = getBit(6);
  isFunction[7][8] = true;
  modules[8][8] = getBit(7);
  isFunction[8][8] = true;
  modules[8][7] = getBit(8);
  isFunction[8][7] = true;
  for (let i = 9; i < 15; i++) {
    modules[8][14 - i] = getBit(i);
    isFunction[8][14 - i] = true;
  }

  // Top-right and bottom-left format info
  for (let i = 0; i < 8; i++) {
    modules[8][size - 1 - i] = getBit(i);
    isFunction[8][size - 1 - i] = true;
  }
  for (let i = 8; i < 15; i++) {
    modules[size - 15 + i][8] = getBit(i);
    isFunction[size - 15 + i][8] = true;
  }

  // Always-dark module
  modules[size - 8][8] = true;
  isFunction[size - 8][8] = true;
}

function drawVersionBits(
  modules: boolean[][],
  isFunction: boolean[][],
  version: number
) {
  if (version < 7) return;
  const size = modules.length;
  let rem = version;
  for (let i = 0; i < 12; i++) {
    rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
  }
  const bits = (version << 12) | rem;

  for (let i = 0; i < 18; i++) {
    const bit = ((bits >>> i) & 1) !== 0;
    const a = size - 11 + (i % 3);
    const b = Math.floor(i / 3);
    modules[a][b] = bit;
    isFunction[a][b] = true;
    modules[b][a] = bit;
    isFunction[b][a] = true;
  }
}

function setupFunctionPatterns(
  version: number,
  alignmentCoords: number[]
): { modules: boolean[][]; isFunction: boolean[][] } {
  const size = version * 4 + 17;
  const modules: boolean[][] = Array.from({ length: size }, () =>
    Array(size).fill(false)
  );
  const isFunction: boolean[][] = Array.from({ length: size }, () =>
    Array(size).fill(false)
  );

  // Timing patterns
  for (let i = 0; i < size; i++) {
    modules[6][i] = i % 2 === 0;
    isFunction[6][i] = true;
    modules[i][6] = i % 2 === 0;
    isFunction[i][6] = true;
  }

  // 3 Finder patterns
  drawFinderPattern(modules, isFunction, 3, 3);
  drawFinderPattern(modules, isFunction, 3, size - 4);
  drawFinderPattern(modules, isFunction, size - 4, 3);

  // Alignment patterns (skipping corners overlapping finder patterns)
  const numAlign = alignmentCoords.length;
  for (let i = 0; i < numAlign; i++) {
    for (let j = 0; j < numAlign; j++) {
      if (
        (i === 0 && j === 0) ||
        (i === 0 && j === numAlign - 1) ||
        (i === numAlign - 1 && j === 0)
      ) {
        continue;
      }
      drawAlignmentPattern(
        modules,
        isFunction,
        alignmentCoords[i],
        alignmentCoords[j]
      );
    }
  }

  // Reserve format info & version info areas
  drawFormatBits(modules, isFunction, 0);
  drawVersionBits(modules, isFunction, version);

  return { modules, isFunction };
}

function placeDataCodewords(
  modules: boolean[][],
  isFunction: boolean[][],
  codewords: Uint8Array
) {
  const size = modules.length;
  let bitIdx = 0;
  const totalBits = codewords.length * 8;

  // Zig-zag in 2-column vertical strips from right to left (skipping column 6)
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    const upward = ((right + 1) & 2) === 0;
    for (let vert = 0; vert < size; vert++) {
      const row = upward ? size - 1 - vert : vert;
      for (let j = 0; j < 2; j++) {
        const col = right - j;
        if (!isFunction[row][col]) {
          let dark = false;
          if (bitIdx < totalBits) {
            dark =
              ((codewords[bitIdx >>> 3] >>> (7 - (bitIdx & 7))) & 1) !== 0;
            bitIdx++;
          }
          modules[row][col] = dark;
        }
      }
    }
  }
}

function applyMaskPattern(
  modules: boolean[][],
  isFunction: boolean[][],
  mask: number
) {
  const size = modules.length;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (isFunction[r][c]) continue;
      let invert = false;
      switch (mask) {
        case 0:
          invert = (r + c) % 2 === 0;
          break;
        case 1:
          invert = r % 2 === 0;
          break;
        case 2:
          invert = c % 3 === 0;
          break;
        case 3:
          invert = (r + c) % 3 === 0;
          break;
        case 4:
          invert = (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0;
          break;
        case 5:
          invert = ((r * c) % 2) + ((r * c) % 3) === 0;
          break;
        case 6:
          invert = (((r * c) % 2) + ((r * c) % 3)) % 2 === 0;
          break;
        case 7:
          invert = (((r + c) % 2) + ((r * c) % 3)) % 2 === 0;
          break;
      }
      if (invert) {
        modules[r][c] = !modules[r][c];
      }
    }
  }
}

function computePenaltyScore(modules: boolean[][]): number {
  const size = modules.length;
  let penalty = 0;

  // Rule 1: 5+ consecutive modules of same color in row or col
  for (let r = 0; r < size; r++) {
    let runColor = modules[r][0];
    let runLen = 1;
    for (let c = 1; c < size; c++) {
      if (modules[r][c] === runColor) {
        runLen++;
        if (runLen === 5) penalty += 3;
        else if (runLen > 5) penalty += 1;
      } else {
        runColor = modules[r][c];
        runLen = 1;
      }
    }
  }
  for (let c = 0; c < size; c++) {
    let runColor = modules[0][c];
    let runLen = 1;
    for (let r = 1; r < size; r++) {
      if (modules[r][c] === runColor) {
        runLen++;
        if (runLen === 5) penalty += 3;
        else if (runLen > 5) penalty += 1;
      } else {
        runColor = modules[r][c];
        runLen = 1;
      }
    }
  }

  // Rule 2: 2x2 blocks of same color
  for (let r = 0; r < size - 1; r++) {
    for (let c = 0; c < size - 1; c++) {
      const color = modules[r][c];
      if (
        color === modules[r][c + 1] &&
        color === modules[r + 1][c] &&
        color === modules[r + 1][c + 1]
      ) {
        penalty += 3;
      }
    }
  }

  // Rule 3: Finder-like pattern 1:1:3:1:1 with 4 light modules on either side
  for (let r = 0; r < size; r++) {
    let bits = 0;
    for (let c = 0; c < size; c++) {
      bits = ((bits << 1) & 0x7ff) | (modules[r][c] ? 1 : 0);
      if (c >= 10 && (bits === 0x05d || bits === 0x5d0)) {
        penalty += 40;
      }
    }
  }
  for (let c = 0; c < size; c++) {
    let bits = 0;
    for (let r = 0; r < size; r++) {
      bits = ((bits << 1) & 0x7ff) | (modules[r][c] ? 1 : 0);
      if (r >= 10 && (bits === 0x05d || bits === 0x5d0)) {
        penalty += 40;
      }
    }
  }

  // Rule 4: Balance of dark and light modules
  let darkCount = 0;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (modules[r][c]) darkCount++;
    }
  }
  const total = size * size;
  const k = Math.ceil(Math.abs(darkCount * 20 - total * 10) / total) - 1;
  if (k > 0) penalty += k * 10;

  return penalty;
}

/**
 * Encodes a string into a 2D QR Code module matrix (true = dark, false = light).
 */
export function generateQrMatrix(text: string): boolean[][] {
  const utf8Bytes = new TextEncoder().encode(text);
  const spec = selectVersionSpec(utf8Bytes.length);
  const dataCodewords = encodeDataCodewords(utf8Bytes, spec);
  const allCodewords = interleaveCodewords(dataCodewords, spec);

  const { modules, isFunction } = setupFunctionPatterns(
    spec.version,
    spec.alignmentCoords
  );
  placeDataCodewords(modules, isFunction, allCodewords);

  let bestMask = 0;
  let lowestPenalty = Number.POSITIVE_INFINITY;

  for (let mask = 0; mask < 8; mask++) {
    applyMaskPattern(modules, isFunction, mask);
    drawFormatBits(modules, isFunction, mask);
    const penalty = computePenaltyScore(modules);
    if (penalty < lowestPenalty) {
      lowestPenalty = penalty;
      bestMask = mask;
    }
    // Undo mask
    applyMaskPattern(modules, isFunction, mask);
  }

  applyMaskPattern(modules, isFunction, bestMask);
  drawFormatBits(modules, isFunction, bestMask);

  return modules;
}

/**
 * Generates a standalone SVG string for a QR code (for download or print).
 */
export function generateQrSvgString(
  text: string,
  options?: {
    margin?: number;
    darkColor?: string;
    lightColor?: string;
    size?: number;
  }
): string {
  const matrix = generateQrMatrix(text);
  const margin = options?.margin ?? 4;
  const darkColor = options?.darkColor ?? "#141311";
  const lightColor = options?.lightColor ?? "#FDFBF7";
  const pixelSize = options?.size ?? 512;
  const totalModules = matrix.length + margin * 2;

  const paths: string[] = [];
  for (let r = 0; r < matrix.length; r++) {
    for (let c = 0; c < matrix.length; c++) {
      if (matrix[r][c]) {
        paths.push(`M${c + margin},${r + margin}h1v1h-1z`);
      }
    }
  }

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalModules} ${totalModules}" width="${pixelSize}" height="${pixelSize}" shape-rendering="crispEdges">`,
    `<rect width="100%" height="100%" fill="${lightColor}" />`,
    `<path d="${paths.join("")}" fill="${darkColor}" />`,
    `</svg>`,
  ].join("");
}
