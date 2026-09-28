import { beforeEach, describe, expect, it, vi } from 'vitest';
import { create, clearRegistryForTests, register } from './registry';
import { createReport } from './report';
import { runPipeline } from './run';
import type { Ctx, Payload, Raster, Step } from './types';

const passthrough = (name: string, input: Step['in'], output: Step['out'], run: Step['run']): Step => ({ name, in: input, out: output, run });
const ctx = (): Ctx => ({ signal: new AbortController().signal, report: createReport() });
const fakeCanvas = (width: number, height: number): OffscreenCanvas => ({
  width,
  height,
  getContext: () => ({ getImageData: () => ({ width, height }) as ImageData }),
} as unknown as OffscreenCanvas);

beforeEach(() => {
  clearRegistryForTests();
  vi.stubGlobal('self', { navigator: { userAgent: 'fake-agent' } });
});

describe('core pipeline runner', () => {
  it('validates wiring before running any step', async () => {
    const run = vi.fn(async (input: Payload) => input);
    register('bad', () => passthrough('bad', 'raster', 'bytes', run));
    await expect(runPipeline(new Blob(['x']), [{ type: 'bad' }], ctx())).rejects.toThrow(/Invalid wiring/);
    expect(run).not.toHaveBeenCalled();
  });

  it('throws for unknown steps', async () => {
    await expect(runPipeline(new Blob(['x']), [{ type: 'missing' }], ctx())).rejects.toThrow(/Unknown step/);
  });

  it('stops when aborted between steps', async () => {
    const controller = new AbortController();
    register('first', () => passthrough('first', 'bytes', 'bytes', async (input) => { controller.abort(); return input; }));
    register('second', () => passthrough('second', 'bytes', 'bytes', vi.fn(async (input) => input)));
    await expect(runPipeline(new Blob(['x']), [{ type: 'first' }, { type: 'second' }], { signal: controller.signal, report: createReport() })).rejects.toThrow(/aborted/);
  });

  it('records timings, raster memory, original pixels, and user agent', async () => {
    const canvas = fakeCanvas(3, 2);
    register('raster', () => passthrough('raster', 'bytes', 'raster', async () => ({ kind: 'raster', canvas } as Raster)));
    register('bytes', () => passthrough('bytes', 'raster', 'bytes', async () => ({ kind: 'bytes', blob: new Blob(['done']) })));
    const report = createReport();
    const pipelineContext = { signal: new AbortController().signal, report };
    const result = await runPipeline(new Blob(['x']), [{ type: 'raster' }, { type: 'bytes' }], pipelineContext);
    expect(result.kind).toBe('bytes');
    expect(report.userAgent).toBe('fake-agent');
    expect(report.timings).toMatchObject({ raster: expect.any(Number), bytes: expect.any(Number) });
    expect(report.rasterBytes).toEqual({ raster: 24 });
    expect(pipelineContext).toHaveProperty('original');
  });

  it('requires the pipeline to end in bytes', async () => {
    register('raster', () => passthrough('raster', 'bytes', 'raster', async () => ({ kind: 'raster', canvas: fakeCanvas(1, 1) })));
    await expect(runPipeline(new Blob(['x']), [{ type: 'raster' }], ctx())).rejects.toThrow(/end in bytes/);
  });

  it('passes options through registry factories', () => {
    const factory = vi.fn(() => passthrough('configured', 'bytes', 'bytes', async (input) => input));
    register('configured', factory);
    create({ type: 'configured', opts: { quality: 0.8 } });
    expect(factory).toHaveBeenCalledWith({ type: 'configured', opts: { quality: 0.8 } });
  });
});
