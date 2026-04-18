import { Injectable, inject } from '@angular/core';
import { DbService } from '../../core/services/db.service';
import { AppConfigService } from '../../config/app-config.service';
import { AuthService } from '../../core/services/auth.service';
import { PermissionService } from '../../core/services/permission.service';
import { AuditService } from '../../core/services/audit.service';
import { LoggerService } from '../../logging/logger.service';
import { NotificationService } from '../../core/services/notification.service';
import { ProjectRecord, CanvasRecord } from '../../core/models/models';
import { uuid } from '../../core/services/crypto.util';

export interface ProjectValidation {
  ok: boolean;
  error?: string;
}

@Injectable({ providedIn: 'root' })
export class ProjectService {
  private readonly db = inject(DbService);
  private readonly cfg = inject(AppConfigService);
  private readonly auth = inject(AuthService);
  private readonly perm = inject(PermissionService);
  private readonly audit = inject(AuditService);
  private readonly logger = inject(LoggerService);
  private readonly notif = inject(NotificationService);

  async list(): Promise<ProjectRecord[]> {
    const all = await this.db.projects.all();
    return all.sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt);
  }

  validateName(name: string, existing: ProjectRecord[], currentId?: string): ProjectValidation {
    const trimmed = (name ?? '').trim();
    if (trimmed.length < 1 || trimmed.length > 100) {
      return { ok: false, error: 'Name must be 1–100 characters.' };
    }
    const lower = trimmed.toLowerCase();
    const dup = existing.find((p) => p.name.toLowerCase() === lower && p.id !== currentId);
    if (dup) return { ok: false, error: 'Project name already exists.' };
    return { ok: true };
  }

  validateTags(tags: string[]): ProjectValidation {
    if (tags.length > 10) return { ok: false, error: 'Maximum 10 tags.' };
    for (const t of tags) {
      const tt = (t ?? '').trim();
      if (tt.length < 1 || tt.length > 30) return { ok: false, error: 'Each tag must be 1–30 characters.' };
    }
    return { ok: true };
  }

  async create(input: { name: string; description?: string; tags?: string[] }): Promise<ProjectRecord> {
    this.perm.enforce('project.create');
    const existing = await this.db.projects.all();
    if (existing.length >= this.cfg.get().projects.max) {
      const msg = `Project limit reached (${this.cfg.get().projects.max}).`;
      this.notif.error(msg);
      throw new Error(msg);
    }
    const nameCheck = this.validateName(input.name, existing);
    if (!nameCheck.ok) throw new Error(nameCheck.error);
    const tags = (input.tags ?? []).map((t) => t.trim()).filter((t) => t.length > 0);
    const tagCheck = this.validateTags(tags);
    if (!tagCheck.ok) throw new Error(tagCheck.error);
    const desc = (input.description ?? '').slice(0, 500);
    const now = Date.now();
    const rec: ProjectRecord = {
      id: uuid(),
      name: input.name.trim(),
      description: desc,
      tags,
      pinned: false,
      featured: false,
      createdAt: now,
      updatedAt: now,
      createdBy: this.auth.session()?.userId ?? 'anonymous',
      canvasCount: 0
    };
    await this.db.projects.put(rec);
    this.logger.info('projects', 'create', 'created project', { id: rec.id, name: rec.name });
    await this.audit.record(this.auth.session(), 'project.create', 'project', rec.id);
    return rec;
  }

  async update(id: string, patch: Partial<Pick<ProjectRecord, 'name' | 'description' | 'tags'>>): Promise<ProjectRecord> {
    this.perm.enforce('project.edit');
    const rec = await this.db.projects.get(id);
    if (!rec) throw new Error('Project not found.');
    if (patch.name !== undefined) {
      const all = await this.db.projects.all();
      const chk = this.validateName(patch.name, all, id);
      if (!chk.ok) throw new Error(chk.error);
      rec.name = patch.name.trim();
    }
    if (patch.description !== undefined) rec.description = patch.description.slice(0, 500);
    if (patch.tags !== undefined) {
      const tags = patch.tags.map((t) => t.trim()).filter((t) => t.length > 0);
      const chk = this.validateTags(tags);
      if (!chk.ok) throw new Error(chk.error);
      rec.tags = tags;
    }
    rec.updatedAt = Date.now();
    await this.db.projects.put(rec);
    await this.audit.record(this.auth.session(), 'project.update', 'project', rec.id);
    return rec;
  }

  async remove(id: string): Promise<void> {
    this.perm.enforce('project.delete');
    const canvases = await this.db.canvases.byProject(id);
    for (const c of canvases) {
      const versions = await this.db.versions.byCanvas(c.id);
      for (const v of versions) await this.db.versions.delete(v.id);
      const reviews = await this.db.reviews.byCanvas(c.id);
      for (const r of reviews) {
        const tickets = await this.db.tickets.byReview(r.id);
        for (const t of tickets) {
          for (const aId of t.attachmentIds) await this.db.blobs.delete(aId);
          await this.db.tickets.delete(t.id);
        }
        await this.db.reviews.delete(r.id);
      }
      for (const el of c.elements) {
        if (el.imageRef) await this.db.blobs.delete(el.imageRef);
      }
      await this.db.canvases.delete(c.id);
    }
    await this.db.projects.delete(id);
    await this.audit.record(this.auth.session(), 'project.delete', 'project', id);
    this.logger.info('projects', 'delete', 'cascaded delete', { id });
  }

  async setPinned(id: string, pinned: boolean): Promise<void> {
    this.perm.enforce('project.pin');
    const rec = await this.db.projects.get(id);
    if (!rec) return;
    rec.pinned = pinned;
    rec.updatedAt = Date.now();
    await this.db.projects.put(rec);
    await this.audit.record(this.auth.session(), pinned ? 'project.pin' : 'project.unpin', 'project', id);
  }

  async setFeatured(id: string, featured: boolean): Promise<void> {
    this.perm.enforce('project.feature');
    const all = await this.db.projects.all();
    if (featured) {
      for (const p of all) {
        if (p.featured && p.id !== id) {
          p.featured = false;
          p.updatedAt = Date.now();
          await this.db.projects.put(p);
        }
      }
    }
    const rec = await this.db.projects.get(id);
    if (!rec) return;
    rec.featured = featured;
    rec.updatedAt = Date.now();
    await this.db.projects.put(rec);
    await this.audit.record(this.auth.session(), featured ? 'project.feature' : 'project.unfeature', 'project', id);
  }

  async listCanvases(projectId: string): Promise<CanvasRecord[]> {
    const canvases = await this.db.canvases.byProject(projectId);
    return canvases.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async createCanvas(projectId: string, name: string): Promise<CanvasRecord> {
    this.perm.enforce('canvas.edit');
    const existing = await this.db.canvases.byProject(projectId);
    const max = this.cfg.get().projects.canvasMaxPerProject;
    if (existing.length >= max) throw new Error(`Canvas limit reached (${max}).`);
    const trimmed = (name ?? '').trim();
    if (trimmed.length < 1 || trimmed.length > 100) throw new Error('Canvas name must be 1–100 characters.');
    const lower = trimmed.toLowerCase();
    if (existing.some((c) => c.name.toLowerCase() === lower)) {
      throw new Error('Canvas name already exists in this project.');
    }
    const now = Date.now();
    const rec: CanvasRecord = {
      id: uuid(),
      projectId,
      name: trimmed,
      description: '',
      elements: [],
      connections: [],
      groups: [],
      viewState: { zoom: 1, panX: 0, panY: 0, gridSize: 20 },
      createdAt: now,
      updatedAt: now,
      createdBy: this.auth.session()?.userId ?? 'anonymous',
      tags: []
    };
    await this.db.canvases.put(rec);
    const project = await this.db.projects.get(projectId);
    if (project) {
      project.canvasCount = existing.length + 1;
      project.updatedAt = now;
      await this.db.projects.put(project);
    }
    await this.audit.record(this.auth.session(), 'canvas.create', 'canvas', rec.id);
    return rec;
  }

  async deleteCanvas(canvasId: string): Promise<void> {
    this.perm.enforce('canvas.edit');
    const c = await this.db.canvases.get(canvasId);
    if (!c) return;
    const versions = await this.db.versions.byCanvas(canvasId);
    for (const v of versions) await this.db.versions.delete(v.id);
    const reviews = await this.db.reviews.byCanvas(canvasId);
    for (const r of reviews) {
      const tickets = await this.db.tickets.byReview(r.id);
      for (const t of tickets) await this.db.tickets.delete(t.id);
      await this.db.reviews.delete(r.id);
    }
    for (const el of c.elements) {
      if (el.imageRef) await this.db.blobs.delete(el.imageRef);
    }
    await this.db.canvases.delete(canvasId);
    const project = await this.db.projects.get(c.projectId);
    if (project) {
      const remaining = await this.db.canvases.byProject(c.projectId);
      project.canvasCount = remaining.length;
      project.updatedAt = Date.now();
      await this.db.projects.put(project);
    }
    await this.audit.record(this.auth.session(), 'canvas.delete', 'canvas', canvasId);
  }
}
