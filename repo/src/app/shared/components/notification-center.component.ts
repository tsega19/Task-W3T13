import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NotificationService } from '../../core/services/notification.service';

@Component({
  selector: 'fc-notification-center',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="notif-wrap">
      <button type="button" class="bell" (click)="toggle()" data-testid="notif-bell" [attr.aria-expanded]="open()">
        <span aria-hidden="true">🔔</span>
        <span class="count" *ngIf="unreadCount() > 0" data-testid="notif-unread">{{ unreadCount() }}</span>
      </button>
      <div class="panel" *ngIf="open()" data-testid="notif-panel">
        <header>
          <strong>Notifications</strong>
          <button type="button" class="link" (click)="notif.clearMessages()" data-testid="notif-clear">Clear all</button>
        </header>
        <ul *ngIf="notif.messages().length > 0" class="list">
          <li *ngFor="let m of notif.messages()"
              [class.unread]="!m.read"
              [ngClass]="m.kind"
              (click)="notif.markRead(m.id)"
              [attr.data-testid]="'notif-msg-' + m.id">
            <div class="row">
              <strong>{{ m.title }}</strong>
              <span class="muted small">{{ formatTime(m.createdAt) }}</span>
            </div>
            <p class="body">{{ m.body }}</p>
          </li>
        </ul>
        <p *ngIf="notif.messages().length === 0" class="muted empty" data-testid="notif-empty">No notifications.</p>
      </div>
    </div>
  `,
  styles: [`
    .notif-wrap { position: relative; }
    .bell { position: relative; background: transparent; border: none; color: var(--text); cursor: pointer; font-size: 18px; padding: 4px 8px; }
    .count { position: absolute; top: -2px; right: -2px; background: var(--danger, #ef4444); color: #fff; font-size: 10px; border-radius: 10px; padding: 1px 6px; }
    .panel { position: absolute; right: 0; top: 110%; width: 360px; max-height: 60vh; overflow-y: auto; background: var(--bg-2); border: 1px solid var(--border); border-radius: 6px; box-shadow: 0 8px 24px rgba(0,0,0,0.35); z-index: 100; padding: 8px; }
    .panel header { display: flex; justify-content: space-between; align-items: center; padding: 4px 8px 8px; border-bottom: 1px solid var(--border); }
    .link { background: transparent; border: none; color: var(--primary); cursor: pointer; font-size: 12px; }
    .list { list-style: none; padding: 0; margin: 0; }
    .list li { padding: 8px; border-bottom: 1px solid var(--border); cursor: pointer; }
    .list li .row { display: flex; justify-content: space-between; gap: 8px; }
    .list li.unread { background: rgba(56,189,248,0.08); }
    .list li .body { margin: 4px 0 0; font-size: 12px; color: var(--muted); white-space: pre-wrap; word-break: break-word; }
    .small { font-size: 11px; }
    .empty { padding: 12px; text-align: center; }
  `]
})
export class NotificationCenterComponent {
  readonly notif = inject(NotificationService);
  readonly open = signal<boolean>(false);
  readonly unreadCount = computed(() => this.notif.messages().filter((m) => !m.read).length);

  toggle(): void {
    this.open.update((v) => !v);
  }

  formatTime(ts: number): string {
    const d = new Date(ts);
    return d.toISOString().replace('T', ' ').slice(11, 16);
  }
}
