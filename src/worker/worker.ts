import { runPipeline } from '../core/run';
import { createReport } from '../core/report';
import type { Ctx, Report, StepSpec } from '../core/types';
import '../steps';

interface RunMessage { readonly id: string; readonly file: Blob; readonly specs: readonly StepSpec[]; }
interface CancelMessage { readonly cancel: string; }
type WorkerMessage = RunMessage | CancelMessage;

const controllers = new Map<string, AbortController>();

self.onmessage = async (event: MessageEvent<WorkerMessage>) => {
  const message = event.data;
  if ('cancel' in message) {
    controllers.get(message.cancel)?.abort();
    return;
  }
  const controller = new AbortController();
  controllers.set(message.id, controller);
  const report: Report = createReport();
  const ctx: Ctx = { signal: controller.signal, report };
  try {
    const result = await runPipeline(message.file, message.specs, ctx);
    self.postMessage({ id: message.id, ok: true, blob: result.blob, report });
  } catch (error) {
    self.postMessage({ id: message.id, ok: false, error: error instanceof Error ? error.message : 'Worker pipeline failed' });
  } finally {
    controllers.delete(message.id);
  }
};
