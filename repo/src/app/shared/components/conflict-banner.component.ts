import { Component, inject, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BroadcastService } from '../../core/services/broadcast.service';

@Component({
  selector: 'fc-conflict-banner',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div *ngIf="bc.conflict() as c" class="banner" role="alert" data-testid="conflict-banner">
      <span>Another tab saved this canvas.</span>
      <button type="button" (click)="reload.emit()" data-testid="conflict-reload">Reload latest</button>
      <button type="button" (click)="keep.emit()" data-testid="conflict-keep">Keep mine</button>
    </div>
  `,
  styles: [`
    .banner {
      position: sticky;
      top: 0;
      z-index: 100;
      background: var(--warning);
      color: #0a1220;
      padding: 8px 16px;
      display: flex;
      gap: 10px;
      align-items: center;
      font-weight: 600;
    }
  `]
})
export class ConflictBannerComponent {
  readonly bc = inject(BroadcastService);
  readonly reload = output<void>();
  readonly keep = output<void>();
}
