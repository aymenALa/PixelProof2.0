import { describe, expect, it } from 'vitest';
// @ts-expect-error Vitest executes this fixture read in Node; the app itself has no Node dependency.
import { readFileSync } from 'node:fs';
import { dhash, hamming, phash, pixelDiff, psnr, psnrValues, ssim, ssimValues, type ImageDataLike } from './measurement-utils';
import { scanMetadata } from './inspectMetadata';

const image = (data: number[], width = data.length / 4, height = 1): ImageDataLike => ({ data, width, height });

describe('measurement helpers', () => {
  it('reports identical images exactly', () => {
    const original = image([10, 20, 30, 255, 40, 50, 60, 255], 2);
    expect(pixelDiff(original, original)).toEqual({ maxAbsDiff: 0, changedPixels: 0, changedPercent: 0 });
    expect(psnr(original, original).luma).toBe(Infinity);
    expect(psnr(original, original, 'channel').channels).toEqual({ r: Infinity, g: Infinity, b: Infinity });
    expect(ssim(original, original).luma).toBe(1);
    expect(ssim(original, original, 'channel').channels).toEqual({ r: 1, g: 1, b: 1 });
    expect(dhash(original)).toBe(dhash(original));
    expect(phash(original)).toBe(phash(original));
  });

  it('reports a fully inverted constant image with hand-checked values', () => {
    const black = image([0, 0, 0, 255, 0, 0, 0, 255], 2);
    const white = image([255, 255, 255, 255, 255, 255, 255, 255], 2);
    expect(psnr(black, white).luma).toBeCloseTo(0, 12);
    expect(ssimValues([0, 0], [255, 255])).toBeCloseTo(0.000099990001, 12);
  });

  it('counts one changed pixel and computes its PSNR', () => {
    const original = image([0, 0, 0, 255, 0, 0, 0, 255], 2);
    const changed = image([1, 0, 0, 255, 0, 0, 0, 255], 2);
    expect(pixelDiff(original, changed)).toEqual({ maxAbsDiff: 1, changedPixels: 1, changedPercent: 50 });
    expect(psnrValues([0, 0], [0.2126, 0])).toBeCloseTo(10 * Math.log10((255 ** 2) / (0.2126 ** 2 / 2)), 12);
  });

  it('channel mode detects RGB changes that luma mode can hide after grayscale', () => {
    const color = image([255, 0, 0, 255, 0, 0, 255, 255], 2);
    const grayscale = image([54, 54, 54, 255, 18, 18, 18, 255], 2);
    const channelPsnr = psnr(color, grayscale, 'channel');
    const channelSsim = ssim(color, grayscale, 'channel');
    expect(Number.isFinite(channelPsnr.channels?.r)).toBe(true);
    expect(Number.isFinite(channelPsnr.channels?.b)).toBe(true);
    expect(channelSsim.channels?.r).toBeLessThan(1);
    expect(channelSsim.channels?.b).toBeLessThan(1);
  });

  it('rejects pixel comparisons with unequal dimensions', () => {
    expect(() => pixelDiff(image([0, 0, 0, 255], 1), image([0, 0, 0, 255, 0, 0, 0, 255], 2))).toThrow(/equal image dimensions/);
    expect(() => psnr(image([0, 0, 0, 255], 1), image([0, 0, 0, 255, 0, 0, 0, 255], 2))).toThrow(/equal image dimensions/);
    expect(() => ssim(image([0, 0, 0, 255], 1), image([0, 0, 0, 255, 0, 0, 0, 255], 2))).toThrow(/equal image dimensions/);
  });

  it('handles hamming edge cases', () => {
    expect(hamming('0000000000000000', '0000000000000000')).toBe(0);
    expect(hamming('0000000000000000', '0000000000000001')).toBe(1);
    expect(hamming('0000000000000000', 'ffffffffffffffff')).toBe(64);
  });

  it('detects JPEG, PNG, and WebP metadata containers', () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0, 4, 0, 0, 0xff, 0xed, 0, 4, 0, 0]);
    expect(scanMetadata(jpeg).jpeg).toEqual({ APP1: true, APP2: false, APP13: true });
    const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0, 0x69, 0x54, 0x58, 0x74, 0, 0, 0, 0]);
    expect(scanMetadata(png).png.iTXt).toBe(true);
    const webp = new Uint8Array([82, 73, 70, 70, 0, 0, 0, 0, 87, 69, 66, 80, 69, 88, 73, 70, 0, 0, 0, 0]);
    expect(scanMetadata(webp).webp.EXIF).toBe(true);
  });

  it('detects APP1 metadata in the real EXIF/GPS JPEG fixture', () => {
    const fixture = new Uint8Array(readFileSync(new URL('../../tests/fixtures/exif-orientation-gps.jpg', import.meta.url)));
    const metadata = scanMetadata(fixture).jpeg;
    expect(metadata.APP1).toBe(true);
    expect(metadata.gps?.GPSLatitude).toBeCloseTo(40.7128, 6);
    expect(metadata.gps?.GPSLongitude).toBeCloseTo(-74.006, 6);
  });
});
