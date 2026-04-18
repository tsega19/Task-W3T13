import { Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'fc-modal',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="modal-backdrop" (click)="onBackdrop($event)" data-testid="modal-backdrop">
      <div class="modal" role="dialog" [attr.aria-labelledby]="titleId">
        <h3 [id]="titleId">{{ title() }}</h3>
        <div class="modal-body"><ng-content /></div>
      </div>
    </div>
  `,
  styles: [`.modal-body { margin-top: 12px; }`]
})
export class ModalComponent {
  readonly title = input<string>('');
  readonly dismissible = input<boolean>(true);
  readonly backdropClose = output<void>();
  readonly titleId = `modal-title-${Math.random().toString(36).slice(2, 8)}`;

  onBackdrop(event: MouseEvent): void {
    if (!this.dismissible()) return;
    const el = event.target as HTMLElement;
    if (el.classList.contains('modal-backdrop')) this.backdropClose.emit();
  }
}
