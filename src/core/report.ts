import type { Report, ReportTarget } from './types';

export function createReport(): Report {
  return { input: {}, output: {}, comparison: {}, timings: {}, rasterBytes: {}, userAgent: '' };
}

export function requireReportTarget(opts: Record<string, unknown> | undefined, stepName: string): ReportTarget {
  if (opts?.target === 'input' || opts?.target === 'output') return opts.target;
  throw new Error(`${stepName} requires opts.target to be "input" or "output"`);
}

export function serializeJson(value: unknown, space?: number): string {
  const serialized = JSON.stringify(value, (_key, nested: unknown) => {
    if (typeof nested === 'number' && !Number.isFinite(nested)) return String(nested);
    return nested;
  }, space);
  if (serialized === undefined) throw new Error('Report value is not JSON-serializable');
  return serialized;
}
