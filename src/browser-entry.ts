import { InlineRunner } from './core/runner';
import { WorkerRunner } from './worker/WorkerRunner';
import { buildAuditPipeline } from './core/auditPipeline';
import './steps';

declare global {
  var __pixelproof: { InlineRunner: typeof InlineRunner; WorkerRunner: typeof WorkerRunner; buildAuditPipeline: typeof buildAuditPipeline } | undefined;
}

globalThis.__pixelproof = { InlineRunner, WorkerRunner, buildAuditPipeline };
