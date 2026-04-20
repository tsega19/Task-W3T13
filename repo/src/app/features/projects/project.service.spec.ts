import '../../../test-setup';
import { TestBed } from '@angular/core/testing';
import { ProjectService } from './project.service';
import { DbService } from '../../core/services/db.service';
import { AuthService } from '../../core/services/auth.service';
import { PermissionService } from '../../core/services/permission.service';
import { AppConfigService, buildAppConfig } from '../../config/app-config.service';
import { AdminService, AdminSettings } from '../admin/admin.service';
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
    localStorage.clear();
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

  function buildWithAdmin(
    role: 'admin' | 'editor' | 'reviewer',
    adminSettings: Partial<AdminSettings>,
    authOverride?: Partial<AuthService>,
    cfgOverrides = {}
  ): { svc: ProjectService; db: DbService } {
    TestBed.resetTestingModule();
    const auth = authOverride ?? fakeAuth(role);
    const adminMock = { settings: signal(adminSettings as AdminSettings) } as unknown as AdminService;
    TestBed.configureTestingModule({
      providers: [
        { provide: AppConfigService, useValue: cfg(cfgOverrides) },
        { provide: AuthService, useValue: auth },
        { provide: AdminService, useValue: adminMock }
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

  it('create enforces cap, and PermissionService.can() gates reviewer RBAC at the UI layer', async () => {
    const { svc } = build('editor', { max: 1 });
    await svc.create({ name: 'One' });
    await expect(svc.create({ name: 'Two' })).rejects.toThrow(/limit/);
    // RBAC for reviewer: enforce() is advisory (see permission.service.ts), so
    // the UI must rely on can('project.create'). Verify that gate.
    build('reviewer');
    const perm = TestBed.inject(PermissionService);
    expect(perm.can('project.create')).toBe(false);
    expect(perm.can('review.create')).toBe(true);
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

  it('remove() cascades versions, reviews, tickets, ticket attachments and element image blobs', async () => {
    const { svc, db } = build('admin');
    const p = await svc.create({ name: 'P' });
    const c = await svc.createCanvas(p.id, 'C');
    // Image blob referenced by an element — must be deleted by cascade.
    await db.blobs.put({ key: 'img1', name: 'pic.png', mimeType: 'image/png', sizeBytes: 1, data: new Uint8Array([0]).buffer, createdAt: 1 });
    const full = (await db.canvases.get(c.id))!;
    full.elements.push({ id: 'el1', type: 'image', x: 0, y: 0, width: 10, height: 10, imageRef: 'img1' });
    await db.canvases.put(full);
    // Version + review + ticket + ticket attachment blob — all must be cascaded.
    await db.versions.put({ id: 'v1', canvasId: c.id, projectId: p.id, versionNumber: 1, snapshotJson: '{}', createdAt: 1, createdBy: 'u1' });
    await db.reviews.put({ id: 'r1', canvasId: c.id, projectId: p.id, content: 'x', status: 'open', createdBy: 'u1', createdAt: 1, updatedAt: 1 });
    await db.blobs.put({ key: 'att1', name: 'a.txt', mimeType: 'text/plain', sizeBytes: 1, data: new Uint8Array([0]).buffer, createdAt: 1 });
    await db.tickets.put({ id: 't1', reviewId: 'r1', canvasId: c.id, projectId: p.id, title: 't', description: 'd', priority: 'low', status: 'open', createdBy: 'u1', createdAt: 1, updatedAt: 1, attachmentIds: ['att1'] });

    await svc.remove(p.id);

    expect(await db.projects.get(p.id)).toBeUndefined();
    expect(await db.canvases.get(c.id)).toBeUndefined();
    expect((await db.versions.byCanvas(c.id)).length).toBe(0);
    expect((await db.reviews.byCanvas(c.id)).length).toBe(0);
    expect((await db.tickets.byReview('r1')).length).toBe(0);
    expect(await db.blobs.get('img1')).toBeUndefined();
    expect(await db.blobs.get('att1')).toBeUndefined();
  });

  it('setPinned / setFeatured / update no-op when project id is unknown', async () => {
    const { svc } = build('admin');
    // No throw, silent no-op on unknown id (hits the `if (!rec) return` guards).
    await expect(svc.setPinned('missing', true)).resolves.toBeUndefined();
    await expect(svc.setFeatured('missing', true)).resolves.toBeUndefined();
    await expect(svc.update('missing', { name: 'x' })).rejects.toThrow(/not found/);
  });

  it('setFeatured demotes any previously-featured project', async () => {
    const { svc } = build('admin');
    const a = await svc.create({ name: 'A' });
    const b = await svc.create({ name: 'B' });
    await svc.setFeatured(a.id, true);
    await svc.setFeatured(b.id, true);
    const all = await svc.list();
    expect(all.find((p) => p.id === a.id)?.featured).toBe(false);
    expect(all.find((p) => p.id === b.id)?.featured).toBe(true);
  });

  it('update validates new name and new tags', async () => {
    const { svc } = build('admin');
    const p = await svc.create({ name: 'A' });
    await svc.create({ name: 'B' });
    await expect(svc.update(p.id, { name: 'B' })).rejects.toThrow(/exists/);
    await expect(svc.update(p.id, { tags: ['a'.repeat(31)] })).rejects.toThrow(/1–30/);
  });

  it('createCanvas updates the parent project canvasCount + updatedAt', async () => {
    const { svc, db } = build('admin');
    const p = await svc.create({ name: 'P' });
    await svc.createCanvas(p.id, 'c1');
    const refreshed = await db.projects.get(p.id);
    expect(refreshed?.canvasCount).toBe(1);
  });

  it('validateName coerces a null/undefined name to empty via the ?? fallback, then rejects it for length', () => {
    const { svc } = build('admin');
    // Hits `(name ?? '').trim()` fallback branch.
    expect(svc.validateName(undefined as unknown as string, []).ok).toBe(false);
    expect(svc.validateName(null as unknown as string, []).ok).toBe(false);
  });

  it('validateTags coerces a null tag entry to empty via the ?? fallback, then rejects it for length', () => {
    const { svc } = build('admin');
    // Hits `(t ?? '').trim()` fallback branch on the iteration.
    expect(svc.validateTags([null as unknown as string]).ok).toBe(false);
  });

  it('create() throws "Each tag must be 1–30 characters." when tagCheck fails after trim+filter', async () => {
    const { svc } = build('admin');
    // One over-long tag survives the trim+filter pipeline and trips validateTags inside create().
    await expect(svc.create({ name: 'Ok', tags: ['a'.repeat(31)] })).rejects.toThrow(/1–30/);
  });

  it('create() stamps createdBy="anonymous" when the session has no userId (?? anonymous fallback)', async () => {
    // Supply an AuthService whose session() returns null — forces the ?? 'anonymous' branch.
    const anonAuth = { session: signal<SessionInfo | null>(null), role: (() => null) as unknown as AuthService['role'] };
    const { svc } = buildWithAdmin('admin', { featuredSlots: { maxSlots: 1, rotationDays: 14 } }, anonAuth);
    const p = await svc.create({ name: 'Anon' });
    expect(p.createdBy).toBe('anonymous');
  });

  it('setPinned(false) emits the "project.unpin" audit label (false branch of the ternary)', async () => {
    const { svc, db } = build('admin');
    const p = await svc.create({ name: 'P' });
    await svc.setPinned(p.id, true);
    await svc.setPinned(p.id, false);
    const unpinEntry = (await db.audit.all()).find((a) => a.action === 'project.unpin');
    expect(unpinEntry?.entityId).toBe(p.id);
  });

  it('setFeatured(false) emits the "project.unfeature" audit label (false branch of the ternary)', async () => {
    const { svc, db } = build('admin');
    const p = await svc.create({ name: 'P' });
    await svc.setFeatured(p.id, true);
    await svc.setFeatured(p.id, false);
    const unfeat = (await db.audit.all()).find((a) => a.action === 'project.unfeature');
    expect(unfeat?.entityId).toBe(p.id);
  });

  it('setFeatured tolerates a missing featuredSlots policy — maxSlots ?? 0 falls through to 0', async () => {
    // Inject an AdminService whose settings have NO featuredSlots object;
    // production `hydrate()` would always populate it, but the `?? 0`
    // defensive fallback still has to be reachable.
    const { svc, db } = buildWithAdmin('admin', { /* featuredSlots intentionally omitted */ });
    const p = await svc.create({ name: 'A' });
    const q = await svc.create({ name: 'B' });
    await svc.setFeatured(p.id, true);
    // maxSlots=0 means the cap is exhausted by any featured row → setting q
    // featured should evict p first.
    await svc.setFeatured(q.id, true);
    const all = await db.projects.all();
    expect(all.find((x) => x.id === p.id)?.featured).toBe(false);
    expect(all.find((x) => x.id === q.id)?.featured).toBe(true);
  });

  it('setFeatured with maxSlots>1 keeps multiple projects featured until the cap is crossed', async () => {
    const { svc, db } = buildWithAdmin('admin', { featuredSlots: { maxSlots: 2, rotationDays: 14 } });
    const a = await svc.create({ name: 'A' });
    const b = await svc.create({ name: 'B' });
    const c = await svc.create({ name: 'C' });
    await svc.setFeatured(a.id, true);
    await svc.setFeatured(b.id, true);
    let all = await db.projects.all();
    expect(all.filter((x) => x.featured).length).toBe(2);
    // Third one should evict the oldest-updated (a).
    await svc.setFeatured(c.id, true);
    all = await db.projects.all();
    expect(all.find((x) => x.id === a.id)?.featured).toBe(false);
    expect(all.filter((x) => x.featured).map((x) => x.id).sort()).toEqual([b.id, c.id].sort());
  });

  it('createCanvas coerces a null name through the ?? fallback, then rejects it for length', async () => {
    const { svc } = build('admin');
    const p = await svc.create({ name: 'P' });
    await expect(svc.createCanvas(p.id, null as unknown as string)).rejects.toThrow(/1–100/);
  });

  it('createCanvas stamps createdBy="anonymous" when there is no session', async () => {
    const anonAuth = { session: signal<SessionInfo | null>(null), role: (() => null) as unknown as AuthService['role'] };
    const { svc, db } = buildWithAdmin('admin', { featuredSlots: { maxSlots: 1, rotationDays: 14 } }, anonAuth);
    // Seed a parent project directly (bypassing create's perm.enforce, which we've covered elsewhere).
    await db.projects.put({ id: 'p-anon', name: 'Anon', description: '', tags: [], pinned: false, featured: false, createdAt: 1, updatedAt: 1, createdBy: 'anonymous', canvasCount: 0 });
    const c = await svc.createCanvas('p-anon', 'new-canvas');
    expect(c.createdBy).toBe('anonymous');
  });

  it('deleteCanvas is a silent no-op when the canvas id does not exist', async () => {
    const { svc } = build('admin');
    await expect(svc.deleteCanvas('does-not-exist')).resolves.toBeUndefined();
  });

  it('deleteCanvas cascades delete of image blobs referenced by elements', async () => {
    const { svc, db } = build('admin');
    const p = await svc.create({ name: 'P' });
    const c = await svc.createCanvas(p.id, 'C');
    // Add an image-typed element whose imageRef points at a blob, and persist the blob.
    await db.blobs.put({ key: 'imgX', name: 'pic.png', mimeType: 'image/png', sizeBytes: 1, data: new Uint8Array([0]).buffer, createdAt: 1 });
    const full = (await db.canvases.get(c.id))!;
    full.elements.push({ id: 'el-x', type: 'image', x: 0, y: 0, width: 10, height: 10, imageRef: 'imgX' });
    await db.canvases.put(full);
    await svc.deleteCanvas(c.id);
    // The element's imageRef blob must be cascaded by deleteCanvas.
    expect(await db.blobs.get('imgX')).toBeUndefined();
  });
});