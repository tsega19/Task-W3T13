import { Injectable, signal } from '@angular/core';
import { uuid } from './crypto.util';

export type ToastKind = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: string;
  kind: ToastKind;
  message: string;
  createdAt: number;
}

export interface NotificationMessage {
  id: string;
  kind: ToastKind;
  title: string;
  body: string;
  createdAt: number;
  read: boolean;
}

@Injectable({ providedIn: 'root' })
export class NotificationService {
  readonly toasts = signal<Toast[]>([]);
  readonly messages = signal<NotificationMessage[]>([]);

  show(kind: ToastKind, message: string, ttlMs?: number): string {
    const id = uuid();
    const t: Toast = { id, kind, message, createdAt: Date.now() };
    this.toasts.update((list) => [...list, t]);
    const lifetime = ttlMs ?? (kind === 'error' ? 5000 : 3000);
    setTimeout(() => this.dismiss(id), lifetime);
    return id;
  }

  success(msg: string): string { return this.show('success', msg); }
  error(msg: string): string { return this.show('error', msg); }
  warning(msg: string): string { return this.show('warning', msg); }
  info(msg: string): string { return this.show('info', msg); }

  dismiss(id: string): void {
    this.toasts.update((list) => list.filter((t) => t.id !== id));
  }

  log(kind: ToastKind, title: string, body: string): void {
    const m: NotificationMessage = {
      id: uuid(),
      kind,
      title,
      body,
      createdAt: Date.now(),
      read: false
    };
    this.messages.update((list) => [m, ...list].slice(0, 200));
  }

  markRead(id: string): void {
    this.messages.update((list) => list.map((m) => (m.id === id ? { ...m, read: true } : m)));
  }

  clearMessages(): void {
    this.messages.set([]);
  }
}
