import '../../../test-setup';
import { TestBed } from '@angular/core/testing';
import { ReviewerPanelComponent } from './reviewer-panel.component';
import { ReviewService } from './review.service';
import { PermissionService } from '../../core/services/permission.service';
import { NotificationService } from '../../core/services/notification.service';
import { DbService } from '../../core/services/db.service';
import { ReviewRecord, TicketRecord, ProjectRecord, CanvasRecord } from '../../core/models/models';

function project(id: string, name: string): ProjectRecord {
  return {
    id, name, description: '', tags: [], pinned: false, featured: false,
    createdAt: 1, updatedAt: 1, createdBy: 'u', canvasCount: 1
  };
}

function canvas(id: string, projectId: string, name: string): CanvasRecord {
  return {
    id, projectId, name, description: '',
    elements: [], connections: [], groups: [],
    viewState: { panX: 0, panY: 0, zoom: 1, gridSize: 20 },
    createdAt: 1, updatedAt: 1, createdBy: 'u', tags: []
  };
}

function review(id: string, canvasId: string, projectId: string, status: 'open' | 'resolved' | 'rejected' = 'open'): ReviewRecord {
  return {
    id, canvasId, projectId, content: 'please review',
    status, createdBy: 'u', createdAt: 10, updatedAt: 10
  };
}

function ticket(id: string, reviewId: string): TicketRecord {
  return {
    id, reviewId, canvasId: 'c1', projectId: 'p1',
    title: 't', description: 'd', priority: 'medium', status: 'open',
    createdBy: 'u', createdAt: 10, updatedAt: 10, attachmentIds: []
  };
}

function mount(opts: {
  projects?: ProjectRecord[];
  canvases?: CanvasRecord[];
  reviews?: ReviewRecord[];
  tickets?: TicketRecord[];
  can?: (p: string) => boolean;
  createReviewError?: Error;
  createTicketError?: Error;
}) {
  TestBed.resetTestingModule();
  const projects = opts.projects ?? [];
  const canvases = opts.canvases ?? [];
  const reviews = opts.reviews ?? [];
  const tickets = opts.tickets ?? [];
  const can = opts.can ?? (() => true);

  const svc = {
    listReviews: jest.fn(async () => reviews),
    listTickets: jest.fn(async () => tickets),
    createReview: jest.fn(async () => {
      if (opts.createReviewError) throw opts.createReviewError;
      return review('new', 'c1', 'p1');
    }),
    createTicket: jest.fn(async () => {
      if (opts.createTicketError) throw opts.createTicketError;
      return ticket('new', reviews[0]?.id ?? 'r1');
    }),
    updateReviewStatus: jest.fn(async () => undefined),
    updateTicketStatus: jest.fn(async () => undefined),
    uploadAttachment: jest.fn(async (file: File) => `key-${file.name}`),
    addAttachmentToTicket: jest.fn(async () => undefined),
    removeAttachmentFromTicket: jest.fn(async () => undefined),
    getAttachment: jest.fn(async (key: string) => ({ key, name: `name-${key}`, mimeType: 'text/plain', sizeBytes: 42, data: new ArrayBuffer(1), createdAt: 1 }))
  };

  const db = {
    projects: { all: jest.fn(async () => projects) },
    canvases: { all: jest.fn(async () => canvases) }
  };

  TestBed.configureTestingModule({
    imports: [ReviewerPanelComponent],
    providers: [
      { provide: ReviewService, useValue: svc as unknown as ReviewService },
      { provide: PermissionService, useValue: { can, enforce: jest.fn() } as unknown as PermissionService },
      { provide: NotificationService, useValue: { success: jest.fn(), error: jest.fn(), info: jest.fn(), warning: jest.fn() } as unknown as NotificationService },
      { provide: DbService, useValue: db as unknown as DbService }
    ]
  });

  return { fixture: TestBed.createComponent(ReviewerPanelComponent), svc };
}

describe('ReviewerPanelComponent', () => {
  it('shows an empty-state message when no reviews are present', async () => {
    const { fixture } = mount({});
    await fixture.componentInstance.ngOnInit();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="reviews-empty"]')).not.toBeNull();
  });

  it('renders a card per review with canvas name resolved, plus ticket items', async () => {
    const { fixture } = mount({
      projects: [project('p1', 'Alpha')],
      canvases: [canvas('c1', 'p1', 'Main')],
      reviews: [review('r1', 'c1', 'p1')],
      tickets: [ticket('t1', 'r1')]
    });
    await fixture.componentInstance.ngOnInit();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="review-item-r1"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="ticket-item-t1"]')).not.toBeNull();
    expect(el.textContent).toContain('Main');
  });

  it('canvasName falls back to "(deleted)" when the canvas id is unknown', async () => {
    const { fixture } = mount({ canvases: [canvas('c1', 'p1', 'Main')] });
    await fixture.componentInstance.ngOnInit();
    expect(fixture.componentInstance.canvasName('c1')).toBe('Main');
    expect(fixture.componentInstance.canvasName('ghost')).toBe('(deleted)');
  });

  it('canvasesForSelected filters to the chosen project', async () => {
    const { fixture } = mount({
      projects: [project('p1', 'Alpha'), project('p2', 'Beta')],
      canvases: [canvas('c1', 'p1', 'one'), canvas('c2', 'p2', 'two')]
    });
    await fixture.componentInstance.ngOnInit();
    fixture.componentInstance.selectedProjectId = '';
    expect(fixture.componentInstance.canvasesForSelected()).toEqual([]);
    fixture.componentInstance.selectedProjectId = 'p1';
    const hits = fixture.componentInstance.canvasesForSelected().map((c) => c.id);
    expect(hits).toEqual(['c1']);
  });

  it('canSubmitReview requires project + canvas + non-empty content + permission', async () => {
    const { fixture } = mount({ can: (p) => p === 'review.create' });
    const c = fixture.componentInstance;
    expect(c.canSubmitReview()).toBe(false);
    c.selectedProjectId = 'p1';
    c.selectedCanvasId = 'c1';
    c.reviewContent = '   ';
    expect(c.canSubmitReview()).toBe(false);
    c.reviewContent = 'real content';
    expect(c.canSubmitReview()).toBe(true);
  });

  it('canSubmitReview is false when perm denies review.create', async () => {
    const { fixture } = mount({ can: () => false });
    const c = fixture.componentInstance;
    c.selectedProjectId = 'p1';
    c.selectedCanvasId = 'c1';
    c.reviewContent = 'x';
    expect(c.canSubmitReview()).toBe(false);
  });

  it('ticketsFor returns only tickets whose reviewId matches', async () => {
    const { fixture } = mount({
      reviews: [review('r1', 'c1', 'p1')],
      tickets: [ticket('t1', 'r1'), ticket('t2', 'r2')]
    });
    await fixture.componentInstance.ngOnInit();
    const hits = fixture.componentInstance.ticketsFor('r1').map((t) => t.id);
    expect(hits).toEqual(['t1']);
  });

  it('addReview success clears content, toasts, and refreshes', async () => {
    const { fixture, svc } = mount({});
    await fixture.componentInstance.ngOnInit();
    fixture.componentInstance.selectedProjectId = 'p1';
    fixture.componentInstance.selectedCanvasId = 'c1';
    fixture.componentInstance.reviewContent = 'good review';
    await fixture.componentInstance.addReview();
    expect(svc.createReview).toHaveBeenCalled();
    expect(fixture.componentInstance.reviewContent).toBe('');
    const notif = TestBed.inject(NotificationService) as unknown as { success: jest.Mock };
    expect(notif.success).toHaveBeenCalled();
  });

  it('addReview surfaces service errors through the notification service', async () => {
    const { fixture } = mount({ createReviewError: new Error('too short') });
    await fixture.componentInstance.ngOnInit();
    fixture.componentInstance.selectedProjectId = 'p1';
    fixture.componentInstance.selectedCanvasId = 'c1';
    fixture.componentInstance.reviewContent = 'x';
    await fixture.componentInstance.addReview();
    const notif = TestBed.inject(NotificationService) as unknown as { error: jest.Mock };
    expect(notif.error).toHaveBeenCalledWith('too short');
  });

  it('addTicket uses the per-review draft and resets it on success', async () => {
    const r = review('r1', 'c1', 'p1');
    const { fixture, svc } = mount({ reviews: [r] });
    await fixture.componentInstance.ngOnInit();
    fixture.componentInstance.ticketDrafts[r.id] = { title: 't', description: 'd', priority: 'high', attachmentIds: [] };
    await fixture.componentInstance.addTicket(r);
    expect(svc.createTicket).toHaveBeenCalledWith(expect.objectContaining({ reviewId: 'r1', title: 't', priority: 'high' }));
    expect(fixture.componentInstance.ticketDrafts[r.id]).toEqual({ title: '', description: '', priority: 'medium', attachmentIds: [] });
  });

  it('addTicket surfaces service errors via notification.error', async () => {
    const r = review('r1', 'c1', 'p1');
    const { fixture } = mount({ reviews: [r], createTicketError: new Error('bad title') });
    await fixture.componentInstance.ngOnInit();
    fixture.componentInstance.ticketDrafts[r.id] = { title: '', description: 'd', priority: 'low', attachmentIds: [] };
    await fixture.componentInstance.addTicket(r);
    const notif = TestBed.inject(NotificationService) as unknown as { error: jest.Mock };
    expect(notif.error).toHaveBeenCalledWith('bad title');
  });

  it('setReviewStatus / setTicketStatus delegate to the service and refresh', async () => {
    const r = review('r1', 'c1', 'p1');
    const t = ticket('t1', 'r1');
    const { fixture, svc } = mount({ reviews: [r], tickets: [t] });
    await fixture.componentInstance.ngOnInit();
    await fixture.componentInstance.setReviewStatus(r, 'resolved');
    await fixture.componentInstance.setTicketStatus(t, 'done');
    expect(svc.updateReviewStatus).toHaveBeenCalledWith('r1', 'resolved');
    expect(svc.updateTicketStatus).toHaveBeenCalledWith('t1', 'done');
  });

  it('onDraftAttachmentPick uploads each file and stores its key in the draft', async () => {
    const r = review('r1', 'c1', 'p1');
    const { fixture, svc } = mount({ reviews: [r] });
    await fixture.componentInstance.ngOnInit();
    const f1 = new File(['a'], 'a.txt', { type: 'text/plain' });
    const f2 = new File(['bb'], 'b.txt', { type: 'text/plain' });
    const input = { target: { files: [f1, f2], value: 'x' } } as unknown as Event;
    await fixture.componentInstance.onDraftAttachmentPick(input, r.id);
    expect(svc.uploadAttachment).toHaveBeenCalledTimes(2);
    expect(fixture.componentInstance.ticketDrafts[r.id].attachmentIds).toEqual(['key-a.txt', 'key-b.txt']);
    // Metadata cached via the picker path — exposed by attachmentName/attachmentMeta.
    expect(fixture.componentInstance.attachmentName('key-a.txt')).toBe('a.txt');
    const meta = fixture.componentInstance.attachmentMeta('key-a.txt');
    expect(meta?.sizeBytes).toBe(1);
    // Removing a draft attachment strips it from the list.
    fixture.componentInstance.removeDraftAttachment(r.id, 'key-a.txt');
    expect(fixture.componentInstance.ticketDrafts[r.id].attachmentIds).toEqual(['key-b.txt']);
  });

  it('onDraftAttachmentPick surfaces upload errors through notification.error without blowing up the rest of the batch', async () => {
    const r = review('r1', 'c1', 'p1');
    const { fixture, svc } = mount({ reviews: [r] });
    await fixture.componentInstance.ngOnInit();
    (svc.uploadAttachment as jest.Mock)
      .mockRejectedValueOnce(new Error('disk full'))
      .mockResolvedValueOnce('key-b.txt');
    const f1 = new File(['a'], 'a.txt', { type: 'text/plain' });
    const f2 = new File(['b'], 'b.txt', { type: 'text/plain' });
    const input = { target: { files: [f1, f2], value: 'x' } } as unknown as Event;
    await fixture.componentInstance.onDraftAttachmentPick(input, r.id);
    const notif = TestBed.inject(NotificationService) as unknown as { error: jest.Mock };
    expect(notif.error).toHaveBeenCalledWith(expect.stringMatching(/disk full/));
    expect(fixture.componentInstance.ticketDrafts[r.id].attachmentIds).toEqual(['key-b.txt']);
  });

  it('onAddAttachment uploads + attaches to an existing ticket and triggers a refresh', async () => {
    const r = review('r1', 'c1', 'p1');
    const t = ticket('t1', 'r1');
    const { fixture, svc } = mount({ reviews: [r], tickets: [t] });
    await fixture.componentInstance.ngOnInit();
    const file = new File(['x'], 'c.txt', { type: 'text/plain' });
    const input = { target: { files: [file], value: 'x' } } as unknown as Event;
    await fixture.componentInstance.onAddAttachment(input, t);
    expect(svc.uploadAttachment).toHaveBeenCalledWith(file);
    expect(svc.addAttachmentToTicket).toHaveBeenCalledWith('t1', 'key-c.txt');
  });

  it('onAddAttachment is a no-op when the user cancels the file dialog', async () => {
    const t = ticket('t1', 'r1');
    const { fixture, svc } = mount({ reviews: [review('r1', 'c1', 'p1')], tickets: [t] });
    await fixture.componentInstance.ngOnInit();
    const input = { target: { files: [], value: 'x' } } as unknown as Event;
    await fixture.componentInstance.onAddAttachment(input, t);
    expect(svc.uploadAttachment).not.toHaveBeenCalled();
  });

  it('removeAttachment delegates to the service and refreshes', async () => {
    const r = review('r1', 'c1', 'p1');
    const t = ticket('t1', 'r1');
    const { fixture, svc } = mount({ reviews: [r], tickets: [t] });
    await fixture.componentInstance.ngOnInit();
    await fixture.componentInstance.removeAttachment(t, 'k1');
    expect(svc.removeAttachmentFromTicket).toHaveBeenCalledWith('t1', 'k1');
  });

  it('openAttachment fetches the record and runs the download sequence', async () => {
    const { fixture, svc } = mount({ reviews: [review('r1', 'c1', 'p1')] });
    await fixture.componentInstance.ngOnInit();
    const urlAny = URL as unknown as { createObjectURL: (b: Blob) => string; revokeObjectURL: (u: string) => void };
    const origCreate = urlAny.createObjectURL;
    const origRevoke = urlAny.revokeObjectURL;
    const createSpy = jest.fn((_b: Blob) => 'blob:fake');
    const revokeSpy = jest.fn((_u: string) => undefined);
    urlAny.createObjectURL = createSpy;
    urlAny.revokeObjectURL = revokeSpy;
    try {
      await fixture.componentInstance.openAttachment('k1');
      expect(svc.getAttachment).toHaveBeenCalledWith('k1');
      expect(createSpy).toHaveBeenCalled();
      expect(revokeSpy).toHaveBeenCalledWith('blob:fake');
    } finally {
      urlAny.createObjectURL = origCreate;
      urlAny.revokeObjectURL = origRevoke;
    }
  });

  it('openAttachment surfaces an error toast when the record is missing', async () => {
    const { fixture, svc } = mount({ reviews: [review('r1', 'c1', 'p1')] });
    await fixture.componentInstance.ngOnInit();
    (svc.getAttachment as jest.Mock).mockResolvedValueOnce(undefined);
    await fixture.componentInstance.openAttachment('missing');
    const notif = TestBed.inject(NotificationService) as unknown as { error: jest.Mock };
    expect(notif.error).toHaveBeenCalledWith('Attachment not found.');
  });

  it('formatSize renders B / KB / MB based on the byte count magnitude', () => {
    const { fixture } = mount({});
    const c = fixture.componentInstance;
    expect(c.formatSize(512)).toBe('512 B');
    expect(c.formatSize(2048)).toBe('2.0 KB');
    expect(c.formatSize(5 * 1024 * 1024)).toBe('5.0 MB');
  });

  it('attachmentName falls back to a truncated key when metadata has not hydrated yet', () => {
    const { fixture } = mount({});
    // No upload path invoked => cache is empty; fall-through is the first 8 chars of the key.
    expect(fixture.componentInstance.attachmentName('abcdef1234567890')).toBe('abcdef12');
    expect(fixture.componentInstance.attachmentMeta('abcdef1234567890')).toBeUndefined();
  });

  it('hydrateAttachmentMeta fetches unknown keys, caches them, and skips already-cached keys on the next refresh', async () => {
    const r = review('r1', 'c1', 'p1');
    const t: TicketRecord = { ...ticket('t1', 'r1'), attachmentIds: ['k1', 'k2'] };
    const { fixture, svc } = mount({ reviews: [r], tickets: [t] });
    await fixture.componentInstance.ngOnInit();
    // First ngOnInit triggered getAttachment once per key.
    expect((svc.getAttachment as jest.Mock).mock.calls.map((c) => c[0]).sort()).toEqual(['k1', 'k2']);
    expect(fixture.componentInstance.attachmentName('k1')).toBe('name-k1');
    (svc.getAttachment as jest.Mock).mockClear();
    // Second refresh: both keys are already in the cache so the "continue" branch fires.
    await fixture.componentInstance.refresh();
    expect(svc.getAttachment).not.toHaveBeenCalled();
  });

  it('hydrateAttachmentMeta skips caching when the service returns undefined for a key', async () => {
    const r = review('r1', 'c1', 'p1');
    const t: TicketRecord = { ...ticket('t1', 'r1'), attachmentIds: ['missing'] };
    const { fixture, svc } = mount({ reviews: [r], tickets: [t] });
    (svc.getAttachment as jest.Mock).mockResolvedValueOnce(undefined);
    await fixture.componentInstance.ngOnInit();
    // No metadata cached for missing key — attachmentName falls back to the truncated key.
    expect(fixture.componentInstance.attachmentMeta('missing')).toBeUndefined();
  });

  it('onDraftAttachmentPick tolerates an input with a null FileList (?? [] fallback)', async () => {
    const r = review('r1', 'c1', 'p1');
    const { fixture, svc } = mount({ reviews: [r] });
    await fixture.componentInstance.ngOnInit();
    const input = { target: { files: null, value: 'x' } } as unknown as Event;
    await fixture.componentInstance.onDraftAttachmentPick(input, r.id);
    expect(svc.uploadAttachment).not.toHaveBeenCalled();
  });

  it('removeDraftAttachment is a no-op when the reviewId has no draft entry', () => {
    const { fixture } = mount({});
    // Unknown reviewId — `if (d)` is false and we bail early.
    expect(() => fixture.componentInstance.removeDraftAttachment('unknown-review', 'k1')).not.toThrow();
  });
});
