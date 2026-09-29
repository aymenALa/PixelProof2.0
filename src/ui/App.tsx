import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { InlineRunner } from '../core/runner';
import { createReport } from '../core/report';
import type { Ctx, Report, StepSpec } from '../core/types';
import { WorkerRunner } from '../worker/WorkerRunner';
import { buildAuditPipeline } from '../core/auditPipeline';
import { serializeJson } from '../core/report';
import { deleteHistory, listHistory, saveHistory, type HistoryRecord } from './history';
import './styles.css';

const presets: Record<string, readonly StepSpec[]> = {
  'no-transform-png': buildAuditPipeline({ transform: 'none', targetType: 'image/png' }),
  'no-transform-jpeg': buildAuditPipeline({ transform: 'none', targetType: 'image/jpeg', quality: 0.92 }),
  'grayscale-png': buildAuditPipeline({ transform: 'grayscale', targetType: 'image/png' }),
  'resize-2400-png': buildAuditPipeline({ transform: { resize: { maxWidth: 2400 } }, targetType: 'image/png' }),
};

function formatReportValue(value: unknown): string {
  return typeof value === 'object' && value !== null ? serializeJson(value) : String(value);
}

export function App() {
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [mode, setMode] = useState<'inline' | 'worker'>('worker');
  const [preset, setPreset] = useState('no-transform-png');
  const [specText, setSpecText] = useState(JSON.stringify(presets['no-transform-png'], null, 2));
  const [report, setReport] = useState<Report | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [downloadName, setDownloadName] = useState('pixelproof-output');
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [history, setHistory] = useState<HistoryRecord[]>([]);
  const [historySort, setHistorySort] = useState<'createdAt' | 'inputName' | 'runner'>('createdAt');
  const controllerRef = useRef<AbortController | null>(null);
  const runner = useMemo(() => mode === 'worker' ? new WorkerRunner() : new InlineRunner(), [mode]);

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);
  useEffect(() => { void listHistory().then(setHistory).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Could not load run history')); }, []);

  function choosePreset(value: string) {
    setPreset(value);
    setSpecText(JSON.stringify(presets[value], null, 2));
  }

  function handleDragOver(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    setDragging(true);
  }

  function handleDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    setDragging(false);
    const dropped = event.dataTransfer.files[0];
    if (dropped) setFile(dropped);
  }

  async function run() {
    if (!file || running) return;
    let specs: StepSpec[];
    try {
      const parsed: unknown = JSON.parse(specText);
      if (!Array.isArray(parsed)) throw new Error('Pipeline JSON must be an array');
      specs = parsed as StepSpec[];
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Invalid pipeline JSON'); return; }
    const controller = new AbortController();
    controllerRef.current = controller;
    setRunning(true); setError(null); setReport(null);
    try {
      const nextReport = createReport();
      const ctx: Ctx = { signal: controller.signal, report: nextReport };
      const result = await runner.run(file, specs, ctx);
      const nextUrl = URL.createObjectURL(result.blob);
      const extension = result.blob.type === 'image/jpeg' ? 'jpg' : result.blob.type === 'image/webp' ? 'webp' : 'png';
      setDownloadName(`pixelproof-output.${extension}`);
      setPreviewUrl((previous) => { if (previous) URL.revokeObjectURL(previous); return nextUrl; });
      setReport(nextReport);
      const historyRecord: HistoryRecord = { id: crypto.randomUUID(), createdAt: Date.now(), inputName: file.name, runner: mode, pipeline: specs, bytesIn: file.size, bytesOut: result.blob.size, report: nextReport };
      await saveHistory(historyRecord);
      setHistory((previous) => [historyRecord, ...previous]);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Pipeline failed'); }
    finally { controllerRef.current = null; setRunning(false); }
  }

  function cancel() { controllerRef.current?.abort(); }

  function exportHistory() {
    const columns = ['id', 'createdAt', 'inputName', 'runner', 'bytesIn', 'bytesOut', 'report'];
    const cell = (value: unknown) => { const text = typeof value === 'string' ? value : serializeJson(value); return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text; };
    const csv = [columns.join(','), ...history.map((run) => [run.id, run.createdAt, run.inputName, run.runner, run.bytesIn, run.bytesOut, serializeJson(run.report)].map(cell).join(','))].join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'pixelproof-history.csv'; anchor.click(); URL.revokeObjectURL(url);
  }

  const sortedHistory = [...history].sort((left, right) => historySort === 'createdAt' ? right.createdAt - left.createdAt : String(left[historySort]).localeCompare(String(right[historySort])));

  return <main className="shell">
    <p className="eyebrow">PIXELPROOF / LOCAL LAB</p>
    <h1>Measure the pipeline.</h1>
    <p className="lede">Inline and Worker execution share the same declared steps. Files stay in this browser.</p>
    <section className="card controls-card">
      <label className={`file-input${dragging ? ' dragging' : ''}`} onDragEnter={handleDragOver} onDragOver={handleDragOver} onDragLeave={() => setDragging(false)} onDrop={handleDrop}>{file ? file.name : 'Drop an image here or choose one'}<input type="file" accept="image/*" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></label>
      <div className="grid">
        <label>Runner<select value={mode} onChange={(event) => setMode(event.target.value as 'inline' | 'worker')}><option value="worker">Worker</option><option value="inline">Inline</option></select></label>
        <label>Preset<select value={preset} onChange={(event) => choosePreset(event.target.value)}>{Object.keys(presets).map((key) => <option key={key} value={key}>{key}</option>)}</select></label>
      </div>
      <label>Pipeline JSON<textarea value={specText} onChange={(event) => setSpecText(event.target.value)} spellCheck={false} /></label>
      <div className="actions"><button disabled={!file || running} onClick={() => void run()}>{running ? 'Running…' : 'Run pipeline'}</button><button className="secondary" disabled={!running} onClick={cancel}>Cancel</button></div>
    </section>
    {error && <p className="error">{error}</p>}
    {previewUrl && <section className="card"><h2>Output preview</h2><img className="preview" src={previewUrl} alt="Processed output" /><a className="download" href={previewUrl} download={downloadName}>Download image</a></section>}
    {report && <section className="card report"><h2>Report</h2><table><tbody>{Object.entries(report).map(([key, value]) => <tr key={key}><th>{key}</th><td>{formatReportValue(value)}</td></tr>)}</tbody></table></section>}
    <section className="card history"><div className="history-heading"><h2>Run history</h2><div><label>Sort<select aria-label="Sort history" value={historySort} onChange={(event) => setHistorySort(event.target.value as typeof historySort)}><option value="createdAt">Newest</option><option value="inputName">Input</option><option value="runner">Runner</option></select></label><button className="secondary" disabled={history.length === 0} onClick={exportHistory}>Export CSV</button></div></div><table><thead><tr><th>When</th><th>Input</th><th>Runner</th><th>Bytes</th><th>Actions</th></tr></thead><tbody>{sortedHistory.map((runRecord) => <tr key={runRecord.id}><td>{new Date(runRecord.createdAt).toLocaleString()}</td><td>{runRecord.inputName}</td><td>{runRecord.runner}</td><td>{runRecord.bytesIn} → {runRecord.bytesOut}</td><td><button className="secondary delete-run" onClick={() => { void deleteHistory(runRecord.id).then(() => setHistory((previous) => previous.filter((item) => item.id !== runRecord.id))); }}>Delete</button></td></tr>)}</tbody></table>{history.length === 0 && <p className="empty-history">No runs saved yet.</p>}</section>
  </main>;
}
