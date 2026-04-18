import '../../../test-setup';
import { TestBed } from '@angular/core/testing';
import { ProjectService } from './project.service';
import { DbService } from '../../core/services/db.service';
import { AuthService } from '../../core/services/auth.service';
import { AppConfigService, buildAppConfig } from '../../config/app-config.service';
import { signal } from '@angular/core';
import { SessionInfo } from '../../core/models/models';

function cfg(overrides: Partial<ReturnType<typeof buildAppConfig>['projects']> = {}): AppConfigService {
  const base = buildAppConfig();
  base.projects = { ...base.projects, ...overrides };
  return { get: () => base } as unknown as AppConfigService;
}

function fakeAuth(role: 'admin' | 'editor' | 'reviewer'): Partial<AuthService> {
  const s = signal<SessionInfo | null>({ userId: 'u1', username: 'u', role, issuedAt: 1, lastActivity: 1 });
  return { session: s, role: (() => s()?.role ?? null) as unknown as AuthService['role'] };
}

describe('ProjectService', () => {
  beforeEach(async () => {
    (globalThis as unknown as { __resetIndexedDB: () => void }).__resetIndexedDB();
  });

  function build(role: 'admin' | 'editor' | 'reviewer', cfgOverrides = {}): { svc: ProjectService; db: DbService } {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: AppConfigService, useValue: cfg(cfgOverrides) },
        { provide: AuthService, useValue: fakeAuth(role) }
      ]
    });
    return { svc: TestBed.inject(ProjectService), db: TestBed.inject(DbService) };
  }

  it('validates name length and uniqueness', () => {
    const { svc } = build('admin');
    expect(svc.validateName('', []).ok).toBe(false);
    expect(svc.validateName('a'.repeat(101), []).ok).toBe(false);
    expect(svc.validateName('P', [{ id: '1', name: 'p', description: '', tags: [], pinned: false, featured: false, createdAt: 1, updatedAt: 1, createdBy: 'u', canvasCount: 0 }]).ok).toBe(false);
    expect(svc.validateName('New', []).ok).toBe(true);
  });

  it('validates tags', () => {
    const { svc } = build('admin');
    expect(svc.validateTags(['ok']).ok).toBe(true);
    expect(svc.validateTags(Array.from({ length: 11 }, () => 't')).ok).toBe(false);
    expect(svc.validateTags(['a'.repeat(31)]).ok).toBe(false);
    expect(svc.validateTags(['']).ok).toBe(false);
  });

  it('create enforces cap and permission', async () => {
    const { svc } = build('editor', { max: 1 });
    await svc.create({ name: 'One' });
    await expect(svc.create({ name: 'Two' })).rejects.toThrow(/limit/);
    const r = build('reviewer');
    await expect(r.svc.create({ name: 'X' })).rejects.toThrow(/PermissionDenied/);
  });

  it('create rejects duplicate names case-insensitively', async () => {
    const { svc } = build('admin');
    await svc.create({ name: 'Alpha' });
    await expect(svc.create({ name: 'alpha' })).rejects.toThrow(/exists/);
  });

  it('update, delete, list and setPinned/setFeatured', async () => {
    const { svc } = build('admin');
    const p = await svc.create({ name: 'P', description: 'd', tags: ['t1'] });
    await svc.update(p.id, { name: 'P2', description: 'd2', tags: ['t2'] });
    const fetched = (await svc.list()).find((x) => x.id === p.id);
    expect(fetched?.name).toBe('P2');
    await svc.setPinned(p.id, true);
    expect((await svc.list())[0].pinned).toBe(true);
    const q = await svc.create({ name: 'Q' });
    await svc.setFeatured(p.id, true);
    await svc.setFeatured(q.id, true);
    const all = await svc.list();
    expect(all.filter((x) => x.featured).length).toBe(1);
    await svc.remove(p.id);
    expect((await svc.list()).find((x) => x.id === p.id)).toBeUndefined();
  });

  it('createCanvas enforces cap and uniqueness', async () => {
    const { svc } = build('admin', { canvasMaxPerProject: 2 });
    const p = await svc.create({ name: 'P' });
    await svc.createCanvas(p.id, 'c1');
    await expect(svc.createCanvas(p.id, 'C1')).rejects.toThrow(/exists/);
    await expect(svc.createCanvas(p.id, '')).rejects.toThrow(/1–100/);
    await svc.createCanvas(p.id, 'c2');
    await expect(svc.createCanvas(p.id, 'c3')).rejects.toThrow(/limit/);
  });

  it('deleteCanvas cascades', async () => {
    const { svc, db } = build('admin');
    const p = await svc.create({ name: 'P' });
    const c = await svc.createCanvas(p.id, 'C');
    await svc.deleteCanvas(c.id);
    expect(await db.canvases.get(c.id)).toBeUndefined();
  });
});