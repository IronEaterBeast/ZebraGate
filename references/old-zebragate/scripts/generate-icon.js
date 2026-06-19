/**
 * 生成最小可用 Tauri 图标文件 (占位用)
 * 生成 32x32 和 128x128 PNG，以及 icon.ico
 * 不依赖任何第三方库
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ICONS_DIR = path.resolve(__dirname, '..', 'apps', 'desktop', 'src-tauri', 'icons');

// 确保目录存在
if (!fs.existsSync(ICONS_DIR)) {
  fs.mkdirSync(ICONS_DIR, { recursive: true });
}

// ========== 生成像素数据 ==========
function generatePixels(width, height) {
  const R = 0x4a, G = 0x90, B = 0xd9; // 蓝色 #4A90D9
  const pixels = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const isBorder = x === 0 || x === width - 1 || y === 0 || y === height - 1;
      const isZDiagonal = (x + y === width - 1);
      const isZBar = (y === 0 && x >= Math.floor(width * 0.15) && x <= Math.floor(width * 0.85)) ||
                     (y === height - 1 && x >= Math.floor(width * 0.15) && x <= Math.floor(width * 0.85)) ||
                     (Math.abs(x + y - (width - 1)) <= 1 && y > 0 && y < height - 1);
      
      if (isBorder) {
        pixels.push(0x33, 0x33, 0x33, 0xff); // 深灰边框
      } else if (isZBar) {
        pixels.push(0xff, 0xff, 0xff, 0xff); // 白色 Z
      } else {
        pixels.push(R, G, B, 0xff); // 蓝色背景
      }
    }
  }
  return pixels;
}

// ========== PNG 构建 ==========
function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(data, type) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeB = Buffer.from(type, 'ascii');
  const crcData = Buffer.concat([typeB, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(crcData), 0);
  return Buffer.concat([len, typeB, data, crc]);
}

function buildPNG(width, height, pixelData) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  
  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace
  
  // IDAT
  const raw = [];
  for (let y = 0; y < height; y++) {
    raw.push(0); // filter byte None
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      raw.push(pixelData[idx], pixelData[idx + 1], pixelData[idx + 2], pixelData[idx + 3]);
    }
  }
  const compressed = zlib.deflateSync(Buffer.from(raw));
  
  // IEND
  const iend = Buffer.alloc(0);
  
  return Buffer.concat([
    signature,
    pngChunk(ihdr, 'IHDR'),
    pngChunk(compressed, 'IDAT'),
    pngChunk(iend, 'IEND')
  ]);
}

// ========== 生成 32x32 ==========
const pixels32 = generatePixels(32, 32);
const png32 = buildPNG(32, 32, pixels32);

// ========== 生成 128x128 ==========
const pixels128 = generatePixels(128, 128);
const png128 = buildPNG(128, 128, pixels128);

// ========== 构建 ICO (包含 32x32 PNG) ==========
const imageCount = 1;
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);  // reserved
header.writeUInt16LE(1, 2);  // ICO type
header.writeUInt16LE(imageCount, 4);

const entry = Buffer.alloc(16);
entry[0] = 32;  // width
entry[1] = 32;  // height
entry[2] = 0;   // colors
entry[3] = 0;   // reserved
entry.writeUInt16LE(1, 4);   // color planes
entry.writeUInt16LE(32, 6);  // bits per pixel
entry.writeUInt32LE(png32.length, 8);  // image size
entry.writeUInt32LE(22, 12);  // image offset

const icoBuffer = Buffer.concat([header, entry, png32]);

// ========== 写入文件 ==========
const files = [
  { name: 'icon.ico', data: icoBuffer },
  { name: 'icon.png', data: png32 },
  { name: '32x32.png', data: png32 },
  { name: '128x128.png', data: png128 },
  { name: '128x128@2x.png', data: buildPNG(256, 256, generatePixels(256, 256)) },
];

for (const f of files) {
  const fp = path.join(ICONS_DIR, f.name);
  fs.writeFileSync(fp, f.data);
  console.log(`✅ Created: ${fp} (${f.data.length} bytes)`);
}

console.log('\n🎉 All icons generated successfully!');
