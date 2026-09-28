import { register } from '../core/registry';
import type { Raster, Step } from '../core/types';
import { dhash, hamming, readRaster, reportMetricError } from './measurement-utils';

register('dhash', (): Step<Raster, Raster> => ({
  name: 'dhash', in: 'raster', out: 'raster',
  run(input, ctx) {
    if (!ctx.original) { reportMetricError(ctx, 'dhash', 'Original raster is unavailable'); return input; }
    try { const original = dhash(ctx.original); const current = dhash(readRaster(input)); ctx.report.dhash = { original, current, distance: hamming(original, current) }; }
    catch (error) { reportMetricError(ctx, 'dhash', error instanceof Error ? error.message : 'dHash failed'); }
    return input;
  },
}));
