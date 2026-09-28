import type { Ctx, Raster } from '../core/types';

export interface ImageDataLike { readonly width: number; readonly height: number; readonly data: ArrayLike<number>; }
export interface PixelDiffResult { readonly maxAbsDiff: number; readonly changedPixels: number; readonly changedPercent: number; }

export function readRaster(raster: Raster): ImageDataLike {
  const context = raster.canvas.getContext('2d');
  if (!context) throw new Error('2D canvas context is unavailable');
  return context.getImageData(0, 0, raster.canvas.width, raster.canvas.height);
}

export function reportMetricError(ctx: Ctx, metric: string, message: string): void {
  const errors = (ctx.report.errors ??= {}) as Record<string, string>;
  errors[metric] = message;
}

export function pixelDiff(original: ImageDataLike, current: ImageDataLike): PixelDiffResult {
  if (original.width !== current.width || original.height !== current.height) throw new Error('pixelDiff requires equal image dimensions');
  let maxAbsDiff = 0;
  let changedPixels = 0;
  for (let pixel = 0; pixel < original.width * original.height; pixel += 1) {
    let changed = false;
    for (let channel = 0; channel < 4; channel += 1) {
      const difference = Math.abs(original.data[pixel * 4 + channel] - current.data[pixel * 4 + channel]);
      maxAbsDiff = Math.max(maxAbsDiff, difference);
      changed ||= difference !== 0;
    }
    if (changed) changedPixels += 1;
  }
  return { maxAbsDiff, changedPixels, changedPercent: (changedPixels / (original.width * original.height)) * 100 };
}

export function luma(data: ArrayLike<number>, pixel: number): number {
  return 0.2126 * data[pixel * 4] + 0.7152 * data[pixel * 4 + 1] + 0.0722 * data[pixel * 4 + 2];
}

function channelValues(image: ImageDataLike, channel: number | 'luma'): number[] {
  const values: number[] = [];
  for (let pixel = 0; pixel < image.width * image.height; pixel += 1) values.push(channel === 'luma' ? luma(image.data, pixel) : image.data[pixel * 4 + channel]);
  return values;
}

function mean(values: readonly number[]): number { return values.reduce((sum, value) => sum + value, 0) / values.length; }
function mse(left: readonly number[], right: readonly number[]): number { return left.reduce((sum, value, index) => sum + (value - right[index]) ** 2, 0) / left.length; }

export function psnrValues(left: readonly number[], right: readonly number[]): number {
  const error = mse(left, right);
  return error === 0 ? Infinity : 10 * Math.log10((255 ** 2) / error);
}

export function psnr(original: ImageDataLike, current: ImageDataLike, perChannel = false): { luma: number; channels?: { r: number; g: number; b: number } } {
  if (original.width !== current.width || original.height !== current.height) throw new Error('psnr requires equal image dimensions');
  const result: { luma: number; channels?: { r: number; g: number; b: number } } = { luma: psnrValues(channelValues(original, 'luma'), channelValues(current, 'luma')) };
  if (perChannel) result.channels = { r: psnrValues(channelValues(original, 0), channelValues(current, 0)), g: psnrValues(channelValues(original, 1), channelValues(current, 1)), b: psnrValues(channelValues(original, 2), channelValues(current, 2)) };
  return result;
}

export function ssimValues(left: readonly number[], right: readonly number[]): number {
  const leftMean = mean(left); const rightMean = mean(right);
  const leftVariance = left.reduce((sum, value) => sum + (value - leftMean) ** 2, 0) / left.length;
  const rightVariance = right.reduce((sum, value) => sum + (value - rightMean) ** 2, 0) / right.length;
  const covariance = left.reduce((sum, value, index) => sum + (value - leftMean) * (right[index] - rightMean), 0) / left.length;
  const c1 = (0.01 * 255) ** 2; const c2 = (0.03 * 255) ** 2;
  return ((2 * leftMean * rightMean + c1) * (2 * covariance + c2)) / ((leftMean ** 2 + rightMean ** 2 + c1) * (leftVariance + rightVariance + c2));
}

export function ssim(original: ImageDataLike, current: ImageDataLike, perChannel = false): { luma: number; channels?: { r: number; g: number; b: number } } {
  if (original.width !== current.width || original.height !== current.height) throw new Error('ssim requires equal image dimensions');
  const result: { luma: number; channels?: { r: number; g: number; b: number } } = { luma: ssimValues(channelValues(original, 'luma'), channelValues(current, 'luma')) };
  if (perChannel) result.channels = { r: ssimValues(channelValues(original, 0), channelValues(current, 0)), g: ssimValues(channelValues(original, 1), channelValues(current, 1)), b: ssimValues(channelValues(original, 2), channelValues(current, 2)) };
  return result;
}

function sampleGrayscale(image: ImageDataLike, width: number, height: number): number[] {
  const output: number[] = [];
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const sourceX = Math.min(image.width - 1, Math.floor((x + 0.5) * image.width / width));
    const sourceY = Math.min(image.height - 1, Math.floor((y + 0.5) * image.height / height));
    output.push(luma(image.data, sourceY * image.width + sourceX));
  }
  return output;
}

function toHex(value: bigint): string { return value.toString(16).padStart(16, '0'); }
function hashBits(bits: readonly boolean[]): string { return toHex(bits.reduce((value, bit, index) => bit ? value | (1n << BigInt(63 - index)) : value, 0n)); }

/** dHash: nearest-neighbor grayscale to 9×8, then compare each pixel to its right neighbor. */
export function dhash(image: ImageDataLike): string {
  const pixels = sampleGrayscale(image, 9, 8);
  return hashBits(pixels.flatMap((row, index) => index % 9 === 8 ? [] : [row > pixels[index + 1]]));
}

/** pHash: nearest-neighbor grayscale to 32×32, 8×8 low-frequency DCT, median threshold including DC. */
export function phash(image: ImageDataLike): string {
  const pixels = sampleGrayscale(image, 32, 32);
  const coefficients: number[] = [];
  for (let v = 0; v < 8; v += 1) for (let u = 0; u < 8; u += 1) {
    let sum = 0;
    for (let y = 0; y < 32; y += 1) for (let x = 0; x < 32; x += 1) sum += pixels[y * 32 + x] * Math.cos(((2 * x + 1) * u * Math.PI) / 64) * Math.cos(((2 * y + 1) * v * Math.PI) / 64);
    const scale = (u === 0 ? 1 / Math.sqrt(2) : 1) * (v === 0 ? 1 / Math.sqrt(2) : 1);
    coefficients.push(sum * scale);
  }
  const sorted = [...coefficients].sort((a, b) => a - b);
  const median = sorted[sorted.length >> 1];
  return hashBits(coefficients.map((value) => value > median));
}

export function hamming(a: string, b: string): number {
  let value = BigInt(`0x${a}`) ^ BigInt(`0x${b}`);
  let count = 0;
  while (value !== 0n) { value &= value - 1n; count += 1; }
  return count;
}
