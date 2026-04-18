import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminService, AdminSettings } from './admin.service';
import { NotificationService } from '../../core/services/notification.service';
import { uuid } from '../../core/services/crypto.util';

@Component({
  selector: 'fc-admin-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="container">
      <h2>Admin Panel</h2>
      <section class="card">
        <h3>Announcements</h3>
        <ul>
          <li *ngFor="let a of draft().announcements; let i = index">
            <input [(ngModel)]="draft().announcements[i]" />
            <button type="button" class="danger" (click)="removeAnn(i)">Remove</button>
          </li>
        </ul>
        <button type="button" (click)="addAnn()" data-testid="admin-add-announcement">+ Announcement</button>
      </section>

      <section class="card">
        <h3>Tag Palette</h3>
        <div class="row wrap">
          <span class="tag" *ngFor="let t of draft().tagPalette; let i = index">
            {{ t }} <button type="button" class="xs" (click)="removeTag(i)">×</button>
          </span>
        </div>
        <div class="row">
          <input [(ngModel)]="newTag" placeholder="New tag" data-testid="admin-new-tag" />
          <button type="button" (click)="addTag()" data-testid="admin-add-tag">Add tag</button>
        </div>
      </section>

      <section class="card">
        <h3>Dictionaries</h3>
        <ul>
          <li *ngFor="let d of draft().dictionaries; let i = index">
            <input [(ngModel)]="d.term" placeholder="Term" />
            <input [(ngModel)]="d.definition" placeholder="Definition" />
            <button type="button" class="danger" (click)="removeDict(i)">Remove</button>
          </li>
        </ul>
        <button type="button" (click)="addDict()" data-testid="admin-add-dict">+ Entry</button>
      </section>

      <section class="card">
        <h3>Templates</h3>
        <ul>
          <li *ngFor="let t of draft().templates; let i = index">
            <input [(ngModel)]="t.name" placeholder="Name" />
            <textarea [(ngModel)]="t.body" placeholder="Body"></textarea>
            <button type="button" class="danger" (click)="removeTemplate(i)">Remove</button>
          </li>
        </ul>
        <button type="button" (click)="addTemplate()" data-testid="admin-add-template">+ Template</button>
      </section>

      <div class="row">
        <button type="button" class="primary" (click)="save()" data-testid="admin-save">Save settings</button>
      </div>
    </div>
  `,
  styles: [`
    .card { margin-bottom: 16px; }
    ul { list-style: none; padding: 0; display: flex; flex-direction: column; gap: 8px; }
    li { display: flex; gap: 8px; align-items: flex-start; }
    textarea { min-height: 80px; }
    .wrap { flex-wrap: wrap; }
    .tag { background: var(--surface-2); padding: 2px 10px; border-radius: 10px; font-size: 12px; display: inline-flex; align-items: center; gap: 4px; margin-right: 6px; }
    .xs { background: transparent; border: none; color: var(--danger); cursor: pointer; padding: 0 4px; }
  `]
})
export class AdminPanelComponent {
  private readonly svc = inject(AdminService);
  private readonly notif = inject(NotificationService);
  draft = signal<AdminSettings>(this.clone(this.svc.settings()));
  newTag = '';

  private clone(s: AdminSettings): AdminSettings {
    return {
      dictionaries: s.dictionaries.map((d) => ({ ...d })),
      templates: s.templates.map((t) => ({ ...t })),
      tagPalette: [...s.tagPalette],
      announcements: [...s.announcements]
    };
  }

  addAnn(): void { this.draft().announcements.push(''); this.draft.set({ ...this.draft() }); }
  removeAnn(i: number): void { this.draft().announcements.splice(i, 1); this.draft.set({ ...this.draft() }); }

  addTag(): void {
    const t = this.newTag.trim();
    if (!t || this.draft().tagPalette.includes(t)) return;
    this.draft().tagPalette.push(t);
    this.newTag = '';
    this.draft.set({ ...this.draft() });
  }
  removeTag(i: number): void { this.draft().tagPalette.splice(i, 1); this.draft.set({ ...this.draft() }); }

  addDict(): void { this.draft().dictionaries.push({ id: uuid(), term: '', definition: '' }); this.draft.set({ ...this.draft() }); }
  removeDict(i: number): void { this.draft().dictionaries.splice(i, 1); this.draft.set({ ...this.draft() }); }

  addTemplate(): void { this.draft().templates.push({ id: uuid(), name: '', body: '' }); this.draft.set({ ...this.draft() }); }
  removeTemplate(i: number): void { this.draft().templates.splice(i, 1); this.draft.set({ ...this.draft() }); }

  async save(): Promise<void> {
    await this.svc.save(this.draft());
    this.notif.success('Admin settings saved.');
  }
}
