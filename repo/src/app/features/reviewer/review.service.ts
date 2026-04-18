import { Injectable, inject } from '@angular/core';
import { DbService } from '../../core/services/db.service';
import { AuthService } from '../../core/services/auth.service';
import { PermissionService } from '../../core/services/permission.service';
import { AuditService } from '../../core/services/audit.service';
import { ReviewRecord, TicketRecord, ReviewStatus, TicketPriority, TicketStatus } from '../../core/models/models';
import { uuid } from '../../core/services/crypto.util';

@Injectable({ providedIn: 'root' })
export class ReviewService {
  private readonly db = inject(DbService);
  private readonly auth = inject(AuthService);
  private readonly perm = inject(PermissionService);
  private readonly audit = inject(AuditService);

  async listReviews(): Promise<ReviewRecord[]> {
    const all = await this.db.reviews.all();
    return all.sort((a, b) => b.createdAt - a.createdAt);
  }

  async listTickets(): Promise<TicketRecord[]> {
    const all = await this.db.tickets.all();
    return all.sort((a, b) => b.createdAt - a.createdAt);
  }

  async createReview(input: { canvasId: string; projectId: string; content: string }): Promise<ReviewRecord> {
    this.perm.enforce('review.create');
    const content = (input.content ?? '').trim();
    if (content.length < 1 || content.length > 2000) throw new Error('Review content must be 1–2000 chars.');
    const now = Date.now();
    const rec: ReviewRecord = {
      id: uuid(),
      canvasId: input.canvasId,
      projectId: input.projectId,
      content,
      status: 'open',
      createdBy: this.auth.session()?.userId ?? 'anonymous',
      createdAt: now,
      updatedAt: now
    };
    await this.db.reviews.put(rec);
    await this.audit.record(this.auth.session(), 'review.create', 'review', rec.id);
    return rec;
  }

  async updateReviewStatus(id: string, status: ReviewStatus): Promise<void> {
    const rec = await this.db.reviews.all().then((l) => l.find((r) => r.id === id));
    if (!rec) return;
    rec.status = status;
    rec.updatedAt = Date.now();
    await this.db.reviews.put(rec);
    await this.audit.record(this.auth.session(), 'review.status', 'review', id, status);
  }

  async createTicket(input: { reviewId: string; canvasId: string; projectId: string; title: string; description: string; priority: TicketPriority }): Promise<TicketRecord> {
    this.perm.enforce('review.create');
    const title = (input.title ?? '').trim();
    const desc = (input.description ?? '').trim();
    if (title.length < 1 || title.length > 200) throw new Error('Ticket title must be 1–200 chars.');
    if (desc.length < 1 || desc.length > 2000) throw new Error('Ticket description must be 1–2000 chars.');
    const now = Date.now();
    const rec: TicketRecord = {
      id: uuid(),
      reviewId: input.reviewId,
      canvasId: input.canvasId,
      projectId: input.projectId,
      title,
      description: desc,
      priority: input.priority,
      status: 'open',
      createdBy: this.auth.session()?.userId ?? 'anonymous',
      createdAt: now,
      updatedAt: now,
      attachmentIds: []
    };
    await this.db.tickets.put(rec);
    await this.audit.record(this.auth.session(), 'ticket.create', 'ticket', rec.id);
    return rec;
  }

  async updateTicketStatus(id: string, status: TicketStatus): Promise<void> {
    const rec = await this.db.tickets.all().then((l) => l.find((t) => t.id === id));
    if (!rec) return;
    rec.status = status;
    rec.updatedAt = Date.now();
    await this.db.tickets.put(rec);
    await this.audit.record(this.auth.session(), 'ticket.status', 'ticket', id, status);
  }
}
