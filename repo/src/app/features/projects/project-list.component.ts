import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ProjectService } from './project.service';
import { AuthService } from '../../core/services/auth.service';
import { PermissionService } from '../../core/services/permission.service';
import { NotificationService } from '../../core/services/notification.service';
import { ModalComponent } from '../../shared/components/modal.component';
import { CanvasRecord, ProjectRecord } from '../../core/models/models';
import { LS_KEYS, lsSet } from '../../core/services/session-storage.util';

@Component({
  selector: 'fc-project-list',
  standalone: true,
  imports: [CommonModule, FormsModule, ModalComponent],
  template: `
    <div class="container">
      <div class="row header">
        <h2>Projects</h2>
        <div class="row">
          <input type="search" placeholder="Search by name/tag" [(ngModel)]="query" data-testid="projects-search" />
          <select [(ngModel)]="tagFilter" data-testid="projects-tag-filter">
            <option value="">All tags</option>
            <option *ngFor="let t of allTags()" [value]="t">{{ t }}</option>
          </select>
          <div class="toggle">
            <button type="button" [class.primary]="view === 'table'" (click)="view = 'table'" data-testid="view-table">Table</button>
            <button type="button" [class.primary]="view === 'card'" (click)="view = 'card'" data-testid="view-cards">Cards</button>
          </div>
          <button type="button" class="primary" *ngIf="perm.can('project.create')" (click)="openCreate()" data-testid="project-create">+ New project</button>
        </div>
      </div>

      <p class="muted" *ngIf="projects().length === 0" data-testid="projects-empty">No projects yet.</p>

      <table *ngIf="view === 'table' && filtered().length > 0" data-testid="projects-table">
        <thead>
          <tr><th>Name</th><th>Tags</th><th>Canvases</th><th>Updated</th><th></th></tr>
        </thead>
        <tbody>
          <tr *ngFor="let p of filtered()" [attr.data-testid]="'project-row-' + p.id">
            <td>
              <button class="linklike" type="button" (click)="open(p)" [attr.data-testid]="'project-open-' + p.id">{{ p.name }}</button>
              <span *ngIf="p.pinned" class="chip">pinned</span>
              <span *ngIf="p.featured" class="chip featured">featured</span>
            </td>
            <td>
              <span *ngFor="let t of p.tags" class="tag">{{ t }}</span>
            </td>
            <td>{{ p.canvasCount }}</td>
            <td>{{ formatDate(p.updatedAt) }}</td>
            <td class="row-actions">
              <button type="button" *ngIf="perm.can('project.pin')" (click)="togglePin(p)" [attr.data-testid]="'project-pin-' + p.id">{{ p.pinned ? 'Unpin' : 'Pin' }}</button>
              <button type="button" *ngIf="perm.can('project.feature')" (click)="toggleFeature(p)" [attr.data-testid]="'project-feature-' + p.id">{{ p.featured ? 'Unfeature' : 'Feature' }}</button>
              <button type="button" *ngIf="perm.can('project.edit')" (click)="openEdit(p)" [attr.data-testid]="'project-edit-' + p.id">Edit</button>
              <button type="button" class="danger" *ngIf="perm.can('project.delete')" (click)="confirmDelete(p)" [attr.data-testid]="'project-delete-' + p.id">Delete</button>
            </td>
          </tr>
        </tbody>
      </table>

      <div *ngIf="view === 'card' && filtered().length > 0" class="card-grid" data-testid="projects-cards">
        <div *ngFor="let p of filtered()" class="card project-card">
          <div class="row">
            <strong>{{ p.name }}</strong>
            <span *ngIf="p.pinned" class="chip">pinned</span>
            <span *ngIf="p.featured" class="chip featured">featured</span>
          </div>
          <p class="muted">{{ p.description }}</p>
          <div>
            <span *ngFor="let t of p.tags" class="tag">{{ t }}</span>
          </div>
          <div class="row actions">
            <button type="button" class="primary" (click)="open(p)">Open</button>
            <button type="button" *ngIf="perm.can('project.pin')" (click)="togglePin(p)">{{ p.pinned ? 'Unpin' : 'Pin' }}</button>
            <button type="button" *ngIf="perm.can('project.feature')" (click)="toggleFeature(p)">{{ p.featured ? 'Unfeature' : 'Feature' }}</button>
          </div>
        </div>
      </div>

      <fc-modal *ngIf="showForm()" [title]="editTarget() ? 'Edit project' : 'New project'" (backdropClose)="closeForm()">
        <div class="stack">
          <label>Name<input [(ngModel)]="formName" data-testid="form-name" maxlength="100" /></label>
          <label>Description<textarea [(ngModel)]="formDescription" data-testid="form-description" maxlength="500"></textarea></label>
          <label>Tags (comma-separated)<input [(ngModel)]="formTags" data-testid="form-tags" /></label>
          <p class="error" *ngIf="formError()">{{ formError() }}</p>
          <div class="row">
            <button type="button" (click)="closeForm()">Cancel</button>
            <button type="button" class="primary" (click)="saveForm()" data-testid="form-save">Save</button>
          </div>
        </div>
      </fc-modal>

      <fc-modal *ngIf="deleteTarget() as d" [title]="'Delete project?'" (backdropClose)="deleteTarget.set(null)">
        <p>This will permanently delete <strong>{{ d.name }}</strong> and all its canvases, versions, reviews, and tickets.</p>
        <div class="row">
          <button type="button" (click)="deleteTarget.set(null)">Cancel</button>
          <button type="button" class="danger" (click)="doDelete()" data-testid="confirm-delete">Delete</button>
        </div>
      </fc-modal>

      <fc-modal *ngIf="canvasTarget() as ct" [title]="'Canvases in ' + ct.name" (backdropClose)="closeCanvases()">
        <div class="stack">
          <div *ngIf="perm.can('canvas.edit')" class="row">
            <input [(ngModel)]="newCanvasName" placeholder="New canvas name" data-testid="new-canvas-name" />
            <button type="button" class="primary" (click)="createCanvas(ct)" data-testid="new-canvas-create">Add</button>
          </div>
          <p class="muted" *ngIf="canvases().length === 0">No canvases yet.</p>
          <ul class="canvas-list">
            <li *ngFor="let c of canvases()" [attr.data-testid]="'canvas-item-' + c.id">
              <button type="button" class="linklike" (click)="openCanvas(ct, c)">{{ c.name }}</button>
              <span class="muted">updated {{ formatDate(c.updatedAt) }}</span>
              <button type="button" class="danger" *ngIf="perm.can('canvas.edit')" (click)="deleteCanvas(ct, c)" [attr.data-testid]="'canvas-delete-' + c.id">Delete</button>
            </li>
          </ul>
        </div>
      </fc-modal>
    </div>
  `,
  styles: [`
    .header { justify-content: space-between; margin-bottom: 16px; }
    .row-actions { display: flex; gap: 6px; }
    .card-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; }
    .project-card { display: flex; flex-direction: column; gap: 8px; }
    .tag { display: inline-block; background: var(--surface-2); padding: 2px 8px; border-radius: 10px; font-size: 11px; margin-right: 4px; }
    .chip { background: var(--primary); color: #0a1220; padding: 2px 6px; border-radius: 10px; font-size: 10px; margin-left: 4px; }
    .chip.featured { background: var(--warning); }
    .linklike { background: transparent; border: none; color: var(--primary); padding: 0; font-weight: 600; cursor: pointer; }
    .linklike:hover { text-decoration: underline; }
    .actions { margin-top: auto; }
    .canvas-list { list-style: none; padding: 0; display: flex; flex-direction: column; gap: 6px; }
    .canvas-list li { display: flex; gap: 10px; align-items: center; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid var(--border); }
    .toggle button { border-radius: 0; }
    .toggle button:first-child { border-radius: 4px 0 0 4px; }
    .toggle button:last-child { border-radius: 0 4px 4px 0; }
  `]
})
export class ProjectListComponent implements OnInit {
  private readonly svc = inject(ProjectService);
  private readonly auth = inject(AuthService);
  readonly perm = inject(PermissionService);
  private readonly notif = inject(NotificationService);
  private readonly router = inject(Router);

  projects = signal<ProjectRecord[]>([]);
  canvases = signal<CanvasRecord[]>([]);
  query = '';
  tagFilter = '';
  view: 'table' | 'card' = 'table';

  showForm = signal(false);
  editTarget = signal<ProjectRecord | null>(null);
  formName = '';
  formDescription = '';
  formTags = '';
  formError = signal('');

  deleteTarget = signal<ProjectRecord | null>(null);
  canvasTarget = signal<ProjectRecord | null>(null);
  newCanvasName = '';

  filtered = computed(() => {
    const q = this.query.trim().toLowerCase();
    const tag = this.tagFilter;
    return this.projects().filter((p) => {
      const matchQ = !q || p.name.toLowerCase().includes(q) || p.tags.some((t) => t.toLowerCase().includes(q));
      const matchTag = !tag || p.tags.includes(tag);
      return matchQ && matchTag;
    });
  });

  allTags = computed(() => {
    const s = new Set<string>();
    for (const p of this.projects()) for (const t of p.tags) s.add(t);
    return Array.from(s).sort();
  });

  async ngOnInit(): Promise<void> {
    await this.refresh();
  }

  async refresh(): Promise<void> {
    this.projects.set(await this.svc.list());
  }

  formatDate(ms: number): string {
    return new Date(ms).toISOString().replace('T', ' ').slice(0, 16);
  }

  openCreate(): void {
    this.editTarget.set(null);
    this.formName = '';
    this.formDescription = '';
    this.formTags = '';
    this.formError.set('');
    this.showForm.set(true);
  }

  openEdit(p: ProjectRecord): void {
    this.editTarget.set(p);
    this.formName = p.name;
    this.formDescription = p.description;
    this.formTags = p.tags.join(', ');
    this.formError.set('');
    this.showForm.set(true);
  }

  closeForm(): void {
    this.showForm.set(false);
  }

  async saveForm(): Promise<void> {
    this.formError.set('');
    const tags = this.formTags.split(',').map((t) => t.trim()).filter((t) => t.length > 0);
    try {
      const target = this.editTarget();
      if (target) {
        await this.svc.update(target.id, { name: this.formName, description: this.formDescription, tags });
        this.notif.success('Project updated.');
      } else {
        await this.svc.create({ name: this.formName, description: this.formDescription, tags });
        this.notif.success('Project created.');
      }
      this.showForm.set(false);
      await this.refresh();
    } catch (e) {
      this.formError.set((e as Error).message);
    }
  }

  confirmDelete(p: ProjectRecord): void {
    this.deleteTarget.set(p);
  }

  async doDelete(): Promise<void> {
    const p = this.deleteTarget();
    if (!p) return;
    try {
      await this.svc.remove(p.id);
      this.notif.success('Project deleted.');
      this.deleteTarget.set(null);
      await this.refresh();
    } catch (e) {
      this.notif.error((e as Error).message);
    }
  }

  async togglePin(p: ProjectRecord): Promise<void> {
    try {
      await this.svc.setPinned(p.id, !p.pinned);
      await this.refresh();
    } catch (e) {
      this.notif.error((e as Error).message);
    }
  }

  async toggleFeature(p: ProjectRecord): Promise<void> {
    try {
      await this.svc.setFeatured(p.id, !p.featured);
      await this.refresh();
    } catch (e) {
      this.notif.error((e as Error).message);
    }
  }

  async open(p: ProjectRecord): Promise<void> {
    lsSet(LS_KEYS.LAST_PROJECT, p.id);
    this.canvasTarget.set(p);
    this.newCanvasName = '';
    this.canvases.set(await this.svc.listCanvases(p.id));
  }

  closeCanvases(): void {
    this.canvasTarget.set(null);
  }

  async createCanvas(p: ProjectRecord): Promise<void> {
    try {
      const c = await this.svc.createCanvas(p.id, this.newCanvasName);
      this.newCanvasName = '';
      this.canvases.set(await this.svc.listCanvases(p.id));
      await this.refresh();
      this.notif.success('Canvas created.');
      await this.router.navigate(['/projects', p.id, 'canvas', c.id]);
    } catch (e) {
      this.notif.error((e as Error).message);
    }
  }

  async openCanvas(p: ProjectRecord, c: CanvasRecord): Promise<void> {
    await this.router.navigate(['/projects', p.id, 'canvas', c.id]);
  }

  async deleteCanvas(p: ProjectRecord, c: CanvasRecord): Promise<void> {
    try {
      await this.svc.deleteCanvas(c.id);
      this.canvases.set(await this.svc.listCanvases(p.id));
      await this.refresh();
      this.notif.success('Canvas deleted.');
    } catch (e) {
      this.notif.error((e as Error).message);
    }
  }
}
