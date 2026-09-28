export type Stage = 'bytes' | 'raster';

export interface Bytes { readonly kind: 'bytes'; readonly blob: Blob; }
export interface Raster { readonly kind: 'raster'; readonly canvas: OffscreenCanvas; }
export type Payload = Bytes | Raster;

export interface Ctx {
  readonly signal: AbortSignal;
  readonly report: Record<string, unknown>;
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
