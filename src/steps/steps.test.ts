import { describe, expect, it, vi } from 'vitest';
// @ts-expect-error Vitest executes this fixture read in Node; the app itself has no Node dependency.
import { readFileSync } from 'node:fs';
import { create, register } from '../core/registry';
import { createReport } from '../core/report';
import { runPipeline } from '../core/run';
import '../steps/index';

describe('step contracts', () => {
  it('rejects invalid image magic before decoding', async () => {
    const decode = create({ type: 'decode' });
    const imageBitmap = vi.fn();
    vi.stubGlobal('createImageBitmap', imageBitmap);
    await expect(decode.run({ kind: 'bytes', blob: new Blob(['not an image']) }, { signal: new AbortController().signal, report: createReport() })).rejects.toThrow(/JPEG, PNG, or WebP magic/);
    expect(imageBitmap).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('hashes identical bytes identically', async () => {
    const hash = create({ type: 'hash', opts: { target: 'input' } });
    const first = createReport();
    const second = createReport();
    const signal = new AbortController().signal;
    const input = { kind: 'bytes' as const, blob: new Blob(['same bytes']) };
    await hash.run(input, { signal, report: first });
    await hash.run({ kind: 'bytes', blob: new Blob(['same bytes']) }, { signal, report: second });
    expect(first.input.sha256).toBe(second.input.sha256);
  });

  it('requires an explicit input/output target for byte-reporting steps', async () => {
    const context = { signal: new AbortController().signal, report: createReport() };
    expect(() => create({ type: 'hash', opts: { label: 'input' } }).run({ kind: 'bytes', blob: new Blob(['x']) }, context)).toThrow(/opts.target/);
    await expect(Promise.resolve().then(() => create({ type: 'inspectMetadata' }).run({ kind: 'bytes', blob: new Blob(['x']) }, context))).rejects.toThrow(/opts.target/);
  });

  it('keeps a detached original snapshot through decode and grayscale', async () => {
    const fixture = new Uint8Array(readFileSync(new URL('../../tests/fixtures/rgb-2x2.png', import.meta.url)));
    const originalPixels = new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255]);
    class FakeCanvas {
      readonly width = 2;
      readonly height = 2;
      pixels = new Uint8ClampedArray(originalPixels);
      getContext() {
        return {
          getImageData: () => ({ width: this.width, height: this.height, data: new Uint8ClampedArray(this.pixels) }),
          putImageData: (image: { data: ArrayLike<number> }) => { this.pixels = new Uint8ClampedArray(image.data); },
          drawImage: (bitmap: { pixels: Uint8ClampedArray }) => { this.pixels = new Uint8ClampedArray(bitmap.pixels); },
          fillRect: () => undefined,
        };
      }
      convertToBlob() { return Promise.resolve(new Blob([fixture], { type: 'image/png' })); }
    }
    vi.stubGlobal('self', { navigator: { userAgent: 'fixture-test' } });
    vi.stubGlobal('OffscreenCanvas', FakeCanvas);
    vi.stubGlobal('createImageBitmap', vi.fn(async (blob: Blob) => {
      expect(blob.size).toBe(fixture.byteLength);
      return { width: 2, height: 2, pixels: new Uint8ClampedArray(originalPixels), close: vi.fn() };
    }));
    try {
      const context = { signal: new AbortController().signal, report: createReport() };
      await runPipeline(new Blob([fixture], { type: 'image/png' }), [
        { type: 'decode' }, { type: 'grayscale' }, { type: 'pixelDiff' }, { type: 'psnr', opts: { mode: 'channel' } }, { type: 'encode', opts: { type: 'image/png' } },
      ], context);
      const comparison = context.report.comparison;
      const pixel = comparison.pixelDiff as { changedPercent: number };
      const psnr = comparison.psnr as { channels: { r: number; b: number } };
      expect(pixel.changedPercent).toBeGreaterThan(0);
      expect(Number.isFinite(psnr.channels.r)).toBe(true);
      expect(Number.isFinite(psnr.channels.b)).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('registers duplicate types as errors', () => {
    register('temporary', () => ({ name: 'temporary', in: 'bytes', out: 'bytes', run: (input) => input }));
    expect(() => register('temporary', () => ({ name: 'temporary', in: 'bytes', out: 'bytes', run: (input) => input }))).toThrow(/Duplicate/);
  });
});
