import type { StepSpec } from '../core/types';

export interface HistoryRecord {
  readonly id: string;
  readonly createdAt: number;
  readonly inputName: string;
  readonly runner: 'inline' | 'worker';
  readonly pipeline: readonly StepSpec[];
  readonly bytesIn: number;
  readonly bytesOut: number;
  readonly report: Record<string, unknown>;
}

const databaseName = 'pixelproof-local';
const storeName = 'runs';

function requestValue<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(storeName, { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB unavailable'));
  });
}

function jsonOnly<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export async function saveHistory(record: HistoryRecord): Promise<void> {
  const database = await openDatabase();
  try { await requestValue(database.transaction(storeName, 'readwrite').objectStore(storeName).put(jsonOnly(record))); }
  finally { database.close(); }
}

export async function listHistory(): Promise<HistoryRecord[]> {
  const database = await openDatabase();
  try { return await requestValue(database.transaction(storeName, 'readonly').objectStore(storeName).getAll()); }
  finally { database.close(); }
}

export async function deleteHistory(id: string): Promise<void> {
  const database = await openDatabase();
  try { await requestValue(database.transaction(storeName, 'readwrite').objectStore(storeName).delete(id)); }
  finally { database.close(); }
}
