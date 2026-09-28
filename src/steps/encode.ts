import { register } from '../core/registry';
import type { Raster, Report } from '../core/types';

type Color = { r: number; g: number; b: number };

function parseBackground(value: unknown): Color {
  if (typeof value !== 'string' || !/^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(value)) throw new Error('JPEG background must be a #RGB or #RRGGBB color');
  const hex = value.slice(1);
  const expanded = hex.length === 3 ? hex.split('').map((part) => part + part).join('') : hex;
  return { r: Number.parseInt(expanded.slice(0, 2), 16), g: Number.parseInt(expanded.slice(2, 4), 16), b: Number.parseInt(expanded.slice(4, 6), 16) };
}

async function run(input: Raster, opts: { type?: unknown; quality?: unknown; background?: unknown }, report: Report): Promise<{ kind: 'bytes'; blob: Blob }> {
    const requested = typeof opts.type === 'string' ? opts.type : 'image/png';
    const isJpeg = requested.toLowerCase() === 'image/jpeg' || requested.toLowerCase() === 'image/jpg';
    let canvas = input.canvas;
    if (isJpeg) {
      const background = parseBackground(opts.background ?? '#ffffff');
      const flattened = new OffscreenCanvas(canvas.width, canvas.height);
      const context = flattened.getContext('2d');
      if (!context) throw new Error('2D canvas context is unavailable');
      context.fillStyle = `rgb(${background.r} ${background.g} ${background.b})`;
      context.fillRect(0, 0, flattened.width, flattened.height);
      context.drawImage(canvas, 0, 0);
      canvas = flattened;
    }
    const quality = typeof opts.quality === 'number' ? opts.quality : undefined;
    const blob = await canvas.convertToBlob(quality === undefined ? { type: requested } : { type: requested, quality });
    report.output.encode = { requested, actual: blob.type, width: canvas.width, height: canvas.height };
    if (blob.type !== requested) report.output.encodeFallback = { requested, actual: blob.type };
    return { kind: 'bytes', blob };
}

register('encode', (spec) => ({
  name: 'encode', in: 'raster', out: 'bytes',
  run: (input, ctx) => run(input as Raster, spec.opts ?? {}, ctx.report),
}));
