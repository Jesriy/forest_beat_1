/**
 * 零依赖 PWA 图标生成器：node scripts/gen-icons.mjs
 * 生成 public/icons/ 下的 png（192/512/maskable512/apple180/favicon32）。
 * 想换成自己的图标：直接用同名文件覆盖 public/icons/*.png 即可，无需运行本脚本。
 */
import zlib from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public', 'icons');
mkdirSync(outDir, { recursive: true });

/* ---------- 极简 PNG 编码（RGBA） ---------- */
function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function encodePNG(w, h, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8bit RGBA
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

/* ---------- 像素画布 ---------- */
function makeCanvas(size) {
  return { size, px: Buffer.alloc(size * size * 4) };
}
function setPx(cv, x, y, r, g, b, a = 255) {
  x = x | 0; y = y | 0;
  if (x < 0 || y < 0 || x >= cv.size || y >= cv.size) return;
  const i = (y * cv.size + x) * 4;
  // alpha 混合
  const aa = a / 255;
  cv.px[i]     = Math.round(r * aa + cv.px[i]     * (1 - aa));
  cv.px[i + 1] = Math.round(g * aa + cv.px[i + 1] * (1 - aa));
  cv.px[i + 2] = Math.round(b * aa + cv.px[i + 2] * (1 - aa));
  cv.px[i + 3] = Math.max(cv.px[i + 3], a);
}
function fillRect(cv, x0, y0, x1, y1, [r, g, b]) {
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) setPx(cv, x, y, r, g, b);
}
function circle(cv, cx, cy, rad, [r, g, b], a = 255) {
  for (let y = -rad; y <= rad; y++)
    for (let x = -rad; x <= rad; x++)
      if (x * x + y * y <= rad * rad) setPx(cv, cx + x, cy + y, r, g, b, a);
}
function tri(cv, cx, cy, w, h, [r, g, b]) {
  // 顶点 (cx, cy-h/2)，底边 y=cy+h/2
  const yTop = cy - h / 2, yBot = cy + h / 2;
  for (let y = yTop; y <= yBot; y++) {
    const t = (y - yTop) / h;
    const half = (w / 2) * t;
    for (let x = cx - half; x <= cx + half; x++) setPx(cv, x, y, r, g, b);
  }
}

/**
 * 绘制图标。所有元素使用 512 设计坐标，经 C() 映射到实际像素。
 * scale<1 时内容整体缩小并居中，用于 maskable 安全区。
 */
function draw(size, scale) {
  const cv = makeCanvas(size);
  const S = size;
  // 竖向渐变背景：深夜林绿 -> 深墨绿（始终铺满，不留边）
  for (let y = 0; y < S; y++) {
    const t = y / S;
    const r = 22 + (14 - 22) * t, g = 53 + (36 - 53) * t, b = 31 + (22 - 31) * t;
    fillRect(cv, 0, y, S, y + 1, [r, g, b]);
  }
  const k = (S / 512) * scale;
  const o = (S * (1 - scale)) / 2; // 安全区偏移
  const C = (v) => o + v * k;      // 512 设计坐标 -> 实际像素
  // 暖色阳光（右上）
  circle(cv, C(402), C(96), 52 * k, [255, 214, 132], 235);
  circle(cv, C(402), C(96), 74 * k, [255, 214, 132], 60);
  // 树：三层针叶三角 + 树干
  const cx = C(256);
  tri(cv, cx, C(250), 250 * k, 180 * k, [61, 220, 132]);
  tri(cv, cx, C(330), 320 * k, 190 * k, [47, 189, 111]);
  tri(cv, cx, C(405), 390 * k, 200 * k, [38, 158, 92]);
  fillRect(cv, C(238), C(430), C(274), C(500), [122, 84, 45]);
  // 右下角迷你城市剪影
  fillRect(cv, C(330), C(392), C(372), C(470), [120, 132, 140]);
  fillRect(cv, C(380), C(360), C(428), C(470), [104, 116, 124]);
  fillRect(cv, C(436), C(410), C(470), C(470), [138, 150, 158]);
  // 楼窗
  for (const [wx, wy] of [[340,405],[356,405],[340,430],[356,430],[392,378],[410,378],[392,405],[410,430],[446,425],[446,445]])
    fillRect(cv, C(wx), C(wy), C(wx + 8), C(wy + 10), [255, 230, 150]);
  return cv;
}

function save(cv, name) {
  writeFileSync(join(outDir, name), encodePNG(cv.size, cv.size, cv.px));
  console.log('written', name, cv.size + 'x' + cv.size);
}

save(draw(192, 1), 'icon-192.png');
save(draw(512, 1), 'icon-512.png');
save(draw(512, 0.78), 'icon-maskable-512.png'); // 内容收进安全区
save(draw(180, 1), 'apple-touch-icon.png');
save(draw(32, 1), 'favicon-32.png');
