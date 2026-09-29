import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const fixtureDir = new URL('../tests/fixtures/', import.meta.url);
mkdirSync(fixtureDir, { recursive: true });

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function png(width, height, pixels) {
  const scanlines = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y += 1) {
    scanlines[y * (width * 4 + 1)] = 0;
    pixels.copy(scanlines, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const chunk = (type, data) => {
    const typeBuffer = Buffer.from(type);
    const output = Buffer.alloc(12 + data.length);
    output.writeUInt32BE(data.length, 0);
    typeBuffer.copy(output, 4);
    data.copy(output, 8);
    output.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), data.length + 8);
    return output;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 6;
  return Buffer.concat([signature, chunk('IHDR', header), chunk('IDAT', deflateSync(scanlines)), chunk('IEND', Buffer.alloc(0))]);
}

function exifPayload() {
  const payload = Buffer.alloc(160);
  payload.write('Exif\0\0', 0, 'ascii');
  const tiff = 6;
  payload.write('MM', tiff, 'ascii');
  payload.writeUInt16BE(42, tiff + 2);
  payload.writeUInt32BE(8, tiff + 4);
  payload.writeUInt16BE(2, tiff + 8);
  let entry = tiff + 10;
  payload.writeUInt16BE(0x0112, entry); payload.writeUInt16BE(3, entry + 2); payload.writeUInt32BE(1, entry + 4); payload.writeUInt16BE(6, entry + 8); entry += 12;
  payload.writeUInt16BE(0x8825, entry); payload.writeUInt16BE(4, entry + 2); payload.writeUInt32BE(1, entry + 4); payload.writeUInt32BE(38, entry + 8);
  const gps = tiff + 38;
  payload.writeUInt16BE(4, gps);
  const writeEntry = (offset, tag, type, count, value) => { payload.writeUInt16BE(tag, offset); payload.writeUInt16BE(type, offset + 2); payload.writeUInt32BE(count, offset + 4); payload.writeUInt32BE(value, offset + 8); };
  writeEntry(gps + 2, 1, 2, 2, 0);
  writeEntry(gps + 14, 2, 5, 3, 96);
  writeEntry(gps + 26, 3, 2, 2, 0);
  writeEntry(gps + 38, 4, 5, 3, 120);
  payload.writeUInt32BE(0x4e000000, gps + 2 + 8);
  payload.writeUInt32BE(0x57000000, gps + 26 + 8);
  const rational = (offset, numerator, denominator) => { payload.writeUInt32BE(numerator, tiff + offset); payload.writeUInt32BE(denominator, tiff + offset + 4); };
  rational(96, 40, 1); rational(104, 42, 1); rational(112, 4608, 100);
  rational(120, 74, 1); rational(128, 0, 1); rational(136, 216, 10);
  return payload.subarray(0, tiff + 144);
}

const transparent = png(2, 1, Buffer.from([255, 0, 0, 0, 0, 0, 255, 255]));
const rgb2x2 = png(2, 2, Buffer.from([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255]));
const colorful = Buffer.alloc(447 * 447 * 4);
for (let y = 0; y < 447; y += 1) for (let x = 0; x < 447; x += 1) {
  const offset = (y * 447 + x) * 4;
  colorful[offset] = (x * 13 + y * 7) & 255;
  colorful[offset + 1] = (x * 3 + y * 29 + 97) & 255;
  colorful[offset + 2] = (x * 31 + y * 11 + 173) & 255;
  colorful[offset + 3] = 255;
}
// Force one dHash neighbor comparison to flip after luma rounding: both values round to 101.
const sampleY = 27;
const firstSampleX = 24;
const secondSampleX = 74;
colorful.set([100, 101, 100, 255], (sampleY * 447 + firstSampleX) * 4);
colorful.set([100, 100, 107, 255], (sampleY * 447 + secondSampleX) * 4);
const colorful447 = png(447, 447, colorful);
const large = png(4096, 2, Buffer.alloc(4096 * 2 * 4, 80));

async function generate() {
  const { chromium } = await import('@playwright/test');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const jpegBase64 = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 2; canvas.height = 1;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas unavailable');
    context.fillStyle = '#ff0000'; context.fillRect(0, 0, 1, 1);
    context.fillStyle = '#0000ff'; context.fillRect(1, 0, 1, 1);
    return canvas.toDataURL('image/jpeg', 1).slice('data:image/jpeg;base64,'.length);
  });
  await browser.close();
  const onePixelJpeg = Buffer.from(jpegBase64, 'base64');
  const exif = exifPayload();
  const jpeg = Buffer.concat([onePixelJpeg.subarray(0, 2), Buffer.from([0xff, 0xe1]), Buffer.from([(exif.length + 2) >> 8, (exif.length + 2) & 0xff]), exif, onePixelJpeg.subarray(2)]);
  writeFileSync(new URL('exif-orientation-gps.jpg', fixtureDir), jpeg);
  writeFileSync(new URL('transparent.png', fixtureDir), transparent);
  writeFileSync(new URL('rgb-2x2.png', fixtureDir), rgb2x2);
  writeFileSync(new URL('color-447.png', fixtureDir), colorful447);
  writeFileSync(new URL('corrupt.bin', fixtureDir), Buffer.from('not-a-real-image'));
  writeFileSync(new URL('png-renamed.jpg', fixtureDir), transparent);
  writeFileSync(new URL('large-dimension.png', fixtureDir), large);
}

await generate();
