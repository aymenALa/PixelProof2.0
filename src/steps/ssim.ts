import { register } from '../core/registry';
import type { Raster, Step } from '../core/types';
import { readRaster, reportMetricError, ssim } from './measurement-utils';

register('ssim', (spec): Step<Raster, Raster> => ({
  name: 'ssim', in: 'raster', out: 'raster',
  run(input, ctx) {
    if (!ctx.original) { reportMetricError(ctx, 'ssim', 'Original raster is unavailable'); return input; }
    try { ctx.report.ssim = ssim(ctx.original, readRaster(input), spec.opts?.perChannel === true); }
    catch (error) { reportMetricError(ctx, 'ssim', error instanceof Error ? error.message : 'SSIM failed'); }
    return input;
  },
}));
