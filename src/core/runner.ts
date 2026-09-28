import { runPipeline } from './run';
import type { Bytes, Ctx, StepSpec } from './types';

export interface Runner { run(input: Blob, specs: readonly StepSpec[], ctx: Ctx): Promise<Bytes>; }
export class InlineRunner implements Runner {
  run(input: Blob, specs: readonly StepSpec[], ctx: Ctx): Promise<Bytes> { return runPipeline(input, specs, ctx); }
}
