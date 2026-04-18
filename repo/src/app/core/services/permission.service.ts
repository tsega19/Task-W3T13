import { Injectable, inject } from '@angular/core';
import { AuthService } from './auth.service';
import { LoggerService } from '../../logging/logger.service';
import { UserRole } from '../models/models';

export type Capability =
  | 'project.create'
  | 'project.edit'
  | 'project.delete'
  | 'project.pin'
  | 'project.feature'
  | 'canvas.edit'
  | 'canvas.import'
  | 'canvas.export'
  | 'review.create'
  | 'admin.panel'
  | 'diagnostics.view'
  | 'backup.manage';

const CAPS: Record<Capability, UserRole[]> = {
  'project.create': ['admin', 'editor'],
  'project.edit': ['admin', 'editor'],
  'project.delete': ['admin', 'editor'],
  'project.pin': ['admin'],
  'project.feature': ['admin'],
  'canvas.edit': ['admin', 'editor'],
  'canvas.import': ['admin', 'editor'],
  'canvas.export': ['admin', 'editor'],
  'review.create': ['admin', 'editor', 'reviewer'],
  'admin.panel': ['admin'],
  'diagnostics.view': ['admin', 'editor'],
  'backup.manage': ['admin']
};

@Injectable({ providedIn: 'root' })
export class PermissionService {
  private readonly auth = inject(AuthService);
  private readonly logger = inject(LoggerService);

  can(cap: Capability): boolean {
    const role = this.auth.role();
    if (!role) return false;
    return CAPS[cap].includes(role);
  }

  /**
   * Roles are convenience-only filters, not enforcement. This method only
   * emits an advisory log when a capability is exercised by a role the UI
   * does not expose it to. It never throws. UI code should use `can()` to
   * hide or disable affordances for roles without the capability.
   */
  enforce(cap: Capability): void {
    if (this.can(cap)) return;
    const role = this.auth.role();
    this.logger.warn('core', 'perm', 'role-mismatch (advisory, not enforced)', { capability: cap, role });
  }
}
