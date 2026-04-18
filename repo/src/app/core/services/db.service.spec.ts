import '../../../test-setup';
import { TestBed } from '@angular/core/testing';
import { DbService } from './db.service';
import { uuid } from './crypto.util';

describe('DbService', () => {
  let db: DbService;

  beforeEach(async () => {
    (globalThis as unknown as { __resetIndexedDB: () => void }).__resetIndexedDB();
    TestBed.configureTestingModule({});
    db = TestBed.inject(DbService);
  });

  it('opens and persists records', async () => {
    await db.init();
    const id = uuid();
    const now = Date.now();
    await db.projects.put({ id, name: 'P', description: '', tags: [], pinned: false, featured: false, createdAt: now, updatedAt: now, createdBy: 'u', canvasCount: 0 });
    const all = await db.projects.all();
    expect(all.find((p) => p.id === id)).toBeTruthy();
    expect(await db.projects.count()).toBeGreaterThanOrEqual(1);
    const one = await db.projects.get(id);
    expect(one?.name).toBe('P');
    await db.projects.delete(id);
    expect(await db.projects.get(id)).toBeUndefined();
  });

  it('finds user by username via index', async () => {
    const id = uuid();
    await db.users.put({ id, username: 'alice', passwordHash: 'x', role: 'admin', createdAt: 1, updatedAt: 1, failedAttempts: 0 });
    const u = await db.users.byUsername('alice');
    expect(u?.id).toBe(id);
    expect(await db.users.byUsername('missing')).toBeUndefined();
  });

  it('storageEstimate handles missing navigator.storage', async () => {
    const original = (navigator as unknown as { storage?: unknown }).storage;
    Object.defineProperty(navigator, 'storage', { configurable: true, value: undefined });
    const est = await db.storageEstimate();
    expect(est).toEqual({ usage: 0, quota: 0, percent: 0 });
    Object.defineProperty(navigator, 'storage', { configurable: true, value: original });
  });

  it('storageEstimate uses navigator.storage.estimate when available', async () => {
    const original = (navigator as unknown as { storage?: unknown }).storage;
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: { estimate: async () => ({ usage: 100, quota: 1000 }) }
    });
    const est = await db.storageEstimate();
    expect(est.percent).toBeCloseTo(10);
    Object.defineProperty(navigator, 'storage', { configurable: true, value: original });
  });

  it('healthCheck returns ok for a working DB and cleans up its sentinel', async () => {
    const res = await db.healthCheck();
    expect(res.ok).toBe(true);
    expect(res.durationMs).toBeGreaterThanOrEqual(0);
    // Sentinel must not persist after a successful probe.
    expect(await db.blobs.get('__fc_healthcheck__')).toBeUndefined();
  });

  it('healthCheck returns { ok: false } when the store write throws', async () => {
    const broken = db as unknown as { init: () => Promise<unknown> };
    const origInit = broken.init.bind(db);
    broken.init = async () => ({
      put: async () => { throw new Error('simulated write failure'); },
      get: async () => undefined,
      delete: async () => undefined
    });
    const res = await db.healthCheck();
    expect(res.ok).toBe(false);
    expect(res.detail).toMatch(/simulated write failure/);
    broken.init = origInit;
  });

  it('byProject + clear work', async () => {
    const pid = uuid();
    await db.canvases.put({ id: uuid(), projectId: pid, name: 'A', description: '', elements: [], connections: [], groups: [], viewState: { zoom: 1, panX: 0, panY: 0, gridSize: 20 }, createdAt: 1, updatedAt: 1, createdBy: 'u', tags: [] });
    const list = await db.canvases.byProject(pid);
    expect(list.length).toBe(1);
    await db.clear('canvases');
    expect(await db.count('canvases')).toBe(0);
  });
});