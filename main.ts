// THE WORLD TODAY — Thursday 26 November 2026
// make.fun bounty news-image-20261126 — single-file entry.
// Own rasterizer + own hand-drawn stroke typeface. No copied assets, no external
// dependencies beyond Node's standard library. Deterministic: same bytes every run.
//
// Layout (1024x1024, dark navy poster): giant masthead date, one hero
// (Zelensky / Moscow flight offer), two secondary cards, four number tiles,
// an ALSO ON THE DAY ticker, footer. 7 stories max.

import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

// ---------------------------------------------------------------- PNG encoder
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  const crc = crc32(out.subarray(4, 8 + data.length));
  dv.setUint32(8 + data.length, crc);
  return out;
}

function encodePng(w: number, h: number, rgb: Uint8Array): Uint8Array {
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, w);
  dv.setUint32(4, h);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const raw = new Uint8Array(h * (1 + w * 3));
  for (let y = 0; y < h; y++) {
    raw[y * (1 + w * 3)] = 0; // filter: none
    raw.set(rgb.subarray(y * w * 3, (y + 1) * w * 3), y * (1 + w * 3) + 1);
  }
  const idat = deflateSync(raw, { level: 9 });
  const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const parts = [sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', new Uint8Array(0))];
  const total = parts.reduce((a, p) => a + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

// ---------------------------------------------------------------- rasterizer
// Render at 2x supersampling, then box-downsample to 1024x1024.
const SS = 2;
const W = 1024;
const H = 1024;
const SW = W * SS;
const SH = H * SS;
const buf = new Uint8Array(SW * SH * 3);

type RGB = [number, number, number];
const NAVY: RGB = [13, 27, 46];
const NAVY2: RGB = [19, 38, 63];
const NAVY3: RGB = [30, 55, 84];
const CREAM: RGB = [244, 235, 216];
const CREAM_DIM: RGB = [201, 191, 168];
const AMBER: RGB = [240, 168, 50];
const CORAL: RGB = [228, 87, 61];
const TEAL: RGB = [79, 168, 160];
const INK: RGB = [13, 27, 46];

function px(x: number, y: number, c: RGB): void {
  if (x < 0 || y < 0 || x >= SW || y >= SH) return;
  const i = (y * SW + x) * 3;
  buf[i] = c[0]; buf[i + 1] = c[1]; buf[i + 2] = c[2];
}

function fillRect(x: number, y: number, w: number, h: number, c: RGB): void {
  const x0 = Math.max(0, Math.round(x * SS));
  const y0 = Math.max(0, Math.round(y * SS));
  const x1 = Math.min(SW, Math.round((x + w) * SS));
  const y1 = Math.min(SH, Math.round((y + h) * SS));
  for (let yy = y0; yy < y1; yy++) {
    let i = (yy * SW + x0) * 3;
    for (let xx = x0; xx < x1; xx++) {
      buf[i] = c[0]; buf[i + 1] = c[1]; buf[i + 2] = c[2];
      i += 3;
    }
  }
}

function disc(cx: number, cy: number, r: number, c: RGB): void {
  // cx, cy, r in supersampled pixels
  const x0 = Math.max(0, Math.floor(cx - r));
  const x1 = Math.min(SW - 1, Math.ceil(cx + r));
  const y0 = Math.max(0, Math.floor(cy - r));
  const y1 = Math.min(SH - 1, Math.ceil(cy + r));
  const r2 = r * r;
  for (let y = y0; y <= y1; y++) {
    const dy = y + 0.5 - cy;
    const dx = Math.sqrt(Math.max(0, r2 - dy * dy));
    const xa = Math.max(x0, Math.ceil(cx - dx - 0.5));
    const xb = Math.min(x1, Math.floor(cx + dx - 0.5));
    for (let x = xa; x <= xb; x++) px(x, y, c);
  }
}

function line(x1: number, y1: number, x2: number, y2: number, w: number, c: RGB): void {
  // coords in final px; w = stroke width in final px
  const sx1 = x1 * SS, sy1 = y1 * SS, sx2 = x2 * SS, sy2 = y2 * SS;
  const sw = Math.max(SS, w * SS);
  const len = Math.hypot(sx2 - sx1, sy2 - sy1);
  const step = Math.max(1, sw * 0.35);
  const n = Math.max(1, Math.ceil(len / step));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    disc(sx1 + (sx2 - sx1) * t, sy1 + (sy2 - sy1) * t, sw / 2, c);
  }
}

function polyline(pts: Array<[number, number]>, w: number, c: RGB): void {
  for (let i = 0; i < pts.length - 1; i++) {
    line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], w, c);
  }
}

function polygonFill(pts: Array<[number, number]>, c: RGB): void {
  // even-odd scanline fill, coords in final px
  const sp = pts.map(([x, y]) => [x * SS, y * SS] as [number, number]);
  let minY = Infinity, maxY = -Infinity;
  for (const [, y] of sp) { minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
  const y0 = Math.max(0, Math.floor(minY));
  const y1 = Math.min(SH - 1, Math.ceil(maxY));
  for (let y = y0; y <= y1; y++) {
    const yc = y + 0.5;
    const xs: number[] = [];
    for (let i = 0; i < sp.length; i++) {
      const [x1, y1p] = sp[i];
      const [x2, y2p] = sp[(i + 1) % sp.length];
      if ((y1p <= yc && y2p > yc) || (y2p <= yc && y1p > yc)) {
        xs.push(x1 + ((yc - y1p) / (y2p - y1p)) * (x2 - x1));
      }
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const xa = Math.max(0, Math.ceil(xs[k] - 0.5));
      const xb = Math.min(SW - 1, Math.floor(xs[k + 1] - 0.5));
      for (let x = xa; x <= xb; x++) px(x, y, c);
    }
  }
}

function roundRect(x: number, y: number, w: number, h: number, r: number, c: RGB): void {
  fillRect(x + r, y, w - 2 * r, h, c);
  fillRect(x, y + r, w, h - 2 * r, c);
  disc((x + r) * SS, (y + r) * SS, r * SS, c);
  disc((x + w - r) * SS, (y + r) * SS, r * SS, c);
  disc((x + r) * SS, (y + h - r) * SS, r * SS, c);
  disc((x + w - r) * SS, (y + h - r) * SS, r * SS, c);
}

function dashedBezier(p0: [number, number], p1: [number, number], p2: [number, number], w: number, c: RGB, dash = 13, gap = 9): void {
  // quadratic bezier, dashed, coords in final px
  const N = 160;
  let prev: [number, number] | null = null;
  let dist = 0;
  let drawing = true;
  let segLeft = dash;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const mt = 1 - t;
    const x = mt * mt * p0[0] + 2 * mt * t * p1[0] + t * t * p2[0];
    const y = mt * mt * p0[1] + 2 * mt * t * p1[1] + t * t * p2[1];
    if (prev) {
      const d = Math.hypot(x - prev[0], y - prev[1]);
      let dd = d;
      while (dd > 0) {
        const take = Math.min(dd, segLeft);
        const f0 = (d - dd) / d;
        const f1 = (d - dd + take) / d;
        if (drawing) {
          line(
            prev[0] + (x - prev[0]) * f0, prev[1] + (y - prev[1]) * f0,
            prev[0] + (x - prev[0]) * f1, prev[1] + (y - prev[1]) * f1,
            w, c,
          );
        }
        segLeft -= take;
        dd -= take;
        if (segLeft <= 0) { drawing = !drawing; segLeft = drawing ? dash : gap; }
      }
      dist += d;
    }
    prev = [x, y];
  }
  void dist;
}

function downsample(): Uint8Array {
  const out = new Uint8Array(W * H * 3);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let r = 0, g = 0, b = 0;
      for (let dy = 0; dy < SS; dy++) {
        for (let dx = 0; dx < SS; dx++) {
          const i = ((y * SS + dy) * SW + (x * SS + dx)) * 3;
          r += buf[i]; g += buf[i + 1]; b += buf[i + 2];
        }
      }
      const o = (y * W + x) * 3;
      const n = SS * SS;
      out[o] = Math.round(r / n);
      out[o + 1] = Math.round(g / n);
      out[o + 2] = Math.round(b / n);
    }
  }
  return out;
}

// ---------------------------------------------------------------- stroke font
// Own hand-drawn capitals on a 6-wide x 10-tall unit grid (y down, baseline 10).
// Each glyph: list of items — { p: polyline points } or { c: [cx, cy, r] } circle.
// adv = advance width in font units (cap height = 10 units).
type GItem = { p: Array<[number, number]> } | { c: [number, number, number] };
type Glyph = { adv: number; items: GItem[] };
const P = (...pts: Array<[number, number]>): GItem => ({ p: pts });
const C = (cx: number, cy: number, r: number): GItem => ({ c: [cx, cy, r] });

// 12-point rounded O used by O, 0, Q
const O_POINTS: Array<[number, number]> = [
  [3, 0], [4.8, 0.7], [6, 2.5], [6, 7.5], [4.8, 9.3], [3, 10],
  [1.2, 9.3], [0, 7.5], [0, 2.5], [1.2, 0.7], [3, 0],
];

const GLYPHS: Record<string, Glyph> = {
  A: { adv: 7.6, items: [P([0, 10], [3, 0], [6, 10]), P([1.5, 6.5], [4.5, 6.5])] },
  B: { adv: 7.6, items: [
    P([0, 0], [0, 10]),
    P([0, 0], [4, 0], [5.5, 1.5], [5.5, 3.5], [4, 5], [0, 5]),
    P([0, 5], [4, 5], [5.5, 6.5], [5.5, 8.5], [4, 10], [0, 10]),
  ] },
  C: { adv: 7.6, items: [P([6, 2], [4, 0], [1.5, 0], [0, 2], [0, 8], [1.5, 10], [4, 10], [6, 8])] },
  D: { adv: 7.6, items: [
    P([0, 0], [0, 10]),
    P([0, 0], [3.5, 0], [6, 2.5], [6, 7.5], [3.5, 10], [0, 10]),
  ] },
  E: { adv: 7.6, items: [
    P([0, 0], [0, 10]), P([0, 0], [5.5, 0]), P([0, 5], [4.5, 5]), P([0, 10], [5.5, 10]),
  ] },
  F: { adv: 7.6, items: [
    P([0, 0], [0, 10]), P([0, 0], [5.5, 0]), P([0, 5], [4.5, 5]),
  ] },
  G: { adv: 7.6, items: [
    P([6, 2], [4, 0], [1.5, 0], [0, 2], [0, 8], [1.5, 10], [4, 10], [6, 8], [6, 5], [3.5, 5]),
  ] },
  H: { adv: 7.6, items: [P([0, 0], [0, 10]), P([6, 0], [6, 10]), P([0, 5], [6, 5])] },
  I: { adv: 4.6, items: [
    P([3, 0], [3, 10]), P([1.5, 0], [4.5, 0]), P([1.5, 10], [4.5, 10]),
  ] },
  J: { adv: 7.6, items: [
    P([6, 0], [6, 8], [4.5, 10], [2, 10], [0.5, 8]), P([2.5, 0], [6, 0]),
  ] },
  K: { adv: 7.6, items: [
    P([0, 0], [0, 10]), P([5.5, 0], [0, 5]), P([1.5, 3.5], [5.5, 10]),
  ] },
  L: { adv: 7.6, items: [P([0, 0], [0, 10]), P([0, 10], [5.5, 10])] },
  M: { adv: 9.2, items: [P([0, 10], [0, 0], [3, 6], [6, 0], [6, 10])] },
  N: { adv: 7.6, items: [P([0, 10], [0, 0], [6, 10], [6, 0])] },
  O: { adv: 7.6, items: [P(...O_POINTS)] },
  P: { adv: 7.6, items: [
    P([0, 0], [0, 10]), P([0, 0], [4, 0], [5.5, 1.5], [5.5, 3.5], [4, 5], [0, 5]),
  ] },
  Q: { adv: 7.6, items: [P(...O_POINTS), P([4, 7], [6, 10])] },
  R: { adv: 7.6, items: [
    P([0, 0], [0, 10]),
    P([0, 0], [4, 0], [5.5, 1.5], [5.5, 3.5], [4, 5], [0, 5]),
    P([2, 5], [5.5, 10]),
  ] },
  S: { adv: 7.6, items: [P(
    [5.5, 1.8], [4.2, 0.3], [1.8, 0.3], [0.4, 1.8], [0.4, 3.6], [1.8, 5],
    [4.2, 5], [5.6, 6.4], [5.6, 8.2], [4.2, 9.7], [1.8, 9.7], [0.4, 8.2],
  )] },
  T: { adv: 7.6, items: [P([0, 0], [6, 0]), P([3, 0], [3, 10])] },
  U: { adv: 7.6, items: [P([0, 0], [0, 7.5], [1, 9.5], [2.5, 10], [3.5, 10], [5, 9.5], [6, 7.5], [6, 0])] },
  V: { adv: 7.6, items: [P([0, 0], [3, 10], [6, 0])] },
  W: { adv: 9.2, items: [P([0, 0], [1.5, 10], [3, 4], [4.5, 10], [6, 0])] },
  X: { adv: 7.6, items: [P([0, 0], [6, 10]), P([6, 0], [0, 10])] },
  Y: { adv: 7.6, items: [P([0, 0], [3, 5], [6, 0]), P([3, 5], [3, 10])] },
  Z: { adv: 7.6, items: [P([0, 0], [6, 0], [0, 10], [6, 10])] },

  '0': { adv: 7.6, items: [P(...O_POINTS)] },
  '1': { adv: 7.6, items: [P([1.5, 2], [3, 0], [3, 10]), P([1.5, 10], [4.5, 10])] },
  '2': { adv: 7.6, items: [P([0.5, 2], [1.5, 0.5], [4, 0], [5.5, 1.5], [5.5, 3.5], [4, 5], [0, 10], [6, 10])] },
  '3': { adv: 7.6, items: [
    P([1, 1.5], [2.5, 0], [4.5, 0], [5.8, 1.5], [5.8, 3.5], [4.5, 5], [2.5, 5]),
    P([4.5, 5], [5.8, 6.5], [5.8, 8.5], [4.5, 10], [2.5, 10], [1, 8.5]),
  ] },
  '4': { adv: 7.6, items: [P([4.5, 0], [0.5, 7], [5.5, 7]), P([4.5, 0], [4.5, 10])] },
  '5': { adv: 7.6, items: [P([5.5, 0], [0.5, 0], [0.5, 4.5], [4, 4.5], [5.5, 6], [5.5, 8.5], [4, 10], [1.5, 10], [0.5, 9])] },
  '6': { adv: 7.6, items: [P(
    [5.5, 1], [4, 0], [1.5, 0], [0, 2], [0, 8], [1.5, 10], [4, 10],
    [5.5, 8], [5.5, 6], [4, 5], [1.5, 5], [0, 7],
  )] },
  '7': { adv: 7.6, items: [P([0, 0], [6, 0], [2.5, 10])] },
  '8': { adv: 7.6, items: [
    P([2, 0], [4, 0], [5.5, 1.5], [5.5, 3.5], [4, 5], [2, 5], [0.5, 3.5], [0.5, 1.5], [2, 0]),
    P([2, 5], [4, 5], [5.5, 6.5], [5.5, 8.5], [4, 10], [2, 10], [0.5, 8.5], [0.5, 6.5], [2, 5]),
  ] },
  '9': { adv: 7.6, items: [P(
    [0.5, 9], [2, 10], [4.5, 10], [6, 8], [6, 2], [4.5, 0], [2, 0],
    [0.5, 1.5], [0.5, 3.5], [2, 5], [4.5, 5], [6, 3.5],
  )] },

  '.': { adv: 4.6, items: [C(3, 9.3, 0.8)] },
  ',': { adv: 4.6, items: [C(3, 9.3, 0.8), P([3.2, 9.9], [2.2, 11.8])] },
  ':': { adv: 4.6, items: [C(3, 3.4, 0.8), C(3, 8.4, 0.8)] },
  ';': { adv: 4.6, items: [C(3, 3.4, 0.8), C(3, 9.3, 0.8), P([3.2, 9.9], [2.2, 11.8])] },
  "'": { adv: 4.0, items: [P([3.8, 0], [2.8, 2.6])] },
  '"': { adv: 5.5, items: [P([2.2, 0], [1.7, 2.2]), P([4.7, 0], [4.2, 2.2])] },
  '-': { adv: 6.0, items: [P([0.5, 5], [5.5, 5])] },
  '—': { adv: 9.0, items: [P([-0.3, 5], [6.3, 5])] },
  '?': { adv: 7.6, items: [
    P([1.5, 1.5], [2.5, 0], [4.5, 0], [5.5, 1.5], [5.5, 3], [4, 4.5], [3, 5.5], [3, 7]),
    C(3, 9.3, 0.8),
  ] },
  '!': { adv: 4.6, items: [P([3, 0], [3, 7]), C(3, 9.3, 0.8)] },
  '%': { adv: 8.6, items: [
    P([0.5, 10], [5.5, 0]),
    C(1.7, 2.3, 1.15), C(4.3, 7.7, 1.15),
  ] },
  '+': { adv: 7.6, items: [P([3, 2], [3, 8]), P([0.5, 5], [5.5, 5])] },
  '/': { adv: 5.5, items: [P([1, 10], [5, 0])] },
  '(': { adv: 5.0, items: [P([5, 1], [3.5, 0], [2, 2], [2, 8], [3.5, 10], [5, 9])] },
  ')': { adv: 5.0, items: [P([1, 1], [2.5, 0], [4, 2], [4, 8], [2.5, 10], [1, 9])] },
  '•': { adv: 5.0, items: [C(3, 5, 1.0)] },
  '°': { adv: 4.6, items: [C(4.3, 1.4, 1.05)] },
  '$': { adv: 7.6, items: [
    P([5.5, 1.8], [4.2, 0.3], [1.8, 0.3], [0.4, 1.8], [0.4, 3.6], [1.8, 5], [4.2, 5], [5.6, 6.4], [5.6, 8.2], [4.2, 9.7], [1.8, 9.7], [0.4, 8.2]),
    P([3, -1], [3, 11]),
  ] },
  ' ': { adv: 4.2, items: [] },
};

function glyphWidth(ch: string, size: number, tracking: number): number {
  const g = GLYPHS[ch];
  if (!g) return 0;
  return (g.adv * size) / 10 + tracking;
}

function textWidth(s: string, size: number, tracking: number): number {
  let w = 0;
  for (const ch of s) w += glyphWidth(ch, size, tracking);
  return w - tracking; // no trailing tracking
}

function drawGlyph(ch: string, x: number, baselineY: number, size: number, wUnits: number, c: RGB): void {
  const g = GLYPHS[ch];
  if (!g) return;
  const u = size / 10; // px per font unit
  const sw = Math.max(1.2, wUnits * u); // stroke width in final px
  for (const it of g.items) {
    if ('p' in it) {
      const pts = it.p.map(([gx, gy]) => [x + gx * u, baselineY - (10 - gy) * u] as [number, number]);
      if (pts.length === 1) {
        disc(pts[0][0] * SS, pts[0][1] * SS, (sw / 2) * SS, c);
      } else {
        polyline(pts, sw, c);
      }
    } else {
      const [cx, cy, r] = it.c;
      // filled circle: draw as filled polygon of 16 points
      const pts: Array<[number, number]> = [];
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2;
        pts.push([x + (cx + Math.cos(a) * r) * u, baselineY - (10 - (cy + Math.sin(a) * r)) * u]);
      }
      polygonFill(pts, c);
    }
  }
}

function drawText(s: string, x: number, baselineY: number, size: number, c: RGB, opts: { tracking?: number; weight?: number } = {}): void {
  // The typeface is capitals-only: fold everything to upper case so no
  // lowercase letter silently vanishes from the poster.
  const tracking = opts.tracking ?? 0;
  const weight = opts.weight ?? 1.0;
  let cx = x;
  for (const ch of s.toUpperCase()) {
    drawGlyph(ch, cx, baselineY, size, weight, c);
    cx += glyphWidth(ch, size, tracking);
  }
}

function drawTextCentered(s: string, cx: number, baselineY: number, size: number, c: RGB, opts: { tracking?: number; weight?: number } = {}): void {
  const w = textWidth(s, size, opts.tracking ?? 0);
  drawText(s, cx - w / 2, baselineY, size, c, opts);
}

function drawTextRight(s: string, rightX: number, baselineY: number, size: number, c: RGB, opts: { tracking?: number; weight?: number } = {}): void {
  const w = textWidth(s, size, opts.tracking ?? 0);
  drawText(s, rightX - w, baselineY, size, c, opts);
}

function wrapText(s: string, size: number, tracking: number, maxW: number): string[] {
  const words = s.toUpperCase().split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const word of words) {
    const test = cur ? cur + ' ' + word : word;
    if (textWidth(test, size, tracking) <= maxW || !cur) {
      cur = test;
    } else {
      lines.push(cur);
      cur = word;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

// ---------------------------------------------------------------- the page
const MX = 36;            // side margin
const CW = 952;           // content width (36..988)
const RX = 988;           // right edge

function drawPage(): void {
  fillRect(0, 0, W, H, NAVY);
  // tricolor strip at the very top edge
  fillRect(0, 0, 342, 8, CORAL);
  fillRect(342, 0, 341, 8, AMBER);
  fillRect(683, 0, 341, 8, TEAL);

  // ---- masthead
  drawTextCentered('THE WORLD TODAY', 512, 90, 54, CREAM, { tracking: 4, weight: 1.15 });
  fillRect(MX, 104, CW, 3, AMBER);
  drawTextCentered('THURSDAY, 26 NOVEMBER 2026', 512, 142, 30, AMBER, { tracking: 2, weight: 1.1 });
  fillRect(MX, 158, CW, 2, NAVY3);

  // ---- hero (left: story, right: illustration)
  const heroY = 176;
  const heroW = 584;
  drawText('UKRAINE • MOSCOW TALKS', MX, heroY + 22, 19, CORAL, { tracking: 2.5, weight: 1.15 });
  drawText('FLY ME TO', MX, heroY + 102, 70, CREAM, { tracking: 1, weight: 1.25 });
  drawText('MOSCOW?', MX, heroY + 178, 70, CREAM, { tracking: 1, weight: 1.25 });
  const deck = wrapText('Lukashenko offers to fly Zelensky to talks in Moscow.', 22, 0.3, heroW);
  let y = heroY + 210;
  for (const ln of deck) { drawText(ln, MX, y, 22, CREAM_DIM, { tracking: 0.3, weight: 1.0 }); y += 28; }
  // quote with amber bar
  const qY = y + 14;
  fillRect(MX, qY, 5, 30, AMBER);
  drawText('"AM I JUST A SUITCASE FOR HIM?"', MX + 18, qY + 24, 22, AMBER, { tracking: 0.3, weight: 1.1 });
  drawText('— ZELENSKY', MX + 18, qY + 50, 15, CREAM_DIM, { tracking: 1.5, weight: 1.0 });

  // illustration panel
  const px0 = 648, py0 = 176, pw = 340, ph = 334;
  roundRect(px0, py0, pw, ph, 14, NAVY2);
  // sparkles
  line(700, 216, 700, 232, 3, TEAL); line(692, 224, 708, 224, 3, TEAL);
  line(958, 306, 958, 320, 3, AMBER); line(951, 313, 965, 313, 3, AMBER);
  line(676, 330, 676, 342, 3, AMBER); line(670, 336, 682, 336, 3, AMBER);
  // dashed flight path from suitcase to plane
  dashedBezier([726, 448], [830, 300], [940, 238], 3, AMBER, 13, 9);
  // suitcase (bottom-left of panel)
  roundRect(688, 420, 92, 58, 8, CORAL);
  fillRect(688, 446, 92, 3, [190, 60, 40]);
  polyline([[712, 420], [712, 406], [756, 406], [756, 420]], 5, CREAM);
  fillRect(706, 444, 10, 12, CREAM);
  fillRect(752, 444, 10, 12, CREAM);
  // paper plane (top-right)
  polygonFill([[956, 210], [862, 236], [902, 250], [880, 282]], CREAM);
  line(902, 250, 956, 210, 3, NAVY2);
  line(880, 282, 902, 250, 3, NAVY2);

  // ---- secondary cards
  const secY = 528, secH = 160;
  roundRect(MX, secY, 466, secH, 10, CREAM);
  roundRect(522, secY, 466, secH, 10, CREAM);
  // card A — air defence
  drawText('AIR DEFENCE', MX + 18, secY + 28, 14, CORAL, { tracking: 2, weight: 1.15 });
  drawText('88 OF 112', MX + 18, secY + 70, 38, INK, { tracking: 0.5, weight: 1.25 });
  drawText('DRONES DOWN', MX + 18, secY + 102, 24, INK, { tracking: 1, weight: 1.2 });
  const deckA = wrapText('88 of 112 drones down overnight; 3 MIG-31S and 2 SU-34S hit at Savasleyka.', 14, 0.2, 430);
  let ay = secY + 124;
  for (const ln of deckA) { drawText(ln, MX + 18, ay, 14, [58, 74, 96], { tracking: 0.2 }); ay += 18; }
  // card B — Poland
  drawText('POLAND • NATO', 540, secY + 28, 14, CORAL, { tracking: 2, weight: 1.15 });
  drawText('NO-FLY ZONE', 540, secY + 72, 34, INK, { tracking: 0.5, weight: 1.25 });
  const deckB = wrapText('Poland plans a no-fly zone near the Ukraine border and asks NATO to intercept Russian missiles over Ukraine.', 15, 0.2, 430);
  let by = secY + 98;
  for (const ln of deckB) { drawText(ln, 540, by, 15, [58, 74, 96], { tracking: 0.2 }); by += 19; }

  // ---- four number tiles
  const tileY = 704, tileH = 196, tileW = 226, tileGap = 16;
  const tiles: Array<{ kicker: string; num: string; head: string; deck: string }> = [
    { kicker: 'GIZA', num: '30', head: 'KILLED', deck: 'Fuel-tanker fire near the Warraq tunnel in Giza.' },
    { kicker: 'INDONESIA', num: '25+', head: 'TRAPPED', deck: 'Miners feared trapped in an illegal gold mine in Indonesia.' },
    { kicker: 'MARKETS', num: '-4%', head: 'NASDAQ', deck: 'AI sell-off hits US stocks; Asia surges on Nvidia.' },
    { kicker: 'CLIMATE', num: '+2°C', head: 'SIX DAYS', deck: 'Global heat above +2C vs preindustrial, a record six days.' },
  ];
  for (let i = 0; i < 4; i++) {
    const tx = MX + i * (tileW + tileGap);
    roundRect(tx, tileY, tileW, tileH, 10, CREAM);
    const t = tiles[i];
    drawText(t.kicker, tx + 16, tileY + 26, 12, CORAL, { tracking: 2, weight: 1.15 });
    drawText(t.num, tx + 16, tileY + 72, 46, INK, { tracking: 0.5, weight: 1.3 });
    drawText(t.head, tx + 16, tileY + 100, 20, INK, { tracking: 1, weight: 1.2 });
    const dlines = wrapText(t.deck, 14, 0.2, tileW - 32);
    let dy = tileY + 124;
    for (const ln of dlines) { drawText(ln, tx + 16, dy, 14, [58, 74, 96], { tracking: 0.2 }); dy += 18; }
  }

  // ---- ALSO ON THE DAY ticker
  const tickY = 916, tickH = 46;
  roundRect(MX, tickY, CW, tickH, 8, NAVY2);
  drawText('ALSO ON THE DAY', MX + 16, tickY + 29, 15, AMBER, { tracking: 1.5, weight: 1.2 });
  const tick = wrapText(
    "Pakistan's first astronaut joins Shenzhou-24 • Trump pardons turkeys 'Liberty and Liberty' • WHO tracks a new COVID variant",
    15, 0.2, 716,
  );
  let ty = tickY + 21;
  for (const ln of tick) { drawText(ln, MX + 216, ty, 15, CREAM, { tracking: 0.2 }); ty += 19; }

  // ---- footer
  drawTextCentered(
    'THE WORLD TODAY — WORLD EDITION • STORIES AS REPORTED ON THURSDAY 26 NOVEMBER 2026',
    512, 992, 13, CREAM_DIM, { tracking: 0.5 },
  );
}

// ---------------------------------------------------------------- main
function main(): void {
  drawPage();
  const rgb = downsample();
  const png = encodePng(W, H, rgb);
  const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'entry.png'), png);
  console.log(`wrote ${join(outDir, 'entry.png')} (${png.length} bytes)`);
}

main();
