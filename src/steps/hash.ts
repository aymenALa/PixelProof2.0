import { register } from '../core/registry';
import type { Bytes } from '../core/types';

function hex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function run(input: Bytes, labelOption: unknown, report: Record<string, unknown>): Promise<Bytes> {
    const label = typeof labelOption === 'string' && labelOption.length > 0 ? labelOption : 'output';
    report[`sha256:${label}`] = hex(await crypto.subtle.digest('SHA-256', await input.blob.arrayBuffer()));
    return input;
}

register('hash', (spec) => ({
  name: 'hash', in: 'bytes', out: 'bytes',
  run: (input, ctx) => run(input as Bytes, spec.opts?.label, ctx.report),
}));
