import { expect, test } from '@playwright/test';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const fixturePath = join(process.cwd(), 'tests', 'fixtures', 'transparent.png');
const csp = "default-src 'self'; connect-src 'none'; worker-src 'self' blob:; img-src 'self' blob: data:";

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

test('A: processing creates zero requests after file selection', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));
  await page.goto('/');
  await page.waitForTimeout(300);
  requests.length = 0;
  await page.locator('input[type="file"]').setInputFiles(fixturePath);
  await page.getByRole('button', { name: 'Run pipeline' }).click();
  await expect(page.getByRole('img', { name: 'Processed output' })).toBeVisible();
  expect(requests.filter((url) => /^https?:/i.test(url))).toEqual([]);
});

test('B: processing succeeds while the browser context is offline', async ({ page, context }) => {
  await page.goto('/');
  await page.waitForTimeout(300);
  await context.setOffline(true);
  await page.locator('input[type="file"]').setInputFiles(fixturePath);
  await page.getByRole('button', { name: 'Run pipeline' }).click();
  await expect(page.getByRole('img', { name: 'Processed output' })).toBeVisible();
});

test('C: source contains no network-capable processing APIs', () => {
  const forbidden = /\b(fetch|XMLHttpRequest|sendBeacon|WebSocket|FormData|EventSource)\b/;
  const matches = sourceFiles(join(process.cwd(), 'src')).flatMap((path) => {
    const source = readFileSync(path, 'utf8');
    return forbidden.test(source) ? [path] : [];
  });
  expect(matches).toEqual([]);
});

test('D: page and worker load only from the same origin and receive CSP', async ({ page }) => {
  const requests: string[] = [];
  const workerResponsePromise = page.waitForEvent('response', (response) => response.url().includes('/assets/worker-'));
  page.on('request', (request) => requests.push(request.url()));
  const documentResponse = await page.goto('/');
  const workerResponse = await workerResponsePromise;
  const origin = new URL(page.url()).origin;
  expect(documentResponse?.headers()['content-security-policy']).toBe(csp);
  expect(workerResponse.headers()['content-security-policy']).toBe(csp);
  expect(requests.every((url) => new URL(url).origin === origin)).toBe(true);
});

test('reload preserves history and history can sort, export, and delete', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(300);
  await page.locator('input[type="file"]').setInputFiles(fixturePath);
  await page.getByRole('button', { name: 'Run pipeline' }).click();
  const history = page.locator('section.history');
  await expect(history.getByText('transparent.png')).toBeVisible();
  await page.reload();
  await expect(page.locator('section.history').getByText('transparent.png')).toBeVisible();
  await page.getByLabel('Sort history').selectOption('inputName');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export CSV' }).click();
  expect((await download).suggestedFilename()).toBe('pixelproof-history.csv');
  const row = page.locator('section.history tbody tr').filter({ hasText: 'transparent.png' });
  await row.getByRole('button', { name: 'Delete' }).click();
  await expect(row).toHaveCount(0);
});
