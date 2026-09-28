import { InlineRunner } from './core/runner';
import { WorkerRunner } from './worker/WorkerRunner';
import './steps';

declare global {
  var __pixelproof: { InlineRunner: typeof InlineRunner; WorkerRunner: typeof WorkerRunner } | undefined;
}

globalThis.__pixelproof = { InlineRunner, WorkerRunner };
