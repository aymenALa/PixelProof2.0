import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join, basename, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { get } from 'node:http';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = fileURLToPath(new URL('..', import.meta.url));
const experimentsDir = join(root, 'experiments');
const fixturesDir = join(root, 'tests', 'fixtures');
const runsArg = process.argv.find((arg) => arg.startsWith('--runs='));
const outputArg = process.argv.find((arg) => arg.startsWith('--out='));
const runs = Math.max(1, Number.parseInt(runsArg?.slice(7) ?? '3', 10));
const outputPath = resolve(root, outputArg?.slice(6) ?? 'experiments.csv');
const port = 4174;

function waitForServer(url) {
  return new Promise((resolvePromise, reject) => {
    const started = Date.now();
    const check = () => {
      const request = get(url, (response) => { response.resume(); resolvePromise(); });
      request.on('error', () => { if (Date.now() - started > 30000) reject(new Error(`Timed out waiting for ${url}`)); else setTimeout(check, 100); });
    };
    check();
  });
}

function csvCell(value) { const text = value === undefined || value === null ? '' : String(value); return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text; }
function sumNumbers(value) { return value && typeof value === 'object' ? Object.values(value).reduce((sum, item) => sum + (typeof item === 'number' ? item : 0), 0) : ''; }

const vite = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', String(port)], { cwd: root, shell: true, windowsHide: true, stdio: 'ignore' });
try {
  await waitForServer(`http://127.0.0.1:${port}/`);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${port}/`);
  const experimentFiles = (await readdir(experimentsDir)).filter((name) => name.endsWith('.json')).sort();
  const fixtureFiles = (await readdir(fixturesDir)).filter((name) => !name.endsWith('.md')).sort();
  const experiments = await Promise.all(experimentFiles.map(async (name) => ({ name: basename(name, '.json'), specs: JSON.parse(await readFile(join(experimentsDir, name), 'utf8')) })));
  const rows = [];
  for (const fixture of fixtureFiles) for (const experiment of experiments) {
    const bytes = Array.from(await readFile(join(fixturesDir, fixture)));
    const results = [];
    for (let run = 0; run < runs; run += 1) results.push(await page.evaluate(async ({ bytes: inputBytes, specs }) => {
      const api = globalThis.__pixelproof;
      const report = {};
      const input = new Blob([new Uint8Array(inputBytes)]);
      const inputDigest = await crypto.subtle.digest('SHA-256', await input.arrayBuffer());
      const inputHash = Array.from(new Uint8Array(inputDigest), (byte) => byte.toString(16).padStart(2, '0')).join('');
      try {
        const result = await new api.InlineRunner().run(input, specs, { signal: new AbortController().signal, report });
        const pixel = report.pixelDiff ?? {};
        const psnr = report.psnr ?? {};
        const ssim = report.ssim ?? {};
        const outputHash = report['sha256:output'];
        return { ok: true, deterministic: { sha_changed: outputHash !== inputHash, phash_dist: report.phash?.distance ?? '', dhash_dist: report.dhash?.distance ?? '', max_diff: pixel.maxAbsDiff ?? '', pct_changed: pixel.changedPercent ?? '', psnr: psnr.luma ?? '', ssim: ssim.luma ?? '', bytes_out: result.blob.size, raster_bytes: report.rasterBytes ?? {}, user_agent: report.userAgent ?? '' }, ms: Object.values(report.timings ?? {}).reduce((sum, value) => sum + Number(value), 0), bytes_in: input.size };
      } catch (error) { return { ok: false, error: error instanceof Error ? error.message : String(error), bytes_in: input.size, user_agent: report.userAgent ?? '' }; }
    }, { bytes, specs: experiment.specs }));
    const first = results[0];
    const stable = JSON.stringify(results.map((result) => result.ok ? result.deterministic : { error: result.error }));
    if (new Set(results.map((result) => result.ok ? JSON.stringify(result.deterministic) : JSON.stringify({ error: result.error }))).size !== 1) throw new Error(`Nondeterministic result for ${fixture} × ${experiment.name}: ${stable}`);
    const row = first.ok ? { fixture, pipeline: experiment.name, ...first.deterministic, ms: first.ms, bytes_in: first.bytes_in } : { fixture, pipeline: experiment.name, sha_changed: `error:${first.error}`, phash_dist: '', dhash_dist: '', max_diff: '', pct_changed: '', psnr: '', ssim: '', ms: '', bytes_in: first.bytes_in, bytes_out: '', raster_bytes: '', user_agent: first.user_agent };
    row.raster_bytes = typeof row.raster_bytes === 'object' ? sumNumbers(row.raster_bytes) : row.raster_bytes;
    rows.push(row);
  }
  const columns = ['fixture', 'pipeline', 'sha_changed', 'phash_dist', 'dhash_dist', 'max_diff', 'pct_changed', 'psnr', 'ssim', 'ms', 'bytes_in', 'bytes_out', 'raster_bytes', 'user_agent'];
  await writeFile(outputPath, `${columns.join(',')}\n${rows.map((row) => columns.map((column) => csvCell(row[column])).join(',')).join('\n')}\n`);
  console.log(`Wrote ${rows.length} rows to ${outputPath} (${runs} deterministic run(s) checked per row).`);
  await browser.close();
} finally {
  vite.kill();
}
