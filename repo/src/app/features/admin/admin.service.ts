import { Injectable, inject, signal } from '@angular/core';
import { LS_KEYS, lsGetJson, lsSetJson } from '../../core/services/session-storage.util';
import { AuditService } from '../../core/services/audit.service';
import { AuthService } from '../../core/services/auth.service';
import { LoggerService } from '../../logging/logger.service';

export interface AdminChannel { id: string; name: string; description: string }
export interface AdminTopic { id: string; channelId: string; name: string }

/**
 * Controls how `project.featured` slots are allocated. `maxSlots` caps the
 * total number of concurrently-featured projects; `rotationDays` is a soft
 * hint consumed by the UI to decide when to rotate the featured strip.
 */
export interface FeaturedSlotPolicy {
  maxSlots: number;
  rotationDays: number;
}

export interface AdminSettings {
  dictionaries: { id: string; term: string; definition: string }[];
  templates: { id: string; name: string; body: string; channelId?: string }[];
  tagPalette: string[];
  announcements: string[];
  channels: AdminChannel[];
  topics: AdminTopic[];
  featuredSlots: FeaturedSlotPolicy;
}

const ADMIN_KEY = 'fc_admin_settings';

// Default to a single featured slot so legacy installs and callers that
// predate the configurable policy keep the prior "only one featured at a
// time" behavior. Admins can widen this via the Admin panel.
const DEFAULT_FEATURED: FeaturedSlotPolicy = { maxSlots: 1, rotationDays: 14 };

const EMPTY: AdminSettings = {
  dictionaries: [],
  templates: [],
  tagPalette: [],
  announcements: [],
  channels: [],
  topics: [],
  featuredSlots: { ...DEFAULT_FEATURED }
};

/**
 * Hydrate a potentially-legacy stored `AdminSettings` shape by filling any
 * missing collections/policy with safe defaults. Legacy values persisted
 * before channels/topics/featuredSlots existed still round-trip cleanly.
 */
function hydrate(raw: Partial<AdminSettings> | null | undefined): AdminSettings {
  if (!raw) return { ...EMPTY, featuredSlots: { ...DEFAULT_FEATURED } };
  return {
    dictionaries: raw.dictionaries ?? [],
    templates: raw.templates ?? [],
    tagPalette: raw.tagPalette ?? [],
    announcements: raw.announcements ?? [],
    channels: raw.channels ?? [],
    topics: raw.topics ?? [],
    featuredSlots: raw.featuredSlots
      ? { maxSlots: raw.featuredSlots.maxSlots ?? DEFAULT_FEATURED.maxSlots, rotationDays: raw.featuredSlots.rotationDays ?? DEFAULT_FEATURED.rotationDays }
      : { ...DEFAULT_FEATURED }
  };
}

@Injectable({ providedIn: 'root' })
export class AdminService {
  private readonly audit = inject(AuditService);
  private readonly auth = inject(AuthService);
  private readonly logger = inject(LoggerService);

  readonly settings = signal<AdminSettings>(hydrate(lsGetJson<AdminSettings>(ADMIN_KEY)));

  async save(settings: AdminSettings): Promise<void> {
    const hydrated = hydrate(settings);
    lsSetJson(ADMIN_KEY, hydrated);
    this.settings.set(hydrated);
    this.logger.info('admin', 'save', 'admin settings saved');
    await this.audit.record(this.auth.session(), 'admin.save-settings', 'admin', 'settings');
  }
}
