import { register } from '../core/registry';
import { requireReportTarget } from '../core/report';
import type { Bytes, Step } from '../core/types';

export interface MetadataReport { jpeg: { APP1: boolean; APP2: boolean; APP13: boolean; gps?: { GPSLatitude: number; GPSLongitude: number; GPSLatitudeRef?: string; GPSLongitudeRef?: string } }; png: { eXIf: boolean; iTXt: boolean; iCCP: boolean; tEXt: boolean }; webp: { EXIF: boolean; XMP: boolean; ICCP: boolean }; }
const text = (bytes: Uint8Array, start: number, length: number): string => String.fromCharCode(...bytes.subarray(start, start + length));

function exifGps(bytes: Uint8Array, start: number, length: number): MetadataReport['jpeg']['gps'] | undefined {
  if (length < 14 || text(bytes, start, 6) !== 'Exif\0\0') return undefined;
  const tiff = start + 6;
  const little = bytes[tiff] === 0x49 && bytes[tiff + 1] === 0x49;
  if ((!little && (bytes[tiff] !== 0x4d || bytes[tiff + 1] !== 0x4d)) || tiff + 8 > bytes.length) return undefined;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u16 = (offset: number) => view.getUint16(bytes.byteOffset + offset, little);
  const u32 = (offset: number) => view.getUint32(bytes.byteOffset + offset, little);
  if (u16(tiff + 2) !== 42) return undefined;
  const ifd0 = tiff + u32(tiff + 4);
  if (ifd0 + 2 > start + length) return undefined;
  const ifd0Count = u16(ifd0);
  let gpsOffset: number | undefined;
  for (let index = 0; index < ifd0Count; index += 1) {
    const entry = ifd0 + 2 + index * 12;
    if (entry + 12 > start + length) return undefined;
    if (u16(entry) === 0x8825 && u16(entry + 2) === 4 && u32(entry + 4) === 1) gpsOffset = tiff + u32(entry + 8);
  }
  if (gpsOffset === undefined || gpsOffset + 2 > start + length) return undefined;
  const gpsCount = u16(gpsOffset);
  let latitudeRef: string | undefined;
  let longitudeRef: string | undefined;
  let latitude: number[] | undefined;
  let longitude: number[] | undefined;
  const rationals = (entry: number): number[] | undefined => {
    if (u16(entry + 2) !== 5 || u32(entry + 4) !== 3) return undefined;
    const offset = tiff + u32(entry + 8);
    if (offset + 24 > start + length) return undefined;
    return [0, 1, 2].map((part) => {
      const numerator = u32(offset + part * 8);
      const denominator = u32(offset + part * 8 + 4);
      return denominator === 0 ? 0 : numerator / denominator;
    });
  };
  for (let index = 0; index < gpsCount; index += 1) {
    const entry = gpsOffset + 2 + index * 12;
    if (entry + 12 > start + length) return undefined;
    const tag = u16(entry);
    if (tag === 1 && u16(entry + 2) === 2) latitudeRef = text(bytes, entry + 8, 1);
    if (tag === 2) latitude = rationals(entry);
    if (tag === 3 && u16(entry + 2) === 2) longitudeRef = text(bytes, entry + 8, 1);
    if (tag === 4) longitude = rationals(entry);
  }
  if (!latitude || !longitude) return undefined;
  const degrees = (parts: number[]) => parts[0] + parts[1] / 60 + parts[2] / 3600;
  const latitudeValue = degrees(latitude) * (latitudeRef === 'S' ? -1 : 1);
  const longitudeValue = degrees(longitude) * (longitudeRef === 'W' ? -1 : 1);
  return { GPSLatitude: latitudeValue, GPSLongitude: longitudeValue, ...(latitudeRef ? { GPSLatitudeRef: latitudeRef } : {}), ...(longitudeRef ? { GPSLongitudeRef: longitudeRef } : {}) };
}

export function scanMetadata(bytes: Uint8Array): MetadataReport {
  const report: MetadataReport = { jpeg: { APP1: false, APP2: false, APP13: false }, png: { eXIf: false, iTXt: false, iCCP: false, tEXt: false }, webp: { EXIF: false, XMP: false, ICCP: false } };
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 3 < bytes.length && bytes[offset] === 0xff) {
      const marker = bytes[offset + 1];
      if (marker === 0xda || marker === 0xd9) break;
      const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
      if (marker === 0xe1) {
        report.jpeg.APP1 = true;
        const gps = exifGps(bytes, offset + 4, length - 2);
        if (gps) report.jpeg.gps = gps;
      }
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

register('inspectMetadata', (spec): Step<Bytes, Bytes> => ({
  name: 'inspectMetadata', in: 'bytes', out: 'bytes',
  async run(input, ctx) {
    const target = requireReportTarget(spec.opts, 'inspectMetadata');
    ctx.report[target].metadata = scanMetadata(new Uint8Array(await input.blob.arrayBuffer()));
    return input;
  },
}));
