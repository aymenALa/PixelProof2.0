import { register } from '../core/registry';
import type { Raster, Step } from '../core/types';
import { psnr, readRaster, reportMetricError } from './measurement-utils';

register('psnr', (spec): Step<Raster, Raster> => ({
  name: 'psnr', in: 'raster', out: 'raster',
  run(input, ctx) {
    if (!ctx.original) { reportMetricError(ctx, 'psnr', 'Original raster is unavailable'); return input; }
    try { ctx.report.psnr = psnr(ctx.original, readRaster(input), spec.opts?.perChannel === true); }
    catch (error) { reportMetricError(ctx, 'psnr', error instanceof Error ? error.message : 'PSNR failed'); }
    return input;
  },
}));
