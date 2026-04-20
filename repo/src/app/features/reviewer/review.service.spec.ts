import '../../../test-setup';
import { TestBed } from '@angular/core/testing';
import { ReviewService } from './review.service';
import { DbService } from '../../core/services/db.service';
import { AppConfigService, buildAppConfig } from '../../config/app-config.service';
import { AuthService } from '../../core/services/auth.service';
import { signal } from '@angular/core';
import { SessionInfo } from '../../core/models/models';
// DbService is inferred via TestBed.inject; no re-import needed but keep type for clarity.
void DbService;

function fakeAuth(role: 'admin' | 'editor' | 'reviewer'): Partial<AuthService> {
  const s = signal<SessionInfo | null>({ userId: 'u1', username: 'u', role, issuedAt: 1, lastActivity: 1 });
  return { session: s, role: (() => s()?.role ?? null) as unknown as AuthService['role'] };
}

describe('ReviewService', () => {
  beforeEach(async () => {
    (globalThis as unknown as { __resetIndexedDB: () => void }).__resetIndexedDB();
  });

  function build(role: 'admin' | 'editor' | 'reviewer'): { svc: ReviewService; db: DbService } {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: AppConfigService, useValue: { get: () => buildAppConfig() } as AppConfigService },
        { provide: AuthService, useValue: fakeAuth(role) }
      ]
    });
    return { svc: TestBed.inject(ReviewService), db: TestBed.inject(DbService) };
  }

  it('creates reviews with validation', async () => {
    const { svc } = build('reviewer');
    await expect(svc.createReview({ canvasId: 'c', projectId: 'p', content: '' })).rejects.toThrow(/1–2000/);
    const ok = await svc.createReview({ canvasId: 'c', projectId: 'p', content: 'looks good' });
    expect(ok.status).toBe('open');
    const long = 'x'.repeat(2001);
    await expect(svc.createReview({ canvasId: 'c', projectId: 'p', content: long })).rejects.toThrow();
  });

  it('creates tickets with validation', async () => {
    const { svc } = build('editor');
    const r = await svc.createReview({ canvasId: 'c', projectId: 'p', content: 'ok' });
    await expect(svc.createTicket({ reviewId: r.id, canvasId: 'c', projectId: 'p', title: '', description: 'd', priority: 'low' })).rejects.toThrow();
    await expect(svc.createTicket({ reviewId: r.id, canvasId: 'c', projectId: 'p', title: 't', description: '', priority: 'low' })).rejects.toThrow();
    const t = await svc.createTicket({ reviewId: r.id, canvasId: 'c', projectId: 'p', title: 't', description: 'd', priority: 'high' });
    expect(t.priority).toBe('high');
  });

  it('updates statuses', async () => {
    const { svc } = build('admin');
    const r = await svc.createReview({ canvasId: 'c', projectId: 'p', content: 'x' });
    await svc.updateReviewStatus(r.id, 'resolved');
    const reviews = await svc.listReviews();
    expect(reviews[0].status).toBe('resolved');
    const t = await svc.createTicket({ reviewId: r.id, canvasId: 'c', projectId: 'p', title: 't', description: 'd', priority: 'low' });
    await svc.updateTicketStatus(t.id, 'done');
    const tickets = await svc.listTickets();
    expect(tickets[0].status).toBe('done');
    await svc.updateReviewStatus('missing', 'resolved');
    await svc.updateTicketStatus('missing', 'done');
  });

  it('createReview/createTicket stamp createdBy="anonymous" when there is no session', async () => {
    // Null-session branch for `session?.userId ?? 'anonymous'`.
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: AppConfigService, useValue: { get: () => buildAppConfig() } as AppConfigService },
        { provide: AuthService, useValue: { session: signal<SessionInfo | null>(null), role: () => null } as unknown as AuthService }
      ]
    });
    const svc = TestBed.inject(ReviewService);
    const r = await svc.createReview({ canvasId: 'c', projectId: 'p', content: 'ok' });
    expect(r.createdBy).toBe('anonymous');
    const t = await svc.createTicket({ reviewId: r.id, canvasId: 'c', projectId: 'p', title: 't', description: 'd', priority: 'low' });
    expect(t.createdBy).toBe('anonymous');
  });

  it('createTicket tolerates missing title/description fields without crashing', async () => {
    const { svc } = build('editor');
    // input.title ?? '' / input.description ?? '' — null coalescing branch.
    const input = { reviewId: 'r', canvasId: 'c', projectId: 'p', priority: 'low' } as unknown as Parameters<ReturnType<typeof build>['svc']['createTicket']>[0];
    await expect(svc.createTicket(input)).rejects.toThrow(/1–200/);
  });

  it('uploadAttachment persists a File blob into IndexedDB and returns the generated key', async () => {
    const { svc, db } = build('editor');
    const file = new File([new Uint8Array([1, 2, 3])], 'note.txt', { type: 'text/plain' });
    const key = await svc.uploadAttachment(file);
    expect(key).toBeTruthy();
    const rec = await db.blobs.get(key);
    expect(rec?.name).toBe('note.txt');
    expect(rec?.mimeType).toBe('text/plain');
    expect(rec?.sizeBytes).toBe(3);
    // getAttachment round-trips the same record.
    const round = await svc.getAttachment(key);
    expect(round?.key).toBe(key);
  });

  it('uploadAttachment falls back to octet-stream when the File has no MIME type', async () => {
    const { svc, db } = build('editor');
    const file = new File([new Uint8Array([0])], 'blob', { type: '' });
    const key = await svc.uploadAttachment(file);
    const rec = await db.blobs.get(key);
    expect(rec?.mimeType).toBe('application/octet-stream');
  });

  it('addAttachmentToTicket appends a unique key; removeAttachmentFromTicket strips it', async () => {
    const { svc } = build('editor');
    const r = await svc.createReview({ canvasId: 'c', projectId: 'p', content: 'ok' });
    const t = await svc.createTicket({ reviewId: r.id, canvasId: 'c', projectId: 'p', title: 't', description: 'd', priority: 'low' });
    await svc.addAttachmentToTicket(t.id, 'k1');
    // Idempotent — same key twice does not duplicate.
    await svc.addAttachmentToTicket(t.id, 'k1');
    let refreshed = (await svc.listTickets()).find((x) => x.id === t.id);
    expect(refreshed?.attachmentIds).toEqual(['k1']);
    await svc.addAttachmentToTicket(t.id, 'k2');
    await svc.removeAttachmentFromTicket(t.id, 'k1');
    refreshed = (await svc.listTickets()).find((x) => x.id === t.id);
    expect(refreshed?.attachmentIds).toEqual(['k2']);
    // Removing a missing ticket is a silent no-op.
    await expect(svc.removeAttachmentFromTicket('missing', 'kx')).resolves.toBeUndefined();
    // Adding to a missing ticket throws.
    await expect(svc.addAttachmentToTicket('missing', 'kx')).rejects.toThrow(/not found/);
  });

  it('createTicket honors a caller-provided attachmentIds array', async () => {
    const { svc } = build('editor');
    const r = await svc.createReview({ canvasId: 'c', projectId: 'p', content: 'ok' });
    const t = await svc.createTicket({ reviewId: r.id, canvasId: 'c', projectId: 'p', title: 't', description: 'd', priority: 'low', attachmentIds: ['k1', 'k2'] });
    expect(t.attachmentIds).toEqual(['k1', 'k2']);
  });
});