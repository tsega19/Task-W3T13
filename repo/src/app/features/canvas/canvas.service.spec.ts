import '../../../test-setup';
import { TestBed } from '@angular/core/testing';
import { CanvasService } from './canvas.service';
import { DbService } from '../../core/services/db.service';
import { AppConfigService, buildAppConfig } from '../../config/app-config.service';
import { AuthService } from '../../core/services/auth.service';
import { signal } from '@angular/core';
import { CanvasRecord, SessionInfo, ELEMENT_TYPES } from '../../core/models/models';
import { uuid } from '../../core/services/crypto.util';

function cfgWith(overrides: Partial<ReturnType<typeof buildAppConfig>['canvas']> = {}): AppConfigService {
  const base = buildAppConfig();
  base.canvas = { ...base.canvas, ...overrides };
  return { get: () => base } as unknown as AppConfigService;
}

function auth(): Partial<AuthService> {
  const s = signal<SessionInfo | null>({ userId: 'u1', username: 'u', role: 'admin', issuedAt: 1, lastActivity: 1 });
  return { session: s, role: (() => 'admin') as unknown as AuthService['role'] };
}

function makeCanvas(): CanvasRecord {
  return {
    id: uuid(),
    projectId: 'p',
    name: 'c',
    description: '',
    elements: [],
    connections: [],
    groups: [],
    viewState: { zoom: 1, panX: 0, panY: 0, gridSize: 20 },
    createdAt: 1, updatedAt: 1, createdBy: 'u', tags: []
  };
}

describe('CanvasService', () => {
  let svc: CanvasService;
  let db: DbService;

  beforeEach(async () => {
    (globalThis as unknown as { __resetIndexedDB: () => void }).__resetIndexedDB();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: AppConfigService, useValue: cfgWith({ elementCap: 3, maxVersions: 2 }) },
        { provide: AuthService, useValue: auth() }
      ]
    });
    svc = TestBed.inject(CanvasService);
    db = TestBed.inject(DbService);
    await db.init();
  });

  it('createElement produces each type', () => {
    for (const t of ELEMENT_TYPES) {
      const el = svc.createElement(t, 1, 2);
      expect(el.type).toBe(t);
      expect(el.width).toBeGreaterThanOrEqual(2);
    }
  });

  it('tryAddElement respects cap', () => {
    const c = makeCanvas();
    expect(svc.tryAddElement(c, svc.createElement('button', 0, 0)).ok).toBe(true);
    expect(svc.tryAddElement(c, svc.createElement('button', 0, 0)).ok).toBe(true);
    expect(svc.tryAddElement(c, svc.createElement('button', 0, 0)).ok).toBe(true);
    const last = svc.tryAddElement(c, svc.createElement('button', 0, 0));
    expect(last.ok).toBe(false);
    expect(last.reason).toBe('cap');
    expect(svc.atCap(c)).toBe(true);
    expect(svc.remainingCapacity(c)).toBe(0);
  });

  it('deleteElements removes elements + connections + empty groups', () => {
    const c = makeCanvas();
    svc.tryAddElement(c, svc.createElement('button', 0, 0));
    svc.tryAddElement(c, svc.createElement('input', 10, 10));
    const [a, b] = c.elements;
    c.connections.push({ id: 'cc', fromId: a.id, toId: b.id, style: 'straight' });
    c.groups.push({ id: 'g', name: 'g', elementIds: [a.id] });
    svc.deleteElements(c, [a.id]);
    expect(c.elements.find((e) => e.id === a.id)).toBeUndefined();
    expect(c.connections.length).toBe(0);
    expect(c.groups.length).toBe(0);
  });

  it('createVersion + compaction + rollback', async () => {
    const c = makeCanvas();
    svc.tryAddElement(c, svc.createElement('button', 0, 0));
    await db.canvases.put(c);
    const v1 = await svc.createVersion(c, 'first');
    const v2 = await svc.createVersion(c, 'second');
    const v3 = await svc.createVersion(c, 'third');
    const all = await svc.listVersions(c.id);
    expect(all.length).toBe(2);
    expect(all.find((v) => v.id === v1.id)).toBeUndefined();
    c.elements = [];
    await db.canvases.put(c);
    await svc.rollback(c, v3.id);
    expect(c.elements.length).toBe(1);
    await expect(svc.rollback(c, 'missing')).rejects.toThrow(/not found/);
  });

  it('renameDuplicateId finds unique', () => {
    const set = new Set(['a', 'a_2', 'a_3']);
    expect(svc.renameDuplicateId(set, 'a')).toBe('a_4');
    expect(svc.renameDuplicateId(set, 'b')).toBe('b');
  });

  it('save updates timestamp and broadcasts', async () => {
    const c = makeCanvas();
    await db.canvases.put(c);
    const before = c.updatedAt;
    await new Promise((r) => setTimeout(r, 5));
    await svc.save(c);
    expect(c.updatedAt).toBeGreaterThanOrEqual(before);
  });
});