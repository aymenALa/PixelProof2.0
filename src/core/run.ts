import { create } from './registry';
import type { Bytes, Ctx, Payload, Raster, Stage, Step, StepSpec } from './types';

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw new Error('Pipeline aborted');
}
function rasterBytes(payload: Raster): number { return payload.canvas.width * payload.canvas.height * 4; }
function captureOriginal(payload: Raster, ctx: Ctx): void {
  if (ctx.original) return;
  const context = payload.canvas.getContext('2d');
  if (!context) throw new Error('2D canvas context is unavailable');
  ctx.original = context.getImageData(0, 0, payload.canvas.width, payload.canvas.height);
}

export async function runPipeline(input: Blob, specs: readonly StepSpec[], ctx: Ctx): Promise<Bytes> {
  const steps: readonly Step[] = specs.map(create);
  let stage: Stage = 'bytes';
  for (const [index, step] of steps.entries()) {
    if (step.in !== stage) throw new Error(`Invalid wiring at step ${index} (${step.name}): expected ${stage}, received ${step.in}`);
    stage = step.out;
  }
  if (stage !== 'bytes') throw new Error(`Pipeline must end in bytes, received ${stage}`);

  const timings = (ctx.report.timings ??= {}) as Record<string, number>;
  const memory = (ctx.report.rasterBytes ??= {}) as Record<string, number>;
  ctx.report.userAgent = self.navigator.userAgent;
  let payload: Payload = { kind: 'bytes', blob: input };
  for (const [index, step] of steps.entries()) {
    if (index > 0) throwIfAborted(ctx.signal);
    const started = performance.now();
    payload = await step.run(payload, ctx);
    timings[step.name] = performance.now() - started;
    if (payload.kind === 'raster') {
      if (!ctx.original) captureOriginal(payload, ctx);
      memory[step.name] = rasterBytes(payload);
    }
  }
  if (payload.kind !== 'bytes') throw new Error('Pipeline must end in bytes');
  return payload;
}
