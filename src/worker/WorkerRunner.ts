import type { Bytes, Ctx, StepSpec } from '../core/types';
import type { Runner } from '../core/runner';

interface WorkerSuccess { readonly id: string; readonly ok: true; readonly blob: Blob; readonly report: Record<string, unknown>; }
interface WorkerFailure { readonly id: string; readonly ok: false; readonly error: string; }
type WorkerResponse = WorkerSuccess | WorkerFailure;

export class WorkerRunner implements Runner {
  private readonly worker: Worker;

  constructor() {
    this.worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  }

  run(input: Blob, specs: readonly StepSpec[], ctx: Ctx): Promise<Bytes> {
    const id = crypto.randomUUID();
    const worker = this.worker;
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (callback: () => void) => {
        if (settled) return;
        settled = true;
        ctx.signal.removeEventListener('abort', onAbort);
        callback();
      };
      const onAbort = () => { worker.postMessage({ cancel: id }); };
      ctx.signal.addEventListener('abort', onAbort, { once: true });
      worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
        const message = event.data;
        if (message.id !== id) return;
        if (message.ok) finish(() => { Object.assign(ctx.report, message.report); resolve({ kind: 'bytes', blob: message.blob }); });
        else finish(() => reject(new Error(message.error)));
      };
      worker.onerror = () => finish(() => reject(new Error('Pipeline worker failed')));
      worker.postMessage({ id, file: input, specs });
    });
  }
}
