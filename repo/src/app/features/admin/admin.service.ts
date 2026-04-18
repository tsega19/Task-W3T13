import { Injectable, inject, signal } from '@angular/core';
import { LS_KEYS, lsGetJson, lsSetJson } from '../../core/services/session-storage.util';
import { AuditService } from '../../core/services/audit.service';
import { AuthService } from '../../core/services/auth.service';
import { LoggerService } from '../../logging/logger.service';

export interface AdminSettings {
  dictionaries: { id: string; term: string; definition: string }[];
  templates: { id: string; name: string; body: string }[];
  tagPalette: string[];
  announcements: string[];
}

const ADMIN_KEY = 'fc_admin_settings';

const EMPTY: AdminSettings = {
  dictionaries: [],
  templates: [],
  tagPalette: [],
  announcements: []
};

@Injectable({ providedIn: 'root' })
export class AdminService {
  private readonly audit = inject(AuditService);
  private readonly auth = inject(AuthService);
  private readonly logger = inject(LoggerService);

  readonly settings = signal<AdminSettings>(lsGetJson<AdminSettings>(ADMIN_KEY) ?? EMPTY);

  async save(settings: AdminSettings): Promise<void> {
    lsSetJson(ADMIN_KEY, settings);
    this.settings.set(settings);
    this.logger.info('admin', 'save', 'admin settings saved');
    await this.audit.record(this.auth.session(), 'admin.save-settings', 'admin', 'settings');
  }
}
