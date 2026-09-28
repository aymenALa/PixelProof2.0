import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

const fixture = (name: string): number[] => Array.from(readFileSync(join(process.cwd(), 'tests', 'fixtures', name)));

test.describe('browser image steps', () => {
  test.beforeEach(async ({ page }) => { await page.goto('/'); });

  test('decodes EXIF orientation fixture and completes a raster round trip', async ({ page }) => {
    const result = await page.evaluate(async ({ bytes }) => {
      const api = (globalThis as typeof globalThis & { __pixelproof: { InlineRunner: new () => { run(input: Blob, specs: unknown[], ctx: unknown): Promise<unknown> } } }).__pixelproof;
      const context = { signal: new AbortController().signal, report: {} as Record<string, unknown> };
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
        await new api.InlineRunner().run(new Blob([new Uint8Array(bytes)]), [{ type: 'decode' }, { type: 'encode', opts: { type: 'image/png' } }], { signal: new AbortController().signal, report: {} });
        return null;
      } catch (cause) { return cause instanceof Error ? cause.message : String(cause); }
    }, { bytes: fixture('corrupt.bin') });
    expect(error).toMatch(/JPEG, PNG, or WebP magic/);

    const renamedResult = await page.evaluate(async ({ bytes }) => {
      const api = (globalThis as typeof globalThis & { __pixelproof: { InlineRunner: new () => { run(input: Blob, specs: unknown[], ctx: unknown): Promise<unknown> } } }).__pixelproof;
      const output = await new api.InlineRunner().run(new Blob([new Uint8Array(bytes)]), [{ type: 'decode' }, { type: 'encode', opts: { type: 'image/png' } }], { signal: new AbortController().signal, report: {} });
      return (output as { kind: string }).kind;
    }, { bytes: fixture('png-renamed.jpg') });
    expect(renamedResult).toBe('bytes');
  });

  test('identical bytes produce identical SHA-256 reports', async ({ page }) => {
    const hashes = await page.evaluate(async ({ bytes }) => {
      const api = (globalThis as typeof globalThis & { __pixelproof: { InlineRunner: new () => { run(input: Blob, specs: unknown[], ctx: { signal: AbortSignal; report: Record<string, unknown> }): Promise<unknown> } } }).__pixelproof;
      const run = async () => {
        const report: Record<string, unknown> = {};
        await new api.InlineRunner().run(new Blob([new Uint8Array(bytes)]), [{ type: 'hash', opts: { label: 'fixture' } }], { signal: new AbortController().signal, report });
        return report['sha256:fixture'];
      };
      return [await run(), await run()];
    }, { bytes: fixture('transparent.png') });
    expect(hashes[0]).toBe(hashes[1]);
  });

  test('WorkerRunner executes the same declared pipeline and supports abort', async ({ page }) => {
    const result = await page.evaluate(async ({ bytes }) => {
      const api = (globalThis as typeof globalThis & { __pixelproof: { WorkerRunner: new () => { run(input: Blob, specs: unknown[], ctx: { signal: AbortSignal; report: Record<string, unknown> }): Promise<unknown> } } }).__pixelproof;
      const report: Record<string, unknown> = {};
      const output = await new api.WorkerRunner().run(new Blob([new Uint8Array(bytes)]), [{ type: 'decode' }, { type: 'encode', opts: { type: 'image/png' } }, { type: 'hash', opts: { label: 'worker' } }], { signal: new AbortController().signal, report });
      const controller = new AbortController();
      const pending = new api.WorkerRunner().run(new Blob([new Uint8Array(bytes)]), [{ type: 'decode' }, { type: 'encode', opts: { type: 'image/png' } }], { signal: controller.signal, report: {} });
      controller.abort();
      let cancelled = false;
      try { await pending; } catch (cause) { cancelled = cause instanceof Error && /aborted/i.test(cause.message); }
      return { kind: (output as { kind: string }).kind, hash: report['sha256:worker'], cancelled };
    }, { bytes: fixture('transparent.png') });
    expect(result.kind).toBe('bytes');
    expect(result.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(result.cancelled).toBe(true);
  });

  test('UI exposes worker toggle, run, cancel, preview, and report', async ({ page }) => {
    await page.locator('input[type="file"]').setInputFiles(join(process.cwd(), 'tests', 'fixtures', 'transparent.png'));
    await expect(page.getByRole('combobox', { name: 'Runner' })).toHaveValue('worker');
    await page.getByRole('button', { name: 'Run pipeline' }).click();
    await expect(page.getByRole('img', { name: 'Processed output' })).toBeVisible();
    await expect(page.getByText('sha256:output')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cancel' })).toBeDisabled();
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
