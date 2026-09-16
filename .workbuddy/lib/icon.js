/* =====================================================================
   应用图标 · 运行时生成 PNG（零依赖）
   ---------------------------------------------------------------------
   给 /icon.png 与 /apple-touch-icon.png 用：手机「添加到主屏幕」时，
   Android 走 manifest 的 icons、iOS 只认 apple-touch-icon 的 PNG —— 给 SVG
   在 iOS 上会退化成页面截图，所以这里老老实实生成 PNG。

   画满幅正方形即可：iOS 会自己裁成圆角（squircle），Android 也会套自己的形状。
   内部按 1024 渲染再 2×2 降采样，用来做边缘抗锯齿。
   ===================================================================== */
const zlib = require('zlib');

const OUT = 512;      // 输出边长
const SS = 2;         // 超采样倍数
const W = OUT * SS;

const BG = [0x1d, 0x4f, 0xd8, 255];
const BALLS = [
  { x: 340, y: 392, r: 124, c: [0xef, 0x44, 0x44, 255] },
  { x: 684, y: 392, r: 124, c: [0xef, 0x44, 0x44, 255] },
  { x: 512, y: 660, r: 124, c: [0x60, 0xa5, 0xfa, 255] }
];

/* --- 最小 CRC32（不依赖 Node 版本是否提供 zlib.crc32） --- */
const CRC_TABLE = (function () {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function build() {
  // 1) 超采样渲染
  const big = Buffer.alloc(W * W * 4);
  for (let y = 0; y < W; y++) {
    for (let x = 0; x < W; x++) {
      let c = BG;
      for (let i = 0; i < BALLS.length; i++) {
        const b = BALLS[i], dx = x - b.x, dy = y - b.y;
        if (dx * dx + dy * dy <= b.r * b.r) { c = b.c; break; }
      }
      const o = (y * W + x) * 4;
      big[o] = c[0]; big[o + 1] = c[1]; big[o + 2] = c[2]; big[o + 3] = c[3];
    }
  }
  // 2) 2×2 降采样（边缘抗锯齿）
  const raw = Buffer.alloc(OUT * (OUT * 4 + 1));
  let p = 0;
  for (let y = 0; y < OUT; y++) {
    raw[p++] = 0;                                   // 每行的 filter byte
    for (let x = 0; x < OUT; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const o = (((y * SS + sy) * W) + (x * SS + sx)) * 4;
          r += big[o]; g += big[o + 1]; b += big[o + 2]; a += big[o + 3];
        }
      }
      const n = SS * SS;
      raw[p++] = (r / n) | 0; raw[p++] = (g / n) | 0; raw[p++] = (b / n) | 0; raw[p++] = (a / n) | 0;
    }
  }
  // 3) PNG 封装
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(OUT, 0); ihdr.writeUInt32BE(OUT, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;   // 8bit RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

let cached = null;
function png() { if (!cached) cached = build(); return cached; }

/* 矢量版：Android 的 manifest 可以吃 SVG（iOS 不行，见上）。
   画法与上面的位图保持一致，只是坐标按 512 的 viewBox 缩放。 */
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">' +
  '<rect width="512" height="512" rx="112" fill="#1d4fd8"/>' +
  '<circle cx="170" cy="196" r="62" fill="#ef4444"/>' +
  '<circle cx="342" cy="196" r="62" fill="#ef4444"/>' +
  '<circle cx="256" cy="330" r="62" fill="#60a5fa"/>' +
  '</svg>';
function svg() { return SVG; }

module.exports = { png, svg, SIZE: OUT };
