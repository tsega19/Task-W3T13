import '../../../test-setup';
import { TestBed } from '@angular/core/testing';
import { AuditService } from './audit.service';
import { DbService } from './db.service';

describe('AuditService', () => {
  let svc: AuditService;
  let db: DbService;

  beforeEach(async () => {
    (globalThis as unknown as { __resetIndexedDB: () => void }).__resetIndexedDB();
    TestBed.configureTestingModule({ providers: [] });
    svc = TestBed.inject(AuditService);
    db = TestBed.inject(DbService);
    await db.init();
  });

  it('is append-only — never prunes older entries', async () => {
    const session = { userId: 'u1', username: 'alice', role: 'admin' as const, issuedAt: 1, lastActivity: 1 };
    for (let i = 0; i < 50; i++) {
      await svc.record(session, 'a', 'e', `${i}`);
    }
    const list = await svc.list();
    expect(list.length).toBe(50);
    expect(list[0].timestamp).toBeGreaterThanOrEqual(list[list.length - 1].timestamp);
  });

  it('falls back to anonymous when no session', async () => {
    await svc.record(null, 'noop', 'e', 'x');
    const list = await svc.list();
    expect(list[0].username).toBe('anonymous');
  });
});