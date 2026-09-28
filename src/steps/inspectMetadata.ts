import { register } from '../core/registry';
import type { Bytes, Step } from '../core/types';

export interface MetadataReport { jpeg: { APP1: boolean; APP2: boolean; APP13: boolean }; png: { eXIf: boolean; iTXt: boolean; iCCP: boolean; tEXt: boolean }; webp: { EXIF: boolean; XMP: boolean; ICCP: boolean }; }
const text = (bytes: Uint8Array, start: number, length: number): string => String.fromCharCode(...bytes.subarray(start, start + length));

export function scanMetadata(bytes: Uint8Array): MetadataReport {
  const report: MetadataReport = { jpeg: { APP1: false, APP2: false, APP13: false }, png: { eXIf: false, iTXt: false, iCCP: false, tEXt: false }, webp: { EXIF: false, XMP: false, ICCP: false } };
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 3 < bytes.length && bytes[offset] === 0xff) {
      const marker = bytes[offset + 1];
      if (marker === 0xda || marker === 0xd9) break;
      const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
      if (marker === 0xe1) report.jpeg.APP1 = true;
      if (marker === 0xe2) report.jpeg.APP2 = true;
      if (marker === 0xed) report.jpeg.APP13 = true;
      offset += 2 + length;
    }
  }
  if (text(bytes, 0, 8) === '\x89PNG\r\n\x1a\n') {
    let offset = 8;
    while (offset + 12 <= bytes.length) {
      const length = new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0);
      const type = text(bytes, offset + 4, 4);
      if (type === 'eXIf') report.png.eXIf = true;
      if (type === 'iTXt') report.png.iTXt = true;
      if (type === 'iCCP') report.png.iCCP = true;
      if (type === 'tEXt') report.png.tEXt = true;
      offset += 12 + length;
    }
  }
  if (text(bytes, 0, 4) === 'RIFF' && text(bytes, 8, 4) === 'WEBP') {
    let offset = 12;
    while (offset + 8 <= bytes.length) {
      const type = text(bytes, offset, 4);
      if (type === 'EXIF') report.webp.EXIF = true;
      if (type === 'XMP ') report.webp.XMP = true;
      if (type === 'ICCP') report.webp.ICCP = true;
      const length = new DataView(bytes.buffer, bytes.byteOffset + offset + 4, 4).getUint32(0, true);
      offset += 8 + length + (length & 1);
    }
  }
  return report;
}

register('inspectMetadata', (): Step<Bytes, Bytes> => ({
  name: 'inspectMetadata', in: 'bytes', out: 'bytes',
  async run(input, ctx) { ctx.report.metadata = scanMetadata(new Uint8Array(await input.blob.arrayBuffer())); return input; },
}));
