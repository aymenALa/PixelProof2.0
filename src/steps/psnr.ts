import { register } from '../core/registry';
import type { Raster, Step } from '../core/types';
import { metricMode, psnr, readRaster, reportMetricError } from './measurement-utils';

register('psnr', (spec): Step<Raster, Raster> => ({
  name: 'psnr', in: 'raster', out: 'raster',
  run(input, ctx) {
    if (!ctx.original) { reportMetricError(ctx, 'psnr', 'Original raster is unavailable'); return input; }
    try { ctx.report.comparison.psnr = psnr(ctx.original, readRaster(input), metricMode(spec.opts)); }
    catch (error) { reportMetricError(ctx, 'psnr', error instanceof Error ? error.message : 'PSNR failed'); }
    return input;
  },
}));
