import { Injectable, inject } from '@angular/core';
import { openDB, IDBPDatabase } from 'idb';
import { LoggerService } from '../../logging/logger.service';
import {
  UserRecord,
  ProjectRecord,
  CanvasRecord,
  VersionRecord,
  AuditEntry,
  ReviewRecord,
  TicketRecord,
  BlobRecord
} from '../models/models';

export const DB_NAME = 'flowcanvas_db';
export const DB_VERSION = 1;

export type StoreName =
  | 'users'
  | 'projects'
  | 'canvases'
  | 'versions'
  | 'audit_log'
  | 'reviews'
  | 'tickets'
  | 'blobs';

@Injectable({ providedIn: 'root' })
export class DbService {
  private readonly logger = inject(LoggerService);
  private dbPromise: Promise<IDBPDatabase> | null = null;

  async init(): Promise<IDBPDatabase> {
    if (!this.dbPromise) {
      this.dbPromise = openDB(DB_NAME, DB_VERSION, {
        upgrade(db) {
          if (!db.objectStoreNames.contains('users')) {
            const s = db.createObjectStore('users', { keyPath: 'id' });
            s.createIndex('username', 'username', { unique: true });
          }
          if (!db.objectStoreNames.contains('projects')) {
            const s = db.createObjectStore('projects', { keyPath: 'id' });
            s.createIndex('name_ci', 'name', { unique: false });
          }
          if (!db.objectStoreNames.contains('canvases')) {
            const s = db.createObjectStore('canvases', { keyPath: 'id' });
            s.createIndex('projectId', 'projectId', { unique: false });
          }
          if (!db.objectStoreNames.contains('versions')) {
            const s = db.createObjectStore('versions', { keyPath: 'id' });
            s.createIndex('canvasId', 'canvasId', { unique: false });
          }
          if (!db.objectStoreNames.contains('audit_log')) {
            db.createObjectStore('audit_log', { keyPath: 'id' });
          }
          if (!db.objectStoreNames.contains('reviews')) {
            const s = db.createObjectStore('reviews', { keyPath: 'id' });
            s.createIndex('canvasId', 'canvasId', { unique: false });
          }
          if (!db.objectStoreNames.contains('tickets')) {
            const s = db.createObjectStore('tickets', { keyPath: 'id' });
            s.createIndex('reviewId', 'reviewId', { unique: false });
          }
          if (!db.objectStoreNames.contains('blobs')) {
            db.createObjectStore('blobs', { keyPath: 'key' });
          }
        }
      });
      this.logger.info('core', 'db', 'IndexedDB opened', { name: DB_NAME, version: DB_VERSION });
    }
    return this.dbPromise;
  }

  async get<T>(store: StoreName, key: string): Promise<T | undefined> {
    const db = await this.init();
    return (await db.get(store, key)) as T | undefined;
  }

  async all<T>(store: StoreName): Promise<T[]> {
    const db = await this.init();
    return (await db.getAll(store)) as T[];
  }

  async byIndex<T>(store: StoreName, indexName: string, value: IDBValidKey): Promise<T[]> {
    const db = await this.init();
    return (await db.getAllFromIndex(store, indexName, value)) as T[];
  }

  async put<T extends { id?: string; key?: string }>(store: StoreName, value: T): Promise<void> {
    const db = await this.init();
    await db.put(store, value);
  }

  async delete(store: StoreName, key: string): Promise<void> {
    const db = await this.init();
    await db.delete(store, key);
  }

  async clear(store: StoreName): Promise<void> {
    const db = await this.init();
    await db.clear(store);
  }

  async count(store: StoreName): Promise<number> {
    const db = await this.init();
    return db.count(store);
  }

  /**
   * Exercise a real IndexedDB write/read/delete round trip against a sentinel
   * row in the `blobs` store (chosen because it is not the immutable audit
   * timeline). Returns timing + status so the caller can record it to the
   * audit timeline as the permanent health-check record.
   */
  async healthCheck(): Promise<{ ok: boolean; durationMs: number; detail: string }> {
    const started = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const sentinelKey = '__fc_healthcheck__';
    try {
      const db = await this.init();
      const probe = {
        key: sentinelKey,
        name: '__healthcheck__',
        mimeType: 'application/octet-stream',
        sizeBytes: 0,
        data: new ArrayBuffer(0),
        createdAt: Date.now()
      };
      await db.put('blobs', probe);
      const readBack = (await db.get('blobs', sentinelKey)) as { key?: string } | undefined;
      await db.delete('blobs', sentinelKey);
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      if (!readBack || readBack.key !== sentinelKey) {
        return { ok: false, durationMs: now - started, detail: 'read-back mismatch' };
      }
      return { ok: true, durationMs: now - started, detail: 'read/write/delete OK' };
    } catch (e) {
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      return { ok: false, durationMs: now - started, detail: String(e) };
    }
  }

  async storageEstimate(): Promise<{ usage: number; quota: number; percent: number }> {
    const nav = typeof navigator !== 'undefined' ? navigator : undefined;
    if (nav && 'storage' in nav && nav.storage && typeof nav.storage.estimate === 'function') {
      const est = await nav.storage.estimate();
      const usage = est.usage ?? 0;
      const quota = est.quota ?? 0;
      const percent = quota > 0 ? (usage / quota) * 100 : 0;
      return { usage, quota, percent };
    }
    return { usage: 0, quota: 0, percent: 0 };
  }

  // Typed facade helpers
  users = {
    all: () => this.all<UserRecord>('users'),
    get: (id: string) => this.get<UserRecord>('users', id),
    byUsername: async (username: string): Promise<UserRecord | undefined> => {
      const res = await this.byIndex<UserRecord>('users', 'username', username.toLowerCase());
      return res[0];
    },
    put: (u: UserRecord) => this.put('users', u)
  };
  projects = {
    all: () => this.all<ProjectRecord>('projects'),
    get: (id: string) => this.get<ProjectRecord>('projects', id),
    put: (p: ProjectRecord) => this.put('projects', p),
    delete: (id: string) => this.delete('projects', id),
    count: () => this.count('projects')
  };
  canvases = {
    all: () => this.all<CanvasRecord>('canvases'),
    get: (id: string) => this.get<CanvasRecord>('canvases', id),
    byProject: (projectId: string) => this.byIndex<CanvasRecord>('canvases', 'projectId', projectId),
    put: (c: CanvasRecord) => this.put('canvases', c),
    delete: (id: string) => this.delete('canvases', id)
  };
  versions = {
    all: () => this.all<VersionRecord>('versions'),
    byCanvas: (canvasId: string) => this.byIndex<VersionRecord>('versions', 'canvasId', canvasId),
    put: (v: VersionRecord) => this.put('versions', v),
    delete: (id: string) => this.delete('versions', id)
  };
  audit = {
    all: () => this.all<AuditEntry>('audit_log'),
    put: (e: AuditEntry) => this.put('audit_log', e),
    delete: (id: string) => this.delete('audit_log', id)
  };
  reviews = {
    all: () => this.all<ReviewRecord>('reviews'),
    byCanvas: (canvasId: string) => this.byIndex<ReviewRecord>('reviews', 'canvasId', canvasId),
    put: (r: ReviewRecord) => this.put('reviews', r),
    delete: (id: string) => this.delete('reviews', id)
  };
  tickets = {
    all: () => this.all<TicketRecord>('tickets'),
    byReview: (reviewId: string) => this.byIndex<TicketRecord>('tickets', 'reviewId', reviewId),
    put: (t: TicketRecord) => this.put('tickets', t),
    delete: (id: string) => this.delete('tickets', id)
  };
  blobs = {
    get: (key: string) => this.get<BlobRecord>('blobs', key),
    put: (b: BlobRecord) => this.put('blobs', b),
    delete: (key: string) => this.delete('blobs', key)
  };
}
