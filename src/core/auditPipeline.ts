import type { StepSpec } from './types';

export interface AuditPipelineOptions {
  readonly transform: 'none' | 'grayscale' | { readonly resize: { readonly maxWidth: number } };
  readonly targetType: 'image/png' | 'image/jpeg' | 'image/webp';
  readonly quality?: number;
}

export function buildAuditPipeline(opts: AuditPipelineOptions): StepSpec[] {
  const encodeOpts: Record<string, unknown> = { type: opts.targetType };
  if (opts.quality !== undefined) encodeOpts.quality = opts.quality;

  const transformSteps: StepSpec[] = opts.transform === 'none'
    ? []
    : opts.transform === 'grayscale'
      ? [{ type: 'grayscale' }]
      : [{ type: 'resize', opts: { maxWidth: opts.transform.resize.maxWidth } }];

  return [
    { type: 'hash', opts: { target: 'input' } },
    { type: 'inspectMetadata', opts: { target: 'input' } },
    { type: 'decode' },
    ...transformSteps,
    { type: 'encode', opts: encodeOpts },
    { type: 'hash', opts: { target: 'output' } },
    { type: 'inspectMetadata', opts: { target: 'output' } },
    { type: 'decode' },
    { type: 'pixelDiff' },
    { type: 'psnr', opts: { mode: 'channel' } },
    { type: 'ssim', opts: { mode: 'channel' } },
    { type: 'dhash' },
    { type: 'phash' },
    { type: 'encode', opts: encodeOpts },
  ];
}
