import { register } from '../core/registry';
import type { Raster, Step } from '../core/types';
import { hamming, phash, readRaster, reportMetricError } from './measurement-utils';

register('phash', (): Step<Raster, Raster> => ({
  name: 'phash', in: 'raster', out: 'raster',
  run(input, ctx) {
    if (!ctx.original) { reportMetricError(ctx, 'phash', 'Original raster is unavailable'); return input; }
    try { const original = phash(ctx.original); const current = phash(readRaster(input)); ctx.report.phash = { original, current, distance: hamming(original, current) }; }
    catch (error) { reportMetricError(ctx, 'phash', error instanceof Error ? error.message : 'pHash failed'); }
    return input;
  },
}));
