import { register } from '../core/registry';
import type { Raster } from '../core/types';

function run(input: Raster, maxWidth: unknown): Raster {
    if (typeof maxWidth !== 'number' || !Number.isFinite(maxWidth) || maxWidth <= 0) throw new Error('resize requires a positive numeric maxWidth');
    if (input.canvas.width <= maxWidth) return input;
    const scale = maxWidth / input.canvas.width;
    const canvas = new OffscreenCanvas(Math.max(1, Math.round(input.canvas.width * scale)), Math.max(1, Math.round(input.canvas.height * scale)));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('2D canvas context is unavailable');
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(input.canvas, 0, 0, canvas.width, canvas.height);
    return { kind: 'raster', canvas };
}

register('resize', (spec) => ({
  name: 'resize', in: 'raster', out: 'raster',
  run: (input) => run(input as Raster, spec.opts?.maxWidth),
}));
