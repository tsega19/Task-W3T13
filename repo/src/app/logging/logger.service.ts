import { Injectable } from '@angular/core';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  ts: number;
  level: LogLevel;
  module: string;
  submodule: string;
  message: string;
  data?: unknown;
}

const REDACT_KEYS = new Set([
  'password', 'passphrase', 'passwordhash', 'token', 'sessiontoken',
  'authorization', 'cookie', 'secret', 'apikey', 'ssn'
]);

const REDACT_VALUE = '***';

export function redact(input: unknown, depth = 0): unknown {
  if (depth > 6) return '[truncated]';
  if (input === null || input === undefined) return input;
  if (typeof input === 'string' || typeof input === 'number' || typeof input === 'boolean') return input;
  if (Array.isArray(input)) return input.map((v) => redact(v, depth + 1));
  if (typeof input === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      if (REDACT_KEYS.has(k.toLowerCase())) {
        out[k] = REDACT_VALUE;
      } else {
        out[k] = redact(v, depth + 1);
      }
    }
    return out;
  }
  return String(input);
}

function stamp(level: LogLevel, module: string, submodule: string, message: string): string {
  return `[${module}][${submodule}] ${message}`;
}

@Injectable({ providedIn: 'root' })
export class LoggerService {
  private readonly buffer: LogEntry[] = [];
  private readonly bufferLimit = 500;
  private sink: (entry: LogEntry) => void = () => { /* no-op */ };

  setSink(fn: (entry: LogEntry) => void): void {
    this.sink = fn;
  }

  debug(module: string, submodule: string, message: string, data?: unknown): void {
    this.emit('debug', module, submodule, message, data);
  }

  info(module: string, submodule: string, message: string, data?: unknown): void {
    this.emit('info', module, submodule, message, data);
  }

  warn(module: string, submodule: string, message: string, data?: unknown): void {
    this.emit('warn', module, submodule, message, data);
  }

  error(module: string, submodule: string, message: string, data?: unknown): void {
    this.emit('error', module, submodule, message, data);
  }

  recent(): LogEntry[] {
    return this.buffer.slice();
  }

  private emit(level: LogLevel, module: string, submodule: string, message: string, data?: unknown): void {
    const entry: LogEntry = {
      ts: Date.now(),
      level,
      module,
      submodule,
      message,
      data: data === undefined ? undefined : redact(data)
    };
    this.buffer.push(entry);
    if (this.buffer.length > this.bufferLimit) this.buffer.shift();
    try { this.sink(entry); } catch { /* sink must not break logging */ }
    if (level === 'error') {
      const fn = typeof console !== 'undefined' && console.error ? console.error : undefined;
      if (fn) fn(stamp(level, module, submodule, message), entry.data ?? '');
    }
  }
}
