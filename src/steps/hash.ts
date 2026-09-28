import { register } from '../core/registry';
import { requireReportTarget } from '../core/report';
import type { Bytes } from '../core/types';

function hex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function run(input: Bytes, target: 'input' | 'output', report: { input: { sha256?: string }; output: { sha256?: string } }): Promise<Bytes> {
    const digest = hex(await crypto.subtle.digest('SHA-256', await input.blob.arrayBuffer()));
    report[target].sha256 = digest;
    return input;
}

register('hash', (spec) => ({
  name: 'hash', in: 'bytes', out: 'bytes',
  run: (input, ctx) => run(input as Bytes, requireReportTarget(spec.opts, 'hash'), ctx.report),
}));
