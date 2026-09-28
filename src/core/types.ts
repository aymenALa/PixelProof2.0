export type Stage = 'bytes' | 'raster';
export type ReportTarget = 'input' | 'output';

export interface EncodeReport { requested: string; actual: string; width: number; height: number; }
export interface Report {
  input: { sha256?: string; metadata?: unknown; bytes?: number };
  output: { sha256?: string; metadata?: unknown; bytes?: number; encode?: EncodeReport; encodeFallback?: { requested: string; actual: string }; resize?: unknown };
  comparison: { pixelDiff?: unknown; psnr?: unknown; ssim?: unknown; phash?: unknown; dhash?: unknown; errors?: Record<string, string> };
  timings: Record<string, number>;
  rasterBytes: Record<string, number>;
  userAgent: string;
}

export interface Bytes { readonly kind: 'bytes'; readonly blob: Blob; }
export interface Raster { readonly kind: 'raster'; readonly canvas: OffscreenCanvas; }
export type Payload = Bytes | Raster;

export interface Ctx {
  readonly signal: AbortSignal;
  readonly report: Report;
  original?: ImageData;
}

export interface Step<I extends Payload = Payload, O extends Payload = Payload> {
  readonly name: string;
  readonly in: Stage;
  readonly out: Stage;
  run(input: I, ctx: Ctx): O | Promise<O>;
}

export interface StepSpec { readonly type: string; readonly opts?: Record<string, unknown>; }
export type StepFactory = (spec: StepSpec) => Step;
