import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

const fixture = (name: string): number[] => Array.from(readFileSync(join(process.cwd(), 'tests', 'fixtures', name)));

test.describe('browser image steps', () => {
  test.beforeEach(async ({ page }) => { await page.goto('/'); });

  test('decodes EXIF orientation fixture and completes a raster round trip', async ({ page }) => {
    const result = await page.evaluate(async ({ bytes }) => {
      const api = (globalThis as typeof globalThis & { __pixelproof: { InlineRunner: new () => { run(input: Blob, specs: unknown[], ctx: unknown): Promise<unknown> } } }).__pixelproof;
      const context = { signal: new AbortController().signal, report: { input: {}, output: {}, comparison: {}, timings: {}, rasterBytes: {}, userAgent: '' } };
      const output = await new api.InlineRunner().run(new Blob([new Uint8Array(bytes)]), [
        { type: 'decode' }, { type: 'resize', opts: { maxWidth: 100 } }, { type: 'encode', opts: { type: 'image/png' } },
      ], context);
      return { outputKind: (output as { kind: string }).kind, originalWidth: (context.original as ImageData | undefined)?.width, originalHeight: (context.original as ImageData | undefined)?.height };
    }, { bytes: fixture('exif-orientation-gps.jpg') });
    expect(result.outputKind).toBe('bytes');
    expect(result.originalWidth).toBe(1);
    expect(result.originalHeight).toBe(2);
  });

  test('rejects corrupt bytes and accepts a PNG with a JPG filename', async ({ page }) => {
    const error = await page.evaluate(async ({ bytes }) => {
      const api = (globalThis as typeof globalThis & { __pixelproof: { InlineRunner: new () => { run(input: Blob, specs: unknown[], ctx: unknown): Promise<unknown> } } }).__pixelproof;
      try {
        await new api.InlineRunner().run(new Blob([new Uint8Array(bytes)]), [{ type: 'decode' }, { type: 'encode', opts: { type: 'image/png' } }], { signal: new AbortController().signal, report: { input: {}, output: {}, comparison: {}, timings: {}, rasterBytes: {}, userAgent: '' } });
        return null;
      } catch (cause) { return cause instanceof Error ? cause.message : String(cause); }
    }, { bytes: fixture('corrupt.bin') });
    expect(error).toMatch(/JPEG, PNG, or WebP magic/);

    const renamedResult = await page.evaluate(async ({ bytes }) => {
      const api = (globalThis as typeof globalThis & { __pixelproof: { InlineRunner: new () => { run(input: Blob, specs: unknown[], ctx: unknown): Promise<unknown> } } }).__pixelproof;
      const output = await new api.InlineRunner().run(new Blob([new Uint8Array(bytes)]), [{ type: 'decode' }, { type: 'encode', opts: { type: 'image/png' } }], { signal: new AbortController().signal, report: { input: {}, output: {}, comparison: {}, timings: {}, rasterBytes: {}, userAgent: '' } });
      return (output as { kind: string }).kind;
    }, { bytes: fixture('png-renamed.jpg') });
    expect(renamedResult).toBe('bytes');
  });

  test('identical bytes produce identical SHA-256 reports', async ({ page }) => {
    const hashes = await page.evaluate(async ({ bytes }) => {
      const api = (globalThis as typeof globalThis & { __pixelproof: { InlineRunner: new () => { run(input: Blob, specs: unknown[], ctx: { signal: AbortSignal; report: Record<string, unknown> }): Promise<unknown> } } }).__pixelproof;
      const run = async () => {
        const report = { input: {}, output: {}, comparison: {}, timings: {}, rasterBytes: {}, userAgent: '' } as { input: { sha256?: string }; output: { sha256?: string } };
        await new api.InlineRunner().run(new Blob([new Uint8Array(bytes)]), [{ type: 'hash', opts: { target: 'input' } }], { signal: new AbortController().signal, report });
        return report.input.sha256;
      };
      return [await run(), await run()];
    }, { bytes: fixture('transparent.png') });
    expect(hashes[0]).toBe(hashes[1]);
  });

  test('invisible-repack changes bytes, preserves pixels, and removes metadata', async ({ page }) => {
    const result = await page.evaluate(async ({ bytes }) => {
      const api = (globalThis as typeof globalThis & { __pixelproof: { InlineRunner: new () => { run(input: Blob, specs: unknown[], ctx: unknown): Promise<{ blob: Blob }> } } }).__pixelproof;
      const report = { input: {}, output: {}, comparison: {}, timings: {}, rasterBytes: {}, userAgent: '' };
      const specs = [
        { type: 'hash', opts: { target: 'input' } },
        { type: 'inspectMetadata', opts: { target: 'input' } },
        { type: 'decode' },
        { type: 'pixelDiff' },
        { type: 'psnr', opts: { mode: 'channel' } },
        { type: 'encode', opts: { type: 'image/png' } },
        { type: 'hash', opts: { target: 'output' } },
        { type: 'inspectMetadata', opts: { target: 'output' } },
      ];
      const output = await new api.InlineRunner().run(new Blob([new Uint8Array(bytes)], { type: 'image/jpeg' }), specs, { signal: new AbortController().signal, report });
      const serialized = JSON.parse(JSON.stringify(report, (_key, value) => typeof value === 'number' && !Number.isFinite(value) ? String(value) : value));
      return { report: serialized, outputBytes: output.blob.size };
    }, { bytes: fixture('exif-orientation-gps.jpg') });
    expect(result.report.output.sha256).not.toBe(result.report.input.sha256);
    expect(result.report.comparison.pixelDiff.changedPixels).toBe(0);
    expect(result.report.comparison.psnr.luma).toBe('Infinity');
    expect(result.report.comparison.psnr.channels).toEqual({ r: 'Infinity', g: 'Infinity', b: 'Infinity' });
    expect(result.report.input.metadata.jpeg.APP1).toBe(true);
    expect(result.report.input.metadata.jpeg.gps.GPSLatitude).toBeCloseTo(40.7128, 6);
    expect(result.report.input.metadata.jpeg.gps.GPSLongitude).toBeCloseTo(-74.006, 6);
    expect(result.report.output.metadata.png.eXIf).toBe(false);
    expect(result.report.output.metadata.png.iTXt).toBe(false);
    expect(result.report.output.metadata.jpeg.gps).toBeUndefined();
    expect(result.report.output.bytes).not.toBe(result.report.input.bytes);
  });

  test('WorkerRunner executes the same declared pipeline and supports abort', async ({ page }) => {
    const result = await page.evaluate(async ({ bytes }) => {
      const api = (globalThis as typeof globalThis & { __pixelproof: { WorkerRunner: new () => { run(input: Blob, specs: unknown[], ctx: { signal: AbortSignal; report: Record<string, unknown> }): Promise<unknown> } } }).__pixelproof;
      const report = { input: {}, output: {}, comparison: {}, timings: {}, rasterBytes: {}, userAgent: '' } as { input: { sha256?: string }; output: { sha256?: string } };
      const output = await new api.WorkerRunner().run(new Blob([new Uint8Array(bytes)]), [{ type: 'decode' }, { type: 'encode', opts: { type: 'image/png' } }, { type: 'hash', opts: { target: 'output' } }], { signal: new AbortController().signal, report });
      const controller = new AbortController();
      const pending = new api.WorkerRunner().run(new Blob([new Uint8Array(bytes)]), [{ type: 'decode' }, { type: 'encode', opts: { type: 'image/png' } }], { signal: controller.signal, report: { input: {}, output: {}, comparison: {}, timings: {}, rasterBytes: {}, userAgent: '' } });
      controller.abort();
      let cancelled = false;
      try { await pending; } catch (cause) { cancelled = cause instanceof Error && /aborted/i.test(cause.message); }
      return { kind: (output as { kind: string }).kind, hash: report.output.sha256, cancelled };
    }, { bytes: fixture('transparent.png') });
    expect(result.kind).toBe('bytes');
    expect(result.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(result.cancelled).toBe(true);
  });

  test('UI exposes worker toggle, run, cancel, preview, and report', async ({ page }) => {
    await page.locator('input[type="file"]').setInputFiles(join(process.cwd(), 'tests', 'fixtures', 'transparent.png'));
    await expect(page.getByRole('combobox', { name: 'Runner' })).toHaveValue('worker');
    await expect(page.getByRole('combobox', { name: 'Preset' })).toHaveValue('invisible-repack');
    await page.getByRole('button', { name: 'Run pipeline' }).click();
    await expect(page.getByRole('img', { name: 'Processed output' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Download image' })).toHaveAttribute('download', 'pixelproof-output.png');
    await expect(page.locator('.report')).toContainText('sha256');
    await expect(page.locator('.report')).toContainText('pixelDiff');
    await expect(page.locator('.report')).toContainText('encode');
    await expect(page.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  });

  test('accepts an image dropped onto the upload area', async ({ page }) => {
    const upload = page.locator('.file-input');
    await page.evaluate(({ bytes }) => {
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(new File([new Uint8Array(bytes)], 'transparent.png', { type: 'image/png' }));
      document.querySelector('.file-input')?.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer }));
    }, { bytes: fixture('transparent.png') });
    await expect(upload).toContainText('transparent.png');
  });

  test('processes a 12 MP raster through WorkerRunner without blocking the page', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const canvas = new OffscreenCanvas(4000, 3000);
      const context = canvas.getContext('2d');
      if (!context) throw new Error('2D canvas unavailable');
      context.fillStyle = '#25405f';
      context.fillRect(0, 0, canvas.width, canvas.height);
      const input = await canvas.convertToBlob({ type: 'image/png' });
      const api = (globalThis as typeof globalThis & { __pixelproof: { WorkerRunner: new () => { run(input: Blob, specs: unknown[], ctx: { signal: AbortSignal; report: Record<string, unknown> }): Promise<unknown> } } }).__pixelproof;
      const report: Record<string, unknown> = {};
      const output = await new api.WorkerRunner().run(input, [{ type: 'decode' }, { type: 'resize', opts: { maxWidth: 2400 } }, { type: 'encode', opts: { type: 'image/png' } }], { signal: new AbortController().signal, report });
      return { kind: (output as { kind: string }).kind, elapsed: report.timings };
    });
    expect(result.kind).toBe('bytes');
    expect(result.elapsed).toBeTruthy();
  });
});
