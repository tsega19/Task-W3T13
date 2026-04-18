import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NotificationService } from '../../core/services/notification.service';

@Component({
  selector: 'fc-toast-container',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="toast-container" aria-live="polite">
      <div *ngFor="let t of notif.toasts()" class="toast" [ngClass]="t.kind" (click)="notif.dismiss(t.id)" [attr.data-testid]="'toast-' + t.kind">
        {{ t.message }}
      </div>
    </div>
  `
})
export class ToastContainerComponent {
  readonly notif = inject(NotificationService);
}
