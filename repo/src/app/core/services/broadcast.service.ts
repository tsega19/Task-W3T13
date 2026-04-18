import { Injectable, signal } from '@angular/core';
import { uuid } from './crypto.util';

export interface CanvasSavedMessage {
  type: 'canvas-saved';
  canvasId: string;
  timestamp: number;
  tabId: string;
}

@Injectable({ providedIn: 'root' })
export class BroadcastService {
  private readonly channelName = 'flowcanvas-sync';
  readonly tabId = uuid();
  private channel: BroadcastChannel | null = null;
  readonly conflict = signal<CanvasSavedMessage | null>(null);
  private subscribers = new Set<(msg: CanvasSavedMessage) => void>();
  private watchCanvasId: string | null = null;

  constructor() {
    this.ensureChannel();
  }

  private ensureChannel(): void {
    if (this.channel) return;
    if (typeof BroadcastChannel === 'undefined') return;
    this.channel = new BroadcastChannel(this.channelName);
    this.channel.onmessage = (ev: MessageEvent) => {
      const data = ev.data as CanvasSavedMessage | undefined;
      if (!data || data.type !== 'canvas-saved') return;
      if (data.tabId === this.tabId) return;
      if (this.watchCanvasId && data.canvasId === this.watchCanvasId) {
        this.conflict.set(data);
      }
      for (const sub of this.subscribers) sub(data);
    };
  }

  watch(canvasId: string | null): void {
    this.watchCanvasId = canvasId;
    if (!canvasId) this.conflict.set(null);
  }

  dismissConflict(): void {
    this.conflict.set(null);
  }

  publishSave(canvasId: string): void {
    this.ensureChannel();
    if (!this.channel) return;
    const msg: CanvasSavedMessage = {
      type: 'canvas-saved',
      canvasId,
      timestamp: Date.now(),
      tabId: this.tabId
    };
    try { this.channel.postMessage(msg); } catch { /* closed channel */ }
  }

  subscribe(fn: (msg: CanvasSavedMessage) => void): () => void {
    this.subscribers.add(fn);
    return () => this.subscribers.delete(fn);
  }
}
