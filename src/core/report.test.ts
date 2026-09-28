import { describe, expect, it } from 'vitest';
import { serializeJson } from './report';

describe('report serialization', () => {
  it('preserves infinite PSNR as a JSON string', () => {
    const report = JSON.parse(serializeJson({ psnr: { luma: Infinity } })) as { psnr: { luma: unknown } };
    expect(report.psnr.luma).toBe('Infinity');
    expect(report.psnr.luma).not.toBeNull();
  });
});
