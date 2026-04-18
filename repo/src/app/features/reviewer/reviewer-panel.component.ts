import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ReviewService } from './review.service';
import { PermissionService } from '../../core/services/permission.service';
import { NotificationService } from '../../core/services/notification.service';
import { DbService } from '../../core/services/db.service';
import { ReviewRecord, TicketRecord, CanvasRecord, ProjectRecord } from '../../core/models/models';

@Component({
  selector: 'fc-reviewer-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="container">
      <h2>Reviews</h2>
      <div class="card">
        <h3>New review</h3>
        <div class="row">
          <select [(ngModel)]="selectedProjectId" data-testid="review-project">
            <option [ngValue]="''">Select project</option>
            <option *ngFor="let p of projects()" [ngValue]="p.id">{{ p.name }}</option>
          </select>
          <select [(ngModel)]="selectedCanvasId" data-testid="review-canvas">
            <option [ngValue]="''">Select canvas</option>
            <option *ngFor="let c of canvasesForSelected()" [ngValue]="c.id">{{ c.name }}</option>
          </select>
        </div>
        <textarea [(ngModel)]="reviewContent" maxlength="2000" placeholder="Review content" data-testid="review-content"></textarea>
        <div class="row">
          <button type="button" class="primary" (click)="addReview()" [disabled]="!canSubmitReview()" data-testid="review-submit">Add review</button>
        </div>
      </div>

      <div class="card" *ngFor="let r of reviews()" [attr.data-testid]="'review-item-' + r.id">
        <div class="row">
          <strong>Review</strong>
          <span class="badge">{{ r.status }}</span>
          <span class="muted">canvas: {{ canvasName(r.canvasId) }}</span>
        </div>
        <p>{{ r.content }}</p>
        <div class="row" *ngIf="perm.can('review.create')">
          <button type="button" (click)="setReviewStatus(r, 'resolved')">Resolved</button>
          <button type="button" (click)="setReviewStatus(r, 'rejected')">Rejected</button>
          <button type="button" (click)="setReviewStatus(r, 'open')">Reopen</button>
        </div>
        <h4>Tickets</h4>
        <ul>
          <li *ngFor="let t of ticketsFor(r.id)" [attr.data-testid]="'ticket-item-' + t.id">
            <strong>{{ t.title }}</strong>
            <span class="badge">{{ t.priority }}</span>
            <span class="badge">{{ t.status }}</span>
            <p>{{ t.description }}</p>
            <div class="row">
              <button type="button" (click)="setTicketStatus(t, 'in-progress')">In progress</button>
              <button type="button" (click)="setTicketStatus(t, 'done')">Done</button>
              <button type="button" (click)="setTicketStatus(t, 'open')">Reopen</button>
            </div>
          </li>
        </ul>
        <div *ngIf="perm.can('review.create')" class="new-ticket">
          <h5>New ticket</h5>
          <input [(ngModel)]="ticketDrafts[r.id].title" maxlength="200" placeholder="Title" [attr.data-testid]="'ticket-title-' + r.id" />
          <textarea [(ngModel)]="ticketDrafts[r.id].description" maxlength="2000" placeholder="Description" [attr.data-testid]="'ticket-desc-' + r.id"></textarea>
          <select [(ngModel)]="ticketDrafts[r.id].priority">
            <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
          </select>
          <button type="button" class="primary" (click)="addTicket(r)" [attr.data-testid]="'ticket-submit-' + r.id">Add ticket</button>
        </div>
      </div>
      <p *ngIf="reviews().length === 0" class="muted" data-testid="reviews-empty">No reviews yet.</p>
    </div>
  `,
  styles: [`
    .card { margin-bottom: 16px; }
    .new-ticket { display: flex; flex-direction: column; gap: 6px; padding: 8px 0; border-top: 1px dashed var(--border); margin-top: 8px; }
    ul { list-style: none; padding: 0; display: flex; flex-direction: column; gap: 8px; }
    li { background: var(--bg-2); padding: 10px; border-radius: 6px; }
    textarea { min-height: 80px; }
  `]
})
export class ReviewerPanelComponent implements OnInit {
  private readonly svc = inject(ReviewService);
  readonly perm = inject(PermissionService);
  private readonly notif = inject(NotificationService);
  private readonly db = inject(DbService);

  projects = signal<ProjectRecord[]>([]);
  canvases = signal<CanvasRecord[]>([]);
  reviews = signal<ReviewRecord[]>([]);
  tickets = signal<TicketRecord[]>([]);

  selectedProjectId = '';
  selectedCanvasId = '';
  reviewContent = '';
  ticketDrafts: Record<string, { title: string; description: string; priority: 'low' | 'medium' | 'high' }> = {};

  async ngOnInit(): Promise<void> {
    await this.refresh();
  }

  async refresh(): Promise<void> {
    this.projects.set((await this.db.projects.all()).sort((a, b) => a.name.localeCompare(b.name)));
    this.canvases.set(await this.db.canvases.all());
    this.reviews.set(await this.svc.listReviews());
    this.tickets.set(await this.svc.listTickets());
    for (const r of this.reviews()) {
      if (!this.ticketDrafts[r.id]) this.ticketDrafts[r.id] = { title: '', description: '', priority: 'medium' };
    }
  }

  canvasName(id: string): string {
    return this.canvases().find((c) => c.id === id)?.name ?? '(deleted)';
  }

  canvasesForSelected(): CanvasRecord[] {
    if (!this.selectedProjectId) return [];
    return this.canvases().filter((c) => c.projectId === this.selectedProjectId);
  }

  canSubmitReview(): boolean {
    return !!this.selectedProjectId && !!this.selectedCanvasId && this.reviewContent.trim().length > 0 && this.perm.can('review.create');
  }

  ticketsFor(reviewId: string): TicketRecord[] {
    return this.tickets().filter((t) => t.reviewId === reviewId);
  }

  async addReview(): Promise<void> {
    try {
      await this.svc.createReview({ canvasId: this.selectedCanvasId, projectId: this.selectedProjectId, content: this.reviewContent });
      this.reviewContent = '';
      this.notif.success('Review added.');
      await this.refresh();
    } catch (e) {
      this.notif.error((e as Error).message);
    }
  }

  async addTicket(r: ReviewRecord): Promise<void> {
    const draft = this.ticketDrafts[r.id];
    try {
      await this.svc.createTicket({ reviewId: r.id, canvasId: r.canvasId, projectId: r.projectId, ...draft });
      this.ticketDrafts[r.id] = { title: '', description: '', priority: 'medium' };
      this.notif.success('Ticket added.');
      await this.refresh();
    } catch (e) {
      this.notif.error((e as Error).message);
    }
  }

  async setReviewStatus(r: ReviewRecord, status: 'open' | 'resolved' | 'rejected'): Promise<void> {
    await this.svc.updateReviewStatus(r.id, status);
    await this.refresh();
  }

  async setTicketStatus(t: TicketRecord, status: 'open' | 'in-progress' | 'done'): Promise<void> {
    await this.svc.updateTicketStatus(t.id, status);
    await this.refresh();
  }
}
