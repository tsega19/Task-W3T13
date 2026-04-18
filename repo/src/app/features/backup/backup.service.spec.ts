import '../../../test-setup';
import { TestBed } from '@angular/core/testing';
import { BackupService } from './backup.service';
import { DbService } from '../../core/services/db.service';
import { AppConfigService, buildAppConfig } from '../../config/app-config.service';
import { AuthService } from '../../core/services/auth.service';
import { signal } from '@angular/core';
import { SessionInfo } from '../../core/models/models';

describe('BackupService', () => {
  beforeEach(async () => {
    (globalThis as unknown as { __resetIndexedDB: () => void }).__resetIndexedDB();
  });

  function build(role: 'admin' | 'editor'): { svc: BackupService; db: DbService } {
    const session = signal<SessionInfo | null>({ userId: 'u', username: 'u', role, issuedAt: 1, lastActivity: 1 });
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: AppConfigService, useValue: { get: () => buildAppConfig() } as AppConfigService },
        { provide: AuthService, useValue: { session, role: () => role } as unknown as AuthService }
      ]
    });
    return { svc: TestBed.inject(BackupService), db: TestBed.inject(DbService) };
  }

  it('non-admin export still succeeds (roles are advisory, not enforced)', async () => {
    const { svc, db } = build('editor');
    await db.init();
    await expect(svc.export()).resolves.toBeDefined();
  });

  it('round-trips projects through a JSON bundle', async () => {
    const { svc, db } = build('admin');
    await db.init();
    await db.projects.put({ id: 'p', name: 'P', description: '', tags: [], pinned: false, featured: false, createdAt: 1, updatedAt: 1, createdBy: 'u', canvasCount: 0 });
    const bundle = await svc.export();
    const jsonRoundTrip = JSON.parse(JSON.stringify(bundle)) as typeof bundle;
    await db.projects.delete('p');
    expect((await db.projects.all()).length).toBe(0);
    await svc.restore(jsonRoundTrip);
    expect((await db.projects.all()).length).toBe(1);
    expect(jsonRoundTrip.stores['blobs']).toBeDefined();
  });

  it('restore preserves the pre-existing immutable audit log', async () => {
    const { svc, db } = build('admin');
    await db.init();
    // Seed an existing audit entry that was NOT in the incoming bundle.
    await db.audit.put({
      id: 'pre-existing',
      timestamp: 1000,
      userId: 'u',
      username: 'u',
      action: 'boot',
      entityType: 'app',
      entityId: 'x'
    });
    const bundle = await svc.export();
    const jsonRoundTrip = JSON.parse(JSON.stringify(bundle)) as typeof bundle;
    // Pretend the operator hand-edits the bundle to drop the audit entry.
    jsonRoundTrip.stores['audit_log'] = [];
    await svc.restore(jsonRoundTrip);
    const after = await db.audit.all();
    // Pre-existing entry must survive the restore (immutable log).
    expect(after.some((e) => e.id === 'pre-existing')).toBe(true);
    // Restore must also have appended bookend events of its own.
    expect(after.some((e) => e.action === 'backup.restore.begin')).toBe(true);
    expect(after.some((e) => e.action === 'backup.restore.complete')).toBe(true);
  });

  it('base64-encodes blob records during export (no raw ArrayBuffer leak)', async () => {
    const { svc, db } = build('admin');
    await db.init();
    await db.blobs.put({ key: 'b1', name: 'a.png', mimeType: 'image/png', sizeBytes: 3, data: new Uint8Array([1, 2, 3]).buffer, createdAt: 1 });
    const bundle = await svc.export();
    const entry = (bundle.stores['blobs'] as Array<Record<string, unknown>>)[0];
    expect(entry['key']).toBe('b1');
    expect(entry['sizeBytes']).toBe(3);
    expect(typeof entry['dataBase64']).toBe('string');
    expect(entry).not.toHaveProperty('data');
  });

  it('rejects wrong version', async () => {
    const { svc } = build('admin');
    await expect(svc.restore({ version: 2 } as unknown as Parameters<BackupService['restore']>[0])).rejects.toThrow(/version/);
  });
});