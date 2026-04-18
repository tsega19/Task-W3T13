import { LoggerService } from '../../logging/logger.service';

export interface TraceEntry {
  action: string;
  durationMs: number;
  slow: boolean;
  at: number;
  detail?: string;
}

const buffer: TraceEntry[] = [];
const MAX_BUFFER = 100;

export function recentTraces(): ReadonlyArray<TraceEntry> {
  return buffer.slice();
}

/**
 * Run `work` and record its duration. If it exceeds `slowMs`, mark as slow and
 * emit a warn-level log; otherwise a debug log. Exposed to diagnostics via
 * `recentTraces()`. Pure utility — tests can drain the buffer by importing
 * `__resetTracesForTest`.
 */
export async function trace<T>(
  logger: LoggerService,
  action: string,
  slowMs: number,
  work: () => Promise<T>
): Promise<T> {
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  try {
    const res = await work();
    const elapsed = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;
    record(logger, action, elapsed, slowMs);
    return res;
  } catch (e) {
    const elapsed = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;
    record(logger, action, elapsed, slowMs, String(e));
    throw e;
  }
}

function record(
  logger: LoggerService,
  action: string,
  durationMs: number,
  slowMs: number,
  detail?: string
): void {
  const slow = durationMs >= slowMs;
  buffer.push({ action, durationMs, slow, at: Date.now(), detail });
  if (buffer.length > MAX_BUFFER) buffer.shift();
  if (slow) {
    logger.warn('core', 'tracing', 'slow operation', { action, durationMs, threshold: slowMs });
  } else {
    logger.debug('core', 'tracing', 'operation completed', { action, durationMs });
  }
}

export function __resetTracesForTest(): void {
  buffer.length = 0;
}
