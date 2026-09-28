import { register } from '../core/registry';
import type { Raster, Step } from '../core/types';
import { pixelDiff, readRaster, reportMetricError } from './measurement-utils';

register('pixelDiff', (): Step<Raster, Raster> => ({
  name: 'pixelDiff', in: 'raster', out: 'raster',
  run(input, ctx) {
    if (!ctx.original) { reportMetricError(ctx, 'pixelDiff', 'Original raster is unavailable'); return input; }
    try { ctx.report.comparison.pixelDiff = pixelDiff(ctx.original, readRaster(input)); }
    catch (error) { reportMetricError(ctx, 'pixelDiff', error instanceof Error ? error.message : 'pixelDiff failed'); }
    return input;
  },
}));
