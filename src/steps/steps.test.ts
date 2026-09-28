import { describe, expect, it, vi } from 'vitest';
import { create, register } from '../core/registry';
import '../steps/index';

describe('step contracts', () => {
  it('rejects invalid image magic before decoding', async () => {
    const decode = create({ type: 'decode' });
    const imageBitmap = vi.fn();
    vi.stubGlobal('createImageBitmap', imageBitmap);
    await expect(decode.run({ kind: 'bytes', blob: new Blob(['not an image']) }, { signal: new AbortController().signal, report: {} })).rejects.toThrow(/JPEG, PNG, or WebP magic/);
    expect(imageBitmap).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('hashes identical bytes identically', async () => {
    const hash = create({ type: 'hash', opts: { label: 'input' } });
    const first: Record<string, unknown> = {};
    const second: Record<string, unknown> = {};
    const signal = new AbortController().signal;
    const input = { kind: 'bytes' as const, blob: new Blob(['same bytes']) };
    await hash.run(input, { signal, report: first });
    await hash.run({ kind: 'bytes', blob: new Blob(['same bytes']) }, { signal, report: second });
    expect(first['sha256:input']).toBe(second['sha256:input']);
  });

  it('registers duplicate types as errors', () => {
    register('temporary', () => ({ name: 'temporary', in: 'bytes', out: 'bytes', run: (input) => input }));
    expect(() => register('temporary', () => ({ name: 'temporary', in: 'bytes', out: 'bytes', run: (input) => input }))).toThrow(/Duplicate/);
  });
});
