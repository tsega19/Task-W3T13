import { Injectable, inject } from '@angular/core';
import { DbService } from './db.service';
import { LoggerService } from '../../logging/logger.service';
import { uuid } from './crypto.util';
import { AuditEntry, SessionInfo } from '../models/models';

/**
 * Append-only audit timeline. Entries are never pruned, overwritten, or
 * deleted by this service. The UI treats the list as historical record; only
 * explicit, audited admin actions (like a restore) may modify it, and even
 * those must record a preservation event rather than silently drop history.
 */
@Injectable({ providedIn: 'root' })
export class AuditService {
  private readonly db = inject(DbService);
  private readonly logger = inject(LoggerService);

  async record(
    session: SessionInfo | null,
    action: string,
    entityType: string,
    entityId: string,
    details?: string,
    durationMs?: number
  ): Promise<void> {
    const entry: AuditEntry = {
      id: uuid(),
      timestamp: Date.now(),
      userId: session?.userId ?? 'anonymous',
      username: session?.username ?? 'anonymous',
      action,
      entityType,
      entityId,
      details,
      durationMs
    };
    try {
      await this.db.audit.put(entry);
    } catch (e) {
      this.logger.error('core', 'audit', 'failed to persist audit entry', { error: String(e) });
    }
  }

  async list(): Promise<AuditEntry[]> {
    const all = await this.db.audit.all();
    return all.sort((a, b) => b.timestamp - a.timestamp);
  }
}
