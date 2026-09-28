import { register } from '../core/registry';
import type { Raster, Step } from '../core/types';

function isMagic(bytes: Uint8Array, values: readonly number[]): boolean {
  return values.every((value, index) => bytes[index] === value);
}

async function validateImageMagic(blob: Blob): Promise<void> {
  const bytes = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
  const jpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const png = bytes.length >= 8 && isMagic(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const webp = bytes.length >= 12 && isMagic(bytes, [0x52, 0x49, 0x46, 0x46]) && isMagic(bytes.slice(8), [0x57, 0x45, 0x42, 0x50]);
  if (!jpeg && !png && !webp) throw new Error('Unsupported image: expected JPEG, PNG, or WebP magic bytes');
}

const step: Step<{ kind: 'bytes'; blob: Blob }, Raster> = {
  name: 'decode', in: 'bytes', out: 'raster',
  async run(input) {
    await validateImageMagic(input.blob);
    const bitmap = await createImageBitmap(input.blob);
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext('2d');
    if (!context) { bitmap.close(); throw new Error('2D canvas context is unavailable'); }
    context.drawImage(bitmap, 0, 0);
    bitmap.close();
    return { kind: 'raster', canvas };
  },
};

register('decode', () => step);
