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
            <select [(ngModel)]="t.channelId" [attr.data-testid]="'admin-template-channel-' + i">
              <option [ngValue]="undefined">(unassigned)</option>
              <option *ngFor="let ch of draft().channels" [ngValue]="ch.id">{{ ch.name }}</option>
            </select>
            <button type="button" class="danger" (click)="removeTemplate(i)">Remove</button>
          </li>
        </ul>
        <button type="button" (click)="addTemplate()" data-testid="admin-add-template">+ Template</button>
      </section>

      <section class="card">
        <h3>Channels</h3>
        <ul>
          <li *ngFor="let ch of draft().channels; let i = index" [attr.data-testid]="'admin-channel-row-' + i">
            <input [(ngModel)]="ch.name" placeholder="Channel name" [attr.data-testid]="'admin-channel-name-' + i" />
            <input [(ngModel)]="ch.description" placeholder="Description" />
            <button type="button" class="danger" (click)="removeChannel(i)" [attr.data-testid]="'admin-channel-remove-' + i">Remove</button>
          </li>
        </ul>
        <button type="button" (click)="addChannel()" data-testid="admin-add-channel">+ Channel</button>
      </section>

      <section class="card">
        <h3>Topics</h3>
        <ul>
          <li *ngFor="let tp of draft().topics; let i = index" [attr.data-testid]="'admin-topic-row-' + i">
            <select [(ngModel)]="tp.channelId" [attr.data-testid]="'admin-topic-channel-' + i">
              <option [ngValue]="''" disabled>Select channel</option>
              <option *ngFor="let ch of draft().channels" [ngValue]="ch.id">{{ ch.name }}</option>
            </select>
            <input [(ngModel)]="tp.name" placeholder="Topic name" [attr.data-testid]="'admin-topic-name-' + i" />
            <button type="button" class="danger" (click)="removeTopic(i)" [attr.data-testid]="'admin-topic-remove-' + i">Remove</button>
          </li>
        </ul>
        <button type="button" (click)="addTopic()" [disabled]="draft().channels.length === 0" data-testid="admin-add-topic">+ Topic</button>
        <p class="muted small" *ngIf="draft().channels.length === 0">Add at least one channel before creating topics.</p>
      </section>

      <section class="card">
        <h3>Featured slot policy</h3>
        <div class="row">
          <label>Max featured slots
            <input type="number" min="0" max="20" [(ngModel)]="draft().featuredSlots.maxSlots" data-testid="admin-featured-max" />
          </label>
          <label>Rotation (days)
            <input type="number" min="0" max="365" [(ngModel)]="draft().featuredSlots.rotationDays" data-testid="admin-featured-rotation" />
          </label>
        </div>
        <p class="muted small">Projects marked “featured” are surfaced on the project list; the cap limits how many can be featured at once.</p>
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
    .small { font-size: 11px; }
    label { display: flex; flex-direction: column; gap: 2px; font-size: 12px; color: var(--muted); }
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
      announcements: [...s.announcements],
      channels: s.channels.map((c) => ({ ...c })),
      topics: s.topics.map((t) => ({ ...t })),
      featuredSlots: { ...s.featuredSlots }
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

  addChannel(): void { this.draft().channels.push({ id: uuid(), name: '', description: '' }); this.draft.set({ ...this.draft() }); }
  removeChannel(i: number): void {
    const ch = this.draft().channels[i];
    if (ch) {
      this.draft().topics = this.draft().topics.filter((t) => t.channelId !== ch.id);
      this.draft().templates = this.draft().templates.map((t) => (t.channelId === ch.id ? { ...t, channelId: undefined } : t));
    }
    this.draft().channels.splice(i, 1);
    this.draft.set({ ...this.draft() });
  }

  addTopic(): void {
    const firstChannel = this.draft().channels[0];
    if (!firstChannel) return;
    this.draft().topics.push({ id: uuid(), channelId: firstChannel.id, name: '' });
    this.draft.set({ ...this.draft() });
  }
  removeTopic(i: number): void { this.draft().topics.splice(i, 1); this.draft.set({ ...this.draft() }); }

  async save(): Promise<void> {
    const d = this.draft();
    d.featuredSlots.maxSlots = Math.max(0, Math.floor(Number(d.featuredSlots.maxSlots) || 0));
    d.featuredSlots.rotationDays = Math.max(0, Math.floor(Number(d.featuredSlots.rotationDays) || 0));
    await this.svc.save(d);
    this.notif.success('Admin settings saved.');
  }
}
